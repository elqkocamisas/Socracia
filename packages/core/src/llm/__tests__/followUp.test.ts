import type { Citation, Concept, SocraticQuestion } from '../../domain/types';
import { revealsAnswer, parseFollowUp, LlmFollowUpGenerator } from '../followUp';
import { LlmExplainer } from '../explainer';
import { FakeLlmProvider } from '../fakeProvider';
import { buildItinerary, startSession, type ConceptQuestions } from '../../mayeu/itinerary';
import { MayeuticSessionEngine } from '../../mayeu/session';
import { DEFAULT_THRESHOLDS } from '../../mayeu/evaluate';

const citation: Citation = {
  documentId: 'd1',
  documentTitle: 'Tema 1',
  chunkId: 'd1:0',
  excerpt: 'La Administración solo actúa con habilitación legal previa.',
  charStart: 0,
  charEnd: 60,
};

const question: SocraticQuestion = {
  id: 'c1:q0',
  conceptId: 'c1',
  prompt: '¿Por qué existe el principio de legalidad?',
  move: 'causa',
  level: 'comprender',
  expectedAnswer: 'La Administración necesita habilitación legal previa para poder actuar.',
  keyTerms: ['legalidad', 'habilitación'],
  citation,
  difficulty: 0.3,
};

const evaluation = {
  questionId: 'c1:q0',
  conceptId: 'c1',
  verdict: 'incorrecta' as const,
  score: 0.1,
  matchedKeyTerms: [],
  missingKeyTerms: ['habilitación'],
  feedback: 'Falta el término clave.',
  rationale: 'No menciona la habilitación previa.',
};

describe('LlmFollowUpGenerator', () => {
  it('acepta una repregunta que no revela la respuesta', async () => {
    const provider = new FakeLlmProvider([
      {
        text: JSON.stringify({
          kind: 'acotar',
          prompt: '¿Qué necesita la Administración antes de actuar, según la ley?',
          hints: ['ley'],
        }),
      },
    ]);
    const result = await new LlmFollowUpGenerator(provider).followUp(question, null, evaluation);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.kind).toBe('acotar');
    }
  });

  it('rechaza una repregunta que filtra la respuesta', async () => {
    const provider = new FakeLlmProvider([
      {
        text: JSON.stringify({
          kind: 'acotar',
          prompt: '¿La Administración necesita habilitación legal previa para poder actuar?',
          hints: [],
        }),
      },
    ]);
    const result = await new LlmFollowUpGenerator(provider).followUp(question, null, evaluation);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('revelaba');
    }
  });

  it('revealsAnswer detecta el tramo literal de la respuesta', () => {
    expect(revealsAnswer(question.expectedAnswer, question)).toBe(true);
    expect(revealsAnswer('¿Qué papel juega la ley aquí?', question)).toBe(false);
  });

  it('parseFollowUp rechaza un kind desconocido', () => {
    const parsed = parseFollowUp(
      JSON.stringify({ kind: 'premiar', prompt: 'x', hints: [] }),
      question,
    );
    expect(parsed.ok).toBe(false);
  });

  it('propaga el error del proveedor', async () => {
    const provider = new FakeLlmProvider([{ error: { code: 'timeout', message: 'tarde' } }]);
    const result = await new LlmFollowUpGenerator(provider).followUp(question, null, evaluation);
    expect(result.ok).toBe(false);
  });
});

describe('integración con el motor de sesión', () => {
  const concept: Concept = {
    id: 'c1',
    topicId: 't1',
    label: 'principio de legalidad',
    definition: question.expectedAnswer,
    keywords: question.keyTerms,
  };
  const items: ConceptQuestions[] = [{ concept, questions: [question] }];

  function makeEngine(extra: Parameters<typeof Object.assign>[1]): MayeuticSessionEngine {
    const steps = buildItinerary(items, [], { questionsPerConcept: 1, prioritizeGaps: true });
    const session = startSession('s1', 'u1', 't1', steps, 0);
    return new MayeuticSessionEngine(
      session,
      steps,
      [concept],
      { maxAttemptsPerQuestion: 3, thresholds: DEFAULT_THRESHOLDS, ...extra },
      0,
    );
  }

  it('la explicación no se ofrece antes del umbral y sí después', async () => {
    const provider = new FakeLlmProvider([
      { text: JSON.stringify({ explanation: 'Porque sin ley previa no hay actuación válida.', citations: ['d1:0'] }) },
    ]);
    const explainer = new LlmExplainer(provider);
    const engine = makeEngine({
      explainer,
      passages: () => [{ citation }],
      failuresBeforeExplaining: 2,
    });

    // Un fallo: no se explica todavía.
    const first = await engine.submitAsync('No lo sé.', 100, 0);
    expect(first.explanation).toBeNull();
    // Segundo fallo sobre el mismo concepto: ya se explica.
    const second = await engine.submitAsync('Sigo sin saber.', 100, 0);
    expect(second.explanation).toContain('ley previa');
  });
});
