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
- **Proveedor semántico opcional** (Gemini) con consentimiento por documento y
  clave en el servidor, y la heurística local como respaldo permanente.
- **Recorrido dorado automatizado** que prueba el ciclo completo sobre tres
  documentos (TXT, MD y un PDF con texto real), en el núcleo y en la interfaz.
- **Perfil de EAS `release-apk`** que extiende de producción y entrega un APK
  instalable de distribución interna.

### Cambiado

- La extracción de PDF conserva los límites de bloque: un encabezado ya no queda
  pegado al párrafo siguiente, de modo que TXT, MD y PDF producen los mismos
  conceptos.
- Los encabezados Markdown (`## Tema 1. X`) se limpian igual que los de texto
  plano, así que el formato del documento no altera los títulos de tema.
- La pantalla de estudio muestra la explicación directa («Te lo explico») cuando
  el motor la produce; antes se calculaba y se descartaba.
- Versión unificada a 1.0.0 en la raíz, los workspaces, `app.json` y la ficha de
  tienda.

### Notas

- El `versionCode` lo gestiona EAS en remoto (`appVersionSource: remote`); no se
  edita a mano.
- La multitenencia está documentada (D-053 a D-056) pero **no implementada**:
  queda fuera del alcance de 1.0 y no hay código que activar.
- Los textos legales están alineados con el comportamiento real y marcados como
  **pendiente de revisión humana**.
