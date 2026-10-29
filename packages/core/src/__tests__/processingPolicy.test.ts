import {
  DEFAULT_PROCESSING_POLICY,
  ProcessingPolicyHolder,
  allowsCloudProcessing,
  assertProcessingAllowed,
  describeProcessingPolicy,
} from '@socracia/core';

/**
 * La privacidad del material del usuario es un requisito del producto, no un
 * detalle de interfaz: el modo por defecto debe ser local y la comprobación
 * debe impedir el envío a un servidor aunque la UI se equivoque.
 */
describe('Política de procesamiento', () => {
  it('por defecto es solo-dispositivo', () => {
    expect(DEFAULT_PROCESSING_POLICY.mode).toBe('local-only');
    expect(allowsCloudProcessing(DEFAULT_PROCESSING_POLICY)).toBe(false);
  });

  it('permite una operación local en modo solo-dispositivo', () => {
    const result = assertProcessingAllowed(DEFAULT_PROCESSING_POLICY, {
      requiresCloud: false,
      label: 'Importar',
    });
    expect(result.ok).toBe(true);
  });

  it('bloquea una operación en nube si la política no la autoriza', () => {
    const result = assertProcessingAllowed(DEFAULT_PROCESSING_POLICY, {
      requiresCloud: true,
      label: 'Subir corpus',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('procesamiento-en-nube-no-permitido');
      expect(result.error.message).toContain('Subir corpus');
    }
  });

  it('permite la nube solo tras autorizarla explícitamente', () => {
    const policy = { mode: 'allow-cloud' } as const;
    expect(allowsCloudProcessing(policy)).toBe(true);
    const result = assertProcessingAllowed(policy, {
      requiresCloud: true,
      label: 'Subir corpus',
    });
    expect(result.ok).toBe(true);
  });

  it('describe la política en lenguaje llano', () => {
    expect(describeProcessingPolicy(DEFAULT_PROCESSING_POLICY)).toContain('tu dispositivo');
    expect(describeProcessingPolicy({ mode: 'allow-cloud' })).toContain('servidor');
  });
});

describe('ProcessingPolicyHolder', () => {
  it('arranca en modo local', () => {
    expect(new ProcessingPolicyHolder().current().mode).toBe('local-only');
  });

  it('refleja el cambio de modo para los consumidores que lo leen después', () => {
    const holder = new ProcessingPolicyHolder();
    holder.set({ mode: 'allow-cloud' });
    expect(holder.current().mode).toBe('allow-cloud');
  });
});
