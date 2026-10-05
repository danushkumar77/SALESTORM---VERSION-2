const http = require('http');
const { WebSocketServer } = require('ws');
const app = require('./app');
const { getDb } = require('./db/database');
const { queueService } = require('./services/queueService');
const { loadBalancer } = require('./services/loadBalancerService');
const { checkInvariants } = require('./services/invariantService');
const { getCircuitBreakerStatus } = require('./services/paymentService');

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const wsClients = new Set();
wss.on('connection', (ws) => {
  wsClients.add(ws);
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

app.setBroadcaster(broadcast);

queueService.onEvent(({ type, data }) => {
  broadcast(`QUEUE_${type}`, data);
});

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
