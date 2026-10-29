import type { SQLiteDatabase } from 'expo-sqlite';

import { DEFAULT_PROCESSING_POLICY, type ProcessingMode, type ProcessingPolicy } from '@socracia/core';

/**
 * Persistencia de la política de procesamiento.
 *
 * Se guarda en `app_meta` como una fila más. Que el ajuste sobreviva al
 * reinicio importa: si se perdiera, la app volvería a modo solo-dispositivo
 * sin que el usuario lo sepa, o peor, al revés. El valor por defecto y el
 * estado de un almacén vacío son siempre el modo local.
 */
export interface ProcessingPolicyStore {
  load(): Promise<ProcessingPolicy>;
  save(policy: ProcessingPolicy): Promise<void>;
}

const META_KEY = 'processing-policy';

function parseMode(raw: string | null): ProcessingMode {
  return raw === 'allow-cloud' ? 'allow-cloud' : 'local-only';
}

/** Implementación en memoria, para pruebas y para el modo degradado. */
export class InMemoryProcessingPolicyStore implements ProcessingPolicyStore {
  private policy: ProcessingPolicy = DEFAULT_PROCESSING_POLICY;

  public async load(): Promise<ProcessingPolicy> {
    return this.policy;
  }

  public async save(policy: ProcessingPolicy): Promise<void> {
    this.policy = policy;
  }
}

/** Implementación sobre la tabla `app_meta` de SQLite. */
export class SqliteProcessingPolicyStore implements ProcessingPolicyStore {
  public constructor(private readonly db: SQLiteDatabase) {}

  public async load(): Promise<ProcessingPolicy> {
    const row = await this.db.getFirstAsync<{ value: string }>(
      'SELECT value FROM app_meta WHERE key = ?;',
      [META_KEY],
    );
    return { mode: parseMode(row?.value ?? null) };
  }

  public async save(policy: ProcessingPolicy): Promise<void> {
    await this.db.runAsync(
      `INSERT INTO app_meta (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value;`,
      [META_KEY, policy.mode],
    );
  }
}
