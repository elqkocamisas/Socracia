import type { AnswerEvaluation, Concept } from '../domain/types';
import {
  DEFAULT_SR_CONFIG,
  detectGaps,
  initialReviewState,
  isDue,
  scheduleReview,
} from '../mayeu/gaps';

const concepts: Concept[] = [
  { id: 'c1', topicId: 't1', label: 'legalidad', definition: '', keywords: [] },
  { id: 'c2', topicId: 't1', label: 'jerarquía normativa', definition: '', keywords: [] },
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
    missingKeyTerms: verdict === 'correcta' ? [] : ['clave'],
    feedback: '',
  };
}

const NOW = 1_700_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

describe('detectGaps', () => {
  it('no reporta laguna para conceptos dominados', () => {
    const profile = detectGaps('u1', concepts, [evaluation('c1', 0.9, 'correcta')], NOW);
    expect(profile.gaps).toHaveLength(0);
    expect(profile.recommendedReview).toEqual([]);
  });

  it('reporta laguna para conceptos con dominio bajo', () => {
    const profile = detectGaps('u1', concepts, [evaluation('c2', 0.2, 'incorrecta')], NOW);
    expect(profile.gaps).toHaveLength(1);
    expect(profile.gaps[0]?.conceptId).toBe('c2');
    expect(profile.gaps[0]?.conceptLabel).toBe('jerarquía normativa');
    expect(profile.gaps[0]?.rationale).toContain('20%');
  });

  it('ordena las lagunas por severidad descendente', () => {
    const profile = detectGaps(
      'u1',
      concepts,
      [evaluation('c1', 0.5, 'parcial'), evaluation('c2', 0.1, 'incorrecta')],
      NOW,
    );
    expect(profile.gaps[0]?.conceptId).toBe('c2');
    expect(profile.recommendedReview[0]).toBe('c2');
  });

  it('sube la severidad con fallos repetidos', () => {
    const once = detectGaps('u1', concepts, [evaluation('c1', 0.4, 'parcial')], NOW);
    const twice = detectGaps(
      'u1',
      concepts,
      [evaluation('c1', 0.4, 'parcial'), evaluation('c1', 0.4, 'parcial')],
      NOW,
    );
    expect(twice.gaps[0]?.severity).toBeGreaterThanOrEqual(once.gaps[0]?.severity ?? 0);
    expect(twice.gaps[0]?.attempts).toBe(2);
  });

  it('ignora evaluaciones de conceptos desconocidos', () => {
    const profile = detectGaps('u1', concepts, [evaluation('zzz', 0.0, 'incorrecta')], NOW);
    expect(profile.gaps).toEqual([]);
  });

  it('es determinista', () => {
    const evaluations = [evaluation('c1', 0.2, 'incorrecta')];
    expect(detectGaps('u1', concepts, evaluations, NOW)).toEqual(
      detectGaps('u1', concepts, evaluations, NOW),
    );
  });
});

describe('spaced repetition', () => {
  it('el estado inicial vence de inmediato', () => {
    const state = initialReviewState('c1', NOW);
    expect(isDue(state, NOW)).toBe(true);
    expect(state.repetitions).toBe(0);
  });

  it('una respuesta correcta aumenta el intervalo', () => {
    const state = initialReviewState('c1', NOW);
    const next = scheduleReview(state, evaluation('c1', 0.9, 'correcta'), NOW);
    expect(next.repetitions).toBe(1);
    expect(next.intervalDays).toBe(DEFAULT_SR_CONFIG.initialIntervalDays);
    expect(next.dueAt).toBe(NOW + DAY);
    expect(isDue(next, NOW)).toBe(false);
  });

  it('una segunda respuesta correcta multiplica el intervalo', () => {
    const first = scheduleReview(
      initialReviewState('c1', NOW),
      evaluation('c1', 0.9, 'correcta'),
      NOW,
    );
    const second = scheduleReview(first, evaluation('c1', 0.9, 'correcta'), NOW);
    expect(second.repetitions).toBe(2);
    expect(second.intervalDays).toBeGreaterThan(first.intervalDays);
  });

  it('una respuesta incorrecta reinicia el intervalo', () => {
    const first = scheduleReview(
      initialReviewState('c1', NOW),
      evaluation('c1', 0.9, 'correcta'),
      NOW,
    );
    const reset = scheduleReview(first, evaluation('c1', 0.0, 'incorrecta'), NOW);
    expect(reset.repetitions).toBe(0);
    expect(reset.intervalDays).toBe(DEFAULT_SR_CONFIG.initialIntervalDays);
  });

  it('una respuesta parcial mantiene el intervalo y reprograma', () => {
    const state = initialReviewState('c1', NOW);
    const next = scheduleReview(state, evaluation('c1', 0.4, 'parcial'), NOW);
    expect(next.repetitions).toBe(0);
    expect(next.dueAt).toBeGreaterThan(NOW);
  });

  it('la facilidad permanece acotada', () => {
    let state = initialReviewState('c1', NOW);
    for (let i = 0; i < 20; i += 1) {
      state = scheduleReview(state, evaluation('c1', 1, 'correcta'), NOW);
    }
    expect(state.ease).toBeLessThanOrEqual(DEFAULT_SR_CONFIG.maxEase);

    let hard = initialReviewState('c1', NOW);
    for (let i = 0; i < 20; i += 1) {
      hard = scheduleReview(hard, evaluation('c1', 0, 'incorrecta'), NOW);
    }
    expect(hard.ease).toBeGreaterThanOrEqual(DEFAULT_SR_CONFIG.minEase);
  });
});
