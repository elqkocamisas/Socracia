import { AuthService } from '../auth';

describe('AuthService', () => {
  it('registra una cuenta y emite un token válido', async () => {
    const auth = new AuthService();

    const result = await auth.register('Ana@Ejemplo.com', 'contrasena-larga');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(auth.userIdForToken(result.value.token)).toBe(result.value.userId);
    }
  });

  it('normaliza el correo: no se puede registrar dos veces con distinto caso', async () => {
    const auth = new AuthService();
    await auth.register('ana@ejemplo.com', 'contrasena-larga');

    const second = await auth.register('ANA@EJEMPLO.COM', 'otra-contrasena');

    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.error.code).toBe('email-en-uso');
    }
  });

  it('rechaza contraseñas cortas y correos inválidos', async () => {
    const auth = new AuthService();

    expect((await auth.register('no-es-un-correo', 'contrasena-larga')).ok).toBe(false);
    expect((await auth.register('ana@ejemplo.com', 'corta')).ok).toBe(false);
  });

  it('inicia sesión con credenciales correctas', async () => {
    const auth = new AuthService();
    await auth.register('ana@ejemplo.com', 'contrasena-larga');

    const login = await auth.login('ana@ejemplo.com', 'contrasena-larga');

    expect(login.ok).toBe(true);
  });

  it('rechaza contraseña incorrecta y correo desconocido con el mismo error', async () => {
    const auth = new AuthService();
    await auth.register('ana@ejemplo.com', 'contrasena-larga');

    const wrongPassword = await auth.login('ana@ejemplo.com', 'otra-contrasena');
    const unknownUser = await auth.login('nadie@ejemplo.com', 'contrasena-larga');

    // Mismo código en ambos casos para no revelar qué correos existen.
    expect(wrongPassword.ok).toBe(false);
    expect(unknownUser.ok).toBe(false);
    if (!wrongPassword.ok && !unknownUser.ok) {
      expect(wrongPassword.error.code).toBe('credenciales-invalidas');
      expect(unknownUser.error.code).toBe('credenciales-invalidas');
    }
  });

  it('invalida el token al cerrar sesión', async () => {
    const auth = new AuthService();
    const registered = await auth.register('ana@ejemplo.com', 'contrasena-larga');
    expect(registered.ok).toBe(true);
    if (!registered.ok) {
      return;
    }

    auth.logout(registered.value.token);

    expect(auth.userIdForToken(registered.value.token)).toBeNull();
  });

  it('no guarda la contraseña en claro', async () => {
    const auth = new AuthService();
    await auth.register('ana@ejemplo.com', 'contrasena-larga');

    // El token y el identificador son lo único accesible; el hash no se expone.
    const login = await auth.login('ana@ejemplo.com', 'contrasena-larga');
    expect(login.ok && JSON.stringify(login.value)).not.toContain('contrasena-larga');
  });
});
