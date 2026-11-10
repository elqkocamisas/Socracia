import { bytesToBase64, isOcrImage, OCR_IMAGE_MIME_TYPES } from '../ingest/ocr';

/**
 * El puerto de OCR y sus utilidades son puros: se prueban sin red ni plataforma.
 * La codificación base64 debe coincidir con la estándar porque es lo que viaja
 * al backend; `isOcrImage` decide qué archivos toman ese camino.
 */
describe('isOcrImage', () => {
  it('reconoce imágenes por tipo MIME', () => {
    for (const mime of OCR_IMAGE_MIME_TYPES) {
      expect(isOcrImage(mime, 'captura.bin')).toBe(true);
    }
  });

  it('reconoce imágenes por extensión cuando falta el MIME', () => {
    expect(isOcrImage('', 'foto.PNG')).toBe(true);
    expect(isOcrImage('application/octet-stream', 'escaneo.jpeg')).toBe(true);
    expect(isOcrImage('', 'apuntes.heic')).toBe(true);
  });

  it('no clasifica como imagen un PDF ni un texto', () => {
    expect(isOcrImage('application/pdf', 'tema.pdf')).toBe(false);
    expect(isOcrImage('text/plain', 'tema.txt')).toBe(false);
    expect(isOcrImage('', 'tema.md')).toBe(false);
  });
});

describe('bytesToBase64', () => {
  it('codifica igual que la implementación estándar', () => {
    const cases = [
      new Uint8Array([]),
      new Uint8Array([0]),
      new Uint8Array([0, 0]),
      new Uint8Array([0, 0, 0]),
      new Uint8Array([255, 255, 255]),
      new Uint8Array([72, 111, 108, 97]),
      new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    ];
    for (const bytes of cases) {
      const expected = Buffer.from(bytes).toString('base64');
      expect(bytesToBase64(bytes)).toBe(expected);
    }
  });

  it('produce salida idéntica para una secuencia larga', () => {
    const bytes = new Uint8Array(1000);
    for (let i = 0; i < bytes.length; i += 1) {
      bytes[i] = (i * 37) % 256;
    }
    expect(bytesToBase64(bytes)).toBe(Buffer.from(bytes).toString('base64'));
  });
});
