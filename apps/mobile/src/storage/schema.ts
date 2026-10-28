import type { SQLiteDatabase } from 'expo-sqlite';

/**
 * DDL del esquema local.
 *
 * Una tabla por agregado del dominio, con las columnas escalares extraídas y
 * el resto del objeto guardado como JSON. Se prioriza la simplicidad: el MVP
 * no necesita consultas relacionales complejas, solo leer y escribir agregados
 * completos, y así el mapeo a los tipos de `@socracia/core` es directo.
 */
export const SCHEMA_STATEMENTS: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY NOT NULL,
    ingested_at INTEGER NOT NULL,
    payload TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS curricula (
    id TEXT PRIMARY KEY NOT NULL,
    created_at INTEGER NOT NULL,
    payload TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS questions (
    id TEXT PRIMARY KEY NOT NULL,
    concept_id TEXT NOT NULL,
    document_id TEXT NOT NULL,
    difficulty REAL NOT NULL,
    payload TEXT NOT NULL
  );`,
  `CREATE INDEX IF NOT EXISTS idx_questions_concept ON questions (concept_id);`,
  `CREATE INDEX IF NOT EXISTS idx_questions_document ON questions (document_id);`,
  `CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL,
    started_at INTEGER NOT NULL,
    payload TEXT NOT NULL
  );`,
  `CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions (user_id);`,
  `CREATE TABLE IF NOT EXISTS evaluations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    seq INTEGER NOT NULL,
    payload TEXT NOT NULL
  );`,
  `CREATE INDEX IF NOT EXISTS idx_evaluations_user ON evaluations (user_id, seq);`,
  `CREATE TABLE IF NOT EXISTS review_states (
    user_id TEXT NOT NULL,
    concept_id TEXT NOT NULL,
    payload TEXT NOT NULL,
    PRIMARY KEY (user_id, concept_id)
  );`,
  `CREATE TABLE IF NOT EXISTS gap_profiles (
    user_id TEXT PRIMARY KEY NOT NULL,
    generated_at INTEGER NOT NULL,
    payload TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS app_meta (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS chunks (
    id TEXT PRIMARY KEY NOT NULL,
    document_id TEXT NOT NULL,
    ordinal INTEGER NOT NULL,
    char_start INTEGER NOT NULL,
    char_end INTEGER NOT NULL,
    text TEXT NOT NULL
  );`,
  `CREATE INDEX IF NOT EXISTS idx_chunks_document ON chunks (document_id, ordinal);`,
];

/** Crea el esquema si no existe. Idempotente. */
export async function migrate(db: SQLiteDatabase): Promise<void> {
  await db.execAsync('PRAGMA journal_mode = WAL;');
  await db.execAsync('PRAGMA foreign_keys = ON;');
  for (const statement of SCHEMA_STATEMENTS) {
    await db.execAsync(statement);
  }
}
