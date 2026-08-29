# Controle de Vendas — API Go + Postgres

Servidor do catálogo e da sincronização: autenticação por senha na página, produtos no Postgres e API HTTPS/JSON para os celulares.

Em produção a API roda no **Cloud Run** (projeto GCP `beautysales`) com **Cloud SQL**. No computador, o mesmo binário sobe com Docker + Postgres local.

O aplicativo **Android** cadastra a nuvem com o código de 6 dígitos. O **iOS** ainda não tem app; a API (`/api/discover`, `/api/pair`, `/api/sync`) fica pronta para o mesmo fluxo.

## Produção (Cloud Run)

```bash
cd host
bash deploy.sh
```

A URL HTTPS, o código de pareamento e a senha da página ficam no Cloud Run / Secret Manager:

```bash
gcloud run services describe vendas-api --region=us-central1 --format='value(status.url)'
gcloud secrets versions access latest --secret=vendas-pairing-code
gcloud secrets versions access latest --secret=vendas-host-password
```

## Desenvolvimento local

Pré-requisitos: Go 1.22+, Docker.

```bash
cd host
docker compose up -d
export HOST_PASSWORD='sua-senha'
export DATABASE_URL='postgres://vendas:vendas@127.0.0.1:5432/vendas?sslmode=disable'
go run .
```

Abra `http://127.0.0.1:3847`. Variáveis opcionais: `PORT` (padrão `3847`), `SESSION_SECRET`, `PAIRING_CODE` (se vazio, um código novo é gerado a cada processo).

## O que fica no banco

| Tabela | Origem |
| --- | --- |
| `products` | Criados na página (`source = local`) ou enviados pelos celulares (`source = phone`) |
| `clients`, `sales`, `payments` | Backup recebido na sincronização |
| `device_tokens` | Tokens após o pareamento |

Na sincronização o servidor devolve o catálogo completo de produtos; o celular importa os que ainda não tem.
