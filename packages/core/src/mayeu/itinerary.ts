import type {
  AnswerEvaluation,
  Concept,
  SocraticQuestion,
  StudySession,
  Timestamp,
} from '../domain/types';
import { GAP_THRESHOLD } from './gaps';

/**
 * Itinerario de asimilación progresiva.
 *
 * Ordena los conceptos y sus preguntas para que el usuario avance de lo que
 * ya domina hacia lo que no, y dentro de cada concepto de la comprensión a la
 * transferencia. Es la materialización de la idea mayéutica de "no preguntar
 * lo que no puede responderse todavía".
 */
export interface ItineraryStep {
  readonly conceptId: string;
  readonly conceptLabel: string;
  readonly question: SocraticQuestion;
  /** Posición global en el itinerario, base 0. */
  readonly order: number;
}

/** Opciones del itinerario. */
export interface ItineraryOptions {
  /** Máximo de preguntas por concepto dentro del itinerario. */
  readonly questionsPerConcept: number;
  /** Prioriza conceptos con laguna conocida antes que los no evaluados. */
  readonly prioritizeGaps: boolean;
}

export const DEFAULT_ITINERARY_OPTIONS: ItineraryOptions = {
  questionsPerConcept: 2,
  prioritizeGaps: true,
};

/** Preguntas generadas para un concepto, con su cita documental. */
export interface ConceptQuestions {
  readonly concept: Concept;
  readonly questions: readonly SocraticQuestion[];
}

/**
 * Construye el itinerario a partir de las preguntas por concepto y de las
 * evaluaciones previas (si las hay).
 *
 * Orden: primero los conceptos con peor dominio medio (lagunas), después los
 * no evaluados, y por último los dominados. Dentro de cada concepto, las
 * preguntas ascienden en exigencia cognitiva.
 */
export function buildItinerary(
  items: readonly ConceptQuestions[],
  evaluations: readonly AnswerEvaluation[] = [],
  options: ItineraryOptions = DEFAULT_ITINERARY_OPTIONS,
): ItineraryStep[] {
  const masteryByConcept = averageScoreByConcept(evaluations);

  const ranked = [...items].sort((a, b) => {
    const scoreA = masteryByConcept.get(a.concept.id);
    const scoreB = masteryByConcept.get(b.concept.id);
    return rank(scoreA, options.prioritizeGaps) - rank(scoreB, options.prioritizeGaps);
  });

  const steps: ItineraryStep[] = [];
  for (const item of ranked) {
    const ordered = [...item.questions].sort(compareByDemand);
    for (const question of ordered.slice(0, Math.max(0, options.questionsPerConcept))) {
      steps.push({
        conceptId: item.concept.id,
        conceptLabel: item.concept.label,
        question,
        order: steps.length,
      });
    }
  }
  return steps;
}

/**
 * Clave de orden del itinerario.
 *
 * Se agrupa en tres franjas: primero las lagunas (dominio por debajo del umbral,
 * las peores antes), después los conceptos sin evaluar, y por último los ya
 * dominados. Así el usuario refuerza lo que falla antes de estrenar materia
 * nueva, sin abandonar nunca lo que ya controla.
 */
function rank(score: number | undefined, prioritizeGaps: boolean): number {
  if (!prioritizeGaps) {
    return 0;
  }
  if (score === undefined) {
    return GAP_THRESHOLD;
  }
  return score;
}

function compareByDemand(a: SocraticQuestion, b: SocraticQuestion): number {
  return a.difficulty === b.difficulty ? a.id.localeCompare(b.id) : a.difficulty - b.difficulty;
}

function averageScoreByConcept(evaluations: readonly AnswerEvaluation[]): Map<string, number> {
  const sums = new Map<string, { total: number; count: number }>();
  for (const evaluation of evaluations) {
    const entry = sums.get(evaluation.conceptId) ?? { total: 0, count: 0 };
    entry.total += evaluation.score;
    entry.count += 1;
    sums.set(evaluation.conceptId, entry);
  }
  const averages = new Map<string, number>();
  for (const [conceptId, { total, count }] of sums) {
    averages.set(conceptId, total / count);
  }
  return averages;
}

/** Marca una sesión como iniciada sobre un temario. */
export function startSession(
  id: string,
  userId: string,
  topicId: string,
  steps: readonly ItineraryStep[],
  now: Timestamp,
): StudySession {
  return {
    id,
    userId,
    topicId,
    startedAt: now,
    finishedAt: null,
    questionIds: steps.map((step) => step.question.id),
    answers: [],
  };
}
