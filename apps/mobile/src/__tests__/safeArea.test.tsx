import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import type { ReactNode } from 'react';

/**
 * La geometría del sistema (insets) no existe en Node y el `SafeAreaProvider`
 * real no pinta a sus hijos sin medición nativa, así que aquí se sustituye el
 * módulo por una versión mínima. Es el único doble de la prueba: fija el
 * contrato de la app (relleno por insets), no imita SQL ni red.
 */
const mockInsets = { top: 24, bottom: 48, left: 0, right: 0 };
jest.mock('react-native-safe-area-context', () => {
  const React = jest.requireActual('react');
  const passthrough = ({ children }: { children: ReactNode }): ReactNode =>
    React.createElement(React.Fragment, null, children);
  return {
    SafeAreaProvider: passthrough,
    SafeAreaView: passthrough,
    useSafeAreaInsets: () => mockInsets,
  };
});

import App from '../../App';

/** Aplana el estilo de un elemento para leer el relleno efectivo. */
function flatten(testID: string): Record<string, unknown> {
  return StyleSheet.flatten(screen.getByTestId(testID).props.style) as Record<string, unknown>;
}

describe('App respeta las áreas seguras (edge-to-edge obligatorio en Android 16)', () => {
  it('aplica el inset superior al contenido y el inferior a la barra de pestañas', async () => {
    await render(<App />);

    // El onboarding aparece en el primer arranque; «Omitir» lo cierra siempre.
    await waitFor(() => expect(screen.getByText('Omitir')).toBeTruthy());
    fireEvent.press(screen.getByText('Omitir'));

    await waitFor(() => expect(screen.getByTestId('app-tabs')).toBeTruthy());
    // Espera a que la biblioteca termine de cargar (estado async de ImportScreen)
    // para no dejar actualizaciones de estado fuera de act().
    await waitFor(() => expect(screen.getByText('Sin documentos')).toBeTruthy());
    expect(flatten('app-tabs').paddingBottom).toBe(mockInsets.bottom);

    // Sin SQLite (arranque degradado) el inset superior protege el banner; con
    // almacenamiento real protege el cuerpo. En ambos casos ningún contenido
    // queda bajo la barra de estado.
    const banner = screen.queryByTestId('app-banner');
    if (banner) {
      expect(flatten('app-banner').paddingTop).toBe(mockInsets.top + 8);
    } else {
      expect(flatten('app-body').paddingTop).toBe(mockInsets.top);
    }
  });
});
