// Distributed Message Queue Service (Kafka / RabbitMQ Simulation)
// Manages durable topics, backpressure, simulated consumer lag, and Order Service outage buffering.

const { v4: uuidv4 } = require('uuid');

class MessageQueueService {
  constructor() {
    this.topics = {
      'payment.success': [],
      'order.created': [],
      'inventory.released': [],
      'order.dlq': []
    };

    this.orderServiceStatus = 'ONLINE'; // 'ONLINE' | 'OFFLINE' | 'DEGRADED'
    this.consumerLag = 0;
    this.totalPublished = 0;
    this.totalConsumed = 0;
    this.totalDeadLettered = 0;
    this.subscribers = [];
  }

  publish(topic, payload) {
    const msg = {
      messageId: `MSG-${uuidv4().substring(0, 8).toUpperCase()}`,
      topic,
      payload,
      enqueuedAt: Date.now(),
      status: 'QUEUED',
      retryCount: 0
    };

    if (!this.topics[topic]) this.topics[topic] = [];
    this.topics[topic].push(msg);
    this.totalPublished++;

    this.notifySubscribers('MESSAGE_ENQUEUED', { topic, message: msg, queueDepth: this.getQueueDepth() });
    return msg;
  }

  setOrderServiceStatus(status) {
    this.orderServiceStatus = status; // 'ONLINE' | 'OFFLINE' | 'DEGRADED'
    this.notifySubscribers('ORDER_SERVICE_STATUS', { status, queueDepth: this.getQueueDepth() });
  }

  getQueueDepth(topic = 'payment.success') {
    return this.topics[topic] ? this.topics[topic].filter(m => m.status === 'QUEUED').length : 0;
  }

  getAllQueueDepths() {
    return {
      paymentSuccess: this.getQueueDepth('payment.success'),
      orderCreated: this.getQueueDepth('order.created'),
      inventoryReleased: this.getQueueDepth('inventory.released'),
      dlq: this.getQueueDepth('order.dlq'),
      orderServiceStatus: this.orderServiceStatus,
      totalPublished: this.totalPublished,
      totalConsumed: this.totalConsumed,
      totalDeadLettered: this.totalDeadLettered
    };
  }

  peekMessages(topic = 'payment.success', limit = 20) {
    const messages = this.topics[topic] || [];
    return messages.slice(-limit);
  }

  drainQueue(topic = 'payment.success', batchSize = 10, consumerHandler) {
    if (this.orderServiceStatus === 'OFFLINE') {
      return { consumed: 0, remaining: this.getQueueDepth(topic), reason: 'CONSUMER_OFFLINE' };
    }

    const queue = this.topics[topic] || [];
    const pending = queue.filter(m => m.status === 'QUEUED');
    const toProcess = pending.slice(0, batchSize);
    let processedCount = 0;

    for (const msg of toProcess) {
      try {
        if (consumerHandler) {
          const res = consumerHandler(msg);
          if (res && res.success) {
            msg.status = 'ACKNOWLEDGED';
            msg.processedAt = Date.now();
            this.totalConsumed++;
            processedCount++;
          } else {
            msg.retryCount++;
            if (msg.retryCount >= 3) {
              msg.status = 'DEAD_LETTERED';
              this.topics['order.dlq'].push(msg);
              this.totalDeadLettered++;
            }
          }
        } else {
          msg.status = 'ACKNOWLEDGED';
          msg.processedAt = Date.now();
          this.totalConsumed++;
          processedCount++;
        }
      } catch (err) {
        msg.retryCount++;
        if (msg.retryCount >= 3) {
          msg.status = 'DEAD_LETTERED';
          this.topics['order.dlq'].push(msg);
          this.totalDeadLettered++;
        }
      }
    }

    return { consumed: processedCount, remaining: this.getQueueDepth(topic) };
  }

  onEvent(callback) {
    this.subscribers.push(callback);
  }

  notifySubscribers(type, data) {
    this.subscribers.forEach(cb => {
      try { cb({ type, data, timestamp: Date.now() }); } catch (_) {}
    });
  }

  reset() {
    this.topics = {
      'payment.success': [],
      'order.created': [],
      'inventory.released': [],
      'order.dlq': []
    };
    this.orderServiceStatus = 'ONLINE';
    this.totalPublished = 0;
    this.totalConsumed = 0;
    this.totalDeadLettered = 0;
  }
}

const queueService = new MessageQueueService();

module.exports = { queueService };
