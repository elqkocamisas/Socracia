import { ProcessingPolicyHolder } from '../../privacy/processingPolicy';
import { ConsentGatedLlmProvider } from '../consent';
import { FakeLlmProvider } from '../fakeProvider';

function request() {
  return {
    system: 's',
    user: 'u',
    maxTokens: 10,
    temperature: 0,
    purpose: 'evaluar' as const,
  };
}

describe('ConsentGatedLlmProvider', () => {
  it('con política local-only no llama al proveedor real', async () => {
    const inner = new FakeLlmProvider([{ text: '{"score":1}' }]);
    const policy = new ProcessingPolicyHolder({ mode: 'local-only' });
    const provider = new ConsentGatedLlmProvider(inner, policy);

    const result = await provider.complete(request());

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('sin-consentimiento');
    }
    // El requisito duro: cero llamadas de red sin consentimiento.
    expect(inner.callCount()).toBe(0);
  });

  it('con allow-cloud delega en el proveedor real', async () => {
    const inner = new FakeLlmProvider([{ text: '{"score":1}' }]);
    const policy = new ProcessingPolicyHolder({ mode: 'allow-cloud' });
    const provider = new ConsentGatedLlmProvider(inner, policy);

    const result = await provider.complete(request());

    expect(result.ok).toBe(true);
    expect(inner.callCount()).toBe(1);
  });

  it('revocar el permiso surte efecto en la siguiente llamada, sin reconstruir nada', async () => {
    const inner = new FakeLlmProvider([{ text: '{"score":1}' }]);
    const policy = new ProcessingPolicyHolder({ mode: 'allow-cloud' });
    const provider = new ConsentGatedLlmProvider(inner, policy);

    await provider.complete(request());
    policy.set({ mode: 'local-only' });
    const after = await provider.complete(request());

    expect(after.ok).toBe(false);
    expect(inner.callCount()).toBe(1);
  });
});
