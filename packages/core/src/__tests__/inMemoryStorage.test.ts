import { inMemoryStorage } from '../storage/inMemory';
import {
  InMemoryDocumentRepository,
  InMemoryQuestionRepository,
  InMemoryProgressRepository,
} from '../storage/inMemory';
import type {
  AnswerEvaluation,
  KnowledgeDocument,
  ReviewState,
  SocraticQuestion,
} from '../domain/types';

const NOW = 1_700_000_000_000;

const document: KnowledgeDocument = {
  id: 'd1',
  title: 'Tema 1',
  mimeType: 'text/plain',
  sourceKind: 'document',
  uri: 'file:///t.txt',
  sizeBytes: 100,
  ingestedAt: NOW,
  cloudConsent: false,
};

const question: SocraticQuestion = {
  id: 'c1:q0',
  conceptId: 'c1',
  prompt: '¿Por qué?',
  move: 'causa',
  level: 'comprender',
  expectedAnswer: 'Porque sí, y esto es una respuesta de referencia suficientemente larga.',
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

describe('InMemoryDocumentRepository', () => {
  it('guarda y recupera documentos', async () => {
    const repo = new InMemoryDocumentRepository();
    await repo.saveDocument(document);
    expect(await repo.getDocument('d1')).toEqual(document);
    expect(await repo.getDocument('nope')).toBeNull();
  });

  it('lista los documentos del más reciente al más antiguo', async () => {
    const repo = new InMemoryDocumentRepository();
    await repo.saveDocument({ ...document, id: 'a', ingestedAt: NOW - 1000 });
    await repo.saveDocument({ ...document, id: 'b', ingestedAt: NOW });
    const list = await repo.listDocuments();
    expect(list.map((d) => d.id)).toEqual(['b', 'a']);
  });

  it('borra en cascada documento y temario', async () => {
    const repo = new InMemoryDocumentRepository();
    await repo.saveDocument(document);
    await repo.saveCurriculum({ id: 'd1', title: 'T', topics: [], concepts: [], createdAt: NOW });
    await repo.deleteDocument('d1');
    expect(await repo.getDocument('d1')).toBeNull();
    expect(await repo.getCurriculum('d1')).toBeNull();
  });

  it('guarda y lista temarios', async () => {
    const repo = new InMemoryDocumentRepository();
    await repo.saveCurriculum({ id: 'd1', title: 'Uno', topics: [], concepts: [], createdAt: NOW });
    await repo.saveCurriculum({
      id: 'd2',
      title: 'Dos',
      topics: [],
      concepts: [],
      createdAt: NOW + 1,
    });
    const list = await repo.listCurricula();
    expect(list.map((c) => c.id)).toEqual(['d2', 'd1']);
  });
});

describe('InMemoryQuestionRepository', () => {
  it('guarda y lista por concepto, ordenado por dificultad', async () => {
    const repo = new InMemoryQuestionRepository();
    await repo.saveQuestions([
      { ...question, id: 'c1:q1', difficulty: 0.8 },
      { ...question, id: 'c1:q0', difficulty: 0.3 },
      { ...question, id: 'c2:q0', conceptId: 'c2', difficulty: 0.1 },
    ]);
    const list = await repo.listByConcept('c1');
    expect(list.map((q) => q.id)).toEqual(['c1:q0', 'c1:q1']);
  });

  it('lista por documento usando la cita', async () => {
    const repo = new InMemoryQuestionRepository();
    await repo.saveQuestions([
      question,
      { ...question, id: 'c9:q0', citation: { ...question.citation, documentId: 'd9' } },
    ]);
    const list = await repo.listByDocument('d1');
    expect(list.map((q) => q.id)).toEqual(['c1:q0']);
  });

  it('reemplaza la pregunta al volver a guardar el mismo id', async () => {
    const repo = new InMemoryQuestionRepository();
    await repo.saveQuestions([question]);
    await repo.saveQuestions([{ ...question, difficulty: 0.99 }]);
    const list = await repo.listByConcept('c1');
    expect(list).toHaveLength(1);
    expect(list[0]?.difficulty).toBe(0.99);
  });
});

describe('InMemoryProgressRepository', () => {
  it('guarda y recupera sesiones por usuario', async () => {
    const repo = new InMemoryProgressRepository();
    await repo.saveSession({
      id: 's1',
      userId: 'u1',
      topicId: 't1',
      startedAt: NOW,
      finishedAt: null,
      questionIds: [],
      answers: [],
    });
    await repo.saveSession({
      id: 's2',
      userId: 'u2',
      topicId: 't1',
      startedAt: NOW,
      finishedAt: null,
      questionIds: [],
      answers: [],
    });
    expect((await repo.listSessions('u1')).map((s) => s.id)).toEqual(['s1']);
    expect(await repo.getSession('s2')).not.toBeNull();
  });

  it('acumula evaluaciones en orden', async () => {
    const repo = new InMemoryProgressRepository();
    await repo.appendEvaluations('u1', [evaluation]);
    await repo.appendEvaluations('u1', [{ ...evaluation, verdict: 'incorrecta' }]);
    const list = await repo.listEvaluations('u1');
    expect(list).toHaveLength(2);
    expect(list[1]?.verdict).toBe('incorrecta');
  });

  it('reemplaza el estado de repaso por concepto', async () => {
    const repo = new InMemoryProgressRepository();
    await repo.saveReviewStates('u1', [review]);
    await repo.saveReviewStates('u1', [{ ...review, ease: 2.8, repetitions: 2 }]);
    const list = await repo.listReviewStates('u1');
    expect(list).toHaveLength(1);
    expect(list[0]?.repetitions).toBe(2);
  });

  it('guarda y recupera el perfil de lagunas', async () => {
    const repo = new InMemoryProgressRepository();
    expect(await repo.getGapProfile('u1')).toBeNull();
    await repo.saveGapProfile({ userId: 'u1', generatedAt: NOW, gaps: [], recommendedReview: [] });
    expect(await repo.getGapProfile('u1')).not.toBeNull();
  });
});

describe('inMemoryStorage', () => {
  it('compone los tres repositorios', async () => {
    const storage = inMemoryStorage();
    await storage.documents.saveDocument(document);
    await storage.questions.saveQuestions([question]);
    await storage.progress.appendEvaluations('u1', [evaluation]);
    expect((await storage.documents.listDocuments()).length).toBe(1);
    expect((await storage.questions.listByConcept('c1')).length).toBe(1);
    expect((await storage.progress.listEvaluations('u1')).length).toBe(1);
  });
});
