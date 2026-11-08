import {
  describeCloudConditions,
  describeEngineStatus,
  type EngineStatusInput,
} from '../services/engineStatus';

/** Entrada «todo en orden»: el motor semántico responde. */
const READY: EngineStatusInput = {
  cloudAvailable: true,
  hasSession: true,
  policyAllowsCloud: true,
  documentConsent: true,
  connectivity: 'ok',
  providerIssue: null,
};

describe('describeEngineStatus', () => {
  it('con todas las condiciones, el motor es semántico y sin motivo', () => {
    const status = describeEngineStatus(READY);
    expect(status.mode).toBe('semantic');
    expect(status.reason).toBeNull();
    expect(status.label).toBe('IA semántica');
  });

  it('sin backend en el build, degrada con motivo «sin-backend»', () => {
    const status = describeEngineStatus({ ...READY, cloudAvailable: false });
    expect(status.mode).toBe('local');
    expect(status.reason).toBe('sin-backend');
  });

  it('sin sesión, degrada y ofrece iniciar sesión', () => {
    const status = describeEngineStatus({ ...READY, hasSession: false });
    expect(status.reason).toBe('sin-cuenta');
    expect(status.action).toBe('Iniciar sesión');
  });

  it('con la nube desactivada, degrada con motivo «nube-desactivada»', () => {
    expect(describeEngineStatus({ ...READY, policyAllowsCloud: false }).reason).toBe(
      'nube-desactivada',
    );
  });

  it('con el documento sin permiso, degrada con motivo «documento-sin-permiso»', () => {
    expect(describeEngineStatus({ ...READY, documentConsent: false }).reason).toBe(
      'documento-sin-permiso',
    );
  });

  it('sin conexión, degrada con motivo «sin-conexion»', () => {
    expect(describeEngineStatus({ ...READY, connectivity: 'offline' }).reason).toBe('sin-conexion');
  });

  it('con el servidor despertando, lo explica en lugar de callarlo', () => {
    const status = describeEngineStatus({ ...READY, connectivity: 'waking' });
    expect(status.reason).toBe('servidor-despertando');
    expect(status.explanation).toMatch(/despertando/i);
  });

  it('con la cuota agotada, degrada sin acción (se recupera sola)', () => {
    const status = describeEngineStatus({ ...READY, providerIssue: 'cuota' });
    expect(status.reason).toBe('cuota');
    expect(status.action).toBeNull();
  });

  it('con error del proveedor, degrada con motivo «error-proveedor»', () => {
    expect(describeEngineStatus({ ...READY, providerIssue: 'error' }).reason).toBe(
      'error-proveedor',
    );
  });

  it('el orden de comprobación prioriza la primera causa accionable', () => {
    // Sin backend y sin sesión: gana «sin-backend», que es la causa raíz.
    const status = describeEngineStatus({ ...READY, cloudAvailable: false, hasSession: false });
    expect(status.reason).toBe('sin-backend');
  });

  it('cada motivo tiene explicación no vacía y, salvo tres, una acción', () => {
    const reasons = [
      'sin-backend',
      'sin-cuenta',
      'nube-desactivada',
      'documento-sin-permiso',
      'sin-conexion',
      'servidor-despertando',
      'cuota',
      'error-proveedor',
    ] as const;
    for (const reason of reasons) {
      const status = describeEngineStatus(reasonInput(reason));
      expect(status.reason).toBe(reason);
      expect(status.explanation.length).toBeGreaterThan(10);
    }
  });
});

function reasonInput(reason: ReturnType<typeof describeEngineStatus>['reason']): EngineStatusInput {
  switch (reason) {
    case 'sin-backend':
      return { ...READY, cloudAvailable: false };
    case 'sin-cuenta':
      return { ...READY, hasSession: false };
    case 'nube-desactivada':
      return { ...READY, policyAllowsCloud: false };
    case 'documento-sin-permiso':
      return { ...READY, documentConsent: false };
    case 'sin-conexion':
      return { ...READY, connectivity: 'offline' };
    case 'servidor-despertando':
      return { ...READY, connectivity: 'waking' };
    case 'cuota':
      return { ...READY, providerIssue: 'cuota' };
    case 'error-proveedor':
      return { ...READY, providerIssue: 'error' };
    default:
      return READY;
  }
}

describe('describeCloudConditions', () => {
  it('describe los cuatro requisitos con su estado', () => {
    const conditions = describeCloudConditions({
      buildWithEngine: true,
      signedIn: false,
      policyAllowsCloud: true,
      documentConsent: false,
    });
    expect(conditions).toHaveLength(4);
    expect(conditions.filter((condition) => condition.met)).toHaveLength(2);
    expect(conditions[0]?.label).toMatch(/motor semántico/i);
  });
});
