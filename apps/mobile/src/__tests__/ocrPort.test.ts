/**
 * @jest-environment node
 */
import type { Result } from '@socracia/core';

import { HttpOcrPort } from '../services/ocrPort';
import type { HttpSyncClient } from '../services/httpSyncClient';

/**
 * El puerto OCR del cliente se prueba con un doble del cliente HTTP: se
 * comprueba la codificación base64, el tipo MIME resuelto, el tope de tamaño y
 * la traducción de fallos, sin red ni backend.
 */
class StubClient {
  public lastMime = '';
  public lastBase64 = '';
  public constructor(
    private readonly result: Result<{ readonly text: string }, { code: string; message: string }>,
  ) {}
  public async recognizeText(
    mimeType: string,
    imageBase64: string,
  ): Promise<Result<{ readonly text: string }, { code: string; message: string }>> {
    this.lastMime = mimeType;
    this.lastBase64 = imageBase64;
    return this.result;
  }
}

function asClient(stub: StubClient): HttpSyncClient {
  return stub as unknown as HttpSyncClient;
}

describe('HttpOcrPort', () => {
  it('codifica la imagen en base64 y resuelve el MIME por extensión', async () => {
    const stub = new StubClient({ ok: true, value: { text: '  Texto reconocido  ' } });
    const port = new HttpOcrPort({ client: asClient(stub) });
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    const result = await port.recognize({ fileName: 'captura.png', mimeType: '', bytes });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.text).toBe('Texto reconocido');
    }
    expect(stub.lastMime).toBe('image/png');
    // Base64 de [0x89, 0x50, 0x4e, 0x47] («PNG»), calculado fuera del entorno
    // de pruebas: en el móvil no hay tipos de Node y `Buffer` no existe.
    expect(stub.lastBase64).toBe('iVBORw==');
  });

  it('normaliza image/jpg a image/jpeg', async () => {
    const stub = new StubClient({ ok: true, value: { text: 'ok' } });
    const port = new HttpOcrPort({ client: asClient(stub) });
    await port.recognize({
      fileName: 'foto.jpg',
      mimeType: 'image/jpg',
      bytes: new Uint8Array([1]),
    });
    expect(stub.lastMime).toBe('image/jpeg');
  });

  it('rechaza una imagen demasiado grande sin llamar al servidor', async () => {
    const stub = new StubClient({ ok: true, value: { text: 'x' } });
    const port = new HttpOcrPort({ client: asClient(stub), maxBytes: 4 });
    const result = await port.recognize({
      fileName: 'grande.png',
      mimeType: 'image/png',
      bytes: new Uint8Array([1, 2, 3, 4, 5]),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('demasiado-grande');
    }
    expect(stub.lastBase64).toBe('');
  });

  it('traduce un fallo del cliente a `ocr-fallido`', async () => {
    const stub = new StubClient({
      ok: false,
      error: { code: 'sin-sesion', message: 'Sin sesión.' },
    });
    const port = new HttpOcrPort({ client: asClient(stub) });
    const result = await port.recognize({
      fileName: 'x.png',
      mimeType: 'image/png',
      bytes: new Uint8Array([1]),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('ocr-fallido');
      expect(result.error.message).toBe('Sin sesión.');
    }
  });

  it('trata un texto vacío como fallo de reconocimiento', async () => {
    const stub = new StubClient({ ok: true, value: { text: '   ' } });
    const port = new HttpOcrPort({ client: asClient(stub) });
    const result = await port.recognize({
      fileName: 'x.png',
      mimeType: 'image/png',
      bytes: new Uint8Array([1]),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('ocr-fallido');
    }
  });
});
