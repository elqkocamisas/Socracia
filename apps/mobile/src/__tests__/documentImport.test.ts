import { inMemoryStorage, ok, err } from '@socracia/core';

import { createServices, importDocument } from '../services/appServices';
import {
  isSupported,
  readPickedFile,
  UNSUPPORTED_MESSAGE,
  type DocumentPickerPort,
  type FileBytesReader,
  type PickedFile,
} from '../services/documentImport';

const encoder = new TextEncoder();
const NOW = 1_700_000_000_000;

const TEMARIO = `Tema 1. El acto administrativo

El acto administrativo es la declaración unilateral de voluntad de la Administración sujeta al derecho administrativo. La notificación consiste en la comunicación formal del acto al interesado para que despliegue efectos.

Tema 2. Los recursos

El recurso de alzada es el que se interpone ante el órgano superior jerárquico. La revisión de oficio permite anular actos nulos de pleno derecho.`;

function makeReader(bytes: Uint8Array): FileBytesReader {
  return { read: async () => ok(bytes) };
}

function makePicker(file: PickedFile | null): DocumentPickerPort {
  return { pick: async () => file };
}

describe('documentImport', () => {
  it('reconoce los formatos admitidos por MIME y por extensión', () => {
    expect(
      isSupported({ name: 'a.pdf', mimeType: 'application/pdf', uri: 'u', sizeBytes: 1 }),
    ).toBe(true);
    expect(isSupported({ name: 'a.txt', mimeType: 'text/plain', uri: 'u', sizeBytes: 1 })).toBe(
      true,
    );
    expect(isSupported({ name: 'a.md', mimeType: '', uri: 'u', sizeBytes: 1 })).toBe(true);
    expect(
      isSupported({ name: 'a.xls', mimeType: 'application/vnd.ms-excel', uri: 'u', sizeBytes: 1 }),
    ).toBe(false);
  });

  it('rechaza un formato no soportado antes de leer el archivo', async () => {
    let readCalled = false;
    const reader: FileBytesReader = {
      read: async () => {
        readCalled = true;
        return ok(encoder.encode('x'));
      },
    };
    const result = await readPickedFile(
      { name: 'notas.xls', mimeType: 'application/vnd.ms-excel', uri: 'u', sizeBytes: 10 },
      reader,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toBe(UNSUPPORTED_MESSAGE);
    }
    expect(readCalled).toBe(false);
  });

  it('propaga el fallo de lectura con un mensaje con el nombre del archivo', async () => {
    const reader: FileBytesReader = { read: async () => err<Error>(new Error('io')) };
    const result = await readPickedFile(
      { name: 'temario.pdf', mimeType: 'application/pdf', uri: 'u', sizeBytes: 10 },
      reader,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('lectura-fallida');
      expect(result.error.message).toContain('temario.pdf');
    }
  });

  it('rechaza un archivo vacío', async () => {
    const result = await readPickedFile(
      { name: 'vacio.txt', mimeType: 'text/plain', uri: 'u', sizeBytes: 0 },
      makeReader(new Uint8Array()),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('vacío');
    }
  });

  it('lee los bytes de un archivo válido', async () => {
    const result = await readPickedFile(
      { name: 'a.txt', mimeType: 'text/plain', uri: 'u', sizeBytes: 3 },
      makeReader(encoder.encode('abc')),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.length).toBe(3);
    }
  });
});

describe('createServices', () => {
  it('compone los servicios con almacenamiento en memoria', () => {
    const services = createServices({
      storage: inMemoryStorage(),
      picker: makePicker(null),
      reader: makeReader(new Uint8Array()),
    });
    expect(services.rag).toBeDefined();
    expect(services.study).toBeDefined();
    expect(services.ingestion).toBeDefined();
  });
});

describe('importDocument', () => {
  it('importa un TXT y lo deja persistido con su temario', async () => {
    const services = createServices({
      storage: inMemoryStorage(),
      picker: makePicker(null),
      reader: makeReader(encoder.encode(TEMARIO)),
    });

    const result = await importDocument(
      services,
      {
        name: 'temario.txt',
        mimeType: 'text/plain',
        uri: 'file:///temario.txt',
        sizeBytes: TEMARIO.length,
      },
      NOW,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.title).toBe('temario');
    expect(result.value.conceptCount).toBeGreaterThan(0);

    const documents = await services.storage.documents.listDocuments();
    expect(documents.map((d) => d.id)).toEqual([result.value.documentId]);

    const curriculum = await services.storage.documents.getCurriculum(result.value.documentId);
    expect(curriculum?.concepts.length).toBe(result.value.conceptCount);

    // El RAG ha indexado el contenido.
    expect(services.rag.indexedChunks()).toBeGreaterThan(0);
  });

  it('devuelve error de ingesta si el archivo no tiene texto', async () => {
    const services = createServices({
      storage: inMemoryStorage(),
      picker: makePicker(null),
      reader: makeReader(encoder.encode('   ')),
    });
    const result = await importDocument(
      services,
      { name: 'vacio.txt', mimeType: 'text/plain', uri: 'u', sizeBytes: 3 },
      NOW,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('ingesta-fallida');
    }
  });

  it('devuelve el error de lectura sin tocar el almacenamiento', async () => {
    const services = createServices({
      storage: inMemoryStorage(),
      picker: makePicker(null),
      reader: { read: async () => err<Error>(new Error('io')) },
    });
    const result = await importDocument(
      services,
      { name: 'a.pdf', mimeType: 'application/pdf', uri: 'u', sizeBytes: 10 },
      NOW,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('lectura-fallida');
    }
    expect(await services.storage.documents.listDocuments()).toHaveLength(0);
  });
});
