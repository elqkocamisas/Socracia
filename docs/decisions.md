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
