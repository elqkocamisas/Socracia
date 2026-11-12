import type { Concept, Topic } from '../domain/types';
import { tokenize } from '../rag/embeddings';

/** Temario extraído de un texto: temas y conceptos evaluables. */
export interface ExtractedCurriculum {
  readonly topics: readonly Topic[];
  readonly concepts: readonly Concept[];
}

/** Opciones de extracción. */
export interface ExtractCurriculumOptions {
  /** Máximo de conceptos por tema. */
  readonly maxConceptsPerTopic: number;
  /** Longitud mínima de una definición para aceptarla como concepto. */
  readonly minDefinitionChars: number;
  /** Número de palabras clave que se conservan por concepto. */
  readonly maxKeywords: number;
}

export const DEFAULT_EXTRACT_OPTIONS: ExtractCurriculumOptions = {
  maxConceptsPerTopic: 6,
  minDefinitionChars: 30,
  maxKeywords: 6,
};

const MARKDOWN_HEADING = /^#{1,6}\s+(.+?)\s*$/;
const NAMED_HEADING =
  /^(Tema|Unidad|Bloque|Capítulo|Lección|Módulo|Apartado)\s+(\d+(?:\.\d+)*)[.):]?\s*(.*)$/i;
const NUMBERED_HEADING = /^(\d+(?:\.\d+)*)[.)]?\s+(\S.*)$/;

/** Marcadores que introducen una definición antes del término. */
const DEFINITION_MARKERS = [
  'se entiende por',
  'se define como',
  'se define',
  'se denomina',
  'se conoce como',
  'se considera',
];

/** Marcadores que introducen la definición después del término. */
const PREDICATE_MARKERS = [
  'consiste en',
  'se caracteriza por',
  'se define como',
  'se refiere a',
  'comprende',
];

/**
 * Palabras que cierran un sintagma nominal: determinantes, demostrativos,
 * posesivos, relativos y cópulas. Los conectores («de», «por», «con») no
 * cierran nada, porque en español un término los contiene: «principio de
 * legalidad», «recurso de alzada».
 */
const TERM_STOP_WORDS = new Set([
  'la',
  'el',
  'los',
  'las',
  'un',
  'una',
  'unos',
  'unas',
  'es',
  'son',
  'como',
  'que',
  'aquel',
  'aquella',
  'aquellos',
  'aquellas',
  'este',
  'esta',
  'estos',
  'estas',
  'aquel',
  'su',
  'sus',
  'consiste',
  'se',
  'cuyo',
  'cuya',
  'dicho',
  'dicha',
  'cual',
  'cuales',
]);

const LEADING_ARTICLE = /^(?:el|la|los|las|un|una|unos|unas)\s+/i;

/**
 * Extrae el temario (temas y conceptos) de un texto de estudio.
 *
 * Estrategia determinista, sin modelo: los encabezados delimitan temas y las
 * oraciones con patrón de definición («X es…», «se entiende por X…», «X consiste
 * en…») delimitan conceptos. Si un tema no aporta ninguna definición, se usa su
 * propio título como concepto para no perder cobertura del temario.
 *
 * Es deliberadamente conservador: prefiere extraer pocos conceptos sólidos
 * antes que muchos ruidosos, porque cada concepto genera preguntas evaluables.
 */
export function extractCurriculum(
  rawText: string,
  options: ExtractCurriculumOptions = DEFAULT_EXTRACT_OPTIONS,
): ExtractedCurriculum {
  const text = normalizeForStructure(rawText);
  if (text.length === 0) {
    return { topics: [], concepts: [] };
  }

  const sections = splitSections(text);
  const topics: Topic[] = [];
  const concepts: Concept[] = [];

  sections.forEach((section, sectionIndex) => {
    const topicId = `t${sectionIndex + 1}`;
    topics.push({
      id: topicId,
      title: section.title,
      summary: firstSentence(section.body).slice(0, 240),
    });

    const definitions = extractDefinitions(section.body);
    const used = definitions.slice(0, options.maxConceptsPerTopic);

    if (used.length === 0) {
      const fallbackLabel = cleanHeading(section.title);
      const definition = firstSentence(section.body);
      if (fallbackLabel.length > 0 && definition.length >= options.minDefinitionChars) {
        concepts.push(buildConcept(topicId, 0, fallbackLabel, definition, section.body, options));
      }
      return;
    }

    used.forEach((definition, index) => {
      concepts.push(
        buildConcept(topicId, index, definition.term, definition.definition, section.body, options),
      );
    });
  });

  // Último recurso: un temario en forma de índice (solo epígrafes, sin cuerpo)
  // no aporta definiciones, pero sus enunciados son material evaluable y la
  // acepción literal de «temario» es justamente esa lista. Sin este respaldo,
  // importar un índice y pulsar «Estudiar» responde «no hay material evaluable»
  // aunque el documento sí tenga temas. Solo se activa cuando el documento
  // entero no produjo ningún concepto, así que nunca añade ruido a un temario
  // ya cubierto por definiciones. Los términos clave salen del propio epígrafe:
  // sin ellos la evaluación no tendría ninguna señal con la que puntuar.
  if (concepts.length === 0) {
    sections.forEach((section, sectionIndex) => {
      const topicId = `t${sectionIndex + 1}`;
      const label = cleanHeading(section.title);
      // Un epígrafe real vale como concepto aunque sea corto («La Ley», «El
      // Rey»): antes se exigían ocho caracteres y se descartaban títulos
      // legítimos, dejando el temario sin material evaluable. El título por
      // defecto («Temario») no cuenta: no es un epígrafe del documento.
      if (section.title !== DEFAULT_TOPIC_TITLE && hasMeaningfulWord(label)) {
        // Los términos clave salen del epígrafe; si no aporta ninguno (p. ej.
        // «Fe»), se derivan del cuerpo, o la pregunta quedaría sin señal con la
        // que evaluar y el filtro de trivialidad la descartaría.
        const keywords = indexKeywords(label, section.body, options);
        concepts.push({
          id: `${topicId}:c1`,
          topicId,
          label,
          definition: `${label}.`,
          keywords,
        });
        return;
      }
      // Sin epígrafe utilizable, el cuerpo aún puede dar material evaluable: un
      // temario en forma de lista numerada de enunciados o un texto sin
      // encabezados. Se toma su primera oración con contenido, en vez de dejar
      // el documento sin conceptos y bloquear el estudio.
      const fromBody = conceptFromBody(topicId, section.body, options);
      if (fromBody) {
        concepts.push(fromBody);
      }
    });
  }

  return { topics, concepts };
}

interface Section {
  readonly title: string;
  readonly body: string;
}

/**
 * Marcador de viñeta al inicio de una línea de lista (`- `, `• `, `* `, `– `).
 * No incluye la numeración: un «1. X» o «1.1. X» puede ser un encabezado y se
 * decide antes, en `headingOf`.
 */
const LIST_BULLET = /^\s*[-*•–—]\s+/;

/**
 * Encabezado que se separa como párrafo propio al normalizar.
 *
 * Se limita a las formas inequívocas (marcador de tema, encabezado Markdown y
 * línea corta en mayúsculas). Deliberadamente **no** incluye la numeración
 * suelta (`1. Iniciacion`): dentro de un tema, una línea numerada es casi
 * siempre un elemento de lista y separarla partiría el párrafo que la contiene.
 */
function isStructuralHeading(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length === 0 || trimmed.length > 120) {
    return false;
  }
  if (MARKDOWN_HEADING.test(trimmed)) {
    return true;
  }
  if (NAMED_HEADING.test(trimmed)) {
    return true;
  }
  const letters = trimmed.replace(/[^\p{L}]/gu, '');
  return letters.length >= 4 && letters === letters.toUpperCase() && !trimmed.endsWith('.');
}

/**
 * Normaliza el texto conservando la frontera de los encabezados y de las viñetas.
 *
 * No sirve `normalizeText` (el del RAG): aquel une con espacios las líneas de un
 * mismo párrafo, de modo que un temario con el encabezado pegado a su párrafo
 * —sin línea en blanco, como el texto copiado de un PDF o un TXT compacto— pierde
 * todos los encabezados y queda como un bloque único sin conceptos. Aquí cada
 * encabezado se emite como su propio párrafo, el marcador de viñeta se retira (si
 * no, el término saldría como «- El Estado social») y el resto de líneas se unen
 * como antes, así que el resultado solo cambia cuando hay algo que rescatar.
 */
function normalizeForStructure(raw: string): string {
  const lines = raw
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim());

  const paragraphs: string[] = [];
  let buffer: string[] = [];
  const flush = (): void => {
    if (buffer.length > 0) {
      paragraphs.push(buffer.join(' '));
      buffer = [];
    }
  };

  for (const rawLine of lines) {
    if (rawLine.length === 0) {
      flush();
      continue;
    }
    if (isStructuralHeading(rawLine)) {
      flush();
      paragraphs.push(rawLine);
      continue;
    }
    const line = rawLine.replace(LIST_BULLET, '');
    if (line.length === 0) {
      continue;
    }
    buffer.push(line);
  }
  flush();

  return paragraphs.join('\n\n');
}

function splitSections(text: string): Section[] {
  const lines = text.split('\n');
  const sections: Section[] = [];
  let title = 'Temario';
  let hasHeading = false;
  let buffer: string[] = [];

  const flush = (): void => {
    const body = buffer.join('\n').trim();
    // Se conserva también un encabezado sin cuerpo: un temario en forma de
    // índice (solo epígrafes) no tiene párrafos, y descartarlo perdería todos
    // sus temas. Un encabezado real nunca se confunde con el título por defecto.
    if (body.length > 0 || hasHeading) {
      sections.push({ title, body });
    }
    buffer = [];
  };

  for (const line of lines) {
    const heading = headingOf(line);
    if (heading !== null) {
      flush();
      title = heading;
      hasHeading = true;
      continue;
    }
    buffer.push(line);
  }
  flush();

  return sections;
}

function headingOf(line: string): string | null {
  const trimmed = line.trim();
  if (trimmed.length === 0 || trimmed.length > 120) {
    return null;
  }

  const markdown = MARKDOWN_HEADING.exec(trimmed);
  if (markdown) {
    // Se limpia igual que un encabezado en texto plano: así «## Tema 1. X» y
    // «Tema 1. X» producen el mismo título de tema, y el formato del documento
    // no cambia los conceptos extraídos.
    return cleanHeading((markdown[1] as string).trim());
  }

  const named = NAMED_HEADING.exec(trimmed);
  if (named) {
    const rest = (named[3] as string).trim();
    return rest.length > 0 ? rest : `${named[1] as string} ${named[2] as string}`;
  }

  const numbered = NUMBERED_HEADING.exec(trimmed);
  if (numbered) {
    const rest = (numbered[2] as string).trim();
    // Un encabezado no termina en punto: eso lo delata como oración.
    if (rest.length <= 100 && !rest.endsWith('.')) {
      return rest;
    }
  }

  return null;
}

interface Definition {
  readonly term: string;
  readonly definition: string;
}

/**
 * Abreviaturas tras las cuales un punto no cierra oración. Sin esta lista,
 * «art. 14 CE» se partiría en dos y la definición se perdería.
 */
const ABBREVIATIONS = new Set([
  'art',
  'arts',
  'núm',
  'num',
  'pág',
  'pag',
  'cap',
  'sec',
  'apdo',
  'apart',
  'etc',
  'ej',
  'sr',
  'sra',
  'dr',
  'dra',
  'p',
  'pp',
  'st',
  'sta',
  'vs',
]);

/**
 * Detecta una definición en una oración y devuelve término y definición.
 *
 * El término se acota a un sintagma nominal: se toman las palabras iniciales
 * hasta la primera que pertenece al cierre del término (artículo, verbo o
 * conector). Así «El principio de legalidad es la regla que…» produce el
 * término «principio de legalidad» y no la oración entera.
 */
function parseDefinition(sentence: string): Definition | null {
  const lower = sentence.toLowerCase();

  // Forma 1: la definición precede al término («Se entiende por X la facultad…»).
  for (const marker of DEFINITION_MARKERS) {
    if (lower.startsWith(marker)) {
      const rest = sentence.slice(marker.length).trim();
      const span = takeTerm(rest, true);
      if (span) {
        const definition = ensureSentence(rest.slice(span.consumed).trim());
        if (definition.length >= 25) {
          return { term: span.term, definition };
        }
      }
    }
  }

  // Forma 2: el término precede al predicado («X es…», «X consiste en…»).
  const predicate = findPredicate(lower);
  if (predicate) {
    const { index, marker } = predicate;
    const span = takeTerm(sentence.slice(0, index), false);
    if (span) {
      const definition = ensureSentence(sentence.slice(index + marker.length).trim());
      if (definition.length >= 25) {
        return { term: span.term, definition };
      }
    }
  }

  return null;
}

/** Localiza el predicado de la oración, si lo hay. */
function findPredicate(lower: string): { index: number; marker: string } | null {
  for (const marker of PREDICATE_MARKERS) {
    const index = lower.indexOf(` ${marker} `);
    if (index > 0) {
      return { index, marker };
    }
  }
  // Cópula «es/son»: exige un sujeto que empiece con artículo o determinante.
  if (/^(?:el|la|los|las|un|una)\s/.test(lower)) {
    const match = /\s(?:es|son)\s/.exec(lower);
    if (match && match.index > 3) {
      return { index: match.index, marker: match[0] };
    }
  }
  return null;
}

/** Término extraído y número de caracteres consumidos del texto de origen. */
interface TermSpan {
  readonly term: string;
  readonly consumed: number;
}

/**
 * Recorta el término. Con `stopAtCloser` se detiene en la primera palabra que
 * cierra un sintagma nominal; sin él, toma el sujeto completo ya delimitado por
 * el predicado. Devuelve `null` si no hay un sintagma razonable.
 */
function takeTerm(raw: string, stopAtCloser: boolean): TermSpan | null {
  const words = raw.split(/\s+/);
  const taken: string[] = [];
  let consumed = 0;

  for (const word of words) {
    if (word.length === 0) {
      consumed += 1;
      continue;
    }
    const normalized = word.toLowerCase().replace(/[^a-záéíóúñ]/g, '');
    if (stopAtCloser && taken.length > 0 && TERM_STOP_WORDS.has(normalized)) {
      break;
    }
    taken.push(word);
    consumed += word.length + 1;
    if (taken.length >= 6) {
      break;
    }
  }

  const term = taken
    .join(' ')
    .replace(LEADING_ARTICLE, '')
    .replace(/[,.;:]+$/, '')
    .trim();
  if (term.length < 3 || term.length > 70) {
    return null;
  }
  return { term, consumed: Math.min(consumed, raw.length) };
}

function ensureSentence(value: string): string {
  const trimmed = value.trim();
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

function extractDefinitions(body: string): Definition[] {
  const definitions: Definition[] = [];
  for (const sentence of splitSentences(body)) {
    const definition = parseDefinition(sentence);
    if (definition && definition.definition.length >= 25) {
      definitions.push(definition);
    }
  }
  return dedupeByTerm(definitions);
}

/** Divide en oraciones sin usar lookbehind, por compatibilidad con Hermes. */
export function splitSentences(text: string): string[] {
  const out: string[] = [];
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char !== '.' && char !== '!' && char !== '?') {
      continue;
    }
    const next = text[i + 1];
    if (next !== undefined && next !== ' ' && next !== '\n') {
      continue;
    }
    if (char === '.' && endsWithAbbreviation(text.slice(start, i))) {
      continue;
    }
    const sentence = text.slice(start, i + 1).trim();
    if (sentence.length > 0) {
      out.push(sentence);
    }
    start = i + 1;
  }
  const tail = text.slice(start).trim();
  if (tail.length > 0) {
    out.push(tail);
  }
  return out;
}

function endsWithAbbreviation(fragment: string): boolean {
  const match = /([a-záéíóúñ]+)$/i.exec(fragment.trim());
  return match !== null && ABBREVIATIONS.has((match[1] as string).toLowerCase());
}

function firstSentence(body: string): string {
  return splitSentences(body)[0] ?? '';
}

function buildConcept(
  topicId: string,
  index: number,
  label: string,
  definition: string,
  body: string,
  options: ExtractCurriculumOptions,
): Concept {
  return {
    id: `${topicId}:c${index + 1}`,
    topicId,
    label,
    definition,
    keywords: extractKeywords(label, body, options.maxKeywords),
  };
}

/** Título que `splitSections` asigna al bloque sin ningún encabezado. */
const DEFAULT_TOPIC_TITLE = 'Temario';

/** Palabras funcionales que, solas, no identifican un epígrafe. */
const EPIGRAPH_STOP_WORDS = new Set([
  'el',
  'la',
  'los',
  'las',
  'un',
  'una',
  'unos',
  'unas',
  'tema',
  'temas',
  'unidad',
  'bloque',
  'apartado',
  'introduccion',
  'introducción',
  'indice',
  'índice',
]);

/**
 * `true` si la etiqueta contiene alguna palabra con contenido propio.
 *
 * Evita que un título genérico («Temario») o un resto de numeración («1.») se
 * convierta en concepto, pero admite epígrafes cortos y legítimos como «La Ley»
 * o «Fe». No se usa `tokenize` porque este descarta las palabras de dos letras,
 * y un epígrafe válido puede serlo.
 */
function hasMeaningfulWord(label: string): boolean {
  return label
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/[^a-z0-9ñ]+/)
    .some((word) => word.length >= 2 && !EPIGRAPH_STOP_WORDS.has(word));
}

/**
 * Términos clave de un epígrafe de índice: los del propio título y, si no
 * aporta ninguno, los del cuerpo que lo acompaña. Sin al menos una palabra
 * clave la pregunta no tendría señal con la que puntuar y el filtro de
 * trivialidad la descartaría, dejando el tema sin material evaluable.
 */
function indexKeywords(label: string, body: string, options: ExtractCurriculumOptions): string[] {
  const fromLabel = tokenize(label);
  if (fromLabel.length > 0) {
    return fromLabel.slice(0, options.maxKeywords);
  }
  const fromBody = extractKeywords(label, body, options.maxKeywords);
  if (fromBody.length > 0) {
    return fromBody;
  }
  // Último recurso: el epígrafe es la única señal («Fe»). `tokenize` descarta
  // las palabras de dos letras, así que aquí se conservan tal cual.
  return label
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/[^a-z0-9ñ]+/)
    .filter((word) => word.length >= 2)
    .slice(0, options.maxKeywords);
}

/**
 * Concepto de respaldo a partir del cuerpo del tema.
 *
 * Se usa cuando el documento no aporta definiciones ni un epígrafe utilizable:
 * una lista numerada de enunciados o un texto sin encabezados. Toma la primera
 * oración con contenido suficiente como definición y deriva la etiqueta de sus
 * primeras palabras, para que el tema siga siendo estudiable en vez de quedar
 * sin conceptos. Devuelve `null` si el cuerpo no da material evaluable.
 */
function conceptFromBody(
  topicId: string,
  rawBody: string,
  options: ExtractCurriculumOptions,
): Concept | null {
  const body = rawBody.trim();
  if (body.length < options.minDefinitionChars) {
    return null;
  }
  const definition = ensureSentence(body.split('\n')[0]?.trim() ?? '');
  if (definition.length < options.minDefinitionChars) {
    return null;
  }
  const words = tokenize(definition);
  const label = words.slice(0, 6).join(' ').trim();
  if (!hasMeaningfulWord(label)) {
    return null;
  }
  return {
    id: `${topicId}:c1`,
    topicId,
    label,
    definition,
    keywords: words.slice(0, options.maxKeywords),
  };
}

/**
 * Palabras clave del concepto: los términos más frecuentes del tema que no
 * forman parte de la etiqueta. Se usan para evaluar la respuesta del usuario.
 */
function extractKeywords(label: string, body: string, max: number): string[] {
  const labelTokens = new Set(tokenize(label));
  const counts = new Map<string, number>();
  for (const token of tokenize(body)) {
    if (labelTokens.has(token)) {
      continue;
    }
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => (b[1] === a[1] ? a[0].localeCompare(b[0]) : b[1] - a[1]))
    .slice(0, max)
    .map(([token]) => token);
}

function dedupeByTerm(definitions: readonly Definition[]): Definition[] {
  const seen = new Set<string>();
  const out: Definition[] = [];
  for (const definition of definitions) {
    const key = definition.term.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(definition);
  }
  return out;
}

/** Elimina numeración de encabezado y espacios sobrantes. */
export function cleanHeading(value: string): string {
  const named = NAMED_HEADING.exec(value.trim());
  if (named) {
    const rest = (named[3] as string).trim();
    return (rest.length > 0 ? rest : `${named[1] as string} ${named[2] as string}`).trim();
  }
  return value
    .replace(MARKDOWN_HEADING, '$1')
    .replace(/^[-–—•*\s]+/, '')
    .replace(/\s+/g, ' ')
    .trim();
}
