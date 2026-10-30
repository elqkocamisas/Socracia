import {
  describeSchemaError,
  extractJsonObject,
  nonEmptyString,
  numberInRange,
  oneOf,
  record,
  uniqueStrings,
} from '../json';

describe('validación estricta de esquema', () => {
  it('rechaza lo que no es objeto plano', () => {
    expect(record(null, '$').ok).toBe(false);
    expect(record([], '$').ok).toBe(false);
    expect(record('texto', '$').ok).toBe(false);
    expect(record({ a: 1 }, '$').ok).toBe(true);
  });

  it('rechaza cadenas vacías o en blanco', () => {
    expect(nonEmptyString('   ', 'x').ok).toBe(false);
    expect(nonEmptyString(' hola ', 'x')).toEqual({ ok: true, value: 'hola' });
  });

  it('acota números a un rango cerrado', () => {
    const validator = numberInRange(0, 1);
    expect(validator(0, 's').ok).toBe(true);
    expect(validator(1, 's').ok).toBe(true);
    expect(validator(1.5, 's').ok).toBe(false);
    expect(validator(Number.NaN, 's').ok).toBe(false);
    expect(validator('0.5', 's').ok).toBe(false);
  });

  it('acepta solo los valores permitidos', () => {
    const validator = oneOf(['a', 'b'] as const);
    expect(validator('a', 'v').ok).toBe(true);
    expect(validator('c', 'v').ok).toBe(false);
  });

  it('descarta repetidos en lugar de rechazar la lista', () => {
    const parsed = uniqueStrings(['a', 'a', 'b'], 't');
    expect(parsed).toEqual({ ok: true, value: ['a', 'b'] });
  });

  it('extrae el objeto JSON aunque venga envuelto en texto o vallas', () => {
    const wrapped = 'Claro, aquí tienes:\n```json\n{"score":0.5}\n```\nEspero que sirva.';
    const parsed = extractJsonObject(wrapped);
    expect(parsed.ok && parsed.value).toEqual({ score: 0.5 });
  });

  it('falla si no hay objeto JSON', () => {
    expect(extractJsonObject('sin llaves').ok).toBe(false);
    expect(extractJsonObject('{ roto: ').ok).toBe(false);
  });

  it('describe el error con su ruta', () => {
    expect(describeSchemaError({ path: 'score', message: 'fuera de rango' })).toBe(
      'score: fuera de rango',
    );
  });
});
