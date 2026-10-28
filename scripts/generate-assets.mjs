#!/usr/bin/env node
/**
 * Genera los iconos y el splash de Socracia.
 *
 * Los assets de tienda son binarios que el repositorio versiona, no ficheros
 * que se editen a mano: este script los produce de forma reproducible a partir
 * del motivo de la marca (una «S» de Sócrates) para que cualquiera pueda
 * regenerarlos y revisar el cambio en el diff.
 *
 * Uso: node scripts/generate-assets.mjs
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PNG } from 'pngjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'apps/mobile/assets');

const COLORS = {
  background: [0x0f, 0x12, 0x22],
  surface: [0x1b, 0x1f, 0x3a],
  primary: [0x6c, 0x8c, 0xff],
  accent: [0x4f, 0xd1, 0xc5],
};

/**
 * Espina de la «S» en coordenadas normalizadas (y hacia abajo).
 *
 * Se define con puntos de control y se suaviza con Catmull-Rom: la forma es
 * ajustable a ojo y no depende de una tipografía concreta, que además no
 * estaría disponible al generar el asset.
 */
const S_SPINE = [
  [0.685, 0.235],
  [0.52, 0.18],
  [0.355, 0.245],
  [0.335, 0.375],
  [0.45, 0.475],
  [0.55, 0.525],
  [0.665, 0.625],
  [0.64, 0.755],
  [0.5, 0.815],
  [0.315, 0.755],
];

const STROKE = 0.105;

/** Muestrea una spline de Catmull-Rom como polilínea densa. */
function catmullRom(points, samplesPerSegment = 24) {
  const pts = [points[0], ...points, points[points.length - 1]];
  const out = [];
  for (let i = 1; i < pts.length - 2; i += 1) {
    const [p0, p1, p2, p3] = [pts[i - 1], pts[i], pts[i + 1], pts[i + 2]];
    for (let s = 0; s < samplesPerSegment; s += 1) {
      const t = s / samplesPerSegment;
      const t2 = t * t;
      const t3 = t2 * t;
      out.push([
        0.5 *
          (2 * p1[0] +
            (-p0[0] + p2[0]) * t +
            (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 +
            (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 *
          (2 * p1[1] +
            (-p0[1] + p2[1]) * t +
            (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 +
            (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
      ]);
    }
  }
  out.push(points[points.length - 1]);
  return out;
}

const SPINE = catmullRom(S_SPINE);

/**
 * Escala y centra la marca para que ocupe `coverage` del lienzo.
 *
 * Sin esto la «S» queda pequeña y descentrada: el icono adaptativo de Android
 * aparecería casi vacío dentro de su recorte circular.
 */
function fitSpine(points, stroke, coverage) {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const half = stroke / 2;

  const minX = Math.min(...xs) - half;
  const maxX = Math.max(...xs) + half;
  const minY = Math.min(...ys) - half;
  const maxY = Math.max(...ys) + half;

  // Escala uniforme: la «S» no debe deformarse aunque la caja no sea cuadrada.
  const scale = (coverage / Math.max(maxX - minX, maxY - minY)) * 1;
  const offsetX = 0.5 - ((minX + maxX) / 2) * scale;
  const offsetY = 0.5 - ((minY + maxY) / 2) * scale;

  return {
    points: points.map(([x, y]) => [x * scale + offsetX, y * scale + offsetY]),
    stroke: stroke * scale,
  };
}

/** Distancia de un punto al segmento AB. */
function distanceToSegment(px, py, ax, ay, bx, by) {
  const vx = bx - ax;
  const vy = by - ay;
  const wx = px - ax;
  const wy = py - ay;
  const len2 = vx * vx + vy * vy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, (wx * vx + wy * vy) / len2));
  return Math.hypot(px - (ax + t * vx), py - (ay + t * vy));
}

/** Distancia firmada al trazo de una marca (0 = borde del trazo). */
function signedDistance(mark, x, y) {
  let best = Infinity;
  const pts = mark.points;
  for (let i = 0; i < pts.length - 1; i += 1) {
    const d = distanceToSegment(x, y, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]);
    if (d < best) best = d;
  }
  return best - mark.stroke / 2;
}

/** Mezcla dos colores con cobertura `a` en [0, 1]. */
function mix(base, top, a) {
  return base.map((c, i) => Math.round(c + (top[i] - c) * a));
}

/** Cobertura de la marca en un píxel, con antialiasing analítico. */
function markCoverage(mark, x, y, size, aa) {
  const d = signedDistance(mark, x / size, y / size);
  return Math.max(0, Math.min(1, 0.5 - d / aa));
}

/** Fondo con un degradado diagonal suave. */
function backgroundAt(x, y, size) {
  const k = (x + y) / (2 * size);
  return mix(COLORS.background, COLORS.surface, k * 0.9);
}

/** Color de la tinta en función de la altura, para el degradado de la marca. */
function inkAt(y, size) {
  return mix(COLORS.primary, COLORS.accent, y / size);
}

/**
 * Icono cuadrado RGBA.
 *
 * `padding` deja margen para el recorte adaptativo de Android, que puede
 * recortar hasta un tercio del borde.
 */
export function iconPng(size, { padding = 0.14, transparent = false } = {}) {
  const png = new PNG({ width: size, height: size });
  const inner = size * (1 - padding * 2);
  const aa = 2.2 / inner;
  // La marca llena la caja segura: en el adaptativo, 1 - 2×0.22 = 0.56.
  const mark = fitSpine(SPINE, STROKE, 1);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const idx = (size * y + x) << 2;

      const mx = (x - size * padding) / inner;
      const my = (y - size * padding) / inner;

      let a = 0;
      if (mx >= 0 && my >= 0 && mx <= 1 && my <= 1) {
        a = markCoverage(mark, x - size * padding, y - size * padding, inner, aa);
      }

      const bg = transparent ? [0, 0, 0] : backgroundAt(x, y, size);
      const color = a > 0 ? mix(bg, inkAt(y, size), a) : bg;

      png.data[idx] = color[0];
      png.data[idx + 1] = color[1];
      png.data[idx + 2] = color[2];
      png.data[idx + 3] = transparent ? Math.round(255 * a) : 255;
    }
  }

  return PNG.sync.write(png);
}

/** Splash: fondo liso con la marca centrada, sin transparencia. */
export function splashPng(size, { background = COLORS.background, coverage = 0.42 } = {}) {
  const png = new PNG({ width: size, height: size });
  const markSize = size;
  const aa = 2.2 / markSize;
  const mark = fitSpine(SPINE, STROKE, coverage);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const idx = (size * y + x) << 2;

      const a = markCoverage(mark, x, y, markSize, aa);
      const color = a > 0 ? mix(background, inkAt(y, size), a) : background;

      png.data[idx] = color[0];
      png.data[idx + 1] = color[1];
      png.data[idx + 2] = color[2];
      png.data[idx + 3] = 255;
    }
  }

  return PNG.sync.write(png);
}

function write(relative, bytes) {
  const target = join(OUT, relative);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, bytes);
  console.warn(`escrito ${relative} (${bytes.length} bytes)`);
}

function main() {
  // App Store exige 1024×1024 sin transparencia.
  write('icon.png', iconPng(1024));
  // Android recorta el borde del icono adaptativo.
  write('adaptive-icon.png', iconPng(1024, { padding: 0.22, transparent: true }));
  write('splash.png', splashPng(1024));
  write('favicon.png', iconPng(64));
  // Google Play exige 512×512 para la ficha.
  write('play-icon-512.png', iconPng(512));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
