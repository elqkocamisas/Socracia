import type { Citation, Concept, SocraticQuestion } from '../domain/types';
import { generateQuestions } from '../mayeu/questionGenerator';
import {
  assessQuestionQuality,
  filterNonTrivial,
  DEFAULT_QUALITY_OPTIONS,
} from '../mayeu/questionQuality';

const concept: Concept = {
  id: 'c1',
  topicId: 't1',
  label: 'principio de legalidad',
  definition:
    'La Administración solo puede actuar con habilitación legal previa y sin invadir la reserva de ley.',
  keywords: ['legalidad', 'habilitación', 'Administración'],
};

const citation: Citation = {
  documentId: 'd1',
  documentTitle: 'Tema 1',
  chunkId: 'd1:0',
  excerpt: 'El principio de legalidad…',
  charStart: 0,
  charEnd: 30,
};

const baseQuestion: SocraticQuestion = {
  id: 'c1:q0',
  conceptId: 'c1',
  prompt: '¿Por qué existe «principio de legalidad»?',
  move: 'causa',
  level: 'comprender',
  expectedAnswer: concept.definition,
  keyTerms: concept.keywords,
  citation,
  difficulty: 0.3,
};

describe('assessQuestionQuality', () => {
  it('acepta una pregunta de comprensión con términos clave', () => {
    const report = assessQuestionQuality(baseQuestion);
    expect(report.isTrivial).toBe(false);
    expect(report.score).toBeGreaterThan(0.5);
  });

  it('marca trivial una pregunta de puro recuerdo', () => {
    const trivial: SocraticQuestion = {
      ...baseQuestion,
      prompt: 'Recita la definición de «principio de legalidad».',
      level: 'recordar',
    };
    const report = assessQuestionQuality(trivial);
    expect(report.isTrivial).toBe(true);
    expect(report.reasons.join(' ')).toContain('nivel');
  });

  it('penaliza una respuesta de referencia demasiado corta', () => {
    const short: SocraticQuestion = { ...baseQuestion, expectedAnswer: 'La ley.' };
    const report = assessQuestionQuality(short);
    expect(report.reasons.join(' ')).toContain('demasiado corta');
  });

  it('penaliza una pregunta sin términos clave', () => {
    const noTerms: SocraticQuestion = { ...baseQuestion, keyTerms: [] };
    const report = assessQuestionQuality(noTerms);
    expect(report.reasons.join(' ')).toContain('términos clave');
  });

  it('nunca devuelve puntuaciones fuera de [0, 1]', () => {
    const worst: SocraticQuestion = {
      ...baseQuestion,
      level: 'recordar',
      prompt: 'Recita la definición.',
      expectedAnswer: 'x',
      keyTerms: [],
    };
    const report = assessQuestionQuality(worst);
    expect(report.score).toBeGreaterThanOrEqual(0);
    expect(report.score).toBeLessThanOrEqual(1);
  });
});

describe('filterNonTrivial', () => {
  it('separa aceptadas de rechazadas', () => {
    const questions = generateQuestions(concept, citation, {
      maxPerConcept: 8,
      shuffle: false,
      seed: 1,
      minLevel: 'recordar',
    });
    const { accepted, rejected } = filterNonTrivial(questions);
    expect(accepted.length + rejected.length).toBe(questions.length);
    expect(rejected.every((q) => assessQuestionQuality(q).isTrivial)).toBe(true);
  });

  it('ordena las aceptadas por exigencia cognitiva creciente', () => {
    const questions = generateQuestions(concept, citation, {
      maxPerConcept: 8,
      shuffle: true,
      seed: 3,
      minLevel: 'recordar',
    });
    const { accepted } = filterNonTrivial(questions);
    for (let i = 1; i < accepted.length; i += 1) {
      const prev = accepted[i - 1]!;
      const current = accepted[i]!;
      const prevRank = ['recordar', 'comprender', 'aplicar', 'analizar', 'evaluar'].indexOf(
        prev.level,
      );
      const currentRank = ['recordar', 'comprender', 'aplicar', 'analizar', 'evaluar'].indexOf(
        current.level,
      );
      expect(currentRank).toBeGreaterThanOrEqual(prevRank);
    }
  });

  it('el generador con minLevel por defecto ya excluye el recuerdo puro', () => {
    const questions = generateQuestions(concept, citation, {
      maxPerConcept: 8,
      shuffle: false,
      seed: 1,
    });
    expect(questions.every((q) => q.level !== 'recordar')).toBe(true);
    expect(questions.length).toBeGreaterThan(0);
  });

  it('el umbral por defecto exige al menos comprensión', () => {
    expect(DEFAULT_QUALITY_OPTIONS.minLevel).toBe('comprender');
  });
});
