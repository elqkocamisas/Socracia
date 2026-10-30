/**
 * Adaptador a un proveedor de compleción compatible con la API de chat de
 * OpenAI.
 *
 * Vive en el núcleo y no en la app porque tanto el backend como el cliente móvil
 * hablan el mismo dialecto. `fetch` es inyectable: en producción se usa el del
 * entorno y en las pruebas un doble, así que no se toca la red para probarlo.
 *
 * Este adaptador **no** pone timeout, reintentos ni presupuesto: eso es trabajo
 * de `ResilientLlmProvider`, que lo envuelve. Aquí solo se traduce una petición
 * a HTTP y una respuesta a `Result`, sin lanzar nunca.
 */

import type { Result } from '../result';
import { err, ok } from '../result';
import type { LlmCompletion, LlmCompletionRequest, LlmError, LlmProvider } from './types';

/** Opciones del adaptador. */
export interface OpenAiCompatOptions {
  /** URL base de la API, sin barra final; p. ej. `https://api.openai.com/v1`. */
  readonly baseUrl: string;
  /** Clave de API. Nunca se registra ni se incluye en los errores. */
  readonly apiKey: string;
  /** Modelo a invocar. */
  readonly model: string;
  /** `fetch` inyectable para pruebas sin red. */
  readonly fetchImpl?: typeof fetch;
  /** Milisegundos máximos de espera por intento; 0 desactiva. */
  readonly timeoutMs?: number;
}

/** Proveedor HTTP compatible con la API de chat de OpenAI. */
export class OpenAiCompatProvider implements LlmProvider {
  public readonly id = 'openai-compat';
  public readonly model: string;

  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  public constructor(private readonly options: OpenAiCompatOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.model = options.model;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 0;
  }

  public async complete(
    request: LlmCompletionRequest,
  ): Promise<Result<LlmCompletion, LlmError>> {
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.options.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          // Instrucciones y datos viajan como mensajes separados: es la misma
          // separación que impone `LlmCompletionRequest`, sin mezclarlos.
          messages: [
            { role: 'system', content: request.system },
            { role: 'user', content: request.user },
          ],
          max_tokens: request.maxTokens,
          temperature: request.temperature,
        }),
        ...(this.timeoutMs > 0 ? { signal: AbortSignal.timeout(this.timeoutMs) } : {}),
      });
    } catch (error) {
      const aborted = error instanceof Error && error.name === 'AbortError';
      return err<LlmError>(
        aborted
          ? { code: 'timeout', message: 'El proveedor no respondió a tiempo.' }
          : { code: 'red', message: 'No se pudo contactar con el proveedor.' },
      );
    }

    if (response.status === 401 || response.status === 403) {
      return err<LlmError>({ code: 'no-configurado', message: 'Credenciales del proveedor rechazadas.' });
    }
    if (response.status === 429) {
      return err<LlmError>({ code: 'cuota', message: 'El proveedor ha limitado la frecuencia.' });
    }

    const body = await readJson(response);
    if (!response.ok) {
      return err<LlmError>({
        code: 'http',
        message: `El proveedor respondió ${response.status}.`,
      });
    }

    const content = extractContent(body);
    if (content === null) {
      return err<LlmError>({ code: 'respuesta-invalida', message: 'Respuesta sin contenido de texto.' });
    }
    return ok({ text: content, usage: extractUsage(body), model: this.model });
  }
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

/** Extrae el texto del primer mensaje de la respuesta de chat. */
function extractContent(body: unknown): string | null {
  if (!isRecord(body) || !Array.isArray(body.choices)) {
    return null;
  }
  const first = body.choices[0];
  if (!isRecord(first) || !isRecord(first.message)) {
    return null;
  }
  const content = first.message.content;
  return typeof content === 'string' ? content : null;
}

/** Extrae el consumo de tokens si el proveedor lo informa. */
function extractUsage(body: unknown): { promptTokens: number; completionTokens: number } {
  if (!isRecord(body) || !isRecord(body.usage)) {
    return { promptTokens: 0, completionTokens: 0 };
  }
  return {
    promptTokens: toNumber(body.usage.prompt_tokens),
    completionTokens: toNumber(body.usage.completion_tokens),
  };
}

function toNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
