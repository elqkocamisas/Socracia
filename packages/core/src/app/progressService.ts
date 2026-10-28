import type {
  AnswerEvaluation,
  Concept,
  Id,
  KnowledgeGap,
  ReviewState,
  Timestamp,
} from '../domain/types';
import { detectGaps, isDue } from '../mayeu/gaps';

/** Resumen de dominio del usuario sobre un temario. */
export interface MasterySummary {
  readonly conceptsTracked: number;
  readonly conceptsMastered: number;
  readonly conceptsInGap: number;
  readonly conceptsNotEvaluated: number;
  /** Media de dominio en [0, 1] de las respuestas emitidas. */
  readonly averageScore: number;
  /** Porcentaje entero de conceptos dominados, para pintar en la UI. */
  readonly masteredPercent: number;
}

/** Vista agregada de progreso que consume la pantalla de progreso. */
export interface ProgressOverview {
  readonly userId: Id;
  readonly generatedAt: Timestamp;
  readonly mastery: MasterySummary;
  readonly gaps: readonly KnowledgeGap[];
  /** Conceptos ordenados por urgencia de repaso. */
  readonly recommendedReview: readonly Id[];
  /** Estados de repaso cuyo `dueAt` ya ha vencido. */
  readonly dueForReview: readonly ReviewState[];
}

/**
 * Construye la vista de progreso a partir del historial persistido.
 *
 * Es una función pura: misma entrada, misma salida. La UI no calcula nada de
 * dominio; solo pinta lo que devuelve esta función.
 */
export function buildProgressOverview(
  userId: Id,
  concepts: readonly Concept[],
  evaluations: readonly AnswerEvaluation[],
  reviewStates: readonly ReviewState[],
  now: Timestamp,
): ProgressOverview {
  const gapProfile = detectGaps(userId, concepts, evaluations, now);
  const evaluatedConceptIds = new Set(evaluations.map((evaluation) => evaluation.conceptId));
  const gapConceptIds = new Set(gapProfile.gaps.map((gap) => gap.conceptId));

  let mastered = 0;
  let inGap = 0;
  let notEvaluated = 0;
  for (const concept of concepts) {
    if (!evaluatedConceptIds.has(concept.id)) {
      notEvaluated += 1;
    } else if (gapConceptIds.has(concept.id)) {
      inGap += 1;
    } else {
      mastered += 1;
    }
  }

  const scores = evaluations.map((evaluation) => evaluation.score);
  const averageScore =
    scores.length === 0 ? 0 : scores.reduce((sum, score) => sum + score, 0) / scores.length;
  const evaluatedCount = concepts.length - notEvaluated;
  const masteredPercent = evaluatedCount === 0 ? 0 : Math.round((mastered / concepts.length) * 100);

  return {
    userId,
    generatedAt: now,
    mastery: {
      conceptsTracked: concepts.length,
      conceptsMastered: mastered,
      conceptsInGap: inGap,
      conceptsNotEvaluated: notEvaluated,
      averageScore,
      masteredPercent,
    },
    gaps: gapProfile.gaps,
    recommendedReview: gapProfile.recommendedReview,
    dueForReview: dueReviews(reviewStates, now),
  };
}

/**
 * Estados de repaso vencidos, los más urgentes primero.
 *
 * Un concepto sin repasos previos (`lastReviewedAt === null`) se considera
 * pendiente, de modo que el material recién importado entra en la cola.
 */
export function dueReviews(
  reviewStates: readonly ReviewState[],
  now: Timestamp,
): readonly ReviewState[] {
  return reviewStates
    .filter((state) => isDue(state, now))
    .sort((a, b) => {
      if (a.dueAt !== b.dueAt) {
        return a.dueAt - b.dueAt;
      }
      return a.conceptId.localeCompare(b.conceptId);
    });
}

/** Mensaje accionable para el usuario según su estado de progreso. */
export function nextActionHint(overview: ProgressOverview): string {
  if (overview.mastery.conceptsTracked === 0) {
    return 'Adjunta un temario para empezar.';
  }
  if (overview.mastery.conceptsNotEvaluated === overview.mastery.conceptsTracked) {
    return 'Empieza una sesión guiada: aún no has respondido ninguna pregunta.';
  }
  if (overview.mastery.conceptsInGap > 0) {
    return `Tienes ${overview.mastery.conceptsInGap} concepto(s) con lagunas. Empieza por los más urgentes.`;
  }
  if (overview.dueForReview.length > 0) {
    return `Repaso pendiente en ${overview.dueForReview.length} concepto(s).`;
  }
  return 'Buen trabajo: no hay lagunas pendientes. Sigue avanzando con temario nuevo.';
}
