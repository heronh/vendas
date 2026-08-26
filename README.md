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

## Como executar

Pré-requisito: Node.js 22+.

```bash
npm install
npm run dev
```

Abra o endereço local (em geral `http://localhost:5173`) no navegador do computador ou no celular na mesma rede.

Para gerar os arquivos estáticos:

```bash
npm run build
npm run preview
```

No Android ou iOS, abra o endereço no Chrome/Safari e use **Adicionar à tela inicial** para usar como aplicativo (PWA).

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
