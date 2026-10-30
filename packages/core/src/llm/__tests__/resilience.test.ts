import { err, ok } from '../../result';
import { FakeLlmProvider } from '../fakeProvider';
import { DEFAULT_RESILIENCE, ResilientLlmProvider, type Clock } from '../resilience';
import type { LlmCompletion, LlmError, LlmProvider } from '../types';

/** Reloj falso: el tiempo solo avanza cuando la prueba lo pide. */
function fakeClock(): Clock & { advance: (ms: number) => void } {
  let current = 1_000_000;
  return {
    now: () => current,
    sleep: async () => undefined,
    advance: (ms: number) => {
      current += ms;
    },
  };
}

function request(temperature = 0) {
  return {
    system: 'sistema',
    user: 'datos',
    maxTokens: 100,
    temperature,
    purpose: 'evaluar' as const,
  };
}

/** Proveedor que siempre devuelve el mismo texto. */
class ConstantProvider implements LlmProvider {
  public readonly id = 'constante';
  public readonly model = 'm';
  public calls = 0;
  public async complete(): Promise<ReturnType<typeof ok<LlmCompletion>>> {
    this.calls += 1;
    return ok({ text: 'hola', usage: { promptTokens: 1, completionTokens: 1 }, model: 'm' });
  }
}

describe('ResilientLlmProvider', () => {
  it('devuelve la respuesta y cuenta la llamada', async () => {
    const inner = new ConstantProvider();
    const provider = new ResilientLlmProvider(inner, DEFAULT_RESILIENCE, fakeClock());
    const result = await provider.complete(request());
    expect(result.ok && result.value.text).toBe('hola');
    expect(provider.metrics().calls).toBe(1);
    expect(provider.metrics().fallbackRate).toBe(0);
  });

  it('sirve de caché solo cuando la temperatura es 0', async () => {
    const inner = new ConstantProvider();
    const provider = new ResilientLlmProvider(inner, DEFAULT_RESILIENCE, fakeClock());
    await provider.complete(request(0));
    await provider.complete(request(0));
    expect(inner.calls).toBe(1);
    expect(provider.metrics().cacheHits).toBe(1);

    await provider.complete(request(0.7));
    await provider.complete(request(0.7));
    expect(inner.calls).toBe(3);
  });

  it('reintenta un fallo transitorio y luego acierta', async () => {
    let attempt = 0;
    const flaky: LlmProvider = {
      id: 'inestable',
      model: 'm',
      complete: async () => {
        attempt += 1;
        if (attempt === 1) {
          return err<LlmError>({ code: 'red', message: 'corte' });
        }
        return ok({ text: 'ok', usage: { promptTokens: 1, completionTokens: 1 }, model: 'm' });
      },
    };
    const provider = new ResilientLlmProvider(flaky, DEFAULT_RESILIENCE, fakeClock());
    const result = await provider.complete(request());
    expect(result.ok).toBe(true);
    expect(attempt).toBe(2);
  });

  it('no reintenta un fallo no transitorio', async () => {
    let calls = 0;
    const quota: LlmProvider = {
      id: 'sin-cuota',
      model: 'm',
      complete: async () => {
        calls += 1;
        return err<LlmError>({ code: 'cuota', message: 'sin saldo' });
      },
    };
    const provider = new ResilientLlmProvider(quota, DEFAULT_RESILIENCE, fakeClock());
    const result = await provider.complete(request());
    expect(result.ok).toBe(false);
    expect(calls).toBe(1);
  });

  it('abre el circuito tras fallos consecutivos y deja de llamar', async () => {
    const inner = new FakeLlmProvider([{ error: { code: 'red', message: 'corte' } }]);
    const clock = fakeClock();
    const provider = new ResilientLlmProvider(
      inner,
      { ...DEFAULT_RESILIENCE, maxRetries: 0, failureThreshold: 2 },
      clock,
    );
    await provider.complete(request(1));
    await provider.complete(request(1));
    const blocked = await provider.complete(request(1));
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) {
      expect(blocked.error.code).toBe('circuito-abierto');
    }
    expect(provider.metrics().circuitOpens).toBe(1);
  });

  it('corta por timeout', async () => {
    const slow: LlmProvider = {
      id: 'lento',
      model: 'm',
      complete: () => new Promise(() => undefined),
    };
    const provider = new ResilientLlmProvider(
      slow,
      { ...DEFAULT_RESILIENCE, timeoutMs: 5, maxRetries: 0 },
      { now: () => Date.now(), sleep: async () => undefined },
    );
    const result = await provider.complete(request());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('timeout');
    }
    expect(provider.metrics().timeouts).toBe(1);
  });

  it('respeta el presupuesto por ventana', async () => {
    const inner = new ConstantProvider();
    const clock = fakeClock();
    const provider = new ResilientLlmProvider(
      inner,
      { ...DEFAULT_RESILIENCE, budget: { maxCalls: 1, windowMs: 1000 } },
      clock,
    );
    await provider.complete(request(1));
    const rejected = await provider.complete(request(1));
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) {
      expect(rejected.error.code).toBe('presupuesto-agotado');
    }
    expect(provider.metrics().budgetRejections).toBe(1);
  });
});
