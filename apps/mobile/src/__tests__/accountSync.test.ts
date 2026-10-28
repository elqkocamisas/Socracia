/**
 * @jest-environment node
 */
import { HttpSyncClient } from '../services/httpSyncClient';
import { AccountService } from '../services/accountService';
import { InMemoryCredentialStore } from '../services/credentialStore';
import { inMemoryStorage, type ProgressSnapshot } from '@socracia/core';
import { startFakeApi, type FakeApi } from './helpers/fakeApi';
import { nodeFetch } from './helpers/nodeFetch';

/**
 * El cliente y el servicio de cuenta hablan HTTP real contra un backend en un
 * puerto efímero: se verifican los códigos de estado, las cabeceras de
 * autorización y la traducción de errores, no solo la lógica interna.
 */
describe('HttpSyncClient y AccountService', () => {
  let api: FakeApi;

  beforeEach(async () => {
    api = await startFakeApi();
  });

  afterEach(async () => {
    await api.close();
  });

  function snapshot(userId: string, questionId: string): ProgressSnapshot {
    return {
      userId,
      generatedAt: 1000,
      evaluations: [
        {
          updatedAt: 1000,
          value: {
            questionId,
            conceptId: 'c1',
            verdict: 'correcta',
            score: 0.9,
            matchedKeyTerms: [],
            missingKeyTerms: [],
            feedback: 'ok',
          },
        },
      ],
      reviewStates: [],
      sessions: [],
      gapProfile: null,
    };
  }

  it('registra una cuenta y devuelve sesión', async () => {
    const client = new HttpSyncClient({ baseUrl: api.baseUrl, fetchImpl: nodeFetch });

    const result = await client.register('ana@ejemplo.com', 'contrasena-larga');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.email).toBe('ana@ejemplo.com');
      expect(result.value.token).toBeTruthy();
    }
  });

  it('traduce el fallo de red a un error de tipo `red`', async () => {
    const client = new HttpSyncClient({ baseUrl: 'http://127.0.0.1:1', fetchImpl: nodeFetch });

    const result = await client.pull('u1');

    // Sin sesión, ni siquiera intenta la red: es un error de sesión.
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('sin-sesion');
    }
  });

  it('informa de error de red cuando el servidor no responde', async () => {
    const client = new HttpSyncClient({
      baseUrl: 'http://127.0.0.1:1',
      token: 'x',
      fetchImpl: nodeFetch,
    });

    const result = await client.pull('u1');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('red');
    }
  });

  it('rechaza credenciales inválidas con el mensaje del servidor', async () => {
    const client = new HttpSyncClient({ baseUrl: api.baseUrl, fetchImpl: nodeFetch });

    const result = await client.register('sin-arroba', 'corta');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('inválidos');
    }
  });

  it('sube y descarga el progreso con la sesión activa', async () => {
    const client = new HttpSyncClient({ baseUrl: api.baseUrl, fetchImpl: nodeFetch });
    const registered = await client.register('ana@ejemplo.com', 'contrasena-larga');
    expect(registered.ok).toBe(true);
    if (!registered.ok) {
      return;
    }

    const pushed = await client.push(snapshot(registered.value.userId, 'c1:q0'));
    expect(pushed.ok).toBe(true);

    const pulled = await client.pull(registered.value.userId);
    expect(pulled.ok && pulled.value.evaluations).toHaveLength(1);
  });

  it('el servicio de cuenta persiste la sesión y sincroniza el progreso', async () => {
    const storage = inMemoryStorage();
    await storage.progress.appendEvaluations('local-user', [
      {
        questionId: 'c1:q0',
        conceptId: 'c1',
        verdict: 'parcial',
        score: 0.4,
        matchedKeyTerms: [],
        missingKeyTerms: [],
        feedback: 'casi',
      },
    ]);
    const credentials = new InMemoryCredentialStore();
    const account = new AccountService(
      new HttpSyncClient({ baseUrl: api.baseUrl, fetchImpl: nodeFetch }),
      credentials,
      storage,
      'local-user',
    );

    const login = await account.login('ana@ejemplo.com', 'contrasena-larga');
    expect(login.ok).toBe(true);
    expect(await credentials.load()).not.toBeNull();

    const outcome = await account.sync(2000);

    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.value.evaluations).toBe(1);
    }
  });

  it('el servicio de cuenta no sincroniza sin sesión', async () => {
    const account = new AccountService(
      new HttpSyncClient({ baseUrl: api.baseUrl, fetchImpl: nodeFetch }),
      new InMemoryCredentialStore(),
      inMemoryStorage(),
      'local-user',
    );

    const outcome = await account.sync(2000);

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.error.code).toBe('sin-sesion');
    }
  });

  it('restaura la sesión guardada al arrancar', async () => {
    const credentials = new InMemoryCredentialStore();
    const client = new HttpSyncClient({ baseUrl: api.baseUrl, fetchImpl: nodeFetch });
    const account = new AccountService(client, credentials, inMemoryStorage(), 'local-user');
    await account.login('ana@ejemplo.com', 'contrasena-larga');

    // Simula un arranque: nueva instancia que restaura desde las credenciales.
    const restored = await new AccountService(
      new HttpSyncClient({ baseUrl: api.baseUrl, fetchImpl: nodeFetch }),
      credentials,
      inMemoryStorage(),
      'local-user',
    ).restore();

    expect(restored?.email).toBe('ana@ejemplo.com');
  });

  it('cerrar sesión borra las credenciales locales', async () => {
    const credentials = new InMemoryCredentialStore();
    const account = new AccountService(
      new HttpSyncClient({ baseUrl: api.baseUrl, fetchImpl: nodeFetch }),
      credentials,
      inMemoryStorage(),
      'local-user',
    );
    await account.login('ana@ejemplo.com', 'contrasena-larga');

    await account.logout();

    expect(await credentials.load()).toBeNull();
  });
});
