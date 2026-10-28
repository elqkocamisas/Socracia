import type {
  AnswerEvaluation,
  AnswerVerdict,
  SocraticQuestion,
  UserAnswer,
} from '../domain/types';
import { tokenize } from '../rag/embeddings';

/** Umbrales de puntuación que separan los veredictos. */
export interface EvaluationThresholds {
  /** Puntuación mínima para considerar la respuesta correcta. */
  readonly correct: number;
  /** Puntuación mínima para considerar la respuesta parcial. */
  readonly partial: number;
}

export const DEFAULT_THRESHOLDS: EvaluationThresholds = {
  correct: 0.6,
  partial: 0.3,
};

/**
 * Evalúa una respuesta del usuario contra la respuesta de referencia.
 *
 * Combina tres señales: cobertura de términos clave (peso 0.6), solapamiento
 * léxico con la definición esperada (peso 0.4). Es una heurística sin modelo,
 * deliberadamente explicable y testeable, coherente con el requisito de
 * "ML sencillo" y sin infraestructura pesada.
 */
export function evaluateAnswer(
  question: SocraticQuestion,
  answer: UserAnswer | null,
  thresholds: EvaluationThresholds = DEFAULT_THRESHOLDS,
): AnswerEvaluation {
  const text = answer?.text.trim() ?? '';

  if (text.length === 0) {
    return {
      questionId: question.id,
      conceptId: question.conceptId,
      verdict: 'sin-respuesta',
      score: 0,
      matchedKeyTerms: [],
      missingKeyTerms: [...question.keyTerms],
      feedback: 'No has respondido. Intenta reformular el concepto antes de continuar.',
    };
  }

  const answerTokens = new Set(tokenize(text));
  const matchedKeyTerms = question.keyTerms.filter((term) => matchesTerm(term, answerTokens, text));
  const missingKeyTerms = question.keyTerms.filter((term) => !matchedKeyTerms.includes(term));

  const termCoverage =
    question.keyTerms.length === 0 ? 0 : matchedKeyTerms.length / question.keyTerms.length;
  const overlap = jaccard(answerTokens, new Set(tokenize(question.expectedAnswer)));

  const score = clamp01(termCoverage * 0.6 + overlap * 0.4);
  const verdict = classify(score, thresholds);

  return {
    questionId: question.id,
    conceptId: question.conceptId,
    verdict,
    score,
    matchedKeyTerms,
    missingKeyTerms,
    feedback: buildFeedback(verdict, missingKeyTerms),
  };
}

function classify(score: number, thresholds: EvaluationThresholds): AnswerVerdict {
  if (score >= thresholds.correct) {
    return 'correcta';
  }
  if (score >= thresholds.partial) {
    return 'parcial';
  }
  return 'incorrecta';
}

function buildFeedback(verdict: AnswerVerdict, missing: readonly string[]): string {
  const missingText = missing.length > 0 ? ` Te faltó integrar: ${missing.join(', ')}.` : '';
  switch (verdict) {
    case 'correcta':
      return `Respuesta sólida: dominas los elementos clave del concepto.${missingText}`;
    case 'parcial':
      return `Vas por buen camino, pero la respuesta está incompleta.${missingText}`;
    case 'incorrecta':
      return `La respuesta no aborda el concepto con precisión.${missingText}`;
    case 'sin-respuesta':
      return 'No has respondido.';
  }
}

/** `true` si el término clave aparece como token o como subcadena normalizada. */
function matchesTerm(term: string, tokens: Set<string>, rawText: string): boolean {
  const normalizedTerm = normalize(term);
  if (tokens.has(normalizedTerm)) {
    return true;
  }
  return normalize(rawText).includes(normalizedTerm);
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) {
    return 0;
  }
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) {
      intersection += 1;
    }
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
