import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';

import { LegalScreen } from '../screens/LegalScreen';

/**
 * La política de privacidad debe ser legible desde dentro de la app y sin
 * conexión, que es lo que exige App Store. La prueba renderiza el documento
 * real generado desde `docs/`, no un texto de ejemplo.
 */
describe('LegalScreen', () => {
  it('muestra la política de privacidad con su contenido', async () => {
    await render(<LegalScreen documentId="privacidad" onBack={() => undefined} />);

    await waitFor(() =>
      expect(screen.getByText('Política de privacidad de Socracia')).toBeTruthy(),
    );
    expect(screen.getByText(/nunca salen de su dispositivo/i)).toBeTruthy();
  });

  it('muestra los términos de uso', async () => {
    await render(<LegalScreen documentId="terminos" onBack={() => undefined} />);

    await waitFor(() => expect(screen.getByText('Términos de uso de Socracia')).toBeTruthy());
    expect(screen.getByText(/autoaprendizaje/i)).toBeTruthy();
  });

  it('no muestra las notas internas dirigidas al desarrollador', async () => {
    await render(<LegalScreen documentId="privacidad" onBack={() => undefined} />);
    await waitFor(() =>
      expect(screen.getByText('Política de privacidad de Socracia')).toBeTruthy(),
    );

    expect(screen.queryByText(/Sustituya la dirección de contacto/i)).toBeNull();
  });

  it('llama a onBack al volver', async () => {
    let back = false;
    await render(<LegalScreen documentId="privacidad" onBack={() => (back = true)} />);
    await waitFor(() => expect(screen.getByText('Volver')).toBeTruthy());

    fireEvent.press(screen.getByLabelText('Volver'));
    expect(back).toBe(true);
  });

  it('avisa en lugar de romperse si el documento no existe', async () => {
    await render(<LegalScreen documentId="inexistente" onBack={() => undefined} />);

    await waitFor(() => expect(screen.getByText('Documento no disponible')).toBeTruthy());
    expect(screen.getByText(/«inexistente»/)).toBeTruthy();
  });
});
