import { deflateSync } from 'node:zlib';

/**
 * Construye un PDF mínimo válido en memoria para las pruebas.
 *
 * Genera un objeto de contenido con operadores `Tj` reales, opcionalmente
 * comprimido con FlateDecode, de modo que las pruebas ejerciten el extractor
 * sin depender de binarios ni de red.
 */
export function buildPdf(
  lines: readonly string[],
  options: { compress: boolean; ascii85?: boolean } = { compress: true },
): Uint8Array {
  const content = lines
    .map((line, index) => `BT /F1 12 Tf 72 ${720 - index * 20} Td (${escapePdf(line)}) Tj ET`)
    .join('\n');

  const contentBytes = Buffer.from(content, 'latin1');
  let streamData: Uint8Array = options.compress ? deflateSync(contentBytes) : contentBytes;
  let filter = options.compress ? ' /Filter /FlateDecode' : '';
  if (options.ascii85) {
    streamData = ascii85Encode(streamData);
    filter = options.compress
      ? ' /Filter [ /ASCII85Decode /FlateDecode ]'
      : ' /Filter /ASCII85Decode';
  }

  const objects: string[] = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>\nendobj\n',
  ];

  const header = '%PDF-1.4\n';
  const beforeStream = header + objects.join('');
  const streamObj = `4 0 obj\n<< /Length ${streamData.length}${filter} >>\nstream\n`;
  const afterStream = '\nendstream\nendobj\n';
  const fontObj = '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n';

  const bytes = Buffer.concat([
    Buffer.from(beforeStream + streamObj, 'latin1'),
    streamData,
    Buffer.from(afterStream + fontObj, 'latin1'),
  ]);
  return new Uint8Array(bytes);
}

function escapePdf(text: string): string {
  return text.replace(/([\\()])/g, '\\$1');
}

/** Codifica en ASCII85 como hace PDF (`<~…~>`), para probar cadenas de filtros. */
function ascii85Encode(data: Uint8Array): Buffer {
  let out = '<~';
  for (let i = 0; i < data.length; i += 4) {
    const chunk = data.subarray(i, Math.min(i + 4, data.length));
    let tuple = 0;
    for (let j = 0; j < 4; j += 1) {
      tuple = tuple * 256 + (j < chunk.length ? (chunk[j] as number) : 0);
    }
    if (chunk.length === 4 && tuple === 0) {
      out += 'z';
      continue;
    }
    const group: string[] = [];
    for (let j = 0; j < 5; j += 1) {
      group.unshift(String.fromCharCode(33 + (tuple % 85)));
      tuple = Math.floor(tuple / 85);
    }
    out += group.join('').slice(0, chunk.length + 1);
  }
  return Buffer.from(`${out}~>`, 'latin1');
}

/**
 * Construye un PDF como los que emiten Word, Chrome o LaTeX: cada línea es un
 * array `TJ` con kerning, que es el modo que un extractor que solo mire `Tj`
 * no reconoce.
 */
export function buildPdfWithTjArrays(
  lines: readonly string[],
  options: { compress: boolean; ascii85?: boolean } = { compress: true },
): Uint8Array {
  const content = lines
    .map((line, index) => {
      const parts = line.split(' ');
      const array = parts.map((part) => `(${escapePdf(part)}) -250`).join(' ');
      return `BT /F1 12 Tf 72 ${720 - index * 20} Td [${array}] TJ ET`;
    })
    .join('\n');

  const contentBytes = Buffer.from(content, 'latin1');
  let streamData: Uint8Array = options.compress ? deflateSync(contentBytes) : contentBytes;
  let filter = options.compress ? ' /Filter /FlateDecode' : '';
  if (options.ascii85) {
    streamData = ascii85Encode(streamData);
    filter = options.compress
      ? ' /Filter [ /ASCII85Decode /FlateDecode ]'
      : ' /Filter /ASCII85Decode';
  }

  const header = '%PDF-1.4\n';
  const objects =
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n' +
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n' +
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>\nendobj\n';
  const streamObj = `4 0 obj\n<< /Length ${streamData.length}${filter} >>\nstream\n`;
  const afterStream =
    '\nendstream\nendobj\n' +
    '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n';

  const bytes = Buffer.concat([
    Buffer.from(header + objects + streamObj, 'latin1'),
    streamData,
    Buffer.from(afterStream, 'latin1'),
  ]);
  return new Uint8Array(bytes);
}
