import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { StudyScreen } from '../screens/StudyScreen';
import { importTemario, makeServices, NOW } from './helpers/appTestHarness';

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
});
