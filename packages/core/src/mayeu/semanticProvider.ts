import type {
  Citation,
  Concept,
  KnowledgeDocument,
  SocraticQuestion,
  UserAnswer,
} from '../domain/types';
import type { GenerateQuestionsOptions } from './questionGenerator';
import type { Result } from '../result';

/** Borrador semántico antes de añadir identificadores y cita en el núcleo. */
export interface SemanticQuestionDraft {
  readonly prompt: string;
  readonly move: SocraticQuestion['move'];
  readonly level: Exclude<SocraticQuestion['level'], 'recordar'>;
  readonly expectedAnswer: string;
  readonly keyTerms: readonly string[];
  readonly difficulty: number;
}

/** Señales semánticas de evaluación; el núcleo decide el veredicto final. */
export interface SemanticAnswerAssessment {
  readonly score: number;
  readonly matchedKeyTerms: readonly string[];
  readonly feedback: string;
}

/** Frontera opcional con el LLM; nunca importa SDKs ni APIs de plataforma. */
export interface MayeuticSemanticProvider {
  canProcess(document: KnowledgeDocument): boolean;
  generateQuestions(
    concept: Concept,
    citation: Citation,
    options: GenerateQuestionsOptions,
  ): Promise<Result<readonly SemanticQuestionDraft[], Error>>;
  evaluateAnswer(
    question: SocraticQuestion,
    answer: UserAnswer,
  ): Promise<Result<SemanticAnswerAssessment, Error>>;
}
