import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { KnowledgeDocument } from '@socracia/core';

import { deleteDocument, importDocument, type AppServices } from '../services/appServices';
import { UNSUPPORTED_MESSAGE } from '../services/documentImport';
import { useThemeColors } from '../theme/ThemeProvider';
import { minTouchTarget, radius, spacing, type ThemeColors } from '../theme/tokens';

/** Estado de la pantalla. */
type ScreenState =
  | { readonly kind: 'cargando' }
  | { readonly kind: 'listo'; readonly documents: readonly KnowledgeDocument[] }
  | { readonly kind: 'importando' }
  | { readonly kind: 'error'; readonly message: string };

/** Propiedades de la pantalla de importación. */
export interface ImportScreenProps {
  readonly services: AppServices;
  /** Reloj inyectable para que la pantalla sea determinista en pruebas. */
  readonly now?: () => number;
  /** Abre la sesión mayéutica sobre un documento ya importado. */
  readonly onStudy?: (documentId: string) => void;
}

/**
 * Pantalla de importación de documentos.
 *
 * Cubre el primer paso del recorrido: adjuntar un PDF, TXT o MD (o una imagen,
 * que se lee por OCR con consentimiento), ver el resultado de la ingesta y
 * gestionar la lista de documentos ya incorporados.
 * Cada documento puede autorizarse (o no) para la nube por separado, sin
 * cambiar el valor por defecto, que es local.
 */
export function ImportScreen({
  services,
  now = Date.now,
  onStudy,
}: ImportScreenProps): React.JSX.Element {
  const colors = useThemeColors();
  const styles = makeStyles(colors);
  const [state, setState] = useState<ScreenState>({ kind: 'cargando' });
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [consent, setConsent] = useState<Record<string, boolean>>({});

  const refresh = useCallback(async () => {
    const documents = await services.storage.documents.listDocuments();
    const next: Record<string, boolean> = {};
    for (const document of documents) {
      next[document.id] = document.cloudConsent;
    }
    setConsent(next);
    setState({ kind: 'listo', documents });
  }, [services]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onImport = useCallback(async () => {
    setState({ kind: 'importando' });
    const picked = await services.picker.pick();
    if (!picked) {
      await refresh();
      return;
    }
    const result = await importDocument(services, picked, now());
    if (!result.ok) {
      setState({
        kind: 'error',
        message: result.error.message || UNSUPPORTED_MESSAGE,
      });
      return;
    }
    await refresh();
  }, [services, refresh, now]);

  const onConfirmDelete = useCallback(
    async (documentId: string) => {
      setState({ kind: 'importando' });
      const result = await deleteDocument(services, documentId);
      setPendingDeleteId(null);
      if (!result.ok) {
        setState({ kind: 'error', message: result.error.message });
        return;
      }
      await refresh();
    },
    [services, refresh],
  );

  const onToggleConsent = useCallback(
    async (documentId: string, next: boolean) => {
      const granted = await services.setDocumentConsent(documentId, next);
      setConsent((prev) => ({ ...prev, [documentId]: granted }));
    },
    [services],
  );

  if (state.kind === 'cargando') {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primary} />
        <Text style={styles.muted}>Cargando tu biblioteca…</Text>
      </View>
    );
  }

  const documents = state.kind === 'listo' ? state.documents : [];
  const busy = state.kind === 'importando';
  const cloudAvailable = services.cloudAvailable;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Socracia</Text>
      <Text style={styles.subtitle}>
        Aprende por mayéutica: preguntas guiadas sobre tu propio temario.
      </Text>

      <Pressable
        accessibilityRole="button"
        onPress={onImport}
        disabled={busy}
        style={[styles.button, busy && styles.buttonDisabled]}
      >
        <Text style={styles.buttonLabel}>{busy ? 'Procesando…' : 'Adjuntar temario'}</Text>
      </Pressable>

      {busy ? (
        <View style={styles.progressRow}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.muted}>Leyendo y analizando el documento…</Text>
        </View>
      ) : null}

      {state.kind === 'error' ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorIcon} accessibilityElementsHidden>
            ⚠︎
          </Text>
          <Text style={styles.errorText}>{state.message}</Text>
        </View>
      ) : null}

      {documents.length === 0 ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Sin documentos</Text>
          <Text style={styles.cardBody}>
            Adjunta un PDF, TXT o MD con tu temario. El texto se procesa en tu dispositivo y no sale
            de él. Una imagen o un PDF escaneado se leen por OCR con tu consentimiento.
          </Text>
        </View>
      ) : (
        documents.map((document) => (
          <View key={document.id} style={styles.card}>
            <Text style={styles.cardTitle}>{document.title}</Text>
            <Text style={styles.cardBody}>
              {document.mimeType} · {formatBytes(document.sizeBytes)}
            </Text>

            {cloudAvailable ? (
              <Pressable
                accessibilityRole="switch"
                accessibilityLabel={`Permitir procesar ${document.title} en la nube`}
                accessibilityState={{ checked: consent[document.id] === true }}
                onPress={() => void onToggleConsent(document.id, consent[document.id] !== true)}
                style={styles.consentRow}
              >
                <Text style={styles.consentLabel}>
                  {consent[document.id] ? '☁︎ Autorizado para la nube' : '⚙︎ Solo en el dispositivo'}
                </Text>
              </Pressable>
            ) : (
              <Text style={styles.consentStatic}>⚙︎ Procesado en el dispositivo</Text>
            )}

            {onStudy ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Estudiar ${document.title}`}
                onPress={() => onStudy(document.id)}
                style={styles.studyButton}
              >
                <Text style={styles.studyLabel}>Estudiar</Text>
              </Pressable>
            ) : null}

            {pendingDeleteId === document.id ? (
              <View style={styles.confirmRow}>
                <Text style={styles.confirmText}>
                  Se borrarán su texto, su progreso y sus lagunas. No se puede deshacer.
                </Text>
                <View style={styles.confirmButtons}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Confirmar borrado de ${document.title}`}
                    onPress={() => void onConfirmDelete(document.id)}
                    disabled={busy}
                    style={[styles.dangerButton, busy && styles.buttonDisabled]}
                  >
                    <Text style={styles.dangerLabel}>Sí, eliminar</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setPendingDeleteId(null)}
                    style={styles.cancelButton}
                  >
                    <Text style={styles.cancelLabel}>Cancelar</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Eliminar ${document.title}`}
                onPress={() => setPendingDeleteId(document.id)}
                style={styles.deleteButton}
              >
                <Text style={styles.deleteLabel}>Eliminar</Text>
              </Pressable>
            )}
          </View>
        ))
      )}
    </ScrollView>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const makeStyles = (colors: ThemeColors): ReturnType<typeof StyleSheet.create> =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    content: {
      padding: spacing.lg,
      paddingTop: spacing.xl * 2,
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
      fontSize: 40,
      fontWeight: '700',
      letterSpacing: 0.5,
    },
    subtitle: {
      color: colors.textSecondary,
      fontSize: 16,
      marginTop: spacing.sm,
    },
    button: {
      marginTop: spacing.xl,
      backgroundColor: colors.primary,
      borderRadius: radius.md,
      paddingVertical: spacing.md,
      alignItems: 'center',
      minHeight: minTouchTarget,
      justifyContent: 'center',
    },
    buttonDisabled: {
      opacity: 0.6,
    },
    buttonLabel: {
      color: colors.primaryContrast,
      fontSize: 16,
      fontWeight: '600',
    },
    progressRow: {
      marginTop: spacing.md,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    errorBox: {
      marginTop: spacing.md,
      flexDirection: 'row',
      gap: spacing.sm,
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
    consentRow: {
      marginTop: spacing.sm,
      minHeight: minTouchTarget,
      justifyContent: 'center',
    },
    consentLabel: {
      color: colors.primary,
      fontSize: 14,
      fontWeight: '600',
    },
    consentStatic: {
      color: colors.textSecondary,
      fontSize: 14,
      marginTop: spacing.sm,
    },
    studyButton: {
      marginTop: spacing.md,
      alignSelf: 'flex-start',
      backgroundColor: colors.primary,
      borderRadius: radius.md,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.lg,
      minHeight: minTouchTarget,
      justifyContent: 'center',
    },
    studyLabel: {
      color: colors.primaryContrast,
      fontSize: 15,
      fontWeight: '600',
    },
    deleteButton: {
      paddingVertical: spacing.sm,
      alignItems: 'center',
      minHeight: minTouchTarget,
      justifyContent: 'center',
    },
    deleteLabel: {
      color: colors.danger,
      fontSize: 14,
      fontWeight: '600',
    },
    confirmRow: {
      marginTop: spacing.sm,
      gap: spacing.sm,
    },
    confirmText: {
      color: colors.textSecondary,
      fontSize: 13,
    },
    confirmButtons: {
      flexDirection: 'row',
      gap: spacing.sm,
    },
    dangerButton: {
      flex: 1,
      paddingVertical: spacing.sm,
      alignItems: 'center',
      borderRadius: radius.sm,
      backgroundColor: colors.danger,
      minHeight: minTouchTarget,
      justifyContent: 'center',
    },
    dangerLabel: {
      color: colors.dangerContrast,
      fontSize: 14,
      fontWeight: '700',
    },
    cancelButton: {
      flex: 1,
      paddingVertical: spacing.sm,
      alignItems: 'center',
      borderRadius: radius.sm,
      backgroundColor: colors.surface,
      minHeight: minTouchTarget,
      justifyContent: 'center',
    },
    cancelLabel: {
      color: colors.textPrimary,
      fontSize: 14,
      fontWeight: '600',
    },
  });
