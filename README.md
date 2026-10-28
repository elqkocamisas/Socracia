# Socracia

App móvil de autoaprendizaje basada en la **mayéutica**, para temarios reglados
(oposiciones, PAU y similares).

En lugar de mostrar teoría y tests, Socracia formula preguntas guiadas sobre el
material del propio usuario, evalúa las respuestas, detecta lagunas y construye
un itinerario de asimilación progresiva del conocimiento.

## Estado

Sprints 0–4 completados. El Sprint 0 dejó las fundaciones y el dominio base; el
Sprint 1, el motor mayéutico completo (extracción de conceptos, generación de
preguntas no triviales, itinerario progresivo, andamiaje y motor de sesión); el
Sprint 2, la ingesta de documentos (PDF, TXT y MD) con RAG on-device,
persistencia local en SQLite y la pantalla de importación; el Sprint 3, la
conversación guiada y la pantalla de progreso con repetición espaciada; y el
Sprint 4, la cuenta opcional y la sincronización del progreso entre
dispositivos. El recorrido **adjuntar documento → responder preguntas → ver
progreso** funciona de principio a fin, y el progreso puede continuarse en otro
dispositivo iniciando sesión. Ver `docs/architecture.md` para el alcance por
sprint.

## Stack

- **App:** React Native + Expo (SDK 58) + TypeScript estricto.
- **Dominio:** `packages/core`, TypeScript puro, sin dependencias de plataforma.
- **RAG:** on-device por defecto (ver `docs/rag-strategy.md`).
- **Almacenamiento local:** SQLite (`expo-sqlite`) para documentos y progreso.
- **Backend:** `apps/api`, API mínima de cuentas y sincronización sobre Node
  nativo, sin dependencias de producción (ver `docs/backend.md`).
- **Pruebas:** Jest (dominio y backend) y jest-expo (UI).

## Estructura

```
apps/mobile       # Expo + React Native + TypeScript
apps/api          # API mínima de cuentas y sincronización (Node nativo)
packages/core     # dominio: RAG, motor mayéutico, evaluación, lagunas, repaso
docs/             # arquitectura, estrategia RAG, backend, registro de decisiones
.openhands/       # setup del entorno
```

## Puesta en marcha

```bash
npm install        # instala workspaces y compila core y api
npm run verify     # lint + typecheck + pruebas
npm run start      # arranca Expo (o: npm run android / npm run ios)
```

También puede ejecutarse `.openhands/setup.sh`, que automatiza los pasos
anteriores.

## Comandos

| Comando             | Descripción                     |
| ------------------- | ------------------------------- |
| `npm test`          | Pruebas de todos los workspaces |
| `npm run typecheck` | TypeScript estricto             |
| `npm run lint`      | ESLint (flat config)            |
| `npm run format`    | Prettier                        |
| `npm run verify`    | lint + typecheck + test         |
| `npm run package:source` | Entrega en `.tar.gz` sin Git |

## Documentación

- [`docs/architecture.md`](docs/architecture.md) — arquitectura y flujo mayéutico.
- [`docs/rag-strategy.md`](docs/rag-strategy.md) — RAG local vs backend y decisión.
- [`docs/backend.md`](docs/backend.md) — API de cuentas y sincronización.
- [`docs/decisions.md`](docs/decisions.md) — registro de decisiones.
- [`docs/no-git-delivery.md`](docs/no-git-delivery.md) — entrega y arranque sin Git.
- [`docs/store-release-checklist.md`](docs/store-release-checklist.md) — publicación en tiendas.

## Privacidad

El material del usuario se procesa en el dispositivo por defecto. El modo nube
es explícito y consentido por documento. La app muestra siempre la fuente del
conocimiento y permite al usuario gestionar y borrar sus documentos.

La cuenta es opcional. Sin ella, todo el progreso vive en el dispositivo. Con
ella, solo se sincroniza el progreso (respuestas evaluadas, repaso y lagunas);
los documentos y su texto nunca salen del dispositivo.

## Licencia

Uso privado. Sin licencia de distribución.
