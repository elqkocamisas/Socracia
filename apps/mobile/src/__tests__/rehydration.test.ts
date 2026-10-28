import { inMemoryStorage } from '@socracia/core';

import { importTemario, makeServices, restartServices, NOW } from './helpers/appTestHarness';

/**
 * Regresión del bug de rehidratación.
 *
 * El índice vectorial vive en memoria y solo se poblaba durante la ingesta. Al
 * cerrar y reabrir la app quedaba vacío, así que «Estudiar» fallaba con «No se
 * pudieron generar preguntas para este temario» aunque el documento siguiera
 * en la biblioteca. Estos tests fijan el comportamiento correcto.
 */
describe('Rehidratación del índice tras reiniciar la app', () => {
  it('permite estudiar un temario importado en un arranque anterior', async () => {
    const storage = inMemoryStorage();

    // Primer arranque: el usuario importa su temario.
    const first = makeServices(storage);
    const documentId = await importTemario(first);

    // Segundo arranque: proceso nuevo, mismo almacén persistido.
    const second = await restartServices(storage);

    const started = await second.session.start(documentId, NOW + 1000, 'sess-2');

    expect(started.ok).toBe(true);
    if (started.ok) {
      expect(started.value.question).not.toBeNull();
      expect(started.value.progress.total).toBeGreaterThan(0);
    }
  });

  it('reconstruye el índice con los fragmentos guardados', async () => {
    const storage = inMemoryStorage();
    const first = makeServices(storage);
    await importTemario(first);
    const chunkCount = first.rag.indexedChunks();
    expect(chunkCount).toBeGreaterThan(0);

    const second = await restartServices(storage);
    expect(second.rag.indexedChunks()).toBe(chunkCount);
  });

  it('recupera la cita de la fuente tras el reinicio', async () => {
    const storage = inMemoryStorage();
    const first = makeServices(storage);
    const documentId = await importTemario(first);

    const second = await restartServices(storage);
    const hits = await second.rag.retrieve('declaración unilateral de la Administración', 1);

    expect(hits.ok).toBe(true);
    if (hits.ok) {
      expect(hits.value[0]?.chunk.documentId).toBe(documentId);
    }
  });

  it('sin fragmentos guardados el arranque sigue siendo correcto', async () => {
    const storage = inMemoryStorage();
    const services = await restartServices(storage);
    expect(services.rag.indexedChunks()).toBe(0);
  });

  it('eliminar un documento borra también sus fragmentos', async () => {
    const storage = inMemoryStorage();
    const first = makeServices(storage);
    const documentId = await importTemario(first);
    await storage.documents.deleteDocument(documentId);

    const second = await restartServices(storage);
    expect(second.rag.indexedChunks()).toBe(0);
  });
});
