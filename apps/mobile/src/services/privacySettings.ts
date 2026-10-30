import {
  allowsCloudProcessing,
  describeProcessingPolicy,
  type ProcessingPolicy,
  type ProcessingPolicyHolder,
} from '@socracia/core';

import type { ProcessingPolicyStore } from './processingPolicyStore';

/** Ajuste de privacidad que la pantalla de cuenta ofrece al usuario. */
export interface PrivacySettings {
  readonly policy: ProcessingPolicy;
  /** Diagnóstico del proveedor de embeddings realmente activo. */
  readonly embedding: {
    readonly id: string;
    readonly onDeviceModel: boolean;
    readonly degradedReason: string | null;
  };
}

/** Servicios mínimos que necesita el ajuste de privacidad. */
export interface PrivacySettingsPorts {
  readonly policy: ProcessingPolicyHolder;
  readonly policyStore: ProcessingPolicyStore;
  readonly embedding: {
    readonly provider: { readonly id: string };
    readonly onDeviceModel: boolean;
    readonly degradedReason: string | null;
  };
  /**
   * `false` cuando no hay backend semántico: el ajuste de nube no se ofrece
   * porque no habría nada que activar.
   */
  readonly cloudAvailable?: boolean;
}

/** Lee el ajuste y el diagnóstico actuales. */
export function readPrivacySettings(services: PrivacySettingsPorts): PrivacySettings {
  return {
    policy: services.policy.current(),
    embedding: {
      id: services.embedding.provider.id,
      onDeviceModel: services.embedding.onDeviceModel,
      degradedReason: services.embedding.degradedReason,
    },
  };
}

/**
 * Cambia la política de procesamiento y la persiste.
 *
 * Aplica el cambio al contenedor compartido antes de guardarlo, de modo que el
 * flujo de importación lo ve de inmediato. Devuelve la política resultante para
 * que la UI pinte lo que quedó guardado y no lo que creía haber pedido.
 */
export async function setProcessingPolicy(
  services: PrivacySettingsPorts,
  mode: ProcessingPolicy['mode'],
): Promise<ProcessingPolicy> {
  const next: ProcessingPolicy = { mode };
  services.policy.set(next);
  await services.policyStore.save(next);
  return next;
}

/** `true` si la app está enviando contenido fuera del dispositivo. */
export function isCloudEnabled(services: PrivacySettingsPorts): boolean {
  return allowsCloudProcessing(services.policy.current());
}

/**
 * `true` si debe ofrecerse el ajuste de nube.
 *
 * Se exige que la nube esté disponible en este build: si no lo está, el
 * interruptor no haría nada y la pantalla mostraría una opción vacía.
 */
export function isCloudToggleVisible(services: PrivacySettingsPorts): boolean {
  return services.cloudAvailable === true;
}

/** Texto que explica la política vigente, para la pantalla. */
export function describeCurrentPolicy(policy: ProcessingPolicy): string {
  return describeProcessingPolicy(policy);
}
