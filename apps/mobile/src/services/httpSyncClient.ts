import type { Id, ProgressSnapshot, Result, SyncError, SyncPort } from '@socracia/core';

/**
 * Cliente HTTP de la API de Socracia.
 *
 * Implementa `SyncPort` sobre `fetch`, de modo que el servicio de
 * sincronización del dominio funciona igual contra el backend real o contra el
 * servidor en memoria de las pruebas. Traduce los fallos de red y los códigos
 * HTTP a un `SyncError` con causa accionable para la UI.
 */
export interface AccountSession {
  readonly token: string;
  readonly userId: Id;
  readonly email: string;
}

export interface HttpSyncClientOptions {
  /** URL base del backend, sin barra final. */
  readonly baseUrl: string;
  /** Token de la sesión activa; `null` si el usuario no ha iniciado sesión. */
  readonly token?: string | null;
  /** `fetch` inyectable para pruebas sin red. */
  readonly fetchImpl?: typeof fetch;
}

export class HttpSyncClient implements SyncPort {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private token: string | null;

  public constructor(options: HttpSyncClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.token = options.token ?? null;
  }

  /** Fija el token tras iniciar sesión o cerrarla (`null`). */
  public setToken(token: string | null): void {
    this.token = token;
  }

  public async register(
    email: string,
    password: string,
  ): Promise<Result<AccountSession, SyncError>> {
    return this.authenticate('/auth/register', email, password);
  }

  public async login(email: string, password: string): Promise<Result<AccountSession, SyncError>> {
    return this.authenticate('/auth/login', email, password);
  }

  public async logout(): Promise<void> {
    if (!this.token) {
      return;
    }
    try {
      await this.fetchImpl(`${this.baseUrl}/auth/logout`, {
        method: 'POST',
        headers: this.headers(),
      });
    } catch {
      // Cerrar sesión en el servidor es best-effort: el token local se borra
      // igualmente, así que un fallo de red no debe bloquear al usuario.
    }
    this.token = null;
  }

  /**
   * Elimina la cuenta en el servidor.
   *
   * A diferencia del cierre de sesión, aquí **no** se puede ignorar un fallo:
   * si el servidor no borra los datos, el usuario debe saberlo. Solo se limpia
   * el token local cuando el servidor confirma el borrado.
   */
  public async deleteAccount(): Promise<Result<void, SyncError>> {
    if (!this.token) {
      return {
        ok: false,
        error: { code: 'sin-sesion', message: 'No hay sesión activa que eliminar.' },
      };
    }
    const result = await this.request<{ status: string }>('/account', {
      method: 'DELETE',
      headers: this.headers(),
    });
    if (!result.ok) {
      return result;
    }
    this.token = null;
    return { ok: true, value: undefined };
  }

  public async push(snapshot: ProgressSnapshot): Promise<Result<ProgressSnapshot, SyncError>> {
    if (!this.token) {
      return {
        ok: false,
        error: { code: 'sin-sesion', message: 'Inicia sesión para sincronizar.' },
      };
    }
    return this.request<ProgressSnapshot>('/sync/push', {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(snapshot),
    });
  }

  public async pull(userId: Id): Promise<Result<ProgressSnapshot, SyncError>> {
    if (!this.token) {
      return {
        ok: false,
        error: { code: 'sin-sesion', message: 'Inicia sesión para sincronizar.' },
      };
    }
    return this.request<ProgressSnapshot>(`/sync/pull?userId=${encodeURIComponent(userId)}`, {
      method: 'GET',
      headers: this.headers(),
    });
  }

  private async authenticate(
    path: string,
    email: string,
    password: string,
  ): Promise<Result<AccountSession, SyncError>> {
    const response = await this.request<{ token: string; userId: string }>(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!response.ok) {
      return response;
    }
    this.token = response.value.token;
    return { ok: true, value: { ...response.value, email } };
  }

  private headers(): Record<string, string> {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (this.token) {
      headers.authorization = `Bearer ${this.token}`;
    }
    return headers;
  }

  /** Ejecuta una petición y normaliza el resultado o el error. */
  private async request<T>(path: string, init: RequestInit): Promise<Result<T, SyncError>> {
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}${path}`, init);
    } catch {
      return { ok: false, error: { code: 'red', message: 'No hay conexión con el servidor.' } };
    }

    if (response.status === 401) {
      return { ok: false, error: { code: 'no-autorizado', message: 'La sesión ha caducado.' } };
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      body = null;
    }

    if (!response.ok) {
      const message = extractMessage(body) ?? `El servidor respondió ${response.status}.`;
      return { ok: false, error: { code: 'servidor', message } };
    }

    return { ok: true, value: body as T };
  }
}

function extractMessage(body: unknown): string | null {
  if (typeof body === 'object' && body !== null && 'message' in body) {
    const message = (body as { message?: unknown }).message;
    return typeof message === 'string' ? message : null;
  }
  return null;
}
