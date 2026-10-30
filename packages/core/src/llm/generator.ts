/**
 * Generador de preguntas socráticas con modelo.
 *
 * A diferencia del generador por plantillas (`mayeu/questionGenerator`), este
 * redacta preguntas ancladas al pasaje concreto que se le envía, y **exige** que
 * el resultado pase el mismo filtro de no-trivialidad que el resto del motor.
 *
 * La cita no la inventa el modelo: se toma del pasaje enviado, de modo que toda
 * pregunta generada apunta a un fragmento real del documento del usuario.
 */

import type { CognitiveLevel, SocraticMove, SocraticQuestion } from '../domain/types';

import { DEFAULT_QUALITY_OPTIONS, assessQuestionQuality } from '../mayeu/questionQuality';
import type { Result } from '../result';
import { err, ok } from '../result';
import { describeSchemaError, extractJsonObject, nonEmptyString, numberInRange, oneOf, record, type SchemaError } from './json';
import type { QuestionGeneratorPort } from './ports';
import { generationPrompt } from './prompts';
import type { LlmError, LlmPassage, LlmProvider } from './types';

const MOVES = [
  'definir',
  'problematizar',
  'contraejemplo',
  'causa',
  'consecuencia',
  'comparar',
  'justificar',
  'aplicar-caso',
] as const;

const LEVELS = ['recordar', 'comprender', 'aplicar', 'analizar', 'evaluar'] as const;

/** Contexto de un concepto para generar preguntas. */
export interface GenerationTarget {
  readonly conceptId: string;
  readonly conceptLabel: string;
  readonly conceptDefinition: string;
  readonly keyTerms: readonly string[];
}

/** Opciones del generador. */
export interface LlmGeneratorOptions {
  readonly maxTokens: number;
  /** Nivel cognitivo mínimo admitido; descarta preguntas de puro recuerdo. */
  readonly minLevel: CognitiveLevel;
}

export const DEFAULT_GENERATOR_OPTIONS: LlmGeneratorOptions = {
  maxTokens: 400,
  minLevel: 'comprender',
};

/**
 * Generador de preguntas sobre un `LlmProvider`.
 *
 * Devuelve una pregunta por llamada. Una pregunta que no pasa el filtro de
 * calidad se descarta (lista vacía): es preferible no preguntar que preguntar
 * algo trivial, que es justo lo que el método prohíbe.
 */
export class LlmQuestionGenerator implements QuestionGeneratorPort {
  public readonly id: string;

  public constructor(
    private readonly provider: LlmProvider,
    private readonly options: LlmGeneratorOptions = DEFAULT_GENERATOR_OPTIONS,
  ) {
    this.id = `llm-generator:${provider.id}`;
  }

  public async generate(
    target: GenerationTarget,
    passages: readonly LlmPassage[],
    avoidPrompts: readonly string[] = [],
  ): Promise<Result<SocraticQuestion[], LlmError>> {
    const passage = passages[0];
    if (!passage) {
      return ok([]);
    }

    const prompt = generationPrompt({
      conceptLabel: target.conceptLabel,
      conceptDefinition: target.conceptDefinition,
      keyTerms: target.keyTerms,
      passage: { chunkId: passage.citation.chunkId, text: passage.citation.excerpt },
      avoidPrompts,
    });

    const completion = await this.provider.complete({
      system: prompt.system,
      user: prompt.user,
      maxTokens: this.options.maxTokens,
      temperature: 0.4,
      purpose: prompt.purpose,
    });
    if (!completion.ok) {
      return completion;
    }

    const parsed = parseQuestion(completion.value.text, target, passage, this.options);
    if (!parsed.ok) {
      return err<LlmError>({ code: 'respuesta-invalida', message: describeSchemaError(parsed.error) });
    }
    if (parsed.value === null) {
      return ok([]);
    }
    return ok([parsed.value]);
  }
}

interface RawQuestion {
  readonly prompt: string;
  readonly move: SocraticMove;
  readonly level: CognitiveLevel;
  readonly difficulty: number;
}

/**
 * Valida la salida del modelo y construye la pregunta.
 *
 * Devuelve `null` (sin error) cuando la pregunta es válida pero trivial: no es un
 * fallo del proveedor, es una decisión del motor no aceptarla. Un error solo se
 * produce si la forma del JSON no es la esperada.
 */
export function parseQuestion(
  raw: string,
  target: GenerationTarget,
  passage: LlmPassage,
  options: LlmGeneratorOptions,
): Result<SocraticQuestion | null, SchemaError> {
  const extracted = extractJsonObject(raw);
  if (!extracted.ok) {
    return extracted;
  }
  const asRecord = record(extracted.value, '$');
  if (!asRecord.ok) {
    return asRecord;
  }
  const value = asRecord.value;

  const prompt = nonEmptyString(value.prompt, 'prompt');
  if (!prompt.ok) {
    return prompt;
  }
  const move = oneOf(MOVES)(value.move, 'move');
  if (!move.ok) {
    return move;
  }
  const level = oneOf(LEVELS)(value.level, 'level');
  if (!level.ok) {
    return level;
  }
  const difficulty = numberInRange(0, 1)(value.difficulty, 'difficulty');
  if (!difficulty.ok) {
    return difficulty;
  }

  const question = buildQuestion(
    { prompt: prompt.value, move: move.value, level: level.value, difficulty: difficulty.value },
    target,
    passage,
  );

  // El filtro de calidad es el mismo que usa el resto del motor: una pregunta
  // trivial se descarta aunque el modelo la considere válida.
  const report = assessQuestionQuality(question, {
    ...DEFAULT_QUALITY_OPTIONS,
    minLevel: options.minLevel,
  });
  if (report.isTrivial) {
    return ok(null);
  }
  return ok(question);
}

function buildQuestion(
  raw: RawQuestion,
  target: GenerationTarget,
  passage: LlmPassage,
): SocraticQuestion {
  return {
    id: `${target.conceptId}:llm`,
    conceptId: target.conceptId,
    prompt: raw.prompt,
    move: raw.move,
    level: raw.level,
    expectedAnswer: target.conceptDefinition,
    keyTerms: target.keyTerms,
    citation: passage.citation,
    difficulty: raw.difficulty,
    rationale: 'Pregunta generada a partir del pasaje citado.',
  };
}
