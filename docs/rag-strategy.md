# Estrategia RAG — local (on-device) vs backend

Documento de decisión para el Sprint 0. Compara las dos opciones de recuperación
aumentada, fija la elección del MVP y define cómo se alterna sin reescribir la app.

## 1. Contexto y requisito dominante

El material de entrada es, en la mayoría de los casos, **temario propio del
usuario**: apuntes, PDFs de academias, textos legales. Ese material puede ser
sensible o estar sujeto a derechos de autor. Por eso la restricción global del
producto es:

> El RAG debe ser, preferentemente, on-device para proteger la privacidad del
> material del usuario. Si se usa nube, debe ser explícito y configurable.

Esta restricción pesa más que cualquier ventaja marginal de calidad, y orienta
la decisión por defecto.

## 2. Opciones evaluadas

### Opción A — RAG on-device (`edge-llm` / MediaPipe BERT / EmbeddingGemma)

El texto se trocea, se vectoriza y se indexa en el dispositivo. Nada sale del
teléfono.

| Dimensión                | Valoración                                                                             |
| ------------------------ | -------------------------------------------------------------------------------------- |
| Privacidad               | **Excelente.** El documento nunca abandona el dispositivo.                             |
| Funcionamiento offline   | **Total.** Estudiar en metro o en un aula sin cobertura.                               |
| Coste por consulta       | **Cero.** No hay facturación por token ni por petición.                                |
| Latencia                 | **Muy baja** en recuperación; la generación de embeddings añade cómputo local acotado. |
| Tamaño de app            | **Penalización**: el modelo de embeddings ocupa espacio (decenas de MB).               |
| Calidad de recuperación  | **Buena pero inferior** a modelos grandes en servidor.                                 |
| Complejidad de build     | **Alta**: módulo nativo, requisitos de EAS Build / dev client.                         |
| Escalabilidad del corpus | Limitada por RAM y almacenamiento del dispositivo.                                     |
| Trazabilidad de fuentes  | **Nativa**: los fragmentos y sus rangos viven en local.                                |

### Opción B — RAG en backend

El texto se envía a un servicio que vectoriza, indexa y responde.

| Dimensión                | Valoración                                                  |
| ------------------------ | ----------------------------------------------------------- |
| Privacidad               | **Débil**: el temario del usuario sale del dispositivo.     |
| Funcionamiento offline   | **Nulo.**                                                   |
| Coste por consulta       | **Recurrente**: cómputo y almacenamiento en nube.           |
| Latencia                 | Depende de la red; degradación perceptible en móvil.        |
| Tamaño de app            | **Mínimo.**                                                 |
| Calidad de recuperación  | **Alta**: modelos grandes, reordenación, corpus ampliables. |
| Complejidad de build     | **Baja** en la app; **alta** en infraestructura.            |
| Escalabilidad del corpus | **Muy alta.**                                               |
| Trazabilidad de fuentes  | Requiere diseñar la respuesta para devolver citas.          |

### Opción C — Híbrida (local por defecto, nube opt-in)

Igual que A, pero con un conmutador explícito que activa B para documentos
concretos cuando el usuario lo autoriza (por ejemplo, corpus muy grandes o
temarios de acceso público).

## 3. Decisión

**Se adopta la Opción C, con el modo local como comportamiento por defecto e
inexcusable.** Concretamente:

1. **MVP: RAG on-device.** El documento se procesa en el dispositivo. Ningún
   documento sale del teléfono salvo opt-in explícito por documento.
2. **Backend como mejora opcional, no como requisito.** Cuando el rendimiento o
   el tamaño del modelo lo desaconsejen (dispositivos de gama baja, corpus muy
   grandes), el usuario podrá activar el modo nube de forma explícita y por
   documento. El campo `KnowledgeDocument.cloudConsent` ya modela ese
   consentimiento y se registra por documento, no globalmente.
3. **Implementación de embeddings del MVP:** proveedor local de _hashing_ de
   tokens (`HashingEmbeddingProvider`), determinista y sin dependencias nativas.
   Es un marcador de posición funcional y honesto: permite que todo el pipeline
   RAG y el motor mayéutico funcionen, se prueben y se integren desde el
   Sprint 0, y se sustituye por el modelo real (MediaPipe BERT / EmbeddingGemma
   vía `edge-llm`) en el Sprint 2 implementando la misma interfaz.

### Motivos

- La privacidad es un requisito de producto, no una preferencia estética:
  penalizar el modo local por calidad de recuperación sería subordinar el
  requisito duro a un criterio blando.
- El modo local elimina coste variable y funciona offline, ambos críticos en el
  caso de uso real (opositor estudiando sin conexión).
- El modo híbrido evita bloquear el producto en dispositivos modestos sin
  renunciar al valor por defecto.

## 4. Cómo se alterna sin reescribir la app

Toda la variabilidad vive detrás de dos interfaces en `packages/core`:

```ts
export interface EmbeddingProvider {
  readonly id: string;
  readonly dimensions: number;
  readonly isOnDevice: boolean;
  embed(text: string): Promise<Result<number[]>>;
  embedBatch(texts: readonly string[]): Promise<Result<number[][]>>;
}

export interface VectorStore {
  add(entries: readonly EmbeddedChunk[]): void;
  search(queryEmbedding: readonly number[], topK: number): SearchHit[];
  size(): number;
  removeDocument(documentId: string): void;
  all(): readonly EmbeddedChunk[];
}
```

`RagEngine` recibe ambas por inyección de dependencias y **no contiene ninguna
referencia a la red ni al dispositivo**. Cambiar de modo es cambiar qué
implementación se inyecta:

| Modo                    | `EmbeddingProvider`                         | `VectorStore`         |
| ----------------------- | ------------------------------------------- | --------------------- |
| MVP (Sprint 0–1)        | `HashingEmbeddingProvider`                  | `InMemoryVectorStore` |
| Local real (Sprint 2)   | `EdgeLlmEmbeddingProvider` (MediaPipe BERT) | `SqliteVectorStore`   |
| Nube (Sprint 4, opt-in) | `BackendEmbeddingProvider`                  | `BackendVectorStore`  |

Ninguna de esas sustituciones toca el motor mayéutico, la evaluación, la
detección de lagunas ni la UI.

## 5. Consecuencias operativas

- **Tamaño de app:** el modelo on-device se descargará en la primera ejecución
  (no se empaqueta en el binario) para no inflar la descarga de tienda.
- **Transparencia:** la app indicará siempre, en la pantalla de cada documento,
  si se está procesando localmente o en nube.
- **Derechos de autor:** los documentos son del usuario y permanecen en su
  dispositivo; la app solo muestra la fuente y permite borrarlos. No se
  distribuye contenido de terceros.
- **Rendimiento:** si el dispositivo no soporta el modelo, se degrada con
  elegancia al proveedor de hashing (recuperación léxica) antes que fallar.

## 6. Métricas para revisar la decisión en el Sprint 2

- Latencia de ingesta por página de PDF en gama media.
- Calidad de recuperación (top-1 relevante) frente al proveedor de hashing.
- Tamaño del modelo y su impacto en la descarga.
- Tasa de uso del conmutador de nube, si se llega a habilitar.
