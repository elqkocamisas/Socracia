/**
 * CORS del backend.
 *
 * El móvil nativo no lo necesita: `fetch` desde iOS o Android no aplica la
 * política de origen. Pero la app también se compila para **web** (`expo export
 * --platform web`), y ahí el navegador sí la aplica: sin estas cabeceras, el
 * servicio web no puede llamar a la API y toda petición con `Authorization`
 * muere en el preflight.
 *
 * El valor por defecto (`*`) es deliberado. La API no usa cookies —la sesión va
 * en la cabecera `Authorization`—, así que el navegador no adjunta credenciales
 * por sí solo y una página ajena no puede leer la respuesta autenticada de nadie:
 * tendría que poseer ya el token. Con `*` no se manda `Allow-Credentials`, que es
 * justo la combinación que el navegador prohíbe.
 *
 * Para restringirlo, defina `CORS_ORIGINS` con una lista separada por comas.
 */

/** Cabeceras que la API necesita leer del cliente. */
const ALLOWED_HEADERS = 'content-type, authorization';
const ALLOWED_METHODS = 'GET, POST, DELETE, OPTIONS';
/** Tiempo que el navegador puede cachear el resultado del preflight. */
const MAX_AGE_SECONDS = '600';

export interface CorsOptions {
  /**
   * Orígenes permitidos. `'*'` (por defecto) acepta cualquiera; una lista
   * acepta solo los que coincidan exactamente.
   */
  readonly origins: '*' | readonly string[];
}

/**
 * Lee `CORS_ORIGINS` del entorno.
 *
 * Sin la variable se permite cualquier origen. Con ella, la lista separada por
 * comas se convierte en una lista blanca; una cadena vacía equivale a no
 * permitir ninguno, que es el comportamiento útil para cerrar la API del todo.
 */
export function corsOptionsFromEnv(value: string | undefined): CorsOptions {
  if (value === undefined || value.trim() === '') {
    return { origins: '*' };
  }
  const origins = value
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin !== '');
  return { origins: origins.length === 0 ? [] : origins };
}

/**
 * Resuelve el `Access-Control-Allow-Origin` para una petición.
 *
 * Devuelve `null` si el origen no está permitido, y entonces no se añade
 * ninguna cabecera CORS: la petición llega al servidor, pero el navegador se
 * niega a entregar la respuesta a la página, que es el efecto buscado.
 */
function allowedOrigin(requestOrigin: string | undefined, options: CorsOptions): string | null {
  if (options.origins === '*') {
    return '*';
  }
  if (requestOrigin === undefined) {
    return null;
  }
  return options.origins.includes(requestOrigin) ? requestOrigin : null;
}

/**
 * Cabeceras CORS que corresponden a una petición.
 *
 * Se aplican a todas las respuestas, no solo al preflight: el navegador exige
 * `Access-Control-Allow-Origin` también en la respuesta real, no solo en el
 * `OPTIONS` previo.
 */
export function corsHeaders(
  requestOrigin: string | undefined,
  options: CorsOptions,
): Record<string, string> {
  const origin = allowedOrigin(requestOrigin, options);
  if (origin === null) {
    return {};
  }
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': ALLOWED_METHODS,
    'access-control-allow-headers': ALLOWED_HEADERS,
    'access-control-max-age': MAX_AGE_SECONDS,
    // El recurso cambia según el origen permitido: sin esto un intermediario
    // podría servir la respuesta de un origen a otro.
    vary: 'Origin',
  };
}
