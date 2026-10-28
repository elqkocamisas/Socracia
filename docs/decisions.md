# Registro de decisiones

Registro de decisiones técnicas y de producto tomadas durante el desarrollo.
Cada entrada documenta el contexto, la decisión y sus consecuencias. Cuando el
enunciado es ambiguo, la decisión se toma aquí y se continúa: no se bloquea un
sprint por una cuestión menor.

---

## D-001 — Stack del MVP: React Native + Expo + TypeScript

- **Fecha:** Sprint 0
- **Contexto:** el repositorio estaba vacío (un commit inicial, `README.md` de dos
  líneas). No había stack previo que respetar, por lo que aplica el stack
  obligatorio del enunciado.
- **Decisión:** React Native con Expo (SDK 58) y TypeScript estricto, con Metro
  configurado para resolución de monorepo.
- **Consecuencias:** un único código para iOS y Android; EAS Build disponible
  para artefactos de tienda; se puede usar Expo Go para desarrollo rápido y dev
  client cuando se añadan módulos nativos (Sprint 2).

## D-002 — Monorepo con npm workspaces

- **Contexto:** la lógica de negocio crítica debe tener pruebas automatizadas,
  pero los módulos nativos de Expo no se ejecutan en Node.
- **Decisión:** separar `packages/core` (dominio puro, sin dependencias de
  plataforma) de `apps/mobile` (UI y nativo).
- **Consecuencias:** `npm test` prueba el dominio en Node en ~2 s sin
  simuladores; la app consume `@socracia/core` vía workspace; los tipos fluyen
  de un paquete a otro sin duplicación.

## D-003 — `Result<T, E>` en el dominio en lugar de excepciones

- **Contexto:** la lógica mayéutica debe ser total y verificable.
- **Decisión:** las rutas de dominio que pueden fallar devuelven
  `Result<T, E>`; las excepciones se reservan para errores de programación
  (p. ej. dimensiones incompatibles en `cosineSimilarity`).
- **Consecuencias:** el compilador obliga a tratar el error en el punto de
  llamada; las pruebas son más directas.

## D-004 — RAG local por defecto, nube opt-in (ver `rag-strategy.md`)

- **Contexto:** el material del usuario puede ser sensible y con derechos de
  autor.
- **Decisión:** RAG on-device por defecto; la nube es una mejora explícita,
  configurable y consentida por documento (`KnowledgeDocument.cloudConsent`).
- **Consecuencias:** privacidad por defecto, funcionamiento offline y coste
  variable cero. A cambio, penalización de tamaño de app por el modelo, que se
  descargará en la primera ejecución.

## D-005 — Proveedor de embeddings de hashing como base del MVP

- **Contexto:** el modelo on-device real (`edge-llm` / MediaPipe BERT) es un
  módulo nativo que no se puede integrar ni probar en el Sprint 0, y su
  instalación no debe bloquear las fundaciones.
- **Decisión:** implementar `HashingEmbeddingProvider` (hashing de tokens,
  determinista, sin dependencias nativas) como implementación por defecto
  detrás de la interfaz `EmbeddingProvider`.
- **Consecuencias:** el pipeline RAG completo funciona y se prueba desde el
  Sprint 0; el modelo real se enchufa en el Sprint 2 sin tocar `RagEngine`. El
  proveedor de hashing queda como degradación elegante en dispositivos que no
  soporten el modelo.
- **Nota de honestidad técnica:** el hashing no captura semántica real
  (sinónimos, paráfrasis). Se documenta como tal en `rag-strategy.md` y no se
  presenta como equivalente a un modelo de embeddings.

## D-006 — Evaluación de respuestas explicable, sin modelo

- **Contexto:** el enunciado pide "ML sencillo" y sin infraestructura pesada.
- **Decisión:** puntuar cada respuesta con una heurística determinista:
  cobertura de términos clave (peso 0.6) y solapamiento léxico Jaccard con la
  definición de referencia (peso 0.4). Umbrales: correcta ≥ 0.6, parcial ≥ 0.3.
- **Consecuencias:** resultados auditables y testeables, sin alucinaciones ni
  coste. Es sustituible por un LLM on-device detrás de la misma firma
  (`evaluateAnswer`) si en el Sprint 3 se decide mejorar el matiz cualitativo.

## D-007 — Repetición espaciada SM-2 simplificado

- **Contexto:** se necesita repaso programado "sencillo" sin dependencias.
- **Decisión:** SM-2 simplificado con facilidad acotada a `[1.3, 2.8]`:
  correcta multiplica el intervalo, parcial lo mantiene, incorrecta lo reinicia.
- **Consecuencias:** implementación pequeña, determinista y testeada; suficiente
  para el MVP y ampliable a SM-2 completo sin cambiar el modelo de datos.

## D-008 — Umbral de laguna fijado en 0.6 de dominio medio

- **Contexto:** hay que decidir cuándo un concepto se considera laguna.
- **Decisión:** dominio medio < 0.6 en las evaluaciones de la sesión. La
  severidad pondera déficit (0.7) y tasa de fallo (0.3).
- **Consecuencias:** un concepto bien respondido deja de aparecer como laguna;
  los fallos repetidos suben la prioridad de repaso. El umbral es una constante
  exportada (`GAP_THRESHOLD`) y ajustable tras validación con usuarios.

## D-009 — `render` asíncrono en las pruebas de UI

- **Contexto:** `@testing-library/react-native` 14 cambió `render` a asíncrono y
  retiró las queries del valor devuelto, exponiéndolas en `screen`.
- **Decisión:** usar `await render(...)` junto con `screen.getByText(...)`.
- **Consecuencias:** las pruebas de UI del proyecto siguen la API actual de la
  librería; no se fija una versión antigua.

## D-010 — Extracción de conceptos por encabezados y patrones de definición

- **Contexto:** el Sprint 1 necesita convertir un texto de temario en conceptos
  evaluables sin depender de un LLM ni de infraestructura pesada.
- **Decisión:** `extractCurriculum` usa una estrategia determinista en dos
  niveles: los encabezados (markdown, «Tema N.», «Unidad N.», numerados)
  delimitan temas, y las oraciones con patrón de definición delimitan conceptos.
  El término se acota recortando el sintagma nominal hasta el primer
  determinante, verbo o relativo.
- **Consecuencias:** funciona offline, es reproducible y testeable. No capta
  definiciones con estructura atípica; se acepta como limitación del MVP y se
  compensa porque el usuario puede revisar los conceptos extraídos (Sprint 3).
- **Alternativa descartada:** extracción con LLM on-device. Se pospone al
  Sprint 2+, cuando exista el módulo nativo; la interfaz del extractor no
  cambiaría.

## D-011 — El generador excluye el nivel «recordar» por defecto

- **Contexto:** el enunciado exige preguntas mayéuticas, «no preguntas triviales
  de memoria». Las plantillas del Sprint 0 incluían una de definición pura.
- **Decisión:** `GenerateQuestionsOptions.minLevel` (por defecto `comprender`)
  filtra las plantillas elegibles. `mayeu/questionQuality.ts` añade una segunda
  barrera independiente que marca como trivial toda pregunta de recuerdo sin
  razonamiento.
- **Consecuencias:** dos capas de defensa, ambas verificables en pruebas. El
  comportamiento antiguo sigue disponible pasando `minLevel: 'recordar'`, lo que
  permite pruebas comparativas y un futuro modo «repaso rápido» si se decide.

## D-012 — Orden del itinerario en tres franjas

- **Contexto:** hay que decidir qué estudiar primero: lo que se falla, lo nuevo
  o lo que ya se domina.
- **Decisión:** franjas ordenadas por clave de rango: lagunas (dominio por
  debajo de `GAP_THRESHOLD`, las peores antes), después conceptos sin evaluar,
  después dominados. Dentro de cada concepto, las preguntas ascienden en
  exigencia cognitiva.
- **Consecuencias:** se refuerza lo fallido antes de estrenar materia nueva, sin
  abandonar nunca lo ya controlado. Los conceptos sin evaluar no se entierran
  bajo las lagunas ni se anteponen a lo urgente.

## D-013 — El andamiaje nunca entrega la respuesta

- **Contexto:** el método mayéutico exige que el usuario construya la respuesta;
  dar la solución rompe el método.
- **Decisión:** `buildScaffold` genera repreguntas de orientación, acotación,
  descomposición o ejemplificación, proporcionales a la gravedad del fallo, sin
  incluir nunca `expectedAnswer`. Hay una prueba dedicada que lo verifica.
- **Consecuencias:** el usuario recibe ayuda real sin que se le resuelva el
  ejercicio. El número de intentos por pregunta antes de avanzar es configurable
  (`maxAttemptsPerQuestion`, por defecto 2).

## D-014 — Corpus de ejemplo de autoría propia

- **Contexto:** las pruebas necesitan un temario realista, pero no se puede
  reproducir contenido con derechos de autor.
- **Decisión:** `__fixtures__/sampleCurriculum.ts` contiene un temario escrito
  para el proyecto, con estilo y estructura de oposición pero contenido original.
- **Consecuencias:** cero riesgo de derechos de autor; las pruebas son
  autosuficientes y no dependen de descargas de red.

## D-015 — Extracción de texto PDF propia, sin dependencias nativas

- **Contexto:** el MVP debe ingerir los PDF de temario que adjunta el usuario en
  iOS y Android. Las librerías de PDF habituales o son nativas (rompen Expo Go y
  el build gestionado) o son enormes.
- **Decisión:** `PdfTextExtractor` implementa una extracción mínima pero real:
  localiza flujos de contenido, resuelve literales `Tj`/`TJ` con escapes y
  octales, y descomprime `FlateDecode` con `fflate` (JavaScript puro, funciona en
  Hermes y en Node). `Inflate` se inyecta, así que el núcleo no depende de
  `fflate` ni de la plataforma.
- **Consecuencias:** funciona en el build gestionado de Expo sin módulos nativos
  y se prueba en Node con PDFs reales generados en el propio test. Limitación
  conocida y documentada: no interpreta fuentes con codificación personalizada ni
  ToUnicode CMaps, por lo que un PDF escaneado o con subconjunto de fuente
  exótico puede no dar texto; en ese caso la app informa con un mensaje claro
  («puede ser un escaneo») en lugar de fallar en silencio.

## D-016 — El progreso y los documentos viven en SQLite local

- **Contexto:** la privacidad es un requisito de producto: el material del
  usuario no debe salir del dispositivo.
- **Decisión:** `StoragePort` define repositorios (`DocumentRepository`,
  `QuestionRepository`, `ProgressRepository`) que el dominio consume sin conocer
  el motor. La implementación por defecto es SQLite (`expo-sqlite`) en el
  dispositivo; hay una implementación en memoria que sirve de doble en pruebas y
  de respaldo si la base no abre.
- **Consecuencias:** la app es útil sin cuenta ni red. La sincronización del
  Sprint 4 añadirá una implementación remota del mismo puerto sin tocar el motor
  mayéutico ni la UI.

## D-017 — El SQL del adaptador se prueba contra SQLite real

- **Contexto:** probar la capa de datos con un doble que imita SQL no valida las
  sentencias: un `ON CONFLICT` mal escrito pasaría las pruebas y fallaría en el
  dispositivo.
- **Decisión:** las pruebas de `sqliteStorage` ejecutan el SQL real del adaptador
  sobre `node:sqlite` (Node ≥ 22) mediante un shim fino del driver. Solo se
  sustituye el enlace nativo; las consultas son las mismas que corren en el móvil.
- **Consecuencias:** los upserts, índices, transacciones y borrados en cascada
  quedan verificados de verdad. El shim vive en `__tests__/helpers` y no forma
  parte del bundle de la app.

## D-018 — Los embeddings del MVP son locales y sin módulos nativos

- **Contexto:** el proveedor de embeddings definitivo (modelo on-device) se
  decide con las métricas del Sprint 2, pero la app no puede quedarse sin RAG
  mientras tanto.
- **Decisión:** el MVP usa `HashingEmbeddingProvider` (bolsa de términos
  vectorizada por hashing) tras la interfaz `EmbeddingProvider`. Es determinista,
  sin red y sin binarios. El proveedor se inyecta en `createServices`, así que
  sustituirlo por un modelo real o por el backend es cambiar un argumento.
- **Consecuencias:** recuperación léxica sólida desde el primer arranque, cero
  peso de modelo en la descarga de tienda y una ruta de mejora clara sin
  reescribir la app.

## D-019 — La lógica de la conversación mayéutica vive en el núcleo, no en la UI

- **Contexto:** el Sprint 3 necesita el bucle pregunta → respuesta → feedback →
  siguiente pregunta, y la tentación es implementarlo dentro del componente React.
- **Decisión:** el bucle vive en `MayeuticSessionController` (`packages/core`),
  que expone un `StudyViewState` inmutable. `StudyScreen` solo pinta ese estado y
  captura gestos. El controlador recibe `StudyService` y `StoragePort` por
  inyección y no conoce React.
- **Consecuencias:** el flujo crítico se prueba en Node sin simulador (22 suites
  de core) y la UI queda reducida a presentación; cambiar de framework móvil no
  obliga a reescribir la conversación.

## D-020 — El progreso cuenta preguntas distintas, no intentos

- **Contexto:** el andamiaje permite reintentar la misma pregunta. Al sumar cada
  intento, el contador de la UI llegó a mostrar `12 / 6` respuestas.
- **Decisión:** `SessionProgress.answered` cuenta identificadores de pregunta
  distintos (`new Set(evaluation.questionId).size`). El detalle de intentos
  sigue disponible en `allEvaluations()` para métricas.
- **Consecuencias:** el progreso nunca supera el total del itinerario y refleja
  el avance real del usuario, que es lo que la barra de progreso debe comunicar.

## D-021 — La navegación del MVP es una máquina de estados explícita

- **Contexto:** el MVP tiene tres pantallas (biblioteca, estudio, progreso). Añadir
  un enrutador (React Navigation) suma dependencia, configuración nativa y peso.
- **Decisión:** `App.tsx` mantiene una unión discriminada `Route` y renderiza la
  pantalla activa. Es suficiente para el alcance actual y se puede sustituir por
  un enrutador cuando el producto lo exija.
- **Consecuencias:** cero dependencias de navegación en el MVP y una máquina de
  estados trivial de probar; la ruta de migración está acotada a `App.tsx`.

## D-022 — El índice vectorial se rehidrata desde los fragmentos persistidos

- **Contexto:** el índice vive en memoria y solo se poblaba durante la ingesta.
  Al cerrar y reabrir la app quedaba vacío, así que «Estudiar» fallaba con «No se
  pudieron generar preguntas para este temario» aunque el documento siguiera en
  la biblioteca. Para el usuario, el temario importado era inservible tras el
  primer cierre.
- **Decisión:** se persiste el **texto** de los fragmentos en SQLite (tabla
  `chunks`), nunca sus vectores. Al arrancar, `bootstrap` llama a
  `RagEngine.rehydrate`, que recalcula los embeddings en el dispositivo desde los
  fragmentos guardados.
- **Consecuencias:** el temario sobrevive al reinicio sin releer el archivo
  original y sin enviar texto a ningún servidor, lo que respeta la promesa de
  privacidad. El coste es recalcular embeddings en cada arranque: con el
  proveedor de hashing es despreciable, y si se adopta un modelo on-device real
  habrá que medirlo y, si procede, cachear los vectores en la misma tabla.
- **Alternativa descartada:** guardar los vectores junto a los fragmentos. Ahorra
  el recálculo, pero ata los datos al modelo concreto: cambiar de proveedor
  invalidaría el índice guardado. Guardar texto mantiene el índice reconstruible
  con cualquier proveedor futuro.

## D-023 — La rehidratación es tolerante a fallos y no bloquea el arranque

- **Contexto:** `rehydrate` recalcula embeddings y puede fallar (proveedor no
  disponible, datos corruptos). Un fallo ahí no debe impedir abrir la app.
- **Decisión:** `bootstrap` espera la rehidratación, pero `rehydrateIndex`
  devuelve `0` en caso de error en lugar de lanzar. La app arranca con el índice
  vacío y el usuario puede volver a adjuntar el documento.
- **Consecuencias:** la app nunca se queda en pantalla de carga por un problema
  de índice; el fallo degrada a «vuelve a importar» en lugar de «la app no abre».

## D-024 — La fusión del progreso es lógica pura en el núcleo

- **Contexto:** sincronizar exige combinar dos versiones del progreso (la local
  y la remota). Si esa combinación viviera en el backend o en la pantalla, no se
  podría probar sin red y el cliente y el servidor podrían divergir.
- **Decisión:** `mergeSnapshots` vive en `@socracia/core` como función pura:
  recibe dos instantáneas y devuelve la fusionada. Tanto el backend
  (`apps/api`) como el cliente aplican exactamente la misma función.
- **Consecuencias:** la regla de fusión se prueba una sola vez con Jest en Node y
  vale para los dos lados; no hay dos implementaciones que mantener en sincronía.
  El coste es que el backend depende de `@socracia/core`, asumible porque es
  TypeScript sin dependencias nativas.

## D-025 — Las evaluaciones se identifican por contenido y se fusionan por marca de tiempo

- **Contexto:** dos dispositivos pueden evaluar la misma pregunta sin conexión.
  Al sincronizar hay que decidir qué versión gana sin duplicar entradas.
- **Decisión:** cada evaluación se identifica por su `questionId` (formato
  `concepto:índice`, p. ej. `c1:q0`) y cada entrada lleva un `updatedAt`. La
  fusión conserva la entrada con `updatedAt` mayor y descarta duplicados. La
  instantánea se ordena de forma estable para que dos fusiones equivalentes
  produzcan el mismo resultado.
- **Consecuencias:** sincronizar es idempotente: subir dos veces lo mismo no
  duplica nada. La última respuesta del usuario gana, que es lo que espera. Se
  descarta la fusión por suma de intentos porque el progreso mide dominio, no
  actividad (D-020).

## D-026 — El backend del MVP usa Node nativo y no añade dependencias

- **Contexto:** el Sprint 4 pide una API mínima para cuentas y sincronización,
  sin microservicios innecesarios.
- **Decisión:** el backend (`apps/api`) se implementa sobre el módulo `http` de
  Node, sin Express ni framework alguno. El almacén por defecto es en memoria;
  `JsonFileProgressStore` da persistencia en un fichero sin base de datos. Las
  contraseñas se guardan con `scrypt` y sal por usuario, del propio Node.
- **Consecuencias:** cero dependencias de producción que auditar y una superficie
  de ataque mínima; el contenedor arranca sin base de datos. El coste es que no
  hay enrutado declarativo ni middlewares: para los cuatro endpoints del MVP el
  enrutado manual es suficiente y explícito. Migrar a un framework más adelante
  es sustituir `server.ts`, no reescribir el dominio.

## D-027 — La cuenta es opcional y no migra el progreso local

- **Contexto:** la app nació local y privada (D-016). Añadir cuentas no debe
  convertir la nube en obligatoria ni reescribir los datos ya guardados.
- **Decisión:** el progreso local sigue bajo el identificador `local-user`. Al
  iniciar sesión, el cliente sube su instantánea y el backend la indexa por la
  cuenta; el servidor **ignora el `userId` del cuerpo** y usa el de la sesión.
  Los documentos y su texto nunca se sincronizan.
- **Consecuencias:** sin cuenta la app funciona igual; con cuenta el usuario
  continúa en otro dispositivo. Que el servidor imponga el `userId` evita que un
  cliente escriba el progreso de otro manipulando el JSON. El token se guarda en
  la tabla `app_meta`; moverlo a `expo-secure-store` más adelante no cambia nada
  más porque el resto de la app solo conoce el puerto `CredentialStore`.

## Ambigüedades pendientes (no bloqueantes)

- **Vertical inicial (oposiciones vs PAU):** resuelto en el Sprint 1: el corpus
  de ejemplo es de oposiciones (Administración), por ser el caso con temario más
  reglado. El dominio sigue siendo agnóstico y sirve para PAU sin cambios.
- **Gestión de cuentas:** resuelto en el Sprint 4 (D-027): cuenta opcional que
  solo añade sincronización de progreso.
- **Almacén del backend:** el MVP arranca con almacén en memoria y fichero JSON
  (D-026). Una base de datos real se decidirá cuando haya usuarios y métricas de
  carga; el puerto `ProgressStore` ya la abstrae.
- **Modelo on-device definitivo:** pendiente de las métricas de latencia y
  calidad del Sprint 2. La decisión no bloquea el MVP porque el proveedor es
  inyectable (D-018).
