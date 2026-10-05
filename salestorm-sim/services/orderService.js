// Order Service - Full order lifecycle management
const { getDb } = require('../db/database');
const { v4: uuidv4 } = require('uuid');
const { confirmReservation } = require('./inventoryService');

/**
 * Create an order after successful payment
 * Returns { success, order, reason }
 */
function createOrder({ customerId, reservationId, paymentId, amount, productId, quantity, unitPrice, idempotencyKey }) {
  const db = getDb();

  // Idempotency check
  const existing = db.prepare(`SELECT * FROM orders WHERE idempotency_key = ?`).get(idempotencyKey);
  if (existing) return { success: true, order: existing, reason: 'IDEMPOTENT_DUPLICATE' };

  const orderId = uuidv4();

  try {
    // Create order
    db.prepare(`
      INSERT INTO orders (order_id, customer_id, payment_id, reservation_id, status, total_amount, idempotency_key)
      VALUES (?, ?, ?, ?, 'CONFIRMED', ?, ?)
    `).run(orderId, customerId, paymentId, reservationId, amount, idempotencyKey);

    // Create order item
    db.prepare(`
      INSERT INTO order_items (order_item_id, order_id, product_id, quantity, unit_price, subtotal)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(uuidv4(), orderId, productId, quantity, unitPrice, quantity * unitPrice);

    // Update payment with order reference
    db.prepare(`UPDATE payments SET order_id = ?, updated_at = datetime('now') WHERE payment_id = ?`).run(orderId, paymentId);

    // Confirm inventory reservation
    confirmReservation(reservationId);

    // Audit
    db.prepare(`
      INSERT INTO audit_log (log_id, entity_type, entity_id, action, old_state, new_state, metadata)
      VALUES (?, 'ORDER', ?, 'CREATED', NULL, 'CONFIRMED', ?)
    `).run(uuidv4(), orderId, JSON.stringify({ customerId, paymentId, amount }));

    const order = db.prepare(`SELECT * FROM orders WHERE order_id = ?`).get(orderId);
    return { success: true, order };
  } catch (err) {
    // Mark order as failed if creation fails (compensation)
    try {
      db.prepare(`INSERT INTO orders (order_id, customer_id, payment_id, reservation_id, status, total_amount, idempotency_key, failure_reason) VALUES (?, ?, ?, ?, 'FAILED', ?, ?, ?)`).run(
        orderId, customerId, paymentId, reservationId, amount, idempotencyKey, err.message
      );
    } catch (_) {}
    return { success: false, reason: err.message };
  }
}

/**
 * Advance order lifecycle state
 */
function advanceOrderState(orderId, targetState) {
  const db = getDb();
  const validTransitions = {
    'CONFIRMED': ['PROCESSING'],
    'PROCESSING': ['SHIPPED'],
    'SHIPPED': ['OUT_FOR_DELIVERY'],
    'OUT_FOR_DELIVERY': ['DELIVERED'],
    'CREATED': ['PAYMENT_PENDING', 'CANCELLED'],
    'PAYMENT_PENDING': ['CONFIRMED', 'FAILED', 'CANCELLED'],
  };

  const order = db.prepare(`SELECT * FROM orders WHERE order_id = ?`).get(orderId);
  if (!order) return { success: false, reason: 'ORDER_NOT_FOUND' };

  const allowed = validTransitions[order.status] || [];
  if (!allowed.includes(targetState)) {
    return { success: false, reason: `INVALID_TRANSITION: ${order.status} -> ${targetState}` };
  }

  db.prepare(`UPDATE orders SET status = ?, updated_at = datetime('now') WHERE order_id = ?`).run(targetState, orderId);

  db.prepare(`
    INSERT INTO audit_log (log_id, entity_type, entity_id, action, old_state, new_state, metadata)
    VALUES (?, 'ORDER', ?, 'STATE_CHANGE', ?, ?, ?)
  `).run(uuidv4(), orderId, order.status, targetState, JSON.stringify({ orderId }));

  return { success: true, order: db.prepare(`SELECT * FROM orders WHERE order_id = ?`).get(orderId) };
}

/**
 * Get all orders with stats
 */
function getOrderStats() {
  const db = getDb();
  return db.prepare(`
    SELECT status, COUNT(*) as count, SUM(total_amount) as total
    FROM orders GROUP BY status
  `).all();
}

/**
 * Get recent orders (last N)
 */
function getRecentOrders(limit = 50) {
  const db = getDb();
  return db.prepare(`SELECT * FROM orders ORDER BY created_at DESC LIMIT ?`).all(limit);
}

module.exports = { createOrder, advanceOrderState, getOrderStats, getRecentOrders };
