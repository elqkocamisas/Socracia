import type { Result } from '../result';
import type { EmbeddingProvider } from './embeddings';

/** Motivo por el que se abandonó el proveedor principal. */
export interface EmbeddingDegradation {
  readonly from: string;
  readonly to: string;
  readonly reason: string;
}

/**
 * Usa un proveedor y, si falla, continúa con otro sin interrumpir al usuario.
 *
 * `docs/rag-strategy.md` promete degradar con elegancia cuando el modelo
 * on-device no está disponible (dispositivo sin soporte, modelo sin descargar).
 * Este envoltorio lo cumple.
 *
 * La degradación es **permanente dentro de la sesión**: si un lote se calculase
 * con un proveedor y el siguiente con otro, el índice mezclaría vectores de
 * distinta dimensión y la búsqueda coseno lanzaría. Es preferible una
 * recuperación peor pero coherente.
 */
export class FallbackEmbeddingProvider implements EmbeddingProvider {
  private active: EmbeddingProvider;
  private degradation: EmbeddingDegradation | null = null;

  /** Proveedor preferente, antes de cualquier degradación. */
  public readonly primary: EmbeddingProvider;
  /** Proveedor de reserva al que se degrada. */
  public readonly fallback: EmbeddingProvider;

  public constructor(primary: EmbeddingProvider, fallback: EmbeddingProvider) {
    this.primary = primary;
    this.fallback = fallback;
    this.active = primary;
  }

  public get id(): string {
    return this.active.id;
  }

  public get dimensions(): number {
    return this.active.dimensions;
  }

  public get isOnDevice(): boolean {
    return this.active.isOnDevice;
  }

  /** `true` si se abandonó el proveedor principal. */
  public get isDegraded(): boolean {
    return this.degradation !== null;
  }

  /** Detalle de la degradación, para mostrarlo o registrarlo. */
  public get degradedFrom(): EmbeddingDegradation | null {
    return this.degradation;
  }

  public async embed(text: string): Promise<Result<number[]>> {
    return this.attempt((provider) => provider.embed(text));
  }

  public async embedBatch(texts: readonly string[]): Promise<Result<number[][]>> {
    return this.attempt((provider) => provider.embedBatch(texts));
  }

  private async attempt<T>(
    operation: (provider: EmbeddingProvider) => Promise<Result<T>>,
  ): Promise<Result<T>> {
    const result = await operation(this.active);
    if (result.ok || this.degradation !== null) {
      return result;
    }
    this.degradation = {
      from: this.active.id,
      to: this.fallback.id,
      reason: result.error.message,
    };
    this.active = this.fallback;
    return operation(this.fallback);
  }
}
