import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { ErrorNotice } from '../components/States';
import type { AppServices } from '../services/appServices';
import type { AccountSession } from '../services/httpSyncClient';
import { colors, radius, spacing } from '../theme/tokens';

/** Propiedades de la pantalla de cuenta. */
export interface AccountScreenProps {
  readonly services: AppServices;
  /** Reloj inyectable para pruebas deterministas. */
  readonly now?: () => number;
}

type ScreenState =
  | { readonly kind: 'cargando' }
  | { readonly kind: 'sin-sesion' }
  | { readonly kind: 'sesion'; readonly session: AccountSession }
  | { readonly kind: 'enviando' };

type Notice = { readonly tone: 'ok' | 'error'; readonly message: string } | null;

/**
 * Pantalla de cuenta y sincronización.
 *
 * Es opcional por diseño: la app funciona sin cuenta y el progreso vive en el
 * dispositivo. Aquí el usuario decide si crea una cuenta para llevar su
 * progreso a otro dispositivo; al hacerlo se sincroniza de inmediato.
 */
export function AccountScreen({ services, now = Date.now }: AccountScreenProps): React.JSX.Element {
  const [state, setState] = useState<ScreenState>({ kind: 'cargando' });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [notice, setNotice] = useState<Notice>(null);
  /** Confirmación en dos pasos del borrado de cuenta (acción irreversible). */
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void services.account.restore().then((session) => {
      if (!cancelled) {
        setState(session ? { kind: 'sesion', session } : { kind: 'sin-sesion' });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [services]);

  const withAuth = useCallback(
    async (action: 'login' | 'register') => {
      setNotice(null);
      setState({ kind: 'enviando' });
      const result =
        action === 'login'
          ? await services.account.login(email.trim(), password)
          : await services.account.register(email.trim(), password);
      if (!result.ok) {
        setState({ kind: 'sin-sesion' });
        setNotice({ tone: 'error', message: result.error.message });
        return;
      }
      setState({ kind: 'sesion', session: result.value });
      setPassword('');
      const outcome = await services.account.sync(now());
      setNotice(
        outcome.ok
          ? { tone: 'ok', message: 'Sesión iniciada. Tu progreso está sincronizado.' }
          : {
              tone: 'error',
              message: `Sesión iniciada, pero no se pudo sincronizar: ${outcome.error.message}`,
            },
      );
    },
    [services, email, password, now],
  );

  const onSync = useCallback(async () => {
    setNotice(null);
    const outcome = await services.account.sync(now());
    setNotice(
      outcome.ok
        ? {
            tone: 'ok',
            message: outcome.value.pulledChanges
              ? 'Progreso sincronizado. Se han recuperado avances de otro dispositivo.'
              : 'Progreso sincronizado.',
          }
        : { tone: 'error', message: outcome.error.message },
    );
  }, [services, now]);

  const onLogout = useCallback(async () => {
    setNotice(null);
    await services.account.logout();
    setState({ kind: 'sin-sesion' });
    setNotice({ tone: 'ok', message: 'Sesión cerrada. Tu progreso sigue en este dispositivo.' });
  }, [services]);

  /**
   * Borra la cuenta y sus datos en el servidor.
   *
   * El progreso local no se toca: el usuario sigue estudiando sin cuenta. Si el
   * servidor falla, se avisa y **no** se limpia la sesión, para que pueda
   * reintentar en lugar de creer que sus datos se borraron.
   */
  const onDeleteAccount = useCallback(async () => {
    setNotice(null);
    setState({ kind: 'enviando' });
    const result = await services.account.deleteAccount();
    setConfirmDelete(false);
    if (!result.ok) {
      // Las credenciales solo se borran si el servidor confirma, así que la
      // sesión sigue viva y se restaura para que el usuario pueda reintentar.
      const session = await services.account.restore();
      setState(session ? { kind: 'sesion', session } : { kind: 'sin-sesion' });
      setNotice({ tone: 'error', message: result.error.message });
      return;
    }
    setState({ kind: 'sin-sesion' });
    setNotice({
      tone: 'ok',
      message: 'Cuenta eliminada. Tu progreso sigue en este dispositivo.',
    });
  }, [services]);

  if (state.kind === 'cargando') {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primary} />
        <Text style={styles.muted}>Comprobando tu cuenta…</Text>
      </View>
    );
  }

  const busy = state.kind === 'enviando';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Cuenta</Text>
      <Text style={styles.subtitle}>
        Sin cuenta, tu progreso vive solo en este dispositivo. Con cuenta, puedes continuar en otro.
      </Text>

      {notice ? (
        notice.tone === 'error' ? (
          <View style={styles.notice}>
            <ErrorNotice message={notice.message} />
          </View>
        ) : (
          <View style={styles.okBox}>
            <Text style={styles.okText}>{notice.message}</Text>
          </View>
        )
      ) : null}

      {state.kind === 'sesion' ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Sesión activa</Text>
          <Text style={styles.cardBody}>{state.session.email}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={onSync}
            disabled={busy}
            style={[styles.button, busy && styles.buttonDisabled]}
          >
            <Text style={styles.buttonLabel}>Sincronizar ahora</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={onLogout} style={styles.secondaryButton}>
            <Text style={styles.secondaryLabel}>Cerrar sesión</Text>
          </Pressable>

          {confirmDelete ? (
            <View style={styles.dangerBox}>
              <Text style={styles.dangerText}>
                Se eliminará tu cuenta y el progreso guardado en el servidor. Esta acción no se puede
                deshacer. El progreso de este dispositivo se conserva.
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => void onDeleteAccount()}
                disabled={busy}
                style={[styles.dangerButton, busy && styles.buttonDisabled]}
              >
                <Text style={styles.dangerButtonLabel}>Sí, eliminar mi cuenta</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => setConfirmDelete(false)}
                style={styles.secondaryButton}
              >
                <Text style={styles.secondaryLabel}>Cancelar</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable
              accessibilityRole="button"
              onPress={() => setConfirmDelete(true)}
              style={styles.secondaryButton}
            >
              <Text style={styles.dangerLabel}>Eliminar cuenta</Text>
            </Pressable>
          )}
        </View>
      ) : (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Iniciar sesión o crear cuenta</Text>
          <TextInput
            accessibilityLabel="Correo electrónico"
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            placeholder="tu@correo.com"
            placeholderTextColor={colors.textSecondary}
            style={styles.input}
            value={email}
            onChangeText={setEmail}
          />
          <TextInput
            accessibilityLabel="Contraseña"
            autoCapitalize="none"
            placeholder="Contraseña (mínimo 8 caracteres)"
            placeholderTextColor={colors.textSecondary}
            secureTextEntry
            style={styles.input}
            value={password}
            onChangeText={setPassword}
          />
          <Pressable
            accessibilityRole="button"
            onPress={() => void withAuth('login')}
            disabled={busy}
            style={[styles.button, busy && styles.buttonDisabled]}
          >
            <Text style={styles.buttonLabel}>{busy ? 'Un momento…' : 'Iniciar sesión'}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => void withAuth('register')}
            disabled={busy}
            style={[styles.secondaryButton, busy && styles.buttonDisabled]}
          >
            <Text style={styles.secondaryLabel}>Crear cuenta</Text>
          </Pressable>
        </View>
      )}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Qué se sincroniza</Text>
        <Text style={styles.cardBody}>
          Solo tu progreso: respuestas evaluadas, repaso y lagunas. Tus documentos y su texto nunca
          salen del dispositivo.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.lg,
    paddingTop: spacing.xl,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    gap: spacing.sm,
  },
  muted: {
    color: colors.textSecondary,
    fontSize: 15,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 32,
    fontWeight: '700',
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: 15,
    marginTop: spacing.sm,
    lineHeight: 22,
  },
  notice: {
    marginTop: spacing.md,
  },
  okBox: {
    marginTop: spacing.md,
    backgroundColor: colors.surface,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
    borderRadius: radius.sm,
    padding: spacing.md,
  },
  okText: {
    color: colors.textPrimary,
    fontSize: 15,
  },
  card: {
    marginTop: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  cardTitle: {
    color: colors.accent,
    fontSize: 14,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  cardBody: {
    color: colors.textPrimary,
    fontSize: 15,
    marginTop: spacing.sm,
    lineHeight: 22,
  },
  input: {
    marginTop: spacing.md,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.textPrimary,
    fontSize: 15,
  },
  button: {
    marginTop: spacing.md,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonLabel: {
    color: colors.primaryContrast,
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    marginTop: spacing.sm,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  secondaryLabel: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: '600',
  },
  dangerLabel: {
    color: colors.danger,
    fontSize: 15,
    fontWeight: '600',
  },
  dangerBox: {
    marginTop: spacing.md,
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: radius.md,
    padding: spacing.md,
    backgroundColor: colors.background,
  },
  dangerText: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  dangerButton: {
    marginTop: spacing.md,
    backgroundColor: colors.danger,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  dangerButtonLabel: {
    color: colors.background,
    fontSize: 16,
    fontWeight: '700',
  },
});
