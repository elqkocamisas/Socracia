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
