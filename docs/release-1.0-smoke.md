# Checklist de prueba manual en dispositivo — Socracia 1.0.0

Prueba de humo para ejecutar en un **teléfono Android real** con el APK de
lanzamiento. Marca cada casilla con la evidencia observada (captura, nota o
«OK»). Si algo falla, anota el paso exacto y detente: no continúes como si
hubiera pasado.

- **Build:** `release-apk` (APK, distribución interna). Hay un **APK 1.0.0 ya
  compilado en local** (`dist/socracia-1.0.0.apk`, `com.socracia.app`, firmado
  con clave de depuración) que sirve para este smoke test sin esperar a EAS.
- **Versión esperada:** `1.0.0` (el `versionCode` lo asigna EAS en remoto; el
  APK local trae `versionCode 1`)
- **Preparación:** instala el APK (`adb install -r socracia-1.0.0.apk`) y abre la
  app con el dispositivo **sin conexión** para el bloque 1.

## 0. Preparación

- [ ] El APK se instala sin errores de firma.
- [ ] La app abre y muestra la pantalla de biblioteca («Adjuntar temario»).
- [ ] En Ajustes, el modo de procesamiento aparece como **solo-dispositivo** por
      defecto.

## 1. Importación local (sin red)

- [ ] Con el dispositivo en modo avión, adjunta un **TXT** de temario.
- [ ] El documento aparece en la biblioteca con su título.
- [ ] Adjunta un **MD** con encabezados `## Tema 1. …`.
- [ ] Adjunta un **PDF con texto real** (no un escaneo de imagen).
- [ ] Los tres documentos muestran un número de conceptos coherente con su
      contenido (no cero, no desproporcionado).

## 2. Sesión mayéutica

- [ ] Pulsa «Estudiar» sobre un documento: aparece una pregunta.
- [ ] La pregunta muestra **Fuente:** con el título del documento y un
      fragmento del temario.
- [ ] Responde con tus propias palabras una respuesta **correcta**: el veredicto
      es «Correcto».
- [ ] En otra pregunta, responde algo **incorrecto**: aparece «Pista para
      pensar» (andamiaje) que **no** revela la respuesta.
- [ ] Insiste con respuestas incorrectas: tras varios fallos aparece
      **«Te lo explico»** con una explicación y su cita.
- [ ] Ninguna pista ni explicación contradice el temario adjunto.

## 3. Progreso y repaso

- [ ] Al terminar la sesión, «Ver progreso» abre el resumen.
- [ ] El **Dominio** mostrado concuerda con lo que respondiste (sube si
      acertaste, baja si fallaste).
- [ ] El **perfil de lagunas** señala los conceptos fallados.
- [ ] El **repaso programado** lista el concepto fallado para una fecha futura.

## 4. Persistencia

- [ ] Cierra la app por completo (quítala de recientes) y vuelve a abrirla.
- [ ] El documento sigue en la biblioteca.
- [ ] El progreso (evaluaciones, lagunas y repaso) sigue intacto.
- [ ] Puedes iniciar una sesión nueva sobre el mismo documento sin reimportar.

## 5. Degradación (modo local, sin cuenta)

- [ ] Sin iniciar sesión, el asistente con modelo no está disponible.
- [ ] Todas las funciones del bloque 2 siguen operativas con la heurística.
- [ ] Con el dispositivo sin red, ninguna pantalla se queda colgada ni muestra
      un error bloqueante.

## 6. Asistente con modelo (opcional, requiere cuenta y consentimiento)

> Solo si dispones de un backend con `GEMINI_API_KEY` configurada y una cuenta.

- [ ] Tras iniciar sesión y activar el asistente en Ajustes, una respuesta
      correcta parafraseada se acepta como «Correcto».
- [ ] Al revocar el permiso, el asistente deja de usarse de inmediato (vuelve a
      la heurística) sin reiniciar la app.

## 7. Cierre

- [ ] El borrado de un documento elimina su texto, su progreso y sus lagunas.
- [ ] No aparece ningún permiso sensible (cámara, ubicación, contactos) en la
      ficha de la app del sistema.
- [ ] La app funciona completa sin cuenta y sin conexión.

---

**Resultado:** ☐ APTO · ☐ NO APTO

**Notas y evidencia:**

```
(fecha, dispositivo, versión de Android, incidencias)
```

## Cómo generar el APK

### Ruta local (ya ejecutada; produce un APK instalable de inmediato)

No necesita cuenta ni cuota; firma con la clave de depuración (vale para probar,
no para publicar). Ver [`docs/build-apk-local.md`](build-apk-local.md):

```bash
cd apps/mobile
npx expo prebuild --platform android --no-install --clean
cd android
EXPO_PUBLIC_API_BASE_URL=https://socracia-api.onrender.com \
  EXPO_PUBLIC_CLOUD_PROCESSING=1 \
  GRADLE_USER_HOME=/tmp/gradle-home ./gradlew assembleRelease --no-daemon
# Sale en app/build/outputs/apk/release/app-release.apk (copiado a dist/socracia-1.0.0.apk)
```

> Las variables `EXPO_PUBLIC_*` se **incrustan en el bundle** en el momento de
> compilar; no son secretos. `EXPO_PUBLIC_API_BASE_URL` apunta al backend y
> `EXPO_PUBLIC_CLOUD_PROCESSING=1` habilita el asistente con modelo (siempre con
> cuenta y consentimiento). Sin ellas, el APK usa `localhost:8787` y el motor
> queda en modo heurístico local.

### Ruta EAS (APK «oficial» de lanzamiento)

Primera vez (requiere paso humano: el primer keystore de Android **no** se puede
crear en modo no interactivo):

```bash
cd apps/mobile
npx eas-cli login           # con la cuenta de Expo del propietario
npx eas-cli build --profile release-apk --platform android
# En el primer build, EAS pedirá generar el keystore: acepta (modo interactivo).
```

Builds siguientes (ya con credenciales en EAS, modo no interactivo posible):

```bash
cd apps/mobile
EXPO_TOKEN=... npx eas-cli build --profile release-apk --platform android --non-interactive
```

Descarga e instala:

```bash
npx eas-cli build:download --profile release-apk --platform android
adb install -r socracia-1.0.0.apk
```

El plan gratuito de EAS incluye una cantidad limitada de builds de baja prioridad
al mes (se reinician el día 1; sin sobrecoste). Verifica el consumo en Expo →
Billing → Usage antes de lanzar. Si la cuota está agotada, usa la ruta local de
[`docs/build-apk-local.md`](build-apk-local.md).
