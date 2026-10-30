/**
 * Declaraciones mínimas de Node para la prueba del empaquetador de entrega.
 *
 * La app móvil no depende de `@types/node` (arrastraría los globales de Node al
 * bundle de React Native), así que se declara aquí solo lo que usa
 * `packageRelease.test.ts`, igual que `node-fs.d.ts` hace con el resto.
 */

declare module 'node:child_process' {
  export function execFileSync(
    file: string,
    args: readonly string[],
    options: { cwd?: string; encoding?: 'utf8'; stdio?: string | readonly string[] },
  ): string;
}

declare module 'node:os' {
  export function tmpdir(): string;
}
