import type { AddressInfo } from 'node:net';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

import { mergeSnapshots, type ProgressSnapshot } from '@socracia/core';

/**
 * Backend de pruebas mínimo que reutiliza la fusión del dominio.
 *
 * Reproduce el contrato de la API real (registro, inicio de sesión, push, pull
 * y borrado de cuenta) sobre Node, de modo que el cliente HTTP del móvil se
 * prueba contra HTTP de verdad sin depender del workspace `@socracia/api`.
 */
export interface FakeApi {
  readonly baseUrl: string;
  readonly close: () => Promise<void>;
  readonly stored: (userId: string) => ProgressSnapshot | null;
}

export async function startFakeApi(): Promise<FakeApi> {
  const byUser = new Map<string, ProgressSnapshot>();
  const tokens = new Map<string, string>();

  const server = createServer((req, res) => {
    void handle(req, res, byUser, tokens);
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    stored: (userId) => byUser.get(userId) ?? null,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
}

async function handle(
  req: IncomingMessage,
  res: ServerResponse,
  byUser: Map<string, ProgressSnapshot>,
  tokens: Map<string, string>,
): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const body = await readBody(req);
  const json = body ? (JSON.parse(body) as Record<string, unknown>) : {};

  if (url.pathname === '/auth/register' || url.pathname === '/auth/login') {
    const email = String(json.email ?? '');
    if (!email.includes('@') || String(json.password ?? '').length < 8) {
      send(res, 409, { message: 'datos inválidos' });
      return;
    }
    const userId = `user-${email}`;
    const token = `token-${email}`;
    tokens.set(token, userId);
    send(res, 200, { token, userId });
    return;
  }

  const auth = req.headers.authorization;
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null;
  const userId = token ? (tokens.get(token) ?? null) : null;
  if (!userId) {
    send(res, 401, { message: 'no autorizado' });
    return;
  }

  if (url.pathname === '/sync/push') {
    const incoming = { ...(json as unknown as ProgressSnapshot), userId };
    const stored = byUser.get(userId);
    const merged = stored ? mergeSnapshots(stored, incoming) : incoming;
    byUser.set(userId, merged);
    send(res, 200, merged);
    return;
  }
  if (url.pathname === '/sync/pull') {
    send(res, 200, byUser.get(userId) ?? emptySnapshot(userId));
    return;
  }
  if (url.pathname === '/auth/logout') {
    tokens.delete(token ?? '');
    send(res, 200, { status: 'cerrado' });
    return;
  }
  if (url.pathname === '/account' && req.method === 'DELETE') {
    // Borra la cuenta y su progreso, como el backend real: el token se
    // invalida y la instantánea desaparece.
    byUser.delete(userId);
    tokens.delete(token ?? '');
    send(res, 200, { status: 'eliminada' });
    return;
  }
  if (url.pathname === '/llm/complete' && req.method === 'POST') {
    // Reproduce el contrato de la ruta real: 503 si el servidor no tiene
    // modelo, eco del `purpose` como prueba de que el cuerpo viaja entero.
    if (process.env.FAKE_API_LLM === 'off') {
      send(res, 503, { message: 'sin modelo' });
      return;
    }
    send(res, 200, {
      text: JSON.stringify({ verdict: 'correcta', purpose: String(json.purpose ?? '') }),
      model: 'fake-1',
    });
    return;
  }
  send(res, 404, { message: 'no encontrado' });
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

async function readBody(req: IncomingMessage): Promise<string> {
  const decoder = new TextDecoder();
  let text = '';
  for await (const chunk of req) {
    text += decoder.decode(chunk, { stream: true });
  }
  return text + decoder.decode();
}

function send(res: ServerResponse, status: number, payload: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(payload));
}
