'use strict';
/**
 * Validación del formato de los mensajes de commit.
 *
 * Vive en CommonJS y no en el CLI `.mjs` porque Jest no puede requerir un
 * módulo ESM, y las reglas del historial son justo lo que hay que probar. La
 * convención completa, con ejemplos, está en `CONTRIBUTING.md`.
 */

/** Tipos admitidos por Conventional Commits (ver CONTRIBUTING.md). */
const TYPES = new Set([
  'feat',
  'fix',
  'docs',
  'test',
  'refactor',
  'perf',
  'build',
  'ci',
  'chore',
  'revert',
]);

const SUBJECT_MAX = 72;
const BODY_MAX = 100;

/** Asuntos que no describen nada y se rechazan aunque cumplan el formato. */
const GENERIC_SUBJECTS = new Set([
  'wip',
  'fix',
  'fixes',
  'update',
  'updates',
  'arreglos',
  'arreglos varios',
  'cambios',
  'cambios varios',
  'varios',
  'tmp',
  'temp',
  'test',
  'pruebas',
  'commit',
  'avances',
]);

const CONVENTIONAL = /^([a-z]+)(?:\(([a-z0-9._/-]+)\))?(!)?: (.+)$/;
/** Estilo histórico del proyecto, anterior a adoptar Conventional Commits. */
const LEGACY = /^Sprint \d+: (.+)$/;
const MERGE = /^Merge /;
// `git` escribe los pies con `#` (`Refs #12`), no con `:`.
const FOOTER = /^(Sprint: \d+|Closes #\d+|Refs #\d+|Co-authored-by: .+|BREAKING CHANGE: .+)$/;

/** Separa el mensaje en asunto, cuerpo y pie. */
function parseCommitMessage(message) {
  const lines = String(message).replace(/\r\n/g, '\n').split('\n');
  const subject = lines[0] ?? '';
  let rest = lines.slice(1);

  // Un asunto sin línea en blanco detrás pega el cuerpo al asunto, y `git log`
  // lo muestra todo como asunto.
  const separatorMissing = rest.length > 0 && rest[0].trim() !== '';
  if (rest.length > 0 && rest[0].trim() === '') {
    rest = rest.slice(1);
  }

  // El pie son las líneas finales con forma `Clave: valor`.
  const footers = [];
  while (
    rest.length > 0 &&
    (FOOTER.test(rest[rest.length - 1]) || rest[rest.length - 1].trim() === '')
  ) {
    const last = rest.pop();
    if (last.trim() !== '') {
      footers.unshift(last);
    }
  }
  const footerText = footers.join('\n');
  const sprintMatch = /^Sprint: (\d+)$/m.exec(footerText);

  const match = CONVENTIONAL.exec(subject);
  return {
    subject,
    body: rest.join('\n'),
    footers,
    separatorMissing,
    type: match ? match[1] : null,
    scope: match ? (match[2] ?? null) : null,
    breaking: match ? match[3] === '!' : false,
    description: match ? match[4] : (LEGACY.exec(subject)?.[1] ?? null),
    legacy: !match && LEGACY.test(subject),
    merge: MERGE.test(subject),
    sprint: sprintMatch ? Number(sprintMatch[1]) : null,
  };
}

/**
 * Valida un mensaje de commit.
 *
 * Devuelve `{ ok, errors, warnings }`. `ok` es falso solo si hay errores: las
 * advertencias señalan estilo mejorable sin bloquear.
 */
function validateCommitMessage(message) {
  const parsed = parseCommitMessage(message);
  const errors = [];
  const warnings = [];

  // Los commits de fusión los escribe Git; no se les aplica la convención.
  if (parsed.merge) {
    return { ok: true, errors, warnings, parsed };
  }

  if (parsed.subject.trim() === '') {
    errors.push('El asunto está vacío.');
    return { ok: false, errors, warnings, parsed };
  }

  if (parsed.subject.length > SUBJECT_MAX) {
    const message = `El asunto tiene ${parsed.subject.length} caracteres; el máximo es ${SUBJECT_MAX}.`;
    // El historial anterior a la convención no se reescribe: se avisa, no se
    // bloquea, porque esos commits ya están fusionados.
    if (parsed.legacy) {
      warnings.push(message);
    } else {
      errors.push(message);
    }
  }

  if (parsed.legacy) {
    warnings.push(
      'Usa el estilo histórico «Sprint N: …»; los commits nuevos siguen Conventional Commits.',
    );
  } else if (!parsed.type) {
    errors.push(
      'El asunto no sigue «tipo(ámbito): descripción». Tipos: ' + [...TYPES].join(', ') + '.',
    );
  } else {
    if (!TYPES.has(parsed.type)) {
      errors.push(`Tipo desconocido «${parsed.type}»; usa uno de: ${[...TYPES].join(', ')}.`);
    }
    if (parsed.description === null || parsed.description.trim() === '') {
      errors.push('Falta la descripción tras «tipo: ».');
    } else {
      if (parsed.description.endsWith('.')) {
        errors.push('La descripción no debe terminar en punto.');
      }
      const first = parsed.description[0];
      if (first === first.toUpperCase() && first !== first.toLowerCase()) {
        errors.push('La descripción debe empezar en minúscula.');
      }
      const normalized = parsed.description
        .trim()
        .toLowerCase()
        .replace(/[.!]+$/, '');
      if (GENERIC_SUBJECTS.has(normalized)) {
        errors.push(`El asunto «${parsed.description}» no describe el cambio.`);
      }
    }
  }

  if (parsed.separatorMissing) {
    errors.push('Falta la línea en blanco entre el asunto y el cuerpo.');
  }

  const longLines = parsed.body
    .split('\n')
    .filter((line) => line.length > BODY_MAX && !line.includes('http'));
  if (longLines.length > 0) {
    errors.push(`El cuerpo tiene ${longLines.length} línea(s) de más de ${BODY_MAX} caracteres.`);
  }

  return { ok: errors.length === 0, errors, warnings, parsed };
}

module.exports = {
  TYPES,
  SUBJECT_MAX,
  BODY_MAX,
  parseCommitMessage,
  validateCommitMessage,
};
