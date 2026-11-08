import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import type { StudyViewState } from '@socracia/core';

import { EngineBadge } from '../components/EngineBadge';
import { ErrorNotice, LoadingState, ProgressBar } from '../components/States';
import type { AppServices } from '../services/appServices';
import { describeEngineStatus, type EngineStatusInput } from '../services/engineStatus';
import { useThemeColors } from '../theme/ThemeProvider';
import { minTouchTarget, radius, spacing, type ThemeColors } from '../theme/tokens';

/** Propiedades de la pantalla de estudio. */
export interface StudyScreenProps {
  readonly services: AppServices;
  /** Documento sobre el que se estudia. */
  readonly documentId: string;
  /** Reloj inyectable para pruebas deterministas. */
  readonly now?: () => number;
  /** Se invoca al pulsar «Ver progreso» al terminar la sesión. */
  readonly onFinish?: () => void;
  /** Se invoca al salir de la sesión (vuelve a la biblioteca). */
  readonly onExit?: () => void;
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

/** Icono por veredicto: el color no es la única señal. */
const VERDICT_ICON: Record<string, string> = {
  correcta: '✓',
  parcial: '≈',
  incorrecta: '✗',
  'sin-respuesta': '–',
};

/**
 * Pantalla de conversación mayéutica.
 *
 * Muestra la pregunta, recoge la respuesta, presenta el feedback y el
 * andamiaje, y avanza hasta cerrar la sesión. Toda la lógica vive en el
 * controlador del núcleo; aquí solo se pinta el estado y se capturan gestos.
 *
 * Al abrirse, si la nube está activa, sondea `/health` para despertar el
 * servidor y avisar del arranque en frío: sin ese aviso, el primer turno
 * parecería colgado. La insignia de motor refleja en todo momento quién
 * responde y por qué, sin degradaciones silenciosas.
 */
export function StudyScreen({
  services,
  documentId,
  now = Date.now,
  onFinish,
  onExit,
}: StudyScreenProps): React.JSX.Element {
  const colors = useThemeColors();
  const styles = makeStyles(colors);
  const [state, setState] = useState<ScreenState>({ kind: 'cargando' });
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [hintsShown, setHintsShown] = useState(0);
  const [confirmExit, setConfirmExit] = useState(false);
  const [documentConsent, setDocumentConsent] = useState(false);
  const [connectivity, setConnectivity] = useState<'ok' | 'offline' | 'waking' | 'unknown'>(
    'unknown',
  );
  const [providerConfigured, setProviderConfigured] = useState<boolean | null>(null);
  const startedAt = useRef(now());

  const startSession = useCallback(async () => {
    setState({ kind: 'cargando' });
    const result = await services.session.start(documentId, now(), `sess-${documentId}-${now()}`);
    if (!result.ok) {
      setState({ kind: 'error', message: result.error.message });
      return;
    }
    startedAt.current = now();
    setHintsShown(0);
    setState({ kind: 'activa', view: result.value });
  }, [services, documentId, now]);

  useEffect(() => {
    void startSession();
  }, [startSession]);

  useEffect(() => {
    let cancelled = false;
    void services.documentConsent(documentId).then((consent) => {
      if (!cancelled) {
        setDocumentConsent(consent);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [services, documentId]);

  // Calentamiento: solo tiene sentido si la nube está activa. Se muestra un
  // aviso mientras se espera, y si falla se marca la conexión como perdida para
  // que la insignia explique la degradación en lugar de callarla.
  const cloudActive =
    services.cloudAvailable &&
    services.hasSession() &&
    services.policy.current().mode === 'allow-cloud';
  const warmUp = useCallback(async () => {
    if (!cloudActive) {
      return;
    }
    setConnectivity('waking');
    const result = await services.health.check();
    if (result.ok) {
      setConnectivity('ok');
      setProviderConfigured(result.value.providerConfigured);
    } else {
      setConnectivity('offline');
    }
  }, [services, cloudActive]);

  useEffect(() => {
    void warmUp();
  }, [warmUp]);

  const onSubmit = useCallback(async () => {
    if (state.kind !== 'activa' || busy) {
      return;
    }
    setBusy(true);
    const latency = now() - startedAt.current;
    const result = await services.session.answer(draft, latency, now());
    setDraft('');
    startedAt.current = now();
    setHintsShown(0);
    setBusy(false);
    if (!result.ok) {
      setState({ kind: 'error', message: result.error.message });
      return;
    }
    setState({ kind: 'activa', view: result.value });
  }, [services, state, draft, busy, now]);

  const requestExit = useCallback(() => {
    if (draft.trim().length > 0) {
      setConfirmExit(true);
      return;
    }
    onExit?.();
  }, [draft, onExit]);

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

  const statusInput: EngineStatusInput = {
    cloudAvailable: services.cloudAvailable,
    hasSession: services.hasSession(),
    policyAllowsCloud: services.policy.current().mode === 'allow-cloud',
    documentConsent,
    connectivity,
    providerIssue: providerConfigured === false ? 'error' : null,
  };
  const engineStatus = describeEngineStatus(statusInput);
  const hints = view.scaffold?.hints ?? [];
  const visibleHints = hints.slice(0, hintsShown);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.headerRow}>
          <EngineBadge
            status={engineStatus}
            onRetry={() => void warmUp()}
            onAction={(action) => {
              if (action === 'Reintentar') {
                void warmUp();
              } else {
                onExit?.();
              }
            }}
          />
          {onExit ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Salir de la sesión"
              onPress={requestExit}
              style={styles.exitButton}
            >
              <Text style={styles.exitLabel}>Salir</Text>
            </Pressable>
          ) : null}
        </View>

        {cloudActive && connectivity === 'waking' ? (
          <View style={styles.waking}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.wakingText}>
              Despertando el servidor, puede tardar hasta un minuto. Mientras tanto responde el
              motor local.
            </Text>
          </View>
        ) : null}

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
              Dominio medio {(view.progress.averageScore * 100).toFixed(0)}%. Revisa tu progreso
              para ver las lagunas y qué repasar.
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
                <View style={styles.citationBox}>
                  <Text style={styles.citationLabel}>Fuente: {view.citation.documentTitle}</Text>
                  <Text style={styles.citationText}>«{truncate(view.citation.excerpt, 200)}»</Text>
                </View>
              ) : null}
            </View>

            {view.feedback ? (
              <View
                style={[
                  styles.feedback,
                  view.verdict === 'correcta' ? styles.feedbackOk : styles.feedbackWarn,
                ]}
              >
                <Text
                  style={[
                    styles.feedbackLabel,
                    view.verdict === 'correcta' ? styles.labelOk : styles.labelWarn,
                  ]}
                >
                  {view.verdict ? `${VERDICT_ICON[view.verdict] ?? ''} ` : ''}
                  {view.verdict ? VERDICT_LABEL[view.verdict] : 'Evaluación'}
                </Text>
                <Text style={styles.feedbackText}>{view.feedback}</Text>
              </View>
            ) : null}

            {view.scaffold ? (
              <View style={styles.scaffold}>
                <Text style={styles.scaffoldLabel}>Pista para pensar</Text>
                <Text style={styles.scaffoldText}>{view.scaffold.prompt}</Text>
                {visibleHints.map((hint, index) => (
                  <Text key={hint} style={styles.hintText}>
                    {index + 2}. {hint}
                  </Text>
                ))}
                {hintsShown < hints.length ? (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setHintsShown(hintsShown + 1)}
                    style={styles.hintButton}
                  >
                    <Text style={styles.hintButtonLabel}>
                      Ver pista {hintsShown + 2}/{hints.length + 1}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}

            {view.explanation ? (
              <View style={styles.explanation}>
                <Text style={styles.explanationLabel}>Te lo explico</Text>
                <Text style={styles.explanationText}>{view.explanation}</Text>
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

      {confirmExit ? (
        <View style={styles.confirmOverlay}>
          <View style={styles.confirmCard}>
            <Text style={styles.confirmTitle}>Tienes una respuesta sin enviar</Text>
            <Text style={styles.confirmBody}>
              Si sales ahora, se perderá lo que has escrito. ¿Quieres salir igualmente?
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => setConfirmExit(false)}
              style={styles.primaryButton}
            >
              <Text style={styles.primaryLabel}>Seguir aquí</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setConfirmExit(false);
                onExit?.();
              }}
              style={styles.secondaryButton}
            >
              <Text style={styles.secondaryLabel}>Salir sin enviar</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max).trimEnd()}…`;
}

const makeStyles = (colors: ThemeColors): ReturnType<typeof StyleSheet.create> =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    content: {
      padding: spacing.lg,
      paddingTop: spacing.xl * 1.5,
      gap: spacing.md,
    },
    headerRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    exitButton: {
      paddingHorizontal: spacing.sm,
      minHeight: minTouchTarget,
      justifyContent: 'center',
    },
    exitLabel: {
      color: colors.textSecondary,
      fontSize: 15,
      fontWeight: '600',
    },
    waking: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      backgroundColor: colors.surface,
      borderRadius: radius.sm,
      padding: spacing.md,
    },
    wakingText: {
      flex: 1,
      color: colors.textSecondary,
      fontSize: 14,
      lineHeight: 20,
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
      fontSize: 19,
      lineHeight: 28,
      marginTop: spacing.sm,
    },
    citationBox: {
      marginTop: spacing.md,
      backgroundColor: colors.surfaceAlt,
      borderLeftWidth: 3,
      borderLeftColor: colors.accent,
      borderRadius: radius.sm,
      padding: spacing.md,
    },
    citationLabel: {
      color: colors.textSecondary,
      fontSize: 12,
      fontWeight: '600',
    },
    citationText: {
      color: colors.textPrimary,
      fontSize: 13,
      fontStyle: 'italic',
      marginTop: spacing.xs,
      lineHeight: 20,
    },
    feedback: {
      backgroundColor: colors.surface,
      borderLeftWidth: 3,
      borderRadius: radius.sm,
      padding: spacing.md,
    },
    feedbackOk: {
      borderLeftColor: colors.success,
    },
    feedbackWarn: {
      borderLeftColor: colors.danger,
    },
    feedbackLabel: {
      fontSize: 12,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 1,
    },
    labelOk: {
      color: colors.success,
    },
    labelWarn: {
      color: colors.danger,
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
    hintText: {
      color: colors.textSecondary,
      fontSize: 14,
      marginTop: spacing.xs,
      lineHeight: 20,
    },
    hintButton: {
      marginTop: spacing.sm,
      minHeight: minTouchTarget,
      justifyContent: 'center',
    },
    hintButtonLabel: {
      color: colors.primary,
      fontSize: 14,
      fontWeight: '600',
    },
    explanation: {
      backgroundColor: colors.surface,
      borderLeftWidth: 3,
      borderLeftColor: colors.primary,
      borderRadius: radius.sm,
      padding: spacing.md,
    },
    explanationLabel: {
      color: colors.primary,
      fontSize: 12,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 1,
    },
    explanationText: {
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
      fontSize: 16,
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
      minHeight: minTouchTarget,
    },
    disabled: {
      opacity: 0.5,
    },
    primaryLabel: {
      color: colors.primaryContrast,
      fontSize: 16,
      fontWeight: '600',
    },
    secondaryButton: {
      paddingVertical: spacing.md,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: minTouchTarget,
    },
    secondaryLabel: {
      color: colors.primary,
      fontSize: 15,
      fontWeight: '600',
    },
    confirmOverlay: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: colors.overlay,
      justifyContent: 'center',
      padding: spacing.lg,
    },
    confirmCard: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      padding: spacing.lg,
      gap: spacing.sm,
    },
    confirmTitle: {
      color: colors.textPrimary,
      fontSize: 20,
      fontWeight: '700',
    },
    confirmBody: {
      color: colors.textSecondary,
      fontSize: 15,
      lineHeight: 22,
    },
  });
