import { useCallback, useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { openDatabaseAsync } from 'expo-sqlite';
import { inMemoryStorage } from '@socracia/core';

import { ImportScreen } from './src/screens/ImportScreen';
import { ProgressScreen } from './src/screens/ProgressScreen';
import { StudyScreen } from './src/screens/StudyScreen';
import { bootstrap, createServices, type AppServices } from './src/services/appServices';
import { ExpoDocumentPicker, ExpoFileReader } from './src/services/expoAdapters';
import { colors, radius, spacing } from './src/theme/tokens';

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

/** Pantalla activa. La navegación del MVP es una máquina de estados explícita. */
type Route =
  | { readonly name: 'biblioteca' }
  | { readonly name: 'estudio'; readonly documentId: string }
  | { readonly name: 'progreso' };

export default function App(): React.JSX.Element {
  const [boot, setBoot] = useState<BootState>({ kind: 'arrancando' });
  const [route, setRoute] = useState<Route>({ name: 'biblioteca' });

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

  const goTo = useCallback((next: Route) => setRoute(next), []);

  if (boot.kind === 'arrancando') {
    return (
      <View style={styles.centered}>
        <StatusBar style="light" />
        <ActivityIndicator color={colors.primary} />
        <Text style={styles.muted}>Preparando Socracia…</Text>
      </View>
    );
  }

  const { services, degraded } = boot;

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      {degraded ? (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>
            Modo sin guardado: el progreso no se conservará al cerrar la app.
          </Text>
        </View>
      ) : null}

      <View style={styles.body}>
        {route.name === 'biblioteca' ? (
          <ImportScreen
            services={services}
            onStudy={(documentId) => goTo({ name: 'estudio', documentId })}
          />
        ) : null}
        {route.name === 'estudio' ? (
          <StudyScreen
            services={services}
            documentId={route.documentId}
            onFinish={() => goTo({ name: 'progreso' })}
          />
        ) : null}
        {route.name === 'progreso' ? (
          <ProgressScreen services={services} onBack={() => goTo({ name: 'biblioteca' })} />
        ) : null}
      </View>

      <View style={styles.tabs}>
        <TabButton
          label="Biblioteca"
          active={route.name === 'biblioteca'}
          onPress={() => goTo({ name: 'biblioteca' })}
        />
        <TabButton
          label="Progreso"
          active={route.name === 'progreso'}
          onPress={() => goTo({ name: 'progreso' })}
        />
      </View>
    </View>
  );
}

function TabButton({
  label,
  active,
  onPress,
}: {
  readonly label: string;
  readonly active: boolean;
  readonly onPress: () => void;
}): React.JSX.Element {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={styles.tab}
    >
      <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  body: {
    flex: 1,
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
  banner: {
    backgroundColor: colors.surface,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  bannerText: {
    color: colors.textSecondary,
    fontSize: 13,
  },
  tabs: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  tab: {
    flex: 1,
    paddingVertical: spacing.md,
    alignItems: 'center',
    borderRadius: radius.sm,
  },
  tabLabel: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  tabLabelActive: {
    color: colors.primary,
  },
});
