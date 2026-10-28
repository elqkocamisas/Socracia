import type { SQLiteDatabase } from 'expo-sqlite';

import type {
  AnswerEvaluation,
  CurriculumRecord,
  DocumentRepository,
  GapProfile,
  KnowledgeDocument,
  ProgressRepository,
  QuestionRepository,
  ReviewState,
  SocraticQuestion,
  StoragePort,
  StudySession,
} from '@socracia/core';

import { migrate } from './schema';

interface PayloadRow {
  readonly payload: string;
}

/**
 * Almacenamiento local sobre SQLite (expo-sqlite).
 *
 * Implementa los puertos de `@socracia/core` guardando cada agregado como JSON.
 * El progreso del usuario y sus documentos nunca salen del dispositivo salvo
 * que se active la sincronización en la nube (Sprint 4).
 */
export class SqliteDocumentRepository implements DocumentRepository {
  public constructor(private readonly db: SQLiteDatabase) {}

  public async saveDocument(document: KnowledgeDocument): Promise<void> {
    await this.db.runAsync(
      `INSERT INTO documents (id, ingested_at, payload) VALUES (?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET ingested_at = excluded.ingested_at, payload = excluded.payload;`,
      [document.id, document.ingestedAt, JSON.stringify(document)],
    );
  }

  public async listDocuments(): Promise<readonly KnowledgeDocument[]> {
    const rows = await this.db.getAllAsync<PayloadRow>(
      'SELECT payload FROM documents ORDER BY ingested_at DESC;',
    );
    return rows.map((row) => JSON.parse(row.payload) as KnowledgeDocument);
  }

  public async getDocument(id: string): Promise<KnowledgeDocument | null> {
    const row = await this.db.getFirstAsync<PayloadRow>(
      'SELECT payload FROM documents WHERE id = ?;',
      [id],
    );
    return row ? (JSON.parse(row.payload) as KnowledgeDocument) : null;
  }

  public async deleteDocument(id: string): Promise<void> {
    await this.db.withTransactionAsync(async () => {
      await this.db.runAsync('DELETE FROM documents WHERE id = ?;', [id]);
      await this.db.runAsync('DELETE FROM curricula WHERE id = ?;', [id]);
      await this.db.runAsync('DELETE FROM questions WHERE document_id = ?;', [id]);
    });
  }

  public async saveCurriculum(record: CurriculumRecord): Promise<void> {
    await this.db.runAsync(
      `INSERT INTO curricula (id, created_at, payload) VALUES (?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET created_at = excluded.created_at, payload = excluded.payload;`,
      [record.id, record.createdAt, JSON.stringify(record)],
    );
  }

  public async getCurriculum(documentId: string): Promise<CurriculumRecord | null> {
    const row = await this.db.getFirstAsync<PayloadRow>(
      'SELECT payload FROM curricula WHERE id = ?;',
      [documentId],
    );
    return row ? (JSON.parse(row.payload) as CurriculumRecord) : null;
  }

  public async listCurricula(): Promise<readonly CurriculumRecord[]> {
    const rows = await this.db.getAllAsync<PayloadRow>(
      'SELECT payload FROM curricula ORDER BY created_at DESC;',
    );
    return rows.map((row) => JSON.parse(row.payload) as CurriculumRecord);
  }
}

export class SqliteQuestionRepository implements QuestionRepository {
  public constructor(private readonly db: SQLiteDatabase) {}

  public async saveQuestions(questions: readonly SocraticQuestion[]): Promise<void> {
    await this.db.withTransactionAsync(async () => {
      for (const question of questions) {
        await this.db.runAsync(
          `INSERT INTO questions (id, concept_id, document_id, difficulty, payload) VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET concept_id = excluded.concept_id,
             document_id = excluded.document_id, difficulty = excluded.difficulty,
             payload = excluded.payload;`,
          [
            question.id,
            question.conceptId,
            question.citation.documentId,
            question.difficulty,
            JSON.stringify(question),
          ],
        );
      }
    });
  }

  public async listByConcept(conceptId: string): Promise<readonly SocraticQuestion[]> {
    const rows = await this.db.getAllAsync<PayloadRow>(
      'SELECT payload FROM questions WHERE concept_id = ? ORDER BY difficulty ASC, id ASC;',
      [conceptId],
    );
    return rows.map((row) => JSON.parse(row.payload) as SocraticQuestion);
  }

  public async listByDocument(documentId: string): Promise<readonly SocraticQuestion[]> {
    const rows = await this.db.getAllAsync<PayloadRow>(
      'SELECT payload FROM questions WHERE document_id = ? ORDER BY difficulty ASC, id ASC;',
      [documentId],
    );
    return rows.map((row) => JSON.parse(row.payload) as SocraticQuestion);
  }
}

export class SqliteProgressRepository implements ProgressRepository {
  public constructor(private readonly db: SQLiteDatabase) {}

  public async saveSession(session: StudySession): Promise<void> {
    await this.db.runAsync(
      `INSERT INTO sessions (id, user_id, started_at, payload) VALUES (?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET user_id = excluded.user_id,
         started_at = excluded.started_at, payload = excluded.payload;`,
      [session.id, session.userId, session.startedAt, JSON.stringify(session)],
    );
  }

  public async getSession(id: string): Promise<StudySession | null> {
    const row = await this.db.getFirstAsync<PayloadRow>(
      'SELECT payload FROM sessions WHERE id = ?;',
      [id],
    );
    return row ? (JSON.parse(row.payload) as StudySession) : null;
  }

  public async listSessions(userId: string): Promise<readonly StudySession[]> {
    const rows = await this.db.getAllAsync<PayloadRow>(
      'SELECT payload FROM sessions WHERE user_id = ? ORDER BY started_at ASC;',
      [userId],
    );
    return rows.map((row) => JSON.parse(row.payload) as StudySession);
  }

  public async appendEvaluations(
    userId: string,
    evaluations: readonly AnswerEvaluation[],
  ): Promise<void> {
    if (evaluations.length === 0) {
      return;
    }
    await this.db.withTransactionAsync(async () => {
      const row = await this.db.getFirstAsync<{ next: number }>(
        'SELECT COALESCE(MAX(seq), 0) + 1 AS next FROM evaluations WHERE user_id = ?;',
        [userId],
      );
      let seq = row?.next ?? 1;
      for (const evaluation of evaluations) {
        await this.db.runAsync(
          'INSERT INTO evaluations (user_id, seq, payload) VALUES (?, ?, ?);',
          [userId, seq, JSON.stringify(evaluation)],
        );
        seq += 1;
      }
    });
  }

  public async listEvaluations(userId: string): Promise<readonly AnswerEvaluation[]> {
    const rows = await this.db.getAllAsync<PayloadRow>(
      'SELECT payload FROM evaluations WHERE user_id = ? ORDER BY seq ASC;',
      [userId],
    );
    return rows.map((row) => JSON.parse(row.payload) as AnswerEvaluation);
  }

  public async saveReviewStates(userId: string, states: readonly ReviewState[]): Promise<void> {
    await this.db.withTransactionAsync(async () => {
      for (const state of states) {
        await this.db.runAsync(
          `INSERT INTO review_states (user_id, concept_id, payload) VALUES (?, ?, ?)
           ON CONFLICT(user_id, concept_id) DO UPDATE SET payload = excluded.payload;`,
          [userId, state.conceptId, JSON.stringify(state)],
        );
      }
    });
  }

  public async listReviewStates(userId: string): Promise<readonly ReviewState[]> {
    const rows = await this.db.getAllAsync<PayloadRow>(
      'SELECT payload FROM review_states WHERE user_id = ?;',
      [userId],
    );
    return rows.map((row) => JSON.parse(row.payload) as ReviewState);
  }

  public async saveGapProfile(profile: GapProfile): Promise<void> {
    await this.db.runAsync(
      `INSERT INTO gap_profiles (user_id, generated_at, payload) VALUES (?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET generated_at = excluded.generated_at,
         payload = excluded.payload;`,
      [profile.userId, profile.generatedAt, JSON.stringify(profile)],
    );
  }

  public async getGapProfile(userId: string): Promise<GapProfile | null> {
    const row = await this.db.getFirstAsync<PayloadRow>(
      'SELECT payload FROM gap_profiles WHERE user_id = ?;',
      [userId],
    );
    return row ? (JSON.parse(row.payload) as GapProfile) : null;
  }
}

/** Almacenamiento SQLite completo, listo para inyectar en los servicios. */
export function sqliteStorage(db: SQLiteDatabase): StoragePort {
  return {
    documents: new SqliteDocumentRepository(db),
    questions: new SqliteQuestionRepository(db),
    progress: new SqliteProgressRepository(db),
  };
}

/**
 * Abre la base local y aplica el esquema.
 *
 * Se llama una sola vez al arrancar la app. El nombre de la base es fijo, de
 * modo que el progreso sobrevive a los reinicios.
 */
export async function openStorage(
  open: (name: string) => Promise<SQLiteDatabase>,
  name = 'socracia.db',
): Promise<StoragePort> {
  const db = await open(name);
  await migrate(db);
  return sqliteStorage(db);
}
