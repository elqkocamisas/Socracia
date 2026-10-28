import type { AnswerEvaluation, Citation, Concept, SocraticQuestion } from '../domain/types';
import { buildItinerary, startSession, type ConceptQuestions } from '../mayeu/itinerary';

const citation: Citation = {
  documentId: 'd1',
  documentTitle: 'Tema 1',
  chunkId: 'd1:0',
  excerpt: '…',
  charStart: 0,
  charEnd: 10,
};

function concept(id: string, label: string): Concept {
  return {
    id,
    topicId: 't1',
    label,
    definition: `Definición suficientemente larga de ${label} para poder evaluarla.`,
    keywords: [label.split(' ')[0] as string],
  };
}

function question(
  conceptId: string,
  index: number,
  level: SocraticQuestion['level'],
  difficulty: number,
): SocraticQuestion {
  return {
    id: `${conceptId}:q${index}`,
    conceptId,
    prompt: `Pregunta ${index} sobre ${conceptId}`,
    move: 'causa',
    level,
    expectedAnswer: 'Respuesta de referencia larga y sustantiva para evaluar.',
    keyTerms: ['clave'],
    citation,
    difficulty,
  };
}

function evaluation(conceptId: string, score: number): AnswerEvaluation {
  return {
    questionId: `${conceptId}:q0`,
    conceptId,
    verdict: score >= 0.6 ? 'correcta' : 'incorrecta',
    score,
    matchedKeyTerms: [],
    missingKeyTerms: [],
    feedback: '',
  };
}

describe('buildItinerary', () => {
  const items: ConceptQuestions[] = [
    {
      concept: concept('c1', 'concepto dominado'),
      questions: [question('c1', 0, 'comprender', 0.3), question('c1', 1, 'evaluar', 0.8)],
    },
    {
      concept: concept('c2', 'concepto flojo'),
      questions: [question('c2', 0, 'comprender', 0.3), question('c2', 1, 'evaluar', 0.8)],
    },
    {
      concept: concept('c3', 'concepto sin evaluar'),
      questions: [question('c3', 0, 'comprender', 0.3), question('c3', 1, 'evaluar', 0.8)],
    },
  ];

  it('prioriza el concepto con laguna antes que el dominado', () => {
    const steps = buildItinerary(items, [evaluation('c1', 0.9), evaluation('c2', 0.1)]);
    expect(steps[0]?.conceptId).toBe('c2');
    const last = steps[steps.length - 1];
    expect(last?.conceptId).toBe('c1');
  });

  it('coloca los conceptos sin evaluar entre lagunas y dominados', () => {
    const steps = buildItinerary(items, [evaluation('c1', 0.9), evaluation('c2', 0.1)]);
    const conceptOrder = [...new Set(steps.map((step) => step.conceptId))];
    expect(conceptOrder).toEqual(['c2', 'c3', 'c1']);
  });

  it('asciende en exigencia cognitiva dentro de cada concepto', () => {
    const steps = buildItinerary(items, []);
    const c1 = steps.filter((step) => step.conceptId === 'c1');
    expect(c1[0]?.question.level).toBe('comprender');
    expect(c1[1]?.question.level).toBe('evaluar');
  });

  it('respeta questionsPerConcept', () => {
    const steps = buildItinerary(items, [], { questionsPerConcept: 1, prioritizeGaps: true });
    expect(steps).toHaveLength(3);
  });

  it('numera los pasos de forma consecutiva', () => {
    const steps = buildItinerary(items, []);
    steps.forEach((step, index) => expect(step.order).toBe(index));
  });

  it('con lista vacía devuelve itinerario vacío', () => {
    expect(buildItinerary([], [])).toEqual([]);
  });
});

describe('startSession', () => {
  it('crea una sesión con las preguntas del itinerario', () => {
    const steps = buildItinerary([
      { concept: concept('c1', 'uno'), questions: [question('c1', 0, 'comprender', 0.3)] },
    ]);
    const session = startSession('s1', 'u1', 't1', steps, 1000);
    expect(session.id).toBe('s1');
    expect(session.questionIds).toEqual(['c1:q0']);
    expect(session.finishedAt).toBeNull();
    expect(session.answers).toEqual([]);
  });
});
