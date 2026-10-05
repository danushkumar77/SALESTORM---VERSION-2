-- =============================================================
-- SALESTORM E-Commerce Flash Sale Platform
-- Database Schema (SQLite)
-- SYSCRAFTERS 2026 Hackathon
-- =============================================================

PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS customers (
  customer_id   TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  full_name     TEXT NOT NULL,
  phone         TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime("now")),
  updated_at    TEXT NOT NULL DEFAULT (datetime("now"))
);

CREATE TABLE IF NOT EXISTS categories (
  category_id   TEXT PRIMARY KEY,
  name          TEXT NOT NULL UNIQUE,
  description   TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime("now"))
);

CREATE TABLE IF NOT EXISTS products (
  product_id    TEXT PRIMARY KEY,
  category_id   TEXT REFERENCES categories(category_id),
  name          TEXT NOT NULL,
  description   TEXT,
  base_price    REAL NOT NULL CHECK(base_price >= 0),
  sku           TEXT NOT NULL UNIQUE,
  is_active     INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL DEFAULT (datetime("now")),
  updated_at    TEXT NOT NULL DEFAULT (datetime("now"))
);

CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);

CREATE TABLE IF NOT EXISTS inventory (
  inventory_id        TEXT PRIMARY KEY,
  product_id          TEXT NOT NULL UNIQUE REFERENCES products(product_id),
  available_quantity  INTEGER NOT NULL DEFAULT 0 CHECK(available_quantity >= 0),
  reserved_quantity   INTEGER NOT NULL DEFAULT 0 CHECK(reserved_quantity >= 0),
  sold_quantity       INTEGER NOT NULL DEFAULT 0 CHECK(sold_quantity >= 0),
  version             INTEGER NOT NULL DEFAULT 0,
  updated_at          TEXT NOT NULL DEFAULT (datetime("now"))
);

CREATE TABLE IF NOT EXISTS inventory_reservations (
  reservation_id    TEXT PRIMARY KEY,
  inventory_id      TEXT NOT NULL REFERENCES inventory(inventory_id),
  customer_id       TEXT NOT NULL REFERENCES customers(customer_id),
  product_id        TEXT NOT NULL REFERENCES products(product_id),
  quantity          INTEGER NOT NULL DEFAULT 1 CHECK(quantity > 0),
  idempotency_key   TEXT NOT NULL UNIQUE,
  status            TEXT NOT NULL DEFAULT "RESERVED" CHECK(status IN ("RESERVED","PAYMENT_PENDING","CONFIRMED","RELEASED","EXPIRED")),
  expires_at        TEXT NOT NULL,
  created_at        TEXT NOT NULL DEFAULT (datetime("now")),
  updated_at        TEXT NOT NULL DEFAULT (datetime("now"))
);

CREATE INDEX IF NOT EXISTS idx_reservations_customer  ON inventory_reservations(customer_id);
CREATE INDEX IF NOT EXISTS idx_reservations_status    ON inventory_reservations(status);
CREATE INDEX IF NOT EXISTS idx_reservations_expires   ON inventory_reservations(expires_at);

CREATE TABLE IF NOT EXISTS payments (
  payment_id          TEXT PRIMARY KEY,
  order_id            TEXT,
  reservation_id      TEXT NOT NULL REFERENCES inventory_reservations(reservation_id),
  customer_id         TEXT NOT NULL REFERENCES customers(customer_id),
  idempotency_key     TEXT NOT NULL UNIQUE,
  amount              REAL NOT NULL CHECK(amount > 0),
  currency            TEXT NOT NULL DEFAULT "INR",
  status              TEXT NOT NULL DEFAULT "PENDING" CHECK(status IN ("PENDING","SUCCESS","FAILED","TIMEOUT","REFUNDED")),
  gateway_txn_ref     TEXT,
  failure_reason      TEXT,
  retry_count         INTEGER NOT NULL DEFAULT 0,
  created_at          TEXT NOT NULL DEFAULT (datetime("now")),
  updated_at          TEXT NOT NULL DEFAULT (datetime("now"))
);

CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);

CREATE TABLE IF NOT EXISTS orders (
  order_id        TEXT PRIMARY KEY,
  customer_id     TEXT NOT NULL REFERENCES customers(customer_id),
  payment_id      TEXT REFERENCES payments(payment_id),
  reservation_id  TEXT REFERENCES inventory_reservations(reservation_id),
  status          TEXT NOT NULL DEFAULT "CREATED" CHECK(status IN ("CREATED","PAYMENT_PENDING","CONFIRMED","PROCESSING","SHIPPED","OUT_FOR_DELIVERY","DELIVERED","CANCELLED","FAILED")),
  total_amount    REAL NOT NULL CHECK(total_amount >= 0),
  idempotency_key TEXT NOT NULL UNIQUE,
  failure_reason  TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime("now")),
  updated_at      TEXT NOT NULL DEFAULT (datetime("now"))
);

CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_status   ON orders(status);

CREATE TABLE IF NOT EXISTS order_items (
  order_item_id TEXT PRIMARY KEY,
  order_id      TEXT NOT NULL REFERENCES orders(order_id),
  product_id    TEXT NOT NULL REFERENCES products(product_id),
  quantity      INTEGER NOT NULL DEFAULT 1,
  unit_price    REAL NOT NULL,
  subtotal      REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS shipments (
  shipment_id        TEXT PRIMARY KEY,
  order_id           TEXT NOT NULL REFERENCES orders(order_id),
  tracking_number    TEXT UNIQUE,
  carrier            TEXT,
  status             TEXT NOT NULL DEFAULT "PENDING" CHECK(status IN ("PENDING","DISPATCHED","IN_TRANSIT","OUT_FOR_DELIVERY","DELIVERED","RETURNED")),
  estimated_delivery TEXT,
  delivered_at       TEXT,
  created_at         TEXT NOT NULL DEFAULT (datetime("now")),
  updated_at         TEXT NOT NULL DEFAULT (datetime("now"))
);

CREATE TABLE IF NOT EXISTS notifications (
  notification_id TEXT PRIMARY KEY,
  customer_id     TEXT NOT NULL REFERENCES customers(customer_id),
  order_id        TEXT REFERENCES orders(order_id),
  type            TEXT NOT NULL,
  channel         TEXT NOT NULL DEFAULT "EMAIL",
  message         TEXT NOT NULL,
  sent_at         TEXT,
  status          TEXT NOT NULL DEFAULT "PENDING",
  created_at      TEXT NOT NULL DEFAULT (datetime("now"))
);

CREATE TABLE IF NOT EXISTS audit_log (
  log_id        TEXT PRIMARY KEY,
  entity_type   TEXT NOT NULL,
  entity_id     TEXT NOT NULL,
  action        TEXT NOT NULL,
  old_state     TEXT,
  new_state     TEXT,
  actor         TEXT,
  metadata      TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime("now"))
);

CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity_type, entity_id);
