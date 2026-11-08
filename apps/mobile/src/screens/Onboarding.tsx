import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useThemeColors } from '../theme/ThemeProvider';
import { minTouchTarget, radius, spacing, type ThemeColors } from '../theme/tokens';
import { ONBOARDING_STEPS } from '../services/onboarding';

/** Propiedades del onboarding. */
export interface OnboardingProps {
  /** Se invoca al terminar (o al omitir) el recorrido. */
  readonly onDone: () => void;
  /** Se invoca al elegir el modo de privacidad en el último paso. */
  readonly onChoosePrivacy?: (mode: 'local-only' | 'allow-cloud') => void;
}

/**
 * Onboarding de tres pasos en el primer uso.
 *
 * Explica qué es la mayéutica con un ejemplo breve, cómo trabaja la app y
 * ofrece la elección de privacidad en lenguaje claro: local por defecto, nube
 * opcional. Es omisible en cualquier momento y se puede reabrir desde Ajustes.
 */
export function Onboarding({ onDone, onChoosePrivacy }: OnboardingProps): React.JSX.Element {
  const colors = useThemeColors();
  const styles = makeStyles(colors);
  const [step, setStep] = useState(0);
  const last = step === ONBOARDING_STEPS.length - 1;
  const current = ONBOARDING_STEPS[step]!;

  const finish = (mode?: 'local-only' | 'allow-cloud'): void => {
    if (mode && onChoosePrivacy) {
      onChoosePrivacy(mode);
    }
    onDone();
  };

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.icon} accessibilityElementsHidden>
          {current.icon}
        </Text>
        <Text style={styles.title}>{current.title}</Text>
        <Text style={styles.body}>{current.body}</Text>

        {last ? (
          <View style={styles.choices}>
            <Pressable
              accessibilityRole="button"
              onPress={() => finish('local-only')}
              style={styles.primaryButton}
            >
              <Text style={styles.primaryLabel}>Solo en mi dispositivo (recomendado)</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => finish('allow-cloud')}
              style={styles.secondaryButton}
            >
              <Text style={styles.secondaryLabel}>Permitir la nube cuando yo lo active</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable
            accessibilityRole="button"
            onPress={() => setStep(step + 1)}
            style={styles.primaryButton}
          >
            <Text style={styles.primaryLabel}>Siguiente</Text>
          </Pressable>
        )}
      </View>

      <View style={styles.footer}>
        <View style={styles.dots}>
          {ONBOARDING_STEPS.map((s, i) => (
            <View key={s.title} style={[styles.dot, i === step && styles.dotActive]} />
          ))}
        </View>
        <Pressable accessibilityRole="button" onPress={() => finish()} style={styles.skip}>
          <Text style={styles.skipLabel}>Omitir</Text>
        </Pressable>
      </View>
    </View>
  );
}

const makeStyles = (colors: ThemeColors): ReturnType<typeof StyleSheet.create> =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
      padding: spacing.lg,
      justifyContent: 'center',
      gap: spacing.lg,
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.xl,
      gap: spacing.sm,
    },
    icon: {
      fontSize: 40,
    },
    title: {
      color: colors.textPrimary,
      fontSize: 26,
      fontWeight: '700',
    },
    body: {
      color: colors.textPrimary,
      fontSize: 16,
      lineHeight: 24,
    },
    choices: {
      marginTop: spacing.md,
      gap: spacing.sm,
    },
    primaryButton: {
      marginTop: spacing.md,
      backgroundColor: colors.primary,
      borderRadius: radius.md,
      paddingVertical: spacing.md,
      alignItems: 'center',
      minHeight: minTouchTarget,
      justifyContent: 'center',
    },
    primaryLabel: {
      color: colors.primaryContrast,
      fontSize: 16,
      fontWeight: '600',
      textAlign: 'center',
    },
    secondaryButton: {
      paddingVertical: spacing.md,
      alignItems: 'center',
      minHeight: minTouchTarget,
      justifyContent: 'center',
    },
    secondaryLabel: {
      color: colors.primary,
      fontSize: 15,
      fontWeight: '600',
      textAlign: 'center',
    },
    footer: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    dots: {
      flexDirection: 'row',
      gap: spacing.xs,
    },
    dot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.border,
    },
    dotActive: {
      backgroundColor: colors.primary,
    },
    skip: {
      padding: spacing.sm,
      minHeight: minTouchTarget,
      justifyContent: 'center',
    },
    skipLabel: {
      color: colors.textSecondary,
      fontSize: 15,
      fontWeight: '600',
    },
  });
