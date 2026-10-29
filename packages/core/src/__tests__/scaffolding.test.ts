import type { AnswerEvaluation, Citation, SocraticQuestion } from '../domain/types';
import { buildScaffold, needsScaffold } from '../mayeu/scaffolding';

const citation: Citation = {
  documentId: 'd1',
  documentTitle: 'Tema 1',
  chunkId: 'd1:0',
  excerpt: '…',
  charStart: 0,
  charEnd: 10,
};

const question: SocraticQuestion = {
  id: 'c1:q0',
  conceptId: 'c1',
  prompt: '¿Por qué existe el principio de legalidad?',
  move: 'causa',
  level: 'comprender',
  expectedAnswer: 'Porque la Administración necesita habilitación legal previa.',
  keyTerms: ['legalidad', 'habilitación', 'Administración'],
  citation,
  difficulty: 0.3,
};

function evaluation(
  verdict: AnswerEvaluation['verdict'],
  missing: readonly string[],
): AnswerEvaluation {
  return {
    questionId: 'c1:q0',
    conceptId: 'c1',
    verdict,
    score: 0,
    matchedKeyTerms: [],
    missingKeyTerms: missing,
    feedback: '',
  };
}

describe('buildScaffold', () => {
  it('orienta cuando no hubo respuesta, sin dar la solución', () => {
    const scaffold = buildScaffold(
      question,
      evaluation('sin-respuesta', ['legalidad']),
      'legalidad',
    );
    expect(scaffold.kind).toBe('orientar');
    expect(scaffold.prompt).toContain('legalidad');
    expect(scaffold.prompt).not.toContain('habilitación legal previa');
  });

  it('descompone el problema cuando la respuesta es incorrecta', () => {
    const scaffold = buildScaffold(
      question,
      evaluation('incorrecta', ['habilitación']),
      'legalidad',
    );
    expect(scaffold.kind).toBe('descomponer');
    expect(scaffold.hints).toContain('habilitación');
  });

  it('acota la repregunta cuando la respuesta es parcial', () => {
    const scaffold = buildScaffold(
      question,
      evaluation('parcial', ['Administración']),
      'legalidad',
    );
    expect(scaffold.kind).toBe('acotar');
    expect(scaffold.hints.length).toBeGreaterThan(0);
  });

  it('propone un ejemplo cuando la respuesta es correcta', () => {
    const scaffold = buildScaffold(question, evaluation('correcta', []), 'Principio de legalidad');
    expect(scaffold.kind).toBe('ejemplificar');
  });

  it('nombra el concepto, nunca su identificador interno', () => {
    const scaffold = buildScaffold(question, evaluation('correcta', []), 'Principio de legalidad');
    expect(scaffold.prompt).toContain('Principio de legalidad');
    expect(scaffold.prompt).not.toContain(question.conceptId);
  });

  it('nunca entrega la respuesta de referencia completa', () => {
    for (const verdict of ['sin-respuesta', 'incorrecta', 'parcial'] as const) {
      const scaffold = buildScaffold(question, evaluation(verdict, ['legalidad']), 'legalidad');
      expect(scaffold.prompt).not.toContain(question.expectedAnswer);
    }
  });
});

describe('needsScaffold', () => {
  it('solo la respuesta correcta no requiere repregunta', () => {
    expect(needsScaffold(evaluation('correcta', []))).toBe(false);
    expect(needsScaffold(evaluation('parcial', []))).toBe(true);
    expect(needsScaffold(evaluation('incorrecta', []))).toBe(true);
    expect(needsScaffold(evaluation('sin-respuesta', []))).toBe(true);
  });
});
