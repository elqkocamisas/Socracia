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

### ⚠️ NO-GO (bloqueado por G3; G8 pendiente de humano)

El proceso mayéutico **funciona de extremo a extremo con proveedor falso** y está
demostrado con pruebas ejecutadas en esta sesión sobre un árbol limpio
(`npm ci && npm run verify`): recorrido dorado sobre TXT, MD y PDF real, en el
núcleo y en la interfaz, más el nuevo camino de OCR. La versión 1.0.0 está
preparada de forma consistente y el paquete fuente se reproduce.

**G3 (evals con proveedor real) NO se ha podido reproducir en esta sesión.** El
arnés oficial `npm run eval:real` contra el backend desplegado
(`https://socracia.onrender.com`) devuelve, textualmente:

> Proveedor semántico NO disponible: El proveedor semántico respondió 400:
> Please pass a valid API key
> G3 queda «no verificada»: no hay evidencia real que evaluar.

La clave del proveedor configurada en el backend desplegado **ya no es válida**
(revocada, agotada o reemplazada). `/health` sigue respondiendo
`provider.configured: true`, pero `configured` **no** implica `valid`: la clave
existe y no autentica. La evidencia de G3 de dictámenes previos
(`docs/release-1.0-g3-evidence.txt`, 83.3 % / 100 % / 0 citas) **no es
reproducible hoy**: se conserva como registro histórico, pero la puerta queda
**«no verificada»**. Según las reglas de la misión («sin clave real: G3 queda no
verificado y bloquea el GO»), esto **bloquea el GO**.

**G8 (smoke en dispositivo) sigue pendiente y es humano**: no puede ejecutarlo un
agente sin un teléfono físico. **G7 (APK por EAS) no es verificable desde este
entorno**: no hay `EXPO_TOKEN` disponible y el artefacto de EAS no es público;
existe un APK 1.0.0 compilado en local (`dist/socracia-1.0.0.apk`) y las
instrucciones exactas para la ruta EAS (ver G7).

No se fuerza la versión: se entrega el dictamen NO-GO y el checklist de sprints
restantes (`docs/release-1.0-checklist.md`).

## Niveles de evidencia

Se distingue con precisión qué está **documentado**, **implementado**, **probado
con proveedor falso** y **validado con proveedor real o en dispositivo**. Una
puerta no se da por cumplida sin evidencia ejecutada **en esta sesión**.

## Estado de esta sesión (2026-11-10)

Trabajo realizado y verificado **hoy**, sobre `main` en `be140bc` + la rama
`feat/motor-semantico-modo-conectado` (PR #19, 4 commits):

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
5. **F4 — build EAS.** **No ejecutado**: no hay `EXPO_TOKEN` en el entorno y el
   primer keystore de Android exige modo interactivo. Comandos exactos en G7.
6. **Pruebas nuevas:** 7 en total (3 de degradación tolerante + 3 de G4 + 1 de UI
   del proveedor caído). Ninguna firma pública del dominio cambió y no se modificó
   ninguna prueba existente (el test que fijaba el aborto sigue verde porque no
   activa la opción nueva).

## Tabla de puertas G1–G9

| Puerta | Descripción                                                                                | Estado | Nivel de evidencia                                           | Evidencia ejecutada en esta sesión (2026-11-10)                                                                                                                                                                                                                                                                                         |
| ------ | ------------------------------------------------------------------------------------------ | ------ | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G1     | `npm run verify` en verde                                                                  | ✅     | **Ejecutado** (árbol limpio, `npm ci` + verify)              | 41 suites/**355** (core, evals 32/32) + 9/**66** (api) + 33/**227** (mobile) = **648 pruebas**, 0 fallos                                                                                                                                                                                                                                |
| G2     | Recorrido dorado con 3 documentos (TXT/MD/PDF) y coherencia por capa documentada           | ✅     | **Ejecutado con proveedor falso**                            | `goldenPath.test.ts` (núcleo: extracción por formato + ciclo completo en TXT, MD y PDF real) + `goldenPath.e2e.test.tsx` (pantallas). Los tres formatos → mismos 3 temas/3 conceptos y mismo cierre. Coherencia por capa en la sección siguiente.                                                                                       |
| G3     | Evals con proveedor real: ≥30 casos, veredicto ≥80 %, 0 citas inventadas, ≥90 % paráfrasis | ❌     | **NO verificado (no reproducible hoy)**                      | `npm run eval:real` contra `https://socracia.onrender.com` (2026-11-10): **400 «Please pass a valid API key»**. La evidencia histórica (`release-1.0-g3-evidence.txt`) no se reproduce. **Bloquea el GO.**                                                                                                                              |
| G4     | Degradación probada en los 4 supuestos de F2                                               | ✅     | **Ejecutado**                                                | `studyService.test.ts` («G4 — degradación en los cuatro supuestos de F2»): sin consentimiento (no llama al proveedor) + red/cuota/salida inválida (degrada y la sesión avanza). Además `consent.test.ts`, `httpProvider.test.ts`, `resilience.test.ts`, `llmEngine.test.ts` y `ocrImport.test.ts` por capa.                             |
| G5     | Sin secretos en cliente ni en el APK                                                       | ✅     | **Ejecutado** (escaneo real del APK y del tarball)           | Escaneo 2026-11-10 con `zipfile` sobre `dist/socracia-1.0.0.apk` (**1158 entradas**): **0** `AIza`, **0** `GEMINI_API_KEY` con valor, **0** `sk-…`, **0** JWT, **0** clave privada, **0** `api_key` literal. El tarball fuente (260 ficheros): las únicas coincidencias son **nombres** de variable y patrones en docs, nunca un valor. |
| G6     | Textos legales alineados y marcados para revisión humana                                   | ✅     | **Implementado + revisión humana pendiente**                 | `docs/privacy-policy.md`, `docs/terms-of-use.md`, `store/privacy-declarations.json`, `storeListing.test.ts`, `legalDocuments.test.ts` y `LegalScreen.test.tsx` en verde; ambos textos marcados «PENDIENTE DE REVISIÓN HUMANA».                                                                                                          |
| G7     | APK generado por EAS, instalable, versión 1.0.0                                            | ⚠️     | **No verificable desde este entorno; instrucciones exactas** | No hay `EXPO_TOKEN` en el entorno, así que **no se ha ejecutado `eas build`** en esta sesión. Existe `dist/socracia-1.0.0.apk` (75 MB, `com.socracia.app`, `versionName 1.0.0`, compilado en local; ver `docs/build-apk-local.md`). El `versionCode` lo asigna EAS en remoto (`appVersionSource: remote`). Comandos EAS abajo.          |
| G8     | Smoke test humano en dispositivo real                                                      | ⏳     | **Pendiente (humano)**                                       | Checklist listo: `docs/release-1.0-smoke.md`. No ejecutable por un agente (requiere teléfono).                                                                                                                                                                                                                                          |
| G9     | Documentación y paquete fuente reproducibles                                               | ✅     | **Ejecutado** (reproducido en esta sesión)                   | `npm run package:source` → `dist/socracia-1.0.0-fuente.tar.gz` (**260 ficheros**, 3815 KiB) + manifiesto. `npm ci && npm run verify` reproducido desde cero. El tarball no contiene valores de secreto.                                                                                                                                 |

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
coherencia residual. La validación con **proveedor real** (G3) es la que falta y
es la que no se puede afirmar hoy.

## G7 — comandos exactos (ruta EAS)

No se ha ejecutado `eas build` en esta sesión (falta `EXPO_TOKEN`). El primer
keystore de Android **no se puede generar en modo no interactivo**: la
documentación vigente de Expo indica que, al ejecutar `eas build` sin credenciales
previas, «you will be prompted to generate credentials» (verificado 2026-11-04 en
<https://docs.expo.dev/app-signing/managed-credentials/>). Pasos exactos:

```bash
# Primera vez (requiere paso humano interactivo para generar el keystore):
cd apps/mobile
npx eas-cli login                 # cuenta de Expo del propietario
npx eas-cli build --profile release-apk --platform android
#   En el primer build, acepta generar el keystore (modo interactivo).

# Builds siguientes (ya con credenciales en EAS, no interactivo):
EXPO_TOKEN=... npx eas-cli build --profile release-apk --platform android --non-interactive

# Descargar e instalar:
npx eas-cli build:download --profile release-apk --platform android
adb install -r socracia-1.0.0.apk
```

**Cuota del plan gratuito de EAS (re-verificada 2026-11-10 en
<https://expo.dev/pricing>):** «15 Android and 15 iOS builds» de baja prioridad
al mes, con reinicio mensual; los planes gratuitos no acumulan sobrecoste. Se
reserva al menos una compilación para el APK de lanzamiento. Respaldo si se
agota: `docs/build-apk-local.md`.

## Riesgos abiertos

1. **G3 NO reproducida (bloqueante).** La re-ejecución del 2026-11-10 contra el
   backend desplegado devuelve **400 «Please pass a valid API key»**. La evidencia
   histórica (83.3 % / 100 % / 0 citas) **no se ha podido reproducir hoy**.
   Mitigación mientras no haya clave: el motor degrada a la heurística (probada en
   G4). Para cerrar G3 hay que reponer una clave **válida** en el servidor (nunca
   en el cliente) y repetir `npm run eval:real`.
2. **G7 no verificable aquí / G8 pendiente de humano.** No hay `EXPO_TOKEN` en el
   entorno, así que no se ha lanzado `eas build`; existe un APK local 1.0.0 que
   permite adelantar el smoke test (solo valida el modo heurístico si se compiló
   sin `EXPO_PUBLIC_CLOUD_PROCESSING=1`; ver `docs/release-1.0-smoke.md`). El
   smoke en dispositivo es humano (G8).
3. **APK local no es el artefacto de EAS.** `dist/socracia-1.0.0.apk` se compiló
   en local (firma de depuración); sirve para probar, no para publicar. El APK
   «oficial» de lanzamiento debe salir de EAS con el perfil `release-apk`.
4. **Textos legales pendientes de revisión humana.** Coherentes con el
   comportamiento, pero no validados por asesoría jurídica (G6).
5. **Umbral de relevancia del RAG** calibrado para el proveedor léxico
   (`minScore = 0.2`); un proveedor semántico real exige recalibrarlo.
6. **Multitenencia inerte por construcción.** No hay código multitenante en el
   árbol (solo documentación D-053…D-056): no hay nada que apagar. Riesgo nulo
   para 1.0.

## Qué haría falta para convertir esto en GO

1. **Restaurar G3 (bloqueante principal).** Reponer en el backend desplegado una
   clave de proveedor **válida** (nivel gratuito, coste cero) como variable de
   entorno **solo del servidor** y ejecutar `npm run eval:real` contra él. Debe
   superar ≥30 casos, veredicto ≥80 %, paráfrasis ≥90 % y 0 citas inventadas.
   Requiere una persona con acceso a la clave.
2. **Producir el APK por EAS** (G7) con `EXPO_TOKEN` y, si no existe keystore,
   con el paso interactivo inicial. Después, descargarlo e instalarlo.
3. **Ejecutar el smoke test en un teléfono real** (G8) siguiendo
   `docs/release-1.0-smoke.md`.

Los pasos concretos, con sus comandos exactos, están en
`docs/release-1.0-checklist.md` y en `docs/release-1.0-smoke.md`.
