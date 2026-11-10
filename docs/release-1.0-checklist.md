# Checklist de cierre — Socracia 1.0.0 (NO-GO)

Sprints restantes para convertir el dictamen NO-GO en GO, ordenados por **camino
crítico**. Cada uno declara objetivo, tareas, puerta de aceptación, tamaño
(S/M/L), dependencias y responsable (agente o humano).

Contexto (2026-11-10): el proceso mayéutico funciona de extremo a extremo y
**G1, G2, G4, G5, G6 y G9 están en verde** (evidencia en
`docs/release-1.0-verdict.md`). En esta sesión se corrigió además un defecto de
operatividad del motor con modelo: el fallo del proveedor semántico ya no rompe
la sesión, degrada a la heurística (D-072). Siguen abiertos, y son el camino
crítico:

- **G3** (evals con proveedor real): la clave del backend desplegado ya **no es
  válida** (400 «Please pass a valid API key»), así que la puerta queda **no
  verificada** y **bloquea el GO**. Es el bloqueo principal.
- **G7** (APK «oficial» por EAS): no verificable desde este entorno (sin
  `EXPO_TOKEN`); requiere paso humano si el keystore no existe.
- **G8** (smoke en dispositivo): humano; puede empezar con el APK local, que solo
  valida el modo heurístico.

## Camino crítico hacia 1.0

| #   | Sprint                    | Objetivo                                                                      | Puerta       | Tamaño | Depende de   | Responsable         |
| --- | ------------------------- | ----------------------------------------------------------------------------- | ------------ | ------ | ------------ | ------------------- |
| 1   | Restaurar G3              | Reponer una clave de proveedor válida (solo servidor) y repetir el arnés real | **G3**       | S      | Clave válida | **Humano**          |
| 2   | Build de EAS              | Producir el APK de lanzamiento (keystore: paso humano la primera vez)         | **G7**       | S      | Cuota Expo   | Agente + **humano** |
| 3   | Inspección del APK de EAS | Confirmar que no hay secretos en el APK firmado de EAS                        | **G5** (APK) | S      | #2           | Agente              |
| 4   | Smoke test en dispositivo | Ejecutar el checklist manual en un teléfono real                              | **G8**       | M      | #2 (APK EAS) | **Humano**          |

> El APK local (`dist/socracia-1.0.0.apk`) permite adelantar el Sprint 4, pero
> **solo valida el modo heurístico** si se compiló sin
> `EXPO_PUBLIC_CLOUD_PROCESSING=1`. Para ejercer el modo conectado hace falta un
> APK con la variable y un backend con clave válida (Sprint 1).

---

## Sprint 1 — Restaurar G3 (evals con proveedor real) · **bloqueante**

- **Objetivo:** volver a tener evidencia real de que el motor semántico responde
  dentro de los umbrales de G3.
- **Contexto:** el arnés `npm run eval:real` contra el backend desplegado devuelve
  **400 «Please pass a valid API key»**: la clave configurada en Render ya no es
  válida (`/health` dice `configured: true`, que no implica `valid`). Sin clave
  real, G3 queda «no verificada» y **bloquea el GO**.
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

## Sprint 2 — Build de EAS (G7)

- **Objetivo:** generar el APK de lanzamiento con el perfil `release-apk`.
- **Contexto:** en esta sesión **no** se pudo lanzar `eas build` porque el entorno
  no tiene `EXPO_TOKEN` y el artefacto de EAS no es público. El perfil ya está
  preparado (D-059/D-067/D-071). El primer keystore de Android, si no existe, no
  se puede generar en modo no interactivo: la documentación vigente de Expo
  indica «you will be prompted to generate credentials».
- **Tareas:**
  1. **(Humano)** Si no existe keystore, ejecutar una vez en modo interactivo:
     `cd apps/mobile && npx eas-cli login && npx eas-cli build --profile release-apk --platform android`
     y aceptar la generación del keystore.
  2. **(Agente/Humano)** Builds siguientes en no interactivo:
     `EXPO_TOKEN=... npx eas-cli build --profile release-apk --platform android --non-interactive`.
  3. **(Humano)** Descargar el APK
     (`npx eas-cli build:download --profile release-apk --platform android`).
- **Puerta de aceptación:** APK descargable, con `versionName 1.0.0` y el
  `versionCode` asignado por EAS en remoto (`appVersionSource: remote`).
- **Tamaño:** S.
- **Dependencias:** cuenta de Expo con acceso al proyecto; cuota gratuita de EAS
  disponible (verificado el 2026-11-04 en <https://expo.dev/pricing>: **15 builds
  Android + 15 iOS** de baja prioridad al mes, reset mensual).
- **Responsable:** agente (preparar/configurar) + **humano** (keystore, login,
  descarga).
- **Respaldo si la cuota está agotada:** compilar en local con
  `docs/build-apk-local.md` (JDK 21, SDK 36). No cuenta como G7 «APK por EAS»,
  pero permite el smoke test.

## Sprint 3 — Inspección del APK de EAS (G5 sobre el artefacto remoto)

- **Objetivo:** confirmar que el APK firmado de EAS no contiene secretos.
- **Contexto:** G5 ya está en verde para el APK local (0 coincidencias); falta
  repetirlo sobre el artefacto de EAS cuando exista.
- **Tareas:**
  1. **(Agente)** Extraer el APK de EAS (`zipfile`) y pasar `strings`/regex sobre
     el bundle JavaScript y los recursos.
  2. **(Agente)** Buscar patrones de clave (`AIza`, `GEMINI_API_KEY`, `sk-`,
     `eyJ`, `api_key`) y confirmar 0 coincidencias relevantes.
  3. **(Agente)** Registrar el resultado en el dictamen.
- **Puerta de aceptación:** 0 secretos en el APK firmado de EAS.
- **Tamaño:** S.
- **Dependencias:** Sprint 2.
- **Responsable:** agente.

## Sprint 4 — Smoke test en dispositivo (G8)

- **Objetivo:** validar la app completa en un teléfono Android real.
- **Tareas:**
  1. **(Humano)** Instalar el APK (`adb install -r socracia-1.0.0.apk`).
  2. **(Humano)** Ejecutar `docs/release-1.0-smoke.md` de principio a fin,
     marcando cada casilla con evidencia.
  3. **(Humano)** Reportar incidencias; **(agente)** corregir los defectos que
     bloqueen el recorrido y repetir.
- **Puerta de aceptación:** checklist APTO, sin incidencias bloqueantes.
- **Tamaño:** M.
- **Dependencias:** Sprint 2 (APK de EAS). Para validar el modo conectado y el
  OCR, además el Sprint 1 (clave válida).
- **Responsable:** **humano**.

---

## Riesgos abiertos (resumen)

- **G3 no reproducida (bloqueante):** la clave del backend desplegado ya no es
  válida; sin evidencia real, la puerta queda «no verificada». Reponer clave y
  repetir el arnés.
- **G7 no verificable desde el entorno del agente:** falta `EXPO_TOKEN`; el
  primer keystore, si no existe, exige interactividad humana.
- **Cuota de EAS:** 15 builds Android + 15 iOS al mes en el plan gratuito
  (verificado 2026-11-04). Reservar al menos una; usar la ruta local si se agota.
- **Descarga del APK de EAS:** el enlace del artefacto no es público; exige sesión
  de Expo del propietario o `npx eas-cli build:download`.
- **APK local:** valida el modo heurístico; para el conectado hace falta la
  variable de build y un backend con clave válida.
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
