/**
 * @jest-environment node
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  parseCommitMessage,
  validateCommitMessage,
} from '../../../../scripts/lib/commit-convention.cjs';

const ROOT = join(__dirname, '..', '..', '..', '..');

/**
 * La convención de commits solo sirve si se cumple de verdad. Estas pruebas
 * fijan las reglas de `CONTRIBUTING.md` y comprueban además que el CLI detecta
 * los mismos fallos, porque es lo que se ejecutará antes de cada PR.
 */
describe('convención de commits', () => {
  it('acepta un mensaje completo conforme', () => {
    const result = validateCommitMessage(
      [
        'fix(api): arrancar desde dist/index.js, no dist/server.js',
        '',
        'El script ejecutaba un módulo que nunca llama a `listen`.',
        '',
        'Sprint: 5',
      ].join('\n'),
    );

    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.parsed.type).toBe('fix');
    expect(result.parsed.scope).toBe('api');
    expect(result.parsed.sprint).toBe(5);
  });

  it('rechaza un asunto que no sigue la convención', () => {
    const result = validateCommitMessage('arreglos varios');
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toContain('no sigue');
  });

  it('rechaza tipos desconocidos', () => {
    const result = validateCommitMessage('arreglo(api): algo');
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toContain('Tipo desconocido');
  });

  it('rechaza asuntos genéricos aunque el formato sea correcto', () => {
    const result = validateCommitMessage('chore: cambios varios');
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toContain('no describe el cambio');
  });

  it('rechaza descripción en mayúscula y con punto final', () => {
    const mayuscula = validateCommitMessage('feat(core): Añadir algo');
    expect(mayuscula.ok).toBe(false);
    expect(mayuscula.errors.join(' ')).toContain('minúscula');

    const punto = validateCommitMessage('feat(core): añadir algo.');
    expect(punto.ok).toBe(false);
    expect(punto.errors.join(' ')).toContain('punto');
  });

  it('rechaza asuntos de más de 72 caracteres', () => {
    const result = validateCommitMessage(`feat(core): ${'a'.repeat(70)}`);
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toContain('máximo es 72');
  });

  it('exige la línea en blanco entre asunto y cuerpo', () => {
    const result = validateCommitMessage('feat(core): añadir algo\ncuerpo pegado');
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toContain('línea en blanco');
  });

  it('rechaza líneas de cuerpo de más de 100 caracteres', () => {
    const result = validateCommitMessage(
      ['feat(core): añadir algo', '', 'x'.repeat(101)].join('\n'),
    );
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toContain('más de 100 caracteres');
  });

  it('tolera URLs largas en el cuerpo', () => {
    const result = validateCommitMessage(
      ['docs(rag): documentar el proveedor', '', `Ver https://ejemplo.com/${'x'.repeat(120)}`].join(
        '\n',
      ),
    );
    expect(result.ok).toBe(true);
  });

  it('acepta el estilo histórico con una advertencia, no un error', () => {
    const result = validateCommitMessage('Sprint 3: persistir los fragmentos en SQLite');
    expect(result.ok).toBe(true);
    expect(result.warnings.join(' ')).toContain('estilo histórico');
    expect(result.parsed.legacy).toBe(true);
  });

  it('ignora los commits de fusión que escribe Git', () => {
    const result = validateCommitMessage("Merge branch 'main' into sprint-5");
    expect(result.ok).toBe(true);
    expect(result.parsed.merge).toBe(true);
  });

  it('detecta cambios rupturistas con «!»', () => {
    const result = validateCommitMessage('feat(core)!: cambiar la forma de las instantáneas');
    expect(result.ok).toBe(true);
    expect(result.parsed.breaking).toBe(true);
  });

  it('parsea asunto, cuerpo y pie por separado', () => {
    const parsed = parseCommitMessage(
      ['feat(sync): fusionar por updatedAt', '', 'Cuerpo.', '', 'Sprint: 4', 'Refs #12'].join('\n'),
    );
    expect(parsed.subject).toBe('feat(sync): fusionar por updatedAt');
    expect(parsed.body).toBe('Cuerpo.');
    expect(parsed.footers).toEqual(['Sprint: 4', 'Refs #12']);
    expect(parsed.sprint).toBe(4);
  });

  it('el CLI valida un mensaje suelto y falla con el formato incorrecto', () => {
    const script = join(ROOT, 'scripts', 'check-commits.mjs');

    const bueno = join(ROOT, 'dist', 'commit-bueno.txt');
    const malo = join(ROOT, 'dist', 'commit-malo.txt');
    // `dist/` está en .gitignore y en los directorios excluidos del empaquetado,
    // así que sirve de zona temporal sin ensuciar el repositorio.
    mkdirSync(join(ROOT, 'dist'), { recursive: true });
    writeFileSync(bueno, 'docs(core): documentar el motor mayéutico\n');
    writeFileSync(malo, 'cambios varios\n');

    try {
      expect(() =>
        execFileSync('node', [script, '--message-file', bueno], { cwd: ROOT, stdio: 'pipe' }),
      ).not.toThrow();

      let failed = false;
      try {
        execFileSync('node', [script, '--message-file', malo], { cwd: ROOT, stdio: 'pipe' });
      } catch {
        failed = true;
      }
      expect(failed).toBe(true);
    } finally {
      rmSync(bueno, { force: true });
      rmSync(malo, { force: true });
    }
  });

  it('el CLI acepta el historial del proyecto sin errores', () => {
    // `--all` es una auditoría del historial ya fusionado: los incumplimientos
    // se informan como advertencias pero nunca bloquean, porque el historial
    // publicado no se reescribe. El modo estricto son los rangos y los mensajes
    // sueltos, que sí fallan.
    const output = execFileSync('node', [join(ROOT, 'scripts', 'check-commits.mjs'), '--all'], {
      cwd: ROOT,
      encoding: 'utf8',
    });
    expect(output).toContain('0 con errores');
  });
});
