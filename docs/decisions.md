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

## D-028 — Los assets de tienda se generan por script y se validan por prueba

- **Contexto:** los iconos y el splash son obligatorios para publicar, pero un
  PNG binario en el repositorio no se puede revisar en un pull request ni
  regenerar de forma fiable.
- **Decisión:** `scripts/generate-assets.mjs` dibuja la marca con una polilínea
  Catmull-Rom y un campo de distancia firmada, y escribe los PNG con `pngjs`.
  Los PNG resultantes sí se versionan, porque las tiendas consumen ficheros.
  `storeAssets.test.ts` valida lo que provoca rechazo automático: 1024×1024 sin
  alfa para iOS, 512×512 para la ficha de Play, y que la tinta quede dentro de
  la caja segura del icono adaptativo de Android.
- **Consecuencias:** cambiar el icono es cambiar el script, no editar un binario
  opaco. `pngjs` ya llega como dependencia transitiva de `@expo/cli`, así que no
  añade peso al bundle (solo se usa en scripts y pruebas).

## D-029 — No se introduce CI en este sprint

- **Contexto:** el Sprint 5 pide que «las pruebas E2E pasan», y un pipeline de
  integración continua sería el sitio natural para demostrarlo.
- **Decisión:** **no** se añade configuración de CI/CD. Las reglas de trabajo del
  proyecto prohíben tocar configuración de CI sin indicación expresa, y la
  verificación se realiza en local con `npm run verify` (lint + typecheck +
  pruebas de los tres workspaces). Añadir un workflow sería un cambio de
  infraestructura que este sprint no ha pedido, y su coste no está justificado
  mientras no haya varios contribuyentes.
- **Consecuencias:** quien adopte el repositorio debe añadir el pipeline; la
  lista de comprobación de tienda lo incluye como paso previo a publicar. La
  puerta de calidad mientras tanto es `npm run verify`, que cubre lo mismo que
  ejecutaría un CI.

## D-030 — La eliminación de cuenta borra datos y conserva el progreso local

- **Contexto:** App Store exige que una app con cuentas permita eliminarlas
  desde dentro de la app, y que esa acción borre los datos de verdad. El
  progreso local, sin embargo, es del dispositivo y no de la cuenta.
- **Decisión:** `DELETE /account` invalida todas las sesiones de la cuenta,
  borra las credenciales (el correo queda libre para volver a registrarse) y
  elimina la instantánea de progreso del servidor. En el cliente, la pantalla
  pide confirmación en dos pasos y solo limpia las credenciales locales cuando
  el servidor confirma. El progreso **local** se conserva.
- **Consecuencias:** eliminar la cuenta no deja al usuario sin app: sigue
  estudiando sin cuenta con lo que tenía en el dispositivo, que es el modo por
  defecto (D-016). Si el servidor falla, la sesión no se limpia y se muestra el
  error, para que nadie crea que sus datos se borraron cuando no fue así. El
  progreso local no se borra porque no pertenece a la cuenta; quien quiera
  borrarlo todo desinstala la app o elimina los documentos.

## D-031 — La entrega sin Git es un archivo de código fuente con manifiesto

- **Contexto:** el proyecto debe poder entregarse y arrancarse en entornos donde
  Git no está disponible o no se usa: máquinas sin permisos, entrega a un
  tercero, despliegues que parten de un archivo.
- **Decisión:** `npm run package:source` produce un `.tar.gz` con el código
  fuente y un `manifest.json` con la huella SHA-256 de cada fichero. Se
  excluyen `node_modules`, artefactos de build y todo fichero de credenciales
  (`play-service-account.json`, `*.jks`, `*.p8`, `.env`). La lógica de qué
  entra vive en `scripts/lib/release-files.cjs` (CommonJS, para poder probarse)
  y el CLI en `scripts/package-release.mjs`.
- **Consecuencias:** quien no puede clonar recibe un archivo verificable, y
  `packageRelease.test.ts` falla si alguna vez un secreto pudiera colarse en la
  entrega. Se pierde el historial de Git, así que `docs/decisions.md` y el
  manifiesto de cada entrega sustituyen a los `git tag`. Se documenta todo en
  `docs/no-git-delivery.md`. No se introduce ningún servicio externo: sigue sin
  haber CI (D-029).

## D-032 — El arranque del backend se prueba desde el punto de entrada publicado

- **Contexto:** al probar la entrega en una extracción limpia (`tar -xzf` +
  `npm ci`), `npm start --workspace @socracia/api` terminaba al instante sin
  abrir puerto. La causa: `start` ejecutaba `dist/server.js`, que solo exporta
  `createApiServer` y nunca llama a `listen`; el fichero que sí arranca es
  `dist/index.js`. Ninguna prueba lo detectaba porque todas construyen el
  servidor con `createApiServer`, no con el fichero que usa `npm start`.
- **Decisión:** `main`, `start` y `dev` de `apps/api` apuntan a `dist/index.js`.
  El `postinstall` de la raíz compila **todos** los workspaces
  (`npm run build --workspaces --if-present`) y no solo `core`, para que
  `npm ci` deje la API lista sin un `npm run build` manual. Se añade
  `apps/api/src/__tests__/entrypoint.test.ts`, que lanza el fichero real, espera
  a `/health` y exige respuesta.
- **Consecuencias:** una instalación limpia arranca con un solo comando. La
  prueba nueva falla si alguien vuelve a apuntar `start` a un módulo sin
  `listen`; se comprobó revirtiendo el arreglo a propósito. Coste: el
  `postinstall` tarda unos segundos más al compilar la API, aceptable frente a
  un backend que no arranca.

## D-033 — Conventional Commits, sin reescribir el historial

- **Contexto:** el historial usa el estilo «Sprint N: …», que dice el sprint pero
  no el tipo de cambio; `git log --oneline` no permite filtrar ni generar notas
  de versión, y un asunto sin línea en blanco detrás se ve entero como asunto.
  Había además tres commits sin cuerpo y cuatro asuntos de 74–80 caracteres.
- **Decisión:** adoptar Conventional Commits
  (`tipo(ámbito): asunto`) desde ahora, documentado en `CONTRIBUTING.md` con
  tabla de tipos, ámbitos y ejemplo. **El historial no se reescribe:** el
  validador acepta el estilo «Sprint N: …» con una advertencia, nunca con un
  error, y también avisa (no falla) cuando un asunto histórico supera los 72
  caracteres. Las reglas viven en `scripts/lib/commit-convention.cjs` (CommonJS,
  para poder probarse) y el CLI en `scripts/check-commits.mjs`, expuesto como
  `npm run lint:commits`.
- **Consecuencias:** los commits nuevos son filtrables y generan notas de versión;
  los antiguos siguen tal cual, sin `rebase` que rompa hashes ya publicados. El
  pie `Sprint: <n>` conserva la trazabilidad que daba el prefijo. `main` no tiene
  protección de rama con CI (D-029), así que la comprobación es local: quien
  olvide ejecutarla no queda bloqueado, pero el PR lo deja visible.

## D-034 — Proveedor de embeddings real, con sondeo y umbral de relevancia

- **Contexto:** `docs/rag-strategy.md` dejaba el modelo on-device como
  «sustitución de una línea en `createServices`». Al intentar hacerla se
  comprobaron tres cosas, todas verificadas sobre el paquete real
  (`npm pack edge-llm@0.1.4`):
  1. **El módulo no entrega el vector.** `embedTest` devuelve
     `{ length, sample }` y el código nativo hace `vector.take(5)`: son 5 valores
     de 384. El vector completo se calcula y se descarta.
  2. **En iOS el módulo no existe.** `ios/MediapipeModule.swift` (48 líneas) es
     la plantilla de Expo: solo expone `hello` y `setValueAsync`. No hay
     embeddings ni RAG.
  3. **La recuperación léxica falla en paráfrasis.** Medido con el corpus de
     ejemplo: 6/6 aciertos top-1 cuando la consulta comparte vocabulario
     (similitud 0.26–0.55), pero **1/6** con paráfrasis sin vocabulario común
     (similitud 0.08–0.18). Se probó además una mejora léxica con IDF y
     n-gramas de caracteres: subió de 1/6 a 2/6, insuficiente para justificar
     su complejidad, así que se descartó.
- **Decisión:** (a) construir `DelegatingEmbeddingProvider`, que adapta
  cualquier motor externo —nativo o remoto— a `EmbeddingProvider`, validando
  dimensión y convirtiendo excepciones en `Result`; (b) añadir
  `createEdgeLlmProvider`, que **sondea el módulo** y falla con un motivo
  explícito en lugar de generar vectores inservibles; (c) añadir
  `FallbackEmbeddingProvider`, que degrada al proveedor léxico y no reintenta el
  principal, para no mezclar dimensiones en un mismo índice; (d) introducir un
  **umbral de relevancia** (`DEFAULT_RELEVANCE.minScore = 0.2`) y aplicarlo en
  `generateConceptQuestions`, que ahora devuelve cero preguntas antes que citar
  un fragmento que no respalda el contenido.
- **Consecuencias:** la app no puede usar hoy el RAG semántico de `edge-llm`
  porque el paquete no lo ofrece; el día que exponga un `embed` completo, basta
  cambiar qué proveedor se inyecta en `createServices`, sin tocar el motor
  mayéutico ni la UI. El umbral de 0.2 está calibrado para el proveedor léxico:
  con uno semántico real habrá que recalibrarlo, y por eso es parámetro y no
  constante. El coste es que, con paráfrasis, el motor generará menos preguntas
  de las posibles; se prefiere eso a atribuir una pregunta a una fuente falsa.

## D-035 — El procesamiento en la nube es un ajuste explícito, nunca el valor por defecto

- **Fecha:** 28 de octubre de 2026
- **Contexto:** el pliego exige que, si algo se procesa fuera del dispositivo,
  sea «explícito y configurable». Hasta ahora no había ajuste alguno:
  `importDocument` pasaba `cloudConsent: false` como constante. La promesa de
  privacidad dependía de que nadie tocara esa línea, y no había forma de que el
  usuario eligiera nada, ni de que la app pudiera ofrecer corpus en la nube en el
  futuro sin reescribir el flujo.
- **Decisión:** introducir `ProcessingPolicy` en el núcleo, con dos modos
  (`local-only`, `allow-cloud`) y **`local-only` por defecto**. La comprobación
  `assertProcessingAllowed` se ejecuta en la capa de aplicación (no en la
  pantalla) antes de cualquier operación que requiera nube. La política se
  persiste en `app_meta` y se comparte mediante un `ProcessingPolicyHolder`, de
  modo que un cambio surte efecto sin reiniciar la app. Cada documento importado
  registra en `cloudConsent` si el usuario había autorizado la nube.
- **Alternativas descartadas:** (a) dejar la constante `false` y documentar que
  el MVP es local: incumple el requisito de «configurable» y no deja camino a la
  nube; (b) poner el ajuste solo en la UI: una pantalla se salta con un cambio de
  estado, la garantía tiene que vivir en la capa que decide; (c) leer la política
  solo al arrancar: si el usuario la activa, la importación siguiente usaría el
  valor viejo y registraría un consentimiento falso.
- **Consecuencias:** el modo por defecto sigue siendo el más protector y la
  comprobación es una garantía de código, no de interfaz. El coste es que el
  ajuste `allow-cloud` existe en la app antes de que haya backend de corpus en
  nube: se acepta porque deja el camino preparado y la política ya advierte al
  usuario. Si se activa en producción, hay que actualizar
  `store/privacy-declarations.json` y el apartado 2.1 de la política en el mismo
  envío; la lista de comprobación lo recuerda.

## D-036 — El borrado de un documento arrastra el progreso de sus conceptos

- **Fecha:** 28 de octubre de 2026
- **Contexto:** el puerto `ProgressRepository` documentaba desde el Sprint 1 que
  el borrado de un documento limpiaba el progreso asociado, y `deleteDocument`
  existía, pero no había pantalla que lo invocara ni el progreso se limpiaba:
  evaluaciones y estados de repaso se guardan por usuario, no por documento.
- **Decisión:** implementar `ProgressRepository.removeConcepts(userId, ids)` en
  las dos implementaciones (memoria y SQLite) y llamarlo desde `deleteDocument`
  en cascada, después de borrar documento, temario, fragmentos e índice. El
  filtrado de evaluaciones **conserva el `seq` original** en lugar de renumerar.
- **Alternativas descartadas:** (a) borrar por documento: el modelo no guarda el
  documento en cada evaluación, solo el concepto, así que exigiría una migración
  de esquema mayor; (b) dejar el progreso huérfano: la pantalla de progreso
  mostraría repasos pendientes de conceptos que ya no existen, que es un fallo
  visible para el usuario; (c) renumerar `seq`: cambia el orden del historial.
- **Consecuencias:** borrar es limpio y el usuario recupera el espacio. La
  decisión se apoya en que un concepto pertenece a un solo temario en este
  dominio; si en el futuro un concepto pudiera compartirse entre documentos, el
  borrado tendría que comprobar antes si otro documento lo referencia.

## D-037 — Las capturas de tienda se generan desde el código, no a mano

- **Fecha:** 29 de octubre de 2026
- **Contexto:** `store/listing.json` declaraba cinco capturas por tienda y la
  lista de comprobación las exigía, pero no existía ningún fichero. La prueba
  `storeListing.test.ts` solo contaba entradas del JSON, así que pasaba sin que
  hubiera una sola imagen: verificaba la declaración, no el artefacto.
- **Decisión:** generar las capturas con `scripts/generate-screenshots.mjs`, que
  arranca la app **real** (mismo código que se empaqueta, renderizado con
  `react-native-web`), recorre el flujo completo —importar, preguntar, responder,
  ver progreso, cuenta— y fotografía cada pantalla a los píxeles exactos de cada
  tienda (App Store 1290×2796; Play 1080×1920). Se versionan en
  `apps/mobile/store/screenshots/` y `storeListing.test.ts` ahora exige que
  existan, midan lo declarado y no sean la misma imagen repetida.
- **Alternativas descartadas:** (a) maquetas dibujadas: pueden mostrar una
  interfaz que no existe y no se actualizan solas; (b) capturar solo en
  simulador/dispositivo: correcto para el envío final, pero no reproducible en
  cada cambio ni verificable en la suite; (c) no versionar las capturas: la
  ficha quedaría sin artefacto y la lista de comprobación, incumplida.
- **Consecuencias:** las capturas siguen al código: si una pantalla cambia, la
  captura cambia y el `diff` lo enseña. Limitación conocida y documentada: son
  de render web, no de dispositivo, así que la lista de comprobación pide
  repetirlas en nativo antes de enviar. Esto exige `react-native-web`,
  `react-dom`, `@expo/metro-runtime` y `playwright` como dependencias de
  desarrollo, y `wasm` en `assetExts` de Metro para que `expo-sqlite` exporte a
  web (cambio que no afecta a los bundles nativos).

## D-038 — La interfaz nombra los conceptos; nunca muestra su identificador

- **Fecha:** 29 de octubre de 2026
- **Contexto:** al recorrer la app real para las capturas se vio que la pantalla
  de progreso mostraba `t1:c1` en «Repaso pendiente», y el andamiaje de respuesta
  correcta decía «…donde se vea «t1:c1» en acción». Son identificadores internos
  que no significan nada para quien estudia.
- **Decisión:** `dueReviews` recibe los conceptos y devuelve `DueReview` con
  `conceptLabel`; si el concepto no está en el dispositivo (el progreso se
  sincroniza, los documentos no), muestra «Concepto no disponible» en lugar del
  identificador. `buildScaffold` recibe `conceptLabel` como parámetro
  **obligatorio**, de modo que el compilador impide volver a pasar un
  identificador.
- **Alternativas descartadas:** (a) añadir `conceptLabel` a `SocraticQuestion`:
  duplicaría un dato que ya vive en `ItineraryStep` y que el motor de preguntas
  no necesita; (b) resolver el nombre en la pantalla: repartiría la lógica de
  dominio por la UI, que es justo lo que el proyecto evita.
- **Consecuencias:** dos pruebas nuevas fijan el comportamiento (una de núcleo y
  una de interfaz que recorre el flujo y comprueba que ningún identificador
  aparece en pantalla). El parámetro obligatorio rompe a cualquier llamador
  futuro que intente pasar el identificador, en tiempo de compilación.

## D-039 — Se introduce CI con GitHub Actions (supera D-029)

- **Contexto:** D-029 decidió no añadir CI mientras no hubiera indicación
  expresa. La preparación de la publicación pide un workflow de Expo y una
  puerta de calidad reproducible fuera de la máquina de cada persona.
- **Decisión:** se añaden dos flujos en `.github/workflows/`. `expo.yml` se
  ejecuta en cada push a `main` y a ramas `sprint-*` y en cada PR: corre
  `npm run verify` en Node 22 y 24, y exporta la app para iOS, Android y web.
  `eas-build.yml` compila y envía a tiendas con EAS, **solo a mano**
  (`workflow_dispatch`), porque consume créditos y exige `EXPO_TOKEN`.
- **Alternativas descartadas:** (a) un único flujo que compilara y publicara en
  cada push: publicaría sin revisión humana y gastaría créditos en cada commit;
  (b) `eas build` dentro de `expo.yml`: mezclaría la puerta de calidad, que debe
  ser rápida y sin secretos, con la compilación, que tarda y los necesita.
- **Consecuencias:** D-029 queda superada. `EXPO_TOKEN` debe crearse como
  secreto del repositorio antes de usar `eas-build.yml`; sin él, el flujo falla
  con un mensaje explícito. La puerta de calidad sigue siendo `npm run verify`,
  que es exactamente lo que ejecuta el CI.

## D-040 — El mínimo real de Node es 22, no 20

- **Contexto:** `package.json` declaraba `engines.node: ">=20"`, pero las
  pruebas de almacenamiento usan `node:sqlite`, que **no existe en Node 20**
  (`ERR_UNKNOWN_BUILTIN_MODULE`). Verificado: en Node 20 fallan 5 suites y 3
  pruebas; en Node 22 y 24, las 446 pasan.
- **Decisión:** subir `engines.node` a `>=22`, fijar la matriz del CI en
  Node 22 y 24, y añadir una comprobación en `.openhands/setup.sh` que aborta
  con un mensaje claro si la versión es menor.
- **Alternativas descartadas:** (a) mantener `>=20` y dejar que las pruebas
  fallen: el error («Cannot find module 'node:sqlite'») no dice qué hacer;
  (b) sustituir `node:sqlite` por un doble de prueba: perdería el valor de
  ejecutar el SQL real del adaptador móvil, que es justo lo que esas pruebas
  comprueban.
- **Consecuencias:** quien tenga Node 20 recibirá un error explícito en el
  bootstrap en lugar de un fallo opaco en las pruebas. El CI cubre 22 (mínimo) y
  24 (actual) para detectar regresiones de compatibilidad.

## D-041 — Se retiran dos campos obsoletos de `app.json`

- **Contexto:** `expo-doctor` fallaba en la validación del esquema de
  configuración por dos campos: `android.edgeToEdgeEnabled` y
  `newArchEnabled`. Expo declara el primero «no longer available» (Android 16
  hace obligatorio el edge-to-edge) y RN 0.88 solo tiene la nueva arquitectura,
  así que ambos eran configuración muerta.
- **Decisión:** eliminarlos. El resto de `app.json` no cambia.
- **Alternativas descartadas:** silenciarlos con `expo.install.exclude` o
  dejarlos: seguirían sin efecto y mantendrían el esquema en rojo.
- **Consecuencias:** `expo-doctor` pasa de 17/20 a 18/20 comprobaciones. Quedan
  dos avisos conocidos y no bloqueantes: el override
  `resolver.disableHierarchicalLookup` de Metro, **necesario** para resolver
  módulos en el monorepo, y el desajuste de versiones de parche del SDK, que se
  abordará en su propia tarea. Por eso `expo-doctor` es informativo
  (`continue-on-error`) en el CI y la puerta real es el export de las tres
  plataformas.

## D-042 — El workflow no publica en tiendas automáticamente

- **Contexto:** la rama `elqkocamisas-patch-1` se creó desde la web de GitHub
  para subir un archivo, y su commit («Add files via upload») no sigue la
  convención del proyecto, lo que hace fallar la suite de convención de commits.
- **Decisión:** dejar el envío a tiendas como acción manual y explícita. La
  compilación con `eas build --no-wait` no bloquea un runner durante la
  compilación, y `eas submit` solo se ofrece con perfil `production` y marcando
  la casilla correspondiente.
- **Consecuencias:** ninguna publicación ocurre sin que una persona la pida.
  Se documenta aquí porque el commit de la rama rompe `npm run verify` y conviene
  saber que la causa es el mensaje, no el contenido.

## D-043 — El modelo es el motor principal, pero no dirige la sesión

- **Contexto:** el MVP evaluaba y generaba con heurística. Un modelo de lenguaje
  mejora mucho la calidad del texto (evaluación matizada, preguntas ancladas,
  repreguntas que responden al error concreto), pero introduce dos riesgos: el
  coste y la latencia, por un lado, y la salida no fiable, por otro. Además, el
  material del usuario es sensible y no puede salir del dispositivo sin permiso.
- **Decisión:** el modelo pasa a ser el motor **principal** de la experiencia
  mayéutica cuando hay backend y consentimiento; la heurística queda como
  respaldo. El modelo solo cambia el texto de cada tarea (evaluar, preguntar,
  repreguntar, explicar), nunca las decisiones de avance: itinerario, lagunas y
  repaso espaciado siguen consumiendo `score` y `verdict`, vengan de donde
  vengan. Toda salida del modelo se valida campo a campo y se descarta si no
  cumple; un fallo del proveedor no interrumpe la sesión, que continúa con el
  respaldo.
- **Alternativas descartadas:** (a) modelo obligatorio: un timeout dejaría al
  alumno sin poder estudiar; (b) modelo como fuente de avance: una puntuación
  alucinada alteraría lagunas y repaso, decisiones que deben ser deterministas y
  auditables; (c) clave del proveedor en la app: quedaría expuesta en el binario
  y en la revisión de tienda.
- **Consecuencias:** la app necesita backend para el modo con modelo, pero
  funciona entera sin él. El consentimiento es la capa externa del proveedor, de
  modo que revocarlo bloquea incluso la caché. Los evals
  (`npm run eval:llm`, 32 casos) fijan el comportamiento seguro del motor y se
  revisan al cambiar prompts o validadores. El detalle vive en
  `docs/llm-engine.md`.

## D-044 — El asistente con modelo se declara como transmisión transitoria bajo consentimiento

- **Contexto:** el motor mayéutico con modelo (D-043) envía a la pregunta, la
  respuesta del alumno, la referencia y el fragmento citado del temario. Las
  declaraciones de tienda y la política decían que lo único que salía del
  dispositivo era el progreso agregado y que los documentos nunca se
  transmitían. Esa afirmación era exacta antes del motor y dejó de serlo al
  integrarlo: declarar «no se transmiten documentos» con una ruta que sí envía
  fragmentos es una declaración falsa, motivo de rechazo en ambas tiendas.
- **Decisión:** declarar el asistente como una categoría propia de datos, con dos
  matices que lo describen con exactitud: (a) la base jurídica es el
  **consentimiento explícito**, revocable en cualquier momento, no la ejecución
  de contrato; (b) el tratamiento es **transitorio**: el servidor atiende la
  petición en memoria y no la almacena ni la registra. Se declara en las dos
  tiendas y en los apartados 2.1, 2.3 y 4 de la política, con una cláusula nueva
  en los términos sobre contenido generado con modelo.
- **Alternativas descartadas:** (a) dejar las declaraciones como estaban: sería
  una declaración falsa; (b) declarar la transmisión como general (sin distinguir
  consentimiento): describiría mal una app cuyo defecto es solo-dispositivo y
  obligaría a renunciar a «Data Not Collected» sin motivo; (c) no transmitir nada
  nunca: renunciaría a la mejora de calidad del motor, que sí aporta valor.
- **Consecuencias:** las declaraciones ya no pueden afirmar que ningún fragmento
  sale nunca; la prueba `storeListing.test.ts` incluye un guardián que falla si
  el motor existe y la declaración no lo menciona, o si se retira el motor y la
  declaración lo sigue afirmando. La checklist de tiendas gana una puerta de
  privacidad. Si el servidor empieza a almacenar o registrar el contenido, esta
  decisión debe revisarse: dejaría de ser transitorio.

## D-045 — La APK de prueba se firma con clave de depuración

- **Contexto:** se compiló una APK de release en local para verificar que el
  proyecto empaqueta de verdad (ver `docs/build-apk-local.md`). El prebuild
  limpio no define un keystore de release, así que Gradle usa el de depuración.
- **Decisión:** se acepta esa firma **solo para la APK de verificación**. La
  publicación no usa este camino: va por `eas build --profile production`, que
  produce un AAB firmado con credenciales gestionadas por EAS.
- **Motivos:** el objetivo del APK local es comprobar el empaquetado y permitir
  una instalación por USB, no publicar. Versionar un keystore de release en el
  repositorio sería un riesgo de seguridad y un error que no se puede deshacer
  después de publicar (la clave es la identidad de la app en Play).
- **Alternativas descartadas:** (a) generar y versionar un keystore de release:
  expone la clave de firma; (b) no compilar nunca en local: deja sin verificar la
  puerta de build más costosa; (c) usar el keystore de depuración para publicar:
  Play lo rechaza.
- **Consecuencias:** la APK local sirve para pruebas, no para tiendas. La
  checklist de publicación ya exige el AAB firmado; esta decisión no la cambia,
  solo documenta por qué el artefacto local no vale para subir.

## D-046 — El servicio de Render debe ser la API, no la app web

- **Contexto:** al preparar el build de tienda se pidió la URL del backend y se
  recibió `https://socracia.onrender.com`. Al sondearla, **todas** las rutas
  devolvían `text/html` con el documento de `react-native-web`
  (`<title>Socracia</title>`, `#root`, `expo-reset`), incluida `POST /auth/login`
  y `GET /health`. Es decir: el servicio desplegado era la **app Expo en modo
  web**, no `apps/api`. Un móvil apuntado ahí no habría sincronizado nunca: cada
  petición habría recibido HTML en lugar de JSON.
- **Decisión:** declarar el backend en `render.yaml` como servicio propio
  (`socracia-api`), construido desde la raíz del monorepo y arrancado con
  `node apps/api/dist/index.js`. La URL de la app se configura con
  `EXPO_PUBLIC_API_BASE_URL` apuntando a ese servicio.
- **Motivos:** el repositorio no contenía ninguna configuración de Render, así
  que el servicio existente se creó a mano en el panel. Sin un fichero en el
  repositorio, el error (desplegar el cliente en lugar del servidor) se repite
  en cada intento y nadie lo ve hasta que un usuario no puede iniciar sesión.
- **Alternativas descartadas:** (a) desplegar la API en el mismo servicio que la
  app web: mezcla dos procesos con requisitos distintos y el enrutado se vuelve
  frágil; (b) usar el plan gratuito con disco: el gratuito no admite discos, así
  que el progreso se perdería en cada reinicio; (c) dejar el backend sin
  desplegar: la app funciona en local, pero se pierde la sincronización entre
  dispositivos que el Sprint 4 ya implementó.
- **Consecuencias:** el progreso persiste en `DATA_FILE`. Con el plan gratuito el
  fichero vive en un sistema de archivos efímero: sirve para verificar el
  servicio, **no** para producción. Para persistencia real hay que subir a un
  plan de pago y descomentar el disco (queda anotado en `render.yaml`). El plan
  gratuito además suspende el servicio sin tráfico, así que el primer acceso
  tarda.

## D-047 — El fichero de progreso crea su directorio

- **Contexto:** `JsonFileProgressStore.flush()` escribía con `writeFile` sin
  asegurar el directorio. En un despliegue, `DATA_FILE` apunta a un volumen que
  se monta vacío, así que la primera sincronización fallaba con `ENOENT`.
- **Decisión:** crear el directorio con `mkdir(…, { recursive: true })` antes de
  escribir, y cubrirlo con una prueba que reproduce el fallo.
- **Motivos:** el fallo solo aparece en el despliegue, es decir, en producción y
  con el usuario delante. Reproducirlo en una prueba es más barato que
  descubrirlo en el panel de Render.
- **Alternativas descartadas:** (a) documentar «cree el directorio antes de
  arrancar»: traslada a quien despliega un fallo del código y el plan gratuito
  no permite crear directorios a mano; (b) usar el directorio actual si falta:
  escribe donde no debe.
- **Consecuencias:** la prueba nueva falla con `ENOENT` si se retira el arreglo
  (verificado). Sin efecto en el modo en memoria.

## D-048 — CORS abierto por defecto, con lista blanca opcional

- **Contexto:** la API no manejaba CORS en absoluto. El preflight (`OPTIONS`)
  devolvía `404` sin cabeceras y las respuestas normales tampoco llevaban
  `Access-Control-Allow-Origin`. El móvil nativo no lo nota (su `fetch` no aplica
  la política de origen), pero la app también se compila para **web**, y ahí el
  navegador bloquea toda petición con `Authorization` antes de salir.
- **Decisión:** responder al preflight con `204` y añadir las cabeceras CORS a
  todas las respuestas. Por defecto, cualquier origen (`*`); la variable
  `CORS_ORIGINS` permite fijar una lista blanca.
- **Motivos:** el comodín es seguro **en este diseño** porque la sesión viaja en
  la cabecera `Authorization`, no en cookies. El navegador no adjunta
  credenciales por sí solo, así que una página ajena no puede leer la respuesta
  autenticada de nadie: tendría que poseer ya el token. Y nunca se envía
  `Access-Control-Allow-Credentials`, que es la combinación que el navegador
  prohíbe junto al comodín. Bloquear por defecto rompería el cliente web recién
  compilado sin que nadie hubiera configurado la lista.
- **Alternativas descartadas:** (a) exigir lista blanca siempre: rompe el
  arranque local y el cliente web hasta que alguien acierte con la variable;
  (b) comodín con `Allow-Credentials`: el navegador lo rechaza y sería un fallo
  de seguridad; (c) resolver CORS solo en el borde (proxy o plataforma): deja el
  fallo latente en cualquier otro despliegue y no se puede probar en local.
- **Consecuencias:** las cabeceras se fijan con `res.setHeader` antes de
  enrutar, así que valen también para el `404` y el `500`. Un `CORS_ORIGINS`
  mal escrito (`CORS_ORIGINS=,,`) cierra la API en lugar de abrirla. Si algún día
  la sesión pasa a cookies, habrá que sustituir el comodín por la lista blanca
  y añadir `Allow-Credentials` y protección CSRF.

## D-049 — El servicio de Render debe arrancar la API, no `npm start` de la raíz

- **Contexto:** el servicio `socracia` seguía sirviendo el cliente web después
  de fusionar `render.yaml` (D-046). La causa no era el repositorio: el servicio
  se creó a mano y, sin _Start Command_, Render ejecuta `npm start`, que en la
  raíz del monorepo delega en `@socracia/mobile` y arranca `expo start`. El HTML
  servido lo delataba: pedía `index.ts.bundle?platform=web&dev=true`, un bundle
  que solo genera el servidor de desarrollo de Expo.
- **Decisión:** el servicio debe arrancar con `node apps/api/dist/index.js`, bien
  corrigiendo el servicio actual (Settings → Build & Deploy), bien creándolo
  desde `render.yaml` como Blueprint.
- **Motivos:** `render.yaml` **no** modifica servicios creados a mano; solo lo
  leen los servicios de tipo Blueprint. Sin entender esto, se sigue empujando
  commits esperando un cambio que no puede ocurrir: el comando de arranque no
  está en el repositorio.
- **Alternativas descartadas:** (a) cambiar el `start` de la raíz para que
  arranque la API: rompe el flujo de desarrollo documentado (`npm start` arranca
  la app, que es lo que se espera al clonar el repositorio) y afecta a todos los
  workspaces; (b) dejar el servicio como está: el cliente web seguiría en la URL
  del backend.
- **Consecuencias:** la URL del servicio se conserva con la opción A; con la
  opción B cambia si cambia el nombre del Blueprint, y entonces hay que
  actualizar `EXPO_PUBLIC_API_BASE_URL` en EAS. Queda documentado en
  `docs/backend.md` con los valores exactos de los tres campos.

## D-050 — Los workflows de EAS viven en `.eas/workflows`, no en `.github/workflows`

- **Contexto:** la pestaña _Workflows_ del panel de Expo salía vacía. El
  repositorio tenía dos workflows en `.github/workflows/`, que es otra
  tecnología: los ejecuta GitHub Actions. EAS lee `.eas/workflows/*.yml`, al
  mismo nivel que `eas.json` —aquí `apps/mobile/`, porque el monorepo tiene el
  `eas.json` ahí—. No existía ese directorio, así que no había nada que listar.
- **Decisión:** añadir `apps/mobile/.eas/workflows/build-production.yml`, que
  compila Android o iOS con el perfil elegido, lanzable a mano.
- **Motivos:** compilar desde el panel de Expo no depende de que el token de
  Expo esté en los secretos de GitHub. El flujo `.github/workflows/eas-build.yml`
  sigue existiendo para quien prefiera lanzarlo desde Actions, pero exige
  `EXPO_TOKEN` como secreto del repositorio.
- **Alternativas descartadas:** (a) ampliar el workflow de GitHub Actions: no
  llena la pestaña de EAS, porque son sistemas distintos; (b) hacer que el
  workflow de EAS envíe también a tiendas: gasta créditos de envío por
  accidente, y el envío debe ser una acción deliberada (D-042).
- **Consecuencias:** el workflow solo compila. El envío a tiendas sigue siendo
  manual (`eas submit`) o vía el flujo de GitHub Actions con `enviar: true`.

## D-051 — El entorno de compilación se declara explícito en `eas.json`

- **Contexto:** un job `build` de EAS sin `environment` lo infiere del perfil, y
  sin `environment` en el perfil el criterio es: `production` si `distribution`
  es `store`, `preview` en el resto de casos. Los perfiles `preview` y
  `production` no declaraban el campo, así que un build de preview habría caído
  en el entorno `preview`, donde `EXPO_PUBLIC_API_BASE_URL` no existe (solo está
  en `production`): el binario habría salido apuntando a `localhost:8787` sin
  ningún aviso, y el fallo solo se vería al usar la app en un teléfono.
- **Decisión:** declarar `environment: preview` y `environment: production` en
  los perfiles correspondientes de `eas.json`, y añadir una prueba que lo exige.
- **Motivos:** el valor por defecto es correcto hoy para `production` por el
  criterio de `distribution`, pero depende de un detalle implícito que un cambio
  futuro en el perfil rompería en silencio. Declararlo lo hace explícito.
- **Alternativas descartadas:** copiar la variable al entorno `preview`: duplica
  la configuración y permite que las dos copias diverjan.
- **Consecuencias:** el build de preview usa el entorno `preview`, que hoy no
  tiene variables, así que hereda la URL por defecto. Si se quiere probar el
  preview contra el backend real, hay que añadir la variable a ese entorno.

## D-052 — El APK instalable sale del perfil `preview`, no de `production`

- **Contexto:** el perfil `production` genera un `.aab` (`buildType:
app-bundle`), que es el formato que Google Play exige **para subir**, no un
  instalador: Android no lo abre desde el teléfono. Un `.aab` descargado no
  instala nada, y confundirlo con un fallo de descarga lleva a buscar el
  problema en el navegador o en el artefacto, donde no está. El artefacto se
  descarga bien (52,4 MB, ZIP válido, firmado v1) y contiene la URL de
  producción correcta.
- **Decisión:** para instalar en un teléfono se compila el perfil `preview`
  (`buildType: apk`), que produce un APK firmado con el esquema v2/v3
  (`APK Sig Block 42`), instalable directamente. El `.aab` se reserva para la
  subida a Play.
- **Motivos:** cada formato sirve a un destinatario distinto. Mezclarlos
  produce el fallo más confuso posible: un fichero correcto que «no hace nada».
- **Alternativas descartadas:** instalar el `.aab` con `bundletool` y generar
  APKs por dispositivo: añade una herramienta y un paso manual para algo que el
  perfil `preview` ya resuelve en un comando.
- **Consecuencias:** el entorno `preview` **sí** tiene
  `EXPO_PUBLIC_API_BASE_URL=https://socracia.onrender.com`. D-051 lo daba por
  vacío; se ha añadido porque, sin ella, el APK de prueba apuntaba a
  `localhost:8787` y no había forma de probarlo contra el backend real. La
  alternativa que D-051 descartaba era depender de esa copia para el build de
  tienda; aquí el uso es distinto (prueba manual) y está verificado: el APK
  contiene `socracia.onrender.com` y cero referencias a `localhost`.
- **Verificación:** `build:view` del APK da `finished`; el fichero tiene
  `com.socracia.app`, versión `0.1.0` y firma v2/v3.

## D-053 — Multitenencia por base compartida con `tenant_id` y RLS

- **Fecha:** Sprint 0 (multitenencia)
- **Contexto:** el producto pasa de un usuario único a organizaciones cliente
  (academias, institutos, docentes) con marca, usuarios y contenidos propios. Hay
  que elegir entre una base por tenant y una base compartida.
- **Decisión:** **base compartida con `tenant_id` en cada tabla y Row-Level
  Security de Postgres**. La instancia dedicada queda disponible **solo por
  configuración**, sin bifurcar el código.
- **Motivos:** el plan gratuito de Neon da 100 proyectos de 1 GB, y una base por
  tenant multiplica las migraciones, las copias y el consumo de cómputo (cada
  proyecto con actividad gasta de su propia bolsa de 100 CU-horas). Con RLS, el
  aislamiento lo impone el motor, no una condición `WHERE` que alguien puede
  olvidar. La prueba de fugas puede atacarlo directamente.
- **Alternativas descartadas:** (a) una base por tenant: aísla más, pero el coste
  operativo crece con cada cliente y el plan gratuito lo hace inviable a partir
  de unos pocos; (b) filtrar solo en la aplicación con `WHERE tenant_id = ?`:
  un `WHERE` olvidado filtra datos ajenos en silencio, y no hay segunda barrera.
- **Consecuencias:** toda consulta corre dentro de un contexto de tenant
  (`AsyncLocalStorage`); RLS es la red de seguridad, no la única defensa. El
  aislamiento híbrido significa que activar una instancia dedicada es un cambio
  de configuración, no de arquitectura.

## D-054 — El tenant se resuelve por código de academia, no por subdominio

- **Fecha:** Sprint 0 (multitenencia)
- **Contexto:** hay que decidir cómo sabe el servidor a qué organización
  pertenece una petición.
- **Decisión:** el tenant se resuelve por **código de academia** enviado por el
  cliente (cabecera o ruta) y, en el inicio de sesión, por el propio usuario. No
  se usan subdominios comodín.
- **Motivos:** los subdominios comodín no son gratuitos de forma fiable y atan el
  producto al proveedor de DNS. El plan de coste cero prohíbe depender de algo
  que puede dejar de ser gratis sin aviso (regla 5). Un código es gratis,
  verificable y funciona igual en la app móvil, donde no hay subdominios.
- **Alternativas descartadas:** (a) subdominio por tenant
  (`academia.socracia.es`): exige certificado comodín o uno por subdominio, y
  ninguno es fiablemente gratuito; (b) un tenant por ruta en la web
  (`/t/academia`): funciona, pero deja el código de academia a la vista y no
  resuelve el caso móvil, que es el principal.
- **Consecuencias:** el código de academia es un identificador público, no un
  secreto: la autorización la da la sesión, no conocer el código. Los dominios
  propios por cliente quedan para más adelante, cuando haya clientes que los
  paguen.

## D-055 — Migración: la multitenencia se añade apagada

- **Fecha:** Sprint 0 (multitenencia)
- **Contexto:** hay una app funcionando con usuario único y progreso local. Hay
  que convertirla en plataforma sin romperla.
- **Decisión:** **compatibilidad total**. Todo lo nuevo va detrás de
  `MULTITENANT` (apagado por defecto, se enciende con `MULTITENANT=on`). Sin la
  variable, la app se comporta **exactamente** como hoy, con un **tenant por
  defecto** implícito. Las firmas públicas de `packages/core` no cambian y los
  tests existentes pasan sin modificarse.
- **Motivos:** el modo actual es el que está publicado y probado. Una migración
  que obliga a reescribir los tests no se puede verificar: no se sabría si un
  fallo es nuevo o un artefacto del cambio.
- **Alternativas descartadas:** (a) migración de golpe con `tenant_id`
  obligatorio: rompe el modo local-first, que es el que hace la app útil sin
  cuenta ni conexión; (b) dos códigos base (uno mono-tenant y otro multi):
  duplica el mantenimiento y garantiza que se separen.
- **Consecuencias:** la multitenencia avanza por sprints sin dejar `main` roto. El
  tenant por defecto no es un caso especial del código: es el tenant que se usa
  cuando nadie ha resuelto otro.

## D-056 — Postgres gratuito: Neon, no Supabase ni Render

- **Fecha:** Sprint 0 (multitenencia)
- **Contexto:** hace falta una base de datos que quepa en el principio de coste
  cero, con RLS para el aislamiento de D-053.
- **Decisión:** **Neon Postgres, plan Free**. Detalle de límites en
  `docs/free-stack.md`, verificado el 2026-10-30.
- **Motivos:** 1 GB por proyecto (el doble que Supabase), 100 CU-horas con
  escalado a cero —solo se paga cómputo mientras hay consultas—, sin tarjeta y
  sin caducidad. El escalado a cero no es una pausa: el proyecto vuelve a
  responder en milisegundos, mientras que Supabase **pausa el proyecto tras una
  semana de inactividad** y hay que reactivarlo desde el panel.
- **Alternativas descartadas:** (a) **Postgres gratuito de Render**: «expire 30
  days after creation»; caduca, y la regla 3 lo prohíbe expresamente; (b)
  **Supabase**: 500 MB y solo 2 proyectos activos, con pausa semanal; queda como
  alternativa documentada por si en el futuro pesa más su autenticación
  integrada, ya que el puerto de repositorio permite cambiar sin tocar el
  dominio; (c) **SQLite en el servidor**: el plan gratuito de Render pierde el
  sistema de ficheros en cada suspensión, así que no hay dónde guardarlo.
- **Consecuencias:** el cómputo se agota a las 100 CU-horas/mes por proyecto y el
  almacenamiento a 1 GB. Ambos límites tienen comportamiento degradado probado
  (Sprint 1) y presupuesto por tenant (regla 4). El pool de conexiones debe ser
  pequeño y reconectar tras la suspensión del cómputo.

## D-057 — El LLM es BYOK por tenant; la plataforma no asume el coste

- **Fecha:** Sprint 0 (multitenencia)
- **Contexto:** el motor mayéutico con modelo es la pieza principal del producto,
  pero una clave de plataforma compartida por todos los tenants tiene un coste
  que crece con cada cliente y no cabe en el plan gratuito de ningún proveedor.
- **Decisión:** **cada organización aporta su propia clave** (BYOK), de un
  proveedor con plan gratuito. La clave se cifra en reposo con AES-GCM
  (`node:crypto`) y una clave maestra en variable de entorno. La ruta
  `/llm/complete` **se amplía**, no se duplica: gana cuotas, límite de tasa y
  consumo medido por usuario y por tenant.
- **Motivos:** la plataforma no puede asumir un coste que no controla, y el
  principio de coste cero exige que ninguna pieza dependa de una tarjeta. BYOK
  traslada el consumo al tenant, que ya paga su propio plan gratuito.
- **Alternativas descartadas:** (a) clave de plataforma compartida: un solo
  tenant abusivo agota la cuota de todos; (b) proxy nuevo junto al actual:
  duplica la lógica de validación y de consentimiento, que ya existe.
- **Consecuencias:** al agotar la cuota, la ruta responde `429` (ya lo hace
  `statusFor`), la app cae a la heurística y la sesión no se rompe. Queda
  **pendiente de decisión humana** el apartado de privacidad: algunos planes
  gratuitos usan el contenido para mejorar sus productos, y con datos de alumnos
  —posiblemente menores— eso exige bloquear el modo LLM salvo autorización
  explícita del administrador, con la heurística por defecto. La facturación es
  solo un puerto con adaptador simulado; la pasarela real queda documentada como
  opcional.

## D-058 — Gemini prevalece: el proveedor semántico manda y el motor LLM queda como respaldo

- **Fecha:** reparación de `main` (posterior al Sprint 0 multitenante)
- **Contexto:** la fusión de la rama de Gemini (`c3c23b8`, `e7ee6ee`) conservó los
  **tests** del diseño de Gemini pero revirtió su **código**. `main` quedó con dos
  diseños incompatibles de `StudyService` y `MayeuticSessionEngine` a la vez: el
  contrato de Gemini (`answer` devuelve `Result`, sesión con `documents`,
  `submit(text, latency, now, assessment?)`) y el contrato del módulo LLM
  (`answer` devuelve `SessionTurn`, `submitAsync`, `usesModel`, `questionGenerator`,
  `retrievePassages`). El resultado: `npm run verify` fallaba con 4 suites del
  módulo LLM y el ajuste de privacidad roto.
- **Decisión:** **el proveedor semántico de Gemini es el motor principal** y su
  contrato de dominio prevalece. El módulo LLM **no se elimina**: se conserva como
  respaldo inyectable, con `submitAsync`, el evaluador, el generador y las
  explicaciones intactos. Los dos diseños **coexisten** en vez de elegir uno.
- **Motivos:** el usuario indicó que «Gemini prevalece operativa y funcionalmente».
  Eliminar el módulo LLM habría borrado 12 suites verdes y capacidades ya
  publicadas (evaluación con pasajes, repreguntas y explicaciones por modelo);
  conservarlo como respaldo no cuesta complejidad en el camino principal, porque
  solo se activa cuando falta el proveedor semántico.
- **Alternativas descartadas:** (a) restaurar Gemini y borrar el módulo LLM: pierde
  funcionalidad ya probada y contraviene «no reescribir lo que funciona»; (b) dejar
  el diseño LLM como principal e ignorar los tests de Gemini: deja rojo el ajuste
  de privacidad y niega la indicación del usuario; (c) mantener ambos caminos
  duplicando `StudyService`: dos fuentes de verdad para el mismo dominio.
- **Consecuencias:** un solo `StudyService.answer` devuelve `Result<SessionTurn,
StudyError>`; el orden de preferencia es proveedor semántico → evaluador LLM
  (`submitAsync`) → heurística local. `ActiveStudySession` lleva `documents`
  (para localizar la fuente) y `usesModel` (para elegir el camino). La convención
  de commits pasa a distinguir el modo estricto (rangos, `--message-file`) del de
  auditoría (`--all`, informa sin bloquear), porque los tres incumplimientos ya
  están fusionados en `main` y reescribirlos está prohibido.

## D-059 — La APK de 1.0 se genera con un perfil de EAS que extiende de producción

- **Fecha:** Sprint de cierre de 1.0 (2026-11-04)
- **Contexto:** la entrega de 1.0 exige un APK instalable para probar en
  dispositivo, pero el perfil `production` genera un **AAB** (`app-bundle`),
  que Google Play consume y un teléfono no instala directamente. Los perfiles
  `development` y `preview` sí generan APK, pero con `developmentClient` o sin el
  canal de producción, y no son lo que se quiere entregar como build de
  lanzamiento.
- **Decisión:** se añade el perfil **`release-apk`** que **extiende de
  `production`** (`extends: "production"`) y solo cambia lo necesario:
  `distribution: "internal"` y `android.buildType: "apk"`. Hereda el canal de
  producción, la versión remota y `autoIncrement: true`.
- **Motivos:** extender de `production` mantiene una sola fuente de verdad para
  el canal y la numeración; el APK de lanzamiento no es una configuración
  paralela que pueda divergir. `distribution: "internal"` evita cualquier envío a
  tienda: el artefacto es para instalación directa. El `versionCode` sigue
  gestionado por EAS en remoto (`appVersionSource: "remote"`), como exige el
  alcance de 1.0; no se toca a mano.
- **Alternativas descartadas:** (a) reutilizar `preview`: no comparte canal con
  producción y arrastra su configuración de previsualización; (b) cambiar
  `production` a APK: rompería la entrega a Google Play, que exige AAB;
  (c) generar el APK solo en local con `docs/build-apk-local.md`: válido como
  respaldo, pero no es «APK generado por EAS», que es lo que pide la puerta G7.
- **Consecuencias:** `eas build --profile release-apk --platform android` produce
  un APK de lanzamiento. La prueba `buildConfig.test.ts` fija que el perfil
  extiende de producción, distribuye internamente y genera APK, para que un
  cambio futuro no lo degrade en silencio. El primer keystore de Android no se
  puede generar en modo no interactivo (issue de `eas-cli`), así que la primera
  compilación exige un paso humano: ver `docs/release-1.0-smoke.md`.

## D-060 — Las evals de G3 se ejecutan contra el backend real, sin clave en el cliente

- **Fecha:** cierre de 1.0 (2026-11-05)
- **Contexto:** la puerta G3 exige evals contra el proveedor semántico **real**
  (≥ 30 casos, concordancia de veredicto ≥ 80 %, 0 citas inventadas, ≥ 90 % de
  paráfrasis correctas aceptadas). Las 32 evals del repositorio corren con
  respuestas **simuladas**: miden la robustez del motor, no la calidad del modelo
  real, así que no cuentan para G3. Faltaba un arnés que llamara al proveedor.
- **Decisión:** se añade `scripts/eval-real.mjs` (`npm run eval:real`), que
  ejercita el backend real (`/mayeutic/generate` y `/mayeutic/evaluate`), no la
  API del proveedor. El script **no contiene ninguna clave**: crea una cuenta de
  prueba efímera, llama al backend y la borra al terminar. La clave del proveedor
  vive solo en el servidor, coherente con D-057/D-058.
- **Motivos:** llamar al backend y no a Gemini directamente reproduce el camino
  de producción (autenticación, validación de entrada, adaptador) y mantiene el
  principio de coste cero y de «ninguna clave en el cliente». Además, el script
  distingue «proveedor no disponible» (503/502 → G3 **no verificada**) de «por
  debajo del umbral» (→ G3 **fallida**), que son diagnósticos distintos.
- **Alternativas descartadas:** (a) llamar a la API del proveedor desde el
  script: exigiría una clave en el entorno de ejecución y duplicaría el adaptador;
  (b) ampliar las evals simuladas: seguirían sin ser evidencia real.
- **Consecuencias:** el adaptador del backend (`apps/api/src/mayeutic.ts`) ahora
  **propaga el mensaje de error del proveedor** en su respuesta (antes solo decía
  «respondió 400»), para que un fallo de clave o de modelo sea diagnosticable sin
  acceso a los logs del servidor. La clave del proveedor nunca se incluye en el
  mensaje. G3 se cierra ejecutando `npm run eval:real` contra el backend con el
  proveedor configurado.

## D-061 — El bloqueo de G3 es de créditos del proyecto de Gemini, no de código

- **Fecha:** cierre de 1.0 (2026-11-05)
- **Contexto:** tras habilitar la facturación en el proyecto de Gemini, se probó
  una clave **válida** (autentica contra `generativelanguage.googleapis.com` y
  lista 50 modelos, `gemini-3.8-flash` incluido) directamente contra la API
  oficial, tanto por el endpoint compatible con OpenAI como por
  `generateContent`. **Toda** llamada devuelve **HTTP 402
  `RESOURCE_EXHAUSTED`**: «Your prepayment credits are depleted… manage your
  project and billing».
- **Decisión:** se registra que la causa raíz del bloqueo de G3 es la **ausencia
  de créditos en el proyecto de Gemini** (el paso a prepago con 0 créditos
  sustituye a la cuota gratuita), no un defecto del cliente, del cuerpo de la
  petición ni de la forma de la clave. El backend de Render, además, sigue
  sirviendo el código viejo (su mensaje no incluye el detalle del proveedor),
  así que su `400` y el `402` real conviven hasta que se despliegue D-060.
- **Motivos:** sin esta distinción, el siguiente intento volvería a confundir un
  problema de facturación/cuota con un bug de integración. La calibración contra
  Gemini confirma que el cuerpo que envía el backend pasa la validación de forma
  (un `temperature`/`max_tokens` fuera de rango se rechaza antes que la clave).
- **Alternativas descartadas:** (a) tocar el umbral o el prompt para «pasar» G3:
  no produce evidencia real; (b) llamar a la API desde el script con una clave en
  el entorno: rompe D-060 y el principio de «ninguna clave en el cliente».
- **Consecuencias:** G3 sigue **no verificada** y bloquea el GO. Desbloqueo
  (humano): cargar créditos de prepago en el proyecto de Gemini, o usar una clave
  de un proyecto **sin** facturación (nivel gratuito), configurarla como
  `GEMINI_API_KEY` en Render y desplegar el backend con la propagación de error
  (D-060); después, `npm run eval:real`.

## D-062 — Ningún modelo gratuito desbloquea G3: el 402 es del proyecto, no del modelo

- **Fecha:** cierre de 1.0 (2026-11-05)
- **Contexto:** tras habilitar la facturación, se pidió «introducir un modelo
  gratuito» para la misma clave. Se probaron **los 47 modelos** que la clave
  puede listar (todos los que soportan `generateContent`: Gemini 2.0, 2.5, 3.x,
  Flash/Pro/Flash-Lite, `gemini-3.8-flash`, `gemma-4-*`, embeddings…), por el
  endpoint compatible con OpenAI, por `generateContent` nativo y por
  `v1`/`v1beta`, con `Authorization: Bearer` y con `x-goog-api-key`. **Los 47
  devuelven el mismo `HTTP 402 RESOURCE_EXHAUSTED`**: «Your prepayment credits
  are depleted». La cuota y los límites son **por proyecto, no por clave ni por
  modelo** (docs oficiales de rate-limits/billing).
- **Decisión:** no se cambia el modelo por defecto para «esquivar» el 402: el
  modelo por defecto (`gemini-3.8-flash`) **ya es de nivel gratuito** según la
  tabla oficial de precios (input y output «Free of charge»). El bloqueo es el
  **estado de facturación del proyecto**: habilitar la facturación lo pasó a
  prepago con **0 créditos**, y ese estado desactiva **también** el nivel
  gratuito. Ningún nombre de modelo puede saltarse un bloqueo de proyecto.
- **Motivos:** cambiar el modelo sería un cambio de código inútil (y arriesgado)
  que no aborda la causa. La documentación oficial es explícita: para volver al
  nivel gratuito hay que **desactivar la facturación** del proyecto; para seguir
  con facturación, hay que **cargar créditos de prepago**.
- **Alternativas descartadas:** (a) bajar a un modelo «más barato» o de otra
  familia: probado, da el mismo 402; (b) usar `gemma` (gratuito por completo):
  probado, mismo 402; (c) poner la clave en el cliente: rompe D-057/D-058.
- **Consecuencias:** G3 sigue **no verificada**. Desbloqueo (humano, una de las
  dos): **(a)** desactivar la facturación del proyecto de Gemini para recuperar
  el nivel gratuito (<https://docs.cloud.google.com/billing/docs/how-to/modify-project#disable_billing_for_a_project>),
  o **(b)** cargar créditos de prepago en AI Studio. Después: configurar la clave
  en Render, desplegar el backend con la propagación de error (D-060) y ejecutar
  `npm run eval:real`. El modelo por defecto no requiere cambios.

## D-063 — El proveedor rota entre modelos gratuitos y tolera salidas irregulares

- **Fecha:** cierre de 1.0 (2026-11-06)
- **Contexto:** tras desactivar la facturación (recuperando el nivel gratuito de
  Gemini), la clave vuelve a responder. Al ejecutar el arnés de G3 se observaron
  dos hechos del nivel gratuito: **(1)** el límite es **por modelo** —~5
  peticiones por minuto y ~20 por día— así que 33 casos agotan enseguida un solo
  modelo; **(2)** `gemini-3.8-flash` devuelve **503 «high demand»** de forma
  sistemática, y `gemini-3.5-flash-lite` devuelve a veces un **array suelto** en
  vez de `{questions:[…]}`.
- **Decisión:**
  1. **Rotación de modelos.** `GeminiMayeuticService` usa una **lista** de
     modelos (`GEMINI_MODEL` + `GEMINI_MODELS`, con respaldos gratuitos por
     defecto: `gemini-3.5-flash-lite`, `gemini-3.1-flash-lite`). Solo cambia de
     modelo ante fallos de **cuota o disponibilidad** (429/500/502/503 o error de
     red); un error de formato o de datos no se reintenta con otro modelo. Modelo
     por defecto: `gemini-3.6-flash` (responde y respeta el esquema).
  2. **Parseo tolerante.** `readQuestionDrafts` acepta `{questions:[…]}` o un
     array suelto, y **descarta solo la pregunta mal formada** en vez de tumbar el
     lote entero. `providerErrorDetail` desenvuelve el error que el endpoint
     OpenAI-compatible devuelve **dentro de un array** (`[{error:{…}}]`), sin lo
     cual el motivo —y la pista de reintento— se perdía.
  3. **Arnés con ritmo y reintento.** `scripts/eval-real.mjs` espacia los casos
     (`PACE_MS`) y reintenta ante 429/503; ante un límite **diario** (espera
     > 60 s) se detiene y deja la puerta «no verificada» en vez de esperar en vano.
- **Motivos:** el nivel gratuito exige repartir la carga entre varios modelos
  para sostener una sesión real sin coste; la tolerancia evita perder respuestas
  válidas por la envoltura o por una sola pregunta defectuosa. Todo respeta el
  principio de «la heurística es el respaldo» y no introduce dependencias.
- **Alternativas descartadas:** (a) subir a un plan de pago: rompe la regla de
  coste cero; (b) fijar un solo modelo: agota su cuota diaria en una sesión;
  (c) rechazar el lote entero ante una pregunta inválida: pérdida innecesaria.
- **Consecuencias:** **G3 queda verificada con el proveedor real** (30 casos de
  evaluación + 3 de generación): concordancia de veredicto **83.3 %** (≥ 80 %),
  paráfrasis correctas **100 %** (≥ 90 %), **0** citas inventadas. Evidencia:
  `docs/release-1.0-g3-evidence.txt`. El motor sigue funcionando con la heurística
  cuando no hay clave, no hay red o se agota la cuota (D-043, D-058).

## D-064 — El proveedor semántico evalúa, pero el enriquecimiento del turno sigue su curso

- **Fecha:** Sprint 5 (módulo LLM como motor principal)
- **Contexto:** con el proveedor semántico (Gemini) como motor principal, `StudyService.answer`
  obtenía la evaluación del proveedor y luego llamaba a `engine.submit(text, latency, now, assessment)`.
  `submit` es el camino **síncrono** y **no** ejecuta `enrichTurn`, que es el único punto
  donde se piden la repregunta (`followUp`) y la explicación (`explainer`) al modelo. La
  consecuencia: justo cuando el documento estaba autorizado y el modelo disponible, el
  alumno **perdía** la repregunta redactada y la explicación, que `docs/llm-engine.md`
  promete. La paradoja era que el recorrido **sin** autorización (heurístico, vía
  `submitAsync`) sí las pedía. Ninguna prueba lo cubría: `npm run verify` seguía verde con
  el fallo presente.
- **Decisión:** el enriquecimiento del turno es **independiente de quién evalúa**. Tanto si
  el veredicto viene del proveedor semántico como del evaluador LLM o de la heurística, el
  turno pasa por `submitAsync`, que es el único camino que llama a `enrichTurn`. Para no
  evaluar dos veces, `submitAsync` acepta el `assessment` ya obtenido y, si viene, respeta
  su juicio sin volver a pedirlo al modelo. `submit` queda como camino síncrono puro y sin
  modelo: se le retira el parámetro `assessment` para que no pueda volver a desactivar el
  enriquecimiento en silencio.
- **Motivos:** el diseño de `docs/llm-engine.md` separa dos responsabilidades —decidir el
  veredicto y mejorar el texto del turno— y el bug las había acoplado por accidente. Con el
  arreglo, el orden de preferencia de D-058 se mantiene intacto y solo se restaura la
  capacidad que se había perdido. El coste es una llamada más por turno con fallo, y solo
  cuando el motor está activo; sin modelo no se pide nada.
- **Alternativas descartadas:** (a) dejar que `submit` llame también a `enrichTurn`:
  convierte un método síncrono en asíncrono y obliga a cambiar a todos sus llamantes
  (pruebas incluidas) por un caso que ya cubre `submitAsync`; (b) enriquecer en
  `StudyService.answer` en lugar del motor: saca del motor una decisión que es suya y
  duplica la lógica de umbral de fallos; (c) no hacer nada: mantiene una capacidad
  anunciada en la documentación que no llega nunca al alumno.
- **Consecuencias:** `MayeuticSessionEngine.submitAsync(text, latencyMs, now, assessment?)`
  gana un cuarto parámetro opcional; `submit(text, latencyMs, now)` pierde el suyo. La
  prueba de regresión vive en `packages/core/src/__tests__/studyService.test.ts` (bloque
  «el proveedor semántico no desactiva el enriquecimiento») y se comprobó que falla con el
  código anterior y pasa con el arreglo.

## D-065 — La explicación del modelo llega a la vista: se cierra el camino D-064

- **Fecha:** Sprint 5 (módulo LLM como motor principal)
- **Contexto:** el arreglo de D-064 devolvió al motor la capacidad de pedir la
  explicación. Al verificar el recorrido completo apareció el último eslabón roto
  del mismo camino: `SessionController.buildView` construía `StudyViewState` sin
  copiar `turn.explanation`, y el contrato de la vista ni siquiera tenía ese campo.
  La explicación se producía, se descartaba y el alumno no la veía nunca; ninguna
  prueba lo cubría porque todas comprobaban el turno del motor, no la vista.
- **Decisión:** `StudyViewState` incorpora `explanation: string | null` y
  `buildView` lo rellena desde `turn.explanation`. La pantalla de estudio pinta un
  bloque «Explicación» cuando el campo no es nulo, con el mismo tratamiento visual
  que el feedback y el andamiaje.
- **Motivos:** el contrato de la vista es el único punto por el que el estado del
  motor llega a la interfaz. Si un dato del turno no está ahí, no existe para el
  alumno, por bien que lo calcule el núcleo. Declarar el campo como obligatorio
  (aunque nullable) hace que el compilador impida volver a olvidarlo: quitar la
  asignación en `buildView` rompe la compilación.
- **Alternativas descartadas:** (a) pasar `SessionTurn` entero a la vista: filtra
  detalle interno del motor y acopla la UI al núcleo; (b) mostrar la explicación
  dentro del feedback existente: mezcla dos textos con propósitos distintos
  (corrección inmediata frente a explicación tras fallos repetidos).
- **Consecuencias:** dos pruebas nuevas fijan el comportamiento en ambos extremos
  del camino: `sessionController.test.ts` comprueba que la vista lleva la
  explicación y `StudyScreen.test.tsx` que la pantalla la pinta. Ambas se
  verificaron en los dos sentidos: fallan sin el arreglo y pasan con él.
  `npm run verify` queda en 548 pruebas (321 core, 56 api, 171 móvil).

## D-066 — Identidad visual clara y oscura, y visibilidad del motor en la app

- **Fecha:** Sprint 5 (identidad visual y experiencia de 1.0)
- **Contexto:** la app tenía una sola paleta (oscura) fijada en `app.json`
  (`userInterfaceStyle: "dark"`) y los colores vivían en `theme/tokens.ts` como
  un único objeto. Además, el motor semántico podía degradar a la heurística sin
  que el usuario supiera quién estaba respondiendo ni por qué; una degradación
  silenciosa es indistinguible de «la IA funciona mal».
- **Decisión:** (1) `tokens.ts` define dos temas completos (`lightTheme` y
  `darkTheme`) con los mismos nombres de color, y `ThemeProvider` resuelve el
  activo a partir de la preferencia (`system`/`light`/`dark`, persistida en
  `app_meta`). (2) `app.json` pasa a `userInterfaceStyle: "automatic"`. (3) La
  pantalla de estudio muestra una insignia (`EngineBadge`) que indica «IA
  semántica» o «Modo local» y, al pulsarla, explica el motivo exacto de la
  degradación con una acción para resolverla.
- **Motivos:** una identidad clara y oscura es requisito de producto, no un
  adorno, y debe seguir la preferencia del sistema sin reiniciar. Sobre el motor,
  el usuario tiene derecho a saber quién responde a su pregunta; el motivo
  mostrado es la primera causa accionable (sin backend → sin cuenta → nube
  desactivada → documento sin permiso → sin conexión → servidor despertando →
  cuota → error), calculada por una función pura (`describeEngineStatus`) que se
  prueba en Node.
- **Alternativas descartadas:** (a) dos ficheros de tokens y dos `useTheme`
  distintos: duplicaría cada `StyleSheet`; (b) mostrar el estado del motor solo
  en Ajustes: lo aleja del momento en que importa (la pregunta en pantalla); (c)
  un tercer tema «alto contraste»: fuera del alcance de 1.0.
- **Consecuencias:** ninguna firma pública del dominio cambia; todo el cambio
  vive en `apps/mobile` (presentación, configuración y cableado). Los pares de
  color se verifican con una prueba que recalcula el contraste WCAG real
  (`themeContrast.test.ts`), y otra (`themeTokens.test.ts`) impide que aparezca
  un color literal fuera de `theme/tokens.ts`. La elección de tema, el estado del
  onboarding y el consentimiento por documento se guardan en `app_meta` y se
  rehidratan al arrancar.

## D-067 — El modo conectado se activa en el perfil de build, no en la cuenta de EAS

- **Fecha:** introducción del motor semántico en el build de 1.0 (2026-11-08)
- **Contexto:** el motor mayéutico con modelo (Gemini) estaba **implementado y
  cableado** desde el Sprint 4/5 (D-043, D-057, D-058): `packages/core/src/llm/`,
  `apps/mobile/src/services/llmEngine.ts`, `apps/api/src/mayeutic.ts`, la insignia
  `EngineBadge` y el ajuste «Cuenta → Privacidad». Pero el build de EAS corría
  **siempre en modo heurístico local**: el log del build mostraba que el entorno
  `production` solo cargaba `EXPO_PUBLIC_API_BASE_URL`, sin
  `EXPO_PUBLIC_CLOUD_PROCESSING`. `CLOUD_PROCESSING_AVAILABLE` se calcula de
  `process.env.EXPO_PUBLIC_CLOUD_PROCESSING === '1'`, así que el APK nacía sin
  motor: el ajuste de nube ni aparecía y todo se evaluaba con la heurística. El
  motor existía en el código y no llegaba nunca al usuario.
- **Decisión:** declarar `env: { EXPO_PUBLIC_CLOUD_PROCESSING: "1" }` en el
  perfil **`production`** de `eas.json` (fuente única; `release-apk` lo hereda por
  `extends`, D-059). La variable se resuelve en el repositorio, no en la cuenta de
  Expo, de modo que el modo conectado es reproducible y queda bajo control de
  versiones. Una prueba (`buildConfig.test.ts`) fija que el APK de lanzamiento
  resuelve la variable a `1`, para que un cambio futuro no lo degrade en silencio.
- **Motivos:** `EXPO_PUBLIC_*` no son secretos (se incrustan en el bundle) y su
  lugar natural para un valor que se commitea es el `env` del perfil, como indica
  la documentación de `eas.json`. Ponerlo en la cuenta de EAS lo dejaría fuera del
  repositorio, sin prueba que lo proteja y dependiente de un paso manual. El
  **motor sigue siendo opcional en ejecución**: la variable solo hace que la app
  _ofrezca_ el modo conectado; para que responda el modelo hacen falta además
  sesión iniciada, ajuste en «allow-cloud» y consentimiento por documento
  (D-043/D-058). Sin esas condiciones, la heurística responde igual que antes.
- **Alternativas descartadas:** (a) `eas env:create --environment production`:
  requiere cuenta de Expo e interactividad, y no queda en el repositorio; (b)
  poner la variable solo en `release-apk`: rompe la fuente única de D-059 y
  dejaría `production` (AAB de tienda) sin motor; (c) una `.env` versionada: EAS
  no la lee para builds remotos (debe estar en `.gitignore`), así que no tendría
  efecto.
- **Consecuencias:** el APK de lanzamiento ofrece el modo conectado. Sigue siendo
  **opt-in** y local-first por defecto: nada sale del dispositivo sin que el
  usuario inicie sesión y lo autorice. El backend debe tener una clave de
  proveedor válida (`/health` → `provider.configured: true`) para que el motor
  responda; si no, la app degrada a la heurística con el motivo visible. Como el
  build declara la capacidad de transmitir, las declaraciones de tienda y la
  política de privacidad ya la describen (D-044); no cambian por esta decisión.

## D-068 — G3 no se declara cumplida sin evidencia reproducible

- **Fecha:** re-verificación de release 1.0 (2026-11-08)
- **Contexto:** dictámenes previos daban **G3 por cumplida** con la evidencia de
  `docs/release-1.0-g3-evidence.txt` (83.3 % de concordancia, 100 % de paráfrasis,
  0 citas inventadas). Al re-ejecutar el arnés `npm run eval:real` contra el
  backend desplegado (`https://socracia.onrender.com`), este responde
  **400 «Please pass a valid API key»**: la clave del proveedor configurada en
  Render ya no es válida (revocada, agotada o reemplazada). La evidencia histórica
  no se ha podido **reproducir**.
- **Decisión:** la puerta G3 se marca **«no verificada»** y **bloquea el GO**.
  Una puerta no se da por cumplida por evidencia histórica que no puede repetirse
  hoy. La evidencia previa se conserva como registro, pero el dictamen vigente
  refleja el estado real.
- **Motivos:** la misión exige distinguir «probado con proveedor falso» de
  «validado con proveedor real» y no declarar 1.0 sin G3 real. Declarar GO con una
  evidencia no reproducible sería deshonesto. El backend responde
  `provider.configured: true` en `/health` (la variable existe), pero la clave
  **no autentica**: `configured` no implica `valid`.
- **Consecuencias:** el camino crítico a 1.0 empieza por reponer una clave de
  proveedor **válida** (nivel gratuito, coste cero) **solo en el servidor** y
  repetir `npm run eval:real`. Mientras tanto, el motor degrada a la heurística
  (probada en G4) y la app sigue funcionando local-first. No se toca el umbral de
  G3 ni se activa nada nuevo.
- **Alternativas descartadas:** (a) dar G3 por buena con la evidencia previa: viola
  la honestidad exigida; (b) poner una clave en el cliente o en el repositorio:
  prohibido por la misión y por la política de privacidad (D-044); (c) bajar los
  umbrales: no resuelve la causa (clave inválida) y debilita la puerta.

## D-069 — `DATA_FILE` en una ruta escribible del contenedor

- **Fecha:** verificación de operatividad (2026-11-08)
- **Contexto:** al probar el backend desplegado (`https://socracia-api.onrender.com`)
  con una cuenta real, `/auth/register` y `/sync/pull` respondían correctamente,
  pero el primer `/sync/push` devolvía
  **500 `EACCES: permission denied, mkdir '/var/data'`**. El `render.yaml`
  declaraba `DATA_FILE=/var/data/progreso.json`: `/var/data` es la ruta del
  **disco persistente**, que el plan gratuito **no admite ni crea**. El proceso no
  es root, así que `mkdir -p /var/data` falla.
- **Decisión:** mover `DATA_FILE` a `/tmp/progreso.json`, una ruta escribible del
  contenedor en el plan gratuito. La durabilidad es la misma que el plan permite
  (se pierde al reiniciar, igual que el almacén en memoria), pero la
  sincronización deja de fallar.
- **Motivos:** la misión pide dejar Render operativo. Un backend que responde 500
  en la ruta de sincronización no está operativo. La corrección es de una línea en
  configuración, no toca código ni firmas, y no introduce coste.
- **Consecuencias:** para persistencia real hay que subir a plan `starter` y
  descomentar el bloque `disk` de `render.yaml`, restaurando
  `DATA_FILE=/var/data/progreso.json`. Queda anotado en el propio `render.yaml`.
- **Alternativas descartadas:** (a) dejar `/var/data`: rompe la sincronización;
  (b) ejecutar el proceso como root: peor práctica de seguridad y no permitido por
  el runtime; (c) subir a plan de pago: viola «coste cero».

## D-070 — El OCR se ejecuta en el servidor, tras el puerto `OcrPort`

- **Fecha:** cierre de 1.0 (2026-11-04)
- **Contexto:** la ingesta solo leía texto de PDF con capa de texto, TXT y MD. Una
  **imagen** o un **PDF escaneado** no tenían camino: el extractor devolvía
  `pdf-sin-texto` y la importación fallaba. Se pedía una APK «con OCR ejecutable y
  resolutivo», sin introducir dependencias nuevas ni claves en el cliente.
- **Decisión:** el OCR vive en el **servidor**, detrás de un puerto puro del
  núcleo (`OcrPort` en `packages/core/src/ingest/ocr.ts`). El backend lo
  implementa con el mismo proveedor multimodal que el motor mayéutico (Gemini),
  reutilizando la clave que ya está solo en el servidor. La app lo consume por
  `HttpOcrPort` a través de la ruta `POST /mayeutic/ocr` (exige sesión). El texto
  reconocido entra en el **mismo** pipeline de ingesta que un PDF con texto, vía
  `DocumentIngestionService.ingestText`, que no duplica el indexado.
- **Motivos:** (a) coste cero: reutiliza la clave y el nivel gratuito que ya usa
  el motor; (b) sin dependencias de producción nuevas en el móvil (nada de
  `mlkit`/`tesseract` nativo, que engordaría el APK y exigiría módulos nativos);
  (c) coherencia con la arquitectura existente (mismo patrón que
  `MayeuticSemanticProvider` y `EmbeddingProvider`); (d) privacidad: la imagen
  sale del dispositivo **solo** con el consentimiento de nube ya existente
  (mismas condiciones que el motor: build con backend, sesión y ajuste en
  `allow-cloud`), y el servidor no la conserva.
- **Consecuencias:** importar una imagen o un PDF escaneado exige sesión y
  consentimiento; sin ellos, la app avisa con un mensaje claro
  (`ocr-no-disponible`) en vez de fallar en silencio. El texto reconocido se
  indexa en local como cualquier documento. Se actualizan la política de
  privacidad (apartado 2.3.1), las declaraciones de tienda y las pruebas
  (`ocr.test.ts` en núcleo y API, `ocrPort.test.ts` y `ocrImport.test.ts` en el
  móvil). `/health` expone `ocr.configured` sin revelar secretos.
- **Alternativas descartadas:** (a) OCR nativo on-device: añade dependencia de
  producción y peso al APK, y la misión pide coste cero y mínimo cambio; (b)
  OCR en el cliente contra Gemini con la clave embebida: prohibido (clave en el
  cliente); (c) dejar las imágenes sin soporte: incumple el objetivo de la APK
  «con OCR».

## D-071 — El perfil `preview` fija el backend y el modo conectado

- **Fecha:** cierre de 1.0 (2026-11-04)
- **Contexto:** el perfil `preview` de `eas.json` (APK de distribución interna,
  el que se usa para probar en dispositivo) no declaraba `env`, así que el bundle
  caía en `DEFAULT_API_BASE_URL` (`http://localhost:8787`) y
  `CLOUD_PROCESSING_AVAILABLE` quedaba en `false`. Es decir, el APK de preview no
  hablaba con el backend real ni ofrecía el motor ni el OCR: servía solo para el
  modo heurístico local.
- **Decisión:** declarar en `preview` las mismas variables que en `production`:
  `EXPO_PUBLIC_API_BASE_URL=https://socracia.onrender.com` y
  `EXPO_PUBLIC_CLOUD_PROCESSING=1`. El perfil `release-apk` sigue heredando de
  `production` (D-059) y no cambia. Las variables `EXPO_PUBLIC_*` **no son
  secretos** (se incrustan en el bundle), así que van en el repositorio y quedan
  bajo control de versiones, como en D-067.
- **Motivos:** el APK de preview es el vehículo de la prueba en dispositivo
  (`docs/release-1.0-smoke.md`); sin backend ni motor, el smoke test no puede
  ejercer el modo conectado ni el OCR. Fijarlo en el perfil evita un paso manual
  de variables de entorno y hace la build reproducible.
- **Consecuencias:** el APK de `preview` ofrece motor y OCR (siempre opt-in: sin
  sesión y sin consentimiento, nada sale del dispositivo). La prueba
  `easWorkflows.test.ts` ya fija que cada perfil que compila resuelve un entorno
  con URL de backend; `buildConfig.test.ts` fija que el APK de lanzamiento activa
  el motor.
- **Alternativas descartadas:** (a) dejar `preview` sin `env`: obliga a pasar las
  variables a mano y el APK nace inservible para la prueba real; (b) usar la
  cuenta de EAS (`eas env:create`): no queda en el repositorio y exige
  interactividad (mismo motivo que en D-067).

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

### Abiertas por la multitenencia (con sprint asignado)

- **Catálogo de contenidos: ¿por comunidad autónoma o único?** (Sprint 4). Hay que
  preguntar antes de modelarlo: cambia la clave del catálogo base y cómo se
  etiqueta el temario PAU. **No bloquea el Sprint 0.**
- **Privacidad del LLM con datos de alumnos** (Sprint 6). Algunos planes gratuitos
  usan el contenido para mejorar sus productos. Con posibles menores, el modo LLM
  debe quedar **bloqueado por defecto** (heurística) salvo autorización explícita
  del administrador del tenant. Requiere **revisión humana** de qué proveedor
  admite datos de alumnos. **No bloquea el Sprint 0.**
- **Facturación:** solo el puerto con adaptador simulado; la pasarela real queda
  documentada como opcional (Sprint 6).
- **Legal:** política de privacidad, términos, contrato de encargado del
  tratamiento y consentimientos de menores quedan «pendiente de revisión humana»
  (Sprint 9).
- **Numeración de decisiones:** el enunciado pedía empezar en D-048, pero ese
  número y los cuatro siguientes ya están tomados (D-048 a D-052). Este sprint
  empieza en **D-053** para no colisionar con el PR #14, que reclama D-050 a
  D-052. Desviación deliberada y documentada.
- **Dependencias de producción nuevas:** el Sprint 0 **no introduce ninguna**
  (solo documentación y decisiones), así que no hay decisión de dependencia que
  registrar todavía. La primera llegará con el adaptador de Postgres (Sprint 1) y
  ya tiene su comparativa gratuita en D-056.

## D-072 — El fallo del proveedor semántico degrada a la heurística sin romper la sesión

- **Fecha:** cierre de 1.0 (2026-11-10)
- **Contexto:** la app promete (D-058, `docs/llm-engine.md`) que el proveedor
  semántico es el motor principal y la heurística la red de seguridad. Pero
  `StudyService.answer` y `StudyService.generateForConcepts` **abortaban** la
  sesión con `evaluacion-fallida`/`generacion-fallida` ante cualquier fallo del
  proveedor (red, cuota agotada o salida inválida). El resultado contradice la
  puerta F2 y la propia documentación: un corte de red a mitad de una sesión
  autorizada dejaba al alumno con un error en pantalla en vez de seguir
  estudiando en local. La insignia tampoco lo reflejaba: `providerIssue` se
  derivaba solo del sondeo `/health`, que sigue diciendo `configured: true`
  aunque la clave ya no sirva, de modo que la degradación era **silenciosa**
  (contradice D-066).
- **Decisión:** se añade la opción `degradeOnProviderFailure` a
  `StudyServiceOptions`, **por defecto `false`** (el núcleo conserva su contrato
  estricto y su prueba de «no avanza si falla la evaluación semántica»). La app
  de 1.0 la activa en `withLlmEngine`. Con la opción activa: (1) si falla la
  evaluación semántica, se evalúa con la heurística y el turno lleva
  `degraded: true`; (2) si falla la generación semántica, se conservan las
  preguntas por plantillas ya obtenidas. El turno degradado viaja hasta la vista
  (`StudyViewState.degraded`) y la pantalla de estudio lo traduce a
  `providerIssue: 'error'`, de modo que la insignia deja de afirmar «IA
  semántica» y explica el motivo.
- **Motivos:** la puerta F2 exige que ningún fallo del proveedor rompa la
  sesión, y D-066 exige que la degradación nunca sea silenciosa. Una opción con
  valor por defecto que preserva el contrato anterior permite cumplir ambas sin
  cambiar firmas públicas ni tocar las pruebas existentes (regla de cambio
  mínimo): el único test que fijaba el aborto sigue verde porque no activa la
  opción.
- **Alternativas descartadas:** (a) cambiar el comportamiento por defecto y
  reescribir el test del aborto: viola «los tests existentes pasan sin tocarse»;
  (b) degradar en el adaptador del móvil en lugar del núcleo: duplicaría la
  decisión y dejaría al núcleo sin poder ofrecer el modo tolerante a fallos que
  el propio backend necesita; (c) inferir la degradación solo desde `/health`:
  no distingue «configurado» de «respondiendo», que es justo el fallo que se
  corrige.
- **Consecuencias:** `SessionTurn` gana `degraded?: boolean` (opcional, ausente
  equivale a `false`) y `StudyViewState` gana `degraded: boolean`. Tres pruebas
  nuevas en `packages/core/src/__tests__/studyService.test.ts` cubren la
  evaluación tolerante, la generación tolerante y el contrato estricto sin la
  opción; una en `apps/mobile/src/__tests__/studyEngineBadge.test.tsx` fija que
  un proveedor caído no deja la pantalla en error. `npm run verify` queda en 644
  pruebas (351 core, 66 api, 227 móvil).

## D-073 — La app respeta las áreas seguras del sistema (edge-to-edge obligatorio)

- **Fecha:** cierre de 1.0 (2026-11-11)
- **Contexto:** el APK de 1.0 se instaló en un Android real y resultó **no
  operativo**: la barra de estado tapaba la cabecera y la barra de navegación
  tapaba la barra de pestañas. La causa es D-041: al retirar
  `android.edgeToEdgeEnabled` «porque ya no existe» en el esquema de SDK 58, el
  edge-to-edge pasó a ser **siempre obligatorio** (Android 16), pero nunca se
  añadió el manejo de insets. La app pintaba a pantalla completa sin reservar
  las zonas de las barras del sistema, de modo que los controles quedaban bajo
  ellas y no se podían pulsar. Ninguna prueba lo detectaba: Jest no tiene
  geometría de sistema y el recorrido dorado monta las pantallas sueltas, sin el
  chasis de `App.tsx` que coloca la barra de pestañas.
- **Decisión:** añadir `react-native-safe-area-context` (versión que fija Expo,
  `~5.11.1`) y envolver la app en `SafeAreaProvider`; `AppShell` aplica el inset
  superior al contenido (o al banner degradado, si lo hay) y el inferior a la
  barra de pestañas, y `BootScreen` usa `SafeAreaView`. Es un cambio de
  presentación: no toca firmas públicas, ni el núcleo, ni las pantallas (que
  siguen siendo componentes puros montables en Jest).
- **Motivos:** es la solución estándar del ecosistema y la única que respeta las
  barras en todos los dispositivos y orientaciones sin hardcodear alturas. Hacer
  el ajuste en el chasis, y no en cada pantalla, evita repetir el error cuando
  se añada una pantalla nueva.
- **Alternativas descartadas:** (a) `paddingTop` fijo con `StatusBar.currentHeight`:
  no cubre la barra de navegación inferior ni los recortes de pantalla, y se
  rompe en landscape; (b) restaurar `android.edgeToEdgeEnabled: false`: el campo
  ya no existe en el esquema (D-041) y Android 16 lo ignora; (c) ajustar cada
  pantalla por separado: duplica el cálculo y deja fuera a las futuras.
- **Consecuencias:** nueva dependencia de runtime `react-native-safe-area-context`
  (transitiva habitual de Expo, sin coste). `apps/mobile/src/__tests__/safeArea.test.tsx`
  fija el contrato: monta `App` completo, cierra el onboarding y comprueba que el
  inset inferior llega a la barra de pestañas y el superior al contenido. Es la
  única prueba de la suite que dobla un módulo nativo (la geometría del sistema
  no existe en Node); el doble se justifica en el propio fichero. `npm run verify`
  queda en 649 pruebas (355 core, 66 api, 228 móvil). El APK anterior
  (`b19ef0a8…`) queda **obsoleto** para la UX: hay que recompilarlo.

## D-074 — Un temario con el encabezado pegado a su párrafo y un temario en forma de índice sí son material evaluable

- **Fecha:** cierre de 1.0 (2026-11-04)
- **Contexto:** al adjuntar un temario y pulsar «Estudiar», la app respondía «El
  temario no contiene conceptos evaluables. Revisa el documento.»
  (`studyService.ts`). El origen estaba en `extractCurriculum`
  (`ingest/conceptExtractor.ts`), que devolvía cero conceptos por dos defectos
  independientes: (1) usaba `normalizeText` del RAG, que une con espacios las
  líneas de un mismo párrafo; un temario **sin línea en blanco** entre el
  encabezado y su cuerpo —lo habitual al copiar de un PDF o un TXT compacto—
  perdía todos los encabezados y quedaba como un bloque único, y (2) un temario
  en **forma de índice** (solo epígrafes, sin cuerpo), que es la acepción literal
  de «temario» en una oposición, no aportaba definiciones «X es…» y producía cero
  conceptos aunque el documento sí tuviera temas. Además, las viñetas de lista se
  arrastraban a la etiqueta del concepto («- El Estado social»).
- **Decisión:** `extractCurriculum` deja de usar `normalizeText` y normaliza el
  texto conservando la frontera de los encabezados y retirando el marcador de
  viñeta (`normalizeForStructure`). Solo separa como párrafo propio los
  encabezados inequívocos (`isStructuralHeading`: marcador de tema, `#` de
  Markdown y línea corta en mayúsculas); **no** la numeración suelta (`1. …`),
  que dentro de un tema es casi siempre un elemento de lista. `splitSections`
  conserva los encabezados sin cuerpo, y si el documento entero no produjo
  ningún concepto se activa un respaldo acotado que convierte cada epígrafe en un
  concepto con sus términos clave. El respaldo solo actúa cuando el documento no
  aportó ninguna definición, así que nunca añade ruido a un temario ya cubierto.
- **Motivos:** el fallo dejaba la app inservible con la forma de temario más
  común (encabezados sin línea en blanco e índices), que es justo lo que la app
  promete leer. La corrección es de dominio puro (sin tocar firmas públicas) y la
  protegen pruebas nuevas en `conceptExtractor.test.ts` y en el recorrido de
  interfaz `goldenPath.e2e.test.tsx`.
- **Alternativas descartadas:** (a) relajar el error de `studyService` para
  permitir sesiones sin conceptos: oculta el defecto en lugar de corregirlo y
  dejaría la sesión sin nada que preguntar; (b) separar también la numeración
  suelta como encabezado: parte los párrafos que contienen listas numeradas
  (regresión detectada y descartada); (c) activar el respaldo de índice siempre:
  competiría con las definiciones reales y duplicaría conceptos.
- **Consecuencias:** `npm run verify` queda en 654 pruebas (359 core, 66 api, 229
  móvil). El APK debe recompilarse para incorporar el arreglo. Los artefactos
  muertos `conceptualization.js` y `documentStructure.js` de `packages/core/dist`
  (de un intento previo de conceptualización por modelo, sin fuente en `src`) se
  eliminan al reconstruir limpio; no están versionados (`dist/` está en
  `.gitignore`).

## D-075 — El backend sirve la repregunta y la explicación del modelo por `/llm/complete`

- **Fecha:** cierre de 1.0, motor mayéutico sobre el RAG (2026-11-11)
- **Contexto:** el objetivo de 1.0 es que el modelo **actúe en modo mayéutica
  sobre el RAG**. El recorrido estaba cableado (D-043, D-057, D-058): la app pide
  la repregunta (`followUp`) y la explicación (`explainer`) al modelo a través de
  `POST /llm/complete`. Pero `apps/api/src/server.ts` construía las dependencias
  con `llm: null` **hardcodeado** y no existía ninguna implementación de
  `LlmProvider` en `apps/api`. La ruta respondía **503 `no-configurado`**, así que
  en la APK real la repregunta caía a las plantillas del RAG y la explicación
  quedaba en `null`: el alumno **nunca** recibía el texto del modelo. Justo lo
  contrario de lo que promete `docs/llm-engine.md`. Ninguna prueba lo cubría
  porque las suites usaban un proveedor inyectado (falso) y la de integración
  solo comprobaba el 503.
- **Decisión:** se añade `apps/api/src/llmProvider.ts`, que construye un
  `OpenAiCompatProvider` del núcleo apuntando al endpoint OpenAI-compatible de
  Gemini (`https://generativelanguage.googleapis.com/v1beta/openai`), envuelto en
  `ResilientLlmProvider` (timeout, reintentos, cortocircuito, presupuesto) y
  cableado en `defaultDependencies()`. Sin `GEMINI_API_KEY` devuelve `null` y la
  ruta sigue respondiendo 503, con la app degradando a la heurística. No se toca
  ninguna firma pública ni la ruta `/mayeutic/*` (generación y evaluación).
- **Motivos:** se reutiliza el adaptador que ya existe en el núcleo en vez de
  escribir otro; Gemini expone el mismo dialecto de chat, así que no hace falta un
  cliente nuevo. La clave sigue viviendo **solo** en el servidor. El cambio es de
  composición (una fábrica y una línea en `defaultDependencies`), no de dominio,
  así que no altera el contrato del motor ni rompe pruebas existentes.
- **Alternativas descartadas:** (a) cablear el módulo LLM en el **cliente**
  apuntando directo a Gemini: pondría la clave en el bundle, prohibido por D-044;
  (b) ampliar `/mayeutic/*` para servir también repregunta y explicación: mezcla
  dos dialectos y duplica la ruta que ya existe; (c) dejar el 503 y conformarse
  con las plantillas: incumple el objetivo declarado de 1.0.
- **Consecuencias:** con `GEMINI_API_KEY` válida en el servidor, la repregunta y
  la explicación pasan a redactarse con el modelo; sin ella, el comportamiento no
  cambia. La evidencia real de estas dos rutas exige el backend **desplegado con
  esta versión**; hasta entonces quedan «probadas con proveedor falso», no
  «validadas con proveedor real». Además se sube `max_tokens` de 1200 a 2400 en
  `mayeutic.ts` (1200 truncaba el JSON de tres preguntas y provocaba un 502 de
  formato) y se permite **rotar de modelo** ante un JSON inválido, no solo ante
  cuota o indisponibilidad.

## D-076 — Un índice con epígrafes cortos y una lista numerada de enunciados también son material evaluable

- **Fecha:** cierre de 1.0 (2026-11-04)
- **Contexto:** tras D-074 seguía habiendo documentos **con texto** que devolvían
  cero conceptos y, al pulsar «Estudiar», el mensaje «El temario no contiene
  conceptos evaluables». El respaldo de índice de `extractCurriculum`
  (`ingest/conceptExtractor.ts`) exigía **ocho caracteres** de etiqueta
  (`MIN_INDEX_LABEL_CHARS`), así que descartaba epígrafes legítimos y cortos
  («Tema 1. Ley», «Tema 2. Fe», «Tema 3. Paz») y dejaba el temario vacío. Además,
  un documento en forma de **lista numerada de enunciados** (`1. …`, `2. …`) sin
  encabezados reconocibles no aportaba ni definiciones «X es…» ni epígrafes, y
  también daba cero conceptos.
- **Decisión:** el respaldo de índice deja de contar caracteres y comprueba que
  la etiqueta tenga **alguna palabra con contenido** (`hasMeaningfulWord`),
  excluyendo el título genérico «Temario» y las palabras funcionales. Los términos
  clave del concepto se toman del epígrafe y, si este no aporta ninguno («Fe»), del
  cuerpo o de las palabras del propio título (`indexKeywords`): sin ellos la
  pregunta no tendría señal con la que puntuar y el filtro de trivialidad la
  descartaría. Si el tema no tiene epígrafe utilizable, se deriva un concepto de su
  **primera oración con contenido** (`conceptFromBody`), que cubre la lista
  numerada y el texto sin encabezados.
- **Motivos:** el fallo dejaba la app inservible con la forma de temario más común
  en una oposición —el índice de epígrafes— y con las listas numeradas. La
  corrección es de dominio puro, sin tocar firmas públicas, y la protegen cuatro
  pruebas nuevas en `conceptExtractor.test.ts`.
- **Alternativas descartadas:** (a) bajar `MIN_INDEX_LABEL_CHARS` a un valor fijo
  pequeño: seguiría descartando por longitud y no distinguiría un epígrafe real de
  un resto de numeración; (b) relajar el error de `studyService`: oculta el defecto
  en vez de corregirlo; (c) admitir cualquier título como concepto: colaría el
  título por defecto «Temario» y restos de numeración.
- **Consecuencias:** `npm run verify` queda en 662 pruebas (363 core, 70 api, 229
  móvil), con las evals del motor 32/32. El APK debe recompilarse para incorporar
  el arreglo (el de EAS sigue siendo anterior a D-074/D-075/D-076).
