import { startApi, testServer } from './helpers/apiHarness';

/**
 * Pruebas de integración de CORS.
 *
 * Hablan HTTP real contra un servidor en un puerto efímero. El cliente web
 * (`expo export --platform web`) vive en otro origen, así que el navegador
 * bloquea toda petición que lleve `Authorization` si el preflight no responde
 * con las cabeceras adecuadas. Antes de este arreglo el preflight devolvía 404
 * sin ninguna cabecera y el cliente web no podía llamar a la API.
 */
describe('CORS de la API', () => {
  let baseUrl: string;
  let close: () => Promise<void>;

  afterEach(async () => {
    await close();
  });

  async function start(cors?: { origins: '*' | readonly string[] }): Promise<void> {
    const { server } = testServer(cors ? { cors } : {});
    const running = await startApi(server);
    baseUrl = running.baseUrl;
    close = running.close;
  }

  it('responde al preflight con 204 y las cabeceras necesarias', async () => {
    await start();

    const response = await fetch(`${baseUrl}/sync/push`, {
      method: 'OPTIONS',
      headers: {
        origin: 'https://app.ejemplo.com',
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'authorization,content-type',
      },
    });

    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
    expect(response.headers.get('access-control-allow-methods')).toContain('POST');
    expect(response.headers.get('access-control-allow-headers')).toContain('authorization');
  });

  it('responde al preflight aunque la ruta no exista', async () => {
    // El preflight no debe depender del enrutado: se pregunta por el método,
    // no por la ruta, y un 404 aquí rompería igualmente la llamada.
    await start();

    const response = await fetch(`${baseUrl}/ruta-inexistente`, {
      method: 'OPTIONS',
      headers: { origin: 'https://app.ejemplo.com' },
    });

    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
  });

  it('añade la cabecera a la respuesta real, no solo al preflight', async () => {
    await start();

    const response = await fetch(`${baseUrl}/health`, {
      headers: { origin: 'https://app.ejemplo.com' },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
  });

  it('añade la cabecera también a las respuestas de error', async () => {
    // Sin la cabecera en el error, el navegador oculta el motivo al cliente y
    // solo se ve «error de red», que es imposible de depurar.
    await start();

    const response = await fetch(`${baseUrl}/no-existe`, {
      headers: { origin: 'https://app.ejemplo.com' },
    });

    expect(response.status).toBe(404);
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
  });

  it('limita los orígenes cuando se configura una lista blanca', async () => {
    await start({ origins: ['https://app.ejemplo.com'] });

    const permitido = await fetch(`${baseUrl}/health`, {
      headers: { origin: 'https://app.ejemplo.com' },
    });
    const ajeno = await fetch(`${baseUrl}/health`, {
      headers: { origin: 'https://malicioso.com' },
    });

    expect(permitido.headers.get('access-control-allow-origin')).toBe('https://app.ejemplo.com');
    // La petición llega al servidor, pero el navegador no entrega la respuesta
    // al origen ajeno: no se autoriza el origen.
    expect(ajeno.headers.get('access-control-allow-origin')).toBeNull();
  });
});
