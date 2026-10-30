# Reconocimiento para multitenencia

Informe de puntos de inserción del Sprint 0. **No cambia comportamiento**: solo
localiza dónde entra cada pieza para que los sprints siguientes no reescriban
nada.

Línea base verificada: `npm run verify` en verde, **536 pruebas** (317 + 51 + 168) sobre `b00bcee`.

---

## 1. Mapa del repositorio

```
packages/core/          dominio puro, sin dependencias de producción
  domain/types.ts       KnowledgeDocument, Concept, SocraticQuestion, Id…
  storage/ports.ts      DocumentRepository, QuestionRepository, ProgressRepository
  rag/                  engine.ts, vectorStore.ts, embeddings.ts
  mayeu/                generador de preguntas, evaluación, lagunas, itinerario
  llm/                  puertos, consentimiento, resiliencia, proveedor HTTP
  sync/                 contratos, merge puro, SyncPort
  privacy/              processingPolicy.ts
apps/api/               node:http, sin dependencias (solo @socracia/core)
  server.ts             enrutador
  auth.ts               AuthService: cuentas y sesiones EN MEMORIA
  store.ts              ProgressStore: en memoria o fichero JSON
  llm.ts                /llm/complete
  cors.ts               CORS configurable
apps/mobile/            Expo + SQLite local
  services/appServices.ts   composición de servicios
  storage/sqliteStorage.ts  repositorios SQLite
```

## 2. Puntos de inserción por sprint

### Sprint 1 — Persistencia

| Punto                | Fichero                    | Qué se hace                                                                                 |
| -------------------- | -------------------------- | ------------------------------------------------------------------------------------------- |
| Puerto de progreso   | `apps/api/src/store.ts:12` | Ya es interfaz (`ProgressStore`). Se añade adaptador Postgres sin tocar el contrato.        |
| Adaptador en memoria | `apps/api/src/store.ts:22` | Se conserva para pruebas.                                                                   |
| Adaptador JSON       | `apps/api/src/store.ts:49` | Se conserva; **no sirve en producción** (Render pierde el sistema de ficheros al dormirse). |
| Cuentas y sesiones   | `apps/api/src/auth.ts:40`  | Hoy en memoria. Se extrae a repositorio (Sprint 0 bis, punto d).                            |
| Migraciones          | _(nuevo)_                  | Versionadas y reversibles.                                                                  |

**Hallazgo que refuerza la decisión:** `render.yaml` monta `DATA_FILE` en
`/var/data`, pero el plan gratuito **no admite disco persistente** y pierde el
sistema de ficheros en cada suspensión. El progreso en JSON se evapora. La
persistencia real tiene que salir de la base de datos, no del disco.

### Sprint 2 — Núcleo de tenencia

| Punto                 | Fichero                                  | Qué se hace                                                                            |
| --------------------- | ---------------------------------------- | -------------------------------------------------------------------------------------- |
| Enrutador             | `apps/api/src/server.ts:70`              | Middleware de resolución de tenant antes del enrutado.                                 |
| Contexto por petición | _(nuevo)_                                | `AsyncLocalStorage`, sin pasar `tenantId` por parámetro.                               |
| Contratos de sync     | `packages/core/src/sync/contracts.ts:34` | `ProgressSnapshot.userId` ya existe; el aislamiento va en la tabla, no en el contrato. |

### Sprint 3 — Identidad y roles

`AuthService` (`apps/api/src/auth.ts`) gana rol y `tenantId` en la sesión. Las
rutas `/auth` y `/sync` actuales siguen funcionando bajo el tenant por defecto:
sus firmas no cambian.

### Sprint 4 — Catálogo de contenidos

| Punto             | Fichero                                    | Qué se hace                       |
| ----------------- | ------------------------------------------ | --------------------------------- |
| Índice RAG        | `packages/core/src/rag/engine.ts:41`       | Clave de caché con `tenantId`.    |
| Almacén vectorial | `packages/core/src/rag/vectorStore.ts:20`  | Filtro por tenant en la búsqueda. |
| Repositorios      | `packages/core/src/storage/ports.ts:36,68` | `tenantId` en la consulta.        |

### Sprint 6 — Pasarela LLM

| Punto                  | Fichero                               | Qué se hace                                                            |
| ---------------------- | ------------------------------------- | ---------------------------------------------------------------------- |
| Ruta existente         | `apps/api/src/llm.ts:28`              | **Se amplía**, no se duplica: cuotas, límite de tasa y consumo medido. |
| Consentimiento         | `packages/core/src/llm/consent.ts:24` | Se reutiliza; ya envuelve el proveedor y se lee en cada llamada.       |
| Cifrado de claves BYOK | _(nuevo)_                             | AES-GCM con `node:crypto`.                                             |

### Sprint 7 — Consola web

Web estática aparte, servida desde Cloudflare Pages, hablando con la misma API.
El CORS ya es configurable (`apps/api/src/cors.ts`), que es justo lo que hace
falta cuando la web vive en otro origen.

## 3. Estado de los hallazgos de la revisión (Sprint 0 bis)

| Hallazgo                              | Estado real                                                                                                                                                                                       |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| a) `Socracia-web-test.zip` en la raíz | **Confirmado.** Está versionado (`git ls-files` lo lista) y **no** hay patrón `*.zip` en `.gitignore`.                                                                                            |
| b) CORS configurable                  | **Ya hecho** (PR #12): `cors.ts` con `CORS_ORIGINS`, preflight `OPTIONS` en `server.ts:90` y `vary: Origin`. **Falta** `Cross-Origin-Resource-Policy: cross-origin`, que no aparece en el código. |
| c) Cableado del proveedor LLM         | **Confirmado.** `apps/api/src/index.ts` solo lee `PORT` y `DATA_FILE`; `deps.llm` queda `null`, así que `/llm/complete` responde `503` en el despliegue.                                          |
| d) `AuthService` en memoria           | **Confirmado.** Cuentas y sesiones en `Map` (`auth.ts:41-43`).                                                                                                                                    |

El hallazgo (b) está parcialmente resuelto, así que el Sprint 0 bis se reduce a
tres cosas: el `CORP`, el cableado del LLM y la extracción del repositorio de
cuentas.

## 4. Colisión de numeración de decisiones

`main` termina en **D-049**. El PR #14 (abierto, sin fusionar) reclama
**D-050, D-051 y D-052**. Para no chocar si ese PR se fusiona, este sprint empieza
en **D-053** y deja anotado el salto.

## 5. Riesgos detectados

1. **`JsonFileProgressStore` en producción es una pérdida silenciosa de datos.**
   Funciona en local y en las pruebas, y en Render el disco se borra al dormirse.
   Es el riesgo más alto del estado actual.
2. **El despliegue no tiene LLM.** Sin el cableado del punto (c), el motor
   principal anunciado en `docs/llm-engine.md` no está operativo en producción.
3. **Un solo fichero JSON para todos los usuarios.** Sin `tenantId` ni RLS, el
   aislamiento no existe: es lo que resuelven los Sprints 1 y 2.
4. **La suite de fugas aún no existe.** Sin ella, el aislamiento es una promesa.
   Se introduce en el Sprint 2 y se repite cada sprint.

## 6. Lo que NO se toca

- Firmas públicas de `packages/core`: los tests actuales pasan sin modificarse.
- `SyncPort` y `mergeSnapshots`: el aislamiento vive en la persistencia.
- Rutas `/auth`, `/sync`, `/llm` y `/health`: se amplían, no se sustituyen.
- Todo apagado por defecto (`MULTITENANT=on` para activarlo).
