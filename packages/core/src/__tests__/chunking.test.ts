import { chunkText, normalizeText, DEFAULT_CHUNK_OPTIONS } from '../rag/chunking';

describe('normalizeText', () => {
  it('unifica saltos de línea y colapsa espacios', () => {
    expect(normalizeText('Hola\r\n   mundo\t\tcruel\n\n\n\nfin')).toBe('Hola mundo cruel\n\nfin');
  });

  it('une líneas de un mismo párrafo con espacio', () => {
    expect(normalizeText('línea uno\nlínea dos')).toBe('línea uno línea dos');
  });

  it('conserva la separación entre párrafos', () => {
    expect(normalizeText('párrafo uno\n\npárrafo dos')).toBe('párrafo uno\n\npárrafo dos');
  });

  it('recorta los extremos', () => {
    expect(normalizeText('   texto   ')).toBe('texto');
  });
});

describe('chunkText', () => {
  const sentence =
    'El principio de legalidad exige que la Administración actúe conforme a la ley. ';
  const longText = sentence.repeat(20);

  it('devuelve lista vacía para texto vacío', () => {
    expect(chunkText('doc', '   ')).toEqual([]);
  });

  it('genera fragmentos con identificadores y ordinales estables', () => {
    const chunks = chunkText('doc-1', longText);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0]?.id).toBe('doc-1:0');
    expect(chunks[0]?.ordinal).toBe(0);
    expect(chunks[1]?.ordinal).toBe(1);
  });

  it('respeta el tamaño máximo de fragmento', () => {
    const chunks = chunkText('doc-1', longText, { maxChars: 200, overlapChars: 40, minChars: 20 });
    for (const chunk of chunks) {
      expect(chunk.text.length).toBeLessThanOrEqual(200);
    }
  });

  it('produce rangos de caracteres coherentes con el texto', () => {
    const normalized = normalizeText(longText);
    const chunks = chunkText('doc-1', longText);
    for (const chunk of chunks) {
      expect(normalized.slice(chunk.charStart, chunk.charEnd)).toBe(chunk.text);
    }
  });

  it('descarta fragmentos por debajo del mínimo', () => {
    const chunks = chunkText('doc-1', 'Corto.', DEFAULT_CHUNK_OPTIONS);
    expect(chunks).toEqual([]);
  });
});
