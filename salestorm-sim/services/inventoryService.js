// Inventory Service - Concurrency-safe reservation using optimistic locking
const { getDb } = require('../db/database');
const { v4: uuidv4 } = require('uuid');

const RESERVATION_TTL_SECONDS = 300; // 5 minutes

/**
 * Reserve inventory using optimistic locking (version-based CAS)
 * Returns { success, reservation, reason }
 */
function reserveInventory({ customerId, productId, quantity = 1, idempotencyKey }) {
  const db = getDb();

  // 1. Check idempotency - if same key exists, return existing result
  const existing = db.prepare(
    `SELECT r.*, i.available_quantity, i.reserved_quantity 
     FROM inventory_reservations r
     JOIN inventory i ON r.inventory_id = i.inventory_id
     WHERE r.idempotency_key = ?`
  ).get(idempotencyKey);

  if (existing) {
    return {
      success: existing.status !== 'RELEASED' && existing.status !== 'EXPIRED',
      reservation: existing,
      reason: 'DUPLICATE_REQUEST_IDEMPOTENT'
    };
  }

  // 2. Optimistic locking loop (up to 3 retries)
  for (let attempt = 0; attempt < 3; attempt++) {
    // Read current inventory state
    const inv = db.prepare(
      `SELECT * FROM inventory WHERE product_id = ?`
    ).get(productId);

    if (!inv) return { success: false, reason: 'PRODUCT_NOT_FOUND' };
    if (inv.available_quantity < quantity) {
      return { success: false, reason: 'OUT_OF_STOCK', available: inv.available_quantity };
    }

    const reservationId = uuidv4();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + RESERVATION_TTL_SECONDS * 1000).toISOString();

    try {
      // Atomic CAS update using version number
      const updateResult = db.prepare(
        `UPDATE inventory
         SET available_quantity = available_quantity - ?,
             reserved_quantity  = reserved_quantity + ?,
             version = version + 1,
             updated_at = datetime('now')
         WHERE inventory_id = ? AND version = ? AND available_quantity >= ?`
      ).run(quantity, quantity, inv.inventory_id, inv.version, quantity);

      if (updateResult.changes === 0) {
        // Version mismatch - another request modified inventory. Retry.
        continue;
      }

      // CAS succeeded - create reservation record
      db.prepare(
        `INSERT INTO inventory_reservations 
         (reservation_id, inventory_id, customer_id, product_id, quantity, idempotency_key, status, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, 'RESERVED', ?)`
      ).run(reservationId, inv.inventory_id, customerId, productId, quantity, idempotencyKey, expiresAt);

      // Audit log
      db.prepare(
        `INSERT INTO audit_log (log_id, entity_type, entity_id, action, old_state, new_state, metadata)
         VALUES (?, 'INVENTORY_RESERVATION', ?, 'RESERVED', 'AVAILABLE', 'RESERVED', ?)`
      ).run(uuidv4(), reservationId, JSON.stringify({ customerId, productId, quantity, attempt }));

      const reservation = db.prepare(`SELECT * FROM inventory_reservations WHERE reservation_id = ?`).get(reservationId);
      return { success: true, reservation };

    } catch (err) {
      if (err.message.includes('UNIQUE constraint failed')) {
        return { success: false, reason: 'DUPLICATE_REQUEST_IDEMPOTENT' };
      }
      throw err;
    }
  }

  return { success: false, reason: 'CONCURRENCY_CONFLICT_MAX_RETRIES' };
}

/**
 * Release a reservation (expiry or payment failure)
 */
function releaseReservation(reservationId, reason = 'RELEASED') {
  const db = getDb();
  const res = db.prepare(`SELECT * FROM inventory_reservations WHERE reservation_id = ?`).get(reservationId);
  if (!res) return { success: false, reason: 'NOT_FOUND' };
  if (res.status === 'RELEASED' || res.status === 'EXPIRED') return { success: true, reason: 'ALREADY_RELEASED' };

  const newStatus = reason === 'TIMEOUT' ? 'EXPIRED' : 'RELEASED';

  db.prepare(`
    UPDATE inventory
    SET available_quantity = available_quantity + ?,
        reserved_quantity  = reserved_quantity - ?,
        version = version + 1,
        updated_at = datetime('now')
    WHERE inventory_id = ?
  `).run(res.quantity, res.quantity, res.inventory_id);

  db.prepare(`
    UPDATE inventory_reservations SET status = ?, updated_at = datetime('now') WHERE reservation_id = ?
  `).run(newStatus, reservationId);

  db.prepare(
    `INSERT INTO audit_log (log_id, entity_type, entity_id, action, old_state, new_state, metadata)
     VALUES (?, 'INVENTORY_RESERVATION', ?, ?, 'RESERVED', ?, ?)`
  ).run(uuidv4(), reservationId, newStatus, newStatus, JSON.stringify({ reason }));

  return { success: true };
}

/**
 * Confirm a reservation (payment succeeded)
 */
function confirmReservation(reservationId) {
  const db = getDb();
  const res = db.prepare(`SELECT * FROM inventory_reservations WHERE reservation_id = ?`).get(reservationId);
  if (!res) return { success: false, reason: 'NOT_FOUND' };

  db.prepare(`
    UPDATE inventory
    SET reserved_quantity = reserved_quantity - ?,
        sold_quantity = sold_quantity + ?,
        version = version + 1,
        updated_at = datetime('now')
    WHERE inventory_id = ?
  `).run(res.quantity, res.quantity, res.inventory_id);

  db.prepare(`
    UPDATE inventory_reservations SET status = 'CONFIRMED', updated_at = datetime('now') WHERE reservation_id = ?
  `).run(reservationId);

  db.prepare(
    `INSERT INTO audit_log (log_id, entity_type, entity_id, action, old_state, new_state, metadata)
     VALUES (?, 'INVENTORY_RESERVATION', ?, 'CONFIRMED', 'PAYMENT_PENDING', 'CONFIRMED', ?)`
  ).run(uuidv4(), reservationId, JSON.stringify({ reservationId }));

  return { success: true };
}

/**
 * Expire stale reservations (scheduled job)
 */
function expireStaleReservations() {
  const db = getDb();
  const stale = db.prepare(
    `SELECT * FROM inventory_reservations 
     WHERE status = 'RESERVED' AND expires_at < datetime('now')`
  ).all();

  for (const res of stale) {
    releaseReservation(res.reservation_id, 'TIMEOUT');
  }
  return stale.length;
}

/**
 * Get current inventory stats
 */
function getInventoryStats(productId) {
  const db = getDb();
  return db.prepare(`SELECT * FROM inventory WHERE product_id = ?`).get(productId);
}

module.exports = { reserveInventory, releaseReservation, confirmReservation, expireStaleReservations, getInventoryStats };
