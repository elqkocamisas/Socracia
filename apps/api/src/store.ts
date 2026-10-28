import { mergeSnapshots, type ProgressSnapshot } from '@socracia/core';
import { readFile, writeFile } from 'node:fs/promises';

/**
 * Almacén de progreso sincronizado.
 *
 * El servidor no interpreta el progreso: solo lo guarda por usuario y lo
 * fusiona con lo que llega. La fusión es la misma función pura que usa el
 * cliente, de modo que ambos convergen al mismo estado sin lógica duplicada.
 */
export interface ProgressStore {
  /** Fusiona la instantánea recibida con la guardada y devuelve el resultado. */
  merge(userId: string, incoming: ProgressSnapshot): Promise<ProgressSnapshot>;
  /** Instantánea guardada de un usuario, o `null` si no tiene ninguna. */
  get(userId: string): Promise<ProgressSnapshot | null>;
}

/** Almacén en memoria; por defecto y suficiente para el MVP de un solo nodo. */
export class InMemoryProgressStore implements ProgressStore {
  private readonly byUser = new Map<string, ProgressSnapshot>();

  public async merge(userId: string, incoming: ProgressSnapshot): Promise<ProgressSnapshot> {
    const stored = this.byUser.get(userId) ?? null;
    const merged = stored ? mergeSnapshots(stored, incoming) : incoming;
    this.byUser.set(userId, merged);
    return merged;
  }

  public async get(userId: string): Promise<ProgressSnapshot | null> {
    return this.byUser.get(userId) ?? null;
  }
}

/**
 * Almacén sobre un fichero JSON.
 *
 * Permite que el progreso sobreviva a un reinicio del proceso sin introducir
 * una base de datos: para el volumen del MVP es suficiente y mantiene el
 * despliegue en un solo fichero. Las escrituras se serializan con una cola para
 * que dos peticiones concurrentes no se pisen.
 */
export class JsonFileProgressStore implements ProgressStore {
  private readonly byUser = new Map<string, ProgressSnapshot>();
  private loaded = false;
  private writeChain: Promise<void> = Promise.resolve();

  public constructor(private readonly path: string) {}

  public async merge(userId: string, incoming: ProgressSnapshot): Promise<ProgressSnapshot> {
    await this.ensureLoaded();
    const stored = this.byUser.get(userId) ?? null;
    const merged = stored ? mergeSnapshots(stored, incoming) : incoming;
    this.byUser.set(userId, merged);
    await this.flush();
    return merged;
  }

  public async get(userId: string): Promise<ProgressSnapshot | null> {
    await this.ensureLoaded();
    return this.byUser.get(userId) ?? null;
  }

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) {
      return;
    }
    try {
      const raw = await readFile(this.path, 'utf8');
      const parsed = JSON.parse(raw) as Record<string, ProgressSnapshot>;
      for (const [userId, snapshot] of Object.entries(parsed)) {
        this.byUser.set(userId, snapshot);
      }
    } catch (error) {
      if (!isMissingFile(error)) {
        throw error;
      }
    }
    this.loaded = true;
  }

  /** Serializa las escrituras para no perder datos si llegan en paralelo. */
  private flush(): Promise<void> {
    this.writeChain = this.writeChain.then(async () => {
      const payload = JSON.stringify(Object.fromEntries(this.byUser));
      await writeFile(this.path, payload, 'utf8');
    });
    return this.writeChain;
  }
}

function isMissingFile(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'ENOENT'
  );
}
