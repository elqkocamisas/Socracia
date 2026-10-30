/**
 * Enrutado de las peticiones de lenguaje.
 *
 * El backend expone **una** ruta que delega en el proveedor configurado. La app
 * nunca habla con OpenAI ni con ningún proveedor directamente: así la clave vive
 * solo en el servidor y el móvil no la lleva embebida. Si no hay proveedor
 * configurado, la ruta responde `503` y la app sigue funcionando en local.
 *
 * El cuerpo se valida campo a campo: la petición llega de un cliente que puede
 * estar manipulado, y aquí no se confía en nada.
 */

import type { LlmCompletion, LlmCompletionRequest, LlmError, LlmPurpose, LlmProvider } from '@socracia/core';

/** Resultado de intentar atender una petición de lenguaje. */
export type LlmRouteOutcome =
  | { readonly handled: true; readonly status: number; readonly payload: unknown }
  | { readonly handled: false };

const PURPOSES: readonly LlmPurpose[] = ['evaluar', 'generar', 'seguimiento', 'explicar'];

/**
 * Atiende `POST /llm/complete` si la ruta coincide.
 *
 * Se devuelve `handled: false` cuando no es esta ruta, para que el enrutador
 * principal siga con las suyas sin duplicar la comprobación de método y ruta.
 */
export async function routeLlmCompletion(
  provider: LlmProvider | null,
  pathname: string,
  method: string,
  body: unknown,
): Promise<LlmRouteOutcome> {
  if (pathname !== '/llm/complete' || method !== 'POST') {
    return { handled: false };
  }

  if (!provider) {
    return {
      handled: true,
      status: 503,
      payload: {
        error: 'no-configurado',
        message: 'El asistente con modelo no está disponible en este servidor.',
      },
    };
  }

  const parsed = parseCompletionRequest(body);
  if (!parsed.ok) {
    return { handled: true, status: 400, payload: { error: 'datos-invalidos', message: parsed.message } };
  }

  const result = await provider.complete(parsed.value);
  if (result.ok) {
    return { handled: true, status: 200, payload: toResponse(result.value) };
  }
  return { handled: true, status: statusFor(result.error), payload: result.error };
}

function toResponse(completion: LlmCompletion): unknown {
  return { text: completion.text, model: completion.model, usage: completion.usage };
}

/** Traduce el motivo del fallo a un código HTTP con sentido para el cliente. */
function statusFor(error: LlmError): number {
  switch (error.code) {
    case 'timeout':
      return 504;
    case 'cuota':
    case 'presupuesto-agotado':
      return 429;
    case 'circuito-abierto':
      return 503;
    case 'no-configurado':
      return 503;
    default:
      return 502;
  }
}

type Parsed = { ok: true; value: LlmCompletionRequest } | { ok: false; message: string };

/**
 * Valida el cuerpo de la petición.
 *
 * Los topes de tokens y temperatura se acotan aquí, en el servidor: el cliente
 * no decide cuánto se gasta. Un `maxTokens` absurdo se recorta en vez de
 * rechazarse, para no romper por un detalle de redondeo del cliente.
 */
export function parseCompletionRequest(body: unknown): Parsed {
  if (!isRecord(body)) {
    return { ok: false, message: 'Se esperaba un objeto JSON.' };
  }
  const system = body.system;
  const user = body.user;
  if (typeof system !== 'string' || system.trim() === '') {
    return { ok: false, message: 'Falta `system` o está vacío.' };
  }
  if (typeof user !== 'string' || user.trim() === '') {
    return { ok: false, message: 'Falta `user` o está vacío.' };
  }
  const purpose = body.purpose;
  if (typeof purpose !== 'string' || !PURPOSES.includes(purpose as LlmPurpose)) {
    return { ok: false, message: `\`purpose\` debe ser uno de: ${PURPOSES.join(', ')}.` };
  }
  const maxTokens = clamp(toNumber(body.maxTokens, 512), 1, 2048);
  const temperature = clamp(toNumber(body.temperature, 0), 0, 1);

  return {
    ok: true,
    value: {
      system,
      user,
      purpose: purpose as LlmPurpose,
      maxTokens,
      temperature,
    },
  };
}

function toNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
