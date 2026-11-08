import type { SQLiteDatabase } from 'expo-sqlite';

import { darkTheme, lightTheme, type Theme } from './tokens';

/**
 * Preferencia de tema y su persistencia.
 *
 * `system` sigue la apariencia del dispositivo; `light` y `dark` la fijan a
 * mano. El valor por defecto es `system`, que es lo que espera un usuario que
 * no ha tocado el ajuste. Igual que la política de privacidad, la preferencia
 * vive en `app_meta`: si se perdiera al reiniciar, el tema «saltaría» sin que
 * el usuario lo hubiera pedido.
 */
export type ThemePreference = 'system' | 'light' | 'dark';

/** Almacén de la preferencia de tema. */
export interface ThemeStore {
  load(): Promise<ThemePreference>;
  save(preference: ThemePreference): Promise<void>;
}

const META_KEY = 'theme-preference';

function parsePreference(raw: string | null): ThemePreference {
  return raw === 'light' || raw === 'dark' ? raw : 'system';
}

/** Resuelve la preferencia a un tema concreto dado el esquema del sistema. */
export function resolveTheme(
  preference: ThemePreference,
  systemScheme: 'light' | 'dark' | null | undefined,
): Theme {
  const effective = preference === 'system' ? (systemScheme ?? 'dark') : preference;
  return effective === 'light' ? lightTheme : darkTheme;
}

/** Implementación en memoria, para pruebas y para el modo degradado. */
export class InMemoryThemeStore implements ThemeStore {
  private preference: ThemePreference = 'system';

  public async load(): Promise<ThemePreference> {
    return this.preference;
  }

  public async save(preference: ThemePreference): Promise<void> {
    this.preference = preference;
  }
}

/** Implementación sobre la tabla `app_meta` de SQLite. */
export class SqliteThemeStore implements ThemeStore {
  public constructor(private readonly db: SQLiteDatabase) {}

  public async load(): Promise<ThemePreference> {
    const row = await this.db.getFirstAsync<{ value: string }>(
      'SELECT value FROM app_meta WHERE key = ?;',
      [META_KEY],
    );
    return parsePreference(row?.value ?? null);
  }

  public async save(preference: ThemePreference): Promise<void> {
    await this.db.runAsync(
      `INSERT INTO app_meta (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value;`,
      [META_KEY, preference],
    );
  }
}
