import type { SQLiteDatabase } from 'expo-sqlite';

import type {
  AnswerEvaluation,
  KnowledgeDocument,
  ReviewState,
  SocraticQuestion,
} from '@socracia/core';

import { migrate } from '../storage/schema';
import { sqliteStorage } from '../storage/sqliteStorage';
import { createNodeSqliteAdapter, type NodeSqliteAdapter } from './helpers/nodeSqliteAdapter';

const NOW = 1_700_000_000_000;

/**
 * Estas pruebas ejecutan el SQL real del adaptador móvil sobre `node:sqlite`.
 * No hay doble de la capa de datos: solo se sustituye el enlace al driver.
 */
async function openTestStorage() {
  const adapter: NodeSqliteAdapter = createNodeSqliteAdapter();
  const db = adapter as unknown as SQLiteDatabase;
  await migrate(db);
  return { storage: sqliteStorage(db), adapter };
}

const document: KnowledgeDocument = {
  id: 'd1',
  title: 'Tema 1',
  mimeType: 'text/plain',
  sourceKind: 'document',
  uri: 'file:///t.txt',
  sizeBytes: 120,
  ingestedAt: NOW,
  cloudConsent: false,
};

const question: SocraticQuestion = {
  id: 'c1:q0',
  conceptId: 'c1',
  prompt: '¿Por qué?',
  move: 'causa',
  level: 'comprender',
  expectedAnswer: 'Respuesta de referencia suficientemente larga para evaluar.',
  keyTerms: ['clave'],
  citation: {
    documentId: 'd1',
    documentTitle: 'Tema 1',
    chunkId: 'd1:0',
    excerpt: 'x',
    charStart: 0,
    charEnd: 10,
  },
  difficulty: 0.3,
};

const evaluation: AnswerEvaluation = {
  questionId: 'c1:q0',
  conceptId: 'c1',
  verdict: 'correcta',
  score: 0.9,
  matchedKeyTerms: ['clave'],
  missingKeyTerms: [],
  feedback: 'bien',
};

const review: ReviewState = {
  conceptId: 'c1',
  ease: 2.6,
  intervalDays: 1,
  repetitions: 1,
  dueAt: NOW + 86_400_000,
  lastReviewedAt: NOW,
};

describe('migrate', () => {
  it('es idempotente', async () => {
    const adapter = createNodeSqliteAdapter();
    const db = adapter as unknown as SQLiteDatabase;
    await migrate(db);
    await migrate(db);
    const tables = await adapter.getAllAsync<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name;",
    );
    const names = tables.map((t) => t.name);
    expect(names).toEqual(
      expect.arrayContaining([
        'documents',
        'curricula',
        'questions',
        'sessions',
        'evaluations',
        'review_states',
        'gap_profiles',
      ]),
    );
  });
});

describe('SqliteDocumentRepository', () => {
  it('guarda, lee y lista documentos con el SQL real', async () => {
    const { storage } = await openTestStorage();
    await storage.documents.saveDocument(document);
    await storage.documents.saveDocument({ ...document, id: 'd0', ingestedAt: NOW - 5000 });

    expect(await storage.documents.getDocument('d1')).toEqual(document);
    expect(await storage.documents.getDocument('nope')).toBeNull();

    const list = await storage.documents.listDocuments();
    expect(list.map((d) => d.id)).toEqual(['d1', 'd0']);
  });

  it('actualiza un documento existente sin duplicar', async () => {
    const { storage, adapter } = await openTestStorage();
    await storage.documents.saveDocument(document);
    await storage.documents.saveDocument({ ...document, title: 'Tema 1 revisado' });
    const rows = await adapter.getAllAsync<{ c: number }>('SELECT COUNT(*) AS c FROM documents;');
    expect(rows[0]?.c).toBe(1);
    expect((await storage.documents.getDocument('d1'))?.title).toBe('Tema 1 revisado');
  });

  it('guarda y recupera temarios', async () => {
    const { storage } = await openTestStorage();
    await storage.documents.saveCurriculum({
      id: 'd1',
      title: 'Tema 1',
      topics: [{ id: 't1', title: 'Uno', summary: '' }],
      concepts: [],
      createdAt: NOW,
    });
    const record = await storage.documents.getCurriculum('d1');
    expect(record?.topics[0]?.title).toBe('Uno');
    expect(await storage.documents.listCurricula()).toHaveLength(1);
  });

  it('borra en cascada documento, temario y preguntas', async () => {
    const { storage } = await openTestStorage();
    await storage.documents.saveDocument(document);
    await storage.documents.saveCurriculum({
      id: 'd1',
      title: 'T',
      topics: [],
      concepts: [],
      createdAt: NOW,
    });
    await storage.questions.saveQuestions([question]);

    await storage.documents.deleteDocument('d1');

    expect(await storage.documents.getDocument('d1')).toBeNull();
    expect(await storage.documents.getCurriculum('d1')).toBeNull();
    expect(await storage.questions.listByDocument('d1')).toHaveLength(0);
  });
});

describe('SqliteQuestionRepository', () => {
  it('ordena por dificultad y filtra por documento con el SQL real', async () => {
    const { storage } = await openTestStorage();
    await storage.questions.saveQuestions([
      { ...question, id: 'c1:q1', difficulty: 0.8 },
      { ...question, id: 'c1:q0', difficulty: 0.3 },
      {
        ...question,
        id: 'c2:q0',
        conceptId: 'c2',
        citation: { ...question.citation, documentId: 'd2' },
      },
    ]);

    expect((await storage.questions.listByConcept('c1')).map((q) => q.id)).toEqual([
      'c1:q0',
      'c1:q1',
    ]);
    expect((await storage.questions.listByDocument('d2')).map((q) => q.id)).toEqual(['c2:q0']);
  });

  it('el upsert reemplaza la pregunta', async () => {
    const { storage, adapter } = await openTestStorage();
    await storage.questions.saveQuestions([question]);
    await storage.questions.saveQuestions([{ ...question, difficulty: 0.99 }]);
    const rows = await adapter.getAllAsync<{ c: number }>('SELECT COUNT(*) AS c FROM questions;');
    expect(rows[0]?.c).toBe(1);
    expect((await storage.questions.listByConcept('c1'))[0]?.difficulty).toBe(0.99);
  });
});

describe('SqliteProgressRepository', () => {
  it('persiste sesiones por usuario', async () => {
    const { storage } = await openTestStorage();
    await storage.progress.saveSession({
      id: 's1',
      userId: 'u1',
      topicId: 't1',
      startedAt: NOW,
      finishedAt: null,
      questionIds: ['c1:q0'],
      answers: [],
    });
    expect((await storage.progress.listSessions('u1')).map((s) => s.id)).toEqual(['s1']);
    expect(await storage.progress.getSession('s1')).not.toBeNull();
    expect(await storage.progress.listSessions('otro')).toHaveLength(0);
  });

  it('acumula evaluaciones con secuencia creciente', async () => {
    const { storage, adapter } = await openTestStorage();
    await storage.progress.appendEvaluations('u1', [evaluation]);
    await storage.progress.appendEvaluations('u1', [
      { ...evaluation, verdict: 'incorrecta' },
      { ...evaluation, verdict: 'parcial' },
    ]);

    const list = await storage.progress.listEvaluations('u1');
    expect(list.map((e) => e.verdict)).toEqual(['correcta', 'incorrecta', 'parcial']);

    const seqs = await adapter.getAllAsync<{ seq: number }>(
      'SELECT seq FROM evaluations WHERE user_id = ? ORDER BY seq;',
      ['u1'],
    );
    expect(seqs.map((row) => row.seq)).toEqual([1, 2, 3]);
  });

  it('no inserta nada si la lista de evaluaciones está vacía', async () => {
    const { storage, adapter } = await openTestStorage();
    await storage.progress.appendEvaluations('u1', []);
    const rows = await adapter.getAllAsync<{ c: number }>('SELECT COUNT(*) AS c FROM evaluations;');
    expect(rows[0]?.c).toBe(0);
  });

  it('hace upsert del estado de repaso por usuario y concepto', async () => {
    const { storage, adapter } = await openTestStorage();
    await storage.progress.saveReviewStates('u1', [review]);
    await storage.progress.saveReviewStates('u1', [{ ...review, repetitions: 5 }]);
    await storage.progress.saveReviewStates('u2', [review]);

    const rows = await adapter.getAllAsync<{ c: number }>(
      'SELECT COUNT(*) AS c FROM review_states;',
    );
    expect(rows[0]?.c).toBe(2);
    expect((await storage.progress.listReviewStates('u1'))[0]?.repetitions).toBe(5);
  });

  it('hace upsert del perfil de lagunas', async () => {
    const { storage, adapter } = await openTestStorage();
    await storage.progress.saveGapProfile({
      userId: 'u1',
      generatedAt: NOW,
      gaps: [],
      recommendedReview: [],
    });
    await storage.progress.saveGapProfile({
      userId: 'u1',
      generatedAt: NOW + 1,
      gaps: [],
      recommendedReview: ['c1'],
    });
    const rows = await adapter.getAllAsync<{ c: number }>(
      'SELECT COUNT(*) AS c FROM gap_profiles;',
    );
    expect(rows[0]?.c).toBe(1);
    expect((await storage.progress.getGapProfile('u1'))?.recommendedReview).toEqual(['c1']);
  });
});
