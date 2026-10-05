const express = require('express');
const cors = require('cors');
const { WebSocketServer } = require('ws');
const http = require('http');
const path = require('path');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

const { getDb } = require('./db/database');
const { reserveInventory, releaseReservation, confirmReservation, expireStaleReservations, getInventoryStats } = require('./services/inventoryService');
const { processPayment, retryPayment, getCircuitBreakerStatus, toggleCircuitBreaker } = require('./services/paymentService');
const { createOrder, advanceOrderState, getOrderStats, getRecentOrders } = require('./services/orderService');
const { queueService } = require('./services/queueService');
const { loadBalancer } = require('./services/loadBalancerService');
const { checkInvariants } = require('./services/invariantService');
const {
  runFlashSaleSimulation,
  runLastItemRace,
  runDuplicateIdempotencyTest,
  runOrderServiceOutageScenario
} = require('./services/simulationService');

// ─── Authentication & Session Security ─────────────────────────────────
const AUTH_PASSWORD = process.env.AUTH_PASSWORD || 'RecursionRebbel';
const activeSessions = new Map(); // token -> { createdAt, expiresAt }

function createSessionToken() {
  const token = 'st_' + crypto.randomBytes(32).toString('hex');
  const now = Date.now();
  const expiresAt = now + (24 * 60 * 60 * 1000); // 24-hour validity
  activeSessions.set(token, { createdAt: now, expiresAt });
  return token;
}

function isValidSession(token) {
  if (!token) return false;
  const session = activeSessions.get(token);
  if (!session) return false;
  if (Date.now() > session.expiresAt) {
    activeSessions.delete(token);
    return false;
  }
  return true;
}

function revokeSession(token) {
  if (token) activeSessions.delete(token);
}

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── Auth Middleware for Protected API Endpoints ──────────────────────
function authMiddleware(req, res, next) {
  if (
    req.path === '/health' ||
    req.path === '/auth/login' ||
    req.path === '/auth/verify' ||
    req.path === '/auth/status'
  ) {
    return next();
  }

  const authHeader = req.headers['authorization'];
  let token = null;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  } else if (req.headers['x-auth-token']) {
    token = req.headers['x-auth-token'];
  } else if (req.query && req.query.token) {
    token = req.query.token;
  }

  if (!isValidSession(token)) {
    return res.status(401).json({
      error: 'UNAUTHORIZED',
      message: 'Access locked. Valid security passcode required.'
    });
  }

  next();
}

app.use('/api', authMiddleware);

// WebSocket clients
const wsClients = new Set();
wss.on('connection', (ws, req) => {
  wsClients.add(ws);

  // Send initial snapshot on connect
  ws.send(JSON.stringify({
    type: 'INIT_STATE',
    data: {
      invariants: checkInvariants(),
      queue: queueService.getAllQueueDepths(),
      loadBalancer: loadBalancer.getStatus(),
      circuitBreaker: getCircuitBreakerStatus()
    },
    ts: Date.now()
  }));

  ws.on('close', () => wsClients.delete(ws));
});

function broadcast(type, data) {
  const msg = JSON.stringify({ type, data, ts: Date.now() });
  wsClients.forEach(ws => { try { ws.send(msg); } catch (_) {} });
}

// Subscribe queue events to broadcast
queueService.onEvent(({ type, data }) => {
  broadcast(`QUEUE_${type}`, data);
});

// ─── Authentication Endpoints ──────────────────────────────────────────
app.post('/api/auth/login', (req, res) => {
  const { password } = req.body || {};
  if (!password) {
    return res.status(400).json({ success: false, error: 'Passcode is required.' });
  }

  if (password === AUTH_PASSWORD) {
    const token = createSessionToken();
    return res.json({
      success: true,
      token,
      message: 'Access granted. Welcome to SALESTORM Control Room.'
    });
  }

  return res.status(401).json({
    success: false,
    error: 'Invalid security passcode. Access denied.'
  });
});

app.get('/api/auth/verify', (req, res) => {
  const authHeader = req.headers['authorization'];
  let token = null;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  } else if (req.headers['x-auth-token']) {
    token = req.headers['x-auth-token'];
  } else if (req.query && req.query.token) {
    token = req.query.token;
  }

  const valid = isValidSession(token);
  res.json({ authenticated: valid });
});

app.post('/api/auth/logout', (req, res) => {
  const authHeader = req.headers['authorization'];
  let token = null;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  } else if (req.headers['x-auth-token']) {
    token = req.headers['x-auth-token'];
  }
  revokeSession(token);
  res.json({ success: true, message: 'Session locked.' });
});

// ─── Health ────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', locked: true, time: new Date().toISOString() });
});

// ─── Invariant Sentinel ────────────────────────────────────────────────
app.get('/api/invariants', (req, res) => {
  res.json(checkInvariants());
});

// ─── Load Balancer & Buffer ────────────────────────────────────────────
app.get('/api/load-balancer', (req, res) => {
  res.json(loadBalancer.getStatus());
});

app.post('/api/load-balancer/config', (req, res) => {
  const { algorithm, bufferEnabled, bucketCapacity, leakRate } = req.body;
  if (algorithm) loadBalancer.setAlgorithm(algorithm);
  loadBalancer.setBufferConfig({ enabled: bufferEnabled, capacity: bucketCapacity, leakRate });
  broadcast('LOAD_BALANCER_CONFIG', loadBalancer.getStatus());
  res.json(loadBalancer.getStatus());
});

app.post('/api/load-balancer/drain', (req, res) => {
  const { count = 50 } = req.body;
  const drained = loadBalancer.drainBufferBatch(count);
  broadcast('LOAD_BALANCER_DRAIN', { count: drained.length, status: loadBalancer.getStatus() });
  res.json({ drained: drained.length, status: loadBalancer.getStatus() });
});

// ─── Message Queue & Outbox ────────────────────────────────────────────
app.get('/api/queue', (req, res) => {
  res.json({
    depths: queueService.getAllQueueDepths(),
    recentPaymentEvents: queueService.peekMessages('payment.success', 20),
    dlqEvents: queueService.peekMessages('order.dlq', 10)
  });
});

app.post('/api/queue/order-service-status', (req, res) => {
  const { status } = req.body; // 'ONLINE' | 'OFFLINE'
  queueService.setOrderServiceStatus(status);
  broadcast('ORDER_SERVICE_STATUS', { status, queueDepth: queueService.getQueueDepth('payment.success') });
  res.json(queueService.getAllQueueDepths());
});

app.post('/api/queue/drain', (req, res) => {
  const { batchSize = 20 } = req.body;
  const result = queueService.drainQueue('payment.success', batchSize, (msg) => {
    const { customerId, reservationId, paymentId, amount, productId, idempotencyKey } = msg.payload;
    return createOrder({
      customerId,
      reservationId,
      paymentId,
      amount,
      productId,
      quantity: 1,
      unitPrice: amount,
      idempotencyKey: `ORD-${idempotencyKey}`
    });
  });
  broadcast('QUEUE_DRAINED', { ...result, queueStatus: queueService.getAllQueueDepths() });
  res.json(result);
});

// ─── Product & Inventory ───────────────────────────────────────────────
app.get('/api/products', (req, res) => {
  const db = getDb();
  const products = db.prepare(`
    SELECT p.*, i.available_quantity, i.reserved_quantity, i.sold_quantity, i.version, i.inventory_id
    FROM products p LEFT JOIN inventory i ON i.product_id = p.product_id
    WHERE p.is_active = 1
  `).all();
  res.json({ products });
});

app.get('/api/inventory/:productId', (req, res) => {
  const stats = getInventoryStats(req.params.productId);
  if (!stats) return res.status(404).json({ error: 'Product not found' });
  res.json(stats);
});

// Reset inventory (for clean simulation start)
app.post('/api/inventory/reset', (req, res) => {
  const db = getDb();
  const { units = 100 } = req.body || {};
  db.prepare(`DELETE FROM order_items`).run();
  db.prepare(`DELETE FROM orders`).run();
  db.prepare(`DELETE FROM payments`).run();
  db.prepare(`DELETE FROM inventory_reservations`).run();
  db.prepare(`DELETE FROM audit_log`).run();
  db.prepare(`UPDATE inventory SET available_quantity = ?, reserved_quantity = 0, sold_quantity = 0, version = version + 1, updated_at = datetime('now')`).run(units);
  queueService.reset();
  loadBalancer.reset();
  broadcast('INVENTORY_RESET', { units, invariants: checkInvariants() });
  res.json({ success: true, message: `Inventory reset to ${units} units`, invariants: checkInvariants() });
});

// ─── Reservation ───────────────────────────────────────────────────────
app.post('/api/reservations', (req, res) => {
  const { customerId, productId, quantity = 1, idempotencyKey } = req.body;
  if (!customerId || !productId) return res.status(400).json({ error: 'customerId and productId required' });

  const ikey = idempotencyKey || uuidv4();
  const result = reserveInventory({ customerId, productId, quantity, idempotencyKey: ikey });

  broadcast('RESERVATION', result);

  if (result.success) {
    res.status(201).json(result);
  } else {
    const code = result.reason === 'OUT_OF_STOCK' ? 409 : result.reason === 'DUPLICATE_REQUEST_IDEMPOTENT' ? 200 : 422;
    res.status(code).json(result);
  }
});

app.delete('/api/reservations/:id', (req, res) => {
  const result = releaseReservation(req.params.id);
  broadcast('RESERVATION_RELEASED', { reservationId: req.params.id });
  res.json(result);
});

app.get('/api/reservations', (req, res) => {
  const db = getDb();
  const reservations = db.prepare(`SELECT * FROM inventory_reservations ORDER BY created_at DESC LIMIT 100`).all();
  res.json({ reservations });
});

// ─── Payment ───────────────────────────────────────────────────────────
app.post('/api/payments', (req, res) => {
  const { reservationId, customerId, amount, idempotencyKey } = req.body;
  if (!reservationId || !customerId || !amount) return res.status(400).json({ error: 'Missing required fields' });

  const ikey = idempotencyKey || uuidv4();
  const result = processPayment({ reservationId, customerId, amount, idempotencyKey: ikey });

  broadcast('PAYMENT', result);

  if (result.success) {
    res.status(201).json(result);
  } else {
    res.status(422).json(result);
  }
});

app.post('/api/payments/:id/retry', (req, res) => {
  const result = retryPayment(req.params.id);
  broadcast('PAYMENT_RETRY', result);
  res.json(result);
});

app.get('/api/payments', (req, res) => {
  const db = getDb();
  const payments = db.prepare(`SELECT * FROM payments ORDER BY created_at DESC LIMIT 100`).all();
  const stats = db.prepare(`SELECT status, COUNT(*) as count, SUM(amount) as total FROM payments GROUP BY status`).all();
  res.json({ payments, stats });
});

app.get('/api/circuit-breaker', (req, res) => {
  res.json(getCircuitBreakerStatus());
});

app.post('/api/circuit-breaker/toggle', (req, res) => {
  const { open } = req.body;
  toggleCircuitBreaker(open);
  broadcast('CIRCUIT_BREAKER', { state: open ? 'OPEN' : 'CLOSED' });
  res.json(getCircuitBreakerStatus());
});

// ─── Order ─────────────────────────────────────────────────────────────
app.post('/api/orders', (req, res) => {
  const { customerId, reservationId, paymentId, amount, productId, quantity, unitPrice, idempotencyKey } = req.body;
  const ikey = idempotencyKey || uuidv4();
  const result = createOrder({ customerId, reservationId, paymentId, amount, productId, quantity, unitPrice, idempotencyKey: ikey });
  broadcast('ORDER', result);
  res.status(result.success ? 201 : 422).json(result);
});

app.patch('/api/orders/:id/state', (req, res) => {
  const { targetState } = req.body;
  const result = advanceOrderState(req.params.id, targetState);
  broadcast('ORDER_STATE_CHANGE', result);
  res.json(result);
});

app.get('/api/orders', (req, res) => {
  const orders = getRecentOrders(100);
  const stats = getOrderStats();
  res.json({ orders, stats });
});

// ─── Direct Simulation Scenarios ───────────────────────────────────────
let activeSimulation = null;

// Scenario 1: 10k Flash Sale
app.post('/api/simulate', async (req, res) => {
  if (activeSimulation) return res.status(409).json({ error: 'Simulation already running' });

  const { totalRequests = 10000, batchSize = 200 } = req.body;
  res.json({ message: '10K Flash Sale simulation started', totalRequests, batchSize });

  activeSimulation = true;
  broadcast('SIMULATION_START', { totalRequests, batchSize });

  try {
    const results = await runFlashSaleSimulation({
      totalRequests,
      batchSize,
      onProgress: (progress) => {
        broadcast('SIMULATION_PROGRESS', progress);
      }
    });
    broadcast('SIMULATION_COMPLETE', results);
  } catch (err) {
    broadcast('SIMULATION_ERROR', { error: err.message });
  } finally {
    activeSimulation = false;
  }
});

// Scenario 2: Last-Item Race Condition
app.post('/api/simulate/last-item-race', async (req, res) => {
  try {
    const result = await runLastItemRace();
    broadcast('LAST_ITEM_RACE_COMPLETE', result);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Scenario 3: Duplicate Request Idempotency
app.post('/api/simulate/duplicate', async (req, res) => {
  try {
    const result = await runDuplicateIdempotencyTest();
    broadcast('DUPLICATE_TEST_COMPLETE', result);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Scenario 4: Order Service Outage (30s) & Queue Decoupling
app.post('/api/simulate/order-service-outage', async (req, res) => {
  const { duration = 4 } = req.body;
  res.json({ message: 'Order service outage scenario started', duration });
  try {
    const result = await runOrderServiceOutageScenario({
      outageDurationSeconds: duration,
      onProgress: (p) => broadcast('OUTAGE_PROGRESS', p)
    });
    broadcast('OUTAGE_COMPLETE', result);
  } catch (err) {
    broadcast('SIMULATION_ERROR', { error: err.message });
  }
});

app.get('/api/simulation/status', (req, res) => {
  res.json({ running: !!activeSimulation });
});

// ─── Database Live Inspector ───────────────────────────────────────────
app.get('/api/database/tables', (req, res) => {
  const db = getDb();
  const inventory = db.prepare(`SELECT * FROM inventory`).all();
  const reservations = db.prepare(`SELECT * FROM inventory_reservations ORDER BY created_at DESC LIMIT 50`).all();
  const payments = db.prepare(`SELECT * FROM payments ORDER BY created_at DESC LIMIT 50`).all();
  const orders = db.prepare(`SELECT * FROM orders ORDER BY created_at DESC LIMIT 50`).all();
  const audit = db.prepare(`SELECT * FROM audit_log ORDER BY created_at DESC LIMIT 50`).all();

  res.json({ inventory, reservations, payments, orders, audit });
});

// ─── Stats / Dashboard ─────────────────────────────────────────────────
app.get('/api/stats', (req, res) => {
  const db = getDb();
  const product = db.prepare(`SELECT p.*, i.* FROM products p JOIN inventory i ON i.product_id = p.product_id LIMIT 1`).get();
  const orderStats = getOrderStats();
  const payStats = db.prepare(`SELECT status, COUNT(*) as count FROM payments GROUP BY status`).all();
  const resStats = db.prepare(`SELECT status, COUNT(*) as count FROM inventory_reservations GROUP BY status`).all();
  const auditCount = db.prepare(`SELECT COUNT(*) as cnt FROM audit_log`).get();
  const invariants = checkInvariants();
  const queue = queueService.getAllQueueDepths();
  const loadBalancerStatus = loadBalancer.getStatus();

  res.json({ product, orderStats, payStats, resStats, auditCount, invariants, queue, loadBalancer: loadBalancerStatus });
});

app.get('/api/audit', (req, res) => {
  const db = getDb();
  const logs = db.prepare(`SELECT * FROM audit_log ORDER BY created_at DESC LIMIT 200`).all();
  res.json({ logs });
});

// ─── Stale Reservation Expiry Job ──────────────────────────────────────
setInterval(() => {
  const count = expireStaleReservations();
  if (count > 0) broadcast('RESERVATIONS_EXPIRED', { count, invariants: checkInvariants() });
}, 10000);

// ─── Start server ──────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`\n🚀 SALESTORM Simulation Server active at http://localhost:${PORT}`);
    console.log(`   🎛️ Control Room: http://localhost:${PORT}`);
    console.log(`   🌐 3D Infrastructure: Three.js WebGL ready`);
    console.log(`   🛡️ Invariant Sentinel: Active (6 continuous assertions)\n`);
    getDb();
  });
}

module.exports = app;
module.exports.server = server;
