import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Comprueba que la configuración de build y tienda es coherente y que los
 * assets que declara existen.
 *
 * Son fallos que solo aparecerían al lanzar `eas build` (y ya en la nube, con
 * coste de tiempo): aquí se detectan en local.
 */
const MOBILE = join(__dirname, '..', '..');

function readJson<T>(name: string): T {
  return JSON.parse(readFileSync(join(MOBILE, name), 'utf8')) as T;
}

interface SplashPlugin extends Array<unknown> {
  0: 'expo-splash-screen';
  1: { image: string };
}

interface ExpoConfig {
  name: string;
  slug: string;
  version: string;
  icon: string;
  ios: {
    bundleIdentifier: string;
    icon: string;
    infoPlist: { ITSAppUsesNonExemptEncryption: boolean };
    privacyManifests: {
      NSPrivacyTracking: boolean;
      NSPrivacyCollectedDataTypes: unknown[];
      NSPrivacyAccessedAPITypes: Array<{
        NSPrivacyAccessedAPIType: string;
        NSPrivacyAccessedAPITypeReasons: string[];
      }>;
    };
  };
  android: {
    package: string;
    icon: string;
    adaptiveIcon: { foregroundImage: string };
    blockedPermissions: string[];
  };
  web: { favicon: string };
  plugins: Array<string | SplashPlugin>;
}

interface EasConfig {
  build: {
    production: {
      developmentClient?: boolean;
      autoIncrement?: boolean;
      android: { buildType: string };
      env?: Record<string, string>;
    };
    'release-apk': {
      extends: string;
      distribution: string;
      android: { buildType: string };
      env?: Record<string, string>;
    };
  };
  submit: { production: { android: { track: string } } };
}

const appJson = readJson<{ expo: ExpoConfig }>('app.json');
const easJson = readJson<EasConfig>('eas.json');
const pkg = readJson<{ version: string }>('package.json');

describe('Configuración de build y tienda', () => {
  const expo = appJson.expo;

  it('declara identificadores de paquete válidos y estables', () => {
    expect(expo.ios.bundleIdentifier).toBe('com.socracia.app');
    expect(expo.android.package).toBe('com.socracia.app');
    expect(expo.slug).toBe('socracia');
  });

  it('la versión de app.json coincide con la del paquete', () => {
    expect(expo.version).toBe(pkg.version);
  });

  it('todos los assets declarados existen en disco', () => {
    const splash = expo.plugins.find(
      (p): p is SplashPlugin => Array.isArray(p) && p[0] === 'expo-splash-screen',
    );
    expect(splash).toBeDefined();
    const declared = [
      expo.icon,
      expo.ios.icon,
      expo.android.icon,
      expo.android.adaptiveIcon.foregroundImage,
      expo.web.favicon,
      splash![1].image,
    ];
    for (const asset of declared) {
      expect(existsSync(join(MOBILE, asset))).toBe(true);
    }
  });

  it('declara que no usa cifrado no exento (evita el aviso de exportación en iOS)', () => {
    expect(expo.ios.infoPlist.ITSAppUsesNonExemptEncryption).toBe(false);
  });

  it('declara el manifiesto de privacidad de iOS sin seguimiento', () => {
    const manifest = expo.ios.privacyManifests;
    expect(manifest.NSPrivacyTracking).toBe(false);
    expect(manifest.NSPrivacyCollectedDataTypes).toEqual([]);
    // Apple exige justificar cada API sensible que se use.
    expect(manifest.NSPrivacyAccessedAPITypes.length).toBeGreaterThan(0);
    for (const entry of manifest.NSPrivacyAccessedAPITypes) {
      expect(entry.NSPrivacyAccessedAPITypeReasons.length).toBeGreaterThan(0);
    }
  });

  it('no bloquea permisos de red (la cuenta opcional los necesita)', () => {
    const blocked: string[] = expo.android.blockedPermissions ?? [];
    expect(blocked).not.toContain('android.permission.INTERNET');
    // Sí bloquea lo que la app no usa: menos superficie para el usuario.
    expect(blocked).toContain('android.permission.ACCESS_FINE_LOCATION');
    expect(blocked).toContain('android.permission.CAMERA');
  });

  it('eas.json define el perfil de producción que exige la tienda', () => {
    const production = easJson.build.production;
    // Google Play exige AAB, no APK.
    expect(production.android.buildType).toBe('app-bundle');
    expect(production.autoIncrement).toBe(true);
    expect(easJson.submit.production.android.track).toBe('internal');
  });

  it('el perfil de producción no incluye el cliente de desarrollo', () => {
    expect(easJson.build.production.developmentClient).toBeUndefined();
  });

  it('define un perfil de APK de lanzamiento para distribución interna', () => {
    const apk = easJson.build['release-apk'];
    // Extiende de producción (mismo canal, autoIncrement) pero entrega un APK
    // instalable, no un AAB: es lo que exige la prueba en dispositivo.
    expect(apk.extends).toBe('production');
    expect(apk.distribution).toBe('internal');
    expect(apk.android.buildType).toBe('apk');
  });

  it('el APK de lanzamiento activa el motor semántico (modo conectado)', () => {
    // El motor con modelo está en el código, pero solo se ofrece si el bundle
    // trae `EXPO_PUBLIC_CLOUD_PROCESSING=1`. Sin esta variable el APK queda en
    // modo heurístico local y el ajuste «Cuenta → Privacidad» desaparece: el
    // motor existiría sin llegar nunca al usuario. La prueba lo fija para que
    // no se degrade en silencio. El perfil `release-apk` hereda la variable de
    // `production` (fuente única, D-059), así que se resuelve la herencia.
    const production = easJson.build.production;
    const apk = easJson.build['release-apk'];
    const effective = { ...production.env, ...apk.env };
    expect(effective.EXPO_PUBLIC_CLOUD_PROCESSING).toBe('1');
  });
});
