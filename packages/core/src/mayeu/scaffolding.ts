import type { AnswerEvaluation, SocraticQuestion } from '../domain/types';

/** Estrategia de ayuda que se ofrece tras una respuesta insuficiente. */
export type ScaffoldKind = 'orientar' | 'acotar' | 'descomponer' | 'ejemplificar';

/** Repregunta guiada que ayuda a reconstruir la respuesta sin darla. */
export interface Scaffold {
  readonly kind: ScaffoldKind;
  /** Enunciado de la repregunta. */
  readonly prompt: string;
  /** Términos que la repregunta pone en juego, para orientar sin resolver. */
  readonly hints: readonly string[];
}

/**
 * Genera la repregunta socrática adecuada al tipo de fallo.
 *
 * Principio mayéutico: nunca se entrega la respuesta. Se descompone el problema
 * en una pregunta más pequeña, se orienta hacia el término ausente o se pide un
 * ejemplo concreto. La dificultad de la ayuda es proporcional a la magnitud del
 * fallo.
 */
export function buildScaffold(question: SocraticQuestion, evaluation: AnswerEvaluation): Scaffold {
  const missing = evaluation.missingKeyTerms;
  const focus = missing[0] ?? question.keyTerms[0] ?? 'la idea central';

  switch (evaluation.verdict) {
    case 'sin-respuesta':
      return {
        kind: 'orientar',
        prompt: `Empecemos por lo más básico: ¿qué crees que designa «${focus}» en este contexto? Intenta decirlo con una frase propia, aunque no estés seguro.`,
        hints: [focus],
      };
    case 'incorrecta':
      return {
        kind: 'descomponer',
        prompt: `Vamos por partes. Antes de responder sobre el conjunto, define solo «${focus}» y explica para qué sirve. Después veremos cómo encaja.`,
        hints: [focus],
      };
    case 'parcial':
      return {
        kind: 'acotar',
        prompt: `Vas bien encaminado. Ahora concreta: ¿cómo se relaciona «${question.keyTerms[0] ?? focus}» con ${
          missing.length > 0 ? `«${missing[0] as string}»` : 'el resto del concepto'
        }? Justifica la conexión.`,
        hints: missing.length > 0 ? missing.slice(0, 2) : [focus],
      };
    case 'correcta':
      return {
        kind: 'ejemplificar',
        prompt: `Correcto. Para consolidar, pon un ejemplo concreto donde se vea «${question.conceptId}» en acción y explica por qué encaja.`,
        hints: [],
      };
  }
}

/** `true` si el veredicto merece una repregunta antes de avanzar. */
export function needsScaffold(evaluation: AnswerEvaluation): boolean {
  return evaluation.verdict !== 'correcta';
}
