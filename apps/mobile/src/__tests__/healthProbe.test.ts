import { HttpHealthProbe } from '../services/healthProbe';

/**
 * Pruebas de la sonda de salud.
 *
 * Se inyecta un `fetch` de mentira: lo que se prueba es la interpretación de la
 * respuesta del backend (campos opcionales, errores de red y respuestas
 * inválidas), no la red en sí.
 */
const originalFetch = globalThis.fetch;
afterAll(() => {
  globalThis.fetch = originalFetch;
});

function probeWith(response: unknown, ok = true, status = 200): HttpHealthProbe {
  globalThis.fetch = (async () =>
    ({
      ok,
      status,
      json: async () => response,
    }) as unknown as Response) as typeof fetch;
  return new HttpHealthProbe({ baseUrl: 'https://api.test', timeoutMs: 100 });
}

describe('HttpHealthProbe', () => {
  it('interpreta una respuesta completa del backend', async () => {
    const probe = probeWith({
      status: 'ok',
      version: '1.0.0',
      commit: 'abc123',
      provider: { configured: true, model: 'gemini-3.6-flash' },
    });
    const result = await probe.check();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe('ok');
      expect(result.value.version).toBe('1.0.0');
      expect(result.value.providerConfigured).toBe(true);
      expect(result.value.providerModel).toBe('gemini-3.6-flash');
    }
  });

  it('tolera campos ausentes sin romper', async () => {
    const probe = probeWith({ status: 'ok' });
    const result = await probe.check();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.version).toBeNull();
      expect(result.value.commit).toBeNull();
      expect(result.value.providerConfigured).toBe(false);
    }
  });

  it('traduce un fallo de red a un error con causa', async () => {
    globalThis.fetch = (async () => {
      throw new Error('network down');
    }) as typeof fetch;
    const probe = new HttpHealthProbe({ baseUrl: 'https://api.test', timeoutMs: 100 });
    const result = await probe.check();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('sin-conexion');
    }
  });

  it('trata una respuesta sin `status` como inválida', async () => {
    const probe = probeWith({ nada: true });
    const result = await probe.check();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('respuesta-invalida');
    }
  });

  it('trata un 5xx como respuesta inválida', async () => {
    const probe = probeWith({ status: 'ok' }, false, 503);
    const result = await probe.check();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('respuesta-invalida');
    }
  });
});
