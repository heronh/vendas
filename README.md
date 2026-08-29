# Controle de Vendas — Beauty Brasil SJC

Aplicativo de controle de vendas e gestão de clientes, feito para uso no celular com funcionamento **offline-first**. Os dados ficam no próprio aparelho; internet só entra na busca de CEP e no compartilhamento de backup.

Marca: **Beauty Brasil SJC · Estética e Bem-Estar** (São José dos Campos).

Este repositório reúne três aplicações. Cada pasta tem um README com instruções específicas:

| Pasta | Função | Estado |
| --- | --- | --- |
| [android](android/README.md) | Aplicativo Android (APK / Capacitor) | Implementado |
| [ios](ios/README.md) | Aplicativo iPhone / iPad | Reservado (ainda sem código) |
| [host](host/README.md) | Host Go + Postgres (senha, produtos, sync Wi-Fi) | Implementado |

## O que o app faz

| Tela | Função |
| --- | --- |
| Entrada | Logo em destaque e botão **Entrar**, sem senha (modo provisório) |
| Menu | Acesso a cliente, produto, lista, relatórios, backup e perfil |
| Cadastro de cliente | Nome, fantasia, empresa, telefone, e-mail e endereço com **Buscar CEP** (ViaCEP) |
| Cadastro de produto | Descrição, fornecedor, custo, venda, código de barras/QR (digitado ou câmera) e foto |
| Lista de clientes | Busca e ordenação por nome, saldo devedor, atalhos para lançar, editar e ver resumo |
| Lançamentos | Autocomplete de produto, scanner, quantidade, valor unitário editável e data/hora |
| Conta corrente | Saldo devedor (vendas − pagamentos), registro de abates e histórico unificado |
| Relatórios | Filtros *mês corrente* e *últimos 30 dias*, totais e rankings |
| Backup | Exportar JSON, cadastrar servidor local e restaurar em outro aparelho |
| Perfil | Dados da profissional/clínica neste dispositivo |

Com exceção da tela de entrada, as demais telas usam o logo da Beauty Brasil como marca d’água.

## Plataformas

- **Android:** instale o APK em `android/release/ControleDeVendas.apk`. Depois de instalado, o app **não precisa do computador**. Veja [android/README.md](android/README.md).
- **iOS:** ainda não há aplicativo nativo neste repositório. Gerar IPA exige Xcode em um Mac e conta Apple Developer. Enquanto isso, o fluxo web pode ser aberto no Safari (veja abaixo).
- **Host:** Postgres via Docker e `go run .` em `host`. A página pede senha; o celular Android cadastra o servidor com o código de 6 dígitos. iOS ainda sem app. Veja [host/README.md](host/README.md).

## Como executar no computador (desenvolvimento)

Pré-requisito: Node.js 22+. Os comandos do app implementado ficam em `android`:

```bash
cd android
npm install
npm run dev
```

Abra `http://localhost:5173` no próprio computador.

## Android ou iOS pelo navegador (precisa de um servidor)

Use isto só para testar na rede local, **sem instalar o APK**. O computador precisa permanecer ligado, com `npm run dev` (ou `npm run preview`) em execução em `android`.

1. Celular e computador na **mesma rede Wi-Fi** (não use o 4G/5G do telefone).
2. No computador, anote o endereço **Network** (por exemplo `http://192.168.30.5:5173`).
3. **Android:** abra o **Chrome**, digite o endereço e toque em **Entrar**. Opcional: menu **⋮** → **Adicionar à tela inicial**.
4. **iPhone / iPad:** abra o **Safari**, digite o endereço e toque em **Entrar**. Para atalho: **Compartilhar** → **Adicionar à Tela de Início**.

Se a página não abrir: confirme o Wi-Fi, desative VPN e libere a porta `5173` no firewall do computador. O IP muda se o computador reconectar à rede.

No iPhone, a câmera (código de barras) costuma ser bloqueada em páginas `http://` da rede local. Digite o código manualmente. A foto do produto pela galeria continua disponível.

## Uso no dia a dia

1. Cadastre os produtos do catálogo (procedimentos, kits, etc.).
2. Cadastre os clientes. No CEP, toque em **Buscar CEP** para preencher logradouro, bairro, cidade e UF.
3. Na lista, abra **Lançar** para registrar uma venda. O valor unitário vem do cadastro e pode ser alterado.
4. Em **Ver**, acompanhe o saldo e registre pagamentos/abates.
5. Em **Relatórios**, veja faturamento, recebimentos e rankings do período.
6. Em **Backup**, gere o arquivo JSON e envie por WhatsApp, e-mail ou nuvem. No aparelho novo, use **Selecionar arquivo** para restaurar.

Saldo devedor = total de vendas do cliente − total de pagamentos. Os rankings de saldo usam esse valor atual; volume de compras e produtos mais vendidos respeitam o filtro de período.

## Dados e privacidade

- No celular, os dados ficam localmente (IndexedDB / SQLite). O host em `host` guarda produtos (locais e sincronizados) e o backup enviado pelos aparelhos no Postgres.
- O backup é um JSON legível com clientes, produtos, vendas, pagamentos e perfil.
- A restauração **substitui** a base atual do aparelho.
- A consulta de CEP usa a API pública [ViaCEP](https://viacep.com.br).

## Stack (app Android)

- React 18 + TypeScript + Vite
- Capacitor 8 (APK Android)
- Dexie (persistência local)
- html5-qrcode (código de barras e QR Code)
- ViaCEP (HTTP REST)

O documento original de requisitos está em `docs/Prompt controle de vendas.txt`. As artes da marca estão em `docs/`.
