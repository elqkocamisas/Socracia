import { createApiServer, defaultDependencies } from './server';
import { JsonFileProgressStore } from './store';
import { AuthService } from './auth';

/**
 * Punto de entrada del backend mínimo.
 *
 * Variables de entorno:
 * - `PORT`      — puerto de escucha (por defecto 8787).
 * - `DATA_FILE` — ruta del JSON de progreso; si se omite, todo vive en memoria.
 */
const port = Number(process.env.PORT ?? 8787);
const dataFile = process.env.DATA_FILE;

const server = createApiServer({
  auth: new AuthService(),
  store: dataFile ? new JsonFileProgressStore(dataFile) : defaultDependencies().store,
});

server.listen(port, () => {
  console.warn(
    `Socracia API escuchando en http://localhost:${port} (${dataFile ? `datos en ${dataFile}` : 'datos en memoria'})`,
  );
});
