import type { Result } from '../result';
import type { EmbeddingProvider } from './embeddings';

/**
 * Opciones de un proveedor que delega el cálculo en un motor externo.
 *
 * `embed` recibe varios textos y devuelve sus vectores en el mismo orden. Se
 * permite que **lance**: los módulos nativos y los clientes HTTP fallan así, y
 * convertir esa excepción en `Result` es justo lo que hace este adaptador.
 */
export interface DelegatingProviderOptions {
  /** Identificador del proveedor, p. ej. `mediapipe-bert` o `backend-remote`. */
  readonly id: string;
  /** Dimensión que debe tener cada vector devuelto por `embed`. */
  readonly dimensions: number;
  /** `true` si el cálculo ocurre íntegramente en el dispositivo. */
  readonly isOnDevice: boolean;
  /** Motor real de cálculo. */
  readonly embed: (texts: readonly string[]) => Promise<readonly (readonly number[])[]>;
}

/**
 * Adapta un motor de embeddings externo a la interfaz `EmbeddingProvider`.
 *
 * Existe para que ni el motor mayéutico ni el almacén vectorial tengan que
 * saber si detrás hay un módulo nativo (`edge-llm`/MediaPipe) o un servicio en
 * nube: ambos se enchufan aquí. Su trabajo es no dejar pasar datos corruptos,
 * porque un vector de dimensión distinta a la declarada rompería la búsqueda
 * coseno mucho más lejos, donde el error ya no es interpretable.
 */
export class DelegatingEmbeddingProvider implements EmbeddingProvider {
  public readonly id: string;
  public readonly dimensions: number;
  public readonly isOnDevice: boolean;

  private readonly engine: DelegatingProviderOptions['embed'];

  public constructor(options: DelegatingProviderOptions) {
    if (options.dimensions <= 0) {
      throw new Error('dimensions debe ser > 0');
    }
    this.id = options.id;
    this.dimensions = options.dimensions;
    this.isOnDevice = options.isOnDevice;
    this.engine = options.embed;
  }

  public async embed(text: string): Promise<Result<number[]>> {
    const batch = await this.embedBatch([text]);
    if (!batch.ok) {
      return batch;
    }
    return { ok: true, value: batch.value[0] as number[] };
  }

  public async embedBatch(texts: readonly string[]): Promise<Result<number[][]>> {
    if (texts.length === 0) {
      return { ok: true, value: [] };
    }
    let vectors: readonly (readonly number[])[];
    try {
      vectors = await this.engine(texts);
    } catch (error) {
      return { ok: false, error: toError(error) };
    }

    if (vectors.length !== texts.length) {
      return {
        ok: false,
        error: new Error(
          `El motor devolvió ${vectors.length} vectores para ${texts.length} textos.`,
        ),
      };
    }

    const invalid = vectors.findIndex((vector) => vector.length !== this.dimensions);
    if (invalid >= 0) {
      return {
        ok: false,
        error: new Error(
          `El motor devolvió un vector de ${vectors[invalid]?.length} dimensiones en la ` +
            `posición ${invalid}; se esperaban ${this.dimensions}.`,
        ),
      };
    }

    return { ok: true, value: vectors.map((vector) => [...vector]) };
  }
}

/** Convierte cualquier valor lanzado en un `Error`, para no perder el mensaje. */
export function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
