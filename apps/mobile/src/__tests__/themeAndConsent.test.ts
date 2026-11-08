import { inMemoryStorage, ok } from '@socracia/core';

import { createServices, importDocument } from '../services/appServices';
import { HttpSyncClient } from '../services/httpSyncClient';
import { InMemoryThemeStore, SqliteThemeStore, resolveTheme } from '../theme/themePreference';
import { darkTheme, lightTheme } from '../theme/tokens';
import { createNodeSqliteAdapter } from './helpers/nodeSqliteAdapter';
import { migrate } from '../storage/schema';
import type { SQLiteDatabase } from 'expo-sqlite';
import type { DocumentPickerPort, FileBytesReader } from '../services/documentImport';

const encoder = new TextEncoder();
const NOW = 1_700_000_000_000;
const TEMARIO = `Tema 1. El acto administrativo

El acto administrativo es la declaración unilateral de voluntad de la Administración.`;

const NO_PICKER: DocumentPickerPort = { pick: async () => null };
const reader: FileBytesReader = { read: async () => ok(encoder.encode(TEMARIO)) };

describe('resolveTheme', () => {
  it('«system» sigue la apariencia del dispositivo', () => {
    expect(resolveTheme('system', 'light').name).toBe('light');
    expect(resolveTheme('system', 'dark').name).toBe('dark');
  });

  it('«system» sin esquema conocido cae a oscuro', () => {
    expect(resolveTheme('system', null).name).toBe('dark');
  });

  it('una elección explícita gana sobre el sistema', () => {
    expect(resolveTheme('light', 'dark').name).toBe('light');
    expect(resolveTheme('dark', 'light').name).toBe('dark');
  });

  it('devuelve las paletas exportadas', () => {
    expect(resolveTheme('light', null)).toBe(lightTheme);
    expect(resolveTheme('dark', null)).toBe(darkTheme);
  });
});

describe('ThemeStore', () => {
  it('en memoria arranca en «system» y persiste el cambio', async () => {
    const store = new InMemoryThemeStore();
    expect(await store.load()).toBe('system');
    await store.save('dark');
    expect(await store.load()).toBe('dark');
  });

  it('sobre SQLite real guarda y recupera la preferencia', async () => {
    const db = createNodeSqliteAdapter() as unknown as SQLiteDatabase;
    await migrate(db);
    const store = new SqliteThemeStore(db);
    expect(await store.load()).toBe('system');
    await store.save('light');
    expect(await store.load()).toBe('light');
  });

  it('ignora un valor corrupto y vuelve a «system»', async () => {
    const db = createNodeSqliteAdapter() as unknown as SQLiteDatabase;
    await migrate(db);
    await db.runAsync('INSERT INTO app_meta (key, value) VALUES (?, ?);', [
      'theme-preference',
      'morado',
    ]);
    const store = new SqliteThemeStore(db);
    expect(await store.load()).toBe('system');
  });
});

describe('Consentimiento por documento', () => {
  function services() {
    return createServices({
      storage: inMemoryStorage(),
      picker: NO_PICKER,
      reader,
      cloudAvailable: true,
      syncClient: new HttpSyncClient({
        baseUrl: 'http://localhost:8787',
        token: 'test-token',
      }),
    });
  }

  it('un documento importado sin nube no tiene consentimiento', async () => {
    const app = services();
    const imported = await importDocument(
      app,
      { name: 't.txt', mimeType: 'text/plain', uri: 'u', sizeBytes: TEMARIO.length },
      NOW,
    );
    expect(imported.ok).toBe(true);
    if (!imported.ok) {
      return;
    }
    expect(await app.documentConsent(imported.value.documentId)).toBe(false);
  });

  it('con la nube disponible y sesión, el consentimiento se concede y se persiste', async () => {
    const app = services();
    const imported = await importDocument(
      app,
      { name: 't.txt', mimeType: 'text/plain', uri: 'u', sizeBytes: TEMARIO.length },
      NOW,
    );
    expect(imported.ok).toBe(true);
    if (!imported.ok) {
      return;
    }
    await app.policy.set({ mode: 'allow-cloud' });
    expect(await app.setDocumentConsent(imported.value.documentId, true)).toBe(true);
    expect(await app.documentConsent(imported.value.documentId)).toBe(true);

    const documents = await app.storage.documents.listDocuments();
    expect(documents[0]?.cloudConsent).toBe(true);
  });

  it('sin sesión, no se concede aunque se pida', async () => {
    const app = createServices({
      storage: inMemoryStorage(),
      picker: NO_PICKER,
      reader,
      cloudAvailable: true,
    });
    const imported = await importDocument(
      app,
      { name: 't.txt', mimeType: 'text/plain', uri: 'u', sizeBytes: TEMARIO.length },
      NOW,
    );
    expect(imported.ok).toBe(true);
    if (!imported.ok) {
      return;
    }
    await app.policy.set({ mode: 'allow-cloud' });
    expect(await app.setDocumentConsent(imported.value.documentId, true)).toBe(false);
  });

  it('un documento inexistente no concede consentimiento', async () => {
    const app = services();
    expect(await app.setDocumentConsent('no-existe', true)).toBe(false);
  });
});
