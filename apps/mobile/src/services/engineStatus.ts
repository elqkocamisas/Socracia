/**
 * Estado del motor mayéutico que la insignia de la pantalla de estudio muestra.
 *
 * El usuario tiene derecho a saber **quién responde** a su pregunta: el motor
 * semántico (con modelo, en la nube) o la heurística local. Cuando degrada, el
 * motivo debe ser explícito y accionable, nunca silencioso. Esta función es pura
 * y sin dependencias de plataforma, así que cada motivo se prueba en Node.
 */

/** Quién está respondiendo. */
export type EngineMode = 'semantic' | 'local';

/** Motivo por el que el motor semántico no responde. */
export type EngineReasonCode =
  | 'sin-backend'
  | 'sin-cuenta'
  | 'nube-desactivada'
  | 'documento-sin-permiso'
  | 'sin-conexion'
  | 'servidor-despertando'
  | 'cuota'
  | 'error-proveedor';

/** Estado del motor listo para pintar. */
export interface EngineStatus {
  readonly mode: EngineMode;
  /** `null` cuando el motor semántico responde. */
  readonly reason: EngineReasonCode | null;
  /** Rótulo corto para la insignia. */
  readonly label: string;
  /** Explicación del motivo, en lenguaje llano. */
  readonly explanation: string;
  /** Acción sugerida para resolver la degradación, si existe. */
  readonly action: string | null;
}

/** Entradas del diagnóstico; todas derivadas del estado real de la app. */
export interface EngineStatusInput {
  /** `true` si este build ofrece backend semántico (`EXPO_PUBLIC_CLOUD_PROCESSING`). */
  readonly cloudAvailable: boolean;
  /** `true` si hay sesión iniciada. */
  readonly hasSession: boolean;
  /** `true` si la política de privacidad autoriza la nube. */
  readonly policyAllowsCloud: boolean;
  /** `true` si el documento en estudio tiene consentimiento para la nube. */
  readonly documentConsent: boolean;
  /** Resultado del sondeo de red contra `/health`. */
  readonly connectivity: 'ok' | 'offline' | 'waking' | 'unknown';
  /** Incidencia reportada por el proveedor, si la hubo. */
  readonly providerIssue: 'cuota' | 'error' | null;
}

const REASON_TEXT: Record<EngineReasonCode, { explanation: string; action: string | null }> = {
  'sin-backend': {
    explanation:
      'Esta versión de la app no incluye el motor semántico; funciona por completo en tu dispositivo.',
    action: null,
  },
  'sin-cuenta': {
    explanation:
      'El motor semántico necesita una cuenta para identificar tu progreso. Sin cuenta, la app estudia en local.',
    action: 'Iniciar sesión',
  },
  'nube-desactivada': {
    explanation:
      'Tienes desactivado el procesamiento en la nube, así que todo ocurre en tu dispositivo.',
    action: 'Activar nube',
  },
  'documento-sin-permiso': {
    explanation:
      'Este documento no tiene permiso para procesarse fuera del dispositivo. Puedes autorizarlo en su ficha.',
    action: 'Autorizar documento',
  },
  'sin-conexion': {
    explanation:
      'No hay conexión con el servidor, así que ahora mismo responde el motor local. Se recuperará solo.',
    action: 'Reintentar',
  },
  'servidor-despertando': {
    explanation:
      'El servidor está despertando; puede tardar hasta un minuto. Mientras tanto responde el motor local.',
    action: 'Reintentar',
  },
  cuota: {
    explanation:
      'Se agotó la cuota del proveedor por ahora. La app sigue funcionando en local y se recuperará al renovarse.',
    action: null,
  },
  'error-proveedor': {
    explanation:
      'El proveedor devolvió un error. La app sigue en local y reintentará en el próximo turno.',
    action: 'Reintentar',
  },
};

/**
 * Decide el estado del motor y, si degrada, por qué.
 *
 * El orden de comprobación es el del recorrido del usuario: primero si el build
 * trae motor, luego cuenta, permiso global, permiso del documento y, por
 * último, la red y el proveedor. Así el motivo mostrado es siempre la primera
 * causa accionable, no una cualquiera.
 */
export function describeEngineStatus(input: EngineStatusInput): EngineStatus {
  const reason = firstReason(input);
  if (reason === null) {
    return {
      mode: 'semantic',
      reason: null,
      label: 'IA semántica',
      explanation: 'Las preguntas y su evaluación las produce el motor con modelo.',
      action: null,
    };
  }
  return {
    mode: 'local',
    reason,
    label: 'Modo local',
    explanation: REASON_TEXT[reason].explanation,
    action: REASON_TEXT[reason].action,
  };
}

function firstReason(input: EngineStatusInput): EngineReasonCode | null {
  if (!input.cloudAvailable) return 'sin-backend';
  if (!input.hasSession) return 'sin-cuenta';
  if (!input.policyAllowsCloud) return 'nube-desactivada';
  if (!input.documentConsent) return 'documento-sin-permiso';
  if (input.connectivity === 'offline') return 'sin-conexion';
  if (input.connectivity === 'waking') return 'servidor-despertando';
  if (input.providerIssue === 'cuota') return 'cuota';
  if (input.providerIssue === 'error') return 'error-proveedor';
  return null;
}

/** Los cuatro requisitos de la nube, para el diagnóstico de Cuenta. */
export interface CloudConditions {
  readonly buildWithEngine: boolean;
  readonly signedIn: boolean;
  readonly policyAllowsCloud: boolean;
  readonly documentConsent: boolean;
}

/** Describe cada requisito con su estado, para la pantalla de Cuenta. */
export function describeCloudConditions(conditions: CloudConditions): readonly {
  readonly label: string;
  readonly met: boolean;
}[] {
  return [
    { label: 'Esta versión incluye el motor semántico', met: conditions.buildWithEngine },
    { label: 'Sesión iniciada', met: conditions.signedIn },
    { label: 'Procesamiento en la nube permitido', met: conditions.policyAllowsCloud },
    { label: 'Al menos un documento autorizado', met: conditions.documentConsent },
  ];
}
