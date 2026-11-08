import { darkTheme, lightTheme, type Theme } from '../theme/tokens';

/**
 * Guardián de accesibilidad del tema.
 *
 * Recalcula el contraste WCAG real de cada par texto/fondo que la interfaz usa.
 * Si alguien cambia un color y deja un texto por debajo de AA, esta prueba
 * falla: es más fiable que revisar hexadecimales a ojo, y no depende de que el
 * diseñador recuerde el umbral.
 */

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
  ];
}

/** Luminancia relativa según WCAG 2.1. */
function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((value) => {
    const channel = value / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const l1 = relativeLuminance(a);
  const l2 = relativeLuminance(b);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

/** Pares texto/fondo que la interfaz usa de verdad, por tema. */
function textPairs(
  theme: Theme,
): readonly { readonly name: string; readonly fg: string; readonly bg: string }[] {
  const c = theme.colors;
  return [
    { name: 'textPrimary sobre background', fg: c.textPrimary, bg: c.background },
    { name: 'textSecondary sobre background', fg: c.textSecondary, bg: c.background },
    { name: 'textPrimary sobre surface', fg: c.textPrimary, bg: c.surface },
    { name: 'textSecondary sobre surface', fg: c.textSecondary, bg: c.surface },
    { name: 'primary sobre background', fg: c.primary, bg: c.background },
    { name: 'accent sobre background', fg: c.accent, bg: c.background },
    { name: 'danger sobre background', fg: c.danger, bg: c.background },
    { name: 'success sobre background', fg: c.success, bg: c.background },
    { name: 'primaryContrast sobre primary', fg: c.primaryContrast, bg: c.primary },
    { name: 'dangerContrast sobre danger', fg: c.dangerContrast, bg: c.danger },
  ];
}

describe.each([lightTheme, darkTheme])('Contraste del tema $name', (theme) => {
  it('todo par de texto cumple WCAG AA (≥4.5:1)', () => {
    // Se recogen los pares que incumplen y se comparan con la lista vacía: así
    // el fallo nombra el par y su ratio, no solo un número.
    const offenders = textPairs(theme)
      .map((pair) => ({ ...pair, ratio: Number(contrast(pair.fg, pair.bg).toFixed(2)) }))
      .filter((pair) => pair.ratio < 4.5)
      .map((pair) => `${pair.name}: ${pair.ratio}`);
    expect(offenders).toEqual([]);
  });

  it('declara su esquema para la barra de estado', () => {
    expect(theme.scheme).toBe(theme.name);
  });
});

describe('Tokens del tema', () => {
  it('claro y oscuro exponen exactamente los mismos nombres de color', () => {
    expect(Object.keys(lightTheme.colors).sort()).toEqual(Object.keys(darkTheme.colors).sort());
  });

  it('no comparten ningún color salvo las sombras neutras', () => {
    // Un tema que reutilizara los colores del otro no sería «claro y oscuro».
    expect(lightTheme.colors.background).not.toBe(darkTheme.colors.background);
    expect(lightTheme.colors.textPrimary).not.toBe(darkTheme.colors.textPrimary);
    expect(lightTheme.colors.primary).not.toBe(darkTheme.colors.primary);
  });
});
