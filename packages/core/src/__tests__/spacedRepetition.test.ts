import type { AnswerEvaluation, AnswerVerdict } from '../domain/types';
import { DEFAULT_SR_CONFIG, initialReviewState, isDue, scheduleReview } from '../mayeu/gaps';

const NOW = 1_700_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

function evaluation(verdict: AnswerVerdict): AnswerEvaluation {
  return {
    questionId: 'q1',
    conceptId: 'c1',
    verdict,
    score: verdict === 'correcta' ? 0.9 : 0.1,
    matchedKeyTerms: [],
    missingKeyTerms: [],
    feedback: '',
  };
}

describe('initialReviewState', () => {
  it('arranca con la facilidad y el intervalo por defecto', () => {
    const state = initialReviewState('c1', NOW);
    expect(state.ease).toBe(DEFAULT_SR_CONFIG.initialEase);
    expect(state.intervalDays).toBe(0);
    expect(state.repetitions).toBe(0);
    expect(state.dueAt).toBe(NOW);
    expect(state.lastReviewedAt).toBeNull();
  });
});

describe('scheduleReview', () => {
  it('la primera respuesta correcta fija el intervalo inicial', () => {
    const state = scheduleReview(initialReviewState('c1', NOW), evaluation('correcta'), NOW);
    expect(state.repetitions).toBe(1);
    expect(state.intervalDays).toBe(DEFAULT_SR_CONFIG.initialIntervalDays);
    expect(state.dueAt).toBe(NOW + DAY);
    expect(state.lastReviewedAt).toBe(NOW);
  });

  it('las respuestas correctas sucesivas amplían el intervalo', () => {
    let state = initialReviewState('c1', NOW);
    state = scheduleReview(state, evaluation('correcta'), NOW);
    const first = state.intervalDays;
    state = scheduleReview(state, evaluation('correcta'), NOW);
    expect(state.repetitions).toBe(2);
    expect(state.intervalDays).toBeGreaterThan(first);
  });

  it('la facilidad se mantiene dentro de los límites', () => {
    let state = initialReviewState('c1', NOW);
    for (let i = 0; i < 50; i += 1) {
      state = scheduleReview(state, evaluation('correcta'), NOW);
    }
    expect(state.ease).toBeLessThanOrEqual(DEFAULT_SR_CONFIG.maxEase);

    let low = initialReviewState('c2', NOW);
    for (let i = 0; i < 50; i += 1) {
      low = scheduleReview(low, evaluation('incorrecta'), NOW);
    }
    expect(low.ease).toBeGreaterThanOrEqual(DEFAULT_SR_CONFIG.minEase);
  });

  it('una respuesta parcial mantiene el intervalo', () => {
    let state = scheduleReview(initialReviewState('c1', NOW), evaluation('correcta'), NOW);
    const interval = state.intervalDays;
    state = scheduleReview(state, evaluation('parcial'), NOW);
    expect(state.intervalDays).toBe(interval);
    expect(state.ease).toBe(DEFAULT_SR_CONFIG.initialEase + DEFAULT_SR_CONFIG.easyBonus);
  });

  it('una respuesta incorrecta reinicia el intervalo', () => {
    let state = initialReviewState('c1', NOW);
    state = scheduleReview(state, evaluation('correcta'), NOW);
    state = scheduleReview(state, evaluation('correcta'), NOW);
    state = scheduleReview(state, evaluation('incorrecta'), NOW);
    expect(state.repetitions).toBe(0);
    expect(state.intervalDays).toBe(DEFAULT_SR_CONFIG.initialIntervalDays);
  });

  it('la falta de respuesta se trata como fallo', () => {
    let state = scheduleReview(initialReviewState('c1', NOW), evaluation('correcta'), NOW);
    state = scheduleReview(state, evaluation('sin-respuesta'), NOW);
    expect(state.repetitions).toBe(0);
  });

  it('nunca programa un intervalo menor que un día', () => {
    let state = initialReviewState('c1', NOW);
    for (const verdict of ['correcta', 'parcial', 'incorrecta', 'sin-respuesta'] as const) {
      state = scheduleReview(state, evaluation(verdict), NOW);
      expect(state.intervalDays).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('isDue', () => {
  it('está vencido en el instante de vencimiento', () => {
    const state = scheduleReview(initialReviewState('c1', NOW), evaluation('correcta'), NOW);
    expect(isDue(state, NOW)).toBe(false);
    expect(isDue(state, NOW + DAY)).toBe(true);
    expect(isDue(state, NOW + DAY - 1)).toBe(false);
    expect(isDue(state, NOW + DAY + 1)).toBe(true);
  });

  it('un concepto nunca repasado vence de inmediato', () => {
    expect(isDue(initialReviewState('c1', NOW), NOW)).toBe(true);
  });
});
