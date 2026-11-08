/**
 * Tokens visuales de Socracia: paleta clara y oscura, tipografía, elevación,
 * espaciado y movimiento.
 *
 * Regla dura: **ningún color literal vive fuera de este fichero**. Las pantallas
 * consumen los tokens a través del tema (`useTheme`), nunca escriben un `#RRGGBB`.
 * Un test lo comprueba, para que la regla no dependa de la memoria de nadie.
 *
 * La paleta sigue la preferencia del sistema y admite ajuste manual; ambos
 * temas comparten nombres de token, así que una pantalla no necesita saber cuál
 * está activo. Los pares de texto sobre fondo cumplen WCAG AA (≥4.5:1) y hay un
 * test que recalcula el contraste real de cada par en uso.
 */

/** Colores de un tema. Los nombres son estables entre claro y oscuro. */
export interface ThemeColors {
  readonly background: string;
  readonly surface: string;
  /** Superficie ligeramente distinta, para filas y estados alternos. */
  readonly surfaceAlt: string;
  readonly primary: string;
  /** Texto e iconos sobre `primary`. */
  readonly primaryContrast: string;
  readonly accent: string;
  readonly textPrimary: string;
  readonly textSecondary: string;
  readonly border: string;
  readonly danger: string;
  /** Texto e iconos sobre `danger`. */
  readonly dangerContrast: string;
  readonly success: string;
  /** Velo para hojas modales y fondos atenuados. */
  readonly overlay: string;
}

/** Tema completo: nombre, colores y esquema para la barra de estado. */
export interface Theme {
  readonly name: 'light' | 'dark';
  /** `light` u `dark` para `StatusBar`/`Appearance`. */
  readonly scheme: 'light' | 'dark';
  readonly colors: ThemeColors;
}

/** Paleta clara. Contrastes AA verificados en `themeContrast.test.ts`. */
export const lightTheme: Theme = {
  name: 'light',
  scheme: 'light',
  colors: {
    background: '#FAF6EF',
    surface: '#FFFFFF',
    surfaceAlt: '#F3EDE2',
    primary: '#1F4E5F',
    primaryContrast: '#FFFFFF',
    accent: '#B8472F',
    textPrimary: '#1E2330',
    textSecondary: '#5A6275',
    border: '#E3DCCF',
    danger: '#B3261E',
    dangerContrast: '#FFFFFF',
    success: '#2E7D5B',
    overlay: 'rgba(30, 35, 48, 0.45)',
  },
};

/** Paleta oscura. Contrastes AA verificados en `themeContrast.test.ts`. */
export const darkTheme: Theme = {
  name: 'dark',
  scheme: 'dark',
  colors: {
    background: '#12161F',
    surface: '#1C2230',
    surfaceAlt: '#232A3A',
    primary: '#7FC4D6',
    primaryContrast: '#12161F',
    accent: '#F0997D',
    textPrimary: '#F3EFE8',
    textSecondary: '#A9B0BF',
    border: '#2B3345',
    danger: '#FF8A80',
    dangerContrast: '#12161F',
    success: '#6FCF9F',
    overlay: 'rgba(0, 0, 0, 0.55)',
  },
};

/** Paleta oscura por defecto, por compatibilidad con el código previo al tema. */
export const colors: ThemeColors = darkTheme.colors;

/** Espaciado base en puntos. Escala 4/8. */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

/** Radios de esquina. */
export const radius = {
  sm: 8,
  md: 14,
  lg: 22,
} as const;

/**
 * Escala tipográfica con fuentes del sistema (sin descargar ninguna).
 *
 * Cada entrada fija tamaño, altura de línea y peso. `letterSpacing` se reserva
 * para los rótulos en mayúsculas, que si no se ven apelmazados.
 */
export const typography = {
  display: { fontSize: 40, lineHeight: 46, fontWeight: '700' as const, letterSpacing: 0.5 },
  title: { fontSize: 32, lineHeight: 38, fontWeight: '700' as const },
  heading: { fontSize: 20, lineHeight: 26, fontWeight: '700' as const },
  body: { fontSize: 16, lineHeight: 24, fontWeight: '400' as const },
  bodyStrong: { fontSize: 16, lineHeight: 24, fontWeight: '600' as const },
  callout: { fontSize: 15, lineHeight: 22, fontWeight: '400' as const },
  label: { fontSize: 13, lineHeight: 18, fontWeight: '600' as const, letterSpacing: 1 },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '400' as const },
} as const;

/**
 * Elevación por sombra. En Android la sombra real necesita `elevation`; en iOS,
 * los parámetros de `shadow*`. Se exponen ambos para que una misma tarjeta se
 * vea coherente en las dos plataformas.
 */
export const elevation = {
  none: { elevation: 0 },
  sm: {
    elevation: 1,
    shadowColor: '#000000',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
  },
  md: {
    elevation: 3,
    shadowColor: '#000000',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  lg: {
    elevation: 6,
    shadowColor: '#000000',
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
  },
} as const;

/** Duraciones de animación en milisegundos. */
export const durations = {
  fast: 120,
  normal: 220,
  slow: 360,
} as const;

/** Tamaño mínimo de un objetivo táctil (accesibilidad), en puntos. */
export const minTouchTarget = 48;
