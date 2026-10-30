import type {
  AnswerEvaluation,
  Concept,
  GapProfile,
  KnowledgeDocument,
  SocraticQuestion,
  StudySession,
  Timestamp,
} from '../domain/types';
import type { ExtractedCurriculum } from '../ingest/conceptExtractor';
import type { Result } from '../result';
import { err, ok } from '../result';
import { buildItinerary, startSession, type ItineraryStep } from '../mayeu/itinerary';
import {
  DEFAULT_GENERATE_OPTIONS,
  type GenerateQuestionsOptions,
} from '../mayeu/questionGenerator';
import { filterNonTrivial } from '../mayeu/questionQuality';
import {
  MayeuticSessionEngine,
  type SessionEngineOptions,
  type SessionTurn,
} from '../mayeu/session';
import { DEFAULT_THRESHOLDS } from '../mayeu/evaluate';
import type { MayeuticSemanticProvider } from '../mayeu/semanticProvider';
import type { RagEngine } from '../rag/engine';
import type { StoragePort } from '../storage/ports';
import { buildProgressOverview, nextActionHint, type ProgressOverview } from './progressService';

/** Opciones del servicio de estudio. */
export interface StudyServiceOptions {
  readonly questions: GenerateQuestionsOptions;
  readonly session: SessionEngineOptions;
  /** Preguntas por concepto que entran en el itinerario. */
  readonly questionsPerConcept: number;
  /** Persiste el perfil de lagunas al refrescar el progreso. */
  readonly persistGaps: boolean;
}

export const DEFAULT_STUDY_OPTIONS: StudyServiceOptions = {
  questions: DEFAULT_GENERATE_OPTIONS,
  session: { maxAttemptsPerQuestion: 2, thresholds: DEFAULT_THRESHOLDS },
  questionsPerConcept: 2,
  persistGaps: true,
};

/** Sesión de estudio lista para consumir desde la UI. */
export interface ActiveStudySession {
  readonly session: StudySession;
  readonly engine: MayeuticSessionEngine;
  readonly steps: readonly ItineraryStep[];
  readonly documents: readonly KnowledgeDocument[];
}

/** Error de dominio del servicio de estudio. */
export interface StudyError {
  readonly code: 'sin-conceptos' | 'generacion-fallida' | 'evaluacion-fallida';
  readonly message: string;
}

/**
 * Servicio de estudio: la capa de aplicación del MVP.
 *
 * Conecta la ingesta documental con el motor mayéutico y la persistencia, de
 * modo que la UI solo tenga que llamar a tres métodos: preparar una sesión,
 * responder y consultar el progreso.
 */
export class StudyService {
  public constructor(
    private readonly rag: RagEngine,
    private readonly storage: StoragePort,
    private readonly options: StudyServiceOptions = DEFAULT_STUDY_OPTIONS,
    private readonly semanticProvider?: MayeuticSemanticProvider,
  ) {}

  /**
   * Prepara una sesión para un temario ya ingerido.
   *
   * Recupera evidencia del RAG por concepto, genera preguntas no triviales,
   * construye el itinerario priorizando lagunas y devuelve el motor listo.
   */
  public async prepareSession(
    userId: string,
    curriculum: ExtractedCurriculum,
    documents: readonly KnowledgeDocument[],
    now: Timestamp,
    sessionId: string,
  ): Promise<Result<ActiveStudySession, StudyError>> {
    if (curriculum.concepts.length === 0) {
      return err<StudyError>({
        code: 'sin-conceptos',
        message: 'El temario no contiene conceptos evaluables. Revisa el documento.',
      });
    }

    const generated = await this.generateForConcepts(curriculum.concepts, documents);
    if (!generated.ok) {
      return generated;
    }

    const priorEvaluations = await this.storage.progress.listEvaluations(userId);
    const steps = buildItinerary(generated.value, priorEvaluations, {
      questionsPerConcept: this.options.questionsPerConcept,
      prioritizeGaps: true,
    });

    if (steps.length === 0) {
      return err<StudyError>({
        code: 'sin-conceptos',
        message: 'No se pudieron generar preguntas para este temario.',
      });
    }

    const session = startSession(sessionId, userId, curriculum.topics[0]?.id ?? 'tema', steps, now);
    const engine = new MayeuticSessionEngine(
      session,
      steps,
      curriculum.concepts,
      this.options.session,
      now,
    );
    await this.storage.progress.saveSession(session);

    return ok({ session, engine, steps, documents });
  }

  /**
   * Registra una respuesta y persiste la evaluación y el repaso resultantes.
   *
   * Devuelve el turno completo para que la UI pinte feedback, andamiaje y
   * siguiente pregunta sin lógica de negocio propia.
   */
  public async answer(
    active: ActiveStudySession,
    userId: string,
    text: string,
    latencyMs: number,
    now: Timestamp,
  ): Promise<Result<SessionTurn, StudyError>> {
    const question = active.engine.currentQuestion();
    if (!question) {
      return err<StudyError>({
        code: 'evaluacion-fallida',
        message: 'No hay una pregunta activa para evaluar.',
      });
    }

    const document = active.documents.find(
      (candidate) => candidate.id === question.citation.documentId,
    );
    let assessment;
    if (text.trim().length > 0 && document && this.semanticProvider?.canProcess(document)) {
      const evaluated = await this.semanticProvider.evaluateAnswer(question, {
        questionId: question.id,
        text,
        answeredAt: now,
        latencyMs,
      });
      if (!evaluated.ok) {
        return err<StudyError>({
          code: 'evaluacion-fallida',
          message: `No se pudo evaluar semánticamente la respuesta: ${evaluated.error.message}`,
        });
      }
      assessment = evaluated.value;
    }

    const turn = active.engine.submit(text, latencyMs, now, assessment);
    await this.storage.progress.appendEvaluations(userId, [turn.evaluation]);
    await this.storage.progress.saveReviewStates(userId, active.engine.reviewStates());
    // El avance se persiste para poder reanudar o sincronizar la sesión sin
    // depender del estado en memoria de la UI.
    await this.storage.progress.saveSession(active.engine.snapshot());
    return ok(turn);
  }

  /**
   * Vista de progreso lista para la UI: dominio, lagunas y repaso pendiente.
   *
   * Reúne las evaluaciones y los estados de repaso persistidos y delega el
   * cálculo en `buildProgressOverview`, que es puro.
   */
  public async overview(
    userId: string,
    concepts: readonly Concept[],
    now: Timestamp,
  ): Promise<ProgressOverview & { readonly hint: string }> {
    const [evaluations, reviewStates] = await Promise.all([
      this.storage.progress.listEvaluations(userId),
      this.storage.progress.listReviewStates(userId),
    ]);
    const overview = buildProgressOverview(userId, concepts, evaluations, reviewStates, now);
    return { ...overview, hint: nextActionHint(overview) };
  }

  /** Perfil de lagunas actualizado, persistido para la pantalla de progreso. */
  public async refreshProgress(active: ActiveStudySession, now: Timestamp): Promise<GapProfile> {
    const profile = active.engine.gapProfile(now);
    if (this.options.persistGaps) {
      await this.storage.progress.saveGapProfile(profile);
    }
    return profile;
  }

  /** Último perfil de lagunas guardado, para abrir la app sin sesión activa. */
  public async lastGapProfile(userId: string): Promise<GapProfile | null> {
    return this.storage.progress.getGapProfile(userId);
  }

  /** Genera y persiste preguntas no triviales para cada concepto. */
  private async generateForConcepts(
    concepts: readonly Concept[],
    documents: readonly KnowledgeDocument[],
  ): Promise<Result<Array<{ concept: Concept; questions: SocraticQuestion[] }>, StudyError>> {
    const items: Array<{ concept: Concept; questions: SocraticQuestion[] }> = [];

    for (const concept of concepts) {
      const generated = await this.rag.generateConceptQuestions(
        concept,
        documents,
        this.options.questions,
        this.options.questionsPerConcept,
      );
      if (!generated.ok) {
        return err<StudyError>({ code: 'generacion-fallida', message: generated.error.message });
      }
      let questions = generated.value;
      const citation = questions[0]?.citation;
      const sourceDocument = citation
        ? documents.find((document) => document.id === citation.documentId)
        : undefined;
      if (citation && sourceDocument && this.semanticProvider?.canProcess(sourceDocument)) {
        const semanticOptions = {
          ...this.options.questions,
          maxPerConcept: this.options.questionsPerConcept,
        };
        const semantic = await this.semanticProvider.generateQuestions(
          concept,
          citation,
          semanticOptions,
        );
        if (!semantic.ok) {
          return err<StudyError>({
            code: 'generacion-fallida',
            message: `No se pudieron generar preguntas semánticas: ${semantic.error.message}`,
          });
        }
        questions = semantic.value.map((draft, index) => ({
          ...draft,
          id: `${concept.id}:llm:q${index}`,
          conceptId: concept.id,
          citation,
        }));
      }
      const { accepted } = filterNonTrivial(questions);
      if (accepted.length > 0) {
        await this.storage.questions.saveQuestions(accepted);
        items.push({ concept, questions: [...accepted] });
      }
    }

    return ok(items);
  }

  /** Recupera las evaluaciones acumuladas, útil para resúmenes. */
  public async evaluations(userId: string): Promise<readonly AnswerEvaluation[]> {
    return this.storage.progress.listEvaluations(userId);
  }
}
