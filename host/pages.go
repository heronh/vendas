package main

import (
	"database/sql"
	"net/http"
	"strconv"
	"strings"
	"time"
)

func (s *server) handleHome(w http.ResponseWriter, r *http.Request) {
	state, ok := s.requirePage(w, r)
	if !ok {
		return
	}
	stats, err := s.dashboard(r.Context())
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	s.render(w, "home.html", map[string]any{
		"Title":        "Início · Host",
		"Heading":      "Início",
		"Lead":         "Painel do admin. Visualiza os celulares liberados. Não registra lançamentos. A senha daqui não é a dos usuários do aplicativo.",
		"Tab":          "inicio",
		"MustChange":   state == sessionChange,
		"PairingCode":  s.pairingCode,
		"Addresses":    s.connectHints(r),
		"PendingCount": stats.PendingCount,
		"PendingNames": stats.PendingNames,
		"ClientCount":  stats.ClientCount,
		"MonthSales":   formatBRL(stats.MonthSales),
		"ProductCount": stats.ProductCount,
	})
}

func (s *server) handleLogin(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodGet {
		switch s.sessionState(r) {
		case sessionOK:
			http.Redirect(w, r, "/", http.StatusFound)
			return
		case sessionChange:
			http.Redirect(w, r, "/senha?aviso=1", http.StatusFound)
			return
		}
		s.render(w, "login.html", map[string]any{
			"Title": "Entrar · Host",
			"Error": r.URL.Query().Get("erro") == "1",
		})
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
	hash, err := s.passwordHash(r.Context())
	if err != nil || !passwordMatch(hash, got) {
		http.Redirect(w, r, "/login?erro=1", http.StatusSeeOther)
		return
	}
	if got == defaultPassword {
		s.setSession(w, r, sessionChange)
		http.Redirect(w, r, "/senha?aviso=1", http.StatusSeeOther)
		return
	}
	s.setSession(w, r, sessionOK)
	http.Redirect(w, r, "/", http.StatusSeeOther)
}

func (s *server) handleLogout(w http.ResponseWriter, r *http.Request) {
	s.clearSession(w)
	http.Redirect(w, r, "/login", http.StatusSeeOther)
}

func (s *server) handlePassword(w http.ResponseWriter, r *http.Request) {
	state, ok := s.requirePage(w, r)
	if !ok {
		return
	}
	forced := state == sessionChange || r.URL.Query().Get("aviso") == "1"
	data := map[string]any{
		"Title":      "Trocar senha · Host",
		"Heading":    "Trocar senha do administrador",
		"Lead":       "Esta senha abre o painel do admin. Não é a senha dos usuários do aplicativo móvel.",
		"Tab":        "",
		"MustChange": state == sessionChange,
		"Forced":     forced || state == sessionChange,
		"Error":      "",
		"Saved":      r.URL.Query().Get("ok") == "1",
	}
	if r.Method == http.MethodGet {
		s.render(w, "password.html", data)
		return
	}
	if r.Method != http.MethodPost {
		http.Error(w, "método não permitido", http.StatusMethodNotAllowed)
		return
	}
	if err := r.ParseForm(); err != nil {
		data["Error"] = "Não foi possível ler o formulário."
		s.render(w, "password.html", data)
		return
	}
	current := r.FormValue("current")
	next := strings.TrimSpace(r.FormValue("password"))
	confirm := strings.TrimSpace(r.FormValue("confirm"))
	hash, err := s.passwordHash(r.Context())
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if state != sessionChange {
		if !passwordMatch(hash, current) {
			data["Error"] = "Senha atual incorreta."
			s.render(w, "password.html", data)
			return
		}
	}
	if next != confirm {
		data["Error"] = "A confirmação não confere com a nova senha."
		s.render(w, "password.html", data)
		return
	}
	if len(next) < 6 {
		data["Error"] = "A nova senha precisa ter pelo menos 6 caracteres."
		s.render(w, "password.html", data)
		return
	}
	if next == defaultPassword {
		data["Error"] = "Não use 000000. Escolha outra senha."
		s.render(w, "password.html", data)
		return
	}
	hashed, err := hashPassword(next)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if err := s.setPasswordHash(r.Context(), hashed); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	s.setSession(w, r, sessionOK)
	if state == sessionChange {
		http.Redirect(w, r, "/", http.StatusSeeOther)
		return
	}
	http.Redirect(w, r, "/senha?ok=1", http.StatusSeeOther)
}

func (s *server) handleProducts(w http.ResponseWriter, r *http.Request) {
	state, ok := s.requirePage(w, r)
	if !ok {
		return
	}
	products, err := s.listProductRows(r.Context())
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	s.render(w, "products.html", map[string]any{
		"Title":      "Produtos · Host",
		"Heading":    "Produtos",
		"Lead":       "Catálogo comum a todos os celulares e ao admin. Cadastrar produto aqui não é lançamento de venda.",
		"Tab":        "produtos",
		"MustChange": state == sessionChange,
		"Products":   products,
	})
}

func (s *server) handleProductNew(w http.ResponseWriter, r *http.Request) {
	state, ok := s.requirePage(w, r)
	if !ok {
		return
	}
	base := map[string]any{
		"Title":      "Novo produto · Host",
		"Heading":    "Novo produto no servidor",
		"Lead":       "Entra no catálogo compartilhado. Não cria venda nem altera saldo de cliente.",
		"Tab":        "produtos",
		"MustChange": state == sessionChange,
		"Back":       &pageLink{Href: "/produtos", Label: "Voltar à lista"},
		"Error":      "",
	}
	if r.Method == http.MethodGet {
		s.render(w, "product_form.html", base)
		return
	}
	if r.Method != http.MethodPost {
		http.Error(w, "método não permitido", http.StatusMethodNotAllowed)
		return
	}
	if err := r.ParseForm(); err != nil {
		base["Error"] = "Não foi possível ler o formulário."
		s.render(w, "product_form.html", base)
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
		base["Error"] = "Informe a descrição."
		s.render(w, "product_form.html", base)
		return
	}
	if err := upsertProducts(r.Context(), s.db, []Product{p}, "local", ""); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	http.Redirect(w, r, "/produtos", http.StatusSeeOther)
}

func (s *server) handleClients(w http.ResponseWriter, r *http.Request) {
	state, ok := s.requirePage(w, r)
	if !ok {
		return
	}
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	deviceID := strings.TrimSpace(r.URL.Query().Get("device"))
	devices, err := s.listDevices(r.Context())
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	var enabled []Device
	var pending []string
	for _, d := range devices {
		if d.Enabled {
			enabled = append(enabled, d)
		} else {
			pending = append(pending, d.Label())
		}
	}
	clients, err := s.listClientRows(r.Context(), q, deviceID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	note := ""
	if len(pending) > 0 {
		note = "Aparelhos ainda não liberados (" + strings.Join(pending, ", ") + ") não enviam clientes para esta lista."
	}
	s.render(w, "clients.html", map[string]any{
		"Title":       "Clientes · Host",
		"Heading":     "Clientes",
		"Lead":        "Visão dos celulares liberados. Sem cadastro e sem lançamento neste painel do admin.",
		"Tab":         "clientes",
		"MustChange":  state == sessionChange,
		"Query":       q,
		"DeviceID":    deviceID,
		"Devices":     enabled,
		"Clients":     clients,
		"BlockedNote": note,
	})
}

func (s *server) handleClient(w http.ResponseWriter, r *http.Request) {
	state, ok := s.requirePage(w, r)
	if !ok {
		return
	}
	id := r.PathValue("id")
	detail, err := s.getClientDetail(r.Context(), id)
	if err == sql.ErrNoRows {
		http.NotFound(w, r)
		return
	}
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	s.render(w, "client.html", map[string]any{
		"Title":         detail.Client.FullName + " · Host",
		"Heading":       detail.Client.FullName,
		"Lead":          "Ficha somente leitura · origem: " + detail.Origin,
		"Tab":           "clientes",
		"MustChange":    state == sessionChange,
		"Back":          &pageLink{Href: "/clientes", Label: "Voltar à lista"},
		"Balance":       formatBRL(detail.Balance),
		"SalesTotal":    formatBRL(detail.SalesTotal),
		"PaymentsTotal": formatBRL(detail.PaymentsTotal),
		"Contact":       detail.Contact,
		"Ledger":        detail.Ledger,
	})
}

func (s *server) handleReports(w http.ResponseWriter, r *http.Request) {
	state, ok := s.requirePage(w, r)
	if !ok {
		return
	}
	period := reportPeriod(r)
	rep, err := s.reportData(r.Context(), period, "")
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	summary := "Nenhum celular no total"
	if rep.EnabledCount == 1 {
		summary = "1 celular no total"
	} else if rep.EnabledCount > 1 {
		summary = strconv.Itoa(rep.EnabledCount) + " celulares no total"
	}
	s.render(w, "reports.html", map[string]any{
		"Title":         "Relatórios gerais · Host",
		"Heading":       "Relatórios gerais",
		"Lead":          "Todos os celulares liberados. Aparelhos com enabled=false ficam de fora.",
		"Tab":           "relatorios",
		"MustChange":    state == sessionChange,
		"Period":        period,
		"SalesTotal":    formatBRL(rep.SalesTotal),
		"PaymentsTotal": formatBRL(rep.PaymentsTotal),
		"OpenBalance":   formatBRL(rep.SalesTotal - rep.PaymentsTotal),
		"DeviceSummary": summary,
		"Debtors":       rep.Debtors,
		"Products":      rep.Products,
	})
}

type deviceOption struct {
	ID       string
	Label    string
	Disabled bool
	Selected bool
}

func (s *server) handleReportsDevice(w http.ResponseWriter, r *http.Request) {
	state, ok := s.requirePage(w, r)
	if !ok {
		return
	}
	period := reportPeriod(r)
	devices, err := s.listDevices(r.Context())
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	selected := strings.TrimSpace(r.URL.Query().Get("device"))
	var options []deviceOption
	var firstEnabled string
	for _, d := range devices {
		label := d.Label()
		if d.Enabled {
			label += " · ativo"
			if firstEnabled == "" {
				firstEnabled = d.ID
			}
		} else {
			label += " · aguardando liberação"
		}
		options = append(options, deviceOption{ID: d.ID, Label: label, Disabled: !d.Enabled})
	}
	if selected == "" {
		selected = firstEnabled
	} else {
		found := false
		for _, d := range devices {
			if d.ID == selected && d.Enabled {
				found = true
				break
			}
		}
		if !found {
			selected = firstEnabled
		}
	}
	for i := range options {
		options[i].Selected = options[i].ID == selected && !options[i].Disabled
	}
	has := selected != ""
	var rep reportView
	subtitle := ""
	if has {
		rep, err = s.reportData(r.Context(), period, selected)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		dev, err := s.getDevice(r.Context(), selected)
		if err == nil {
			_, _, label := periodBounds(period, time.Now())
			subtitle = userLabel(dev.Email, dev.Professional, dev.Name) + " · " + label
		}
	}
	s.render(w, "reports_device.html", map[string]any{
		"Title":         "Relatórios por celular · Host",
		"Heading":       "Relatórios por celular",
		"Lead":          "Mesmas métricas do relatório geral, cortadas pelo e-mail do usuário liberado.",
		"Tab":           "relatorios",
		"MustChange":    state == sessionChange,
		"Period":        period,
		"DeviceID":      selected,
		"DeviceOptions": options,
		"HasDevice":     has,
		"SalesTotal":    formatBRL(rep.SalesTotal),
		"PaymentsTotal": formatBRL(rep.PaymentsTotal),
		"OpenBalance":   formatBRL(rep.SalesTotal - rep.PaymentsTotal),
		"Subtitle":      subtitle,
		"Ranking":       rep.Ranking,
	})
}

func (s *server) handleAdmin(w http.ResponseWriter, r *http.Request) {
	state, ok := s.requirePage(w, r)
	if !ok {
		return
	}
	devices, err := s.listDevices(r.Context())
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	type row struct {
		ID           string
		Email        string
		Name         string
		Professional string
		Enabled      bool
		PairedAt     string
	}
	var views []row
	for _, d := range devices {
		views = append(views, row{
			ID:           d.ID,
			Email:        d.DisplayEmail(),
			Name:         d.DisplayName(),
			Professional: d.DisplayProfessional(),
			Enabled:      d.Enabled,
			PairedAt:     formatWhen(d.PairedAt),
		})
	}
	notice := ""
	switch r.URL.Query().Get("ok") {
	case "liberado":
		notice = "Usuário liberado. O aplicativo passa a sincronizar clientes, produtos e lançamentos."
	case "bloqueado":
		notice = "Usuário bloqueado. O histórico já recebido permanece."
	case "senha":
		notice = "Senha do aplicativo redefinida para 000000. No próximo acesso o celular abre o cadastro de usuário."
	}
	s.render(w, "admin.html", map[string]any{
		"Title":      "Administração de usuários · Host",
		"Heading":    "Administração de usuários",
		"Lead":       "O e-mail identifica o usuário do aplicativo. A liberação é manual e feita pelo admin. Padrão: não liberado.",
		"Tab":        "admin",
		"MustChange": state == sessionChange,
		"Devices":    views,
		"Notice":     notice,
	})
}

func (s *server) handleAdminEnable(w http.ResponseWriter, r *http.Request) {
	if _, ok := s.requirePage(w, r); !ok {
		return
	}
	if r.Method != http.MethodPost {
		http.Error(w, "método não permitido", http.StatusMethodNotAllowed)
		return
	}
	if err := s.setDeviceEnabled(r.Context(), r.PathValue("id"), true); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	http.Redirect(w, r, "/administracao?ok=liberado", http.StatusSeeOther)
}

func (s *server) handleAdminDisable(w http.ResponseWriter, r *http.Request) {
	if _, ok := s.requirePage(w, r); !ok {
		return
	}
	if r.Method != http.MethodPost {
		http.Error(w, "método não permitido", http.StatusMethodNotAllowed)
		return
	}
	if err := s.setDeviceEnabled(r.Context(), r.PathValue("id"), false); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	http.Redirect(w, r, "/administracao?ok=bloqueado", http.StatusSeeOther)
}

func (s *server) handleAdminReset(w http.ResponseWriter, r *http.Request) {
	state, ok := s.requirePage(w, r)
	if !ok {
		return
	}
	dev, err := s.getDevice(r.Context(), r.PathValue("id"))
	if err == sql.ErrNoRows {
		http.NotFound(w, r)
		return
	}
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	view := struct {
		ID           string
		Email        string
		Name         string
		Professional string
	}{dev.ID, dev.DisplayEmail(), dev.DisplayName(), dev.DisplayProfessional()}
	if r.Method == http.MethodGet {
		s.render(w, "reset_password.html", map[string]any{
			"Title":      "Redefinir senha do aplicativo · Host",
			"Heading":    "Redefinir senha do aplicativo",
			"Lead":       "Uso: o usuário do celular esqueceu a senha. Não altera a senha do admin.",
			"Tab":        "admin",
			"MustChange": state == sessionChange,
			"Back":       &pageLink{Href: "/administracao", Label: "Cancelar"},
			"Device":     view,
		})
		return
	}
	if r.Method != http.MethodPost {
		http.Error(w, "método não permitido", http.StatusMethodNotAllowed)
		return
	}
	if err := s.setDevicePasswordReset(r.Context(), dev.ID, true); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	http.Redirect(w, r, "/administracao?ok=senha", http.StatusSeeOther)
}

func reportPeriod(r *http.Request) string {
	if r.URL.Query().Get("periodo") == "30d" {
		return "30d"
	}
	return "mes"
}

