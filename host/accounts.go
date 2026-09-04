package main

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"fmt"
	"strconv"
	"strings"
	"time"
	"unicode"
)

func digitsOnly(s string) string {
	var b strings.Builder
	for _, r := range s {
		if unicode.IsDigit(r) {
			b.WriteRune(r)
		}
	}
	return b.String()
}

func companyCanonical(c Company) string {
	return strings.Join([]string{
		strings.TrimSpace(c.LegalName),
		strings.TrimSpace(c.TradeName),
		digitsOnly(c.CNPJ),
		normalizeEmail(c.Email),
		strings.TrimSpace(c.Phone),
		strings.TrimSpace(c.City),
		strings.ToUpper(strings.TrimSpace(c.State)),
	}, "|")
}

func hashSignature(canonical string, nonce int) (full, sig string) {
	payload := canonical
	if nonce > 0 {
		payload = canonical + "\x00" + strconv.Itoa(nonce)
	}
	sum := sha256.Sum256([]byte(payload))
	full = hex.EncodeToString(sum[:])
	return full, full[:6]
}

func (s *server) userByEmail(ctx context.Context, email string) (AppUser, error) {
	email = normalizeEmail(email)
	var u AppUser
	var deleted sql.NullInt64
	err := s.db.QueryRowContext(ctx, `
SELECT id, email, display_name, phone, password_hash, mode, company_id, role, license_status, deleted_from_group_at, created_at, updated_at
FROM users WHERE lower(email) = $1 AND email <> ''`, email).Scan(
		&u.ID, &u.Email, &u.DisplayName, &u.Phone, &u.PasswordHash, &u.Mode, &u.CompanyID, &u.Role, &u.LicenseStatus, &deleted, &u.CreatedAt, &u.UpdatedAt)
	if deleted.Valid {
		u.DeletedFromGroupAt = deleted.Int64
	}
	return u, err
}

func (s *server) userByID(ctx context.Context, id string) (AppUser, error) {
	var u AppUser
	var deleted sql.NullInt64
	err := s.db.QueryRowContext(ctx, `
SELECT id, email, display_name, phone, password_hash, mode, company_id, role, license_status, deleted_from_group_at, created_at, updated_at
FROM users WHERE id = $1`, id).Scan(
		&u.ID, &u.Email, &u.DisplayName, &u.Phone, &u.PasswordHash, &u.Mode, &u.CompanyID, &u.Role, &u.LicenseStatus, &deleted, &u.CreatedAt, &u.UpdatedAt)
	if deleted.Valid {
		u.DeletedFromGroupAt = deleted.Int64
	}
	return u, err
}

func (s *server) insertUser(ctx context.Context, u AppUser) error {
	_, err := s.db.ExecContext(ctx, `
INSERT INTO users (id, email, display_name, phone, password_hash, mode, company_id, role, license_status, created_at, updated_at)
VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
`, u.ID, normalizeEmail(u.Email), u.DisplayName, u.Phone, u.PasswordHash, u.Mode, u.CompanyID, u.Role, u.LicenseStatus, u.CreatedAt, u.UpdatedAt)
	return err
}

func (s *server) saveUser(ctx context.Context, u AppUser) error {
	_, err := s.db.ExecContext(ctx, `
UPDATE users SET display_name = CASE WHEN $2 = '' THEN display_name ELSE $2 END,
  phone = CASE WHEN $3 = '' THEN phone ELSE $3 END,
  mode = $4, company_id = $5, role = $6, license_status = $7,
  deleted_from_group_at = $8, updated_at = $9
WHERE id = $1
`, u.ID, u.DisplayName, u.Phone, u.Mode, u.CompanyID, u.Role, u.LicenseStatus, nullIfZero(u.DeletedFromGroupAt), u.UpdatedAt)
	return err
}

func nullIfZero(v int64) any {
	if v == 0 {
		return nil
	}
	return v
}

func (s *server) ensureUser(ctx context.Context, email, displayName, phone, mode, companyID, role, license string) (AppUser, error) {
	email = normalizeEmail(email)
	now := time.Now().UnixMilli()
	existing, err := s.userByEmail(ctx, email)
	if err == nil {
		existing.DisplayName = displayName
		existing.Phone = phone
		if mode != "" {
			existing.Mode = mode
		}
		existing.CompanyID = companyID
		existing.Role = role
		if license != "" {
			existing.LicenseStatus = license
		}
		existing.UpdatedAt = now
		if err := s.saveUser(ctx, existing); err != nil {
			return existing, err
		}
		return existing, nil
	}
	if err != sql.ErrNoRows {
		return AppUser{}, err
	}
	u := AppUser{
		ID:            newID(),
		Email:         email,
		DisplayName:   displayName,
		Phone:         phone,
		Mode:          mode,
		CompanyID:     companyID,
		Role:          role,
		LicenseStatus: license,
		CreatedAt:     now,
		UpdatedAt:     now,
	}
	if u.Mode == "" {
		u.Mode = "stand_alone"
	}
	if u.LicenseStatus == "" {
		u.LicenseStatus = "pending"
	}
	if err := s.insertUser(ctx, u); err != nil {
		return AppUser{}, err
	}
	return u, nil
}

func (s *server) companyBySignature(ctx context.Context, sig string) (Company, error) {
	sig = strings.ToLower(strings.TrimSpace(sig))
	var c Company
	err := s.db.QueryRowContext(ctx, `
SELECT id, legal_name, trade_name, cnpj, email, phone, city, state, signature, hash_hex, owner_user_id, created_at, COALESCE(enabled, TRUE)
FROM companies WHERE lower(signature) = $1`, sig).Scan(
		&c.ID, &c.LegalName, &c.TradeName, &c.CNPJ, &c.Email, &c.Phone, &c.City, &c.State, &c.Signature, &c.HashHex, &c.OwnerUserID, &c.CreatedAt, &c.Enabled)
	return c, err
}

func (s *server) companyByID(ctx context.Context, id string) (Company, error) {
	var c Company
	err := s.db.QueryRowContext(ctx, `
SELECT id, legal_name, trade_name, cnpj, email, phone, city, state, signature, hash_hex, owner_user_id, created_at, COALESCE(enabled, TRUE)
FROM companies WHERE id = $1`, id).Scan(
		&c.ID, &c.LegalName, &c.TradeName, &c.CNPJ, &c.Email, &c.Phone, &c.City, &c.State, &c.Signature, &c.HashHex, &c.OwnerUserID, &c.CreatedAt, &c.Enabled)
	return c, err
}

func (s *server) createCompany(ctx context.Context, c Company, ownerID string) (Company, error) {
	c.ID = newID()
	c.OwnerUserID = ownerID
	c.CreatedAt = time.Now().UnixMilli()
	c.Email = normalizeEmail(c.Email)
	c.CNPJ = digitsOnly(c.CNPJ)
	canonical := companyCanonical(c)
	for nonce := 0; nonce < 32; nonce++ {
		full, sig := hashSignature(canonical, nonce)
		c.HashHex = full
		c.Signature = sig
		_, err := s.db.ExecContext(ctx, `
INSERT INTO companies (id, legal_name, trade_name, cnpj, email, phone, city, state, signature, hash_hex, owner_user_id, created_at, enabled)
VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, TRUE)
`, c.ID, c.LegalName, c.TradeName, c.CNPJ, c.Email, c.Phone, c.City, c.State, c.Signature, c.HashHex, c.OwnerUserID, c.CreatedAt)
		if err == nil {
			return c, nil
		}
		if !strings.Contains(strings.ToLower(err.Error()), "unique") {
			return Company{}, err
		}
	}
	return Company{}, fmt.Errorf("não foi possível gerar assinatura única")
}

func (s *server) listMembers(ctx context.Context, companyID string) ([]AppUser, error) {
	rows, err := s.db.QueryContext(ctx, `
SELECT id, email, display_name, phone, password_hash, mode, company_id, role, license_status, COALESCE(deleted_from_group_at, 0), created_at, updated_at
FROM users WHERE company_id = $1 ORDER BY role DESC, display_name ASC`, companyID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []AppUser
	for rows.Next() {
		var u AppUser
		if err := rows.Scan(&u.ID, &u.Email, &u.DisplayName, &u.Phone, &u.PasswordHash, &u.Mode, &u.CompanyID, &u.Role, &u.LicenseStatus, &u.DeletedFromGroupAt, &u.CreatedAt, &u.UpdatedAt); err != nil {
			return nil, err
		}
		u.PasswordHash = ""
		out = append(out, u)
	}
	if out == nil {
		out = []AppUser{}
	}
	return out, rows.Err()
}

func (s *server) kickMember(ctx context.Context, companyID, userID string) error {
	now := time.Now().UnixMilli()
	_, err := s.db.ExecContext(ctx, `
UPDATE users SET mode = 'stand_alone', company_id = '', role = '', license_status = 'pending',
  deleted_from_group_at = $3, updated_at = $3
WHERE id = $1 AND company_id = $2 AND role <> 'owner'
`, userID, companyID, now)
	if err != nil {
		return err
	}
	_, err = s.db.ExecContext(ctx, `UPDATE devices SET company_id = '', enabled = FALSE WHERE user_id = $1`, userID)
	return err
}

func (s *server) setUserLicense(ctx context.Context, userID, status string) error {
	enabled := status == "paid" || status == "group_covered"
	_, err := s.db.ExecContext(ctx, `UPDATE users SET license_status = $2, updated_at = $3 WHERE id = $1`, userID, status, time.Now().UnixMilli())
	if err != nil {
		return err
	}
	_, err = s.db.ExecContext(ctx, `UPDATE devices SET enabled = $2 WHERE user_id = $1`, userID, enabled)
	return err
}

func (s *server) listCompanies(ctx context.Context) ([]Company, error) {
	rows, err := s.db.QueryContext(ctx, `
SELECT id, legal_name, trade_name, cnpj, email, phone, city, state, signature, hash_hex, owner_user_id, created_at, COALESCE(enabled, TRUE)
FROM companies ORDER BY created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Company
	for rows.Next() {
		var c Company
		if err := rows.Scan(&c.ID, &c.LegalName, &c.TradeName, &c.CNPJ, &c.Email, &c.Phone, &c.City, &c.State, &c.Signature, &c.HashHex, &c.OwnerUserID, &c.CreatedAt, &c.Enabled); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	if out == nil {
		out = []Company{}
	}
	return out, rows.Err()
}

func (s *server) companyMemberCount(ctx context.Context, companyID string) int {
	var n int
	_ = s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM users WHERE company_id = $1`, companyID).Scan(&n)
	return n
}

func (s *server) setCompanyEnabled(ctx context.Context, companyID string, enabled bool) error {
	_, err := s.db.ExecContext(ctx, `UPDATE companies SET enabled = $2 WHERE id = $1`, companyID, enabled)
	if err != nil {
		return err
	}
	_, err = s.db.ExecContext(ctx, `UPDATE devices SET enabled = $2 WHERE company_id = $1`, companyID, enabled)
	return err
}

func (s *server) issuePasswordReset(ctx context.Context, userID, temporary string) error {
	hash, err := hashPassword(temporary)
	if err != nil {
		return err
	}
	_, err = s.db.ExecContext(ctx, `UPDATE users SET password_hash = $2, updated_at = $3 WHERE id = $1`, userID, hash, time.Now().UnixMilli())
	if err != nil {
		return err
	}
	tokenHash := sha256Hex(temporary)
	_, err = s.db.ExecContext(ctx, `
INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at)
VALUES ($1,$2,$3, NOW() + INTERVAL '24 hours')
`, newID(), userID, tokenHash)
	return err
}

func (s *server) confirmPasswordReset(ctx context.Context, email, password string) error {
	u, err := s.userByEmail(ctx, email)
	if err != nil {
		return err
	}
	if u.PasswordHash == "" || !passwordMatch(u.PasswordHash, password) {
		return fmt.Errorf("senha inválida")
	}
	_, _ = s.db.ExecContext(ctx, `UPDATE password_reset_tokens SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL`, u.ID)
	return nil
}

func sha256Hex(s string) string {
	sum := sha256.Sum256([]byte(s))
	return hex.EncodeToString(sum[:])
}

func randomTempPassword() string {
	return strings.ToUpper(randomHex(4)[:8])
}

func licenseAllowsApp(status, mode string) bool {
	if mode == "group" && status == "group_covered" {
		return true
	}
	return status == "paid"
}

func (s *server) accountStatus(dev Device) map[string]any {
	mode := dev.Mode
	if mode == "" {
		mode = "connected"
	}
	license := dev.LicenseStatus
	if license == "" {
		if dev.Enabled {
			license = "paid"
		} else {
			license = "pending"
		}
	}
	signature := ""
	companyName := ""
	if dev.CompanyID != "" {
		if c, err := s.companyByID(context.Background(), dev.CompanyID); err == nil {
			signature = c.Signature
			companyName = c.TradeName
			if companyName == "" {
				companyName = c.LegalName
			}
		}
	}
	return map[string]any{
		"ok":              true,
		"enabled":         dev.Enabled && mode != "stand_alone",
		"passwordReset":   dev.PasswordReset,
		"professional":    dev.Professional,
		"email":           dev.Email,
		"deviceName":      dev.Name,
		"mode":            mode,
		"role":            dev.Role,
		"licenseStatus":   license,
		"licenseOk":       licenseAllowsApp(license, mode),
		"companyId":       dev.CompanyID,
		"signature":       signature,
		"companyName":     companyName,
		"kickedFromGroup": dev.DeletedFromGroupAt > 0 && mode == "stand_alone",
		"userId":          dev.UserID,
	}
}

func (s *server) pairAccount(ctx context.Context, email, name, professional, phone, mode, companyID, role, license string, enable bool) (Device, error) {
	user, err := s.ensureUser(ctx, email, professional, phone, mode, companyID, role, license)
	if err != nil {
		return Device{}, err
	}
	existing, err := s.deviceByEmail(ctx, email)
	token := randomHex(24)
	if err == nil {
		if err := s.reissueDevice(ctx, existing.ID, token, name, professional, email, user.ID, companyID, enable); err != nil {
			return Device{}, err
		}
		return s.deviceByToken(ctx, token)
	}
	if err != sql.ErrNoRows {
		return Device{}, err
	}
	dev := Device{
		ID:           newID(),
		Token:        token,
		Name:         strings.TrimSpace(name),
		Professional: strings.TrimSpace(professional),
		Email:        email,
		Enabled:      enable,
		PairedAt:     time.Now().UnixMilli(),
		UserID:       user.ID,
		CompanyID:    companyID,
	}
	if err := s.insertDevice(ctx, dev); err != nil {
		return Device{}, err
	}
	return s.deviceByToken(ctx, token)
}
