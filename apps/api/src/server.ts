import { readFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { join } from 'node:path';

import type {
  Citation,
  Concept,
  LlmProvider,
  ProgressSnapshot,
  Result,
  SocraticQuestion,
  UserAnswer,
} from '@socracia/core';

import { AuthService, type AuthResult } from './auth';
import { corsHeaders, type CorsOptions } from './cors';
import { routeLlmCompletion } from './llm';
import { createLlmProvider } from './llmProvider';
import { GeminiMayeuticService, type MayeuticAiService } from './mayeutic';
import { GeminiOcrService, MAX_OCR_BYTES, type MayeuticOcrService, type OcrInput } from './ocr';
import { InMemoryProgressStore, type ProgressStore } from './store';
import { isValidationError, parseSnapshot } from './validation';

/** Dependencias del servidor; inyectables para probarlo sin abrir un puerto. */
export interface ApiDependencies {
  readonly auth: AuthService;
  readonly store: ProgressStore;
  readonly mayeuticAi?: MayeuticAiService;
  /**
   * Proveedor de lenguaje. `null` en el MVP sin clave: la ruta responde 503 y
   * la app cae a su modo local, que es el comportamiento por defecto.
   */
  readonly llm?: LlmProvider | null;
  /**
   * OCR del servidor. `null` o ausente en builds sin proveedor: la ruta
   * responde 503 y la importación de imágenes degrada al extractor local.
   */
  readonly ocr?: MayeuticOcrService | null;
  /** Orígenes autorizados para el cliente web. Por defecto, cualquiera. */
  readonly cors?: CorsOptions;
}

/** Crea las dependencias por defecto del MVP. */
export function defaultDependencies(): ApiDependencies {
  return {
    auth: new AuthService(),
    store: new InMemoryProgressStore(),
    mayeuticAi: new GeminiMayeuticService(),
    // Sin `GEMINI_API_KEY` queda `null` y `/llm/complete` responde 503; con
    // clave, el modelo redacta la repregunta y la explicación (D-043).
    llm: createLlmProvider(),
    ocr: new GeminiOcrService(),
  };
}

// El OCR sube la imagen en base64 dentro del JSON, y base64 infla ~33 %: el
// tope del cuerpo debe cubrir 5 MiB de imagen ya codificados más el resto del
// objeto. Se fija en 8 MiB, que deja margen sin admitir cargas desmedidas.
const MAX_BODY_BYTES = 8 * 1024 * 1024;

/**
 * Construye el manejador de peticiones de la API.
 *
 * Es una función pura de `(petición) → (respuesta)` salvo por el estado de las
 * dependencias, así que se prueba con objetos `IncomingMessage` simulados, sin
 * sockets ni puertos.
 *
 * Rutas:
 * - `POST /auth/register` — alta de cuenta y emisión de token.
 * - `POST /auth/login`    — inicio de sesión.
 * - `POST /auth/logout`   — cierre de sesión.
 * - `DELETE /account`     — elimina la cuenta y su progreso (requisito de App Store).
 * - `POST /sync/push`     — sube la instantánea y devuelve la fusionada.
 * - `GET  /sync/pull`     — descarga la instantánea guardada.
 * - `POST /mayeutic/generate` — genera preguntas semánticas (requiere sesión).
 * - `POST /mayeutic/evaluate` — evalúa una respuesta (requiere sesión).
 * - `POST /mayeutic/ocr`  — reconoce texto de una imagen (requiere sesión).
 * - `GET  /health`        — comprobación de vida.
 */
export function createRequestHandler(
  deps: ApiDependencies,
): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  return async (req, res) => {
    try {
      await route(deps, req, res);
    } catch (error) {
      sendJson(res, 500, {
        error: 'servidor',
        message: error instanceof Error ? error.message : 'Error inesperado.',
      });
    }
  };
}

/** Servidor HTTP listo para `listen`. */
export function createApiServer(deps: ApiDependencies = defaultDependencies()): Server {
  return createServer(createRequestHandler(deps));
}

/** CORS por defecto: cualquier origen (ver `cors.ts` para el razonamiento). */
const DEFAULT_CORS: CorsOptions = { origins: '*' };

async function route(
  deps: ApiDependencies,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const method = req.method ?? 'GET';

  // Las cabeceras se fijan antes de responder: `sendJson` usa `writeHead`, que
  // Node fusiona con lo ya fijado, así que valen para todas las respuestas
  // (incluido el 404 y el 500) sin tocar cada llamada.
  for (const [name, value] of Object.entries(
    corsHeaders(req.headers.origin, deps.cors ?? DEFAULT_CORS),
  )) {
    res.setHeader(name, value);
  }

  // Preflight del cliente web: se responde aquí porque el enrutador no conoce
  // `OPTIONS` y sin esto toda petición con `Authorization` moría con un 404
  // antes de salir del navegador.
  if (method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (method === 'GET' && url.pathname === '/health') {
    sendJson(res, 200, {
      status: 'ok',
      version: API_VERSION,
      commit: process.env.RENDER_GIT_COMMIT ?? null,
      provider: providerStatus(deps),
      ocr: ocrStatus(deps),
    });
    return;
  }

  if (method === 'POST' && url.pathname === '/auth/register') {
    const body = await readJson(req);
    if (!isRecord(body) || typeof body.email !== 'string' || typeof body.password !== 'string') {
      sendJson(res, 400, { error: 'datos-invalidos', message: 'Faltan `email` o `password`.' });
      return;
    }
    const result = await deps.auth.register(body.email, body.password);
    sendAuthResult(res, result);
    return;
  }

  if (method === 'POST' && url.pathname === '/auth/login') {
    const body = await readJson(req);
    if (!isRecord(body) || typeof body.email !== 'string' || typeof body.password !== 'string') {
      sendJson(res, 400, { error: 'datos-invalidos', message: 'Faltan `email` o `password`.' });
      return;
    }
    const result = await deps.auth.login(body.email, body.password);
    sendAuthResult(res, result);
    return;
  }

  if (method === 'POST' && url.pathname === '/auth/logout') {
    const token = bearerToken(req);
    if (token) {
      deps.auth.logout(token);
    }
    sendJson(res, 200, { status: 'cerrado' });
    return;
  }

  if (method === 'DELETE' && url.pathname === '/account') {
    const token = bearerToken(req);
    if (!token) {
      sendJson(res, 401, { error: 'no-autorizado', message: 'Falta el token de sesión.' });
      return;
    }
    // Borra credenciales y progreso: App Store exige que eliminar la cuenta
    // elimine de verdad los datos, no solo que se cierre la sesión.
    const userId = deps.auth.deleteAccount(token);
    if (!userId) {
      sendJson(res, 401, { error: 'no-autorizado', message: 'La sesión no es válida.' });
      return;
    }
    await deps.store.remove(userId);
    sendJson(res, 200, { status: 'eliminada' });
    return;
  }

  if (method === 'POST' && url.pathname === '/sync/push') {
    const userId = authenticate(deps, req, res);
    if (!userId) {
      return;
    }
    const parsed = parseSnapshot(await readJson(req));
    if (isValidationError(parsed)) {
      sendJson(res, 400, { error: 'datos-invalidos', message: parsed.message });
      return;
    }
    // El servidor ignora el `userId` del cuerpo y usa el de la sesión: un
    // usuario no puede escribir el progreso de otro aunque manipule el JSON.
    const merged = await deps.store.merge(userId, { ...parsed, userId });
    sendJson(res, 200, merged);
    return;
  }

  if (method === 'GET' && url.pathname === '/sync/pull') {
    const userId = authenticate(deps, req, res);
    if (!userId) {
      return;
    }
    const snapshot = await deps.store.get(userId);
    sendJson(res, 200, snapshot ?? emptySnapshot(userId));
    return;
  }

  // Ruta semántica del motor de tutoría: un asistente opcional con Gemini.
  if (
    method === 'POST' &&
    (url.pathname === '/mayeutic/generate' || url.pathname === '/mayeutic/evaluate')
  ) {
    if (!authenticate(deps, req, res)) {
      return;
    }
    if (!deps.mayeuticAi) {
      sendJson(res, 503, {
        error: 'proveedor-no-configurado',
        message: 'El proveedor semántico no está configurado en el servidor.',
      });
      return;
    }

    const body = await readJson(req);
    if (url.pathname === '/mayeutic/generate') {
      const input = readGenerationInput(body);
      if (!input) {
        sendJson(res, 400, {
          error: 'datos-invalidos',
          message: 'El concepto, la cita y el número de preguntas no son válidos.',
        });
        return;
      }
      const result = await deps.mayeuticAi.generateQuestions(
        input.concept,
        input.citation,
        input.maxQuestions,
      );
      sendAiResult(res, result);
      return;
    }

    const input = readEvaluationInput(body);
    if (!input) {
      sendJson(res, 400, {
        error: 'datos-invalidos',
        message: 'La pregunta o la respuesta no son válidas.',
      });
      return;
    }
    const result = await deps.mayeuticAi.evaluateAnswer(input.question, input.answer);
    sendAiResult(res, result);
    return;
  }

  // OCR: reconoce texto de una imagen o de un PDF escaneado. Igual que el motor
  // semántico, exige sesión (es un recurso con coste) y responde 503 sin
  // proveedor, para que la importación del cliente degrade al extractor local.
  if (method === 'POST' && url.pathname === '/mayeutic/ocr') {
    if (!authenticate(deps, req, res)) {
      return;
    }
    if (!deps.ocr) {
      sendJson(res, 503, {
        error: 'ocr-no-configurado',
        message: 'El OCR no está configurado en el servidor.',
      });
      return;
    }

    const input = readOcrInput(await readJson(req));
    if (!input) {
      sendJson(res, 400, {
        error: 'datos-invalidos',
        message: 'La imagen o su tipo no son válidos.',
      });
      return;
    }
    const outcome = await deps.ocr.recognize(input);
    if (outcome.ok) {
      sendJson(res, 200, { text: outcome.text });
      return;
    }
    sendJson(res, 502, { error: 'ocr-fallido', message: outcome.message });
    return;
  }

  // El asistente con modelo exige sesión: es un recurso con coste y no debe
  // quedar abierto. La app funciona sin él, así que 401 aquí no rompe nada.
  if (method === 'POST' && url.pathname === '/llm/complete') {
    const userId = authenticate(deps, req, res);
    if (!userId) {
      return;
    }
    const outcome = await routeLlmCompletion(
      deps.llm ?? null,
      url.pathname,
      method,
      await readJson(req),
    );
    if (outcome.handled) {
      sendJson(res, outcome.status, outcome.payload);
      return;
    }
  }

  sendJson(res, 404, {
    error: 'no-encontrado',
    message: `Ruta desconocida: ${method} ${url.pathname}`,
  });
}

/**
 * Valida la entrada del OCR: tipo de imagen admitido y base64 con tamaño
 * acotado. Se decodifica el tamaño real antes de aceptar la petición para no
 * gastar cuota del proveedor con cargas enormes o mal formadas.
 */
function readOcrInput(value: unknown): OcrInput | null {
  if (!isRecord(value)) {
    return null;
  }
  const mimeType = value.mimeType;
  const imageBase64 = value.imageBase64;
  if (
    typeof mimeType !== 'string' ||
    !/^image\/[a-z0-9.+-]+$/i.test(mimeType) ||
    typeof imageBase64 !== 'string' ||
    imageBase64.length === 0
  ) {
    return null;
  }
  // Longitud aproximada de los bytes decodificados: base64 son 4 caracteres por
  // cada 3 bytes. Se comprueba antes de decodificar para no reservar memoria.
  const approxBytes = Math.floor((imageBase64.length * 3) / 4);
  if (approxBytes > MAX_OCR_BYTES) {
    return null;
  }
  return { mimeType, imageBase64 };
}

function sendAiResult<T>(res: ServerResponse, result: Result<T, Error>): void {
  if (result.ok) {
    sendJson(res, 200, result.value);
    return;
  }
  sendJson(res, 502, {
    error: 'proveedor-semantico',
    message: result.error.message,
  });
}

function readGenerationInput(
  value: unknown,
): { concept: Concept; citation: Citation; maxQuestions: number } | null {
  if (!isRecord(value) || !isRecord(value.concept) || !isRecord(value.citation)) {
    return null;
  }
  const { concept, citation } = value;
  if (
    typeof concept.id !== 'string' ||
    typeof concept.topicId !== 'string' ||
    typeof concept.label !== 'string' ||
    concept.label.length > 200 ||
    typeof concept.definition !== 'string' ||
    concept.definition.length > 2_000 ||
    !isStringArray(concept.keywords) ||
    concept.keywords.length > 30 ||
    concept.keywords.some((keyword) => keyword.length > 80) ||
    typeof citation.documentId !== 'string' ||
    typeof citation.documentTitle !== 'string' ||
    citation.documentTitle.length > 300 ||
    typeof citation.chunkId !== 'string' ||
    citation.chunkId.length > 300 ||
    typeof citation.excerpt !== 'string' ||
    citation.excerpt.length === 0 ||
    citation.excerpt.length > 12_000 ||
    typeof citation.charStart !== 'number' ||
    !Number.isFinite(citation.charStart) ||
    citation.charStart < 0 ||
    typeof citation.charEnd !== 'number' ||
    !Number.isFinite(citation.charEnd) ||
    citation.charEnd < citation.charStart ||
    typeof value.maxQuestions !== 'number' ||
    !Number.isInteger(value.maxQuestions) ||
    value.maxQuestions < 1 ||
    value.maxQuestions > 8
  ) {
    return null;
  }
  return {
    concept: {
      id: concept.id,
      topicId: concept.topicId,
      label: concept.label,
      definition: concept.definition,
      keywords: concept.keywords,
    },
    citation: {
      documentId: citation.documentId,
      documentTitle: citation.documentTitle,
      chunkId: citation.chunkId,
      excerpt: citation.excerpt,
      charStart: citation.charStart,
      charEnd: citation.charEnd,
    },
    maxQuestions: value.maxQuestions,
  };
}

function readEvaluationInput(
  value: unknown,
): { question: SocraticQuestion; answer: UserAnswer } | null {
  if (!isRecord(value) || !isRecord(value.question) || !isRecord(value.answer)) {
    return null;
  }
  const { question, answer } = value;
  const citation = question.citation;
  if (
    typeof question.id !== 'string' ||
    typeof question.conceptId !== 'string' ||
    typeof question.prompt !== 'string' ||
    question.prompt.length > 500 ||
    !isOneOf(question.move, [
      'definir',
      'problematizar',
      'contraejemplo',
      'causa',
      'consecuencia',
      'comparar',
      'justificar',
      'aplicar-caso',
    ]) ||
    !isOneOf(question.level, ['recordar', 'comprender', 'aplicar', 'analizar', 'evaluar']) ||
    typeof question.expectedAnswer !== 'string' ||
    question.expectedAnswer.length > 1_500 ||
    !isStringArray(question.keyTerms) ||
    question.keyTerms.length > 12 ||
    question.keyTerms.some((term) => term.length > 80) ||
    !isRecord(citation) ||
    typeof citation.documentId !== 'string' ||
    typeof citation.documentTitle !== 'string' ||
    citation.documentTitle.length > 300 ||
    typeof citation.chunkId !== 'string' ||
    citation.chunkId.length > 300 ||
    typeof citation.excerpt !== 'string' ||
    citation.excerpt.length > 12_000 ||
    typeof citation.charStart !== 'number' ||
    !Number.isFinite(citation.charStart) ||
    citation.charStart < 0 ||
    typeof citation.charEnd !== 'number' ||
    !Number.isFinite(citation.charEnd) ||
    citation.charEnd < citation.charStart ||
    typeof question.difficulty !== 'number' ||
    !Number.isFinite(question.difficulty) ||
    question.difficulty < 0 ||
    question.difficulty > 1 ||
    typeof answer.questionId !== 'string' ||
    answer.questionId !== question.id ||
    typeof answer.text !== 'string' ||
    answer.text.trim().length === 0 ||
    answer.text.length > 6_000 ||
    typeof answer.answeredAt !== 'number' ||
    !Number.isFinite(answer.answeredAt) ||
    typeof answer.latencyMs !== 'number' ||
    !Number.isFinite(answer.latencyMs) ||
    answer.latencyMs < 0
  ) {
    return null;
  }
  return {
    question: {
      id: question.id,
      conceptId: question.conceptId,
      prompt: question.prompt,
      move: question.move,
      level: question.level,
      expectedAnswer: question.expectedAnswer,
      keyTerms: question.keyTerms,
      citation: {
        documentId: citation.documentId,
        documentTitle: citation.documentTitle,
        chunkId: citation.chunkId,
        excerpt: citation.excerpt,
        charStart: citation.charStart,
        charEnd: citation.charEnd,
      },
      difficulty: question.difficulty,
    },
    answer: {
      questionId: answer.questionId,
      text: answer.text,
      answeredAt: answer.answeredAt,
      latencyMs: answer.latencyMs,
    },
  };
}

/** Comprueba el token y responde 401 si falta o no es válido. */
function authenticate(
  deps: ApiDependencies,
  req: IncomingMessage,
  res: ServerResponse,
): string | null {
  const token = bearerToken(req);
  const userId = token ? deps.auth.userIdForToken(token) : null;
  if (!userId) {
    sendJson(res, 401, { error: 'no-autorizado', message: 'Token ausente o caducado.' });
    return null;
  }
  return userId;
}

function sendAuthResult(res: ServerResponse, result: AuthResult): void {
  if (result.ok) {
    sendJson(res, 200, result.value);
    return;
  }
  const status = result.error.code === 'credenciales-invalidas' ? 401 : 409;
  sendJson(res, status, { error: result.error.code, message: result.error.message });
}

function bearerToken(req: IncomingMessage): string | null {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return null;
  }
  return header.slice('Bearer '.length).trim() || null;
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = chunk as Buffer;
    size += buffer.length;
    if (size > MAX_BODY_BYTES) {
      throw new Error('El cuerpo de la petición supera el límite permitido.');
    }
    chunks.push(buffer);
  }
  if (chunks.length === 0) {
    return null;
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return null;
  }
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
  });
  res.end(body);
}

/**
 * Versión del backend, leída de su `package.json`.
 *
 * `dist/server.js` y `src/server.ts` comparten el mismo `../package.json`, así
 * que la lectura funciona igual compilado o bajo ts-jest. Si el fichero no se
 * puede leer, se devuelve `null` en lugar de romper `/health`.
 */
const API_VERSION: string | null = readApiVersion();

function readApiVersion(): string | null {
  try {
    const raw = readFileSync(join(__dirname, '..', 'package.json'), 'utf8');
    const parsed = JSON.parse(raw) as { version?: unknown };
    return typeof parsed.version === 'string' ? parsed.version : null;
  } catch {
    return null;
  }
}

/**
 * Estado del proveedor semántico para `/health`, sin revelar secretos.
 *
 * Solo expone si está configurado y el identificador del modelo principal
 * (`id`, no la clave). Un `commit` y un estado de proveedor permiten comprobar
 * qué revisión está sirviendo Render sin abrir un panel ni filtrar credenciales.
 */
function providerStatus(deps: ApiDependencies): {
  readonly configured: boolean;
  readonly model: string | null;
} {
  const ai = deps.mayeuticAi;
  if (!ai) {
    return { configured: false, model: null };
  }
  const configured = typeof ai.configured === 'boolean' ? ai.configured : true;
  const model = typeof ai.modelId === 'string' ? ai.modelId : null;
  return { configured, model };
}

/**
 * Estado del OCR para `/health`, sin revelar secretos.
 *
 * Solo indica si el servidor puede reconocer imágenes; el cliente lo usa para
 * saber si ofrecer la importación por OCR antes de intentarla.
 */
function ocrStatus(deps: ApiDependencies): { readonly configured: boolean } {
  const ocr = deps.ocr;
  if (!ocr) {
    return { configured: false };
  }
  return { configured: typeof ocr.configured === 'boolean' ? ocr.configured : true };
}

function emptySnapshot(userId: string): ProgressSnapshot {
  return {
    userId,
    generatedAt: 0,
    evaluations: [],
    reviewStates: [],
    sessions: [],
    gapProfile: null,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isOneOf<const T extends readonly string[]>(
  value: unknown,
  choices: T,
): value is T[number] {
  return typeof value === 'string' && choices.includes(value);
}
