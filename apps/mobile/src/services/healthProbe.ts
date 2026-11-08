import { ok, type Result } from '@socracia/core';

/**
 * Sonda de salud del backend.
 *
 * Se usa al abrir el estudio (para despertar el servidor y avisar del arranque
 * en frío) y en el diagnóstico de Cuenta. No envía contenido: solo pide
 * `GET /health`, que devuelve el estado, la versión y si el proveedor semántico
 * está configurado. La clave del proveedor nunca viaja al cliente.
 */

/** Respuesta de `/health` ya interpretada. */
export interface HealthReport {
  readonly status: string;
  readonly version: string | null;
  /** SHA del despliegue, si el servidor lo expone (`RENDER_GIT_COMMIT`). */
  readonly commit: string | null;
  /** `true` si el servidor tiene proveedor semántico configurado. */
  readonly providerConfigured: boolean;
  /** Modelo del proveedor, si el servidor lo expone. */
  readonly providerModel: string | null;
}

/** Error de la sonda, con causa accionable. */
export interface HealthError {
  readonly code: 'sin-conexion' | 'respuesta-invalida';
  readonly message: string;
}

/** Puerto de la sonda; inyectable para pruebas sin red. */
export interface HealthProbe {
  check(): Promise<Result<HealthReport, HealthError>>;
}

export interface HttpHealthProbeOptions {
  readonly baseUrl: string;
  /** Milisegundos antes de dar la petición por perdida. */
  readonly timeoutMs?: number;
  readonly fetchImpl?: typeof fetch;
}

/** Sonda HTTP contra `/health`. */
export class HttpHealthProbe implements HealthProbe {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  public constructor(options: HttpHealthProbeOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.timeoutMs = options.timeoutMs ?? 65_000;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  public async check(): Promise<Result<HealthReport, HealthError>> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(`${this.baseUrl}/health`, {
        method: 'GET',
        signal: controller.signal,
      });
      if (!response.ok) {
        return {
          ok: false,
          error: {
            code: 'respuesta-invalida',
            message: `El servidor respondió ${response.status}.`,
          },
        };
      }
      const body = (await response.json().catch(() => null)) as {
        status?: unknown;
        version?: unknown;
        commit?: unknown;
        provider?: { configured?: unknown; model?: unknown };
      } | null;
      if (!body || typeof body.status !== 'string') {
        return {
          ok: false,
          error: { code: 'respuesta-invalida', message: 'Respuesta de salud inesperada.' },
        };
      }
      return ok({
        status: body.status,
        version: typeof body.version === 'string' ? body.version : null,
        commit: typeof body.commit === 'string' ? body.commit : null,
        providerConfigured: body.provider?.configured === true,
        providerModel: typeof body.provider?.model === 'string' ? body.provider.model : null,
      });
    } catch {
      return {
        ok: false,
        error: { code: 'sin-conexion', message: 'No se pudo contactar con el servidor.' },
      };
    } finally {
      clearTimeout(timer);
    }
  }
}
