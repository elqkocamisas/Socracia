# Compilar la APK en local

`eas build` es el camino corto, pero exige cuenta y cuota. Esta guía compila una
**APK de release** con las herramientas locales, sin depender de EAS ni de la
nube. Sirve para verificar que el proyecto empaqueta de verdad y para probar en
un dispositivo por USB.

Reproducido en Debian 13 (trixie), x86-64, con 4 CPU y 16 GB de RAM.

## 1. Requisitos

- **JDK 21.** Debian no empaqueta el 17 en trixie; el 21 lo acepta AGP 8.x.
- **Android SDK:** `platform-tools`, `platforms;android-36` y
  `build-tools;36.0.0`.
- Node 22 y las dependencias del monorepo (`npm ci`).

```bash
sudo apt-get install -y unzip openjdk-21-jdk-headless

export ANDROID_HOME=/opt/android-sdk
sudo mkdir -p "$ANDROID_HOME/cmdline-tools"
sudo chown -R "$(id -u):$(id -g)" "$ANDROID_HOME"
cd "$ANDROID_HOME/cmdline-tools"
curl -sSLo cmdline.zip \
  https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip
unzip -q cmdline.zip && rm -rf latest && mv cmdline-tools latest

export JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64
yes | "$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" --licenses
"$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" \
  "platform-tools" "platforms;android-36" "build-tools;36.0.0"
```

## 2. Generar el proyecto nativo y compilar

`android/` no se versiona (`.gitignore`), se regenera en cada compilación:

```bash
cd apps/mobile
npx expo prebuild --platform android --no-install

cd android
GRADLE_USER_HOME=/tmp/gradle-home ./gradlew assembleRelease --no-daemon
```

La primera compilación compila C++ para las cuatro ABIs y tarda unos **10
minutos**. Sale:

```
apps/mobile/android/app/build/outputs/apk/release/app-release.apk
```

## 3. Comprobar el artefacto

```bash
export PATH="$ANDROID_HOME/build-tools/36.0.0:$PATH"
APK=apps/mobile/android/app/build/outputs/apk/release/app-release.apk

aapt2 dump badging "$APK" | grep -E "^package|targetSdk|native-code"
unzip -t "$APK"                                  # integridad del ZIP
apksigner verify --print-certs "$APK"            # firma
```

Resultado esperado: `com.socracia.app`, `versionName 0.1.0`, `targetSdk 36`,
cuatro ABIs (`arm64-v8a`, `armeabi-v7a`, `x86`, `x86_64`) y **sin** permisos de
cámara, ubicación ni contactos.

## 4. Límites de este procedimiento

- **Firma de depuración.** Con `assembleRelease` sobre un prebuild limpio, Gradle
  firma con la clave de depuración: el APK vale para probar, **no** para
  publicar. Para subir a Play hay que definir un keystore propio o usar
  `eas build --profile production`, que produce AAB firmado.
- **Sin verificación en dispositivo.** En este entorno no hay `/dev/kvm`, así que
  no se pudo arrancar un emulador. La APK se validó por contenido y firma, no
  ejecutándola. Antes de enviar a revisión, instálela en un teléfono real.
- **`prebuild` toca `package.json`.** Cambia los scripts `android`/`ios` a
  `expo run:*`. Revise `git status` y descarte ese cambio si no lo quiere.
- **CI.** No se compila aquí (decisión D-029). Esta guía es para ejecución
  manual; automatizarla es trabajo aparte.
