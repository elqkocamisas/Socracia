import { extractCurriculum } from '../ingest/conceptExtractor';
import { buildItinerary, startSession } from '../mayeu/itinerary';
import { assessQuestionQuality } from '../mayeu/questionQuality';
import { MayeuticSessionEngine } from '../mayeu/session';
import { DEFAULT_THRESHOLDS } from '../mayeu/evaluate';
import { HashingEmbeddingProvider } from '../rag/embeddings';
import { RagEngine } from '../rag/engine';
import { InMemoryVectorStore } from '../rag/vectorStore';
import { SAMPLE_CURRICULUM_TEXT, SAMPLE_DOCUMENT } from '../__fixtures__/sampleCurriculum';

const NOW = 1_700_000_000_000;

/**
 * Prueba de extremo a extremo del Sprint 1.
 *
 * Recorre el criterio de aceptación completo sobre el temario de ejemplo:
 * texto → conceptos → preguntas con cita → respuestas simuladas → perfil de
 * lagunas coherente.
 */
describe('flujo mayéutico de extremo a extremo', () => {
  async function buildSession() {
    const curriculum = extractCurriculum(SAMPLE_CURRICULUM_TEXT);
    const provider = new HashingEmbeddingProvider(256);
    const store = new InMemoryVectorStore();
    const rag = new RagEngine(store, provider);

    const ingested = await rag.ingestDocument(SAMPLE_DOCUMENT, SAMPLE_CURRICULUM_TEXT);
    expect(ingested.ok).toBe(true);

    const items = [];
    for (const concept of curriculum.concepts) {
      const questions = await rag.generateConceptQuestions(
        concept,
        [SAMPLE_DOCUMENT],
        { maxPerConcept: 3, shuffle: false, seed: 1 },
        2,
      );
      expect(questions.ok).toBe(true);
      if (questions.ok) {
        items.push({ concept, questions: questions.value });
      }
    }

    const steps = buildItinerary(items, [], { questionsPerConcept: 2, prioritizeGaps: true });
    const session = startSession('s1', 'u1', curriculum.topics[0]?.id ?? 't1', steps, NOW);
    const engine = new MayeuticSessionEngine(
      session,
      steps,
      curriculum.concepts,
      { maxAttemptsPerQuestion: 2, thresholds: DEFAULT_THRESHOLDS },
      NOW,
    );
    return { curriculum, engine, items, store };
  }

  it('extrae temas y conceptos del temario', async () => {
    const { curriculum } = await buildSession();
    expect(curriculum.topics.length).toBeGreaterThanOrEqual(3);
    expect(curriculum.concepts.length).toBeGreaterThanOrEqual(9);
  });

  it('genera preguntas no triviales con cita de la fuente', async () => {
    const { items, store } = await buildSession();
    expect(store.size()).toBeGreaterThan(0);

    const all = items.flatMap((item) => item.questions);
    expect(all.length).toBeGreaterThan(0);
    for (const question of all) {
      expect(assessQuestionQuality(question).isTrivial).toBe(false);
      expect(question.citation.documentId).toBe(SAMPLE_DOCUMENT.id);
      expect(question.citation.excerpt.length).toBeGreaterThan(0);
      expect(question.citation.charEnd).toBeGreaterThan(question.citation.charStart);
    }
  });

  it('un recorrido completo produce un perfil de lagunas coherente', async () => {
    const { engine, curriculum } = await buildSession();

    // Simula un usuario que domina los primeros conceptos y falla los últimos.
    const answerFor = (index: number, definition: string): string =>
      index < Math.floor(curriculum.concepts.length / 2)
        ? definition
        : 'No estoy seguro de este concepto, lo he visto pero no lo recuerdo.';

    let guard = 0;
    let conceptIndex = 0;
    let lastConceptId = '';
    while (!engine.isFinished() && guard < 100) {
      const question = engine.currentQuestion();
      if (!question) {
        break;
      }
      if (question.conceptId !== lastConceptId) {
        lastConceptId = question.conceptId;
        conceptIndex += 1;
      }
      const definition =
        curriculum.concepts.find((c) => c.id === question.conceptId)?.definition ?? '';
      engine.submit(answerFor(conceptIndex - 1, definition), 1200, NOW);
      guard += 1;
    }

    expect(engine.isFinished()).toBe(true);

    const progress = engine.progress();
    expect(progress.answered).toBeGreaterThan(0);
    expect(progress.correct).toBeGreaterThan(0);
    expect(progress.incorrect).toBeGreaterThan(0);
    expect(progress.finished).toBe(true);

    const profile = engine.gapProfile(NOW);
    expect(profile.gaps.length).toBeGreaterThan(0);
    expect(profile.recommendedReview).toEqual(profile.gaps.map((gap) => gap.conceptId));

    // Las lagunas deben ser precisamente los conceptos que se fallaron.
    const failedConcepts = new Set(
      engine
        .allEvaluations()
        .filter((evaluation) => evaluation.verdict !== 'correcta')
        .map((evaluation) => evaluation.conceptId),
    );
    for (const gap of profile.gaps) {
      expect(failedConcepts.has(gap.conceptId)).toBe(true);
      expect(gap.severity).toBeGreaterThan(0);
      expect(gap.severity).toBeLessThanOrEqual(1);
    }
  });

  it('programa el repaso de cada concepto evaluado', async () => {
    const { engine } = await buildSession();
    engine.submit('Una respuesta cualquiera sin contenido relevante.', 800, NOW);
    const reviews = engine.reviewStates();
    expect(reviews.length).toBeGreaterThan(0);
    for (const review of reviews) {
      expect(review.ease).toBeGreaterThanOrEqual(1.3);
      expect(review.ease).toBeLessThanOrEqual(2.8);
      expect(review.dueAt).toBeGreaterThanOrEqual(NOW);
    }
  });
});
