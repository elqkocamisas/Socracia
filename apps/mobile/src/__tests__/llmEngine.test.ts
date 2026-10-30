/**
 * @jest-environment node
 */
import { ProcessingPolicyHolder } from '@socracia/core';
import { buildLlmEngine } from '../services/llmEngine';
import { startFakeApi, type FakeApi } from './helpers/fakeApi';
import { nodeFetch } from './helpers/nodeFetch';

/**
 * La composición decide si el modelo es el motor principal. Esta prueba fija las
 * dos condiciones y su consecuencia: sin consentimiento el guardián impide la
 * llamada (nada sale del dispositivo), y con él la petición llega al backend.
 */
describe('buildLlmEngine y el consentimiento', () => {
  let api: FakeApi;

  beforeEach(async () => {
    api = await startFakeApi();
  });

  afterEach(async () => {
    await api.close();
  });

  async function token(): Promise<string> {
    const response = await nodeFetch(`${api.baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'motor@ejemplo.com', password: 'contrasena-larga' }),
    });
    return ((await response.json()) as { token: string }).token;
  }

  const request = {
    system: 's',
    user: 'u',
    maxTokens: 10,
    temperature: 0,
    purpose: 'evaluar' as const,
  };

  it('en modo local el guardián impide la llamada, sin tocar la red', async () => {
    const policy = new ProcessingPolicyHolder({ mode: 'local-only' });
    const bundle = buildLlmEngine({
      baseUrl: api.baseUrl,
      policy,
      loadToken: () => token(),
      fetchImpl: nodeFetch,
    });
    const result = await bundle.provider.complete(request);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('sin-consentimiento');
    }
  });

  it('con permiso de nube, el motor llega al backend y devuelve texto', async () => {
    const policy = new ProcessingPolicyHolder({ mode: 'allow-cloud' });
    const bundle = buildLlmEngine({
      baseUrl: api.baseUrl,
      policy,
      loadToken: () => token(),
      fetchImpl: nodeFetch,
    });
    const result = await bundle.provider.complete(request);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.text).toContain('correcta');
    }
  });

  it('revocar el permiso surte efecto de inmediato, sin reconstruir el motor', async () => {
    const policy = new ProcessingPolicyHolder({ mode: 'allow-cloud' });
    const bundle = buildLlmEngine({
      baseUrl: api.baseUrl,
      policy,
      loadToken: () => token(),
      fetchImpl: nodeFetch,
    });

    const before = await bundle.provider.complete(request);
    expect(before.ok).toBe(true);

    policy.set({ mode: 'local-only' });
    const after = await bundle.provider.complete(request);
    expect(after.ok).toBe(false);
    if (!after.ok) {
      expect(after.error.code).toBe('sin-consentimiento');
    }
  });

  it('sin sesión, el motor no llama aunque haya permiso', async () => {
    const policy = new ProcessingPolicyHolder({ mode: 'allow-cloud' });
    const bundle = buildLlmEngine({
      baseUrl: api.baseUrl,
      policy,
      loadToken: () => Promise.resolve(null),
      fetchImpl: nodeFetch,
    });
    const result = await bundle.provider.complete(request);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('no-configurado');
    }
  });
});
