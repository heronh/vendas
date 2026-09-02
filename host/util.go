package main

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"html/template"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"
)

func env(key, fallback string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return fallback
}

func loadDotEnv() {
	paths := []string{".env"}
	if exe, err := os.Executable(); err == nil {
		paths = append(paths, filepath.Join(filepath.Dir(exe), ".env"))
	}
	for _, p := range paths {
		data, err := os.ReadFile(p)
		if err != nil {
			continue
		}
		for _, line := range strings.Split(string(data), "\n") {
			line = strings.TrimSpace(line)
			if line == "" || strings.HasPrefix(line, "#") {
				continue
			}
			key, val, ok := strings.Cut(line, "=")
			if !ok {
				continue
			}
			key = strings.TrimSpace(key)
			val = strings.TrimSpace(val)
			val = strings.Trim(val, `"'`)
			if key == "" {
				continue
			}
			if _, exists := os.LookupEnv(key); !exists {
				_ = os.Setenv(key, val)
			}
		}
		return
	}
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

func formatQty(q float64) string {
	if q == float64(int64(q)) {
		return strconv.FormatInt(int64(q), 10)
	}
	return strconv.FormatFloat(q, 'f', 1, 64)
}

func hashPassword(plain string) (string, error) {
	b, err := bcrypt.GenerateFromPassword([]byte(plain), bcrypt.DefaultCost)
	if err != nil {
		return "", err
	}
	return string(b), nil
}

func passwordMatch(hash, plain string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(plain)) == nil
}

func isHTTPS(r *http.Request) bool {
	if r.TLS != nil {
		return true
	}
	return strings.EqualFold(r.Header.Get("X-Forwarded-Proto"), "https")
}

func requestBaseURL(r *http.Request) string {
	if u := strings.TrimRight(env("PUBLIC_URL", ""), "/"); u != "" {
		return u
	}
	host := r.Header.Get("X-Forwarded-Host")
	if host == "" {
		host = r.Host
	}
	proto := "http"
	if isHTTPS(r) {
		proto = "https"
	}
	return proto + "://" + host
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

func (s *server) connectHints(r *http.Request) []string {
	base := requestBaseURL(r)
	if strings.HasPrefix(base, "https://") {
		return []string{base}
	}
	return lanURLs(s.port)
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

func periodBounds(period string, now time.Time) (from, to int64, label string) {
	toTime := now
	to = toTime.UnixMilli()
	if period == "30d" {
		return now.Add(-30 * 24 * time.Hour).UnixMilli(), to, "Últimos 30 dias"
	}
	loc := brZone()
	local := now.In(loc)
	start := time.Date(local.Year(), local.Month(), 1, 0, 0, 0, 0, loc)
	return start.UnixMilli(), to, "Mês corrente"
}

func waitForDB(db *sql.DB) error {
	var last error
	for i := 0; i < 30; i++ {
		if err := db.Ping(); err == nil {
			return nil
		} else {
			last = err
		}
		time.Sleep(time.Second)
	}
	return last
}

func parseTemplates() *template.Template {
	return template.Must(template.ParseFS(templateFS, "templates/*.html"))
}

func (s *server) render(w http.ResponseWriter, name string, data any) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	if err := s.tmpl.ExecuteTemplate(w, name, data); err != nil {
		log.Printf("template %s: %v", name, err)
		http.Error(w, "falha ao renderizar a página", http.StatusInternalServerError)
	}
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

func (s *server) sessionState(r *http.Request) string {
	c, err := r.Cookie("host_session")
	if err != nil {
		return ""
	}
	v := s.verify(c.Value)
	if v == sessionOK || v == sessionChange {
		return v
	}
	return ""
}

func (s *server) setSession(w http.ResponseWriter, r *http.Request, state string) {
	http.SetCookie(w, &http.Cookie{
		Name:     "host_session",
		Value:    s.sign(state),
		Path:     "/",
		HttpOnly: true,
		Secure:   isHTTPS(r),
		SameSite: http.SameSiteLaxMode,
		MaxAge:   60 * 60 * 12,
	})
}

func (s *server) clearSession(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{Name: "host_session", Value: "", Path: "/", MaxAge: -1})
}

func (s *server) requirePage(w http.ResponseWriter, r *http.Request) (state string, ok bool) {
	state = s.sessionState(r)
	switch state {
	case sessionOK:
		return state, true
	case sessionChange:
		if r.URL.Path == "/senha" {
			return state, true
		}
		http.Redirect(w, r, "/senha?aviso=1", http.StatusFound)
		return state, false
	default:
		http.Redirect(w, r, "/login", http.StatusFound)
		return "", false
	}
}

func (s *server) page(title, heading, lead, tab, state string) pageBase {
	return pageBase{
		Title:      title,
		Heading:    heading,
		Lead:       lead,
		Tab:        tab,
		MustChange: state == sessionChange,
	}
}

func bearerToken(r *http.Request, bodyToken string) string {
	header := r.Header.Get("Authorization")
	if strings.HasPrefix(header, "Bearer ") {
		if t := strings.TrimSpace(header[7:]); t != "" {
			return t
		}
	}
	return strings.TrimSpace(bodyToken)
}

func decodeJSON(r *http.Request, max int64, dest any) error {
	return json.NewDecoder(io.LimitReader(r.Body, max)).Decode(dest)
}
