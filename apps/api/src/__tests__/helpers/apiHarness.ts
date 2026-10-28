import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

import type { ProgressSnapshot } from '@socracia/core';

import { AuthService } from '../../auth';
import { InMemoryProgressStore } from '../../store';
import { createApiServer, defaultDependencies } from '../../server';

/**
 * Arranca la API en un puerto efímero y devuelve un cliente `fetch` real.
 *
 * Las pruebas de integración hablan HTTP de verdad contra el servidor: así se
 * verifica el enrutado, la lectura del cuerpo, las cabeceras y los códigos de
 * estado, no solo las funciones internas.
 */
export interface RunningApi {
  readonly baseUrl: string;
  readonly close: () => Promise<void>;
}

export async function startApi(server: Server): Promise<RunningApi> {
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
}

/** Crea un servidor de pruebas con almacén en memoria. */
export function testServer(): { server: Server; store: InMemoryProgressStore } {
  const store = new InMemoryProgressStore();
  const server = createApiServer({ auth: new AuthService(), store });
  return { server, store };
}

export function emptySnapshot(userId: string, now = 1_700_000_000_000): ProgressSnapshot {
  return {
    userId,
    generatedAt: now,
    evaluations: [],
    reviewStates: [],
    sessions: [],
    gapProfile: null,
  };
}

/** Registro de conveniencia que devuelve el token y el `userId`. */
export async function register(
  baseUrl: string,
  email: string,
  password = 'contrasena-larga',
): Promise<{ token: string; userId: string }> {
  const response = await fetch(`${baseUrl}/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  return (await response.json()) as { token: string; userId: string };
}

export { defaultDependencies };
