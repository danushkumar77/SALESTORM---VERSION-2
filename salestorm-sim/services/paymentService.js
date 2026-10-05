// Payment Service - Idempotent payment processing with circuit breaker
const { getDb } = require('../db/database');
const { v4: uuidv4 } = require('uuid');

// Circuit Breaker state
const circuitBreaker = {
  state: 'CLOSED', // CLOSED, OPEN, HALF_OPEN
  failureCount: 0,
  failureThreshold: 5,
  resetTimeout: 30000,
  lastFailureTime: null,
  successRate: 0.95, // 95% success
};

// Simulate payment gateway
function simulateGateway(amount) {
  // Check circuit breaker
  if (circuitBreaker.state === 'OPEN') {
    const elapsed = Date.now() - circuitBreaker.lastFailureTime;
    if (elapsed > circuitBreaker.resetTimeout) {
      circuitBreaker.state = 'HALF_OPEN';
    } else {
      return { status: 'TIMEOUT', reason: 'CIRCUIT_OPEN', gatewayRef: null };
    }
  }

  const rand = Math.random();

  // Inject failures: 5% fail, 2% duplicate-ish (handled by idempotency)
  if (rand < 0.03) {
    // Payment timeout
    circuitBreaker.failureCount++;
    circuitBreaker.lastFailureTime = Date.now();
    if (circuitBreaker.failureCount >= circuitBreaker.failureThreshold) {
      circuitBreaker.state = 'OPEN';
    }
    return { status: 'TIMEOUT', reason: 'GATEWAY_TIMEOUT', gatewayRef: null };
  } else if (rand < 0.08) {
    // Payment failed (declined)
    circuitBreaker.failureCount++;
    circuitBreaker.lastFailureTime = Date.now();
    return { status: 'FAILED', reason: 'CARD_DECLINED', gatewayRef: null };
  } else {
    // Success
    if (circuitBreaker.state === 'HALF_OPEN') {
      circuitBreaker.state = 'CLOSED';
      circuitBreaker.failureCount = 0;
    }
    return { status: 'SUCCESS', reason: null, gatewayRef: `TXN-${uuidv4().substring(0, 8).toUpperCase()}` };
  }
}

/**
 * Process payment - idempotent
 * Returns { success, payment, reason }
 */
function processPayment({ reservationId, customerId, amount, idempotencyKey }) {
  const db = getDb();

  // 1. Idempotency check
  const existing = db.prepare(`SELECT * FROM payments WHERE idempotency_key = ?`).get(idempotencyKey);
  if (existing) {
    return {
      success: existing.status === 'SUCCESS',
      payment: existing,
      reason: 'IDEMPOTENT_DUPLICATE'
    };
  }

  // 2. Validate reservation
  const reservation = db.prepare(`SELECT * FROM inventory_reservations WHERE reservation_id = ?`).get(reservationId);
  if (!reservation) return { success: false, reason: 'RESERVATION_NOT_FOUND' };
  if (reservation.status === 'EXPIRED') return { success: false, reason: 'RESERVATION_EXPIRED' };
  if (reservation.status === 'RELEASED') return { success: false, reason: 'RESERVATION_RELEASED' };

  // 3. Create payment record (PENDING)
  const paymentId = uuidv4();
  db.prepare(`
    INSERT INTO payments (payment_id, reservation_id, customer_id, idempotency_key, amount, currency, status)
    VALUES (?, ?, ?, ?, ?, 'INR', 'PENDING')
  `).run(paymentId, reservationId, customerId, idempotencyKey, amount);

  // 4. Mark reservation as PAYMENT_PENDING
  db.prepare(`UPDATE inventory_reservations SET status = 'PAYMENT_PENDING', updated_at = datetime('now') WHERE reservation_id = ?`).run(reservationId);

  // 5. Call payment gateway
  const gwResult = simulateGateway(amount);

  // 6. Update payment record
  db.prepare(`
    UPDATE payments SET status = ?, gateway_txn_ref = ?, failure_reason = ?, updated_at = datetime('now')
    WHERE payment_id = ?
  `).run(gwResult.status, gwResult.gatewayRef, gwResult.reason, paymentId);

  // 7. Audit
  db.prepare(
    `INSERT INTO audit_log (log_id, entity_type, entity_id, action, old_state, new_state, metadata)
     VALUES (?, 'PAYMENT', ?, ?, 'PENDING', ?, ?)`
  ).run(uuidv4(), paymentId, gwResult.status, gwResult.status, JSON.stringify({ reservationId, amount, gwResult }));

  const payment = db.prepare(`SELECT * FROM payments WHERE payment_id = ?`).get(paymentId);
  return {
    success: gwResult.status === 'SUCCESS',
    payment,
    reason: gwResult.reason
  };
}

/**
 * Retry a failed/timed-out payment (idempotent - uses same key)
 */
function retryPayment(paymentId) {
  const db = getDb();
  const payment = db.prepare(`SELECT * FROM payments WHERE payment_id = ?`).get(paymentId);
  if (!payment) return { success: false, reason: 'NOT_FOUND' };
  if (payment.status === 'SUCCESS') return { success: true, payment, reason: 'ALREADY_SUCCEEDED' };
  if (payment.retry_count >= 3) return { success: false, reason: 'MAX_RETRIES_EXCEEDED' };

  const gwResult = simulateGateway(payment.amount);

  db.prepare(`
    UPDATE payments SET status = ?, gateway_txn_ref = ?, failure_reason = ?, retry_count = retry_count + 1, updated_at = datetime('now')
    WHERE payment_id = ?
  `).run(gwResult.status, gwResult.gatewayRef, gwResult.reason, paymentId);

  const updated = db.prepare(`SELECT * FROM payments WHERE payment_id = ?`).get(paymentId);
  return { success: gwResult.status === 'SUCCESS', payment: updated, reason: gwResult.reason };
}

function getCircuitBreakerStatus() {
  return { ...circuitBreaker };
}

function toggleCircuitBreaker(open) {
  circuitBreaker.state = open ? 'OPEN' : 'CLOSED';
  circuitBreaker.failureCount = open ? circuitBreaker.failureThreshold : 0;
  circuitBreaker.lastFailureTime = open ? Date.now() : null;
}

module.exports = { processPayment, retryPayment, getCircuitBreakerStatus, toggleCircuitBreaker };
