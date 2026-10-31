# Cómo contribuir a Socracia

Gracias por contribuir. Este documento fija las reglas para que el historial sea
legible y revisable, y para que cualquiera pueda entender un cambio sin abrir el
diff.

## Ramas

Una rama por sprint o por cambio:

```
sprint-5-calidad-tiendas
fix/arranque-backend-limpio
docs/checklist-tiendas
```

Se abre un Pull Request a `main` al terminar. No se empuja nunca directamente a
`main`.

## Commits

Se sigue [Conventional Commits](https://www.conventionalcommits.org/es/v1.0.0/):

```
<tipo>(<ámbito>): <asunto>

<cuerpo>

Sprint: <n>
```

### Tipos

| Tipo       | Cuándo                                            |
| ---------- | ------------------------------------------------- |
| `feat`     | Funcionalidad nueva para quien usa la app         |
| `fix`      | Corrección de un fallo                            |
| `docs`     | Solo documentación                                |
| `test`     | Solo pruebas                                      |
| `refactor` | Cambio interno sin alterar el comportamiento      |
| `perf`     | Mejora de rendimiento                             |
| `build`    | Dependencias, empaquetado, configuración de build |
| `ci`       | Automatización (hoy no hay CI, ver D-029)         |
| `chore`    | Tareas menores que no encajan arriba              |
| `revert`   | Revertir un commit anterior                       |

### Ámbito

Opcional, en minúsculas. Nombra la parte afectada:

```
feat(mayeu): generar preguntas socráticas desde un fragmento
fix(api): arrancar desde dist/index.js, no dist/server.js
docs(rag): comparar RAG local y en backend
```

Ámbitos habituales: `core`, `api`, `mobile`, `mayeu`, `rag`, `sync`, `ingest`,
`store`, `scripts`, `docs`.

### Asunto

- Máximo **72 caracteres**. Es lo que se ve en `git log --oneline`.
- En imperativo y en español: «arreglar el arranque», no «arreglado» ni
  «arreglando».
- Sin punto final.
- Empieza en minúscula tras los dos puntos.

### Cuerpo

- Obligatorio cuando el cambio no es obvio. Explica **por qué**, no qué (el
  diff ya dice qué).
- Separado del asunto por una línea en blanco.
- Líneas de hasta 100 caracteres, salvo URLs.
- Si el cambio corrige un fallo, describe la causa raíz y cómo lo verificaste.

### Pie

- `Sprint: <n>` para trazar el commit con el sprint en curso.
- `Closes #<n>` o `Refs #<n>` si aplica.

### Ejemplo completo

```
fix(api): arrancar desde dist/index.js, no dist/server.js

`npm start` terminaba al instante sin abrir puerto: el script ejecutaba
`dist/server.js`, que solo exporta `createApiServer` y nunca llama a `listen`.
El fichero que arranca es `dist/index.js`.

Ninguna prueba lo detectaba porque todas construyen el servidor con
`createApiServer`, no con el fichero publicado. `entrypoint.test.ts` lanza el
fichero real y espera a `/health`; falla si se revierte el arreglo.

Sprint: 5
```

## Estilo del historial

- **Un cambio lógico por commit.** Si el mensaje necesita un «y», probablemente
  son dos commits.
- Nada de «arreglos varios» ni «WIP» en `main`.
- Tareas de más de ~100 líneas de cambio se dividen en commits más pequeños.

## Código y pruebas

Antes de cada commit:

```bash
npm run verify    # lint + typecheck + pruebas de los tres workspaces
```

- Todo el código y la documentación, en español.
- La lógica de negocio crítica lleva pruebas automatizadas.
- Los mensajes de error y los textos de interfaz, en español.

## Decisiones

Si un requisito es ambiguo, **no se bloquea el cambio**: se documenta la
decisión en `docs/decisions.md` con el siguiente número `D-0NN` y se continúa.

## Seguridad

No se versiona ningún secreto: claves, certificados (`.jks`, `.p8`, `.p12`),
`play-service-account.json` ni `.env`. Están en `.gitignore`. Si se filtra uno,
hay que revocarlo y rotarlo; borrar el commit no basta.

## Validar los commits

El repositorio comprueba el formato con un validador propio:

```bash
npm run lint:commits              # revisa los commits de la rama actual
npm run lint:commits -- main..HEAD
npm run lint:commits -- --all
```

El rango (`main..HEAD`) y `--message-file` son **estrictos**: bloquean con código
de salida 1. `--all` es una **auditoría** del historial ya fusionado: informa de
los incumplimientos como advertencias, pero no bloquea, porque el historial
publicado no se reescribe.
