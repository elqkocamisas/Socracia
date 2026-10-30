import type {
  AnswerEvaluatorPort,
  ExplainerPort,
  FollowUpPort,
  LlmProvider,
  ProcessingPolicyHolder,
  QuestionGeneratorPort,
  StudyServiceOptions,
} from '@socracia/core';
import {
  DEFAULT_EXPLAINER_OPTIONS,
  DEFAULT_FOLLOWUP_OPTIONS,
  DEFAULT_GENERATOR_OPTIONS,
  DEFAULT_RESILIENCE,
  ConsentGatedLlmProvider,
  LlmAnswerEvaluator,
  LlmExplainer,
  LlmFollowUpGenerator,
  LlmQuestionGenerator,
  ResilientLlmProvider,
} from '@socracia/core';
import type { RagEngine } from '@socracia/core';

import { LlmHttpProvider } from './llmHttpProvider';

/**
 * Composicióndel motor mayéutico con modelo.
 *
 * Esta es la pieza que hace que el modelo sea el motor **principal** cuando hay
 * backend y consentimiento, sin tocar el núcleo ni las firmas públicas: se
 * construyen los puertos y se inyectan en `StudyServiceOptions`. Si falta
 * cualquiera de las dos condiciones, se devuelve `null` y el servicio queda con
 * su camino heurístico de siempre.
 *
 * Orden de envoltura: HTTP → resiliencia → consentimiento, de dentro hacia
 * fuera. El consentimiento es la capa **más externa** a propósito: así una
 * revocación bloquea también las respuestas que ya estuvieran en la caché de
 * resiliencia. Si el guardián fuera por dentro, revocar el permiso seguiría
 * sirviendo texto del modelo desde caché, que es justo lo que no debe ocurrir.
 * Una llamada denegada tampoco consume reintentos ni presupuesto: no llega a la
 * capa de resiliencia.
 */
export interface LlmEngineBundle {
  readonly provider: LlmProvider;
  readonly evaluator: AnswerEvaluatorPort;
  readonly generator: QuestionGeneratorPort;
  readonly followUp: FollowUpPort;
  readonly explainer: ExplainerPort;
}

/** Opciones para construir el motor con modelo. */
export interface BuildLlmEngineOptions {
  readonly baseUrl: string;
  readonly policy: ProcessingPolicyHolder;
  readonly token?: string | null;
  /** Fuente del token leída en cada llamada; tiene prioridad sobre `token`. */
  readonly loadToken?: () => Promise<string | null>;
  readonly fetchImpl?: typeof fetch;
}

/**
 * Construye el paquete de puertos del modelo, ya envuelto en consentimiento y
 * resiliencia, listo para inyectar en el servicio de estudio.
 */
export function buildLlmEngine(options: BuildLlmEngineOptions): LlmEngineBundle {
  const http = new LlmHttpProvider({
    baseUrl: options.baseUrl,
    token: options.token ?? null,
    loadToken: options.loadToken,
    fetchImpl: options.fetchImpl,
  });
  // El consentimiento se lee en cada llamada (ver `ConsentGatedLlmProvider`), así
  // que revocar el permiso surte efecto de inmediato aunque el proveedor esté ya
  // construido y guardado en los servicios. Va por fuera de la resiliencia para
  // que la revocación alcance también a la caché.
  const resilient = new ResilientLlmProvider(http, DEFAULT_RESILIENCE);
  const provider = new ConsentGatedLlmProvider(resilient, options.policy);

  return {
    provider,
    evaluator: new LlmAnswerEvaluator(provider),
    generator: new LlmQuestionGenerator(provider, DEFAULT_GENERATOR_OPTIONS),
    followUp: new LlmFollowUpGenerator(provider, DEFAULT_FOLLOWUP_OPTIONS),
    explainer: new LlmExplainer(provider, DEFAULT_EXPLAINER_OPTIONS),
  };
}

/**
 * Compone las opciones del servicio de estudio con el motor de modelo.
 *
 * `retrievePassages` recupera, para cada concepto, los fragmentos relevantes del
 * RAG y los convierte en pasajes citables. Se usa un umbral de relevancia: sin
 * él, un fragmento que no se parece en nada a la consulta acabaría citado como
 * fuente. Si no hay fragmentos suficientemente relevantes, se devuelve lista
 * vacía y el servicio cae al generador por plantillas.
 */
export function withLlmEngine(
  base: StudyServiceOptions,
  bundle: LlmEngineBundle,
  rag: RagEngine,
): StudyServiceOptions {
  return {
    ...base,
    questionGenerator: bundle.generator,
    retrievePassages: async (concept, documents) => {
      const hits = await rag.retrieveRelevant(`${concept.label}. ${concept.definition}`);
      const relevant = hits.ok ? hits.value : [];
      const titleById = new Map(documents.map((document) => [document.id, document.title]));
      return relevant.slice(0, 3).map((hit) => ({
        citation: {
          documentId: hit.chunk.documentId,
          documentTitle: titleById.get(hit.chunk.documentId) ?? 'Documento',
          chunkId: hit.chunk.id,
          excerpt: hit.chunk.text,
          charStart: hit.chunk.charStart,
          charEnd: hit.chunk.charEnd,
        },
      }));
    },
    session: {
      ...base.session,
      evaluator: bundle.evaluator,
      followUp: bundle.followUp,
      explainer: bundle.explainer,
    },
  };
}
