/**
 * Casos de evaluación del motor mayéutico con modelo.
 *
 * No miden la inteligencia del modelo —eso depende del proveedor— sino la
 * **robustez del motor** ante lo que un modelo real hace: devolver JSON roto,
 * veredictos inventados, puntuaciones fuera de rango, repreguntas que revelan la
 * respuesta o citas que no existen. Un caso pasa si el motor se comporta de
 * forma segura: acepta lo válido y **rechaza** lo inseguro sin lanzar nunca.
 *
 * Cada caso declara la respuesta del modelo y lo que debe hacer el motor:
 * `aceptar` (devuelve un valor utilizable) o `rechazar` (devuelve un error y la
 * sesión continúa con la heurística o la plantilla). El conjunto vive en el
 * repositorio, versionado con el código, para que un cambio de prompt o de
 * validación se note de inmediato.
 */

import type { Citation, SocraticQuestion, UserAnswer } from '../../domain/types';
import type { LlmPassage } from '../types';

/** Respuesta simulada del modelo, o el fallo del proveedor. */
export type ModelReply =
  | { readonly text: string }
  | { readonly error: 'timeout' | 'red' | 'cuota' | 'respuesta-invalida' };

/** Lo que el motor debe hacer ante la respuesta del modelo. */
export type Expectation = 'aceptar' | 'rechazar';

/** Categoría de la tarea mayéutica evaluada. */
export type EvalCategory =
  'evaluacion' | 'generacion' | 'seguimiento' | 'explicacion' | 'degradacion';

/** Un caso de evaluación. */
export interface EvalCase {
  readonly id: string;
  readonly category: EvalCategory;
  readonly description: string;
  readonly reply: ModelReply;
  readonly expectation: Expectation;
}

const citation: Citation = {
  documentId: 'doc-eval',
  documentTitle: 'Tema de evaluación',
  chunkId: 'doc-eval:0',
  excerpt: 'El principio de legalidad sujeta la actuación administrativa a la ley.',
  charStart: 0,
  charEnd: 70,
};

/** Pregunta, respuesta y pasajes comunes a los casos de evaluación. */
export const EVAL_QUESTION: SocraticQuestion = {
  id: 'c1:q0',
  conceptId: 'c1',
  prompt: '¿Por qué la Administración no puede actuar sin habilitación legal?',
  move: 'causa',
  level: 'comprender',
  expectedAnswer: 'Porque el principio de legalidad exige habilitación legal previa para actuar.',
  keyTerms: ['legalidad', 'habilitación'],
  citation,
  difficulty: 0.3,
};

export const EVAL_ANSWER: UserAnswer = {
  questionId: 'c1:q0',
  text: 'Porque debe someterse a la ley.',
  answeredAt: 0,
  latencyMs: 100,
};

export const EVAL_PASSAGES: readonly LlmPassage[] = [{ citation }];

/** Respuesta válida de evaluación con el veredicto y la puntuación indicados. */
function evalReply(verdict: 'correcta' | 'parcial' | 'incorrecta'): ModelReply {
  return {
    text: JSON.stringify({
      verdict,
      score: verdict === 'correcta' ? 0.9 : verdict === 'parcial' ? 0.5 : 0.1,
      matchedKeyTerms: verdict === 'incorrecta' ? [] : ['legalidad'],
      missingKeyTerms: verdict === 'correcta' ? [] : ['habilitación'],
      rationale: 'Juicio del modelo.',
    }),
  };
}

/**
 * Conjunto de casos: 32 en cinco categorías.
 *
 * Los de evaluación aceptan un juicio bien formado y rechazan uno mal formado.
 * Los de degradación comprueban que un fallo del proveedor no lanza. Generación,
 * seguimiento y explicación comprueban los filtros propios de cada tarea.
 */
export const EVAL_CASES: readonly EvalCase[] = [
  // Evaluación: juicios válidos (3).
  {
    id: 'eval-01',
    category: 'evaluacion',
    description: 'veredicto correcta',
    reply: evalReply('correcta'),
    expectation: 'aceptar',
  },
  {
    id: 'eval-02',
    category: 'evaluacion',
    description: 'veredicto parcial',
    reply: evalReply('parcial'),
    expectation: 'aceptar',
  },
  {
    id: 'eval-03',
    category: 'evaluacion',
    description: 'veredicto incorrecta',
    reply: evalReply('incorrecta'),
    expectation: 'aceptar',
  },
  // Evaluación: juicios mal formados (6).
  {
    id: 'eval-04',
    category: 'evaluacion',
    description: 'JSON roto',
    reply: { text: 'verdict: correcta (sin llaves)' },
    expectation: 'rechazar',
  },
  {
    id: 'eval-05',
    category: 'evaluacion',
    description: 'veredicto inventado',
    reply: {
      text: JSON.stringify({
        verdict: 'excelente',
        score: 1,
        matchedKeyTerms: [],
        missingKeyTerms: [],
        rationale: 'x',
      }),
    },
    expectation: 'rechazar',
  },
  {
    id: 'eval-06',
    category: 'evaluacion',
    description: 'score fuera de rango',
    reply: {
      text: JSON.stringify({
        verdict: 'correcta',
        score: 7,
        matchedKeyTerms: [],
        missingKeyTerms: [],
        rationale: 'x',
      }),
    },
    expectation: 'rechazar',
  },
  {
    id: 'eval-07',
    category: 'evaluacion',
    description: 'score negativo',
    reply: {
      text: JSON.stringify({
        verdict: 'parcial',
        score: -1,
        matchedKeyTerms: [],
        missingKeyTerms: [],
        rationale: 'x',
      }),
    },
    expectation: 'rechazar',
  },
  {
    id: 'eval-08',
    category: 'evaluacion',
    description: 'falta el veredicto',
    reply: {
      text: JSON.stringify({
        score: 0.5,
        matchedKeyTerms: [],
        missingKeyTerms: [],
        rationale: 'x',
      }),
    },
    expectation: 'rechazar',
  },
  {
    id: 'eval-09',
    category: 'evaluacion',
    description: 'score no numérico',
    reply: {
      text: JSON.stringify({
        verdict: 'correcta',
        score: 'alto',
        matchedKeyTerms: [],
        missingKeyTerms: [],
        rationale: 'x',
      }),
    },
    expectation: 'rechazar',
  },
  // Degradación: fallos del proveedor (4).
  {
    id: 'deg-01',
    category: 'degradacion',
    description: 'timeout',
    reply: { error: 'timeout' },
    expectation: 'rechazar',
  },
  {
    id: 'deg-02',
    category: 'degradacion',
    description: 'error de red',
    reply: { error: 'red' },
    expectation: 'rechazar',
  },
  {
    id: 'deg-03',
    category: 'degradacion',
    description: 'cuota agotada',
    reply: { error: 'cuota' },
    expectation: 'rechazar',
  },
  {
    id: 'deg-04',
    category: 'degradacion',
    description: 'respuesta inválida del proveedor',
    reply: { error: 'respuesta-invalida' },
    expectation: 'rechazar',
  },
  // Generación: anclaje y validación (8).
  {
    id: 'gen-01',
    category: 'generacion',
    description: 'pregunta válida de causa',
    reply: {
      text: JSON.stringify({
        prompt: '¿Por qué la ley previa es condición para actuar?',
        move: 'causa',
        level: 'comprender',
        difficulty: 0.4,
        keyTerms: ['ley'],
      }),
    },
    expectation: 'aceptar',
  },
  {
    id: 'gen-02',
    category: 'generacion',
    description: 'move inventado',
    reply: {
      text: JSON.stringify({
        prompt: '¿Pregunta?',
        move: 'interrogar',
        level: 'comprender',
        difficulty: 0.4,
        keyTerms: [],
      }),
    },
    expectation: 'rechazar',
  },
  {
    id: 'gen-03',
    category: 'generacion',
    description: 'level inventado',
    reply: {
      text: JSON.stringify({
        prompt: '¿Pregunta?',
        move: 'causa',
        level: 'iluminar',
        difficulty: 0.4,
        keyTerms: [],
      }),
    },
    expectation: 'rechazar',
  },
  {
    id: 'gen-04',
    category: 'generacion',
    description: 'pregunta vacía',
    reply: {
      text: JSON.stringify({
        prompt: '   ',
        move: 'causa',
        level: 'comprender',
        difficulty: 0.4,
        keyTerms: [],
      }),
    },
    expectation: 'rechazar',
  },
  {
    id: 'gen-05',
    category: 'generacion',
    description: 'dificultad fuera de rango',
    reply: {
      text: JSON.stringify({
        prompt: '¿Pregunta?',
        move: 'causa',
        level: 'comprender',
        difficulty: 3,
        keyTerms: [],
      }),
    },
    expectation: 'rechazar',
  },
  {
    id: 'gen-06',
    category: 'generacion',
    description: 'pregunta de puro recuerdo',
    reply: {
      text: JSON.stringify({
        prompt: '¿Cómo se llama?',
        move: 'definir',
        level: 'recordar',
        difficulty: 0.2,
        keyTerms: [],
      }),
    },
    expectation: 'rechazar',
  },
  {
    id: 'gen-07',
    category: 'generacion',
    description: 'JSON truncado',
    reply: { text: '{"prompt":"¿Por qué' },
    expectation: 'rechazar',
  },
  {
    id: 'gen-08',
    category: 'generacion',
    description: 'pregunta válida de aplicación',
    reply: {
      text: JSON.stringify({
        prompt: '¿Qué ocurriría si la Administración actuara sin ley habilitante?',
        move: 'consecuencia',
        level: 'aplicar',
        difficulty: 0.6,
        keyTerms: ['ley'],
      }),
    },
    expectation: 'aceptar',
  },
  // Seguimiento: la repregunta no puede revelar la respuesta (6).
  {
    id: 'fup-01',
    category: 'seguimiento',
    description: 'repregunta que orienta sin resolver',
    reply: {
      text: JSON.stringify({
        kind: 'acotar',
        prompt: '¿Qué necesita la Administración antes de actuar?',
        hints: ['ley'],
      }),
    },
    expectation: 'aceptar',
  },
  {
    id: 'fup-02',
    category: 'seguimiento',
    description: 'repregunta que revela la respuesta',
    reply: {
      text: JSON.stringify({
        kind: 'acotar',
        prompt:
          'Porque el principio de legalidad exige habilitación legal previa para actuar, ¿lo ves?',
        hints: [],
      }),
    },
    expectation: 'rechazar',
  },
  {
    id: 'fup-03',
    category: 'seguimiento',
    description: 'kind inventado',
    reply: { text: JSON.stringify({ kind: 'premiar', prompt: '¿Y ahora?', hints: [] }) },
    expectation: 'rechazar',
  },
  {
    id: 'fup-04',
    category: 'seguimiento',
    description: 'repregunta vacía',
    reply: { text: JSON.stringify({ kind: 'orientar', prompt: '', hints: [] }) },
    expectation: 'rechazar',
  },
  {
    id: 'fup-05',
    category: 'seguimiento',
    description: 'repregunta que descompone',
    reply: {
      text: JSON.stringify({
        kind: 'descomponer',
        prompt: 'Empecemos por una parte: ¿qué es la ley en este contexto?',
        hints: ['ley'],
      }),
    },
    expectation: 'aceptar',
  },
  {
    id: 'fup-06',
    category: 'seguimiento',
    description: 'JSON roto en seguimiento',
    reply: { text: 'kind: acotar' },
    expectation: 'rechazar',
  },
  // Explicación: fundamentación con citas (5).
  {
    id: 'exp-01',
    category: 'explicacion',
    description: 'explicación con cita válida',
    reply: {
      text: JSON.stringify({
        explanation: 'La ley habilita la actuación.',
        citations: ['doc-eval:0'],
      }),
    },
    expectation: 'aceptar',
  },
  {
    id: 'exp-02',
    category: 'explicacion',
    description: 'explicación con cita inventada',
    reply: { text: JSON.stringify({ explanation: 'Inventado.', citations: ['no-existe:9'] }) },
    expectation: 'rechazar',
  },
  {
    id: 'exp-03',
    category: 'explicacion',
    description: 'explicación sin citas',
    reply: { text: JSON.stringify({ explanation: 'Sin fundamento.', citations: [] }) },
    expectation: 'rechazar',
  },
  {
    id: 'exp-04',
    category: 'explicacion',
    description: 'cita válida entre varias inventadas',
    reply: {
      text: JSON.stringify({ explanation: 'Mezcla.', citations: ['no-existe:9', 'doc-eval:0'] }),
    },
    expectation: 'aceptar',
  },
  {
    id: 'exp-05',
    category: 'explicacion',
    description: 'explicación vacía',
    reply: { text: JSON.stringify({ explanation: '', citations: ['doc-eval:0'] }) },
    expectation: 'rechazar',
  },
];
