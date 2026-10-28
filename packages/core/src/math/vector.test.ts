import { cosineSimilarity, dot, norm, normalize, type Vector } from './vector';

describe('vector', () => {
  const a: Vector = [1, 2, 3];
  const b: Vector = [4, 5, 6];

  it('calcula el producto escalar', () => {
    expect(dot(a, b)).toBe(32);
  });

  it('calcula la norma euclídea', () => {
    expect(norm([3, 4])).toBe(5);
  });

  it('devuelve similitud coseno 1 para vectores paralelos', () => {
    expect(cosineSimilarity([1, 1], [2, 2])).toBeCloseTo(1, 10);
  });

  it('devuelve similitud coseno 0 para vectores ortogonales', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 10);
  });

  it('devuelve 0 si algún vector es nulo', () => {
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
  });

  it('normaliza a norma 1', () => {
    expect(norm(normalize([3, 4]))).toBeCloseTo(1, 10);
  });

  it('mantiene los vectores nulos al normalizar', () => {
    expect(normalize([0, 0])).toEqual([0, 0]);
  });

  it('lanza error si las dimensiones no coinciden', () => {
    expect(() => cosineSimilarity([1], [1, 2])).toThrow(/Dimensión incompatible/);
  });
});
