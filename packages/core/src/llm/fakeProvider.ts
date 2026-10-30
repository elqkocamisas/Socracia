/**
 * Proveedor falso para pruebas y desarrollo.
 *
 * No toca la red: devuelve respuestas programadas de antemano. Sirve para probar
 * toda la fontanería del motor (validación, respaldo, seguimiento, caché) sin
 * depender de un servicio externo. **No** sirve para medir calidad: eso se hace
 * con las evaluaciones versionadas de `evals/` y un proveedor real.
 */

import type { Result } from '../result';
import { err, ok } from '../result';
import type { LlmCompletion, LlmCompletionRequest, LlmError, LlmProvider } from './types';

/** Respuesta programada: texto, error o función que decide según la petición. */
export type FakeReply =
  | { readonly text: string }
  | { readonly error: LlmError }
  | { readonly compute: (request: LlmCompletionRequest) => string | LlmError };

/** Registro de una llamada recibida, para poder afirmar sobre ella en pruebas. */
export interface FakeCall {
  readonly request: LlmCompletionRequest;
}

/**
 * Proveedor programable.
 *
 * Si se agotan las respuestas, repite la última; si no hay ninguna, devuelve un
 * error de configuración. Guarda cada petición para que las pruebas puedan
 * comprobar, por ejemplo, que no se envió nada en modo local.
 */
export class FakeLlmProvider implements LlmProvider {
  public readonly id = 'falso';
  public readonly model = 'falso-1';
  public readonly calls: FakeCall[] = [];

  private index = 0;

  public constructor(private readonly replies: readonly FakeReply[] = []) {}

  public async complete(
    request: LlmCompletionRequest,
  ): Promise<Result<LlmCompletion, LlmError>> {
    this.calls.push({ request });
    if (this.replies.length === 0) {
      return err<LlmError>({
        code: 'no-configurado',
        message: 'El proveedor falso no tiene respuestas programadas.',
      });
    }

    const reply = this.replies[Math.min(this.index, this.replies.length - 1)] as FakeReply;
    this.index += 1;

    if ('error' in reply) {
      return err(reply.error);
    }
    const text = 'compute' in reply ? reply.compute(request) : reply.text;
    if (typeof text !== 'string') {
      return err(text);
    }
    return ok({
      text,
      usage: { promptTokens: request.user.length, completionTokens: text.length },
      model: this.model,
    });
  }

  /** Cuántas llamadas recibió; útil para afirmar «cero llamadas». */
  public callCount(): number {
    return this.calls.length;
  }
}

/**
 * Proveedor que siempre falla.
 *
 * Se usa para verificar que todos los caminos degradan a la heurística sin
 * romper la sesión.
 */
export class FailingLlmProvider implements LlmProvider {
  public readonly id = 'falla-siempre';
  public readonly model = 'ninguno';

  public constructor(private readonly error: LlmError) {}

  public async complete(): Promise<Result<LlmCompletion, LlmError>> {
    return err(this.error);
  }
}
