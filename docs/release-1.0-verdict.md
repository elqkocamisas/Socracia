# Dictamen de release — Socracia 1.0.0

**Fecha:** 10 de noviembre de 2026 (re-verificado en esta sesión; ver «Estado de
esta sesión»)
**Versión evaluada:** `1.0.0` (raíz, workspaces, `app.json` y ficha de tienda)
**Alcance:** app móvil de un solo usuario, local-first; importación de documentos
(con OCR opcional); motor mayéutico; proveedor semántico opcional con
consentimiento y clave propia; APK por EAS.
**Fuera de alcance:** multitenencia, consola docente, facturación, publicación en
tiendas.

## Veredicto

### ⚠️ NO-GO (G7 a recompilar por D-074 y G8 pendiente de humano)

Estado de las puertas: **G1, G2, G3, G4, G5, G6 y G9 cumplidas** (evidencia
ejecutada en esta sesión). **G7 queda parcial**: el APK de EAS existía y se
inspeccionó, pero es **anterior** al arreglo D-074, así que hay que
**recompilarlo**. **G8** (smoke en dispositivo real) es **humano**.

El proceso mayéutico **funciona de extremo a extremo**: demostrado con proveedor
falso (recorrido dorado sobre TXT, MD y PDF real, en núcleo e interfaz) y con
**proveedor real** en esta sesión (`eval:real`, 33 casos, 83.3 % / 100 % / 0
citas). En esta sesión se corrigió además el error reportado «al adjuntar el
temario y pulsar Estudiar» (D-074).

**G3 (evals con proveedor real) SÍ se ha verificado en esta sesión** (2026-11-11):
33 casos, concordancia **83.3 %**, paráfrasis **100 %**, citas inventadas **0** →
«G3 alcanzada con proveedor real». Salida completa en
`docs/release-1.0-g3-evidence.txt`.

**G7 (APK por EAS) requiere recompilar.** El build `f2173e7a…` «Succeeded» es
anterior a D-074. No se pudo recompilar aquí porque **`EXPO_TOKEN` no está
disponible** como variable de entorno (vive como secreto de GitHub Actions). Los
comandos exactos para el paso humano están al final de este documento.

Salida completa en `docs/release-1.0-g3-evidence.txt`.

**G8 (smoke en dispositivo) sigue pendiente y es humano**: no puede ejecutarlo un
agente sin un teléfono físico. Existe además un APK 1.0.0 compilado en local
(`dist/socracia-1.0.0.apk`) para adelantar el smoke (solo valida el modo
heurístico si se compiló sin `EXPO_PUBLIC_CLOUD_PROCESSING=1`).

Nota de reproducibilidad de G3: la primera ejecución de la sesión solo obtuvo
veredicto en 13/30 casos por el _cold start_ del servicio gratuito de Render (el
backend aborta cada llamada al proveedor a los 30 s y el arnés no reintenta ese
502). Con el servicio ya despierto, la suite completa los 33 casos.

No se fuerza la versión: se entrega el dictamen NO-GO y el checklist de sprints
restantes (`docs/release-1.0-checklist.md`).

## Niveles de evidencia

Se distingue con precisión qué está **documentado**, **implementado**, **probado
con proveedor falso** y **validado con proveedor real o en dispositivo**. Una
puerta no se da por cumplida sin evidencia ejecutada **en esta sesión**.

## Estado de esta sesión (2026-11-11)

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
7. **G9 — paquete fuente regenerado:** `npm run package:source` → 262 ficheros;
   `npm run verify` reproducido desde cero.

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

| Puerta | Descripción                                                                                | Estado | Nivel de evidencia                                     | Evidencia ejecutada en esta sesión (2026-11-10)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------ | ------------------------------------------------------------------------------------------ | ------ | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G1     | `npm run verify` en verde                                                                  | ✅     | **Ejecutado** (árbol limpio, `npm ci` + verify)        | 41 suites/**359** (core, evals 32/32) + 9/**66** (api) + 34/**229** (mobile) = **654 pruebas**, 0 fallos. La prueba nueva `safeArea.test.tsx` fija el arreglo D-073 y las de `conceptExtractor.test.ts` / `goldenPath.e2e.test.tsx` fijan el arreglo D-074.                                                                                                                                                                                                                                                                                                                                                                                                 |
| G2     | Recorrido dorado con 3 documentos (TXT/MD/PDF) y coherencia por capa documentada           | ✅     | **Ejecutado con proveedor falso**                      | `goldenPath.test.ts` (núcleo: extracción por formato + ciclo completo en TXT, MD y PDF real) + `goldenPath.e2e.test.tsx` (pantallas). Los tres formatos → mismos 3 temas/3 conceptos y mismo cierre. Coherencia por capa en la sección siguiente.                                                                                                                                                                                                                                                                                                                                                                                                           |
| G3     | Evals con proveedor real: ≥30 casos, veredicto ≥80 %, 0 citas inventadas, ≥90 % paráfrasis | ✅     | **Validado con proveedor real** (Gemini, clave propia) | Re-ejecutado **2026-11-11**: `npm run eval:real` contra `https://socracia.onrender.com` → **33 casos** (30 evaluación + 3 generación), concordancia **83.3 %**, paráfrasis **100 %**, citas inventadas **0** → «G3 alcanzada». Salida en `docs/release-1.0-g3-evidence.txt`. Histórico 2026-11-10: 83.3 % (`be140bc`) y 80.0 % (`c24373b`). La corrida es sensible al _cold start_ (riesgo #1).                                                                                                                                                                                                                                                             |
| G4     | Degradación probada en los 4 supuestos de F2                                               | ✅     | **Ejecutado**                                          | `studyService.test.ts` («G4 — degradación en los cuatro supuestos de F2»): sin consentimiento (no llama al proveedor) + red/cuota/salida inválida (degrada y la sesión avanza). Además `consent.test.ts`, `httpProvider.test.ts`, `resilience.test.ts`, `llmEngine.test.ts` y `ocrImport.test.ts` por capa.                                                                                                                                                                                                                                                                                                                                                 |
| G5     | Sin secretos en cliente ni en el APK                                                       | ✅     | **Ejecutado** (escaneo real del APK y del tarball)     | Escaneo 2026-11-11 con `zipfile` sobre el **APK oficial de EAS** (`dist/socracia-1.0.0-eas.apk`, build `f2173e7a…`, **1162 entradas**): **0** `AIza`, **0** `AQ.` (Gemini), **0** `sk-…`, **0** JWT, **0** clave privada, **0** `github_pat_`, **0** `rnd_`. El bundle trae `https://socracia.onrender.com` y `CLOUD_PROCESSING` (modo conectado correcto). Escaneo previo 2026-11-10 sobre el APK local: **0** `AIza`, **0** `GEMINI_API_KEY` con valor, **0** `sk-…`, **0** JWT, **0** clave privada, **0** `api_key` literal. El tarball fuente (260 ficheros): las únicas coincidencias son **nombres** de variable y patrones en docs, nunca un valor. |
| G6     | Textos legales alineados y marcados para revisión humana                                   | ✅     | **Implementado + revisión humana pendiente**           | `docs/privacy-policy.md`, `docs/terms-of-use.md`, `store/privacy-declarations.json`, `storeListing.test.ts`, `legalDocuments.test.ts` y `LegalScreen.test.tsx` en verde; ambos textos marcados «PENDIENTE DE REVISIÓN HUMANA».                                                                                                                                                                                                                                                                                                                                                                                                                              |
| G7     | APK generado por EAS, instalable, versión 1.0.0                                            | ⚠️     | **Ejecutado antes; requiere recompilar por D-074**     | Build **`f2173e7a-661f-408c-ac1c-e91165d2325c`** (run GitHub `43010044967`, `success`): status `FINISHED`, `appVersion 1.0.0`, `com.socracia.app`, SDK 58, perfil `release-apk`; APK descargado (74 MB, sha256 `c8eff612…`) e inspeccionado (0 secretos). **PERO** ese APK es **anterior** al arreglo D-074 (extracción de conceptos), así que **no sirve para el smoke definitivo**: hay que **recompilar** con `release-apk`. No se pudo recompilar en esta sesión porque **`EXPO_TOKEN` no está disponible** en el entorno (solo como secreto de Actions). Comandos exactos abajo.                                                                       |
| G8     | Smoke test humano en dispositivo real                                                      | ⏳     | **Pendiente (humano)**                                 | Checklist listo: `docs/release-1.0-smoke.md`. No ejecutable por un agente (requiere teléfono).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| G9     | Documentación y paquete fuente reproducibles                                               | ✅     | **Ejecutado** (reproducido en esta sesión)             | `npm run package:source` → `dist/socracia-1.0.0-fuente.tar.gz` (**262 ficheros**) + manifiesto. `npm ci && npm run verify` reproducido desde cero (654 pruebas). El tarball no contiene valores de secreto (solo nombres de patrón en docs).                                                                                                                                                                                                                                                                                                                                                                                                                |

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

## Riesgos abiertos

1. **G3 cerrada, con variabilidad en el umbral.** G3 se superó el 2026-11-10
   **dos veces**: 83.3 % (sobre `be140bc`) y 80.0 % (sobre `main` fusionado
   `c24373b`); ambas con 100 % de paráfrasis y 0 citas. La concordancia **roza el
   umbral** (≥80 %) y varía entre ejecuciones por el muestreo del modelo. Riesgo
   residual: (a) el arnés no reintenta el **502 por timeout** y Render (free)
   sufre _cold start_, así que una ejecución en frío puede quedar «no verificada»
   (ocurrió una vez); (b) una salida mal formada del proveedor también detiene la
   suite. Mitigación: calentar el servicio antes de la suite y, como mejora no
   bloqueante, ampliar el reintento del arnés a los 502/timeout.
2. **G7 completado; APK a recompilar por D-074 y G8 pendiente de humano.** El
   build de EAS (run `42820435024`) **terminó con «Succeeded»** y produjo un APK
   de distribución interna; falta la **descarga e instalación** en dispositivo
   (paso humano) y el **smoke test** (G8). **Atención:** el arreglo D-074
   (extracción de conceptos) es posterior al APK `f2173e7a…`, así que ese APK
   **no incluye** la corrección; hay que recompilar con el perfil `release-apk`
   antes del smoke definitivo. Existe además un APK local 1.0.0 que permite
   adelantar el smoke (solo valida el modo heurístico si se compiló sin
   `EXPO_PUBLIC_CLOUD_PROCESSING=1`; ver `docs/release-1.0-smoke.md`).
3. **APK local no es el artefacto de EAS.** `dist/socracia-1.0.0.apk` se compiló
   en local (firma de depuración); sirve para probar, no para publicar. El APK
   «oficial» de lanzamiento sale del build de EAS con el perfil `release-apk`.
4. **Textos legales pendientes de revisión humana.** Coherentes con el
   comportamiento, pero no validados por asesoría jurídica (G6).
5. **Umbral de relevancia del RAG** calibrado para el proveedor léxico
   (`minScore = 0.2`); un proveedor semántico real exige recalibrarlo.
6. **Multitenencia inerte por construcción.** No hay código multitenante en el
   árbol (solo documentación D-053…D-056): no hay nada que apagar. Riesgo nulo
   para 1.0.
7. **Divergencia rama `main` ↔ rama de trabajo — CERRADA (2026-11-10).** El PR
   #19 se integró en `main` por **fast-forward** (`be140bc` → `c24373b`, 11
   commits) y Render desplegó por `autoDeploy` (`dep-dbpnpmeq…`, `new_commit`).
   Verificado tras el deploy: `/health` sirve `c24373b` con `ocr.configured:
true`, y `POST /mayeutic/ocr` responde **401** (existe y exige sesión), no 404.
   G3 se **re-ejecutó sobre `main` fusionado** y vuelve a superar los umbrales
   (33 casos; ver nota de variabilidad abajo).

## Qué haría falta para convertir esto en GO

1. **Recompilar el APK en EAS con D-074** (G7) y **ejecutar el smoke test en un
   teléfono real** (G8) siguiendo `docs/release-1.0-smoke.md`. Es el único camino
   que queda y es **humano** (requiere `EXPO_TOKEN` y un teléfono). Comandos
   exactos:

   ```bash
   # Opción A — desde el terminal del propietario (con EXPO_TOKEN en el entorno):
   cd apps/mobile
   npx eas-cli build --platform android --profile release-apk --non-interactive

   # Opción B — sin token local: lanzar el workflow «Expo EAS» desde GitHub
   # (Actions → Expo EAS → Run workflow), perfil release-apk, plataforma android.
   # Consume el secreto EXPO_TOKEN de Actions.

   # Descargar el APK y instalarlo:
   npx eas-cli build:download --profile release-apk --platform android
   adb install -r socracia-1.0.0.apk
   ```

   El primer keystore de Android **no** se puede generar en modo no interactivo:
   si no existiera ninguno, `eas build` pediría generarlo (verificado en
   <https://docs.expo.dev/app-signing/managed-credentials/>). En este proyecto el
   keystore **ya existe** (`Build Credentials TnBsQO-OGA`), así que el paso es no
   interactivo.

2. **Opcional (mejora):** ampliar el reintento del arnés `eval:real` a los 502 por
   timeout, para que una ejecución en frío no quede a medias (riesgo #1).

G3 (clave de proveedor válida) está cumplida y re-verificada hoy; G7 queda
**parcial** (hay que recompilar por D-074) y G8 es humano.

Los pasos concretos, con sus comandos exactos, están en
`docs/release-1.0-checklist.md` y en `docs/release-1.0-smoke.md`.
