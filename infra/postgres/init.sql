-- ============================================================
-- ShopFlow - PostgreSQL Initialization Script
-- ARCHITECT NOTE: In Phase 1, we run one database with separate
-- schemas per service. In production (Phase 2+), each microservice
-- gets its OWN database — this is the "Database-per-Service" pattern
-- which gives true data isolation and independent scaling.
-- For Phase 1, one DB with separate schemas is fine for learning.
-- ============================================================

-- Create the shared user (run as postgres superuser)
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'shopflow') THEN
    CREATE ROLE shopflow WITH LOGIN PASSWORD 'shopflow123';
  END IF;
END
$$;

-- ─────────────────────────────────────────────────────────────
-- USER SERVICE DATABASE
-- ─────────────────────────────────────────────────────────────
CREATE DATABASE shopflow_users OWNER shopflow;

\connect shopflow_users

GRANT ALL PRIVILEGES ON DATABASE shopflow_users TO shopflow;

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  name          VARCHAR(255) NOT NULL,
  email         VARCHAR(255) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for fast email lookups (used in login)
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO shopflow;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO shopflow;

-- ─────────────────────────────────────────────────────────────
-- PRODUCT SERVICE DATABASE
-- ─────────────────────────────────────────────────────────────
\connect postgres
CREATE DATABASE shopflow_products OWNER shopflow;

\connect shopflow_products

GRANT ALL PRIVILEGES ON DATABASE shopflow_products TO shopflow;

CREATE TABLE IF NOT EXISTS products (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(255) NOT NULL,
  description TEXT,
  price       DECIMAL(10, 2) NOT NULL CHECK (price >= 0),
  stock       INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  category    VARCHAR(100),
  image_url   TEXT,
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_stock ON products(stock);

-- Seed some sample products
INSERT INTO products (name, description, price, stock, category, image_url) VALUES
  ('Wireless Headphones', 'Premium noise-cancelling headphones with 30h battery', 89.99, 50, 'Electronics', 'https://placehold.co/400x400?text=Headphones'),
  ('Mechanical Keyboard', 'TKL gaming keyboard with Cherry MX switches', 129.99, 30, 'Electronics', 'https://placehold.co/400x400?text=Keyboard'),
  ('Running Shoes', 'Lightweight marathon running shoes, sizes 6-13', 65.00, 100, 'Footwear', 'https://placehold.co/400x400?text=Shoes'),
  ('Coffee Maker', '12-cup programmable drip coffee maker', 49.99, 25, 'Appliances', 'https://placehold.co/400x400?text=Coffee'),
  ('Yoga Mat', 'Non-slip 6mm thick yoga mat with carry strap', 35.00, 75, 'Fitness', 'https://placehold.co/400x400?text=YogaMat')
ON CONFLICT DO NOTHING;

GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO shopflow;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO shopflow;

-- ─────────────────────────────────────────────────────────────
-- ORDER SERVICE DATABASE
-- ─────────────────────────────────────────────────────────────
\connect postgres
CREATE DATABASE shopflow_orders OWNER shopflow;

\connect shopflow_orders

GRANT ALL PRIVILEGES ON DATABASE shopflow_orders TO shopflow;

CREATE TABLE IF NOT EXISTS orders (
  id           SERIAL PRIMARY KEY,
  user_id      INTEGER NOT NULL,      -- references user-service DB (no FK across DBs!)
  total_amount DECIMAL(10, 2) NOT NULL,
  status       VARCHAR(50) NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'confirmed', 'shipped', 'delivered', 'cancelled')),
  created_at   TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at   TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ARCHITECT NOTE: Notice there's NO foreign key to users or products tables.
-- Each service owns its own data. Cross-service references are by ID only.
-- This is intentional — it enforces service boundary isolation.

CREATE TABLE IF NOT EXISTS order_items (
  id           SERIAL PRIMARY KEY,
  order_id     INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id   INTEGER NOT NULL,      -- references product-service DB (no FK!)
  product_name VARCHAR(255) NOT NULL, -- denormalized for historical accuracy
  quantity     INTEGER NOT NULL CHECK (quantity > 0),
  unit_price   DECIMAL(10, 2) NOT NULL,
  created_at   TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);

GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO shopflow;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO shopflow;

\connect postgres
\echo '✅ ShopFlow databases initialized successfully!'
