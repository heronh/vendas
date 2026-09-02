package main

import (
	"strings"
	"time"
)

const (
	defaultPort       = 3847
	defaultPassword   = "000000"
	defaultSuPassword = "123mudar"
	sessionOK         = "ok"
	sessionChange     = "change"
	sessionSuOK       = "suok"
	sessionSuChange   = "suchange"
)

type Product struct {
	ID             string  `json:"id"`
	Description    string  `json:"description"`
	Supplier       string  `json:"supplier"`
	CostPriceCents int64   `json:"costPriceCents"`
	SalePriceCents int64   `json:"salePriceCents"`
	Barcode        string  `json:"barcode"`
	ImageDataURL   *string `json:"imageDataUrl,omitempty"`
	CreatedAt      int64   `json:"createdAt"`
	UpdatedAt      int64   `json:"updatedAt"`
	Source         string  `json:"source,omitempty"`
	DeviceID       string  `json:"deviceId,omitempty"`
	CompanyID      string  `json:"companyId,omitempty"`
	UserID         string  `json:"userId,omitempty"`
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
	DeviceID     string `json:"deviceId,omitempty"`
	UserID       string `json:"userId,omitempty"`
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
	DeviceID           string  `json:"deviceId,omitempty"`
	UserID             string  `json:"userId,omitempty"`
}

type Payment struct {
	ID          string  `json:"id"`
	ClientID    string  `json:"clientId"`
	AmountCents int64   `json:"amountCents"`
	OccurredAt  int64   `json:"occurredAt"`
	Notes       *string `json:"notes,omitempty"`
	CreatedAt   int64   `json:"createdAt"`
	DeviceID    string  `json:"deviceId,omitempty"`
	UserID      string  `json:"userId,omitempty"`
}

type Company struct {
	ID          string `json:"id"`
	LegalName   string `json:"legalName"`
	TradeName   string `json:"tradeName"`
	CNPJ        string `json:"cnpj"`
	Email       string `json:"email"`
	Phone       string `json:"phone"`
	City        string `json:"city"`
	State       string `json:"state"`
	Signature   string `json:"signature"`
	HashHex     string `json:"hashHex,omitempty"`
	OwnerUserID string `json:"ownerUserId,omitempty"`
	CreatedAt   int64  `json:"createdAt"`
	Enabled     bool   `json:"enabled"`
}

type AppUser struct {
	ID                 string
	Email              string
	DisplayName        string
	Phone              string
	PasswordHash       string
	Mode               string
	CompanyID          string
	Role               string
	LicenseStatus      string
	DeletedFromGroupAt int64
	CreatedAt          int64
	UpdatedAt          int64
}

type Device struct {
	ID                 string
	Token              string
	Name               string
	Professional       string
	Email              string
	Enabled            bool
	PasswordReset      bool
	PairedAt           int64
	LastSyncAt         int64
	UserID             string
	CompanyID          string
	Mode               string
	Role               string
	LicenseStatus      string
	DeletedFromGroupAt int64
}

func (d Device) Label() string {
	return userLabel(d.Email, d.Professional, d.Name)
}

func (d Device) DisplayName() string {
	return deviceNameOrDefault(d.Name)
}

func (d Device) DisplayProfessional() string {
	return professionalOrDash(d.Professional)
}

func (d Device) DisplayEmail() string {
	if v := strings.TrimSpace(d.Email); v != "" {
		return v
	}
	return "—"
}

type syncBody struct {
	Token           string    `json:"token"`
	Code            string    `json:"code"`
	Clients         []Client  `json:"clients"`
	Products        []Product `json:"products"`
	Sales           []Sale    `json:"sales"`
	Payments        []Payment `json:"payments"`
	PasswordChanged bool      `json:"passwordChanged"`
	DeviceName      string    `json:"deviceName"`
	Professional    string    `json:"professional"`
	Email           string    `json:"email"`
}

type pageLink struct {
	Href  string
	Label string
}

type pageBase struct {
	Title      string
	Heading    string
	Lead       string
	Tab        string
	MustChange bool
	Back       *pageLink
}

func brZone() *time.Location {
	return time.FixedZone("BRT", -3*60*60)
}

func formatWhen(ms int64) string {
	if ms <= 0 {
		return "—"
	}
	return time.UnixMilli(ms).In(brZone()).Format("02/01/2006 15:04")
}

func userLabel(email, professional, name string) string {
	e := strings.TrimSpace(email)
	p := strings.TrimSpace(professional)
	n := strings.TrimSpace(name)
	switch {
	case e != "" && p != "":
		return e + " · " + p
	case e != "":
		return e
	case n != "" && p != "":
		return n + " · " + p
	case p != "":
		return p
	case n != "":
		return n
	default:
		return "Celular"
	}
}

func deviceLabel(name, professional string) string {
	return userLabel("", professional, name)
}

func deviceNameOrDefault(name string) string {
	if v := strings.TrimSpace(name); v != "" {
		return v
	}
	return "Celular"
}

func professionalOrDash(name string) string {
	if v := strings.TrimSpace(name); v != "" {
		return v
	}
	return "—"
}

func originLabel(source, deviceID, deviceName, professional, email string) string {
	if source == "local" || strings.TrimSpace(deviceID) == "" {
		return "Servidor"
	}
	return userLabel(email, professional, deviceName)
}

func normalizeEmail(value string) string {
	return strings.ToLower(strings.TrimSpace(value))
}

func validEmail(value string) bool {
	s := normalizeEmail(value)
	at := strings.IndexByte(s, '@')
	return at > 0 && strings.Contains(s[at+1:], ".")
}
