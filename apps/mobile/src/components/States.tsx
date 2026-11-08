import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { useThemeColors } from '../theme/ThemeProvider';
import { minTouchTarget, radius, spacing, type ThemeColors } from '../theme/tokens';

/** Estado vacío con un mensaje y una acción opcional. */
export interface EmptyStateProps {
  readonly title: string;
  readonly body: string;
  readonly actionLabel?: string;
  readonly onAction?: () => void;
}

/** Bloque informativo para pantallas sin contenido todavía. */
export function EmptyState({
  title,
  body,
  actionLabel,
  onAction,
}: EmptyStateProps): React.JSX.Element {
  const colors = useThemeColors();
  const styles = makeStyles(colors);
  return (
    <View style={styles.card}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{body}</Text>
      {actionLabel && onAction ? (
        <Pressable accessibilityRole="button" onPress={onAction} style={styles.button}>
          <Text style={styles.buttonLabel}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Indicador de carga con mensaje. */
export function LoadingState({ message }: { readonly message: string }): React.JSX.Element {
  const colors = useThemeColors();
  const styles = makeStyles(colors);
  return (
    <View style={styles.centered}>
      <ActivityIndicator color={colors.primary} />
      <Text style={styles.muted}>{message}</Text>
    </View>
  );
}

/** Aviso de error no bloqueante. El color no es la única señal: lleva icono. */
export function ErrorNotice({ message }: { readonly message: string }): React.JSX.Element {
  const colors = useThemeColors();
  const styles = makeStyles(colors);
  return (
    <View style={styles.error}>
      <Text style={styles.errorIcon} accessibilityElementsHidden>
        ⚠︎
      </Text>
      <Text style={styles.errorText}>{message}</Text>
    </View>
  );
}

/** Barra de progreso simple basada en un porcentaje entero. */
export function ProgressBar({ percent }: { readonly percent: number }): React.JSX.Element {
  const colors = useThemeColors();
  const styles = makeStyles(colors);
  const clamped = Math.min(100, Math.max(0, Math.round(percent)));
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: clamped }}
      style={styles.track}
    >
      <View style={[styles.fill, { width: `${clamped}%` }]} />
    </View>
  );
}

/**
 * Esqueleto de carga con bloques grises.
 *
 * Se prefiere a un indicador giratorio cuando la pantalla ya conoce la forma de
 * lo que va a aparecer: el esqueleto anticipa la estructura y evita el salto de
 * contenido cuando llegan los datos.
 */
export function Skeleton({ height = 16 }: { readonly height?: number }): React.JSX.Element {
  const colors = useThemeColors();
  const styles = makeStyles(colors);
  return <View style={[styles.skeleton, { height }]} accessibilityElementsHidden />;
}

const makeStyles = (colors: ThemeColors): ReturnType<typeof StyleSheet.create> =>
  StyleSheet.create({
    centered: {
      alignItems: 'center',
      justifyContent: 'center',
      padding: spacing.xl,
      gap: spacing.sm,
    },
    muted: {
      color: colors.textSecondary,
      fontSize: 15,
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.lg,
    },
    title: {
      color: colors.accent,
      fontSize: 14,
      fontWeight: '600',
      textTransform: 'uppercase',
      letterSpacing: 1,
    },
    body: {
      color: colors.textPrimary,
      fontSize: 15,
      marginTop: spacing.sm,
      lineHeight: 22,
    },
    button: {
      marginTop: spacing.md,
      backgroundColor: colors.primary,
      borderRadius: radius.md,
      paddingVertical: spacing.sm,
      alignItems: 'center',
      minHeight: minTouchTarget,
      justifyContent: 'center',
    },
    buttonLabel: {
      color: colors.primaryContrast,
      fontSize: 15,
      fontWeight: '600',
    },
    error: {
      flexDirection: 'row',
      gap: spacing.sm,
      alignItems: 'flex-start',
      backgroundColor: colors.surface,
      borderLeftWidth: 3,
      borderLeftColor: colors.danger,
      borderRadius: radius.sm,
      padding: spacing.md,
    },
    errorIcon: {
      color: colors.danger,
      fontSize: 16,
    },
    errorText: {
      flex: 1,
      color: colors.textPrimary,
      fontSize: 15,
    },
    track: {
      height: 8,
      borderRadius: radius.sm,
      backgroundColor: colors.border,
      overflow: 'hidden',
    },
    fill: {
      height: 8,
      backgroundColor: colors.primary,
    },
    skeleton: {
      backgroundColor: colors.surfaceAlt,
      borderRadius: radius.sm,
      marginTop: spacing.sm,
    },
  });
