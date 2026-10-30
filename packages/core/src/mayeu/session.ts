import type {
  AnswerEvaluation,
  Concept,
  GapProfile,
  ReviewState,
  SocraticQuestion,
  StudySession,
  Timestamp,
  UserAnswer,
} from '../domain/types';
import type { AnswerEvaluatorPort } from '../llm/ports';
import type { LlmPassage } from '../llm/types';
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
  /**
   * Evaluador semántico opcional. Si está presente, `submitAsync` lo usa; si no,
   * o si falla, se aplica la heurística de `evaluateAnswer`. Ausente por defecto:
   * el camino síncrono no cambia.
   */
  readonly evaluator?: AnswerEvaluatorPort;
  /**
   * Pasajes documentales que respaldan la pregunta actual, para enviar como
   * contexto al evaluador. Sin ellos, el evaluador no se invoca: no se manda
   * contenido sin la fuente que lo justifica.
   */
  readonly passages?: (question: SocraticQuestion) => readonly LlmPassage[];
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
  private readonly answers: UserAnswer[] = [];
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
   *
   * Camino síncrono, con la heurística de `evaluateAnswer`. Se mantiene intacto
   * para los llamantes que no usan modelo.
   */
  public submit(text: string, latencyMs: number, now: Timestamp): SessionTurn {
    const step = this.requireCurrentStep();
    const answer = this.newAnswer(step.question, text, now, latencyMs);
    return this.registerAnswer(step, answer, evaluateAnswer(step.question, answer, this.options.thresholds));
  }

  /**
   * Variante asíncrona que usa el evaluador semántico si está disponible.
   *
   * Prioridad: si hay evaluador y pasajes, se pide la evaluación al modelo y se
   * usa su juicio. Si no hay evaluador, si no hay pasajes, o si la llamada falla
   * (timeout, cuota, circuito, salida inválida), se cae a la heurística: la
   * sesión **nunca** se interrumpe por un fallo del modelo. Es el modo principal
   * de la experiencia; la heurística es la red de seguridad.
   */
  public async submitAsync(
    text: string,
    latencyMs: number,
    now: Timestamp,
  ): Promise<SessionTurn> {
    const step = this.requireCurrentStep();
    const answer = this.newAnswer(step.question, text, now, latencyMs);

    const evaluation = await this.evaluateWithFallback(step, answer);
    return this.registerAnswer(step, answer, evaluation);
  }

  /** Evalúa con el modelo si procede, y degrada a la heurística ante cualquier fallo. */
  private async evaluateWithFallback(
    step: ItineraryStep,
    answer: UserAnswer,
  ): Promise<AnswerEvaluation> {
    const heuristic = (): AnswerEvaluation =>
      evaluateAnswer(step.question, answer, this.options.thresholds);

    const evaluator = this.options.evaluator;
    if (!evaluator) {
      return heuristic();
    }
    // Reutiliza la evaluación heurística como respaldo y como cita por defecto:
    // si el modelo no cita nada válido, la pregunta ya trae su propio pasaje.
    const fallback = heuristic();
    const passages = this.options.passages?.(step.question) ?? [];
    if (passages.length === 0) {
      return fallback;
    }

    const result = await evaluator.evaluate(step.question, answer, passages);
    return result.ok ? result.value : fallback;
  }

  /** Valida que haya pregunta actual y construye la respuesta del usuario. */
  private requireCurrentStep(): ItineraryStep {
    const step = this.steps[this.cursor];
    if (!step) {
      throw new Error('La sesión ya ha terminado: no hay pregunta actual');
    }
    return step;
  }

  private newAnswer(
    question: SocraticQuestion,
    text: string,
    now: Timestamp,
    latencyMs: number,
  ): UserAnswer {
    return { questionId: question.id, text, answeredAt: now, latencyMs };
  }

  /**
   * Aplica una evaluación ya emitida: acumula, programa el repaso y decide si
   * repreguntar o avanzar.
   *
   * Es común a `submit` y `submitAsync`, de modo que ambos caminos comparten
   * exactamente la misma lógica de avance. Solo cambia de dónde viene la
   * evaluación.
   */
  private registerAnswer(
    step: ItineraryStep,
    answer: UserAnswer,
    evaluation: AnswerEvaluation,
  ): SessionTurn {
    const question = step.question;
    this.evaluations.push(evaluation);
    this.answers.push(answer);
    this.attemptsOnCurrent += 1;

    const review =
      this.reviews.get(question.conceptId) ?? initialReviewState(question.conceptId, answer.answeredAt);
    this.reviews.set(question.conceptId, scheduleReview(review, evaluation, answer.answeredAt));

    const shouldRetry =
      needsScaffold(evaluation) && this.attemptsOnCurrent < this.options.maxAttemptsPerQuestion;

    if (shouldRetry) {
      return {
        evaluation,
        scaffold: buildScaffold(question, evaluation, step.conceptLabel),
        next: question,
        progress: this.progress(),
      };
    }

    this.advance();
    return {
      evaluation,
      scaffold: needsScaffold(evaluation)
        ? buildScaffold(question, evaluation, step.conceptLabel)
        : null,
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
      // Se cuentan preguntas distintas, no intentos: un reintento con andamiaje
      // no debe hacer que el progreso supere el total del itinerario.
      answered: new Set(this.evaluations.map((evaluation) => evaluation.questionId)).size,
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

  /** Todas las respuestas registradas, en orden. */
  public allAnswers(): readonly UserAnswer[] {
    return [...this.answers];
  }

  /**
   * Sesión con las respuestas acumuladas hasta el momento.
   *
   * Permite persistir el avance sin depender del estado en memoria de la UI.
   */
  public snapshot(finishedAt: Timestamp | null = null): StudySession {
    return {
      ...this.session,
      answers: [...this.answers],
      finishedAt:
        finishedAt ?? (this.isFinished() ? (this.answers.at(-1)?.answeredAt ?? null) : null),
    };
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
