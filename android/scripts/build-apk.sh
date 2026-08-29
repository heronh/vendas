#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export JAVA_HOME="${JAVA_HOME:-/tmp/jdk-dist/jdk-21}"
export ANDROID_HOME="${ANDROID_HOME:-/home/heron/Android/Sdk}"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export PATH="$JAVA_HOME/bin:${PATH:-}"

if [ ! -x "$JAVA_HOME/bin/java" ]; then
  echo "JDK 21 não encontrado em JAVA_HOME=$JAVA_HOME"
  exit 1
fi
if [ ! -d "$ANDROID_HOME" ]; then
  echo "Android SDK não encontrado em ANDROID_HOME=$ANDROID_HOME"
  exit 1
fi

mkdir -p "$ROOT/android"
printf 'sdk.dir=%s\n' "$ANDROID_HOME" > "$ROOT/android/local.properties"

cd "$ROOT"
npm run android:sync
cd "$ROOT/android"
./gradlew assembleDebug --no-daemon
mkdir -p "$ROOT/release"
cp -f "$ROOT/android/app/build/outputs/apk/debug/app-debug.apk" "$ROOT/release/ControleDeVendas.apk"
echo "APK gerado em $ROOT/release/ControleDeVendas.apk"
