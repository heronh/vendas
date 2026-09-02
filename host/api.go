package main

import (
	"database/sql"
	"io"
	"net/http"
	"strings"
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
	dev, err := s.pairAccount(r.Context(), email, body.DeviceName, body.Professional, "", "connected", "", "", "pending", true)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"ok": false, "error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":      true,
		"token":   dev.Token,
		"enabled": true,
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
		writeJSON(w, http.StatusOK, s.accountStatus(dev))
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
	writeJSON(w, http.StatusOK, s.accountStatus(updated))
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
	if !dev.Enabled || dev.Mode == "stand_alone" {
		writeJSON(w, http.StatusForbidden, map[string]any{
			"ok":      false,
			"enabled": false,
			"error":   "Sincronização indisponível neste modo",
		})
		return
	}
	if dev.CompanyID != "" {
		if c, err := s.companyByID(r.Context(), dev.CompanyID); err == nil && !c.Enabled {
			writeJSON(w, http.StatusForbidden, map[string]any{
				"ok":      false,
				"enabled": false,
				"error":   "Grupo bloqueado pelo administrador SU",
			})
			return
		}
	}
	ctx := r.Context()
	userID := dev.UserID
	companyID := dev.CompanyID
	if err := upsertClients(ctx, s.db, body.Clients, dev.ID, userID); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"ok": false, "error": err.Error()})
		return
	}
	if err := upsertProducts(ctx, s.db, body.Products, "phone", dev.ID, companyID, userID); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"ok": false, "error": err.Error()})
		return
	}
	if err := upsertSales(ctx, s.db, body.Sales, dev.ID, userID); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"ok": false, "error": err.Error()})
		return
	}
	if err := upsertPayments(ctx, s.db, body.Payments, dev.ID, userID); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"ok": false, "error": err.Error()})
		return
	}
	if err := s.updateDeviceAfterSync(ctx, dev.ID, body.DeviceName, body.Professional, body.Email, body.PasswordChanged); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"ok": false, "error": err.Error()})
		return
	}
	products, err := listProductsForAccount(ctx, s.db, companyID, userID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"ok": false, "error": err.Error()})
		return
	}
	clients, err := listClientsByUser(ctx, s.db, userID, dev.ID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"ok": false, "error": err.Error()})
		return
	}
	sales, err := listSalesByUser(ctx, s.db, userID, dev.ID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"ok": false, "error": err.Error()})
		return
	}
	payments, err := listPaymentsByUser(ctx, s.db, userID, dev.ID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"ok": false, "error": err.Error()})
		return
	}
	updated, err := s.deviceByToken(ctx, dev.Token)
	if err != nil && err != sql.ErrNoRows {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"ok": false, "error": err.Error()})
		return
	}
	out := s.accountStatus(updated)
	out["products"] = stripOwnership(products)
	out["clients"] = stripClientOwnership(clients)
	out["sales"] = stripSaleOwnership(sales)
	out["payments"] = stripPaymentOwnership(payments)
	writeJSON(w, http.StatusOK, out)
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

type modeBody struct {
	DeviceName   string  `json:"deviceName"`
	Professional string  `json:"professional"`
	Email        string  `json:"email"`
	Phone        string  `json:"phone"`
	Signature    string  `json:"signature"`
	Company      Company `json:"company"`
}

func (s *server) decodeMode(r *http.Request) (modeBody, error) {
	var body modeBody
	err := decodeJSON(r, 1<<20, &body)
	return body, err
}

func (s *server) writePaired(w http.ResponseWriter, dev Device) {
	out := s.accountStatus(dev)
	out["token"] = dev.Token
	writeJSON(w, http.StatusOK, out)
}

func (s *server) handleModeStandalone(w http.ResponseWriter, r *http.Request) {
	body, err := s.decodeMode(r)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"ok": false, "error": "JSON inválido"})
		return
	}
	email := normalizeEmail(body.Email)
	if !validEmail(email) {
		writeJSON(w, http.StatusBadRequest, map[string]any{"ok": false, "error": "Informe um e-mail válido"})
		return
	}
	dev, err := s.pairAccount(r.Context(), email, body.DeviceName, body.Professional, body.Phone, "stand_alone", "", "", "pending", false)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"ok": false, "error": err.Error()})
		return
	}
	s.writePaired(w, dev)
}

func (s *server) handleModeConnected(w http.ResponseWriter, r *http.Request) {
	body, err := s.decodeMode(r)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"ok": false, "error": "JSON inválido"})
		return
	}
	email := normalizeEmail(body.Email)
	if !validEmail(email) {
		writeJSON(w, http.StatusBadRequest, map[string]any{"ok": false, "error": "Informe um e-mail válido"})
		return
	}
	dev, err := s.pairAccount(r.Context(), email, body.DeviceName, body.Professional, body.Phone, "connected", "", "", "pending", true)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"ok": false, "error": err.Error()})
		return
	}
	s.writePaired(w, dev)
}

func (s *server) handleModeCompany(w http.ResponseWriter, r *http.Request) {
	body, err := s.decodeMode(r)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"ok": false, "error": "JSON inválido"})
		return
	}
	email := normalizeEmail(body.Email)
	if !validEmail(email) {
		writeJSON(w, http.StatusBadRequest, map[string]any{"ok": false, "error": "Informe um e-mail válido"})
		return
	}
	if strings.TrimSpace(body.Company.LegalName) == "" && strings.TrimSpace(body.Company.TradeName) == "" {
		writeJSON(w, http.StatusBadRequest, map[string]any{"ok": false, "error": "Informe o nome da empresa"})
		return
	}
	ctx := r.Context()
	user, err := s.ensureUser(ctx, email, body.Professional, body.Phone, "group", "", "owner", "group_covered")
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"ok": false, "error": err.Error()})
		return
	}
	company, err := s.createCompany(ctx, body.Company, user.ID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"ok": false, "error": err.Error()})
		return
	}
	user.Mode = "group"
	user.CompanyID = company.ID
	user.Role = "owner"
	user.LicenseStatus = "group_covered"
	if err := s.saveUser(ctx, user); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"ok": false, "error": err.Error()})
		return
	}
	dev, err := s.pairAccount(ctx, email, body.DeviceName, body.Professional, body.Phone, "group", company.ID, "owner", "group_covered", true)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"ok": false, "error": err.Error()})
		return
	}
	s.writePaired(w, dev)
}

func (s *server) handleModeJoin(w http.ResponseWriter, r *http.Request) {
	body, err := s.decodeMode(r)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"ok": false, "error": "JSON inválido"})
		return
	}
	email := normalizeEmail(body.Email)
	if !validEmail(email) {
		writeJSON(w, http.StatusBadRequest, map[string]any{"ok": false, "error": "Informe um e-mail válido"})
		return
	}
	sig := strings.ToLower(strings.TrimSpace(body.Signature))
	if len(sig) != 6 {
		writeJSON(w, http.StatusBadRequest, map[string]any{"ok": false, "error": "Informe a assinatura de 6 caracteres"})
		return
	}
	ctx := r.Context()
	company, err := s.companyBySignature(ctx, sig)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]any{"ok": false, "error": "Assinatura não encontrada"})
		return
	}
	dev, err := s.pairAccount(ctx, email, body.DeviceName, body.Professional, body.Phone, "group", company.ID, "member", "group_covered", true)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"ok": false, "error": err.Error()})
		return
	}
	s.writePaired(w, dev)
}

func (s *server) handleMembers(w http.ResponseWriter, r *http.Request) {
	dev, ok := s.lookupDevice(r, "")
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]any{"ok": false, "error": "não autenticado"})
		return
	}
	if dev.Role != "owner" || dev.CompanyID == "" {
		writeJSON(w, http.StatusForbidden, map[string]any{"ok": false, "error": "somente o dono da empresa"})
		return
	}
	if r.Method == http.MethodGet {
		members, err := s.listMembers(r.Context(), dev.CompanyID)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]any{"ok": false, "error": err.Error()})
			return
		}
		type row struct {
			ID            string `json:"id"`
			Email         string `json:"email"`
			DisplayName   string `json:"displayName"`
			Role          string `json:"role"`
			LicenseStatus string `json:"licenseStatus"`
			Mode          string `json:"mode"`
		}
		out := make([]row, 0, len(members))
		for _, m := range members {
			out = append(out, row{m.ID, m.Email, m.DisplayName, m.Role, m.LicenseStatus, m.Mode})
		}
		writeJSON(w, http.StatusOK, map[string]any{"ok": true, "members": out})
		return
	}
	writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"ok": false, "error": "método inválido"})
}

func (s *server) handleMemberDelete(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost && r.Method != http.MethodDelete {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"ok": false, "error": "método inválido"})
		return
	}
	dev, ok := s.lookupDevice(r, "")
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]any{"ok": false, "error": "não autenticado"})
		return
	}
	if dev.Role != "owner" || dev.CompanyID == "" {
		writeJSON(w, http.StatusForbidden, map[string]any{"ok": false, "error": "somente o dono da empresa"})
		return
	}
	id := r.PathValue("id")
	if id == "" || id == dev.UserID {
		writeJSON(w, http.StatusBadRequest, map[string]any{"ok": false, "error": "não é possível excluir o dono"})
		return
	}
	if err := s.kickMember(r.Context(), dev.CompanyID, id); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"ok": false, "error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (s *server) handlePasswordResetRequest(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Email string `json:"email"`
	}
	if err := decodeJSON(r, 1<<20, &body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"ok": false, "error": "JSON inválido"})
		return
	}
	email := normalizeEmail(body.Email)
	if !validEmail(email) {
		writeJSON(w, http.StatusBadRequest, map[string]any{"ok": false, "error": "Informe um e-mail válido"})
		return
	}
	u, err := s.userByEmail(r.Context(), email)
	if err == sql.ErrNoRows {
		writeJSON(w, http.StatusOK, map[string]any{"ok": true})
		return
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"ok": false, "error": err.Error()})
		return
	}
	temp := randomTempPassword()
	if err := s.issuePasswordReset(r.Context(), u.ID, temp); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"ok": false, "error": err.Error()})
		return
	}
	if err := sendPasswordEmail(email, temp); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"ok": false, "error": "não foi possível enviar o e-mail"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (s *server) handlePasswordResetConfirm(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := decodeJSON(r, 1<<20, &body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"ok": false, "error": "JSON inválido"})
		return
	}
	if err := s.confirmPasswordReset(r.Context(), body.Email, body.Password); err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]any{"ok": false, "error": "Senha inválida"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}
