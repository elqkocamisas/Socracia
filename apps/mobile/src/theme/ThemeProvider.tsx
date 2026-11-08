import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useColorScheme } from 'react-native';

import { resolveTheme, type ThemePreference, type ThemeStore } from './themePreference';
import { darkTheme, type Theme } from './tokens';

/**
 * Contexto de tema de la app.
 *
 * Fuera de un `ThemeProvider` —por ejemplo, en las pruebas de pantalla que
 * montan un componente suelto— `useTheme` resuelve el tema a partir de la
 * apariencia del sistema. Así ninguna pantalla necesita un proveedor para
 * pintarse, y las pruebas siguen montando solo lo que prueban.
 */
export interface ThemeContextValue {
  readonly theme: Theme;
  readonly preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/** Propiedades del proveedor de tema. */
export interface ThemeProviderProps {
  /** Persistencia de la preferencia; si falta, el ajuste no se guarda. */
  readonly store?: ThemeStore;
  /** Preferencia inicial; `system` si no se aporta. */
  readonly initialPreference?: ThemePreference;
  readonly children: ReactNode;
}

/** Provee el tema activo y permite cambiarlo, persistiendo la preferencia. */
export function ThemeProvider({
  store,
  initialPreference = 'system',
  children,
}: ThemeProviderProps): React.JSX.Element {
  const systemScheme = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>(initialPreference);

  // Carga la preferencia guardada al montar: el ajuste debe sobrevivir al
  // reinicio, o el usuario vería su elección revertida en cada arranque.
  useEffect(() => {
    if (!store) {
      return;
    }
    let cancelled = false;
    void store.load().then((loaded) => {
      if (!cancelled) {
        setPreferenceState(loaded);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [store]);

  const setPreference = useCallback(
    (next: ThemePreference) => {
      setPreferenceState(next);
      void store?.save(next);
    },
    [store],
  );

  const value = useMemo<ThemeContextValue>(
    () => ({ theme: resolveTheme(preference, systemScheme), preference, setPreference }),
    [preference, systemScheme, setPreference],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** Devuelve el tema activo y el control para cambiarlo. */
export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  const systemScheme = useColorScheme();
  // Sin proveedor se resuelve «system»; el valor por defecto del sistema es
  // oscuro para no deslumbrar a quien no ha elegido nada.
  return (
    context ?? {
      theme: resolveTheme('system', systemScheme),
      preference: 'system',
      setPreference: () => undefined,
    }
  );
}

/** Solo el tema activo, para el caso más común. */
export function useThemeColors(): Theme['colors'] {
  return useTheme().theme.colors;
}

export { darkTheme };
