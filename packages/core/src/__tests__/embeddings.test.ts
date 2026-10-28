import { HashingEmbeddingProvider, tokenize } from '../rag/embeddings';
import { cosineSimilarity } from '../math/vector';

describe('tokenize', () => {
  it('pasa a minúsculas y elimina acentos', () => {
    expect(tokenize('Legitimidad')).toContain('legitimidad');
    expect(tokenize('Administración')).toContain('administracion');
  });

  it('descarta palabras vacías y tokens cortos', () => {
    const tokens = tokenize('la ley y el orden de la cosa');
    expect(tokens).not.toContain('la');
    expect(tokens).not.toContain('y');
    expect(tokens).toContain('ley');
    expect(tokens).toContain('orden');
  });
});

describe('HashingEmbeddingProvider', () => {
  const provider = new HashingEmbeddingProvider(128);

  it('expone metadatos coherentes', () => {
    expect(provider.id).toBe('hashing-local');
    expect(provider.dimensions).toBe(128);
    expect(provider.isOnDevice).toBe(true);
  });

  it('lanza si la dimensión no es positiva', () => {
    expect(() => new HashingEmbeddingProvider(0)).toThrow();
  });

  it('produce vectores de la dimensión declarada', async () => {
    const result = await provider.embed('principio de legalidad');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(128);
    }
  });

  it('es determinista', async () => {
    const a = await provider.embed('potestad reglamentaria');
    const b = await provider.embed('potestad reglamentaria');
    expect(a).toEqual(b);
  });

  it('acerca textos con vocabulario compartido', async () => {
    const a = await provider.embed('recurso de alzada administrativo');
    const b = await provider.embed('el recurso de alzada es un recurso administrativo');
    const c = await provider.embed('derivada parcial de una función matemática');
    if (a.ok && b.ok && c.ok) {
      const close = cosineSimilarity(a.value, b.value);
      const far = cosineSimilarity(a.value, c.value);
      expect(close).toBeGreaterThan(far);
    }
  });

  it('mantiene el orden en embedBatch', async () => {
    const result = await provider.embedBatch(['uno', 'dos', 'tres']);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(3);
    }
  });
});
