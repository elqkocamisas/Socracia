import { useState } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { View } from 'react-native';
import {
  DEFAULT_STUDY_OPTIONS,
  FakeLlmProvider,
  LlmExplainer,
  LlmFollowUpGenerator,
  LlmQuestionGenerator,
  evaluateAnswer,
  inMemoryStorage,
  ok,
  type AnswerEvaluation,
  type AnswerEvaluatorPort,
  type LlmError,
  type SocraticQuestion,
  type Result,
} from '@socracia/core';

import { createServices, importDocument, type AppServices } from '../services/appServices';
import type { LlmEngineBundle } from '../services/llmEngine';
import { ImportScreen } from '../screens/ImportScreen';
import { ProgressScreen } from '../screens/ProgressScreen';
import { StudyScreen } from '../screens/StudyScreen';
import type { DocumentPickerPort, FileBytesReader, PickedFile } from '../services/documentImport';

const NOW = 1_700_000_000_000;
const encoder = new TextEncoder();

/** Temario propio: un tema por concepto, estructura reglada de oposición/PAU. */
const TXT = `Tema 1. La fotosíntesis

La fotosíntesis es el proceso por el cual las plantas transforman la luz solar en energía química almacenada en forma de glucosa.

Tema 2. La clorofila

La clorofila es el pigmento verde que captura la energía luminosa y la transfiere a los centros de reacción del cloroplasto.

Tema 3. El ciclo de Calvin

El ciclo de Calvin es la ruta metabólica que fija el dióxido de carbono atmosférico en moléculas de azúcar durante la fase oscura.`;

const PARAPHRASE =
  'Es el proceso mediante el cual las plantas convierten la luz solar en energía química que guardan como glucosa.';
const WRONG = 'No lo sé, me suena de algo pero no sabría explicarlo.';

/**
 * Evaluador que delega en la heurística local.
 *
 * Reproduce la composición real (evaluador y explicador conviven) sin tocar la
 * red: el motor entra por el camino asíncrono, que es el único donde enriquece
 * el turno con la explicación directa.
 */
class HeuristicEvaluator implements AnswerEvaluatorPort {
  public readonly id = 'heuristic-evaluator';
  public async evaluate(question: SocraticQuestion): Promise<Result<AnswerEvaluation, LlmError>> {
    return ok(
      evaluateAnswer(
        question,
        { questionId: question.id, text: this.lastAnswer, answeredAt: NOW, latencyMs: 1 },
        DEFAULT_STUDY_OPTIONS.session.thresholds,
      ),
    );
  }
  public lastAnswer = '';
}

/** Proveedor falso que responde según el propósito de la petición. */
function makeFakeProvider(): FakeLlmProvider {
  return new FakeLlmProvider([
    {
      compute: (request) => {
        if (request.purpose === 'generar') {
          return JSON.stringify({
            prompt: '¿Cómo se relaciona este concepto con el resto del tema?',
            move: 'aplicar-caso',
            level: 'aplicar',
            difficulty: 0.4,
          });
        }
        if (request.purpose === 'seguimiento') {
          return JSON.stringify({
            kind: 'acotar',
            prompt: '¿Qué término clave falta en tu respuesta?',
            hints: [],
          });
        }
        if (request.purpose === 'explicar') {
          // La cita debe apuntar a un fragmento realmente enviado.
          const match = request.user.match(/\[([^\]]+)\]\s/);
          return JSON.stringify({
            explanation:
              'La fotosíntesis convierte la luz solar en energía química que la planta guarda como glucosa.',
            citations: match ? [match[1]] : [],
          });
        }
        return JSON.stringify({
          verdict: 'incorrecta',
          score: 0.1,
          matchedKeyTerms: [],
          missingKeyTerms: [],
          rationale: 'Sin datos suficientes.',
        });
      },
    },
  ]);
}

function makeBundle(evaluator: AnswerEvaluatorPort): LlmEngineBundle {
  const provider = makeFakeProvider();
  return {
    provider,
    evaluator,
    generator: new LlmQuestionGenerator(provider),
    followUp: new LlmFollowUpGenerator(provider),
    explainer: new LlmExplainer(provider),
  };
}

/** Servicios con el motor de modelo compuesto, como en producción. */
function makeServices(evaluator: AnswerEvaluatorPort): AppServices {
  const reader: FileBytesReader = { read: async () => ok(encoder.encode(TXT)) };
  const picker: DocumentPickerPort = {
    pick: async (): Promise<PickedFile> => ({
      name: 'temario.txt',
      mimeType: 'text/plain',
      uri: 'file:///temario.txt',
      sizeBytes: TXT.length,
    }),
  };
  return createServices({
    storage: inMemoryStorage(),
    picker,
    reader,
    policy: { mode: 'allow-cloud' },
    llm: makeBundle(evaluator),
  });
}

type Route =
  | { readonly name: 'biblioteca' }
  | { readonly name: 'estudio'; readonly documentId: string }
  | { readonly name: 'progreso' };

/** Router mínimo con la misma máquina de estados que `App.tsx`. */
function TestRouter({ services }: { readonly services: AppServices }): React.JSX.Element {
  const [route, setRoute] = useState<Route>({ name: 'biblioteca' });
  return (
    <View>
      {route.name === 'biblioteca' ? (
        <ImportScreen
          services={services}
          now={() => NOW}
          onStudy={(documentId) => setRoute({ name: 'estudio', documentId })}
        />
      ) : null}
      {route.name === 'estudio' ? (
        <StudyScreen
          services={services}
          documentId={route.documentId}
          now={() => NOW}
          onFinish={() => setRoute({ name: 'progreso' })}
        />
      ) : null}
      {route.name === 'progreso' ? (
        <ProgressScreen
          services={services}
          now={() => NOW}
          onBack={() => setRoute({ name: 'biblioteca' })}
        />
      ) : null}
    </View>
  );
}

async function typeAndSubmit(services: AppServices, evaluator: HeuristicEvaluator, text: string) {
  evaluator.lastAnswer = text;
  fireEvent.changeText(screen.getByLabelText('Tu respuesta'), text);
  await waitFor(() => expect(screen.getByLabelText('Tu respuesta').props.value).toBe(text));
  const submit = screen.queryByText('Responder de nuevo') ?? screen.getByText('Enviar respuesta');
  fireEvent.press(submit);
  // El envío es asíncrono: el borrador se vacía al completarse, o la sesión
  // termina y el campo desaparece. Se espera a uno de los dos desenlaces.
  await waitFor(() => {
    const input = screen.queryByLabelText('Tu respuesta');
    if (input) {
      expect(input.props.value).toBe('');
    } else {
      expect(screen.getByText('Sesión completada')).toBeTruthy();
    }
  });
  void services;
}

describe('Recorrido dorado mayéutico en la interfaz', () => {
  it('importa, pregunta, acepta paráfrasis, explica tras fallos y guarda progreso', async () => {
    const evaluator = new HeuristicEvaluator();
    const services = makeServices(evaluator);
    const imported = await importDocument(
      services,
      {
        name: 'temario.txt',
        mimeType: 'text/plain',
        uri: 'file:///temario.txt',
        sizeBytes: TXT.length,
      },
      NOW,
    );
    expect(imported.ok).toBe(true);

    await render(<TestRouter services={services} />);

    // 1. Biblioteca: el documento aparece y se puede estudiar.
    await waitFor(() => expect(screen.getByText('temario')).toBeTruthy());
    fireEvent.press(screen.getByText('Estudiar'));

    // 2. Pregunta anclada a una fuente real del documento.
    await waitFor(() => expect(screen.getByText('Pregunta')).toBeTruthy());
    expect(screen.getByText(/^Fuente:/)).toBeTruthy();

    // 3. Un fallo: andamiaje, sin explicación todavía.
    await typeAndSubmit(services, evaluator, WRONG);
    expect(screen.getByText('Pista para pensar')).toBeTruthy();
    expect(screen.queryByText('Te lo explico')).toBeNull();

    // 4. Segundo fallo sobre el concepto: aparece la explicación directa.
    await typeAndSubmit(services, evaluator, WRONG);
    await waitFor(() => expect(screen.getByText('Te lo explico')).toBeTruthy());
    expect(screen.getByText(/guard[a]? como glucosa/)).toBeTruthy();

    // 5. El resto del itinerario se responde hasta cerrar la sesión.
    let guard = 0;
    while (screen.queryByLabelText('Tu respuesta') !== null && guard < 20) {
      await typeAndSubmit(services, evaluator, PARAPHRASE);
      guard += 1;
    }
    await waitFor(() => expect(screen.getByText('Sesión completada')).toBeTruthy());

    // 6. Progreso: se puede abrir la vista de progreso.
    fireEvent.press(screen.getByText('Ver progreso'));
    await waitFor(() => expect(screen.getByText('Tu progreso')).toBeTruthy());
  });
});
