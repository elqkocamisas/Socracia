# Socracia

App móvil de autoaprendizaje basada en la **mayéutica**, para temarios reglados
(oposiciones, PAU y similares).

En lugar de mostrar teoría y tests, Socracia formula preguntas guiadas sobre el
material del propio usuario, evalúa las respuestas, detecta lagunas y construye
un itinerario de asimilación progresiva del conocimiento.

## Estado

Sprint 0 completado (fundaciones y dominio base) y Sprint 1 completado (motor
mayéutico completo: extracción de conceptos, generación de preguntas no
triviales, itinerario progresivo, andamiaje y motor de sesión). Ver
`docs/architecture.md` para el alcance por sprint.

## Stack

- **App:** React Native + Expo (SDK 58) + TypeScript estricto.
- **Dominio:** `packages/core`, TypeScript puro, sin dependencias de plataforma.
- **RAG:** on-device por defecto (ver `docs/rag-strategy.md`).
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
