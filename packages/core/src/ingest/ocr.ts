import type { Result } from '../result';

/**
 * Frontera opcional con el reconocimiento óptico de caracteres (OCR).
 *
 * El dominio no conoce ningún proveedor concreto: solo este puerto. La app lo
 * implementa contra su backend (que es quien tiene la credencial y el modelo
 * multimodal) y las pruebas lo implementan con un doble. Así el OCR puede
 * añadirse o retirarse sin tocar la lógica de ingesta, igual que el proveedor
 * semántico.
 */

/** Motivo por el que el OCR no pudo reconocer texto. */
export interface OcrError {
  readonly code:
    | 'sin-consentimiento'
    | 'no-disponible'
    | 'formato-no-soportado'
    | 'demasiado-grande'
    | 'ocr-fallido';
  readonly message: string;
}

/** Petición de reconocimiento sobre un documento binario (imagen o PDF escaneado). */
export interface OcrRequest {
  readonly fileName: string;
  readonly mimeType: string;
  readonly bytes: Uint8Array;
}

/** Texto reconocido, listo para el mismo pipeline de ingesta que un PDF con texto. */
export interface OcrResult {
  readonly text: string;
}

/**
 * Puerto de OCR.
 *
 * `recognize` es total: nunca lanza, siempre devuelve un `Result`. Un fallo de
 * OCR no debe romper la importación; el llamante decide si avisa o degrada.
 */
export interface OcrPort {
  recognize(request: OcrRequest): Promise<Result<OcrResult, OcrError>>;
}

/** Tipos MIME de imagen que el OCR admite como entrada directa. */
export const OCR_IMAGE_MIME_TYPES: readonly string[] = [
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/heic',
  'image/heif',
];

const OCR_IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.heic', '.heif'];

/**
 * `true` si el archivo es una imagen que el OCR puede reconocer.
 *
 * Un PDF escaneado también lo admite, pero su decisión depende del resultado de
 * la extracción de texto (si no hay capa de texto, se intenta el OCR), así que
 * aquí solo se clasifican las imágenes.
 */
export function isOcrImage(mimeType: string, fileName: string): boolean {
  const mime = mimeType.toLowerCase();
  const name = fileName.toLowerCase();
  return (
    OCR_IMAGE_MIME_TYPES.includes(mime) || OCR_IMAGE_EXTENSIONS.some((ext) => name.endsWith(ext))
  );
}

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/**
 * Codifica bytes a base64 en JavaScript puro.
 *
 * Se implementa aquí, y no con `btoa`, porque Hermes no garantiza `btoa` ni
 * `Buffer`, y el texto debe poder viajar al backend de forma portable. El
 * resultado es idéntico al de la implementación estándar (sin saltos de línea).
 */
export function bytesToBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i] as number;
    const b1 = bytes[i + 1];
    const b2 = bytes[i + 2];
    out += BASE64_ALPHABET[b0 >> 2];
    out += BASE64_ALPHABET[((b0 & 0x03) << 4) | ((b1 ?? 0) >> 4)];
    out += b1 === undefined ? '=' : BASE64_ALPHABET[((b1 & 0x0f) << 2) | ((b2 ?? 0) >> 6)];
    out += b2 === undefined ? '=' : BASE64_ALPHABET[b2 & 0x3f];
  }
  return out;
}
