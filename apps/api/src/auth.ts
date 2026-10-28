import { randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);
const KEY_LENGTH = 32;

/** Cuenta registrada. La contraseña nunca se guarda en claro. */
interface Account {
  readonly userId: string;
  readonly email: string;
  readonly salt: string;
  readonly passwordHash: string;
}

/** Sesión emitida tras autenticarse. */
export interface Session {
  readonly token: string;
  readonly userId: string;
}

/** Error de autenticación con causa accionable. */
export interface AuthError {
  readonly code: 'credenciales-invalidas' | 'email-en-uso' | 'datos-invalidos';
  readonly message: string;
}

export type AuthResult =
  | { readonly ok: true; readonly value: Session }
  | { readonly ok: false; readonly error: AuthError };

/**
 * Cuentas y sesiones mínimas del MVP.
 *
 * Se usa `scrypt` (incluido en Node, sin dependencias) con sal por cuenta y
 * comparación en tiempo constante. Los tokens son aleatorios de 32 bytes y
 * viven en memoria: al reiniciar el proceso las sesiones caducan y el usuario
 * vuelve a iniciar sesión. Es deliberadamente simple; la app es útil sin
 * cuenta, que solo añade sincronización.
 */
export class AuthService {
  private readonly accountsByEmail = new Map<string, Account>();
  private readonly accountsById = new Map<string, Account>();
  private readonly sessions = new Map<string, string>();

  public async register(email: string, password: string): Promise<AuthResult> {
    const normalized = normalizeEmail(email);
    if (!isValidEmail(normalized) || password.length < 8) {
      return {
        ok: false,
        error: {
          code: 'datos-invalidos',
          message: 'El correo debe ser válido y la contraseña tener al menos 8 caracteres.',
        },
      };
    }
    if (this.accountsByEmail.has(normalized)) {
      return {
        ok: false,
        error: { code: 'email-en-uso', message: 'Ese correo ya está registrado.' },
      };
    }

    const salt = randomBytes(16).toString('hex');
    const passwordHash = await hashPassword(password, salt);
    const account: Account = {
      userId: `user-${randomUUID()}`,
      email: normalized,
      salt,
      passwordHash,
    };
    this.accountsByEmail.set(normalized, account);
    this.accountsById.set(account.userId, account);

    return { ok: true, value: this.issue(account) };
  }

  public async login(email: string, password: string): Promise<AuthResult> {
    const account = this.accountsByEmail.get(normalizeEmail(email));
    if (!account) {
      return invalidCredentials();
    }
    const candidate = await hashPassword(password, account.salt);
    if (!constantTimeEquals(candidate, account.passwordHash)) {
      return invalidCredentials();
    }
    return { ok: true, value: this.issue(account) };
  }

  /** Usuario asociado a un token de sesión, o `null` si no es válido. */
  public userIdForToken(token: string): string | null {
    return this.sessions.get(token) ?? null;
  }

  /** Cierra la sesión de un token. */
  public logout(token: string): void {
    this.sessions.delete(token);
  }

  private issue(account: Account): Session {
    const token = randomBytes(32).toString('hex');
    this.sessions.set(token, account.userId);
    return { token, userId: account.userId };
  }
}

function invalidCredentials(): AuthResult {
  return {
    ok: false,
    error: { code: 'credenciales-invalidas', message: 'Correo o contraseña incorrectos.' },
  };
}

async function hashPassword(password: string, salt: string): Promise<string> {
  const derived = (await scryptAsync(password, salt, KEY_LENGTH)) as Buffer;
  return derived.toString('hex');
}

function constantTimeEquals(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, 'hex');
  const bufferB = Buffer.from(b, 'hex');
  return bufferA.length === bufferB.length && timingSafeEqual(bufferA, bufferB);
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
