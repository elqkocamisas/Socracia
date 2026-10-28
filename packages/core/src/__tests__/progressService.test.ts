import type { AnswerEvaluation, Concept, ReviewState } from '../domain/types';
import { buildProgressOverview, dueReviews, nextActionHint } from '../app/progressService';

const NOW = 1_700_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

const concepts: readonly Concept[] = [
  { id: 'c1', topicId: 't1', label: 'Acto administrativo', definition: '', keywords: [] },
  { id: 'c2', topicId: 't1', label: 'Recurso de alzada', definition: '', keywords: [] },
  { id: 'c3', topicId: 't1', label: 'Silencio administrativo', definition: '', keywords: [] },
];

function evaluation(
  conceptId: string,
  score: number,
  verdict: AnswerEvaluation['verdict'],
): AnswerEvaluation {
  return {
    questionId: `${conceptId}:q0`,
    conceptId,
    verdict,
    score,
    matchedKeyTerms: [],
    missingKeyTerms: [],
    feedback: '',
  };
}

function review(
  conceptId: string,
  dueAt: number,
  lastReviewedAt: number | null = NOW,
): ReviewState {
  return { conceptId, ease: 2.5, intervalDays: 1, repetitions: 1, dueAt, lastReviewedAt };
}

describe('buildProgressOverview', () => {
  it('con un historial vacío, todo está sin evaluar', () => {
    const overview = buildProgressOverview('u1', concepts, [], [], NOW);
    expect(overview.mastery.conceptsTracked).toBe(3);
    expect(overview.mastery.conceptsNotEvaluated).toBe(3);
    expect(overview.mastery.conceptsMastered).toBe(0);
    expect(overview.mastery.averageScore).toBe(0);
    expect(overview.gaps).toHaveLength(0);
  });

  it('clasifica dominados, lagunas y sin evaluar', () => {
    const overview = buildProgressOverview(
      'u1',
      concepts,
      [
        evaluation('c1', 0.9, 'correcta'),
        evaluation('c2', 0.2, 'incorrecta'),
        evaluation('c2', 0.3, 'incorrecta'),
      ],
      [],
      NOW,
    );
    expect(overview.mastery.conceptsMastered).toBe(1);
    expect(overview.mastery.conceptsInGap).toBe(1);
    expect(overview.mastery.conceptsNotEvaluated).toBe(1);
    expect(overview.mastery.masteredPercent).toBe(33);
    expect(overview.gaps.map((gap) => gap.conceptId)).toEqual(['c2']);
  });

  it('ordena las lagunas por severidad descendente', () => {
    const overview = buildProgressOverview(
      'u1',
      concepts,
      [
        evaluation('c1', 0.5, 'parcial'),
        evaluation('c2', 0.05, 'incorrecta'),
        evaluation('c2', 0.0, 'sin-respuesta'),
      ],
      [],
      NOW,
    );
    expect(overview.gaps[0]?.conceptId).toBe('c2');
    expect(overview.gaps[0]!.severity).toBeGreaterThan(overview.gaps[1]!.severity);
  });

  it('la media de dominio promedia todas las respuestas', () => {
    const overview = buildProgressOverview(
      'u1',
      concepts,
      [evaluation('c1', 1.0, 'correcta'), evaluation('c2', 0.0, 'incorrecta')],
      [],
      NOW,
    );
    expect(overview.mastery.averageScore).toBeCloseTo(0.5, 5);
  });

  it('recomienda repasar las lagunas en orden de severidad', () => {
    const overview = buildProgressOverview(
      'u1',
      concepts,
      [evaluation('c1', 0.1, 'incorrecta'), evaluation('c2', 0.4, 'parcial')],
      [],
      NOW,
    );
    expect(overview.recommendedReview).toEqual(['c1', 'c2']);
  });

  it('es determinista: misma entrada, misma salida', () => {
    const args = [
      'u1',
      concepts,
      [evaluation('c1', 0.1, 'incorrecta')],
      [review('c1', NOW - DAY)],
      NOW,
    ] as const;
    expect(buildProgressOverview(...args)).toEqual(buildProgressOverview(...args));
  });
});

describe('dueReviews', () => {
  it('devuelve solo los vencidos, los más antiguos primero', () => {
    const states = [review('c1', NOW + DAY), review('c2', NOW - DAY), review('c3', NOW - 2 * DAY)];
    expect(dueReviews(states, NOW).map((state) => state.conceptId)).toEqual(['c3', 'c2']);
  });

  it('un concepto nunca repasado cuenta como pendiente', () => {
    const states = [review('c1', NOW, null)];
    expect(dueReviews(states, NOW)).toHaveLength(1);
  });

  it('empata por identificador para ser determinista', () => {
    const states = [review('cB', NOW - DAY), review('cA', NOW - DAY)];
    expect(dueReviews(states, NOW).map((state) => state.conceptId)).toEqual(['cA', 'cB']);
  });
});

describe('nextActionHint', () => {
  it('sin temario, pide adjuntar', () => {
    const overview = buildProgressOverview('u1', [], [], [], NOW);
    expect(nextActionHint(overview)).toContain('Adjunta');
  });

  it('con todo sin evaluar, propone empezar una sesión', () => {
    const overview = buildProgressOverview('u1', concepts, [], [], NOW);
    expect(nextActionHint(overview)).toContain('sesión guiada');
  });

  it('con lagunas, las pone primero', () => {
    const overview = buildProgressOverview(
      'u1',
      concepts,
      [evaluation('c1', 0.1, 'incorrecta')],
      [],
      NOW,
    );
    expect(nextActionHint(overview)).toContain('lagunas');
  });

  it('con repaso vencido y sin lagunas, avisa del repaso', () => {
    const overview = buildProgressOverview(
      'u1',
      concepts,
      [evaluation('c1', 0.9, 'correcta')],
      [review('c1', NOW - DAY)],
      NOW,
    );
    expect(nextActionHint(overview)).toContain('Repaso pendiente');
  });

  it('sin nada pendiente, felicita', () => {
    const overview = buildProgressOverview(
      'u1',
      concepts,
      [evaluation('c1', 0.9, 'correcta')],
      [review('c1', NOW + DAY)],
      NOW,
    );
    expect(nextActionHint(overview)).toContain('Buen trabajo');
  });
});
