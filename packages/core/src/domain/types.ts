/**
 * Contratos de dominio del MVP mayéutico.
 *
 * Todo el modelo es inmutable y serializable a JSON para poder persistirlo en
 * SQLite (on-device) y sincronizarlo con el backend sin transformaciones.
 */

/** Identificador estable generado por la app (no depende del backend). */
export type Id = string;

/** Marca temporal en milisegundos desde epoch (UTC). */
export type Timestamp = number;

/** Origen del conocimiento: documento local o corpus en nube. */
export type KnowledgeSourceKind = 'document' | 'cloud-corpus';

/** Documento aportado por el usuario y almacenado en el dispositivo. */
export interface KnowledgeDocument {
  readonly id: Id;
  readonly title: string;
  readonly mimeType: string;
  readonly sourceKind: KnowledgeSourceKind;
  /** Ruta local o URI de contenido; nunca se sube salvo opt-in explícito. */
  readonly uri: string;
  readonly sizeBytes: number;
  readonly ingestedAt: Timestamp;
  /** `true` si el usuario autoriza procesar el documento fuera del dispositivo. */
  readonly cloudConsent: boolean;
}

/** Fragmento recuperable de un documento (unidad de indexación del RAG). */
export interface KnowledgeChunk {
  readonly id: Id;
  readonly documentId: Id;
  readonly text: string;
  /** Posición ordinal dentro del documento, base 0. */
  readonly ordinal: number;
  /** Rango de caracteres en el texto extraído, para trazabilidad de la cita. */
  readonly charStart: number;
  readonly charEnd: number;
}

/** Fragmento con su vector de embedding asociado. */
export interface EmbeddedChunk {
  readonly chunk: KnowledgeChunk;
  readonly embedding: readonly number[];
}

/** Cita que enlaza una pregunta con la evidencia documental que la originó. */
export interface Citation {
  readonly documentId: Id;
  readonly documentTitle: string;
  readonly chunkId: Id;
  readonly excerpt: string;
  readonly charStart: number;
  readonly charEnd: number;
}

/** Nivel cognitivo que la pregunta exige, inspirado en Bloom simplificado. */
export type CognitiveLevel = 'recordar' | 'comprender' | 'aplicar' | 'analizar' | 'evaluar';

/** Tipo de movimiento mayéutico que ejecuta la pregunta. */
export type SocraticMove =
  | 'definir'
  | 'problematizar'
  | 'contraejemplo'
  | 'causa'
  | 'consecuencia'
  | 'comparar'
  | 'justificar'
  | 'aplicar-caso';

/** Concepto atómico evaluable de un temario. */
export interface Concept {
  readonly id: Id;
  readonly topicId: Id;
  readonly label: string;
  readonly definition: string;
  readonly keywords: readonly string[];
}

/** Tema o unidad del temario. */
export interface Topic {
  readonly id: Id;
  readonly title: string;
  readonly summary: string;
}

/** Pregunta mayéutica generada a partir de evidencia documental. */
export interface SocraticQuestion {
  readonly id: Id;
  readonly conceptId: Id;
  readonly prompt: string;
  readonly move: SocraticMove;
  readonly level: CognitiveLevel;
  /** Respuesta de referencia usada para evaluar; puede estar vacía en modo abierto. */
  readonly expectedAnswer: string;
  /** Términos cuya presencia indica dominio del concepto. */
  readonly keyTerms: readonly string[];
  readonly citation: Citation;
  readonly difficulty: number;
}

/** Respuesta del usuario a una pregunta mayéutica. */
export interface UserAnswer {
  readonly questionId: Id;
  readonly text: string;
  readonly answeredAt: Timestamp;
  /** Latencia de respuesta en milisegundos; señal de fluidez. */
  readonly latencyMs: number;
}

/** Veredicto cualitativo de la evaluación de una respuesta. */
export type AnswerVerdict = 'correcta' | 'parcial' | 'incorrecta' | 'sin-respuesta';

/** Evaluación detallada de una respuesta. */
export interface AnswerEvaluation {
  readonly questionId: Id;
  readonly conceptId: Id;
  readonly verdict: AnswerVerdict;
  /** Puntuación de dominio en [0, 1]. */
  readonly score: number;
  /** Términos clave recuperados correctamente. */
  readonly matchedKeyTerms: readonly string[];
  /** Términos clave ausentes. */
  readonly missingKeyTerms: readonly string[];
  /** Explicación en lenguaje natural del veredicto. */
  readonly feedback: string;
}

/** Lagunas detectadas por concepto, con prioridad de repaso. */
export interface KnowledgeGap {
  readonly conceptId: Id;
  readonly conceptLabel: string;
  /** Severidad en [0, 1]; mayor valor, más urgente. */
  readonly severity: number;
  readonly attempts: number;
  readonly lastEvaluatedAt: Timestamp;
  readonly rationale: string;
}

/** Estado de repaso espaciado de un concepto (SM-2 simplificado). */
export interface ReviewState {
  readonly conceptId: Id;
  /** Facilidad del ítem; se ajusta tras cada repaso. */
  readonly ease: number;
  /** Intervalo actual en días. */
  readonly intervalDays: number;
  /** Número de repasos exitosos consecutivos. */
  readonly repetitions: number;
  readonly dueAt: Timestamp;
  readonly lastReviewedAt: Timestamp | null;
}

/** Perfil agregado de lagunas del usuario. */
export interface GapProfile {
  readonly userId: Id;
  readonly generatedAt: Timestamp;
  readonly gaps: readonly KnowledgeGap[];
  /** Conceptos ordenados por urgencia de repaso, de mayor a menor. */
  readonly recommendedReview: readonly Id[];
}

/** Sesión de estudio mayéutico. */
export interface StudySession {
  readonly id: Id;
  readonly userId: Id;
  readonly topicId: Id;
  readonly startedAt: Timestamp;
  readonly finishedAt: Timestamp | null;
  readonly questionIds: readonly Id[];
  readonly answers: readonly UserAnswer[];
}
