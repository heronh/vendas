# Controle de Vendas — API Go + Postgres

Servidor do catálogo e da sincronização: autenticação por senha na página, produtos no Postgres remoto e API HTTPS/JSON para os celulares.

Em produção a API roda no **Cloud Run** (projeto GCP `beautysales`) com **Cloud SQL**. O host não sobe Postgres local nem Docker de banco: `DATABASE_URL` aponta sempre para o Postgres remoto.

O aplicativo **Android** cadastra o usuário pelo e-mail e a nuvem com o código de 6 dígitos. O **iOS** ainda não tem app; a API (`/api/discover`, `/api/pair`, `/api/sync`, `/api/device`) fica pronta para o mesmo fluxo.

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

A senha inicial do **admin** vem de `HOST_PASSWORD`. Depois da primeira troca na página `/senha`, o hash fica no Postgres (`host_settings`) e passa a valer no lugar do secret. Essa senha não é a dos usuários do aplicativo móvel.

## Desenvolvimento local

Pré-requisitos: Go 1.22+. Use o **mesmo Postgres remoto** da produção (secret `vendas-database-url`). Não há container de banco neste repositório.

```bash
cd host
export HOST_PASSWORD='000000'
export DATABASE_URL="$(gcloud secrets versions access latest --secret=vendas-database-url)"
go run .
```

Se o Cloud SQL não aceitar conexão direta do seu computador, use o [Cloud SQL Auth Proxy](https://cloud.google.com/sql/docs/postgres/connect-auth-proxy) apontando para a instância `beautysales:us-central1:starter-postgres-db` e coloque em `DATABASE_URL` o endereço do proxy.

Abra `http://127.0.0.1:3847`. Com senha `000000`, o login do admin cai na tela de troca com um alerta. Variáveis opcionais: `PORT` (padrão `3847`), `SESSION_SECRET`, `PAIRING_CODE` (se vazio, um código novo é gerado a cada processo). `DATABASE_URL` é obrigatória.

## Páginas do admin

| Rota | Função |
| --- | --- |
| `/login` | Senha do admin (não é a senha dos usuários do aplicativo) |
| `/senha` | Troca da senha do admin. Obrigatória quando a senha atual é `000000` |
| `/` | Início: código de pareamento e atalhos |
| `/produtos` | Catálogo (cadastro no servidor não é lançamento) |
| `/clientes` | Clientes dos usuários **liberados**, só leitura |
| `/relatorios` | Totais e rankings gerais |
| `/relatorios/celular` | Mesmas métricas por usuário/aparelho |
| `/administracao` | Liberar, bloquear e redefinir senha do aplicativo para `000000` |

O host não registra venda nem pagamento. A liberação do sincronismo é **manual** e feita pelo admin. O identificador do usuário do aplicativo é o **e-mail**.

## API dos celulares

| Rota | Função |
| --- | --- |
| `GET /api/discover` | Identificação da API |
| `POST /api/pair` | Cadastra o usuário pelo e-mail com `enabled=false` e devolve o token |
| `GET/POST /api/device` | Situação (`enabled`, `passwordReset`, `email`) e aviso de senha trocada |
| `POST /api/sync` | Envia e recebe clientes, produtos, vendas e pagamentos. Só com usuário liberado |

## O que fica no banco

| Tabela | Origem |
| --- | --- |
| `products` | Catálogo **comum**: admin e todos os celulares liberados lêem e incluem itens novos |
| `clients`, `sales`, `payments` | Só do usuário do aplicativo (`device_id`). O admin vê, mas um celular não recebe os de outro |
| `devices` | Pareamento por e-mail, `enabled` (padrão false) e flag de reset de senha |
| `host_settings` | Hash da senha do admin |

Na sincronização o servidor devolve o catálogo **completo** de produtos (tabela comum) e só os clientes, vendas e pagamentos daquele e-mail. O celular importa produtos novos ou atualizados e não recebe lançamentos de outros usuários.
