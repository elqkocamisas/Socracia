/**
 * @socracia/core — dominio agnóstico de plataforma de la app mayéutica.
 *
 * Sin dependencias de React Native ni de módulos nativos: toda la lógica de
 * negocio crítica (RAG, generación de preguntas, evaluación, lagunas y repaso
 * espaciado) se prueba aquí con Jest en Node.
 */
export * from './result';
export * from './math/vector';
export * from './domain/types';
export * from './rag/chunking';
export * from './rag/embeddings';
export * from './rag/vectorStore';
export * from './rag/engine';
export * from './mayeu/questionGenerator';
export * from './mayeu/evaluate';
export * from './mayeu/gaps';
