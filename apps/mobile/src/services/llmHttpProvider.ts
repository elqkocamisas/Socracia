import type {
  LlmCompletion,
  LlmCompletionRequest,
  LlmError,
  LlmProvider,
  Result,
} from '@socracia/core';

/**
 * Proveedor de lenguaje del móvil sobre el backend de Socracia.
 *
 * La app **nunca** lleva la clave del proveedor ni habla con él directamente:
 * llama a `/llm/complete` con su token de sesión y el backend decide. Esto
 * mantiene la clave fuera del binario, que es lo que exige la revisión de las
 * tiendas, y permite cortar el servicio sin publicar una versión nueva.
 *
 * Si no hay sesión, si la red falla o si el servidor responde con un error, se
 * devuelve un `Result` fallido: el motor mayéutico cae entonces a su heurística
 * y la sesión continúa. Nunca se lanza desde aquí.
 */
export interface LlmHttpProviderOptions {
  /** URL base del backend, sin barra final. */
  readonly baseUrl: string;
  /** Token de la sesión activa; `null` si no hay sesión. */
  readonly token?: string | null;
  /**
   * Fuente del token, leída en cada llamada. Existe porque la sesión se inicia
   * o se cierra después de construir los servicios: sin esto, el motor seguiría
   * con el token del arranque y fallaría tras un `login`.
   */
  readonly loadToken?: () => Promise<string | null>;
  /** `fetch` inyectable para pruebas sin red. */
  readonly fetchImpl?: typeof fetch;
}

export class LlmHttpProvider implements LlmProvider {
  public readonly id = 'http-backend';
  public readonly model = 'backend';

  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly loadToken: (() => Promise<string | null>) | null;
  private token: string | null;

  public constructor(options: LlmHttpProviderOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.loadToken = options.loadToken ?? null;
    this.token = options.token ?? null;
  }

  /** Fija el token tras iniciar sesión o cerrarla (`null`). */
  public setToken(token: string | null): void {
    this.token = token;
  }

  /** Resuelve el token vigente: la fuente asíncrona manda sobre el valor fijado. */
  private async resolveToken(): Promise<string | null> {
    if (this.loadToken) {
      return this.loadToken();
    }
    return this.token;
  }

  public async complete(
    request: LlmCompletionRequest,
  ): Promise<Result<LlmCompletion, LlmError>> {
    const token = await this.resolveToken();
    if (!token) {
      return {
        ok: false,
        error: { code: 'no-configurado', message: 'Inicia sesión para usar el asistente con modelo.' },
      };
    }

    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}/llm/complete`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(request),
      });
    } catch {
      return { ok: false, error: { code: 'red', message: 'No hay conexión con el servidor.' } };
    }

    const body = await readJson(response);
    if (!response.ok) {
      return { ok: false, error: toError(response.status, body) };
    }
    const text = extractText(body);
    if (text === null) {
      return { ok: false, error: { code: 'respuesta-invalida', message: 'Respuesta sin texto.' } };
    }
    return {
      ok: true,
      value: {
        text,
        model: extractModel(body) ?? this.model,
        usage: { promptTokens: 0, completionTokens: 0 },
      },
    };
  }
}

/** Traduce el estado HTTP y el cuerpo a un error con causa accionable. */
function toError(status: number, body: unknown): LlmError {
  const message = extractMessage(body) ?? `El servidor respondió ${status}.`;
  switch (status) {
    case 401:
      return { code: 'no-configurado', message: 'La sesión ha caducado.' };
    case 429:
      return { code: 'cuota', message };
    case 503:
      return { code: 'no-configurado', message };
    case 504:
      return { code: 'timeout', message };
    default:
      return { code: 'http', message };
  }
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function extractText(body: unknown): string | null {
  if (!isRecord(body)) {
    return null;
  }
  return typeof body.text === 'string' ? body.text : null;
}

function extractModel(body: unknown): string | null {
  if (!isRecord(body)) {
    return null;
  }
  return typeof body.model === 'string' ? body.model : null;
}

function extractMessage(body: unknown): string | null {
  if (!isRecord(body)) {
    return null;
  }
  return typeof body.message === 'string' ? body.message : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
