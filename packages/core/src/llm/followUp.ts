/**
 * Repregunta de seguimiento con modelo.
 *
 * Complementa al andamiaje por plantillas (`mayeu/scaffolding`): la plantilla
 * elige una estrategia según el veredicto, y este adaptador redacta la
 * repregunta concreta a partir del error real del alumno.
 *
 * Regla mayéutica que se conserva intacta: la repregunta **no** puede contener
 * la respuesta esperada. Se comprueba antes de aceptarla, igual que en el resto
 * del motor. Si el modelo filtra la solución, se descarta y se usa la plantilla.
 */

import type { AnswerEvaluation, SocraticQuestion, UserAnswer } from '../domain/types';
import type { Scaffold, ScaffoldKind } from '../mayeu/scaffolding';
import type { Result } from '../result';
import { err, ok } from '../result';
import { arrayOf, describeSchemaError, extractJsonObject, nonEmptyString, oneOf, record, type SchemaError } from './json';
import type { FollowUpPort } from './ports';
import { followUpPrompt } from './prompts';
import type { LlmError, LlmProvider } from './types';

const KINDS = ['orientar', 'acotar', 'descomponer', 'ejemplificar'] as const;

/** Opciones del seguimiento. */
export interface LlmFollowUpOptions {
  readonly maxTokens: number;
}

export const DEFAULT_FOLLOWUP_OPTIONS: LlmFollowUpOptions = { maxTokens: 220 };

/** Seguimiento que redacta la repregunta con el modelo. */
export class LlmFollowUpGenerator implements FollowUpPort {
  public readonly id: string;

  public constructor(
    private readonly provider: LlmProvider,
    private readonly options: LlmFollowUpOptions = DEFAULT_FOLLOWUP_OPTIONS,
  ) {
    this.id = `llm-followup:${provider.id}`;
  }

  public async followUp(
    question: SocraticQuestion,
    answer: UserAnswer | null,
    evaluation: AnswerEvaluation,
  ): Promise<Result<Scaffold, LlmError>> {
    const prompt = followUpPrompt({
      question: question.prompt,
      userAnswer: answer?.text ?? '',
      verdict: evaluation.verdict,
      missingKeyTerms: evaluation.missingKeyTerms,
      rationale: evaluation.rationale ?? evaluation.feedback,
    });

    const completion = await this.provider.complete({
      system: prompt.system,
      user: prompt.user,
      maxTokens: this.options.maxTokens,
      temperature: 0.3,
      purpose: prompt.purpose,
    });
    if (!completion.ok) {
      return completion;
    }

    const parsed = parseFollowUp(completion.value.text, question);
    if (!parsed.ok) {
      return err<LlmError>({ code: 'respuesta-invalida', message: describeSchemaError(parsed.error) });
    }
    if (parsed.value === null) {
      return err<LlmError>({
        code: 'respuesta-invalida',
        message: 'La repregunta revelaba la respuesta; se descarta.',
      });
    }
    return ok(parsed.value);
  }
}

/**
 * Valida la repregunta y rechaza la que revele la solución.
 *
 * Devuelve `null` cuando la repregunta es formalmente válida pero filtra la
 * respuesta esperada: no es un fallo del proveedor, es el motor negándose a
 * romper el método.
 */
export function parseFollowUp(
  raw: string,
  question: SocraticQuestion,
): Result<Scaffold | null, SchemaError> {
  const extracted = extractJsonObject(raw);
  if (!extracted.ok) {
    return extracted;
  }
  const asRecord = record(extracted.value, '$');
  if (!asRecord.ok) {
    return asRecord;
  }
  const value = asRecord.value;

  const kind = oneOf(KINDS)(value.kind, 'kind');
  if (!kind.ok) {
    return kind;
  }
  const prompt = nonEmptyString(value.prompt, 'prompt');
  if (!prompt.ok) {
    return prompt;
  }
  const hints = arrayOf(nonEmptyString)(value.hints, 'hints');
  if (!hints.ok) {
    return hints;
  }

  if (revealsAnswer(prompt.value, question)) {
    return ok(null);
  }
  return ok({ kind: kind.value as ScaffoldKind, prompt: prompt.value, hints: hints.value });
}

/**
 * Comprueba si la repregunta filtra la respuesta.
 *
 * Heurística deliberadamente conservadora: se compara con la respuesta esperada
 * en palabras significativas. Es mejor descartar una repregunta buena que
 * aceptar una que resuelva el ejercicio.
 */
export function revealsAnswer(prompt: string, question: SocraticQuestion): boolean {
  const normalized = normalize(prompt);
  const expected = normalize(question.expectedAnswer);
  if (expected.length === 0) {
    return false;
  }
  // Filtro barato: si aparece un tramo literal largo de la respuesta, se descarta.
  if (expected.length >= 24 && normalized.includes(expected)) {
    return true;
  }
  const expectedWords = significantWords(expected);
  if (expectedWords.length < 4) {
    return false;
  }
  const promptWords = new Set(significantWords(normalized));
  const overlap = expectedWords.filter((word) => promptWords.has(word)).length;
  // Más de dos tercios de las palabras significativas de la respuesta delatadas.
  return overlap / expectedWords.length > 0.66;
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const STOP_WORDS = new Set([
  'de',
  'la',
  'el',
  'los',
  'las',
  'un',
  'una',
  'que',
  'y',
  'o',
  'en',
  'por',
  'para',
  'con',
  'del',
  'al',
  'es',
  'son',
  'se',
]);

function significantWords(text: string): string[] {
  return text.split(' ').filter((word) => word.length > 3 && !STOP_WORDS.has(word));
}
