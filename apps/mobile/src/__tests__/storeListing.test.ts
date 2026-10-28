import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Comprueba los límites reales de las fichas de tienda.
 *
 * App Store Connect y Play Console rechazan la subida si un campo se pasa de
 * longitud, y lo hacen después de subir el binario. Aquí se detecta antes.
 */
const STORE = join(__dirname, '..', '..', 'store');

interface Listing {
  app: { nombre: string; bundleId: string; version: string };
  appStore: {
    nombre: string;
    subtitulo: string;
    textoPromocional: string;
    descripcion: string;
    palabrasClave: string;
    urlSoporte: string;
    urlPrivacidad: string;
  };
  googlePlay: {
    titulo: string;
    descripcionCorta: string;
    descripcionCompleta: string;
    correoContacto: string;
    urlPrivacidad: string;
  };
  capturas: { appStore: string[]; googlePlay: string[] };
}

interface Declarations {
  appStore: {
    seguimiento: boolean;
    datosUsadosParaSeguimiento: unknown[];
    datosVinculadosAlUsuario: Array<{ tipo: string; recogido: boolean }>;
  };
  googlePlay: {
    comparteConTerceros: boolean;
    datosCifradosEnTransito: boolean;
    tipos: Array<{ recogido: boolean; compartido: boolean }>;
    noRecogidos: string[];
  };
}

const listing = JSON.parse(
  readFileSync(join(STORE, 'listing.json'), 'utf8'),
) as Listing;
const declarations = JSON.parse(
  readFileSync(join(STORE, 'privacy-declarations.json'), 'utf8'),
) as Declarations;

/** Longitudes máximas que imponen las tiendas. */
const LIMITES = {
  appStoreNombre: 30,
  appStoreSubtitulo: 30,
  appStoreTextoPromocional: 170,
  appStoreDescripcion: 4000,
  appStorePalabrasClave: 100,
  playTitulo: 30,
  playDescripcionCorta: 80,
  playDescripcionCompleta: 4000,
};

function longitud(texto: string): number {
  // Las tiendas cuentan caracteres, no bytes: «ó» es uno, no dos.
  return [...texto].length;
}

describe('Ficha de tienda', () => {
  it('la identidad de la app es coherente con app.json', () => {
    const appJson = JSON.parse(
      readFileSync(join(__dirname, '..', '..', 'app.json'), 'utf8'),
    ) as { expo: { version: string; ios: { bundleIdentifier: string } } };
    expect(listing.app.version).toBe(appJson.expo.version);
    expect(listing.app.bundleId).toBe(appJson.expo.ios.bundleIdentifier);
  });

  it('los campos de App Store caben en sus límites', () => {
    expect(longitud(listing.appStore.nombre)).toBeLessThanOrEqual(LIMITES.appStoreNombre);
    expect(longitud(listing.appStore.subtitulo)).toBeLessThanOrEqual(
      LIMITES.appStoreSubtitulo,
    );
    expect(longitud(listing.appStore.textoPromocional)).toBeLessThanOrEqual(
      LIMITES.appStoreTextoPromocional,
    );
    expect(longitud(listing.appStore.descripcion)).toBeLessThanOrEqual(
      LIMITES.appStoreDescripcion,
    );
    expect(longitud(listing.appStore.palabrasClave)).toBeLessThanOrEqual(
      LIMITES.appStorePalabrasClave,
    );
  });

  it('los campos de Google Play caben en sus límites', () => {
    expect(longitud(listing.googlePlay.titulo)).toBeLessThanOrEqual(LIMITES.playTitulo);
    expect(longitud(listing.googlePlay.descripcionCorta)).toBeLessThanOrEqual(
      LIMITES.playDescripcionCorta,
    );
    expect(longitud(listing.googlePlay.descripcionCompleta)).toBeLessThanOrEqual(
      LIMITES.playDescripcionCompleta,
    );
  });

  it('todas las URL de la ficha son HTTPS', () => {
    const urls = [
      listing.appStore.urlSoporte,
      listing.appStore.urlPrivacidad,
      listing.googlePlay.urlPrivacidad,
    ];
    for (const url of urls) {
      expect(url.startsWith('https://')).toBe(true);
    }
  });

  it('el correo de contacto de Play tiene forma válida', () => {
    expect(listing.googlePlay.correoContacto).toMatch(/^[^@\s]+@[^@\s]+\.[^@\s]+$/);
  });

  it('se declaran capturas para ambas tiendas', () => {
    expect(listing.capturas.appStore.length).toBeGreaterThanOrEqual(3);
    expect(listing.capturas.googlePlay.length).toBeGreaterThanOrEqual(3);
  });
});

describe('Declaraciones de privacidad', () => {
  it('declara que la app no hace seguimiento', () => {
    expect(declarations.appStore.seguimiento).toBe(false);
    expect(declarations.appStore.datosUsadosParaSeguimiento).toEqual([]);
  });

  it('solo declara datos que la app realmente trata', () => {
    const tipos = declarations.appStore.datosVinculadosAlUsuario.map((d) => d.tipo);
    expect(tipos.some((t) => t.includes('Email'))).toBe(true);
    // Los documentos no se declaran como recogidos porque no salen del dispositivo.
    expect(tipos.some((t) => /Document/i.test(t))).toBe(false);
  });

  it('en Play declara el correo y el progreso, y nada compartido con terceros', () => {
    expect(declarations.googlePlay.comparteConTerceros).toBe(false);
    expect(declarations.googlePlay.datosCifradosEnTransito).toBe(true);
    for (const tipo of declarations.googlePlay.tipos) {
      expect(tipo.recogido).toBe(true);
      expect(tipo.compartido).toBe(false);
    }
    expect(declarations.googlePlay.tipos.length).toBeGreaterThanOrEqual(2);
  });

  it('marca como no recogidos los datos sensibles que la app no usa', () => {
    const noRecogidos = declarations.googlePlay.noRecogidos.join(' | ');
    for (const dato of ['Ubicación', 'Salud', 'Contactos', 'Fotos']) {
      expect(noRecogidos).toContain(dato);
    }
  });
});
