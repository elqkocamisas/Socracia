# Arquitectura del MVP — Socracia

## 1. Visión general

Socracia es una app móvil de autoaprendizaje basada en la **mayéutica**: en lugar
de mostrar teoría y tests, formula preguntas guiadas sobre el material del propio
usuario, evalúa las respuestas, detecta lagunas y construye un itinerario de
asimilación progresiva.

El sistema se organiza en tres capas con una regla de dependencia estricta:
**la UI depende del dominio, el dominio no depende de nada.**

```
┌──────────────────────────────────────────────────────────────┐
│  apps/mobile — Expo + React Native + TypeScript              │
│  Pantallas, navegación, permisos, persistencia SQLite,        │
│  módulos nativos (edge-llm / MediaPipe) tras adaptadores      │
└───────────────┬──────────────────────────────────────────────┘
                │ depende de (workspace: @socracia/core)
┌───────────────▼──────────────────────────────────────────────┐
│  packages/core — dominio puro TypeScript                     │
│                                                              │
│   domain/   modelo de datos (temario, conceptos, preguntas,   │
│             respuestas, lagunas, repaso espaciado)            │
│   ingest/   extracción de texto (PDF/TXT/MD), chunking y      │
│             servicio de ingesta de documentos                 │
│   rag/      chunking → embeddings → almacén vectorial →      │
│             recuperación semántica (RagEngine)                │
│   mayeu/    generación de preguntas socráticas, evaluación    │
│             de respuestas, detección de lagunas, SM-2         │
│   storage/  puertos de persistencia (documentos, preguntas,   │
│             progreso) e implementación en memoria             │
│   app/      servicio de estudio: sesión, respuestas, progreso │
│   math/     similitud coseno y utilidades vectoriales         │
└───────────────┬──────────────────────────────────────────────┘
                │ implementado por (inyección de dependencias)
┌───────────────▼──────────────────────────────────────────────┐
│  Adaptadores (apps/mobile, Sprint 2)                         │
│   EmbeddingProvider → hashing local (MVP) | MediaPipe | cloud │
│   VectorStore       → memoria (MVP) | SQLite+vector | ANN     │
│   StoragePort       → SQLite local (expo-sqlite) | memoria    │
│   FileBytesReader   → expo-file-system                        │
│   DocumentPickerPort→ expo-document-picker                    │
└──────────────────────────────────────────────────────────────┘
```

### Por qué esta separación

- **Testabilidad:** toda la lógica crítica (RAG, generación, evaluación, lagunas,
  repaso) se prueba con Jest en Node, en milisegundos, sin simuladores ni
  módulos nativos.
- **Portabilidad:** el mismo `core` sirve para iOS y Android.
- **Sustituibilidad:** cambiar RAG on-device por RAG en backend (o al revés) es
  implementar una interfaz, no reescribir la app (ver `rag-strategy.md`).

## 2. Estructura del repositorio

```
Socracia/
├── apps/
│   └── mobile/                 # Expo + RN + TS
│       ├── App.tsx             # raíz de la app
│       ├── index.ts            # registerRootComponent
│       ├── app.json            # configuración Expo (bundle id, versiones)
│       ├── metro.config.js     # resolución de monorepo
│       └── src/
│           ├── screens/        # pantallas
│           ├── components/     # componentes reutilizables
│           └── theme/          # tokens de diseño
├── packages/
│   └── core/                   # dominio puro (@socracia/core)
│       └── src/
│           ├── domain/         # tipos del modelo
│           ├── math/           # similitud coseno
│           ├── rag/            # chunking, embeddings, vector store, engine
│           ├── mayeu/          # motor mayéutico
│           └── __tests__/      # pruebas unitarias e integración
├── docs/                       # arquitectura, estrategia RAG, decisiones
├── .openhands/setup.sh         # bootstrap del entorno
├── eslint.config.mjs           # ESLint flat config
└── package.json                # npm workspaces + scripts raíz
```

## 3. Flujo mayéutico (diagrama)

```mermaid
flowchart TD
    A[Usuario adjunta documento<br/>PDF / TXT / MD] --> B[Extracción de texto]
    B --> C[normalizeText + chunkText<br/>fragmentos con trazabilidad]
    C --> D[EmbeddingProvider<br/>on-device o backend]
    D --> E[(VectorStore local<br/>SQLite / memoria)]

    E --> F{Concepto del temario<br/>a trabajar}
    F --> G[Retrieval: búsqueda<br/>semántica top-K]
    G --> H[Generación de preguntas<br/>mayéuticas + cita de fuente]

    H --> I[Pregunta guiada<br/>al usuario]
    I --> J[Respuesta del usuario]
    J --> K[evaluateAnswer:<br/>términos clave + solapamiento]
    K --> L{Veredicto}
    L -->|correcta| M[Refuerzo +<br/>sube dificultad]
    L -->|parcial| N[Pista socrática +<br/>repregunta]
    L -->|incorrecta /<br/>sin-respuesta| O[Repregunta guiada<br/>con andamiaje]

    M --> P[scheduleReview<br/>repetición espaciada]
    N --> P
    O --> P
    P --> Q[detectGaps:<br/>perfil de lagunas]
    Q --> R[Pantalla de progreso:<br/>lagunas + repaso recomendado]
    R --> F
```

El bucle se cierra sobre el temario: cada respuesta actualiza el estado de
repaso y el perfil de lagunas, y el sistema elige el siguiente concepto con
mayor urgencia de asimilación.

## 4. Contratos del dominio

| Entidad             | Rol                                                        |
| ------------------- | ---------------------------------------------------------- |
| `KnowledgeDocument` | Documento del usuario, con `cloudConsent` explícito        |
| `KnowledgeChunk`    | Fragmento indexable con rango `charStart`/`charEnd`        |
| `Topic` / `Concept` | Temario y conceptos atómicos evaluables                    |
| `SocraticQuestion`  | Pregunta con `move`, `level`, `keyTerms` y `citation`      |
| `UserAnswer`        | Respuesta con latencia (señal de fluidez)                  |
| `AnswerEvaluation`  | Veredicto, puntuación, términos acertados y ausentes       |
| `KnowledgeGap`      | Laguna con severidad y justificación                       |
| `ReviewState`       | Estado SM-2 simplificado (`ease`, `intervalDays`, `dueAt`) |

## 5. Decisiones de ingeniería relevantes

- **`Result<T, E>` en vez de excepciones** en las rutas de dominio: obliga a
  manejar el error en el punto de llamada y hace la lógica total.
- **Evaluación explicable:** la puntuación combina cobertura de términos clave
  (0.6) y solapamiento léxico tipo Jaccard (0.4). Es determinista, sin modelo,
  y por tanto auditable y testeable. Se puede sustituir por un LLM on-device
  detrás de la misma firma.
- **Repetición espaciada determinista:** SM-2 simplificado con facilidad
  acotada `[1.3, 2.8]`, sin estado oculto.
- **Abstracción `EmbeddingProvider` / `VectorStore`:** el motor RAG no conoce
  si el cálculo es local o remoto.

## 6. Estado por sprint

| Sprint | Alcance                                        | Estado        |
| ------ | ---------------------------------------------- | ------------- |
| 0      | Fundaciones, monorepo, dominio base, docs      | ✅ completado |
| 1      | Modelo mayéutico completo y motor de preguntas | ✅ completado |
| 2      | Ingesta de documentos y RAG on-device          | ✅ completado |
| 3      | UX mayéutica y progreso                        | pendiente     |
| 4      | Backend mínimo y sincronización                | pendiente     |
| 5      | Calidad, privacidad y tiendas                  | pendiente     |

## 7. Motor mayéutico (Sprint 1)

El Sprint 1 completa el ciclo pregunta → respuesta → feedback → progreso con
piezas nuevas en `packages/core`:

| Módulo                    | Responsabilidad                                                                        |
| ------------------------- | -------------------------------------------------------------------------------------- |
| `ingest/conceptExtractor` | Extrae temas y conceptos de un texto reglado por encabezados y patrones de definición. |
| `mayeu/cognitive`         | Escala ordenada de niveles cognitivos y comparadores.                                  |
| `mayeu/questionQuality`   | Política de no-trivialidad: rechaza el interrogatorio de memoria.                      |
| `mayeu/itinerary`         | Ordena el estudio en tres franjas: lagunas, sin evaluar, dominados.                    |
| `mayeu/scaffolding`       | Repregunta guiada ante fallo, sin entregar nunca la respuesta.                         |
| `mayeu/session`           | Orquesta el bucle completo y mantiene progreso, lagunas y repaso.                      |

### Regla de no-trivialidad

El generador excluye por defecto las plantillas de nivel `recordar`. Además,
`assessQuestionQuality` marca como trivial cualquier pregunta de recuerdo sin
exigencia de razonamiento, respuesta de referencia demasiado corta o sin
términos clave. Es la garantía verificable de que la app pregunta para pensar,
no para recitar.

### Regla de no-facilitación

`buildScaffold` nunca revela la respuesta de referencia: orienta, descompone o
acota según la gravedad del fallo. Hay una prueba que lo comprueba
explícitamente.

## 8. Ingesta y RAG (Sprint 2)

El Sprint 2 cierra el recorrido «adjuntar documento → preguntas con fuente»:

| Módulo                    | Responsabilidad                                                                 |
| ------------------------- | ------------------------------------------------------------------------------- |
| `ingest/extractors`       | `ExtractorRegistry` y extractores de PDF, TXT y MD; errores con código estable. |
| `ingest/inflate`          | Descompresión FlateDecode de PDF con `fflate` (JS puro, Hermes y Node).         |
| `ingest/ingestionService` | Extrae texto, crea el registro del documento y lo indexa en el RAG.             |
| `storage/ports`           | Puertos de persistencia que el dominio consume sin conocer el motor.            |
| `storage/inMemory`        | Implementación en memoria: doble de pruebas y respaldo si SQLite no abre.       |
| `app/studyService`        | Prepara la sesión, registra respuestas y persiste progreso y lagunas.           |

En `apps/mobile`:

| Módulo                    | Responsabilidad                                                          |
| ------------------------- | ------------------------------------------------------------------------ |
| `storage/schema`          | DDL del esquema local e `migrate` idempotente.                           |
| `storage/sqliteStorage`   | Adaptador de `StoragePort` sobre `expo-sqlite`.                          |
| `services/documentImport` | Validación de formato y lectura de bytes, agnóstica de plataforma.       |
| `services/appServices`    | Composición de servicios e `importDocument` (flujo completo de ingesta). |
| `services/expoAdapters`   | Adaptadores de `expo-document-picker` y `expo-file-system`.              |
| `screens/ImportScreen`    | UI de importación con estados vacío, carga y error.                      |

El SQL del adaptador se prueba contra SQLite real vía `node:sqlite` (D-017), así
que las sentencias quedan verificadas antes de llegar al dispositivo.

## 9. Experiencia mayéutica y progreso (Sprint 3)

El Sprint 3 cierra el recorrido de usuario completo: **adjuntar → responder →
progreso**. La lógica de la conversación vive en el núcleo y la UI solo pinta.

```mermaid
flowchart TD
  A[StudyService.prepareSession] --> B[MayeuticSessionController.start]
  B --> C{¿Hay pregunta?}
  C -- sí --> D[StudyScreen: pregunta + fuente]
  D --> E[Usuario responde]
  E --> F[StudyService.answer]
  F --> G[evaluateAnswer + detectGaps]
  G --> H{¿Necesita andamiaje?}
  H -- sí --> I[Repregunta guiada]
  I --> E
  H -- no --> J[Persistir evaluación, repaso y sesión]
  J --> C
  C -- no --> K[Progreso: dominio, lagunas y repaso]
```

En `packages/core`:

| Módulo                  | Responsabilidad                                                                         |
| ----------------------- | --------------------------------------------------------------------------------------- |
| `app/progressService`   | `buildProgressOverview` y `nextActionHint`: dominio, lagunas y repaso, funciones puras. |
| `app/sessionController` | Bucle pregunta → respuesta → feedback → siguiente; expone `StudyViewState`.             |
| `app/studyService`      | Persiste la sesión en cada respuesta y ofrece `overview`.                               |
| `mayeu/session`         | Acumula respuestas y evaluaciones; `snapshot()` para persistir sin estado de UI.        |

En `apps/mobile`:

| Módulo                   | Responsabilidad                                                          |
| ------------------------ | ------------------------------------------------------------------------ |
| `screens/StudyScreen`    | Conversación guiada con feedback, andamiaje y trazabilidad de la fuente. |
| `screens/ProgressScreen` | Dominio, lagunas con severidad y repaso pendiente.                       |
| `components/States`      | Estados vacío, carga y error, y barra de progreso reutilizables.         |
| `App.tsx`                | Navegación por máquina de estados y arranque con degradación a memoria.  |

## 10. Comandos

```bash
npm install            # instala workspaces y compila @socracia/core
npm test               # pruebas de core (Jest) y mobile (jest-expo)
npm run typecheck      # TypeScript estricto en ambos workspaces
npm run lint           # ESLint flat config
npm run format:check   # Prettier
npm run verify         # lint + typecheck + test
npm run start          # arranca Expo
```
