/**
 * Declaración mínima de `node:fs`, `node:path` y `pngjs` para el typecheck de
 * las pruebas de assets y de configuración de build.
 *
 * La app móvil no depende de `@types/node` (arrastraría los globales de Node al
 * bundle de React Native), así que aquí se declara solo lo que usan estas
 * pruebas, igual que hace `node-http.d.ts` con el backend de pruebas.
 */
declare const __dirname: string;

declare module 'node:fs' {
  export function readFileSync(path: string, encoding: 'utf8'): string;
  export function readFileSync(path: string): Uint8Array;
  export function writeFileSync(path: string, data: Uint8Array): void;
  export function mkdirSync(path: string, options?: { recursive?: boolean }): void;
  export function existsSync(path: string): boolean;
}

declare module 'node:path' {
  export function join(...parts: string[]): string;
  export function dirname(path: string): string;
}

declare module 'pngjs' {
  export interface PngImage {
    width: number;
    height: number;
    data: Uint8Array;
  }

  export const PNG: {
    sync: {
      read(buffer: Uint8Array): PngImage;
      write(image: PngImage): Uint8Array;
    };
  };
}
