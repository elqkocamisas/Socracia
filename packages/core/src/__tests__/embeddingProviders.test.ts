import { HashingEmbeddingProvider } from '../rag/embeddings';
import {
  DelegatingEmbeddingProvider,
  type DelegatingProviderOptions,
} from '../rag/delegatingProvider';
import { FallbackEmbeddingProvider } from '../rag/fallbackProvider';
import { InMemoryVectorStore } from '../rag/vectorStore';
import { RagEngine } from '../rag/engine';

/** Motor falso que devuelve vectores de la dimensión pedida, sin red ni nativo. */
function fakeEngine(dimensions: number, calls: string[][] = []) {
  return async (texts: readonly string[]): Promise<readonly number[][]> => {
    calls.push([...texts]);
    return texts.map(() => new Array<number>(dimensions).fill(1));
  };
}

function makeProvider(overrides: Partial<DelegatingProviderOptions> = {}) {
  return new DelegatingEmbeddingProvider({
    id: 'motor-falso',
    dimensions: 384,
    isOnDevice: true,
    embed: fakeEngine(384),
    ...overrides,
  });
}

describe('DelegatingEmbeddingProvider', () => {
  it('expone los metadatos configurados', () => {
    const provider = makeProvider();
    expect(provider.id).toBe('motor-falso');
    expect(provider.dimensions).toBe(384);
    expect(provider.isOnDevice).toBe(true);
  });

  it('lanza si la dimensión declarada no es positiva', () => {
    expect(() => makeProvider({ dimensions: 0 })).toThrow('dimensions debe ser > 0');
  });

  it('devuelve los vectores del motor en orden', async () => {
    const provider = new DelegatingEmbeddingProvider({
      id: 'motor-falso',
      dimensions: 3,
      isOnDevice: true,
      embed: async (texts) => texts.map((text) => [text.length, 0, 0]),
    });

    const result = await provider.embedBatch(['a', 'bbb']);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual([
        [1, 0, 0],
        [3, 0, 0],
      ]);
    }
  });

  it('no llama al motor si la lista de textos está vacía', async () => {
    const calls: string[][] = [];
    const provider = makeProvider({ embed: fakeEngine(384, calls) });

    const result = await provider.embedBatch([]);
    expect(result.ok).toBe(true);
    expect(calls).toHaveLength(0);
  });

  it('convierte una excepción del motor en un Result fallido', async () => {
    const provider = makeProvider({
      embed: async () => {
        throw new Error('TextEmbedder not initialized');
      },
    });

    const result = await provider.embed('cualquiera');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('TextEmbedder');
    }
  });

  it('rechaza vectores de dimensión distinta a la declarada', async () => {
    // Un vector corto rompería la búsqueda coseno más adelante, donde el error
    // ya no sería interpretable; aquí se detecta en el borde.
    const provider = makeProvider({ embed: fakeEngine(5) });

    const result = await provider.embed('cualquiera');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('5 dimensiones');
      expect(result.error.message).toContain('384');
    }
  });

  it('rechaza un número de vectores distinto al de textos', async () => {
    const provider = makeProvider({
      embed: async () => [[0, 0, 0]],
    });

    const result = await provider.embedBatch(['a', 'b']);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('1 vectores para 2 textos');
    }
  });

  it('copia los vectores para que nadie los mute por referencia', async () => {
    const shared = [1, 2, 3];
    const provider = new DelegatingEmbeddingProvider({
      id: 'motor-falso',
      dimensions: 3,
      isOnDevice: true,
      embed: async () => [shared],
    });

    const result = await provider.embed('x');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).not.toBe(shared);
      expect(result.value).toEqual(shared);
    }
  });

  it('alimenta el almacén vectorial y permite recuperar', async () => {
    // Verifica que el adaptador sirve de verdad para el RAG, no solo su contrato.
    const provider = new DelegatingEmbeddingProvider({
      id: 'motor-falso',
      dimensions: 2,
      isOnDevice: true,
      embed: async (texts) => texts.map((text) => (text.includes('alzada') ? [1, 0] : [0, 1])),
    });
    const store = new InMemoryVectorStore();
    const engine = new RagEngine(store, provider);

    const indexed = await engine.indexDocument(
      {
        id: 'd1',
        title: 't',
        mimeType: 'text/plain',
        sourceKind: 'document',
        uri: 'u',
        sizeBytes: 0,
        ingestedAt: 0,
        cloudConsent: false,
      },
      'El recurso de alzada se interpone ante el superior jerárquico. La licitación adjudica contratos.',
    );
    expect(indexed.ok).toBe(true);

    const hits = await engine.retrieve('recurso de alzada', 1);
    expect(hits.ok).toBe(true);
    if (hits.ok) {
      expect(hits.value[0]?.chunk.text).toContain('alzada');
    }
  });
});

describe('FallbackEmbeddingProvider', () => {
  it('usa el proveedor principal cuando funciona', async () => {
    const primary = makeProvider();
    const fallback = new HashingEmbeddingProvider(256);
    const provider = new FallbackEmbeddingProvider(primary, fallback);

    const result = await provider.embed('hola');
    expect(result.ok).toBe(true);
    expect(provider.id).toBe('motor-falso');
    expect(provider.isDegraded).toBe(false);
    expect(provider.degradedFrom).toBeNull();
  });

  it('degrada al proveedor de reserva si el principal falla', async () => {
    const primary = makeProvider({
      embed: async () => {
        throw new Error('modelo no descargado');
      },
    });
    const fallback = new HashingEmbeddingProvider(256);
    const provider = new FallbackEmbeddingProvider(primary, fallback);

    const result = await provider.embed('recurso de alzada');
    expect(result.ok).toBe(true);
    expect(provider.isDegraded).toBe(true);
    expect(provider.id).toBe('hashing-local');
    expect(provider.dimensions).toBe(256);
    expect(provider.degradedFrom?.reason).toContain('modelo no descargado');
  });

  it('no reintenta el principal tras degradar, para no mezclar dimensiones', async () => {
    let llamadas = 0;
    const primary = makeProvider({
      embed: async () => {
        llamadas += 1;
        throw new Error('falla siempre');
      },
    });
    const provider = new FallbackEmbeddingProvider(primary, new HashingEmbeddingProvider(256));

    await provider.embed('uno');
    await provider.embed('dos');
    expect(llamadas).toBe(1);
    expect(provider.isDegraded).toBe(true);
  });

  it('devuelve el error de la reserva si el principal y la reserva fallan', async () => {
    const primary = makeProvider({
      embed: async () => {
        throw new Error('falla');
      },
    });
    const provider = new FallbackEmbeddingProvider(primary, {
      id: 'reserva-rota',
      dimensions: 256,
      isOnDevice: true,
      embed: async () => ({ ok: false, error: new Error('reserva rota') }),
      embedBatch: async () => ({ ok: false, error: new Error('reserva rota') }),
    });

    const result = await provider.embedBatch(['x']);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('reserva rota');
    }
    expect(provider.id).toBe('reserva-rota');
  });

  it('conserva la dimensión coherente con el proveedor activo', async () => {
    const primary = makeProvider();
    const fallback = new HashingEmbeddingProvider(128);
    const provider = new FallbackEmbeddingProvider(primary, fallback);

    expect(provider.dimensions).toBe(384);
    await provider.embed('x');
    expect(provider.dimensions).toBe(384);

    const degradado = new FallbackEmbeddingProvider(
      makeProvider({
        embed: async () => {
          throw new Error('sin modelo');
        },
      }),
      new HashingEmbeddingProvider(128),
    );
    await degradado.embed('x');
    expect(degradado.dimensions).toBe(128);
  });
});
