import { buildPdf } from '../__fixtures__/buildPdf';
import {
  decodeUtf8,
  ExtractorRegistry,
  PdfTextExtractor,
  PlainTextExtractor,
  defaultRegistry,
} from '../ingest/extractors';
import { fflateInflate } from '../ingest/inflate';

const encoder = new TextEncoder();

describe('decodeUtf8', () => {
  it('decodifica UTF-8 con acentos', () => {
    expect(decodeUtf8(encoder.encode('jerarquía normativa'))).toBe('jerarquía normativa');
  });

  it('cae a Latin-1 si la secuencia es inválida', () => {
    expect(decodeUtf8(new Uint8Array([0xff, 0xfe, 0x41]))).toContain('A');
  });
});

describe('PlainTextExtractor', () => {
  const extractor = new PlainTextExtractor();

  it('reconoce texto plano y markdown por extensión', () => {
    expect(extractor.supports('text/plain', 'tema.txt')).toBe(true);
    expect(extractor.supports('application/octet-stream', 'tema.md')).toBe(true);
    expect(extractor.supports('', 'TEMA.MD')).toBe(true);
  });

  it('no reclama un PDF', () => {
    expect(extractor.supports('application/pdf', 'tema.pdf')).toBe(false);
  });

  it('extrae el texto y quita el BOM', () => {
    const result = extractor.extract(encoder.encode('\uFEFFEl recurso de alzada se interpone.'));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe('El recurso de alzada se interpone.');
    }
  });

  it('falla con un documento vacío', () => {
    const result = extractor.extract(encoder.encode('   \n  '));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('texto-vacio');
    }
  });
});

describe('PdfTextExtractor', () => {
  const extractor = new PdfTextExtractor(fflateInflate);
  const lines = [
    'El acto administrativo es la declaracion unilateral de voluntad.',
    'La eficacia despliega efectos desde la notificacion.',
  ];

  it('reconoce PDF por MIME y por extensión', () => {
    expect(extractor.supports('application/pdf', 'x')).toBe(true);
    expect(extractor.supports('', 'temario.PDF')).toBe(true);
    expect(extractor.supports('text/plain', 'x.txt')).toBe(false);
  });

  it('extrae texto de un PDF con FlateDecode', () => {
    const result = extractor.extract(buildPdf(lines, { compress: true }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toContain('declaracion unilateral');
      expect(result.value).toContain('notificacion');
    }
  });

  it('extrae texto de un PDF sin comprimir', () => {
    const result = extractor.extract(buildPdf(lines, { compress: false }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toContain('declaracion unilateral');
    }
  });

  it('resuelve paréntesis escapados en el literal', () => {
    const result = extractor.extract(buildPdf(['Art. 14 (CE) es clave'], { compress: false }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toContain('(CE)');
    }
  });

  it('rechaza un archivo que no es PDF', () => {
    const result = extractor.extract(encoder.encode('no soy un pdf'));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('pdf-corrupto');
    }
  });

  it('sin inflate, un PDF comprimido no produce texto', () => {
    const noInflate = new PdfTextExtractor(null);
    const result = noInflate.extract(buildPdf(lines, { compress: true }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('pdf-sin-texto');
    }
  });

  it('un PDF sin flujos de contenido devuelve error legible', () => {
    const empty = new Uint8Array(Buffer.from('%PDF-1.4\n%%EOF\n', 'latin1'));
    const result = extractor.extract(empty);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('pdf-sin-texto');
    }
  });
});

describe('ExtractorRegistry', () => {
  it('elige el extractor por MIME', () => {
    const registry = defaultRegistry(fflateInflate);
    const result = registry.extract('application/pdf', 'tema.pdf', buildPdf(['Hola mundo']));
    expect(result.ok).toBe(true);
  });

  it('falla con formato no soportado y mensaje útil', () => {
    const registry = defaultRegistry(fflateInflate);
    const result = registry.extract('application/vnd.ms-excel', 'notas.xls', encoder.encode('x'));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('formato-no-soportado');
      expect(result.error.message).toContain('PDF, TXT o MD');
    }
  });

  it('el último extractor registrado tiene prioridad', () => {
    const registry = new ExtractorRegistry([new PlainTextExtractor()]);
    registry.register(new PdfTextExtractor(fflateInflate));
    expect(registry.list()[0]?.id).toBe('pdf-minimal');
  });
});
