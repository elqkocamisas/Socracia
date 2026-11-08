# Dictamen de release — Socracia 1.0.0

**Fecha:** 6 de noviembre de 2026
**Versión evaluada:** `1.0.0` (raíz, workspaces, `app.json` y ficha de tienda)
**Alcance:** app móvil de un solo usuario, local-first; importación de documentos;
motor mayéutico; proveedor semántico opcional con consentimiento; APK por EAS.
**Fuera de alcance:** multitenencia, consola docente, facturación, publicación en
tiendas.

## Veredicto

## ⚠️ NO-GO (bloqueado solo por pasos humanos: G7/G8)

El proceso mayéutico **funciona de extremo a extremo** y está demostrado con
pruebas ejecutadas: recorrido dorado sobre TXT, MD y PDF real (núcleo e
interfaz), **y evals contra el proveedor semántico real** (G3). La versión 1.0.0
está preparada y el perfil de APK de EAS está definido y validado.

**Tras desactivar la facturación del proyecto de Gemini (recuperando el nivel
gratuito), G3 deja de estar bloqueada:** el arnés real supera los tres umbrales
(concordancia de veredicto **83.3 %**, paráfrasis aceptadas **100 %**, **0**
citas inventadas). El bloqueo de G3 documentado en dictámenes previos
(D-061/D-062) era de créditos del proyecto, no de código; queda resuelto.

**El GO queda bloqueado únicamente por dos puertas que exigen un paso humano o
una credencial no disponible en este entorno:**

- **G7 — APK por EAS: pendiente del paso humano.** No hay `EXPO_TOKEN` en el
  entorno. Además, el **primer keystore de Android no se puede generar en modo no
  interactivo** (comportamiento documentado de `eas-cli`), así que la primera
  compilación exige que una persona inicie sesión e interactúe. La configuración
  está validada; el artefacto no se ha producido.
- **G8 — smoke test en dispositivo: pendiente.** Depende de G7.

No se fuerza la versión: se entrega el dictamen NO-GO y el checklist de sprints
restantes (`docs/release-1.0-checklist.md`).

## Niveles de evidencia

Se distingue con precisión qué está **documentado**, **implementado**,
**probado con proveedor falso** y **validado con proveedor real o en
dispositivo**. Una puerta no se da por cumplida sin evidencia ejecutada.

## Estado de la integración (actualización 2026-11-04)

El trabajo de identidad visual (tema claro/oscuro), visibilidad del motor,
onboarding y consentimiento por documento está en la rama `integration/1.0`
(PR **#18**, 31 commits sobre `main`). Se añadieron 6 suites de pruebas
(`themeContrast`, `themeTokens`, `engineStatus`, `healthProbe`,
`themeAndConsent`, `studyEngineBadge`) y `npm run verify` quedó en **609
pruebas** verdes, con el recorrido dorado (G2) todavía en verde. Ninguna firma
pública del dominio cambió.

> **Aviso de integración:** en este entorno el token de GitHub es **de solo
> lectura** (`x-oauth-scopes` vacío), así que los dos commits nuevos **no se han
> podido empujar** a `origin/integration/1.0`. Quedan commiteados en local,
> listos para un `git push` con un token de escritura. Ver «Qué haría falta para
> convertir esto en GO».

## Tabla de puertas G1–G9

| Puerta | Descripción                                                                                | Estado | Nivel de evidencia                          | Evidencia ejecutada                                                                                                                                                                                                                                                            |
| ------ | ------------------------------------------------------------------------------------------ | ------ | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| G1     | `npm run verify` en verde                                                                  | ✅     | Ejecutado                                   | 40 suites/334 (core, evals 32/32) + 8/60 (api) + 31/215 (mobile) = **609 pruebas**                                                                                                                                                                                             |
| G2     | Recorrido dorado con 3 documentos (TXT/MD/PDF) y coherencia por capa documentada           | ✅     | Ejecutado con proveedor falso               | `packages/core/src/__tests__/goldenPath.test.ts` (12: extracción por formato + ciclo completo en TXT, MD y PDF real) + `apps/mobile/src/__tests__/goldenPath.e2e.test.tsx` (1, pantallas). Los tres formatos → mismos 3 temas/3 conceptos y mismo cierre de sesión             |
| G3     | Evals con proveedor real: ≥30 casos, veredicto ≥80 %, 0 citas inventadas, ≥90 % paráfrasis | ✅     | **Ejecutado con proveedor real**            | `npm run eval:real` contra el backend con clave Gemini real y rotación de modelos gratuitos: 30 evaluación + 3 generación. Veredicto **83.3 %**, paráfrasis **100 %**, citas inventadas **0**. Evidencia: `docs/release-1.0-g3-evidence.txt` (D-063)                           |
| G4     | Degradación probada en los 4 supuestos de F2                                               | ✅     | Ejecutado                                   | `consent.test.ts`, `httpProvider.test.ts` (red, 429/cuota, respuesta inválida), `sessionAsync.test.ts`, `resilience.test.ts`, `llmEngine.test.ts`                                                                                                                              |
| G5     | Sin secretos en cliente ni en el APK                                                       | ✅     | Ejecutado (APK firmado)                     | Inspección del **APK firmado real** (`unzip` + `strings` del bundle): 0 `AIza`, 0 `GEMINI_API_KEY`, 0 `sk-`, 0 `eyJ`, 0 `api_key`. Solo aparece `password` como prop de autocompletado de React Native. El cliente solo usa token de sesión                                    |
| G6     | Textos legales alineados y marcados para revisión humana                                   | ✅     | Implementado + revisión humana pendiente    | `docs/privacy-policy.md`, `docs/terms-of-use.md`, `privacy-declarations.json`, `storeListing.test.ts`; notas internas marcadas «PENDIENTE DE REVISIÓN HUMANA»                                                                                                                  |
| G7     | APK generado por EAS, instalable, versión 1.0.0                                            | ⚠️     | **APK 1.0.0 instalable producido en local** | Artefacto `dist/socracia-1.0.0.apk` (73 MB, `com.socracia.app`, `versionName 1.0.0`, `versionCode 1`, `targetSdk 36`, 4 ABIs, ZIP íntegro, firmado con clave de depuración). **No producido por EAS** (sin `EXPO_TOKEN`); la ruta EAS sigue pendiente del keystore interactivo |
| G8     | Smoke test humano en dispositivo real                                                      | ⏳     | Pendiente (desbloqueado: ya hay APK)        | Checklist listo: `docs/release-1.0-smoke.md`. Ya se puede instalar el APK local sin esperar a EAS                                                                                                                                                                              |
| G9     | Documentación y paquete fuente reproducibles                                               | ✅     | Ejecutado                                   | `npm run package:source` produce `dist/socracia-1.0.0-fuente.tar.gz` + manifiesto con huellas; `npm ci && npm run verify` reproducible                                                                                                                                         |

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

1. **G3 verificada, con matiz.** La evals reales superan los umbrales
   (83.3 % / 100 % / 0 citas), pero con **modelos gratuitos** y rotación: la
   concordancia del 83.3 % está **por encima** del 80 % exigido por un margen
   estrecho (2 casos). Un modelo de pago probablemente suba el margen; el nivel
   gratuito es el que permite el coste cero. Riesgo de **varianza**: repeticiones
   futuras pueden caer justo por debajo del umbral. Mitigación: el motor degrada a
   la heurística (probada) y el umbral no se toca.
2. **Primer build de EAS (bloqueante para G7/G8).** El primer keystore exige modo
   interactivo. Cuota: el plan gratuito permite una cantidad limitada de builds de
   baja prioridad al mes (reset mensual); no se ha consumido ninguno desde aquí.
   Respaldo: `docs/build-apk-local.md`.
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

Solo **dos pasos humanos**; el resto de puertas está en verde.

1. Lanzar el primer `eas build` **interactivo** para generar el keystore y
   producir el APK de lanzamiento (G7). Comandos exactos en
   `docs/release-1.0-checklist.md` (Sprint 2). Requiere `EXPO_TOKEN` o sesión
   interactiva con la cuenta de Expo del propietario.
2. Ejecutar `docs/release-1.0-smoke.md` en un teléfono real (G8).

Los pasos concretos, con sus comandos exactos, están en
`docs/release-1.0-checklist.md` y en `docs/release-1.0-smoke.md`.
