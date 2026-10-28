import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import type { StudyViewState } from '@socracia/core';

import { ErrorNotice, LoadingState, ProgressBar } from '../components/States';
import type { AppServices } from '../services/appServices';
import { colors, radius, spacing } from '../theme/tokens';

/** Propiedades de la pantalla de estudio. */
export interface StudyScreenProps {
  readonly services: AppServices;
  /** Documento sobre el que se estudia. */
  readonly documentId: string;
  /** Reloj inyectable para pruebas deterministas. */
  readonly now?: () => number;
  /** Se invoca al pulsar «Ver progreso» al terminar la sesión. */
  readonly onFinish?: () => void;
}

type ScreenState =
  | { readonly kind: 'cargando' }
  | { readonly kind: 'activa'; readonly view: StudyViewState }
  | { readonly kind: 'error'; readonly message: string };

const VERDICT_LABEL: Record<string, string> = {
  correcta: 'Correcto',
  parcial: 'Casi',
  incorrecta: 'Revisa',
  'sin-respuesta': 'Sin respuesta',
};

/**
 * Pantalla de conversación mayéutica.
 *
 * Muestra la pregunta, recoge la respuesta, presenta el feedback y el
 * andamiaje, y avanza hasta cerrar la sesión. Toda la lógica vive en el
 * controlador del núcleo; aquí solo se pinta el estado y se capturan gestos.
 */
export function StudyScreen({
  services,
  documentId,
  now = Date.now,
  onFinish,
}: StudyScreenProps): React.JSX.Element {
  const [state, setState] = useState<ScreenState>({ kind: 'cargando' });
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const startedAt = useRef(now());

  const startSession = useCallback(async () => {
    setState({ kind: 'cargando' });
    const result = await services.session.start(documentId, now(), `sess-${documentId}-${now()}`);
    if (!result.ok) {
      setState({ kind: 'error', message: result.error.message });
      return;
    }
    startedAt.current = now();
    setState({ kind: 'activa', view: result.value });
  }, [services, documentId, now]);

  useEffect(() => {
    void startSession();
  }, [startSession]);

  const onSubmit = useCallback(async () => {
    if (state.kind !== 'activa' || busy) {
      return;
    }
    setBusy(true);
    const latency = now() - startedAt.current;
    const result = await services.session.answer(draft, latency, now());
    setDraft('');
    startedAt.current = now();
    setBusy(false);
    if (!result.ok) {
      setState({ kind: 'error', message: result.error.message });
      return;
    }
    setState({ kind: 'activa', view: result.value });
  }, [services, state, draft, busy, now]);

  if (state.kind === 'cargando') {
    return (
      <View style={styles.container}>
        <LoadingState message="Preparando tus preguntas…" />
      </View>
    );
  }

  if (state.kind === 'error') {
    return (
      <View style={styles.container}>
        <ErrorNotice message={state.message} />
        <Pressable accessibilityRole="button" onPress={startSession} style={styles.primaryButton}>
          <Text style={styles.primaryLabel}>Reintentar</Text>
        </Pressable>
      </View>
    );
  }

  const { view } = state;
  const answeredPercent =
    view.progress.total === 0 ? 0 : (view.progress.answered / view.progress.total) * 100;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.header}>
        <Text style={styles.counter}>
          {view.progress.answered} / {view.progress.total} respuestas
        </Text>
        <ProgressBar percent={answeredPercent} />
      </View>

      {view.phase === 'terminada' ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Sesión completada</Text>
          <Text style={styles.cardBody}>
            Dominio medio {(view.progress.averageScore * 100).toFixed(0)}%. Revisa tu progreso para
            ver las lagunas y qué repasar.
          </Text>
          {onFinish ? (
            <Pressable accessibilityRole="button" onPress={onFinish} style={styles.primaryButton}>
              <Text style={styles.primaryLabel}>Ver progreso</Text>
            </Pressable>
          ) : null}
        </View>
      ) : (
        <>
          {view.conceptLabel ? <Text style={styles.concept}>{view.conceptLabel}</Text> : null}

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Pregunta</Text>
            <Text style={styles.question}>{view.question?.prompt}</Text>
            {view.citation ? (
              <Text style={styles.citation}>
                Fuente: {view.citation.documentTitle} · «{truncate(view.citation.excerpt, 140)}»
              </Text>
            ) : null}
          </View>

          {view.feedback ? (
            <View style={styles.feedback}>
              <Text style={styles.feedbackLabel}>
                {view.verdict ? VERDICT_LABEL[view.verdict] : 'Evaluación'}
              </Text>
              <Text style={styles.feedbackText}>{view.feedback}</Text>
            </View>
          ) : null}

          {view.scaffold ? (
            <View style={styles.scaffold}>
              <Text style={styles.scaffoldLabel}>Pista para pensar</Text>
              <Text style={styles.scaffoldText}>{view.scaffold.prompt}</Text>
            </View>
          ) : null}

          <TextInput
            accessibilityLabel="Tu respuesta"
            multiline
            placeholder="Escribe tu respuesta con tus propias palabras…"
            placeholderTextColor={colors.textSecondary}
            value={draft}
            onChangeText={setDraft}
            style={styles.input}
          />

          <Pressable
            accessibilityRole="button"
            onPress={onSubmit}
            disabled={busy || draft.trim().length === 0}
            style={[styles.primaryButton, (busy || draft.trim().length === 0) && styles.disabled]}
          >
            {busy ? (
              <ActivityIndicator color={colors.primaryContrast} />
            ) : (
              <Text style={styles.primaryLabel}>
                {view.scaffold ? 'Responder de nuevo' : 'Enviar respuesta'}
              </Text>
            )}
          </Pressable>
        </>
      )}
    </ScrollView>
  );
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max).trimEnd()}…`;
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
  header: {
    gap: spacing.sm,
  },
  counter: {
    color: colors.textSecondary,
    fontSize: 13,
  },
  concept: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  cardTitle: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  question: {
    color: colors.textPrimary,
    fontSize: 18,
    lineHeight: 26,
    marginTop: spacing.sm,
  },
  citation: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: spacing.md,
    fontStyle: 'italic',
  },
  feedback: {
    backgroundColor: colors.surface,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
    borderRadius: radius.sm,
    padding: spacing.md,
  },
  feedbackLabel: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  feedbackText: {
    color: colors.textPrimary,
    fontSize: 15,
    marginTop: spacing.xs,
    lineHeight: 22,
  },
  scaffold: {
    backgroundColor: colors.surface,
    borderLeftWidth: 3,
    borderLeftColor: colors.accent,
    borderRadius: radius.sm,
    padding: spacing.md,
  },
  scaffoldLabel: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  scaffoldText: {
    color: colors.textPrimary,
    fontSize: 15,
    marginTop: spacing.xs,
    lineHeight: 22,
  },
  input: {
    minHeight: 110,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.textPrimary,
    fontSize: 15,
    padding: spacing.md,
    textAlignVertical: 'top',
  },
  cardBody: {
    color: colors.textPrimary,
    fontSize: 15,
    marginTop: spacing.sm,
    lineHeight: 22,
  },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  disabled: {
    opacity: 0.5,
  },
  primaryLabel: {
    color: colors.primaryContrast,
    fontSize: 16,
    fontWeight: '600',
  },
});
