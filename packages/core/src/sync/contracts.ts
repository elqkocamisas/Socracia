import type {
  AnswerEvaluation,
  GapProfile,
  Id,
  ReviewState,
  StudySession,
  Timestamp,
} from '../domain/types';
import type { Result } from '../result';

/**
 * Contratos de sincronización de progreso.
 *
 * Lo único que sale del dispositivo es el progreso agregado (evaluaciones,
 * repaso, sesiones y perfil de lagunas), y solo cuando el usuario inicia sesión
 * y lo pide explícitamente. Los documentos y sus fragmentos nunca se suben:
 * la privacidad del material del usuario es un requisito de producto (D-016).
 */

/** Valor acompañado de la marca temporal que decide el ganador en un conflicto. */
export interface Timed<T> {
  readonly updatedAt: Timestamp;
  readonly value: T;
}

/**
 * Fotografía completa del progreso de un usuario.
 *
 * Es la unidad de intercambio con el backend: se envía entera y se recibe
 * fusionada, lo que hace la sincronización idempotente y sin estado en el
 * cliente. Para el volumen del MVP (miles de evaluaciones como máximo) es
 * aceptable y evita una cola de operaciones que habría que versionar.
 */
export interface ProgressSnapshot {
  readonly userId: Id;
  readonly generatedAt: Timestamp;
  readonly evaluations: readonly Timed<AnswerEvaluation>[];
  readonly reviewStates: readonly Timed<ReviewState>[];
  readonly sessions: readonly Timed<StudySession>[];
  readonly gapProfile: Timed<GapProfile> | null;
}

/** Error de sincronización con causa accionable para la UI. */
export interface SyncError {
  readonly code: 'sin-sesion' | 'red' | 'servidor' | 'no-autorizado';
  readonly message: string;
}

/** Resultado de un ciclo de sincronización correcto. */
export interface SyncOutcome {
  readonly userId: Id;
  readonly syncedAt: Timestamp;
  readonly evaluations: number;
  readonly reviewStates: number;
  readonly sessions: number;
  /** `true` si el servidor aportó datos que no estaban en el dispositivo. */
  readonly pulledChanges: boolean;
}

/**
 * Puerto de sincronización remota.
 *
 * El dominio solo conoce esta interfaz. En el móvil la implementa un cliente
 * HTTP; en las pruebas, un servidor en memoria. Así la lógica de fusión se
 * prueba sin red ni backend.
 */
export interface SyncPort {
  /**
   * Envía la instantánea local y recibe la instantánea autoritativa fusionada.
   *
   * Es idempotente: reenviar la misma instantánea no duplica ni pierde datos.
   */
  push(snapshot: ProgressSnapshot): Promise<Result<ProgressSnapshot, SyncError>>;
  /** Recupera el progreso guardado en el servidor para un usuario. */
  pull(userId: Id): Promise<Result<ProgressSnapshot, SyncError>>;
}
