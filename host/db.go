package main

import (
	"context"
	"database/sql"
	"sort"
	"strings"
	"time"
)

func migrate(ctx context.Context, db *sql.DB) error {
	_, err := db.ExecContext(ctx, `
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
CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  token TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  professional TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  password_reset BOOLEAN NOT NULL DEFAULT FALSE,
  paired_at BIGINT NOT NULL,
  last_sync_at BIGINT
);
CREATE TABLE IF NOT EXISTS host_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE products ADD COLUMN IF NOT EXISTS device_id TEXT NOT NULL DEFAULT '';
ALTER TABLE clients ADD COLUMN IF NOT EXISTS device_id TEXT NOT NULL DEFAULT '';
ALTER TABLE sales ADD COLUMN IF NOT EXISTS device_id TEXT NOT NULL DEFAULT '';
ALTER TABLE payments ADD COLUMN IF NOT EXISTS device_id TEXT NOT NULL DEFAULT '';
ALTER TABLE devices ADD COLUMN IF NOT EXISTS email TEXT NOT NULL DEFAULT '';
CREATE UNIQUE INDEX IF NOT EXISTS devices_email_lower ON devices (lower(email)) WHERE email <> '';
INSERT INTO devices (id, token, name, professional, email, enabled, password_reset, paired_at)
SELECT token, token, '', '', '', FALSE, FALSE, (EXTRACT(EPOCH FROM created_at) * 1000)::BIGINT
FROM device_tokens
ON CONFLICT (token) DO NOTHING;
CREATE TABLE IF NOT EXISTS companies (
  id TEXT PRIMARY KEY,
  legal_name TEXT NOT NULL DEFAULT '',
  trade_name TEXT NOT NULL DEFAULT '',
  cnpj TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  state TEXT NOT NULL DEFAULT '',
  signature TEXT NOT NULL UNIQUE,
  hash_hex TEXT NOT NULL DEFAULT '',
  owner_user_id TEXT NOT NULL DEFAULT '',
  created_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL DEFAULT '',
  display_name TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL DEFAULT '',
  mode TEXT NOT NULL DEFAULT 'stand_alone',
  company_id TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT '',
  license_status TEXT NOT NULL DEFAULT 'pending',
  deleted_from_group_at BIGINT,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower ON users (lower(email)) WHERE email <> '';
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ
);
ALTER TABLE devices ADD COLUMN IF NOT EXISTS user_id TEXT NOT NULL DEFAULT '';
ALTER TABLE devices ADD COLUMN IF NOT EXISTS company_id TEXT NOT NULL DEFAULT '';
ALTER TABLE products ADD COLUMN IF NOT EXISTS company_id TEXT NOT NULL DEFAULT '';
ALTER TABLE products ADD COLUMN IF NOT EXISTS user_id TEXT NOT NULL DEFAULT '';
ALTER TABLE clients ADD COLUMN IF NOT EXISTS user_id TEXT NOT NULL DEFAULT '';
ALTER TABLE sales ADD COLUMN IF NOT EXISTS user_id TEXT NOT NULL DEFAULT '';
ALTER TABLE payments ADD COLUMN IF NOT EXISTS user_id TEXT NOT NULL DEFAULT '';
INSERT INTO users (id, email, display_name, phone, password_hash, mode, company_id, role, license_status, created_at, updated_at)
SELECT DISTINCT ON (lower(d.email))
  d.id, d.email, d.professional, '', '',
  'connected', '', '',
  CASE WHEN d.enabled THEN 'paid' ELSE 'pending' END,
  d.paired_at, d.paired_at
FROM devices d
WHERE d.email <> ''
  AND NOT EXISTS (SELECT 1 FROM users u WHERE lower(u.email) = lower(d.email))
ORDER BY lower(d.email), d.paired_at ASC;
UPDATE devices d SET user_id = u.id
FROM users u
WHERE lower(d.email) = lower(u.email) AND d.email <> '' AND d.user_id = '';
UPDATE products p SET user_id = d.user_id FROM devices d WHERE p.device_id = d.id AND p.user_id = '' AND d.user_id <> '';
UPDATE clients c SET user_id = d.user_id FROM devices d WHERE c.device_id = d.id AND c.user_id = '' AND d.user_id <> '';
UPDATE sales s SET user_id = d.user_id FROM devices d WHERE s.device_id = d.id AND s.user_id = '' AND d.user_id <> '';
UPDATE payments p SET user_id = d.user_id FROM devices d WHERE p.device_id = d.id AND p.user_id = '' AND d.user_id <> '';
ALTER TABLE companies ADD COLUMN IF NOT EXISTS enabled BOOLEAN NOT NULL DEFAULT TRUE;
`)
	return err
}

func (s *server) ensurePassword(ctx context.Context) error {
	var hash string
	err := s.db.QueryRowContext(ctx, `SELECT value FROM host_settings WHERE key = 'password_hash'`).Scan(&hash)
	if err == nil {
		return nil
	}
	if err != sql.ErrNoRows {
		return err
	}
	hashed, err := hashPassword(s.bootstrapPassword)
	if err != nil {
		return err
	}
	_, err = s.db.ExecContext(ctx, `
INSERT INTO host_settings (key, value) VALUES ('password_hash', $1)
ON CONFLICT (key) DO NOTHING
`, hashed)
	return err
}

func (s *server) passwordHash(ctx context.Context) (string, error) {
	var hash string
	err := s.db.QueryRowContext(ctx, `SELECT value FROM host_settings WHERE key = 'password_hash'`).Scan(&hash)
	return hash, err
}

func (s *server) ensureSuPassword(ctx context.Context) error {
	var hash string
	err := s.db.QueryRowContext(ctx, `SELECT value FROM host_settings WHERE key = 'su_password_hash'`).Scan(&hash)
	if err == nil {
		return nil
	}
	if err != sql.ErrNoRows {
		return err
	}
	hashed, err := hashPassword(s.suPassword)
	if err != nil {
		return err
	}
	_, err = s.db.ExecContext(ctx, `
INSERT INTO host_settings (key, value) VALUES ('su_password_hash', $1)
ON CONFLICT (key) DO NOTHING
`, hashed)
	return err
}

func (s *server) suPasswordHash(ctx context.Context) (string, error) {
	var hash string
	err := s.db.QueryRowContext(ctx, `SELECT value FROM host_settings WHERE key = 'su_password_hash'`).Scan(&hash)
	return hash, err
}

func (s *server) setSuPasswordHash(ctx context.Context, hash string) error {
	_, err := s.db.ExecContext(ctx, `
INSERT INTO host_settings (key, value, updated_at) VALUES ('su_password_hash', $1, NOW())
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
`, hash)
	return err
}

func (s *server) setPasswordHash(ctx context.Context, hash string) error {
	_, err := s.db.ExecContext(ctx, `
INSERT INTO host_settings (key, value, updated_at) VALUES ('password_hash', $1, NOW())
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
`, hash)
	return err
}

func scanDevice(scanner interface{ Scan(dest ...any) error }) (Device, error) {
	var d Device
	err := scanner.Scan(
		&d.ID, &d.Token, &d.Name, &d.Professional, &d.Email, &d.Enabled, &d.PasswordReset, &d.PairedAt, &d.LastSyncAt,
		&d.UserID, &d.CompanyID, &d.Mode, &d.Role, &d.LicenseStatus, &d.DeletedFromGroupAt,
	)
	return d, err
}

const deviceSelect = `
SELECT d.id, d.token, d.name, d.professional, d.email, d.enabled, d.password_reset, d.paired_at, COALESCE(d.last_sync_at, 0),
  COALESCE(d.user_id, ''), COALESCE(d.company_id, ''),
  COALESCE(u.mode, ''), COALESCE(u.role, ''), COALESCE(u.license_status, ''), COALESCE(u.deleted_from_group_at, 0)
FROM devices d
LEFT JOIN users u ON u.id = d.user_id
`

func (s *server) listDevices(ctx context.Context) ([]Device, error) {
	rows, err := s.db.QueryContext(ctx, deviceSelect+` ORDER BY d.enabled ASC, d.paired_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Device
	for rows.Next() {
		d, err := scanDevice(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, d)
	}
	if out == nil {
		out = []Device{}
	}
	return out, rows.Err()
}

func (s *server) getDevice(ctx context.Context, id string) (Device, error) {
	return scanDevice(s.db.QueryRowContext(ctx, deviceSelect+` WHERE d.id = $1`, id))
}

func (s *server) deviceByToken(ctx context.Context, token string) (Device, error) {
	return scanDevice(s.db.QueryRowContext(ctx, deviceSelect+` WHERE d.token = $1`, token))
}

func (s *server) deviceByEmail(ctx context.Context, email string) (Device, error) {
	email = normalizeEmail(email)
	if email == "" {
		return Device{}, sql.ErrNoRows
	}
	return scanDevice(s.db.QueryRowContext(ctx, deviceSelect+` WHERE lower(d.email) = $1 AND d.email <> ''`, email))
}

func (s *server) insertDevice(ctx context.Context, d Device) error {
	_, err := s.db.ExecContext(ctx, `
INSERT INTO devices (id, token, name, professional, email, enabled, password_reset, paired_at, user_id, company_id)
VALUES ($1,$2,$3,$4,$5,$6,FALSE,$7,$8,$9)
`, d.ID, d.Token, d.Name, d.Professional, normalizeEmail(d.Email), d.Enabled, d.PairedAt, d.UserID, d.CompanyID)
	if err != nil {
		return err
	}
	_, _ = s.db.ExecContext(ctx, `INSERT INTO device_tokens (token) VALUES ($1) ON CONFLICT DO NOTHING`, d.Token)
	return nil
}

func (s *server) reissueDevice(ctx context.Context, id, token, name, professional, email, userID, companyID string, enabled bool) error {
	_, err := s.db.ExecContext(ctx, `
UPDATE devices
SET token = $2,
    name = CASE WHEN $3 = '' THEN name ELSE $3 END,
    professional = CASE WHEN $4 = '' THEN professional ELSE $4 END,
    email = CASE WHEN $5 = '' THEN email ELSE $5 END,
    user_id = CASE WHEN $6 = '' THEN user_id ELSE $6 END,
    company_id = $7,
    enabled = $8
WHERE id = $1
`, id, token, strings.TrimSpace(name), strings.TrimSpace(professional), normalizeEmail(email), userID, companyID, enabled)
	if err != nil {
		return err
	}
	_, _ = s.db.ExecContext(ctx, `INSERT INTO device_tokens (token) VALUES ($1) ON CONFLICT DO NOTHING`, token)
	return nil
}

func (s *server) setDeviceEnabled(ctx context.Context, id string, enabled bool) error {
	_, err := s.db.ExecContext(ctx, `UPDATE devices SET enabled = $2 WHERE id = $1`, id, enabled)
	return err
}

func (s *server) setDevicePasswordReset(ctx context.Context, id string, reset bool) error {
	_, err := s.db.ExecContext(ctx, `UPDATE devices SET password_reset = $2 WHERE id = $1`, id, reset)
	return err
}

func (s *server) updateDeviceAfterSync(ctx context.Context, id, name, professional, email string, clearReset bool) error {
	_, err := s.db.ExecContext(ctx, `
UPDATE devices
SET name = CASE WHEN $2 = '' THEN name ELSE $2 END,
    professional = CASE WHEN $3 = '' THEN professional ELSE $3 END,
    email = CASE WHEN $4 = '' THEN email ELSE $4 END,
    password_reset = CASE WHEN $5 THEN FALSE ELSE password_reset END,
    last_sync_at = $6
WHERE id = $1
`, id, strings.TrimSpace(name), strings.TrimSpace(professional), normalizeEmail(email), clearReset, time.Now().UnixMilli())
	return err
}

type productRow struct {
	Description string
	Supplier    string
	Sale        string
	Barcode     string
	Origin      string
}

func (s *server) listProductRows(ctx context.Context) ([]productRow, error) {
	rows, err := s.db.QueryContext(ctx, `
SELECT p.description, p.supplier, p.sale_price_cents, p.barcode, p.source, p.device_id,
       COALESCE(d.name, ''), COALESCE(d.professional, ''), COALESCE(d.email, '')
FROM products p
LEFT JOIN devices d ON d.id = p.device_id
ORDER BY p.description ASC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []productRow
	for rows.Next() {
		var description, supplier, barcode, source, deviceID, dName, dProf, dEmail string
		var sale int64
		if err := rows.Scan(&description, &supplier, &sale, &barcode, &source, &deviceID, &dName, &dProf, &dEmail); err != nil {
			return nil, err
		}
		out = append(out, productRow{
			Description: description,
			Supplier:    supplier,
			Sale:        formatBRL(sale),
			Barcode:     barcode,
			Origin:      originLabel(source, deviceID, dName, dProf, dEmail),
		})
	}
	if out == nil {
		out = []productRow{}
	}
	return out, rows.Err()
}

func listProducts(ctx context.Context, db *sql.DB) ([]Product, error) {
	rows, err := db.QueryContext(ctx, `
SELECT id, description, supplier, cost_price_cents, sale_price_cents, barcode, image_data_url, created_at, updated_at, source, device_id,
  COALESCE(company_id, ''), COALESCE(user_id, '')
FROM products
ORDER BY description ASC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Product
	for rows.Next() {
		var p Product
		var image sql.NullString
		if err := rows.Scan(&p.ID, &p.Description, &p.Supplier, &p.CostPriceCents, &p.SalePriceCents, &p.Barcode, &image, &p.CreatedAt, &p.UpdatedAt, &p.Source, &p.DeviceID, &p.CompanyID, &p.UserID); err != nil {
			return nil, err
		}
		if image.Valid {
			p.ImageDataURL = &image.String
		}
		out = append(out, p)
	}
	if out == nil {
		out = []Product{}
	}
	return out, rows.Err()
}

func listProductsForAccount(ctx context.Context, db *sql.DB, companyID, userID string) ([]Product, error) {
	all, err := listProducts(ctx, db)
	if err != nil {
		return nil, err
	}
	var out []Product
	for _, p := range all {
		if companyID != "" {
			if p.CompanyID == companyID {
				out = append(out, p)
			}
			continue
		}
		if userID != "" && p.UserID == userID && p.CompanyID == "" {
			out = append(out, p)
		}
	}
	if out == nil {
		out = []Product{}
	}
	return out, nil
}

type clientRow struct {
	ID      string
	Name    string
	Origin  string
	Balance string
}

func (s *server) listClientRows(ctx context.Context, q, deviceID string) ([]clientRow, error) {
	rows, err := s.db.QueryContext(ctx, `
SELECT c.id, c.full_name, COALESCE(d.name, ''), COALESCE(d.professional, ''), COALESCE(d.email, ''),
  COALESCE((SELECT SUM(total_cents) FROM sales s WHERE s.client_id = c.id), 0)
  - COALESCE((SELECT SUM(amount_cents) FROM payments p WHERE p.client_id = c.id), 0) AS balance
FROM clients c
JOIN devices d ON d.id = c.device_id AND d.enabled = TRUE
WHERE ($1 = '' OR c.full_name ILIKE '%' || $1 || '%' OR c.trade_name ILIKE '%' || $1 || '%')
  AND ($2 = '' OR c.device_id = $2)
ORDER BY c.full_name ASC`, q, deviceID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []clientRow
	for rows.Next() {
		var id, name, dName, dProf, dEmail string
		var balance int64
		if err := rows.Scan(&id, &name, &dName, &dProf, &dEmail, &balance); err != nil {
			return nil, err
		}
		out = append(out, clientRow{ID: id, Name: name, Origin: userLabel(dEmail, dProf, dName), Balance: formatBRL(balance)})
	}
	if out == nil {
		out = []clientRow{}
	}
	return out, rows.Err()
}

type clientDetail struct {
	Client        Client
	Origin        string
	Balance       int64
	SalesTotal    int64
	PaymentsTotal int64
	Contact       string
	Ledger        []ledgerRow
}

type ledgerRow struct {
	When   string
	Kind   string
	Detail string
	Amount string
	at     int64
}

func (s *server) getClientDetail(ctx context.Context, id string) (clientDetail, error) {
	var d clientDetail
	var dName, dProf, dEmail string
	err := s.db.QueryRowContext(ctx, `
SELECT c.id, c.full_name, c.trade_name, c.company, c.phone, c.email, c.cep, c.street, c.neighborhood, c.city, c.state, c.number, c.complement, c.created_at, c.updated_at, c.device_id,
       COALESCE(d.name, ''), COALESCE(d.professional, ''), COALESCE(d.email, '')
FROM clients c
LEFT JOIN devices d ON d.id = c.device_id
WHERE c.id = $1`, id).Scan(
		&d.Client.ID, &d.Client.FullName, &d.Client.TradeName, &d.Client.Company, &d.Client.Phone, &d.Client.Email,
		&d.Client.CEP, &d.Client.Street, &d.Client.Neighborhood, &d.Client.City, &d.Client.State, &d.Client.Number, &d.Client.Complement,
		&d.Client.CreatedAt, &d.Client.UpdatedAt, &d.Client.DeviceID, &dName, &dProf, &dEmail)
	if err != nil {
		return d, err
	}
	d.Origin = userLabel(dEmail, dProf, dName)
	_ = s.db.QueryRowContext(ctx, `SELECT COALESCE(SUM(total_cents),0) FROM sales WHERE client_id = $1`, id).Scan(&d.SalesTotal)
	_ = s.db.QueryRowContext(ctx, `SELECT COALESCE(SUM(amount_cents),0) FROM payments WHERE client_id = $1`, id).Scan(&d.PaymentsTotal)
	d.Balance = d.SalesTotal - d.PaymentsTotal
	d.Contact = clientContact(d.Client)
	d.Ledger, err = s.clientLedger(ctx, id)
	return d, err
}

func clientContact(c Client) string {
	var parts []string
	if p := strings.TrimSpace(c.Phone); p != "" {
		parts = append(parts, "Telefone "+p)
	}
	if c.City != "" && c.State != "" {
		parts = append(parts, c.City+"/"+c.State)
	} else if c.City != "" {
		parts = append(parts, c.City)
	}
	if len(parts) == 0 {
		return "Sem telefone ou cidade no cadastro."
	}
	return strings.Join(parts, " · ")
}

func (s *server) clientLedger(ctx context.Context, clientID string) ([]ledgerRow, error) {
	var out []ledgerRow
	sales, err := s.db.QueryContext(ctx, `
SELECT occurred_at, product_description, quantity, total_cents
FROM sales WHERE client_id = $1`, clientID)
	if err != nil {
		return nil, err
	}
	defer sales.Close()
	for sales.Next() {
		var at int64
		var desc string
		var qty float64
		var total int64
		if err := sales.Scan(&at, &desc, &qty, &total); err != nil {
			return nil, err
		}
		detail := desc
		if qty != 0 {
			detail = desc + " × " + formatQty(qty)
		}
		out = append(out, ledgerRow{When: formatWhen(at), Kind: "Venda", Detail: detail, Amount: formatBRL(total), at: at})
	}
	if err := sales.Err(); err != nil {
		return nil, err
	}
	pays, err := s.db.QueryContext(ctx, `
SELECT occurred_at, COALESCE(notes, ''), amount_cents
FROM payments WHERE client_id = $1`, clientID)
	if err != nil {
		return nil, err
	}
	defer pays.Close()
	for pays.Next() {
		var at int64
		var notes string
		var amount int64
		if err := pays.Scan(&at, &notes, &amount); err != nil {
			return nil, err
		}
		if strings.TrimSpace(notes) == "" {
			notes = "Pagamento"
		}
		out = append(out, ledgerRow{When: formatWhen(at), Kind: "Pagamento", Detail: notes, Amount: formatBRL(amount), at: at})
	}
	if err := pays.Err(); err != nil {
		return nil, err
	}
	sort.Slice(out, func(i, j int) bool { return out[i].at > out[j].at })
	if out == nil {
		out = []ledgerRow{}
	}
	return out, nil
}

type dashStats struct {
	PendingCount int
	PendingNames string
	ClientCount  int
	MonthSales   int64
	ProductCount int
}

func (s *server) dashboard(ctx context.Context) (dashStats, error) {
	var d dashStats
	_ = s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM devices WHERE enabled = FALSE`).Scan(&d.PendingCount)
	rows, err := s.db.QueryContext(ctx, `SELECT name, professional, email FROM devices WHERE enabled = FALSE ORDER BY paired_at DESC`)
	if err != nil {
		return d, err
	}
	var names []string
	for rows.Next() {
		var name, prof, email string
		if err := rows.Scan(&name, &prof, &email); err != nil {
			rows.Close()
			return d, err
		}
		names = append(names, userLabel(email, prof, name))
	}
	rows.Close()
	d.PendingNames = strings.Join(names, " · ")
	_ = s.db.QueryRowContext(ctx, `
SELECT COUNT(*) FROM clients c
JOIN devices d ON d.id = c.device_id AND d.enabled = TRUE`).Scan(&d.ClientCount)
	from, _, _ := periodBounds("mes", time.Now())
	_ = s.db.QueryRowContext(ctx, `
SELECT COALESCE(SUM(s.total_cents), 0) FROM sales s
JOIN devices d ON d.id = s.device_id AND d.enabled = TRUE
WHERE s.occurred_at >= $1`, from).Scan(&d.MonthSales)
	_ = s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM products`).Scan(&d.ProductCount)
	return d, nil
}

type rankRow struct {
	Name         string
	Origin       string
	Amount       string
	PeriodAmount string
	Balance      string
	cents        int64
}

type productRankRow struct {
	Name     string
	Quantity string
	Amount   string
}

type reportView struct {
	SalesTotal    int64
	PaymentsTotal int64
	EnabledCount  int
	Debtors       []rankRow
	Products      []productRankRow
	Ranking       []rankRow
}

func (s *server) reportData(ctx context.Context, period, deviceID string) (reportView, error) {
	var out reportView
	from, to, _ := periodBounds(period, time.Now())
	deviceFilter := ""
	args := []any{from, to}
	if deviceID != "" {
		deviceFilter = " AND s.device_id = $3 "
		args = append(args, deviceID)
	}
	qSales := `
SELECT COALESCE(SUM(s.total_cents), 0) FROM sales s
JOIN devices d ON d.id = s.device_id AND d.enabled = TRUE
WHERE s.occurred_at >= $1 AND s.occurred_at <= $2` + deviceFilter
	if err := s.db.QueryRowContext(ctx, qSales, args...).Scan(&out.SalesTotal); err != nil {
		return out, err
	}
	payFilter := ""
	payArgs := []any{from, to}
	if deviceID != "" {
		payFilter = " AND p.device_id = $3 "
		payArgs = append(payArgs, deviceID)
	}
	qPay := `
SELECT COALESCE(SUM(p.amount_cents), 0) FROM payments p
JOIN devices d ON d.id = p.device_id AND d.enabled = TRUE
WHERE p.occurred_at >= $1 AND p.occurred_at <= $2` + payFilter
	if err := s.db.QueryRowContext(ctx, qPay, payArgs...).Scan(&out.PaymentsTotal); err != nil {
		return out, err
	}
	if deviceID == "" {
		_ = s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM devices WHERE enabled = TRUE`).Scan(&out.EnabledCount)
	} else {
		out.EnabledCount = 1
	}

	debtSQL := `
SELECT c.full_name, COALESCE(d.name,''), COALESCE(d.professional,''), COALESCE(d.email,''),
  COALESCE((SELECT SUM(total_cents) FROM sales s WHERE s.client_id = c.id), 0)
  - COALESCE((SELECT SUM(amount_cents) FROM payments p WHERE p.client_id = c.id), 0) AS balance
FROM clients c
JOIN devices d ON d.id = c.device_id AND d.enabled = TRUE
WHERE ($1 = '' OR c.device_id = $1)
ORDER BY balance DESC`
	drows, err := s.db.QueryContext(ctx, debtSQL, deviceID)
	if err != nil {
		return out, err
	}
	defer drows.Close()
	for drows.Next() {
		var name, dName, dProf, dEmail string
		var balance int64
		if err := drows.Scan(&name, &dName, &dProf, &dEmail, &balance); err != nil {
			return out, err
		}
		if balance <= 0 {
			continue
		}
		out.Debtors = append(out.Debtors, rankRow{Name: name, Origin: userLabel(dEmail, dProf, dName), Amount: formatBRL(balance), Balance: formatBRL(balance), cents: balance})
		if len(out.Debtors) >= 10 {
			break
		}
	}

	prodSQL := `
SELECT s.product_description, SUM(s.quantity), SUM(s.total_cents)
FROM sales s
JOIN devices d ON d.id = s.device_id AND d.enabled = TRUE
WHERE s.occurred_at >= $1 AND s.occurred_at <= $2` + deviceFilter + `
GROUP BY s.product_description
ORDER BY SUM(s.total_cents) DESC
LIMIT 10`
	prows, err := s.db.QueryContext(ctx, prodSQL, args...)
	if err != nil {
		return out, err
	}
	defer prows.Close()
	for prows.Next() {
		var name string
		var qty float64
		var total int64
		if err := prows.Scan(&name, &qty, &total); err != nil {
			return out, err
		}
		out.Products = append(out.Products, productRankRow{Name: name, Quantity: formatQty(qty), Amount: formatBRL(total)})
	}

	rankSQL := `
SELECT c.full_name,
  COALESCE((SELECT SUM(s.total_cents) FROM sales s WHERE s.client_id = c.id AND s.occurred_at >= $1 AND s.occurred_at <= $2), 0) AS period_sales,
  COALESCE((SELECT SUM(s.total_cents) FROM sales s WHERE s.client_id = c.id), 0)
  - COALESCE((SELECT SUM(p.amount_cents) FROM payments p WHERE p.client_id = c.id), 0) AS balance
FROM clients c
JOIN devices d ON d.id = c.device_id AND d.enabled = TRUE
WHERE ($3 = '' OR c.device_id = $3)
ORDER BY period_sales DESC, c.full_name ASC`
	rrows, err := s.db.QueryContext(ctx, rankSQL, from, to, deviceID)
	if err != nil {
		return out, err
	}
	defer rrows.Close()
	for rrows.Next() {
		var name string
		var periodSales, balance int64
		if err := rrows.Scan(&name, &periodSales, &balance); err != nil {
			return out, err
		}
		out.Ranking = append(out.Ranking, rankRow{
			Name:         name,
			PeriodAmount: formatBRL(periodSales),
			Balance:      formatBRL(balance),
		})
	}
	if out.Debtors == nil {
		out.Debtors = []rankRow{}
	}
	if out.Products == nil {
		out.Products = []productRankRow{}
	}
	if out.Ranking == nil {
		out.Ranking = []rankRow{}
	}
	return out, nil
}

func listClientsByUser(ctx context.Context, db *sql.DB, userID, deviceID string) ([]Client, error) {
	rows, err := db.QueryContext(ctx, `
SELECT id, full_name, trade_name, company, phone, email, cep, street, neighborhood, city, state, number, complement, created_at, updated_at, device_id, COALESCE(user_id, '')
FROM clients WHERE ($1 <> '' AND user_id = $1) OR device_id = $2
ORDER BY full_name ASC`, userID, deviceID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Client
	for rows.Next() {
		var c Client
		if err := rows.Scan(&c.ID, &c.FullName, &c.TradeName, &c.Company, &c.Phone, &c.Email, &c.CEP, &c.Street, &c.Neighborhood, &c.City, &c.State, &c.Number, &c.Complement, &c.CreatedAt, &c.UpdatedAt, &c.DeviceID, &c.UserID); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	if out == nil {
		out = []Client{}
	}
	return out, rows.Err()
}

func listSalesByUser(ctx context.Context, db *sql.DB, userID, deviceID string) ([]Sale, error) {
	rows, err := db.QueryContext(ctx, `
SELECT id, client_id, product_id, product_description, quantity, unit_price_cents, total_cents, occurred_at, created_at, device_id, COALESCE(user_id, '')
FROM sales WHERE ($1 <> '' AND user_id = $1) OR device_id = $2
ORDER BY occurred_at ASC`, userID, deviceID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Sale
	for rows.Next() {
		var item Sale
		var productID sql.NullString
		if err := rows.Scan(&item.ID, &item.ClientID, &productID, &item.ProductDescription, &item.Quantity, &item.UnitPriceCents, &item.TotalCents, &item.OccurredAt, &item.CreatedAt, &item.DeviceID, &item.UserID); err != nil {
			return nil, err
		}
		if productID.Valid {
			item.ProductID = &productID.String
		}
		out = append(out, item)
	}
	if out == nil {
		out = []Sale{}
	}
	return out, rows.Err()
}

func listPaymentsByUser(ctx context.Context, db *sql.DB, userID, deviceID string) ([]Payment, error) {
	rows, err := db.QueryContext(ctx, `
SELECT id, client_id, amount_cents, occurred_at, notes, created_at, device_id, COALESCE(user_id, '')
FROM payments WHERE ($1 <> '' AND user_id = $1) OR device_id = $2
ORDER BY occurred_at ASC`, userID, deviceID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Payment
	for rows.Next() {
		var item Payment
		var notes sql.NullString
		if err := rows.Scan(&item.ID, &item.ClientID, &item.AmountCents, &item.OccurredAt, &notes, &item.CreatedAt, &item.DeviceID, &item.UserID); err != nil {
			return nil, err
		}
		if notes.Valid {
			item.Notes = &notes.String
		}
		out = append(out, item)
	}
	if out == nil {
		out = []Payment{}
	}
	return out, rows.Err()
}

func upsertProducts(ctx context.Context, db *sql.DB, items []Product, source, deviceID, companyID, userID string) error {
	admin := source == "local"
	for _, item := range items {
		if item.ID == "" {
			continue
		}
		now := time.Now().UnixMilli()
		if item.CreatedAt == 0 {
			item.CreatedAt = now
		}
		if item.UpdatedAt == 0 {
			item.UpdatedAt = now
		}
		var image any
		if item.ImageDataURL != nil && *item.ImageDataURL != "" {
			image = *item.ImageDataURL
		}
		conflict := `
ON CONFLICT (id) DO UPDATE SET
  description = EXCLUDED.description,
  supplier = EXCLUDED.supplier,
  cost_price_cents = EXCLUDED.cost_price_cents,
  sale_price_cents = EXCLUDED.sale_price_cents,
  barcode = EXCLUDED.barcode,
  image_data_url = COALESCE(EXCLUDED.image_data_url, products.image_data_url),
  updated_at = EXCLUDED.updated_at,
  source = products.source,
  device_id = products.device_id,
  company_id = CASE WHEN products.company_id = '' THEN EXCLUDED.company_id ELSE products.company_id END,
  user_id = CASE WHEN products.user_id = '' THEN EXCLUDED.user_id ELSE products.user_id END
WHERE products.source <> 'local' AND (
  (EXCLUDED.company_id <> '' AND products.company_id = EXCLUDED.company_id) OR
  (EXCLUDED.company_id = '' AND products.user_id = EXCLUDED.user_id)
)`
		if admin {
			conflict = `
ON CONFLICT (id) DO UPDATE SET
  description = EXCLUDED.description,
  supplier = EXCLUDED.supplier,
  cost_price_cents = EXCLUDED.cost_price_cents,
  sale_price_cents = EXCLUDED.sale_price_cents,
  barcode = EXCLUDED.barcode,
  image_data_url = COALESCE(EXCLUDED.image_data_url, products.image_data_url),
  updated_at = EXCLUDED.updated_at,
  source = 'local',
  device_id = products.device_id`
		}
		_, err := db.ExecContext(ctx, `
INSERT INTO products (id, description, supplier, cost_price_cents, sale_price_cents, barcode, image_data_url, created_at, updated_at, source, device_id, company_id, user_id)
VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
`+conflict, item.ID, item.Description, item.Supplier, item.CostPriceCents, item.SalePriceCents, item.Barcode, image, item.CreatedAt, item.UpdatedAt, source, deviceID, companyID, userID)
		if err != nil {
			return err
		}
	}
	return nil
}

func upsertClients(ctx context.Context, db *sql.DB, items []Client, deviceID, userID string) error {
	for _, item := range items {
		if item.ID == "" {
			continue
		}
		_, err := db.ExecContext(ctx, `
INSERT INTO clients (id, full_name, trade_name, company, phone, email, cep, street, neighborhood, city, state, number, complement, created_at, updated_at, device_id, user_id)
VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
ON CONFLICT (id) DO UPDATE SET
  full_name = EXCLUDED.full_name,
  trade_name = EXCLUDED.trade_name,
  company = EXCLUDED.company,
  phone = EXCLUDED.phone,
  email = EXCLUDED.email,
  cep = EXCLUDED.cep,
  street = EXCLUDED.street,
  neighborhood = EXCLUDED.neighborhood,
  city = EXCLUDED.city,
  state = EXCLUDED.state,
  number = EXCLUDED.number,
  complement = EXCLUDED.complement,
  updated_at = EXCLUDED.updated_at,
  user_id = CASE WHEN clients.user_id = '' THEN EXCLUDED.user_id ELSE clients.user_id END
WHERE clients.device_id = EXCLUDED.device_id OR clients.user_id = EXCLUDED.user_id
`, item.ID, item.FullName, item.TradeName, item.Company, item.Phone, item.Email, item.CEP, item.Street, item.Neighborhood, item.City, item.State, item.Number, item.Complement, item.CreatedAt, item.UpdatedAt, deviceID, userID)
		if err != nil {
			return err
		}
	}
	return nil
}

func upsertSales(ctx context.Context, db *sql.DB, items []Sale, deviceID, userID string) error {
	for _, item := range items {
		if item.ID == "" {
			continue
		}
		var productID any
		if item.ProductID != nil && *item.ProductID != "" {
			productID = *item.ProductID
		}
		_, err := db.ExecContext(ctx, `
INSERT INTO sales (id, client_id, product_id, product_description, quantity, unit_price_cents, total_cents, occurred_at, created_at, device_id, user_id)
VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
ON CONFLICT (id) DO UPDATE SET
  client_id = EXCLUDED.client_id,
  product_id = EXCLUDED.product_id,
  product_description = EXCLUDED.product_description,
  quantity = EXCLUDED.quantity,
  unit_price_cents = EXCLUDED.unit_price_cents,
  total_cents = EXCLUDED.total_cents,
  occurred_at = EXCLUDED.occurred_at,
  user_id = CASE WHEN sales.user_id = '' THEN EXCLUDED.user_id ELSE sales.user_id END
WHERE sales.device_id = EXCLUDED.device_id OR sales.user_id = EXCLUDED.user_id
`, item.ID, item.ClientID, productID, item.ProductDescription, item.Quantity, item.UnitPriceCents, item.TotalCents, item.OccurredAt, item.CreatedAt, deviceID, userID)
		if err != nil {
			return err
		}
	}
	return nil
}

func upsertPayments(ctx context.Context, db *sql.DB, items []Payment, deviceID, userID string) error {
	for _, item := range items {
		if item.ID == "" {
			continue
		}
		var notes any
		if item.Notes != nil {
			notes = *item.Notes
		}
		_, err := db.ExecContext(ctx, `
INSERT INTO payments (id, client_id, amount_cents, occurred_at, notes, created_at, device_id, user_id)
VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
ON CONFLICT (id) DO UPDATE SET
  client_id = EXCLUDED.client_id,
  amount_cents = EXCLUDED.amount_cents,
  occurred_at = EXCLUDED.occurred_at,
  notes = EXCLUDED.notes,
  user_id = CASE WHEN payments.user_id = '' THEN EXCLUDED.user_id ELSE payments.user_id END
WHERE payments.device_id = EXCLUDED.device_id OR payments.user_id = EXCLUDED.user_id
`, item.ID, item.ClientID, item.AmountCents, item.OccurredAt, notes, item.CreatedAt, deviceID, userID)
		if err != nil {
			return err
		}
	}
	return nil
}
