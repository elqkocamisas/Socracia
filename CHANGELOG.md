# Changelog

Todos los cambios relevantes de Socracia. El formato sigue
[Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y el proyecto usa
[Versionado Semántico](https://semver.org/lang/es/).

## [1.0.0] — 2026-11-04

Primera versión completa del producto: app móvil de un solo usuario, local-first.

### Añadido

- **Motor mayéutico de extremo a extremo:** extracción de conceptos, generación
  de preguntas no triviales ancladas a una cita, evaluación con cita, repregunta
  que ataca el error concreto, modo «explícame» tras fallos repetidos, detección
  de lagunas y repaso espaciado SM-2.
- **Ingesta de documentos PDF, TXT y MD** con RAG on-device y persistencia local
  en SQLite; el índice vectorial se rehidrata al abrir la app.
- **Lectura por OCR de imágenes y PDF escaneados (opcional y bajo
  consentimiento):** cuando el material es una imagen o un PDF sin capa de texto,
  el servidor reconoce su texto con el proveedor multimodal y el texto vuelve al
  dispositivo para indexarse como cualquier otro documento. Vive detrás del
  puerto `OcrPort` del núcleo y de la ruta `POST /mayeutic/ocr`; sin sesión y sin
  consentimiento, la app no envía la imagen y avisa al usuario (D-070).
- **Proveedor semántico opcional** (Gemini) con consentimiento por documento y
  clave en el servidor, y la heurística local como respaldo permanente. El perfil
  de build `production` (y su APK de lanzamiento) activa el modo conectado con
  `EXPO_PUBLIC_CLOUD_PROCESSING=1`, así que el motor con modelo llega al usuario
  en cuanto inicia sesión y lo autoriza (D-067).
- **Recorrido dorado automatizado** que prueba el ciclo completo sobre tres
  documentos (TXT, MD y un PDF con texto real), en el núcleo y en la interfaz.
- **Perfil de EAS `release-apk`** que extiende de producción y entrega un APK
  instalable de distribución interna.
- **Arnés de evals con proveedor real** (`npm run eval:real`): ejercita el
  backend real, sin clave en el cliente, y calcula las métricas de la puerta G3
  (concordancia de veredicto, paráfrasis aceptadas y citas inventadas).
- **Identidad visual con tema claro y oscuro:** `theme/tokens.ts` define las dos
  paletas (mismos nombres de color), `ThemeProvider` resuelve la activa según la
  preferencia del sistema o la elección del usuario, y esta se guarda en
  `app_meta`. Los pares de color se verifican con el contraste WCAG real.
- **Insignia del motor en la pantalla de estudio:** indica si responde el motor
  semántico («IA semántica») o la heurística local («Modo local») y, al pulsarla,
  explica el motivo de la degradación con la acción para resolverla. Aviso de
  arranque en frío de Render mientras el servidor despierta.
- **Onboarding de tres pasos** (qué es la mayéutica, cómo trabaja la app y
  elección de privacidad en claro), visible solo la primera vez.
- **Consentimiento por documento:** cada documento puede autorizarse o no para la
  nube desde su ficha, sin cambiar el valor por defecto (local).
- **Diagnóstico del motor en Cuenta:** las cuatro condiciones que habilitan la
  nube, estado real de la API (`/health`) y ajuste de tema.

### Cambiado

- **La app respeta las áreas seguras del sistema.** En Android 16 el edge-to-edge
  es obligatorio, así que la barra de estado y la de navegación se superponen al
  contenido; sin reservar sus zonas, la cabecera y la barra de pestañas quedaban
  bajo ellas y no se podían pulsar. Ahora `App` va envuelta en `SafeAreaProvider`
  y el chasis aplica los insets superior e inferior (D-073). Sin este arreglo, el
  APK instalado en un dispositivo real resultaba **no operativo**.

- **El fallo del proveedor semántico ya no rompe la sesión.** Si el proveedor no
  responde (red, cuota agotada o salida inválida), la app evalúa con la heurística
  local y continúa; el turno queda marcado como degradado y la insignia de motor
  deja de afirmar «IA semántica» para explicar que responde el motor local
  (D-072). Antes, un fallo del proveedor devolvía un error en pantalla y detenía
  el estudio. La generación cae a las plantillas del temario si el proveedor falla
  al generar preguntas.

- **La extracción de PDF acepta los PDF que produce el mundo real.** Se
  decodifica la cadena de filtros del diccionario en orden (`/Filter
[ /ASCII85Decode /FlateDecode ]`, habitual en reportlab y en muchos
  generadores), se leen arrays `[(a) -250 (b)] TJ` con kerning y cadenas
  hexadecimales `<…> Tj`, y el kerning ancho se interpreta como espacio. Antes,
  un PDF legible generado por Word, Chrome, LaTeX o reportlab caía en «El PDF no
  contiene texto extraíble (puede ser un escaneo)».
- La extracción de PDF conserva los límites de bloque: un encabezado ya no queda
  pegado al párrafo siguiente, de modo que TXT, MD y PDF producen los mismos
  conceptos.
- Los encabezados Markdown (`## Tema 1. X`) se limpian igual que los de texto
  plano, así que el formato del documento no altera los títulos de tema.
- La pantalla de estudio muestra la explicación directa («Te lo explico») cuando
  el motor la produce; antes se calculaba y se descartaba.
- Versión unificada a 1.0.0 en la raíz, los workspaces, `app.json` y la ficha de
  tienda.
- **El proveedor semántico rota entre modelos gratuitos.** Ante un fallo de cuota
  (429) o de disponibilidad (503), pasa al siguiente modelo de la lista
  (`GEMINI_MODEL` + `GEMINI_MODELS`), porque el nivel gratuito de Gemini limita
  por modelo. El modelo por defecto pasa a `gemini-3.6-flash` (`gemini-3.8-flash`
  devuelve 503 «high demand» en el nivel gratuito).
- **Parseo tolerante de la salida del modelo:** se acepta `{questions:[…]}` o un
  array suelto, y una pregunta mal formada ya no invalida el lote entero.
- **El motivo del proveedor ya no se pierde:** el endpoint OpenAI-compatible
  devuelve el error dentro de un array (`[{error:{…}}]`) y ahora se desenvuelve,
  de modo que un 429 muestra la pista de reintento en vez de parecer un fallo de
  red.
- El arnés de evals reales espacia los casos y reintenta ante 429/503; ante un
  límite diario se detiene y deja la puerta «no verificada» en vez de esperar en
  vano.

### Notas

- **El perfil `preview` fija el backend y el modo conectado.** El APK de
  distribución interna (el que se usa para probar en dispositivo) declara
  `EXPO_PUBLIC_API_BASE_URL=https://socracia.onrender.com` y
  `EXPO_PUBLIC_CLOUD_PROCESSING=1`, las mismas que `production` (D-071). Antes
  nacía apuntando a `localhost:8787` y sin motor ni OCR.
- El `versionCode` lo gestiona EAS en remoto (`appVersionSource: remote`); no se
  edita a mano.
- La multitenencia está documentada (D-053 a D-056) pero **no implementada**:
  queda fuera del alcance de 1.0 y no hay código que activar.
- Los textos legales están alineados con el comportamiento real y marcados como
  **pendiente de revisión humana**.
- **G3 verificada con el proveedor real** (2026-11-06): 30 casos de evaluación +
  3 de generación; concordancia de veredicto 83.3 %, paráfrasis aceptadas 100 %,
  0 citas inventadas. Evidencia en `docs/release-1.0-g3-evidence.txt` (D-063).
