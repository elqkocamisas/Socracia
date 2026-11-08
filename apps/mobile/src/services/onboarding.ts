import type { SQLiteDatabase } from 'expo-sqlite';

/**
 * Estado del onboarding.
 *
 * Se guarda una única marca: si el usuario ya vio la introducción. El
 * onboarding se muestra solo la primera vez y puede reabrirse desde Ajustes;
 * sin esta marca, reaparecería en cada arranque y estorbaría.
 */
export interface OnboardingStore {
  load(): Promise<boolean>;
  save(seen: boolean): Promise<void>;
}

const META_KEY = 'onboarding-seen';

/** Implementación en memoria, para pruebas y para el modo degradado. */
export class InMemoryOnboardingStore implements OnboardingStore {
  private seen = false;

  public async load(): Promise<boolean> {
    return this.seen;
  }

  public async save(seen: boolean): Promise<void> {
    this.seen = seen;
  }
}

/** Implementación sobre la tabla `app_meta` de SQLite. */
export class SqliteOnboardingStore implements OnboardingStore {
  public constructor(private readonly db: SQLiteDatabase) {}

  public async load(): Promise<boolean> {
    const row = await this.db.getFirstAsync<{ value: string }>(
      'SELECT value FROM app_meta WHERE key = ?;',
      [META_KEY],
    );
    return row?.value === '1';
  }

  public async save(seen: boolean): Promise<void> {
    await this.db.runAsync(
      `INSERT INTO app_meta (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value;`,
      [META_KEY, seen ? '1' : '0'],
    );
  }
}

/** Contenido de los tres pasos del onboarding, en lenguaje claro. */
export interface OnboardingStep {
  readonly title: string;
  readonly body: string;
  readonly icon: string;
}

export const ONBOARDING_STEPS: readonly OnboardingStep[] = [
  {
    title: 'Qué es la mayéutica',
    body: 'Aprender respondiendo. En lugar de darte la respuesta, la app te hace preguntas que te obligan a explicarla con tus palabras. Ejemplo: en vez de «el acto administrativo es…», te pregunta «¿por qué decimos que es unilateral?».',
    icon: '❓',
  },
  {
    title: 'Cómo trabaja Socracia',
    body: 'Importas tu temario (PDF, TXT o MD). La app lo lee, extrae los conceptos y te pregunta sobre ellos citando la fuente. Detecta tus lagunas y te programa repasos para que no se te olvide.',
    icon: '📚',
  },
  {
    title: 'Tu privacidad',
    body: 'Todo ocurre en tu dispositivo por defecto: tus documentos no salen de él. Opcionalmente puedes activar el motor semántico en la nube, que mejora las preguntas y la corrección; es voluntario y lo puedes desactivar cuando quieras.',
    icon: '🔒',
  },
];
