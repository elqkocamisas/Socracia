#!/usr/bin/env node
/**
 * Evals del motor mayéutico contra el proveedor semántico REAL (puerta G3).
 *
 * La suite de `npm test` mide la robustez del motor con respuestas simuladas.
 * Este script hace lo contrario: llama al backend real (`/mayeutic/generate` y
 * `/mayeutic/evaluate`), que a su vez usa el proveedor configurado (Gemini), y
 * calcula las tres métricas de la puerta G3:
 *
 *   - concordancia de veredicto   ≥ 80 %
 *   - citas inventadas            = 0
 *   - paráfrasis correctas aceptadas ≥ 90 %
 *
 * No contiene ninguna clave: solo usa la URL del backend y una cuenta de prueba
 * efímera. La clave del proveedor vive **solo** en el servidor.
 *
 * Uso:
 *   SOCRA_REAL_EVAL_BASE_URL=https://<servicio>.onrender.com \
 *   SOCRA_REAL_EVAL_EMAIL=eval@ejemplo.com \
 *   SOCRA_REAL_EVAL_PASSWORD='...' \
 *   node scripts/eval-real.mjs
 *
 * Si no se dan credenciales, registra una cuenta desechable y la borra al final.
 * Sale con código 0 si se alcanzan los umbrales, 1 si no, y 2 si el proveedor no
 * está disponible (503/502): en ese caso la puerta queda «no verificada», no
 * «fallida».
 */

import { randomUUID } from 'node:crypto';

const BASE_URL =
  process.env.SOCRA_REAL_EVAL_BASE_URL ??
  process.env.EXPO_PUBLIC_API_BASE_URL ??
  'https://socracia.onrender.com';

const THRESHOLDS = {
  verdictAgreement: 0.8,
  inventedCitations: 0,
  paraphraseAcceptance: 0.9,
  minCases: 30,
};

/** Veredicto que el núcleo asigna a una puntuación (mismos umbrales que el core). */
const CORE_THRESHOLDS = { correct: 0.6, partial: 0.3 };

function classify(score) {
  if (score >= CORE_THRESHOLDS.correct) return 'correcta';
  if (score >= CORE_THRESHOLDS.partial) return 'parcial';
  return 'incorrecta';
}

/**
 * Temas de prueba: cada uno con su cita y varias respuestas con el veredicto
 * esperado. `paraphrase: true` marca las respuestas correctas reformuladas, que
 * son las que alimentan la métrica de aceptación de paráfrasis.
 */
const THEMES = [
  {
    concept: {
      id: 'c1',
      topicId: 't1',
      label: 'Principio de legalidad',
      definition: 'Sujeción plena de la Administración a la ley y al Derecho.',
      keywords: ['legalidad', 'ley', 'ordenamiento'],
    },
    excerpt:
      'La Administración actúa con sometimiento pleno a la ley y al Derecho. El principio de legalidad exige habilitación legal previa: sin una norma que la autorice, la Administración no puede actuar, y toda su actuación queda sometida al control de los tribunales.',
    question: {
      prompt: '¿Por qué no puede actuar la Administración sin habilitación legal previa?',
      expectedAnswer:
        'Porque el principio de legalidad la somete a la ley y exige una norma habilitante previa.',
      keyTerms: ['legalidad', 'ley', 'habilitación'],
      move: 'causa',
      level: 'comprender',
    },
    answers: [
      {
        text: 'Porque el principio de legalidad la obliga a actuar siempre conforme a la ley y al Derecho.',
        expect: 'correcta',
        paraphrase: true,
      },
      {
        text: 'Su actuación está sometida a la ley; necesita una norma que la habilite antes de actuar.',
        expect: 'correcta',
        paraphrase: true,
      },
      {
        text: 'No puede, porque toda su actuación debe someterse al ordenamiento jurídico y al control judicial.',
        expect: 'correcta',
        paraphrase: true,
      },
      {
        text: 'Le hace falta una habilitación legal previa, pues rige el principio de legalidad.',
        expect: 'correcta',
        paraphrase: true,
      },
      {
        text: 'Porque la ley le exige sometimiento pleno y una norma habilitante.',
        expect: 'correcta',
        paraphrase: true,
      },
      {
        text: 'El ordenamiento la vincula; sin ley previa no tiene cobertura para actuar.',
        expect: 'correcta',
        paraphrase: true,
      },
      {
        text: 'Porque el principio de legalidad la sujeta a la ley.',
        expect: 'parcial',
        paraphrase: false,
      },
      { text: 'Necesita una habilitación legal previa.', expect: 'parcial', paraphrase: false },
      { text: 'Porque hay que respetar la ley.', expect: 'parcial', paraphrase: false },
      { text: 'Porque el control judicial lo impide.', expect: 'parcial', paraphrase: false },
      { text: 'Porque lo dice el ordenamiento.', expect: 'parcial', paraphrase: false },
      {
        text: 'Porque puede hacer lo que quiera si es eficaz.',
        expect: 'incorrecta',
        paraphrase: false,
      },
      { text: 'No necesita ninguna norma para actuar.', expect: 'incorrecta', paraphrase: false },
      {
        text: 'La Administración no está sometida a la ley.',
        expect: 'incorrecta',
        paraphrase: false,
      },
      { text: 'Porque decide libremente sin control.', expect: 'incorrecta', paraphrase: false },
      { text: 'Porque su interés particular prevalece.', expect: 'incorrecta', paraphrase: false },
    ],
  },
  {
    concept: {
      id: 'c2',
      topicId: 't1',
      label: 'Irretroactividad de las normas',
      definition: 'Las normas sancionadoras no favorables no se aplican a hechos anteriores.',
      keywords: ['irretroactividad', 'retroactiva', 'norma'],
    },
    excerpt:
      'Las disposiciones sancionadoras no favorables o restrictivas de derechos individuales no son retroactivas: se aplican solo a hechos posteriores a su entrada en vigor, salvo que una norma posterior disponga lo contrario.',
    question: {
      prompt: '¿A qué hechos se aplican las normas sancionadoras desfavorables?',
      expectedAnswer:
        'Solo a hechos posteriores a su entrada en vigor, porque no son retroactivas.',
      keyTerms: ['retroactiva', 'hechos', 'norma'],
      move: 'definir',
      level: 'comprender',
    },
    answers: [
      {
        text: 'Únicamente a los hechos ocurridos después de que la norma entre en vigor, ya que no es retroactiva.',
        expect: 'correcta',
        paraphrase: true,
      },
      {
        text: 'Solo a hechos posteriores; las normas sancionadoras desfavorables no se aplican hacia atrás.',
        expect: 'correcta',
        paraphrase: true,
      },
      {
        text: 'A los hechos que suceden tras su vigencia, porque no cabe aplicarlas de forma retroactiva.',
        expect: 'correcta',
        paraphrase: true,
      },
      { text: 'A hechos posteriores a su entrada en vigor.', expect: 'parcial', paraphrase: false },
      { text: 'A los hechos futuros.', expect: 'parcial', paraphrase: false },
      { text: 'A todos los hechos, también anteriores.', expect: 'incorrecta', paraphrase: false },
      { text: 'Siempre de forma retroactiva.', expect: 'incorrecta', paraphrase: false },
      { text: 'A los hechos anteriores a la norma.', expect: 'incorrecta', paraphrase: false },
    ],
  },
  {
    concept: {
      id: 'c3',
      topicId: 't2',
      label: 'Jerarquía normativa',
      definition:
        'Ordenación de las normas por rango, donde la inferior no puede contradecir la superior.',
      keywords: ['jerarquía', 'rango', 'reglamento'],
    },
    excerpt:
      'El principio de jerarquía normativa ordena las normas por su rango: la Constitución prevalece sobre la ley y la ley sobre el reglamento. Una norma de rango inferior no puede contradecir a otra de rango superior.',
    question: {
      prompt: '¿Qué ocurre si un reglamento contradice una ley?',
      expectedAnswer:
        'El reglamento es inválido porque una norma inferior no puede contradecir a otra superior.',
      keyTerms: ['jerarquía', 'reglamento', 'ley'],
      move: 'consecuencia',
      level: 'aplicar',
    },
    answers: [
      {
        text: 'El reglamento es nulo, pues por la jerarquía normativa no puede contradecir a la ley.',
        expect: 'correcta',
        paraphrase: true,
      },
      {
        text: 'No puede contradecirla: la norma de rango inferior cede ante la superior.',
        expect: 'correcta',
        paraphrase: true,
      },
      {
        text: 'El reglamento no vale, porque la ley tiene rango superior en la jerarquía.',
        expect: 'correcta',
        paraphrase: true,
      },
      { text: 'El reglamento es inválido.', expect: 'parcial', paraphrase: false },
      { text: 'Prevalece el reglamento.', expect: 'incorrecta', paraphrase: false },
      { text: 'Da igual: tienen el mismo rango.', expect: 'incorrecta', paraphrase: false },
    ],
  },
];

/** Aplana los temas en casos de evaluación con su veredicto esperado. */
function evaluationCases() {
  const cases = [];
  for (const theme of THEMES) {
    const citation = {
      documentId: `${theme.concept.id}-doc`,
      documentTitle: `Tema ${theme.concept.label}`,
      chunkId: `${theme.concept.id}-doc:0`,
      excerpt: theme.excerpt,
      charStart: 0,
      charEnd: theme.excerpt.length,
    };
    theme.answers.forEach((answer, index) => {
      cases.push({
        id: `${theme.concept.id}-ev-${index}`,
        theme,
        citation,
        question: {
          id: `${theme.concept.id}:q0`,
          conceptId: theme.concept.id,
          prompt: theme.question.prompt,
          move: theme.question.move,
          level: theme.question.level,
          expectedAnswer: theme.question.expectedAnswer,
          keyTerms: theme.question.keyTerms,
          difficulty: 0.4,
          citation,
        },
        answer,
      });
    });
  }
  return cases;
}

/** Casos de generación: por tema, comprobar anclaje y no trivialidad. */
function generationCases() {
  return THEMES.map((theme) => ({
    id: `${theme.concept.id}-gen`,
    concept: theme.concept,
    citation: {
      documentId: `${theme.concept.id}-doc`,
      documentTitle: `Tema ${theme.concept.label}`,
      chunkId: `${theme.concept.id}-doc:0`,
      excerpt: theme.excerpt,
      charStart: 0,
      charEnd: theme.excerpt.length,
    },
  }));
}

async function post(path, body, token) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    // El cuerpo no era JSON: se deja `null` y el llamante decide.
  }
  return { status: response.status, payload };
}

async function authenticate() {
  const email = process.env.SOCRA_REAL_EVAL_EMAIL;
  const password = process.env.SOCRA_REAL_EVAL_PASSWORD;
  if (email && password) {
    const login = await post('/auth/login', { email, password });
    if (login.status === 200 && login.payload?.token) {
      return { token: login.payload.token, created: false };
    }
  }
  const suffix = randomUUID().slice(0, 8);
  const result = await post('/auth/register', {
    email: `eval-real-${suffix}@socracia.test`,
    password: `eval-${randomUUID()}`,
  });
  if (result.status !== 200 || !result.payload?.token) {
    throw new Error(`No se pudo autenticar (HTTP ${result.status}).`);
  }
  return { token: result.payload.token, created: true };
}

/** Comprueba si una pregunta generada está anclada léxicamente en la cita. */
function isGrounded(question, excerpt) {
  const haystack = excerpt.toLowerCase();
  const tokens = [
    ...(question.keyTerms ?? []),
    ...String(question.prompt ?? '').split(/\s+/),
    ...String(question.expectedAnswer ?? '').split(/\s+/),
  ]
    .map((token) => token.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ''))
    .filter((token) => token.length >= 5);
  return tokens.some((token) => haystack.includes(token));
}

async function main() {
  console.log(`Evals reales contra ${BASE_URL}`);
  const { token, created } = await authenticate();

  const evaluation = evaluationCases();
  const generation = generationCases();

  let providerUnavailable = null;
  const results = { evaluation: [], generation: [] };

  try {
    for (const testCase of evaluation) {
      const response = await post(
        '/mayeutic/evaluate',
        {
          question: testCase.question,
          answer: {
            questionId: testCase.question.id,
            text: testCase.answer.text,
            answeredAt: Date.now(),
            latencyMs: 1500,
          },
        },
        token,
      );
      if (response.status === 503 || response.status === 502) {
        providerUnavailable = response.payload?.message ?? `HTTP ${response.status}`;
        break;
      }
      if (response.status !== 200) {
        results.evaluation.push({ id: testCase.id, ok: false, reason: `HTTP ${response.status}` });
        continue;
      }
      const verdict = classify(Number(response.payload?.score));
      results.evaluation.push({
        id: testCase.id,
        ok: true,
        expected: testCase.answer.expect,
        actual: verdict,
        paraphrase: testCase.answer.paraphrase,
      });
    }

    if (!providerUnavailable) {
      for (const testCase of generation) {
        const response = await post(
          '/mayeutic/generate',
          { concept: testCase.concept, citation: testCase.citation, maxQuestions: 2 },
          token,
        );
        if (response.status === 503 || response.status === 502) {
          providerUnavailable = response.payload?.message ?? `HTTP ${response.status}`;
          break;
        }
        if (response.status !== 200) {
          results.generation.push({
            id: testCase.id,
            ok: false,
            reason: `HTTP ${response.status}`,
          });
          continue;
        }
        const drafts = Array.isArray(response.payload) ? response.payload : [];
        const grounded = drafts.every((draft) => isGrounded(draft, testCase.citation.excerpt));
        const nonTrivial = drafts.every((draft) => draft.level !== 'recordar');
        results.generation.push({
          id: testCase.id,
          ok: true,
          grounded,
          nonTrivial,
          count: drafts.length,
        });
      }
    }
  } finally {
    if (created) {
      await fetch(`${BASE_URL}/account`, {
        method: 'DELETE',
        headers: { authorization: `Bearer ${token}` },
      }).catch(() => undefined);
    }
  }

  if (providerUnavailable) {
    console.error(`\nProveedor semántico NO disponible: ${providerUnavailable}`);
    console.error('G3 queda «no verificada»: no hay evidencia real que evaluar.');
    process.exit(2);
  }

  const answered = results.evaluation.filter((item) => item.ok);
  const agreement =
    answered.length === 0
      ? 0
      : answered.filter((item) => item.expected === item.actual).length / answered.length;
  const paraphrases = answered.filter((item) => item.paraphrase);
  const paraphraseAcceptance =
    paraphrases.length === 0
      ? 0
      : paraphrases.filter((item) => item.actual === 'correcta').length / paraphrases.length;
  const inventedCitations = results.generation.filter((item) => item.ok && !item.grounded).length;

  console.log('\nInforme por categoría');
  console.log(`  evaluación: ${answered.length}/${evaluation.length} casos con veredicto`);
  console.log(
    `  generación: ${results.generation.filter((g) => g.ok).length}/${generation.length} casos`,
  );
  console.log('\nMétricas G3');
  console.log(`  concordancia de veredicto: ${(agreement * 100).toFixed(1)} % (≥ 80 %)`);
  console.log(
    `  paráfrasis correctas aceptadas: ${(paraphraseAcceptance * 100).toFixed(1)} % (≥ 90 %)`,
  );
  console.log(`  citas/preguntas inventadas: ${inventedCitations} (= 0)`);

  const totalCases = answered.length + results.generation.filter((g) => g.ok).length;
  const passed =
    totalCases >= THRESHOLDS.minCases &&
    agreement >= THRESHOLDS.verdictAgreement &&
    paraphraseAcceptance >= THRESHOLDS.paraphraseAcceptance &&
    inventedCitations <= THRESHOLDS.inventedCitations;

  if (!passed) {
    console.error('\nG3 NO alcanzada: revisa los umbrales y el informe por categoría.');
    process.exit(1);
  }
  console.log('\nG3 alcanzada con proveedor real.');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(2);
});
