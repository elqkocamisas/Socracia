import type { Result, StoragePort, SyncError, SyncOutcome } from '@socracia/core';
import { SyncService } from '@socracia/core';

import type { CredentialStore } from './credentialStore';
import type { AccountSession, HttpSyncClient } from './httpSyncClient';

/**
 * Estado de cuenta y sincronización que consume la UI.
 *
 * Es un controlador sin React: recibe el cliente, el almacén de credenciales y
 * el puerto de almacenamiento por inyección, así que se prueba en Node sin
 * dispositivo ni red real.
 */
export interface AccountState {
  readonly session: AccountSession | null;
}

/**
 * Orquesta la cuenta y la sincronización del progreso.
 *
 * El progreso local vive siempre bajo el mismo identificador local; el backend
 * lo indexa por la cuenta de la sesión. Así iniciar sesión no reescribe el
 * almacén local ni obliga a migrar datos: se sube lo que hay y se fusiona lo
 * que llega (D-027).
 */
export class AccountService {
  public constructor(
    private readonly client: HttpSyncClient,
    private readonly credentials: CredentialStore,
    private readonly storage: StoragePort,
    private readonly localUserId: string,
  ) {}

  /** Recupera la sesión guardada, si la hay, y la activa en el cliente. */
  public async restore(): Promise<AccountSession | null> {
    const session = await this.credentials.load();
    if (session) {
      this.client.setToken(session.token);
    }
    return session;
  }

  public async register(
    email: string,
    password: string,
  ): Promise<Result<AccountSession, SyncError>> {
    const result = await this.client.register(email, password);
    return this.persistIfOk(result);
  }

  public async login(email: string, password: string): Promise<Result<AccountSession, SyncError>> {
    const result = await this.client.login(email, password);
    return this.persistIfOk(result);
  }

  /** Cierra la sesión local y la del servidor; el progreso local se conserva. */
  public async logout(): Promise<void> {
    await this.client.logout();
    await this.credentials.clear();
  }

  /**
   * Sincroniza el progreso.
   *
   * Requiere sesión: sin cuenta no hay a dónde sincronizar y el progreso sigue
   * siendo local y privado, que es el comportamiento por defecto del MVP.
   */
  public async sync(now: number): Promise<Result<SyncOutcome, SyncError>> {
    const session = await this.credentials.load();
    if (!session) {
      return {
        ok: false,
        error: { code: 'sin-sesion', message: 'Inicia sesión para sincronizar tu progreso.' },
      };
    }
    this.client.setToken(session.token);
    return new SyncService(this.storage, this.client, this.localUserId).sync(now);
  }

  private async persistIfOk(
    result: Result<AccountSession, SyncError>,
  ): Promise<Result<AccountSession, SyncError>> {
    if (result.ok) {
      await this.credentials.save(result.value);
    }
    return result;
  }
}
