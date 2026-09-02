package main

import (
	"crypto/tls"
	"fmt"
	"log"
	"net"
	"net/smtp"
	"strconv"
	"strings"
)

func sendPasswordEmail(to, temporary string) error {
	host := env("SMTP_HOST", "")
	from := env("SMTP_FROM", "")
	user := env("SMTP_USER", "")
	pass := env("SMTP_PASSWORD", "")
	port := envInt("SMTP_PORT", 587)
	body := fmt.Sprintf("Sua nova senha temporária do Controle de Vendas é: %s\n\nUse-a no aplicativo para entrar. Depois altere em Perfil, se quiser.\n", temporary)
	if host == "" || from == "" {
		log.Printf("SMTP não configurado; senha temporária para %s: %s", to, temporary)
		return nil
	}
	msg := strings.Join([]string{
		"From: " + from,
		"To: " + to,
		"Subject: Nova senha do Controle de Vendas",
		"MIME-Version: 1.0",
		"Content-Type: text/plain; charset=UTF-8",
		"",
		body,
	}, "\r\n")
	addr := net.JoinHostPort(host, strconv.Itoa(port))
	auth := smtp.PlainAuth("", user, pass, host)
	if err := smtp.SendMail(addr, auth, from, []string{to}, []byte(msg)); err != nil {
		// STARTTLS fallback via implicit TLS on 465
		if port == 465 {
			return sendMailTLS(addr, host, user, pass, from, to, []byte(msg))
		}
		return err
	}
	return nil
}

func sendMailTLS(addr, host, user, pass, from, to string, msg []byte) error {
	tlsCfg := &tls.Config{ServerName: host}
	conn, err := tls.Dial("tcp", addr, tlsCfg)
	if err != nil {
		return err
	}
	defer conn.Close()
	c, err := smtp.NewClient(conn, host)
	if err != nil {
		return err
	}
	defer c.Close()
	if user != "" {
		if err := c.Auth(smtp.PlainAuth("", user, pass, host)); err != nil {
			return err
		}
	}
	if err := c.Mail(from); err != nil {
		return err
	}
	if err := c.Rcpt(to); err != nil {
		return err
	}
	w, err := c.Data()
	if err != nil {
		return err
	}
	if _, err := w.Write(msg); err != nil {
		return err
	}
	if err := w.Close(); err != nil {
		return err
	}
	return c.Quit()
}
