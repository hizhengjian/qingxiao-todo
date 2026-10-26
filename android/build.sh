#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
export JAVA_HOME="${JAVA_HOME:-/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home}"
export PATH="$JAVA_HOME/bin:$PATH"
SDK="${ANDROID_HOME:?Set ANDROID_HOME to your Android SDK directory}"
BT="$SDK/build-tools/35.0.0"
KEY_PASSWORD="${QINGXIAO_KEYSTORE_PASSWORD:?Set QINGXIAO_KEYSTORE_PASSWORD from the internal resource ledger}"
KEYSTORE_PATH="${QINGXIAO_KEYSTORE_PATH:-signing/release.jks}"
if [ ! -f "$KEYSTORE_PATH" ]; then echo "Signing key missing: set QINGXIAO_KEYSTORE_PATH to the existing release key." >&2; exit 1; fi
mkdir -p build/classes build/dex build/gen
"$BT/aapt2" compile --dir res -o build/res.zip
"$BT/aapt2" link -o build/base.apk --manifest AndroidManifest.xml -I "$SDK/platforms/android-35/android.jar" --java build/gen -A assets build/res.zip
javac -encoding UTF-8 -source 8 -target 8 -bootclasspath "$SDK/platforms/android-35/android.jar:$BT/core-lambda-stubs.jar" -d build/classes src/cn/nemo/qingxiao/*.java build/gen/cn/nemo/qingxiao/R.java
jar cf build/classes.jar -C build/classes .
"$BT/d8" --lib "$SDK/platforms/android-35/android.jar" --min-api 26 --output build/dex build/classes.jar
cp build/base.apk build/unsigned.apk
(cd build/dex && zip -q -u ../unsigned.apk classes.dex)
"$BT/zipalign" -f 4 build/unsigned.apk build/aligned.apk
"$BT/apksigner" sign --ks "$KEYSTORE_PATH" --ks-pass env:QINGXIAO_KEYSTORE_PASSWORD --out build/qingxiao-todo-2.9.0.apk build/aligned.apk
"$BT/apksigner" verify --verbose build/qingxiao-todo-2.9.0.apk
shasum -a 256 build/qingxiao-todo-2.9.0.apk
