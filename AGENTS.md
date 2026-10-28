# AGENTS.md — Socracia

Memoria del repositorio para agentes. Mantener actualizado al cerrar cada sprint.

## Qué es

App móvil de autoaprendizaje por mayéutica para temarios reglados (oposiciones,
PAU). RAG sobre documentos del usuario, preguntas guiadas, detección de lagunas
y repetición espaciada. Target: iOS y Android (App Store / Google Play).

## Stack y estructura

- **Monorepo npm workspaces.** `apps/mobile` (Expo + RN + TS) y
  `packages/core` (dominio puro TS).
- **`packages/core` no puede importar nada de React Native ni de Expo.** Toda la
  lógica crítica vive ahí y se prueba en Node.
- `apps/mobile` consume `@socracia/core` por workspace (`"@socracia/core": "*"`).
- Metro está configurado para monorepo (`apps/mobile/metro.config.js`).

## Comandos

```bash
npm install            # instala y compila core (postinstall)
npm run verify         # lint + typecheck + test  ← antes de commitear
npm test               # Jest en core y jest-expo en mobile
npm run typecheck
npm run lint
npm run format         # Prettier
npm run start          # Expo
```

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

## Reglas de trabajo

- Una rama por sprint (`sprint-N-<tema>`), PR a `main` al terminar.
- Tareas de más de ~100 líneas de cambio se dividen en PRs más pequeños.
- No tocar CI/CD ni secretos sin indicación expresa.
- Decisiones ambiguas: documentarlas en `docs/decisions.md` y continuar.
- Cada PR incluye: resumen, cómo probar y criterios de aceptación cubiertos.

## Documentación viva

- `docs/architecture.md` — arquitectura y diagrama del flujo mayéutico.
- `docs/rag-strategy.md` — RAG local vs backend, decisión y alternancia.
- `docs/decisions.md` — registro de decisiones (D-001…).
