/**
 * @jest-environment node
 */
import { LlmAnswerEvaluator } from '@socracia/core';
import { LlmHttpProvider } from '../services/llmHttpProvider';
import { startFakeApi, type FakeApi } from './helpers/fakeApi';
import { nodeFetch } from './helpers/nodeFetch';

/**
 * El proveedor del móvil habla HTTP real contra un backend en un puerto
 * efímero: se comprueba la cabecera de autorización, la traducción de estados y
 * que un fallo del servidor no lanza, sino que devuelve un `Result` que permite
 * al motor caer a su heurística.
 */
describe('LlmHttpProvider', () => {
  let api: FakeApi;

  beforeEach(async () => {
    api = await startFakeApi();
  });

  afterEach(async () => {
    delete process.env.FAKE_API_LLM;
    await api.close();
  });

  async function login(): Promise<string> {
    const response = await nodeFetch(`${api.baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'llm@ejemplo.com', password: 'contrasena-larga' }),
    });
    const body = (await response.json()) as { token: string };
    return body.token;
  }

  it('sin token devuelve no-configurado y no llama al servidor', async () => {
    const provider = new LlmHttpProvider({ baseUrl: api.baseUrl, fetchImpl: nodeFetch });
    const result = await provider.complete({
      system: 's',
      user: 'u',
      maxTokens: 10,
      temperature: 0,
      purpose: 'evaluar',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('no-configurado');
    }
  });

  it('con sesión envía el cuerpo y recibe el texto del servidor', async () => {
    const provider = new LlmHttpProvider({
      baseUrl: api.baseUrl,
      token: await login(),
      fetchImpl: nodeFetch,
    });
    const result = await provider.complete({
      system: 's',
      user: 'u',
      maxTokens: 10,
      temperature: 0,
      purpose: 'evaluar',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.text).toContain('correcta');
      expect(result.value.model).toBe('fake-1');
    }
  });

  it('el 503 del servidor se traduce a no-configurado', async () => {
    process.env.FAKE_API_LLM = 'off';
    const provider = new LlmHttpProvider({
      baseUrl: api.baseUrl,
      token: await login(),
      fetchImpl: nodeFetch,
    });
    const result = await provider.complete({
      system: 's',
      user: 'u',
      maxTokens: 10,
      temperature: 0,
      purpose: 'evaluar',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('no-configurado');
    }
  });

  it('un fallo de red no lanza: devuelve Result y el motor cae a heurística', async () => {
    const provider = new LlmHttpProvider({
      baseUrl: 'http://127.0.0.1:1',
      token: 'token-cualquiera',
      fetchImpl: nodeFetch,
    });
    const evaluator = new LlmAnswerEvaluator(provider);
    const result = await evaluator.evaluate(
      {
        id: 'q1',
        conceptId: 'c1',
        prompt: '¿Qué es la legalidad?',
        move: 'definir',
        level: 'recordar',
        expectedAnswer: 'La sujeción de la Administración a la ley.',
        keyTerms: ['legalidad'],
        citation: {
          documentId: 'd1',
          documentTitle: 'Tema 1',
          chunkId: 'd1:0',
          excerpt: 'La legalidad sujeta la actuación administrativa a la ley.',
          charStart: 0,
          charEnd: 50,
        },
        difficulty: 0.2,
      },
      { questionId: 'q1', text: 'La Administración se somete a la ley.', answeredAt: 0, latencyMs: 10 },
      [
        {
          citation: {
            documentId: 'd1',
            documentTitle: 'Tema 1',
            chunkId: 'd1:0',
            excerpt: 'La legalidad sujeta la actuación administrativa a la ley.',
            charStart: 0,
            charEnd: 50,
          },
        },
      ],
    );
    expect(result.ok).toBe(false);
  });
});
