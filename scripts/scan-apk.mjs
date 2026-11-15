#!/usr/bin/env node
/**
 * Inspecciona un APK en busca de secretos embebidos (puerta G5).
 *
 * Un APK es un ZIP: el código de la app vive en `assets/index.android.bundle`.
 * Este script abre el archivo, recorre el bundle y los recursos de texto, y
 * busca patrones de credencial (claves de API, tokens, claves privadas). Falla
 * con código 1 si encuentra alguno, de modo que sirve como puerta automática.
 *
 * También confirma que el bundle apunta al backend desplegado y **no** a
 * `localhost`, señal de que el build conectado quedó bien configurado.
 *
 * Uso:
 *   node scripts/scan-apk.mjs <ruta.apk>
 */

import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { inflateRawSync, inflateSync } from 'node:zlib';

const PATTERNS = [
  { name: 'Google API key', re: /AIza[0-9A-Za-z_-]{35}/g },
  { name: 'OpenAI key', re: /sk-[A-Za-z0-9]{20,}/g },
  { name: 'GitHub PAT', re: /github_pat_[A-Za-z0-9_]{20,}/g },
  { name: 'GitHub token', re: /gh[pousr]_[A-Za-z0-9]{20,}/g },
  { name: 'AWS access key', re: /AKIA[0-9A-Z]{16}/g },
  { name: 'PEM private key', re: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g },
  {
    name: 'JWT',
    re: /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
  },
];

/** Localiza el final del directorio central y recorre las entradas del ZIP. */
function* entries(buffer) {
  const eocd = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) throw new Error('No es un ZIP/APK válido: falta el EOCD.');
  let offset = buffer.readUInt32LE(eocd + 16);
  const total = buffer.readUInt16LE(eocd + 10);
  for (let i = 0; i < total; i += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) break;
    const method = buffer.readUInt16LE(offset + 10);
    const compressed = buffer.readUInt32LE(offset + 20);
    const nameLen = buffer.readUInt16LE(offset + 28);
    const extraLen = buffer.readUInt16LE(offset + 30);
    const commentLen = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString('utf8', offset + 46, offset + 46 + nameLen);
    yield { name, method, compressed, localOffset };
    offset += 46 + nameLen + extraLen + commentLen;
  }
}

function readEntry(buffer, entry) {
  const local = entry.localOffset;
  if (buffer.readUInt32LE(local) !== 0x04034b50) return null;
  const nameLen = buffer.readUInt16LE(local + 26);
  const extraLen = buffer.readUInt16LE(local + 28);
  const start = local + 30 + nameLen + extraLen;
  const raw = buffer.subarray(start, start + entry.compressed);
  if (entry.method === 0) return raw;
  if (entry.method === 8) {
    for (const fn of [inflateSync, inflateRawSync]) {
      try {
        return fn(raw);
      } catch {
        /* prueba el siguiente formato */
      }
    }
  }
  return null;
}

const apkPath = process.argv[2];
if (!apkPath) {
  console.error('Uso: node scripts/scan-apk.mjs <ruta.apk>');
  process.exit(2);
}

const buffer = readFileSync(apkPath);
const findings = [];
let bundleName = null;
let scanned = 0;

for (const entry of entries(buffer)) {
  const textLike =
    entry.name.endsWith('.bundle') ||
    entry.name.endsWith('.json') ||
    entry.name.endsWith('.js') ||
    entry.name.endsWith('.txt');
  if (!textLike) continue;
  const data = readEntry(buffer, entry);
  if (!data) continue;
  scanned += 1;
  const text = data.toString('latin1');
  for (const { name, re } of PATTERNS) {
    const matches = text.match(re);
    if (matches) {
      for (const m of matches) findings.push({ file: entry.name, name, sample: m.slice(0, 12) });
    }
  }
  if (entry.name.endsWith('index.android.bundle')) bundleName = entry.name;
}

const bundle = bundleName
  ? readEntry(
      buffer,
      [...entries(buffer)].find((e) => e.name === bundleName),
    ).toString('latin1')
  : '';

console.log(`APK: ${basename(apkPath)} (${(buffer.length / 1024 / 1024).toFixed(1)} MB)`);
console.log(`Entradas de texto escaneadas: ${scanned}`);
console.log(`Bundle: ${bundleName ?? 'no encontrado'}`);
console.log(
  `Apunta a socracia.onrender.com: ${bundle.includes('socracia.onrender.com') ? 'sí' : 'no'}`,
);
console.log(
  `Contiene localhost:8787: ${bundle.includes('localhost:8787') ? 'SÍ (revisar)' : 'no'}`,
);
console.log(`Coincidencias de secreto: ${findings.length}`);
for (const f of findings) console.log(`  - ${f.name} en ${f.file}: ${f.sample}…`);

process.exit(findings.length === 0 ? 0 : 1);
