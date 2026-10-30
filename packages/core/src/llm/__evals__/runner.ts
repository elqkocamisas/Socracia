/**
 * Ejecutor del conjunto de evaluación del motor mayéutico.
 *
 * Recorre `EVAL_CASES`, enfrenta cada respuesta simulada del modelo al parser de
 * la tarea correspondiente y comprueba que el motor **acepta** lo utilizable o
 * lo **rechaza** sin lanzar. Devuelve un informe por caso; quien lo llama decide
 * qué hacer con él (la prueba falla, el script imprime y sale con código 1).
 *
 * Se apoya en los mismos `parse*` que usa producción: si un cambio de validación
 * afloja un filtro, aquí se ve.
 */

import { DEFAULT_THRESHOLDS } from '../../mayeu/evaluate';
import { parseEvaluation } from '../evaluator';
import { parseExplanation } from '../explainer';
import { parseFollowUp } from '../followUp';
import { DEFAULT_GENERATOR_OPTIONS, parseQuestion } from '../generator';
import type { LlmPassage } from '../types';
import {
  EVAL_CASES,
  EVAL_PASSAGES,
  EVAL_QUESTION,
  type EvalCase,
  type Expectation,
} from './dataset';

/** Resultado de un caso. */
export interface EvalOutcome {
  readonly id: string;
  readonly category: EvalCase['category'];
  readonly description: string;
  readonly expected: Expectation;
  readonly actual: Expectation;
  readonly passed: boolean;
  /** Motivo del rechazo o detalle del fallo, para el informe. */
  readonly detail: string;
}

/**
 * Ejecuta un caso y clasifica el comportamiento del motor como `aceptar` o
 * `rechazar`. Un fallo del proveedor se traduce a `rechazar`, que es lo que hace
 * el motor real: cae a la heurística.
 */
async function runCase(testCase: EvalCase): Promise<{ actual: Expectation; detail: string }> {
  const reply = testCase.reply;
  if (!('text' in reply)) {
    return { actual: 'rechazar', detail: `fallo simulado del proveedor: ${reply.error}` };
  }
  const raw = reply.text;

  switch (testCase.category) {
    case 'evaluacion':
    case 'degradacion': {
      const result = parseEvaluation(raw, EVAL_QUESTION, EVAL_PASSAGES, DEFAULT_THRESHOLDS);
      return result.ok
        ? { actual: 'aceptar', detail: `veredicto ${result.value.verdict}` }
        : { actual: 'rechazar', detail: result.error.message };
    }
    case 'generacion': {
      const result = parseQuestion(
        raw,
        {
          conceptId: 'c1',
          conceptLabel: 'Legalidad',
          conceptDefinition: 'Sujeción a la ley.',
          keyTerms: ['ley'],
        },
        EVAL_PASSAGES[0] as LlmPassage,
        DEFAULT_GENERATOR_OPTIONS,
      );
      if (!result.ok) {
        return { actual: 'rechazar', detail: result.error.message };
      }
      // `null` es «descartada»: la pregunta no supera el filtro de trivialidad.
      return result.value === null
        ? { actual: 'rechazar', detail: 'pregunta descartada por trivial' }
        : { actual: 'aceptar', detail: result.value.prompt };
    }
    case 'seguimiento': {
      const result = parseFollowUp(raw, EVAL_QUESTION);
      if (!result.ok) {
        return { actual: 'rechazar', detail: result.error.message };
      }
      return result.value === null
        ? { actual: 'rechazar', detail: 'repregunta descartada por revelar la respuesta' }
        : { actual: 'aceptar', detail: result.value.prompt };
    }
    case 'explicacion': {
      const result = parseExplanation(raw, EVAL_PASSAGES);
      return result.ok
        ? { actual: 'aceptar', detail: result.value.text }
        : { actual: 'rechazar', detail: result.error.message };
    }
  }
}

/** Ejecuta todos los casos y devuelve el informe. */
export async function runEvals(cases: readonly EvalCase[] = EVAL_CASES): Promise<EvalOutcome[]> {
  const outcomes: EvalOutcome[] = [];
  for (const testCase of cases) {
    let actual: Expectation;
    let detail: string;
    try {
      ({ actual, detail } = await runCase(testCase));
    } catch (error) {
      // Un caso que lanza es un fallo, no una excepción: se registra y se sigue.
      actual = 'rechazar';
      detail = `el motor lanzó: ${error instanceof Error ? error.message : String(error)}`;
    }
    outcomes.push({
      id: testCase.id,
      category: testCase.category,
      description: testCase.description,
      expected: testCase.expectation,
      actual,
      passed: actual === testCase.expectation,
      detail,
    });
  }
  return outcomes;
}
