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
import type { QuestionGeneratorPort } from '../llm/ports';
import type { LlmPassage } from '../llm/types';
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
  /**
   * Generador de preguntas con modelo. Opcional: si falta, se usa el generador
   * por plantillas del RAG. El modo principal cuando existe y hay consentimiento;
   * la plantilla es el respaldo.
   */
  readonly questionGenerator?: QuestionGeneratorPort;
  /**
   * Recupera los pasajes que respaldan a un concepto, para anclar la generación
   * y la evaluación. Sin esto, el generador de modelo no se usa.
   */
  readonly retrievePassages?: (
    concept: Concept,
    documents: readonly KnowledgeDocument[],
  ) => Promise<readonly LlmPassage[]>;
}

export const DEFAULT_STUDY_OPTIONS: StudyServiceOptions = {
  questions: DEFAULT_GENERATE_OPTIONS,
  session: { maxAttemptsPerQuestion: 2, thresholds: DEFAULT_THRESHOLDS },
  questionsPerConcept: 2,
  persistGaps: true,
};

/** Servicio de estudio listo para consumir desde la UI. */
export interface ActiveStudySession {
  readonly session: StudySession;
  readonly engine: MayeuticSessionEngine;
  readonly steps: readonly ItineraryStep[];
  /**
   * Documentos del temario, para localizar la fuente de cada pregunta al
   * evaluar y decidir si el documento autoriza procesamiento en la nube.
   */
  readonly documents: readonly KnowledgeDocument[];
  /**
   * `true` si esta sesión evaluará con modelo. Lo decide la composición: si no
   * hay evaluador ni proveedor semántico, es `false` y todo funciona con la
   * heurística.
   */
  readonly usesModel: boolean;
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
    /**
     * Proveedor semántico en la nube (Gemini). Es el motor principal cuando el
     * documento está autorizado y hay sesión; si falta, todo sigue por la
     * heurística local.
     */
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
    // Los pasajes que respaldan cada pregunta son su propia cita: es el único
    // fragmento que el RAG asoció al concepto, así que es lo único que hace
    // falta enviar al evaluador. Nunca sale el documento completo.
    const sessionOptions: SessionEngineOptions = this.options.session.evaluator
      ? { ...this.options.session, passages: (question) => [{ citation: question.citation }] }
      : this.options.session;
    const engine = new MayeuticSessionEngine(
      session,
      steps,
      curriculum.concepts,
      sessionOptions,
      now,
    );
    await this.storage.progress.saveSession(session);

    return ok({
      session,
      engine,
      steps,
      documents,
      // Con modelo si hay evaluador inyectado o proveedor semántico en la nube.
      usesModel:
        this.options.session.evaluator !== undefined || this.semanticProvider !== undefined,
    });
  }

  /**
   * Registra una respuesta y persiste la evaluación y el repaso resultantes.
   *
   * Prioridad de evaluación: si el documento está autorizado y hay proveedor
   * semántico (Gemini), se pide su juicio y se aplica. Si no, se usa el camino
   * del motor de sesión, que a su vez emplea el evaluador inyectado
   * (`submitAsync`) o la heurística local (`submit`).
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

    // Sin evaluación semántica propia, se usa el camino del motor: asíncrono si
    // hay evaluador inyectado (el modelo decide con los pasajes), síncrono si no.
    const turn =
      assessment !== undefined
        ? active.engine.submit(text, latencyMs, now, assessment)
        : active.usesModel
          ? await active.engine.submitAsync(text, latencyMs, now)
          : active.engine.submit(text, latencyMs, now);
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
      // Las plantillas del RAG se piden siempre: además de respaldo, aportan la
      // cita que ancla la generación semántica al pasaje que la justifica.
      const templated = await this.rag.generateConceptQuestions(
        concept,
        documents,
        this.options.questions,
        this.options.questionsPerConcept,
      );
      if (!templated.ok) {
        return err<StudyError>({ code: 'generacion-fallida', message: templated.error.message });
      }
      let questions = templated.value;
      const citation = questions[0]?.citation;
      const sourceDocument = citation
        ? documents.find((document) => document.id === citation.documentId)
        : undefined;

      if (citation && sourceDocument && this.semanticProvider?.canProcess(sourceDocument)) {
        // Gemini (nube) manda cuando el documento está autorizado.
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
      } else if (this.options.questionGenerator) {
        // Respaldo: generador de modelo inyectado, y plantillas si aquel falla.
        const withModel = await this.generateForConcept(concept, documents);
        if (!withModel.ok) {
          return err<StudyError>({ code: 'generacion-fallida', message: withModel.error.message });
        }
        questions = withModel.value;
      }

      const { accepted } = filterNonTrivial(questions);
      if (accepted.length > 0) {
        await this.storage.questions.saveQuestions(accepted);
        items.push({ concept, questions: [...accepted] });
      }
    }

    return ok(items);
  }

  /**
   * Genera las preguntas de un concepto, con modelo si está disponible.
   *
   * Orden de preferencia: si hay generador y forma de recuperar pasajes, se pide
   * la pregunta al modelo; si no produce ninguna válida (o falla), se usa el
   * generador por plantillas del RAG. Nunca se queda sin preguntas por un fallo
   * del modelo.
   */
  private async generateForConcept(
    concept: Concept,
    documents: readonly KnowledgeDocument[],
  ): Promise<Result<SocraticQuestion[], Error>> {
    const generator = this.options.questionGenerator;
    const retrieve = this.options.retrievePassages;

    if (generator && retrieve) {
      const passages = await retrieve(concept, documents);
      if (passages.length > 0) {
        const generated = await generator.generate(
          {
            conceptId: concept.id,
            conceptLabel: concept.label,
            conceptDefinition: concept.definition,
            keyTerms: concept.keywords,
          },
          passages,
        );
        if (generated.ok && generated.value.length > 0) {
          return ok(generated.value);
        }
      }
    }

    return this.rag.generateConceptQuestions(
      concept,
      documents,
      this.options.questions,
      this.options.questionsPerConcept,
    );
  }

  /** Recupera las evaluaciones acumuladas, útil para resúmenes. */
  public async evaluations(userId: string): Promise<readonly AnswerEvaluation[]> {
    return this.storage.progress.listEvaluations(userId);
  }
}
