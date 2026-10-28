import type { AnswerEvaluation, GapProfile, ReviewState, StudySession } from '../../domain/types';
import type { ProgressSnapshot, SyncError, SyncPort, Timed } from '../../sync/contracts';
import { mergeSnapshots } from '../../sync/merge';
import { ok, type Result } from '../../result';

/**
 * Servidor de sincronización en memoria.
 *
 * Implementa el mismo contrato que el backend real (`SyncPort`) y aplica la
 * misma función de fusión, así que las pruebas del servicio de sincronización
 * ejercitan la lógica real sin red. Sirve también para simular dos
 * dispositivos: basta con compartir una instancia entre dos almacenes.
 */
export class InMemorySyncServer implements SyncPort {
  private readonly byUser = new Map<string, ProgressSnapshot>();
  public pushCount = 0;
  public pullCount = 0;
  /** Fuerza un fallo del siguiente `push`, para probar el camino de error. */
  public failNextPush: SyncError | null = null;

  public async push(snapshot: ProgressSnapshot): Promise<Result<ProgressSnapshot, SyncError>> {
    this.pushCount += 1;
    if (this.failNextPush) {
      const failure = this.failNextPush;
      this.failNextPush = null;
      return { ok: false, error: failure };
    }
    const stored = this.byUser.get(snapshot.userId) ?? empty(snapshot.userId, 0);
    const merged = mergeSnapshots(stored, snapshot);
    this.byUser.set(snapshot.userId, merged);
    return ok(merged);
  }

  public async pull(userId: string): Promise<Result<ProgressSnapshot, SyncError>> {
    this.pullCount += 1;
    return ok(this.byUser.get(userId) ?? empty(userId, 0));
  }

  /** Estado almacenado, para aserciones de convergencia en pruebas. */
  public stored(userId: string): ProgressSnapshot | null {
    return this.byUser.get(userId) ?? null;
  }
}

function empty(userId: string, now: number): ProgressSnapshot {
  return {
    userId,
    generatedAt: now,
    evaluations: [],
    reviewStates: [],
    sessions: [],
    gapProfile: null,
  };
}

/** Constructores concisos para las pruebas. */
export function timed<T>(updatedAt: number, value: T): Timed<T> {
  return { updatedAt, value };
}

export function evaluation(questionId: string, conceptId: string, score: number): AnswerEvaluation {
  return {
    questionId,
    conceptId,
    verdict: score >= 0.6 ? 'correcta' : 'incorrecta',
    score,
    matchedKeyTerms: [],
    missingKeyTerms: [],
    feedback: 'x',
  };
}

export function review(
  conceptId: string,
  dueAt: number,
  lastReviewedAt: number | null,
): ReviewState {
  return {
    conceptId,
    ease: 2.5,
    intervalDays: 1,
    repetitions: 1,
    dueAt,
    lastReviewedAt,
  };
}

export function session(id: string, startedAt: number, finishedAt: number | null): StudySession {
  return {
    id,
    userId: 'u1',
    topicId: 't1',
    startedAt,
    finishedAt,
    questionIds: [],
    answers: [],
  };
}

export function gapProfile(userId: string, generatedAt: number): GapProfile {
  return { userId, generatedAt, gaps: [], recommendedReview: [] };
}
