# Checklist de cierre — Socracia 1.0.0 (NO-GO)

Sprints restantes para convertir el dictamen NO-GO en GO, ordenados por **camino
crítico**. Cada uno declara objetivo, tareas, puerta de aceptación, tamaño
(S/M/L), dependencias y responsable (agente o humano).

Contexto (2026-11-12): el proceso mayéutico funciona de extremo a extremo y
**G1, G2, G3, G4, G5, G6 y G9 están en verde** (evidencia en
`docs/release-1.0-verdict.md`). En esta sesión se **re-verificó G3** con proveedor
real (30/30 evaluación, **80.0 % / 100 % / 0 citas**) tras **corregir el
instrumento** (D-077: el arnés abortaba la corrida ante un 429 informativo o un
502 de salida irregular, descartando la evidencia ya recogida), se **inspeccionó
el APK nuevo** (G5: 0 secretos) y se compiló en local un **APK al día**
(`dist/socracia-1.0.0-local-d076.apk`, con D-074/D-075/D-076 y modo conectado).
El NO-GO se sostiene **solo** en dos puertas, ambas humanas:

- **G7** (APK por EAS): el build `f2173e7a…` «Succeeded» es **anterior a D-074,
  D-075 y D-076**, así que hay que **recompilar** con el perfil `release-apk`.
  Requiere `EXPO_TOKEN` (o el workflow de Actions) y, si no existiera keystore, una
  corrida interactiva. No se pudo hacer aquí: **`EXPO_TOKEN` no está disponible**
  y el primer keystore **no se genera en no interactivo** (docs oficiales Expo).
- **G8** (smoke en dispositivo): **humano**. Puede empezar ya con el APK local al
  día; el smoke definitivo necesita el APK de EAS recompilado.

> **EAS lanzado el 2026-11-14 (en curso).** Con un token con permiso de escritura
> se empujó `main` (`ed0b1b5 → c554f9f`, incluye D-076) y se disparó el workflow
> `Expo EAS` (run `43610275031`, `success`) con perfil `release-apk`, plataforma
> `android`, `--no-wait`. El build quedó **en cola en EAS**:
> [`efbcfa72-68ea-44ea-8b3e-ca33337bb478`](https://expo.dev/accounts/camiseros-team/projects/socracia/builds/efbcfa72-68ea-44ea-8b3e-ca33337bb478).
> Falta la **descarga e instalación** del artefacto (paso humano con sesión de
> Expo) y el smoke test (G8). El APK local al día
> (`dist/socracia-1.0.0-local-d076.apk`) permite adelantar el smoke mientras tanto.

## Camino crítico hacia 1.0

| #   | Sprint                         | Objetivo                                                             | Puerta       | Tamaño | Depende de           | Responsable         | Estado                |
| --- | ------------------------------ | -------------------------------------------------------------------- | ------------ | ------ | -------------------- | ------------------- | --------------------- |
| 1   | Restaurar G3                   | Reponer una clave de proveedor válida y repetir el arnés real        | **G3**       | S      | Clave válida         | Humano              | ✅ hecho (2026-11-12) |
| 2   | Arreglar el instrumento G3     | No confundir caso fallido con proveedor caído (429/502 informativos) | **G3**       | S      | —                    | Agente              | ✅ hecho (2026-11-12) |
| 3   | Validar la explicación (D-075) | Reproducir/cerrar el truncado de la explicación del modelo           | G2/G3 (real) | S      | Cuota del proveedor  | Agente + humano     | ⏳ pendiente          |
| 4   | Recompilar el APK de EAS       | Producir el APK de lanzamiento con D-074/D-075/D-076                 | **G7**       | S      | `EXPO_TOKEN`         | Agente + **humano** | ⏳ pendiente          |
| 5   | Inspección del APK             | Confirmar que no hay secretos en el APK                              | **G5**       | S      | APK                  | Agente              | ✅ hecho (APK local)  |
| 6   | Smoke test en dispositivo      | Ejecutar el checklist manual en un teléfono real                     | **G8**       | M      | #4 (APK EAS) o local | **Humano**          | ⏳ pendiente          |

> El APK local al día (`dist/socracia-1.0.0-local-d076.apk`) **sí** trae
> `EXPO_PUBLIC_CLOUD_PROCESSING=1` y apunta a `https://socracia.onrender.com`, así
> que permite adelantar el Sprint 6 en modo conectado, no solo heurístico. No es el
> artefacto de EAS (firma de depuración): no sirve para publicar ni sustituye a G7.

---

## Sprint 1 — Restaurar G3 (evals con proveedor real) · **✅ hecho**

- **Objetivo:** volver a tener evidencia real de que el motor semántico responde
  dentro de los umbrales de G3.
- **Resultado (2026-11-12):** `npm run eval:real` contra
  `https://socracia.onrender.com` superó los umbrales: **30/30** casos de
  evaluación, concordancia **80.0 %** (≥80 %), paráfrasis **100 %** (≥90 %), citas
  inventadas **0**. Evidencia en `docs/release-1.0-g3-evidence.txt`.
- **Contexto histórico:** el 2026-11-10 la variable `GEMINI_API_KEY` del servicio
  de Render contenía un valor que no era una clave de Gemini; se repuso por una
  válida vía API de Render y se redesplegó.
- **Puerta de aceptación:** ≥30 casos, concordancia de veredicto ≥80 %,
  paráfrasis aceptadas ≥90 %, 0 citas inventadas. **Cumplida.**
- **Tamaño:** S.
- **Responsable:** humano (clave/despliegue); agente (ejecutar el arnés).

## Sprint 2 — Arreglar el instrumento G3 (D-077) · **✅ hecho**

- **Objetivo:** que el arnés no descarte la evidencia real por un fallo transitorio
  o de un solo caso.
- **Resultado (2026-11-12):** `scripts/eval-real.mjs` distingue **cuota**
  (reintenta), **salida irregular** (reintenta y, si persiste, cuenta como caso
  fallido) y **proveedor caído** (503 o cuota diaria agotada → «no verificada»). Un
  429 en las categorías informativas (repregunta/explicación) ya no aborta la
  corrida. Decisión: D-077.
- **Puerta de aceptación:** la suite completa G3 aunque una categoría informativa
  dé 429. **Cumplida** (G3 alcanzada con la ruta `/llm/complete` en 429).
- **Tamaño:** S.
- **Responsable:** agente.

## Sprint 3 — Validar la explicación del modelo en real (D-075) · **⏳ pendiente**

- **Objetivo:** cerrar la última mitad del motor mayéutico con modelo: la
  **explicación** (`explicar`) por `/llm/complete`, ya desplegada pero no validada
  con un 200 limpio.
- **Contexto:** el PR #20 se fusionó en `main` y Render `autoDeploy` redesplegó
  (`/llm/complete` ya no responde 503). La **repregunta** se validó en real (200,
  `parseFollowUp.ok`). La **explicación** devolvió **un** 200 truncado a 18 tokens
  que `parseExplanation` rechaza; **no se pudo reproducir** antes de agotar la
  cuota. Además, `/llm/complete` usa **un solo modelo** (sin rotación), así que al
  agotar su cuota diaria gratuita devuelve 429 constante —comportamiento que la
  app degrada a la heurística, pero que impide validar la ruta con modelo—.
- **Tareas:**
  1. **(Humano)** Reponer la cuota del proveedor (o esperar al día siguiente).
  2. **(Agente)** Reproducir con **prompt limpio** (distinto en cada intento) y
     `temperature: 0`: registrar `usage` y el texto crudo.
  3. **(Agente, mejora recomendada)** Hacer que `/llm/complete` rote modelos de
     respaldo como `/mayeutic/*` (`apps/api/src/mayeutic.ts` ya lo hace), para que
     la repregunta y la explicación no dependan de un único modelo. Si se confirma
     el truncado, revisar el gasto en razonamiento interno del modelo y ajustar
     `maxTokens`/clave de caché.
- **Puerta de aceptación:** la explicación real produce JSON válido que
  `parseExplanation` acepta (cita tomada de un pasaje enviado).
- **Tamaño:** S.
- **Dependencias:** cuota gratuita del proveedor disponible.
- **Responsable:** agente (reproducir y corregir); humano para reponer cuota.

## Sprint 4 — Recompilar el APK de EAS (G7) · **⏳ pendiente**

- **Objetivo:** generar el APK de lanzamiento con el perfil `release-apk`,
  **incluyendo D-074** (extracción de conceptos), **D-075** (repregunta y
  explicación del modelo) y **D-076** (índices cortos y listas numeradas).
- **Contexto:** el build previo `f2173e7a…` «Succeeded» es **anterior** a esos
  arreglos. No se pudo recompilar porque **`EXPO_TOKEN` no está disponible** como
  variable de entorno (vive como secreto de GitHub Actions) y el primer keystore
  de Android **no se genera en modo no interactivo** (verificado en
  <https://docs.expo.dev/app-signing/managed-credentials/>, 2026-11-02). En este
  proyecto el keystore **ya existe** (`Build Credentials TnBsQO-OGA`), así que el
  paso es no interactivo una vez hay token.
- **Comandos exactos (humano):**
  ```bash
  # Opción A — terminal del propietario con EXPO_TOKEN en el entorno:
  cd apps/mobile
  npx eas-cli login                # solo la primera vez
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
  3. **(Agente)** Inspeccionar el APK de EAS en busca de secretos (Sprint 5).
- **Puerta de aceptación:** APK descargable, con `versionName 1.0.0` y el
  `versionCode` asignado por EAS en remoto (`appVersionSource: remote`).
- **Tamaño:** S.
- **Dependencias:** `EXPO_TOKEN` (o el workflow de Actions); keystore ya existente
  (`TnBsQO-OGA`); cuota gratuita de EAS disponible (plan gratuito: builds de baja
  prioridad **al mes**, reset el día 1; verificado en
  <https://docs.expo.dev/billing/plans/> y `/billing/faq/`, 2026-11-02).
- **Responsable:** agente (preparar/configurar) + **humano** (lanzar con token,
  descarga).
- **Respaldo si la cuota está agotada:** compilar en local con
  `docs/build-apk-local.md` (JDK 21, SDK 36). No cuenta como G7 «APK por EAS»,
  pero permite el smoke test.

## Sprint 5 — Inspección del APK (G5) · **✅ hecho (sobre el APK local al día)**

- **Objetivo:** confirmar que el APK no contiene secretos.
- **Resultado (2026-11-12):** escaneo con `zipfile` de
  `dist/socracia-1.0.0-local-d076.apk` (**1162 entradas**): **0** `AIza…`, **0**
  `sk-…`, **0** `github_pat_`, **0** JWT, **0** clave privada, **0** `api_key`
  literal. El bundle incrusta `https://socracia.onrender.com` y **no**
  `localhost:8787`. Pendiente repetir el escaneo sobre el APK de EAS del Sprint 4.
- **Puerta de aceptación:** 0 secretos en el APK. **Cumplida** (APK local);
  re-ejecutar sobre el de EAS.
- **Tamaño:** S.
- **Responsable:** agente.

## Sprint 6 — Smoke test en dispositivo (G8) · **⏳ pendiente**

- **Objetivo:** validar la app completa en un teléfono Android real.
- **Tareas:**
  1. **(Humano)** Instalar el APK
     (`adb install -r socracia-1.0.0-local-d076.apk`, o el de EAS tras el Sprint 4).
  2. **(Humano)** Ejecutar `docs/release-1.0-smoke.md` de principio a fin,
     marcando cada casilla con evidencia.
  3. **(Humano)** Reportar incidencias; **(agente)** corregir los defectos que
     bloqueen el recorrido y repetir.
- **Puerta de aceptación:** checklist APTO, sin incidencias bloqueantes.
- **Tamaño:** M.
- **Dependencias:** APK instalable (el local al día ya sirve para empezar; el de
  EAS tras el Sprint 4). Para ejercer repregunta y explicación **con modelo**,
  además el Sprint 3.
- **Responsable:** **humano**.

---

## Riesgos abiertos (resumen)

- **G3 cerrada (2026-11-12):** clave válida, instrumento corregido (D-077) y arnés
  superado (30/30, 80.0 % / 100 % / 0 citas). Riesgo residual: la concordancia
  **roza el umbral** (≥80 %) y varía por el muestreo; conviene calentar Render
  (_cold start_) antes de la suite.
- **G7 a recompilar (2026-11-12):** el build `f2173e7a…` es anterior a
  D-074/D-075/D-076. `EXPO_TOKEN` no está en el entorno del agente (es un secreto
  de Actions), así que es paso humano. El primer keystore no se genera en no
  interactivo.
- **Cuota de EAS:** plan gratuito con builds de baja prioridad **al mes**, reset el
  día 1, sin sobrecoste (verificado 2026-11-02). Reservar al menos una; usar la
  ruta local si se agota.
- **Repregunta/explicación con un único modelo:** `/llm/complete` no rota modelos;
  al agotarse la cuota diaria devuelve 429 y la app degrada a la heurística. No
  bloquea G3 ni el funcionamiento (F2 lo exige así), pero limita la mitad «con
  modelo» de esas dos tareas. Mejora recomendada en el Sprint 3.
- **Descarga del APK de EAS:** el enlace del artefacto no es público; exige sesión
  de Expo del propietario o `npx eas-cli build:download`.
- **APK local:** el actual (`local-d076`) **sí** trae modo conectado y D-074/075/076;
  sirve para el smoke, pero no para publicar (firma de depuración).
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
