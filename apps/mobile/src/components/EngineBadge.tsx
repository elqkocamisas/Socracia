import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { useThemeColors } from '../theme/ThemeProvider';
import { minTouchTarget, radius, spacing, type ThemeColors } from '../theme/tokens';
import type { EngineStatus } from '../services/engineStatus';

/** Propiedades de la insignia de motor. */
export interface EngineBadgeProps {
  readonly status: EngineStatus;
  /** Acción para resolver la degradación; se ejecuta desde la hoja. */
  readonly onAction?: (action: string) => void;
  /** Reintenta el sondeo de salud; la ofrece la hoja en motivos de red. */
  readonly onRetry?: () => void;
}

/**
 * Insignia que indica quién responde: «IA semántica» o «Modo local».
 *
 * No comunica solo con color: lleva icono y texto, y al pulsarla abre una hoja
 * que explica el motivo de la degradación y ofrece la acción para resolverla.
 * La insignia nunca miente: deriva del estado real que calcula
 * `describeEngineStatus`.
 */
export function EngineBadge({ status, onAction, onRetry }: EngineBadgeProps): React.JSX.Element {
  const colors = useThemeColors();
  const styles = makeStyles(colors);
  const [open, setOpen] = useState(false);
  const semantic = status.mode === 'semantic';

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Motor: ${status.label}. Pulsa para ver el detalle.`}
        onPress={() => setOpen(true)}
        style={[styles.badge, semantic ? styles.badgeSemantic : styles.badgeLocal]}
      >
        <Text style={styles.icon} accessibilityElementsHidden>
          {semantic ? '✦' : '⚙︎'}
        </Text>
        <Text style={[styles.label, semantic ? styles.labelSemantic : styles.labelLocal]}>
          {status.label}
        </Text>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.overlay} onPress={() => setOpen(false)}>
          <View style={styles.sheet} accessibilityViewIsModal>
            <Text style={styles.sheetTitle}>{status.label}</Text>
            <Text style={styles.sheetBody}>{status.explanation}</Text>
            {status.action && onAction ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setOpen(false);
                  onAction(status.action as string);
                }}
                style={styles.sheetButton}
              >
                <Text style={styles.sheetButtonLabel}>{status.action}</Text>
              </Pressable>
            ) : null}
            {onRetry && status.reason !== null ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setOpen(false);
                  onRetry();
                }}
                style={styles.sheetSecondary}
              >
                <Text style={styles.sheetSecondaryLabel}>Comprobar conexión</Text>
              </Pressable>
            ) : null}
            <Pressable
              accessibilityRole="button"
              onPress={() => setOpen(false)}
              style={styles.sheetSecondary}
            >
              <Text style={styles.sheetSecondaryLabel}>Cerrar</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const makeStyles = (colors: ThemeColors): ReturnType<typeof StyleSheet.create> =>
  StyleSheet.create({
    badge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      alignSelf: 'flex-start',
      borderRadius: radius.lg,
      borderWidth: 1,
      paddingHorizontal: spacing.md,
      minHeight: 32,
    },
    badgeSemantic: {
      backgroundColor: colors.surface,
      borderColor: colors.primary,
    },
    badgeLocal: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
    },
    icon: {
      fontSize: 13,
    },
    label: {
      fontSize: 13,
      fontWeight: '600',
    },
    labelSemantic: {
      color: colors.primary,
    },
    labelLocal: {
      color: colors.textSecondary,
    },
    overlay: {
      flex: 1,
      backgroundColor: colors.overlay,
      justifyContent: 'flex-end',
    },
    sheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: radius.lg,
      borderTopRightRadius: radius.lg,
      padding: spacing.lg,
      gap: spacing.sm,
    },
    sheetTitle: {
      color: colors.textPrimary,
      fontSize: 20,
      fontWeight: '700',
    },
    sheetBody: {
      color: colors.textSecondary,
      fontSize: 15,
      lineHeight: 22,
    },
    sheetButton: {
      marginTop: spacing.sm,
      backgroundColor: colors.primary,
      borderRadius: radius.md,
      paddingVertical: spacing.md,
      alignItems: 'center',
      minHeight: minTouchTarget,
      justifyContent: 'center',
    },
    sheetButtonLabel: {
      color: colors.primaryContrast,
      fontSize: 16,
      fontWeight: '600',
    },
    sheetSecondary: {
      paddingVertical: spacing.md,
      alignItems: 'center',
      minHeight: minTouchTarget,
      justifyContent: 'center',
    },
    sheetSecondaryLabel: {
      color: colors.primary,
      fontSize: 15,
      fontWeight: '600',
    },
  });
