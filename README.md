# Controle de Vendas — Beauty Brasil SJC

Aplicativo de controle de vendas e gestão de clientes, feito para uso no celular com funcionamento **offline-first**. Os dados ficam no próprio aparelho; internet só entra na busca de CEP e no compartilhamento de backup.

No **Android**, instale o APK e use sem computador. No **iOS**, por enquanto o app ainda abre pelo Safari com o computador (ou um site) servindo a página — gerar um arquivo para a App Store exige um Mac e conta de desenvolvedor Apple.

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

## Instalar no Android (sem computador)

O arquivo pronto para instalar está em:

`release/ControleDeVendas.apk`

Depois de instalado, o app **não precisa do computador**. Ele abre pelo ícone **Controle de Vendas**, guarda clientes e vendas no celular e só usa internet para buscar CEP ou enviar backup.

### Como instalar no celular

1. Copie `ControleDeVendas.apk` para o Android (cabo USB, Google Drive, WhatsApp, e-mail, cartão SD, etc.).
2. Abra o arquivo no celular (app **Arquivos** ou o próprio Drive/WhatsApp).
3. Se o Android avisar que o app veio de uma fonte desconhecida: **Ajustes → Aplicativos → Acesso especial → Instalar apps desconhecidos** (o nome varia conforme a marca) e permita o Chrome, Drive ou Arquivos.
4. Toque em **Instalar** e depois em **Abrir**.
5. Na primeira leitura de código de barras, permita o uso da **câmera**.

Requisitos: Android 7 ou superior. Este APK é de desenvolvimento (assinado em modo debug), adequado para uso interno da clínica. Não está na Play Store.

### Gerar o APK de novo (no computador de desenvolvimento)

Pré-requisitos: Node.js 22+, JDK 21 e Android SDK.

```bash
npm install
export JAVA_HOME=/caminho/do/jdk-21
export ANDROID_HOME=/caminho/do/Android/Sdk
npm run android:apk
```

O arquivo atualizado sai em `release/ControleDeVendas.apk`.

## Como executar no computador (desenvolvimento)

Pré-requisito: Node.js 22+.

```bash
npm install
npm run dev
```

Abra `http://localhost:5173` no próprio computador.

Para gerar só os arquivos web:

```bash
npm run build
npm run preview
```

## Android ou iOS pelo navegador (precisa de um servidor)

Use isto só para testar na rede local, **sem instalar o APK**. O computador precisa permanecer ligado, com `npm run dev` (ou `npm run preview`) em execução.

1. Celular e computador na **mesma rede Wi-Fi** (não use o 4G/5G do telefone).
2. No computador, anote o endereço **Network** (por exemplo `http://192.168.30.5:5173`).
3. **Android:** abra o **Chrome**, digite o endereço e toque em **Entrar**. Opcional: menu **⋮** → **Adicionar à tela inicial**.
4. **iPhone / iPad:** abra o **Safari**, digite o endereço e toque em **Entrar**. Para atalho: **Compartilhar** → **Adicionar à Tela de Início**.

Se a página não abrir: confirme o Wi-Fi, desative VPN e libere a porta `5173` no firewall do computador. O IP muda se o computador reconectar à rede.

No iPhone, a câmera (código de barras) costuma ser bloqueada em páginas `http://` da rede local. Digite o código manualmente. A foto do produto pela galeria continua disponível.

Um aplicativo iOS independente (como o APK no Android) ainda não está neste repositório: a geração de IPA exige Xcode em um Mac e conta Apple Developer.

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
- Capacitor 8 (APK Android)
- Dexie (persistência local)
- html5-qrcode (código de barras e QR Code)
- ViaCEP (HTTP REST)

O documento original de requisitos está em `docs/Prompt controle de vendas.txt`. As artes da marca estão em `docs/`.

## Estrutura

```
src/             telas, banco local, CEP, backup e relatórios
public/          logo e manifesto PWA
android/         projeto nativo gerado pelo Capacitor
release/         APK para instalar no celular (ControleDeVendas.apk)
scripts/         build-apk.sh — gera o APK de novo
```
