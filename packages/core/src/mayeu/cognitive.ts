import type { CognitiveLevel } from '../domain/types';

/**
 * Orden de los niveles cognitivos, de menor a mayor exigencia.
 *
 * Se inspira en la taxonomía de Bloom simplificada: recordar y comprender son
 * asimilación; aplicar, analizar y evaluar son transferencia. El orden es el
 * eje sobre el que se construye la progresión del itinerario mayéutico.
 */
export const COGNITIVE_ORDER: readonly CognitiveLevel[] = [
  'recordar',
  'comprender',
  'aplicar',
  'analizar',
  'evaluar',
];

/** Posición del nivel en la escala (0 = más básico). */
export function levelRank(level: CognitiveLevel): number {
  const index = COGNITIVE_ORDER.indexOf(level);
  return index === -1 ? 0 : index;
}

/** `true` si `level` exige al menos tanto como `min`. */
export function isAtLeast(level: CognitiveLevel, min: CognitiveLevel): boolean {
  return levelRank(level) >= levelRank(min);
}
