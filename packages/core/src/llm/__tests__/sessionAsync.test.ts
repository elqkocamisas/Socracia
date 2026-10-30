import type { AnswerEvaluation, Citation, Concept, SocraticQuestion } from '../../domain/types';
import type { Result } from '../../result';
import { err, ok } from '../../result';
import type { AnswerEvaluatorPort } from '../ports';
import { LlmAnswerEvaluator } from '../evaluator';
import { FakeLlmProvider } from '../fakeProvider';
import type { LlmError, LlmPassage } from '../types';
import { DEFAULT_THRESHOLDS } from '../../mayeu/evaluate';
import { buildItinerary, startSession, type ConceptQuestions } from '../../mayeu/itinerary';
import { MayeuticSessionEngine } from '../../mayeu/session';

const NOW = 1_700_000_000_000;

const citation: Citation = {
  documentId: 'd1',
  documentTitle: 'Tema 1',
  chunkId: 'd1:0',
  excerpt: 'La Administración solo actúa con habilitación legal previa.',
  charStart: 0,
  charEnd: 60,
};

const concept: Concept = {
  id: 'c1',
  topicId: 't1',
  label: 'principio de legalidad',
  definition: 'La Administración necesita habilitación legal previa para actuar.',
  keywords: ['legalidad', 'habilitación'],
};

function question(index: number): SocraticQuestion {
  return {
    id: `c1:q${index}`,
    conceptId: 'c1',
    prompt: `¿Por qué existe el principio de legalidad? (${index})`,
    move: 'causa',
    level: 'comprender',
    expectedAnswer: concept.definition,
    keyTerms: concept.keywords,
    citation,
    difficulty: 0.3,
  };
}

const items: ConceptQuestions[] = [{ concept, questions: [question(0), question(1)] }];
const passages: LlmPassage[] = [{ citation }];

function makeEngine(
  extra: {
    evaluator?: AnswerEvaluatorPort;
    passages?: (q: SocraticQuestion) => readonly LlmPassage[];
  } = {},
): MayeuticSessionEngine {
  const steps = buildItinerary(items, [], { questionsPerConcept: 2, prioritizeGaps: true });
  const session = startSession('s1', 'u1', 't1', steps, NOW);
  return new MayeuticSessionEngine(
    session,
    steps,
    [concept],
    { maxAttemptsPerQuestion: 2, thresholds: DEFAULT_THRESHOLDS, ...extra },
    NOW,
  );
}

const GOOD = concept.definition;

/** Evaluador controlable que devuelve una evaluación fija o un error. */
class StubEvaluator implements AnswerEvaluatorPort {
  public readonly id = 'stub';
  public calls = 0;
  public constructor(private readonly outcome: 'ok' | LlmError, private readonly score = 0.95) {}
  public async evaluate(): Promise<Result<AnswerEvaluation, LlmError>> {
    this.calls += 1;
    if (this.outcome === 'ok') {
      return ok({
        questionId: 'c1:q0',
        conceptId: 'c1',
        verdict: 'correcta' as const,
        score: this.score,
        matchedKeyTerms: ['legalidad'],
        missingKeyTerms: [],
        feedback: 'Evaluación semántica.',
        rationale: 'Evaluación semántica.',
        citation,
      });
    }
    return err(this.outcome);
  }
}

describe('MayeuticSessionEngine.submitAsync', () => {
  it('usa la evaluación del modelo cuando está disponible', async () => {
    const evaluator = new LlmAnswerEvaluator(
      new FakeLlmProvider([
        {
          text: JSON.stringify({
            verdict: 'correcta',
            score: 0.95,
            matchedKeyTerms: ['legalidad', 'habilitación'],
            missingKeyTerms: [],
            rationale: 'Capta el principio.',
            citation: 'd1:0',
          }),
        },
      ]),
    );
    const engine = makeEngine({ evaluator, passages: () => passages });
    const turn = await engine.submitAsync(GOOD, 1000, NOW);
    expect(turn.evaluation.verdict).toBe('correcta');
    expect(turn.evaluation.score).toBe(0.95);
    expect(turn.evaluation.citation?.chunkId).toBe('d1:0');
  });

  it('cae a la heurística si el evaluador falla, sin romper la sesión', async () => {
    const stub = new StubEvaluator({ code: 'timeout', message: 'tarde' });
    const engine = makeEngine({ evaluator: stub, passages: () => passages });
    const turn = await engine.submitAsync(GOOD, 1000, NOW);
    expect(stub.calls).toBe(1);
    // La heurística marca correcta porque la respuesta es la definición literal.
    expect(turn.evaluation.verdict).toBe('correcta');
    // Y no trae cita del modelo: eso es la heurística.
    expect(turn.evaluation.rationale).toBeUndefined();
  });

  it('no invoca al evaluador si no hay pasajes: no se envía contenido sin fuente', async () => {
    const stub = new StubEvaluator('ok');
    const engine = makeEngine({ evaluator: stub, passages: () => [] });
    const turn = await engine.submitAsync(GOOD, 1000, NOW);
    expect(stub.calls).toBe(0);
    expect(turn.evaluation.score).toBeGreaterThan(0);
  });

  it('sin evaluador se comporta igual que el camino síncrono', async () => {
    const asyncEngine = makeEngine({ passages: () => passages });
    const syncEngine = makeEngine();
    const fromAsync = await asyncEngine.submitAsync(GOOD, 1000, NOW);
    const fromSync = syncEngine.submit(GOOD, 1000, NOW);
    expect(fromAsync.evaluation).toEqual(fromSync.evaluation);
  });

  it('submit síncrono sigue usando la heurística aunque haya evaluador', () => {
    const stub = new StubEvaluator('ok');
    const engine = makeEngine({ evaluator: stub, passages: () => passages });
    const turn = engine.submit(GOOD, 1000, NOW);
    expect(stub.calls).toBe(0);
    expect(turn.evaluation.rationale).toBeUndefined();
  });
});
