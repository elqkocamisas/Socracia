import type {
  Citation,
  Concept,
  KnowledgeChunk,
  KnowledgeDocument,
  SocraticQuestion,
} from '../domain/types';
import type { Result } from '../result';
import { chunkText, type ChunkOptions, DEFAULT_CHUNK_OPTIONS } from './chunking';
import { embedChunks, type SearchHit, type VectorStore } from './vectorStore';
import type { EmbeddingProvider } from './embeddings';
import { generateQuestions, type GenerateQuestionsOptions } from '../mayeu/questionGenerator';

/** Opciones de recuperación con umbral de relevancia. */
export interface RelevanceOptions {
  /** Número máximo de fragmentos a devolver. */
  readonly topK: number;
  /** Similitud coseno mínima para aceptar un fragmento como fuente. */
  readonly minScore: number;
}

/**
 * Umbral por defecto, fijado con datos del corpus de ejemplo.
 *
 * Medido con `HashingEmbeddingProvider`: las recuperaciones correctas con
 * vocabulario compartido puntúan 0.26–0.55, mientras que las paráfrasis sin
 * vocabulario común caen a 0.08–0.18. Un umbral de 0.2 separa ambos grupos.
 * Con un proveedor semántico real habrá que recalibrarlo; por eso es un
 * parámetro y no una constante escondida.
 */
export const DEFAULT_RELEVANCE: RelevanceOptions = { topK: 4, minScore: 0.2 };

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

  /**
   * Ingesta un documento: trocea, vectoriza e indexa.
   *
   * Devuelve el número de fragmentos indexados, por compatibilidad con los
   * llamantes que solo necesitan el conteo. Quien deba persistirlos para
   * reconstruir el índice al arrancar usa `indexDocument`.
   */
  public async ingestDocument(
    document: KnowledgeDocument,
    rawText: string,
    options: ChunkOptions = DEFAULT_CHUNK_OPTIONS,
  ): Promise<Result<number>> {
    const indexed = await this.indexDocument(document, rawText, options);
    if (!indexed.ok) {
      return indexed;
    }
    return { ok: true, value: indexed.value.length };
  }

  /**
   * Trocea, vectoriza e indexa un documento devolviendo los fragmentos.
   *
   * El llamante puede guardarlos para reconstruir el índice en el siguiente
   * arranque sin releer el archivo original (ver `rehydrate`).
   */
  public async indexDocument(
    document: KnowledgeDocument,
    rawText: string,
    options: ChunkOptions = DEFAULT_CHUNK_OPTIONS,
  ): Promise<Result<readonly KnowledgeChunk[]>> {
    const chunks = chunkText(document.id, rawText, options);
    if (chunks.length === 0) {
      return { ok: true, value: [] };
    }
    try {
      const embedded = await embedChunks(chunks, this.provider);
      this.store.add(embedded);
      return { ok: true, value: chunks };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error : new Error(String(error)) };
    }
  }

  /**
   * Reconstruye el índice vectorial a partir de fragmentos ya persistidos.
   *
   * Los embeddings no se guardan: se recalculan aquí, en el dispositivo. Así el
   * texto del usuario nunca sale de la app y el índice sobrevive al reinicio.
   */
  public async rehydrate(chunks: readonly KnowledgeChunk[]): Promise<Result<number>> {
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
    minScore = DEFAULT_RELEVANCE.minScore,
  ): Promise<Result<SocraticQuestion[]>> {
    const query = `${concept.label} ${concept.definition} ${concept.keywords.join(' ')}`.trim();
    const hits = await this.retrieveRelevant(query, { topK, minScore });
    if (!hits.ok) {
      return hits;
    }
    // Sin fragmento suficientemente relevante no se inventa la pregunta: es
    // preferible devolver cero que citar una fuente que no respalda el contenido.
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

  /**
   * Recupera solo fragmentos con relevancia suficiente.
   *
   * Existe porque una búsqueda devuelve siempre `topK` resultados aunque no se
   * parezcan en nada a la consulta: medido con paráfrasis sin vocabulario común,
   * la similitud baja a 0.08–0.16, que es ruido. Sin este umbral, el motor
   * citaría como fuente un fragmento irrelevante y el alumno recibiría una
   * pregunta atribuida a un texto que no la respalda.
   */
  public async retrieveRelevant(
    query: string,
    options: RelevanceOptions = DEFAULT_RELEVANCE,
  ): Promise<Result<SearchHit[]>> {
    const hits = await this.retrieve(query, options.topK);
    if (!hits.ok) {
      return hits;
    }
    return { ok: true, value: hits.value.filter((hit) => hit.score >= options.minScore) };
  }

  /** Elimina del índice todos los fragmentos de un documento. */
  public removeDocument(documentId: string): void {
    this.store.removeDocument(documentId);
  }
}
