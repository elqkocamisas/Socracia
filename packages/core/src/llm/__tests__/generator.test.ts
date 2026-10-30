import type { Citation, Concept } from '../../domain/types';
import { LlmQuestionGenerator, parseQuestion, DEFAULT_GENERATOR_OPTIONS } from '../generator';
import { FakeLlmProvider } from '../fakeProvider';
import type { LlmPassage } from '../types';

const citation: Citation = {
  documentId: 'd1',
  documentTitle: 'Tema 1',
  chunkId: 'd1:0',
  excerpt: 'La Administración solo actúa con habilitación legal previa.',
  charStart: 0,
  charEnd: 60,
};

const passage: LlmPassage = { citation };

const concept: Concept = {
  id: 'c1',
  topicId: 't1',
  label: 'principio de legalidad',
  definition: 'La Administración necesita habilitación legal previa para actuar en el Derecho.',
  keywords: ['legalidad', 'habilitación'],
};

const target = {
  conceptId: concept.id,
  conceptLabel: concept.label,
  conceptDefinition: concept.definition,
  keyTerms: concept.keywords,
};

describe('LlmQuestionGenerator', () => {
  it('genera una pregunta anclada en el pasaje citado', async () => {
    const provider = new FakeLlmProvider([
      {
        text: JSON.stringify({
          prompt: '¿Qué ocurriría si la Administración pudiera actuar sin habilitación legal?',
          move: 'problematizar',
          level: 'analizar',
          difficulty: 0.6,
        }),
      },
    ]);
    const result = await new LlmQuestionGenerator(provider).generate(target, [passage]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(1);
      expect(result.value[0]?.citation.chunkId).toBe('d1:0');
      expect(result.value[0]?.level).toBe('analizar');
    }
  });

  it('descarta una pregunta trivial de puro recuerdo', async () => {
    const provider = new FakeLlmProvider([
      {
        text: JSON.stringify({
          prompt: '¿Qué es la legalidad?',
          move: 'definir',
          level: 'recordar',
          difficulty: 0.1,
        }),
      },
    ]);
    const result = await new LlmQuestionGenerator(provider).generate(target, [passage]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(0);
    }
  });

  it('sin pasajes no llama al modelo y devuelve vacío', async () => {
    const provider = new FakeLlmProvider([{ text: '{}' }]);
    const result = await new LlmQuestionGenerator(provider).generate(target, []);
    expect(result.ok).toBe(true);
    expect(provider.callCount()).toBe(0);
  });

  it('rechaza una salida con forma inválida', async () => {
    const provider = new FakeLlmProvider([{ text: JSON.stringify({ prompt: 'x' }) }]);
    const result = await new LlmQuestionGenerator(provider).generate(target, [passage]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('respuesta-invalida');
    }
  });

  it('propaga el error del proveedor', async () => {
    const provider = new FakeLlmProvider([{ error: { code: 'circuito-abierto', message: 'x' } }]);
    const result = await new LlmQuestionGenerator(provider).generate(target, [passage]);
    expect(result.ok).toBe(false);
  });

  it('parseQuestion valida el nivel cognitivo', () => {
    const bad = parseQuestion(
      JSON.stringify({ prompt: 'x', move: 'definir', level: 'inventado', difficulty: 0.5 }),
      target,
      passage,
      DEFAULT_GENERATOR_OPTIONS,
    );
    expect(bad.ok).toBe(false);
  });
});
