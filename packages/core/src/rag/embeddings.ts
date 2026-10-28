import type { Result } from '../result';

/**
 * Proveedor de embeddings intercambiable.
 *
 * Abstrae el motor de cálculo para poder alternar entre RAG on-device
 * (MediaPipe BERT / EmbeddingGemma vía módulo nativo) y RAG en backend
 * sin reescribir el motor mayéutico ni el almacén vectorial.
 */
export interface EmbeddingProvider {
  /** Identificador del proveedor, p. ej. `mediapipe-bert` o `backend-remote`. */
  readonly id: string;
  /** Dimensión de los vectores que produce. */
  readonly dimensions: number;
  /** `true` si el cálculo ocurre íntegramente en el dispositivo. */
  readonly isOnDevice: boolean;
  /** Calcula el embedding de un texto. */
  embed(text: string): Promise<Result<number[]>>;
  /** Calcula embeddings por lotes; el orden de salida coincide con la entrada. */
  embedBatch(texts: readonly string[]): Promise<Result<number[][]>>;
}

/**
 * Proveedor determinista basado en hashing de tokens.
 *
 * No requiere módulos nativos y sirve como (a) valor por defecto para pruebas
 * y desarrollo, y (b) red de seguridad si el modelo on-device no está
 * disponible. No pretende igualar la calidad semántica de un modelo real.
 */
export class HashingEmbeddingProvider implements EmbeddingProvider {
  public readonly id = 'hashing-local';
  public readonly dimensions: number;
  public readonly isOnDevice = true;

  public constructor(dimensions = 256) {
    if (dimensions <= 0) {
      throw new Error('dimensions debe ser > 0');
    }
    this.dimensions = dimensions;
  }

  public async embed(text: string): Promise<Result<number[]>> {
    return { ok: true, value: this.embedSync(text) };
  }

  public async embedBatch(texts: readonly string[]): Promise<Result<number[][]>> {
    return { ok: true, value: texts.map((text) => this.embedSync(text)) };
  }

  /** Variante síncrona, útil en pruebas y en rutas de cálculo sin I/O. */
  public embedSync(text: string): number[] {
    const vector = new Array<number>(this.dimensions).fill(0);
    for (const token of tokenize(text)) {
      const index = hash(token) % this.dimensions;
      vector[index] = (vector[index] as number) + 1;
    }
    return vector;
  }
}

const STOP_WORDS = new Set([
  'de',
  'la',
  'el',
  'los',
  'las',
  'un',
  'una',
  'unos',
  'unas',
  'y',
  'o',
  'que',
  'en',
  'a',
  'por',
  'para',
  'con',
  'del',
  'al',
  'se',
  'es',
  'son',
  'como',
  'su',
  'sus',
]);

/** Tokeniza en minúsculas, sin acentos y descartando palabras vacías. */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/[^a-z0-9ñ]+/)
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token));
}

function hash(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}
