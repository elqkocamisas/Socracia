import type { CognitiveLevel, SocraticQuestion } from '../domain/types';
import { isAtLeast, levelRank } from './cognitive';

/** Diagnóstico de calidad de una pregunta mayéutica. */
export interface QuestionQualityReport {
  /** Puntuación de calidad en [0, 1]; mayor es mejor. */
  readonly score: number;
  /** `true` si la pregunta es un ejercicio de memoria sin exigencia real. */
  readonly isTrivial: boolean;
  /** Motivos legibles del diagnóstico. */
  readonly reasons: readonly string[];
}

/** Umbrales que deciden si una pregunta es trivial. */
export interface QualityOptions {
  /** Nivel cognitivo mínimo admitido. */
  readonly minLevel: CognitiveLevel;
  /** Longitud mínima de la respuesta de referencia para ser evaluable. */
  readonly minExpectedChars: number;
  /** Número mínimo de términos clave que debe movilizar la pregunta. */
  readonly minKeyTerms: number;
}

export const DEFAULT_QUALITY_OPTIONS: QualityOptions = {
  minLevel: 'comprender',
  minExpectedChars: 40,
  minKeyTerms: 1,
};

/**
 * Evalúa si una pregunta exige comprensión o solo recuerdo literal.
 *
 * El método mayéutico prohíbe el interrogatorio de memoria: una pregunta que
 * puede responderse recitando una etiqueta no hace pensar. Esta función es el
 * filtro que sostiene esa regla de forma verificable.
 */
export function assessQuestionQuality(
  question: SocraticQuestion,
  options: QualityOptions = DEFAULT_QUALITY_OPTIONS,
): QuestionQualityReport {
  const reasons: string[] = [];
  let score = 1;

  if (!isAtLeast(question.level, options.minLevel)) {
    reasons.push(`nivel «${question.level}» por debajo del mínimo «${options.minLevel}»`);
    score -= 0.5;
  }

  if (question.expectedAnswer.trim().length < options.minExpectedChars) {
    reasons.push('respuesta de referencia demasiado corta para evaluar comprensión');
    score -= 0.3;
  }

  if (question.keyTerms.length < options.minKeyTerms) {
    reasons.push('no moviliza términos clave del concepto');
    score -= 0.3;
  }

  // Una pregunta de recuerdo sin contexto es definición pura: memoria.
  if (
    question.level === 'recordar' &&
    !/por qué|compara|aplica|caso|justifica|problema/i.test(question.prompt)
  ) {
    reasons.push('interroga la definición sin pedir razonamiento');
    score -= 0.2;
  }

  const isTrivial = reasons.some(
    (reason) => reason.startsWith('nivel') || reason.startsWith('interroga'),
  );

  return { score: clamp01(score), isTrivial, reasons };
}

/** Resultado de filtrar un conjunto de preguntas. */
export interface QualityFilterResult {
  readonly accepted: readonly SocraticQuestion[];
  readonly rejected: readonly SocraticQuestion[];
}

/**
 * Separa las preguntas no triviales y las ordena por exigencia cognitiva
 * creciente, de modo que el itinerario ascienda en dificultad.
 */
export function filterNonTrivial(
  questions: readonly SocraticQuestion[],
  options: QualityOptions = DEFAULT_QUALITY_OPTIONS,
): QualityFilterResult {
  const accepted: SocraticQuestion[] = [];
  const rejected: SocraticQuestion[] = [];

  for (const question of questions) {
    if (assessQuestionQuality(question, options).isTrivial) {
      rejected.push(question);
    } else {
      accepted.push(question);
    }
  }

  accepted.sort((a, b) => {
    const byLevel = levelRank(a.level) - levelRank(b.level);
    return byLevel === 0 ? a.difficulty - b.difficulty : byLevel;
  });

  return { accepted, rejected };
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
