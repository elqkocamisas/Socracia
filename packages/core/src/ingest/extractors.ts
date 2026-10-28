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

/** Extrae los literales de texto de un operador `Tj` o `TJ` de un flujo de contenido. */
function extractFromContentStream(content: string): string {
  let out = '';
  // Recorre los literales entre paréntesis que preceden a Tj/TJ.
  let i = 0;
  while (i < content.length) {
    const open = content.indexOf('(', i);
    if (open === -1) {
      break;
    }
    let depth = 1;
    let j = open + 1;
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
    const decoded = decodePdfLiteral(literal);
    // Mira hacia delante para ver si el literal es texto mostrado.
    const after = content.slice(j + 1, j + 4);
    if (/^\s*(Tj|TJ|')/.test(after)) {
      out += decoded;
    }
    i = j + 1;
  }
  // Los saltos de línea de PDF vienen de Td/TD/T*/ET: se aproximan por espacio.
  return out.replace(/\s+/g, ' ').trim();
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
      const end = raw.indexOf('endstream', start);
      if (end === -1) {
        break;
      }
      const dictionary = raw.slice(Math.max(0, match.index - 400), match.index);
      const isFlate = /\/Filter\s*(?:\[\s*)?\/FlateDecode/.test(dictionary);
      const segment = bytes.subarray(start, end);

      if (!isFlate) {
        streams.push(decodeLatin1(segment));
      } else if (this.inflate) {
        try {
          streams.push(decodeLatin1(this.inflate(stripTrailingNewline(segment))));
        } catch {
          // Flujo ilegible: se ignora y se continúa con el resto del documento.
        }
      }
      match = pattern.exec(raw);
    }
    return streams;
  }
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
