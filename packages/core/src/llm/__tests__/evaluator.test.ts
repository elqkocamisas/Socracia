import type { Citation, SocraticQuestion, UserAnswer } from '../../domain/types';
import { DEFAULT_THRESHOLDS } from '../../mayeu/evaluate';
import { LlmAnswerEvaluator, parseEvaluation, type EvaluationPassage } from '../evaluator';
import { FakeLlmProvider } from '../fakeProvider';

const NOW = 1_700_000_000_000;

const citation: Citation = {
  documentId: 'd1',
  documentTitle: 'Tema 1',
  chunkId: 'd1:0',
  excerpt: 'La Administración solo actúa con habilitación legal previa.',
  charStart: 0,
  charEnd: 60,
};

const question: SocraticQuestion = {
  id: 'c1:q0',
  conceptId: 'c1',
  prompt: '¿Por qué existe el principio de legalidad?',
  move: 'causa',
  level: 'comprender',
  expectedAnswer: 'Porque la Administración necesita habilitación legal previa.',
  keyTerms: ['legalidad', 'habilitación'],
  citation,
  difficulty: 0.3,
};

const answer: UserAnswer = {
  questionId: 'c1:q0',
  text: 'Porque la Administración solo puede actuar si la ley la habilita.',
  answeredAt: NOW,
  latencyMs: 1200,
};

const passages: EvaluationPassage[] = [{ citation }];

describe('LlmAnswerEvaluator', () => {
  it('evalúa con veredicto, puntuación, razonamiento y cita verificable', async () => {
    const provider = new FakeLlmProvider([
      {
        text: JSON.stringify({
          verdict: 'correcta',
          score: 0.9,
          matchedKeyTerms: ['legalidad', 'habilitación'],
          missingKeyTerms: [],
          rationale: 'Capta la necesidad de habilitación previa.',
          citation: 'd1:0',
        }),
      },
    ]);
    const result = await new LlmAnswerEvaluator(provider).evaluate(question, answer, passages);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.verdict).toBe('correcta');
      expect(result.value.score).toBe(0.9);
      expect(result.value.rationale).toContain('habilitación');
      expect(result.value.citation?.chunkId).toBe('d1:0');
    }
  });

  it('descarta una cita que no corresponde a ningún pasaje enviado', async () => {
    const provider = new FakeLlmProvider([
      {
        text: JSON.stringify({
          verdict: 'parcial',
          score: 0.4,
          matchedKeyTerms: ['legalidad'],
          missingKeyTerms: ['habilitación'],
          rationale: 'Incompleta.',
          citation: 'd9:99',
        }),
      },
    ]);
    const result = await new LlmAnswerEvaluator(provider).evaluate(question, answer, passages);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.citation).toBeUndefined();
    }
  });

  it('recalcula el veredicto desde la puntuación si el modelo se contradice', async () => {
    const provider = new FakeLlmProvider([
      {
        text: JSON.stringify({
          verdict: 'correcta',
          score: 0.1,
          matchedKeyTerms: [],
          missingKeyTerms: ['legalidad'],
          rationale: 'Casi nada.',
        }),
      },
    ]);
    const result = await new LlmAnswerEvaluator(provider).evaluate(question, answer, passages);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.verdict).toBe('incorrecta');
    }
  });

  it('rechaza una puntuación fuera de [0, 1]', async () => {
    const provider = new FakeLlmProvider([
      {
        text: JSON.stringify({
          verdict: 'correcta',
          score: 1.7,
          matchedKeyTerms: [],
          missingKeyTerms: [],
          rationale: 'x',
        }),
      },
    ]);
    const result = await new LlmAnswerEvaluator(provider).evaluate(question, answer, passages);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('respuesta-invalida');
    }
  });

  it('devuelve respuesta-invalida si no hay JSON', async () => {
    const provider = new FakeLlmProvider([{ text: 'No puedo evaluarlo.' }]);
    const result = await new LlmAnswerEvaluator(provider).evaluate(question, answer, passages);
    expect(result.ok).toBe(false);
  });

  it('propaga el error del proveedor sin inventar evaluación', async () => {
    const provider = new FakeLlmProvider([{ error: { code: 'timeout', message: 'tarde' } }]);
    const result = await new LlmAnswerEvaluator(provider).evaluate(question, answer, passages);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('timeout');
    }
  });

  it('parseEvaluation tolera el JSON envuelto en texto', () => {
    const parsed = parseEvaluation(
      'Aquí va:\n```json\n{"verdict":"parcial","score":0.5,"matchedKeyTerms":["a"],"missingKeyTerms":[],"rationale":"ok","citation":"d1:0"}\n```',
      question,
      passages,
      DEFAULT_THRESHOLDS,
    );
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.value.verdict).toBe('parcial');
      expect(parsed.value.citation?.chunkId).toBe('d1:0');
    }
  });
});
