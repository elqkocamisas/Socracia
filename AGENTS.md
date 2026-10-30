# AGENTS.md — Socracia

Memoria del repositorio para agentes. Mantener actualizado al cerrar cada sprint.

## Qué es

App móvil de autoaprendizaje por mayéutica para temarios reglados (oposiciones,
PAU). RAG sobre documentos del usuario, preguntas guiadas, detección de lagunas
y repetición espaciada. Target: iOS y Android (App Store / Google Play).

## Stack y estructura

- **Monorepo npm workspaces.** `apps/mobile` (Expo + RN + TS),
  `apps/api` (backend mínimo Node nativo) y `packages/core` (dominio puro TS).
- **`packages/core` no puede importar nada de React Native ni de Expo.** Toda la
  lógica crítica vive ahí y se prueba en Node.
- `apps/mobile` consume `@socracia/core` por workspace (`"@socracia/core": "*"`).
- Metro está configurado para monorepo (`apps/mobile/metro.config.js`).

## Comandos

```bash
npm install            # instala y compila core (postinstall)
npm run verify         # lint + typecheck + test  ← antes de commitear
npm run lint:commits   # valida los mensajes de commit (CONTRIBUTING.md)
npm test               # Jest en core y api, jest-expo en mobile
npm run eval:llm       # evals del motor con modelo (robustez, 32 casos)
npm run typecheck
npm run lint
npm run format         # Prettier
npm run start          # Expo
npm start --workspace @socracia/api   # backend en :8787
npm run package:source # entrega .tar.gz sin Git (dist/)
npm run generate:legal # regenera el texto legal de la app desde docs/
npm run generate:assets # regenera iconos y capturas base
```

> Tras editar `docs/privacy-policy.md` o `docs/terms-of-use.md`, ejecute
> `npm run generate:legal`: la app muestra el texto generado y una prueba falla
> si divergen. Las notas internas van entre `<!-- dev:nota-interna -->` y
> `<!-- /dev:nota-interna -->`; el generador falla si quedan mal cerradas, para
> no publicarlas.

## Convenciones

- **Idioma:** identificadores y código en inglés; textos de UI, comentarios y
  documentación en español.
- **Estilo:** Prettier (`printWidth: 100`, comillas simples, coma final). No
  discutir formato: ejecutar `npm run format`.
- **TS estricto:** `strict`, `noUncheckedIndexedAccess`, `noUnusedLocals`. Usar
  `?? []` o comprobaciones explícitas al indexar arrays.
- **Errores:** usar `Result<T, E>` de `core/src/result.ts` en rutas de dominio;
  excepciones solo para errores de programación.
- **Comentarios:** solo cuando expresan algo no inferible del código (invariante
  sutil, compromiso deliberado). No narrar el diff.
- **Pruebas:** sin mocks salvo necesidad justificada. Las pruebas del dominio no
  deben tocar el sistema de archivos ni la red.

## Trampas conocidas

- **`@testing-library/react-native` 14:** `render` es **asíncrono** y devuelve un
  objeto sin queries. Usar `await render(<C/>)` y luego `screen.getByText(...)`.
  No usar `const { getByText } = render(...)`.
- **ESLint 10 + typescript-eslint 8:** los archivos CommonJS (`metro.config.js`,
  `babel.config.js`, `jest.config.js`) necesitan el override con
  `sourceType: 'commonjs'` y `globals.node` de `eslint.config.mjs`.
- **`jest.config.js` en core usa CommonJS** (`module.exports`) porque `core`
  compila a CommonJS para que Jest lo consuma sin transformación.
- **Prettier reformatea tablas Markdown.** Al editar tablas en `docs/`, escribir
  el cambio y volver a ejecutar `npm run format`; no dar por buena una edición
  que Prettier va a realinear.
- **Clon superficial:** el repo es shallow; usar `git fetch --unshallow` si se
  necesita historia.
- **Sin lookbehind en regex.** El código de `core` debe funcionar en Hermes, que
  no soporta lookbehind. Ya se evitó en `splitSentences`.
- **`edge-llm` no entrega embeddings utilizables (0.1.4).** Su `embedTest`
  devuelve `{ length, sample }` con 5 de 384 dimensiones (el nativo hace
  `vector.take(5)`), y el módulo iOS es la plantilla de Expo (solo `hello` y
  `setValueAsync`). Por eso `createEdgeLlmProvider` sondea y falla con un motivo
  explícito en vez de generar vectores inservibles. No reintentar «activarlo»
  sin volver a comprobar el paquete con `npm pack edge-llm`.
- **Umbral de relevancia del RAG.** `DEFAULT_RELEVANCE.minScore = 0.2` está
  calibrado para el proveedor léxico (aciertos 0.26–0.55, ruido 0.08–0.18). Un
  proveedor semántico real exige recalibrarlo; no es una constante universal.
- **`execFileSync` hereda el stderr del hijo.** Si la prueba invoca un proceso
  que _debe_ fallar (el guardián de notas internas de `generate-legal.mjs`, por
  ejemplo) sin pasar `stdio: ['pipe','pipe','pipe']`, el error se imprime en la
  salida de Jest y `npm test` parece fallar en un proyecto sano. La prueba pasa,
  pero el log miente. Cualquier invocación a un proceso que falle a propósito
  debe capturar su stderr.
- **`main` ya lleva el código de los sprints.** El trabajo vivió en ramas
  apiladas y se integró en `main` por fast-forward el 2026-10-30; el repo público
  tiene 186 ficheros. Las ramas `sprint-*` siguen ahí como referencia.
- **El mínimo real de Node es 22, no 20.** Las pruebas de almacenamiento usan
  `node:sqlite`, que **no existe en Node 20** (`ERR_UNKNOWN_BUILTIN_MODULE`):
  fallan 5 suites y 3 pruebas. `engines.node` declara `>=22` y `setup.sh` aborta
  con un mensaje claro si la versión es menor.
- **`check-commits.mjs --all` depende de la profundidad del clon.** En CI
  (`actions/checkout` sin `fetch-depth`) solo ve el tip y pasa; en local, con
  historia completa, sí revisa todo el historial. Un commit subido desde la web
  de GitHub («Add files via upload») no sigue la convención y hace fallar la
  suite de convención **solo en local**. No dar por bueno el CI: ejecutar
  `npm run verify` antes de empujar.
- **`expo-doctor` no es una puerta fiable al 100 %.** Reporta el override
  `resolver.disableHierarchicalLookup` de Metro, **necesario** en el monorepo, y
  desajustes de parche del SDK. Por eso el CI lo ejecuta como informativo
  (`continue-on-error`); la puerta real es `expo export` de las tres plataformas.
- **Los campos `newArchEnabled` y `android.edgeToEdgeEnabled` ya no existen** en
  el esquema de SDK 58 (RN 0.88 solo tiene la nueva arquitectura y Android 16
  hace obligatorio el edge-to-edge). Añadirlos rompe la validación del esquema.
- **Ejecutar `npm run verify` junto a otra tarea pesada produce falsos fallos.**
  Las suites de interfaz (`ImportScreen`, `accountJourney`) tienen límite de 5 s
  y fallan por contención de CPU, no por un defecto. Verificar en solitario.

## Arquitectura del motor mayéutico (Sprint 1)

Flujo de datos, todo en `packages/core` y sin dependencias de plataforma:

```
texto del temario
  → ingest/conceptExtractor.extractCurriculum   → Topic[] + Concept[]
  → rag/engine.RagEngine.ingestDocument          → fragmentos indexados
  → rag/engine.generateConceptQuestions          → SocraticQuestion[] (con Citation)
  → mayeu/questionQuality.filterNonTrivial       → solo preguntas no triviales
  → mayeu/itinerary.buildItinerary               → ItineraryStep[] ordenados
  → mayeu/session.MayeuticSessionEngine          → turnos: evaluación, andamiaje, siguiente
  → mayeu/gaps.detectGaps                        → GapProfile
```

Invariantes que no deben romperse (hay pruebas que las protegen):

- Las preguntas generadas **nunca** son de nivel `recordar` por defecto.
- El andamiaje **nunca** contiene `expectedAnswer`.
- El itinerario ordena lagunas → sin evaluar → dominados.
- `detectGaps` es puro: misma entrada, misma salida.

## Arquitectura de ingesta y persistencia (Sprint 2)

Segunda mitad del recorrido, repartida entre `packages/core` (puro) y
`apps/mobile` (adaptadores):

```
bytes de un PDF/TXT/MD
  → ingest/extractors.ExtractorRegistry.extract     → texto (o IngestError)
  → ingest/ingestionService.DocumentIngestionService → KnowledgeDocument + índice
  → app/studyService.StudyService.prepareSession     → sesión con preguntas y citas
  → app/studyService.StudyService.answer             → turno + evaluación persistida
```

Invariantes que no deben romperse (hay pruebas que las protegen):

- `core` no importa `expo-*` ni `react-native`: los adaptadores viven en la app.
- El dominio solo conoce `StoragePort`, `EmbeddingProvider` y `VectorStore`.
- El SQL del adaptador se prueba contra SQLite real (`node:sqlite`), no con un
  doble que imita SQL.
- El texto del usuario nunca sale del dispositivo salvo `cloudConsent` explícito.

Trampas conocidas:

- **PDF FlateDecode usa zlib, no raw deflate.** `fflateInflate` intenta
  `unzlibSync` y cae a `inflateSync`; al revés falla con «unexpected EOF».
- **`Result<string>` sin parámetro de error usa `Error`.** Los extractores deben
  declarar `Result<string, IngestError>` o `error.code` no existe en tipos.
- **Jest no soporta `await import()` en este proyecto** («dynamic import callback
  was invoked without --experimental-vm-modules»): usar imports estáticos.
- **`render` de `@testing-library/react-native` 14 es asíncrono:** hay que
  `await render(...)`.
- **React 19 no aplica `fireEvent.changeText` de forma síncrona.** Hay que
  esperar a que `props.value` refleje el texto antes de pulsar enviar; el helper
  `typeAnswer` de `appTestHarness` lo hace.
- **No montar y desmontar pantallas con efectos async pendientes en el mismo
  test.** Provoca «overlapping act() calls» y estados a medio aplicar; el
  recorrido E2E usa un router de prueba en un único árbol.
- **`@socracia/core` se consume desde `dist`.** Tras tocar el núcleo hay que
  `npm run build --workspace @socracia/core` o el móvil usará la versión previa.
- **El índice vectorial no sobrevive solo.** Cualquier estado que viva en memoria
  (hoy el índice del RAG) debe persistirse y rehidratarse en `bootstrap`, o la
  funcionalidad se rompe en silencio al reabrir la app (D-022).
- **`jest-expo` sustituye `fetch` por un polyfill que no hace red en Node.**
  Las pruebas que necesiten HTTP real inyectan `helpers/nodeFetch.ts` (sobre
  `node:http`); sin él `response.json()` devuelve `undefined`.
- **`node:http`/`node:net` no tienen tipos en el móvil.** No se añade
  `@types/node` (arrastraría globales de Node al bundle): los helpers de prueba
  los declaran en `helpers/node-http.d.ts`, como ya se hace con `node:sqlite`.
- **El backend ignora el `userId` del cuerpo** en `/sync/push` y usa el de la
  sesión. No "arreglar" esto pasando el del cliente: es lo que impide escribir
  el progreso de otro usuario.

## Arquitectura de cuenta y sincronización (Sprint 4)

- **Fusión pura en el núcleo.** `mergeSnapshots` (`packages/core/src/sync/merge.ts`)
  la usan el backend y el cliente; no hay dos implementaciones (D-024).
- **Identidad por contenido.** Evaluaciones por `questionId` (`c1:q0`), repaso
  por `conceptId`, sesiones por `id`; gana el `updatedAt` mayor (D-025).
- **Backend sin dependencias.** `apps/api` sobre `node:http`, contraseñas con
  `scrypt`, almacén en memoria o JSON (D-026).
- **Cuenta opcional.** El progreso local sigue bajo `local-user`; solo se
  sincroniza el progreso, nunca los documentos (D-027).
- El móvil implementa `SyncPort` en `services/httpSyncClient.ts`; la sesión se
  guarda en `app_meta` vía `services/credentialStore.ts`.
- La generación y evaluación semánticas opcionales pasan por el puerto
  `MayeuticSemanticProvider` del núcleo y el backend (`apps/api/src/mayeutic.ts`)
  las adapta a Gemini API. La clave `GEMINI_API_KEY` solo vive en el servidor;
  build habilitado, sesión, ajuste y consentimiento por documento son
  requisitos simultáneos. La cuota gratuita puede usar el contenido para
  mejorar productos de Google: no habilitarla para material sensible.
- **Motor con modelo (opcional).** `packages/core/src/llm/` valida toda salida
  del modelo campo a campo; la heurística es el respaldo y el modelo no dirige el
  avance. La composición vive en `apps/mobile/src/services/llmEngine.ts` y el
  orden de envoltura es HTTP → resiliencia → **consentimiento** (el guardián va
  fuera para que revocar el permiso bloquee también la caché). La clave del
  proveedor vive solo en el backend; el móvil llama a `POST /llm/complete` con su
  token de sesión. Detalle en `docs/llm-engine.md` (D-043).
- **Evals del motor.** `packages/core/src/llm/__evals__/` fija la robustez ante
  salidas mal formadas; se ejecutan con `npm run eval:llm` y también dentro de
  `npm test`. Al cambiar un prompt o un validador, revisar el informe por
  categoría. El directorio `__evals__` se excluye del build: son fixtures.
- **Privacidad del motor.** Con el asistente autorizado salen del dispositivo la
  pregunta, la respuesta del alumno, la referencia y el fragmento citado; el
  servidor no los almacena ni los registra (D-044). Si cambia qué se envía o el
  servidor pasa a persistirlo, actualice en el mismo PR
  `apps/mobile/store/privacy-declarations.json` y el apartado 2.3 de
  `docs/privacy-policy.md`. La prueba
  `apps/mobile/src/__tests__/storeListing.test.ts` es el guardián: falla si el
  motor existe (`ConsentGatedLlmProvider`) y la declaración no lo menciona, o al
  revés.

## Reglas de trabajo

- Una rama por sprint (`sprint-N-<tema>`), PR a `main` al terminar.
- Commits en Conventional Commits: `tipo(ámbito): asunto` en imperativo, ≤72
  caracteres, con cuerpo que explique el porqué. Detalles en `CONTRIBUTING.md`;
  se comprueba con `npm run lint:commits`.
- Tareas de más de ~100 líneas de cambio se dividen en PRs más pequeños.
- No tocar CI/CD ni secretos sin indicación expresa.
- Decisiones ambiguas: documentarlas en `docs/decisions.md` y continuar.
- Cada PR incluye: resumen, cómo probar y criterios de aceptación cubiertos.

## Documentación viva

- `docs/architecture.md` — arquitectura y diagrama del flujo mayéutico.
- `docs/rag-strategy.md` — RAG local vs backend, decisión y alternancia.
- `docs/llm-engine.md` — motor mayéutico con modelo: capas, activación y evals.
- `docs/backend.md` — API de cuentas y sincronización (Sprint 4).
- `docs/decisions.md` — registro de decisiones (D-001…).
- `CONTRIBUTING.md` — ramas, commits, pruebas y seguridad.
- `docs/store-release-checklist.md` — publicación en App Store y Google Play.
- `docs/no-git-delivery.md` — entrega y arranque sin Git.
- `docs/build-apk-local.md` — compilación de la APK sin EAS (JDK 21, SDK 36).

## Herramientas y trampas comprobadas

- **El mensaje del squash lo valida el mismo filtro.** Al fusionar con
  «Squash and merge» hay que escribir un asunto con `tipo(ámbito):` de ≤72
  caracteres y un cuerpo con líneas de ≤100. Si se deja el título del PR como
  mensaje, `check-commits.mjs --all` falla **en `main`**, porque el escáner
  recorre todo el historial. Paso seguro: `node scripts/check-commits.mjs --all`
  localmente antes de empujar, y `--force-with-lease` con el SHA previo para
  reparar solo el mensaje (el árbol no cambia).
- **`gh pr merge` y `git push` a `main` necesitan token con permiso de
  escritura.** El token de la app no basta; las operaciones de escritura van con
  un token personal y la URL directa, sin persistirlo en ningún fichero.
