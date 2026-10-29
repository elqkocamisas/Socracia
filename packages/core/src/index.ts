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
export * from './rag/delegatingProvider';
export * from './rag/fallbackProvider';
export * from './rag/edgeLlm';
export * from './rag/vectorStore';
export * from './rag/engine';
export * from './ingest/conceptExtractor';
export * from './ingest/extractors';
export * from './ingest/ingestionService';
export * from './ingest/inflate';
export * from './mayeu/cognitive';
export * from './mayeu/questionGenerator';
export * from './mayeu/questionQuality';
export * from './mayeu/evaluate';
export * from './mayeu/gaps';
export * from './mayeu/itinerary';
export * from './mayeu/scaffolding';
export * from './mayeu/session';
export * from './storage/ports';
export * from './storage/inMemory';
export * from './sync/contracts';
export * from './sync/merge';
export * from './sync/syncService';
export * from './app/progressService';
export * from './app/sessionController';
export * from './app/studyService';
