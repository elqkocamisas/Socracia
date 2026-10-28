import { buildPdf } from '../__fixtures__/buildPdf';
import { DocumentIngestionService } from '../ingest/ingestionService';
import { defaultRegistry } from '../ingest/extractors';
import { fflateInflate } from '../ingest/inflate';
import { extractCurriculum } from '../ingest/conceptExtractor';
import { HashingEmbeddingProvider } from '../rag/embeddings';
import { RagEngine } from '../rag/engine';
import { InMemoryVectorStore } from '../rag/vectorStore';
import { DEFAULT_GENERATE_OPTIONS } from '../mayeu/questionGenerator';
import { assessQuestionQuality } from '../mayeu/questionQuality';

const encoder = new TextEncoder();
const NOW = 1_700_000_000_000;

function makeService() {
  const store = new InMemoryVectorStore();
  const rag = new RagEngine(store, new HashingEmbeddingProvider(256));
  const service = new DocumentIngestionService(defaultRegistry(fflateInflate), rag);
  return { service, rag, store };
}

const TEMARIO_TXT = `Tema 1. El acto administrativo

El acto administrativo es la declaración unilateral de voluntad de la Administración sujeta al derecho administrativo. La notificación consiste en la comunicación formal del acto al interesado para que despliegue efectos.`;

describe('DocumentIngestionService', () => {
  it('ingiere un TXT, crea el documento y lo indexa', async () => {
    const { service, rag } = makeService();
    const result = await service.ingest(
      {
        fileName: 'tema-1.txt',
        mimeType: 'text/plain',
        bytes: encoder.encode(TEMARIO_TXT),
        uri: 'file:///tmp/tema-1.txt',
      },
      {
        chunkOptions: { maxChars: 400, overlapChars: 60, minChars: 20 },
        cloudConsent: false,
        id: 'd1',
        now: NOW,
      },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.document.id).toBe('d1');
      expect(result.value.document.title).toBe('tema-1');
      expect(result.value.document.mimeType).toBe('text/plain');
      expect(result.value.document.sourceKind).toBe('document');
      expect(result.value.document.sizeBytes).toBeGreaterThan(0);
      expect(result.value.document.ingestedAt).toBe(NOW);
      expect(result.value.document.cloudConsent).toBe(false);
      expect(result.value.chunkCount).toBeGreaterThan(0);
      expect(result.value.text).toContain('acto administrativo');
    }
    expect(rag.indexedChunks()).toBeGreaterThan(0);
  });

  it('ingiere un PDF comprimido de principio a fin', async () => {
    const { service } = makeService();
    const pdf = buildPdf([
      'El procedimiento administrativo es el cauce formal de la decision.',
      'La sede electronica sustituye al registro presencial tradicional.',
    ]);
    const result = await service.ingest(
      { fileName: 'temario.pdf', mimeType: 'application/pdf', bytes: pdf, uri: 'file:///t.pdf' },
      {
        chunkOptions: { maxChars: 600, overlapChars: 80, minChars: 20 },
        cloudConsent: false,
        id: 'd2',
        now: NOW,
      },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.text).toContain('cauce formal');
      expect(result.value.chunkCount).toBeGreaterThan(0);
    }
  });

  it('propaga el error de formato no soportado', async () => {
    const { service } = makeService();
    const result = await service.ingest(
      {
        fileName: 'notas.xls',
        mimeType: 'application/vnd.ms-excel',
        bytes: encoder.encode('x'),
        uri: 'u',
      },
      {
        chunkOptions: { maxChars: 400, overlapChars: 60, minChars: 20 },
        cloudConsent: false,
        id: 'd3',
        now: NOW,
      },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('formato-no-soportado');
    }
  });

  it('respeta el título explícito', async () => {
    const { service } = makeService();
    const result = await service.ingest(
      { fileName: 'x.txt', mimeType: 'text/plain', bytes: encoder.encode(TEMARIO_TXT), uri: 'u' },
      {
        chunkOptions: { maxChars: 400, overlapChars: 60, minChars: 20 },
        cloudConsent: true,
        title: 'Tema 1 — Acto administrativo',
        id: 'd4',
        now: NOW,
      },
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.document.title).toBe('Tema 1 — Acto administrativo');
      expect(result.value.document.cloudConsent).toBe(true);
    }
  });

  it('elimina del índice todos los fragmentos de un documento', async () => {
    const { service, rag } = makeService();
    await service.ingest(
      { fileName: 'a.txt', mimeType: 'text/plain', bytes: encoder.encode(TEMARIO_TXT), uri: 'u' },
      {
        chunkOptions: { maxChars: 400, overlapChars: 60, minChars: 20 },
        cloudConsent: false,
        id: 'dA',
        now: NOW,
      },
    );
    expect(rag.indexedChunks()).toBeGreaterThan(0);
    service.remove('dA');
    expect(rag.indexedChunks()).toBe(0);
  });
});

describe('criterio de aceptación del Sprint 2', () => {
  it('adjuntar un PDF genera preguntas basadas en el contenido y muestra la fuente', async () => {
    const { service, rag } = makeService();
    const pdf = buildPdf([
      'El principio de legalidad es la regla que obliga a la Administracion a actuar con habilitacion legal previa.',
      'La potestad reglamentaria consiste en la facultad del Gobierno para dictar normas de rango inferior a la ley.',
      'La jerarquia normativa consiste en el orden escalonado de las normas segun su rango.',
    ]);

    const ingested = await service.ingest(
      {
        fileName: 'tema-legalidad.pdf',
        mimeType: 'application/pdf',
        bytes: pdf,
        uri: 'file:///t.pdf',
      },
      {
        chunkOptions: { maxChars: 900, overlapChars: 150, minChars: 40 },
        cloudConsent: false,
        id: 'dPdf',
        now: NOW,
      },
    );
    expect(ingested.ok).toBe(true);
    if (!ingested.ok) {
      return;
    }

    const curriculum = extractCurriculum(ingested.value.text);
    expect(curriculum.concepts.length).toBeGreaterThan(0);

    let generated = 0;
    for (const concept of curriculum.concepts) {
      const questions = await rag.generateConceptQuestions(
        concept,
        [ingested.value.document],
        DEFAULT_GENERATE_OPTIONS,
        1,
      );
      expect(questions.ok).toBe(true);
      if (!questions.ok) {
        continue;
      }
      for (const question of questions.value) {
        generated += 1;
        // La pregunta cita el documento del usuario, no texto genérico.
        expect(question.citation.documentId).toBe('dPdf');
        expect(question.citation.documentTitle).toBe('tema-legalidad');
        expect(question.citation.excerpt.length).toBeGreaterThan(0);
        expect(question.citation.charEnd).toBeGreaterThan(question.citation.charStart);
        expect(question.citation.chunkId).toContain('dPdf');
        // Y no es una pregunta trivial de memoria.
        expect(assessQuestionQuality(question).isTrivial).toBe(false);
      }
    }
    expect(generated).toBeGreaterThan(0);
  });

  it('la búsqueda semántica recupera el fragmento del concepto consultado', async () => {
    const { service, rag } = makeService();
    const text = `Tema 1. Recursos

El recurso de alzada es el que se interpone ante el organo superior jerarquico. La revision de oficio permite anular actos nulos de pleno derecho.`;
    await service.ingest(
      { fileName: 'recursos.txt', mimeType: 'text/plain', bytes: encoder.encode(text), uri: 'u' },
      {
        chunkOptions: { maxChars: 200, overlapChars: 30, minChars: 20 },
        cloudConsent: false,
        id: 'dR',
        now: NOW,
      },
    );

    const hits = await rag.retrieve('recurso de alzada organo superior', 1);
    expect(hits.ok).toBe(true);
    if (hits.ok) {
      expect(hits.value[0]?.chunk.documentId).toBe('dR');
    }
  });
});
