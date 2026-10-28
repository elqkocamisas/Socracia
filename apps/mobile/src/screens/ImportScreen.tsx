import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { KnowledgeDocument } from '@socracia/core';

import { importDocument, type AppServices } from '../services/appServices';
import { UNSUPPORTED_MESSAGE } from '../services/documentImport';
import { colors, radius, spacing } from '../theme/tokens';

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
 * Cubre el primer paso del recorrido del Sprint 2: adjuntar un PDF, TXT o MD,
 * ver el resultado de la ingesta y la lista de documentos ya incorporados. La
 * conversación mayéutica llega en el Sprint 3.
 */
export function ImportScreen({
  services,
  now = Date.now,
  onStudy,
}: ImportScreenProps): React.JSX.Element {
  const [state, setState] = useState<ScreenState>({ kind: 'cargando' });

  const refresh = useCallback(async () => {
    const documents = await services.storage.documents.listDocuments();
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

      {state.kind === 'error' ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{state.message}</Text>
        </View>
      ) : null}

      {documents.length === 0 ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Sin documentos</Text>
          <Text style={styles.cardBody}>
            Adjunta un PDF, TXT o MD con tu temario. El texto se procesa en tu dispositivo y no sale
            de él.
          </Text>
        </View>
      ) : (
        documents.map((document) => (
          <View key={document.id} style={styles.card}>
            <Text style={styles.cardTitle}>{document.title}</Text>
            <Text style={styles.cardBody}>
              {document.mimeType} · {formatBytes(document.sizeBytes)} · procesado en el dispositivo
            </Text>
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

const styles = StyleSheet.create({
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
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonLabel: {
    color: colors.primaryContrast,
    fontSize: 16,
    fontWeight: '600',
  },
  errorBox: {
    marginTop: spacing.md,
    backgroundColor: colors.surface,
    borderLeftWidth: 3,
    borderLeftColor: colors.accent,
    borderRadius: radius.sm,
    padding: spacing.md,
  },
  errorText: {
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
  studyButton: {
    marginTop: spacing.md,
    alignSelf: 'flex-start',
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  studyLabel: {
    color: colors.primaryContrast,
    fontSize: 15,
    fontWeight: '600',
  },
});
