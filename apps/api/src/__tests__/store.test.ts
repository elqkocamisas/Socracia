import { readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { InMemoryProgressStore, JsonFileProgressStore } from '../store';
import { emptySnapshot } from './helpers/apiHarness';

const USER = 'u1';

describe('InMemoryProgressStore', () => {
  it('devuelve null para un usuario sin progreso', async () => {
    const store = new InMemoryProgressStore();

    expect(await store.get(USER)).toBeNull();
  });

  it('guarda y fusiona el progreso recibido', async () => {
    const store = new InMemoryProgressStore();
    const first = { ...emptySnapshot(USER), sessions: [] };

    await store.merge(USER, first);
    const stored = await store.get(USER);

    expect(stored?.userId).toBe(USER);
  });
});

describe('JsonFileProgressStore', () => {
  const path = join(tmpdir(), `socracia-test-${process.pid}-${Date.now()}.json`);

  afterEach(async () => {
    await rm(path, { force: true });
  });

  it('persiste el progreso y lo recarga en una instancia nueva', async () => {
    const first = new JsonFileProgressStore(path);
    await first.merge(USER, emptySnapshot(USER, 1234));

    // Simula el reinicio del proceso: instancia nueva sobre el mismo fichero.
    const second = new JsonFileProgressStore(path);
    const reloaded = await second.get(USER);

    expect(reloaded?.userId).toBe(USER);
    expect(reloaded?.generatedAt).toBe(1234);
  });

  it('arranca en vacío si el fichero no existe', async () => {
    const store = new JsonFileProgressStore(join(tmpdir(), `no-existe-${Date.now()}.json`));

    expect(await store.get(USER)).toBeNull();
  });

  it('no pierde datos con escrituras concurrentes', async () => {
    const store = new JsonFileProgressStore(path);

    await Promise.all([
      store.merge('u1', emptySnapshot('u1', 1)),
      store.merge('u2', emptySnapshot('u2', 2)),
      store.merge('u3', emptySnapshot('u3', 3)),
    ]);

    const raw = JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>;
    expect(Object.keys(raw).sort()).toEqual(['u1', 'u2', 'u3']);
  });
});
