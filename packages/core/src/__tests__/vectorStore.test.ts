import { InMemoryVectorStore } from '../rag/vectorStore';
import type { EmbeddedChunk, KnowledgeChunk } from '../domain/types';

function chunk(id: string, documentId: string, text: string, ordinal = 0): KnowledgeChunk {
  return { id, documentId, text, ordinal, charStart: 0, charEnd: text.length };
}

function embedded(
  id: string,
  documentId: string,
  text: string,
  embedding: number[],
): EmbeddedChunk {
  return { chunk: chunk(id, documentId, text), embedding };
}

describe('InMemoryVectorStore', () => {
  it('empieza vacío', () => {
    const store = new InMemoryVectorStore();
    expect(store.size()).toBe(0);
    expect(store.all()).toEqual([]);
  });

  it('añade fragmentos y los cuenta', () => {
    const store = new InMemoryVectorStore();
    store.add([embedded('a', 'd1', 'texto a', [1, 0]), embedded('b', 'd1', 'texto b', [0, 1])]);
    expect(store.size()).toBe(2);
  });

  it('ordena los resultados por similitud descendente', () => {
    const store = new InMemoryVectorStore();
    store.add([embedded('a', 'd1', 'a', [1, 0]), embedded('b', 'd1', 'b', [0.9, 0.1])]);
    const hits = store.search([1, 0], 2);
    expect(hits[0]?.chunk.id).toBe('a');
  });

  it('respeta topK y el caso topK <= 0', () => {
    const store = new InMemoryVectorStore();
    store.add([embedded('a', 'd1', 'a', [1, 0]), embedded('b', 'd1', 'b', [0, 1])]);
    expect(store.search([1, 0], 1)).toHaveLength(1);
    expect(store.search([1, 0], 0)).toEqual([]);
  });

  it('elimina todos los fragmentos de un documento', () => {
    const store = new InMemoryVectorStore();
    store.add([embedded('a', 'd1', 'a', [1, 0]), embedded('b', 'd2', 'b', [0, 1])]);
    store.removeDocument('d1');
    expect(store.size()).toBe(1);
    expect(store.all()[0]?.chunk.documentId).toBe('d2');
  });
});
