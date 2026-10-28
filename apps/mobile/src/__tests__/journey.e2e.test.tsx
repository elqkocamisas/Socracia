import { useState } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { View } from 'react-native';

import type { AppServices } from '../services/appServices';
import { ImportScreen } from '../screens/ImportScreen';
import { ProgressScreen } from '../screens/ProgressScreen';
import { StudyScreen } from '../screens/StudyScreen';
import { importTemario, makeServices, typeAnswer, NOW } from './helpers/appTestHarness';

type Route =
  | { readonly name: 'biblioteca' }
  | { readonly name: 'estudio'; readonly documentId: string }
  | { readonly name: 'progreso' };

/**
 * Router mínimo de prueba con la misma máquina de estados que `App.tsx`.
 *
 * Se monta una sola vez para todo el recorrido: así el test reproduce el flujo
 * real del usuario sin desmontar pantallas con efectos asíncronos pendientes,
 * que es lo que ocurriría al renderizar y desmontar cada pantalla por separado.
 */
function TestRouter({ services }: { readonly services: AppServices }): React.JSX.Element {
  const [route, setRoute] = useState<Route>({ name: 'biblioteca' });
  return (
    <View>
      {route.name === 'biblioteca' ? (
        <ImportScreen
          services={services}
          now={() => NOW}
          onStudy={(documentId) => setRoute({ name: 'estudio', documentId })}
        />
      ) : null}
      {route.name === 'estudio' ? (
        <StudyScreen
          services={services}
          documentId={route.documentId}
          now={() => NOW}
          onFinish={() => setRoute({ name: 'progreso' })}
        />
      ) : null}
      {route.name === 'progreso' ? (
        <ProgressScreen
          services={services}
          now={() => NOW}
          onBack={() => setRoute({ name: 'biblioteca' })}
        />
      ) : null}
    </View>
  );
}

describe('Recorrido completo del usuario', () => {
  it('biblioteca → sesión guiada → progreso sin errores bloqueantes', async () => {
    const services = makeServices();
    await importTemario(services);

    await render(<TestRouter services={services} />);

    // 1. Biblioteca: el documento importado está disponible para estudiar.
    await waitFor(() => expect(screen.getByText('temario')).toBeTruthy());
    fireEvent.press(screen.getByText('Estudiar'));

    // 2. Sesión guiada: se responde hasta agotar el itinerario.
    await waitFor(() => expect(screen.getByLabelText('Tu respuesta')).toBeTruthy());
    let guard = 0;
    while (screen.queryByLabelText('Tu respuesta') !== null && guard < 40) {
      await typeAnswer(
        'El acto administrativo es una declaración unilateral de la Administración.',
      );
      // La etiqueta depende del turno anterior: se elige la que exista.
      const submit =
        screen.queryByText('Responder de nuevo') ?? screen.getByText('Enviar respuesta');
      fireEvent.press(submit);
      await waitFor(() => expect(screen.queryByText(/^\d+ \/ \d+ respuestas$/)).toBeTruthy());
      guard += 1;
    }
    await waitFor(() => expect(screen.getByText('Sesión completada')).toBeTruthy());

    // 3. Progreso: el botón de cierre lleva a la vista de progreso.
    fireEvent.press(screen.getByText('Ver progreso'));
    await waitFor(() => expect(screen.getByText('Tu progreso')).toBeTruthy());
    expect(screen.getByText('Dominio')).toBeTruthy();
  });

  it('el progreso persiste entre sesiones del mismo usuario', async () => {
    const services = makeServices();
    await importTemario(services);

    const first = await render(<TestRouter services={services} />);
    await waitFor(() => expect(screen.getByText('temario')).toBeTruthy());
    fireEvent.press(screen.getByText('Estudiar'));
    await waitFor(() => expect(screen.getByLabelText('Tu respuesta')).toBeTruthy());
    await typeAnswer('Una declaración unilateral de la Administración.');
    fireEvent.press(screen.getByText('Enviar respuesta'));
    await waitFor(() => expect(screen.getByText(/^1 \/ \d+ respuestas$/)).toBeTruthy());
    first.unmount();

    // Una sesión nueva ve el historial previo y no muestra el estado vacío.
    await render(<ProgressScreen services={services} now={() => NOW + 1000} />);
    await waitFor(() => expect(screen.getByText('Tu progreso')).toBeTruthy());
    expect(screen.queryByText('Aún sin temario')).toBeNull();
  });
});
