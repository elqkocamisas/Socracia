import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { LEGAL_DOCUMENTS, type LegalDocument } from '../legal/documents.generated';
import { findLegalDocument, parseLegalMarkdown, type LegalBlock } from '../legal/parseLegalMarkdown';
import { colors, radius, spacing } from '../theme/tokens';

/** Propiedades de la pantalla legal. */
export interface LegalScreenProps {
  /** Identificador del documento a mostrar: `privacidad` o `terminos`. */
  readonly documentId: string;
  readonly onBack: () => void;
  /** Documentos inyectables para las pruebas. */
  readonly documents?: readonly LegalDocument[];
}

/**
 * Muestra un documento legal dentro de la app.
 *
 * App Store exige que la política de privacidad sea accesible desde la propia
 * aplicación, no solo desde la ficha de la tienda. El texto no se copia aquí:
 * viene del módulo generado a partir de `docs/`, para que lo que lee el usuario
 * sea exactamente lo que se revisa en el repositorio.
 */
export function LegalScreen({
  documentId,
  onBack,
  documents = LEGAL_DOCUMENTS,
}: LegalScreenProps): React.JSX.Element {
  const document = findLegalDocument(documents, documentId);

  if (!document) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Documento no disponible</Text>
        <Text style={styles.muted}>
          No se encontró el documento «{documentId}». Vuelve atrás e inténtalo de nuevo.
        </Text>
        <Pressable accessibilityRole="button" onPress={onBack} style={styles.backButton}>
          <Text style={styles.backLabel}>Volver</Text>
        </Pressable>
      </View>
    );
  }

  const blocks = parseLegalMarkdown(document.body).filter(
    // El encabezado de nivel 1 se pinta como título de pantalla, así que se
    // omite aquí para no mostrarlo dos veces.
    (block) => block.kind !== 'heading' || block.level !== 1,
  );

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} testID="legal-scroll">
        <Text style={styles.title}>{document.heading || document.title}</Text>
        {blocks.map((block, index) => (
          <LegalBlockView key={`${block.kind}-${index}`} block={block} />
        ))}
      </ScrollView>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Volver"
        onPress={onBack}
        style={styles.backButton}
      >
        <Text style={styles.backLabel}>Volver</Text>
      </Pressable>
    </View>
  );
}

function LegalBlockView({ block }: { readonly block: LegalBlock }): React.JSX.Element {
  if (block.kind === 'heading') {
    return (
      <Text style={block.level === 1 ? styles.heading1 : styles.heading2}>{block.text}</Text>
    );
  }
  if (block.kind === 'bullets') {
    return (
      <View style={styles.bullets}>
        {block.items.map((item, index) => (
          <Text key={index} style={styles.bullet}>
            · {item}
          </Text>
        ))}
      </View>
    );
  }
  return <Text style={styles.paragraph}>{block.text}</Text>;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {
    padding: spacing.md,
    paddingBottom: spacing.xl,
    gap: spacing.sm,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 22,
    fontWeight: '700',
    marginBottom: spacing.sm,
  },
  heading1: {
    color: colors.textPrimary,
    fontSize: 20,
    fontWeight: '700',
    marginTop: spacing.md,
  },
  heading2: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: '700',
    marginTop: spacing.md,
  },
  paragraph: {
    color: colors.textSecondary,
    fontSize: 15,
    lineHeight: 22,
  },
  bullets: {
    gap: spacing.xs,
    paddingLeft: spacing.sm,
  },
  bullet: {
    color: colors.textSecondary,
    fontSize: 15,
    lineHeight: 22,
  },
  muted: {
    color: colors.textSecondary,
    fontSize: 15,
    marginBottom: spacing.md,
  },
  backButton: {
    margin: spacing.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  backLabel: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: '600',
  },
});
