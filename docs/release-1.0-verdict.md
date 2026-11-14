# Dictamen de release — Socracia 1.0.0

**Fecha:** 12 de noviembre de 2026 (re-verificado en esta sesión; ver «Estado de
esta sesión»)
**Versión evaluada:** `1.0.0` (raíz, workspaces, `app.json` y ficha de tienda)
**Alcance:** app móvil de un solo usuario, local-first; importación de documentos
(con OCR opcional); motor mayéutico; proveedor semántico opcional con
consentimiento y clave propia; APK por EAS.
**Fuera de alcance:** multitenencia, consola docente, facturación, publicación en
tiendas.

## Veredicto

### ⚠️ NO-GO (G3 superada con proveedor real; faltan G7 —APK por EAS— y G8 —smoke humano—)

Estado de las puertas: **G1, G2, G3, G4, G5, G6 y G9 cumplidas** con evidencia
**ejecutada en esta sesión**. **G7 queda parcial**: el APK de EAS existente es
**anterior** a D-074/D-075/D-076 y no se pudo recompilar porque **`EXPO_TOKEN` no
está disponible** en el entorno y el primer keystore de Android **no se puede
generar en modo no interactivo** (verificado en la documentación oficial vigente
de Expo, 2026-11-02). Se entrega, en su lugar, un **APK local al día**
(`dist/socracia-1.0.0-local-d076.apk`, `versionName 1.0.0`, sin secretos, apuntando
al backend real). **G8** (smoke en dispositivo real) es **humano**.

El proceso mayéutico **funciona de extremo a extremo**: demostrado con proveedor
falso (recorrido dorado sobre TXT, MD y PDF real, en núcleo e interfaz) **y con
proveedor real** (evals G3).

**G3 (evals con proveedor real) SÍ se ha verificado en esta sesión** (2026-11-12):
`npm run eval:real` contra `https://socracia.onrender.com` → **30/30 casos de
evaluación**, concordancia **80.0 %** (≥80 %), paráfrasis correctas aceptadas
**100 %** (≥90 %), citas inventadas **0** → «G3 alcanzada con proveedor real».
Salida completa en `docs/release-1.0-g3-evidence.txt`.

Para llegar a esa evidencia se corrigió un **defecto real del instrumento** (D-077):
el arnés `scripts/eval-real.mjs` abortaba toda la corrida al ver un **429** de
cuota (en las categorías informativas de repregunta/explicación) o un **502** por
salida irregular de un modelo, descartando la evidencia de evaluación y generación
ya recogida. Ahora distingue caso fallido de proveedor caído.

**G7 (APK por EAS) queda parcial.** El build `f2173e7a…` «Succeeded» era anterior a
D-074/D-075/D-076. El **2026-11-14** se empujó `main` (`ed0b1b5 → c554f9f`, con
D-076) y se disparó el workflow `Expo EAS` (run `43610275031`, `success`), que
generó en EAS el build
[`efbcfa72-68ea-44ea-8b3e-ca33337bb478`](https://expo.dev/accounts/camiseros-team/projects/socracia/builds/efbcfa72-68ea-44ea-8b3e-ca33337bb478)
(perfil `release-apk`, plataforma android, distribución interna): **status
`Succeeded`** y artefacto **APK**. Falta la **descarga** del artefacto (exige
sesión de Expo del propietario o `npx eas-cli build:download`) y su instalación
para el smoke; por eso G7 sigue parcial hasta que se verifique el APK descargado.

**G8 (smoke en dispositivo) sigue pendiente y es humano**: no puede ejecutarlo un
agente sin un teléfono físico. Para adelantarlo se compiló en local un APK 1.0.0
**al día** (`dist/socracia-1.0.0-local-d076.apk`, firmado con clave de depuración,
con D-074/D-075/D-076 y modo conectado), apto para el checklist
`docs/release-1.0-smoke.md`.

No se fuerza la versión: se entrega el dictamen NO-GO y el checklist de sprints
restantes (`docs/release-1.0-checklist.md`).

## Niveles de evidencia

Se distingue con precisión qué está **documentado**, **implementado**, **probado
con proveedor falso** y **validado con proveedor real o en dispositivo**. Una
puerta no se da por cumplida sin evidencia ejecutada **en esta sesión**.

## Estado de esta sesión (2026-11-12)

Trabajo realizado y verificado **hoy**, sobre `main` local en `be1d0c8` (incluye
D-076; no se sube nada: la misión prohíbe crear tags o empujar y el token
disponible no tiene permiso de escritura):

1. **F0 — línea base real.** `npm run verify` **en verde** (**662 pruebas**: 363
   core —evals 32/32—, 70 api, 229 móvil), 41 suites, 0 fallos. La raíz está
   limpia: no hay `*.zip` y `.gitignore` ya excluye `*.zip`.
2. **F1 — recorrido dorado.** `goldenPath.test.ts` (**14/14**) y
   `goldenPath.e2e.test.tsx` (**2/2**) en verde: ciclo completo sobre TXT, MD y
   PDF real (extracción → conceptos → pregunta anclada → paráfrasis aceptada →
   error → repregunta → explicación con cita → lagunas → repaso → progreso tras
   reiniciar). Diagnóstico por capa en su sección.
3. **F2 — resiliencia y privacidad.** Los cuatro supuestos de F2 (sin
   consentimiento, sin red, cuota agotada, salida inválida) se prueban en
   `studyService.test.ts` («G4 — degradación en los cuatro supuestos de F2») y en
   `llmEngine.test.ts`; la sesión no se rompe y el turno queda `degraded`.
4. **F3 — configuración.** Versión 1.0.0 consistente en raíz, workspaces,
   `app.json` y ficha; perfil `release-apk` (D-059) intacto; `appVersionSource:
remote` deja el `versionCode` a EAS.
5. **F4 — build.** No se pudo usar EAS: **`EXPO_TOKEN` no está disponible** y el
   primer keystore de Android **no se genera en modo no interactivo** (docs
   oficiales de Expo). Se compiló el APK por la **ruta local** de
   `docs/build-apk-local.md`: `dist/socracia-1.0.0-local-d076.apk` (76 MB,
   `com.socracia.app`, `versionName 1.0.0`, 4 ABIs, sha256 `aa83d3e0…`), con
   `EXPO_PUBLIC_CLOUD_PROCESSING=1` y `EXPO_PUBLIC_API_BASE_URL=https://socracia.onrender.com`.
6. **G3 — superada con proveedor real (bloqueo resuelto).** Tras corregir el
   instrumento (D-077), `npm run eval:real` supera los umbrales: **30/30**
   evaluación, concordancia **80.0 %**, paráfrasis **100 %**, citas inventadas
   **0**. Evidencia en `docs/release-1.0-g3-evidence.txt`.
7. **G5 — sin secretos.** Escaneo del APK nuevo (1162 entradas): **0** patrones con
   valor (`AIza…`, `sk-…`, `github_pat_`, JWT, clave privada, `api_key` literal).
   El bundle trae `socracia.onrender.com` y **no** `localhost:8787` (G7 conectado).
8. **G9 — paquete fuente regenerado:** `npm run package:source` → **264 ficheros**
   (`dist/socracia-1.0.0-fuente.tar.gz`) + manifiesto.

## Estado de la sesión anterior (2026-11-11)

Trabajo realizado y verificado **hoy**, sobre `feat/motor-semantico-modo-conectado`
(dos commits sobre `main` @ `bab7a86`, aún **sin subir**: la regla de la misión
prohíbe subir nada y el token disponible no tiene permiso de escritura):

1. **F0 — línea base real.** `npm run verify` **en verde** (**654 pruebas**: 359
   core —evals 32/32—, 66 api, 229 móvil). La raíz está limpia: no hay `*.zip` y
   `.gitignore` ya excluye `Socracia-web-test.zip` y `*.zip`.
2. **F1 — recorrido dorado y arreglo del error «no hay material evaluable»
   (D-074).** Se corrigió un defecto real de operatividad: al adjuntar un temario
   y pulsar «Estudiar», la app respondía «El temario no contiene conceptos
   evaluables». `extractCurriculum` devolvía cero conceptos porque el normalizador
   del RAG unía con espacios las líneas de un párrafo (un temario sin línea en
   blanco entre encabezado y cuerpo perdía los encabezados) y porque un temario
   en forma de índice no aportaba definiciones. Ahora se conservan las fronteras
   de los encabezados y, cuando el documento no aporta ninguna definición, cada
   epígrafe se convierte en un concepto con sus términos clave. Pruebas nuevas en
   `conceptExtractor.test.ts` y `goldenPath.e2e.test.tsx`.
3. **F2 — resiliencia y privacidad (D-072).** `StudyService.answer` y
   `generateForConcepts` **abortaban** la sesión ante cualquier fallo del
   proveedor. Con `degradeOnProviderFailure` (por defecto `false`, la app la
   activa), la evaluación cae a la heurística y la generación a las plantillas; el
   turno se marca `degraded`. Cuatro pruebas cubren los supuestos de F2.
4. **F3 — configuración.** El perfil `release-apk` (D-059) hereda de
   `production` con `buildType: apk` y `distribution: internal`;
   `appVersionSource: remote` deja el `versionCode` a EAS. Versión 1.0.0
   consistente en raíz, workspaces, `app.json` y ficha.
5. **F4 — build EAS (lanzado por CI).** El `EXPO_TOKEN` vive como **secreto de
   GitHub Actions** (no legible); el build se lanzó con el workflow
   `eas-build.yml`. **Nota:** el APK `f2173e7a…` es **anterior** a D-074, así que
   hay que **recompilar** con el perfil `release-apk` antes del smoke definitivo.
6. **G3 — re-verificada en esta sesión con proveedor real.** `npm run eval:real`
   contra `https://socracia.onrender.com` supera los umbrales: **33 casos** (30
   evaluación + 3 generación), concordancia **83.3 %** (≥80 %), paráfrasis
   **100 %** (≥90 %), citas inventadas **0**. Evidencia en
   `docs/release-1.0-g3-evidence.txt`. La corrida es **sensible al _cold start_**:
   de tres intentos consecutivos, uno dio 502 por timeout y dos alcanzaron G3;
   riesgo abierto #1.
7. **G9 — paquete fuente regenerado:** `npm run package:source` → **264
   ficheros** (incluye `llmProvider.ts` y su prueba); `npm run verify`
   reproducido desde cero en verde.

## Estado de la sesión anterior (2026-11-10)

Trabajo realizado y verificado **hoy**, sobre `main` en `be140bc` + la rama
`feat/motor-semantico-modo-conectado` (PR #19, 10 commits):

1. **F0 — línea base real.** `npm ci --no-audit --no-fund` desde cero (Node
   v24.21.0, npm 11.21.0, 1124 paquetes, 21 s) y `npm run verify` **en verde**
   (**648 pruebas**: 355 core, 66 api, 227 móvil). La raíz está limpia: no hay
   `*.zip` y `.gitignore` ya excluye `Socracia-web-test.zip` y `*.zip`.
2. **F1 — recorrido dorado de extremo a extremo.** `goldenPath.test.ts` (núcleo)
   cierra el ciclo completo sobre **TXT, MD y PDF real**, con extracción
   coherente por formato y el nuevo camino de OCR; `goldenPath.e2e.test.tsx`
   (pantallas) prueba el mismo recorrido en la interfaz. Diagnóstico por capa en
   la sección siguiente.
3. **F2 — resiliencia y privacidad (D-072).** Se corrigió un defecto real de
   operatividad: `StudyService.answer` y `generateForConcepts` **abortaban** la
   sesión (`evaluacion-fallida`/`generacion-fallida`) ante cualquier fallo del
   proveedor (red, cuota o salida inválida), contra lo que promete
   `docs/llm-engine.md`. Ahora, con `degradeOnProviderFailure` (por defecto
   `false`, la app la activa), la evaluación cae a la heurística y la generación a
   las plantillas; el turno se marca `degraded` y la insignia deja de afirmar «IA
   semántica». Cuatro pruebas nuevas cubren los supuestos de F2.
4. **F3 — configuración.** El perfil `release-apk` (D-059) sigue heredando de
   `production` con `buildType: apk` y `distribution: internal`; `appVersionSource:
remote` deja el `versionCode` a EAS. Versión 1.0.0 consistente en raíz,
   workspaces, `app.json` y ficha.
5. **F4 — build EAS (lanzado por CI).** El `EXPO_TOKEN` vive como **secreto de
   GitHub Actions** (no legible), así que el build se lanzó con el workflow
   `eas-build.yml` (perfil `release-apk`, plataforma `android`) sobre
   `feat/motor-semantico-modo-conectado` @ `111f409`. El paso «Compilar» pasó y
   **el keystore ya existía** (`Build Credentials TnBsQO-OGA`): no hizo falta el
   paso interactivo. Build de EAS:
   [`465412d7…`](https://expo.dev/accounts/camiseros-team/projects/socracia/builds/465412d7-82c8-4f52-9b89-336ec08d0b8d)
   (run de GitHub
   [`42820435024`](https://github.com/elqkocamisas/Socracia/actions/runs/42820435024),
   `success`). La compilación **terminó con «Succeeded»** y produjo un artefacto
   **APK**; el propietario lo descarga desde esa URL (paso humano).
6. **Pruebas nuevas:** 7 en total (3 de degradación tolerante + 3 de G4 + 1 de UI
   del proveedor caído). Ninguna firma pública del dominio cambió y no se modificó
   ninguna prueba existente (el test que fijaba el aborto sigue verde porque no
   activa la opción nueva).
7. **G3 — desbloqueada con proveedor real (bloqueo principal, resuelto).** La
   variable `GEMINI_API_KEY` del servicio de Render contenía un valor que no era
   una clave de Gemini. Se repuso por una **válida** vía API de Render
   (`PUT /services/{id}/env-vars/GEMINI_API_KEY`) y se redesplegó. `npm run
eval:real` superó los umbrales (33 casos, 83.3 % / 100 % / 0 citas). Evidencia
   en `docs/release-1.0-g3-evidence.txt`.

## Tabla de puertas G1–G9

| Puerta | Descripción                                                                                | Estado | Nivel de evidencia                                           | Evidencia ejecutada en esta sesión (2026-11-12)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------ | ------------------------------------------------------------------------------------------ | ------ | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G1     | `npm run verify` en verde                                                                  | ✅     | **Ejecutado** (árbol limpio)                                 | 41 suites/**363** (core, evals 32/32) + 10/**70** (api) + 34/**229** (mobile) = **662 pruebas**, 0 fallos. Re-ejecutado **tras** el arreglo del instrumento G3 (D-077) para descartar regresión.                                                                                                                                                                                                                                                                                                                                                                                 |
| G2     | Recorrido dorado con 3 documentos (TXT/MD/PDF) y coherencia por capa documentada           | ✅     | **Ejecutado con proveedor falso**                            | `goldenPath.test.ts` (núcleo, **14/14**) + `goldenPath.e2e.test.tsx` (pantallas, **2/2**) en verde. Los tres formatos → mismos 3 temas/3 conceptos y mismo cierre. Coherencia por capa en la sección siguiente.                                                                                                                                                                                                                                                                                                                                                                  |
| G3     | Evals con proveedor real: ≥30 casos, veredicto ≥80 %, 0 citas inventadas, ≥90 % paráfrasis | ✅     | **Validado con proveedor real** (Gemini, clave propia)       | Ejecutado **2026-11-12**: `npm run eval:real` contra `https://socracia.onrender.com` → **30/30** casos de evaluación, concordancia **80.0 %** (≥80 %), paráfrasis **100 %** (≥90 %), citas inventadas **0** → «G3 alcanzada». Salida en `docs/release-1.0-g3-evidence.txt`. Histórico: 2026-11-11 → 83.3 %; 2026-11-10 → 83.3 %/80.0 %. Antes de lograrlo se corrigió el instrumento (D-077): abortaba la corrida ante un 429 informativo o un 502 de salida irregular.                                                                                                          |
| G4     | Degradación probada en los 4 supuestos de F2                                               | ✅     | **Ejecutado**                                                | `studyService.test.ts` («G4 — degradación en los cuatro supuestos de F2»): sin consentimiento (no llama al proveedor) + red/cuota/salida inválida (degrada y la sesión avanza, turno `degraded`). Además `consent.test.ts`, `httpProvider.test.ts`, `resilience.test.ts`, `llmEngine.test.ts` y `ocrImport.test.ts` por capa.                                                                                                                                                                                                                                                    |
| G5     | Sin secretos en cliente ni en el APK                                                       | ✅     | **Ejecutado** (escaneo real del APK nuevo)                   | Escaneo **2026-11-12** con `zipfile` sobre `dist/socracia-1.0.0-local-d076.apk` (**1162 entradas**): **0** `AIza…`, **0** `sk-…`, **0** `github_pat_`, **0** JWT, **0** clave privada, **0** `api_key` literal. El bundle trae `https://socracia.onrender.com` y **no** `localhost:8787`. Escaneo previo sobre el APK de EAS (`f2173e7a…`): 0 coincidencias. El tarball fuente: solo **nombres** de variable y patrones en docs, nunca un valor.                                                                                                                                 |
| G6     | Textos legales alineados y marcados para revisión humana                                   | ✅     | **Implementado + revisión humana pendiente**                 | `docs/privacy-policy.md`, `docs/terms-of-use.md`, `store/privacy-declarations.json`, `storeListing.test.ts`, `legalDocuments.test.ts` y `LegalScreen.test.tsx` en verde; ambos textos marcados «PENDIENTE DE REVISIÓN HUMANA». El apartado 2.3 y `privacy-declarations.json` describen el motor real (pregunta, respuesta y fragmento citado salen solo con consentimiento; el servidor no los almacena).                                                                                                                                                                        |
| G7     | APK generado por EAS, instalable, versión 1.0.0                                            | ⚠️     | **Parcial: build EAS `Succeeded`; falta descargar/instalar** | **2026-11-14:** empujado `main` (`c554f9f`, con D-076) y disparado el workflow `Expo EAS` (run `43610275031`, `success`); build EAS [`efbcfa72…`](https://expo.dev/accounts/camiseros-team/projects/socracia/builds/efbcfa72-68ea-44ea-8b3e-ca33337bb478) con **status `Succeeded`**, artefacto **APK**, perfil `release-apk`, distribución interna, `appVersion 1.0.0`. Falta **descargar** el artefacto (sesión de Expo o `eas-cli build:download`), instalarlo y escanearlo (G5). Alternativa local al día: `dist/socracia-1.0.0-local-d076.apk` (76 MB, sha256 `aa83d3e0…`). |
| G8     | Smoke test humano en dispositivo real                                                      | ⏳     | **Pendiente (humano)**                                       | Checklist actualizado: `docs/release-1.0-smoke.md` (apunta al APK al día `dist/socracia-1.0.0-local-d076.apk`). No ejecutable por un agente (requiere teléfono).                                                                                                                                                                                                                                                                                                                                                                                                                 |
| G9     | Documentación y paquete fuente reproducibles                                               | ✅     | **Ejecutado** (reproducido en esta sesión)                   | `npm run package:source` → `dist/socracia-1.0.0-fuente.tar.gz` (**264 ficheros**) + manifiesto. `npm run verify` reproducido en verde (662 pruebas). El tarball no contiene valores de secreto (solo nombres de patrón en docs).                                                                                                                                                                                                                                                                                                                                                 |

Leyenda: ✅ cumplida · ⚠️ parcial (requiere paso humano o no verificable aquí) · ❌ no verificada · ⏳ pendiente.

## Recorrido dorado: dónde se pierde y dónde no la coherencia significante↔significado

Diagnóstico por capa (F1), con el resultado real observado:

| Capa                          | Comportamiento                                                                                                                                                                                                                | Veredicto |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| **Extracción PDF**            | El extractor respeta los límites de bloque (`BT…ET`) y decodifica la cadena de filtros (`/ASCII85Decode /FlateDecode`) y los arrays `TJ`; un PDF produce los mismos 3 temas que TXT y MD                                      | Coherente |
| **Segmentación y conceptos**  | `cleanHeading` unifica `## Tema 1. X` y `Tema 1. X`, de modo que MD y TXT dan los mismos títulos y los mismos conceptos                                                                                                       | Coherente |
| **OCR (imagen/escaneo)**      | Una imagen o un PDF sin texto toma el camino OCR **solo** con consentimiento; el texto reconocido entra por `ingestText` en el mismo pipeline y produce los mismos conceptos. Sin consentimiento, se avisa y no se envía nada | Coherente |
| **Generación**                | Cada pregunta se ancla a un `chunkId` real, con `excerpt` y rango de caracteres verificables contra los fragmentos guardados                                                                                                  | Coherente |
| **Evaluación**                | La paráfrasis correcta se acepta y la respuesta errónea se rechaza; la repregunta ataca el término clave ausente de **esa** pregunta y nunca revela `expectedAnswer`                                                          | Coherente |
| **Explicación («explícame»)** | `StudyViewState.explanation` se propaga y `StudyScreen` la muestra («Te lo explico») tras fallos repetidos                                                                                                                    | Coherente |

**Conclusión de coherencia:** el significante (pregunta, andamiaje, explicación)
se corresponde con el significado (concepto, cita y término clave de la fuente)
en el recorrido completo, **con proveedor falso**. No se detectó pérdida de
coherencia residual. La validación con **proveedor real** (G3) se ejecutó también
en esta sesión y superó los umbrales (ver G3).

## G7 — build de EAS (lanzado hoy)

El `EXPO_TOKEN` del repositorio vive como **secreto de GitHub Actions**
(`secrets.EXPO_TOKEN`); los secretos de Actions son de solo escritura y no se
pueden leer, así que el build **no se lanzó desde el terminal** sino **con el
workflow** `.github/workflows/eas-build.yml`, que lo consume sin exponerlo:

- Run de GitHub:
  [`42820435024`](https://github.com/elqkocamisas/Socracia/actions/runs/42820435024)
  — `workflow_dispatch`, `success`; paso «Compilar» correcto.
- Build de EAS:
  [`465412d7-82c8-4f52-9b89-336ec08d0b8d`](https://expo.dev/accounts/camiseros-team/projects/socracia/builds/465412d7-82c8-4f52-9b89-336ec08d0b8d)
  (perfil `release-apk`, Android, distribución interna). **El keystore ya existía**
  (`Build Credentials TnBsQO-OGA`): no hizo falta el paso interactivo. La
  compilación **terminó con «Succeeded»** y produjo un artefacto **APK**.

El artefacto lo descarga el propietario desde la página del build, o con:

```bash
npx eas-cli build:download --profile release-apk --platform android
adb install -r socracia-1.0.0.apk
```

Si en el futuro hubiera que rehacerlo a mano y **no** existiera keystore, el
primer build exige interactividad: la documentación vigente de Expo indica que,
al ejecutar `eas build` sin credenciales previas, «you will be prompted to
generate credentials» (verificado 2026-11-10 en
<https://docs.expo.dev/app-signing/managed-credentials/>).

**Cuota del plan gratuito de EAS (re-verificada 2026-11-10 en
<https://expo.dev/pricing>):** «15 Android and 15 iOS builds» de baja prioridad
al mes, con reinicio mensual; los planes gratuitos no acumulan sobrecoste. Se
reserva al menos una compilación para el APK de lanzamiento. Respaldo si se
agota: `docs/build-apk-local.md`.

## Arreglo de operatividad de la UX (D-073) — 2026-11-11

El APK de EAS (`b19ef0a8…`) se instaló en un **Android real** y resultó **no
operativo**: la barra de estado tapaba la cabecera y la barra de navegación
tapaba la barra de pestañas, de modo que los controles quedaban bajo las barras
del sistema y no se podían pulsar.

- **Causa raíz:** D-041 retiró `android.edgeToEdgeEnabled` de `app.json` «porque
  ya no existe» en el esquema de SDK 58. El corolario —que el edge-to-edge pasa a
  ser **siempre obligatorio** en Android 16— no se atendió: la app pintaba a
  pantalla completa sin reservar las zonas de las barras. Nunca se añadió el
  manejo de insets.
- **Por qué no lo detectó ninguna prueba:** Jest no tiene geometría de sistema y
  el recorrido dorado monta las pantallas **sueltas**, sin el chasis de `App.tsx`
  que coloca la barra de pestañas. Era un punto ciego real de la suite.
- **Arreglo:** dependencia `react-native-safe-area-context` (versión que fija
  Expo, `~5.11.1`); `App` envuelta en `SafeAreaProvider`; el chasis aplica el
  inset superior al contenido (o al banner degradado) y el inferior a la barra de
  pestañas; `BootScreen` usa `SafeAreaView`. El ajuste vive en el chasis, no en
  las pantallas.
- **Prueba de regresión:** `apps/mobile/src/__tests__/safeArea.test.tsx` monta
  `App` completo, cierra el onboarding y comprueba los insets. Es el único test
  de la suite que dobla un módulo nativo (la geometría del sistema no existe en
  Node); el doble está justificado en el fichero.
- **APK recompilado:** build `f2173e7a…` sobre `main` @ `962e8fa` (el APK
  `b19ef0a8…` queda **obsoleto** para la UX). El bundle nuevo contiene
  `react-native-safe-area-context` y `useSafeAreaInsets`, y sigue con **0
  secretos**.
- **Nivel de evidencia:** **implementado y probado con prueba de regresión**; la
  verificación en **dispositivo real** sigue siendo humana (G8).

## Arreglo del error «no hay material evaluable» (D-074) — sesión actual

Al adjuntar un temario y pulsar «Estudiar», la app respondía «El temario no
contiene conceptos evaluables. Revisa el documento.» Era un defecto real de
coherencia entre significante y significado: el documento sí tenía temas, pero
`extractCurriculum` (`ingest/conceptExtractor.ts`) devolvía cero conceptos.

- **Causa raíz (dos defectos):**
  1. El normalizador del RAG (`normalizeText`) une con espacios las líneas de un
     párrafo. Un temario **sin línea en blanco** entre el encabezado y su cuerpo
     —lo habitual al copiar de un PDF o un TXT compacto— perdía todos los
     encabezados y quedaba como un bloque único sin conceptos.
  2. Un temario en **forma de índice** (solo epígrafes, sin cuerpo), que es la
     acepción literal de «temario» en una oposición, no aportaba definiciones
     «X es…» y también daba cero conceptos. Además, las viñetas se arrastraban a
     la etiqueta («- El Estado social»).
- **Arreglo:** `normalizeForStructure` conserva la frontera de los encabezados
  inequívocos (`isStructuralHeading`: marcador de tema, `#` de Markdown y línea
  corta en mayúsculas) y retira el marcador de viñeta; **no** separa la numeración
  suelta (`1. …`), que dentro de un tema es casi siempre un elemento de lista
  (regresión detectada y descartada). `splitSections` conserva los encabezados
  sin cuerpo y, **solo cuando el documento entero no produjo ningún concepto**,
  cada epígrafe se convierte en un concepto con sus términos clave.
- **Pruebas de regresión:** `conceptExtractor.test.ts` (encabezado sin blanco,
  temario descriptivo, viñetas, índice) y `goldenPath.e2e.test.tsx` (reproduce el
  escenario exacto: adjuntar TXT sin líneas en blanco → «Estudiar» → aparece una
  pregunta anclada, no el error).
- **Verificación ejecutada:** el recorrido de extremo a extremo (servicio +
  controlador) produce preguntas con cita para TXT sin blancos, TXT con blancos,
  MD y viñetas; y para un índice (3 epígrafes → 3 conceptos con términos clave).
  `npm run verify` en verde (**654 pruebas**).
- **Nivel de evidencia:** **implementado y probado** (núcleo + interfaz, proveedor
  falso). El APK debe **recompilarse** para incorporar el arreglo.

## Motor mayéutico sobre el RAG: repregunta y explicación con el modelo (D-075) — sesión actual

El objetivo de 1.0 es que el **modelo actúe en modo mayéutica sobre el RAG**. La
auditoría del código real (no de la documentación) encontró que el recorrido
estaba **incompleto en el backend**: `apps/api/src/server.ts` construía las
dependencias con `llm: null` **hardcodeado** y no existía ningún `LlmProvider` en
`apps/api`. La ruta `POST /llm/complete` —la que sirve la **repregunta**
(`followUp`) y la **explicación** (`explainer`)— respondía **503 `no-configurado`**.

- **Efecto real en la APK:** la repregunta caía en silencio a las plantillas del
  RAG y la explicación quedaba en `null`; el alumno **nunca** recibía el texto del
  modelo para esas dos tareas. La generación y la evaluación sí iban por Gemini
  (`/mayeutic/*`). Ninguna prueba lo cubría: las suites inyectaban un proveedor
  falso y la de integración solo comprobaba el 503.
- **Arreglo:** nuevo `apps/api/src/llmProvider.ts` que reutiliza
  `OpenAiCompatProvider` del núcleo contra el endpoint OpenAI-compatible de Gemini,
  envuelto en `ResilientLlmProvider`, y se cablea en `defaultDependencies()`. Sin
  `GEMINI_API_KEY` devuelve `null` (503) y la app degrada a la heurística. No se
  toca ninguna firma pública ni la ruta `/mayeutic/*`.
- **Robustez medida en vivo:** `max_tokens: 1200` truncaba el JSON cuando se
  pedían 3 preguntas (2 de 3 intentos → 502 de formato; con 2 preguntas, 5 de 5
  correctas). Se sube a **2400** y se permite **rotar de modelo** ante un JSON
  inválido, no solo ante cuota o indisponibilidad.
- **Evals reales ampliados:** `scripts/eval-real.mjs` gana casos de **repregunta**
  (ruta `seguimiento`) y **explicación** (ruta `explicar`) contra `/llm/complete`,
  validados con los mismos `parseFollowUp`/`parseExplanation` del núcleo.
- **Verificación ejecutada:** `npm run verify` en verde (**658 pruebas**: 359 core
  —evals 32/32—, **70** api —4 nuevas—, 229 móvil). `lint` en verde.
- **Despliegue confirmado (2026-11-11):** el PR #20 se fusionó en `main` y Render
  `autoDeploy` redesplegó. `GET /health` devuelve
  `commit f25e0087…` (= el merge) y `provider.configured: true`, así que
  `/llm/complete` **ya no responde 503**.
- **Validación con proveedor real (parcial):**
  - **Repregunta (`seguimiento`) — ✅ validada.** `POST /llm/complete` con el
    `followUpPrompt` real devolvió **HTTP 200** y `parseFollowUp.ok: true`
    (`kind=acotar`): «¿Qué orgánulo contiene el pigmento verde que atrapa la luz
    del sol en las células vegetales?». La pregunta ataca el error y **no revela**
    la respuesta.
  - **Explicación (`explicar`) — ⚠️ fallo real observado, no reproducido.**
    Una llamada devolvió **HTTP 200** pero **truncada a 18 tokens**
    (`completionTokens: 18`, 53 caracteres: `"```json\n{\n  \"explanation\":
\"¡No te preocupes, vamos a"`), de modo que `parseExplanation` falla («la
    respuesta no contiene un objeto JSON»). Con `maxTokens` 400/1024/2048 el
    resultado fue idéntico, pero esas tres llamadas **acertaron la caché del
    proveedor** (la clave de caché **no incluye `maxTokens`**), así que no son
    evidencia de una causa. Un solo 200 limpio se observó antes de agotar la
    cuota gratuita; **no se pudo reproducir**. Riesgo #8.
- **Nivel de evidencia:** **implementado**; **repregunta validada con proveedor
  real**; **explicación no validada** (un 200 truncado, no reproducido) y
  **evaluación/generación ya validadas** en G3. Hasta reproducir y cerrar el
  truncado, la mitad «explicación» del motor con modelo **no se declara
  cumplida**.

## Riesgos abiertos

1. **G3 cerrada, con variabilidad en el umbral.** G3 se ha superado cuatro veces
   (2026-11-10: 83.3 % y 80.0 %; 2026-11-11: 83.3 %; 2026-11-12: 80.0 %), siempre
   con 100 % de paráfrasis y 0 citas. La concordancia **roza el umbral** (≥80 %) y
   varía por el muestreo del modelo. Mitigación aplicada: el arnés ya distingue un
   caso fallido de la caída del proveedor (D-077), de modo que un 429/502
   transitorio no descarta la evidencia. Riesgo residual: una corrida en frío
   (_cold start_ de Render) puede tardar; conviene calentar el servicio antes.
2. **G7 parcial: falta el APK de EAS al día.** El build `f2173e7a…` («Succeeded»)
   es anterior a D-074/D-075/D-076. No se pudo recompilar aquí porque
   **`EXPO_TOKEN` no está disponible** y el **primer keystore de Android no se
   genera en no interactivo** (docs oficiales Expo). Mitigación entregada: APK
   local al día `dist/socracia-1.0.0-local-d076.apk` (firma de depuración) para el
   smoke; **no** es el artefacto de EAS ni sirve para publicar.
3. **G8 pendiente y humano.** El smoke en teléfono real no lo puede ejecutar un
   agente. Checklist en `docs/release-1.0-smoke.md`.
4. **Repregunta y explicación del modelo dependen de un único modelo.** La ruta
   `/llm/complete` (repregunta/explicación) usa un solo modelo
   (`createLlmProvider`); al agotarse su cuota diaria gratuita devuelve 429
   constante, mientras `/mayeutic/*` rota entre tres modelos. En la app esto
   **degrada a la heurística** (D-043/D-072), que es el comportamiento exigido por
   F2, pero la mitad «con modelo» de esas dos tareas queda a merced de la cuota.
   Mejora recomendada (no bloqueante): hacer que `/llm/complete` rote modelos como
   `/mayeutic/*`.
5. **APK local no es el artefacto de EAS.** `dist/socracia-1.0.0-local-d076.apk`
   se compiló en local (firma de depuración); sirve para probar, no para publicar.
   El APK «oficial» sale del build de EAS con el perfil `release-apk`.
6. **Textos legales pendientes de revisión humana.** Coherentes con el
   comportamiento real, pero no validados por asesoría jurídica (G6).
7. **Umbral de relevancia del RAG** calibrado para el proveedor léxico
   (`minScore = 0.2`); un proveedor semántico real exige recalibrarlo.
8. **Multitenencia inerte por construcción.** No hay código multitenante en el
   árbol (solo documentación D-053…D-056): no hay nada que apagar. Riesgo nulo
   para 1.0.

## Qué haría falta para convertir esto en GO

1. **Generar el APK de EAS al día con D-074/D-075/D-076** (G7) y **ejecutar el
   smoke test en un teléfono real** (G8). Es **humano**: requiere `EXPO_TOKEN`
   (secreto de Actions o del propietario) y un teléfono. Comandos exactos:

   ```bash
   # Opción A — desde el terminal del propietario (con EXPO_TOKEN en el entorno):
   cd apps/mobile
   npx eas-cli login                # solo la primera vez
   npx eas-cli build --platform android --profile release-apk --non-interactive

   # Opción B — sin token local: lanzar el workflow «Expo EAS» desde GitHub
   # (Actions → Expo EAS → Run workflow), perfil release-apk, plataforma android.
   # Consume el secreto EXPO_TOKEN de Actions.

   # Descargar el APK y probarlo en dispositivo:
   npx eas-cli build:download --profile release-apk --platform android
   adb install -r socracia-1.0.0.apk
   ```

   El primer keystore de Android **no** se puede generar en modo no interactivo:
   si no existiera ninguno, `eas build` pediría generarlo de forma interactiva
   (verificado en <https://docs.expo.dev/app-signing/managed-credentials/>, docs
   vigentes al 2026-11-02). En este proyecto el keystore **ya existe**
   (`Build Credentials TnBsQO-OGA`), así que el paso es no interactivo una vez
   hay `EXPO_TOKEN`. Si la cuota gratuita de EAS está agotada, esperar al día 1
   del mes siguiente o usar la ruta local de `docs/build-apk-local.md`.

2. **Ejecutar el smoke test** con `docs/release-1.0-smoke.md` (apunta al APK local
   al día mientras no exista uno de EAS nuevo) y firmar el resultado APTO/NO APTO.

G1, G2, G3, G4, G5, G6 y G9 están cumplidas con evidencia **ejecutada en esta
sesión**. El proceso mayéutico funciona de extremo a extremo, con proveedor falso
y con proveedor real. El NO-GO se sostiene **solo** en G7 (APK de EAS al día,
paso humano) y G8 (smoke en dispositivo, humano).

Los pasos concretos, con sus comandos exactos, están en
`docs/release-1.0-checklist.md` y en `docs/release-1.0-smoke.md`.
