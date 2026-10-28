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

## Ambigüedades pendientes (no bloqueantes)

- **Vertical inicial (oposiciones vs PAU):** se difiere al Sprint 1. El dominio
  es agnóstico; el corpus de ejemplo del Sprint 1 será de oposiciones
  (Administración) por ser el caso con temario más reglado.
- **Gestión de cuentas:** se decide en el Sprint 4. El MVP funciona sin cuenta,
  con progreso local; la cuenta solo añade sincronización.
