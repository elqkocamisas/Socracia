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

/** Texto que explica la política vigente, para la pantalla. */
export function describeCurrentPolicy(policy: ProcessingPolicy): string {
  return describeProcessingPolicy(policy);
}
