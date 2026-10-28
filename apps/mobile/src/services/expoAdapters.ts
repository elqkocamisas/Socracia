import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';

import { err, ok, type Result } from '@socracia/core';

import {
  toUint8Array,
  type DocumentPickerPort,
  type FileBytesReader,
  type PickedFile,
} from './documentImport';

/**
 * Adaptadores reales de Expo.
 *
 * Aíslan el resto de la app de las APIs nativas: los servicios solo ven los
 * puertos `DocumentPickerPort` y `FileBytesReader`, así que pueden probarse en
 * Node sin arrancar un dispositivo.
 */

/** Selector de documentos del sistema. */
export class ExpoDocumentPicker implements DocumentPickerPort {
  public async pick(): Promise<PickedFile | null> {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'text/plain', 'text/markdown', 'text/*'],
      copyToCacheDirectory: true,
      multiple: false,
    });

    if (result.canceled) {
      return null;
    }
    const asset = result.assets[0];
    if (!asset) {
      return null;
    }
    return {
      name: asset.name,
      mimeType: asset.mimeType ?? '',
      uri: asset.uri,
      sizeBytes: asset.size ?? 0,
    };
  }
}

/** Lector de bytes de un archivo local con `expo-file-system`. */
export class ExpoFileReader implements FileBytesReader {
  public async read(uri: string): Promise<Result<Uint8Array>> {
    try {
      const file = new File(uri);
      const buffer = await file.arrayBuffer();
      return ok(toUint8Array(buffer));
    } catch (error) {
      return err<Error>(error instanceof Error ? error : new Error('lectura-fallida'));
    }
  }
}
