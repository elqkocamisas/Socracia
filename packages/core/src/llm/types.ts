import type { Citation } from '../domain/types';
import type { Result } from '../result';

/**
 * Puerto del motor de lenguaje.
 *
 * Todo el proyecto habla con un LLM **solo** a través de esta interfaz. Ninguna
 * pieza del núcleo mayéutico conoce OpenAI, Anthropic ni ningún otro proveedor:
 * los adaptadores concretos viven fuera (backend o cliente móvil) y aquí solo
 * entra la forma de una petición y su resultado. Así el motor funciona igual con
 * un modelo en la nube que con uno local, y se prueba con un doble sin red.
 */

/** Para qué se usa la llamada; sirve a la observabilidad y al presupuesto. */
export type LlmPurpose = 'evaluar' | 'generar' | 'seguimiento' | 'explicar';

/** Petición de compleción. Instrucciones y datos viajan en campos separados. */
export interface LlmCompletionRequest {
  /** Instrucciones del sistema. Nunca contienen datos del usuario. */
  readonly system: string;
  /** Datos delimitados: documento y respuesta del usuario. No son instrucciones. */
  readonly user: string;
  /** Tope de tokens de la respuesta. */
  readonly maxTokens: number;
  /** Temperatura; 0 para tareas deterministas como evaluar. */
  readonly temperature: number;
  readonly purpose: LlmPurpose;
}

/** Consumo de tokens de una llamada, para presupuesto y observabilidad. */
export interface LlmUsage {
  readonly promptTokens: number;
  readonly completionTokens: number;
}

/** Compleción devuelta por el proveedor. */
export interface LlmCompletion {
  readonly text: string;
  readonly usage: LlmUsage;
  readonly model: string;
}

/** Motivos de fallo del motor de lenguaje, con causa accionable. */
export interface LlmError {
  readonly code:
    | 'no-configurado'
    | 'sin-consentimiento'
    | 'timeout'
    | 'red'
    | 'http'
    | 'cuota'
    | 'presupuesto-agotado'
    | 'circuito-abierto'
    | 'respuesta-invalida';
  readonly message: string;
}

/**
 * Motor de lenguaje intercambiable.
 *
 * `complete` nunca lanza: devuelve un `Result` para que quien decide pueda
 * aplicar el respaldo heurístico sin envolver todo en `try/catch`.
 */
export interface LlmProvider {
  /** Identificador del adaptador, p. ej. `http-backend` o `falso`. */
  readonly id: string;
  /** Modelo concreto; vacío si el adaptador no lo expone. */
  readonly model: string;
  complete(request: LlmCompletionRequest): Promise<Result<LlmCompletion, LlmError>>;
}

/**
 * Fragmento candidato a respaldar una evaluación o una explicación.
 *
 * Se declara aquí, junto al puerto, para que quien compone (la sesión, la API)
 * pueda pasarlos sin depender del evaluador concreto.
 */
export interface LlmPassage {
  readonly citation: Citation;
}
