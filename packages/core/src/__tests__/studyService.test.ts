import { SAMPLE_CURRICULUM_TEXT, SAMPLE_DOCUMENT } from '../__fixtures__/sampleCurriculum';
import { extractCurriculum } from '../ingest/conceptExtractor';
import { HashingEmbeddingProvider } from '../rag/embeddings';
import { RagEngine } from '../rag/engine';
import { InMemoryVectorStore } from '../rag/vectorStore';
import { inMemoryStorage } from '../storage/inMemory';
import { StudyService, DEFAULT_STUDY_OPTIONS } from '../app/studyService';
import type { SessionTurn } from '../mayeu/session';
import type { MayeuticSemanticProvider } from '../mayeu/semanticProvider';
import { err, ok } from '../result';

const NOW = 1_700_000_000_000;
const USER = 'u1';
const encoder = new TextEncoder();

function makeService(semanticProvider?: MayeuticSemanticProvider) {
  const storage = inMemoryStorage();
  const rag = new RagEngine(new InMemoryVectorStore(), new HashingEmbeddingProvider(256));
  const service = new StudyService(rag, storage, DEFAULT_STUDY_OPTIONS, semanticProvider);
  return { service, rag, storage };
}

async function ingestSample(rag: RagEngine): Promise<ReturnType<typeof extractCurriculum>> {
  await rag.ingestDocument(SAMPLE_DOCUMENT, SAMPLE_CURRICULUM_TEXT);
  return extractCurriculum(SAMPLE_CURRICULUM_TEXT);
}

async function answer(
  service: StudyService,
  active: Parameters<StudyService['answer']>[0],
  text: string,
  now: number,
): Promise<SessionTurn> {
  const result = await service.answer(active, USER, text, 900, now);
  if (!result.ok) {
    throw new Error(result.error.message);
  }
  return result.value;
}

describe('StudyService.prepareSession', () => {
  it('prepara una sesión con preguntas no triviales y persiste el temario', async () => {
    const { service, rag, storage } = makeService();
    const curriculum = await ingestSample(rag);

    const result = await service.prepareSession(USER, curriculum, [SAMPLE_DOCUMENT], NOW, 's1');

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.steps.length).toBeGreaterThan(0);
    expect(result.value.engine.currentQuestion()).not.toBeNull();
    expect(result.value.session.questionIds.length).toBe(result.value.steps.length);

    // Las preguntas se han persistido y todas tienen cita.
    for (const step of result.value.steps) {
      expect(step.question.citation.documentId).toBe(SAMPLE_DOCUMENT.id);
    }
    const sessions = await storage.progress.listSessions(USER);
    expect(sessions.map((s) => s.id)).toContain('s1');
  });

  it('falla con un temario sin conceptos', async () => {
    const { service } = makeService();
    const result = await service.prepareSession(
      USER,
      { topics: [], concepts: [] },
      [SAMPLE_DOCUMENT],
      NOW,
      's1',
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('sin-conceptos');
    }
  });

  it('usa generación y evaluación semánticas solo para documentos autorizados', async () => {
    const semanticProvider: MayeuticSemanticProvider = {
      canProcess: (document) => document.cloudConsent,
      generateQuestions: async () =>
        ok([
          {
            prompt: '¿Cómo aplicarías este principio a un caso que no aparece en el texto?',
            move: 'aplicar-caso',
            level: 'aplicar',
            expectedAnswer:
              'La respuesta debe aplicar el principio al caso y justificarlo con la evidencia.',
            keyTerms: ['Administración'],
            difficulty: 0.7,
          },
        ]),
      evaluateAnswer: async () =>
        ok({
          score: 0.9,
          matchedKeyTerms: ['Administración'],
          feedback: 'Has explicado la idea con tus propias palabras.',
        }),
    };
    const { service, rag } = makeService(semanticProvider);
    const curriculum = await ingestSample(rag);
    const authorizedDocument = { ...SAMPLE_DOCUMENT, cloudConsent: true };
    const prepared = await service.prepareSession(
      USER,
      curriculum,
      [authorizedDocument],
      NOW,
      'semantic-session',
    );

    expect(prepared.ok).toBe(true);
    if (!prepared.ok) {
      return;
    }
    expect(prepared.value.steps[0]?.question.id).toContain(':llm:q');
    const result = await service.answer(
      prepared.value,
      USER,
      'La Administración aplica el principio al caso.',
      900,
      NOW,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.evaluation.score).toBe(0.9);
      expect(result.value.evaluation.verdict).toBe('correcta');
      expect(result.value.evaluation.feedback).toContain('tus propias palabras');
    }
  });

  it('no avanza la sesión si falla la evaluación semántica', async () => {
    const semanticProvider: MayeuticSemanticProvider = {
      canProcess: (document) => document.cloudConsent,
      generateQuestions: async () =>
        ok([
          {
            prompt: '¿Cómo aplicarías este principio a un caso que no aparece en el texto?',
            move: 'aplicar-caso',
            level: 'aplicar',
            expectedAnswer:
              'La respuesta debe aplicar el principio al caso y justificarlo con la evidencia.',
            keyTerms: ['Administración'],
            difficulty: 0.7,
          },
        ]),
      evaluateAnswer: async () => err(new Error('servicio no disponible')),
    };
    const { service, rag } = makeService(semanticProvider);
    const curriculum = await ingestSample(rag);
    const prepared = await service.prepareSession(
      USER,
      curriculum,
      [{ ...SAMPLE_DOCUMENT, cloudConsent: true }],
      NOW,
      'semantic-error-session',
    );
    if (!prepared.ok) {
      throw new Error(prepared.error.message);
    }

    const result = await service.answer(prepared.value, USER, 'respuesta', 500, NOW);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('evaluacion-fallida');
    }
    expect(prepared.value.engine.progress().answered).toBe(0);
  });
});

describe('StudyService.answer y progreso', () => {
  async function prepare() {
    const context = makeService();
    const curriculum = await ingestSample(context.rag);
    const prepared = await context.service.prepareSession(
      USER,
      curriculum,
      [SAMPLE_DOCUMENT],
      NOW,
      's1',
    );
    if (!prepared.ok) {
      throw new Error('no se pudo preparar la sesión');
    }
    return { ...context, curriculum, active: prepared.value };
  }

  it('persiste la evaluación y el estado de repaso de cada respuesta', async () => {
    const { service, storage, active, curriculum } = await prepare();
    const question = active.engine.currentQuestion();
    const definition =
      curriculum.concepts.find((c) => c.id === question?.conceptId)?.definition ?? '';

    await answer(service, active, definition, NOW);

    const evaluations = await storage.progress.listEvaluations(USER);
    expect(evaluations.length).toBeGreaterThan(0);
    const reviews = await storage.progress.listReviewStates(USER);
    expect(reviews.length).toBeGreaterThan(0);
  });

  it('refresca y persiste el perfil de lagunas', async () => {
    const { service, storage, active } = await prepare();
    // Fuerza un fallo para que haya al menos una laguna.
    await answer(service, active, 'No lo recuerdo en absoluto.', NOW);
    const profile = await service.refreshProgress(active, NOW);
    expect(profile.gaps.length).toBeGreaterThan(0);

    const stored = await storage.progress.getGapProfile(USER);
    expect(stored).not.toBeNull();
    expect(stored?.recommendedReview).toEqual(profile.gaps.map((gap) => gap.conceptId));
  });

  it('lastGapProfile devuelve null sin sesión previa', async () => {
    const { service } = makeService();
    expect(await service.lastGapProfile('nuevo')).toBeNull();
  });

  it('un recorrido completo termina sin errores y con progreso coherente', async () => {
    const { service, active, curriculum } = await prepare();

    let guard = 0;
    let conceptIndex = 0;
    let lastConcept = '';
    while (!active.engine.isFinished() && guard < 200) {
      const question = active.engine.currentQuestion();
      if (!question) {
        break;
      }
      if (question.conceptId !== lastConcept) {
        lastConcept = question.conceptId;
        conceptIndex += 1;
      }
      const definition =
        curriculum.concepts.find((c) => c.id === question.conceptId)?.definition ?? '';
      // Domina la primera mitad del temario y falla la segunda.
      const text =
        conceptIndex <= Math.ceil(curriculum.concepts.length / 2)
          ? definition
          : 'No estoy seguro, no lo recuerdo.';
      await answer(service, active, text, NOW);
      guard += 1;
    }

    const progress = active.engine.progress();
    expect(progress.finished).toBe(true);
    expect(progress.correct).toBeGreaterThan(0);
    expect(progress.incorrect).toBeGreaterThan(0);

    const profile = await service.refreshProgress(active, NOW);
    expect(profile.gaps.length).toBeGreaterThan(0);
    for (const gap of profile.gaps) {
      expect(gap.severity).toBeGreaterThan(0);
      expect(gap.severity).toBeLessThanOrEqual(1);
    }
  });
});

describe('StudyService con TXT adjuntado por el usuario', () => {
  it('el flujo adjuntar -> preguntar -> progreso funciona de principio a fin', async () => {
    const { DocumentIngestionService } = await import('../ingest/ingestionService');
    const { defaultRegistry } = await import('../ingest/extractors');
    const { fflateInflate } = await import('../ingest/inflate');

    const storage = inMemoryStorage();
    const rag = new RagEngine(new InMemoryVectorStore(), new HashingEmbeddingProvider(256));
    const service = new StudyService(rag, storage, DEFAULT_STUDY_OPTIONS);
    const ingestion = new DocumentIngestionService(defaultRegistry(fflateInflate), rag);

    const ingested = await ingestion.ingest(
      {
        fileName: 'temario-propio.txt',
        mimeType: 'text/plain',
        bytes: encoder.encode(SAMPLE_CURRICULUM_TEXT),
        uri: 'file:///temario-propio.txt',
      },
      {
        chunkOptions: { maxChars: 900, overlapChars: 150, minChars: 40 },
        cloudConsent: false,
        id: 'doc1',
        now: NOW,
      },
    );
    expect(ingested.ok).toBe(true);
    if (!ingested.ok) {
      return;
    }

    await storage.documents.saveDocument(ingested.value.document);
    const curriculum = extractCurriculum(ingested.value.text);
    await storage.documents.saveCurriculum({
      id: ingested.value.document.id,
      title: ingested.value.document.title,
      topics: curriculum.topics,
      concepts: curriculum.concepts,
      createdAt: NOW,
    });

    const prepared = await service.prepareSession(
      USER,
      curriculum,
      [ingested.value.document],
      NOW,
      'sess',
    );
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) {
      return;
    }

    const turn = await answer(service, prepared.value, 'Una respuesta breve.', NOW);
    expect(turn.progress.answered).toBe(1);

    const documents = await storage.documents.listDocuments();
    expect(documents.map((d) => d.id)).toEqual(['doc1']);
  });
});

describe('StudyService: persistencia de sesión y vista de progreso', () => {
  it('acumula las respuestas en la sesión persistida', async () => {
    const { service, rag, storage } = makeService();
    const curriculum = await ingestSample(rag);
    const prepared = await service.prepareSession(USER, curriculum, [], NOW, 'sess-1');
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) {
      return;
    }

    await answer(service, prepared.value, 'Primera respuesta con contenido.', NOW);
    await answer(service, prepared.value, 'Segunda respuesta distinta.', NOW + 1);

    const saved = await storage.progress.getSession('sess-1');
    expect(saved).not.toBeNull();
    expect(saved!.answers).toHaveLength(2);
    expect(saved!.answers[0]!.text).toBe('Primera respuesta con contenido.');
  });

  it('marca la sesión como terminada al agotar el itinerario', async () => {
    const { service, rag, storage } = makeService();
    const curriculum = await ingestSample(rag);
    const prepared = await service.prepareSession(USER, curriculum, [], NOW, 'sess-2');
    if (!prepared.ok) {
      throw new Error('sesión no preparada');
    }

    let turn = await answer(service, prepared.value, 'respuesta', NOW);
    let guard = 0;
    while (!turn.progress.finished && guard < 200) {
      turn = await answer(service, prepared.value, 'respuesta', NOW + guard);
      guard += 1;
    }

    expect(turn.progress.finished).toBe(true);
    const saved = await storage.progress.getSession('sess-2');
    expect(saved!.finishedAt).not.toBeNull();
  });

  it('overview refleja el progreso real tras responder', async () => {
    const { service, rag } = makeService();
    const curriculum = await ingestSample(rag);
    const prepared = await service.prepareSession(USER, curriculum, [], NOW, 'sess-3');
    if (!prepared.ok) {
      throw new Error('sesión no preparada');
    }

    const empty = await service.overview(USER, curriculum.concepts, NOW);
    expect(empty.mastery.conceptsNotEvaluated).toBe(curriculum.concepts.length);
    expect(empty.hint).toContain('sesión guiada');

    await answer(service, prepared.value, 'respuesta', NOW);

    const after = await service.overview(USER, curriculum.concepts, NOW + 1);
    expect(after.mastery.conceptsNotEvaluated).toBeLessThan(curriculum.concepts.length);
    expect(after.generatedAt).toBe(NOW + 1);
  });
});
