import { createEdgeLlmProvider, describeEdgeLlmSupport } from '../rag/edgeLlm';

/**
 * El módulo `edge-llm` 0.1.4 no cumple lo que promete su documentación. Estas
 * pruebas fijan ese hallazgo para que, si el paquete se corrige, se detecte aquí
 * y se pueda activar el proveedor real sin tocar el resto del sistema.
 */
describe('describeEdgeLlmSupport', () => {
  it('informa de que no hay soporte si el módulo no está instalado', () => {
    const support = describeEdgeLlmSupport(null);
    expect(support.supported).toBe(false);
    expect(support.reason).toContain('no está instalado');
  });

  it('rechaza el módulo real de edge-llm 0.1.4, que solo expone embedTest', () => {
    // Así es la superficie real del módulo en Android: `embedTest` devuelve
    // `{ length, sample }` con 5 valores, y no existe un `embed` completo.
    const moduloReal = {
      embedTest: async () => ({ length: 384, sample: [18.3, -0.16, 14.69, -12.54, -23.61] }),
      generateText: async () => ({}),
      addRagDocument: async () => ({}),
    } as unknown as Parameters<typeof describeEdgeLlmSupport>[0];

    const support = describeEdgeLlmSupport(moduloReal);
    expect(support.supported).toBe(false);
    expect(support.reason).toContain('5 de 384');
  });

  it('acepta un módulo que sí expone embed', () => {
    const support = describeEdgeLlmSupport({ embed: async () => [1, 2, 3] });
    expect(support.supported).toBe(true);
    expect(support.detected).toContain('embed');
  });
});

describe('createEdgeLlmProvider', () => {
  it('falla con un motivo explícito si el módulo no está', async () => {
    const result = await createEdgeLlmProvider({ nativeModule: null });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('no está instalado');
    }
  });

  it('falla si el módulo es el de edge-llm 0.1.4', async () => {
    const result = await createEdgeLlmProvider({
      nativeModule: { embedTest: async () => ({ length: 384, sample: [1, 2, 3, 4, 5] }) } as never,
    });
    expect(result.ok).toBe(false);
  });

  it('construye el proveedor cuando el módulo devuelve vectores completos', async () => {
    const result = await createEdgeLlmProvider({
      nativeModule: { embed: async () => new Array<number>(384).fill(0.5) },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.id).toBe('edge-llm-mediapipe');
      expect(result.value.dimensions).toBe(384);
      expect(result.value.isOnDevice).toBe(true);
    }
  });

  it('rechaza el proveedor si el sondeo devuelve la dimensión equivocada', async () => {
    // El sondeo es lo que evita arrancar con un índice cuyos vectores no
    // encajan con la dimensión declarada.
    const result = await createEdgeLlmProvider({
      nativeModule: { embed: async () => [1, 2, 3, 4, 5] },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('384');
    }
  });

  it('rechaza un valor nativo que no es un vector de números', async () => {
    const result = await createEdgeLlmProvider({
      nativeModule: { embed: async () => ({ status: 'error', message: 'sin modelo' }) as never },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('no es un vector');
    }
  });

  it('propaga el fallo del módulo nativo', async () => {
    const result = await createEdgeLlmProvider({
      nativeModule: {
        embed: async () => {
          throw new Error('TextEmbedder not initialized');
        },
      },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('TextEmbedder');
    }
  });

  it('acepta vectores anidados con dimensión correcta', async () => {
    const result = await createEdgeLlmProvider({
      nativeModule: { embed: async () => new Array<number>(384).fill(0.1) },
      dimensions: 384,
      probeText: 'prueba',
    });
    expect(result.ok).toBe(true);
  });
});
