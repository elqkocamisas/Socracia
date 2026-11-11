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

### ⚠️ NO-GO (solo G8 pendiente de humano)

El PR #19 se **fusionó en `main`** por fast-forward (`be140bc` → `c24373b`) y
Render desplegó por `autoDeploy`; el backend ya sirve el código completo
(OCR + D-072).

Estado de las puertas: **G1, G2, G3, G4, G5, G6, G7 y G9 cumplidas** (evidencia
ejecutada en esta sesión). **G8 pendiente** (smoke en dispositivo real), que es
necesariamente humano. **G3 se desbloqueó en esta sesión**: la clave del
proveedor se repuso con una válida y `npm run eval:real` superó los umbrales
(83.3 % de concordancia, 100 % de paráfrasis, 0 citas inventadas, 33 casos).

El proceso mayéutico **funciona de extremo a extremo con proveedor falso** y está
demostrado con pruebas ejecutadas en esta sesión sobre un árbol limpio
(`npm ci && npm run verify`): recorrido dorado sobre TXT, MD y PDF real, en el
núcleo y en la interfaz, más el nuevo camino de OCR. La versión 1.0.0 está
preparada de forma consistente y el paquete fuente se reproduce.

**G3 (evals con proveedor real) SÍ se ha verificado en esta sesión.** La variable
`GEMINI_API_KEY` del servicio de Render contenía un valor que **no era una clave
de Gemini** (un secreto hexadecimal de 32 caracteres), por lo que el proveedor
respondía 400 «Please pass a valid API key». Se reemplazó por una clave **válida**
(comprobada antes contra el endpoint del proveedor: HTTP 200) y se desplegó. El
arnés oficial `npm run eval:real` contra el backend desplegado
(`https://socracia.onrender.com`, commit `be140bc`) supera los umbrales:

> concordancia de veredicto: **83.3 %** (≥ 80 %)
> paráfrasis correctas aceptadas: **100.0 %** (≥ 90 %)
> citas/preguntas inventadas: **0** (= 0)
> 33 casos ejecutados (30 evaluación + 3 generación) · `G3 alcanzada con proveedor real.`

Salida completa en `docs/release-1.0-g3-evidence.txt`.

**G7 (APK por EAS) ya está cumplido en esta sesión**: el build se lanzó con el
workflow `eas-build.yml` (que usa el secreto `EXPO_TOKEN` de Actions) sobre
`111f409` y **terminó con «Succeeded»**, produciendo un artefacto APK de
distribución interna (build `465412d7…`). Falta solo la descarga/instalación, que
es un paso humano. **G8 (smoke en dispositivo) sigue pendiente y es humano**: no
puede ejecutarlo un agente sin un teléfono físico. Existe además un APK 1.0.0
compilado en local (`dist/socracia-1.0.0.apk`) para adelantar el smoke.

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

## Estado de esta sesión (2026-11-10)

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

| Puerta | Descripción                                                                                | Estado | Nivel de evidencia                                                   | Evidencia ejecutada en esta sesión (2026-11-10)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------ | ------------------------------------------------------------------------------------------ | ------ | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G1     | `npm run verify` en verde                                                                  | ✅     | **Ejecutado** (árbol limpio, `npm ci` + verify)                      | 41 suites/**355** (core, evals 32/32) + 9/**66** (api) + 33/**227** (mobile) = **648 pruebas**, 0 fallos                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| G2     | Recorrido dorado con 3 documentos (TXT/MD/PDF) y coherencia por capa documentada           | ✅     | **Ejecutado con proveedor falso**                                    | `goldenPath.test.ts` (núcleo: extracción por formato + ciclo completo en TXT, MD y PDF real) + `goldenPath.e2e.test.tsx` (pantallas). Los tres formatos → mismos 3 temas/3 conceptos y mismo cierre. Coherencia por capa en la sección siguiente.                                                                                                                                                                                                                                                                                                                                                                                                           |
| G3     | Evals con proveedor real: ≥30 casos, veredicto ≥80 %, 0 citas inventadas, ≥90 % paráfrasis | ✅     | **Validado con proveedor real** (Gemini, clave propia)               | `npm run eval:real` contra `https://socracia.onrender.com`: **33 casos** con **83.3 %** de veredicto (commit `be140bc`) y **80.0 %** tras fusionar el PR #19 (commit `c24373b`); en ambas, paráfrasis **100 %** y citas inventadas **0** → «G3 alcanzada». Salida en `docs/release-1.0-g3-evidence.txt`.                                                                                                                                                                                                                                                                                                                                                    |
| G4     | Degradación probada en los 4 supuestos de F2                                               | ✅     | **Ejecutado**                                                        | `studyService.test.ts` («G4 — degradación en los cuatro supuestos de F2»): sin consentimiento (no llama al proveedor) + red/cuota/salida inválida (degrada y la sesión avanza). Además `consent.test.ts`, `httpProvider.test.ts`, `resilience.test.ts`, `llmEngine.test.ts` y `ocrImport.test.ts` por capa.                                                                                                                                                                                                                                                                                                                                                 |
| G5     | Sin secretos en cliente ni en el APK                                                       | ✅     | **Ejecutado** (escaneo real del APK y del tarball)                   | Escaneo 2026-11-11 con `zipfile` sobre el **APK oficial de EAS** (`dist/socracia-1.0.0-eas.apk`, build `b19ef0a8…`, **1158 entradas**): **0** `AIza`, **0** `AQ.` (Gemini), **0** `sk-…`, **0** JWT, **0** clave privada, **0** `github_pat_`, **0** `rnd_`. El bundle trae `https://socracia.onrender.com` y `CLOUD_PROCESSING` (modo conectado correcto). Escaneo previo 2026-11-10 sobre el APK local: **0** `AIza`, **0** `GEMINI_API_KEY` con valor, **0** `sk-…`, **0** JWT, **0** clave privada, **0** `api_key` literal. El tarball fuente (260 ficheros): las únicas coincidencias son **nombres** de variable y patrones en docs, nunca un valor. |
| G6     | Textos legales alineados y marcados para revisión humana                                   | ✅     | **Implementado + revisión humana pendiente**                         | `docs/privacy-policy.md`, `docs/terms-of-use.md`, `store/privacy-declarations.json`, `storeListing.test.ts`, `legalDocuments.test.ts` y `LegalScreen.test.tsx` en verde; ambos textos marcados «PENDIENTE DE REVISIÓN HUMANA».                                                                                                                                                                                                                                                                                                                                                                                                                              |
| G7     | APK generado por EAS, instalable, versión 1.0.0                                            | ✅     | **Ejecutado** (build de EAS `FINISHED`; APK descargado y verificado) | Build **`b19ef0a8-c0db-4c4e-b651-71c42fd1f7b2`** lanzado el 2026-11-11 vía workflow `eas-build.yml` sobre **`main` @ `1ca235c`** (run GitHub `42935503769`, `success`; keystore existente `TnBsQO-OGA`): **status `FINISHED`**, `appVersion 1.0.0`, `appBuildVersion 12`, `com.socracia.app`, SDK 58. **APK descargado** (75.6 MB) e **inspeccionado**: manifest `versionName 1.0.0`; 0 secretos. Build anterior: [`465412d7…`](https://expo.dev/accounts/camiseros-team/projects/socracia/builds/465412d7-82c8-4f52-9b89-336ec08d0b8d) («Succeeded»). El `versionCode` lo asigna EAS en remoto (`appVersionSource: remote`).                               |
| G8     | Smoke test humano en dispositivo real                                                      | ⏳     | **Pendiente (humano)**                                               | Checklist listo: `docs/release-1.0-smoke.md`. No ejecutable por un agente (requiere teléfono).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| G9     | Documentación y paquete fuente reproducibles                                               | ✅     | **Ejecutado** (reproducido en esta sesión)                           | `npm run package:source` → `dist/socracia-1.0.0-fuente.tar.gz` (**260 ficheros**, 3815 KiB) + manifiesto. `npm ci && npm run verify` reproducido desde cero. El tarball no contiene valores de secreto.                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

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
2. **G7 completado; G8 pendiente de humano.** El build de EAS (run `42820435024`)
   **terminó con «Succeeded»** y produjo un APK de distribución interna; falta la
   **descarga e instalación** en dispositivo (paso humano) y el **smoke test**
   (G8). Existe además un APK local 1.0.0 que permite adelantar el smoke (solo
   valida el modo heurístico si se compiló sin `EXPO_PUBLIC_CLOUD_PROCESSING=1`;
   ver `docs/release-1.0-smoke.md`).
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

1. **Ejecutar el smoke test en un teléfono real** (G8) siguiendo
   `docs/release-1.0-smoke.md`, con el APK de EAS (`release-apk`) ya generado. Es
   el único paso que queda y es humano.
2. **Opcional (mejora):** ampliar el reintento del arnés `eval:real` a los 502 por
   timeout, para que una ejecución en frío no quede a medias.

G3 (clave de proveedor válida) y G7 (APK por EAS) ya están cumplidas; ver arriba.

Los pasos concretos, con sus comandos exactos, están en
`docs/release-1.0-checklist.md` y en `docs/release-1.0-smoke.md`.
