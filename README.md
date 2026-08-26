# Controle de Vendas — Beauty Brasil SJC

Aplicativo de controle de vendas e gestão de clientes, feito para uso no celular (Android e iOS) com funcionamento **offline-first**. Os dados ficam no próprio aparelho; internet só entra na busca de CEP e no compartilhamento de backup.

Marca: **Beauty Brasil SJC · Estética e Bem-Estar** (São José dos Campos).

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
| Backup | Exportar JSON local, compartilhar e restaurar em outro aparelho |
| Perfil | Dados da profissional/clínica neste dispositivo |

Com exceção da tela de entrada, as demais telas usam o logo da Beauty Brasil como marca d’água.

## Como executar no computador

Pré-requisito: Node.js 22+.

```bash
npm install
npm run dev
```

O Vite imprime dois endereços. Use `http://localhost:5173` no próprio computador. A linha **Network** (por exemplo `http://192.168.30.5:5173`) é a que o celular deve abrir.

Para gerar os arquivos estáticos e servir o build:

```bash
npm run build
npm run preview
```

O computador precisa permanecer ligado, com o comando `npm run dev` (ou `npm run preview`) em execução, enquanto o celular usa o app nesta rede.

## Como rodar no celular Android

1. Celular e computador na **mesma rede Wi-Fi** (não use o 4G/5G do telefone).
2. No computador, rode `npm run dev` e anote o endereço **Network** (IP da máquina + porta `5173`).
3. No Android, abra o **Chrome** (não use o navegador do Instagram/WhatsApp).
4. Digite o endereço, por exemplo `http://192.168.30.5:5173`, e toque em **Entrar**.
5. Na primeira vez, permita o acesso à câmera se for usar o leitor de código de barras.
6. Para usar como aplicativo, no Chrome toque no menu **⋮** → **Adicionar à tela inicial** (ou **Instalar aplicativo**). Confirme. O ícone **Vendas** aparece junto dos outros apps e abre em tela cheia.

Se a página não abrir: confirme o Wi-Fi, desative VPN, e no computador libere a porta `5173` no firewall. O IP muda se o computador reconectar à rede — neste caso, rode `npm run dev` de novo e use o endereço novo.

## Como rodar no celular iOS (iPhone / iPad)

1. iPhone e computador na **mesma rede Wi-Fi**.
2. No computador, rode `npm run dev` e anote o endereço **Network**.
3. No iOS, abra o **Safari** (o atalho na tela inicial só funciona bem a partir do Safari).
4. Digite o endereço, por exemplo `http://192.168.30.5:5173`, e toque em **Entrar**.
5. Para instalar: toque em **Compartilhar** (quadrado com seta) → **Adicionar à Tela de Início** → **Adicionar**. Abra o ícone **Vendas** na tela inicial para usar em modo aplicativo.

No iPhone, a câmera (código de barras) costuma ser bloqueada em páginas `http://` da rede local. Nesse caso, digite o código manualmente no cadastro de produto ou no lançamento. A foto do produto pela galeria continua disponível.

Em **Ajustes → Safari**, permita o site se o iOS pedir permissão de câmera ou de dados do site.

## Uso no dia a dia

1. Cadastre os produtos do catálogo (procedimentos, kits, etc.).
2. Cadastre os clientes. No CEP, toque em **Buscar CEP** para preencher logradouro, bairro, cidade e UF.
3. Na lista, abra **Lançar** para registrar uma venda. O valor unitário vem do cadastro e pode ser alterado.
4. Em **Ver**, acompanhe o saldo e registre pagamentos/abates.
5. Em **Relatórios**, veja faturamento, recebimentos e rankings do período.
6. Em **Backup**, gere o arquivo JSON e envie por WhatsApp, e-mail ou nuvem. No aparelho novo, use **Selecionar arquivo** para restaurar.

Saldo devedor = total de vendas do cliente − total de pagamentos. Os rankings de saldo usam esse valor atual; volume de compras e produtos mais vendidos respeitam o filtro de período.

## Dados e privacidade

- Tudo é gravado localmente (IndexedDB / SQLite do navegador). Não há servidor de negócio.
- O backup é um JSON legível com clientes, produtos, vendas, pagamentos e perfil.
- A restauração **substitui** a base atual do aparelho.
- A consulta de CEP usa a API pública [ViaCEP](https://viacep.com.br).

## Stack

- React 18 + TypeScript + Vite
- Dexie (persistência local)
- html5-qrcode (código de barras e QR Code)
- ViaCEP (HTTP REST)

O documento original de requisitos está em `docs/Prompt controle de vendas.txt`. As artes da marca estão em `docs/`.

## Estrutura

```
src/
  screens/       telas do fluxo
  components/    layout, marca d’água e scanner
  services/      CEP, backup e relatórios
  db.ts          banco local
public/          logo e manifesto PWA
```
