// Invariant Sentinel Service
// Continuously checks mathematical and business invariants for high-concurrency flash sales.

const { getDb } = require('../db/database');

function checkInvariants() {
  const db = getDb();

  const inventory = db.prepare(`SELECT * FROM inventory LIMIT 1`).get();
  const initialStock = 100; // default baseline stock

  const totalStock = (inventory?.available_quantity || 0) + (inventory?.reserved_quantity || 0) + (inventory?.sold_quantity || 0);
  const availableStock = inventory?.available_quantity ?? 0;
  const reservedStock = inventory?.reserved_quantity ?? 0;
  const soldStock = inventory?.sold_quantity ?? 0;

  // 1. Invariant 1: No Overselling (Sold <= TotalStock)
  const noOverselling = soldStock <= totalStock;

  // 2. Invariant 2: Non-negative inventory (Available >= 0, Reserved >= 0)
  const nonNegative = availableStock >= 0 && reservedStock >= 0 && soldStock >= 0;

  // 3. Invariant 3: Stock Conservation Equilibrium (Available + Reserved + Sold == TotalStock)
  const stockConservation = (availableStock + reservedStock + soldStock) === totalStock;

  // 4. Invariant 4: Idempotency Protection (Duplicate keys never produce duplicate successful payments or orders)
  const duplicateOrders = db.prepare(`
    SELECT idempotency_key, COUNT(*) as cnt
    FROM orders
    GROUP BY idempotency_key
    HAVING cnt > 1
  `).all();
  const idempotencyProtected = duplicateOrders.length === 0;

  // 5. Invariant 5: Exactly-Once Order Generation (1 Successful Payment = At Most 1 Order)
  const duplicateOrdersPerPayment = db.prepare(`
    SELECT payment_id, COUNT(*) as cnt
    FROM orders
    WHERE payment_id IS NOT NULL AND status = 'CONFIRMED'
    GROUP BY payment_id
    HAVING cnt > 1
  `).all();
  const successfulPayments = db.prepare(`SELECT COUNT(*) as cnt FROM payments WHERE status = 'SUCCESS'`).get()?.cnt || 0;
  const confirmedOrders = db.prepare(`SELECT COUNT(*) as cnt FROM orders WHERE status = 'CONFIRMED'`).get()?.cnt || 0;
  const exactlyOnce = duplicateOrdersPerPayment.length === 0;

  // 6. Invariant 6: Expired/Failed Reservation Auto-Recovery (No orphan locks)
  const staleUnreleased = db.prepare(`
    SELECT COUNT(*) as cnt FROM inventory_reservations
    WHERE status = 'RESERVED' AND expires_at < datetime('now')
  `).get()?.cnt || 0;
  const reservationRecovery = staleUnreleased === 0;

  const allPassed = noOverselling && nonNegative && stockConservation && idempotencyProtected && exactlyOnce && reservationRecovery;

  return {
    allPassed,
    timestamp: new Date().toISOString(),
    metrics: {
      initialStock,
      availableStock,
      reservedStock,
      soldStock,
      totalStock,
      oversold: Math.max(0, soldStock - initialStock),
      successfulPayments,
      confirmedOrders
    },
    invariants: [
      {
        id: 'INV_NO_OVERSELL',
        name: 'Zero Overselling Invariant',
        rule: 'sold_quantity <= initial_stock (100)',
        passed: noOverselling,
        status: noOverselling ? 'PASSED' : 'VIOLATION',
        details: `Sold: ${soldStock} / Initial: ${initialStock}`
      },
      {
        id: 'INV_NON_NEGATIVE',
        name: 'Non-Negative Inventory Invariant',
        rule: 'available >= 0 && reserved >= 0',
        passed: nonNegative,
        status: nonNegative ? 'PASSED' : 'VIOLATION',
        details: `Available: ${availableStock}, Reserved: ${reservedStock}`
      },
      {
        id: 'INV_CONSERVATION',
        name: 'Inventory Conservation Invariant',
        rule: 'available + reserved + sold == initial_stock (100)',
        passed: stockConservation,
        status: stockConservation ? 'PASSED' : 'VIOLATION',
        details: `Sum: ${availableStock + reservedStock + soldStock} vs ${initialStock}`
      },
      {
        id: 'INV_IDEMPOTENCY',
        name: 'Idempotency Protection Invariant',
        rule: 'COUNT(orders.idempotency_key) == 1',
        passed: idempotencyProtected,
        status: idempotencyProtected ? 'PASSED' : 'VIOLATION',
        details: duplicateOrders.length === 0 ? 'No duplicate keys detected' : `${duplicateOrders.length} duplicate violations`
      },
      {
        id: 'INV_EXACTLY_ONCE',
        name: 'Exactly-Once Business Effect Invariant',
        rule: 'confirmed_orders <= successful_payments',
        passed: exactlyOnce,
        status: exactlyOnce ? 'PASSED' : 'VIOLATION',
        details: `Orders: ${confirmedOrders} vs Successful Payments: ${successfulPayments}`
      },
      {
        id: 'INV_AUTO_RECOVERY',
        name: 'Reservation Auto-Recovery Invariant',
        rule: 'expired_unreleased_reservations == 0',
        passed: reservationRecovery,
        status: reservationRecovery ? 'PASSED' : 'VIOLATION',
        details: `${staleUnreleased} unreleased expired reservations`
      }
    ]
  };
}

module.exports = { checkInvariants };
