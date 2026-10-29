import { HashingEmbeddingProvider, inMemoryStorage, ok } from '@socracia/core';
import { createServices, resolveEmbeddingProvider } from '../services/appServices';

/**
 * La resolución del proveedor decide si la app recupera con un modelo semántico
 * o con recuperación léxica. Como el módulo `edge-llm` 0.1.4 no entrega vectores
 * utilizables, el camino que de verdad se ejecuta hoy es la degradación; estas
 * pruebas lo fijan para que un cambio futuro no pase inadvertido.
 */
describe('resolveEmbeddingProvider', () => {
  it('usa el proveedor léxico si no hay módulo nativo declarado', async () => {
    const resolved = await resolveEmbeddingProvider({});

    expect(resolved.provider.id).toBe('hashing-local');
    expect(resolved.onDeviceModel).toBe(false);
    expect(resolved.degradedReason).toBeNull();
  });

  it('degrada al léxico y explica por qué si el módulo nativo es el de edge-llm 0.1.4', async () => {
    const resolved = await resolveEmbeddingProvider({
      nativeModule: {
        embedTest: async () => ({ length: 384, sample: [1, 2, 3, 4, 5] }),
      } as never,
    });

    expect(resolved.provider.id).toBe('hashing-local');
    expect(resolved.onDeviceModel).toBe(false);
    expect(resolved.degradedReason).toContain('5 de 384');
  });

  it('usa el modelo on-device si el módulo entrega vectores completos', async () => {
    const resolved = await resolveEmbeddingProvider({
      nativeModule: { embed: async () => new Array<number>(384).fill(0.2) },
    });

    expect(resolved.onDeviceModel).toBe(true);
    expect(resolved.provider.id).toBe('edge-llm-mediapipe');
    expect(resolved.provider.dimensions).toBe(384);
    expect(resolved.degradedReason).toBeNull();
  });

  it('envuelve el proveedor real en un envoltorio con reserva', async () => {
    const resolved = await resolveEmbeddingProvider({
      nativeModule: { embed: async () => new Array<number>(384).fill(0.2) },
      fallback: new HashingEmbeddingProvider(128),
    });

    expect(resolved.provider.id).toBe('edge-llm-mediapipe');
    // Si el modelo nativo fallara a mitad de sesión, la reserva toma el relevo.
    const result = await resolved.provider.embed('consulta');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(384);
    }
  });

  it('respeta el proveedor de reserva inyectado', async () => {
    const resolved = await resolveEmbeddingProvider({
      nativeModule: null,
      fallback: new HashingEmbeddingProvider(64),
    });
    expect(resolved.provider.dimensions).toBe(64);
  });
});

describe('createServices: diagnóstico de embeddings', () => {
  function services(embedding?: Parameters<typeof createServices>[0]['embedding']) {
    return createServices({
      storage: inMemoryStorage(),
      picker: { pick: async () => null },
      reader: { read: async () => ok(new Uint8Array()) },
      embedding,
    });
  }

  it('informa de recuperación léxica cuando no hay modelo on-device', () => {
    const app = services();
    expect(app.embedding.onDeviceModel).toBe(false);
    expect(app.embedding.provider.id).toBe('hashing-local');
  });

  it('informa de modelo on-device cuando se inyecta uno', () => {
    const provider = new HashingEmbeddingProvider(384);
    // Se simula un proveedor semántico con identificador distinto al léxico.
    const semantico = {
      ...provider,
      id: 'edge-llm-mediapipe',
      embed: provider.embed.bind(provider),
      embedBatch: provider.embedBatch.bind(provider),
    };
    const app = services({
      provider: semantico,
      onDeviceModel: true,
      degradedReason: null,
    });

    expect(app.embedding.onDeviceModel).toBe(true);
    expect(app.embedding.provider.id).toBe('edge-llm-mediapipe');
  });

  it('propaga el motivo de degradación a la UI', () => {
    const app = services({
      provider: new HashingEmbeddingProvider(256),
      onDeviceModel: false,
      degradedReason: 'El módulo nativo no expone embed.',
    });

    expect(app.embedding.degradedReason).toContain('no expone embed');
  });
});
