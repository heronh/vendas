# Controle de Vendas — host Go + Postgres

Servidor para o computador da clínica: autenticação por senha na página, catálogo de produtos no Postgres e sincronização com os celulares na mesma rede Wi-Fi.

O aplicativo **Android** já cadastra este host (código de 6 dígitos). O **iOS** ainda não tem app; a API (`/api/discover`, `/api/pair`, `/api/sync`) fica pronta para o mesmo fluxo.

## Pré-requisitos

- Go 1.22+
- Docker (Postgres)
- Celular e computador na mesma Wi-Fi

## Como executar

```bash
cd host
docker compose up -d
export HOST_PASSWORD='sua-senha'
export DATABASE_URL='postgres://vendas:vendas@127.0.0.1:5432/vendas?sslmode=disable'
go run .
```

Abra `http://IP-DO-COMPUTADOR:3847`, entre com `HOST_PASSWORD` e use o código de 6 dígitos em **Backup e sincronização** no Android.

Variáveis opcionais: `PORT` (padrão `3847`), `SESSION_SECRET` (se vazio, a sessão reinicia a cada processo).

## O que fica no banco

| Tabela | Origem |
| --- | --- |
| `products` | Criados na página do host (`source = local`) ou enviados pelos celulares (`source = phone`) |
| `clients`, `sales`, `payments` | Backup recebido na sincronização |
| `device_tokens` | Tokens após o pareamento |

Na sincronização o host devolve o catálogo completo de produtos; o celular importa os que ainda não tem.
