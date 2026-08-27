# Controle de Vendas — app Android

Aplicação implementada para Android (Capacitor). Internet só entra na busca de CEP, no compartilhamento de backup e na sincronização com o host na rede Wi-Fi local (`../app-host`).

Instruções comuns a todas as aplicações estão no [README da raiz](../README.md).

## Instalar no Android (sem computador)

O APK pronto está em:

`release/ControleDeVendas.apk`

1. Copie o APK para o celular (USB, Drive, WhatsApp, e-mail, etc.).
2. Abra o arquivo no celular.
3. Se o Android avisar fonte desconhecida: **Ajustes → Aplicativos → Acesso especial → Instalar apps desconhecidos** e permita o app usado para abrir o arquivo.
4. Toque em **Instalar** e depois em **Abrir**.
5. Na primeira leitura de código de barras, permita a **câmera**.

Requisitos: Android 7 ou superior. APK de desenvolvimento (assinado em modo debug), para uso interno. Não está na Play Store.

## Desenvolvimento neste diretório

Pré-requisitos: Node.js 22+, JDK 21 e Android SDK.

```bash
cd app-android
npm install
npm run dev
```

Abra `http://localhost:5173`.

Build web:

```bash
npm run build
npm run preview
```

Gerar o APK:

```bash
cd app-android
export JAVA_HOME=/caminho/do/jdk-21
export ANDROID_HOME=/caminho/do/Android/Sdk
npm run android:apk
```

O arquivo sai em `app-android/release/ControleDeVendas.apk`.

## Estrutura

```
src/             telas, banco local, CEP, backup e relatórios
public/          logo e manifesto PWA
android/         projeto nativo gerado pelo Capacitor
release/         APK para instalar (ControleDeVendas.apk)
scripts/         build-apk.sh
```
