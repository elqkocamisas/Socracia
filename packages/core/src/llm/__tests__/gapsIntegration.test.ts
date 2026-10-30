import { SAMPLE_CURRICULUM_TEXT, SAMPLE_DOCUMENT } from '../../__fixtures__/sampleCurriculum';
import { StudyService, DEFAULT_STUDY_OPTIONS } from '../../app/studyService';
import { extractCurriculum } from '../../ingest/conceptExtractor';
import { LlmAnswerEvaluator } from '../evaluator';
import { FakeLlmProvider } from '../fakeProvider';
import type { LlmPassage } from '../types';
import { HashingEmbeddingProvider } from '../../rag/embeddings';
import { RagEngine } from '../../rag/engine';
import { InMemoryVectorStore } from '../../rag/vectorStore';
import { inMemoryStorage } from '../../storage/inMemory';

const NOW = 1_700_000_000_000;
const USER = 'u1';

/**
 * La evaluación semántica no necesita código propio en lagunas ni en repaso: el
 * perfil y el calendario ya se calculan a partir de `score` y `verdict`, que es
 * justo lo que devuelve el evaluador del modelo. Esta prueba lo fija.
 */
async function setup() {
  const storage = inMemoryStorage();
  const rag = new RagEngine(new InMemoryVectorStore(), new HashingEmbeddingProvider(256));
  await rag.ingestDocument(SAMPLE_DOCUMENT, SAMPLE_CURRICULUM_TEXT);
  const curriculum = extractCurriculum(SAMPLE_CURRICULUM_TEXT);

  // El modelo suspende siempre: score bajo y veredicto incorrecta.
  const provider = new FakeLlmProvider(
    Array.from({ length: 8 }, () => ({
      text: JSON.stringify({
        verdict: 'incorrecta',
        score: 0.05,
        matchedKeyTerms: [],
        missingKeyTerms: ['legalidad'],
        rationale: 'No responde a lo preguntado.',
      }),
    })),
  );
  const passagesFor = (citation: LlmPassage['citation']): readonly LlmPassage[] => [{ citation }];

  const service = new StudyService(rag, storage, {
    ...DEFAULT_STUDY_OPTIONS,
    session: {
      maxAttemptsPerQuestion: 1,
      thresholds: { correct: 0.6, partial: 0.3 },
      evaluator: new LlmAnswerEvaluator(provider),
      passages: (question) => passagesFor(question.citation),
    },
  });
  return { service, storage, curriculum };
}

describe('evaluación semántica alimenta lagunas y repaso', () => {
  it('una evaluación del modelo con score bajo genera una laguna', async () => {
    const { service, curriculum } = await setup();
    const prepared = await service.prepareSession(USER, curriculum, [SAMPLE_DOCUMENT], NOW, 's1');
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) {
      return;
    }

    // Responde mal a todas las preguntas: el itinerario no reintenta.
    const active = prepared.value;
    for (let i = 0; i < active.steps.length; i += 1) {
      await service.answer(active, USER, 'No lo sé.', 100, NOW + i);
    }

    const profile = await service.refreshProgress(active, NOW + 1000);
    expect(profile.gaps.length).toBeGreaterThan(0);
    expect(profile.gaps[0]?.severity).toBeGreaterThan(0.5);
    expect(profile.recommendedReview.length).toBeGreaterThan(0);
  });

  it('un veredicto incorrecto del modelo programa el repaso a corto plazo', async () => {
    const { service, storage, curriculum } = await setup();
    const prepared = await service.prepareSession(USER, curriculum, [SAMPLE_DOCUMENT], NOW, 's1');
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) {
      return;
    }

    await service.answer(prepared.value, USER, 'No lo sé.', 100, NOW);
    const reviews = await storage.progress.listReviewStates(USER);
    expect(reviews.length).toBeGreaterThan(0);
    // Tras un fallo, el repaso vuelve al intervalo inicial: no se aleja en el tiempo.
    const first = reviews[0];
    expect(first?.dueAt).toBeDefined();
    expect((first?.dueAt ?? 0) - NOW).toBeLessThan(7 * 24 * 60 * 60 * 1000);
  });
});
