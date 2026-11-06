# Dictamen de release — Socracia 1.0.0

**Fecha:** 4 de noviembre de 2026
**Versión evaluada:** `1.0.0` (raíz, workspaces, `app.json` y ficha de tienda)
**Alcance:** app móvil de un solo usuario, local-first; importación de documentos;
motor mayéutico; proveedor semántico opcional con consentimiento; APK por EAS.
**Fuera de alcance:** multitenencia, consola docente, facturación, publicación en
tiendas.

## Veredicto

## ❌ NO-GO

El proceso mayéutico **funciona de extremo a extremo** y está demostrado con
pruebas ejecutadas (recorrido dorado sobre TXT, MD y PDF real, en el núcleo y en
la interfaz). La versión 1.0.0 está preparada y el perfil de APK de EAS está
definido y validado.

**El GO queda bloqueado por dos puertas que exigen un paso humano o una
credencial que no está disponible en este entorno:**

- **G3 — evals con proveedor real: NO VERIFICADO.** El backend de Render **sí
  tiene** la clave de Gemini configurada (comprobado: `/mayeutic/*` responde 502
  del proveedor, no 503 «no configurado»), pero **toda** llamada real devuelve un
  `400` del proveedor. La causa es del lado del proveedor (clave o acceso al
  modelo), no del cuerpo de la petición: se calibró contra Gemini y el cuerpo que
  envía el backend **pasa** su validación de forma (un `response_format` o
  `max_tokens` inválidos se rechazan _antes_ que la clave; el cuerpo real solo
  produce «Please pass a valid API key» con una clave falsa). Falta evidencia
  ejecutada contra el proveedor real, así que G3 queda «no verificado» y
  **bloquea el GO** por regla explícita del encargo. Las evals del repositorio
  (32 casos) corren contra el **proveedor falso** y miden la robustez del motor,
  no la calidad del modelo real. El arnés para cerrarla ya existe
  (`npm run eval:real`, D-060).
  **Causa raíz confirmada (2026-11-05, tras habilitar facturación):** una clave
  de Gemini **válida** (autentica y lista 50 modelos, `gemini-3.8-flash` incluido)
  devuelve **HTTP 402 `RESOURCE_EXHAUSTED`** en **toda** llamada: «Your
  prepayment credits are depleted». Habilitar la facturación **no** restaura la
  cuota gratuita: el proyecto pasa a prepago con **0 créditos**, y sin créditos el
  modelo no responde. Por tanto el bloqueo no es de código ni de clave mal
  formada, sino de **créditos del proyecto de Gemini**.
  **Y no se arregla con otro modelo (D-062):** se probaron **los 47 modelos** que
  la clave lista (`gemini-2.0/2.5/3.x`, Flash/Pro/Flash-Lite, `gemma-4-*`,
  embeddings), por el endpoint OpenAI-compatible, por `generateContent` nativo y
  por `v1`/`v1beta`, con `Bearer` y con `x-goog-api-key`: **los 47 devuelven el
  mismo 402**. La cuota es **por proyecto, no por clave ni por modelo**, así que
  ningún nombre de modelo puede esquivar el bloqueo. El modelo por defecto
  (`gemini-3.8-flash`) **ya es de nivel gratuito** según la tabla oficial.
- **G7 — APK por EAS: pendiente del paso humano.** No hay `EXPO_TOKEN` en el
  entorno. Además, el **primer keystore de Android no se puede generar en modo no
  interactivo** (comportamiento documentado de `eas-cli`), así que la primera
  compilación exige que una persona inicie sesión e interactúe. La configuración
  está validada; el artefacto no se ha producido.

G8 (prueba manual en dispositivo) depende de G7, así que también queda pendiente.

No se fuerza la versión: se entrega el dictamen NO-GO y el checklist de sprints
restantes (`docs/release-1.0-checklist.md`).

## Niveles de evidencia

Se distingue con precisión qué está **documentado**, **implementado**,
**probado con proveedor falso** y **validado con proveedor real o en
dispositivo**. Una puerta no se da por cumplida sin evidencia ejecutada.

## Tabla de puertas G1–G9

| Puerta | Descripción                                                                                | Estado | Nivel de evidencia                       | Evidencia ejecutada                                                                                                                                                                                                                                                |
| ------ | ------------------------------------------------------------------------------------------ | ------ | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| G1     | `npm run verify` en verde                                                                  | ✅     | Ejecutado                                | 40 suites/332 (core, evals 32/32) + 8/56 (api) + 24/172 (mobile) = **560 pruebas**                                                                                                                                                                                 |
| G2     | Recorrido dorado con 3 documentos (TXT/MD/PDF) y coherencia por capa documentada           | ✅     | Ejecutado con proveedor falso            | `packages/core/src/__tests__/goldenPath.test.ts` (12: extracción por formato + ciclo completo en TXT, MD y PDF real) + `apps/mobile/src/__tests__/goldenPath.e2e.test.tsx` (1, pantallas). Los tres formatos → mismos 3 temas/3 conceptos y mismo cierre de sesión |
| G3     | Evals con proveedor real: ≥30 casos, veredicto ≥80 %, 0 citas inventadas, ≥90 % paráfrasis | ❌     | **No verificado**                        | Backend con clave Gemini, pero el proveedor devuelve 400 en toda llamada (causa del proveedor, no del cuerpo). Arnés listo: `npm run eval:real` (D-060). Evals del repo = 32 casos con proveedor falso (no cuentan para G3)                                        |
| G4     | Degradación probada en los 4 supuestos de F2                                               | ✅     | Ejecutado                                | `consent.test.ts`, `httpProvider.test.ts` (red, 429/cuota, respuesta inválida), `sessionAsync.test.ts`, `resilience.test.ts`, `llmEngine.test.ts`                                                                                                                  |
| G5     | Sin secretos en cliente ni en el APK                                                       | ✅     | Ejecutado (bundle)                       | `expo export` + `strings` del bundle `.hbc`: 0 `AIza`, 0 `GEMINI_API_KEY`, 0 `sk-`, 0 `eyJ`. El cliente solo usa token de sesión                                                                                                                                   |
| G6     | Textos legales alineados y marcados para revisión humana                                   | ✅     | Implementado + revisión humana pendiente | `docs/privacy-policy.md`, `docs/terms-of-use.md`, `privacy-declarations.json`, `storeListing.test.ts`; notas internas marcadas «PENDIENTE DE REVISIÓN HUMANA»                                                                                                      |
| G7     | APK generado por EAS, instalable, versión 1.0.0                                            | ⚠️     | Config validada; artefacto pendiente     | Perfil `release-apk` en `eas.json` + prueba `buildConfig.test.ts`. **Sin `EXPO_TOKEN` y con keystore inicial pendiente de paso humano**                                                                                                                            |
| G8     | Smoke test humano en dispositivo real                                                      | ⏳     | Pendiente                                | Checklist listo: `docs/release-1.0-smoke.md`. Depende de G7                                                                                                                                                                                                        |
| G9     | Documentación y paquete fuente reproducibles                                               | ✅     | Ejecutado                                | `npm run package:source` produce `dist/socracia-1.0.0-fuente.tar.gz` + manifiesto con huellas; `npm ci && npm run verify` reproducible                                                                                                                             |

Leyenda: ✅ cumplida · ⚠️ parcial (requiere paso humano) · ❌ no verificada · ⏳ pendiente.

## Recorrido dorado: dónde se pierde y dónde no la coherencia significante↔significado

Diagnóstico por capa (F1), con el resultado real observado:

| Capa                          | Comportamiento                                                                                                                                                                                                                         | Veredicto                    |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| **Extracción PDF**            | Defecto A **corregido**: el extractor aplanaba los espacios y pegaba el encabezado al párrafo, de modo que un PDF producía 1 tema en vez de 3. Ahora respeta los límites de bloque (`BT…ET`) y produce los mismos 3 temas que TXT y MD | Coherente tras la corrección |
| **Segmentación y conceptos**  | Defecto C **corregido**: `## Tema 1. X` no se limpiaba como `Tema 1. X`, así que MD y TXT daban títulos distintos. Ahora `cleanHeading` unifica ambos                                                                                  | Coherente tras la corrección |
| **Generación**                | Cada pregunta se ancla a un `chunkId` real, con `excerpt` y rango de caracteres verificables contra los fragmentos guardados                                                                                                           | Coherente                    |
| **Evaluación**                | La paráfrasis correcta se acepta y la respuesta errónea se rechaza; la repregunta ataca el término clave ausente de **esa** pregunta y nunca revela `expectedAnswer`                                                                   | Coherente                    |
| **Explicación («explícame»)** | Defecto B **corregido**: el controlador calculaba la explicación y la descartaba. Ahora `StudyViewState.explanation` la propaga y `StudyScreen` la muestra («Te lo explico»)                                                           | Coherente tras la corrección |

**Conclusión de coherencia:** tras corregir los tres defectos, el significante
(pregunta, andamiaje, explicación) se corresponde con el significado (concepto,
cita y término clave de la fuente). No se detectó pérdida de coherencia residual
en el recorrido, con proveedor falso.

## Riesgos abiertos

1. **G3 no verificado (bloqueante).** El backend tiene la clave, pero el
   proveedor devuelve 400; con una clave válida probada directamente, el
   proveedor devuelve **402 `RESOURCE_EXHAUSTED`** («prepayment credits are
   depleted»). **Causa raíz confirmada: el proyecto de Gemini no tiene créditos
   ni cuota gratuita utilizable** (habilitar facturación pasó el proyecto a
   prepago con 0 créditos). Sin evals contra un proveedor real en verde no se
   puede afirmar que la evaluación semántica alcance el 80 % de concordancia ni
   el 90 % de paráfrasis aceptadas, ni que no invente citas. Mitigación: la
   heurística es el respaldo probado y el consentimiento es explícito; aun así, la
   puerta exige evidencia real. **Desbloqueo (humano):** cargar créditos de
   prepago en el proyecto, o crear una clave en un proyecto de Gemini **sin**
   facturación (nivel gratuito) y configurarla como `GEMINI_API_KEY` en Render;
   después, desplegar el backend con la propagación de error (D-060) y ejecutar
   `npm run eval:real`.
2. **Primer build de EAS (bloqueante para G7/G8).** El primer keystore exige modo
   interactivo. Riesgo de cuota: el plan gratuito permite **15 builds de Android
   al mes** (verificado el 2026-11-04); no se ha consumido ninguno desde aquí.
3. **APK no inspeccionado como artefacto.** G5 se comprobó sobre el bundle de
   `expo export`, que es la entrada del APK, no sobre el APK final firmado. Se
   recomienda repetir la inspección de `strings` sobre el `.apk` una vez generado.
4. **Textos legales pendientes de revisión humana.** Coherentes con el
   comportamiento, pero no validados por asesoría jurídica (G6).
5. **Umbral de relevancia del RAG** calibrado para el proveedor léxico
   (`minScore = 0.2`); un proveedor semántico real exige recalibrarlo.
6. **Multitenencia inerte por construcción.** No hay código multitenante en el
   árbol (solo documentación D-053…D-058): no hay nada que apagar. Riesgo nulo
   para 1.0, pero conviene recordar que la hoja de ruta 1.1 la activa.

## Qué haría falta para convertir esto en GO

1. Ejecutar `npm run eval:real` contra el backend con el proveedor real en verde
   (≥30 casos, veredicto ≥80 %, 0 citas inventadas, ≥90 % paráfrasis). El arnés
   ya existe (D-060); antes hay que resolver el **402 `RESOURCE_EXHAUSTED`**:
   cargar créditos de prepago en el proyecto de Gemini o usar una clave de un
   proyecto sin facturación (nivel gratuito), y configurarla en Render.
2. Lanzar el primer `eas build` interactivo para generar el keystore y producir el
   APK de lanzamiento (G7).
3. Ejecutar `docs/release-1.0-smoke.md` en un teléfono real (G8).

Los pasos concretos, con sus comandos exactos, están en
`docs/release-1.0-checklist.md` y en `docs/release-1.0-smoke.md`.
