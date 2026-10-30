import { corsHeaders, corsOptionsFromEnv } from '../cors';

describe('corsOptionsFromEnv', () => {
  it('permite cualquier origen si la variable no está definida', () => {
    expect(corsOptionsFromEnv(undefined)).toEqual({ origins: '*' });
  });

  it('permite cualquier origen si la variable está vacía', () => {
    expect(corsOptionsFromEnv('')).toEqual({ origins: '*' });
    expect(corsOptionsFromEnv('   ')).toEqual({ origins: '*' });
  });

  it('parsea una lista separada por comas y recorta los espacios', () => {
    expect(corsOptionsFromEnv('https://a.com, https://b.com')).toEqual({
      origins: ['https://a.com', 'https://b.com'],
    });
  });

  it('trata una lista de solo comas como lista vacía, no como comodín', () => {
    // Un `CORS_ORIGINS=,` mal escrito no debe abrir la API a todo el mundo.
    expect(corsOptionsFromEnv(',,')).toEqual({ origins: [] });
  });
});

describe('corsHeaders', () => {
  it('devuelve comodín sin credenciales cuando el origen es cualquiera', () => {
    const headers = corsHeaders('https://app.ejemplo.com', { origins: '*' });

    expect(headers['access-control-allow-origin']).toBe('*');
    // Mandar credenciales junto al comodín lo prohíbe el navegador y sería un
    // fallo de seguridad: la sesión va en `Authorization`, no en cookies.
    expect(headers['access-control-allow-credentials']).toBeUndefined();
  });

  it('refleja el origen y añade `Vary` cuando hay lista blanca', () => {
    const options = { origins: ['https://app.ejemplo.com'] };
    const headers = corsHeaders('https://app.ejemplo.com', options);

    expect(headers['access-control-allow-origin']).toBe('https://app.ejemplo.com');
    expect(headers.vary).toBe('Origin');
  });

  it('no autoriza un origen que no está en la lista', () => {
    const headers = corsHeaders('https://malicioso.com', { origins: ['https://app.ejemplo.com'] });

    expect(headers).toEqual({});
  });

  it('no autoriza peticiones sin cabecera `Origin` con lista blanca', () => {
    expect(corsHeaders(undefined, { origins: ['https://app.ejemplo.com'] })).toEqual({});
  });

  it('anuncia los métodos y las cabeceras que la API usa', () => {
    const headers = corsHeaders(undefined, { origins: '*' });

    expect(headers['access-control-allow-methods']).toContain('POST');
    expect(headers['access-control-allow-methods']).toContain('DELETE');
    expect(headers['access-control-allow-headers']).toContain('authorization');
    expect(headers['access-control-allow-headers']).toContain('content-type');
  });
});
