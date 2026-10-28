import type { Citation, Concept } from '../domain/types';
import {
  generateQuestions,
  orderByDifficulty,
  QUESTION_TEMPLATES,
} from '../mayeu/questionGenerator';

const concept: Concept = {
  id: 'c1',
  topicId: 't1',
  label: 'principio de legalidad',
  definition: 'La Administración solo puede actuar con habilitación legal previa.',
  keywords: ['legalidad', 'habilitación', 'Administración'],
};

const citation: Citation = {
  documentId: 'd1',
  documentTitle: 'Temario Tema 1',
  chunkId: 'd1:0',
  excerpt: 'El principio de legalidad...',
  charStart: 0,
  charEnd: 30,
};

describe('generateQuestions', () => {
  it('genera el número de preguntas solicitado', () => {
    const questions = generateQuestions(concept, citation, {
      maxPerConcept: 3,
      shuffle: false,
      seed: 1,
    });
    expect(questions).toHaveLength(3);
  });

  it('no genera más preguntas que plantillas elegibles existen', () => {
    const questions = generateQuestions(concept, citation, {
      maxPerConcept: 999,
      shuffle: false,
      seed: 1,
      minLevel: 'recordar',
    });
    expect(questions).toHaveLength(QUESTION_TEMPLATES.length);
  });

  it('excluye el recuerdo puro con el nivel mínimo por defecto', () => {
    const questions = generateQuestions(concept, citation, {
      maxPerConcept: 999,
      shuffle: false,
      seed: 1,
    });
    const recallTemplates = QUESTION_TEMPLATES.filter((t) => t.level === 'recordar').length;
    expect(recallTemplates).toBeGreaterThan(0);
    expect(questions).toHaveLength(QUESTION_TEMPLATES.length - recallTemplates);
    expect(questions.every((q) => q.level !== 'recordar')).toBe(true);
  });

  it('adjunta la cita documental a cada pregunta (trazabilidad)', () => {
    const questions = generateQuestions(concept, citation, {
      maxPerConcept: 2,
      shuffle: false,
      seed: 1,
    });
    for (const question of questions) {
      expect(question.citation.documentId).toBe('d1');
      expect(question.citation.chunkId).toBe('d1:0');
    }
  });

  it('incluye la etiqueta del concepto en el enunciado', () => {
    const questions = generateQuestions(concept, citation, {
      maxPerConcept: 1,
      shuffle: false,
      seed: 1,
    });
    expect(questions[0]?.prompt).toContain('principio de legalidad');
  });

  it('propone niveles cognitivos variados, no solo memoria', () => {
    const questions = generateQuestions(concept, citation, {
      maxPerConcept: 4,
      shuffle: false,
      seed: 1,
    });
    const levels = new Set(questions.map((question) => question.level));
    expect(levels.size).toBeGreaterThan(1);
  });

  it('es reproducible con la misma semilla al barajar', () => {
    const a = generateQuestions(concept, citation, { maxPerConcept: 4, shuffle: true, seed: 42 });
    const b = generateQuestions(concept, citation, { maxPerConcept: 4, shuffle: true, seed: 42 });
    expect(a.map((q) => q.id)).toEqual(b.map((q) => q.id));
  });

  it('con maxPerConcept 0 devuelve lista vacía', () => {
    expect(
      generateQuestions(concept, citation, { maxPerConcept: 0, shuffle: false, seed: 1 }),
    ).toEqual([]);
  });
});

describe('orderByDifficulty', () => {
  it('ordena por dificultad creciente', () => {
    const questions = generateQuestions(concept, citation, {
      maxPerConcept: 5,
      shuffle: true,
      seed: 7,
    });
    const ordered = orderByDifficulty(questions);
    for (let i = 1; i < ordered.length; i += 1) {
      expect(ordered[i]!.difficulty).toBeGreaterThanOrEqual(ordered[i - 1]!.difficulty);
    }
  });
});
