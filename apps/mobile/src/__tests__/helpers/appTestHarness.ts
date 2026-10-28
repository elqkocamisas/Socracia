import { inMemoryStorage, ok, type StoragePort } from '@socracia/core';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import {
  createServices,
  importDocument,
  rehydrateIndex,
  type AppServices,
} from '../../services/appServices';
import type {
  DocumentPickerPort,
  FileBytesReader,
  PickedFile,
} from '../../services/documentImport';

const encoder = new TextEncoder();

export const NOW = 1_700_000_000_000;

export const TEMARIO = `Tema 1. El acto administrativo

El acto administrativo es la declaración unilateral de voluntad de la Administración sujeta al derecho administrativo. La notificación consiste en la comunicación formal del acto al interesado para que despliegue efectos.

Tema 2. Los recursos administrativos

El recurso de alzada es el que se interpone ante el órgano superior jerárquico. La revisión de oficio permite anular actos nulos de pleno derecho.`;

const NO_PICKER: DocumentPickerPort = { pick: async () => null };

/** Servicios de prueba sobre almacenamiento en memoria, sin plataforma. */
export function makeServices(storage: StoragePort = inMemoryStorage()): AppServices {
  const reader: FileBytesReader = { read: async () => ok(encoder.encode(TEMARIO)) };
  return createServices({ storage, picker: NO_PICKER, reader });
}

/**
 * Simula cerrar y reabrir la app: servicios nuevos sobre el mismo almacén.
 *
 * El índice vectorial vive en memoria, así que un arranque real empieza con él
 * vacío y lo reconstruye desde los fragmentos persistidos. Esta función
 * reproduce ese arranque para poder probar la rehidratación.
 */
export async function restartServices(storage: StoragePort): Promise<AppServices> {
  const services = makeServices(storage);
  await rehydrateIndex(services);
  return services;
}

/** Importa el temario de prueba y devuelve el identificador del documento. */
export async function importTemario(services: AppServices, now: number = NOW): Promise<string> {
  const file: PickedFile = {
    name: 'temario.txt',
    mimeType: 'text/plain',
    uri: 'file:///temario.txt',
    sizeBytes: TEMARIO.length,
  };
  const result = await importDocument(services, file, now);
  if (!result.ok) {
    throw new Error(`no se pudo importar: ${result.error.message}`);
  }
  return result.value.documentId;
}

/**
 * Escribe en el campo de respuesta y espera a que el valor se refleje.
 *
 * En React 19, `fireEvent.changeText` no actualiza `props.value` de forma
 * síncrona: hay que esperar a que el estado del componente se aplique antes de
 * pulsar enviar, o el manejador leería el borrador vacío.
 */
export async function typeAnswer(text: string): Promise<void> {
  fireEvent.changeText(screen.getByLabelText('Tu respuesta'), text);
  await waitFor(() => expect(screen.getByLabelText('Tu respuesta').props.value).toBe(text));
}

/** Pulsa «Enviar respuesta» y espera a que el contador de respuestas suba. */
export async function submitAnswer(expectedAnswered: number): Promise<void> {
  fireEvent.press(screen.getByText('Enviar respuesta'));
  await waitFor(() =>
    expect(screen.getByText(new RegExp(`^${expectedAnswered} / \\d+ respuestas$`))).toBeTruthy(),
  );
}
