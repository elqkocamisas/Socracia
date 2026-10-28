import type { AnswerEvaluation, GapProfile, ReviewState, StudySession } from '../domain/types';
import type { ProgressSnapshot, Timed } from './contracts';

/**
 * Clave de identidad de una evaluación, estable entre dispositivos.
 *
 * `AnswerEvaluation` no lleva identificador propio porque se deriva de la
 * pregunta y la respuesta. La combinación de pregunta, veredicto y puntuación
 * identifica el mismo hecho en cualquier dispositivo, así que dos dispositivos
 * que evalúen igual la misma pregunta no duplican historial al fusionar.
 */
export function evaluationKey(evaluation: AnswerEvaluation): string {
  return [evaluation.questionId, evaluation.verdict, evaluation.score.toFixed(4)].join('|');
}

/** El estado de repaso es único por concepto. */
export function reviewKey(state: ReviewState): string {
  return state.conceptId;
}

/** La sesión se identifica por su id generado en el dispositivo de origen. */
export function sessionKey(session: StudySession): string {
  return session.id;
}

/**
 * Fusiona dos colecciones por clave, quedándose con el valor más reciente.
 *
 * En empate gana el local (se recorren primero), de modo que la fusión es
 * determinista y conmutativa salvo por ese desempate documentado. Ordena la
 * salida por la clave para que dos dispositivos converjan al mismo orden.
 */
function mergeCollection<T>(
  local: readonly Timed<T>[],
  remote: readonly Timed<T>[],
  keyOf: (value: T) => string,
): Timed<T>[] {
  const byKey = new Map<string, Timed<T>>();
  for (const item of [...local, ...remote]) {
    const key = keyOf(item.value);
    const current = byKey.get(key);
    if (!current || item.updatedAt > current.updatedAt) {
      byKey.set(key, item);
    }
  }
  return [...byKey.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, item]) => item);
}

/** Fusiona dos perfiles de lagunas por fecha de generación. */
function mergeGapProfile(
  local: Timed<GapProfile> | null,
  remote: Timed<GapProfile> | null,
): Timed<GapProfile> | null {
  if (!local) {
    return remote;
  }
  if (!remote) {
    return local;
  }
  return remote.updatedAt > local.updatedAt ? remote : local;
}

/**
 * Fusiona la instantánea local con la remota.
 *
 * Es una función pura: misma entrada, misma salida. Las evaluaciones y las
 * sesiones se unen (aportan historia); el repaso y el perfil de lagunas son
 * estado derivado y gana el más reciente. La usan por igual el cliente y el
 * servidor, así que ambos convergen al mismo resultado sin lógica duplicada.
 */
export function mergeSnapshots(
  local: ProgressSnapshot,
  remote: ProgressSnapshot,
): ProgressSnapshot {
  return {
    userId: local.userId,
    generatedAt: Math.max(local.generatedAt, remote.generatedAt),
    evaluations: mergeCollection(local.evaluations, remote.evaluations, evaluationKey),
    reviewStates: mergeCollection(local.reviewStates, remote.reviewStates, reviewKey),
    sessions: mergeCollection(local.sessions, remote.sessions, sessionKey),
    gapProfile: mergeGapProfile(local.gapProfile, remote.gapProfile),
  };
}

/** Claves de una colección, para detectar si la fusión aportó algo nuevo. */
export function keysOf<T>(items: readonly Timed<T>[], keyOf: (value: T) => string): Set<string> {
  return new Set(items.map((item) => keyOf(item.value)));
}

/** `true` si `merged` contiene alguna clave que no estaba en `local`. */
export function hasNewKeys<T>(
  local: readonly Timed<T>[],
  merged: readonly Timed<T>[],
  keyOf: (value: T) => string,
): boolean {
  const existing = keysOf(local, keyOf);
  return merged.some((item) => !existing.has(keyOf(item.value)));
}
