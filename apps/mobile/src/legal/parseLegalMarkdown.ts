import type { LegalDocument } from '../legal/documents.generated';

/** Bloque de contenido interpretado a partir del Markdown legal. */
export type LegalBlock =
  | { readonly kind: 'heading'; readonly level: 1 | 2 | 3; readonly text: string }
  | { readonly kind: 'paragraph'; readonly text: string }
  | { readonly kind: 'bullets'; readonly items: readonly string[] };

const HEADING = /^(#{1,3})\s+(.*)$/;
const BULLET = /^[-*]\s+(.*)$/;

/**
 * Interpreta el Markdown de los documentos legales como bloques mostrables.
 *
 * No es un renderizador de Markdown general: solo cubre lo que usan
 * `docs/privacy-policy.md` y `docs/terms-of-use.md` (encabezados, párrafos y
 * listas). Añadir una dependencia de Markdown para tres construcciones sería
 * desproporcionado, y el texto legal debe renderizarse igual en todas las
 * versiones de la app. Los estilos en línea se eliminan para que el usuario no
 * vea asteriscos sueltos.
 */
export function parseLegalMarkdown(markdown: string): readonly LegalBlock[] {
  const blocks: LegalBlock[] = [];
  let paragraph: string[] = [];
  let bullets: string[] = [];

  const flushParagraph = (): void => {
    if (paragraph.length > 0) {
      blocks.push({ kind: 'paragraph', text: stripInline(paragraph.join(' ')) });
      paragraph = [];
    }
  };
  const flushBullets = (): void => {
    if (bullets.length > 0) {
      blocks.push({ kind: 'bullets', items: bullets.map(stripInline) });
      bullets = [];
    }
  };
  const flushAll = (): void => {
    flushParagraph();
    flushBullets();
  };

  for (const rawLine of markdown.split('\n')) {
    const line = rawLine.trimEnd();
    if (line.trim() === '') {
      flushAll();
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      flushAll();
      blocks.push({
        kind: 'heading',
        level: heading[1]?.length as 1 | 2 | 3,
        text: stripInline(heading[2] ?? ''),
      });
      continue;
    }

    const bullet = BULLET.exec(line.trim());
    if (bullet) {
      flushParagraph();
      bullets.push(bullet[1] ?? '');
      continue;
    }

    flushBullets();
    paragraph.push(line.trim());
  }

  flushAll();
  return blocks;
}

/** Quita el énfasis y los enlaces de Markdown, conservando el texto. */
function stripInline(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/(^|\s)\*([^*]+)\*/g, '$1$2')
    .replace(/`([^`]+)`/g, '$1')
    .trim();
}

/** Busca un documento por identificador. Devuelve `undefined` si no existe. */
export function findLegalDocument(
  documents: readonly LegalDocument[],
  id: string,
): LegalDocument | undefined {
  return documents.find((document) => document.id === id);
}
