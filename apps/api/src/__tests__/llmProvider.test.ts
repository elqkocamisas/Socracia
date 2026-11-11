import { createLlmProvider } from '../llmProvider';
import { AuthService } from '../auth';
import { InMemoryProgressStore } from '../store';
import { createApiServer, defaultDependencies } from '../server';
import { startApi, register } from './helpers/apiHarness';

/** `fetch` falso que devuelve una compleción compatible con la API de OpenAI. */
function fakeFetch(text: string): {
  impl: typeof fetch;
  calls: Array<{ url: string; body: unknown }>;
} {
  const calls: Array<{ url: string; body: unknown }> = [];
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : null });
    return new Response(
      JSON.stringify({
        choices: [{ message: { content: text } }],
        model: 'gemini-3.6-flash',
        usage: { prompt_tokens: 1, completion_tokens: 1 },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  }) as unknown as typeof fetch;
  return { impl, calls };
}

describe('createLlmProvider', () => {
  it('devuelve null sin clave: la ruta responde 503 y la app cae a local', () => {
    expect(createLlmProvider({} as NodeJS.ProcessEnv)).toBeNull();
  });

  it('construye el proveedor con la clave y apunta al endpoint de Gemini', async () => {
    const { impl, calls } = fakeFetch('hola');
    const provider = createLlmProvider(
      { GEMINI_API_KEY: 'clave-falsa' } as NodeJS.ProcessEnv,
      impl,
    );
    expect(provider).not.toBeNull();

    const result = await provider!.complete({
      system: 's',
      user: 'u',
      purpose: 'seguimiento',
      maxTokens: 100,
      temperature: 0,
    });

    expect(result.ok).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toContain('generativelanguage.googleapis.com');
  });
});

describe('POST /llm/complete con proveedor cableado', () => {
  it('sirve la repregunta del modelo con sesión válida', async () => {
    const { impl, calls } = fakeFetch('¿Y si la norma no existiera?');
    const server = createApiServer({
      auth: new AuthService(),
      store: new InMemoryProgressStore(),
      llm: createLlmProvider({ GEMINI_API_KEY: 'clave-falsa' } as NodeJS.ProcessEnv, impl),
    });
    const api = await startApi(server);
    try {
      const { token } = await register(api.baseUrl, 'llm-provider@ejemplo.com');
      const response = await fetch(`${api.baseUrl}/llm/complete`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({
          system: 'repregunta',
          user: 'respuesta del alumno',
          purpose: 'seguimiento',
          maxTokens: 220,
          temperature: 0.3,
        }),
      });
      expect(response.status).toBe(200);
      const payload = (await response.json()) as { text: string };
      expect(payload.text).toContain('norma');
      expect(calls).toHaveLength(1);
    } finally {
      await api.close();
    }
  });
});

describe('defaultDependencies', () => {
  it('no deja la ruta de lenguaje en null cuando hay clave', () => {
    const previous = process.env.GEMINI_API_KEY;
    process.env.GEMINI_API_KEY = 'clave-falsa';
    try {
      expect(defaultDependencies().llm).not.toBeNull();
    } finally {
      if (previous === undefined) {
        delete process.env.GEMINI_API_KEY;
      } else {
        process.env.GEMINI_API_KEY = previous;
      }
    }
  });
});
