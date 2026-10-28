import type { KnowledgeDocument, Timestamp } from '../domain/types';
import type { Result } from '../result';
import { err, ok } from '../result';
import type { RagEngine } from '../rag/engine';
import type { ChunkOptions } from '../rag/chunking';
import { DEFAULT_CHUNK_OPTIONS } from '../rag/chunking';
import type { IngestError } from './extractors';
import type { ExtractorRegistry } from './extractors';

/** Datos de un documento que el usuario adjunta desde la app. */
export interface DocumentInput {
  readonly fileName: string;
  readonly mimeType: string;
  /** Contenido binario tal cual lo entrega el selector de archivos. */
  readonly bytes: Uint8Array;
  readonly uri: string;
}

/** Opciones de ingesta. */
export interface IngestOptions {
  readonly chunkOptions: ChunkOptions;
  /** Autorización explícita del usuario para procesar fuera del dispositivo. */
  readonly cloudConsent: boolean;
  /** Sobrescribe el título mostrado; por defecto se usa el nombre del archivo. */
  readonly title?: string;
  /** Identificador y marca temporal inyectados para que el servicio sea determinista. */
  readonly id: string;
  readonly now: Timestamp;
}

/** Resultado de una ingesta correcta. */
export interface IngestResult {
  readonly document: KnowledgeDocument;
  /** Texto extraído y normalizado, listo para mostrar o reindexar. */
  readonly text: string;
  readonly chunkCount: number;
}

/** Servicio de ingesta: convierte bytes de un archivo en un documento indexado. */
export class DocumentIngestionService {
  public constructor(
    private readonly registry: ExtractorRegistry,
    private readonly rag: RagEngine,
  ) {}

  /**
   * Extrae el texto, crea el registro del documento y lo indexa en el RAG.
   *
   * No escribe en disco ni sube nada: recibe bytes y devuelve el documento
   * listo para persistir. La privacidad queda así en manos de quien llama.
   */
  public async ingest(
    input: DocumentInput,
    options: IngestOptions,
  ): Promise<Result<IngestResult, IngestError>> {
    const extracted = this.registry.extract(input.mimeType, input.fileName, input.bytes);
    if (!extracted.ok) {
      return extracted;
    }

    const document: KnowledgeDocument = {
      id: options.id,
      title: options.title ?? stripExtension(input.fileName),
      mimeType: input.mimeType,
      sourceKind: 'document',
      uri: input.uri,
      sizeBytes: input.bytes.length,
      ingestedAt: options.now,
      cloudConsent: options.cloudConsent,
    };

    const indexed = await this.rag.ingestDocument(
      document,
      extracted.value,
      options.chunkOptions ?? DEFAULT_CHUNK_OPTIONS,
    );
    if (!indexed.ok) {
      return err<IngestError>({
        code: 'extraccion-fallida',
        message: indexed.error.message,
      });
    }

    return ok({
      document,
      text: extracted.value,
      chunkCount: indexed.value,
    });
  }

  /** Elimina del índice todos los fragmentos de un documento. */
  public remove(documentId: string): void {
    this.rag.removeDocument(documentId);
  }
}

function stripExtension(fileName: string): string {
  return fileName.replace(/\.[^./\\]+$/, '') || fileName;
}
