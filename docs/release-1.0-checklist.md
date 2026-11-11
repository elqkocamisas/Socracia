# Checklist de cierre — Socracia 1.0.0 (NO-GO)

Sprints restantes para convertir el dictamen NO-GO en GO, ordenados por **camino
crítico**. Cada uno declara objetivo, tareas, puerta de aceptación, tamaño
(S/M/L), dependencias y responsable (agente o humano).

Contexto (2026-11-11): el proceso mayéutico funciona de extremo a extremo y
**G1, G2, G3, G4, G5, G6 y G9 están en verde** (evidencia en
`docs/release-1.0-verdict.md`). En esta sesión se corrigió el error reportado «al
adjuntar el temario y pulsar Estudiar» (D-074: extracción de conceptos de
temarios sin líneas en blanco y en forma de índice), se **completó el motor
mayéutico con modelo** (D-075: el backend servía `llm: null` y `/llm/complete`
respondía 503, así que la repregunta caía a las plantillas y la explicación no
aparecía) y se **re-verificó G3** con proveedor real (33 casos, 83.3 % / 100 % /
0 citas). Queda, como camino crítico:

- **D-075 desplegado, repregunta validada** (Sprint 2): el PR #20 se fusionó en
  `main` y Render `autoDeploy` redesplegó (`/health` en `f25e0087…`,
  `provider.configured: true`). La **repregunta** con el modelo devolvió 200 con
  `parseFollowUp.ok: true`. La **explicación** devolvió un 200 truncado a 18 tokens
  que no se pudo reproducir antes de agotar la cuota gratuita; queda como Sprint 2
  (reproducir y, si se confirma, corregir).
- **G7** (APK por EAS): el build `f2173e7a…` «Succeeded» es **anterior a D-074 y
  D-075**, así que hay que **recompilar** con el perfil `release-apk`. Requiere
  `EXPO_TOKEN` (humano) o lanzar el workflow de Actions.
- **G8** (smoke en dispositivo): **humano**. Puede empezar con el APK local, pero
  el smoke definitivo necesita el APK recompilado.

G3 y G7 (build previo) quedaron cumplidos en sesiones anteriores; el **PR #19 se
fusionó en `main`** (fast-forward `be140bc` → `c24373b`) con despliegue automático
de Render. Se conservan abajo las fichas como registro.

## Camino crítico hacia 1.0

| #   | Sprint                    | Objetivo                                                                      | Puerta       | Tamaño | Depende de   | Responsable         | Estado                |
| --- | ------------------------- | ----------------------------------------------------------------------------- | ------------ | ------ | ------------ | ------------------- | --------------------- |
| 1   | Restaurar G3              | Reponer una clave de proveedor válida (solo servidor) y repetir el arnés real | **G3**       | S      | Clave válida | **Humano**          | ✅ hecho (2026-11-11) |
| 2   | Desplegar D-075           | Servir repregunta y explicación del modelo por `/llm/complete` (hoy 503)      | G2/G3 (real) | S      | Ninguna      | **Humano**          | ⏳ pendiente          |
| 3   | Recompilar el APK de EAS  | Producir el APK de lanzamiento con D-074 y D-075 (keystore: ya existe)        | **G7**       | S      | `EXPO_TOKEN` | Agente + **humano** | ⏳ pendiente          |
| 4   | Inspección del APK de EAS | Confirmar que no hay secretos en el APK firmado de EAS                        | **G5** (APK) | S      | #3           | Agente              | ⏳ (al recompilar)    |
| 5   | Smoke test en dispositivo | Ejecutar el checklist manual en un teléfono real                              | **G8**       | M      | #3 (APK EAS) | **Humano**          | ⏳ pendiente          |

> El APK local (`dist/socracia-1.0.0.apk`) permite adelantar el Sprint 4, pero
> **solo valida el modo heurístico** si se compiló sin
> `EXPO_PUBLIC_CLOUD_PROCESSING=1`. Para ejercer el modo conectado hace falta un
> APK con la variable y un backend con clave válida (Sprint 1).

---

## Sprint 1 — Restaurar G3 (evals con proveedor real) · **✅ hecho**

- **Objetivo:** volver a tener evidencia real de que el motor semántico responde
  dentro de los umbrales de G3.
- **Resultado (2026-11-10):** la variable `GEMINI_API_KEY` del servicio de Render
  contenía un valor que no era una clave de Gemini (secreto hexadecimal de 32
  caracteres). Se reemplazó por una **clave válida** vía API de Render y se
  redesplegó. `npm run eval:real` superó los umbrales: **33 casos**, veredicto
  **83.3 %**, paráfrasis **100 %**, citas inventadas **0**. Evidencia en
  `docs/release-1.0-g3-evidence.txt`.
- **Contexto histórico:** antes de reponer la clave, el arnés devolvía
  **400 «Please pass a valid API key»** (`/health` decía `configured: true`, que
  no implica `valid`), y G3 quedaba «no verificada».
- **Tareas:**
  1. **(Humano)** Obtener una clave válida del proveedor en su **nivel gratuito**
     (coste cero; ver `docs/free-stack.md`) y guardarla **solo** como variable de
     entorno del servidor (Render → Environment). Nunca en el cliente.
  2. **(Humano)** Redesplegar el backend para que tome la variable.
  3. **(Agente/Humano)** Ejecutar
     `SOCRA_REAL_EVAL_BASE_URL=https://socracia.onrender.com npm run eval:real`.
  4. **(Agente)** Adjuntar la salida real a `docs/release-1.0-g3-evidence.txt`.
- **Puerta de aceptación:** ≥30 casos, concordancia de veredicto ≥80 %,
  paráfrasis aceptadas ≥90 %, 0 citas inventadas.
- **Tamaño:** S.
- **Dependencias:** una clave de proveedor válida (coste cero) y el backend
  desplegado con el código de 1.0.
- **Responsable:** **humano** (obtener/desplegar la clave); agente (ejecutar el
  arnés y registrar la evidencia).

## Sprint 2 — Validar la explicación del modelo en real (D-075) · **⏳ pendiente**

- **Objetivo:** cerrar la última mitad del motor mayéutico con modelo: la
  **explicación** (`explicar`) por `/llm/complete`, ya desplegada pero no validada.
- **Contexto:** el PR #20 se fusionó en `main` y Render `autoDeploy` redesplegó
  (`/health` en `f25e0087…`, `provider.configured: true`; `/llm/complete` ya no
  responde 503). La **repregunta** se validó en real (200, `parseFollowUp.ok`). La
  **explicación** devolvió **un** 200 truncado a 18 tokens (`completionTokens: 18`,
  `"```json\n{\n  \"explanation\": \"¡No te preocupes, vamos a"`), que
  `parseExplanation` rechaza; **no se pudo reproducir** antes de agotar la cuota
  gratuita. `max_tokens` 400/1024/2048 dieron idéntico porque la clave de caché
  **no incluye `maxTokens`** (fueron aciertos de caché), así que la causa sigue
  **sin confirmar**.
- **Tareas:**
  1. **(Agente/Humano)** Con la cuota repuesta, reproducir con **prompt limpio**
     (distinto en cada intento) y `temperature: 0`: registrar `usage` y el texto
     crudo.
  2. **(Agente)** Si se confirma el truncado, corregirlo (revisar gasto en
     razonamiento interno del modelo; subir `DEFAULT_EXPLAINER_OPTIONS.maxTokens`
     y/o ampliar la clave de caché con `maxTokens`), con prueba que lo fije.
  3. **(Agente/Humano)** Re-ejecutar `npm run eval:real` y adjuntar la salida.
- **Puerta de aceptación:** la explicación real produce JSON válido que
  `parseExplanation` acepta (cita tomada de un pasaje enviado).
- **Tamaño:** S.
- **Dependencias:** cuota gratuita de Gemini disponible (Sprint 1).
- **Responsable:** agente (reproducir y corregir); humano si hay que esperar cuota.

## Sprint 3 — Recompilar el APK de EAS (G7) · **⏳ pendiente**

- **Objetivo:** generar el APK de lanzamiento con el perfil `release-apk`,
  **incluyendo los arreglos D-074** (extracción de conceptos) **y D-075**
  (repregunta y explicación del modelo).
- **Contexto:** existe un build previo `f2173e7a…` «Succeeded» (workflow
  `eas-build.yml` sobre `main` @ `962e8fa`), pero es **anterior a D-074** y no
  sirve para el smoke definitivo. No se pudo recompilar en la sesión del
  2026-11-11 porque **`EXPO_TOKEN` no está disponible** como variable de entorno
  (solo vive como secreto de GitHub Actions).
- **Comandos exactos (humano):**
  ```bash
  # Opción A — terminal del propietario con EXPO_TOKEN en el entorno:
  cd apps/mobile
  npx eas-cli build --platform android --profile release-apk --non-interactive

  # Opción B — sin token local: GitHub → Actions → «Expo EAS» → Run workflow,
  # perfil release-apk, plataforma android (usa el secreto EXPO_TOKEN de Actions).

  # Descargar e instalar:
  npx eas-cli build:download --profile release-apk --platform android
  adb install -r socracia-1.0.0.apk
  ```
- **Tareas:**
  1. **(Humano)** Lanzar el build (opción A o B) y esperar a que termine (free
     tier: cola de baja prioridad).
  2. **(Humano)** Descargar el APK.
  3. **(Agente)** Inspeccionar el APK de EAS en busca de secretos (Sprint 4).
- **Puerta de aceptación:** APK descargable, con `versionName 1.0.0` y el
  `versionCode` asignado por EAS en remoto (`appVersionSource: remote`).
- **Tamaño:** S.
- **Dependencias:** `EXPO_TOKEN` (o el workflow de Actions); keystore ya existente
  (`TnBsQO-OGA`); cuota gratuita de EAS disponible (verificado el 2026-11-11 en
  <https://expo.dev/pricing>: **15 builds Android + 15 iOS** de baja prioridad al
  mes, reset mensual).
- **Responsable:** agente (preparar/configurar) + **humano** (lanzar con token,
  descarga).
- **Respaldo si la cuota está agotada:** compilar en local con
  `docs/build-apk-local.md` (JDK 21, SDK 36). No cuenta como G7 «APK por EAS»,
  pero permite el smoke test.

## Sprint 4 — Inspección del APK de EAS (G5 sobre el artefacto remoto) · **✅ hecho**

- **Objetivo:** confirmar que el APK firmado de EAS no contiene secretos.
- **Resultado (2026-11-11):** APK del build `b19ef0a8…` (sobre `main` @ `1ca235c`)
  descargado (75.6 MB) y escaneado con `zipfile` (1158 entradas): **0** `AIza`,
  **0** `AQ.` (Gemini), **0** `sk-…`, **0** JWT, **0** clave privada, **0**
  `github_pat_`, **0** `rnd_`. El bundle incrusta `https://socracia.onrender.com`
  y `CLOUD_PROCESSING` (modo conectado correcto).
- **Tareas:**
  1. **(Agente)** Extraer el APK de EAS (`zipfile`) y pasar `strings`/regex sobre
     el bundle JavaScript y los recursos.
  2. **(Agente)** Buscar patrones de clave (`AIza`, `GEMINI_API_KEY`, `sk-`,
     `eyJ`, `api_key`) y confirmar 0 coincidencias relevantes.
  3. **(Agente)** Registrar el resultado en el dictamen.
- **Puerta de aceptación:** 0 secretos en el APK firmado de EAS.
- **Tamaño:** S.
- **Dependencias:** Sprint 3.
- **Responsable:** agente.

## Sprint 5 — Smoke test en dispositivo (G8)

- **Objetivo:** validar la app completa en un teléfono Android real.
- **Tareas:**
  1. **(Humano)** Instalar el APK (`adb install -r socracia-1.0.0.apk`).
  2. **(Humano)** Ejecutar `docs/release-1.0-smoke.md` de principio a fin,
     marcando cada casilla con evidencia.
  3. **(Humano)** Reportar incidencias; **(agente)** corregir los defectos que
     bloqueen el recorrido y repetir.
- **Puerta de aceptación:** checklist APTO, sin incidencias bloqueantes.
- **Tamaño:** M.
- **Dependencias:** Sprint 3 (APK de EAS). Para validar el modo conectado, la
  repregunta y la explicación, además los Sprints 1 y 2 (clave válida y D-075
  desplegado).
- **Responsable:** **humano**.

---

## Riesgos abiertos (resumen)

- **G3 cerrada (2026-11-11):** clave válida y arnés superado (33 casos,
  83.3 % / 100 % / 0 citas). Riesgo residual de reproducibilidad: el arnés no
  reintenta el 502 por _timeout_ y Render (free) sufre _cold start_; conviene
  calentar el servicio antes de la suite (de 3 intentos, 1 falló por frío).
- **G7 a recompilar (2026-11-11):** el build `f2173e7a…` es anterior a D-074.
  Hace falta recompilar con `release-apk`; `EXPO_TOKEN` no está en el entorno del
  agente (es un secreto de Actions), así que es paso humano.
- **Cuota de EAS:** 15 builds Android + 15 iOS al mes en el plan gratuito
  (verificado 2026-11-11 en <https://expo.dev/pricing>). Reservar al menos una;
  usar la ruta local si se agota.
- **Descarga del APK de EAS:** el enlace del artefacto no es público; exige sesión
  de Expo del propietario o `npx eas-cli build:download`.
- **APK local:** valida el modo heurístico; para el conectado hace falta la
  variable de build y un backend con clave válida. Además, el APK local actual es
  **anterior a D-074**.
- **Recalibración del RAG:** si se adopta un proveedor semántico real, revisar
  `DEFAULT_RELEVANCE.minScore` (hoy 0.2, calibrado para el proveedor léxico).
- **Textos legales:** coherentes con el comportamiento, pero pendientes de
  revisión humana antes de publicar.

---

## Hoja de ruta 1.1 — multitenencia (sprints 1 a 9)

> **No se toca ahora.** Se documenta para trazabilidad. La multitenencia se añade
> **apagada por defecto** (D-055): sin `MULTITENANT=on`, el comportamiento es el
> de 1.0. Detalle de puntos de inserción en `docs/recon-multitenant.md`.

| Sprint | Tema                      | Entregable principal                                                                  | Puerta de aceptación                                                         |
| ------ | ------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| 1      | Persistencia              | Adaptador Postgres (Neon) tras `ProgressStore`; migraciones versionadas               | Progreso sobrevive a un reinicio del backend                                 |
| 2      | Núcleo de tenencia        | Middleware de resolución de tenant; `AsyncLocalStorage` por petición                  | Dos tenants no se ven entre sí                                               |
| 3      | Identidad y roles         | Rol y `tenantId` en la sesión                                                         | Un rol no puede actuar fuera de su tenant                                    |
| 4      | Catálogo de contenidos    | Decidir catálogo por comunidad o único                                                | Catálogo etiquetado y consultable por tenant                                 |
| 5      | Onboarding de tenant      | Alta de organización y código de academia (D-054)                                     | Alta completa sin intervención manual                                        |
| 6      | Cuotas, BYOK y privacidad | BYOK por tenant (D-057), cuotas, 429 y degradación; proveedor admite datos de alumnos | Cuota agotada → heurística, sin romper sesión; revisión humana del proveedor |
| 7      | Panel docente             | Vista de progreso por aula                                                            | El docente ve solo su tenant                                                 |
| 8      | Facturación (puerto)      | Puerto con adaptador simulado                                                         | Pasarela real queda documentada como opcional                                |
| 9      | Legal multitenencia       | Contrato de encargado, consentimientos de menores                                     | Textos revisados por asesoría jurídica                                       |

**Invariantes que la 1.1 no puede romper:** las firmas públicas de
`packages/core` no cambian; los tests existentes pasan sin modificarse; sin
`MULTITENANT=on` el comportamiento es idéntico al de 1.0.
