package main

import (
	"database/sql"
	"io"
	"net/http"
	"strings"
	"time"
)

func (s *server) handleHealth(w http.ResponseWriter, r *http.Request) {
	if err := s.db.PingContext(r.Context()); err != nil {
		http.Error(w, "database", http.StatusServiceUnavailable)
		return
	}
	w.WriteHeader(http.StatusOK)
	_, _ = io.WriteString(w, "ok")
}

func (s *server) handleDiscover(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"app":     "vendas-beauty-brasil-host",
		"port":    s.port,
		"baseUrl": requestBaseURL(r),
	})
}

func (s *server) handlePair(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"ok": false, "error": "método inválido"})
		return
	}
	var body struct {
		Code         string `json:"code"`
		DeviceName   string `json:"deviceName"`
		Professional string `json:"professional"`
		Email        string `json:"email"`
	}
	if err := decodeJSON(r, 1<<20, &body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"ok": false, "error": "JSON inválido"})
		return
	}
	if strings.TrimSpace(body.Code) != s.pairingCode {
		writeJSON(w, http.StatusUnauthorized, map[string]any{"ok": false, "error": "Código inválido"})
		return
	}
	email := normalizeEmail(body.Email)
	if !validEmail(email) {
		writeJSON(w, http.StatusBadRequest, map[string]any{"ok": false, "error": "Informe o e-mail do usuário do aplicativo"})
		return
	}
	ctx := r.Context()
	existing, err := s.deviceByEmail(ctx, email)
	if err == nil {
		token := randomHex(24)
		if err := s.reissueDevice(ctx, existing.ID, token, body.DeviceName, body.Professional, email); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]any{"ok": false, "error": err.Error()})
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"ok":      true,
			"token":   token,
			"enabled": existing.Enabled,
			"email":   email,
		})
		return
	}
	if err != sql.ErrNoRows {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"ok": false, "error": err.Error()})
		return
	}
	dev := Device{
		ID:           newID(),
		Token:        randomHex(24),
		Name:         strings.TrimSpace(body.DeviceName),
		Professional: strings.TrimSpace(body.Professional),
		Email:        email,
		PairedAt:     time.Now().UnixMilli(),
	}
	if err := s.insertDevice(ctx, dev); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"ok": false, "error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":      true,
		"token":   dev.Token,
		"enabled": false,
		"email":   email,
	})
}

func (s *server) lookupDevice(r *http.Request, bodyToken string) (Device, bool) {
	token := bearerToken(r, bodyToken)
	if token == "" {
		return Device{}, false
	}
	dev, err := s.deviceByToken(r.Context(), token)
	if err != nil {
		return Device{}, false
	}
	return dev, true
}

func (s *server) handleDevice(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Token           string `json:"token"`
		DeviceName      string `json:"deviceName"`
		Professional    string `json:"professional"`
		Email           string `json:"email"`
		PasswordChanged bool   `json:"passwordChanged"`
	}
	if r.Method == http.MethodPost {
		if err := decodeJSON(r, 1<<20, &body); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]any{"ok": false, "error": "JSON inválido"})
			return
		}
	} else if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"ok": false, "error": "método inválido"})
		return
	}
	dev, ok := s.lookupDevice(r, body.Token)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]any{"ok": false, "error": "Código inválido"})
		return
	}
	if r.Method == http.MethodGet {
		writeJSON(w, http.StatusOK, map[string]any{
			"ok":            true,
			"enabled":       dev.Enabled,
			"passwordReset": dev.PasswordReset,
			"professional":  dev.Professional,
			"email":         dev.Email,
			"deviceName":    dev.Name,
		})
		return
	}
	if err := s.updateDeviceAfterSync(r.Context(), dev.ID, body.DeviceName, body.Professional, body.Email, body.PasswordChanged); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"ok": false, "error": err.Error()})
		return
	}
	updated, err := s.deviceByToken(r.Context(), dev.Token)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"ok": false, "error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":            true,
		"enabled":       updated.Enabled,
		"passwordReset": updated.PasswordReset,
		"email":         updated.Email,
	})
}

func (s *server) handleSync(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"ok": false, "error": "método inválido"})
		return
	}
	var body syncBody
	if err := decodeJSON(r, 32<<20, &body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"ok": false, "error": "JSON inválido"})
		return
	}
	dev, ok := s.lookupDevice(r, body.Token)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]any{"ok": false, "error": "Código inválido"})
		return
	}
	if !dev.Enabled {
		writeJSON(w, http.StatusForbidden, map[string]any{
			"ok":      false,
			"enabled": false,
			"error":   "Aguardando liberação do admin no host",
		})
		return
	}
	ctx := r.Context()
	if err := upsertClients(ctx, s.db, body.Clients, dev.ID); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"ok": false, "error": err.Error()})
		return
	}
	if err := upsertProducts(ctx, s.db, body.Products, "phone", dev.ID); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"ok": false, "error": err.Error()})
		return
	}
	if err := upsertSales(ctx, s.db, body.Sales, dev.ID); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"ok": false, "error": err.Error()})
		return
	}
	if err := upsertPayments(ctx, s.db, body.Payments, dev.ID); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"ok": false, "error": err.Error()})
		return
	}
	if err := s.updateDeviceAfterSync(ctx, dev.ID, body.DeviceName, body.Professional, body.Email, body.PasswordChanged); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"ok": false, "error": err.Error()})
		return
	}
	products, err := listProducts(ctx, s.db)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"ok": false, "error": err.Error()})
		return
	}
	clients, err := listClientsByDevice(ctx, s.db, dev.ID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"ok": false, "error": err.Error()})
		return
	}
	sales, err := listSalesByDevice(ctx, s.db, dev.ID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"ok": false, "error": err.Error()})
		return
	}
	payments, err := listPaymentsByDevice(ctx, s.db, dev.ID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"ok": false, "error": err.Error()})
		return
	}
	updated, err := s.deviceByToken(ctx, dev.Token)
	if err != nil && err != sql.ErrNoRows {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"ok": false, "error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":            true,
		"enabled":       true,
		"passwordReset": updated.PasswordReset,
		"email":         updated.Email,
		"products":      stripOwnership(products),
		"clients":       stripClientOwnership(clients),
		"sales":         stripSaleOwnership(sales),
		"payments":      stripPaymentOwnership(payments),
	})
}

func stripOwnership(items []Product) []Product {
	out := make([]Product, len(items))
	for i, item := range items {
		item.DeviceID = ""
		item.Source = ""
		out[i] = item
	}
	return out
}

func stripClientOwnership(items []Client) []Client {
	out := make([]Client, len(items))
	for i, item := range items {
		item.DeviceID = ""
		out[i] = item
	}
	return out
}

func stripSaleOwnership(items []Sale) []Sale {
	out := make([]Sale, len(items))
	for i, item := range items {
		item.DeviceID = ""
		out[i] = item
	}
	return out
}

func stripPaymentOwnership(items []Payment) []Payment {
	out := make([]Payment, len(items))
	for i, item := range items {
		item.DeviceID = ""
		out[i] = item
	}
	return out
}
