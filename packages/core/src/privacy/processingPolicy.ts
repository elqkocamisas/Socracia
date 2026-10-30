import type { Result } from '../result';
import { err, ok } from '../result';

/**
 * Modo de procesamiento documental.
 *
 * `local-only` es el valor por defecto y el único que el MVP ofrece sin que el
 * usuario lo cambie a propósito: el material que adjunta es suyo y, a menudo,
 * material de estudio con derechos de terceros. `allow-cloud` habilita los
 * servicios semánticos remotos, pero nunca se activa
 * solo: exige una acción explícita del usuario.
 */
export type ProcessingMode = 'local-only' | 'allow-cloud';

/** Política de procesamiento vigente en la app. */
export interface ProcessingPolicy {
  readonly mode: ProcessingMode;
}

export const DEFAULT_PROCESSING_POLICY: ProcessingPolicy = { mode: 'local-only' };

/**
 * Contenedor de la política vigente.
 *
 * `importDocument` y el ajuste de la pantalla deben ver el mismo valor sin
 * reiniciar la app: si el usuario activa la nube y el flujo de importación
 * siguiera leyendo el valor de arranque, el documento se registraría con un
 * consentimiento que no es el que el usuario acaba de dar.
 */
export class ProcessingPolicyHolder {
  private value: ProcessingPolicy;

  public constructor(initial: ProcessingPolicy = DEFAULT_PROCESSING_POLICY) {
    this.value = initial;
  }

  public current(): ProcessingPolicy {
    return this.value;
  }

  public set(policy: ProcessingPolicy): void {
    this.value = policy;
  }
}

/** Error al intentar una operación que la política prohíbe. */
export interface ProcessingDenied {
  readonly code: 'procesamiento-en-nube-no-permitido';
  readonly message: string;
}

/** `true` si la política permite enviar contenido fuera del dispositivo. */
export function allowsCloudProcessing(policy: ProcessingPolicy): boolean {
  return policy.mode === 'allow-cloud';
}

/**
 * Comprueba que una operación puede ejecutarse con la política vigente.
 *
 * Se llama antes de cualquier envío a un servidor. La comprobación vive aquí y
 * no solo en la interfaz porque una pantalla es fácil de saltar con un cambio
 * de estado; esto es la garantía de que, en modo local, ningún camino del código
 * envía documentos fuera.
 */
export function assertProcessingAllowed(
  policy: ProcessingPolicy,
  operation: { readonly requiresCloud: boolean; readonly label: string },
): Result<true, ProcessingDenied> {
  if (operation.requiresCloud && !allowsCloudProcessing(policy)) {
    return err<ProcessingDenied>({
      code: 'procesamiento-en-nube-no-permitido',
      message: `${operation.label} necesita enviar contenido a un servidor, y la app está en modo solo-dispositivo.`,
    });
  }
  return ok(true);
}

/** Descripción legible de la política, para mostrarla en la app. */
export function describeProcessingPolicy(policy: ProcessingPolicy): string {
  return allowsCloudProcessing(policy)
    ? 'Permites que el material se procese en un servidor cuando haga falta.'
    : 'Todo el procesamiento ocurre en tu dispositivo. Nada se envía a un servidor.';
}
