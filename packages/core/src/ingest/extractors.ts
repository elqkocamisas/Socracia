import type { Result } from '../result';
import { err, ok } from '../result';

/** Descompresor de flujo PDF (FlateDecode). Inyectable para no atar el núcleo a una plataforma. */
export type Inflate = (data: Uint8Array) => Uint8Array;

/** Extractor de texto de un formato documental concreto. */
export interface TextExtractor {
  readonly id: string;
  /** `true` si este extractor sabe leer el documento descrito. */
  supports(mimeType: string, fileName: string): boolean;
  /** Extrae texto plano. Devuelve `Result` porque los documentos son entrada hostil. */
  extract(bytes: Uint8Array): Result<string, IngestError>;
}

/** Error de ingesta con código estable para poder mapearlo a mensajes de UI. */
export interface IngestError {
  readonly code:
    | 'formato-no-soportado'
    | 'texto-vacio'
    | 'pdf-corrupto'
    | 'pdf-sin-texto'
    | 'extraccion-fallida';
  readonly message: string;
}

const TEXT_MIME_TYPES = new Set([
  'text/plain',
  'text/markdown',
  'text/x-markdown',
  'application/octet-stream',
]);

const TEXT_EXTENSIONS = ['.txt', '.md', '.markdown', '.text'];

const PDF_MIME_TYPES = new Set(['application/pdf']);
const PDF_EXTENSIONS = ['.pdf'];

/** Decodifica bytes UTF-8 con reserva a Latin-1 si la secuencia es inválida. */
export function decodeUtf8(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    let out = '';
    for (const byte of bytes) {
      out += String.fromCharCode(byte);
    }
    return out;
  }
}

/** Extractor para texto plano y Markdown. */
export class PlainTextExtractor implements TextExtractor {
  public readonly id = 'plain-text';

  public supports(mimeType: string, fileName: string): boolean {
    const lowerName = fileName.toLowerCase();
    return (
      TEXT_MIME_TYPES.has(mimeType.toLowerCase()) ||
      TEXT_EXTENSIONS.some((extension) => lowerName.endsWith(extension))
    );
  }

  public extract(bytes: Uint8Array): Result<string, IngestError> {
    const text = decodeUtf8(bytes)
      .replace(/^\uFEFF/, '')
      .trim();
    if (text.length === 0) {
      return err<IngestError>({ code: 'texto-vacio', message: 'El documento no contiene texto.' });
    }
    return ok(text);
  }
}

/** Decodifica el texto de un literal PDF `(…)`, resolviendo escapes y octales. */
function decodePdfLiteral(raw: string): string {
  let out = '';
  for (let i = 0; i < raw.length; i += 1) {
    const char = raw[i] as string;
    if (char !== '\\') {
      out += char;
      continue;
    }
    const next = raw[i + 1];
    switch (next) {
      case 'n':
        out += '\n';
        i += 1;
        break;
      case 'r':
        out += '\r';
        i += 1;
        break;
      case 't':
        out += '\t';
        i += 1;
        break;
      case 'b':
      case 'f':
        i += 1;
        break;
      case '(':
      case ')':
      case '\\':
        out += next;
        i += 1;
        break;
      default: {
        const octal = /^[0-7]{1,3}/.exec(raw.slice(i + 1));
        if (octal) {
          out += String.fromCharCode(parseInt(octal[0], 8));
          i += octal[0].length;
        }
      }
    }
  }
  return out;
}

/**
 * Operadores que separan párrafos: abren/cierran un objeto de texto o colocan
 * el cursor en una nueva posición. `T*` (y `'`/`"`) solo avanzan a la línea
 * siguiente dentro del mismo párrafo, así que no cuentan: un párrafo partido por
 * el ancho de página se reconstruye uniendo sus líneas con un espacio.
 */
const PARAGRAPH_BREAK = /\b(?:BT|ET|Td|TD|Tm)\b/;

/**
 * Umbral (milésimas de em) a partir del cual un ajuste numérico dentro de un
 * array `TJ` se interpreta como un espacio entre palabras. Un espacio mide
 * ~250; el kerning entre letras rara vez supera 100. Como ambos escalan con el
 * tamaño de fuente, el umbral no depende de este.
 */
const TJ_SPACE_THRESHOLD = 200;

interface PdfString {
  readonly value: string;
  readonly nextIndex: number;
}

/** Lee un literal `(…)` o una cadena hexadecimal `<…>` a partir de `start`. */
function parsePdfString(content: string, start: number): PdfString | null {
  const opener = content[start];

  if (opener === '(') {
    let depth = 1;
    let j = start + 1;
    let literal = '';
    while (j < content.length && depth > 0) {
      const char = content[j] as string;
      if (char === '\\') {
        literal += char + (content[j + 1] ?? '');
        j += 2;
        continue;
      }
      if (char === '(') {
        depth += 1;
      } else if (char === ')') {
        depth -= 1;
        if (depth === 0) {
          break;
        }
      }
      literal += char;
      j += 1;
    }
    if (depth !== 0) {
      return null;
    }
    return { value: decodePdfLiteral(literal), nextIndex: j + 1 };
  }

  if (opener === '<') {
    // `<<` abre un diccionario, no una cadena hexadecimal.
    if (content[start + 1] === '<') {
      return null;
    }
    const end = content.indexOf('>', start + 1);
    if (end === -1) {
      return null;
    }
    return { value: decodePdfHex(content.slice(start + 1, end)), nextIndex: end + 1 };
  }

  return null;
}

/** Decodifica una cadena hexadecimal PDF (pares de dígitos, sin espacios). */
function decodePdfHex(hex: string): string {
  const clean = hex.replace(/\s+/g, '');
  let out = '';
  for (let i = 0; i + 1 < clean.length; i += 2) {
    const code = parseInt(clean.slice(i, i + 2), 16);
    if (!Number.isNaN(code)) {
      out += String.fromCharCode(code);
    }
  }
  return out;
}

/** Operador que muestra el texto que le precede (`Tj`, `TJ` o `'`). */
function shownTextOperator(content: string, index: number): string | null {
  const match = /^\s*(Tj|TJ|')/.exec(content.slice(index));
  return match ? (match[1] as string) : null;
}

/**
 * Lee un array `TJ`: concatena sus cadenas e inserta un espacio cuando el
 * ajuste numérico entre dos fragmentos supera el umbral de una palabra.
 *
 * Los generadores reales (Word, Chrome, LaTeX) parten cada línea en muchos
 * fragmentos con kerning; sin interpretar el array, un PDF legible se detectaba
 * como escaneo sin texto.
 */
function parseTjArray(content: string, start: number): PdfString | null {
  let i = start + 1;
  let value = '';
  let sawString = false;
  let pendingSpace = false;

  while (i < content.length) {
    const char = content[i] as string;

    if (char === ']') {
      const tail = /^\s*TJ\b/.exec(content.slice(i + 1));
      if (!tail || !sawString) {
        return null;
      }
      return { value, nextIndex: i + 1 + tail[0].length };
    }

    if (char === '(' || char === '<') {
      const string = parsePdfString(content, i);
      if (!string) {
        return null;
      }
      if (sawString && pendingSpace) {
        value += ' ';
      }
      value += string.value;
      sawString = true;
      pendingSpace = false;
      i = string.nextIndex;
      continue;
    }

    const number = /^[+-]?\d*\.?\d+/.exec(content.slice(i));
    if (number) {
      if (Math.abs(Number.parseFloat(number[0])) >= TJ_SPACE_THRESHOLD) {
        pendingSpace = true;
      }
      i += number[0].length;
      continue;
    }

    i += 1;
  }

  return null;
}

/**
 * Extrae el texto mostrado de un flujo de contenido PDF.
 *
 * Reconoce los tres modos habituales de mostrar texto: `(literal) Tj`, arrays
 * `[(a) -250 (b)] TJ` (kerning) y cadenas hexadecimales `<…> Tj`. Los
 * generadores reales (Word, Chrome, LaTeX) usan arrays `TJ`; ignorarlos hacía
 * que un PDF legible se detectara como escaneo sin texto.
 *
 * La estructura de líneas importa: un encabezado pegado al párrafo siguiente
 * hace que la extracción de conceptos pierda el límite del tema. Por eso cada
 * avance de línea (`Td`, `TD`, `T*`, `Tm`) o cambio de objeto de texto (`BT…ET`)
 * se separa con una línea en blanco, y los fragmentos de una misma línea se
 * unen con un espacio.
 */
function extractFromContentStream(content: string): string {
  let out = '';
  let previousEnd = 0;
  let started = false;
  let i = 0;

  const emit = (text: string, from: number): void => {
    if (text.length === 0) {
      return;
    }
    const boundary = PARAGRAPH_BREAK.test(content.slice(previousEnd, from)) ? '\n\n' : ' ';
    out += started ? boundary + text : text;
    started = true;
  };

  while (i < content.length) {
    const char = content[i] as string;

    if (char === '<' && content[i + 1] === '<') {
      i += 2;
      continue;
    }

    if (char === '[') {
      const array = parseTjArray(content, i);
      if (array) {
        emit(array.value, i);
        previousEnd = array.nextIndex;
        i = array.nextIndex;
        continue;
      }
      i += 1;
      continue;
    }

    if (char === '(' || char === '<') {
      const string = parsePdfString(content, i);
      if (string && shownTextOperator(content, string.nextIndex) !== null) {
        emit(string.value, i);
        previousEnd = string.nextIndex;
        i = string.nextIndex;
        continue;
      }
      i += 1;
      continue;
    }

    i += 1;
  }

  return out
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Extractor de texto PDF mínimo pero real.
 *
 * Soporta PDF con flujos sin comprimir y con FlateDecode, siempre que el
 * llamante inyecte un `Inflate` (Node: `zlib.inflateSync`; React Native:
 * una implementación en JS puro). No interpreta fuentes con codificación
 * personalizada ni ToUnicode CMaps: es una limitación conocida y documentada.
 */
export class PdfTextExtractor implements TextExtractor {
  public readonly id = 'pdf-minimal';

  public constructor(private readonly inflate: Inflate | null = null) {}

  public supports(mimeType: string, fileName: string): boolean {
    return (
      PDF_MIME_TYPES.has(mimeType.toLowerCase()) ||
      PDF_EXTENSIONS.some((extension) => fileName.toLowerCase().endsWith(extension))
    );
  }

  public extract(bytes: Uint8Array): Result<string, IngestError> {
    if (bytes.length < 5 || decodeAscii(bytes, 0, 5) !== '%PDF-') {
      return err<IngestError>({
        code: 'pdf-corrupto',
        message: 'El archivo no es un PDF válido.',
      });
    }

    const raw = decodeLatin1(bytes);
    const streams = this.collectContentStreams(raw, bytes);
    if (streams.length === 0) {
      return err<IngestError>({
        code: 'pdf-sin-texto',
        message: 'El PDF no contiene flujos de texto legibles.',
      });
    }

    const pieces: string[] = [];
    for (const stream of streams) {
      const text = extractFromContentStream(stream);
      if (text.length > 0) {
        pieces.push(text);
      }
    }

    const joined = pieces.join('\n\n').trim();
    if (joined.length === 0) {
      return err<IngestError>({
        code: 'pdf-sin-texto',
        message: 'El PDF no contiene texto extraíble (puede ser un escaneo).',
      });
    }
    return ok(joined);
  }

  /** Localiza los flujos de contenido y los descomprime si es necesario. */
  private collectContentStreams(raw: string, bytes: Uint8Array): string[] {
    const streams: string[] = [];
    const pattern = /stream\r?\n?/g;
    let match = pattern.exec(raw);
    while (match !== null) {
      const start = match.index + match[0].length;
      const dictionary = raw.slice(Math.max(0, match.index - 400), match.index);
      const length = declaredStreamLength(dictionary);
      const end = length !== null ? start + length : raw.indexOf('endstream', start);
      if (end === -1 || end > raw.length) {
        break;
      }
      const segment = stripTrailingNewline(bytes.subarray(start, end));
      const text = this.decodeStream(segment, parsePdfFilters(dictionary));
      if (text !== null) {
        streams.push(text);
      }
      // No buscar «stream» dentro de los datos binarios ya consumidos.
      pattern.lastIndex = end;
      match = pattern.exec(raw);
    }
    return streams;
  }

  /** Aplica la cadena de filtros del diccionario y devuelve el texto o `null`. */
  private decodeStream(segment: Uint8Array, filters: readonly string[]): string | null {
    let data = segment;
    for (const filter of filters) {
      if (filter === 'ASCII85Decode') {
        const decoded = ascii85Decode(data);
        if (decoded === null) {
          return null;
        }
        data = decoded;
      } else if (filter === 'FlateDecode') {
        if (!this.inflate) {
          return null;
        }
        try {
          data = this.inflate(data);
        } catch {
          return null;
        }
      } else {
        // Filtro no soportado (imágenes, LZW…): el flujo no es texto.
        return null;
      }
    }
    return decodeLatin1(data);
  }
}

/** Cadena de filtros declarada en el diccionario, en orden de aplicación. */
function parsePdfFilters(dictionary: string): string[] {
  const match = /\/Filter\s*(\[[^\]]*\]|\/\w+)/.exec(dictionary);
  if (!match) {
    return [];
  }
  return [...(match[1] as string).matchAll(/\/(\w+)/g)].map((entry) => entry[1] as string);
}

/** Longitud declarada del flujo (`/Length`), o `null` si es indirecta o falta. */
function declaredStreamLength(dictionary: string): number | null {
  const match = /\/Length\s+(\d+)(?!\s+\d+\s+R)/.exec(dictionary);
  return match ? Number.parseInt(match[1] as string, 10) : null;
}

/**
 * Decodifica un flujo ASCII85 (`<~…~>`), el filtro que muchos generadores
 * anteponen a FlateDecode. Devuelve `null` si el flujo no es válido.
 *
 * Se implementa en JavaScript puro para que funcione igual en Hermes: no hay
 * un decodificador nativo disponible en React Native.
 */
function ascii85Decode(data: Uint8Array): Uint8Array | null {
  let text = '';
  const chunk = 8192;
  for (let i = 0; i < data.length; i += chunk) {
    text += String.fromCharCode(...data.subarray(i, Math.min(i + chunk, data.length)));
  }
  text = text.trim();
  if (text.startsWith('<~')) {
    text = text.slice(2);
  }
  const end = text.indexOf('~>');
  if (end !== -1) {
    text = text.slice(0, end);
  }

  const out: number[] = [];
  let tuple = 0;
  let count = 0;
  for (const char of text) {
    const code = char.charCodeAt(0);
    if (code === 0x7a && count === 0) {
      // `z` es una abreviatura de cuatro bytes nulos.
      out.push(0, 0, 0, 0);
      continue;
    }
    if (code < 33 || code > 117) {
      if (code === 0x20 || code === 0x0a || code === 0x0d || code === 0x09) {
        continue;
      }
      return null;
    }
    tuple = tuple * 85 + (code - 33);
    count += 1;
    if (count === 5) {
      out.push((tuple >>> 24) & 0xff, (tuple >>> 16) & 0xff, (tuple >>> 8) & 0xff, tuple & 0xff);
      tuple = 0;
      count = 0;
    }
  }
  if (count > 0) {
    for (let i = count; i < 5; i += 1) {
      tuple = tuple * 85 + 84;
    }
    const bytes4 = [
      (tuple >>> 24) & 0xff,
      (tuple >>> 16) & 0xff,
      (tuple >>> 8) & 0xff,
      tuple & 0xff,
    ];
    out.push(...bytes4.slice(0, count - 1));
  }
  return new Uint8Array(out);
}

function stripTrailingNewline(segment: Uint8Array): Uint8Array {
  let end = segment.length;
  while (end > 0 && (segment[end - 1] === 0x0a || segment[end - 1] === 0x0d)) {
    end -= 1;
  }
  return segment.subarray(0, end);
}

function decodeLatin1(bytes: Uint8Array): string {
  let out = '';
  const chunk = 8192;
  for (let i = 0; i < bytes.length; i += chunk) {
    out += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunk, bytes.length)));
  }
  return out;
}

function decodeAscii(bytes: Uint8Array, start: number, length: number): string {
  let out = '';
  for (let i = start; i < Math.min(start + length, bytes.length); i += 1) {
    out += String.fromCharCode(bytes[i] as number);
  }
  return out;
}

/**
 * Registro de extractores por formato.
 *
 * La app resuelve el extractor adecuado sin conocer los formatos concretos y
 * puede añadir nuevos (EPUB, DOCX) sin tocar el pipeline de ingesta.
 */
export class ExtractorRegistry {
  private readonly extractors: TextExtractor[] = [];

  public constructor(extractors: readonly TextExtractor[] = []) {
    for (const extractor of extractors) {
      this.register(extractor);
    }
  }

  /** Añade un extractor. Los últimos registrados tienen prioridad. */
  public register(extractor: TextExtractor): void {
    this.extractors.unshift(extractor);
  }

  /** Extractores registrados, en orden de prioridad. */
  public list(): readonly TextExtractor[] {
    return [...this.extractors];
  }

  /** Extrae el texto de un documento usando el primer extractor compatible. */
  public extract(
    mimeType: string,
    fileName: string,
    bytes: Uint8Array,
  ): Result<string, IngestError> {
    const extractor = this.extractors.find((candidate) => candidate.supports(mimeType, fileName));
    if (!extractor) {
      return err<IngestError>({
        code: 'formato-no-soportado',
        message: `Formato no soportado: ${mimeType || fileName}. Usa PDF, TXT o MD.`,
      });
    }
    return extractor.extract(bytes);
  }
}

/** Registro por defecto: texto plano y PDF. */
export function defaultRegistry(inflate: Inflate | null = null): ExtractorRegistry {
  return new ExtractorRegistry([new PdfTextExtractor(inflate), new PlainTextExtractor()]);
}
