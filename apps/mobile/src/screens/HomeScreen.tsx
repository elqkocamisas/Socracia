import { StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing } from '../theme/tokens';

/**
 * Pantalla de inicio del MVP.
 *
 * En el Sprint 0 solo presenta el producto y el estado de las fundaciones.
 * El flujo mayéutico completo llega en los sprints 1–3.
 */
export function HomeScreen(): React.JSX.Element {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Socracia</Text>
      <Text style={styles.subtitle}>
        Aprende por mayéutica: preguntas guiadas sobre tu propio temario.
      </Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Fundaciones listas</Text>
        <Text style={styles.cardBody}>
          Monorepo Expo + TypeScript, dominio mayéutico probado y RAG local enchufable.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    padding: spacing.lg,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 40,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: 16,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  card: {
    marginTop: spacing.xl,
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
});
