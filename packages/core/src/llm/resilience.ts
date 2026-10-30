/**
 * Resiliencia del motor de lenguaje.
 *
 * Un LLM es un recurso externo: se cae, tarda, cuesta dinero y a veces devuelve
 * basura. Estas piezas envuelven al proveedor para que un fallo suyo no tumbe la
 * sesión de estudio ni vacíe el bolsillo del usuario:
 *
 * - **Timeout:** una llamada que no responde en plazo se corta.
 * - **Reintento acotado:** un fallo transitorio se reintenta una vez, con espera
 *   creciente; nunca en bucle.
 * - **Circuit breaker:** si el proveedor falla repetidamente, se deja de llamar
 *   durante un tiempo en lugar de encadenar esperas.
 * - **Presupuesto:** tope de llamadas por usuario y ventana.
 * - **Caché:** la misma (pregunta, respuesta, pasajes) no se reenvía.
 * - **Observabilidad sin PII:** latencia, fallos y tasa de respaldo, sin texto.
 */

import type { Result } from '../result';
import { err, ok } from '../result';
import type { LlmCompletion, LlmCompletionRequest, LlmError, LlmProvider, LlmPurpose } from './types';

/** Opciones de resiliencia; todas con valor por defecto razonable. */
export interface ResilienceOptions {
  /** Milisegundos máximos por intento. */
  readonly timeoutMs: number;
  /** Reintentos adicionales tras el primer fallo. */
  readonly maxRetries: number;
  /** Espera base entre reintentos; se multiplica por el número de intento. */
  readonly backoffMs: number;
  /** Fallos consecutivos que abren el circuito. */
  readonly failureThreshold: number;
  /** Milisegundos que el circuito permanece abierto antes de probar de nuevo. */
  readonly openMs: number;
  /** Llamadas permitidas por usuario y ventana. */
  readonly budget: { readonly maxCalls: number; readonly windowMs: number };
  /** Entradas máximas de caché; al superarse se descarta la más antigua. */
  readonly cacheSize: number;
}

export const DEFAULT_RESILIENCE: ResilienceOptions = {
  timeoutMs: 12_000,
  maxRetries: 1,
  backoffMs: 250,
  failureThreshold: 4,
  openMs: 30_000,
  budget: { maxCalls: 60, windowMs: 10 * 60 * 1000 },
  cacheSize: 128,
};

/** Contadores observables, sin ningún contenido del usuario. */
export interface LlmMetrics {
  readonly calls: number;
  readonly failures: number;
  readonly timeouts: number;
  readonly cacheHits: number;
  readonly circuitOpens: number;
  readonly budgetRejections: number;
  /** Latencia media de las llamadas efectivas, en milisegundos. */
  readonly averageLatencyMs: number;
  /** Proporción de fallos sobre llamadas efectivas, en [0, 1]. */
  readonly fallbackRate: number;
}

/** Reloj e inyección de espera, para probar sin temporizadores reales. */
export interface Clock {
  now(): number;
  sleep(ms: number): Promise<void>;
}

export const systemClock: Clock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

/**
 * Proveedor envuelto con resiliencia.
 *
 * Implementa el mismo puerto que el proveedor crudo, así que el resto del motor
 * no sabe si está hablando con uno desnudo o con este. La caché se indexa por el
 * contenido de la petición: solo se guarda la respuesta textual, nunca se expone.
 */
export class ResilientLlmProvider implements LlmProvider {
  public readonly id: string;
  public readonly model: string;

  private readonly cache = new Map<string, LlmCompletion>();
  private readonly recentFailures: number[] = [];
  private readonly callTimestamps: number[] = [];
  private circuitOpenedAt: number | null = null;
  private calls = 0;
  private failures = 0;
  private timeouts = 0;
  private cacheHits = 0;
  private circuitOpens = 0;
  private budgetRejections = 0;
  private totalLatencyMs = 0;

  public constructor(
    private readonly inner: LlmProvider,
    private readonly options: ResilienceOptions = DEFAULT_RESILIENCE,
    private readonly clock: Clock = systemClock,
  ) {
    this.id = inner.id;
    this.model = inner.model;
  }

  public async complete(
    request: LlmCompletionRequest,
  ): Promise<Result<LlmCompletion, LlmError>> {
    const cached = this.cache.get(cacheKey(request));
    if (cached) {
      this.cacheHits += 1;
      return ok(cached);
    }

    const blocked = this.guard();
    if (!blocked.ok) {
      return blocked;
    }

    const started = this.clock.now();
    const outcome = await this.attemptWithRetries(request);
    const elapsed = this.clock.now() - started;

    if (!outcome.ok) {
      this.registerFailure(outcome.error);
      return outcome;
    }

    this.calls += 1;
    this.totalLatencyMs += elapsed;
    this.recordCall();
    this.store(request, outcome.value);
    return outcome;
  }

  /** Contadores para el panel de observabilidad. */
  public metrics(): LlmMetrics {
    const effective = this.calls + this.failures;
    return {
      calls: this.calls,
      failures: this.failures,
      timeouts: this.timeouts,
      cacheHits: this.cacheHits,
      circuitOpens: this.circuitOpens,
      budgetRejections: this.budgetRejections,
      averageLatencyMs: this.calls === 0 ? 0 : Math.round(this.totalLatencyMs / this.calls),
      fallbackRate: effective === 0 ? 0 : this.failures / effective,
    };
  }

  /** Cierra el circuito a mano; útil en pruebas y tras un cambio de configuración. */
  public resetCircuit(): void {
    this.circuitOpenedAt = null;
    this.recentFailures.length = 0;
  }

  /**
   * Comprueba circuito y presupuesto antes de gastar una llamada.
   *
   * El orden importa: si el circuito está abierto no tiene sentido contar
   * presupuesto, y el usuario debe recibir el motivo más informativo.
   */
  private guard(): Result<true, LlmError> {
    if (this.circuitOpenedAt !== null) {
      const elapsed = this.clock.now() - this.circuitOpenedAt;
      if (elapsed < this.options.openMs) {
        return err<LlmError>({
          code: 'circuito-abierto',
          message: 'El servicio de lenguaje falla repetidamente; se usa el modo sin conexión.',
        });
      }
      // Se cumplió la espera: se permite un intento de sondeo.
      this.circuitOpenedAt = null;
      this.recentFailures.length = 0;
    }

    if (!this.withinBudget()) {
      this.budgetRejections += 1;
      return err<LlmError>({
        code: 'presupuesto-agotado',
        message: 'Has alcanzado el límite de consultas por ahora. Seguimos sin conexión.',
      });
    }
    return ok(true);
  }

  private withinBudget(): boolean {
    const cutoff = this.clock.now() - this.options.budget.windowMs;
    while (this.callTimestamps.length > 0 && (this.callTimestamps[0] as number) < cutoff) {
      this.callTimestamps.shift();
    }
    return this.callTimestamps.length < this.options.budget.maxCalls;
  }

  private recordCall(): void {
    this.callTimestamps.push(this.clock.now());
  }

  private async attemptWithRetries(
    request: LlmCompletionRequest,
  ): Promise<Result<LlmCompletion, LlmError>> {
    let last: Result<LlmCompletion, LlmError> = err<LlmError>({
      code: 'red',
      message: 'Sin intentos.',
    });
    for (let attempt = 0; attempt <= this.options.maxRetries; attempt += 1) {
      if (attempt > 0) {
        await this.clock.sleep(this.options.backoffMs * attempt);
      }
      last = await this.attemptOnce(request);
      if (last.ok || !isRetryable(last.error)) {
        return last;
      }
    }
    return last;
  }

  private async attemptOnce(
    request: LlmCompletionRequest,
  ): Promise<Result<LlmCompletion, LlmError>> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<Result<LlmCompletion, LlmError>>((resolve) => {
      timer = setTimeout(() => {
        this.timeouts += 1;
        resolve(
          err<LlmError>({ code: 'timeout', message: 'El servicio de lenguaje tardó demasiado.' }),
        );
      }, this.options.timeoutMs);
    });

    try {
      return await Promise.race([this.inner.complete(request), timeout]);
    } finally {
      if (timer !== undefined) {
        clearTimeout(timer);
      }
    }
  }

  private registerFailure(error: LlmError): void {
    this.failures += 1;
    // Un fallo de cuota no es transitorio: abrir el circuito por él castigaría al
    // usuario con más espera de la necesaria.
    if (error.code === 'cuota') {
      return;
    }
    const now = this.clock.now();
    this.recentFailures.push(now);
    const cutoff = now - this.options.openMs;
    while (this.recentFailures.length > 0 && (this.recentFailures[0] as number) < cutoff) {
      this.recentFailures.shift();
    }
    if (this.recentFailures.length >= this.options.failureThreshold) {
      this.circuitOpenedAt = now;
      this.circuitOpens += 1;
      this.recentFailures.length = 0;
    }
  }

  private store(request: LlmCompletionRequest, completion: LlmCompletion): void {
    if (this.cache.size >= this.options.cacheSize) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) {
        this.cache.delete(oldest);
      }
    }
    this.cache.set(cacheKey(request), completion);
  }
}

/**
 * Clave de caché de una petición.
 *
 * Solo se cachea lo determinista (temperatura 0): con temperatura > 0 la misma
 * entrada puede dar salidas distintas a propósito y servir una copia sería
 * cambiar el comportamiento del modelo sin avisar.
 */
function cacheKey(request: LlmCompletionRequest): string {
  if (request.temperature > 0) {
    return `nocache:${Math.random()}`;
  }
  return `${request.purpose}\u0000${request.system}\u0000${request.user}`;
}

/** `true` si merece la pena reintentar el fallo. */
function isRetryable(error: LlmError): boolean {
  return error.code === 'timeout' || error.code === 'red' || error.code === 'http';
}

/** Propósito al que pertenece un fallo; se usa para etiquetar métricas. */
export function purposeOf(request: LlmCompletionRequest): LlmPurpose {
  return request.purpose;
}
