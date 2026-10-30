/**
 * Explicación directa con modelo («explícame»).
 *
 * Es la única pieza del motor que entrega la respuesta, y por eso está acotada:
 * solo se ofrece tras varios fallos sobre el mismo concepto, y toda afirmación
 * debe venir respaldada por una cita de los pasajes enviados. Una cita que no
 * corresponda a un fragmento realmente enviado se descarta, igual que en la
 * evaluación: no se acepta una fuente inventada.
 */

import type { SocraticQuestion } from '../domain/types';
import type { Result } from '../result';
import { err, ok } from '../result';
import { arrayOf, describeSchemaError, extractJsonObject, nonEmptyString, record, type SchemaError } from './json';
import type { Explanation, ExplainerPort } from './ports';
import { explanationPrompt } from './prompts';
import type { LlmError, LlmPassage, LlmProvider } from './types';

/** Opciones del explicador. */
export interface LlmExplainerOptions {
  readonly maxTokens: number;
  /** Fallos previos exigidos antes de ofrecer la explicación directa. */
  readonly failuresBeforeExplaining: number;
}

export const DEFAULT_EXPLAINER_OPTIONS: LlmExplainerOptions = {
  maxTokens: 400,
  failuresBeforeExplaining: 2,
};

/** Explicador que fundamenta cada afirmación en un pasaje enviado. */
export class LlmExplainer implements ExplainerPort {
  public readonly id: string;

  public constructor(
    private readonly provider: LlmProvider,
    private readonly options: LlmExplainerOptions = DEFAULT_EXPLAINER_OPTIONS,
  ) {
    this.id = `llm-explainer:${provider.id}`;
  }

  /**
   * ¿Procede ofrecer la explicación directa?
   *
   * Función pura y separada para que la regla mayéutica sea explícita y
   * comprobable: no se explica antes de que el alumno haya intentado responder
   * varias veces. Se expone como método de instancia para que la UI consulte la
   * política sin duplicarla.
   */
  public shouldExplain(previousFailures: number): boolean {
    return previousFailures >= this.options.failuresBeforeExplaining;
  }

  public async explain(
    question: SocraticQuestion,
    passages: readonly LlmPassage[],
    missingKeyTerms: readonly string[],
  ): Promise<Result<Explanation, LlmError>> {
    if (passages.length === 0) {
      return err<LlmError>({
        code: 'respuesta-invalida',
        message: 'Sin pasajes no se puede fundamentar una explicación.',
      });
    }

    const prompt = explanationPrompt({
      question: question.prompt,
      expectedAnswer: question.expectedAnswer,
      missingKeyTerms,
      passages: passages.map((passage) => ({
        chunkId: passage.citation.chunkId,
        text: passage.citation.excerpt,
      })),
    });

    const completion = await this.provider.complete({
      system: prompt.system,
      user: prompt.user,
      maxTokens: this.options.maxTokens,
      temperature: 0.2,
      purpose: prompt.purpose,
    });
    if (!completion.ok) {
      return completion;
    }

    const parsed = parseExplanation(completion.value.text, passages);
    if (!parsed.ok) {
      return err<LlmError>({ code: 'respuesta-invalida', message: describeSchemaError(parsed.error) });
    }
    return ok(parsed.value);
  }
}

/**
 * Valida la explicación y filtra las citas que no apunten a un pasaje enviado.
 *
 * Una explicación sin ninguna cita válida se rechaza: sin fundamento verificable
 * no es una explicación del temario, es una opinión del modelo.
 */
export function parseExplanation(
  raw: string,
  passages: readonly LlmPassage[],
): Result<Explanation, SchemaError> {
  const extracted = extractJsonObject(raw);
  if (!extracted.ok) {
    return extracted;
  }
  const asRecord = record(extracted.value, '$');
  if (!asRecord.ok) {
    return asRecord;
  }
  const value = asRecord.value;

  const text = nonEmptyString(value.explanation ?? value.text, 'explanation');
  if (!text.ok) {
    return text;
  }
  const citations = arrayOf(nonEmptyString)(value.citations, 'citations');
  if (!citations.ok) {
    return citations;
  }

  const sent = new Set(passages.map((passage) => passage.citation.chunkId));
  const valid = citations.value.filter((chunkId: string) => sent.has(chunkId));
  if (valid.length === 0) {
    return {
      ok: false,
      error: { path: 'citations', message: 'ninguna cita corresponde a un pasaje enviado' },
    };
  }
  return ok({ text: text.value, citations: valid });
}
