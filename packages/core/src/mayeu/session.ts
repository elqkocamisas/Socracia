import type {
  AnswerEvaluation,
  Concept,
  GapProfile,
  ReviewState,
  SocraticQuestion,
  StudySession,
  Timestamp,
} from '../domain/types';
import { evaluateAnswer, type EvaluationThresholds } from './evaluate';
import { detectGaps, initialReviewState, scheduleReview } from './gaps';
import type { ItineraryStep } from './itinerary';
import { buildScaffold, needsScaffold, type Scaffold } from './scaffolding';

/** Instantánea del progreso de una sesión. */
export interface SessionProgress {
  readonly answered: number;
  readonly total: number;
  /** Media de dominio en [0, 1] de las respuestas evaluadas. */
  readonly averageScore: number;
  readonly correct: number;
  readonly partial: number;
  readonly incorrect: number;
  readonly finished: boolean;
}

/** Respuesta del motor tras recibir una respuesta del usuario. */
export interface SessionTurn {
  readonly evaluation: AnswerEvaluation;
  /** Repregunta de andamiaje si la respuesta no fue correcta; si no, `null`. */
  readonly scaffold: Scaffold | null;
  /** Siguiente pregunta del itinerario; `null` si la sesión terminó. */
  readonly next: SocraticQuestion | null;
  readonly progress: SessionProgress;
}

/** Opciones del motor de sesión. */
export interface SessionEngineOptions {
  /** Intentos máximos por pregunta antes de avanzar. */
  readonly maxAttemptsPerQuestion: number;
  readonly thresholds: EvaluationThresholds;
}

/**
 * Motor de sesión mayéutica.
 *
 * Orquesta el bucle completo: pregunta → respuesta → evaluación → feedback
 * (repregunta guiada si procede) → siguiente pregunta, manteniendo el estado
 * de repaso espaciado y el perfil de lagunas.
 *
 * No conoce la UI ni la persistencia: recibe texto y devuelve el turno. Esto lo
 * hace íntegramente probable en Node, sin simuladores.
 */
export class MayeuticSessionEngine {
  private cursor = 0;
  private attemptsOnCurrent = 0;
  private readonly evaluations: AnswerEvaluation[] = [];
  private readonly reviews = new Map<string, ReviewState>();
  private readonly conceptById: Map<string, Concept>;
  private finished = false;

  public constructor(
    private readonly session: StudySession,
    private readonly steps: readonly ItineraryStep[],
    concepts: readonly Concept[],
    private readonly options: SessionEngineOptions,
    private readonly now: Timestamp,
  ) {
    this.conceptById = new Map(concepts.map((concept) => [concept.id, concept]));
    for (const concept of concepts) {
      this.reviews.set(concept.id, initialReviewState(concept.id, this.now));
    }
  }

  /** Pregunta actual del itinerario, o `null` si ya no quedan. */
  public currentQuestion(): SocraticQuestion | null {
    return this.steps[this.cursor]?.question ?? null;
  }

  /** `true` cuando se han agotado las preguntas del itinerario. */
  public isFinished(): boolean {
    return this.finished || this.cursor >= this.steps.length;
  }

  /**
   * Registra una respuesta y devuelve el turno: evaluación, repregunta si
   * procede y siguiente pregunta.
   */
  public submit(text: string, latencyMs: number, now: Timestamp): SessionTurn {
    const step = this.steps[this.cursor];
    if (!step) {
      throw new Error('La sesión ya ha terminado: no hay pregunta actual');
    }

    const question = step.question;
    const evaluation = evaluateAnswer(
      question,
      { questionId: question.id, text, answeredAt: now, latencyMs },
      this.options.thresholds,
    );
    this.evaluations.push(evaluation);
    this.attemptsOnCurrent += 1;

    const review =
      this.reviews.get(question.conceptId) ?? initialReviewState(question.conceptId, now);
    this.reviews.set(question.conceptId, scheduleReview(review, evaluation, now));

    const shouldRetry =
      needsScaffold(evaluation) && this.attemptsOnCurrent < this.options.maxAttemptsPerQuestion;

    if (shouldRetry) {
      return {
        evaluation,
        scaffold: buildScaffold(question, evaluation),
        next: question,
        progress: this.progress(),
      };
    }

    this.advance();
    return {
      evaluation,
      scaffold: needsScaffold(evaluation) ? buildScaffold(question, evaluation) : null,
      next: this.currentQuestion(),
      progress: this.progress(),
    };
  }

  /** Progreso agregado de la sesión. */
  public progress(): SessionProgress {
    const total = this.steps.length;
    const scores = this.evaluations.map((evaluation) => evaluation.score);
    const averageScore =
      scores.length === 0 ? 0 : scores.reduce((sum, score) => sum + score, 0) / scores.length;

    return {
      answered: this.evaluations.length,
      total,
      averageScore,
      correct: this.countVerdict('correcta'),
      partial: this.countVerdict('parcial'),
      incorrect: this.countVerdict('incorrecta') + this.countVerdict('sin-respuesta'),
      finished: this.isFinished(),
    };
  }

  /** Perfil de lagunas actualizado con lo respondido hasta el momento. */
  public gapProfile(now: Timestamp): GapProfile {
    return detectGaps(this.session.userId, [...this.conceptById.values()], this.evaluations, now);
  }

  /** Estado de repaso espaciado por concepto. */
  public reviewStates(): readonly ReviewState[] {
    return [...this.reviews.values()];
  }

  /** Todas las evaluaciones emitidas, en orden. */
  public allEvaluations(): readonly AnswerEvaluation[] {
    return [...this.evaluations];
  }

  private advance(): void {
    this.cursor += 1;
    this.attemptsOnCurrent = 0;
    if (this.cursor >= this.steps.length) {
      this.finished = true;
    }
  }

  private countVerdict(verdict: AnswerEvaluation['verdict']): number {
    return this.evaluations.filter((evaluation) => evaluation.verdict === verdict).length;
  }
}
