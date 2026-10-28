import { mergeSnapshots, evaluationKey, reviewKey, hasNewKeys } from '../sync/merge';
import type { ProgressSnapshot } from '../sync/contracts';
import { evaluation, gapProfile, review, session, timed } from './helpers/syncHarness';

const NOW = 1_700_000_000_000;

function snapshot(partial: Partial<ProgressSnapshot>): ProgressSnapshot {
  return {
    userId: 'u1',
    generatedAt: NOW,
    evaluations: [],
    reviewStates: [],
    sessions: [],
    gapProfile: null,
    ...partial,
  };
}

/**
 * La fusión es la pieza crítica de la sincronización: decide si dos
 * dispositivos convergen o se pisan datos. Se prueba como función pura, sin
 * red ni almacenamiento.
 */
describe('mergeSnapshots', () => {
  it('une las evaluaciones de ambos lados sin duplicar', () => {
    const local = snapshot({
      evaluations: [timed(NOW, evaluation('q1', 'c1', 0.9))],
    });
    const remote = snapshot({
      evaluations: [
        timed(NOW + 1, evaluation('q2', 'c1', 0.4)),
        // Misma evaluación ya presente en local: no debe duplicarse.
        timed(NOW + 1, evaluation('q1', 'c1', 0.9)),
      ],
    });

    const merged = mergeSnapshots(local, remote);

    expect(merged.evaluations.map((item) => item.value.questionId)).toEqual(['q1', 'q2']);
  });

  it('es idempotente: fusionar dos veces no cambia el resultado', () => {
    const local = snapshot({ evaluations: [timed(NOW, evaluation('q1', 'c1', 0.9))] });
    const remote = snapshot({ evaluations: [timed(NOW, evaluation('q2', 'c1', 0.5))] });

    const once = mergeSnapshots(local, remote);
    const twice = mergeSnapshots(once, remote);

    expect(twice.evaluations).toHaveLength(once.evaluations.length);
    expect(twice.evaluations.map((item) => evaluationKey(item.value))).toEqual(
      once.evaluations.map((item) => evaluationKey(item.value)),
    );
  });

  it('es conmutativa: el mismo par converge al mismo conjunto', () => {
    const a = snapshot({
      evaluations: [timed(NOW, evaluation('q1', 'c1', 0.9))],
      sessions: [timed(NOW, session('s1', NOW, null))],
    });
    const b = snapshot({
      evaluations: [timed(NOW, evaluation('q2', 'c1', 0.3))],
      sessions: [timed(NOW, session('s2', NOW, null))],
    });

    const ab = mergeSnapshots(a, b);
    const ba = mergeSnapshots(b, a);

    expect(ab.evaluations.map((item) => evaluationKey(item.value))).toEqual(
      ba.evaluations.map((item) => evaluationKey(item.value)),
    );
    expect(ab.sessions.map((item) => item.value.id)).toEqual(
      ba.sessions.map((item) => item.value.id),
    );
  });

  it('gana el estado de repaso más reciente', () => {
    const local = snapshot({
      reviewStates: [timed(NOW, review('c1', NOW + 1, NOW))],
    });
    const remote = snapshot({
      reviewStates: [timed(NOW + 500, review('c1', NOW + 9, NOW + 500))],
    });

    const merged = mergeSnapshots(local, remote);

    expect(merged.reviewStates).toHaveLength(1);
    expect(merged.reviewStates[0]?.value.dueAt).toBe(NOW + 9);
  });

  it('conserva el estado de repaso local si es más reciente', () => {
    const local = snapshot({ reviewStates: [timed(NOW + 900, review('c1', NOW + 9, NOW + 900))] });
    const remote = snapshot({ reviewStates: [timed(NOW, review('c1', NOW + 1, NOW))] });

    const merged = mergeSnapshots(local, remote);

    expect(merged.reviewStates[0]?.value.dueAt).toBe(NOW + 9);
  });

  it('gana el perfil de lagunas más reciente', () => {
    const local = snapshot({ gapProfile: timed(NOW, gapProfile('u1', NOW)) });
    const remote = snapshot({ gapProfile: timed(NOW + 10, gapProfile('u1', NOW + 10)) });

    const merged = mergeSnapshots(local, remote);

    expect(merged.gapProfile?.updatedAt).toBe(NOW + 10);
  });

  it('adopta el perfil remoto cuando el local no tiene ninguno', () => {
    const local = snapshot({ gapProfile: null });
    const remote = snapshot({ gapProfile: timed(NOW, gapProfile('u1', NOW)) });

    expect(mergeSnapshots(local, remote).gapProfile).not.toBeNull();
  });

  it('no inventa datos cuando ambos lados están vacíos', () => {
    const merged = mergeSnapshots(snapshot({}), snapshot({}));

    expect(merged.evaluations).toHaveLength(0);
    expect(merged.reviewStates).toHaveLength(0);
    expect(merged.sessions).toHaveLength(0);
    expect(merged.gapProfile).toBeNull();
  });
});

describe('hasNewKeys', () => {
  it('detecta claves ausentes en local', () => {
    const local = [timed(NOW, evaluation('q1', 'c1', 0.9))];
    const merged = [
      timed(NOW, evaluation('q1', 'c1', 0.9)),
      timed(NOW, evaluation('q2', 'c1', 0.2)),
    ];

    expect(hasNewKeys(local, merged, evaluationKey)).toBe(true);
    expect(hasNewKeys(merged, local, evaluationKey)).toBe(false);
  });

  it('reviewKey es el identificador de concepto', () => {
    expect(reviewKey(review('c7', NOW, NOW))).toBe('c7');
  });
});
