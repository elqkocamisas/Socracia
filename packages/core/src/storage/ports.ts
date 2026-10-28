import type {
  AnswerEvaluation,
  Concept,
  GapProfile,
  KnowledgeDocument,
  KnowledgeChunk,
  ReviewState,
  SocraticQuestion,
  StudySession,
  Timestamp,
  Topic,
} from '../domain/types';

/**
 * Puertos de persistencia del MVP.
 *
 * El dominio solo conoce estas interfaces, nunca SQLite ni la nube. Así el
 * mismo motor mayéutico funciona con almacenamiento local (por defecto), con
 * un backend de sincronización o con un doble en memoria en las pruebas.
 *
 * Todas las operaciones son asíncronas porque la implementación real toca
 * disco o red.
 */

/** Temario importado por el usuario. */
export interface CurriculumRecord {
  readonly id: string;
  readonly title: string;
  readonly topics: readonly Topic[];
  readonly concepts: readonly Concept[];
  readonly createdAt: Timestamp;
}

/** Repositorio de documentos y temarios. */
export interface DocumentRepository {
  /** Guarda o reemplaza el registro de un documento. */
  saveDocument(document: KnowledgeDocument): Promise<void>;
  /** Documentos conocidos, del más reciente al más antiguo. */
  listDocuments(): Promise<readonly KnowledgeDocument[]>;
  /** Un documento por identificador, o `null`. */
  getDocument(id: string): Promise<KnowledgeDocument | null>;
  /** Elimina el documento y, en cascada, sus temarios y progreso. */
  deleteDocument(id: string): Promise<void>;

  /** Guarda el temario extraído de un documento. */
  saveCurriculum(record: CurriculumRecord): Promise<void>;
  /** Temario asociado a un documento, o `null`. */
  getCurriculum(documentId: string): Promise<CurriculumRecord | null>;
  /** Todos los temarios guardados. */
  listCurricula(): Promise<readonly CurriculumRecord[]>;

  /**
   * Guarda o reemplaza los fragmentos indexados de un documento.
   *
   * Se persiste el texto de los fragmentos —no sus vectores— para poder
   * reconstruir el índice al arrancar sin volver a leer el archivo original y
   * sin enviar nada fuera del dispositivo. Los embeddings se recalculan.
   */
  saveChunks(chunks: readonly KnowledgeChunk[]): Promise<void>;
  /** Fragmentos de un documento, en orden de aparición. */
  listChunks(documentId: string): Promise<readonly KnowledgeChunk[]>;
  /** Todos los fragmentos guardados, para rehidratar el índice completo. */
  listAllChunks(): Promise<readonly KnowledgeChunk[]>;
}

/** Repositorio de preguntas generadas. */
export interface QuestionRepository {
  /** Guarda o reemplaza preguntas. */
  saveQuestions(questions: readonly SocraticQuestion[]): Promise<void>;
  /** Preguntas de un concepto, en orden de dificultad. */
  listByConcept(conceptId: string): Promise<readonly SocraticQuestion[]>;
  /** Preguntas asociadas a un documento (vía su cita). */
  listByDocument(documentId: string): Promise<readonly SocraticQuestion[]>;
}

/** Repositorio de progreso: sesiones, evaluaciones y repaso. */
export interface ProgressRepository {
  saveSession(session: StudySession): Promise<void>;
  getSession(id: string): Promise<StudySession | null>;
  listSessions(userId: string): Promise<readonly StudySession[]>;

  /** Añade evaluaciones al historial del usuario. */
  appendEvaluations(userId: string, evaluations: readonly AnswerEvaluation[]): Promise<void>;
  /** Evaluaciones del usuario, en orden de emisión. */
  listEvaluations(userId: string): Promise<readonly AnswerEvaluation[]>;

  /** Guarda o reemplaza el estado de repaso de conceptos. */
  saveReviewStates(userId: string, states: readonly ReviewState[]): Promise<void>;
  /** Estados de repaso del usuario. */
  listReviewStates(userId: string): Promise<readonly ReviewState[]>;

  /** Guarda el último perfil de lagunas calculado. */
  saveGapProfile(profile: GapProfile): Promise<void>;
  /** Último perfil de lagunas del usuario, o `null`. */
  getGapProfile(userId: string): Promise<GapProfile | null>;
}

/** Conjunto de repositorios que la app inyecta en los servicios. */
export interface StoragePort {
  readonly documents: DocumentRepository;
  readonly questions: QuestionRepository;
  readonly progress: ProgressRepository;
}
