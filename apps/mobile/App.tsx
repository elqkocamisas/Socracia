import { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { openDatabaseAsync } from 'expo-sqlite';
import { inMemoryStorage } from '@socracia/core';

import { ImportScreen } from './src/screens/ImportScreen';
import { bootstrap, createServices, type AppServices } from './src/services/appServices';
import { ExpoDocumentPicker, ExpoFileReader } from './src/services/expoAdapters';
import { colors, spacing } from './src/theme/tokens';

/**
 * Arranca los servicios sobre SQLite y cae a memoria si la base no abre.
 *
 * Nunca se bloquea el arranque de la app por un fallo de almacenamiento: en el
 * peor caso el usuario puede trabajar sin persistencia y verá la advertencia.
 */
async function startServices(): Promise<{ services: AppServices; degraded: boolean }> {
  const picker = new ExpoDocumentPicker();
  const reader = new ExpoFileReader();
  try {
    const services = await bootstrap({ picker, reader, openDatabase: openDatabaseAsync });
    return { services, degraded: false };
  } catch {
    return {
      services: createServices({ storage: inMemoryStorage(), picker, reader }),
      degraded: true,
    };
  }
}

type BootState =
  | { readonly kind: 'arrancando' }
  | { readonly kind: 'listo'; readonly services: AppServices; readonly degraded: boolean };

export default function App(): React.JSX.Element {
  const [boot, setBoot] = useState<BootState>({ kind: 'arrancando' });

  useEffect(() => {
    let cancelled = false;
    void startServices().then((result) => {
      if (!cancelled) {
        setBoot({ kind: 'listo', services: result.services, degraded: result.degraded });
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (boot.kind === 'arrancando') {
    return (
      <View style={styles.centered}>
        <StatusBar style="light" />
        <ActivityIndicator color={colors.primary} />
        <Text style={styles.muted}>Preparando Socracia…</Text>
      </View>
    );
  }

  return (
    <>
      <StatusBar style="light" />
      {boot.degraded ? (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>
            Modo sin guardado: el progreso no se conservará al cerrar la app.
          </Text>
        </View>
      ) : null}
      <ImportScreen services={boot.services} />
    </>
  );
}

const styles = StyleSheet.create({
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
  banner: {
    backgroundColor: colors.surface,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  bannerText: {
    color: colors.textSecondary,
    fontSize: 13,
  },
});
