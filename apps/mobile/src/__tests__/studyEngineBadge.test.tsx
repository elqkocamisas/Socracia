import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { StudyScreen } from '../screens/StudyScreen';
import {
  importTemario,
  makeServices,
  NOW,
  submitAnswer,
  typeAnswer,
} from './helpers/appTestHarness';
import type { LlmEngineBundle } from '../services/llmEngine';
import { ok } from '@socracia/core';

/**
 * Motor de modelo cuyo evaluador SIEMPRE falla.
 *
 * Reproduce un proveedor caído (red, cuota o salida inválida) para comprobar
 * que la sesión no se rompe: la heurística responde y la pantalla sigue viva.
 */
function failingEngine(): LlmEngineBundle {
  const provider = {
    id: 'fake',
    model: 'fake',
    complete: async () => ok({ text: '', model: 'fake' }),
  };
  return {
    provider,
    evaluator: {
      id: 'failing-evaluator',
      evaluate: async () => ({ ok: false, error: { code: 'red', message: 'sin conexión' } }),
    },
    generator: { id: 'fake-generator', generate: async () => ok([]) },
    followUp: {
      id: 'fake-followup',
      followUp: async () => ok({ kind: 'orientar' as const, prompt: 'repregunta', hints: [] }),
    },
    explainer: {
      id: 'fake-explainer',
      explain: async () => ok({ text: 'explicación', citations: [] }),
    },
  } as unknown as LlmEngineBundle;
}

/**
 * La pantalla de estudio debe decir quién responde.
 *
 * Sin motor en el build, la insignia muestra «Modo local» y, al pulsarla,
 * explica por qué: nunca una degradación silenciosa. Es el primer eslabón del
 * requisito F1: el motor semántico, cuando está, se ve; cuando no, se explica.
 */
describe('StudyScreen: insignia del motor', () => {
  it('sin motor en el build muestra «Modo local»', async () => {
    const services = makeServices();
    const documentId = await importTemario(services);

    await render(<StudyScreen services={services} documentId={documentId} now={() => NOW} />);

    await waitFor(() => expect(screen.getByText('Modo local')).toBeTruthy());
  });

  it('la insignia explica el motivo de la degradación al pulsarla', async () => {
    const services = makeServices();
    const documentId = await importTemario(services);

    await render(<StudyScreen services={services} documentId={documentId} now={() => NOW} />);
    await waitFor(() => expect(screen.getByText('Modo local')).toBeTruthy());

    fireEvent.press(screen.getByLabelText(/^Motor:/));

    await waitFor(() => expect(screen.getByText(/no incluye el motor semántico/i)).toBeTruthy());
  });

  it('si el proveedor falla, la sesión no se rompe y sigue avanzando', async () => {
    // Sin backend en el build, la insignia es local; lo que se prueba aquí es que
    // un fallo del motor de modelo no deja la pantalla en error: la heurística
    // responde y el recorrido continúa (puerta F2).
    const services = makeServices(undefined, failingEngine());
    const documentId = await importTemario(services);

    await render(<StudyScreen services={services} documentId={documentId} now={() => NOW} />);
    await waitFor(() => expect(screen.getByLabelText('Tu respuesta')).toBeTruthy());

    await typeAnswer('La Administración actúa conforme a la ley.');
    await submitAnswer(1);

    // La sesión sigue viva: no hay pantalla de error y se puede seguir respondiendo.
    expect(screen.queryByText('Reintentar')).toBeNull();
    expect(screen.getByLabelText('Tu respuesta')).toBeTruthy();
  });
});
