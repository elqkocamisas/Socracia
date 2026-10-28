import type { EmbeddedChunk, KnowledgeChunk } from '../domain/types';
import { cosineSimilarity } from '../math/vector';
import type { EmbeddingProvider } from './embeddings';

/** Resultado de una búsqueda semántica. */
export interface SearchHit {
  readonly chunk: KnowledgeChunk;
  /** Similitud coseno en [-1, 1]. */
  readonly score: number;
}

/**
 * Almacén vectorial en memoria, apto para el MVP on-device.
 *
 * Se mantiene deliberadamente simple (búsqueda lineal con similitud coseno)
 * porque el corpus de un temario cabe holgadamente en memoria. La interfaz
 * `VectorStore` permite sustituirlo por SQLite + extensión vectorial o por
 * un índice ANN sin tocar el resto del sistema.
 */
export interface VectorStore {
  /** Añade fragmentos ya vectorizados. */
  add(entries: readonly EmbeddedChunk[]): void;
  /** Busca los `topK` fragmentos más similares a la consulta. */
  search(queryEmbedding: readonly number[], topK: number): SearchHit[];
  /** Número de fragmentos indexados. */
  size(): number;
  /** Elimina todos los fragmentos de un documento. */
  removeDocument(documentId: string): void;
  /** Lista los fragmentos indexados (para depuración y pruebas). */
  all(): readonly EmbeddedChunk[];
}

export class InMemoryVectorStore implements VectorStore {
  private entries: EmbeddedChunk[] = [];

  public add(newEntries: readonly EmbeddedChunk[]): void {
    this.entries = [...this.entries, ...newEntries];
  }

  public search(queryEmbedding: readonly number[], topK: number): SearchHit[] {
    if (topK <= 0) {
      return [];
    }
    return this.entries
      .map((entry) => ({
        chunk: entry.chunk,
        score: cosineSimilarity(queryEmbedding, entry.embedding),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }

  public size(): number {
    return this.entries.length;
  }

  public removeDocument(documentId: string): void {
    this.entries = this.entries.filter((entry) => entry.chunk.documentId !== documentId);
  }

  public all(): readonly EmbeddedChunk[] {
    return this.entries;
  }
}

/** Vectoriza fragmentos usando el proveedor indicado. */
export async function embedChunks(
  chunks: readonly KnowledgeChunk[],
  provider: EmbeddingProvider,
): Promise<EmbeddedChunk[]> {
  const result = await provider.embedBatch(chunks.map((chunk) => chunk.text));
  if (!result.ok) {
    throw result.error;
  }
  return chunks.map((chunk, index) => ({
    chunk,
    embedding: result.value[index] ?? [],
  }));
}
