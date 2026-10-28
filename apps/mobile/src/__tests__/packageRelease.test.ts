/**
 * @jest-environment node
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { collectFiles, shouldInclude } from '../../../../scripts/lib/release-files.cjs';

const ROOT = join(__dirname, '..', '..', '..', '..');

/**
 * La entrega sin Git es el único camino de distribución para quien no puede
 * clonar el repositorio, así que lo que **no** debe contener importa tanto como
 * lo que sí contiene: un secreto filtrado en un `.tar.gz` es una fuga.
 */
describe('empaquetado de la entrega sin Git', () => {
  it('excluye dependencias, artefactos de build y secretos', () => {
    expect(shouldInclude('node_modules/react/index.js')).toBe(false);
    expect(shouldInclude('apps/mobile/node_modules/expo/package.json')).toBe(false);
    expect(shouldInclude('.git/config')).toBe(false);
    expect(shouldInclude('packages/core/dist/index.js')).toBe(false);
    expect(shouldInclude('coverage/lcov.info')).toBe(false);
    expect(shouldInclude('apps/mobile/.expo/settings.json')).toBe(false);
    expect(shouldInclude('play-service-account.json')).toBe(false);
    expect(shouldInclude('apps/mobile/credentials.json')).toBe(false);
    expect(shouldInclude('.env')).toBe(false);
    expect(shouldInclude('.env.production')).toBe(false);
    expect(shouldInclude('firma.jks')).toBe(false);
    expect(shouldInclude('clave.p12')).toBe(false);
    expect(shouldInclude('servicio.p8')).toBe(false);
    expect(shouldInclude('app.log')).toBe(false);
  });

  it('incluye el código fuente y la configuración necesarios para arrancar', () => {
    expect(shouldInclude('package.json')).toBe(true);
    expect(shouldInclude('packages/core/src/index.ts')).toBe(true);
    expect(shouldInclude('apps/mobile/app.json')).toBe(true);
    expect(shouldInclude('.openhands/setup.sh')).toBe(true);
    expect(shouldInclude('docs/privacy-policy.md')).toBe(true);
  });

  it('el árbol real no filtra secretos ni dependencias', () => {
    const files = collectFiles(ROOT) as string[];

    expect(files.length).toBeGreaterThan(50);
    expect(files).toContain('package.json');
    expect(files).toContain('packages/core/src/index.ts');
    expect(files.some((path) => path.includes('node_modules'))).toBe(false);
    expect(files.some((path) => path.startsWith('.git/'))).toBe(false);
    expect(files.some((path) => path.includes('/dist/'))).toBe(false);
    expect(files).not.toContain('play-service-account.json');
  });

  it('genera el archivo y un manifiesto que cuadra con su contenido', () => {
    const outDir = mkdtempSync(join(tmpdir(), 'socracia-pack-'));
    try {
      execFileSync('node', [join(ROOT, 'scripts', 'package-release.mjs'), '--out', outDir], {
        cwd: ROOT,
        stdio: 'pipe',
      });

      const version = (
        JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { version: string }
      ).version;
      const archive = join(outDir, `socracia-${version}-fuente.tar.gz`);
      const manifestPath = join(outDir, `socracia-${version}.manifest.json`);
      expect(existsSync(archive)).toBe(true);
      expect(existsSync(manifestPath)).toBe(true);

      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
        fileCount: number;
        files: { path: string; sha256: string }[];
      };
      expect(manifest.fileCount).toBe(manifest.files.length);

      // El archivo contiene exactamente los ficheros del manifiesto, sin
      // colar nada por el camino.
      const listing = execFileSync('tar', ['-tzf', archive], { encoding: 'utf8' })
        .trim()
        .split('\n')
        .sort();
      const fromManifest = manifest.files.map((file) => file.path).sort();
      expect(listing).toEqual(fromManifest);

      // Y ningún secreto viajó dentro.
      expect(listing.some((path) => path.includes('node_modules'))).toBe(false);
      expect(listing).not.toContain('play-service-account.json');
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  });
});
