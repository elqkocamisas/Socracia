import { SAMPLE_CURRICULUM_TEXT, SAMPLE_DOCUMENT } from '../__fixtures__/sampleCurriculum';
import { extractCurriculum } from '../ingest/conceptExtractor';
import { HashingEmbeddingProvider } from '../rag/embeddings';
import { RagEngine } from '../rag/engine';
import { InMemoryVectorStore } from '../rag/vectorStore';
import { inMemoryStorage } from '../storage/inMemory';
import { StudyService } from '../app/studyService';
import { MayeuticSessionController } from '../app/sessionController';

const NOW = 1_700_000_000_000;
const USER = 'u1';
const DOC = 'doc-1';

async function setup() {
  const storage = inMemoryStorage();
  const rag = new RagEngine(new InMemoryVectorStore(), new HashingEmbeddingProvider(256));
  const study = new StudyService(rag, storage);
  await rag.ingestDocument(SAMPLE_DOCUMENT, SAMPLE_CURRICULUM_TEXT);

  const curriculum = extractCurriculum(SAMPLE_CURRICULUM_TEXT);
  await storage.documents.saveDocument(SAMPLE_DOCUMENT);
  await storage.documents.saveCurriculum({
    id: DOC,
    title: SAMPLE_DOCUMENT.title,
    topics: curriculum.topics,
    concepts: curriculum.concepts,
    createdAt: NOW,
  });

  return { controller: new MayeuticSessionController(study, storage, USER), storage, curriculum };
}

describe('MayeuticSessionController.start', () => {
  it('arranca en fase de pregunta con la primera pregunta y su fuente', async () => {
    const { controller } = await setup();
    const started = await controller.start(DOC, NOW, 's1');
    expect(started.ok).toBe(true);
    if (!started.ok) {
      return;
    }
    expect(started.value.phase).toBe('preguntando');
    expect(started.value.question).not.toBeNull();
    expect(started.value.citation?.documentId).toBe(SAMPLE_DOCUMENT.id);
    expect(started.value.conceptLabel).toBeTruthy();
    expect(started.value.progress.answered).toBe(0);
    expect(started.value.feedback).toBeNull();
  });

  it('devuelve error explícito si el documento no tiene temario', async () => {
    const { controller } = await setup();
    const started = await controller.start('doc-inexistente', NOW, 's1');
    expect(started.ok).toBe(false);
    if (started.ok) {
      return;
    }
    expect(started.error.code).toBe('sin-temario');
  });
});

describe('MayeuticSessionController.answer', () => {
  it('tras una respuesta vacía ofrece andamiaje y repite el concepto', async () => {
    const { controller } = await setup();
    const started = await controller.start(DOC, NOW, 's1');
    if (!started.ok) {
      throw new Error('no arrancó');
    }
    const conceptBefore = started.value.question!.conceptId;

    const answered = await controller.answer('', 300, NOW + 1);
    expect(answered.ok).toBe(true);
    if (!answered.ok) {
      return;
    }
    expect(answered.value.verdict).toBe('sin-respuesta');
    expect(answered.value.scaffold).not.toBeNull();
    expect(answered.value.phase).toBe('retroalimentando');
    expect(answered.value.question!.conceptId).toBe(conceptBefore);
  });

  it('el andamiaje nunca contiene la respuesta de referencia', async () => {
    const { controller } = await setup();
    const started = await controller.start(DOC, NOW, 's1');
    if (!started.ok) {
      throw new Error('no arrancó');
    }
    const expected = started.value.question!.expectedAnswer;
    const answered = await controller.answer('no lo sé', 300, NOW + 1);
    if (!answered.ok) {
      throw new Error('no respondió');
    }
    const scaffold = answered.value.scaffold;
    expect(scaffold).not.toBeNull();
    if (expected.length > 0) {
      expect(scaffold!.prompt).not.toContain(expected);
    }
  });

  it('progresa a través de todo el itinerario hasta terminar', async () => {
    const { controller } = await setup();
    const started = await controller.start(DOC, NOW, 's1');
    if (!started.ok) {
      throw new Error('no arrancó');
    }

    let state = started.value;
    let guard = 0;
    while (state.phase !== 'terminada' && guard < 300) {
      const answered = await controller.answer('respuesta de prueba', 200, NOW + guard + 1);
      if (!answered.ok) {
        throw new Error('falló al responder');
      }
      state = answered.value;
      guard += 1;
    }

    expect(state.phase).toBe('terminada');
    expect(state.progress.answered).toBeGreaterThan(0);
    expect(state.question).toBeNull();
  });

  it('devuelve error si se responde sin sesión activa', async () => {
    const { controller } = await setup();
    const answered = await controller.answer('texto', 100, NOW);
    expect(answered.ok).toBe(false);
    if (answered.ok) {
      return;
    }
    expect(answered.error.code).toBe('sesion-no-iniciada');
  });
});

describe('MayeuticSessionController.overview', () => {
  it('refleja el progreso persistido y ofrece una acción siguiente', async () => {
    const { controller } = await setup();
    const before = await controller.overview(NOW);
    expect(before.mastery.conceptsTracked).toBeGreaterThan(0);
    expect(before.hint).toContain('sesión guiada');

    const started = await controller.start(DOC, NOW, 's1');
    if (!started.ok) {
      throw new Error('no arrancó');
    }
    await controller.answer('respuesta', 100, NOW + 1);

    const after = await controller.overview(NOW + 2);
    expect(after.mastery.conceptsNotEvaluated).toBeLessThan(before.mastery.conceptsTracked);
  });
});
