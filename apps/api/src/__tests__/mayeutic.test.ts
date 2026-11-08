import { GeminiMayeuticService } from '../mayeutic';

const questionDraft = {
  prompt: '¿Cómo aplicarías este principio a un caso diferente?',
  move: 'aplicar-caso',
  level: 'aplicar',
  expectedAnswer: 'La respuesta debe justificar la aplicación desde la fuente.',
  keyTerms: ['principio'],
  difficulty: 0.7,
};

function providerResponse(content: unknown): Response {
  return new Response(
    JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }] }),
    { status: 200 },
  );
}

describe('GeminiMayeuticService', () => {
  it('envía una instrucción estructurada y valida las preguntas generadas', async () => {
    let request: RequestInit | undefined;
    let requestUrl = '';
    const service = new GeminiMayeuticService('test-key', 'gemini-test', async (input, init) => {
      requestUrl = String(input);
      request = init;
      return providerResponse({ questions: [questionDraft] });
    });

    const result = await service.generateQuestions(
      {
        id: 'c1',
        topicId: 't1',
        label: 'principio',
        definition: 'Fundamento de una regla.',
        keywords: ['principio'],
      },
      {
        documentId: 'd1',
        documentTitle: 'Tema 1',
        chunkId: 'd1:0',
        excerpt: 'El principio sirve de fundamento.',
        charStart: 0,
        charEnd: 34,
      },
      1,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual([questionDraft]);
    }
    expect(request?.headers).toMatchObject({ authorization: 'Bearer test-key' });
    expect(requestUrl).toBe(
      'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    );
    expect(String(request?.body)).toContain('"model":"gemini-test"');
    expect(String(request?.body)).toContain('no confiable');
  });

  it('rechaza preguntas triviales o con formato incorrecto', async () => {
    const service = new GeminiMayeuticService('test-key', 'gemini-test', async () =>
      providerResponse({ questions: [{ ...questionDraft, level: 'recordar' }] }),
    );
    const result = await service.generateQuestions(
      {
        id: 'c1',
        topicId: 't1',
        label: 'principio',
        definition: 'Fundamento de una regla.',
        keywords: [],
      },
      {
        documentId: 'd1',
        documentTitle: 'Tema 1',
        chunkId: 'd1:0',
        excerpt: 'El principio sirve de fundamento.',
        charStart: 0,
        charEnd: 34,
      },
      1,
    );

    expect(result.ok).toBe(false);
  });

  it('acepta un array suelto y descarta solo la pregunta mal formada', async () => {
    // Algunos modelos gratuitos devuelven `[...]` en vez de `{questions:[...]}`.
    // Una pregunta inválida no debe tumbar el lote entero.
    const service = new GeminiMayeuticService('test-key', 'gemini-test', async () =>
      providerResponse([questionDraft, { prompt: 'corta', move: 'inventado' }]),
    );

    const result = await service.generateQuestions(
      {
        id: 'c1',
        topicId: 't1',
        label: 'principio',
        definition: 'Fundamento de una regla.',
        keywords: ['principio'],
      },
      {
        documentId: 'd1',
        documentTitle: 'Tema 1',
        chunkId: 'd1:0',
        excerpt: 'El principio sirve de fundamento.',
        charStart: 0,
        charEnd: 34,
      },
      2,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual([questionDraft]);
    }
  });

  it('evalúa paráfrasis y valida la puntuación y los términos devueltos', async () => {
    const service = new GeminiMayeuticService('test-key', 'gemini-test', async () =>
      providerResponse({
        score: 0.91,
        matchedKeyTerms: ['principio'],
        feedback: 'La paráfrasis conserva el sentido de la fuente.',
      }),
    );
    const result = await service.evaluateAnswer(
      {
        id: 'c1:q0',
        conceptId: 'c1',
        prompt: '¿Qué significa aplicar este principio?',
        move: 'aplicar-caso',
        level: 'aplicar',
        expectedAnswer: 'Una respuesta fundamentada en el fragmento.',
        keyTerms: ['principio'],
        citation: {
          documentId: 'd1',
          documentTitle: 'Tema 1',
          chunkId: 'd1:0',
          excerpt: 'El principio sirve de fundamento.',
          charStart: 0,
          charEnd: 34,
        },
        difficulty: 0.7,
      },
      {
        questionId: 'c1:q0',
        text: 'Una explicación equivalente con palabras diferentes.',
        answeredAt: 1,
        latencyMs: 1_000,
      },
    );

    expect(result).toEqual({
      ok: true,
      value: {
        score: 0.91,
        matchedKeyTerms: ['principio'],
        feedback: 'La paráfrasis conserva el sentido de la fuente.',
      },
    });
  });

  it('propaga el motivo cuando el proveedor devuelve el error en un array (OpenAI)', async () => {
    // El endpoint OpenAI-compatible envuelve el error en `[{ error: {...} }]`;
    // si no se desenvuelve, el motivo —y la pista de reintento— se pierde.
    const service = new GeminiMayeuticService(
      'test-key',
      'gemini-test',
      async () =>
        new Response(
          JSON.stringify([
            { error: { code: 429, message: 'Quota exceeded; please retry in 11.4s.' } },
          ]),
          { status: 429 },
        ),
    );

    const result = await service.generateQuestions(
      {
        id: 'c1',
        topicId: 't1',
        label: 'principio',
        definition: 'Fundamento de una regla.',
        keywords: ['principio'],
      },
      {
        documentId: 'd1',
        documentTitle: 'Tema 1',
        chunkId: 'd1:0',
        excerpt: 'El principio sirve de fundamento.',
        charStart: 0,
        charEnd: 34,
      },
      1,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('429');
      expect(result.error.message).toContain('retry in 11.4s');
    }
  });

  it('rota al siguiente modelo gratuito si el principal agota su cuota', async () => {
    // El nivel gratuito limita por modelo; si el principal devuelve 429, el
    // servicio debe reintentar con el respaldo en vez de fallar la sesión.
    const seen: string[] = [];
    const service = new GeminiMayeuticService(
      'test-key',
      'gemini-primary',
      async (_input, init) => {
        const body = JSON.parse(String(init?.body));
        seen.push(body.model);
        if (body.model === 'gemini-primary') {
          return new Response(
            JSON.stringify([{ error: { code: 429, message: 'Quota exceeded.' } }]),
            { status: 429 },
          );
        }
        return providerResponse({ questions: [questionDraft] });
      },
    );

    const result = await service.generateQuestions(
      {
        id: 'c1',
        topicId: 't1',
        label: 'principio',
        definition: 'Fundamento de una regla.',
        keywords: ['principio'],
      },
      {
        documentId: 'd1',
        documentTitle: 'Tema 1',
        chunkId: 'd1:0',
        excerpt: 'El principio sirve de fundamento.',
        charStart: 0,
        charEnd: 34,
      },
      1,
    );

    expect(result.ok).toBe(true);
    expect(seen).toEqual(['gemini-primary', 'gemini-3.5-flash-lite']);
  });

  it('no cambia de modelo ante un error de datos (no recuperable)', async () => {
    const seen: string[] = [];
    const service = new GeminiMayeuticService(
      'test-key',
      'gemini-primary',
      async (_input, init) => {
        seen.push(JSON.parse(String(init?.body)).model);
        return new Response(JSON.stringify({ error: { message: 'modelo inexistente' } }), {
          status: 404,
        });
      },
    );

    const result = await service.generateQuestions(
      {
        id: 'c1',
        topicId: 't1',
        label: 'principio',
        definition: 'Fundamento de una regla.',
        keywords: ['principio'],
      },
      {
        documentId: 'd1',
        documentTitle: 'Tema 1',
        chunkId: 'd1:0',
        excerpt: 'El principio sirve de fundamento.',
        charStart: 0,
        charEnd: 34,
      },
      1,
    );

    expect(result.ok).toBe(false);
    expect(seen).toEqual(['gemini-primary']);
  });

  it('no intenta conectar si no hay una clave configurada', async () => {
    const service = new GeminiMayeuticService(undefined, 'gemini-test', async () => {
      throw new Error('No debe llegar a la red');
    });
    const result = await service.evaluateAnswer(
      {
        id: 'c1:q0',
        conceptId: 'c1',
        prompt: '¿Qué significa?',
        move: 'causa',
        level: 'comprender',
        expectedAnswer: 'Una respuesta.',
        keyTerms: ['principio'],
        citation: {
          documentId: 'd1',
          documentTitle: 'Tema 1',
          chunkId: 'd1:0',
          excerpt: 'El principio sirve de fundamento.',
          charStart: 0,
          charEnd: 34,
        },
        difficulty: 0.4,
      },
      { questionId: 'c1:q0', text: 'Una respuesta', answeredAt: 1, latencyMs: 1 },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('no está configurado');
    }
  });
});
