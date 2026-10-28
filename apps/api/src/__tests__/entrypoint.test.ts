import { execFileSync, spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Prueba del punto de entrada real de la API.
 *
 * El resto de pruebas construyen el servidor con `createApiServer`, así que no
 * tocan `dist/index.js`, que es lo que ejecuta `npm start`. Ese hueco dejó pasar
 * un fallo real: `start` apuntaba a `dist/server.js`, un módulo que solo exporta
 * funciones y nunca llama a `listen`, de modo que el proceso terminaba sin
 * abrir ningún puerto. Esta prueba arranca el fichero que se publica y exige que
 * responda.
 */
describe('punto de entrada de la API', () => {
  const apiRoot = join(__dirname, '..', '..');
  const entry = (JSON.parse(readFileSync(join(apiRoot, 'package.json'), 'utf8')) as {
    main: string;
  }).main;

  it('`npm start` ejecuta un fichero que abre un puerto', async () => {
    const entryPath = join(apiRoot, entry);
    // El `postinstall` compila los workspaces; si falta, se compila aquí para
    // que la prueba no dependa del orden de ejecución.
    if (!existsSync(entryPath)) {
      execFileSync('npm', ['run', 'build'], { cwd: apiRoot, stdio: 'pipe' });
    }
    expect(existsSync(entryPath)).toBe(true);

    const port = 20000 + Math.floor(Math.random() * 10000);
    const child = spawn('node', [entryPath], {
      cwd: apiRoot,
      env: { ...process.env, PORT: String(port) },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    try {
      const health = await pollHealth(port, 8000);
      expect(health).toBe(200);
    } finally {
      child.kill('SIGTERM');
    }
  }, 20000);
});

/** Reintenta `/health` hasta que el servidor responda o se agote el tiempo. */
async function pollHealth(port: number, timeoutMs: number): Promise<number> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown = null;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      return response.status;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
  throw new Error(`La API no respondió en ${timeoutMs} ms: ${String(lastError)}`);
}
