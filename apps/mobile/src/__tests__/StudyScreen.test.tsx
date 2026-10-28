import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';

import { StudyScreen } from '../screens/StudyScreen';
import {
  importTemario,
  makeServices,
  submitAnswer,
  typeAnswer,
  NOW,
} from './helpers/appTestHarness';

describe('StudyScreen', () => {
  it('muestra la pregunta con su fuente documental', async () => {
    const services = makeServices();
    const documentId = await importTemario(services);

    await render(<StudyScreen services={services} documentId={documentId} now={() => NOW} />);

    await waitFor(() => expect(screen.getByText('Pregunta')).toBeTruthy());
    expect(screen.getByText(/^Fuente:/)).toBeTruthy();
    expect(screen.getByLabelText('Tu respuesta')).toBeTruthy();
    expect(screen.getByText(/^0 \/ \d+ respuestas$/)).toBeTruthy();
  });

  it('envía una respuesta y avanza el contador', async () => {
    const services = makeServices();
    const documentId = await importTemario(services);

    await render(<StudyScreen services={services} documentId={documentId} now={() => NOW} />);
    await waitFor(() => expect(screen.getByLabelText('Tu respuesta')).toBeTruthy());

    await typeAnswer('Es una declaración unilateral de la Administración.');
    await submitAnswer(1);
  });

  it('con una respuesta vacía no permite enviar', async () => {
    const services = makeServices();
    const documentId = await importTemario(services);

    await render(<StudyScreen services={services} documentId={documentId} now={() => NOW} />);
    await waitFor(() => expect(screen.getByText('Enviar respuesta')).toBeTruthy());

    fireEvent.press(screen.getByText('Enviar respuesta'));

    expect(screen.getByText(/^0 \/ \d+ respuestas$/)).toBeTruthy();
  });

  it('muestra el andamiaje tras una respuesta insuficiente', async () => {
    const services = makeServices();
    const documentId = await importTemario(services);

    await render(<StudyScreen services={services} documentId={documentId} now={() => NOW} />);
    await waitFor(() => expect(screen.getByLabelText('Tu respuesta')).toBeTruthy());

    await typeAnswer('no lo sé');
    await submitAnswer(1);

    expect(screen.getByText('Pista para pensar')).toBeTruthy();
    expect(screen.getByText('Responder de nuevo')).toBeTruthy();
  });

  it('muestra un error claro si el documento no tiene temario', async () => {
    const services = makeServices();

    await render(<StudyScreen services={services} documentId="doc-inexistente" now={() => NOW} />);

    await waitFor(() => expect(screen.getByText(/no tiene temario procesado/i)).toBeTruthy());
    expect(screen.getByText('Reintentar')).toBeTruthy();
  });
});
