import { request } from 'node:http';

/**
 * `fetch` mínimo sobre `node:http`, para pruebas.
 *
 * `jest-expo` sustituye el `fetch` global por su polyfill de React Native, que
 * no realiza peticiones HTTP reales en Node. Se inyecta esta implementación en
 * el cliente para poder probar la traducción de respuestas y errores contra un
 * servidor HTTP de verdad, que es lo que importa verificar.
 */
export const nodeFetch: typeof fetch = (input, init) => {
  const url = new URL(typeof input === 'string' ? input : String(input));
  const method = init?.method ?? 'GET';
  const headers = (init?.headers ?? {}) as Record<string, string>;
  const body = typeof init?.body === 'string' ? init.body : undefined;

  return new Promise((resolve, reject) => {
    const req = request(
      {
        hostname: url.hostname,
        port: url.port,
        path: `${url.pathname}${url.search}`,
        method,
        headers,
      },
      (res) => {
        const decoder = new TextDecoder();
        let text = '';
        res.on('data', (chunk) => {
          text += decoder.decode(chunk, { stream: true });
        });
        res.on('end', () => {
          text += decoder.decode();
          resolve(
            new Response(text, {
              status: res.statusCode ?? 200,
              headers: {
                'content-type': String(res.headers['content-type'] ?? 'application/json'),
              },
            }),
          );
        });
      },
    );
    req.on('error', reject);
    if (body) {
      req.write(body);
    }
    req.end();
  });
};
