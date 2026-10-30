import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';

import type { LlmProvider, ProgressSnapshot } from '@socracia/core';

import { AuthService, type AuthResult } from './auth';
import { routeLlmCompletion } from './llm';
import { InMemoryProgressStore, type ProgressStore } from './store';
import { isValidationError, parseSnapshot } from './validation';

/** Dependencias del servidor; inyectables para probarlo sin abrir un puerto. */
export interface ApiDependencies {
  readonly auth: AuthService;
  readonly store: ProgressStore;
  /**
   * Proveedor de lenguaje. `null` en el MVP sin clave: la ruta responde 503 y
   * la app cae a su modo local, que es el comportamiento por defecto.
   */
  readonly llm?: LlmProvider | null;
}

/** Crea las dependencias por defecto del MVP. */
export function defaultDependencies(): ApiDependencies {
  return { auth: new AuthService(), store: new InMemoryProgressStore(), llm: null };
}

const MAX_BODY_BYTES = 5 * 1024 * 1024;

/**
 * Construye el manejador de peticiones de la API.
 *
 * Es una función pura de `(petición) → (respuesta)` salvo por el estado de las
 * dependencias, así que se prueba con objetos `IncomingMessage` simulados, sin
 * sockets ni puertos.
 *
 * Rutas:
 * - `POST /auth/register` — alta de cuenta y emisión de token.
 * - `POST /auth/login`    — inicio de sesión.
 * - `POST /auth/logout`   — cierre de sesión.
 * - `DELETE /account`     — elimina la cuenta y su progreso (requisito de App Store).
 * - `POST /sync/push`     — sube la instantánea y devuelve la fusionada.
 * - `GET  /sync/pull`     — descarga la instantánea guardada.
 * - `GET  /health`        — comprobación de vida.
 */
export function createRequestHandler(
  deps: ApiDependencies,
): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  return async (req, res) => {
    try {
      await route(deps, req, res);
    } catch (error) {
      sendJson(res, 500, {
        error: 'servidor',
        message: error instanceof Error ? error.message : 'Error inesperado.',
      });
    }
  };
}

/** Servidor HTTP listo para `listen`. */
export function createApiServer(deps: ApiDependencies = defaultDependencies()): Server {
  return createServer(createRequestHandler(deps));
}

async function route(
  deps: ApiDependencies,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const method = req.method ?? 'GET';

  if (method === 'GET' && url.pathname === '/health') {
    sendJson(res, 200, { status: 'ok' });
    return;
  }

  if (method === 'POST' && url.pathname === '/auth/register') {
    const body = await readJson(req);
    if (!isRecord(body) || typeof body.email !== 'string' || typeof body.password !== 'string') {
      sendJson(res, 400, { error: 'datos-invalidos', message: 'Faltan `email` o `password`.' });
      return;
    }
    const result = await deps.auth.register(body.email, body.password);
    sendAuthResult(res, result);
    return;
  }

  if (method === 'POST' && url.pathname === '/auth/login') {
    const body = await readJson(req);
    if (!isRecord(body) || typeof body.email !== 'string' || typeof body.password !== 'string') {
      sendJson(res, 400, { error: 'datos-invalidos', message: 'Faltan `email` o `password`.' });
      return;
    }
    const result = await deps.auth.login(body.email, body.password);
    sendAuthResult(res, result);
    return;
  }

  if (method === 'POST' && url.pathname === '/auth/logout') {
    const token = bearerToken(req);
    if (token) {
      deps.auth.logout(token);
    }
    sendJson(res, 200, { status: 'cerrado' });
    return;
  }

  if (method === 'DELETE' && url.pathname === '/account') {
    const token = bearerToken(req);
    if (!token) {
      sendJson(res, 401, { error: 'no-autorizado', message: 'Falta el token de sesión.' });
      return;
    }
    // Borra credenciales y progreso: App Store exige que eliminar la cuenta
    // elimine de verdad los datos, no solo que se cierre la sesión.
    const userId = deps.auth.deleteAccount(token);
    if (!userId) {
      sendJson(res, 401, { error: 'no-autorizado', message: 'La sesión no es válida.' });
      return;
    }
    await deps.store.remove(userId);
    sendJson(res, 200, { status: 'eliminada' });
    return;
  }

  if (method === 'POST' && url.pathname === '/sync/push') {
    const userId = authenticate(deps, req, res);
    if (!userId) {
      return;
    }
    const parsed = parseSnapshot(await readJson(req));
    if (isValidationError(parsed)) {
      sendJson(res, 400, { error: 'datos-invalidos', message: parsed.message });
      return;
    }
    // El servidor ignora el `userId` del cuerpo y usa el de la sesión: un
    // usuario no puede escribir el progreso de otro aunque manipule el JSON.
    const merged = await deps.store.merge(userId, { ...parsed, userId });
    sendJson(res, 200, merged);
    return;
  }

  if (method === 'GET' && url.pathname === '/sync/pull') {
    const userId = authenticate(deps, req, res);
    if (!userId) {
      return;
    }
    const snapshot = await deps.store.get(userId);
    sendJson(res, 200, snapshot ?? emptySnapshot(userId));
    return;
  }

  // El asistente con modelo exige sesión: es un recurso con coste y no debe
  // quedar abierto. La app funciona sin él, así que 401 aquí no rompe nada.
  if (method === 'POST' && url.pathname === '/llm/complete') {
    const userId = authenticate(deps, req, res);
    if (!userId) {
      return;
    }
    const outcome = await routeLlmCompletion(deps.llm ?? null, url.pathname, method, await readJson(req));
    if (outcome.handled) {
      sendJson(res, outcome.status, outcome.payload);
      return;
    }
  }

  sendJson(res, 404, {
    error: 'no-encontrado',
    message: `Ruta desconocida: ${method} ${url.pathname}`,
  });
}

/** Comprueba el token y responde 401 si falta o no es válido. */
function authenticate(
  deps: ApiDependencies,
  req: IncomingMessage,
  res: ServerResponse,
): string | null {
  const token = bearerToken(req);
  const userId = token ? deps.auth.userIdForToken(token) : null;
  if (!userId) {
    sendJson(res, 401, { error: 'no-autorizado', message: 'Token ausente o caducado.' });
    return null;
  }
  return userId;
}

function sendAuthResult(res: ServerResponse, result: AuthResult): void {
  if (result.ok) {
    sendJson(res, 200, result.value);
    return;
  }
  const status = result.error.code === 'credenciales-invalidas' ? 401 : 409;
  sendJson(res, status, { error: result.error.code, message: result.error.message });
}

function bearerToken(req: IncomingMessage): string | null {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return null;
  }
  return header.slice('Bearer '.length).trim() || null;
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = chunk as Buffer;
    size += buffer.length;
    if (size > MAX_BODY_BYTES) {
      throw new Error('El cuerpo de la petición supera el límite permitido.');
    }
    chunks.push(buffer);
  }
  if (chunks.length === 0) {
    return null;
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return null;
  }
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
  });
  res.end(body);
}

function emptySnapshot(userId: string): ProgressSnapshot {
  return {
    userId,
    generatedAt: 0,
    evaluations: [],
    reviewStates: [],
    sessions: [],
    gapProfile: null,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
