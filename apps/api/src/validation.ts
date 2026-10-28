import type { ProgressSnapshot } from '@socracia/core';

/**
 * Validación del cuerpo de una instantánea de progreso.
 *
 * El servidor no confía en el cliente: comprueba forma y tipos antes de tocar
 * el almacén. No valida la semántica del dominio (eso es del motor mayéutico),
 * solo que la estructura sea la esperada para no guardar basura ni romper la
 * fusión.
 */
export interface ValidationError {
  readonly message: string;
}

export function parseSnapshot(body: unknown): ProgressSnapshot | ValidationError {
  if (!isRecord(body)) {
    return { message: 'El cuerpo debe ser un objeto JSON.' };
  }
  if (typeof body.userId !== 'string' || body.userId.length === 0) {
    return { message: 'Falta `userId` o no es una cadena.' };
  }
  if (typeof body.generatedAt !== 'number' || !Number.isFinite(body.generatedAt)) {
    return { message: 'Falta `generatedAt` o no es un número.' };
  }
  for (const field of ['evaluations', 'reviewStates', 'sessions'] as const) {
    if (!Array.isArray(body[field])) {
      return { message: `\`${field}\` debe ser una lista.` };
    }
  }
  if (body.gapProfile !== null && !isRecord(body.gapProfile)) {
    return { message: '`gapProfile` debe ser un objeto o `null`.' };
  }

  return {
    userId: body.userId,
    generatedAt: body.generatedAt,
    evaluations: body.evaluations as ProgressSnapshot['evaluations'],
    reviewStates: body.reviewStates as ProgressSnapshot['reviewStates'],
    sessions: body.sessions as ProgressSnapshot['sessions'],
    gapProfile: body.gapProfile as ProgressSnapshot['gapProfile'],
  };
}

export function isValidationError(value: unknown): value is ValidationError {
  return isRecord(value) && typeof value.message === 'string' && !('userId' in value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
