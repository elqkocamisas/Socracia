import type { Citation, Concept, KnowledgeDocument, SocraticQuestion } from '../domain/types';
import type { Result } from '../result';
import { chunkText, type ChunkOptions, DEFAULT_CHUNK_OPTIONS } from './chunking';
import { embedChunks, type SearchHit, type VectorStore } from './vectorStore';
import type { EmbeddingProvider } from './embeddings';
import { generateQuestions, type GenerateQuestionsOptions } from '../mayeu/questionGenerator';

/**
 * Motor RAG del MVP.
 *
 * Orquesta ingesta (chunking + embeddings + indexado) y recuperación
 * (búsqueda semántica + generación de preguntas con cita de la fuente).
 * Depende solo de interfaces, por lo que funciona igual con RAG on-device
 * que con RAG en backend.
 */
export class RagEngine {
  public constructor(
    private readonly store: VectorStore,
    private readonly provider: EmbeddingProvider,
  ) {}

  /** Ingesta un documento: trocea, vectoriza e indexa. */
  public async ingestDocument(
    document: KnowledgeDocument,
    rawText: string,
    options: ChunkOptions = DEFAULT_CHUNK_OPTIONS,
  ): Promise<Result<number>> {
    const chunks = chunkText(document.id, rawText, options);
    if (chunks.length === 0) {
      return { ok: true, value: 0 };
    }
    try {
      const embedded = await embedChunks(chunks, this.provider);
      this.store.add(embedded);
      return { ok: true, value: embedded.length };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error : new Error(String(error)) };
    }
  }

  /** Recupera los fragmentos más relevantes para una consulta. */
  public async retrieve(query: string, topK = 4): Promise<Result<SearchHit[]>> {
    const embedding = await this.provider.embed(query);
    if (!embedding.ok) {
      return embedding;
    }
    return { ok: true, value: this.store.search(embedding.value, topK) };
  }

  /**
   * Genera preguntas mayéuticas a partir del contenido recuperado para un
   * concepto, adjuntando la cita exacta del fragmento fuente.
   */
  public async generateConceptQuestions(
    concept: Concept,
    documents: readonly KnowledgeDocument[],
    options: GenerateQuestionsOptions,
    topK = 1,
  ): Promise<Result<SocraticQuestion[]>> {
    const query = `${concept.label} ${concept.definition} ${concept.keywords.join(' ')}`.trim();
    const hits = await this.retrieve(query, topK);
    if (!hits.ok) {
      return hits;
    }
    const hit = hits.value[0];
    if (!hit) {
      return { ok: true, value: [] };
    }
    const documentTitle =
      documents.find((document) => document.id === hit.chunk.documentId)?.title ??
      hit.chunk.documentId;

    const citation: Citation = {
      documentId: hit.chunk.documentId,
      documentTitle,
      chunkId: hit.chunk.id,
      excerpt: hit.chunk.text.slice(0, 240),
      charStart: hit.chunk.charStart,
      charEnd: hit.chunk.charEnd,
    };

    return { ok: true, value: generateQuestions(concept, citation, options) };
  }

  /** Número de fragmentos indexados. */
  public indexedChunks(): number {
    return this.store.size();
  }
}
