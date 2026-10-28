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
