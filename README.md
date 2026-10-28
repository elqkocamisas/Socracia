# Socracia

App móvil de autoaprendizaje basada en la **mayéutica**, para temarios reglados
(oposiciones, PAU y similares).

En lugar de mostrar teoría y tests, Socracia formula preguntas guiadas sobre el
material del propio usuario, evalúa las respuestas, detecta lagunas y construye
un itinerario de asimilación progresiva del conocimiento.

## Estado

Sprints 0–3 completados. El Sprint 0 dejó las fundaciones y el dominio base; el
Sprint 1, el motor mayéutico completo (extracción de conceptos, generación de
preguntas no triviales, itinerario progresivo, andamiaje y motor de sesión); el
Sprint 2, la ingesta de documentos (PDF, TXT y MD) con RAG on-device,
persistencia local en SQLite y la pantalla de importación; y el Sprint 3, la
conversación guiada y la pantalla de progreso con repetición espaciada. El
recorrido **adjuntar documento → responder preguntas → ver progreso** funciona
de principio a fin. Ver `docs/architecture.md` para el alcance por sprint.

## Stack

- **App:** React Native + Expo (SDK 58) + TypeScript estricto.
- **Dominio:** `packages/core`, TypeScript puro, sin dependencias de plataforma.
- **RAG:** on-device por defecto (ver `docs/rag-strategy.md`).
- **Almacenamiento local:** SQLite (`expo-sqlite`) para documentos y progreso.
- **Pruebas:** Jest (dominio) y jest-expo (UI).

## Estructura

```
apps/mobile       # Expo + React Native + TypeScript
packages/core     # dominio: RAG, motor mayéutico, evaluación, lagunas, repaso
docs/             # arquitectura, estrategia RAG, registro de decisiones
.openhands/       # setup del entorno
```

## Puesta en marcha

```bash
npm install        # instala workspaces y compila @socracia/core
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

## Documentación

- [`docs/architecture.md`](docs/architecture.md) — arquitectura y flujo mayéutico.
- [`docs/rag-strategy.md`](docs/rag-strategy.md) — RAG local vs backend y decisión.
- [`docs/decisions.md`](docs/decisions.md) — registro de decisiones.

## Privacidad

El material del usuario se procesa en el dispositivo por defecto. El modo nube
es explícito y consentido por documento. La app muestra siempre la fuente del
conocimiento y permite al usuario gestionar y borrar sus documentos.

## Licencia

Uso privado. Sin licencia de distribución.
