# Checklist de cierre — Socracia 1.0.0 (NO-GO)

Sprints restantes para convertir el dictamen NO-GO en GO, ordenados por **camino
crítico**. Cada uno declara objetivo, tareas, puerta de aceptación, tamaño
(S/M/L), dependencias y responsable (agente o humano).

Contexto: el proceso mayéutico funciona de extremo a extremo y **G1, G2, G3, G4,
G5, G6 y G9 están en verde**. Ya existe un **APK 1.0.0 instalable compilado en
local** (`dist/socracia-1.0.0.apk`), de modo que **G8 queda desbloqueado**. Siguen
abiertos **G7** (APK «oficial» por EAS, pendiente del primer keystore interactivo)
y el **redespliegue de Render** para que el motor semántico funcione de verdad en
el APK.

## Camino crítico hacia 1.0

| #   | Sprint                    | Objetivo                                                         | Puerta       | Tamaño | Depende de     | Responsable |
| --- | ------------------------- | ---------------------------------------------------------------- | ------------ | ------ | -------------- | ----------- |
| 0   | Integrar y redesplegar    | Fusionar el PR #18 y redesplegar Render con el código de 1.0     | (motor real) | S      | PAT escritura  | **Humano**  |
| 1   | Primer build de EAS       | Generar el keystore inicial y producir el APK de lanzamiento EAS | **G7**       | M      | Cuenta Expo    | **Humano**  |
| 2   | Inspección del APK final  | Confirmar que no hay secretos en el APK firmado                  | **G5** (APK) | S      | #1             | Agente      |
| 3   | Smoke test en dispositivo | Ejecutar el checklist manual en un teléfono real                 | **G8**       | M      | #0 (APK local) | **Humano**  |

> El APK local (`dist/socracia-1.0.0.apk`) ya permite hacer el Sprint 3 sin
> esperar al Sprint 1. El Sprint 1 solo es necesario para el APK «oficial» de EAS.

---

## Sprint 0 — Integrar y redesplegar (motor semántico real)

- **Objetivo:** que el APK hable con un backend que ejecute el código de 1.0.
- **Tareas:**
  1. **(Humano)** Empujar los commits locales y fusionar el **PR #18** (con un PAT
     con permiso de escritura; el token de este entorno es de solo lectura).
  2. **(Humano)** Render → servicio `socracia-api` → _Manual Deploy_ (o dejar que
     Auto-Deploy lo dispare la fusión de `main`).
  3. **(Agente/Humano)** Comprobar `GET /health`:
     `{"status":"ok","version":"1.0.0","commit":"…","provider":{"configured":true,...}}`.
- **Puerta de aceptación:** `/health` informa `version 1.0.0` y
  `provider.configured: true`; el APK responde con el motor semántico (con cuenta
  y consentimiento).
- **Tamaño:** S.
- **Dependencias:** PAT con escritura de contenidos y pull requests.
- **Responsable:** **humano**.

> Sin este paso, el APK funciona en **modo heurístico local** (que es una
> degradación correcta y probada), pero no ejerce el proveedor semántico real.

---

## Sprint 1 — Primer build de EAS (G7)

- **Objetivo:** generar el APK de lanzamiento con el perfil `release-apk`.
- **Tareas:**
  1. **(Humano)** `cd apps/mobile && npx eas-cli login` con la cuenta de Expo del
     propietario (`camiseros-team`).
  2. **(Humano)** `npx eas-cli build --profile release-apk --platform android`.
     En el **primer** build, EAS pedirá **generar el keystore de Android**:
     aceptar en modo interactivo. _(El primer keystore no se puede crear con
     `--non-interactive`: es un comportamiento documentado de `eas-cli`.)_
  3. **(Humano)** Anotar la URL del build y descargar el APK.
  4. **(Agente, opcional)** Si aparece un fallo de configuración, corregir
     `eas.json`/`app.json` y volver a lanzar.
- **Puerta de aceptación:** APK descargable, con `versionName 1.0.0` y el
  `versionCode` asignado por EAS en remoto (`appVersionSource: remote`).
- **Tamaño:** M.
- **Dependencias:** cuenta de Expo con acceso al proyecto; cuota gratuita de EAS
  disponible (builds de baja prioridad al mes, reset mensual; verificado el
  2026-11-06 en <https://docs.expo.dev/billing/plans/>).
- **Responsable:** **humano** (interactivo; el agente no puede generar el primer
  keystore).
- **Respaldo si la cuota está agotada:** compilar en local con
  `docs/build-apk-local.md` (JDK 21, SDK 36). No cuenta como G7 «APK por EAS»,
  pero permite el smoke test.

## Sprint 2 — Inspección del APK final (G5 sobre el artefacto)

- **Objetivo:** confirmar que el APK firmado no contiene secretos.
- **Tareas:**
  1. **(Agente)** Extraer el APK (`unzip`) y pasar `strings` sobre el bundle
     JavaScript y los ficheros de recursos.
  2. **(Agente)** Buscar patrones de clave (`AIza`, `GEMINI_API_KEY`, `sk-`,
     `eyJ`, `api_key`) y confirmar 0 coincidencias relevantes.
  3. **(Agente)** Registrar el resultado en el dictamen.
- **Puerta de aceptación:** 0 secretos en el APK firmado.
- **Tamaño:** S.
- **Dependencias:** Sprint 1.
- **Responsable:** agente.

## Sprint 3 — Smoke test en dispositivo (G8)

- **Objetivo:** validar la app completa en un teléfono Android real.
- **Tareas:**
  1. **(Humano)** Instalar el APK (`adb install -r socracia-1.0.0.apk`).
  2. **(Humano)** Ejecutar `docs/release-1.0-smoke.md` de principio a fin,
     marcando cada casilla con evidencia.
  3. **(Humano)** Reportar incidencias; **(agente)** corregir los defectos que
     bloqueen el recorrido y repetir.
- **Puerta de aceptación:** checklist APTO, sin incidencias bloqueantes.
- **Tamaño:** M.
- **Dependencias:** Sprint 1.
- **Responsable:** **humano**.

---

## Riesgos abiertos (resumen)

- **Margen de G3:** la concordancia de veredicto (83.3 %) supera el 80 % por un
  margen estrecho, con modelos gratuitos. Repeticiones futuras pueden caer por
  debajo. Mitigación: el motor degrada a la heurística; el umbral no se toca.
- **Cuota de EAS:** builds de baja prioridad al mes en el plan gratuito. Reservar
  al menos uno para el APK de lanzamiento; usar la ruta local si se agota.
- **Primer keystore:** requiere modo interactivo, no automatizable por el agente.
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
