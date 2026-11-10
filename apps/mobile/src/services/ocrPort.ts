import {
  bytesToBase64,
  type OcrPort,
  type OcrRequest,
  type OcrResult,
  type OcrError,
  type Result,
} from '@socracia/core';

import type { HttpSyncClient } from './httpSyncClient';

/**
 * Adaptador del puerto OCR sobre el backend de Socracia.
 *
 * El reconocimiento lo hace el servidor (que tiene la clave y el modelo
 * multimodal); la app solo envía la imagen codificada y recibe el texto. Si no
 * hay sesión, si la imagen es demasiado grande o si el servidor falla, se
 * devuelve un `Result` fallido y la importación degrada al extractor local.
 */
export interface HttpOcrPortOptions {
  /** Cliente con la sesión y la URL base del backend. */
  readonly client: HttpSyncClient;
  /** Tope de bytes de la imagen antes de codificar; por defecto, 5 MiB. */
  readonly maxBytes?: number;
}

const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;

export class HttpOcrPort implements OcrPort {
  private readonly client: HttpSyncClient;
  private readonly maxBytes: number;

  public constructor(options: HttpOcrPortOptions) {
    this.client = options.client;
    this.maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  }

  public async recognize(request: OcrRequest): Promise<Result<OcrResult, OcrError>> {
    if (request.bytes.length > this.maxBytes) {
      return {
        ok: false,
        error: {
          code: 'demasiado-grande',
          message: 'La imagen supera el tamaño máximo para reconocer texto.',
        },
      };
    }
    const mimeType = normalizeImageMime(request.mimeType, request.fileName);
    const result = await this.client.recognizeText(mimeType, bytesToBase64(request.bytes));
    if (!result.ok) {
      return { ok: false, error: { code: 'ocr-fallido', message: result.error.message } };
    }
    const text = result.value.text.trim();
    if (text.length === 0) {
      return {
        ok: false,
        error: { code: 'ocr-fallido', message: 'No se reconoció texto en la imagen.' },
      };
    }
    return { ok: true, value: { text } };
  }
}

/** Resuelve el tipo MIME de imagen, con reserva por extensión si falta. */
function normalizeImageMime(mimeType: string, fileName: string): string {
  const mime = mimeType.toLowerCase();
  if (mime.startsWith('image/')) {
    return mime === 'image/jpg' ? 'image/jpeg' : mime;
  }
  const name = fileName.toLowerCase();
  if (name.endsWith('.png')) return 'image/png';
  if (name.endsWith('.webp')) return 'image/webp';
  if (name.endsWith('.heic')) return 'image/heic';
  if (name.endsWith('.heif')) return 'image/heif';
  return 'image/jpeg';
}
