/**
 * Tipos del validador de mensajes de commit para quien lo importa desde
 * TypeScript.
 *
 * El módulo real es CommonJS (`.cjs`) porque Jest no puede requerir ESM; esta
 * declaración hermana le da tipos sin cambiar el formato.
 */

export const TYPES: Set<string>;
export const SUBJECT_MAX: number;
export const BODY_MAX: number;

export interface ParsedCommitMessage {
  subject: string;
  body: string;
  footers: string[];
  separatorMissing: boolean;
  type: string | null;
  scope: string | null;
  breaking: boolean;
  description: string | null;
  legacy: boolean;
  merge: boolean;
  sprint: number | null;
}

export interface CommitValidation {
  ok: boolean;
  errors: string[];
  warnings: string[];
  parsed: ParsedCommitMessage;
}

export function parseCommitMessage(message: string): ParsedCommitMessage;

/** Valida un mensaje completo (asunto, cuerpo y pie). */
export function validateCommitMessage(message: string): CommitValidation;
