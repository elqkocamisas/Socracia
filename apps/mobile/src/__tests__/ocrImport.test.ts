/**
 * @jest-environment node
 */
import {
  inMemoryStorage,
  ok,
  type OcrPort,
  type OcrRequest,
  type OcrResult,
  type OcrError,
  type Result,
  type StoragePort,
} from '@socracia/core';

import { createServices, importDocument, type AppServices } from '../services/appServices';
import { HttpSyncClient } from '../services/httpSyncClient';
import type { FileBytesReader, PickedFile } from '../services/documentImport';

/**
 * Camino OCR de la importación, extremo a extremo y sin red.
 *
 * Se usa un `OcrPort` doble para comprobar el contrato real: qué archivos toman
 * el camino OCR, que el texto reconocido entra en el pipeline de ingesta y que
 * sin consentimiento o sin OCR se devuelve un error claro sin romper nada.
 */
const encoder = new TextEncoder();
const NOW = 1_700_000_000_000;

const RECOGNIZED_TEXT = `Tema 1. La notificación

La notificación es la comunicación formal del acto administrativo al interesado para que despliegue efectos.`;

class FakeOcr implements OcrPort {
  public calls = 0;
  public constructor(
    private readonly result: Result<OcrResult, OcrError> = {
      ok: true,
      value: { text: RECOGNIZED_TEXT },
    },
  ) {}
  public async recognize(_request: OcrRequest): Promise<Result<OcrResult, OcrError>> {
    this.calls += 1;
    return this.result;
  }
}

function makeOcrServices(
  ocr: OcrPort | null,
  storage: StoragePort = inMemoryStorage(),
): AppServices {
  const reader: FileBytesReader = {
    read: async () => ok(new Uint8Array([0x89, 0x50, 0x4e, 0x47])),
  };
  return createServices({
    storage,
    picker: { pick: async () => null },
    reader,
    cloudAvailable: true,
    syncClient: new HttpSyncClient({ baseUrl: 'http://localhost:8787', token: 'test-token' }),
    policy: { mode: 'allow-cloud' },
    ocr,
  });
}

const imageFile: PickedFile = {
  name: 'apunte.png',
  mimeType: 'image/png',
  uri: 'file:///apunte.png',
  sizeBytes: 4,
};

describe('importación por OCR', () => {
  it('una imagen con OCR y consentimiento se importa e indexa', async () => {
    const ocr = new FakeOcr();
    const services = makeOcrServices(ocr);
    const result = await importDocument(services, imageFile, NOW);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.title).toBe('apunte');
      expect(result.value.conceptCount).toBeGreaterThan(0);
    }
    expect(ocr.calls).toBe(1);

    const documents = await services.storage.documents.listDocuments();
    expect(documents[0]?.mimeType).toBe('image/png');
    expect(documents[0]?.cloudConsent).toBe(true);
  });

  it('sin OCR en el build devuelve `ocr-no-disponible`', async () => {
    const services = makeOcrServices(null);
    const result = await importDocument(services, imageFile, NOW);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('ocr-no-disponible');
    }
  });

  it('sin consentimiento no se llama al OCR y se avisa al usuario', async () => {
    const ocr = new FakeOcr();
    const reader: FileBytesReader = { read: async () => ok(new Uint8Array([0x89, 0x50])) };
    const services = createServices({
      storage: inMemoryStorage(),
      picker: { pick: async () => null },
      reader,
      cloudAvailable: true,
      syncClient: new HttpSyncClient({ baseUrl: 'http://localhost:8787' }),
      ocr,
    });
    const result = await importDocument(services, imageFile, NOW);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('ocr-no-disponible');
    }
    expect(ocr.calls).toBe(0);
  });

  it('un fallo del OCR se traduce a `ocr-fallido` sin romper la importación', async () => {
    const ocr = new FakeOcr({
      ok: false,
      error: { code: 'ocr-fallido', message: 'No se reconoció texto en la imagen.' },
    });
    const services = makeOcrServices(ocr);
    const result = await importDocument(services, imageFile, NOW);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('ocr-fallido');
    }
  });

  it('un TXT con texto no toma el camino OCR', async () => {
    const ocr = new FakeOcr();
    const reader: FileBytesReader = {
      read: async () => ok(encoder.encode('Tema 1. X\n\nTexto. ')),
    };
    const services = createServices({
      storage: inMemoryStorage(),
      picker: { pick: async () => null },
      reader,
      cloudAvailable: true,
      syncClient: new HttpSyncClient({ baseUrl: 'http://localhost:8787', token: 't' }),
      policy: { mode: 'allow-cloud' },
      ocr,
    });
    const result = await importDocument(
      services,
      { name: 'tema.txt', mimeType: 'text/plain', uri: 'file:///tema.txt', sizeBytes: 10 },
      NOW,
    );
    expect(result.ok).toBe(true);
    expect(ocr.calls).toBe(0);
  });
});
