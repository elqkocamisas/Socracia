import type { SocraticQuestion, UserAnswer } from '../domain/types';
import { evaluateAnswer } from '../mayeu/evaluate';

const question: SocraticQuestion = {
  id: 'c1:q0',
  conceptId: 'c1',
  prompt: 'Define el principio de legalidad.',
  move: 'definir',
  level: 'recordar',
  expectedAnswer:
    'La Administración solo puede actuar con habilitación legal previa según la Constitución.',
  keyTerms: ['legalidad', 'habilitación', 'Administración'],
  citation: {
    documentId: 'd1',
    documentTitle: 'Temario',
    chunkId: 'd1:0',
    excerpt: '',
    charStart: 0,
    charEnd: 0,
  },
  difficulty: 0.1,
};

function answer(text: string): UserAnswer {
  return { questionId: question.id, text, answeredAt: 0, latencyMs: 1000 };
}

describe('evaluateAnswer', () => {
  it('marca sin-respuesta cuando no hay respuesta', () => {
    const evaluation = evaluateAnswer(question, null);
    expect(evaluation.verdict).toBe('sin-respuesta');
    expect(evaluation.score).toBe(0);
    expect(evaluation.missingKeyTerms).toEqual(question.keyTerms);
  });

  it('marca sin-respuesta para texto en blanco', () => {
    expect(evaluateAnswer(question, answer('   ')).verdict).toBe('sin-respuesta');
  });

  it('marca correcta una respuesta completa', () => {
    const evaluation = evaluateAnswer(
      question,
      answer(
        'Es el principio por el que la Administración necesita habilitación legal previa para actuar, conforme a la legalidad.',
      ),
    );
    expect(evaluation.verdict).toBe('correcta');
    expect(evaluation.score).toBeGreaterThanOrEqual(0.6);
    expect(evaluation.matchedKeyTerms).toContain('legalidad');
  });

  it('marca parcial una respuesta incompleta', () => {
    const evaluation = evaluateAnswer(
      question,
      answer(
        'Tiene que ver con la legalidad y con cómo actúa la Administración, aunque no sabría precisarlo mejor.',
      ),
    );
    expect(evaluation.verdict).toBe('parcial');
    expect(evaluation.missingKeyTerms.length).toBeGreaterThan(0);
  });

  it('marca incorrecta una mención vaga sin contenido sustantivo', () => {
    const evaluation = evaluateAnswer(question, answer('Tiene que ver con la legalidad.'));
    expect(evaluation.verdict).toBe('incorrecta');
  });

  it('marca incorrecta una respuesta fuera de tema', () => {
    const evaluation = evaluateAnswer(question, answer('Es la derivada de una función compuesta.'));
    expect(evaluation.verdict).toBe('incorrecta');
  });

  it('reconoce términos con acentos y mayúsculas', () => {
    const evaluation = evaluateAnswer(
      question,
      answer('La ADMINISTRACIÓN requiere habilitación y respeto a la LEGALIDAD.'),
    );
    expect(evaluation.matchedKeyTerms).toContain('legalidad');
    expect(evaluation.matchedKeyTerms).toContain('Administración');
  });

  it('siempre produce un feedback no vacío', () => {
    for (const text of ['', 'no sé', 'La Administración actúa con habilitación legal']) {
      expect(evaluateAnswer(question, answer(text)).feedback.length).toBeGreaterThan(0);
    }
  });

  it('mantiene la puntuación dentro de [0, 1]', () => {
    const evaluation = evaluateAnswer(question, answer('legalidad habilitación Administración'));
    expect(evaluation.score).toBeGreaterThanOrEqual(0);
    expect(evaluation.score).toBeLessThanOrEqual(1);
  });
});
