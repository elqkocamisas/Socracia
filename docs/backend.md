# Backend mínimo y sincronización

Sprint 4. La app sigue siendo útil sin cuenta; el backend solo añade cuentas y
sincronización del progreso entre dispositivos.

## Por qué un backend mínimo

El requisito era una API ligera para cuentas y sincronización, sin
microservicios innecesarios. El backend (`apps/api`) se implementa sobre el
módulo `http` de Node, **sin dependencias de producción**: enrutado manual para
cuatro endpoints, contraseñas con `scrypt` y sal del propio Node, y almacén en
memoria o en un fichero JSON. No hay base de datos que desplegar ni framework
que auditar (D-026).

## Arquitectura

```
apps/mobile                        packages/core                 apps/api
─────────────                      ─────────────                 ────────
AccountScreen                      mergeSnapshots (pura)         server.ts (http)
  └─ AccountService          ┌────► SyncService ────┐            ├─ /auth/*
       ├─ CredentialStore    │                      │            ├─ /sync/push ─┐
       └─ HttpSyncClient ────┘                      └── SyncPort │  /sync/pull  │
            (SyncPort)                                    ▲      └──────────────┘
                                                          └── mergeSnapshots
                                                              (misma función)
```

La regla de fusión vive **una sola vez** en `@socracia/core` y la usan los dos
lados (D-024). El cliente conoce solo el puerto `SyncPort`; en el móvil lo
implementa `HttpSyncClient`, en las pruebas un servidor en memoria.

## Endpoints

| Método | Ruta             | Cuerpo                                   | Respuesta                    |
| ------ | ---------------- | ---------------------------------------- | ---------------------------- |
| GET    | `/health`        | —                                        | `{ "status": "ok" }`         |
| POST   | `/auth/register` | `{ email, password }`                    | `{ token, userId }`          |
| POST   | `/auth/login`    | `{ email, password }`                    | `{ token, userId }`          |
| POST   | `/auth/logout`   | — (con `Authorization`)                  | `{ "status": "cerrado" }`    |
| DELETE | `/account`       | — (con `Authorization`)                  | `{ "status": "eliminada" }`  |
| POST   | `/sync/push`     | `ProgressSnapshot` (con `Authorization`) | `ProgressSnapshot` fusionada |
| GET    | `/sync/pull`     | — (con `Authorization`)                  | `ProgressSnapshot` guardada  |

Autenticación por `Authorization: Bearer <token>`. Códigos de error:

- `400 datos-invalidos` — falta un campo o la instantánea no es válida.
- `401 no-autorizado` — token ausente o caducado; también credenciales inválidas.
- `409 email-en-uso` / `409 datos-invalidos` — registro rechazado.
- `404` — ruta desconocida.

## Reglas de seguridad

- **El servidor impone el `userId`.** En `/sync/push` se ignora el `userId` del
  cuerpo y se usa el de la sesión: un cliente no puede escribir el progreso de
  otro manipulando el JSON (D-027).
- **Contraseñas con `scrypt`** y sal por cuenta, comparadas en tiempo constante.
  Los tokens son aleatorios de 32 bytes y viven en memoria: al reiniciar el
  proceso las sesiones caducan.
- **Solo se sincroniza el progreso.** Los documentos y sus fragmentos nunca se
  envían al servidor.

## Sincronización

`ProgressSnapshot` es la fotografía completa del progreso: evaluaciones, estado
de repaso, sesiones y perfil de lagunas, cada entrada con su `updatedAt`. La
unidad de intercambio es la instantánea entera, no un diario de operaciones: para
el volumen del MVP es idempotente y no exige estado en el cliente.

La fusión (`mergeSnapshots`) es una función pura:

1. Cada entrada se identifica por su clave (`questionId`, `conceptId` o `id`) y
   gana la de `updatedAt` mayor (D-025).
2. Las claves se ordenan de forma estable, de modo que fusionar dos veces el
   mismo par produce el mismo resultado.
3. `gapProfile` se resuelve igual, por marca de tiempo.

Sincronizar es, por tanto, idempotente: reenviar la misma instantánea no duplica
ni pierde datos.

## Arranque

```bash
npm run build --workspace @socracia/api
PORT=8787 DATA_FILE=./datos.json npm start --workspace @socracia/api
```

- `PORT` — puerto de escucha (por defecto `8787`).
- `DATA_FILE` — ruta del JSON de progreso; si se omite, todo vive en memoria.

La app apunta al backend con `EXPO_PUBLIC_API_BASE_URL` (por defecto
`http://localhost:8787`).

### Procesamiento en la nube (opt-in)

Por defecto la app procesa todo en el dispositivo y el ajuste «Cuenta →
Privacidad» no ofrece la nube: no hay backend de corpus que la ejecute, y
enseñar un interruptor sin efecto sería un mando muerto. Para un build que sí
tenga corpus en la nube, defina `EXPO_PUBLIC_CLOUD_PROCESSING=1`; entonces la
pantalla muestra el ajuste y el usuario puede autorizarlo.

Al activar ese build, actualice en el mismo envío `store/privacy-declarations.json`
y el apartado 2.1 de `docs/privacy-policy.md`: declarar que los documentos no se
transmiten con la nube activada sería una declaración falsa ante las tiendas.

## Pruebas

- `apps/api/src/__tests__/` — unitarias de `AuthService` y `ProgressStore`, e
  integración HTTP real (servidor en puerto efímero) de los recorridos de
  cuenta, sincronización y recuperación en otro dispositivo.
- `apps/mobile/src/__tests__/accountSync.test.ts` — el cliente HTTP y el
  servicio de cuenta contra un backend efímero.

Nota: `jest-expo` sustituye `fetch` por su polyfill de React Native, que no hace
red en Node. Las pruebas del móvil inyectan un `fetch` sobre `node:http`
(`helpers/nodeFetch.ts`) para hablar HTTP de verdad.
