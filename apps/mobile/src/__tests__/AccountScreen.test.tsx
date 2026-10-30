import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';

import { AccountScreen } from '../screens/AccountScreen';
import { AccountService } from '../services/accountService';
import { InMemoryCredentialStore } from '../services/credentialStore';
import { HttpSyncClient } from '../services/httpSyncClient';
import { inMemoryStorage } from '@socracia/core';
import { makeServices } from './helpers/appTestHarness';
import { startFakeApi, type FakeApi } from './helpers/fakeApi';
import { nodeFetch } from './helpers/nodeFetch';

/**
 * Pantalla de cuenta contra un backend efímero real.
 *
 * Comprueba el recorrido que ve el usuario: crear cuenta, ver la sesión y
 * sincronizar. La app debe seguir siendo usable sin cuenta.
 */
describe('AccountScreen', () => {
  let api: FakeApi;

  beforeEach(async () => {
    api = await startFakeApi();
  });

  afterEach(async () => {
    await api.close();
  });

  function servicesWithAccount() {
    const services = makeServices(inMemoryStorage());
    const account = new AccountService(
      new HttpSyncClient({ baseUrl: api.baseUrl, fetchImpl: nodeFetch }),
      new InMemoryCredentialStore(),
      services.storage,
      'local-user',
    );
    return { ...services, account };
  }

  /**
   * Rellena un campo y espera a que el estado se aplique.
   *
   * En React 19, `fireEvent.changeText` no actualiza `props.value` de forma
   * síncrona; pulsar antes leería el borrador vacío.
   */
  async function fill(label: string, text: string): Promise<void> {
    fireEvent.changeText(screen.getByLabelText(label), text);
    await waitFor(() => expect(screen.getByLabelText(label).props.value).toBe(text));
  }

  it('muestra el formulario cuando no hay sesión', async () => {
    await render(<AccountScreen services={servicesWithAccount()} now={() => 1000} />);

    await waitFor(() => expect(screen.getByText('Iniciar sesión o crear cuenta')).toBeTruthy());
    expect(screen.getByLabelText('Correo electrónico')).toBeTruthy();
    expect(screen.getByLabelText('Contraseña')).toBeTruthy();
  });

  it('crea una cuenta, muestra la sesión y confirma la sincronización', async () => {
    await render(<AccountScreen services={servicesWithAccount()} now={() => 1000} />);
    await waitFor(() => expect(screen.getByText('Iniciar sesión o crear cuenta')).toBeTruthy());

    await fill('Correo electrónico', 'ana@ejemplo.com');
    await fill('Contraseña', 'contrasena-larga');
    fireEvent.press(screen.getByText('Crear cuenta'));

    await waitFor(() => expect(screen.getByText('Sesión activa')).toBeTruthy());
    expect(screen.getByText('ana@ejemplo.com')).toBeTruthy();
    expect(screen.getByText(/sincronizado/i)).toBeTruthy();
  });

  it('muestra el error del servidor sin perder el formulario', async () => {
    await render(<AccountScreen services={servicesWithAccount()} now={() => 1000} />);
    await waitFor(() => expect(screen.getByText('Iniciar sesión o crear cuenta')).toBeTruthy());

    await fill('Correo electrónico', 'sin-arroba');
    await fill('Contraseña', 'corta');
    fireEvent.press(screen.getByText('Crear cuenta'));

    await waitFor(() => expect(screen.getByText(/inválidos/i)).toBeTruthy());
    expect(screen.getByText('Iniciar sesión o crear cuenta')).toBeTruthy();
  });

  it('explica el envío condicionado de fragmentos para el procesamiento semántico', async () => {
    await render(<AccountScreen services={servicesWithAccount()} now={() => 1000} />);

    await waitFor(() => expect(screen.getByText('Qué se sincroniza')).toBeTruthy());
    expect(screen.getByText(/a Gemini API/i)).toBeTruthy();
    expect(screen.getByText(/mejorar sus productos/i)).toBeTruthy();
    expect(screen.getByText(/el documento completo no se envía/i)).toBeTruthy();
  });
});
