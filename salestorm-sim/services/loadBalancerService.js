// Load Balancer & Traffic Buffer Service
// Simulates multi-algorithm routing (Round Robin, Least Connections, IP Hash, Weighted Latency)
// and Token Bucket / Leaky Bucket time buffering to smooth out flash sale traffic spikes.

class LoadBalancer {
  constructor() {
    this.algorithm = 'ROUND_ROBIN'; // 'ROUND_ROBIN' | 'LEAST_CONN' | 'IP_HASH' | 'WEIGHTED_LATENCY'
    this.bufferEnabled = true;
    this.bucketCapacity = 2000; // max buffer depth
    this.leakRate = 250; // requests drained per second
    this.bufferQueue = [];
    this.isDraining = false;

    // Simulated Worker Pods
    this.pods = [
      { id: 'pod-1', name: 'Worker Pod A (us-east-1a)', activeConnections: 0, totalRequests: 0, avgLatency: 18, status: 'HEALTHY', weight: 1.0 },
      { id: 'pod-2', name: 'Worker Pod B (us-east-1b)', activeConnections: 0, totalRequests: 0, avgLatency: 22, status: 'HEALTHY', weight: 1.0 },
      { id: 'pod-3', name: 'Worker Pod C (us-east-1c)', activeConnections: 0, totalRequests: 0, avgLatency: 15, status: 'HEALTHY', weight: 1.0 },
      { id: 'pod-4', name: 'Worker Pod D (us-east-1d)', activeConnections: 0, totalRequests: 0, avgLatency: 25, status: 'HEALTHY', weight: 1.0 },
    ];

    this.roundRobinIndex = 0;
    this.metrics = {
      totalIngress: 0,
      totalRouted: 0,
      totalShed: 0,
      currentBufferDepth: 0,
      peakBufferDepth: 0,
    };
  }

  setAlgorithm(algo) {
    if (['ROUND_ROBIN', 'LEAST_CONN', 'IP_HASH', 'WEIGHTED_LATENCY'].includes(algo)) {
      this.algorithm = algo;
    }
  }

  setBufferConfig({ enabled, capacity, leakRate }) {
    if (typeof enabled === 'boolean') this.bufferEnabled = enabled;
    if (capacity) this.bucketCapacity = capacity;
    if (leakRate) this.leakRate = leakRate;
  }

  selectPod(ip = '127.0.0.1') {
    const healthyPods = this.pods.filter(p => p.status === 'HEALTHY');
    if (healthyPods.length === 0) return null;

    switch (this.algorithm) {
      case 'ROUND_ROBIN': {
        const pod = healthyPods[this.roundRobinIndex % healthyPods.length];
        this.roundRobinIndex = (this.roundRobinIndex + 1) % healthyPods.length;
        return pod;
      }
      case 'LEAST_CONN': {
        return healthyPods.reduce((min, p) => p.activeConnections < min.activeConnections ? p : min, healthyPods[0]);
      }
      case 'IP_HASH': {
        let hash = 0;
        for (let i = 0; i < ip.length; i++) hash = (hash << 5) - hash + ip.charCodeAt(i);
        const index = Math.abs(hash) % healthyPods.length;
        return healthyPods[index];
      }
      case 'WEIGHTED_LATENCY': {
        // Lower latency gets higher preference
        return healthyPods.reduce((best, p) => (p.avgLatency * (1 + p.activeConnections * 0.1)) < (best.avgLatency * (1 + best.activeConnections * 0.1)) ? p : best, healthyPods[0]);
      }
      default:
        return healthyPods[0];
    }
  }

  enqueueRequest(request) {
    this.metrics.totalIngress++;

    if (!this.bufferEnabled) {
      // Direct routing without buffer
      const pod = this.selectPod(request.ip);
      if (pod) {
        pod.activeConnections++;
        pod.totalRequests++;
        this.metrics.totalRouted++;
        return { routed: true, buffered: false, pod: pod.id };
      }
      this.metrics.totalShed++;
      return { routed: false, shed: true, reason: 'NO_HEALTHY_PODS' };
    }

    // Leaky / Token Bucket time buffering
    if (this.bufferQueue.length >= this.bucketCapacity) {
      this.metrics.totalShed++;
      return { routed: false, shed: true, reason: 'BUFFER_OVERFLOW_RATE_LIMITED' };
    }

    this.bufferQueue.push({ ...request, queuedAt: Date.now() });
    this.metrics.currentBufferDepth = this.bufferQueue.length;
    if (this.bufferQueue.length > this.metrics.peakBufferDepth) {
      this.metrics.peakBufferDepth = this.bufferQueue.length;
    }

    return {
      routed: false,
      buffered: true,
      queuePosition: this.bufferQueue.length,
      estimatedWaitMs: Math.round((this.bufferQueue.length / this.leakRate) * 1000)
    };
  }

  drainBufferBatch(count = 50) {
    const toDrain = Math.min(count, this.bufferQueue.length);
    const dispatched = [];

    for (let i = 0; i < toDrain; i++) {
      const item = this.bufferQueue.shift();
      const pod = this.selectPod(item.ip || '127.0.0.1');
      if (pod) {
        pod.activeConnections = Math.max(0, pod.activeConnections + 1);
        pod.totalRequests++;
        this.metrics.totalRouted++;
        dispatched.push({ item, pod: pod.id });
      }
    }

    this.metrics.currentBufferDepth = this.bufferQueue.length;
    return dispatched;
  }

  releasePodConnection(podId) {
    const pod = this.pods.find(p => p.id === podId);
    if (pod && pod.activeConnections > 0) {
      pod.activeConnections--;
    }
  }

  togglePodHealth(podId, status) {
    const pod = this.pods.find(p => p.id === podId);
    if (pod) {
      pod.status = status; // 'HEALTHY' | 'UNHEALTHY' | 'DRAINING'
    }
  }

  getStatus() {
    return {
      algorithm: this.algorithm,
      bufferEnabled: this.bufferEnabled,
      bucketCapacity: this.bucketCapacity,
      leakRate: this.leakRate,
      currentBufferDepth: this.bufferQueue.length,
      peakBufferDepth: this.metrics.peakBufferDepth,
      metrics: this.metrics,
      pods: this.pods
    };
  }

  reset() {
    this.bufferQueue = [];
    this.roundRobinIndex = 0;
    this.metrics = { totalIngress: 0, totalRouted: 0, totalShed: 0, currentBufferDepth: 0, peakBufferDepth: 0 };
    this.pods.forEach(p => {
      p.activeConnections = 0;
      p.totalRequests = 0;
      p.status = 'HEALTHY';
    });
  }
}

const loadBalancer = new LoadBalancer();

module.exports = { loadBalancer };
