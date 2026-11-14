/**
 * @jest-environment node
 */
import { inMemoryStorage, ok, ProcessingPolicyHolder } from '@socracia/core';

import { createServices } from '../services/appServices';
import { buildLlmEngine } from '../services/llmEngine';
import { setProcessingPolicy } from '../services/privacySettings';
import { startFakeApi, type FakeApi } from './helpers/fakeApi';
import { nodeFetch } from './helpers/nodeFetch';

/**
 * El motor con modelo y los servicios deben compartir **el mismo** contenedor
 * de política.
 *
 * Regresión de un defecto real de la APK: `bootstrap` construía el motor con un
 * `ProcessingPolicyHolder` y `createServices` con otro distinto. El ajuste de
 * privacidad actualizaba el segundo, pero el guardián de consentimiento del
 * motor leía el primero, que seguía en `local-only`: activar la nube en Ajustes
 * no abría el motor y toda llamada se denegaba con `sin-consentimiento`. Esta
 * prueba fija que, con un solo contenedor, activar la nube abre el guardián sin
 * reconstruir nada.
 */
describe('política compartida entre servicios y motor', () => {
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
      body: JSON.stringify({ email: 'politica@ejemplo.com', password: 'contrasena-larga' }),
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

  it('activar la nube abre el guardián del motor sin reconstruirlo', async () => {
    const holder = new ProcessingPolicyHolder({ mode: 'local-only' });
    const bundle = buildLlmEngine({
      baseUrl: api.baseUrl,
      policy: holder,
      loadToken: () => token(),
      fetchImpl: nodeFetch,
    });
    const services = createServices({
      storage: inMemoryStorage(),
      picker: { pick: async () => null },
      reader: { read: async () => ok(new Uint8Array()) },
      llm: bundle,
      policyHolder: holder,
    });

    // En modo local, el guardián deniega sin tocar la red.
    const before = await bundle.provider.complete(request);
    expect(before.ok).toBe(false);
    if (!before.ok) {
      expect(before.error.code).toBe('sin-consentimiento');
    }

    // El ajuste de privacidad muta el contenedor compartido.
    await setProcessingPolicy(services, 'allow-cloud');
    expect(services.policy.current().mode).toBe('allow-cloud');

    // El mismo motor, sin reconstruirse, ahora llega al backend.
    const after = await bundle.provider.complete(request);
    expect(after.ok).toBe(true);
  });

  it('sin `policyHolder`, los servicios crean el suyo (comportamiento previo intacto)', () => {
    const services = createServices({
      storage: inMemoryStorage(),
      picker: { pick: async () => null },
      reader: { read: async () => ok(new Uint8Array()) },
    });
    expect(services.policy.current().mode).toBe('local-only');
  });
});
