#!/usr/bin/env node
/**
 * Convierte los documentos legales de `docs/` en un módulo TypeScript.
 *
 * App Store exige que la política de privacidad sea accesible **desde dentro de
 * la app**, no solo desde la ficha de la tienda. Copiar el texto a mano dentro
 * del código crearía dos versiones que se separan en cuanto alguien edite una:
 * la política que el usuario lee dejaría de ser la que se revisa en el
 * repositorio. Por eso la app importa un módulo generado y no un literal.
 *
 * Uso: node scripts/generate-legal.mjs
 * La prueba `legalDocuments.test.ts` falla si el módulo no está regenerado.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = join(ROOT, 'apps/mobile/src/legal/documents.generated.ts');

/** Documentos legales que la app debe poder mostrar sin conexión. */
const DOCUMENTS = [
  {
    id: 'privacidad',
    title: 'Política de privacidad',
    source: join(ROOT, 'docs/privacy-policy.md'),
  },
  {
    id: 'terminos',
    title: 'Términos de uso',
    source: join(ROOT, 'docs/terms-of-use.md'),
  },
];

const INTERNAL_NOTE = /<!--\s*dev:nota-interna\s*-->[\s\S]*?<!--\s*\/dev:nota-interna\s*-->/g;

/**
 * Prepara el Markdown para mostrarlo en la app.
 *
 * Las notas internas van entre comentarios HTML: sirven al desarrollador y no
 * deben llegar al usuario, que las leería como instrucciones dirigidas a él.
 * Los bloques de código se convierten en texto porque la pantalla no los
 * renderiza y verían las vallas de Markdown en crudo.
 */
export function toDisplayMarkdown(markdown) {
  const stripped = markdown
    .replace(INTERNAL_NOTE, '')
    .replace(/```[a-z]*\n([\s\S]*?)```/g, (_, code) => code.trim())
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  // Una nota interna mal cerrada no coincide con el patrón y se colaría hasta el
  // usuario, que la leería como instrucciones dirigidas a él. Mejor fallar la
  // generación que publicar el texto interno en la app.
  if (/dev:nota-interna/.test(stripped) || /<!--\s*\/?dev:/.test(stripped)) {
    throw new Error(
      'Hay una nota interna sin cerrar o mal formada. Use el par ' +
        '«<!-- dev:nota-interna --> ... <!-- /dev:nota-interna -->».',
    );
  }
  return stripped;
}

/** Extrae el título de nivel 1, que es el encabezado del documento. */
export function extractTitle(markdown) {
  const match = /^#\s+(.+)$/m.exec(markdown);
  return match ? match[1].trim() : '';
}

function build() {
  const entries = DOCUMENTS.map((document) => {
    const raw = readFileSync(document.source, 'utf8');
    return {
      id: document.id,
      title: document.title,
      heading: extractTitle(raw),
      body: toDisplayMarkdown(raw),
    };
  });

  const serialized = entries
    .map(
      (entry) =>
        `  {\n` +
        `    id: ${JSON.stringify(entry.id)},\n` +
        `    title: ${JSON.stringify(entry.title)},\n` +
        `    heading: ${JSON.stringify(entry.heading)},\n` +
        `    body: ${JSON.stringify(entry.body)},\n` +
        `  },`,
    )
    .join('\n');

  const file =
    `// GENERADO por scripts/generate-legal.mjs. No editar a mano.\n` +
    `// Fuente: docs/privacy-policy.md y docs/terms-of-use.md.\n` +
    `// Regenerar: npm run generate:legal\n\n` +
    `/** Documento legal mostrable dentro de la app. */\n` +
    `export interface LegalDocument {\n` +
    `  readonly id: string;\n` +
    `  readonly title: string;\n` +
    `  /** Encabezado de nivel 1 del Markdown original. */\n` +
    `  readonly heading: string;\n` +
    `  readonly body: string;\n` +
    `}\n\n` +
    `export const LEGAL_DOCUMENTS: readonly LegalDocument[] = [\n${serialized}\n];\n`;

  writeFileSync(OUTPUT, file, 'utf8');
  return entries;
}

// Solo genera al ejecutarse como script; al importarlo desde una prueba no
// debe escribir ficheros.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const entries = build();
  console.log(`Documentos legales generados: ${entries.length} -> ${OUTPUT}`);
  for (const entry of entries) {
    console.log(`  ${entry.id}: ${entry.body.length} caracteres`);
  }
}
