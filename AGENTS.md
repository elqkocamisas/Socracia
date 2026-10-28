# AGENTS.md — Socracia

Memoria del repositorio para agentes. Mantener actualizado al cerrar cada sprint.

## Qué es

App móvil de autoaprendizaje por mayéutica para temarios reglados (oposiciones,
PAU). RAG sobre documentos del usuario, preguntas guiadas, detección de lagunas
y repetición espaciada. Target: iOS y Android (App Store / Google Play).

## Stack y estructura

- **Monorepo npm workspaces.** `apps/mobile` (Expo + RN + TS) y
  `packages/core` (dominio puro TS).
- **`packages/core` no puede importar nada de React Native ni de Expo.** Toda la
  lógica crítica vive ahí y se prueba en Node.
- `apps/mobile` consume `@socracia/core` por workspace (`"@socracia/core": "*"`).
- Metro está configurado para monorepo (`apps/mobile/metro.config.js`).

## Comandos

```bash
npm install            # instala y compila core (postinstall)
npm run verify         # lint + typecheck + test  ← antes de commitear
npm test               # Jest en core y jest-expo en mobile
npm run typecheck
npm run lint
npm run format         # Prettier
npm run start          # Expo
```

## Convenciones

- **Idioma:** identificadores y código en inglés; textos de UI, comentarios y
  documentación en español.
- **Estilo:** Prettier (`printWidth: 100`, comillas simples, coma final). No
  discutir formato: ejecutar `npm run format`.
- **TS estricto:** `strict`, `noUncheckedIndexedAccess`, `noUnusedLocals`. Usar
  `?? []` o comprobaciones explícitas al indexar arrays.
- **Errores:** usar `Result<T, E>` de `core/src/result.ts` en rutas de dominio;
  excepciones solo para errores de programación.
- **Comentarios:** solo cuando expresan algo no inferible del código (invariante
  sutil, compromiso deliberado). No narrar el diff.
- **Pruebas:** sin mocks salvo necesidad justificada. Las pruebas del dominio no
  deben tocar el sistema de archivos ni la red.

## Trampas conocidas

- **`@testing-library/react-native` 14:** `render` es **asíncrono** y devuelve un
  objeto sin queries. Usar `await render(<C/>)` y luego `screen.getByText(...)`.
  No usar `const { getByText } = render(...)`.
- **ESLint 10 + typescript-eslint 8:** los archivos CommonJS (`metro.config.js`,
  `babel.config.js`, `jest.config.js`) necesitan el override con
  `sourceType: 'commonjs'` y `globals.node` de `eslint.config.mjs`.
- **`jest.config.js` en core usa CommonJS** (`module.exports`) porque `core`
  compila a CommonJS para que Jest lo consuma sin transformación.
- **Clon superficial:** el repo es shallow; usar `git fetch --unshallow` si se
  necesita historia.

## Reglas de trabajo

- Una rama por sprint (`sprint-N-<tema>`), PR a `main` al terminar.
- Tareas de más de ~100 líneas de cambio se dividen en PRs más pequeños.
- No tocar CI/CD ni secretos sin indicación expresa.
- Decisiones ambiguas: documentarlas en `docs/decisions.md` y continuar.
- Cada PR incluye: resumen, cómo probar y criterios de aceptación cubiertos.

## Documentación viva

- `docs/architecture.md` — arquitectura y diagrama del flujo mayéutico.
- `docs/rag-strategy.md` — RAG local vs backend, decisión y alternancia.
- `docs/decisions.md` — registro de decisiones (D-001…).
