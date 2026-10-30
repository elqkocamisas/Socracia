import type { LlmCompletion, LlmCompletionRequest, LlmError, LlmProvider, Result } from '@socracia/core';
import { ok } from '@socracia/core';

import { AuthService } from '../auth';
import { InMemoryProgressStore } from '../store';
import { createApiServer } from '../server';
import { parseCompletionRequest, routeLlmCompletion } from '../llm';
import { startApi, register } from './helpers/apiHarness';

/** Proveedor de prueba que registra las peticiones y responde lo que se le diga. */
class StubProvider implements LlmProvider {
  public readonly id = 'stub';
  public readonly model = 'stub-1';
  public readonly calls: LlmCompletionRequest[] = [];

  public constructor(private readonly outcome: Result<LlmCompletion, LlmError> = ok({
    text: '{"verdict":"correcta"}',
    model: 'stub-1',
    usage: { promptTokens: 1, completionTokens: 1 },
  })) {}

  public async complete(request: LlmCompletionRequest): Promise<Result<LlmCompletion, LlmError>> {
    this.calls.push(request);
    return this.outcome;
  }
}

function body(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { system: 's', user: 'u', purpose: 'evaluar', maxTokens: 100, temperature: 0, ...overrides };
}

describe('parseCompletionRequest', () => {
  it('acota maxTokens y temperatura en el servidor', () => {
    const parsed = parseCompletionRequest(body({ maxTokens: 999999, temperature: 5 }));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.value.maxTokens).toBe(2048);
      expect(parsed.value.temperature).toBe(1);
    }
  });

  it('rechaza un purpose desconocido', () => {
    const parsed = parseCompletionRequest(body({ purpose: 'hackear' }));
    expect(parsed.ok).toBe(false);
  });

  it('rechaza system vacío', () => {
    const parsed = parseCompletionRequest(body({ system: '   ' }));
    expect(parsed.ok).toBe(false);
  });
});

describe('routeLlmCompletion', () => {
  it('devuelve handled:false para otra ruta', async () => {
    const outcome = await routeLlmCompletion(new StubProvider(), '/health', 'GET', null);
    expect(outcome.handled).toBe(false);
  });

  it('responde 503 sin proveedor y la app cae a local', async () => {
    const outcome = await routeLlmCompletion(null, '/llm/complete', 'POST', body());
    expect(outcome.handled).toBe(true);
    if (outcome.handled) {
      expect(outcome.status).toBe(503);
    }
  });

  it('traduce un timeout del proveedor a 504', async () => {
    const provider = new StubProvider({ ok: false, error: { code: 'timeout', message: 'tarde' } });
    const outcome = await routeLlmCompletion(provider, '/llm/complete', 'POST', body());
    expect(outcome.handled).toBe(true);
    if (outcome.handled) {
      expect(outcome.status).toBe(504);
    }
  });

  it('traduce la cuota agotada a 429', async () => {
    const provider = new StubProvider({
      ok: false,
      error: { code: 'presupuesto-agotado', message: 'sin saldo' },
    });
    const outcome = await routeLlmCompletion(provider, '/llm/complete', 'POST', body());
    if (outcome.handled) {
      expect(outcome.status).toBe(429);
    }
  });
});

describe('POST /llm/complete sobre HTTP', () => {
  it('exige sesión: sin token responde 401', async () => {
    const provider = new StubProvider();
    const server = createApiServer({ auth: new AuthService(), store: new InMemoryProgressStore(), llm: provider });
    const api = await startApi(server);
    try {
      const response = await fetch(`${api.baseUrl}/llm/complete`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body()),
      });
      expect(response.status).toBe(401);
      expect(provider.calls).toHaveLength(0);
    } finally {
      await api.close();
    }
  });

  it('con sesión válida delega en el proveedor', async () => {
    const provider = new StubProvider();
    const server = createApiServer({ auth: new AuthService(), store: new InMemoryProgressStore(), llm: provider });
    const api = await startApi(server);
    try {
      const { token } = await register(api.baseUrl, 'llm@ejemplo.com');
      const response = await fetch(`${api.baseUrl}/llm/complete`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify(body()),
      });
      expect(response.status).toBe(200);
      const payload = (await response.json()) as { text: string };
      expect(payload.text).toContain('correcta');
      expect(provider.calls).toHaveLength(1);
    } finally {
      await api.close();
    }
  });
});
