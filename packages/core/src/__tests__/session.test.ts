import type { Citation, Concept, SocraticQuestion } from '../domain/types';
import { DEFAULT_THRESHOLDS } from '../mayeu/evaluate';
import { buildItinerary, startSession, type ConceptQuestions } from '../mayeu/itinerary';
import { MayeuticSessionEngine } from '../mayeu/session';

const NOW = 1_700_000_000_000;

const citation: Citation = {
  documentId: 'd1',
  documentTitle: 'Tema 1',
  chunkId: 'd1:0',
  excerpt: '…',
  charStart: 0,
  charEnd: 10,
};

const concept: Concept = {
  id: 'c1',
  topicId: 't1',
  label: 'principio de legalidad',
  definition:
    'La Administración solo puede actuar con habilitación legal previa y sin invadir la ley.',
  keywords: ['legalidad', 'habilitación', 'Administración'],
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

function makeEngine(maxAttempts = 2): MayeuticSessionEngine {
  const steps = buildItinerary(items, [], { questionsPerConcept: 2, prioritizeGaps: true });
  const session = startSession('s1', 'u1', 't1', steps, NOW);
  return new MayeuticSessionEngine(
    session,
    steps,
    [concept],
    { maxAttemptsPerQuestion: maxAttempts, thresholds: DEFAULT_THRESHOLDS },
    NOW,
  );
}

const GOOD = concept.definition;
const BAD = 'No tengo ni idea de esto, lo siento mucho.';

describe('MayeuticSessionEngine', () => {
  it('empieza en la primera pregunta del itinerario', () => {
    const engine = makeEngine();
    expect(engine.currentQuestion()?.id).toBe('c1:q0');
    expect(engine.isFinished()).toBe(false);
  });

  it('avanza a la siguiente pregunta tras una respuesta correcta', () => {
    const engine = makeEngine();
    const turn = engine.submit(GOOD, 1000, NOW);
    expect(turn.evaluation.verdict).toBe('correcta');
    expect(turn.scaffold).toBeNull();
    expect(turn.next?.id).toBe('c1:q1');
  });

  it('repregunta con andamiaje antes de avanzar si la respuesta falla', () => {
    const engine = makeEngine(2);
    const turn = engine.submit(BAD, 1000, NOW);
    expect(turn.evaluation.verdict).not.toBe('correcta');
    expect(turn.scaffold).not.toBeNull();
    expect(turn.next?.id).toBe('c1:q0');
  });

  it('avanza tras agotar los intentos, ofreciendo el andamiaje final', () => {
    const engine = makeEngine(2);
    engine.submit(BAD, 1000, NOW);
    const second = engine.submit(BAD, 1000, NOW);
    expect(second.next?.id).toBe('c1:q1');
    expect(second.scaffold).not.toBeNull();
  });

  it('con un solo intento permitido no repregunta', () => {
    const engine = makeEngine(1);
    const turn = engine.submit(BAD, 1000, NOW);
    expect(turn.next?.id).toBe('c1:q1');
  });

  it('termina cuando se agotan las preguntas', () => {
    const engine = makeEngine(1);
    engine.submit(GOOD, 1000, NOW);
    const last = engine.submit(GOOD, 1000, NOW);
    expect(last.next).toBeNull();
    expect(engine.isFinished()).toBe(true);
    expect(engine.progress().finished).toBe(true);
  });

  it('lanza si se responde después de terminar', () => {
    const engine = makeEngine(1);
    engine.submit(GOOD, 1000, NOW);
    engine.submit(GOOD, 1000, NOW);
    expect(() => engine.submit(GOOD, 1000, NOW)).toThrow();
  });

  it('acumula el progreso con el recuento por veredicto', () => {
    const engine = makeEngine(1);
    engine.submit(GOOD, 1000, NOW);
    engine.submit(BAD, 1000, NOW);
    const progress = engine.progress();
    expect(progress.answered).toBe(2);
    expect(progress.total).toBe(2);
    expect(progress.correct).toBe(1);
    expect(progress.incorrect).toBe(1);
    expect(progress.averageScore).toBeGreaterThan(0);
    expect(progress.averageScore).toBeLessThanOrEqual(1);
  });

  it('registra estado de repaso tras cada respuesta', () => {
    const engine = makeEngine(1);
    engine.submit(GOOD, 1000, NOW);
    const reviews = engine.reviewStates();
    expect(reviews).toHaveLength(1);
    expect(reviews[0]?.conceptId).toBe('c1');
    expect(reviews[0]?.repetitions).toBe(1);
    expect(reviews[0]?.dueAt).toBeGreaterThan(NOW);
  });

  it('un fallo reinicia el intervalo de repaso', () => {
    const engine = makeEngine(1);
    engine.submit(GOOD, 1000, NOW);
    engine.submit(BAD, 1000, NOW);
    const review = engine.reviewStates()[0];
    expect(review?.repetitions).toBe(0);
    expect(review?.dueAt).toBe(NOW + 24 * 60 * 60 * 1000);
  });

  it('el perfil de lagunas solo incluye conceptos con dominio bajo', () => {
    const engine = makeEngine(1);
    engine.submit(GOOD, 1000, NOW);
    engine.submit(BAD, 1000, NOW);
    const profile = engine.gapProfile(NOW);
    expect(profile.gaps).toHaveLength(1);
    expect(profile.gaps[0]?.conceptId).toBe('c1');
  });

  it('sin fallos no hay lagunas', () => {
    const engine = makeEngine(1);
    engine.submit(GOOD, 1000, NOW);
    engine.submit(GOOD, 1000, NOW);
    expect(engine.gapProfile(NOW).gaps).toHaveLength(0);
  });

  it('el perfil de lagunas no incluye conceptos no evaluados', () => {
    const engine = makeEngine(1);
    expect(engine.gapProfile(NOW).gaps).toHaveLength(0);
  });
});
