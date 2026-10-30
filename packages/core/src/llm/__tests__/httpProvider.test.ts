import { OpenAiCompatProvider } from '../httpProvider';
import type { LlmCompletionRequest } from '../types';

const request: LlmCompletionRequest = {
  system: 'Eres un maestro socrático.',
  user: '¿Qué es la legalidad?',
  maxTokens: 128,
  temperature: 0,
  purpose: 'evaluar',
};

/** `fetch` falso que devuelve una respuesta JSON con el estado indicado. */
function fakeFetch(
  status: number,
  body: unknown,
): { fetchImpl: typeof fetch; calls: { url: string; init?: RequestInit }[] } {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;
  return { fetchImpl, calls };
}

describe('OpenAiCompatProvider', () => {
  it('envía instrucciones y datos como mensajes separados', async () => {
    const { fetchImpl, calls } = fakeFetch(200, {
      choices: [{ message: { content: '{"verdict":"correcta"}' } }],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    });
    const provider = new OpenAiCompatProvider({
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'secreta',
      model: 'modelo-x',
      fetchImpl,
    });

    const result = await provider.complete(request);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.text).toBe('{"verdict":"correcta"}');
      expect(result.value.usage.promptTokens).toBe(10);
    }
    const sent = JSON.parse(String(calls[0]?.init?.body)) as {
      messages: { role: string; content: string }[];
    };
    expect(sent.messages[0]).toEqual({ role: 'system', content: request.system });
    expect(sent.messages[1]).toEqual({ role: 'user', content: request.user });
  });

  it('traduce el 429 a error de cuota', async () => {
    const { fetchImpl } = fakeFetch(429, {});
    const provider = new OpenAiCompatProvider({
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'secreta',
      model: 'modelo-x',
      fetchImpl,
    });
    const result = await provider.complete(request);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('cuota');
    }
  });

  it('traduce el 401 a no-configurado, sin filtrar la clave', async () => {
    const { fetchImpl } = fakeFetch(401, {});
    const provider = new OpenAiCompatProvider({
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'clave-secreta-123',
      model: 'modelo-x',
      fetchImpl,
    });
    const result = await provider.complete(request);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('no-configurado');
      expect(result.error.message).not.toContain('clave-secreta-123');
    }
  });

  it('degradación a error de red si `fetch` lanza', async () => {
    const fetchImpl = (async () => {
      throw new Error('sin red');
    }) as unknown as typeof fetch;
    const provider = new OpenAiCompatProvider({
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'x',
      model: 'modelo-x',
      fetchImpl,
    });
    const result = await provider.complete(request);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('red');
    }
  });

  it('rechaza una respuesta sin contenido de texto', async () => {
    const { fetchImpl } = fakeFetch(200, { choices: [] });
    const provider = new OpenAiCompatProvider({
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'x',
      model: 'modelo-x',
      fetchImpl,
    });
    const result = await provider.complete(request);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('respuesta-invalida');
    }
  });
});
