import type { Concept, KnowledgeDocument } from '../domain/types';
import { HashingEmbeddingProvider } from '../rag/embeddings';
import { InMemoryVectorStore } from '../rag/vectorStore';
import { RagEngine } from '../rag/engine';
import { DEFAULT_GENERATE_OPTIONS } from '../mayeu/questionGenerator';

const document: KnowledgeDocument = {
  id: 'd1',
  title: 'Tema 1 — Principios de la Administración',
  mimeType: 'text/plain',
  sourceKind: 'document',
  uri: 'file:///tmp/tema1.txt',
  sizeBytes: 1024,
  ingestedAt: 0,
  cloudConsent: false,
};

const corpus = [
  'El principio de legalidad exige que la Administración actúe con habilitación legal previa y conforme al ordenamiento jurídico.',
  'El principio de jerarquía normativa establece que las normas de rango inferior no pueden contradecir a las de rango superior.',
  'La potestad reglamentaria permite al Gobierno dictar normas con rango inferior a la ley para desarrollar y ejecutar el ordenamiento.',
].join('\n\n');

const legalidad: Concept = {
  id: 'c1',
  topicId: 't1',
  label: 'principio de legalidad',
  definition: 'La Administración actúa con habilitación legal previa conforme al ordenamiento.',
  keywords: ['legalidad', 'habilitación', 'Administración'],
};

const matematicas: Concept = {
  id: 'c2',
  topicId: 't1',
  label: 'derivada parcial',
  definition: 'La derivada parcial mide cómo cambia una función respecto a una variable.',
  keywords: ['derivada', 'función', 'variable'],
};

describe('RagEngine', () => {
  function buildEngine() {
    return new RagEngine(new InMemoryVectorStore(), new HashingEmbeddingProvider(256));
  }

  it('ingesta un documento e indexa fragmentos', async () => {
    const engine = buildEngine();
    const result = await engine.ingestDocument(document, corpus);
    expect(result.ok).toBe(true);
    expect(engine.indexedChunks()).toBeGreaterThan(0);
  });

  it('devuelve 0 fragmentos para un texto vacío', async () => {
    const engine = buildEngine();
    const result = await engine.ingestDocument(document, '   ');
    expect(result).toEqual({ ok: true, value: 0 });
    expect(engine.indexedChunks()).toBe(0);
  });

  it('recupera el fragmento semánticamente relevante', async () => {
    const engine = buildEngine();
    await engine.ingestDocument(document, corpus);
    const hits = await engine.retrieve('habilitación legal de la Administración', 1);
    expect(hits.ok).toBe(true);
    if (hits.ok) {
      expect(hits.value[0]?.chunk.text).toContain('legalidad');
    }
  });

  it('genera preguntas con cita de la fuente recuperada', async () => {
    const engine = buildEngine();
    await engine.ingestDocument(document, corpus);
    const result = await engine.generateConceptQuestions(
      legalidad,
      [document],
      { ...DEFAULT_GENERATE_OPTIONS, maxPerConcept: 2 },
      1,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.length).toBe(2);
      expect(result.value[0]?.citation.documentTitle).toBe(document.title);
      expect(result.value[0]?.citation.excerpt.length).toBeGreaterThan(0);
    }
  });

  it('genera cero preguntas si no hay corpus indexado', async () => {
    const engine = buildEngine();
    const result = await engine.generateConceptQuestions(
      legalidad,
      [document],
      DEFAULT_GENERATE_OPTIONS,
      1,
    );
    expect(result).toEqual({ ok: true, value: [] });
  });

  it('cita un fragmento relacionado con el concepto consultado', async () => {
    const engine = buildEngine();
    await engine.ingestDocument(document, corpus);
    const result = await engine.generateConceptQuestions(
      matematicas,
      [document],
      { ...DEFAULT_GENERATE_OPTIONS, maxPerConcept: 1 },
      1,
    );
    expect(result.ok).toBe(true);
  });
});
