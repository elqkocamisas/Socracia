import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';

import { ProgressScreen } from '../screens/ProgressScreen';
import { StudyScreen } from '../screens/StudyScreen';
import {
  importTemario,
  makeServices,
  submitAnswer,
  typeAnswer,
  NOW,
} from './helpers/appTestHarness';

describe('ProgressScreen', () => {
  it('invita a adjuntar temario cuando no hay conceptos', async () => {
    const services = makeServices();
    await render(<ProgressScreen services={services} now={() => NOW} />);

    await waitFor(() => expect(screen.getByText('Aún sin temario')).toBeTruthy());
    expect(screen.getByText(/Adjunta un documento/i)).toBeTruthy();
  });

  it('muestra el dominio y las secciones tras responder', async () => {
    const services = makeServices();
    const documentId = await importTemario(services);

    await render(<StudyScreen services={services} documentId={documentId} now={() => NOW} />);
    await waitFor(() => expect(screen.getByLabelText('Tu respuesta')).toBeTruthy());
    await typeAnswer('Una declaración unilateral de la Administración.');
    await submitAnswer(1);

    await render(<ProgressScreen services={services} now={() => NOW} />);

    await waitFor(() => expect(screen.getByText('Tu progreso')).toBeTruthy());
    expect(screen.getByText('Dominio')).toBeTruthy();
    expect(screen.getByText('Lagunas detectadas')).toBeTruthy();
    expect(screen.getByText('Repaso pendiente')).toBeTruthy();
  });

  it('el repaso pendiente muestra el nombre del concepto, no su identificador', async () => {
    const services = makeServices();
    const documentId = await importTemario(services);

    await render(<StudyScreen services={services} documentId={documentId} now={() => NOW} />);
    await waitFor(() => expect(screen.getByLabelText('Tu respuesta')).toBeTruthy());
    await typeAnswer('Una declaración unilateral de la Administración.');
    await submitAnswer(1);

    await render(<ProgressScreen services={services} now={() => NOW} />);
    await waitFor(() => expect(screen.getByText('Repaso pendiente')).toBeTruthy());

    // El progreso persistido guarda identificadores por concepto; la pantalla
    // debe resolver el nombre legible y no pintar «t1:c1».
    const reviews = await services.storage.progress.listReviewStates('local-user');
    expect(reviews.length).toBeGreaterThan(0);
    for (const state of reviews) {
      expect(screen.queryByText(state.conceptId)).toBeNull();
    }
  });

  it('el botón de volver está disponible para seguir importando', async () => {
    const services = makeServices();
    let wentBack = false;
    await render(
      <ProgressScreen services={services} now={() => NOW} onBack={() => (wentBack = true)} />,
    );

    await waitFor(() => expect(screen.getByText('Adjuntar temario')).toBeTruthy());
    fireEvent.press(screen.getByText('Adjuntar temario'));
    expect(wentBack).toBe(true);
  });
});
