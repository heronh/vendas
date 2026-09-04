package main

import (
	"context"
	"database/sql"
	"embed"
	"errors"
	"fmt"
	"html/template"
	"log"
	"net/http"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib"
)

//go:embed templates/*.html
var templateFS embed.FS

//go:embed static/app.css
var staticFS embed.FS

type server struct {
	db                *sql.DB
	port              int
	bootstrapPassword string
	suPassword        string
	sessionKey        []byte
	pairingCode       string
	tmpl              *template.Template
}

func main() {
	loadDotEnv()
	ctx := context.Background()
	dsn := env("DATABASE_URL", "")
	if dsn == "" {
		log.Fatal("defina DATABASE_URL com o Postgres remoto (Cloud SQL). O host não usa banco local.")
	}
	password := env("HOST_PASSWORD", defaultPassword)
	suPassword := env("SU_PASSWORD", defaultSuPassword)
	port := envInt("PORT", defaultPort)

	db, err := sql.Open("pgx", dsn)
	if err != nil {
		log.Fatalf("banco: %v", err)
	}
	defer db.Close()
	if err := waitForDB(db); err != nil {
		log.Fatalf("postgres indisponível: %v", err)
	}
	if err := migrate(ctx, db); err != nil {
		log.Fatalf("migração: %v", err)
	}

	db.SetMaxOpenConns(5)
	db.SetMaxIdleConns(2)
	db.SetConnMaxLifetime(30 * time.Minute)

	pairing := env("PAIRING_CODE", "")
	if pairing == "" {
		pairing = sixDigitCode()
	}

	s := &server{
		db:                db,
		port:              port,
		bootstrapPassword: password,
		suPassword:        suPassword,
		sessionKey:        sessionSecret(),
		pairingCode:       pairing,
		tmpl:              parseTemplates(),
	}
	if err := s.ensurePassword(ctx); err != nil {
		log.Fatalf("senha inicial: %v", err)
	}
	if err := s.ensureSuPassword(ctx); err != nil {
		log.Fatalf("senha SU inicial: %v", err)
	}

	mux := http.NewServeMux()
	mux.Handle("GET /static/", http.FileServer(http.FS(staticFS)))
	mux.HandleFunc("GET /{$}", s.handleHome)
	mux.HandleFunc("GET /login", s.handleLogin)
	mux.HandleFunc("POST /login", s.handleLogin)
	mux.HandleFunc("GET /logout", s.handleLogout)
	mux.HandleFunc("POST /logout", s.handleLogout)
	mux.HandleFunc("GET /senha", s.handlePassword)
	mux.HandleFunc("POST /senha", s.handlePassword)
	mux.HandleFunc("GET /produtos", s.handleProducts)
	mux.HandleFunc("GET /produtos/novo", s.handleProductNew)
	mux.HandleFunc("POST /produtos/novo", s.handleProductNew)
	mux.HandleFunc("GET /clientes", s.handleClients)
	mux.HandleFunc("GET /clientes/{id}", s.handleClient)
	mux.HandleFunc("GET /relatorios", s.handleReports)
	mux.HandleFunc("GET /relatorios/celular", s.handleReportsDevice)
	mux.HandleFunc("GET /administracao", s.handleAdmin)
	mux.HandleFunc("POST /administracao/{id}/liberar", s.handleAdminEnable)
	mux.HandleFunc("POST /administracao/{id}/bloquear", s.handleAdminDisable)
	mux.HandleFunc("POST /administracao/{id}/licenca", s.handleAdminLicense)
	mux.HandleFunc("GET /administracao/{id}/senha", s.handleAdminReset)
	mux.HandleFunc("POST /administracao/{id}/senha", s.handleAdminReset)
	mux.HandleFunc("GET /su", s.handleSu)
	mux.HandleFunc("GET /su/login", s.handleSuLogin)
	mux.HandleFunc("POST /su/login", s.handleSuLogin)
	mux.HandleFunc("GET /su/logout", s.handleSuLogout)
	mux.HandleFunc("POST /su/logout", s.handleSuLogout)
	mux.HandleFunc("GET /su/senha", s.handleSuPassword)
	mux.HandleFunc("POST /su/senha", s.handleSuPassword)
	mux.HandleFunc("POST /su/usuarios/{id}/liberar", s.handleSuUserEnable)
	mux.HandleFunc("POST /su/usuarios/{id}/bloquear", s.handleSuUserDisable)
	mux.HandleFunc("POST /su/grupos/{id}/liberar", s.handleSuGroupEnable)
	mux.HandleFunc("POST /su/grupos/{id}/bloquear", s.handleSuGroupDisable)
	mux.HandleFunc("GET /healthz", s.handleHealth)
	mux.HandleFunc("GET /health", s.handleHealth)
	mux.HandleFunc("GET /api/discover", s.handleDiscover)
	mux.HandleFunc("POST /api/pair", s.handlePair)
	mux.HandleFunc("GET /api/device", s.handleDevice)
	mux.HandleFunc("POST /api/device", s.handleDevice)
	mux.HandleFunc("POST /api/sync", s.handleSync)
	mux.HandleFunc("POST /api/mode/standalone", s.handleModeStandalone)
	mux.HandleFunc("POST /api/mode/connected", s.handleModeConnected)
	mux.HandleFunc("POST /api/mode/company", s.handleModeCompany)
	mux.HandleFunc("POST /api/mode/join", s.handleModeJoin)
	mux.HandleFunc("GET /api/members", s.handleMembers)
	mux.HandleFunc("POST /api/members/{id}/excluir", s.handleMemberDelete)
	mux.HandleFunc("POST /api/password-reset", s.handlePasswordResetRequest)
	mux.HandleFunc("POST /api/password-reset/confirm", s.handlePasswordResetConfirm)

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
