import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

import { AuthService } from '../auth';
import { InMemoryProgressStore } from '../store';
import { createApiServer } from '../server';
import type { MayeuticOcrService, OcrInput, OcrOutcome } from '../ocr';

/**
 * La ruta `/mayeutic/ocr` se prueba contra HTTP real, como el resto de la API.
 * El proveedor de OCR se inyecta: así se comprueba el contrato (sesión, 503 sin
 * proveedor, validación del cuerpo) sin llamar a Gemini ni gastar cuota.
 */
class FakeOcr implements MayeuticOcrService {
  public readonly configured = true;
  public lastInput: OcrInput | null = null;
  public constructor(private readonly outcome: OcrOutcome) {}
  public async recognize(input: OcrInput): Promise<OcrOutcome> {
    this.lastInput = input;
    return this.outcome;
  }
}

async function startServer(ocr: MayeuticOcrService | null): Promise<{
  baseUrl: string;
  close: () => Promise<void>;
}> {
  const server: Server = createApiServer({
    auth: new AuthService(),
    store: new InMemoryProgressStore(),
    ...(ocr ? { ocr } : {}),
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

async function register(baseUrl: string): Promise<string> {
  const response = await fetch(`${baseUrl}/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'ocr@ejemplo.com', password: 'contrasena-larga' }),
  });
  return ((await response.json()) as { token: string }).token;
}

describe('POST /mayeutic/ocr', () => {
  it('sin sesión devuelve 401', async () => {
    const api = await startServer(new FakeOcr({ ok: true, text: 'hola' }));
    try {
      const response = await fetch(`${api.baseUrl}/mayeutic/ocr`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mimeType: 'image/png', imageBase64: 'AAAA' }),
      });
      expect(response.status).toBe(401);
    } finally {
      await api.close();
    }
  });

  it('sin proveedor devuelve 503 y la app degrada', async () => {
    const api = await startServer(null);
    try {
      const token = await register(api.baseUrl);
      const response = await fetch(`${api.baseUrl}/mayeutic/ocr`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ mimeType: 'image/png', imageBase64: 'AAAA' }),
      });
      expect(response.status).toBe(503);
      expect((await response.json()) as { error: string }).toMatchObject({
        error: 'ocr-no-configurado',
      });
    } finally {
      await api.close();
    }
  });

  it('con sesión y proveedor devuelve el texto reconocido', async () => {
    const ocr = new FakeOcr({ ok: true, text: 'Tema 1. La notificación' });
    const api = await startServer(ocr);
    try {
      const token = await register(api.baseUrl);
      const response = await fetch(`${api.baseUrl}/mayeutic/ocr`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ mimeType: 'image/png', imageBase64: 'AAAA' }),
      });
      expect(response.status).toBe(200);
      expect((await response.json()) as { text: string }).toEqual({
        text: 'Tema 1. La notificación',
      });
      expect(ocr.lastInput).toEqual({ mimeType: 'image/png', imageBase64: 'AAAA' });
    } finally {
      await api.close();
    }
  });

  it('rechaza un cuerpo sin tipo de imagen con 400', async () => {
    const api = await startServer(new FakeOcr({ ok: true, text: 'x' }));
    try {
      const token = await register(api.baseUrl);
      const response = await fetch(`${api.baseUrl}/mayeutic/ocr`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ mimeType: 'application/pdf', imageBase64: 'AAAA' }),
      });
      expect(response.status).toBe(400);
    } finally {
      await api.close();
    }
  });

  it('traduce un fallo del proveedor a 502', async () => {
    const api = await startServer(new FakeOcr({ ok: false, message: 'cuota agotada' }));
    try {
      const token = await register(api.baseUrl);
      const response = await fetch(`${api.baseUrl}/mayeutic/ocr`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ mimeType: 'image/png', imageBase64: 'AAAA' }),
      });
      expect(response.status).toBe(502);
    } finally {
      await api.close();
    }
  });

  it('/health declara el estado del OCR sin revelar secretos', async () => {
    const api = await startServer(new FakeOcr({ ok: true, text: 'x' }));
    try {
      const response = await fetch(`${api.baseUrl}/health`);
      const body = (await response.json()) as { ocr?: { configured: boolean } };
      expect(body.ocr).toEqual({ configured: true });
    } finally {
      await api.close();
    }
  });
});
