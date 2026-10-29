#!/usr/bin/env node
/**
 * Genera las capturas de pantalla para las fichas de App Store y Google Play.
 *
 * Las capturas son un artefacto de publicación, no una maqueta: el script
 * arranca la app real (el mismo código que se empaqueta para iOS y Android,
 * renderizado con `react-native-web`), recorre el flujo completo —importar un
 * temario, responder una pregunta, ver el progreso— y fotografía cada pantalla
 * a los píxeles que exige cada tienda.
 *
 * Por qué así y no a mano: una captura dibujada a mano puede mostrar una
 * interfaz que no existe. Estas salen del código, así que si la pantalla cambia,
 * la captura cambia con ella y el `diff` lo enseña.
 *
 * Limitación conocida: el render es de navegador, no de dispositivo. Reproduce
 * la interfaz y la lógica reales, pero el aspecto nativo puede diferir en
 * detalles de tipografía o sombras. Antes de enviar a revisión conviene
 * repetirlas en un simulador o dispositivo (ver `docs/store-release-checklist.md`).
 *
 * Uso: node scripts/generate-screenshots.mjs
 * Requisitos: `npm run build` (el temario de ejemplo sale de `packages/core`).
 */

import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { basename, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

import { chromium } from 'playwright';

import { SAMPLE_CURRICULUM_TEXT } from '../packages/core/dist/__fixtures__/sampleCurriculum.js';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');
const MOBILE = join(ROOT, 'apps', 'mobile');
const OUT = join(MOBILE, 'store', 'screenshots');
const EXPORT_DIR = join(tmpdir(), 'socracia-screenshots-web');
const TEMARIO_FILE = join(tmpdir(), 'socracia-temario.txt');

/**
 * Cada tienda pide un tamaño distinto. El viewport se expresa en puntos CSS y
 * `deviceScaleFactor` lo multiplica hasta los píxeles exigidos:
 * App Store 6,7" = 430×932 × 3 = 1290×2796; Play teléfono = 360×640 × 3 = 1080×1920.
 */
const TARGETS = [
  {
    name: 'appStore',
    viewport: { width: 430, height: 932 },
    deviceScaleFactor: 3,
  },
  {
    name: 'googlePlay',
    viewport: { width: 360, height: 640 },
    deviceScaleFactor: 3,
  },
];

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.wasm': 'application/wasm',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
};

/** Servidor estático mínimo sobre la exportación web. Sin dependencias. */
async function serve(root) {
  const server = createServer(async (request, response) => {
    const requested = decodeURIComponent((request.url ?? '/').split('?')[0]);
    const relative = requested === '/' ? 'index.html' : requested.replace(/^\/+/, '');
    const target = join(root, normalize(relative).replace(/^(\.\.[/\\])+/, ''));
    try {
      const body = await readFile(target);
      response.writeHead(200, {
        'content-type': MIME[extname(target)] ?? 'application/octet-stream',
      });
      response.end(body);
    } catch {
      response.writeHead(404);
      response.end('no encontrado');
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return { server, baseUrl: `http://127.0.0.1:${port}` };
}

/** Exporta la app a web. Es el único paso que necesita Metro. */
function exportWeb() {
  execFileSync('npx', ['expo', 'export', '--platform', 'web', '--output-dir', EXPORT_DIR], {
    cwd: MOBILE,
    stdio: 'inherit',
  });
}

/**
 * Recorre el flujo de usuario y escribe una captura por pantalla.
 *
 * Cada captura se toma en el instante en que la pantalla está en pantalla: si
 * se difiriera al final, todas fotografiarían el último estado.
 */
async function driveFlow(page, baseUrl, directory) {
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.getByText('Adjuntar temario').waitFor({ timeout: 30_000 });

  const shot = async (name) => {
    await page.screenshot({ path: join(directory, name) });
    console.warn(`escrito store/screenshots/${basename(directory)}/${name}`);
  };

  // Importar el temario de ejemplo, de autoría propia.
  const chooser = page.waitForEvent('filechooser', { timeout: 15_000 });
  await page.getByText('Adjuntar temario').click();
  await (await chooser).setFiles(TEMARIO_FILE);
  await page.getByText('Estudiar').waitFor({ timeout: 30_000 });
  await page.waitForTimeout(1200);
  await shot('biblioteca.png');

  // Estudio: primero la pregunta, después la retroalimentación con andamiaje.
  await page.getByText('Estudiar').click();
  await page.getByText('Enviar respuesta').waitFor({ timeout: 30_000 });
  await page.waitForTimeout(800);
  await shot('estudio-pregunta.png');

  await page
    .locator('textarea')
    .first()
    .fill('Es el cauce formal por el que la Administración exterioriza sus decisiones.');
  await page.getByText('Enviar respuesta').click();
  await page.getByText('Pista para pensar').waitFor({ timeout: 30_000 });
  await page.waitForTimeout(800);
  await shot('estudio-feedback.png');

  // Progreso con la laguna detectada.
  await page.getByText('Progreso').last().click();
  await page.getByText('Lagunas detectadas').waitFor({ timeout: 30_000 });
  await page.waitForTimeout(800);
  await shot('progreso-lagunas.png');

  // Cuenta: privacidad y sincronización.
  await page.getByText('Cuenta').last().click();
  await page.getByText('Privacidad', { exact: true }).waitFor({ timeout: 30_000 });
  await page.waitForTimeout(800);
  await shot('cuenta.png');
}

async function captureTarget(browser, baseUrl, target) {
  const context = await browser.newContext({
    viewport: target.viewport,
    deviceScaleFactor: target.deviceScaleFactor,
    locale: 'es-ES',
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));

  const directory = join(OUT, target.name);
  await mkdir(directory, { recursive: true });
  await driveFlow(page, baseUrl, directory);
  await context.close();

  if (errors.length > 0) {
    throw new Error(`La app lanzó errores al capturar: ${errors.join(' | ')}`);
  }
}

async function main() {
  if (!existsSync(join(ROOT, 'packages', 'core', 'dist', 'index.js'))) {
    throw new Error('Falta el build del núcleo. Ejecuta `npm run build` antes.');
  }

  await writeFile(TEMARIO_FILE, SAMPLE_CURRICULUM_TEXT, 'utf8');
  await rm(EXPORT_DIR, { recursive: true, force: true });
  await rm(OUT, { recursive: true, force: true });
  exportWeb();

  const { server, baseUrl } = await serve(EXPORT_DIR);
  const browser = await chromium.launch();
  try {
    for (const target of TARGETS) {
      await captureTarget(browser, baseUrl, target);
    }
  } finally {
    await browser.close();
    server.close();
  }
  console.warn('capturas generadas en apps/mobile/store/screenshots');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
