#!/usr/bin/env node
/**
 * Comprueba que los mensajes de commit siguen la convención del proyecto.
 *
 * Uso:
 *   node scripts/check-commits.mjs                 # commits de la rama actual
 *   node scripts/check-commits.mjs main..HEAD      # rango explícito
 *   node scripts/check-commits.mjs --all           # todo el historial
 *   node scripts/check-commits.mjs --message-file <ruta>   # un mensaje suelto
 *
 * Sale con código 1 si algún commit incumple la convención. Las advertencias no
 * bloquean: el estilo histórico «Sprint N: …» se acepta mientras se migra.
 */

import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { validateCommitMessage } = require('./lib/commit-convention.cjs');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Ejecuta `git log` y devuelve pares `{ hash, message }`. */
function readCommits(range) {
  const format = '%H%x1f%B%x1e';
  const args = ['log', `--format=${format}`];
  if (range) {
    args.push(range);
  } else {
    args.push('-20');
  }
  const output = execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' });
  return output
    .split('\x1e')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [hash, ...rest] = entry.split('\x1f');
      return { hash: hash.trim().slice(0, 8), message: rest.join('\x1f') };
    });
}

function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    process.stdout.write(
      [
        'Comprueba los mensajes de commit según CONTRIBUTING.md.',
        '',
        '  (sin argumentos)     commits de la rama actual (últimos 20)',
        '  <rango>              p. ej. main..HEAD',
        '  --all                todo el historial',
        '  --message-file <f>   valida un mensaje suelto (sin Git)',
        '',
      ].join('\n'),
    );
    return;
  }

  const messageFileIndex = args.indexOf('--message-file');
  if (messageFileIndex >= 0) {
    const file = args[messageFileIndex + 1];
    if (!file) {
      process.stderr.write('Falta la ruta tras --message-file.\n');
      process.exitCode = 1;
      return;
    }
    const message = readFileSync(file, 'utf8');
    const result = validateCommitMessage(message);
    report({ hash: '(mensaje)', message }, result);
    if (!result.ok) {
      process.exitCode = 1;
    }
    return;
  }

  const range = args.includes('--all') ? null : (args.find((arg) => !arg.startsWith('-')) ?? null);
  const commits = readCommits(range);

  let failures = 0;
  let warnings = 0;
  for (const commit of commits) {
    const result = validateCommitMessage(commit.message);
    if (!result.ok) {
      failures += 1;
    }
    warnings += result.warnings.length;
    report(commit, result);
  }

  process.stdout.write(
    `\n${commits.length} commit(s) revisados: ${failures} con errores, ${warnings} advertencia(s).\n`,
  );

  if (failures > 0) {
    process.stderr.write('Corrige los mensajes según CONTRIBUTING.md.\n');
    process.exitCode = 1;
  }
}

function report(commit, result) {
  const subject = result.parsed.subject;
  if (result.ok && result.warnings.length === 0) {
    process.stdout.write(`ok   ${commit.hash}  ${subject}\n`);
    return;
  }
  if (result.ok) {
    process.stdout.write(`warn ${commit.hash}  ${subject}\n`);
    for (const warning of result.warnings) {
      process.stdout.write(`     · ${warning}\n`);
    }
    return;
  }
  process.stdout.write(`FAIL ${commit.hash}  ${subject}\n`);
  for (const error of result.errors) {
    process.stdout.write(`     · ${error}\n`);
  }
}

main();
