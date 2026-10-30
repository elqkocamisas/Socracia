import type { AnswerVerdict, Citation, SocraticQuestion, Timestamp } from '../domain/types';
import type { Result } from '../result';
import { err, ok } from '../result';
import type { Scaffold } from '../mayeu/scaffolding';
import type { SessionProgress, SessionTurn } from '../mayeu/session';
import type { StoragePort } from '../storage/ports';
import type { ActiveStudySession, StudyService } from './studyService';
import type { ProgressOverview } from './progressService';

/** Fase del recorrido mayéutico que debe pintar la UI. */
export type StudyPhase = 'preguntando' | 'retroalimentando' | 'terminada';

/** Estado completo de la conversación guiada, listo para renderizar. */
export interface StudyViewState {
  readonly phase: StudyPhase;
  /** Pregunta actual; `null` si la sesión terminó. */
  readonly question: SocraticQuestion | null;
  readonly conceptLabel: string | null;
  /** Fuente documental de la pregunta actual, para mostrar trazabilidad. */
  readonly citation: Citation | null;
  readonly progress: SessionProgress;
  /** Feedback de la última respuesta; `null` antes de responder. */
  readonly feedback: string | null;
  readonly verdict: AnswerVerdict | null;
  /** Repregunta de andamiaje si el fallo lo justifica; si no, `null`. */
  readonly scaffold: Scaffold | null;
  /** Puntuación de la última respuesta en [0, 1]. */
  readonly lastScore: number | null;
}

/** Error del controlador de sesión. */
export interface SessionControllerError {
  readonly code:
    'sin-temario' | 'sesion-no-iniciada' | 'preparacion-fallida' | 'evaluacion-fallida';
  readonly message: string;
}

/**
 * Controlador de la conversación mayéutica.
 *
 * Mantiene el bucle pregunta → respuesta → feedback → siguiente pregunta y
 * expone un estado inmutable que la UI pinta sin lógica de negocio propia.
 * No conoce React ni el almacenamiento concreto: recibe `StudyService` y
 * `StoragePort` por inyección, de modo que es probable íntegramente en Node.
 */
export class MayeuticSessionController {
  private active: ActiveStudySession | null = null;
  private view: StudyViewState | null = null;

  public constructor(
    private readonly study: StudyService,
    private readonly storage: StoragePort,
    private readonly userId: string,
  ) {}

  /**
   * Inicia una sesión sobre el temario ya importado de un documento.
   *
   * Devuelve error explícito si el documento no tiene temario guardado, para
   * que la UI pueda ofrecer importar en lugar de fallar en silencio.
   */
  public async start(
    documentId: string,
    now: Timestamp,
    sessionId: string,
  ): Promise<Result<StudyViewState, SessionControllerError>> {
    const curriculum = await this.storage.documents.getCurriculum(documentId);
    if (!curriculum) {
      return err<SessionControllerError>({
        code: 'sin-temario',
        message: 'Este documento aún no tiene temario procesado. Vuelve a adjuntarlo.',
      });
    }

    const documents = await this.storage.documents.listDocuments();
    const prepared = await this.study.prepareSession(
      this.userId,
      curriculum,
      documents,
      now,
      sessionId,
    );
    if (!prepared.ok) {
      return err<SessionControllerError>({
        code: 'preparacion-fallida',
        message: prepared.error.message,
      });
    }

    this.active = prepared.value;
    this.view = this.buildView(null);
    return ok(this.view);
  }

  /** Estado actual de la conversación, o `null` si no hay sesión activa. */
  public state(): StudyViewState | null {
    return this.view;
  }

  /**
   * Registra la respuesta del usuario y devuelve el estado siguiente.
   *
   * El feedback y el andamiaje vienen del motor; aquí solo se decide la fase:
   * si queda repregunta, se vuelve a preguntar el mismo concepto; si no, se
   * avanza a la siguiente pregunta o se cierra la sesión.
   */
  public async answer(
    text: string,
    latencyMs: number,
    now: Timestamp,
  ): Promise<Result<StudyViewState, SessionControllerError>> {
    if (!this.active) {
      return err<SessionControllerError>({
        code: 'sesion-no-iniciada',
        message: 'No hay sesión activa. Inicia una antes de responder.',
      });
    }

    // Idempotente ante un doble envío tras terminar: devuelve el estado final
    // en lugar de lanzar, para que la UI no se rompa por un toque extra.
    if (this.active.engine.isFinished()) {
      return ok(this.view ?? this.buildView(null));
    }

    const turn = await this.study.answer(this.active, this.userId, text, latencyMs, now);
    this.view = this.buildView(turn);
    return ok(this.view);
  }

  /** Vista de progreso del usuario, con sugerencia de siguiente acción. */
  public async overview(now: Timestamp): Promise<ProgressOverview & { readonly hint: string }> {
    const curricula = await this.storage.documents.listCurricula();
    const concepts = curricula.flatMap((record) => record.concepts);
    return this.study.overview(this.userId, concepts, now);
  }

  private buildView(turn: SessionTurn | null): StudyViewState {
    if (!this.active) {
      throw new Error('No hay sesión activa');
    }
    const question = this.active.engine.currentQuestion();
    const step = this.active.steps.find((candidate) => candidate.question.id === question?.id);
    const progress = turn?.progress ?? this.active.engine.progress();

    // La fase terminal se decide solo por el progreso: si no quedan preguntas,
    // la conversación ha acabado, aunque el último turno traiga retroalimentación.
    return {
      phase: progress.finished ? 'terminada' : turn ? 'retroalimentando' : 'preguntando',
      question,
      conceptLabel: step?.conceptLabel ?? null,
      citation: question?.citation ?? null,
      progress,
      feedback: turn?.evaluation.feedback ?? null,
      verdict: turn?.evaluation.verdict ?? null,
      scaffold: turn?.scaffold ?? null,
      lastScore: turn?.evaluation.score ?? null,
    };
  }
}
