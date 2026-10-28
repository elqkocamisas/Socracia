import type {
  AnswerEvaluation,
  GapProfile,
  KnowledgeDocument,
  ReviewState,
  SocraticQuestion,
  StudySession,
} from '../domain/types';
import type {
  CurriculumRecord,
  DocumentRepository,
  ProgressRepository,
  QuestionRepository,
  StoragePort,
} from './ports';

/**
 * Almacenamiento en memoria.
 *
 * Sirve como doble en las pruebas del dominio y como respaldo si la capa
 * nativa (SQLite) no está disponible. Mantiene el orden de inserción para que
 * los listados sean deterministas.
 */
export class InMemoryDocumentRepository implements DocumentRepository {
  private readonly documents = new Map<string, KnowledgeDocument>();
  private readonly curricula = new Map<string, CurriculumRecord>();

  public async saveDocument(document: KnowledgeDocument): Promise<void> {
    this.documents.set(document.id, document);
  }

  public async listDocuments(): Promise<readonly KnowledgeDocument[]> {
    return [...this.documents.values()].sort((a, b) => b.ingestedAt - a.ingestedAt);
  }

  public async getDocument(id: string): Promise<KnowledgeDocument | null> {
    return this.documents.get(id) ?? null;
  }

  public async deleteDocument(id: string): Promise<void> {
    this.documents.delete(id);
    this.curricula.delete(id);
  }

  public async saveCurriculum(record: CurriculumRecord): Promise<void> {
    this.curricula.set(record.id, record);
  }

  public async getCurriculum(documentId: string): Promise<CurriculumRecord | null> {
    return this.curricula.get(documentId) ?? null;
  }

  public async listCurricula(): Promise<readonly CurriculumRecord[]> {
    return [...this.curricula.values()].sort((a, b) => b.createdAt - a.createdAt);
  }
}

export class InMemoryQuestionRepository implements QuestionRepository {
  private readonly questions = new Map<string, SocraticQuestion>();

  public async saveQuestions(questions: readonly SocraticQuestion[]): Promise<void> {
    for (const question of questions) {
      this.questions.set(question.id, question);
    }
  }

  public async listByConcept(conceptId: string): Promise<readonly SocraticQuestion[]> {
    return [...this.questions.values()]
      .filter((question) => question.conceptId === conceptId)
      .sort(compareQuestions);
  }

  public async listByDocument(documentId: string): Promise<readonly SocraticQuestion[]> {
    return [...this.questions.values()]
      .filter((question) => question.citation.documentId === documentId)
      .sort(compareQuestions);
  }
}

export class InMemoryProgressRepository implements ProgressRepository {
  private readonly sessions = new Map<string, StudySession>();
  private readonly evaluations = new Map<string, AnswerEvaluation[]>();
  private readonly reviews = new Map<string, ReviewState[]>();
  private readonly gapProfiles = new Map<string, GapProfile>();

  public async saveSession(session: StudySession): Promise<void> {
    this.sessions.set(session.id, session);
  }

  public async getSession(id: string): Promise<StudySession | null> {
    return this.sessions.get(id) ?? null;
  }

  public async listSessions(userId: string): Promise<readonly StudySession[]> {
    return [...this.sessions.values()]
      .filter((session) => session.userId === userId)
      .sort((a, b) => a.startedAt - b.startedAt);
  }

  public async appendEvaluations(
    userId: string,
    evaluations: readonly AnswerEvaluation[],
  ): Promise<void> {
    const existing = this.evaluations.get(userId) ?? [];
    this.evaluations.set(userId, [...existing, ...evaluations]);
  }

  public async listEvaluations(userId: string): Promise<readonly AnswerEvaluation[]> {
    return [...(this.evaluations.get(userId) ?? [])];
  }

  public async saveReviewStates(userId: string, states: readonly ReviewState[]): Promise<void> {
    const byConcept = new Map(
      (this.reviews.get(userId) ?? []).map((state) => [state.conceptId, state]),
    );
    for (const state of states) {
      byConcept.set(state.conceptId, state);
    }
    this.reviews.set(userId, [...byConcept.values()]);
  }

  public async listReviewStates(userId: string): Promise<readonly ReviewState[]> {
    return [...(this.reviews.get(userId) ?? [])];
  }

  public async saveGapProfile(profile: GapProfile): Promise<void> {
    this.gapProfiles.set(profile.userId, profile);
  }

  public async getGapProfile(userId: string): Promise<GapProfile | null> {
    return this.gapProfiles.get(userId) ?? null;
  }
}

/** Implementación completa en memoria. */
export function inMemoryStorage(): StoragePort {
  return {
    documents: new InMemoryDocumentRepository(),
    questions: new InMemoryQuestionRepository(),
    progress: new InMemoryProgressRepository(),
  };
}

function compareQuestions(a: SocraticQuestion, b: SocraticQuestion): number {
  return a.difficulty === b.difficulty ? a.id.localeCompare(b.id) : a.difficulty - b.difficulty;
}
