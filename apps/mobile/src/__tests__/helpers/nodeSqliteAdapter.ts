import { DatabaseSync } from 'node:sqlite';

/**
 * Adaptador de `node:sqlite` a la interfaz de `expo-sqlite` usada por el
 * almacenamiento local.
 *
 * Permite ejecutar en Node el SQL real del adaptador móvil, de modo que las
 * pruebas validan las sentencias de verdad y no un doble de la capa de datos.
 * Solo el enlace al driver es sustituido; el SQL es el mismo que corre en el
 * dispositivo.
 */
export interface NodeSqliteAdapter {
  runAsync(source: string, params?: readonly unknown[]): Promise<{ changes: number }>;
  getAllAsync<T>(source: string, params?: readonly unknown[]): Promise<T[]>;
  getFirstAsync<T>(source: string, params?: readonly unknown[]): Promise<T | null>;
  execAsync(source: string): Promise<void>;
  withTransactionAsync(task: () => Promise<void>): Promise<void>;
}

export function createNodeSqliteAdapter(): NodeSqliteAdapter {
  const db = new DatabaseSync(':memory:');

  return {
    async runAsync(source: string, params: readonly unknown[] = []) {
      const statement = db.prepare(source);
      const result = statement.run(...(params as never[]));
      return { changes: Number(result.changes) };
    },
    async getAllAsync<T>(source: string, params: readonly unknown[] = []) {
      const statement = db.prepare(source);
      return statement.all(...(params as never[])) as T[];
    },
    async getFirstAsync<T>(source: string, params: readonly unknown[] = []) {
      const statement = db.prepare(source);
      const row = statement.get(...(params as never[]));
      return (row as T | undefined) ?? null;
    },
    async execAsync(source: string) {
      db.exec(source);
    },
    async withTransactionAsync(task: () => Promise<void>) {
      db.exec('BEGIN');
      try {
        await task();
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
  };
}
