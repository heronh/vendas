package main

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"html/template"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib"
)

const defaultPort = 3847

type Product struct {
	ID              string  `json:"id"`
	Description     string  `json:"description"`
	Supplier        string  `json:"supplier"`
	CostPriceCents  int64   `json:"costPriceCents"`
	SalePriceCents  int64   `json:"salePriceCents"`
	Barcode         string  `json:"barcode"`
	ImageDataURL    *string `json:"imageDataUrl,omitempty"`
	CreatedAt       int64   `json:"createdAt"`
	UpdatedAt       int64   `json:"updatedAt"`
	Source          string  `json:"source,omitempty"`
}

type Client struct {
	ID           string `json:"id"`
	FullName     string `json:"fullName"`
	TradeName    string `json:"tradeName"`
	Company      string `json:"company"`
	Phone        string `json:"phone"`
	Email        string `json:"email"`
	CEP          string `json:"cep"`
	Street       string `json:"street"`
	Neighborhood string `json:"neighborhood"`
	City         string `json:"city"`
	State        string `json:"state"`
	Number       string `json:"number"`
	Complement   string `json:"complement"`
	CreatedAt    int64  `json:"createdAt"`
	UpdatedAt    int64  `json:"updatedAt"`
}

type Sale struct {
	ID                 string  `json:"id"`
	ClientID           string  `json:"clientId"`
	ProductID          *string `json:"productId,omitempty"`
	ProductDescription string  `json:"productDescription"`
	Quantity           float64 `json:"quantity"`
	UnitPriceCents     int64   `json:"unitPriceCents"`
	TotalCents         int64   `json:"totalCents"`
	OccurredAt         int64   `json:"occurredAt"`
	CreatedAt          int64   `json:"createdAt"`
}

type Payment struct {
	ID          string  `json:"id"`
	ClientID    string  `json:"clientId"`
	AmountCents int64   `json:"amountCents"`
	OccurredAt  int64   `json:"occurredAt"`
	Notes       *string `json:"notes,omitempty"`
	CreatedAt   int64   `json:"createdAt"`
}

type syncBody struct {
	Token    string    `json:"token"`
	Code     string    `json:"code"`
	Clients  []Client  `json:"clients"`
	Products []Product `json:"products"`
	Sales    []Sale    `json:"sales"`
	Payments []Payment `json:"payments"`
}

type server struct {
	db           *sql.DB
	port         int
	password     string
	sessionKey   []byte
	pairingCode  string
	tokensMu     sync.Mutex
	tokens       map[string]struct{}
	loginTmpl    *template.Template
	productsTmpl *template.Template
}

func main() {
	ctx := context.Background()
	dsn := env("DATABASE_URL", "postgres://vendas:vendas@127.0.0.1:5432/vendas?sslmode=disable")
	password := env("HOST_PASSWORD", "altere-esta-senha")
	port := envInt("PORT", defaultPort)

	db, err := sql.Open("pgx", dsn)
	if err != nil {
		log.Fatalf("banco: %v", err)
	}
	defer db.Close()
	if err := waitForDB(ctx, db); err != nil {
		log.Fatalf("postgres indisponível: %v", err)
	}
	if err := migrate(ctx, db); err != nil {
		log.Fatalf("migração: %v", err)
	}

	s := &server{
		db:          db,
		port:        port,
		password:    password,
		sessionKey:  sessionSecret(),
		pairingCode: sixDigitCode(),
		tokens:      map[string]struct{}{},
		loginTmpl:   template.Must(template.New("login").Parse(loginHTML)),
		productsTmpl: template.Must(template.New("products").Funcs(template.FuncMap{
			"money": formatBRL,
			"src":   sourceLabel,
		}).Parse(productsHTML)),
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/", s.handleHome)
	mux.HandleFunc("/login", s.handleLogin)
	mux.HandleFunc("/logout", s.handleLogout)
	mux.HandleFunc("/products", s.handleProducts)
	mux.HandleFunc("/api/discover", s.handleDiscover)
	mux.HandleFunc("/api/pair", s.handlePair)
	mux.HandleFunc("/api/sync", s.handleSync)

	addr := fmt.Sprintf("0.0.0.0:%d", port)
	httpServer := &http.Server{Addr: addr, Handler: withCORS(mux)}
	log.Println("Servidor Controle de Vendas (Go + Postgres)")
	log.Printf("Código de pareamento: %s", s.pairingCode)
	log.Printf("Porta: %d", port)
	for _, ip := range lanAddresses() {
		log.Printf("http://%s:%d", ip, port)
	}
	if err := httpServer.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatal(err)
	}
}

func waitForDB(ctx context.Context, db *sql.DB) error {
	var last error
	for i := 0; i < 30; i++ {
		if err := db.PingContext(ctx); err == nil {
			return nil
		} else {
			last = err
		}
		time.Sleep(time.Second)
	}
	return last
}

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
`)
	return err
}

func (s *server) handleHome(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != "/" {
		http.NotFound(w, r)
		return
	}
	if !s.loggedIn(r) {
		http.Redirect(w, r, "/login", http.StatusFound)
		return
	}
	http.Redirect(w, r, "/products", http.StatusFound)
}

func (s *server) handleLogin(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodGet {
		_ = s.loginTmpl.Execute(w, map[string]any{"Error": r.URL.Query().Get("erro") == "1"})
		return
	}
	if r.Method != http.MethodPost {
		http.Error(w, "método não permitido", http.StatusMethodNotAllowed)
		return
	}
	if err := r.ParseForm(); err != nil {
		http.Redirect(w, r, "/login?erro=1", http.StatusSeeOther)
		return
	}
	got := r.FormValue("password")
	if subtle.ConstantTimeCompare([]byte(got), []byte(s.password)) != 1 {
		http.Redirect(w, r, "/login?erro=1", http.StatusSeeOther)
		return
	}
	http.SetCookie(w, &http.Cookie{
		Name:     "host_session",
		Value:    s.sign("ok"),
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   60 * 60 * 12,
	})
	http.Redirect(w, r, "/products", http.StatusSeeOther)
}

func (s *server) handleLogout(w http.ResponseWriter, r *http.Request) {
	http.SetCookie(w, &http.Cookie{Name: "host_session", Value: "", Path: "/", MaxAge: -1})
	http.Redirect(w, r, "/login", http.StatusSeeOther)
}

func (s *server) handleProducts(w http.ResponseWriter, r *http.Request) {
	if !s.loggedIn(r) {
		http.Redirect(w, r, "/login", http.StatusFound)
		return
	}
	ctx := r.Context()
	if r.Method == http.MethodPost {
		if err := r.ParseForm(); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		now := time.Now().UnixMilli()
		p := Product{
			ID:             newID(),
			Description:    strings.TrimSpace(r.FormValue("description")),
			Supplier:       strings.TrimSpace(r.FormValue("supplier")),
			CostPriceCents: parseReais(r.FormValue("cost")),
			SalePriceCents: parseReais(r.FormValue("sale")),
			Barcode:        strings.TrimSpace(r.FormValue("barcode")),
			CreatedAt:      now,
			UpdatedAt:      now,
			Source:         "local",
		}
		if p.Description == "" {
			http.Redirect(w, r, "/products?erro=descricao", http.StatusSeeOther)
			return
		}
		if err := upsertProducts(ctx, s.db, []Product{p}, "local"); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		http.Redirect(w, r, "/products", http.StatusSeeOther)
		return
	}
	products, err := listProducts(ctx, s.db)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	_ = s.productsTmpl.Execute(w, map[string]any{
		"Products":    products,
		"PairingCode": s.pairingCode,
		"Addresses":   lanURLs(s.port),
		"Error":       r.URL.Query().Get("erro") == "descricao",
	})
}

func (s *server) handleDiscover(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"app": "vendas-beauty-brasil-host", "port": s.port})
}

func (s *server) handlePair(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"ok": false, "error": "método inválido"})
		return
	}
	var body struct {
		Code string `json:"code"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, 1<<20)).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"ok": false, "error": "JSON inválido"})
		return
	}
	if strings.TrimSpace(body.Code) != s.pairingCode {
		writeJSON(w, http.StatusUnauthorized, map[string]any{"ok": false, "error": "Código inválido"})
		return
	}
	token := randomHex(24)
	s.tokensMu.Lock()
	s.tokens[token] = struct{}{}
	s.tokensMu.Unlock()
	_, _ = s.db.ExecContext(r.Context(), `INSERT INTO device_tokens (token) VALUES ($1) ON CONFLICT DO NOTHING`, token)
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "token": token})
}

func (s *server) handleSync(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"ok": false, "error": "método inválido"})
		return
	}
	var body syncBody
	if err := json.NewDecoder(io.LimitReader(r.Body, 32<<20)).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"ok": false, "error": "JSON inválido"})
		return
	}
	if !s.authorize(r, body.Token, body.Code) {
		writeJSON(w, http.StatusUnauthorized, map[string]any{"ok": false, "error": "Código inválido"})
		return
	}
	ctx := r.Context()
	if err := upsertClients(ctx, s.db, body.Clients); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"ok": false, "error": err.Error()})
		return
	}
	if err := upsertProducts(ctx, s.db, body.Products, "phone"); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"ok": false, "error": err.Error()})
		return
	}
	if err := upsertSales(ctx, s.db, body.Sales); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"ok": false, "error": err.Error()})
		return
	}
	if err := upsertPayments(ctx, s.db, body.Payments); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"ok": false, "error": err.Error()})
		return
	}
	products, err := listProducts(ctx, s.db)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"ok": false, "error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "products": products})
}

func (s *server) authorize(r *http.Request, bodyToken, code string) bool {
	header := r.Header.Get("Authorization")
	bearer := ""
	if strings.HasPrefix(header, "Bearer ") {
		bearer = strings.TrimSpace(header[7:])
	}
	token := bearer
	if token == "" {
		token = strings.TrimSpace(bodyToken)
	}
	if token != "" && s.tokenOK(r.Context(), token) {
		return true
	}
	return strings.TrimSpace(code) == s.pairingCode
}

func (s *server) tokenOK(ctx context.Context, token string) bool {
	s.tokensMu.Lock()
	_, ok := s.tokens[token]
	s.tokensMu.Unlock()
	if ok {
		return true
	}
	var one int
	err := s.db.QueryRowContext(ctx, `SELECT 1 FROM device_tokens WHERE token = $1`, token).Scan(&one)
	if err == nil {
		s.tokensMu.Lock()
		s.tokens[token] = struct{}{}
		s.tokensMu.Unlock()
		return true
	}
	return false
}

func (s *server) loggedIn(r *http.Request) bool {
	c, err := r.Cookie("host_session")
	if err != nil {
		return false
	}
	return s.verify(c.Value) == "ok"
}

func (s *server) sign(value string) string {
	mac := hmac.New(sha256.New, s.sessionKey)
	mac.Write([]byte(value))
	return value + "." + hex.EncodeToString(mac.Sum(nil))
}

func (s *server) verify(signed string) string {
	i := strings.LastIndex(signed, ".")
	if i < 0 {
		return ""
	}
	value, sigHex := signed[:i], signed[i+1:]
	mac := hmac.New(sha256.New, s.sessionKey)
	mac.Write([]byte(value))
	want := mac.Sum(nil)
	got, err := hex.DecodeString(sigHex)
	if err != nil || !hmac.Equal(got, want) {
		return ""
	}
	return value
}

func upsertProducts(ctx context.Context, db *sql.DB, items []Product, source string) error {
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
		src := source
		if item.Source != "" {
			src = item.Source
		}
		var image any
		if item.ImageDataURL != nil && *item.ImageDataURL != "" {
			image = *item.ImageDataURL
		}
		_, err := db.ExecContext(ctx, `
INSERT INTO products (id, description, supplier, cost_price_cents, sale_price_cents, barcode, image_data_url, created_at, updated_at, source)
VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
ON CONFLICT (id) DO UPDATE SET
  description = EXCLUDED.description,
  supplier = EXCLUDED.supplier,
  cost_price_cents = EXCLUDED.cost_price_cents,
  sale_price_cents = EXCLUDED.sale_price_cents,
  barcode = EXCLUDED.barcode,
  image_data_url = COALESCE(EXCLUDED.image_data_url, products.image_data_url),
  updated_at = EXCLUDED.updated_at,
  source = CASE WHEN products.source = 'local' THEN products.source ELSE EXCLUDED.source END
`, item.ID, item.Description, item.Supplier, item.CostPriceCents, item.SalePriceCents, item.Barcode, image, item.CreatedAt, item.UpdatedAt, src)
		if err != nil {
			return err
		}
	}
	return nil
}

func upsertClients(ctx context.Context, db *sql.DB, items []Client) error {
	for _, item := range items {
		if item.ID == "" {
			continue
		}
		_, err := db.ExecContext(ctx, `
INSERT INTO clients (id, full_name, trade_name, company, phone, email, cep, street, neighborhood, city, state, number, complement, created_at, updated_at)
VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
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
  updated_at = EXCLUDED.updated_at
`, item.ID, item.FullName, item.TradeName, item.Company, item.Phone, item.Email, item.CEP, item.Street, item.Neighborhood, item.City, item.State, item.Number, item.Complement, item.CreatedAt, item.UpdatedAt)
		if err != nil {
			return err
		}
	}
	return nil
}

func upsertSales(ctx context.Context, db *sql.DB, items []Sale) error {
	for _, item := range items {
		if item.ID == "" {
			continue
		}
		var productID any
		if item.ProductID != nil && *item.ProductID != "" {
			productID = *item.ProductID
		}
		_, err := db.ExecContext(ctx, `
INSERT INTO sales (id, client_id, product_id, product_description, quantity, unit_price_cents, total_cents, occurred_at, created_at)
VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
ON CONFLICT (id) DO UPDATE SET
  client_id = EXCLUDED.client_id,
  product_id = EXCLUDED.product_id,
  product_description = EXCLUDED.product_description,
  quantity = EXCLUDED.quantity,
  unit_price_cents = EXCLUDED.unit_price_cents,
  total_cents = EXCLUDED.total_cents,
  occurred_at = EXCLUDED.occurred_at
`, item.ID, item.ClientID, productID, item.ProductDescription, item.Quantity, item.UnitPriceCents, item.TotalCents, item.OccurredAt, item.CreatedAt)
		if err != nil {
			return err
		}
	}
	return nil
}

func upsertPayments(ctx context.Context, db *sql.DB, items []Payment) error {
	for _, item := range items {
		if item.ID == "" {
			continue
		}
		var notes any
		if item.Notes != nil {
			notes = *item.Notes
		}
		_, err := db.ExecContext(ctx, `
INSERT INTO payments (id, client_id, amount_cents, occurred_at, notes, created_at)
VALUES ($1,$2,$3,$4,$5,$6)
ON CONFLICT (id) DO UPDATE SET
  client_id = EXCLUDED.client_id,
  amount_cents = EXCLUDED.amount_cents,
  occurred_at = EXCLUDED.occurred_at,
  notes = EXCLUDED.notes
`, item.ID, item.ClientID, item.AmountCents, item.OccurredAt, notes, item.CreatedAt)
		if err != nil {
			return err
		}
	}
	return nil
}

func listProducts(ctx context.Context, db *sql.DB) ([]Product, error) {
	rows, err := db.QueryContext(ctx, `
SELECT id, description, supplier, cost_price_cents, sale_price_cents, barcode, image_data_url, created_at, updated_at, source
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
		if err := rows.Scan(&p.ID, &p.Description, &p.Supplier, &p.CostPriceCents, &p.SalePriceCents, &p.Barcode, &image, &p.CreatedAt, &p.UpdatedAt, &p.Source); err != nil {
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

func withCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

func env(key, fallback string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return fallback
}

func envInt(key string, fallback int) int {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		n, err := strconv.Atoi(v)
		if err == nil {
			return n
		}
	}
	return fallback
}

func sessionSecret() []byte {
	if v := strings.TrimSpace(os.Getenv("SESSION_SECRET")); v != "" {
		return []byte(v)
	}
	b := make([]byte, 32)
	_, _ = rand.Read(b)
	return b
}

func sixDigitCode() string {
	b := make([]byte, 4)
	_, _ = rand.Read(b)
	n := int(b[0])<<24 | int(b[1])<<16 | int(b[2])<<8 | int(b[3])
	if n < 0 {
		n = -n
	}
	return fmt.Sprintf("%06d", n%1_000_000)
}

func newID() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	b[6] = (b[6] & 0x0f) | 0x40
	b[8] = (b[8] & 0x3f) | 0x80
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:])
}

func randomHex(n int) string {
	b := make([]byte, n)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

func parseReais(raw string) int64 {
	s := strings.TrimSpace(strings.ReplaceAll(raw, ",", "."))
	if s == "" {
		return 0
	}
	f, err := strconv.ParseFloat(s, 64)
	if err != nil {
		return 0
	}
	return int64(f*100 + 0.5)
}

func formatBRL(cents int64) string {
	neg := cents < 0
	if neg {
		cents = -cents
	}
	reais := cents / 100
	frac := cents % 100
	out := fmt.Sprintf("R$ %d,%02d", reais, frac)
	if neg {
		return "-" + out
	}
	return out
}

func sourceLabel(src string) string {
	if src == "local" {
		return "Criado no servidor"
	}
	return "Celular"
}

func lanAddresses() []string {
	var found []string
	ifaces, _ := net.Interfaces()
	for _, iface := range ifaces {
		addrs, _ := iface.Addrs()
		for _, addr := range addrs {
			ip, ok := addr.(*net.IPNet)
			if !ok || ip.IP.IsLoopback() || ip.IP.To4() == nil {
				continue
			}
			found = append(found, ip.IP.String())
		}
	}
	return found
}

func lanURLs(port int) []string {
	var urls []string
	for _, ip := range lanAddresses() {
		urls = append(urls, fmt.Sprintf("http://%s:%d", ip, port))
	}
	if len(urls) == 0 {
		urls = append(urls, fmt.Sprintf("http://127.0.0.1:%d", port))
	}
	return urls
}

const loginHTML = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Entrar · Controle de Vendas</title>
  <style>
    body { font-family: Georgia, serif; background: #f4efe6; color: #2a2118; margin: 0; min-height: 100vh; display: grid; place-items: center; }
    form { background: #fffdf8; border: 1px solid #e4d8c8; padding: 28px 24px; width: min(360px, 92vw); }
    h1 { font-size: 1.25rem; margin: 0 0 8px; }
    p { color: #6d6256; font-size: 0.95rem; }
    label { display: block; text-align: left; margin: 16px 0 6px; font-size: 0.9rem; }
    input { width: 100%; box-sizing: border-box; padding: 10px 12px; font-size: 1rem; border: 1px solid #cbbba8; background: #fff; }
    button { margin-top: 18px; width: 100%; padding: 10px; background: #1e2a3a; color: #fff; border: 0; cursor: pointer; font-size: 1rem; }
    .err { color: #8a2a22; }
  </style>
</head>
<body>
  <form method="post" action="/login">
    <h1>Beauty Brasil SJC · Host</h1>
    <p>Digite a senha do servidor para continuar.</p>
    {{if .Error}}<p class="err">Senha inválida.</p>{{end}}
    <label for="password">Senha</label>
    <input id="password" name="password" type="password" required autofocus />
    <button type="submit">Entrar</button>
  </form>
</body>
</html>`

const productsHTML = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Produtos · Controle de Vendas</title>
  <style>
    body { font-family: Georgia, serif; background: #f4efe6; color: #2a2118; margin: 0; padding: 24px 16px 48px; }
    header { display: flex; justify-content: space-between; gap: 16px; align-items: baseline; flex-wrap: wrap; }
    a { color: #1e2a3a; }
    .code { font-size: 2.2rem; letter-spacing: 0.2em; font-weight: 700; margin: 8px 0 0; }
    .panel { background: #fffdf8; border: 1px solid #e4d8c8; padding: 18px; margin: 18px 0; }
    form.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 10px; align-items: end; }
    label { display: block; font-size: 0.85rem; margin-bottom: 4px; }
    input { width: 100%; box-sizing: border-box; padding: 8px; border: 1px solid #cbbba8; }
    button { padding: 9px 14px; background: #1e2a3a; color: #fff; border: 0; cursor: pointer; }
    table { width: 100%; border-collapse: collapse; }
    th, td { text-align: left; padding: 8px 6px; border-bottom: 1px solid #eadfce; vertical-align: top; }
    .muted { color: #6d6256; font-size: 0.9rem; }
    .err { color: #8a2a22; }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>Produtos</h1>
      <p class="muted">Lista local e recebida dos celulares Android (iOS ainda sem app).</p>
    </div>
    <a href="/logout">Sair</a>
  </header>
  <div class="panel">
    <p class="muted">Código para cadastrar o celular na mesma Wi-Fi:</p>
    <div class="code">{{.PairingCode}}</div>
    {{range .Addresses}}<code>{{.}}</code><br>{{end}}
  </div>
  <div class="panel">
    <h2>Novo produto no servidor</h2>
    {{if .Error}}<p class="err">Informe a descrição.</p>{{end}}
    <form class="grid" method="post" action="/products">
      <div><label>Descrição</label><input name="description" required /></div>
      <div><label>Fornecedor</label><input name="supplier" /></div>
      <div><label>Custo (R$)</label><input name="cost" inputmode="decimal" /></div>
      <div><label>Venda (R$)</label><input name="sale" inputmode="decimal" /></div>
      <div><label>Código de barras</label><input name="barcode" /></div>
      <div><button type="submit">Salvar</button></div>
    </form>
  </div>
  <div class="panel">
    <h2>Catálogo ({{len .Products}})</h2>
    {{if .Products}}
    <table>
      <thead><tr><th>Descrição</th><th>Fornecedor</th><th>Venda</th><th>Barras</th><th>Origem</th></tr></thead>
      <tbody>
        {{range .Products}}
        <tr>
          <td>{{.Description}}</td>
          <td>{{.Supplier}}</td>
          <td>{{money .SalePriceCents}}</td>
          <td>{{.Barcode}}</td>
          <td>{{src .Source}}</td>
        </tr>
        {{end}}
      </tbody>
    </table>
    {{else}}
    <p class="muted">Nenhum produto ainda. Cadastre acima ou sincronize um celular.</p>
    {{end}}
  </div>
</body>
</html>`
