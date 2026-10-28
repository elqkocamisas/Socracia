/**
 * @jest-environment node
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';

import { inMemoryStorage, type StoragePort } from '@socracia/core';
import { AccountScreen } from '../screens/AccountScreen';
import { AccountService } from '../services/accountService';
import { InMemoryCredentialStore } from '../services/credentialStore';
import { HttpSyncClient } from '../services/httpSyncClient';
import { createServices, LOCAL_USER_ID, type AppServices } from '../services/appServices';
import { TEMARIO, NOW, importTemario } from './helpers/appTestHarness';
import { startFakeApi, type FakeApi } from './helpers/fakeApi';
import { nodeFetch } from './helpers/nodeFetch';

/**
 * Recorrido de cuenta extremo a extremo: dos dispositivos sobre un backend real.
 *
 * El valor de esta prueba está en que el segundo «dispositivo» es un almacén
 * vacío: si el progreso aparece ahí, es porque viajó de verdad por HTTP y no
 * porque estuviera ya en local.
 */
const encoder = new TextEncoder();

/** Servicios de un dispositivo con cuenta, sobre un almacén dado. */
function deviceWithAccount(
  storage: StoragePort,
  api: FakeApi,
): { services: AppServices; account: AccountService } {
  const base = createServices({
    storage,
    picker: { pick: async () => null },
    reader: { read: async () => ({ ok: true as const, value: encoder.encode(TEMARIO) }) },
  });
  const account = new AccountService(
    new HttpSyncClient({ baseUrl: api.baseUrl, fetchImpl: nodeFetch }),
    new InMemoryCredentialStore(),
    storage,
    LOCAL_USER_ID,
  );
  return { services: { ...base, account }, account };
}

/** Rellena un campo de texto y espera a que React aplique el valor. */
async function typeInto(label: string, text: string): Promise<void> {
  fireEvent.changeText(screen.getByLabelText(label), text);
  await waitFor(() => expect(screen.getByLabelText(label).props.value).toBe(text));
}

/**
 * Rellena las credenciales, pulsa el botón y espera al aviso final.
 *
 * El alta emite varias actualizaciones de estado (formulario, sesión y aviso);
 * esperar solo a «Sesión activa» dejaría las últimas fuera de `act`.
 */
async function submitCredentials(button: string): Promise<void> {
  await typeInto('Correo electrónico', 'opositora@example.com');
  await typeInto('Contraseña', 'contrasena-larga-1');
  // Se espera al aviso final (última actualización asíncrona del alta) en vez
  // de solo a «Sesión activa».
  fireEvent.press(screen.getByText(button));
  await waitFor(() =>
    expect(screen.getByText('Sesión iniciada. Tu progreso está sincronizado.')).toBeTruthy(),
  );
}

describe('Recorrido de cuenta y sincronización entre dispositivos', () => {
  let api: FakeApi;

  beforeEach(async () => {
    api = await startFakeApi();
  });

  afterEach(async () => {
    await api.close();
  });

  it('estudia en un dispositivo y recupera el progreso en otro', async () => {
    // --- Dispositivo A: estudia sin cuenta y luego crea una. ---
    const storageA = inMemoryStorage();
    const deviceA = deviceWithAccount(storageA, api);
    const documentId = await importTemario(deviceA.services);

    const beforeA = await storageA.progress.listEvaluations(LOCAL_USER_ID);
    expect(beforeA.length).toBe(0);

    // Genera progreso respondiendo una pregunta de verdad, sin cuenta.
    const started = await deviceA.services.session.start(documentId, NOW, 'sess-a');
    expect(started.ok).toBe(true);
    const answered = await deviceA.services.session.answer(
      'Una declaración unilateral de la Administración sujeta al derecho administrativo.',
      1200,
      NOW,
    );
    expect(answered.ok).toBe(true);
    expect((await storageA.progress.listEvaluations(LOCAL_USER_ID)).length).toBeGreaterThan(0);

    // Crea la cuenta desde la pantalla: el alta sincroniza el progreso local.
    await render(<AccountScreen services={deviceA.services} now={() => NOW} />);
    await waitFor(() => expect(screen.getByText('Iniciar sesión o crear cuenta')).toBeTruthy());
    await submitCredentials('Crear cuenta');
    expect(screen.getByText('Sesión activa')).toBeTruthy();

    const remoteA = api.stored('user-opositora@example.com');
    expect(remoteA).not.toBeNull();
    expect(remoteA!.evaluations.length).toBeGreaterThan(0);

    // --- Dispositivo B: almacén vacío, misma cuenta, otro identificador. ---
    const storageB = inMemoryStorage();
    const deviceB = deviceWithAccount(storageB, api);
    // Sin progreso local: el estado vacío se ve antes de sincronizar.
    const beforeB = await storageB.progress.listEvaluations(LOCAL_USER_ID);
    expect(beforeB.length).toBe(0);

    await render(<AccountScreen services={deviceB.services} now={() => NOW} />);
    await waitFor(() => expect(screen.getByText('Iniciar sesión o crear cuenta')).toBeTruthy());
    await submitCredentials('Iniciar sesión');
    expect(screen.getByText('Sesión activa')).toBeTruthy();

    // El progreso llegó por la red: el almacén local de B ya no está vacío.
    await waitFor(async () => {
      const afterB = await storageB.progress.listEvaluations(LOCAL_USER_ID);
      expect(afterB.length).toBeGreaterThan(0);
    });
  });

  it('sin cuenta la app sigue siendo utilizable y no envía nada', async () => {
    const storage = inMemoryStorage();
    const { services } = deviceWithAccount(storage, api);
    await importTemario(services);

    await render(<AccountScreen services={services} now={() => NOW} />);
    await waitFor(() => expect(screen.getByText('Iniciar sesión o crear cuenta')).toBeTruthy());

    // No hay sesión y el servidor no ha recibido nada.
    expect(api.stored('user-opositora@example.com')).toBeNull();
    // Y el progreso local sigue disponible.
    const progress = await storage.progress.listEvaluations('local-user');
    expect(progress).toEqual([]);
  });

  it('un error de credenciales se muestra sin romper la pantalla', async () => {
    const storage = inMemoryStorage();
    const { services } = deviceWithAccount(storage, api);
    await render(<AccountScreen services={services} now={() => NOW} />);
    await waitFor(() => expect(screen.getByText('Iniciar sesión o crear cuenta')).toBeTruthy());

    await typeInto('Correo electrónico', 'nadie@example.com');
    await typeInto('Contraseña', 'contrasena-larga-1');
    fireEvent.press(screen.getByText('Iniciar sesión'));

    // La pantalla sigue en pie y vuelve al formulario con un aviso.
    await waitFor(() => expect(screen.getByText('Iniciar sesión o crear cuenta')).toBeTruthy());
    expect(screen.queryByText('Sesión activa')).toBeNull();
  });

  it('cerrar sesión no borra el progreso del dispositivo', async () => {
    const storage = inMemoryStorage();
    const { services } = deviceWithAccount(storage, api);
    const documentId = await importTemario(services);

    const started = await services.session.start(documentId, NOW, 'sess-a');
    expect(started.ok).toBe(true);
    await services.session.answer('Una declaración unilateral de la Administración.', 900, NOW);

    await render(<AccountScreen services={services} now={() => NOW} />);
    await submitCredentials('Crear cuenta');
    expect(screen.getByText('Sesión activa')).toBeTruthy();

    fireEvent.press(screen.getByText('Cerrar sesión'));
    // El cierre de sesión emite dos actualizaciones de estado (formulario y
    // aviso); se espera al aviso para cubrir ambas dentro de `act`.
    await waitFor(() =>
      expect(
        screen.getByText('Sesión cerrada. Tu progreso sigue en este dispositivo.'),
      ).toBeTruthy(),
    );
    expect(screen.getByText('Iniciar sesión o crear cuenta')).toBeTruthy();

    // El progreso local sigue ahí: cerrar sesión no es borrar datos.
    const after = await storage.progress.listEvaluations(LOCAL_USER_ID);
    expect(after.length).toBeGreaterThan(0);
  });
});
