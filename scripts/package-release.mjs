#!/usr/bin/env node
/**
 * Empaqueta el proyecto en un archivo de código fuente, sin Git.
 *
 * Hay entornos donde no se puede clonar el repositorio: máquinas sin Git, CI
 * restringido, entrega a un tercero por correo o un despliegue que parte de un
 * archivo. Este script produce un `.tar.gz` con **solo** el código fuente
 * necesario para arrancar el proyecto, más un manifiesto verificable.
 *
 * No incluye `node_modules` (se regeneran con `npm ci`), artefactos de build ni
 * secretos. El manifiesto permite comprobar que el archivo llegó íntegro.
 *
 * Uso:
 *   node scripts/package-release.mjs [--out <directorio>]
 */

import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { buildManifest, collectFiles } = require('./lib/release-files.cjs');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function main() {
  const args = process.argv.slice(2);
  const outIndex = args.indexOf('--out');
  const outDir = outIndex >= 0 ? args[outIndex + 1] : join(ROOT, 'dist');

  const { version } = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  const files = collectFiles(ROOT);

  mkdirSync(outDir, { recursive: true });

  const manifest = buildManifest(ROOT, files, version, new Date().toISOString());
  const manifestPath = join(outDir, `socracia-${version}.manifest.json`);
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  const archiveName = `socracia-${version}-fuente.tar.gz`;
  const archivePath = join(outDir, archiveName);
  // `tar` está en macOS y Linux; en Windows 10+ existe como `tar.exe`.
  execFileSync('tar', ['-czf', archivePath, ...files], { cwd: ROOT, stdio: 'inherit' });

  const totalBytes = manifest.files.reduce((sum, file) => sum + file.bytes, 0);
  process.stdout.write(
    [
      `Entrega creada: ${relative(ROOT, archivePath)}`,
      `Ficheros: ${manifest.fileCount} (${(totalBytes / 1024).toFixed(0)} KiB sin comprimir)`,
      `Manifiesto: ${relative(ROOT, manifestPath)}`,
      '',
      'Para instalar sin Git:',
      `  mkdir socracia && tar -xzf ${archiveName} -C socracia`,
      '  cd socracia && npm ci && npm run verify',
      '',
    ].join('\n'),
  );
}

main();
