/**
 * Validación estricta de esquemas a mano.
 *
 * La salida de un modelo no es de fiar: puede traer texto alrededor del JSON,
 * campos de más, números fuera de rango o tipos cambiados. Estas funciones
 * comprueban la forma exacta que el dominio espera y devuelven un `Result` con
 * el motivo del rechazo, sin dependencias externas.
 *
 * Un validador estricto es también una defensa: si el modelo devuelve algo que
 * no encaja, se rechaza y se aplica el respaldo, en lugar de dejar entrar un
 * dato con forma inesperada al motor mayéutico.
 */

import type { Result } from '../result';
import { err, ok } from '../result';

/** Error de validación con la ruta del campo que falló. */
export interface SchemaError {
  readonly path: string;
  readonly message: string;
}

/** Validador de un valor desconocido a un tipo concreto. */
export type Validator<T> = (value: unknown, path: string) => Result<T, SchemaError>;

function fail(path: string, message: string): Result<never, SchemaError> {
  return err<SchemaError>({ path, message });
}

/** Acepta solo objetos planos (ni `null`, ni listas, ni fechas). */
export function record(value: unknown, path: string): Result<Record<string, unknown>, SchemaError> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return fail(path, 'se esperaba un objeto');
  }
  return ok(value as Record<string, unknown>);
}

/** Acepta solo cadenas no vacías tras recortar espacios. */
export function nonEmptyString(value: unknown, path: string): Result<string, SchemaError> {
  if (typeof value !== 'string') {
    return fail(path, 'se esperaba una cadena');
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return fail(path, 'la cadena está vacía');
  }
  return ok(trimmed);
}

/** Acepta una cadena que debe ser uno de los valores permitidos. */
export function oneOf<T extends string>(
  allowed: readonly T[],
): (value: unknown, path: string) => Result<T, SchemaError> {
  return (value, path) => {
    if (typeof value !== 'string' || !allowed.includes(value as T)) {
      return fail(path, `se esperaba uno de: ${allowed.join(', ')}`);
    }
    return ok(value as T);
  };
}

/** Acepta un número finito dentro de `[min, max]`. */
export function numberInRange(min: number, max: number): Validator<number> {
  return (value, path) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return fail(path, 'se esperaba un número finito');
    }
    if (value < min || value > max) {
      return fail(path, `fuera de rango [${min}, ${max}]: ${value}`);
    }
    return ok(value);
  };
}

/** Acepta una lista cuyos elementos valida `item`. */
export function arrayOf<T>(item: Validator<T>): Validator<T[]> {
  return (value, path) => {
    if (!Array.isArray(value)) {
      return fail(path, 'se esperaba una lista');
    }
    const out: T[] = [];
    for (const [index, element] of value.entries()) {
      const parsed = item(element, `${path}[${index}]`);
      if (!parsed.ok) {
        return parsed;
      }
      out.push(parsed.value);
    }
    return ok(out);
  };
}

/**
 * Acepta una lista de cadenas no vacías, sin repetidos.
 *
 * Los repetidos se descartan en lugar de rechazarse: un modelo que repite un
 * término no invalida la evaluación, pero el dato duplicado sí ensuciaría el
 * perfil de lagunas.
 */
export const uniqueStrings: Validator<string[]> = (value, path) => {
  const parsed = arrayOf(nonEmptyString)(value, path);
  if (!parsed.ok) {
    return parsed;
  }
  return ok([...new Set(parsed.value)]);
};

/**
 * Extrae el primer objeto JSON de un texto.
 *
 * Los modelos suelen envolver la respuesta en ```json … ``` o añadir una frase
 * antes. En lugar de rechazar por eso, se recorta al primer `{` y al último `}`.
 * Es una tolerancia de formato, no de esquema: lo que queda dentro se valida con
 * el mismo rigor.
 */
export function extractJsonObject(text: string): Result<unknown, SchemaError> {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) {
    return fail('$', 'la respuesta no contiene un objeto JSON');
  }
  try {
    return ok(JSON.parse(text.slice(start, end + 1)));
  } catch {
    return fail('$', 'el objeto JSON está mal formado');
  }
}

/** Concatena los motivos de un fallo de validación en un mensaje legible. */
export function describeSchemaError(error: SchemaError): string {
  return `${error.path}: ${error.message}`;
}
