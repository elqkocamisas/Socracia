# Checklist de cierre — Socracia 1.0.0 (NO-GO)

Sprints restantes para convertir el dictamen NO-GO en GO, ordenados por **camino
crítico**. Cada uno declara objetivo, tareas, puerta de aceptación, tamaño
(S/M/L), dependencias y responsable (agente o humano).

Contexto: el proceso mayéutico funciona de extremo a extremo (G1, G2, G4, G5, G6,
G9 en verde). Bloquean el GO **G3** (evals con proveedor real) y **G7/G8** (APK
por EAS y prueba en dispositivo).

## Camino crítico hacia 1.0

| #   | Sprint                               | Objetivo                                                                  | Puerta       | Tamaño | Depende de  | Responsable                            |
| --- | ------------------------------------ | ------------------------------------------------------------------------- | ------------ | ------ | ----------- | -------------------------------------- |
| 1   | Evals reales del proveedor semántico | Ejecutar las evals contra el proveedor real y resolver el 400 del backend | **G3**       | M      | —           | Agente (arnés) + humano (clave/acceso) |
| 2   | Primer build de EAS                  | Generar el keystore inicial y producir el APK de lanzamiento              | **G7**       | M      | Cuenta Expo | **Humano**                             |
| 3   | Inspección del APK final             | Confirmar que no hay secretos en el APK firmado                           | **G5** (APK) | S      | #2          | Agente                                 |
| 4   | Smoke test en dispositivo            | Ejecutar el checklist manual en un teléfono real                          | **G8**       | M      | #2          | **Humano**                             |

---

## Sprint 1 — Evals reales del proveedor semántico (G3)

- **Objetivo:** verificar que el motor semántico alcanza los umbrales de calidad
  con un modelo real: concordancia de veredicto ≥ 80 %, 0 citas inventadas y
  ≥ 90 % de paráfrasis correctas aceptadas, sobre ≥ 30 casos.
- **Estado de partida (real, 2026-11-05):** el backend de Render **tiene** la
  clave configurada, pero `/mayeutic/generate` y `/mayeutic/evaluate` devuelven
  **502** con un **400 del proveedor** en toda llamada. La causa es del proveedor
  (clave, acceso al modelo o cuota), no del cuerpo: se calibró contra Gemini y el
  cuerpo que envía el backend pasa su validación de forma. El adaptador ahora
  **propaga el mensaje del proveedor** (D-060), así que la primera llamada tras
  desplegar ese cambio dirá el motivo exacto.
- **Actualización (real, 2026-11-05, tras habilitar facturación):** se probó una
  clave de Gemini **válida** (autentica y lista 50 modelos, incluido
  `gemini-3.8-flash`) contra la API oficial. **Toda** llamada devuelve ahora
  **HTTP 402 `RESOURCE_EXHAUSTED`**: «Your prepayment credits are depleted…
  manage your project and billing». Es decir, habilitar la facturación **no**
  restaura la cuota gratuita: pasa el proyecto a un plan de prepago con **0
  créditos**, y sin créditos el modelo no responde. El backend de Render sigue
  devolviendo **400** (su `GEMINI_API_KEY` sigue siendo la anterior o el código
  desplegado es el viejo). **Causa raíz confirmada: el proyecto de Gemini no tiene
  créditos ni cuota gratuita utilizable.** Para G3 hace falta una de estas dos
  cosas, ambas humanas: (a) cargar créditos de prepago en el proyecto, o
  (b) crear una clave en un proyecto de Gemini **sin** facturación (nivel
  gratuito) y configurarla como `GEMINI_API_KEY` en Render.
- **Tareas:**
  1. **(Humano)** Confirmar/renovar la `GEMINI_API_KEY` en Render y que el
     proyecto tiene acceso al modelo configurado (`GEMINI_MODEL`, por defecto
     `gemini-3.8-flash`, con plan gratuito). Guardarla **solo** en el servidor.
  2. **(Agente, hecho)** Arnés de evals reales: `scripts/eval-real.mjs`
     (`npm run eval:real`), sin clave en el cliente, contra el backend real
     (D-060).
  3. **(Agente, hecho)** El adaptador del backend propaga el mensaje de error del
     proveedor para poder diagnosticar sin acceso a los logs.
  4. **(Humano)** Desplegar el backend con ese cambio (Render, «Manual Deploy →
     Deploy latest commit» de `main` tras fusionar el PR de release).
  5. **(Humano + agente)** Ejecutar el arnés y registrar el informe por categoría.
- **Comandos exactos:**
  ```bash
  # El backend debe tener GEMINI_API_KEY configurada en Render.
  npm run eval:real            # usa https://socracia.onrender.com por defecto
  # O apuntando a otro servicio / cuenta de prueba:
  SOCRA_REAL_EVAL_BASE_URL=https://<servicio>.onrender.com \
    SOCRA_REAL_EVAL_EMAIL=<cuenta> SOCRA_REAL_EVAL_PASSWORD=<clave> \
    npm run eval:real
  ```
  Código de salida: `0` = G3 alcanzada; `1` = por debajo del umbral; `2` =
  proveedor no disponible (G3 no verificada, no fallida).
- **Puerta de aceptación:** informe real adjunto con ≥ 30 casos, veredicto
  ≥ 80 %, 0 citas inventadas y ≥ 90 % de paráfrasis aceptadas. Si no se alcanza,
  ajustar el prompt de evaluación (no el umbral) y repetir.
- **Tamaño:** M.
- **Dependencias:** acceso del proyecto de Gemini al modelo; despliegue del
  backend con el cambio de D-060.
- **Responsable:** agente (arnés y diagnóstico) + humano (clave, acceso y
  despliegue).

## Sprint 2 — Primer build de EAS (G7)

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
  disponible (**15 builds de Android al mes**, verificado el 2026-11-04).
- **Responsable:** **humano** (interactivo; el agente no puede generar el primer
  keystore).
- **Respaldo si la cuota está agotada:** compilar en local con
  `docs/build-apk-local.md` (JDK 21, SDK 36). No cuenta como G7 «APK por EAS»,
  pero permite el smoke test.

## Sprint 3 — Inspección del APK final (G5 sobre el artefacto)

- **Objetivo:** confirmar que el APK firmado no contiene secretos.
- **Tareas:**
  1. **(Agente)** Extraer el APK (`unzip`) y pasar `strings` sobre el bundle
     JavaScript y los ficheros de recursos.
  2. **(Agente)** Buscar patrones de clave (`AIza`, `GEMINI_API_KEY`, `sk-`,
     `eyJ`, `api_key`) y confirmar 0 coincidencias relevantes.
  3. **(Agente)** Registrar el resultado en el dictamen.
- **Puerta de aceptación:** 0 secretos en el APK firmado.
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
- **Dependencias:** Sprint 2.
- **Responsable:** **humano**.

---

## Riesgos abiertos (resumen)

- **G3 sin verificar:** es el mayor riesgo de calidad. La heurística respalda,
  pero la evidencia real es obligatoria para el GO.
- **Cuota de EAS:** 15 builds de Android/mes en el plan gratuito. Reservar al
  menos uno para el APK de lanzamiento; usar la ruta local si se agota.
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
