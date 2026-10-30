import { SAMPLE_CURRICULUM_TEXT, SAMPLE_DOCUMENT } from '../../__fixtures__/sampleCurriculum';
import { StudyService, DEFAULT_STUDY_OPTIONS } from '../../app/studyService';
import { extractCurriculum } from '../../ingest/conceptExtractor';
import { LlmAnswerEvaluator } from '../../llm/evaluator';
import { FakeLlmProvider } from '../../llm/fakeProvider';
import { LlmQuestionGenerator } from '../../llm/generator';
import type { LlmPassage } from '../../llm/types';
import { HashingEmbeddingProvider } from '../../rag/embeddings';
import { RagEngine } from '../../rag/engine';
import { InMemoryVectorStore } from '../../rag/vectorStore';
import { inMemoryStorage } from '../../storage/inMemory';

const NOW = 1_700_000_000_000;
const USER = 'u1';

/** Recupera el pasaje más relevante del RAG como cita para el concepto. */
function makePassageRetriever(rag: RagEngine, title: string) {
  return async (
    concept: { readonly label: string; readonly definition: string; readonly keywords: readonly string[] },
  ): Promise<readonly LlmPassage[]> => {
    const query = `${concept.label} ${concept.definition} ${concept.keywords.join(' ')}`;
    const hits = await rag.retrieveRelevant(query, { topK: 1, minScore: 0.05 });
    if (!hits.ok || hits.value.length === 0) {
      return [];
    }
    const hit = hits.value[0];
    if (!hit) {
      return [];
    }
    return [
      {
        citation: {
          documentId: hit.chunk.documentId,
          documentTitle: title,
          chunkId: hit.chunk.id,
          excerpt: hit.chunk.text.slice(0, 240),
          charStart: hit.chunk.charStart,
          charEnd: hit.chunk.charEnd,
        },
      },
    ];
  };
}

async function setup(
  buildOptions?: (rag: RagEngine) => Partial<typeof DEFAULT_STUDY_OPTIONS>,
) {
  const storage = inMemoryStorage();
  const rag = new RagEngine(new InMemoryVectorStore(), new HashingEmbeddingProvider(256));
  await rag.ingestDocument(SAMPLE_DOCUMENT, SAMPLE_CURRICULUM_TEXT);
  const curriculum = extractCurriculum(SAMPLE_CURRICULUM_TEXT);
  const service = new StudyService(rag, storage, {
    ...DEFAULT_STUDY_OPTIONS,
    ...(buildOptions?.(rag) ?? {}),
  });
  return { service, rag, storage, curriculum };
}

const GOOD_QUESTION = JSON.stringify({
  prompt: '¿Qué consecuencia tendría prescindir de la habilitación legal previa?',
  move: 'consecuencia',
  level: 'comprender',
  difficulty: 0.4,
});

describe('StudyService con generador de modelo', () => {
  it('usa el generador del modelo cuando está inyectado', async () => {
    const provider = new FakeLlmProvider([{ text: GOOD_QUESTION }]);
    const { service, curriculum } = await setup((rag) => ({
      questionGenerator: new LlmQuestionGenerator(provider),
      retrievePassages: makePassageRetriever(rag, SAMPLE_DOCUMENT.title),
    }));

    const result = await service.prepareSession(USER, curriculum, [SAMPLE_DOCUMENT], NOW, 's1');

    expect(result.ok).toBe(true);
    if (result.ok) {
      // El generador de modelo se ha consultado y su pregunta es la que entra.
      expect(provider.callCount()).toBeGreaterThan(0);
      expect(result.value.steps[0]?.question.prompt).toContain('habilitación');
      // `usesModel` describe la evaluación, no la generación: sin evaluador es false.
      expect(result.value.usesModel).toBe(false);
    }
  });

  it('sin generador sigue funcionando con plantillas', async () => {
    const { service, curriculum } = await setup();
    const result = await service.prepareSession(USER, curriculum, [SAMPLE_DOCUMENT], NOW, 's1');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.usesModel).toBe(false);
      expect(result.value.steps.length).toBeGreaterThan(0);
    }
  });

  it('si el generador falla, cae a las plantillas y la sesión se prepara igual', async () => {
    const provider = new FakeLlmProvider([{ error: { code: 'timeout', message: 'tarde' } }]);
    const { service, curriculum } = await setup((rag) => ({
      questionGenerator: new LlmQuestionGenerator(provider),
      retrievePassages: makePassageRetriever(rag, SAMPLE_DOCUMENT.title),
    }));

    const result = await service.prepareSession(USER, curriculum, [SAMPLE_DOCUMENT], NOW, 's1');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.steps.length).toBeGreaterThan(0);
    }
  });

  it('con evaluador inyectado, la sesión evalúa con modelo y persiste el resultado', async () => {
    const provider = new FakeLlmProvider([
      {
        text: JSON.stringify({
          verdict: 'parcial',
          score: 0.5,
          matchedKeyTerms: ['legalidad'],
          missingKeyTerms: ['habilitación'],
          rationale: 'Menciona la ley pero no la habilitación previa.',
          citation: '',
        }),
      },
    ]);
    const { service, curriculum, storage } = await setup((rag) => ({
      session: {
        maxAttemptsPerQuestion: 2,
        thresholds: { correct: 0.6, partial: 0.3 },
        evaluator: new LlmAnswerEvaluator(provider),
      },
      retrievePassages: makePassageRetriever(rag, SAMPLE_DOCUMENT.title),
    }));

    const prepared = await service.prepareSession(USER, curriculum, [SAMPLE_DOCUMENT], NOW, 's1');
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) {
      return;
    }
    expect(prepared.value.usesModel).toBe(true);

    const turn = await service.answer(prepared.value, USER, 'La ley lo permite.', 1000, NOW);
    expect(turn.evaluation.verdict).toBe('parcial');
    expect(turn.evaluation.rationale).toContain('habilitación');

    const stored = await storage.progress.listEvaluations(USER);
    expect(stored.some((e) => e.rationale?.includes('habilitación'))).toBe(true);
  });
});
