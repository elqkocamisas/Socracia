# Motor mayéutico con modelo

Este documento describe cómo el modelo de lenguaje entra en la app, qué papel
juega y, sobre todo, **qué ocurre cuando falla**. La regla que gobierna todo el
diseño es una: el modelo mejora el texto de la experiencia mayéutica, pero no
dirige la sesión y su fallo no la interrumpe.

## Qué hace el modelo y qué no

| Tarea                          | Con modelo                                            | Sin modelo (respaldo)                    |
| ------------------------------ | ----------------------------------------------------- | ---------------------------------------- |
| Evaluar una respuesta          | `LlmAnswerEvaluator` devuelve veredicto y puntuación  | Evaluación heurística por términos clave |
| Redactar la pregunta           | `LlmQuestionGenerator` ancla la pregunta en el pasaje | Plantillas del RAG                       |
| Repreguntar tras un fallo      | `LlmFollowUpGenerator` redacta la repregunta          | Andamiaje por plantillas                 |
| Explicar tras fallos repetidos | `LlmExplainer` con citas verificadas                  | No se ofrece: se insiste con repreguntas |

El modelo **nunca** decide el avance del itinerario, el repaso espaciado ni las
lagunas. Esas decisiones las toma el núcleo a partir del `score` y el `verdict`
que produce la evaluación, vengan del modelo o de la heurística (ver
`docs/architecture.md` y la decisión D-043).

## Capas y orden de envoltura

El proveedor se compone como una cebolla. El orden es deliberado:

```
ConsentGatedLlmProvider        ← capa externa: comprueba el permiso en cada llamada
  └─ ResilientLlmProvider      ← timeout, reintentos, cortocircuito, presupuesto
       └─ LlmHttpProvider      ← única capa que toca la red
```

- El **consentimiento** va por fuera de la resiliencia. Si fuera por dentro,
  revocar el permiso seguiría sirviendo respuestas guardadas en la caché de
  resiliencia, que es exactamente lo que no debe ocurrir. Además, una llamada
  denegada no llega a la capa de resiliencia, así que no consume reintentos ni
  presupuesto.
- El consentimiento se lee **en el momento de cada llamada**, no al construir el
  proveedor. Revocar el permiso en Ajustes surte efecto de inmediato sin
  reiniciar la app.

## Cómo se activa

El motor es el principal **solo** si se cumplen dos condiciones:

1. El build tiene backend de corpus (`EXPO_PUBLIC_CLOUD_PROCESSING=1`).
2. El usuario ha autorizado el procesamiento en la nube en Ajustes.

`apps/mobile/src/services/llmEngine.ts` compone los puertos y
`apps/mobile/src/services/appServices.ts` los inyecta en `StudyServiceOptions`.
Si falta cualquiera de las dos condiciones, `llm` es `null` y el servicio usa su
camino heurístico sin que se toque una sola firma pública.

Con backend, el proveedor móvil pide la compleción al servidor con el token de
sesión; la clave del proveedor de LLM vive **solo** en el backend y nunca viaja
en el binario. El token se lee en cada llamada desde el almacén de credenciales
(`LlmHttpProvider.loadToken`), así que iniciar sesión activa el motor y cerrarla
lo desactiva sin reconstruir los servicios.

## Qué sale del dispositivo

Nada, salvo que el usuario lo autorice. Lo que viaja al backend es:

- El fragmento del temario que respalda la pregunta (su cita), nunca el
  documento completo.
- La pregunta y la respuesta del alumno, para evaluarla.
- La tarea y los límites de longitud; el `maxTokens` lo acota el servidor, no el
  cliente.

El guardián `assertProcessingAllowed` de la ingesta impide además que un
documento se suba en modo solo-dispositivo. Ver `docs/rag-strategy.md`.

## Validación de la salida del modelo

El modelo es una fuente no fiable. Cada `parse*` valida campo a campo y descarta
lo que no cumple:

- **Evaluación:** el veredicto debe ser uno de los cuatro admitidos y la
  puntuación estar en `[0, 1]`. Un juicio mal formado se rechaza y el motor
  evalúa con la heurística.
- **Generación:** `move` y `level` deben pertenecer a sus catálogos; la
  dificultad, estar en rango; y la pregunta debe superar el mismo filtro de
  trivialidad que las plantillas. Un modelo que devuelva una pregunta de puro
  recuerdo no cuela.
- **Seguimiento:** la repregunta se compara con la respuesta esperada; si la
  revela, se descarta y se usa la plantilla. Es preferible perder una repregunta
  buena que aceptar una que resuelva el ejercicio.
- **Explicación:** las citas deben corresponder a pasajes realmente enviados. Una
  cita inventada invalida la explicación. El texto explica; no crea hechos.

## Evaluación (evals)

El conjunto de casos vive en `packages/core/src/llm/__evals__/dataset.ts` y se
ejecuta de dos formas:

```
npm run eval:llm          # informe por categoría
npm test                  # la suite incluye los evals
```

Son 32 casos en cinco categorías (`evaluacion`, `generacion`, `seguimiento`,
`explicacion`, `degradacion`). No miden la inteligencia del modelo —eso depende
del proveedor— sino la **robustez del motor** ante lo que un modelo real hace:
JSON roto, veredictos inventados, puntuaciones fuera de rango, repreguntas que
revelan la respuesta o citas que no existen. Un caso pasa si el motor acepta lo
utilizable y rechaza lo inseguro sin lanzar nunca.

Salida esperada en verde:

```
evals del motor — 32/32 (evaluacion: 9/9, degradacion: 4/4, generacion: 8/8, seguimiento: 6/6, explicacion: 5/5)
```

Al cambiar un prompt o un validador, este informe es lo primero que se revisa.

## Archivos

| Archivo                                       | Responsabilidad                                 |
| --------------------------------------------- | ----------------------------------------------- |
| `packages/core/src/llm/types.ts`              | Puertos y tipos del proveedor                   |
| `packages/core/src/llm/prompts.ts`            | Plantillas y delimitadores de datos             |
| `packages/core/src/llm/json.ts`               | Validadores de campo                            |
| `packages/core/src/llm/resilience.ts`         | Timeout, reintentos, cortocircuito, presupuesto |
| `packages/core/src/llm/consent.ts`            | Guardián de consentimiento                      |
| `packages/core/src/llm/evaluator.ts`          | Evaluación semántica                            |
| `packages/core/src/llm/generator.ts`          | Generación de preguntas                         |
| `packages/core/src/llm/followUp.ts`           | Repregunta redactada                            |
| `packages/core/src/llm/explainer.ts`          | Explicación con citas                           |
| `packages/core/src/llm/httpProvider.ts`       | Adaptador HTTP (compatible con OpenAI)          |
| `apps/api/src/llm.ts`                         | Ruta `POST /llm/complete`                       |
| `apps/mobile/src/services/llmHttpProvider.ts` | Cliente móvil del proveedor                     |
| `apps/mobile/src/services/llmEngine.ts`       | Composición del motor en la app                 |
| `packages/core/src/llm/__evals__/`            | Conjunto y ejecutor de evals                    |
