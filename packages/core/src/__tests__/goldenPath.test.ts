import { buildPdf, buildPdfWithTjArrays } from '../__fixtures__/buildPdf';
import { extractCurriculum } from '../ingest/conceptExtractor';
import { defaultRegistry } from '../ingest/extractors';
import { DocumentIngestionService } from '../ingest/ingestionService';
import { fflateInflate } from '../ingest/inflate';
import { HashingEmbeddingProvider } from '../rag/embeddings';
import { RagEngine } from '../rag/engine';
import { InMemoryVectorStore } from '../rag/vectorStore';
import { inMemoryStorage } from '../storage/inMemory';
import { DEFAULT_STUDY_OPTIONS, StudyService } from '../app/studyService';
import { MayeuticSessionController } from '../app/sessionController';
import { LlmExplainer } from '../llm/explainer';
import { FakeLlmProvider } from '../llm/fakeProvider';
import { evaluateAnswer } from '../mayeu/evaluate';
import type { AnswerEvaluatorPort } from '../llm/ports';
import type { AnswerEvaluation, SocraticQuestion, UserAnswer } from '../domain/types';
import type { LlmError } from '../llm/types';
import { ok, type Result } from '../result';
import type { KnowledgeDocument } from '../domain/types';
import type { StoragePort } from '../storage/ports';

/**
 * Recorrido dorado de extremo a extremo (servicio + controlador).
 *
 * Demuestra que el proceso mayéutico cierra el ciclo completo sobre tres
 * documentos reales (TXT, MD y PDF con texto): importar → conceptos coherentes →
 * pregunta anclada → paráfrasis correcta aceptada → respuesta errónea →
 * repregunta que ataca ESE error → explicación con cita real tras fallos →
 * lagunas actualizadas → repaso programado → progreso intacto tras reiniciar.
 *
 * Cada documento usa un tema por concepto: es la estructura reglada de un
 * temario (oposiciones, PAU), donde cada epígrafe define una idea evaluable.
 */

const NOW = 1_700_000_000_000;
const USER = 'local-user';
const encoder = new TextEncoder();

/** Texto de estudio de autoría propia, ajeno a material con derechos. */
const TXT = `Tema 1. La fotosíntesis

La fotosíntesis es el proceso por el cual las plantas transforman la luz solar en energía química almacenada en forma de glucosa.

Tema 2. La clorofila

La clorofila es el pigmento verde que captura la energía luminosa y la transfiere a los centros de reacción del cloroplasto.

Tema 3. El ciclo de Calvin

El ciclo de Calvin es la ruta metabólica que fija el dióxido de carbono atmosférico en moléculas de azúcar durante la fase oscura.`;

/** El mismo temario en Markdown: encabezados `##` por epígrafe. */
const MD = TXT.replace(/^Tema /gm, '## Tema ');

/** El mismo temario como PDF real (operadores Tj, FlateDecode). */
function pdfBytes(): Uint8Array {
  const lines = TXT.split('\n\n').flatMap((paragraph) => paragraph.split('\n'));
  return buildPdf(lines, { compress: true });
}

/**
 * El mismo temario como PDF «de verdad»: arrays `TJ` con kerning y cadena de
 * filtros ASCII85 + FlateDecode, que es lo que emiten Word, Chrome y LaTeX.
 */
function pdfBytesRealistic(): Uint8Array {
  const lines = TXT.split('\n\n').flatMap((paragraph) => paragraph.split('\n'));
  return buildPdfWithTjArrays(lines, { compress: true, ascii85: true });
}

/** Paráfrasis correcta de cada concepto, con vocabulario propio del alumno. */
const PARAPHRASE: Record<string, string> = {
  't1:c1':
    'Es el proceso mediante el cual las plantas convierten la luz solar en energía química que guardan como glucosa.',
  't2:c1':
    'Es el pigmento de color verde que captura la energía de la luz y la lleva a los centros de reacción del cloroplasto.',
  't3:c1':
    'Es la ruta metabólica que fija el dióxido de carbono del aire en azúcar durante la fase oscura.',
};

/** Respuesta claramente errónea: no aporta ningún término del concepto. */
const WRONG = 'No lo sé, me suena de algo pero no sabría explicarlo.';

/**
 * Evaluador que delega en la heurística local sobre la respuesta real.
 *
 * Reproduce la composición real (evaluador + explicador conviven) sin depender
 * de la red: el motor usa el camino asíncrono, que es el único donde se enriquece
 * el turno con explicación. Evalúa la respuesta que llega, no una fija, para que
 * una paráfrasis correcta y una errónea se distingan.
 */
class HeuristicEvaluator implements AnswerEvaluatorPort {
  public readonly id = 'heuristic-evaluator';
  public constructor(
    private readonly thresholds: (typeof DEFAULT_STUDY_OPTIONS.session)['thresholds'],
  ) {}
  public async evaluate(
    question: SocraticQuestion,
    answer: UserAnswer | null,
  ): Promise<Result<AnswerEvaluation, LlmError>> {
    return ok(
      evaluateAnswer(
        question,
        answer ?? { questionId: question.id, text: '', answeredAt: NOW, latencyMs: 1 },
        this.thresholds,
      ),
    );
  }
}

interface Harness {
  readonly storage: StoragePort;
  readonly rag: RagEngine;
  readonly study: StudyService;
  readonly controller: MayeuticSessionController;
  readonly ingestion: DocumentIngestionService;
}

function makeHarness(
  options: { explainer?: LlmExplainer; evaluator?: AnswerEvaluatorPort } = {},
): Harness {
  const storage = inMemoryStorage();
  const rag = new RagEngine(new InMemoryVectorStore(), new HashingEmbeddingProvider(256));
  const ingestion = new DocumentIngestionService(defaultRegistry(fflateInflate), rag);
  // Con evaluador, el motor usa el camino asíncrono y enriquece el turno con la
  // explicación; sin él, el camino síncrono heurístico, que no explica.
  const session = options.evaluator
    ? {
        ...DEFAULT_STUDY_OPTIONS.session,
        evaluator: options.evaluator,
        passages: (question: SocraticQuestion) => [{ citation: question.citation }],
        ...(options.explainer ? { explainer: options.explainer, failuresBeforeExplaining: 2 } : {}),
      }
    : DEFAULT_STUDY_OPTIONS.session;
  const study = new StudyService(rag, storage, { ...DEFAULT_STUDY_OPTIONS, session });
  const controller = new MayeuticSessionController(study, storage, USER);
  return { storage, rag, study, controller, ingestion };
}

/** Ingesta un documento y guarda documento, temario y fragmentos, como la app. */
async function importDoc(
  harness: Harness,
  input: { name: string; mime: string; bytes: Uint8Array; id: string },
): Promise<{ document: KnowledgeDocument; conceptCount: number }> {
  const result = await harness.ingestion.ingest(
    {
      fileName: input.name,
      mimeType: input.mime,
      bytes: input.bytes,
      uri: `file:///${input.name}`,
    },
    {
      chunkOptions: { maxChars: 900, overlapChars: 150, minChars: 40 },
      cloudConsent: false,
      id: input.id,
      now: NOW,
    },
  );
  if (!result.ok) {
    throw new Error(`ingesta falló: ${result.error.message}`);
  }
  const curriculum = extractCurriculum(result.value.text);
  await harness.storage.documents.saveDocument(result.value.document);
  await harness.storage.documents.saveCurriculum({
    id: input.id,
    title: result.value.document.title,
    topics: curriculum.topics,
    concepts: curriculum.concepts,
    createdAt: NOW,
  });
  await harness.storage.documents.saveChunks(result.value.chunks);
  return { document: result.value.document, conceptCount: curriculum.concepts.length };
}

describe('recorrido dorado mayéutico (servicio + controlador)', () => {
  describe('extracción coherente por formato (TXT, MD, PDF)', () => {
    it.each([
      ['TXT', 'text/plain', 'temario.txt', () => encoder.encode(TXT)],
      ['MD', 'text/markdown', 'temario.md', () => encoder.encode(MD)],
      ['PDF', 'application/pdf', 'temario.pdf', () => pdfBytes()],
      ['PDF realista', 'application/pdf', 'temario-real.pdf', () => pdfBytesRealistic()],
    ])('%s produce los mismos 3 temas y 3 conceptos', async (_label, mime, name, bytes) => {
      const harness = makeHarness();
      const { document, conceptCount } = await importDoc(harness, {
        name,
        mime,
        bytes: bytes(),
        id: `doc-${mime}`,
      });

      const curriculum = await harness.storage.documents.getCurriculum(document.id);
      expect(conceptCount).toBe(3);
      expect(curriculum?.topics.map((topic) => topic.title)).toEqual([
        'La fotosíntesis',
        'La clorofila',
        'El ciclo de Calvin',
      ]);
      expect(curriculum?.concepts.map((concept) => concept.label)).toEqual([
        'fotosíntesis',
        'clorofila',
        'ciclo de Calvin',
      ]);
      // Cada concepto tiene definición evaluable y términos clave propios.
      for (const concept of curriculum?.concepts ?? []) {
        expect(concept.definition.length).toBeGreaterThanOrEqual(25);
        expect(concept.keywords.length).toBeGreaterThan(0);
      }
    });
  });

  describe('el ciclo completo se cierra igual con TXT, MD y PDF', () => {
    it.each([
      ['TXT', 'text/plain', 'temario.txt', () => encoder.encode(TXT)],
      ['MD', 'text/markdown', 'temario.md', () => encoder.encode(MD)],
      ['PDF', 'application/pdf', 'temario.pdf', () => pdfBytes()],
      ['PDF realista', 'application/pdf', 'temario-real.pdf', () => pdfBytesRealistic()],
    ])(
      '%s: importar → pregunta anclada → parafrasear → errar → explicar → progreso',
      async (_label, mime, name, bytes) => {
        const provider = new FakeLlmProvider([
          {
            compute: (request) => {
              if (request.purpose !== 'explicar') {
                return JSON.stringify({});
              }
              // La cita debe apuntar a un fragmento realmente enviado: se toma el
              // identificador del propio mensaje, no uno inventado.
              const match = request.user.match(/\[([^\]]+)\]\s/);
              return JSON.stringify({
                explanation:
                  'La fotosíntesis convierte la luz solar en energía química que la planta guarda como glucosa.',
                citations: match ? [match[1]] : [],
              });
            },
          },
        ]);
        const evaluator = new HeuristicEvaluator(DEFAULT_STUDY_OPTIONS.session.thresholds);
        const harness = makeHarness({ explainer: new LlmExplainer(provider), evaluator });
        const { document } = await importDoc(harness, {
          name,
          mime,
          bytes: bytes(),
          id: 'doc-ciclo',
        });

        // Pregunta anclada a un fragmento realmente indexado.
        const chunks = await harness.storage.documents.listChunks(document.id);
        const started = await harness.controller.start(document.id, NOW, 's1');
        if (!started.ok) {
          throw new Error('no arrancó');
        }
        const firstQuestion = started.value.question;
        const citation = started.value.citation;
        expect(citation).not.toBeNull();
        expect(chunks.some((chunk) => chunk.id === citation?.chunkId)).toBe(true);

        // Paráfrasis correcta del concepto de la primera pregunta.
        const conceptId = firstQuestion?.conceptId ?? '';
        const paraphrase = PARAPHRASE[conceptId] ?? '';
        expect(paraphrase.length).toBeGreaterThan(0);
        const good = await harness.controller.answer(paraphrase, 900, NOW + 1);
        expect(good.ok).toBe(true);
        if (good.ok) {
          expect(good.value.verdict).toBe('correcta');
        }

        // Se responde mal al resto hasta cerrar la sesión; aparece la explicación.
        let state = good.ok ? good.value : started.value;
        let sawExplanation = false;
        let guard = 0;
        while (state.phase !== 'terminada' && guard < 40) {
          const answered = await harness.controller.answer(WRONG, 400, NOW + guard + 2);
          if (!answered.ok) {
            throw new Error('no respondió');
          }
          state = answered.value;
          if (state.explanation) {
            sawExplanation = true;
          }
          guard += 1;
        }
        expect(state.phase).toBe('terminada');
        expect(sawExplanation).toBe(true);
        expect(state.progress.incorrect).toBeGreaterThan(0);

        // Lagunas actualizadas y repaso programado a futuro.
        const overview = await harness.controller.overview(NOW + 5000);
        expect(overview.gaps.length).toBeGreaterThan(0);
        const reviews = await harness.storage.progress.listReviewStates(USER);
        expect(reviews.length).toBeGreaterThan(0);
        for (const review of reviews) {
          expect(review.dueAt).toBeGreaterThan(NOW);
        }
      },
    );
  });

  it('ancla cada pregunta a una cita real del documento (trazabilidad)', async () => {
    const harness = makeHarness();
    const { document } = await importDoc(harness, {
      name: 'temario.txt',
      mime: 'text/plain',
      bytes: encoder.encode(TXT),
      id: 'doc-citas',
    });

    const chunks = await harness.storage.documents.listChunks(document.id);
    const started = await harness.controller.start(document.id, NOW, 's1');
    expect(started.ok).toBe(true);
    if (!started.ok) {
      return;
    }
    const citation = started.value.citation;
    expect(citation).not.toBeNull();
    // La cita apunta a un fragmento realmente indexado y guardado.
    const chunk = chunks.find((candidate) => candidate.id === citation?.chunkId);
    expect(chunk).toBeDefined();
    expect(citation?.excerpt.length).toBeGreaterThan(0);
    expect(citation?.charEnd).toBeGreaterThan(citation?.charStart ?? 0);
  });

  it('acepta una paráfrasis correcta y rechaza una respuesta errónea', async () => {
    const harness = makeHarness();
    const { document } = await importDoc(harness, {
      name: 'temario.txt',
      mime: 'text/plain',
      bytes: encoder.encode(TXT),
      id: 'doc-eval',
    });

    const started = await harness.controller.start(document.id, NOW, 's1');
    if (!started.ok) {
      throw new Error('no arrancó');
    }
    const conceptId = started.value.question?.conceptId ?? '';
    const paraphrase = PARAPHRASE[conceptId] ?? '';
    expect(paraphrase.length).toBeGreaterThan(0);

    const good = await harness.controller.answer(paraphrase, 900, NOW + 1);
    expect(good.ok).toBe(true);
    if (good.ok) {
      expect(good.value.verdict).toBe('correcta');
    }
  });

  it('la repregunta tras un fallo ataca el término ausente de ESA pregunta', async () => {
    const harness = makeHarness();
    const { document } = await importDoc(harness, {
      name: 'temario.txt',
      mime: 'text/plain',
      bytes: encoder.encode(TXT),
      id: 'doc-scaffold',
    });

    const started = await harness.controller.start(document.id, NOW, 's1');
    if (!started.ok) {
      throw new Error('no arrancó');
    }
    const question = started.value.question;
    expect(question).not.toBeNull();

    const answered = await harness.controller.answer(WRONG, 800, NOW + 1);
    if (!answered.ok) {
      throw new Error('no respondió');
    }
    expect(answered.value.verdict).not.toBe('correcta');
    expect(answered.value.scaffold).not.toBeNull();
    // El foco de la repregunta es un término clave de la pregunta fallada.
    const focus = question?.keyTerms.find((term) => answered.value.scaffold?.prompt.includes(term));
    expect(focus).toBeDefined();
    // El andamiaje nunca revela la respuesta de referencia.
    expect(answered.value.scaffold?.prompt).not.toContain(question?.expectedAnswer ?? '__none__');
    // La repregunta mantiene el mismo concepto.
    expect(answered.value.question?.conceptId).toBe(question?.conceptId);
  });

  it('tras los fallos sobre un concepto ofrece una explicación con cita real', async () => {
    const provider = new FakeLlmProvider([
      {
        text: JSON.stringify({
          explanation:
            'La fotosíntesis transforma la luz solar en energía química que la planta almacena como glucosa.',
          citations: ['doc-explica:0'],
        }),
      },
    ]);
    const evaluator = new HeuristicEvaluator(DEFAULT_STUDY_OPTIONS.session.thresholds);
    const harness = makeHarness({ explainer: new LlmExplainer(provider), evaluator });
    const { document } = await importDoc(harness, {
      name: 'temario.txt',
      mime: 'text/plain',
      bytes: encoder.encode(TXT),
      id: 'doc-explica',
    });

    const started = await harness.controller.start(document.id, NOW, 's1');
    if (!started.ok) {
      throw new Error('no arrancó');
    }

    const first = await harness.controller.answer(WRONG, 500, NOW + 1);
    if (!first.ok) {
      throw new Error('no respondió');
    }
    // Primer fallo: aún no se explica; el método exige seguir preguntando.
    expect(first.value.explanation).toBeNull();

    const second = await harness.controller.answer(WRONG, 500, NOW + 2);
    if (!second.ok) {
      throw new Error('no respondió');
    }
    // Segundo fallo sobre el mismo concepto: aparece la explicación.
    expect(second.value.explanation).toContain('glucosa');
  });

  it('actualiza lagunas, programa el repaso y conserva el progreso tras reiniciar', async () => {
    const harness = makeHarness();
    const { document } = await importDoc(harness, {
      name: 'temario.txt',
      mime: 'text/plain',
      bytes: encoder.encode(TXT),
      id: 'doc-progreso',
    });

    const started = await harness.controller.start(document.id, NOW, 's1');
    if (!started.ok) {
      throw new Error('no arrancó');
    }
    // Se responde mal a propósito hasta cerrar la sesión.
    let state = started.value;
    let guard = 0;
    while (state.phase !== 'terminada' && guard < 40) {
      const answered = await harness.controller.answer(WRONG, 400, NOW + guard + 1);
      if (!answered.ok) {
        throw new Error('no respondió');
      }
      state = answered.value;
      guard += 1;
    }
    expect(state.phase).toBe('terminada');
    expect(state.progress.incorrect).toBeGreaterThan(0);

    const overview = await harness.controller.overview(NOW + 1000);
    expect(overview.gaps.length).toBeGreaterThan(0);
    expect(overview.mastery.conceptsNotEvaluated).toBe(0);

    // El repaso queda programado a futuro (SM-2): tras fallar, vence mañana, así
    // que no está vencido ahora. Se comprueba que se programó, no que venza ya.
    const reviews = await harness.storage.progress.listReviewStates(USER);
    expect(reviews.length).toBeGreaterThan(0);
    for (const review of reviews) {
      expect(review.dueAt).toBeGreaterThan(NOW);
    }
    const tomorrow = NOW + 25 * 60 * 60 * 1000;
    const later = await harness.controller.overview(tomorrow);
    expect(later.dueForReview.length).toBeGreaterThan(0);

    // Reinicio: servicios nuevos sobre el mismo almacén, índice rehidratado.
    const restarted = makeHarness();
    const rehydrated = await restarted.rag.rehydrate(
      await harness.storage.documents.listAllChunks(),
    );
    expect(rehydrated.ok).toBe(true);
    const restartedController = new MayeuticSessionController(
      new StudyService(restarted.rag, harness.storage),
      harness.storage,
      USER,
    );
    const afterRestart = await restartedController.overview(NOW + 2000);
    expect(afterRestart.gaps.length).toBe(overview.gaps.length);
    expect(afterRestart.mastery.conceptsNotEvaluated).toBe(0);
  });

  it('un fallo del modelo no rompe la sesión: cae a la heurística', async () => {
    // Explicador que siempre falla: la sesión debe seguir con el andamiaje.
    const provider = new FakeLlmProvider([{ error: { code: 'timeout', message: 'tarde' } }]);
    const evaluator = new HeuristicEvaluator(DEFAULT_STUDY_OPTIONS.session.thresholds);
    const harness = makeHarness({ explainer: new LlmExplainer(provider), evaluator });
    const { document } = await importDoc(harness, {
      name: 'temario.txt',
      mime: 'text/plain',
      bytes: encoder.encode(TXT),
      id: 'doc-degrada',
    });

    const started = await harness.controller.start(document.id, NOW, 's1');
    if (!started.ok) {
      throw new Error('no arrancó');
    }
    const answered = await harness.controller.answer(WRONG, 400, NOW + 1);
    expect(answered.ok).toBe(true);
    if (answered.ok) {
      expect(answered.value.scaffold).not.toBeNull();
      expect(answered.value.explanation).toBeNull();
    }
  });
});
