/* ================================================================
   SALESTORM — Advanced Cybernetic 3D Infrastructure Topology
   High-Tech Holographic Visualizer for SYSCRAFTERS 2026 Hackathon
   ================================================================ */

class Infrastructure3DScene {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    if (!this.container) return;

    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.nodes = {};
    this.particles = [];
    this.queueBlocks = [];
    this.billboards = {};
    this.rotators = [];
    this.pulseLines = [];
    this.clock = new THREE.Clock();

    this.mouse = { x: 0, y: 0, isDragging: false, prevX: 0, prevY: 0 };
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.hoveredNode = null;

    this.stockCount = 100;
    this.queueCount = 0;

    this.init();
  }

  init() {
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || 650;

    // 1. Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x040711);
    this.scene.fog = new THREE.FogExp2(0x040711, 0.0009);

    // 2. Camera
    this.camera = new THREE.PerspectiveCamera(45, width / height, 1, 4000);
    this.camera.position.set(0, 360, 560);
    this.camera.lookAt(0, 10, -20);

    // 3. Renderer with high dynamic range look
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.25;
    this.container.innerHTML = '';
    this.container.appendChild(this.renderer.domElement);

    // 4. Lighting Rig
    this.setupLighting();

    // 5. Sci-Fi Cybernetic Grid & Floor
    this.buildCyberFloor();

    // 6. High-Tech Service Nodes with Holographic Badges
    this.buildArchitectureNodes();

    // 7. Data Pipelines with Laser Pulses
    this.buildDataPipelines();

    // 8. Event Listeners
    this.setupInteractions();

    window.addEventListener('resize', () => this.onResize());

    // 9. Render Loop
    this.animate();
  }

  setupLighting() {
    const ambientLight = new THREE.AmbientLight(0x1e293b, 1.8);
    this.scene.add(ambientLight);

    const mainLight = new THREE.DirectionalLight(0x38bdf8, 2.2);
    mainLight.position.set(200, 450, 300);
    mainLight.castShadow = true;
    mainLight.shadow.mapSize.width = 1024;
    mainLight.shadow.mapSize.height = 1024;
    this.scene.add(mainLight);

    // Colored Accent Point Lights
    const cyanLight = new THREE.PointLight(0x00f2fe, 3.5, 700);
    cyanLight.position.set(-180, 120, 80);
    this.scene.add(cyanLight);

    const purpleLight = new THREE.PointLight(0xa855f7, 3.5, 700);
    purpleLight.position.set(180, 120, -100);
    this.scene.add(purpleLight);

    const amberLight = new THREE.PointLight(0xf59e0b, 2.5, 500);
    amberLight.position.set(-150, 80, -140);
    this.scene.add(amberLight);
  }

  buildCyberFloor() {
    // Hexagonal / Grid Platform
    const gridHelper = new THREE.GridHelper(1400, 50, 0x00f2fe, 0x0f172a);
    gridHelper.position.y = -10;
    gridHelper.material.opacity = 0.35;
    gridHelper.material.transparent = true;
    this.scene.add(gridHelper);

    // Concentric Cybernetic Rings on Floor
    for (let r of [150, 320, 500, 650]) {
      const ringGeo = new THREE.RingGeometry(r - 1.5, r, 64);
      const ringMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, side: THREE.DoubleSide, transparent: true, opacity: 0.18 });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = -9.5;
      this.scene.add(ring);
    }
  }

  createHologramBadge(title, subtitle, colorHex = '#00f2fe') {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 160;
    const ctx = canvas.getContext('2d');

    const draw = (subText = subtitle) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Glass Card Background
      ctx.fillStyle = 'rgba(6, 12, 28, 0.88)';
      ctx.strokeStyle = colorHex;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.roundRect(8, 8, canvas.width - 16, canvas.height - 16, 20);
      ctx.fill();
      ctx.stroke();

      // Top glowing indicator bar
      ctx.fillStyle = colorHex;
      ctx.fillRect(24, 18, 40, 6);

      // Title Text
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 30px "JetBrains Mono", monospace';
      ctx.fillText(title, 24, 70);

      // Subtitle Text / Metric
      ctx.fillStyle = colorHex;
      ctx.font = '600 22px "Inter", sans-serif';
      ctx.fillText(subText, 24, 115);
    };

    draw();

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.scale.set(110, 35, 1);

    return { sprite, updateSubtitle: (newSub) => { draw(newSub); texture.needsUpdate = true; } };
  }

  buildArchitectureNodes() {
    // ── 1. CUSTOMER INGRESS TRAFFIC PORTAL ──────────────────────
    const usersGroup = new THREE.Group();
    usersGroup.position.set(0, 0, 240);

    // Cyber portal base
    const portalBaseGeo = new THREE.CylinderGeometry(40, 48, 12, 8);
    const portalBaseMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.9, roughness: 0.2 });
    const portalBase = new THREE.Mesh(portalBaseGeo, portalBaseMat);
    usersGroup.add(portalBase);

    // Glowing energy ring
    const energyRingGeo = new THREE.TorusGeometry(32, 4, 16, 32);
    const energyRingMat = new THREE.MeshStandardMaterial({ color: 0x00f2fe, emissive: 0x00f2fe, emissiveIntensity: 0.8 });
    const energyRing = new THREE.Mesh(energyRingGeo, energyRingMat);
    energyRing.rotation.x = Math.PI / 2;
    energyRing.position.y = 12;
    usersGroup.add(energyRing);
    this.rotators.push({ mesh: energyRing, axis: 'z', speed: 0.02 });

    // Floating Holographic Badge
    const badgeUsers = this.createHologramBadge('👥 CUSTOMER INGRESS', '10,000 Concurrent Streams', '#00f2fe');
    badgeUsers.sprite.position.set(0, 65, 0);
    usersGroup.add(badgeUsers.sprite);

    this.scene.add(usersGroup);
    this.nodes['users'] = { group: usersGroup, badge: badgeUsers, baseColor: 0x00f2fe };

    // ── 2. API GATEWAY & LOAD BALANCER ─────────────────────────
    const lbGroup = new THREE.Group();
    lbGroup.position.set(0, 0, 130);

    // Hexagonal Pedestal
    const hexPedGeo = new THREE.CylinderGeometry(36, 42, 14, 6);
    const hexPedMat = new THREE.MeshStandardMaterial({ color: 0x1e1b4b, metalness: 0.8, roughness: 0.25 });
    const hexPed = new THREE.Mesh(hexPedGeo, hexPedMat);
    lbGroup.add(hexPed);

    // Floating Rotating Crystal Core
    const crystalGeo = new THREE.OctahedronGeometry(18, 0);
    const crystalMat = new THREE.MeshStandardMaterial({
      color: 0x6366f1,
      emissive: 0x4f46e5,
      emissiveIntensity: 0.7,
      metalness: 0.6,
      roughness: 0.1
    });
    const crystal = new THREE.Mesh(crystalGeo, crystalMat);
    crystal.position.y = 28;
    lbGroup.add(crystal);
    this.rotators.push({ mesh: crystal, axis: 'y', speed: 0.03 }, { mesh: crystal, axis: 'x', speed: 0.01 });

    // Outer Gyroscope Rings
    const gyroGeo = new THREE.TorusGeometry(26, 2, 12, 32);
    const gyroMat = new THREE.MeshStandardMaterial({ color: 0x818cf8, emissive: 0x6366f1, emissiveIntensity: 0.5 });
    const gyro = new THREE.Mesh(gyroGeo, gyroMat);
    gyro.position.y = 28;
    lbGroup.add(gyro);
    this.rotators.push({ mesh: gyro, axis: 'z', speed: -0.025 });

    const badgeLb = this.createHologramBadge('⚖️ API GATEWAY & BUFFER', 'Token Bucket (250 req/s)', '#6366f1');
    badgeLb.sprite.position.set(0, 75, 0);
    lbGroup.add(badgeLb.sprite);

    this.scene.add(lbGroup);
    this.nodes['lb'] = { group: lbGroup, badge: badgeLb, baseColor: 0x6366f1 };

    // ── 3. WORKER PODS CLUSTER (POD A & POD B) ────────────────
    const buildWorkerPod = (name, x, z, label, colorHex) => {
      const podGroup = new THREE.Group();
      podGroup.position.set(x, 0, z);

      // Server Blade Rack
      const rackGeo = new THREE.BoxGeometry(32, 38, 32);
      const rackMat = new THREE.MeshStandardMaterial({ color: 0x091428, metalness: 0.9, roughness: 0.2 });
      const rack = new THREE.Mesh(rackGeo, rackMat);
      rack.position.y = 19;
      podGroup.add(rack);

      // Glowing LED Blade Slots
      for (let y = 8; y <= 30; y += 7) {
        const ledGeo = new THREE.BoxGeometry(28, 2.5, 33);
        const ledMat = new THREE.MeshBasicMaterial({ color: 0x00f2fe });
        const led = new THREE.Mesh(ledGeo, ledMat);
        led.position.set(0, y, 0);
        podGroup.add(led);
      }

      // Base Neon Ring
      const ringGeo = new THREE.RingGeometry(24, 28, 24);
      const ringMat = new THREE.MeshBasicMaterial({ color: 0x00f2fe, side: THREE.DoubleSide, transparent: true, opacity: 0.4 });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.5;
      podGroup.add(ring);

      const badge = this.createHologramBadge(label, 'Active • Health 100%', colorHex);
      badge.sprite.position.set(0, 65, 0);
      podGroup.add(badge.sprite);

      this.scene.add(podGroup);
      this.nodes[name] = { group: podGroup, badge, rackMat, baseColor: 0x00f2fe };
    };

    buildWorkerPod('podA', -110, 50, '⚡ WORKER POD A', '#38bdf8');
    buildWorkerPod('podB', 110, 50, '⚡ WORKER POD B', '#38bdf8');

    // ── 4. INVENTORY CAS VAULT (CORE PROTECTED RESOURCE) ──────
    const invGroup = new THREE.Group();
    invGroup.position.set(0, 0, -30);

    // Heavy Cybernetic Fortress Base
    const vaultBaseGeo = new THREE.CylinderGeometry(42, 50, 18, 12);
    const vaultBaseMat = new THREE.MeshStandardMaterial({ color: 0x052e16, metalness: 0.9, roughness: 0.2 });
    const vaultBase = new THREE.Mesh(vaultBaseGeo, vaultBaseMat);
    vaultBase.position.y = 9;
    invGroup.add(vaultBase);

    // Inner Glowing Core Cylinder (Stock Safe)
    const coreGeo = new THREE.CylinderGeometry(26, 26, 36, 24);
    const coreMat = new THREE.MeshStandardMaterial({
      color: 0x10b981,
      emissive: 0x059669,
      emissiveIntensity: 0.9,
      metalness: 0.4,
      roughness: 0.1
    });
    const coreMesh = new THREE.Mesh(coreGeo, coreMat);
    coreMesh.position.y = 27;
    invGroup.add(coreMesh);

    // Rotating Outer Security Rings
    const secRingGeo = new THREE.TorusGeometry(34, 3, 12, 32);
    const secRingMat = new THREE.MeshStandardMaterial({ color: 0x34d399, emissive: 0x10b981, emissiveIntensity: 0.6 });
    const secRing = new THREE.Mesh(secRingGeo, secRingMat);
    secRing.position.y = 27;
    invGroup.add(secRing);
    this.rotators.push({ mesh: secRing, axis: 'y', speed: 0.02 }, { mesh: secRing, axis: 'x', speed: 0.015 });

    const badgeInv = this.createHologramBadge('📦 INVENTORY CAS VAULT', 'Stock: 100 Available (Atomic Lock)', '#10b981');
    badgeInv.sprite.position.set(0, 80, 0);
    invGroup.add(badgeInv.sprite);

    this.scene.add(invGroup);
    this.nodes['inventory'] = { group: invGroup, badge: badgeInv, coreMat, baseColor: 0x10b981 };

    // ── 5. PAYMENT GATEWAY ORBITAL ACCELERATOR ────────────────
    const payGroup = new THREE.Group();
    payGroup.position.set(-160, 0, -110);

    const payBaseGeo = new THREE.CylinderGeometry(30, 36, 12, 8);
    const payBaseMat = new THREE.MeshStandardMaterial({ color: 0x451a03, metalness: 0.85, roughness: 0.2 });
    const payBase = new THREE.Mesh(payBaseGeo, payBaseMat);
    payBase.position.y = 6;
    payGroup.add(payBase);

    // Dual Interlocking Torus Rings
    const t1Geo = new THREE.TorusGeometry(22, 3.5, 16, 32);
    const t1Mat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, emissive: 0xd97706, emissiveIntensity: 0.8, metalness: 0.8 });
    const t1 = new THREE.Mesh(t1Geo, t1Mat);
    t1.position.y = 26;
    payGroup.add(t1);
    this.rotators.push({ mesh: t1, axis: 'y', speed: 0.04 }, { mesh: t1, axis: 'z', speed: 0.02 });

    const t2Geo = new THREE.TorusGeometry(16, 2.5, 16, 32);
    const t2Mat = new THREE.MeshStandardMaterial({ color: 0xfbbf24, emissive: 0xf59e0b, emissiveIntensity: 0.9 });
    const t2 = new THREE.Mesh(t2Geo, t2Mat);
    t2.position.y = 26;
    payGroup.add(t2);
    this.rotators.push({ mesh: t2, axis: 'x', speed: -0.035 });

    const badgePay = this.createHologramBadge('💰 PAYMENT GATEWAY', '95% Success • Circuit Breaker', '#f59e0b');
    badgePay.sprite.position.set(0, 75, 0);
    payGroup.add(badgePay.sprite);

    this.scene.add(payGroup);
    this.nodes['payment'] = { group: payGroup, badge: badgePay, t1Mat, baseColor: 0xf59e0b };

    // ── 6. 3D MESSAGE QUEUE CANISTER (KAFKA BUFFER) ───────────
    const queueGroup = new THREE.Group();
    queueGroup.position.set(0, 0, -140);

    const qBaseGeo = new THREE.CylinderGeometry(28, 34, 12, 16);
    const qBaseMat = new THREE.MeshStandardMaterial({ color: 0x500724, metalness: 0.9, roughness: 0.2 });
    const qBase = new THREE.Mesh(qBaseGeo, qBaseMat);
    qBase.position.y = 6;
    queueGroup.add(qBase);

    // Transparent Glass Canister Column
    const tubeGeo = new THREE.CylinderGeometry(20, 20, 95, 24, 1, true);
    const tubeMat = new THREE.MeshPhysicalMaterial({
      color: 0xec4899,
      emissive: 0xdb2777,
      emissiveIntensity: 0.2,
      transparent: true,
      opacity: 0.35,
      roughness: 0.1,
      transmission: 0.95,
      thickness: 1.5
    });
    const tube = new THREE.Mesh(tubeGeo, tubeMat);
    tube.position.y = 55;
    queueGroup.add(tube);
    this.queueContainer = queueGroup;

    // Metal Top Cap
    const capGeo = new THREE.CylinderGeometry(22, 22, 8, 16);
    const cap = new THREE.Mesh(capGeo, qBaseMat);
    cap.position.y = 105;
    queueGroup.add(cap);

    const badgeQueue = this.createHologramBadge('📨 MESSAGE QUEUE (KAFKA)', 'Topic: payment.success (0 Queued)', '#ec4899');
    badgeQueue.sprite.position.set(0, 130, 0);
    queueGroup.add(badgeQueue.sprite);

    this.scene.add(queueGroup);
    this.nodes['queue'] = { group: queueGroup, badge: badgeQueue, baseColor: 0xec4899 };

    // ── 7. ORDER MICROSERVICE WORKERS ─────────────────────────
    const orderGroup = new THREE.Group();
    orderGroup.position.set(160, 0, -110);

    const ordBaseGeo = new THREE.BoxGeometry(40, 12, 40);
    const ordBaseMat = new THREE.MeshStandardMaterial({ color: 0x3b0764, metalness: 0.9, roughness: 0.2 });
    const ordBase = new THREE.Mesh(ordBaseGeo, ordBaseMat);
    ordBase.position.y = 6;
    orderGroup.add(ordBase);

    // Quad Server Cluster Towers
    const towerMat = new THREE.MeshStandardMaterial({ color: 0xa855f7, emissive: 0x7e22ce, emissiveIntensity: 0.6, metalness: 0.8 });
    for (let dx of [-10, 10]) {
      for (let dz of [-10, 10]) {
        const towerGeo = new THREE.BoxGeometry(12, 34, 12);
        const tower = new THREE.Mesh(towerGeo, towerMat);
        tower.position.set(dx, 25, dz);
        orderGroup.add(tower);
      }
    }

    const badgeOrder = this.createHologramBadge('📋 ORDER SERVICE', 'Saga Consumer • DB Outbox', '#a855f7');
    badgeOrder.sprite.position.set(0, 75, 0);
    orderGroup.add(badgeOrder.sprite);

    this.scene.add(orderGroup);
    this.nodes['order'] = { group: orderGroup, badge: badgeOrder, towerMat, baseColor: 0xa855f7 };

    // ── 8. DISTRIBUTED RELATIONAL DATABASE (POSTGRESQL / SQLITE)
    const dbGroup = new THREE.Group();
    dbGroup.position.set(0, 0, -240);

    // Tiered Database Cylinder Disks
    const diskMat = new THREE.MeshStandardMaterial({ color: 0x1e3a8a, emissive: 0x1d4ed8, emissiveIntensity: 0.5, metalness: 0.85 });
    for (let y = 10; y <= 45; y += 16) {
      const diskGeo = new THREE.CylinderGeometry(30, 30, 10, 24);
      const disk = new THREE.Mesh(diskGeo, diskMat);
      disk.position.y = y;
      dbGroup.add(disk);

      // Glowing Cyan Storage Ring
      const ringGeo = new THREE.TorusGeometry(31, 1.5, 8, 32);
      const ringMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = y;
      dbGroup.add(ring);
    }

    const badgeDb = this.createHologramBadge('🗄️ RELATIONAL DATABASE', 'ACID • Unique Constraints', '#3b82f6');
    badgeDb.sprite.position.set(0, 85, 0);
    dbGroup.add(badgeDb.sprite);

    this.scene.add(dbGroup);
    this.nodes['db'] = { group: dbGroup, badge: badgeDb, baseColor: 0x3b82f6 };
  }

  buildDataPipelines() {
    // Pipeline connection definitions
    const paths = [
      [new THREE.Vector3(0, 15, 240), new THREE.Vector3(0, 20, 130)],        // Users -> LB
      [new THREE.Vector3(0, 20, 130), new THREE.Vector3(-110, 20, 50)],      // LB -> Pod A
      [new THREE.Vector3(0, 20, 130), new THREE.Vector3(110, 20, 50)],       // LB -> Pod B
      [new THREE.Vector3(-110, 20, 50), new THREE.Vector3(0, 25, -30)],      // Pod A -> Inventory
      [new THREE.Vector3(110, 20, 50), new THREE.Vector3(0, 25, -30)],       // Pod B -> Inventory
      [new THREE.Vector3(0, 25, -30), new THREE.Vector3(-160, 25, -110)],    // Inventory -> Payment
      [new THREE.Vector3(-160, 25, -110), new THREE.Vector3(0, 30, -140)],  // Payment -> Queue
      [new THREE.Vector3(0, 30, -140), new THREE.Vector3(160, 25, -110)],    // Queue -> Order
      [new THREE.Vector3(160, 25, -110), new THREE.Vector3(0, 25, -240)],   // Order -> DB
    ];

    this.pipelineCurves = [];

    paths.forEach(([start, end]) => {
      const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
      mid.y += 24; // arched trajectory
      const curve = new THREE.QuadraticBezierCurve3(start, mid, end);
      this.pipelineCurves.push(curve);

      // Glowing glass tube
      const tubeGeo = new THREE.TubeGeometry(curve, 32, 2.2, 12, false);
      const tubeMat = new THREE.MeshStandardMaterial({
        color: 0x0284c7,
        emissive: 0x0369a1,
        emissiveIntensity: 0.3,
        transparent: true,
        opacity: 0.45,
        roughness: 0.2
      });
      const tube = new THREE.Mesh(tubeGeo, tubeMat);
      this.scene.add(tube);
    });
  }

  updateQueueDepth(depth) {
    this.queueCount = depth;
    if (this.nodes['queue']?.badge) {
      this.nodes['queue'].badge.updateSubtitle(`Topic: payment.success (${depth} Queued)`);
    }

    const currentCount = this.queueBlocks.length;
    const targetCount = Math.min(depth, 14);

    if (targetCount > currentCount) {
      for (let i = currentCount; i < targetCount; i++) {
        const blockGeo = new THREE.CylinderGeometry(15, 15, 5, 16);
        const blockMat = new THREE.MeshStandardMaterial({
          color: 0xff007f,
          emissive: 0xff007f,
          emissiveIntensity: 0.9,
          metalness: 0.5
        });
        const block = new THREE.Mesh(blockGeo, blockMat);
        block.position.set(0, 16 + i * 6.2, 0);
        this.queueContainer.add(block);
        this.queueBlocks.push(block);
      }
    } else if (targetCount < currentCount) {
      for (let i = currentCount - 1; i >= targetCount; i--) {
        const block = this.queueBlocks.pop();
        if (block) this.queueContainer.remove(block);
      }
    }
  }

  updateInventoryStock(available, reserved, sold) {
    this.stockCount = available;
    if (this.nodes['inventory']?.badge) {
      this.nodes['inventory'].badge.updateSubtitle(`Available: ${available} | Reserved: ${reserved} | Sold: ${sold}`);
    }
  }

  spawnTrafficPulse(intensity = 15, outcome = 'SUCCESS') {
    let color = 0x00f2fe; // cyan
    if (outcome === 'OOS') color = 0xef4444; // red
    if (outcome === 'PAY_FAIL') color = 0xf59e0b; // amber
    if (outcome === 'CONFIRMED') color = 0x10b981; // green

    for (let i = 0; i < intensity; i++) {
      const curve = this.pipelineCurves[Math.floor(Math.random() * this.pipelineCurves.length)];
      const particleGeo = new THREE.SphereGeometry(3.5, 10, 10);
      const particleMat = new THREE.MeshBasicMaterial({ color });
      const particle = new THREE.Mesh(particleGeo, particleMat);

      this.scene.add(particle);
      this.particles.push({
        mesh: particle,
        curve,
        t: Math.random() * 0.15,
        speed: 0.012 + Math.random() * 0.018
      });
    }
  }

  setNodeStatus(nodeName, status) {
    const node = this.nodes[nodeName];
    if (!node) return;

    if (status === 'OFFLINE' || status === 'FAIL') {
      if (node.badge) node.badge.updateSubtitle('⚠ STATUS: OFFLINE (Buffer Active)');
      if (node.towerMat) node.towerMat.emissive.setHex(0xef4444);
    } else {
      if (node.badge) node.badge.updateSubtitle('Active • Saga Consumer');
      if (node.towerMat) node.towerMat.emissive.setHex(0x7e22ce);
    }
  }

  setCameraPreset(preset) {
    switch (preset) {
      case 'OVERVIEW':
        this.flyCamera(0, 360, 560, 0, 10, -20);
        break;
      case 'LOAD_BALANCER':
        this.flyCamera(0, 150, 270, 0, 25, 130);
        break;
      case 'INVENTORY':
        this.flyCamera(0, 140, 110, 0, 30, -30);
        break;
      case 'QUEUE':
        this.flyCamera(0, 170, -20, 0, 45, -140);
        break;
      case 'ORDER':
        this.flyCamera(160, 140, 20, 160, 25, -110);
        break;
    }
  }

  flyCamera(x, y, z, tx, ty, tz) {
    const startPos = { ...this.camera.position };
    const startTime = performance.now();
    const duration = 1000;

    const animateFly = (now) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const ease = progress < 0.5 ? 2 * progress * progress : -1 + (4 - 2 * progress) * progress;

      this.camera.position.x = startPos.x + (x - startPos.x) * ease;
      this.camera.position.y = startPos.y + (y - startPos.y) * ease;
      this.camera.position.z = startPos.z + (z - startPos.z) * ease;
      this.camera.lookAt(tx, ty, tz);

      if (progress < 1) {
        requestAnimationFrame(animateFly);
      }
    };
    requestAnimationFrame(animateFly);
  }

  setupInteractions() {
    const el = this.renderer.domElement;

    el.addEventListener('mousedown', (e) => {
      this.mouse.isDragging = true;
      this.mouse.prevX = e.clientX;
      this.mouse.prevY = e.clientY;
    });

    window.addEventListener('mouseup', () => {
      this.mouse.isDragging = false;
    });

    el.addEventListener('mousemove', (e) => {
      if (!this.mouse.isDragging) return;
      const deltaX = e.clientX - this.mouse.prevX;
      const deltaY = e.clientY - this.mouse.prevY;

      const radius = Math.sqrt(this.camera.position.x ** 2 + this.camera.position.z ** 2);
      let theta = Math.atan2(this.camera.position.x, this.camera.position.z);
      theta -= deltaX * 0.005;

      this.camera.position.x = radius * Math.sin(theta);
      this.camera.position.z = radius * Math.cos(theta);
      this.camera.position.y = Math.max(40, Math.min(700, this.camera.position.y - deltaY * 0.6));
      this.camera.lookAt(0, 20, -20);

      this.mouse.prevX = e.clientX;
      this.mouse.prevY = e.clientY;
    });

    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      const zoomFactor = e.deltaY > 0 ? 1.08 : 0.92;
      this.camera.position.multiplyScalar(zoomFactor);
      this.camera.position.clampLength(120, 1400);
      this.camera.lookAt(0, 20, -20);
    });
  }

  onResize() {
    if (!this.container || !this.renderer || !this.camera) return;
    const width = this.container.clientWidth;
    const height = this.container.clientHeight || 650;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  animate() {
    requestAnimationFrame(() => this.animate());

    const delta = this.clock.getDelta();

    // 1. Rotate sub-meshes
    this.rotators.forEach(r => {
      if (r.mesh) {
        if (r.axis === 'x') r.mesh.rotation.x += r.speed;
        if (r.axis === 'y') r.mesh.rotation.y += r.speed;
        if (r.axis === 'z') r.mesh.rotation.z += r.speed;
      }
    });

    // 2. Animate traffic particles along Bezier curves
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.t += p.speed;
      if (p.t >= 1) {
        this.scene.remove(p.mesh);
        p.mesh.geometry.dispose();
        p.mesh.material.dispose();
        this.particles.splice(i, 1);
      } else {
        const point = p.curve.getPoint(p.t);
        p.mesh.position.copy(point);
      }
    }

    this.renderer.render(this.scene, this.camera);
  }
}

window.Infrastructure3DScene = Infrastructure3DScene;
