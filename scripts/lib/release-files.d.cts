/**
 * Tipos de la lógica de empaquetado para quien la importa desde TypeScript.
 *
 * El módulo real es CommonJS (`.cjs`) porque Jest no puede requerir ESM; esta
 * declaración hermana le da tipos sin cambiar el formato.
 */

export const EXCLUDED_DIRS: Set<string>;

/** Decide si una ruta relativa entra en la entrega. */
export function shouldInclude(relativePath: string): boolean;

/** Recorre el árbol y devuelve las rutas relativas incluidas, ordenadas. */
export function collectFiles(directory: string, base?: string): string[];

export interface ManifestFile {
  path: string;
  bytes: number;
  sha256: string;
}

export interface Manifest {
  name: string;
  version: string;
  generatedAt: string;
  fileCount: number;
  files: ManifestFile[];
}

export function buildManifest(
  root: string,
  files: string[],
  version: string,
  now: string,
): Manifest;
