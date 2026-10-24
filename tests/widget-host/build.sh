#!/usr/bin/env bash
# Isolated QA APK, never included in the release APK or installed on a real user's phone.
set -euo pipefail
cd "$(dirname "$0")"
BT="${ANDROID_HOME:?Set ANDROID_HOME}/build-tools/35.0.0"
PLATFORM="$ANDROID_HOME/platforms/android-35/android.jar"
mkdir -p build/classes build/dex
"$BT/aapt2" link --manifest AndroidManifest.xml -I "$PLATFORM" -o build/base.apk
javac -encoding UTF-8 -source 8 -target 8 -bootclasspath "$PLATFORM:$BT/core-lambda-stubs.jar" -d build/classes HostActivity.java
jar cf build/classes.jar -C build/classes .
"$BT/d8" --lib "$PLATFORM" --min-api 26 --output build/dex build/classes.jar
cp build/base.apk build/unsigned.apk
(cd build/dex && zip -q -u ../unsigned.apk classes.dex)
if [ ! -f build/qa.jks ]; then keytool -genkeypair -keystore build/qa.jks -storepass android -keypass android -alias qa -keyalg RSA -validity 30 -dname CN=EmulatorQA; fi
"$BT/zipalign" -f 4 build/unsigned.apk build/aligned.apk
"$BT/apksigner" sign --ks build/qa.jks --ks-pass pass:android --out build/widget-host.apk build/aligned.apk
