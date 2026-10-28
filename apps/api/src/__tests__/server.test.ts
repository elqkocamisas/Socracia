import type { ProgressSnapshot } from '@socracia/core';

import { emptySnapshot, register, startApi, testServer } from './helpers/apiHarness';

/**
 * Pruebas de integración de la API.
 *
 * Hablan HTTP real contra un servidor en un puerto efímero: cubren el
 * recorrido completo de cuenta → sincronización → recuperación en otro
 * dispositivo, que es el criterio de aceptación del Sprint 4.
 */
describe('API de sincronización', () => {
  let baseUrl: string;
  let close: () => Promise<void>;

  beforeEach(async () => {
    const { server } = testServer();
    const running = await startApi(server);
    baseUrl = running.baseUrl;
    close = running.close;
  });

  afterEach(async () => {
    await close();
  });

  async function push(token: string, snapshot: ProgressSnapshot): Promise<Response> {
    return fetch(`${baseUrl}/sync/push`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify(snapshot),
    });
  }

  it('responde al health check', async () => {
    const response = await fetch(`${baseUrl}/health`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok' });
  });

  it('registra, sincroniza y recupera el progreso en otro dispositivo', async () => {
    const { token, userId } = await register(baseUrl, 'ana@ejemplo.com');
    const snapshot: ProgressSnapshot = {
      ...emptySnapshot(userId, 1000),
      evaluations: [
        {
          updatedAt: 1000,
          value: {
            questionId: 'c1:q0',
            conceptId: 'c1',
            verdict: 'correcta',
            score: 0.9,
            matchedKeyTerms: [],
            missingKeyTerms: [],
            feedback: 'bien',
          },
        },
      ],
    };

    const pushed = await push(token, snapshot);
    expect(pushed.status).toBe(200);

    // Segundo «dispositivo»: mismo usuario, descarga lo guardado.
    const pulled = await fetch(`${baseUrl}/sync/pull`, {
      headers: { authorization: `Bearer ${token}` },
    });
    const body = (await pulled.json()) as ProgressSnapshot;

    expect(body.evaluations).toHaveLength(1);
    expect(body.userId).toBe(userId);
  });

  it('es idempotente: dos pushes iguales no duplican evaluaciones', async () => {
    const { token, userId } = await register(baseUrl, 'ana@ejemplo.com');
    const snapshot: ProgressSnapshot = {
      ...emptySnapshot(userId, 1000),
      evaluations: [
        {
          updatedAt: 1000,
          value: {
            questionId: 'c1:q0',
            conceptId: 'c1',
            verdict: 'parcial',
            score: 0.4,
            matchedKeyTerms: [],
            missingKeyTerms: [],
            feedback: 'casi',
          },
        },
      ],
    };

    await push(token, snapshot);
    await push(token, snapshot);

    const pulled = await fetch(`${baseUrl}/sync/pull`, {
      headers: { authorization: `Bearer ${token}` },
    });
    const body = (await pulled.json()) as ProgressSnapshot;

    expect(body.evaluations).toHaveLength(1);
  });

  it('rechaza la sincronización sin token', async () => {
    const response = await fetch(`${baseUrl}/sync/pull`);

    expect(response.status).toBe(401);
  });

  it('rechaza un token inválido', async () => {
    const response = await fetch(`${baseUrl}/sync/pull`, {
      headers: { authorization: 'Bearer token-inventado' },
    });

    expect(response.status).toBe(401);
  });

  it('rechaza una instantánea mal formada', async () => {
    const { token } = await register(baseUrl, 'ana@ejemplo.com');

    const response = await push(token, { userId: 'x' } as unknown as ProgressSnapshot);

    expect(response.status).toBe(400);
  });

  it('ignora el userId del cuerpo y usa el de la sesión', async () => {
    const { token, userId } = await register(baseUrl, 'ana@ejemplo.com');

    await push(token, emptySnapshot('usuario-ajeno', 1000));

    const pulled = await fetch(`${baseUrl}/sync/pull`, {
      headers: { authorization: `Bearer ${token}` },
    });
    const body = (await pulled.json()) as ProgressSnapshot;

    // Un cliente no puede escribir el progreso de otro manipulando el JSON.
    expect(body.userId).toBe(userId);
  });

  it('devuelve una instantánea vacía para un usuario sin progreso', async () => {
    const { token, userId } = await register(baseUrl, 'nueva@ejemplo.com');

    const response = await fetch(`${baseUrl}/sync/pull`, {
      headers: { authorization: `Bearer ${token}` },
    });
    const body = (await response.json()) as ProgressSnapshot;

    expect(body.userId).toBe(userId);
    expect(body.evaluations).toHaveLength(0);
  });

  it('responde 404 en una ruta desconocida', async () => {
    const response = await fetch(`${baseUrl}/ruta/inexistente`);

    expect(response.status).toBe(404);
  });

  it('rechaza el registro con datos inválidos', async () => {
    const response = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'no-es-correo', password: 'corta' }),
    });

    expect(response.status).toBe(409);
  });

  it('inicia sesión y cierra sesión', async () => {
    await register(baseUrl, 'ana@ejemplo.com', 'contrasena-larga');
    const login = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'ana@ejemplo.com', password: 'contrasena-larga' }),
    });
    const { token } = (await login.json()) as { token: string };

    const logout = await fetch(`${baseUrl}/auth/logout`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(logout.status).toBe(200);

    // El token ya no sirve tras cerrar sesión.
    const after = await fetch(`${baseUrl}/sync/pull`, {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(after.status).toBe(401);
  });
  it('elimina la cuenta y su progreso, e invalida el token', async () => {
    const { token, userId } = await register(baseUrl, 'borrame@ejemplo.com');
    await push(token, {
      ...emptySnapshot(userId, 1000),
      evaluations: [
        {
          updatedAt: 1000,
          value: {
            questionId: 'c1:q0',
            conceptId: 'c1',
            verdict: 'correcta',
            score: 0.9,
            matchedKeyTerms: [],
            missingKeyTerms: [],
            feedback: 'bien',
          },
        },
      ],
    });

    const deleted = await fetch(`${baseUrl}/account`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(deleted.status).toBe(200);
    expect(await deleted.json()).toEqual({ status: 'eliminada' });

    // El token deja de valer.
    const afterDelete = await fetch(`${baseUrl}/sync/pull`, {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(afterDelete.status).toBe(401);

    // Y el correo queda libre: la cuenta se borró de verdad, no solo la sesión.
    const reRegister = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'borrame@ejemplo.com', password: 'contrasena-larga' }),
    });
    expect(reRegister.status).toBe(200);
  });

  it('el progreso de la cuenta eliminada no reaparece en una cuenta nueva', async () => {
    const { token, userId } = await register(baseUrl, 'borrame2@ejemplo.com');
    await push(token, {
      ...emptySnapshot(userId, 1000),
      evaluations: [
        {
          updatedAt: 1000,
          value: {
            questionId: 'c1:q0',
            conceptId: 'c1',
            verdict: 'correcta',
            score: 0.9,
            matchedKeyTerms: [],
            missingKeyTerms: [],
            feedback: 'bien',
          },
        },
      ],
    });
    await fetch(`${baseUrl}/account`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${token}` },
    });

    // Misma persona, cuenta nueva: el servidor no conserva el progreso borrado.
    const fresh = await register(baseUrl, 'borrame2@ejemplo.com');
    const pull = await fetch(`${baseUrl}/sync/pull`, {
      headers: { authorization: `Bearer ${fresh.token}` },
    });
    const snapshot = (await pull.json()) as ProgressSnapshot;
    expect(snapshot.evaluations).toEqual([]);
  });

  it('rechaza el borrado de cuenta sin token válido', async () => {
    const withoutToken = await fetch(`${baseUrl}/account`, { method: 'DELETE' });
    expect(withoutToken.status).toBe(401);

    const badToken = await fetch(`${baseUrl}/account`, {
      method: 'DELETE',
      headers: { authorization: 'Bearer token-inventado' },
    });
    expect(badToken.status).toBe(401);
  });
});
