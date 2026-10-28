import type { SQLiteDatabase } from 'expo-sqlite';

import type { StoragePort } from '@socracia/core';
import {
  DocumentIngestionService,
  HashingEmbeddingProvider,
  InMemoryVectorStore,
  MayeuticSessionController,
  RagEngine,
  StudyService,
  defaultRegistry,
  extractCurriculum,
  fflateInflate,
  type EmbeddingProvider,
  type Result,
  type VectorStore,
} from '@socracia/core';

import { openStorage } from '../storage/sqliteStorage';
import {
  readPickedFile,
  type DocumentPickerPort,
  type FileBytesReader,
  type ImportError,
  type PickedFile,
} from './documentImport';

/** Handle de base de datos que el runtime necesita; compatible con `SQLiteDatabase`. */
export interface SqliteHandle {
  runAsync(source: string, params?: readonly unknown[]): Promise<unknown>;
  getAllAsync<T>(source: string, params?: readonly unknown[]): Promise<T[]>;
  getFirstAsync<T>(source: string, params?: readonly unknown[]): Promise<T | null>;
  execAsync(source: string): Promise<void>;
  withTransactionAsync(task: () => Promise<void>): Promise<void>;
}

/** Identificador de usuario local hasta que exista cuenta (Sprint 4). */
export const LOCAL_USER_ID = 'local-user';

/** Servicios que consume la UI. */
export interface AppServices {
  readonly storage: StoragePort;
  readonly rag: RagEngine;
  readonly study: StudyService;
  readonly session: MayeuticSessionController;
  readonly ingestion: DocumentIngestionService;
  readonly picker: DocumentPickerPort;
  readonly reader: FileBytesReader;
}

/** Opciones de creación del runtime. */
export interface CreateServicesOptions {
  readonly storage: StoragePort;
  readonly picker: DocumentPickerPort;
  readonly reader: FileBytesReader;
  /** Proveedor de embeddings; por defecto, hashing local sin módulos nativos. */
  readonly provider?: EmbeddingProvider;
  readonly vectorStore?: VectorStore;
}

/**
 * Compone los servicios de la app.
 *
 * El proveedor de embeddings es inyectable: hoy usa hashing local (sin módulos
 * nativos) y mañana puede sustituirse por un modelo on-device real sin tocar
 * el resto de la app, que solo conoce `EmbeddingProvider`.
 */
export function createServices(options: CreateServicesOptions): AppServices {
  const provider = options.provider ?? new HashingEmbeddingProvider(256);
  const store = options.vectorStore ?? new InMemoryVectorStore();
  const rag = new RagEngine(store, provider);
  const ingestion = new DocumentIngestionService(defaultRegistry(fflateInflate), rag);
  const study = new StudyService(rag, options.storage);
  const session = new MayeuticSessionController(study, options.storage, LOCAL_USER_ID);

  return {
    storage: options.storage,
    rag,
    study,
    session,
    ingestion,
    picker: options.picker,
    reader: options.reader,
  };
}

/**
 * Arranca el runtime sobre SQLite.
 *
 * `openDatabase` se inyecta para no acoplar el runtime a `expo-sqlite` en las
 * pruebas. Si la apertura falla, el error sube al llamante, que decide entre
 * reintentar o degradar a almacenamiento en memoria.
 *
 * Tras abrir la base se rehidrata el índice vectorial desde los fragmentos
 * guardados: sin este paso, el índice arrancaría vacío y no se podrían generar
 * preguntas sobre un temario ya importado (los fragmentos son el único estado
 * del RAG que vive en disco).
 */
export async function bootstrap(
  options: Omit<CreateServicesOptions, 'storage'> & {
    openDatabase: (name: string) => Promise<SQLiteDatabase>;
    databaseName?: string;
  },
): Promise<AppServices> {
  const storage = await openStorage(options.openDatabase, options.databaseName ?? 'socracia.db');
  const services = createServices({ ...options, storage });
  await rehydrateIndex(services);
  return services;
}

/**
 * Reconstruye el índice vectorial a partir de los fragmentos persistidos.
 *
 * Los embeddings se recalculan en el dispositivo; el texto nunca sale de la
 * app. Si la rehidratación falla, la app sigue arrancando: el usuario podrá
 * volver a adjuntar el documento.
 */
export async function rehydrateIndex(services: AppServices): Promise<number> {
  const chunks = await services.storage.documents.listAllChunks();
  const result = await services.rag.rehydrate(chunks);
  return result.ok ? result.value : 0;
}

/** Flujo completo de importación: elegir archivo, leer bytes, ingerir y guardar. */
export async function importDocument(
  services: AppServices,
  picked: PickedFile,
  now: number,
): Promise<Result<{ documentId: string; title: string; conceptCount: number }, ImportError>> {
  const bytes = await readPickedFile(picked, services.reader);
  if (!bytes.ok) {
    return bytes;
  }

  const id = `doc-${now}`;
  const ingested = await services.ingestion.ingest(
    {
      fileName: picked.name,
      mimeType: picked.mimeType || 'text/plain',
      bytes: bytes.value,
      uri: picked.uri,
    },
    {
      chunkOptions: { maxChars: 900, overlapChars: 150, minChars: 40 },
      cloudConsent: false,
      id,
      now,
    },
  );

  if (!ingested.ok) {
    return { ok: false, error: { code: 'ingesta-fallida', message: ingested.error.message } };
  }

  const curriculum = extractCurriculum(ingested.value.text);
  await services.storage.documents.saveDocument(ingested.value.document);
  await services.storage.documents.saveCurriculum({
    id,
    title: ingested.value.document.title,
    topics: curriculum.topics,
    concepts: curriculum.concepts,
    createdAt: now,
  });
  // Los fragmentos se persisten para poder rehidratar el índice en el próximo
  // arranque; sin ellos el temario quedaría ilegible tras cerrar la app.
  await services.storage.documents.saveChunks(ingested.value.chunks);

  return {
    ok: true,
    value: {
      documentId: id,
      title: ingested.value.document.title,
      conceptCount: curriculum.concepts.length,
    },
  };
}
