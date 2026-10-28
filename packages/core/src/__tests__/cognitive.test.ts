import { COGNITIVE_ORDER, isAtLeast, levelRank } from '../mayeu/cognitive';

describe('cognitive', () => {
  it('ordena los niveles de menor a mayor exigencia', () => {
    expect(COGNITIVE_ORDER[0]).toBe('recordar');
    expect(COGNITIVE_ORDER[COGNITIVE_ORDER.length - 1]).toBe('evaluar');
  });

  it('asigna rangos crecientes', () => {
    expect(levelRank('recordar')).toBeLessThan(levelRank('comprender'));
    expect(levelRank('comprender')).toBeLessThan(levelRank('analizar'));
    expect(levelRank('analizar')).toBeLessThan(levelRank('evaluar'));
  });

  it('isAtLeast compara correctamente', () => {
    expect(isAtLeast('comprender', 'recordar')).toBe(true);
    expect(isAtLeast('recordar', 'comprender')).toBe(false);
    expect(isAtLeast('comprender', 'comprender')).toBe(true);
  });
});
