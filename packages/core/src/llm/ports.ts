/**
 * Puertos de las tareas mayéuticas asistidas por modelo.
 *
 * La sesión y el servicio de estudio dependen de estas interfaces, no de las
 * clases concretas. Así se pueden inyectar adaptadores distintos (evaluador
 * semántico, generador, seguimiento) o ninguno, y el motor sigue funcionando.
 */

import type { AnswerEvaluation, SocraticQuestion, UserAnswer } from '../domain/types';
import type { Result } from '../result';
import type { LlmError, LlmPassage } from './types';

/** Evalúa una respuesta contra los pasajes recuperados. */
export interface AnswerEvaluatorPort {
  readonly id: string;
  evaluate(
    question: SocraticQuestion,
    answer: UserAnswer | null,
    passages: readonly LlmPassage[],
  ): Promise<Result<AnswerEvaluation, LlmError>>;
}

/** Repregunta de seguimiento adaptada al error concreto. */
export interface FollowUpSuggestion {
  readonly kind: 'orientar' | 'acotar' | 'descomponer' | 'ejemplificar';
  readonly prompt: string;
  readonly hints: readonly string[];
}

/** Genera una repregunta a partir del error concreto del alumno. */
export interface FollowUpPort {
  readonly id: string;
  followUp(
    question: SocraticQuestion,
    answer: UserAnswer | null,
    evaluation: AnswerEvaluation,
  ): Promise<Result<FollowUpSuggestion, LlmError>>;
}

/** Explicación fundamentada con citas, solo tras fallos repetidos. */
export interface Explanation {
  readonly text: string;
  readonly citations: readonly string[];
}

/** Produce una explicación fundamentada en los pasajes. */
export interface ExplainerPort {
  readonly id: string;
  explain(
    question: SocraticQuestion,
    passages: readonly LlmPassage[],
    missingKeyTerms: readonly string[],
  ): Promise<Result<Explanation, LlmError>>;
}

/** Genera preguntas socráticas ancladas en un pasaje del temario. */
export interface QuestionGeneratorPort {
  readonly id: string;
  generate(
    target: {
      readonly conceptId: string;
      readonly conceptLabel: string;
      readonly conceptDefinition: string;
      readonly keyTerms: readonly string[];
    },
    passages: readonly LlmPassage[],
    avoidPrompts?: readonly string[],
  ): Promise<Result<SocraticQuestion[], LlmError>>;
}
