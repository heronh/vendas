package main

import (
	"net/http"
	"strings"
)

func (s *server) suSessionState(r *http.Request) string {
	c, err := r.Cookie("su_session")
	if err != nil {
		return ""
	}
	v := s.verify(c.Value)
	if v == sessionSuOK || v == sessionSuChange {
		return v
	}
	return ""
}

func (s *server) setSuSession(w http.ResponseWriter, r *http.Request, state string) {
	http.SetCookie(w, &http.Cookie{
		Name:     "su_session",
		Value:    s.sign(state),
		Path:     "/",
		HttpOnly: true,
		Secure:   isHTTPS(r),
		SameSite: http.SameSiteLaxMode,
		MaxAge:   60 * 60 * 12,
	})
}

func (s *server) clearSuSession(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{Name: "su_session", Value: "", Path: "/", MaxAge: -1})
}

func (s *server) requireSu(w http.ResponseWriter, r *http.Request) (state string, ok bool) {
	state = s.suSessionState(r)
	switch state {
	case sessionSuOK:
		return state, true
	case sessionSuChange:
		if r.URL.Path == "/su/senha" {
			return state, true
		}
		http.Redirect(w, r, "/su/senha?aviso=1", http.StatusFound)
		return state, false
	default:
		http.Redirect(w, r, "/su/login", http.StatusFound)
		return "", false
	}
}

func (s *server) handleSuLogin(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodGet {
		switch s.suSessionState(r) {
		case sessionSuOK:
			http.Redirect(w, r, "/su", http.StatusFound)
			return
		case sessionSuChange:
			http.Redirect(w, r, "/su/senha?aviso=1", http.StatusFound)
			return
		}
		s.render(w, "su_login.html", map[string]any{
			"Title": "Administrador SU · Host",
			"Error": r.URL.Query().Get("erro") == "1",
		})
		return
	}
	if r.Method != http.MethodPost {
		http.Error(w, "método não permitido", http.StatusMethodNotAllowed)
		return
	}
	if err := r.ParseForm(); err != nil {
		http.Redirect(w, r, "/su/login?erro=1", http.StatusSeeOther)
		return
	}
	got := r.FormValue("password")
	hash, err := s.suPasswordHash(r.Context())
	if err != nil || !passwordMatch(hash, got) {
		http.Redirect(w, r, "/su/login?erro=1", http.StatusSeeOther)
		return
	}
	if got == s.suPassword {
		s.setSuSession(w, r, sessionSuChange)
		http.Redirect(w, r, "/su/senha?aviso=1", http.StatusSeeOther)
		return
	}
	s.setSuSession(w, r, sessionSuOK)
	http.Redirect(w, r, "/su", http.StatusSeeOther)
}

func (s *server) handleSuLogout(w http.ResponseWriter, r *http.Request) {
	s.clearSuSession(w)
	http.Redirect(w, r, "/su/login", http.StatusSeeOther)
}

func (s *server) handleSuPassword(w http.ResponseWriter, r *http.Request) {
	state, ok := s.requireSu(w, r)
	if !ok {
		return
	}
	forced := state == sessionSuChange || r.URL.Query().Get("aviso") == "1"
	data := map[string]any{
		"Title":      "Trocar senha SU · Host",
		"Heading":    "Trocar senha do administrador SU",
		"Lead":       "Esta senha abre só a página de liberação de usuários e grupos.",
		"Forced":     forced || state == sessionSuChange,
		"MustChange": state == sessionSuChange,
		"Error":      "",
		"Saved":      r.URL.Query().Get("ok") == "1",
	}
	if r.Method == http.MethodGet {
		s.render(w, "su_password.html", data)
		return
	}
	if err := r.ParseForm(); err != nil {
		data["Error"] = "Não foi possível ler o formulário."
		s.render(w, "su_password.html", data)
		return
	}
	current := r.FormValue("current")
	next := strings.TrimSpace(r.FormValue("password"))
	confirm := strings.TrimSpace(r.FormValue("confirm"))
	hash, err := s.suPasswordHash(r.Context())
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if state != sessionSuChange {
		if !passwordMatch(hash, current) {
			data["Error"] = "Senha atual incorreta."
			s.render(w, "su_password.html", data)
			return
		}
	}
	if next != confirm {
		data["Error"] = "A confirmação não confere com a nova senha."
		s.render(w, "su_password.html", data)
		return
	}
	if len(next) < 6 {
		data["Error"] = "A nova senha precisa ter pelo menos 6 caracteres."
		s.render(w, "su_password.html", data)
		return
	}
	if next == s.suPassword || next == defaultSuPassword {
		data["Error"] = "Não use a senha temporária. Escolha outra."
		s.render(w, "su_password.html", data)
		return
	}
	hashed, err := hashPassword(next)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if err := s.setSuPasswordHash(r.Context(), hashed); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	s.setSuSession(w, r, sessionSuOK)
	http.Redirect(w, r, "/su/senha?ok=1", http.StatusSeeOther)
}

func (s *server) handleSu(w http.ResponseWriter, r *http.Request) {
	state, ok := s.requireSu(w, r)
	if !ok {
		return
	}
	ctx := r.Context()
	devices, err := s.listDevices(ctx)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	companies, err := s.listCompanies(ctx)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	type userRow struct {
		ID            string
		Email         string
		Professional  string
		Name          string
		Mode          string
		LicenseStatus string
		Enabled       bool
	}
	var users []userRow
	for _, d := range devices {
		mode := d.Mode
		if mode == "" {
			mode = "connected"
		}
		lic := d.LicenseStatus
		if lic == "" {
			if d.Enabled {
				lic = "paid"
			} else {
				lic = "pending"
			}
		}
		users = append(users, userRow{
			ID:            d.ID,
			Email:         d.DisplayEmail(),
			Professional:  d.DisplayProfessional(),
			Name:          d.DisplayName(),
			Mode:          mode,
			LicenseStatus: lic,
			Enabled:       d.Enabled,
		})
	}
	type groupRow struct {
		ID        string
		Name      string
		Signature string
		Email     string
		Members   int
		Enabled   bool
		CreatedAt string
	}
	var groups []groupRow
	for _, c := range companies {
		name := strings.TrimSpace(c.TradeName)
		if name == "" {
			name = c.LegalName
		}
		groups = append(groups, groupRow{
			ID:        c.ID,
			Name:      name,
			Signature: c.Signature,
			Email:     c.Email,
			Members:   s.companyMemberCount(ctx, c.ID),
			Enabled:   c.Enabled,
			CreatedAt: formatWhen(c.CreatedAt),
		})
	}
	notice := ""
	switch r.URL.Query().Get("ok") {
	case "liberado":
		notice = "Usuário liberado."
	case "bloqueado":
		notice = "Usuário bloqueado."
	case "grupo-ok":
		notice = "Grupo atualizado."
	}
	s.render(w, "su.html", map[string]any{
		"Title":      "Administrador SU · Host",
		"Heading":    "Administrador SU",
		"Lead":       "Liberação e bloqueio de usuários e grupos. Senha própria, definida no .env.",
		"MustChange": state == sessionSuChange,
		"Users":      users,
		"Groups":     groups,
		"Notice":     notice,
	})
}

func (s *server) handleSuUserEnable(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "método não permitido", http.StatusMethodNotAllowed)
		return
	}
	if _, ok := s.requireSu(w, r); !ok {
		return
	}
	dev, err := s.getDevice(r.Context(), r.PathValue("id"))
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if dev.UserID != "" {
		status := "paid"
		if dev.Mode == "group" {
			status = "group_covered"
		}
		if err := s.setUserLicense(r.Context(), dev.UserID, status); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
	} else if err := s.setDeviceEnabled(r.Context(), dev.ID, true); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	http.Redirect(w, r, "/su?ok=liberado", http.StatusSeeOther)
}

func (s *server) handleSuUserDisable(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "método não permitido", http.StatusMethodNotAllowed)
		return
	}
	if _, ok := s.requireSu(w, r); !ok {
		return
	}
	dev, err := s.getDevice(r.Context(), r.PathValue("id"))
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if dev.UserID != "" {
		if err := s.setUserLicense(r.Context(), dev.UserID, "blocked"); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
	} else if err := s.setDeviceEnabled(r.Context(), dev.ID, false); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	http.Redirect(w, r, "/su?ok=bloqueado", http.StatusSeeOther)
}

func (s *server) handleSuGroupEnable(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "método não permitido", http.StatusMethodNotAllowed)
		return
	}
	if _, ok := s.requireSu(w, r); !ok {
		return
	}
	if err := s.setCompanyEnabled(r.Context(), r.PathValue("id"), true); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	http.Redirect(w, r, "/su?ok=grupo-ok", http.StatusSeeOther)
}

func (s *server) handleSuGroupDisable(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "método não permitido", http.StatusMethodNotAllowed)
		return
	}
	if _, ok := s.requireSu(w, r); !ok {
		return
	}
	if err := s.setCompanyEnabled(r.Context(), r.PathValue("id"), false); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	http.Redirect(w, r, "/su?ok=grupo-ok", http.StatusSeeOther)
}
