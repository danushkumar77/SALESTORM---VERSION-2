# SALESTORM Flash Sale System Design Simulator
## SYSCRAFTERS 2026 — Design-First, AI-Assisted Hackathon

---

## 🚀 Quick Start

```bash
cd salestorm-sim
npm install
node server.js
```

Open **http://localhost:3001** in your browser.

---

## 🏗️ Architecture Overview

```
10,000 Users → CDN/WAF → Load Balancer → API Gateway
                                          ↓
                          ┌───────────────┬───────────────┐
                     Product/Cart/Sale  Inventory      Payment/Order
                          └───────────────┴───────────────┘
                                          ↓
                              Redis Cache │ Message Queue │ SQLite DB
```

---

## 🔑 Key Design Decisions

### 1. Concurrency Control — Optimistic Locking (Version CAS)
```sql
UPDATE inventory
SET available_quantity = available_quantity - 1,
    reserved_quantity  = reserved_quantity + 1,
    version = version + 1,                    -- CAS increment
    updated_at = datetime('now')
WHERE inventory_id = ?
  AND version = ?                             -- CAS check
  AND available_quantity >= 1;               -- guard
```
- If `changes === 0` → another request modified inventory → **retry up to 3 times**
- Prevents overselling without pessimistic locks
- Scales horizontally (no row-level write locks held)

### 2. Idempotency Keys
Every critical operation (reserve, pay, order) accepts an `idempotency_key`:
- Duplicate requests **return the same result** without re-executing
- Prevents double charges, double reservations, double orders
- Implemented via `UNIQUE` constraint on `idempotency_key` columns

### 3. Circuit Breaker (Payment Gateway)
- **CLOSED** → normal operation
- After 5 failures → **OPEN** → reject calls immediately
- After 30s timeout → **HALF_OPEN** → test one request
- On success → back to **CLOSED**

### 4. Reservation TTL
- Reservations expire after **5 minutes** if unpaid
- A background job runs every **10 seconds** to release stale reservations
- Releases both the reservation record and restores `available_quantity`

### 5. Compensation / Saga Pattern
- Payment SUCCESS + Order FAILED → retry with same idempotency key
- Unrecoverable → Dead Letter Queue → manual reconciliation
- Audit log captures every state change for tracing

---

## 📊 API Reference

### Health
```
GET  /api/health
```

### Products & Inventory
```
GET  /api/products                  → list products with inventory
GET  /api/inventory/:productId      → inventory stats
POST /api/inventory/reset           → reset for new simulation
     body: { units: 100 }
```

### Reservations
```
POST   /api/reservations            → reserve inventory
       body: { customerId, productId, quantity, idempotencyKey }
DELETE /api/reservations/:id        → release reservation
GET    /api/reservations            → list recent reservations
```

### Payments
```
POST /api/payments                  → process payment (idempotent)
     body: { reservationId, customerId, amount, idempotencyKey }
POST /api/payments/:id/retry        → retry failed payment
GET  /api/payments                  → list payments with stats
GET  /api/circuit-breaker           → circuit breaker status
POST /api/circuit-breaker/toggle    → open/close breaker
     body: { open: true/false }
```

### Orders
```
POST  /api/orders                   → create order (idempotent)
PATCH /api/orders/:id/state         → advance state machine
      body: { targetState }
GET   /api/orders                   → orders + stats
```

### Simulation
```
POST /api/simulate                  → launch flash sale simulation
     body: { totalRequests: 10000, batchSize: 200 }
GET  /api/simulation/status         → check if simulation running
GET  /api/stats                     → full dashboard stats
GET  /api/audit                     → audit trail (last 200 entries)
```

---

## 🧪 Simulation Results (500 requests, 100 units)

| Metric | Value |
|--------|-------|
| Total Requests | 500 |
| Orders Confirmed | ~85-95 |
| Oversell | ❌ NEVER |
| CAS Operations (version) | ~986 |
| Audit Entries | ~1,539 |
| Idempotent Duplicates | handled |

---

## 📁 File Structure

```
salestorm-sim/
├── server.js                    # Express + WebSocket API server
├── db/
│   ├── database.js              # SQLite init + schema + seed
│   └── schema.sql               # Full database schema
├── services/
│   ├── inventoryService.js      # Optimistic locking CAS
│   ├── paymentService.js        # Idempotent payments + circuit breaker
│   ├── orderService.js          # Order state machine
│   └── simulationService.js     # Flash sale simulation engine
└── public/
    ├── index.html               # Dashboard UI
    ├── style.css                # Premium dark design
    └── app.js                   # WebSocket client + charts
```

---

## 🎓 Design Patterns Used

| Pattern | Where |
|---------|-------|
| **Strategy** | Payment gateway abstraction |
| **State** | Order lifecycle (`CREATED→CONFIRMED→SHIPPED→DELIVERED`) |
| **Observer** | WebSocket broadcasting order events |
| **Repository** | DB access abstracted in service layer |
| **Facade** | Checkout orchestrates inventory+payment+order |
| **Circuit Breaker** | Payment service gateway protection |
| **Saga / Compensation** | Payment success + order failure recovery |

---

## 🔒 SOLID Principles

| Principle | Application |
|-----------|------------|
| **SRP** | inventoryService, paymentService, orderService each handle one domain |
| **OCP** | New payment providers: add new gateway fn, no core changes |
| **LSP** | All service functions return `{ success, reason, data }` |
| **ISP** | Focused APIs per domain, no fat interfaces |
| **DIP** | Services depend on DB abstraction (`getDb()`), not raw SQL |

---

*Built with Express.js · better-sqlite3 · WebSockets · Vanilla JS*
*SYSCRAFTERS 2026 — AI-Assisted Prototype Evidence*
