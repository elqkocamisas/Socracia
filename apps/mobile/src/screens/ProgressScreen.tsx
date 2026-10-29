import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { ProgressOverview } from '@socracia/core';

import { EmptyState, ErrorNotice, LoadingState, ProgressBar } from '../components/States';
import type { AppServices } from '../services/appServices';
import { colors, radius, spacing } from '../theme/tokens';

/** Progreso con la sugerencia de siguiente acción. */
export type ProgressView = ProgressOverview & { readonly hint: string };

/** Propiedades de la pantalla de progreso. */
export interface ProgressScreenProps {
  readonly services: AppServices;
  /** Reloj inyectable para pruebas deterministas. */
  readonly now?: () => number;
  /** Vuelve al listado de documentos para seguir importando. */
  readonly onBack?: () => void;
}

type ScreenState =
  | { readonly kind: 'cargando' }
  | { readonly kind: 'listo'; readonly view: ProgressView }
  | { readonly kind: 'error'; readonly message: string };

/**
 * Pantalla de progreso.
 *
 * Muestra el dominio alcanzado, las lagunas detectadas con su severidad y el
 * repaso pendiente. No calcula nada: pinta la vista que devuelve el núcleo.
 */
export function ProgressScreen({
  services,
  now = Date.now,
  onBack,
}: ProgressScreenProps): React.JSX.Element {
  const [state, setState] = useState<ScreenState>({ kind: 'cargando' });

  const refresh = useCallback(async () => {
    setState({ kind: 'cargando' });
    try {
      const view = await services.session.overview(now());
      setState({ kind: 'listo', view });
    } catch {
      setState({ kind: 'error', message: 'No se pudo cargar tu progreso. Inténtalo de nuevo.' });
    }
  }, [services, now]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (state.kind === 'cargando') {
    return (
      <View style={styles.container}>
        <LoadingState message="Calculando tu progreso…" />
      </View>
    );
  }

  if (state.kind === 'error') {
    return (
      <View style={styles.container}>
        <ErrorNotice message={state.message} />
        <Pressable accessibilityRole="button" onPress={refresh} style={styles.button}>
          <Text style={styles.buttonLabel}>Reintentar</Text>
        </Pressable>
      </View>
    );
  }

  const { mastery, gaps, dueForReview, hint } = state.view;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Tu progreso</Text>

      {mastery.conceptsTracked === 0 ? (
        <EmptyState
          title="Aún sin temario"
          body="Adjunta un documento para empezar a generar preguntas y medir tu dominio."
          actionLabel={onBack ? 'Adjuntar temario' : undefined}
          onAction={onBack}
        />
      ) : (
        <>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Dominio</Text>
            <Text style={styles.big}>{mastery.masteredPercent}%</Text>
            <ProgressBar percent={mastery.masteredPercent} />
            <Text style={styles.cardBody}>
              {mastery.conceptsMastered} dominados · {mastery.conceptsInGap} con lagunas ·{' '}
              {mastery.conceptsNotEvaluated} sin evaluar
            </Text>
          </View>

          <View style={styles.hint}>
            <Text style={styles.hintText}>{hint}</Text>
          </View>

          <Text style={styles.sectionTitle}>Lagunas detectadas</Text>
          {gaps.length === 0 ? (
            <Text style={styles.muted}>Sin lagunas por ahora.</Text>
          ) : (
            gaps.map((gap) => (
              <View key={gap.conceptId} style={styles.card}>
                <Text style={styles.cardTitle}>{gap.conceptLabel}</Text>
                <ProgressBar percent={gap.severity * 100} />
                <Text style={styles.cardBody}>{gap.rationale}</Text>
              </View>
            ))
          )}

          <Text style={styles.sectionTitle}>Repaso pendiente</Text>
          {dueForReview.length === 0 ? (
            <Text style={styles.muted}>Nada que repasar hoy.</Text>
          ) : (
            dueForReview.map((review) => (
              <View key={review.conceptId} style={styles.row}>
                <Text style={styles.rowText}>{review.conceptLabel}</Text>
                <Text style={styles.rowMeta}>
                  {review.repetitions === 0
                    ? 'primera vez'
                    : `${review.repetitions} repaso(s) · intervalo ${review.intervalDays} d`}
                </Text>
              </View>
            ))
          )}
        </>
      )}
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
    paddingTop: spacing.xl * 1.5,
    gap: spacing.md,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 32,
    fontWeight: '700',
  },
  sectionTitle: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: spacing.md,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  cardTitle: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  big: {
    color: colors.textPrimary,
    fontSize: 40,
    fontWeight: '700',
  },
  cardBody: {
    color: colors.textPrimary,
    fontSize: 14,
    lineHeight: 20,
  },
  hint: {
    backgroundColor: colors.surface,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
    borderRadius: radius.sm,
    padding: spacing.md,
  },
  hintText: {
    color: colors.textPrimary,
    fontSize: 15,
    lineHeight: 22,
  },
  muted: {
    color: colors.textSecondary,
    fontSize: 15,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  rowText: {
    color: colors.textPrimary,
    fontSize: 15,
  },
  rowMeta: {
    color: colors.textSecondary,
    fontSize: 13,
  },
  button: {
    marginTop: spacing.md,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  buttonLabel: {
    color: colors.primaryContrast,
    fontSize: 16,
    fontWeight: '600',
  },
});
