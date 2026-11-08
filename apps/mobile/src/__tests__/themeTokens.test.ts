import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guardián de la regla «ningún color literal fuera de los tokens».
 *
 * La paleta clara y oscura solo tiene sentido si las pantallas consumen tokens:
 * un `#RRGGBB` escrito a mano en una pantalla se saltaría el tema y se vería
 * igual en claro y en oscuro. Esta prueba recorre el código de la app y falla
 * si encuentra un color literal fuera de `theme/tokens.ts`.
 */
const SRC = join(__dirname, '..');
const MOBILE_ROOT = join(SRC, '..');
const ALLOWED = new Set(['theme/tokens.ts']);

function walk(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === '__tests__' || entry === 'node_modules') {
        continue;
      }
      files.push(...walk(full));
    } else if (entry.endsWith('.ts') || entry.endsWith('.tsx')) {
      files.push(full);
    }
  }
  return files;
}

describe('Tokens de color', () => {
  it('ningún fichero fuera de tokens.ts contiene un color hexadecimal literal', () => {
    const offenders: string[] = [];
    for (const file of walk(SRC)) {
      const relative = file.slice(SRC.length + 1);
      if (ALLOWED.has(relative)) {
        continue;
      }
      const contents = readFileSync(file, 'utf8');
      // Se ignoran los comentarios y los `rgba()`/nombres de color de sombra,
      // que no forman parte de la paleta temática.
      const withoutComments = contents.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      if (/#[0-9A-Fa-f]{3,8}\b/.test(withoutComments)) {
        offenders.push(relative);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('tampoco la raíz del móvil (App.tsx) contiene colores literales', () => {
    const entry = join(MOBILE_ROOT, 'App.tsx');
    const contents = readFileSync(entry, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    expect(/#[0-9A-Fa-f]{3,8}\b/.test(contents)).toBe(false);
  });
});
