'use strict';
/**
 * Lógica pura del empaquetado de entrega sin Git.
 *
 * Vive en CommonJS y no en el script `.mjs` para poder probarse directamente:
 * Jest no puede requerir un módulo ESM, y la decisión de qué entra en la
 * entrega es justo lo que hay que probar (un secreto filtrado es una fuga).
 */

const { createHash } = require('node:crypto');
const { readdirSync, readFileSync, statSync } = require('node:fs');
const { join, relative, sep } = require('node:path');

/**
 * Directorios que nunca forman parte de una entrega de código fuente.
 *
 * Son dependencias reinstalables o artefactos derivados: incluirlos infla el
 * archivo y puede arrastrar binarios de la plataforma equivocada.
 */
const EXCLUDED_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'coverage',
  '.expo',
  '.expo-shared',
  'web-build',
  'android',
  'ios',
]);

/** Ficheros que no deben salir del entorno bajo ninguna circunstancia. */
const EXCLUDED_FILES = new Set(['play-service-account.json', 'credentials.json', '.env']);

const EXCLUDED_EXTENSIONS = [
  '.log',
  '.jks',
  '.keystore',
  '.p8',
  '.p12',
  '.key',
  '.mobileprovision',
];

/** Decide si una ruta relativa entra en la entrega. */
function shouldInclude(relativePath) {
  const parts = relativePath.split(sep);
  if (parts.some((part) => EXCLUDED_DIRS.has(part))) {
    return false;
  }
  const name = parts[parts.length - 1];
  if (EXCLUDED_FILES.has(name) || name.startsWith('.env.')) {
    return false;
  }
  return !EXCLUDED_EXTENSIONS.some((extension) => name.endsWith(extension));
}

/** Recorre el árbol y devuelve las rutas relativas incluidas, ordenadas. */
function collectFiles(directory, base = directory) {
  const found = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolute = join(directory, entry.name);
    const relativePath = relative(base, absolute);
    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.has(entry.name)) {
        continue;
      }
      found.push(...collectFiles(absolute, base));
    } else if (shouldInclude(relativePath)) {
      found.push(relativePath);
    }
  }
  return found.sort();
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

/**
 * Construye el manifiesto de la entrega.
 *
 * Permite verificar que el archivo llegó íntegro sin confiar en el transporte
 * (correo, USB, descarga), que es justo el caso de uso sin Git.
 */
function buildManifest(root, files, version, now) {
  return {
    name: 'socracia',
    version,
    generatedAt: now,
    fileCount: files.length,
    files: files.map((path) => ({
      path,
      bytes: statSync(join(root, path)).size,
      sha256: sha256(join(root, path)),
    })),
  };
}

module.exports = { EXCLUDED_DIRS, collectFiles, shouldInclude, buildManifest };
