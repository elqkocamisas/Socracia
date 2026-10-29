import type { Result } from '../result';
import { err, ok } from '../result';
import type { EmbeddingProvider } from './embeddings';
import { DelegatingEmbeddingProvider } from './delegatingProvider';

/**
 * Superficie del módulo nativo que se espera de `edge-llm` (MediaPipe).
 *
 * Se declara aquí, en lugar de importar el paquete, para que este fichero no
 * dependa de un módulo nativo: así se puede probar en Node y el núcleo sigue
 * siendo agnóstico de la plataforma.
 */
export interface EdgeLlmNativeModule {
  /**
   * Calcula el vector completo de un texto.
   *
   * Es la forma que necesita el RAG. La versión 0.1.4 del paquete **no la
   * expone** (ver `describeEdgeLlmSupport`), así que hoy el sondeo falla y la
   * app degrada al proveedor léxico.
   */
  embed?(text: string): Promise<unknown>;
}

/** Diagnóstico de lo que ofrece el módulo nativo instalado. */
export interface EdgeLlmSupport {
  readonly supported: boolean;
  /** Motivo legible cuando `supported` es `false`. */
  readonly reason: string;
  /** Métodos detectados en el módulo, útil para registrar el estado. */
  readonly detected: readonly string[];
}

/**
 * Inspecciona el módulo nativo y explica si sirve para el RAG.
 *
 * Existe porque la documentación de `edge-llm` promete embeddings de 384
 * dimensiones, pero la implementación real no los entrega: en iOS el módulo es
 * la plantilla de Expo (solo `hello` y `setValueAsync`) y en Android
 * `embedTest` devuelve `{ length, sample }` con **solo 5 valores**
 * (`vector.take(5)`), no el vector completo. Sin este diagnóstico, la app
 * generaría preguntas con vectores inservibles sin explicar por qué.
 */
export function describeEdgeLlmSupport(nativeModule: EdgeLlmNativeModule | null): EdgeLlmSupport {
  if (!nativeModule) {
    return {
      supported: false,
      reason: 'El módulo nativo edge-llm no está instalado en esta compilación.',
      detected: [],
    };
  }

  const detected = Object.keys(nativeModule).filter(
    (key) => typeof (nativeModule as Record<string, unknown>)[key] !== 'undefined',
  );

  if (typeof nativeModule.embed === 'function') {
    return { supported: true, reason: '', detected };
  }

  return {
    supported: false,
    reason:
      'El módulo edge-llm instalado no expone un método `embed` que devuelva el ' +
      'vector completo; solo `embedTest`, que devuelve 5 de 384 dimensiones. ' +
      'Se usará recuperación léxica local mientras no se parchee el módulo nativo.',
    detected,
  };
}

/** Opciones de la fábrica del proveedor on-device. */
export interface EdgeLlmProviderOptions {
  /** Módulo nativo; normalmente `require('edge-llm').default`. */
  readonly nativeModule: EdgeLlmNativeModule | null;
  /** Identificador del proveedor. */
  readonly id?: string;
  /** Dimensión esperada de los vectores (BERT de MediaPipe: 384). */
  readonly dimensions?: number;
  /** Texto de sondeo; comprueba la dimensión antes de aceptar el proveedor. */
  readonly probeText?: string;
}

/**
 * Construye un `EmbeddingProvider` sobre el módulo nativo `edge-llm`.
 *
 * Sondea el módulo antes de aceptarlo: un proveedor que devolviese vectores de
 * dimensión distinta a la declarada rompería la búsqueda coseno más adelante,
 * donde el fallo ya no sería interpretable. Si el módulo no sirve, devuelve un
 * error explícito para que el llamante degrade al proveedor léxico en lugar de
 * arrancar con un índice corrupto.
 */
export async function createEdgeLlmProvider(
  options: EdgeLlmProviderOptions,
): Promise<Result<EmbeddingProvider>> {
  const dimensions = options.dimensions ?? 384;
  const support = describeEdgeLlmSupport(options.nativeModule);
  if (!support.supported || !options.nativeModule?.embed) {
    return err(new Error(support.reason));
  }

  const nativeEmbed = options.nativeModule.embed;
  const provider = new DelegatingEmbeddingProvider({
    id: options.id ?? 'edge-llm-mediapipe',
    dimensions,
    isOnDevice: true,
    embed: async (texts) => {
      const vectors: number[][] = [];
      for (const text of texts) {
        const raw = await nativeEmbed(text);
        const vector = toVector(raw);
        if (vector === null) {
          throw new Error('El módulo nativo devolvió un valor que no es un vector de números.');
        }
        vectors.push(vector);
      }
      return vectors;
    },
  });

  // Sondeo real: confirma la dimensión con una llamada, no solo con la forma.
  const probe = await provider.embed(options.probeText ?? 'sondeo de dimensiones');
  if (!probe.ok) {
    return err(probe.error);
  }

  return ok(provider);
}

/** Normaliza la respuesta nativa a un vector, o `null` si no lo es. */
function toVector(raw: unknown): number[] | null {
  if (Array.isArray(raw) && raw.every((value) => typeof value === 'number')) {
    return [...(raw as number[])];
  }
  // `{ length, sample }` (lo que devuelve `embedTest` en edge-llm 0.1.4).
  if (typeof raw === 'object' && raw !== null) {
    const record = raw as { sample?: unknown };
    if (Array.isArray(record.sample) && record.sample.every((v) => typeof v === 'number')) {
      return [...(record.sample as number[])];
    }
  }
  return null;
}
