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
  options: { compress: boolean } = { compress: true },
): Uint8Array {
  const content = lines
    .map((line, index) => `BT /F1 12 Tf 72 ${720 - index * 20} Td (${escapePdf(line)}) Tj ET`)
    .join('\n');

  const contentBytes = Buffer.from(content, 'latin1');
  const streamData = options.compress ? deflateSync(contentBytes) : contentBytes;
  const filter = options.compress ? ' /Filter /FlateDecode' : '';

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
