import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { PNG, type PngImage } from 'pngjs';

/**
 * Comprueba que los assets de tienda cumplen lo que exigen App Store y Google
 * Play. Son reglas de rechazo automático, así que conviene que fallen aquí y no
 * en la revisión de la tienda.
 */
const ASSETS = join(__dirname, '..', '..', 'assets');

function read(name: string): PngImage {
  return PNG.sync.read(readFileSync(join(ASSETS, name)));
}

/** Luminancia de un píxel (0-255). */
function luminance(png: PngImage, x: number, y: number): number {
  const i = (png.width * y + x) << 2;
  const r = png.data[i] ?? 0;
  const g = png.data[i + 1] ?? 0;
  const b = png.data[i + 2] ?? 0;
  return r * 0.299 + g * 0.587 + b * 0.114;
}

/** Proporción de píxeles totalmente transparentes. */
function transparentRatio(png: PngImage): number {
  let transparent = 0;
  for (let i = 3; i < png.data.length; i += 4) {
    if (png.data[i] === 0) transparent += 1;
  }
  return transparent / (png.width * png.height);
}

/** Caja envolvente de los píxeles con tinta, en fracción del lienzo. */
function inkBox(png: PngImage): { minX: number; maxX: number; minY: number; maxY: number } {
  let minX = png.width;
  let maxX = -1;
  let minY = png.height;
  let maxY = -1;
  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      if (luminance(png, x, y) <= 8) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  return {
    minX: minX / png.width,
    maxX: maxX / png.width,
    minY: minY / png.height,
    maxY: maxY / png.height,
  };
}

describe('Assets de tienda', () => {
  it('el icono de App Store es 1024×1024 y sin transparencia', () => {
    const icon = read('icon.png');
    expect([icon.width, icon.height]).toEqual([1024, 1024]);
    expect(transparentRatio(icon)).toBe(0);
  });

  it('el icono de Google Play es 512×512 y sin transparencia', () => {
    const icon = read('play-icon-512.png');
    expect([icon.width, icon.height]).toEqual([512, 512]);
    expect(transparentRatio(icon)).toBe(0);
  });

  it('el icono adaptativo de Android es 1024×1024 y cabe en la caja segura', () => {
    const icon = read('adaptive-icon.png');
    expect([icon.width, icon.height]).toEqual([1024, 1024]);
    expect(transparentRatio(icon)).toBeGreaterThan(0.1);

    // Android recorta el borde: la tinta debe quedar dentro del 66 % central,
    // que es la caja segura que garantiza el recorte circular.
    const box = inkBox(icon);
    expect(box.minX).toBeGreaterThan(0.16);
    expect(box.maxX).toBeLessThan(0.84);
    expect(box.minY).toBeGreaterThan(0.16);
    expect(box.maxY).toBeLessThan(0.84);
    // Y debe ser lo bastante grande para verse tras el recorte.
    expect(box.maxX - box.minX).toBeGreaterThan(0.3);
    expect(box.maxY - box.minY).toBeGreaterThan(0.3);
  });

  it('el splash es 1024×1024 y opaco', () => {
    const splash = read('splash.png');
    expect([splash.width, splash.height]).toEqual([1024, 1024]);
    expect(transparentRatio(splash)).toBe(0);
  });

  it('la marca no toca el borde del icono', () => {
    const icon = read('icon.png');
    const row = (y: number): number[] =>
      Array.from({ length: icon.width }, (_, x) => luminance(icon, x, y));

    // El fondo tiene luminancia baja; el trazo, alta.
    const borderMax = Math.max(...row(0), ...row(icon.height - 1));
    const centerMax = luminance(icon, icon.width / 2, icon.height / 2);
    expect(borderMax).toBeLessThan(centerMax);
  });
});
