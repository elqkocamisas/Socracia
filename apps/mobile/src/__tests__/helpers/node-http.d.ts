/**
 * Declaración mínima de `node:http` y `node:net` para el typecheck de las pruebas.
 *
 * La app móvil no depende de `@types/node` (arrastraría los globales de Node al
 * bundle de React Native), así que este helper declara solo la superficie que
 * usan el backend de pruebas y el `fetch` sobre `node:http`.
 */
declare module 'node:net' {
  export interface AddressInfo {
    address: string;
    family: string;
    port: number;
  }
}

declare module 'node:http' {
  import type { AddressInfo } from 'node:net';

  export interface IncomingMessage {
    url?: string;
    method?: string;
    headers: Record<string, string | undefined>;
    [Symbol.asyncIterator](): AsyncIterator<Uint8Array>;
  }

  export interface ServerResponse {
    writeHead(status: number, headers?: Record<string, string | number>): void;
    end(body?: string): void;
  }

  export interface Server {
    listen(port: number, callback?: () => void): Server;
    address(): AddressInfo | string | null;
    close(callback?: (error?: Error) => void): Server;
  }

  export interface ClientRequest {
    on(event: 'error', listener: (error: Error) => void): ClientRequest;
    write(chunk: string): void;
    end(): void;
  }

  export interface ClientResponse {
    statusCode?: number;
    headers: Record<string, string | string[] | undefined>;
    on(event: 'data', listener: (chunk: Uint8Array) => void): ClientResponse;
    on(event: 'end', listener: () => void): ClientResponse;
  }

  export interface RequestOptions {
    hostname: string;
    port?: string;
    path?: string;
    method?: string;
    headers?: Record<string, string>;
  }

  export function createServer(
    handler: (req: IncomingMessage, res: ServerResponse) => void,
  ): Server;
  export function request(
    options: RequestOptions,
    callback: (res: ClientResponse) => void,
  ): ClientRequest;
}
