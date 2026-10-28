import type {
  Citation,
  CognitiveLevel,
  Concept,
  SocraticMove,
  SocraticQuestion,
} from '../domain/types';

/**
 * Plantilla de pregunta mayéutica.
 *
 * Cada plantilla combina un movimiento socrático con un nivel cognitivo. El
 * generador elige plantillas de nivel creciente para construir un itinerario
 * de asimilación progresiva en lugar de un test de memoria.
 */
export interface QuestionTemplate {
  readonly move: SocraticMove;
  readonly level: CognitiveLevel;
  /** Recibe la etiqueta del concepto y devuelve el enunciado. */
  readonly build: (conceptLabel: string, keywords: readonly string[]) => string;
  /** Peso de dificultad en [0, 1] usado para ordenar el itinerario. */
  readonly difficulty: number;
}

/**
 * Catálogo ordenado de plantillas.
 *
 * La progresión va de definir/comprender (asimilación) a aplicar/analizar y
 * evaluar (transferencia), que es el corazón del método mayéutico.
 */
export const QUESTION_TEMPLATES: readonly QuestionTemplate[] = [
  {
    move: 'definir',
    level: 'recordar',
    difficulty: 0.1,
    build: (label) =>
      `Define con tus palabras qué es «${label}» y señala qué lo distingue de conceptos parecidos.`,
  },
  {
    move: 'causa',
    level: 'comprender',
    difficulty: 0.3,
    build: (label) => `¿Por qué existe «${label}»? Explica la causa o necesidad que lo origina.`,
  },
  {
    move: 'consecuencia',
    level: 'comprender',
    difficulty: 0.35,
    build: (label) => `¿Qué consecuencias se derivan de «${label}»? Enumera al menos dos.`,
  },
  {
    move: 'comparar',
    level: 'analizar',
    difficulty: 0.5,
    build: (label, keywords) =>
      `Compara «${label}» con un concepto relacionado${
        keywords.length > 0 ? ` (por ejemplo, ${keywords.slice(0, 2).join(', ')})` : ''
      } y explica en qué se diferencian.`,
  },
  {
    move: 'problematizar',
    level: 'analizar',
    difficulty: 0.6,
    build: (label) =>
      `¿En qué caso «${label}» resultaría insuficiente o problemático? Justifica tu respuesta.`,
  },
  {
    move: 'contraejemplo',
    level: 'evaluar',
    difficulty: 0.7,
    build: (label) =>
      `Propón un contraejemplo que ponga en duda una lectura simplista de «${label}».`,
  },
  {
    move: 'aplicar-caso',
    level: 'aplicar',
    difficulty: 0.65,
    build: (label) =>
      `Aplica «${label}» a un caso concreto y explica paso a paso cómo lo resuelves.`,
  },
  {
    move: 'justificar',
    level: 'evaluar',
    difficulty: 0.8,
    build: (label) =>
      `Defiende o refuta esta afirmación sobre «${label}» y sostén tu posición con razones.`,
  },
];

/** Opciones de generación de preguntas. */
export interface GenerateQuestionsOptions {
  /** Número máximo de preguntas a generar por concepto. */
  readonly maxPerConcept: number;
  /** Si es `true`, se barajan las plantillas con una semilla determinista. */
  readonly shuffle: boolean;
  /** Semilla para reproducibilidad en pruebas. */
  readonly seed: number;
}

export const DEFAULT_GENERATE_OPTIONS: GenerateQuestionsOptions = {
  maxPerConcept: 4,
  shuffle: false,
  seed: 1,
};

/**
 * Genera preguntas mayéuticas para un concepto a partir de la evidencia
 * documental recuperada por el RAG.
 *
 * La `citation` garantiza trazabilidad: cada pregunta declara de qué fragmento
 * del documento del usuario proviene, requisito de la app.
 */
export function generateQuestions(
  concept: Concept,
  citation: Citation,
  options: GenerateQuestionsOptions = DEFAULT_GENERATE_OPTIONS,
): SocraticQuestion[] {
  const templates = options.shuffle
    ? shuffleWithSeed(QUESTION_TEMPLATES, options.seed)
    : QUESTION_TEMPLATES;

  return templates.slice(0, Math.max(0, options.maxPerConcept)).map((template, index) => ({
    id: `${concept.id}:q${index}`,
    conceptId: concept.id,
    prompt: template.build(concept.label, concept.keywords),
    move: template.move,
    level: template.level,
    expectedAnswer: concept.definition,
    keyTerms: concept.keywords,
    citation,
    difficulty: template.difficulty,
  }));
}

/** Ordena preguntas por dificultad creciente (itinerario de asimilación). */
export function orderByDifficulty(questions: readonly SocraticQuestion[]): SocraticQuestion[] {
  return [...questions].sort((a, b) => a.difficulty - b.difficulty);
}

/** Generador congruente lineal para barajados reproducibles. */
function shuffleWithSeed<T>(items: readonly T[], seed: number): T[] {
  const result = [...items];
  let state = seed >>> 0 || 1;
  for (let i = result.length - 1; i > 0; i -= 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const j = state % (i + 1);
    const a = result[i] as T;
    const b = result[j] as T;
    result[i] = b;
    result[j] = a;
  }
  return result;
}
