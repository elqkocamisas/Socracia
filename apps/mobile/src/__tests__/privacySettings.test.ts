import { inMemoryStorage, ok } from '@socracia/core';

import { createServices, importDocument, type AppServices } from '../services/appServices';
import {
  InMemoryProcessingPolicyStore,
  SqliteProcessingPolicyStore,
} from '../services/processingPolicyStore';
import {
  isCloudEnabled,
  isCloudToggleVisible,
  readPrivacySettings,
  setProcessingPolicy,
} from '../services/privacySettings';
import type { DocumentPickerPort, FileBytesReader, PickedFile } from '../services/documentImport';
import { createNodeSqliteAdapter } from './helpers/nodeSqliteAdapter';
import { migrate } from '../storage/schema';
import type { SQLiteDatabase } from 'expo-sqlite';

const encoder = new TextEncoder();
const NOW = 1_700_000_000_000;
const TEMARIO = `Tema 1. El acto administrativo

El acto administrativo es la declaración unilateral de voluntad de la Administración sujeta al derecho administrativo.`;

const NO_PICKER: DocumentPickerPort = { pick: async () => null };
const reader: FileBytesReader = { read: async () => ok(encoder.encode(TEMARIO)) };

function makeServices(): AppServices {
  return createServices({ storage: inMemoryStorage(), picker: NO_PICKER, reader });
}

const file: PickedFile = {
  name: 'temario.txt',
  mimeType: 'text/plain',
  uri: 'file:///t.txt',
  sizeBytes: TEMARIO.length,
};

/**
 * El ajuste de privacidad no puede ser decorativo: si el usuario lo cambia, el
 * flujo real de importación debe verlo. La prueba comprueba el efecto en el
 * documento guardado, que es lo que queda registrado y auditable.
 */
describe('Ajuste de privacidad', () => {
  it('arranca en modo solo-dispositivo', () => {
    const services = makeServices();
    expect(services.policy.current().mode).toBe('local-only');
    expect(isCloudEnabled(services)).toBe(false);
  });

  it('marca los documentos importados como no autorizados para nube por defecto', async () => {
    const services = makeServices();
    const result = await importDocument(services, file, NOW);
    expect(result.ok).toBe(true);

    const documents = await services.storage.documents.listDocuments();
    expect(documents[0]?.cloudConsent).toBe(false);
  });

  it('el cambio de ajuste afecta a la importación siguiente sin reiniciar', async () => {
    const services = makeServices();
    await setProcessingPolicy(services, 'allow-cloud');

    expect(isCloudEnabled(services)).toBe(true);
    const result = await importDocument(services, file, NOW);
    expect(result.ok).toBe(true);

    const documents = await services.storage.documents.listDocuments();
    expect(documents[0]?.cloudConsent).toBe(true);
  });

  it('persiste el ajuste en el almacén para el próximo arranque', async () => {
    const store = new InMemoryProcessingPolicyStore();
    const services = createServices({
      storage: inMemoryStorage(),
      picker: NO_PICKER,
      reader,
      policyStore: store,
    });

    await setProcessingPolicy(services, 'allow-cloud');

    expect((await store.load()).mode).toBe('allow-cloud');
    expect(readPrivacySettings(services).policy.mode).toBe('allow-cloud');
  });

  it('expone el proveedor de embeddings activo para que el usuario sepa qué corre en su móvil', () => {
    const services = makeServices();
    const settings = readPrivacySettings(services);
    expect(settings.embedding.id.length).toBeGreaterThan(0);
    expect(typeof settings.embedding.onDeviceModel).toBe('boolean');
  });
});

describe('SqliteProcessingPolicyStore', () => {
  it('guarda y recupera el ajuste sobre SQLite real', async () => {
    const adapter = createNodeSqliteAdapter();
    const db = adapter as unknown as SQLiteDatabase;
    await migrate(db);
    const store = new SqliteProcessingPolicyStore(db);

    expect((await store.load()).mode).toBe('local-only');

    await store.save({ mode: 'allow-cloud' });
    expect((await store.load()).mode).toBe('allow-cloud');

    await store.save({ mode: 'local-only' });
    expect((await store.load()).mode).toBe('local-only');
  });

  it('ignora un valor corrupto y vuelve al modo seguro', async () => {
    const adapter = createNodeSqliteAdapter();
    const db = adapter as unknown as SQLiteDatabase;
    await migrate(db);
    await db.runAsync('INSERT INTO app_meta (key, value) VALUES (?, ?);', [
      'processing-policy',
      'valor-inesperado',
    ]);
    const store = new SqliteProcessingPolicyStore(db);

    expect((await store.load()).mode).toBe('local-only');
  });
});

describe('Visibilidad del ajuste de nube', () => {
  it('no se ofrece si el build no tiene backend de corpus', () => {
    const services = makeServices();
    expect(services.cloudAvailable).toBe(false);
    expect(isCloudToggleVisible(services)).toBe(false);
  });

  it('se ofrece solo cuando hay backend de corpus en la nube', () => {
    const services = createServices({
      storage: inMemoryStorage(),
      picker: NO_PICKER,
      reader,
      cloudAvailable: true,
    });
    expect(isCloudToggleVisible(services)).toBe(true);
  });
});
