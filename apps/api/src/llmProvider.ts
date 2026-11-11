/**
 * Fábrica del proveedor de lenguaje del backend.
 *
 * El motor mayéutico con modelo necesita una ruta `/llm/complete` que sirva la
 * **repregunta** (`followUp`) y la **explicación** (`explainer`); sin ella, esas
 * dos tareas caen a las plantillas y el alumno nunca recibe el texto del modelo.
 * El proveedor semántico (`/mayeutic/*`) cubre la generación y la evaluación,
 * pero no estas dos.
 *
 * Se reutiliza `OpenAiCompatProvider` del núcleo en vez de escribir otro
 * adaptador: Gemini expone una capa compatible con la API de chat de OpenAI, así
 * que el mismo cliente sirve. La clave vive solo aquí, nunca en el móvil ni en el
 * bundle.
 */

import { OpenAiCompatProvider, ResilientLlmProvider, type LlmProvider } from '@socracia/core';

/** Endpoint OpenAI-compatible de Gemini (mismo dialecto que `/llm/complete`). */
export const GEMINI_OPENAI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/openai';

/** Modelo por defecto del asistente; debe existir en el nivel gratuito. */
const DEFAULT_MODEL = 'gemini-3.6-flash';

/**
 * Construye el proveedor de lenguaje a partir del entorno.
 *
 * Devuelve `null` si no hay `GEMINI_API_KEY`: la ruta responde 503 y la app cae
 * a su modo local, que es el comportamiento por defecto (D-043). El modelo se
 * puede cambiar con `GEMINI_MODEL`.
 */
export function createLlmProvider(
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch,
): LlmProvider | null {
  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) {
    return null;
  }
  const model = env.GEMINI_MODEL ?? DEFAULT_MODEL;
  const inner = new OpenAiCompatProvider({
    baseUrl: GEMINI_OPENAI_BASE_URL,
    apiKey,
    model,
    fetchImpl,
  });
  // La resiliencia (timeout, reintentos, cortocircuito, presupuesto) es la misma
  // capa que envuelve al proveedor en el móvil: aquí el servidor es el que habla
  // con el proveedor, así que la protección vive de este lado.
  return new ResilientLlmProvider(inner);
}
