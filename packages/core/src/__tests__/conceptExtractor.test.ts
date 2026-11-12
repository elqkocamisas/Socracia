import { extractCurriculum, splitSentences, cleanHeading } from '../ingest/conceptExtractor';

const TEMARIO = `Tema 1. El principio de legalidad

El principio de legalidad es la regla que obliga a la Administración a actuar con habilitación legal previa y sin invadir el ámbito reservado a la ley. Se entiende por potestad reglamentaria la facultad del Gobierno para dictar normas de rango inferior a la ley. La jerarquía normativa consiste en el orden escalonado de las normas según su rango, de modo que ninguna norma inferior puede contradecir una superior.

Tema 2. Los recursos administrativos

El recurso de alzada es el recurso que se interpone ante el órgano superior jerárquico del que dictó el acto. La revisión de oficio se caracteriza por permitir a la Administración anular sus propios actos nulos de pleno derecho.`;

describe('splitSentences', () => {
  it('separa oraciones por punto y espacio', () => {
    expect(splitSentences('Una. Dos. Tres.')).toEqual(['Una.', 'Dos.', 'Tres.']);
  });

  it('no rompe con abreviaturas sin espacio posterior', () => {
    expect(splitSentences('art. 14 CE es clave')).toEqual(['art. 14 CE es clave']);
  });

  it('devuelve la cola sin puntuación final', () => {
    expect(splitSentences('Texto sin punto final')).toEqual(['Texto sin punto final']);
  });
});

describe('cleanHeading', () => {
  it('elimina numeración de tema', () => {
    expect(cleanHeading('Tema 1. El principio de legalidad')).toBe('El principio de legalidad');
  });

  it('elimina encabezado markdown', () => {
    expect(cleanHeading('## Los recursos')).toBe('Los recursos');
  });
});

describe('extractCurriculum', () => {
  const curriculum = extractCurriculum(TEMARIO);

  it('extrae un tema por encabezado', () => {
    expect(curriculum.topics).toHaveLength(2);
    expect(curriculum.topics[0]?.title).toBe('El principio de legalidad');
  });

  it('extrae conceptos desde patrones de definición', () => {
    const labels = curriculum.concepts.map((concept) => concept.label);
    expect(labels).toContain('principio de legalidad');
    expect(labels).toContain('potestad reglamentaria');
    expect(labels).toContain('jerarquía normativa');
    expect(labels).toContain('recurso de alzada');
  });

  it('asigna cada concepto a su tema', () => {
    const legalidad = curriculum.concepts.find((c) => c.label === 'principio de legalidad');
    const alzada = curriculum.concepts.find((c) => c.label === 'recurso de alzada');
    expect(legalidad?.topicId).toBe('t1');
    expect(alzada?.topicId).toBe('t2');
  });

  it('genera definiciones utilizables como respuesta de referencia', () => {
    for (const concept of curriculum.concepts) {
      expect(concept.definition.length).toBeGreaterThanOrEqual(25);
    }
  });

  it('genera palabras clave no vacías para cada concepto', () => {
    const legalidad = curriculum.concepts.find((c) => c.label === 'principio de legalidad');
    expect(legalidad?.keywords.length).toBeGreaterThan(0);
    expect(legalidad?.keywords).not.toContain('principio');
  });

  it('devuelve vacío para texto vacío', () => {
    expect(extractCurriculum('')).toEqual({ topics: [], concepts: [] });
  });

  it('no duplica conceptos con la misma etiqueta', () => {
    const repeated = extractCurriculum(
      `Tema 1. Prueba\n\nEl plazo es el tiempo fijado para realizar un acto válido. El plazo es el tiempo fijado para realizar un acto válido.`,
    );
    const labels = repeated.concepts.map((concept) => concept.label.toLowerCase());
    expect(new Set(labels).size).toBe(labels.length);
  });
});

/**
 * Regresión del defecto «no hay material evaluable»: un temario con el
 * encabezado pegado a su párrafo (sin línea en blanco, como el texto copiado de
 * un PDF o un TXT compacto) perdía todos los encabezados y no producía ningún
 * concepto, porque el normalizador del RAG unía las líneas de un párrafo.
 */
describe('extractCurriculum — temarios sin línea en blanco y con viñetas', () => {
  it('extrae conceptos aunque el encabezado no lleve línea en blanco detrás', () => {
    const sinBlancos = `Tema 1. La Constitución Española
La Constitución Española de 1978 regula la organización del Estado y reconoce los derechos fundamentales de los ciudadanos.
Tema 2. El Gobierno
El Gobierno dirige la política interior y exterior, la Administración civil y militar y la defensa del Estado.`;

    const curriculum = extractCurriculum(sinBlancos);
    expect(curriculum.topics.map((topic) => topic.title)).toEqual([
      'La Constitución Española',
      'El Gobierno',
    ]);
    expect(curriculum.concepts.map((concept) => concept.label)).toEqual([
      'La Constitución Española',
      'El Gobierno',
    ]);
  });

  it('extrae conceptos de un temario descriptivo que no usa «X es…»', () => {
    const descriptivo = `Tema 1. La Constitución
La Constitución regula la organización del Estado y reconoce los derechos fundamentales de los ciudadanos.
Tema 2. El Gobierno
El Gobierno dirige la política interior y exterior del Estado y la defensa nacional.`;

    expect(extractCurriculum(descriptivo).concepts).toHaveLength(2);
  });

  it('no arrastra el marcador de viñeta en la etiqueta del concepto', () => {
    const vinetas = `Tema 1. La Constitución
- La Constitución es la norma suprema del ordenamiento jurídico español que organiza los poderes del Estado.
- El Estado social se caracteriza por garantizar la libertad, la justicia y la igualdad ante la ley.`;

    const labels = extractCurriculum(vinetas).concepts.map((concept) => concept.label);
    expect(labels).toEqual(['Constitución', 'Estado social']);
    for (const label of labels) {
      expect(label.startsWith('-')).toBe(false);
    }
  });

  it('extrae conceptos de un temario en forma de índice (solo epígrafes)', () => {
    const indice = `Tema 1. La Constitución Española de 1978
Tema 2. El Gobierno y la Administración
Tema 3. La Corona`;

    const curriculum = extractCurriculum(indice);
    expect(curriculum.topics.map((topic) => topic.title)).toEqual([
      'La Constitución Española de 1978',
      'El Gobierno y la Administración',
      'La Corona',
    ]);
    // Un índice sigue siendo material evaluable: cada epígrafe da un concepto
    // con sus términos clave, en vez de cero conceptos y el error en pantalla.
    expect(curriculum.concepts.map((concept) => concept.label)).toEqual([
      'La Constitución Española de 1978',
      'El Gobierno y la Administración',
      'La Corona',
    ]);
    for (const concept of curriculum.concepts) {
      expect(concept.keywords.length).toBeGreaterThan(0);
    }
  });
});

/**
 * Regresión del defecto «El temario no contiene conceptos evaluables» en
 * documentos que sí tienen texto: un índice con epígrafes cortos y legítimos
 * («Tema 1. Ley») o una lista numerada de enunciados producían cero conceptos y
 * bloqueaban el estudio. El respaldo de índice exigía ocho caracteres de
 * etiqueta y no miraba el cuerpo, así que descartaba material evaluable real.
 */
describe('extractCurriculum — documentos con texto que no daban conceptos', () => {
  it('admite epígrafes cortos y legítimos de un índice', () => {
    const indice = `Tema 1. Ley
Tema 2. Fe
Tema 3. Paz`;

    const labels = extractCurriculum(indice).concepts.map((concept) => concept.label);
    expect(labels).toEqual(['Ley', 'Fe', 'Paz']);
  });

  it('da términos clave a cada epígrafe para que la pregunta sea evaluable', () => {
    // Un epígrafe de una sola palabra corta no aporta términos por sí mismo; sin
    // respaldo, su pregunta se descartaría por trivial y el tema quedaría vacío.
    const curriculum = extractCurriculum(`Tema 1. Fe
Tema 2. Ley`);
    for (const concept of curriculum.concepts) {
      expect(concept.keywords.length).toBeGreaterThan(0);
    }
  });

  it('extrae un concepto de una lista numerada de enunciados', () => {
    const lista = `1. El acto administrativo es la declaración unilateral de voluntad de la Administración.
2. La notificación es la comunicación formal del acto al interesado.`;

    const curriculum = extractCurriculum(lista);
    expect(curriculum.concepts.length).toBeGreaterThan(0);
    expect(curriculum.concepts[0]?.definition.length).toBeGreaterThanOrEqual(25);
  });

  it('no inventa concepto cuando el documento no tiene ningún texto', () => {
    expect(extractCurriculum('   \n\n   ')).toEqual({ topics: [], concepts: [] });
  });
});
