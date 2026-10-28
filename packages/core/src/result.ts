/**
 * Resultado explícito de una operación que puede fallar.
 *
 * Se usa en todo el dominio en lugar de excepciones para que la lógica
 * mayéutica y de evaluación sea total y verificable en pruebas.
 */
export type Result<T, E = Error> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: E };

/** Construye un resultado exitoso. */
export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

/** Construye un resultado fallido. */
export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

/** `true` si el resultado es exitoso. */
export function isOk<T, E>(result: Result<T, E>): result is { ok: true; value: T } {
  return result.ok;
}

/** `true` si el resultado es fallido. */
export function isErr<T, E>(result: Result<T, E>): result is { ok: false; error: E } {
  return !result.ok;
}

/** Extrae el valor o lanza si el resultado es fallido. */
export function unwrap<T, E>(result: Result<T, E>): T {
  if (result.ok) {
    return result.value;
  }
  throw result.error instanceof Error ? result.error : new Error(String(result.error));
}
