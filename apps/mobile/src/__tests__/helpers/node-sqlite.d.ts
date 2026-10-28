/**
 * Declaración mínima de `node:sqlite` para el typecheck de las pruebas.
 *
 * La app móvil no depende de `@types/node`, así que este helper de pruebas
 * declara solo la superficie que usa el adaptador de `node:sqlite`.
 */
declare module 'node:sqlite' {
  export interface StatementSync {
    run(...params: unknown[]): { changes: number | bigint };
    all(...params: unknown[]): unknown[];
    get(...params: unknown[]): unknown;
  }

  export class DatabaseSync {
    constructor(path: string);
    exec(source: string): void;
    prepare(source: string): StatementSync;
    close(): void;
  }
}
