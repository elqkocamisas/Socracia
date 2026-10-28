/**
 * Primitivas vectoriales para similitud semántica.
 *
 * Se mantienen puras y sin dependencias: son la base del almacén vectorial
 * local (RAG on-device) y se reutilizan tanto en el motor como en la UI.
 */

/** Vector denso de embeddings. */
export type Vector = readonly number[];

/** Producto escalar de dos vectores de la misma dimensión. */
export function dot(a: Vector, b: Vector): number {
  assertSameDimension(a, b);
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) {
    sum += (a[i] as number) * (b[i] as number);
  }
  return sum;
}

/** Norma euclídea (L2) de un vector. */
export function norm(a: Vector): number {
  return Math.sqrt(dot(a, a));
}

/** Similitud coseno en el rango [-1, 1]. Devuelve 0 si algún vector es nulo. */
export function cosineSimilarity(a: Vector, b: Vector): number {
  assertSameDimension(a, b);
  const denominator = norm(a) * norm(b);
  if (denominator === 0) {
    return 0;
  }
  return dot(a, b) / denominator;
}

/** Devuelve el vector normalizado (norma 1). Un vector nulo se devuelve igual. */
export function normalize(a: Vector): number[] {
  const length = norm(a);
  if (length === 0) {
    return [...a];
  }
  return a.map((value) => value / length);
}

function assertSameDimension(a: Vector, b: Vector): void {
  if (a.length !== b.length) {
    throw new Error(`Dimensión incompatible: ${a.length} vs ${b.length}`);
  }
}
