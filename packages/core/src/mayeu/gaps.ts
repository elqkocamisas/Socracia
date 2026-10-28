import type {
  AnswerEvaluation,
  Concept,
  GapProfile,
  KnowledgeGap,
  ReviewState,
} from '../domain/types';

/** Puntuación de dominio por debajo de la cual se considera laguna. */
export const GAP_THRESHOLD = 0.6;

/**
 * Construye el perfil de lagunas a partir de las evaluaciones de una sesión.
 *
 * La severidad combina el déficit de dominio (`1 - score`) con la frecuencia
 * de fallo, de modo que un concepto fallado repetidamente sube de prioridad.
 * Es determinista y sin estado: la misma entrada produce la misma salida.
 */
export function detectGaps(
  userId: string,
  concepts: readonly Concept[],
  evaluations: readonly AnswerEvaluation[],
  now: number,
): GapProfile {
  const byConcept = new Map<string, AnswerEvaluation[]>();
  for (const evaluation of evaluations) {
    const list = byConcept.get(evaluation.conceptId) ?? [];
    list.push(evaluation);
    byConcept.set(evaluation.conceptId, list);
  }

  const conceptById = new Map(concepts.map((concept) => [concept.id, concept]));
  const gaps: KnowledgeGap[] = [];

  for (const [conceptId, conceptEvaluations] of byConcept) {
    const concept = conceptById.get(conceptId);
    if (!concept) {
      continue;
    }
    const averageScore =
      conceptEvaluations.reduce((sum, evaluation) => sum + evaluation.score, 0) /
      conceptEvaluations.length;

    if (averageScore >= GAP_THRESHOLD) {
      continue;
    }

    const deficit = 1 - averageScore;
    const failureRate =
      conceptEvaluations.filter((evaluation) => evaluation.verdict !== 'correcta').length /
      conceptEvaluations.length;

    gaps.push({
      conceptId,
      conceptLabel: concept.label,
      severity: clamp01(deficit * 0.7 + failureRate * 0.3),
      attempts: conceptEvaluations.length,
      lastEvaluatedAt: now,
      rationale: `Dominio medio ${(averageScore * 100).toFixed(0)}% en ${
        conceptEvaluations.length
      } intento(s); faltan: ${collectMissing(conceptEvaluations).join(', ') || 'precisión'}.`,
    });
  }

  gaps.sort((a, b) => b.severity - a.severity);

  return {
    userId,
    generatedAt: now,
    gaps,
    recommendedReview: gaps.map((gap) => gap.conceptId),
  };
}

function collectMissing(evaluations: readonly AnswerEvaluation[]): string[] {
  const missing = new Set<string>();
  for (const evaluation of evaluations) {
    for (const term of evaluation.missingKeyTerms) {
      missing.add(term);
    }
  }
  return [...missing];
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** Parámetros del algoritmo de repetición espaciada. */
export interface SpacedRepetitionConfig {
  readonly initialEase: number;
  readonly minEase: number;
  readonly maxEase: number;
  readonly initialIntervalDays: number;
  readonly easyBonus: number;
  readonly hardPenalty: number;
}

export const DEFAULT_SR_CONFIG: SpacedRepetitionConfig = {
  initialEase: 2.5,
  minEase: 1.3,
  maxEase: 2.8,
  initialIntervalDays: 1,
  easyBonus: 0.1,
  hardPenalty: 0.2,
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** Estado inicial de repaso para un concepto nunca estudiado. */
export function initialReviewState(conceptId: string, now: number): ReviewState {
  return {
    conceptId,
    ease: DEFAULT_SR_CONFIG.initialEase,
    intervalDays: 0,
    repetitions: 0,
    dueAt: now,
    lastReviewedAt: null,
  };
}

/**
 * Actualiza el estado de repaso tras una evaluación (SM-2 simplificado).
 *
 * - Respuesta correcta: sube la facilidad y multiplica el intervalo.
 * - Respuesta parcial: mantiene la facilidad y repite el intervalo.
 * - Respuesta incorrecta: baja la facilidad y reinicia el intervalo.
 */
export function scheduleReview(
  state: ReviewState,
  evaluation: AnswerEvaluation,
  now: number,
  config: SpacedRepetitionConfig = DEFAULT_SR_CONFIG,
): ReviewState {
  switch (evaluation.verdict) {
    case 'correcta': {
      const ease = clamp(state.ease + config.easyBonus, config.minEase, config.maxEase);
      const repetitions = state.repetitions + 1;
      const intervalDays =
        repetitions === 1
          ? config.initialIntervalDays
          : Math.round(Math.max(1, state.intervalDays) * ease);
      return {
        conceptId: state.conceptId,
        ease,
        intervalDays,
        repetitions,
        dueAt: now + intervalDays * DAY_MS,
        lastReviewedAt: now,
      };
    }
    case 'parcial': {
      const intervalDays = Math.max(1, state.intervalDays || config.initialIntervalDays);
      return {
        ...state,
        intervalDays,
        dueAt: now + intervalDays * DAY_MS,
        lastReviewedAt: now,
      };
    }
    case 'incorrecta':
    case 'sin-respuesta': {
      const ease = clamp(state.ease - config.hardPenalty, config.minEase, config.maxEase);
      return {
        conceptId: state.conceptId,
        ease,
        intervalDays: config.initialIntervalDays,
        repetitions: 0,
        dueAt: now + config.initialIntervalDays * DAY_MS,
        lastReviewedAt: now,
      };
    }
  }
}

/** `true` si el concepto debe repasarse en el instante `now`. */
export function isDue(state: ReviewState, now: number): boolean {
  return state.dueAt <= now;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
