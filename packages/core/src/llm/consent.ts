/**
 * Guardián de consentimiento del motor de lenguaje.
 *
 * Envolver el proveedor, y no comprobar en cada llamada, garantiza que **no
 * exista ningún camino** que envíe contenido a un servicio externo sin permiso:
 * si la política vigente no lo autoriza, este proveedor devuelve
 * `sin-consentimiento` sin invocar al proveedor real. La comprobación se hace
 * aquí, en el núcleo, y no en la interfaz, porque una pantalla se puede saltar
 * con un cambio de estado pero esto no.
 */

import type { ProcessingPolicyHolder } from '../privacy/processingPolicy';
import { allowsCloudProcessing } from '../privacy/processingPolicy';
import type { Result } from '../result';
import { err } from '../result';
import type { LlmCompletion, LlmCompletionRequest, LlmError, LlmProvider } from './types';

/**
 * Proveedor que exige consentimiento antes de delegar.
 *
 * La política se lee en el momento de cada llamada, no al construir el objeto:
 * así revocar el permiso surte efecto de inmediato, sin reiniciar la app.
 */
export class ConsentGatedLlmProvider implements LlmProvider {
  public readonly id: string;
  public readonly model: string;

  public constructor(
    private readonly inner: LlmProvider,
    private readonly policy: ProcessingPolicyHolder,
  ) {
    this.id = inner.id;
    this.model = inner.model;
  }

  public async complete(
    request: LlmCompletionRequest,
  ): Promise<Result<LlmCompletion, LlmError>> {
    if (!allowsCloudProcessing(this.policy.current())) {
      return err<LlmError>({
        code: 'sin-consentimiento',
        message:
          'El modo con modelo está desactivado. Actívalo en Ajustes para usar preguntas y corrección asistidas.',
      });
    }
    return this.inner.complete(request);
  }
}
