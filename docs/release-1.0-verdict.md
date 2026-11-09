# Dictamen de release — Socracia 1.0.0

**Fecha:** 6 de noviembre de 2026 (re-verificado el 8–9 de noviembre de 2026)
**Versión evaluada:** `1.0.0` (raíz, workspaces, `app.json` y ficha de tienda)
**Alcance:** app móvil de un solo usuario, local-first; importación de documentos;
motor mayéutico; proveedor semántico opcional con consentimiento; APK por EAS.
**Fuera de alcance:** multitenencia, consola docente, facturación, publicación en
tiendas.

## Veredicto

### ⚠️ NO-GO (bloqueado por G3 y G8)

El proceso mayéutico **funciona de extremo a extremo con proveedor falso** y está
demostrado con pruebas ejecutadas en la re-verificación de esta sesión: recorrido
dorado sobre TXT, MD y PDF real (núcleo e interfaz). La versión 1.0.0 está
preparada, el APK de lanzamiento **ya se ha producido con EAS** (G7 ✅) y el
backend desplegado quedó operativo.

**G3 (evals con proveedor real) NO se ha podido reproducir en esta sesión.** El
arnés `npm run eval:real` contra el backend desplegado
(`https://socracia.onrender.com`) devuelve:

> Proveedor semántico NO disponible: El proveedor semántico respondió 400:
> Please pass a valid API key

La clave del proveedor configurada en el backend desplegado **ya no es válida**
(revocada, agotada o reemplazada). La evidencia de G3 de dictámenes previos
(`docs/release-1.0-g3-evidence.txt`, 83.3 % / 100 % / 0 citas) **no es
reproducible hoy**: se conserva como registro histórico, pero la puerta queda
**«no verificada»** en el estado actual. Según las reglas de la misión («sin
clave real: G3 queda no verificado y bloquea el GO»), esto **bloquea el GO** hasta
que un proveedor real vuelva a responder y se repita el arnés.

**G7 ya está cumplido** (build de EAS terminada con éxito, artefacto APK de
distribución interna). Queda pendiente solo el **paso humano de descargar e
instalar el APK y ejecutar el smoke test (G8)**, que no puede hacer un agente sin
un dispositivo físico.

No se fuerza la versión: se entrega el dictamen NO-GO y el checklist de sprints
restantes (`docs/release-1.0-checklist.md`).

## Niveles de evidencia

Se distingue con precisión qué está **documentado**, **implementado**,
**probado con proveedor falso** y **validado con proveedor real o en
dispositivo**. Una puerta no se da por cumplida sin evidencia ejecutada.

## Estado de la integración (actualización 2026-11-09)

El trabajo de identidad visual (tema claro/oscuro), visibilidad del motor,
onboarding y consentimiento por documento, junto con los sprints 0–5, **ya está
fusionado en `main`** (PR **#18**, merge `41b5f5e`). Sobre `main` se han integrado
por **fast-forward** los tres commits que faltaban, sin reescribir historia:

- `d8e877f` — activa el modo conectado en el perfil de producción (D-067).
- `1a4da40` — dictamen honesto: G3 no verificada (D-068).
- `4173e18` — `DATA_FILE` en ruta escribible (D-069).

`main` está en **`4173e18`** y el workflow **Expo** (calidad) quedó **en verde**.
Ambos servicios de Render se **redesplegaron** a ese commit y quedaron operativos:
`/auth/register`, `/sync/pull` y `/sync/push` responden correctamente (antes el
push devolvía 500 por la ruta de disco; ver D-069).

En la re-verificación del **2026-11-08/09** (árbol limpio) `npm run verify` volvió
a quedar en verde: **40 suites/341 (core, evals 32/32) + 8/60 (api) + 31/216
(mobile) = 617 pruebas**. Ninguna firma pública del dominio cambió y no hay
pruebas omitidas (`skip`/`todo`).

## Tabla de puertas G1–G9

| Puerta | Descripción                                                                                | Estado | Nivel de evidencia                       | Evidencia ejecutada                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------ | ------------------------------------------------------------------------------------------ | ------ | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G1     | `npm run verify` en verde                                                                  | ✅     | Ejecutado (re-verificado 2026-11-08)     | Árbol limpio en `d8e877f`: 40 suites/**341** (core, evals 32/32) + 8/**60** (api) + 31/**216** (mobile) = **617 pruebas**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| G2     | Recorrido dorado con 3 documentos (TXT/MD/PDF) y coherencia por capa documentada           | ✅     | Ejecutado con proveedor falso            | `packages/core/src/__tests__/goldenPath.test.ts` (14: extracción por formato + ciclo completo en TXT, MD y PDF real) + `apps/mobile/src/__tests__/goldenPath.e2e.test.tsx` (1, pantallas). Los tres formatos → mismos 3 temas/3 conceptos y mismo cierre de sesión                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| G3     | Evals con proveedor real: ≥30 casos, veredicto ≥80 %, 0 citas inventadas, ≥90 % paráfrasis | ❌     | **NO verificado (no reproducible hoy)**  | Re-ejecución 2026-11-08 de `npm run eval:real` contra `https://socracia.onrender.com`: el backend responde **400 «Please pass a valid API key»**. La clave del proveedor desplegado ya no es válida. La evidencia histórica (`docs/release-1.0-g3-evidence.txt`, 83.3 %/100 %/0) no se ha podido reproducir: **bloquea el GO**                                                                                                                                                                                                                                                                                                                                                                            |
| G4     | Degradación probada en los 4 supuestos de F2                                               | ✅     | Ejecutado                                | `consent.test.ts`, `httpProvider.test.ts` (red, 429/cuota, respuesta inválida), `sessionAsync.test.ts`, `resilience.test.ts`, `llmEngine.test.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| G5     | Sin secretos en cliente ni en el APK                                                       | ✅     | Ejecutado (APK firmado, re-verificado)   | Inspección 2026-11-08 del **APK firmado real** (`dist/socracia-1.0.0.apk`, ZIP válido, 1158 entradas, firma **v2/v3**): 0 `AIza`, 0 `GEMINI_API_KEY`, 0 `sk-`, 0 JWT, 0 clave privada en el bundle y en el APK completo. El único acierto de `api_key` es el pool de nombres de propiedad minificados de React Native, no un valor. El cliente solo usa token de sesión                                                                                                                                                                                                                                                                                                                                   |
| G6     | Textos legales alineados y marcados para revisión humana                                   | ✅     | Implementado + revisión humana pendiente | `docs/privacy-policy.md`, `docs/terms-of-use.md`, `privacy-declarations.json`, `storeListing.test.ts`; notas internas marcadas «PENDIENTE DE REVISIÓN HUMANA»                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| G7     | APK generado por EAS, instalable, versión 1.0.0                                            | ✅     | **Build de EAS completada (éxito)**      | Secreto `EXPO_TOKEN` presente en GitHub; workflow **Expo EAS** lanzado a mano (`workflow_dispatch`, perfil `release-apk`, `main@4173e18`, run `42600137389`). EAS aceptó credenciales remotas («Using Keystore from configuration: Build Credentials TnBsQO-OGA») e incrementó `versionCode` 9→10. Build **`54cb8583-a5bd-422a-b457-926b97c278a0`** en `expo.dev/accounts/camiseros-team/projects/socracia`: **Status Succeeded**, artefacto **APK** de distribución interna. Falta el paso humano de descargarlo (requiere sesión de Expo; el enlace de artefacto no es público) e instalarlo. APK local previo: `dist/socracia-1.0.0.apk` (72 MB, `com.socracia.app`, `versionName 1.0.0`, firma v2/v3) |
| G8     | Smoke test humano en dispositivo real                                                      | ⏳     | Pendiente (desbloqueado: ya hay APK)     | Checklist listo: `docs/release-1.0-smoke.md`. Desbloqueado: hay APK de EAS (`54cb8583-…`, `main@4173e18`, con D-067) y APK local. Falta la ejecución humana en un teléfono                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| G9     | Documentación y paquete fuente reproducibles                                               | ✅     | Ejecutado (re-verificado 2026-11-08)     | `npm run package:source` reproduce `dist/socracia-1.0.0-fuente.tar.gz` (**253 ficheros**) + manifiesto con huellas; el tarball no contiene secretos; `npm ci && npm run verify` está documentado como reproducible (la verificación de esta sesión fue sobre el árbol ya instalado)                                                                                                                                                                                                                                                                                                                                                                                                                       |

Leyenda: ✅ cumplida · 🔄 en curso (evidencia real en marcha) · ⚠️ parcial (requiere paso humano) · ❌ no verificada · ⏳ pendiente.

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

1. **G3 NO reproducida (bloqueante).** La re-ejecución del 2026-11-08 contra el
   backend desplegado devuelve **400 «Please pass a valid API key»**: la clave
   del proveedor configurada en Render ya no es válida. La evidencia histórica
   (83.3 % / 100 % / 0 citas, `docs/release-1.0-g3-evidence.txt`) **no se ha
   podido reproducir hoy**. Mitigación mientras no haya clave: el motor degrada a
   la heurística (probada en G4). Para cerrar G3 hay que reponer una clave válida
   en el servidor (nunca en el cliente) y repetir `npm run eval:real`.
2. **APK de EAS listo; falta descarga/instalación (G7 → G8).** El secreto
   `EXPO_TOKEN` **sí** está configurado en GitHub y el keystore de Android **ya
   existía** en EAS, así que el workflow `Expo EAS` (perfil `release-apk`) se lanzó
   en modo no interactivo y la build **terminó con éxito** (`54cb8583-…`,
   `Status Succeeded`, artefacto APK). Falta el paso humano de descargarlo
   (requiere sesión de Expo) e instalarlo. Cuota verificada el 2026-11-08 en
   <https://expo.dev/pricing>: el plan gratuito incluye **15 builds Android + 15
   iOS** de baja prioridad al mes (reset mensual). Respaldo si se agota:
   `docs/build-apk-local.md`.
3. **APK local anterior a D-067.** El APK de `dist/` se compiló antes del commit
   que activa el modo conectado, así que su bundle **no** ofrece el motor
   semántico (cae a heurística). La build de EAS **sí** parte de `main@4173e18`
   (con D-067), así que su APK ofrece el modo conectado. El smoke test en
   dispositivo con el APK local valida la app y la degradación, pero **no** el modo
   conectado; para eso hay que usar el APK de EAS y un backend con clave válida.
4. **Textos legales pendientes de revisión humana.** Coherentes con el
   comportamiento, pero no validados por asesoría jurídica (G6).
5. **Umbral de relevancia del RAG** calibrado para el proveedor léxico
   (`minScore = 0.2`); un proveedor semántico real exige recalibrarlo.
6. **Multitenencia inerte por construcción.** No hay código multitenante en el
   árbol (solo documentación D-053…D-058): no hay nada que apagar. Riesgo nulo
   para 1.0, pero conviene recordar que la hoja de ruta 1.1 la activa.

## Qué haría falta para convertir esto en GO

Ya solo quedan dos pasos, ambos humanos; el build de EAS **ya está hecho**.

1. **Restaurar G3 (bloqueante principal).** Reponer en el backend desplegado una
   clave de proveedor **válida** (Gemini u otro compatible; nivel gratuito, coste
   cero) como variable de entorno **solo del servidor** y ejecutar
   `npm run eval:real` contra él. Debe superar ≥30 casos, veredicto ≥80 %,
   paráfrasis ≥90 % y 0 citas inventadas. Sin esto, G3 queda «no verificada» y el
   GO no es honesto. Requiere una persona con acceso a la clave.
2. **Descargar el APK de EAS e instalarlo** (G7 → G8). La build
   `54cb8583-…` (perfil `release-apk`, desde `main@4173e18`) **terminó con
   éxito**. El APK se descarga desde la página del build (sesión de Expo) o con
   `npx eas-cli build:download --platform android --latest`; después se ejecuta
   `docs/release-1.0-smoke.md` en un teléfono real.

Los pasos concretos, con sus comandos exactos, están en
`docs/release-1.0-checklist.md` y en `docs/release-1.0-smoke.md`.
