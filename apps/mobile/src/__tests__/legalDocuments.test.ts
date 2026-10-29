import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { LEGAL_DOCUMENTS } from '../legal/documents.generated';
import { findLegalDocument, parseLegalMarkdown } from '../legal/parseLegalMarkdown';

const ROOT = join(__dirname, '..', '..', '..', '..');

/**
 * Estos documentos son un requisito de tienda: App Store exige que la política
 * de privacidad sea accesible desde dentro de la app. Las pruebas comprueban que
 * el texto que ve el usuario es el mismo que se revisa en `docs/`, para que una
 * edición del Markdown no deje a la app mostrando una política antigua.
 */
describe('Documentos legales dentro de la app', () => {
  it('incluye privacidad y términos', () => {
    expect(LEGAL_DOCUMENTS.map((document) => document.id).sort()).toEqual([
      'privacidad',
      'terminos',
    ]);
  });

  it('cada documento tiene encabezado y cuerpo no vacíos', () => {
    for (const document of LEGAL_DOCUMENTS) {
      expect(document.heading.length).toBeGreaterThan(0);
      expect(document.body.length).toBeGreaterThan(500);
    }
  });

  it('no filtra notas internas dirigidas al desarrollador', () => {
    for (const document of LEGAL_DOCUMENTS) {
      expect(document.body).not.toContain('dev:nota-interna');
      expect(document.body).not.toMatch(/Sustituya (estos buzones|la dirección)/);
    }
  });

  it('está sincronizado con docs/: el cuerpo contiene los encabezados del Markdown', () => {
    const pairs = [
      { id: 'privacidad', file: 'privacy-policy.md' },
      { id: 'terminos', file: 'terms-of-use.md' },
    ];
    for (const pair of pairs) {
      const markdown = readFileSync(join(ROOT, 'docs', pair.file), 'utf8');
      const document = findLegalDocument(LEGAL_DOCUMENTS, pair.id);
      expect(document).toBeDefined();

      // Todo encabezado de nivel 2 del Markdown debe aparecer en la app.
      const headings = [...markdown.matchAll(/^##\s+(.+)$/gm)].map((match) =>
        (match[1] ?? '').trim(),
      );
      expect(headings.length).toBeGreaterThan(0);
      for (const heading of headings) {
        expect(document?.body).toContain(heading);
      }
    }
  });
});

describe('parseLegalMarkdown', () => {
  it('interpreta encabezados, párrafos y listas', () => {
    const blocks = parseLegalMarkdown(
      ['# Título', '', 'Un párrafo.', '', '## Sección', '', '- uno', '- dos'].join('\n'),
    );

    expect(blocks).toEqual([
      { kind: 'heading', level: 1, text: 'Título' },
      { kind: 'paragraph', text: 'Un párrafo.' },
      { kind: 'heading', level: 2, text: 'Sección' },
      { kind: 'bullets', items: ['uno', 'dos'] },
    ]);
  });

  it('une las líneas de un mismo párrafo', () => {
    const blocks = parseLegalMarkdown('Una frase\nque continúa.');
    expect(blocks).toEqual([{ kind: 'paragraph', text: 'Una frase que continúa.' }]);
  });

  it('elimina el énfasis y los enlaces para no mostrar asteriscos al usuario', () => {
    const blocks = parseLegalMarkdown('Esto es **importante** y `código`, ver [la guía](http://x).');
    expect(blocks).toEqual([
      { kind: 'paragraph', text: 'Esto es importante y código, ver la guía.' },
    ]);
  });

  it('devuelve una lista vacía para un documento vacío', () => {
    expect(parseLegalMarkdown('')).toEqual([]);
  });
});
