-- Controle de Vendas · Cloud SQL (Postgres)
-- Aplicado automaticamente em host/main.go (migrate) na subida do Cloud Run.

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  description TEXT NOT NULL,
  supplier TEXT NOT NULL DEFAULT '',
  cost_price_cents BIGINT NOT NULL DEFAULT 0,
  sale_price_cents BIGINT NOT NULL DEFAULT 0,
  barcode TEXT NOT NULL DEFAULT '',
  image_data_url TEXT,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  source TEXT NOT NULL DEFAULT 'phone'
);

CREATE TABLE IF NOT EXISTS clients (
  id TEXT PRIMARY KEY,
  full_name TEXT NOT NULL DEFAULT '',
  trade_name TEXT NOT NULL DEFAULT '',
  company TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  cep TEXT NOT NULL DEFAULT '',
  street TEXT NOT NULL DEFAULT '',
  neighborhood TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  state TEXT NOT NULL DEFAULT '',
  number TEXT NOT NULL DEFAULT '',
  complement TEXT NOT NULL DEFAULT '',
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS sales (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  product_id TEXT,
  product_description TEXT NOT NULL DEFAULT '',
  quantity DOUBLE PRECISION NOT NULL DEFAULT 0,
  unit_price_cents BIGINT NOT NULL DEFAULT 0,
  total_cents BIGINT NOT NULL DEFAULT 0,
  occurred_at BIGINT NOT NULL,
  created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  amount_cents BIGINT NOT NULL DEFAULT 0,
  occurred_at BIGINT NOT NULL,
  notes TEXT,
  created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS device_tokens (
  token TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS clients_full_name_idx ON clients (full_name);
CREATE INDEX IF NOT EXISTS products_barcode_idx ON products (barcode);
CREATE INDEX IF NOT EXISTS sales_client_id_idx ON sales (client_id);
CREATE INDEX IF NOT EXISTS sales_occurred_at_idx ON sales (occurred_at);
CREATE INDEX IF NOT EXISTS payments_client_id_idx ON payments (client_id);
CREATE INDEX IF NOT EXISTS payments_occurred_at_idx ON payments (occurred_at);
