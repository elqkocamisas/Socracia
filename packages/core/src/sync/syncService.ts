import type { ReviewState, StudySession, Timestamp } from '../domain/types';
import type { Result } from '../result';
import type { StoragePort } from '../storage/ports';
import type { ProgressSnapshot, SyncError, SyncOutcome, SyncPort, Timed } from './contracts';
import { evaluationKey, hasNewKeys, mergeSnapshots, reviewKey, sessionKey } from './merge';

/**
 * Sincronización del progreso entre el dispositivo y el backend.
 *
 * La estrategia es «enviar todo y fusionar»: se construye una instantánea local
 * completa, se envía, y el servidor devuelve la fusión autoritativa que se
 * aplica de vuelta al almacén local. Al ser la fusión idempotente, repetir el
 * ciclo no duplica datos ni pierde historial, así que no hace falta una cola de
 * operaciones ni resolución de conflictos por campo en el cliente.
 */

/** Instantánea vacía, para un usuario que aún no tiene progreso. */
export function emptySnapshot(userId: string, now: Timestamp): ProgressSnapshot {
  return {
    userId,
    generatedAt: now,
    evaluations: [],
    reviewStates: [],
    sessions: [],
    gapProfile: null,
  };
}

/**
 * Marca temporal de una evaluación en la fusión.
 *
 * Las evaluaciones se identifican por contenido y se unen, así que la marca no
 * altera el resultado; basta con la fecha del ciclo para que la instantánea sea
 * determinista y comparable.
 */
function stampOfEvaluation(now: Timestamp): Timestamp {
  return now;
}

function stampOfSession(session: StudySession): Timestamp {
  return session.finishedAt ?? session.startedAt;
}

function stampOfReview(state: ReviewState): Timestamp {
  return state.lastReviewedAt ?? 0;
}

export class SyncService {
  public constructor(
    private readonly storage: StoragePort,
    private readonly port: SyncPort,
    private readonly userId: string,
  ) {}

  /** Construye la instantánea del progreso local, lista para enviar. */
  public async buildSnapshot(now: Timestamp): Promise<ProgressSnapshot> {
    const [evaluations, reviewStates, sessions, gapProfile] = await Promise.all([
      this.storage.progress.listEvaluations(this.userId),
      this.storage.progress.listReviewStates(this.userId),
      this.storage.progress.listSessions(this.userId),
      this.storage.progress.getGapProfile(this.userId),
    ]);

    return {
      userId: this.userId,
      generatedAt: now,
      evaluations: evaluations.map((value) => ({ updatedAt: stampOfEvaluation(now), value })),
      reviewStates: reviewStates.map((value) => ({ updatedAt: stampOfReview(value), value })),
      sessions: sessions.map((value) => ({ updatedAt: stampOfSession(value), value })),
      gapProfile: gapProfile ? { updatedAt: gapProfile.generatedAt, value: gapProfile } : null,
    };
  }

  /**
   * Ejecuta un ciclo completo: enviar, fusionar y aplicar el resultado.
   *
   * Devuelve cuántos elementos quedaron sincronizados y si el servidor aportó
   * datos que el dispositivo no tenía, para que la UI pueda avisar de cambios
   * traídos de otro dispositivo.
   */
  public async sync(now: Timestamp): Promise<Result<SyncOutcome, SyncError>> {
    const local = await this.buildSnapshot(now);
    const pushed = await this.port.push(local);
    if (!pushed.ok) {
      return pushed;
    }

    const merged = mergeSnapshots(local, pushed.value);
    const pulledChanges = this.detectPulledChanges(local, merged);
    await this.applySnapshot(merged);

    return {
      ok: true,
      value: {
        userId: this.userId,
        syncedAt: now,
        evaluations: merged.evaluations.length,
        reviewStates: merged.reviewStates.length,
        sessions: merged.sessions.length,
        pulledChanges,
      },
    };
  }

  /** Descarga el progreso del servidor y lo fusiona con el local. */
  public async pull(now: Timestamp): Promise<Result<SyncOutcome, SyncError>> {
    const local = await this.buildSnapshot(now);
    const pulled = await this.port.pull(this.userId);
    if (!pulled.ok) {
      return pulled;
    }

    const merged = mergeSnapshots(local, pulled.value);
    const pulledChanges = this.detectPulledChanges(local, merged);
    await this.applySnapshot(merged);

    return {
      ok: true,
      value: {
        userId: this.userId,
        syncedAt: now,
        evaluations: merged.evaluations.length,
        reviewStates: merged.reviewStates.length,
        sessions: merged.sessions.length,
        pulledChanges,
      },
    };
  }

  /**
   * Escribe el resultado fusionado en el almacén local.
   *
   * Las evaluaciones se añaden solo si son nuevas: son un registro de solo
   * adición y duplicarlas inflaría el historial y falsearía las medias. El
   * resto son agregados con clave propia, así que se reescriben (upsert).
   */
  private async applySnapshot(snapshot: ProgressSnapshot): Promise<void> {
    const local = await this.storage.progress.listEvaluations(this.userId);
    const known = new Set(local.map(evaluationKey));
    const fresh = snapshot.evaluations
      .map((item) => item.value)
      .filter((evaluation) => !known.has(evaluationKey(evaluation)));
    await this.storage.progress.appendEvaluations(this.userId, fresh);

    for (const session of snapshot.sessions) {
      await this.storage.progress.saveSession(session.value);
    }
    await this.storage.progress.saveReviewStates(
      this.userId,
      snapshot.reviewStates.map((item) => item.value),
    );
    if (snapshot.gapProfile) {
      await this.storage.progress.saveGapProfile(snapshot.gapProfile.value);
    }
  }

  /** `true` si la fusión incorporó evaluaciones, sesiones o repaso más nuevos. */
  private detectPulledChanges(local: ProgressSnapshot, merged: ProgressSnapshot): boolean {
    if (hasNewKeys(local.evaluations, merged.evaluations, evaluationKey)) {
      return true;
    }
    if (hasNewKeys(local.sessions, merged.sessions, sessionKey)) {
      return true;
    }
    return isNewer<ReviewState>(local.reviewStates, merged.reviewStates, reviewKey);
  }
}

/** `true` si alguna clave de `merged` trae una marca temporal mayor que en `local`. */
function isNewer<T>(
  local: readonly Timed<T>[],
  merged: readonly Timed<T>[],
  keyOf: (value: T) => string,
): boolean {
  const localStamps = new Map(local.map((item) => [keyOf(item.value), item.updatedAt]));
  return merged.some((item) => {
    const previous = localStamps.get(keyOf(item.value));
    return previous === undefined || item.updatedAt > previous;
  });
}
