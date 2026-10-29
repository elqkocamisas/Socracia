import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { inMemoryStorage, ok, err } from '@socracia/core';

import { ImportScreen } from '../screens/ImportScreen';
import { createServices } from '../services/appServices';
import type { DocumentPickerPort, FileBytesReader, PickedFile } from '../services/documentImport';

const encoder = new TextEncoder();
const NOW = 1_700_000_000_000;

const TEMARIO = `Tema 1. El acto administrativo

El acto administrativo es la declaración unilateral de voluntad de la Administración sujeta al derecho administrativo. La notificación consiste en la comunicación formal del acto al interesado para que despliegue efectos.`;

function services(pickerFile: PickedFile | null, bytes: Uint8Array) {
  const picker: DocumentPickerPort = { pick: async () => pickerFile };
  const reader: FileBytesReader = { read: async () => ok(bytes) };
  return createServices({ storage: inMemoryStorage(), picker, reader });
}

describe('ImportScreen', () => {
  it('muestra el estado vacío antes de adjuntar nada', async () => {
    await render(<ImportScreen services={services(null, new Uint8Array())} now={() => NOW} />);
    await waitFor(() => expect(screen.getByText('Sin documentos')).toBeTruthy());
    expect(screen.getByText(/procesa en tu dispositivo/i)).toBeTruthy();
  });

  it('adjunta un temario y lo muestra en la lista', async () => {
    const app = services(
      {
        name: 'temario.txt',
        mimeType: 'text/plain',
        uri: 'file:///t.txt',
        sizeBytes: TEMARIO.length,
      },
      encoder.encode(TEMARIO),
    );
    await render(<ImportScreen services={app} now={() => NOW} />);
    await waitFor(() => expect(screen.getByText('Sin documentos')).toBeTruthy());

    fireEvent.press(screen.getByText('Adjuntar temario'));

    await waitFor(() => expect(screen.getByText('temario')).toBeTruthy());
    expect(screen.queryByText('Sin documentos')).toBeNull();
  });

  it('vuelve al estado previo si el usuario cancela el selector', async () => {
    await render(<ImportScreen services={services(null, new Uint8Array())} now={() => NOW} />);
    await waitFor(() => expect(screen.getByText('Sin documentos')).toBeTruthy());

    fireEvent.press(screen.getByText('Adjuntar temario'));

    await waitFor(() => expect(screen.getByText('Adjuntar temario')).toBeTruthy());
    expect(screen.getByText('Sin documentos')).toBeTruthy();
  });

  it('muestra un error legible si el formato no está soportado', async () => {
    const app = services(
      { name: 'notas.xls', mimeType: 'application/vnd.ms-excel', uri: 'u', sizeBytes: 10 },
      encoder.encode('x'),
    );
    await render(<ImportScreen services={app} now={() => NOW} />);
    await waitFor(() => expect(screen.getByText('Sin documentos')).toBeTruthy());

    fireEvent.press(screen.getByText('Adjuntar temario'));

    await waitFor(() => expect(screen.getByText(/PDF, TXT o MD/i)).toBeTruthy());
  });

  it('muestra un error legible si la lectura del archivo falla', async () => {
    const picker: DocumentPickerPort = {
      pick: async () => ({
        name: 'temario.pdf',
        mimeType: 'application/pdf',
        uri: 'u',
        sizeBytes: 10,
      }),
    };
    const reader: FileBytesReader = { read: async () => err<Error>(new Error('io')) };
    const app = createServices({ storage: inMemoryStorage(), picker, reader });

    await render(<ImportScreen services={app} now={() => NOW} />);
    await waitFor(() => expect(screen.getByText('Sin documentos')).toBeTruthy());

    fireEvent.press(screen.getByText('Adjuntar temario'));

    await waitFor(() => expect(screen.getByText(/No se pudo leer/i)).toBeTruthy());
  });
});

describe('ImportScreen: acceso al estudio', () => {
  it('ofrece estudiar un documento importado y avisa al llamante', async () => {
    const app = services(
      {
        name: 'temario.txt',
        mimeType: 'text/plain',
        uri: 'file:///t.txt',
        sizeBytes: TEMARIO.length,
      },
      encoder.encode(TEMARIO),
    );
    let studied: string | null = null;
    await render(<ImportScreen services={app} now={() => NOW} onStudy={(id) => (studied = id)} />);
    await waitFor(() => expect(screen.getByText('Sin documentos')).toBeTruthy());

    fireEvent.press(screen.getByText('Adjuntar temario'));
    await waitFor(() => expect(screen.getByText('Estudiar')).toBeTruthy());

    fireEvent.press(screen.getByText('Estudiar'));
    expect(studied).not.toBeNull();
  });

  it('sin manejador de estudio no muestra el botón', async () => {
    const app = services(
      {
        name: 'temario.txt',
        mimeType: 'text/plain',
        uri: 'file:///t.txt',
        sizeBytes: TEMARIO.length,
      },
      encoder.encode(TEMARIO),
    );
    await render(<ImportScreen services={app} now={() => NOW} />);
    await waitFor(() => expect(screen.getByText('Sin documentos')).toBeTruthy());
    fireEvent.press(screen.getByText('Adjuntar temario'));
    await waitFor(() => expect(screen.getByText('temario')).toBeTruthy());
    expect(screen.queryByText('Estudiar')).toBeNull();
  });

  it('elimina un documento tras confirmar y lo quita de la lista', async () => {
    const app = services(
      {
        name: 'temario.txt',
        mimeType: 'text/plain',
        uri: 'file:///t.txt',
        sizeBytes: TEMARIO.length,
      },
      encoder.encode(TEMARIO),
    );
    await render(<ImportScreen services={app} now={() => NOW} />);
    await waitFor(() => expect(screen.getByText('Sin documentos')).toBeTruthy());
    fireEvent.press(screen.getByText('Adjuntar temario'));
    await waitFor(() => expect(screen.getByText('temario')).toBeTruthy());

    fireEvent.press(screen.getByLabelText('Eliminar temario'));
    // El borrado pide confirmación: no debe ejecutarse al primer toque.
    await waitFor(() => expect(screen.getByText(/No se puede deshacer/)).toBeTruthy());
    expect(await app.storage.documents.listDocuments()).toHaveLength(1);

    fireEvent.press(screen.getByLabelText('Confirmar borrado de temario'));

    await waitFor(() => expect(screen.getByText('Sin documentos')).toBeTruthy());
    expect(await app.storage.documents.listDocuments()).toHaveLength(0);
  });

  it('cancelar la confirmación conserva el documento', async () => {
    const app = services(
      {
        name: 'temario.txt',
        mimeType: 'text/plain',
        uri: 'file:///t.txt',
        sizeBytes: TEMARIO.length,
      },
      encoder.encode(TEMARIO),
    );
    await render(<ImportScreen services={app} now={() => NOW} />);
    await waitFor(() => expect(screen.getByText('Sin documentos')).toBeTruthy());
    fireEvent.press(screen.getByText('Adjuntar temario'));
    await waitFor(() => expect(screen.getByText('temario')).toBeTruthy());

    fireEvent.press(screen.getByLabelText('Eliminar temario'));
    await waitFor(() => expect(screen.getByText(/No se puede deshacer/)).toBeTruthy());
    fireEvent.press(screen.getByText('Cancelar'));

    await waitFor(() => expect(screen.getByText('temario')).toBeTruthy());
    expect(await app.storage.documents.listDocuments()).toHaveLength(1);
  });
});
