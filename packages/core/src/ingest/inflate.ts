import { inflateSync, unzlibSync } from 'fflate';

import type { Inflate } from './extractors';

/**
 * Adaptador de inflate basado en `fflate`.
 *
 * `fflate` es JavaScript puro, así que funciona igual en Node (pruebas y
 * scripts) y en React Native (Hermes), sin módulos nativos. Se usa para
 * descomprimir los flujos FlateDecode de los PDF.
 *
 * El estándar PDF envuelve el flujo en zlib, pero hay generadores que emiten
 * deflate en crudo; se intenta zlib primero y se cae a raw.
 */
export const fflateInflate: Inflate = (data: Uint8Array): Uint8Array => {
  try {
    return unzlibSync(data);
  } catch {
    return inflateSync(data);
  }
};
