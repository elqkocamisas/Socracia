import type { SQLiteDatabase } from 'expo-sqlite';

import type { AccountSession } from './httpSyncClient';

/**
 * Persistencia de la sesión de cuenta.
 *
 * Guarda el token y el identificador para no pedir credenciales en cada
 * arranque. En el MVP el token vive en la base local del dispositivo; una
 * versión posterior puede moverlo a `expo-secure-store` sin cambiar el resto de
 * la app, que solo conoce este puerto.
 */
export interface CredentialStore {
  load(): Promise<AccountSession | null>;
  save(session: AccountSession): Promise<void>;
  clear(): Promise<void>;
}

const META_KEY = 'account-session';

/** Implementación en memoria, para pruebas y para el modo degradado. */
export class InMemoryCredentialStore implements CredentialStore {
  private session: AccountSession | null = null;

  public async load(): Promise<AccountSession | null> {
    return this.session;
  }

  public async save(session: AccountSession): Promise<void> {
    this.session = session;
  }

  public async clear(): Promise<void> {
    this.session = null;
  }
}

/** Implementación sobre la tabla `app_meta` de SQLite. */
export class SqliteCredentialStore implements CredentialStore {
  public constructor(private readonly db: SQLiteDatabase) {}

  public async load(): Promise<AccountSession | null> {
    const row = await this.db.getFirstAsync<{ value: string }>(
      'SELECT value FROM app_meta WHERE key = ?;',
      [META_KEY],
    );
    if (!row) {
      return null;
    }
    try {
      return JSON.parse(row.value) as AccountSession;
    } catch {
      // Un valor corrupto no debe impedir arrancar: se trata como sin sesión.
      return null;
    }
  }

  public async save(session: AccountSession): Promise<void> {
    await this.db.runAsync(
      `INSERT INTO app_meta (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value;`,
      [META_KEY, JSON.stringify(session)],
    );
  }

  public async clear(): Promise<void> {
    await this.db.runAsync('DELETE FROM app_meta WHERE key = ?;', [META_KEY]);
  }
}
