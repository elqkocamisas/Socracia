/**
 * Evaluador semántico de respuestas.
 *
 * Sustituye a la heurística de `evaluateAnswer` cuando hay un motor de lenguaje
 * disponible y el usuario ha dado su consentimiento. A diferencia de aquella,
 * entiende paráfrasis, matiza el veredicto y **cita el pasaje** que respalda su
 * juicio.
 *
 * Garantías que no se delegan al modelo:
 * - La puntuación se acota a [0, 1] y el veredicto se recalcula con los mismos
 *   umbrales que la heurística: un modelo no puede inventar una escala nueva.
 * - La cita solo se acepta si referencia un fragmento **realmente enviado**.
 * - Si la salida no valida tras un reintento, se devuelve el fallo y quien llama
 *   aplica el respaldo heurístico.
 */

import type { AnswerEvaluation, AnswerVerdict, Citation, SocraticQuestion, UserAnswer } from '../domain/types';
import type { Result } from '../result';
import { err, ok } from '../result';
import { DEFAULT_THRESHOLDS, type EvaluationThresholds } from '../mayeu/evaluate';
import { describeSchemaError, extractJsonObject, numberInRange, oneOf, record, uniqueStrings, type SchemaError } from './json';
import { evaluationPrompt } from './prompts';
import type { LlmError, LlmProvider } from './types';

/** Fragmento candidato a respaldar la evaluación. */
export interface EvaluationPassage {
  readonly citation: Citation;
}

/** Opciones del evaluador semántico. */
export interface LlmEvaluatorOptions {
  readonly thresholds: EvaluationThresholds;
  /** Tokens máximos de la respuesta del modelo. */
  readonly maxTokens: number;
  /** Pasajes máximos que se envían como contexto. */
  readonly maxPassages: number;
}

export const DEFAULT_EVALUATOR_OPTIONS: LlmEvaluatorOptions = {
  thresholds: DEFAULT_THRESHOLDS,
  maxTokens: 700,
  maxPassages: 3,
};

/**
 * Evaluador semántico sobre un `LlmProvider`.
 *
 * Es un adaptador, no un motor: recibe pregunta, respuesta y pasajes, y devuelve
 * una `AnswerEvaluation`. No decide cuándo usarse ni aplica el respaldo; eso es
 * responsabilidad de la sesión, que conoce el consentimiento y el presupuesto.
 */
export class LlmAnswerEvaluator {
  public constructor(
    private readonly provider: LlmProvider,
    private readonly options: LlmEvaluatorOptions = DEFAULT_EVALUATOR_OPTIONS,
  ) {}

  /**
   * Evalúa una respuesta contra los pasajes recuperados.
   *
   * Devuelve `respuesta-invalida` si el modelo no produce un JSON conforme; el
   * llamante decidirá si reintentar (ya lo hace la capa de resiliencia) o caer a
   * la heurística.
   */
  public async evaluate(
    question: SocraticQuestion,
    answer: UserAnswer | null,
    passages: readonly EvaluationPassage[],
  ): Promise<Result<AnswerEvaluation, LlmError>> {
    const text = answer?.text.trim() ?? '';
    const sent = passages.slice(0, this.options.maxPassages);

    const prompt = evaluationPrompt({
      question: question.prompt,
      expectedAnswer: question.expectedAnswer,
      keyTerms: question.keyTerms,
      userAnswer: text,
      passages: sent.map((passage) => ({
        chunkId: passage.citation.chunkId,
        text: passage.citation.excerpt,
      })),
    });

    const completion = await this.provider.complete({
      system: prompt.system,
      user: prompt.user,
      maxTokens: this.options.maxTokens,
      temperature: 0,
      purpose: prompt.purpose,
    });
    if (!completion.ok) {
      return completion;
    }

    const parsed = parseEvaluation(completion.value.text, question, sent, this.options.thresholds);
    if (!parsed.ok) {
      return err<LlmError>({
        code: 'respuesta-invalida',
        message: describeSchemaError(parsed.error),
      });
    }
    return ok(parsed.value);
  }
}

/** Forma cruda validada de la salida del modelo. */
interface RawEvaluation {
  readonly verdict: AnswerVerdict;
  readonly score: number;
  readonly matched: readonly string[];
  readonly missing: readonly string[];
  readonly rationale: string;
  readonly citationChunkId: string | null;
}

const VERDICTS = ['correcta', 'parcial', 'incorrecta', 'sin-respuesta'] as const;

/**
 * Valida y normaliza la salida del modelo.
 *
 * El veredicto se **recalcula** a partir de la puntuación y los umbrales del
 * dominio: si el modelo dice «correcta» con 0.2, manda la puntuación. Así la
 * coherencia veredicto/puntuación no depende de que el modelo la respete.
 */
export function parseEvaluation(
  raw: string,
  question: SocraticQuestion,
  passages: readonly EvaluationPassage[],
  thresholds: EvaluationThresholds,
): Result<AnswerEvaluation, SchemaError> {
  const extracted = extractJsonObject(raw);
  if (!extracted.ok) {
    return extracted;
  }
  const asRecord = record(extracted.value, '$');
  if (!asRecord.ok) {
    return asRecord;
  }
  const value = asRecord.value;

  const verdict = oneOf(VERDICTS)(value.verdict, 'verdict');
  if (!verdict.ok) {
    return verdict;
  }
  const score = numberInRange(0, 1)(value.score, 'score');
  if (!score.ok) {
    return score;
  }
  const matched = uniqueStrings(value.matchedKeyTerms ?? [], 'matchedKeyTerms');
  if (!matched.ok) {
    return matched;
  }
  const missing = uniqueStrings(value.missingKeyTerms ?? [], 'missingKeyTerms');
  if (!missing.ok) {
    return missing;
  }

  const rationale =
    typeof value.rationale === 'string' && value.rationale.trim().length > 0
      ? value.rationale.trim()
      : 'Evaluación semántica.';

  const citationChunkId =
    typeof value.citation === 'string' && value.citation.trim().length > 0
      ? value.citation.trim()
      : null;

  return ok(buildEvaluation({ verdict: verdict.value, score: score.value, matched: matched.value, missing: missing.value, rationale, citationChunkId }, question, passages, thresholds));
}

function buildEvaluation(
  raw: RawEvaluation,
  question: SocraticQuestion,
  passages: readonly EvaluationPassage[],
  thresholds: EvaluationThresholds,
): AnswerEvaluation {
  // La puntuación manda sobre el veredicto declarado: se reclasifica con los
  // umbrales del dominio para que la coherencia no dependa del modelo.
  const verdict = classify(raw.score, thresholds);
  const citation = resolveCitation(raw.citationChunkId, passages);

  return {
    questionId: question.id,
    conceptId: question.conceptId,
    verdict,
    score: raw.score,
    matchedKeyTerms: raw.matched,
    missingKeyTerms: raw.missing,
    feedback: raw.rationale,
    rationale: raw.rationale,
    ...(citation ? { citation } : {}),
  };
}

function classify(score: number, thresholds: EvaluationThresholds): AnswerVerdict {
  if (score >= thresholds.correct) {
    return 'correcta';
  }
  if (score >= thresholds.partial) {
    return 'parcial';
  }
  return 'incorrecta';
}

/**
 * Resuelve la cita del modelo contra los pasajes enviados.
 *
 * Si el identificador no está entre los enviados, se descarta la cita en lugar
 * de aceptarla: una cita inventada es peor que ninguna, porque daría al alumno
 * una fuente falsa.
 */
function resolveCitation(
  chunkId: string | null,
  passages: readonly EvaluationPassage[],
): Citation | null {
  if (chunkId === null) {
    return null;
  }
  return passages.find((passage) => passage.citation.chunkId === chunkId)?.citation ?? null;
}
