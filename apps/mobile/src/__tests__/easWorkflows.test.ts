import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { load } from 'js-yaml';

/**
 * Comprueba que los workflows de EAS son coherentes con `eas.json`.
 *
 * Son fallos que solo aparecerían al lanzar el workflow (y ya en la nube, con
 * coste de créditos): aquí se detectan en local. El caso concreto que motivó
 * esta prueba es que `.eas/workflows/` no existía y la pestaña Workflows del
 * panel de Expo salía vacía, porque EAS lee ese directorio y no `.github/`.
 */
const MOBILE = join(__dirname, '..', '..');
const WORKFLOWS = join(MOBILE, '.eas', 'workflows');

interface WorkflowInput {
  type: string;
  options?: string[];
  required?: boolean;
  default?: string;
}

interface WorkflowJob {
  type?: string;
  environment?: string;
  params?: { platform?: string; profile?: string };
}

interface Workflow {
  name?: string;
  on?: { workflow_dispatch?: { inputs?: Record<string, WorkflowInput> } };
  jobs?: Record<string, WorkflowJob>;
}

interface EasConfig {
  build: Record<string, { environment?: string }>;
}

function readWorkflow(name: string): Workflow {
  return load(readFileSync(join(WORKFLOWS, name), 'utf8')) as Workflow;
}

function readEasConfig(): EasConfig {
  return JSON.parse(readFileSync(join(MOBILE, 'eas.json'), 'utf8')) as EasConfig;
}

describe('workflows de EAS', () => {
  it('existen en .eas/workflows, que es donde los busca EAS', () => {
    // Si este directorio desaparece, la pestaña Workflows del panel de Expo se
    // queda vacía aunque los ficheros sigan en .github/workflows.
    expect(existsSync(WORKFLOWS)).toBe(true);
    expect(readdirSync(WORKFLOWS).filter((f: string) => /\.ya?ml$/.test(f))).not.toHaveLength(0);
  });

  it('el workflow de compilación solo referencia perfiles que existen en eas.json', () => {
    const perfiles = Object.keys(readEasConfig().build);
    const workflow = readWorkflow('build-production.yml');

    for (const [id, job] of Object.entries(workflow.jobs ?? {})) {
      const profile = job.params?.profile ?? '';
      // El perfil puede venir de un input; en ese caso se comprueban sus opciones.
      const opciones = workflow.on?.workflow_dispatch?.inputs?.['perfil']?.options ?? [];
      const candidatos = opciones.length > 0 ? opciones : [profile];

      for (const candidato of candidatos) {
        expect({ job: id, perfil: candidato, existe: perfiles.includes(candidato) }).toEqual({
          job: id,
          perfil: candidato,
          existe: true,
        });
      }
    }
  });

  it('cada perfil que compila declara un entorno con la URL del backend', () => {
    // Un job `build` sin `environment` lo infiere del perfil, y sin la opcion
    // explicita en eas.json un perfil puede caer en un entorno sin variables:
    // el build saldria con la URL por defecto (localhost) sin avisar.
    const build = readEasConfig().build;

    for (const [perfil, config] of Object.entries(build)) {
      expect({ perfil, entorno: config.environment }).toEqual({
        perfil,
        entorno: perfil === 'development' ? undefined : perfil,
      });
    }
  });

  it('los jobs de compilación declaran plataforma y perfil', () => {
    const workflow = readWorkflow('build-production.yml');
    const jobs = Object.entries(workflow.jobs ?? {});
    expect(jobs).not.toHaveLength(0);

    for (const [id, job] of jobs) {
      expect({ id, tipo: job.type }).toEqual({ id, tipo: 'build' });
      expect({ id, plataforma: Boolean(job.params?.platform) }).toEqual({ id, plataforma: true });
      expect({ id, perfil: Boolean(job.params?.profile) }).toEqual({ id, perfil: true });
    }
  });
});
