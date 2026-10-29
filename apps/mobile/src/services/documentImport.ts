import type { Result } from '@socracia/core';
import { err, ok } from '@socracia/core';

/** Archivo elegido por el usuario en el selector del sistema. */
export interface PickedFile {
  readonly name: string;
  readonly mimeType: string;
  readonly uri: string;
  readonly sizeBytes: number;
}

/** Lector de bytes de un archivo local. */
export interface FileBytesReader {
  /** Devuelve el contenido binario del archivo en `uri`. */
  read(uri: string): Promise<Result<Uint8Array>>;
}

/** Selector de documentos del sistema operativo. */
export interface DocumentPickerPort {
  /** Abre el selector. Devuelve `null` si el usuario cancela. */
  pick(): Promise<PickedFile | null>;
}

/** Error al importar un documento. */
export interface ImportError {
  readonly code:
    'cancelado' | 'sin-archivo' | 'lectura-fallida' | 'ingesta-fallida' | 'borrado-fallido';
  readonly message: string;
}

/**
 * Convierte un `ArrayBuffer` en `Uint8Array`.
 *
 * `arrayBuffer` es la única forma portable de leer bytes en Expo sin base64,
 * y devuelve un buffer nuevo, de modo que el `Uint8Array` no comparte memoria
 * con la capa nativa.
 */
export function toUint8Array(buffer: ArrayBuffer): Uint8Array {
  return new Uint8Array(buffer);
}

/** Comprueba que el archivo tenga extensión o MIME admitidos. */
export function isSupported(file: PickedFile): boolean {
  const name = file.name.toLowerCase();
  const mime = file.mimeType.toLowerCase();
  return (
    mime === 'application/pdf' ||
    mime.startsWith('text/') ||
    mime === 'application/octet-stream' ||
    name.endsWith('.pdf') ||
    name.endsWith('.txt') ||
    name.endsWith('.md') ||
    name.endsWith('.markdown')
  );
}

/** Mensaje legible para un archivo no admitido. */
export const UNSUPPORTED_MESSAGE = 'Formato no soportado. Usa PDF, TXT o MD.';

/**
 * Lee un archivo elegido y devuelve sus bytes.
 *
 * Valida el formato antes de leer para no cargar en memoria documentos que el
 * motor no sabrá interpretar.
 */
export async function readPickedFile(
  file: PickedFile,
  reader: FileBytesReader,
): Promise<Result<Uint8Array, ImportError>> {
  if (!isSupported(file)) {
    return err<ImportError>({ code: 'sin-archivo', message: UNSUPPORTED_MESSAGE });
  }
  const bytes = await reader.read(file.uri);
  if (!bytes.ok) {
    return err<ImportError>({
      code: 'lectura-fallida',
      message: `No se pudo leer «${file.name}». Inténtalo de nuevo.`,
    });
  }
  if (bytes.value.length === 0) {
    return err<ImportError>({ code: 'sin-archivo', message: 'El archivo está vacío.' });
  }
  return ok(bytes.value);
}
