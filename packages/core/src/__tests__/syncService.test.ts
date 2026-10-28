import { inMemoryStorage } from '../storage/inMemory';
import type { StoragePort } from '../storage/ports';
import { SyncService } from '../sync/syncService';
import { InMemorySyncServer, evaluation, gapProfile, review, session } from './helpers/syncHarness';

const NOW = 1_700_000_000_000;
const USER = 'u1';

/** Dos dispositivos que comparten servidor pero no almacenamiento. */
function twoDevices(): { server: InMemorySyncServer; a: StoragePort; b: StoragePort } {
  return { server: new InMemorySyncServer(), a: inMemoryStorage(), b: inMemoryStorage() };
}

async function seed(storage: StoragePort, evaluations: number, conceptId = 'c1'): Promise<void> {
  await storage.progress.appendEvaluations(
    USER,
    // Los ids de pregunta son por concepto (`c1:q0`), como los genera el motor;
    // reutilizar `q0` entre conceptos haría colisionar evaluaciones distintas.
    Array.from({ length: evaluations }, (_, index) =>
      evaluation(`${conceptId}:q${index}`, conceptId, 0.9 - index * 0.1),
    ),
  );
}

describe('SyncService', () => {
  it('sube el progreso local y lo deja disponible en el servidor', async () => {
    const { server, a } = twoDevices();
    await seed(a, 3);
    const sync = new SyncService(a, server, USER);

    const result = await sync.sync(NOW);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.evaluations).toBe(3);
    }
    expect(server.stored(USER)?.evaluations).toHaveLength(3);
  });

  it('recupera el progreso en un segundo dispositivo', async () => {
    const { server, a, b } = twoDevices();
    await seed(a, 4);
    await new SyncService(a, server, USER).sync(NOW);

    const result = await new SyncService(b, server, USER).pull(NOW + 1000);

    expect(result.ok).toBe(true);
    expect(await b.progress.listEvaluations(USER)).toHaveLength(4);
    if (result.ok) {
      expect(result.value.pulledChanges).toBe(true);
    }
  });

  it('no duplica evaluaciones al sincronizar dos veces seguidas', async () => {
    const { server, a } = twoDevices();
    await seed(a, 3);
    const sync = new SyncService(a, server, USER);

    await sync.sync(NOW);
    await sync.sync(NOW + 1);

    expect(await a.progress.listEvaluations(USER)).toHaveLength(3);
  });

  it('fusiona el progreso de dos dispositivos sin perder nada', async () => {
    const { server, a, b } = twoDevices();
    await seed(a, 2, 'c1');
    await seed(b, 3, 'c2');

    await new SyncService(a, server, USER).sync(NOW);
    await new SyncService(b, server, USER).sync(NOW + 1);
    // El dispositivo A vuelve a sincronizar y debe recibir lo de B.
    const back = await new SyncService(a, server, USER).sync(NOW + 2);

    expect(await a.progress.listEvaluations(USER)).toHaveLength(5);
    expect(back.ok && back.value.pulledChanges).toBe(true);
  });

  it('sube sesiones, repaso y perfil de lagunas', async () => {
    const { server, a } = twoDevices();
    await a.progress.saveSession(session('s1', NOW, NOW + 100));
    await a.progress.saveReviewStates(USER, [review('c1', NOW + 1, NOW)]);
    await a.progress.saveGapProfile(gapProfile(USER, NOW));

    await new SyncService(a, server, USER).sync(NOW + 200);

    const stored = server.stored(USER);
    expect(stored?.sessions).toHaveLength(1);
    expect(stored?.reviewStates).toHaveLength(1);
    expect(stored?.gapProfile).not.toBeNull();
  });

  it('no marca cambios traídos cuando solo sube datos propios', async () => {
    const { server, a } = twoDevices();
    await seed(a, 1);

    const result = await new SyncService(a, server, USER).sync(NOW);

    expect(result.ok && result.value.pulledChanges).toBe(false);
  });

  it('propaga el error de red sin tocar el almacén local', async () => {
    const { server, a } = twoDevices();
    await seed(a, 2);
    server.failNextPush = { code: 'red', message: 'sin conexión' };

    const result = await new SyncService(a, server, USER).sync(NOW);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('red');
    }
    expect(await a.progress.listEvaluations(USER)).toHaveLength(2);
  });

  it('el servidor nunca recibe documentos ni fragmentos', async () => {
    const { server, a } = twoDevices();
    await a.documents.saveChunks([
      {
        id: 'd1:0',
        documentId: 'd1',
        text: 'material privado',
        ordinal: 0,
        charStart: 0,
        charEnd: 5,
      },
    ]);

    await new SyncService(a, server, USER).sync(NOW);

    const stored = server.stored(USER);
    // El contrato de instantánea no tiene campos de documentos: el progreso es
    // lo único que sale del dispositivo.
    expect(Object.keys(stored ?? {})).not.toContain('chunks');
    expect(Object.keys(stored ?? {})).not.toContain('documents');
  });
});
