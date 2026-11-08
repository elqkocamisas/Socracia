import { StyleSheet, Text, View } from 'react-native';

import { useThemeColors } from '../theme/ThemeProvider';
import { radius, spacing, type ThemeColors } from '../theme/tokens';

/**
 * Pantalla de inicio.
 *
 * Presenta el producto y su propuesta. El recorrido mayéutico completo vive en
 * la biblioteca y el estudio; aquí solo se da la bienvenida.
 */
export function HomeScreen(): React.JSX.Element {
  const colors = useThemeColors();
  const styles = makeStyles(colors);
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Socracia</Text>
      <Text style={styles.subtitle}>
        Aprende por mayéutica: preguntas guiadas sobre tu propio temario.
      </Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Aprender respondiendo</Text>
        <Text style={styles.cardBody}>
          Socracia no te da la respuesta: te hace preguntas ancladas a tu temario, detecta tus
          lagunas y te programa repasos para que lo aprendido no se te olvide.
        </Text>
      </View>
    </View>
  );
}

const makeStyles = (colors: ThemeColors): ReturnType<typeof StyleSheet.create> =>
  StyleSheet.create({
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
