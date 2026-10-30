import { EVAL_CASES } from '../__evals__/dataset';
import { runEvals, type EvalOutcome } from '../__evals__/runner';

/**
 * La suite de evaluación corre con el resto de pruebas: es el mismo criterio de
 * «verde o rojo», aplicado a la robustez del motor ante un modelo real.
 */
describe('evals del motor mayéutico', () => {
  let outcomes: EvalOutcome[];

  beforeAll(async () => {
    outcomes = await runEvals();
  });

  it('el conjunto cubre las cinco categorías', () => {
    const categories = new Set(EVAL_CASES.map((testCase) => testCase.category));
    expect(categories).toEqual(
      new Set(['evaluacion', 'generacion', 'seguimiento', 'explicacion', 'degradacion']),
    );
    expect(EVAL_CASES.length).toBeGreaterThanOrEqual(30);
  });

  it('ningún identificador está repetido', () => {
    const ids = EVAL_CASES.map((testCase) => testCase.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('todo caso produce el comportamiento esperado', () => {
    const byCategory = new Map<string, { total: number; ok: number }>();
    for (const outcome of outcomes) {
      const entry = byCategory.get(outcome.category) ?? { total: 0, ok: 0 };
      entry.total += 1;
      entry.ok += outcome.passed ? 1 : 0;
      byCategory.set(outcome.category, entry);
    }
    // Informe por categoría: es el artefacto que se revisa al ajustar prompts.
    const report = [...byCategory.entries()]
      .map(([category, { total, ok }]) => `${category}: ${ok}/${total}`)
      .join(', ');
    process.stdout.write(
      `evals del motor — ${outcomes.filter((o) => o.passed).length}/${outcomes.length} (${report})\n`,
    );

    const failed = outcomes.filter((outcome) => !outcome.passed);
    // El detalle se incluye en el mensaje para no tener que reproducir el fallo.
    expect(
      failed.map(
        (outcome) =>
          `${outcome.id} (${outcome.description}): esperado ${outcome.expected}, fue ${outcome.actual} — ${outcome.detail}`,
      ),
    ).toEqual([]);
  });
});
