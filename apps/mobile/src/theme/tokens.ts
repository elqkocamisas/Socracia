/** Paleta y tokens visuales del MVP. Centralizados para escalar el diseño. */
export const colors = {
  background: '#0F1222',
  surface: '#1B1F3A',
  primary: '#6C8CFF',
  primaryContrast: '#FFFFFF',
  accent: '#4FD1C5',
  textPrimary: '#F5F7FF',
  textSecondary: '#A7AEC9',
  border: '#2A3054',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 14,
  lg: 22,
} as const;
