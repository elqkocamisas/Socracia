import type { SQLiteDatabase } from 'expo-sqlite';

import type { ProcessingPolicy, StoragePort } from '@socracia/core';
import {
  DEFAULT_PROCESSING_POLICY,
  DocumentIngestionService,
  ProcessingPolicyHolder,
  FallbackEmbeddingProvider,
  HashingEmbeddingProvider,
  InMemoryVectorStore,
  MayeuticSessionController,
  RagEngine,
  StudyService,
  createEdgeLlmProvider,
  defaultRegistry,
  extractCurriculum,
  fflateInflate,
  allowsCloudProcessing,
  assertProcessingAllowed,
  type EdgeLlmNativeModule,
  type EmbeddingProvider,
  type Result,
  type VectorStore,
} from '@socracia/core';

import { openLocalDatabase } from '../storage/sqliteStorage';
import { AccountService } from './accountService';
import {
  InMemoryCredentialStore,
  SqliteCredentialStore,
  type CredentialStore,
} from './credentialStore';
import { HttpSyncClient } from './httpSyncClient';
import {
  InMemoryProcessingPolicyStore,
  SqliteProcessingPolicyStore,
  type ProcessingPolicyStore,
} from './processingPolicyStore';
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

/**
 * Proveedor de embeddings resuelto, con el motivo de la decisión.
 *
 * `degradedReason` se propaga a la UI para poder explicar al usuario por qué la
 * recuperación es léxica y no semántica; sin ese dato, la degradación sería
 * invisible y parecería un fallo de la app.
 */
export interface ResolvedEmbeddingProvider {
  readonly provider: EmbeddingProvider;
  readonly onDeviceModel: boolean;
  readonly degradedReason: string | null;
}

/**
 * Elige el mejor proveedor de embeddings disponible en el dispositivo.
 *
 * Intenta el modelo on-device (`edge-llm`) y, si no está utilizable, degrada al
 * proveedor léxico local. **Nunca lanza**: estudiar con recuperación léxica es
 * preferible a no poder estudiar. El módulo nativo se inyecta en lugar de
 * importarse para que la app no dependa de él en las pruebas ni en Node.
 */
export async function resolveEmbeddingProvider(options: {
  readonly nativeModule?: EdgeLlmNativeModule | null;
  readonly fallback?: EmbeddingProvider;
}): Promise<ResolvedEmbeddingProvider> {
  const fallback = options.fallback ?? new HashingEmbeddingProvider(256);
  if (options.nativeModule === undefined) {
    return {
      provider: fallback,
      onDeviceModel: false,
      degradedReason: null,
    };
  }

  const built = await createEdgeLlmProvider({ nativeModule: options.nativeModule });
  if (!built.ok) {
    return {
      provider: fallback,
      onDeviceModel: false,
      degradedReason: built.error.message,
    };
  }

  return {
    provider: new FallbackEmbeddingProvider(built.value, fallback),
    onDeviceModel: true,
    degradedReason: null,
  };
}

/** URL base del backend; configurable por entorno en el build de producción. */
export const DEFAULT_API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:8787';

/** Servicios que consume la UI. */
export interface AppServices {
  readonly storage: StoragePort;
  readonly rag: RagEngine;
  readonly study: StudyService;
  readonly session: MayeuticSessionController;
  readonly ingestion: DocumentIngestionService;
  readonly picker: DocumentPickerPort;
  readonly reader: FileBytesReader;
  readonly account: AccountService;
  /** Diagnóstico del proveedor de embeddings en uso. */
  readonly embedding: ResolvedEmbeddingProvider;
  /** Política de procesamiento vigente: local o con permiso de nube. */
  readonly policy: ProcessingPolicyHolder;
  /** Persistencia de la política, para el ajuste de privacidad. */
  readonly policyStore: ProcessingPolicyStore;
}

/** Opciones de creación del runtime. */
export interface CreateServicesOptions {
  readonly storage: StoragePort;
  readonly picker: DocumentPickerPort;
  readonly reader: FileBytesReader;
  /** Proveedor de embeddings; por defecto, hashing local sin módulos nativos. */
  readonly provider?: EmbeddingProvider;
  readonly vectorStore?: VectorStore;
  /** Cliente de sincronización; por defecto, HTTP contra `apiBaseUrl`. */
  readonly syncClient?: HttpSyncClient;
  /** Almacén de credenciales; por defecto, en memoria. */
  readonly credentials?: CredentialStore;
  /** URL base del backend. */
  readonly apiBaseUrl?: string;
  /** Diagnóstico del proveedor ya resuelto; lo usa `bootstrap`. */
  readonly embedding?: ResolvedEmbeddingProvider;
  /** Política de procesamiento; por defecto, solo-dispositivo. */
  readonly policy?: ProcessingPolicy;
  /** Persistencia de la política; por defecto, en memoria. */
  readonly policyStore?: ProcessingPolicyStore;
  /**
   * Módulo nativo `edge-llm` si está disponible en esta compilación.
   * `null` o ausente significa «no hay modelo on-device»: se usa el léxico.
   */
  readonly nativeModule?: EdgeLlmNativeModule | null;
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
  // Sin diagnóstico explícito, el proveedor inyectado es el que manda: solo se
  // considera «modelo on-device» si no es el léxico por defecto.
  const embedding: ResolvedEmbeddingProvider = options.embedding ?? {
    provider,
    onDeviceModel: provider.isOnDevice && provider.id !== 'hashing-local',
    degradedReason: null,
  };
  const store = options.vectorStore ?? new InMemoryVectorStore();
  const rag = new RagEngine(store, provider);
  const ingestion = new DocumentIngestionService(defaultRegistry(fflateInflate), rag);
  const study = new StudyService(rag, options.storage);
  const session = new MayeuticSessionController(study, options.storage, LOCAL_USER_ID);
  const syncClient =
    options.syncClient ??
    new HttpSyncClient({ baseUrl: options.apiBaseUrl ?? DEFAULT_API_BASE_URL });
  const credentials = options.credentials ?? new InMemoryCredentialStore();
  const account = new AccountService(syncClient, credentials, options.storage, LOCAL_USER_ID);
  const policy = new ProcessingPolicyHolder(options.policy ?? DEFAULT_PROCESSING_POLICY);

  return {
    storage: options.storage,
    rag,
    study,
    session,
    ingestion,
    picker: options.picker,
    reader: options.reader,
    account,
    embedding,
    policy,
    policyStore: options.policyStore ?? new InMemoryProcessingPolicyStore(),
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
  options: Omit<CreateServicesOptions, 'storage' | 'credentials'> & {
    openDatabase: (name: string) => Promise<SQLiteDatabase>;
    databaseName?: string;
  },
): Promise<AppServices> {
  const { db, storage } = await openLocalDatabase(
    options.openDatabase,
    options.databaseName ?? 'socracia.db',
  );
  // Se resuelve aquí, y no en `createServices`, porque el sondeo del módulo
  // nativo es asíncrono. Si el modelo on-device no está utilizable, se degrada
  // al proveedor léxico y el motivo queda visible en `services.embedding`.
  const embedding =
    options.embedding ??
    (await resolveEmbeddingProvider({
      nativeModule: options.nativeModule ?? null,
      fallback: options.provider ?? new HashingEmbeddingProvider(256),
    }));
  const policyStore = options.policyStore ?? new SqliteProcessingPolicyStore(db);
  const services = createServices({
    ...options,
    storage,
    credentials: new SqliteCredentialStore(db),
    embedding,
    policyStore,
    policy: options.policy ?? (await policyStore.load()),
  });
  await rehydrateIndex(services);
  await services.account.restore();
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

  // En modo solo-dispositivo, la ingesta no puede requerir nube. La comprobación
  // se hace aquí, en la capa que decide, y no en la pantalla: si mañana alguien
  // añade un camino que suba el documento, esto lo detiene.
  const allowed = assertProcessingAllowed(services.policy.current(), {
    requiresCloud: false,
    label: 'Importar un documento',
  });
  if (!allowed.ok) {
    return { ok: false, error: { code: 'ingesta-fallida', message: allowed.error.message } };
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
      // Queda registrado en el documento si el usuario autorizó la nube, para
      // poder auditar después qué material se procesó fuera del dispositivo.
      cloudConsent: allowsCloudProcessing(services.policy.current()),
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

/**
 * Elimina un documento y todo lo derivado de él.
 *
 * El usuario es dueño de su material y debe poder retirarlo: la política de
 * privacidad se lo promete y la app no redistribuye documentos, así que no hay
 * razón para conservar nada. Borra en cascada documento, temario, fragmentos,
 * índice vectorial, progreso de sus conceptos y preguntas generadas, en ese
 * orden: dejar cualquiera de esas piezas produciría datos huérfanos que la
 * pantalla de progreso mostraría como repasos de conceptos inexistentes.
 */
export async function deleteDocument(
  services: AppServices,
  documentId: string,
): Promise<Result<{ readonly deletedConcepts: number }, ImportError>> {
  const curriculum = await services.storage.documents.getCurriculum(documentId);
  const conceptIds = (curriculum?.concepts ?? []).map((concept) => concept.id);

  try {
    await services.storage.progress.removeConcepts(LOCAL_USER_ID, conceptIds);
    await services.storage.documents.deleteDocument(documentId);
    services.rag.removeDocument(documentId);
    return { ok: true, value: { deletedConcepts: conceptIds.length } };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: 'borrado-fallido',
        message:
          error instanceof Error
            ? `No se pudo eliminar el documento: ${error.message}`
            : 'No se pudo eliminar el documento.',
      },
    };
  }
}
