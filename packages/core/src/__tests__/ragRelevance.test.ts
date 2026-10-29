import { HashingEmbeddingProvider } from '../rag/embeddings';
import { DEFAULT_RELEVANCE, RagEngine } from '../rag/engine';
import { InMemoryVectorStore } from '../rag/vectorStore';
import { SAMPLE_CURRICULUM_TEXT, SAMPLE_DOCUMENT } from '../__fixtures__/sampleCurriculum';

function buildEngine(): RagEngine {
  return new RagEngine(new InMemoryVectorStore(), new HashingEmbeddingProvider(256));
}

/**
 * El umbral de relevancia evita citar fuentes que no respaldan la pregunta.
 * Estas pruebas fijan el comportamiento medido: una consulta con vocabulario
 * compartido supera el umbral y una sin relación no.
 */
describe('umbral de relevancia del RAG', () => {
  it('expone un umbral por defecto razonable', () => {
    expect(DEFAULT_RELEVANCE.minScore).toBeGreaterThan(0);
    expect(DEFAULT_RELEVANCE.minScore).toBeLessThan(1);
  });

  it('devuelve el fragmento cuando la consulta comparte vocabulario', async () => {
    const engine = buildEngine();
    await engine.indexDocument(SAMPLE_DOCUMENT, SAMPLE_CURRICULUM_TEXT);

    const hits = await engine.retrieveRelevant('recurso de alzada', { topK: 1, minScore: 0.2 });
    expect(hits.ok).toBe(true);
    if (hits.ok) {
      expect(hits.value).toHaveLength(1);
      expect(hits.value[0]?.chunk.text).toContain('alzada');
    }
  });

  it('descarta el resultado cuando la consulta no tiene relación', async () => {
    const engine = buildEngine();
    await engine.indexDocument(SAMPLE_DOCUMENT, SAMPLE_CURRICULUM_TEXT);

    const hits = await engine.retrieveRelevant('derivada parcial de una función', {
      topK: 4,
      minScore: 0.2,
    });
    expect(hits.ok).toBe(true);
    if (hits.ok) {
      expect(hits.value).toHaveLength(0);
    }
  });

  it('un umbral de cero equivale a no filtrar', async () => {
    const engine = buildEngine();
    await engine.indexDocument(SAMPLE_DOCUMENT, SAMPLE_CURRICULUM_TEXT);

    const sinFiltro = await engine.retrieveRelevant('texto sin relación alguna', {
      topK: 4,
      minScore: 0,
    });
    const conFiltro = await engine.retrieveRelevant('texto sin relación alguna', {
      topK: 4,
      minScore: 0.9,
    });

    expect(sinFiltro.ok && sinFiltro.value.length).toBeGreaterThan(0);
    expect(conFiltro.ok && conFiltro.value.length).toBe(0);
  });

  it('no genera preguntas si ningún fragmento alcanza el umbral', async () => {
    // Es el comportamiento clave: antes se citaba el mejor fragmento aunque
    // fuera irrelevante, y el alumno recibía una pregunta con una fuente falsa.
    const engine = buildEngine();
    await engine.indexDocument(SAMPLE_DOCUMENT, SAMPLE_CURRICULUM_TEXT);

    const concept = {
      id: 'c-ajeno',
      label: 'Integral definida',
      definition: 'Área bajo una curva entre dos límites',
      keywords: ['integral', 'derivada', 'límite'],
      documentId: SAMPLE_DOCUMENT.id,
      topicId: 'tema-1',
    };

    const generated = await engine.generateConceptQuestions(
      concept,
      [SAMPLE_DOCUMENT],
      { maxPerConcept: 3, shuffle: false, seed: 1, minLevel: 'comprender' },
      1,
      0.5,
    );

    expect(generated.ok).toBe(true);
    if (generated.ok) {
      expect(generated.value).toHaveLength(0);
    }
  });

  it('sí genera preguntas cuando el fragmento es relevante', async () => {
    const engine = buildEngine();
    await engine.indexDocument(SAMPLE_DOCUMENT, SAMPLE_CURRICULUM_TEXT);

    const concept = {
      id: 'c-alzada',
      label: 'Recurso de alzada',
      definition: 'Recurso que se interpone ante el órgano superior jerárquico',
      keywords: ['recurso', 'alzada', 'jerárquico'],
      documentId: SAMPLE_DOCUMENT.id,
      topicId: 'tema-1',
    };

    const generated = await engine.generateConceptQuestions(
      concept,
      [SAMPLE_DOCUMENT],
      { maxPerConcept: 3, shuffle: false, seed: 1, minLevel: 'comprender' },
      1,
      0.2,
    );

    expect(generated.ok).toBe(true);
    if (generated.ok) {
      expect(generated.value.length).toBeGreaterThan(0);
      expect(generated.value[0]?.citation.documentTitle).toBe(SAMPLE_DOCUMENT.title);
    }
  });
});
