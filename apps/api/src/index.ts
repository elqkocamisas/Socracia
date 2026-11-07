import { createApiServer, defaultDependencies } from './server';
import { corsOptionsFromEnv } from './cors';
import { JsonFileProgressStore } from './store';
import { AuthService } from './auth';

/**
 * Punto de entrada del backend mínimo.
 *
 * Variables de entorno:
 * - `PORT`            — puerto de escucha (por defecto 8787).
 * - `DATA_FILE`       — ruta del JSON de progreso; si se omite, todo vive en memoria.
 * - `GEMINI_API_KEY` — credencial de Gemini API (solo servidor).
 * - `GEMINI_MODEL`   — modelo compatible principal; por defecto `gemini-3.6-flash`.
 * - `GEMINI_MODELS`  — modelos de respaldo separados por comas; se usan si el
 *                      principal agota cuota o no está disponible.
 * - `CORS_ORIGINS`   — orígenes autorizados para el cliente web, separados por
 *                      comas; sin ella se permite cualquiera.
 */
const port = Number(process.env.PORT ?? 8787);
const dataFile = process.env.DATA_FILE;
const defaults = defaultDependencies();

const server = createApiServer({
  ...defaults,
  auth: new AuthService(),
  store: dataFile ? new JsonFileProgressStore(dataFile) : defaults.store,
  cors: corsOptionsFromEnv(process.env.CORS_ORIGINS),
});

server.listen(port, () => {
  console.warn(
    `Socracia API escuchando en http://localhost:${port} (${dataFile ? `datos en ${dataFile}` : 'datos en memoria'})`,
  );
});
