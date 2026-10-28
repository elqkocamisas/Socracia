import type { KnowledgeChunk } from '../domain/types';

/** Opciones de troceado (chunking) de texto. */
export interface ChunkOptions {
  /** Tamaño objetivo del fragmento en caracteres. */
  readonly maxChars: number;
  /** Solapamiento entre fragmentos consecutivos para no perder contexto. */
  readonly overlapChars: number;
  /** Longitud mínima; fragmentos más cortos se descartan como ruido. */
  readonly minChars: number;
}

/** Configuración por defecto, ajustada a temarios densos en español. */
export const DEFAULT_CHUNK_OPTIONS: ChunkOptions = {
  maxChars: 900,
  overlapChars: 150,
  minChars: 40,
};

/**
 * Normaliza el texto extraído de un documento.
 *
 * Une las líneas de un mismo párrafo con un espacio y conserva la separación
 * entre párrafos como doble salto de línea. Así los fragmentos no arrastran
 * cortes de línea arbitrarios del PDF de origen, pero se mantienen las
 * fronteras semánticas que guían el troceado.
 */
export function normalizeText(raw: string): string {
  return raw
    .replace(/\r\n?/g, '\n')
    .split(/\n[ \t]*\n/)
    .map((paragraph) =>
      paragraph
        .split('\n')
        .map((line) => line.replace(/[ \t]+/g, ' ').trim())
        .filter((line) => line.length > 0)
        .join(' '),
    )
    .filter((paragraph) => paragraph.length > 0)
    .join('\n\n');
}

/**
 * Divide el texto en fragmentos respetando fronteras de frase cuando es posible.
 *
 * El algoritmo es determinista: recorre el texto, corta en el último separador
 * de frase dentro de la ventana y avanza con solapamiento. La trazabilidad se
 * conserva guardando `charStart`/`charEnd` sobre el texto normalizado.
 */
export function chunkText(
  documentId: string,
  rawText: string,
  options: ChunkOptions = DEFAULT_CHUNK_OPTIONS,
): KnowledgeChunk[] {
  const text = normalizeText(rawText);
  if (text.length === 0) {
    return [];
  }

  const chunks: KnowledgeChunk[] = [];
  const step = Math.max(1, options.maxChars - options.overlapChars);
  let start = 0;
  let ordinal = 0;

  while (start < text.length) {
    const hardEnd = Math.min(start + options.maxChars, text.length);
    const end = hardEnd === text.length ? hardEnd : findSentenceBoundary(text, start, hardEnd);
    const slice = text.slice(start, end).trim();

    if (slice.length >= options.minChars) {
      const trimmedStart = text.indexOf(slice, start);
      chunks.push({
        id: `${documentId}:${ordinal}`,
        documentId,
        text: slice,
        ordinal,
        charStart: trimmedStart,
        charEnd: trimmedStart + slice.length,
      });
      ordinal += 1;
    }

    if (end >= text.length) {
      break;
    }
    start = Math.max(start + step, end - options.overlapChars);
  }

  return chunks;
}

const SENTENCE_END = /[.!?;:]\s/;

function findSentenceBoundary(text: string, start: number, hardEnd: number): number {
  const window = text.slice(start, hardEnd);
  const match = SENTENCE_END.exec(window);
  if (!match) {
    return hardEnd;
  }
  return start + match.index + match[0].length;
}
