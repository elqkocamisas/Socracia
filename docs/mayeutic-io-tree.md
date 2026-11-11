# Árbol de procesos e I/O — el viaje mayéutico de extremo a extremo

Traza del recorrido completo de datos (entrada → proceso → salida) por las tres
capas del monorepo, con los nombres reales de función y el punto exacto donde
cada dato cruza una frontera (dispositivo, red, persistencia). Sirve para
diagnosticar **dónde pierde coherencia entre significante y significado** y para
auditar qué sale del dispositivo.

Convención: `→` invoca; `⇒` produce; `⇄` es una frontera (I/O de red o disco);
`[nube]` marca lo que sale del dispositivo y exige consentimiento.

---

## 0. Arranque (una vez, en frío)

```
App.tsx startServices()
  → bootstrap({ picker, reader, openDatabase })              [appServices.ts]
      ⇄ openLocalDatabase()                                  → expo-sqlite (socracia.db)
      → resolveEmbeddingProvider({ nativeModule })           [appServices.ts]
          → createEdgeLlmProvider()  (edge-llm on-device)    ⇒ FallbackEmbeddingProvider
          └─ falla ⇒ HashingEmbeddingProvider(256)  (degradado, motivo visible)
      ⇄ SqliteProcessingPolicyStore.load()                   ⇒ ProcessingPolicy (local-only)
      ⇄ SqliteCredentialStore.load()                         ⇒ token de sesión (si hay)
      → buildLlmEngine({ baseUrl, policy, loadToken })       [llmEngine.ts]
          ⇒ ConsentGated( Resilient( LlmHttpProvider ) )
      → createServices({ ... })                              [appServices.ts]
          ⇒ storage, rag, ingestion, study, session, account, ocr, health, policy
      → rehydrateIndex(services)                             [appServices.ts]
          ⇄ storage.documents.listAllChunks()
          → rag.rehydrate(chunks)   (recalcula embeddings en el dispositivo)
      ⇄ services.account.restore()
```

Punto clave: **el índice vectorial no vive en disco**; se rehidrata de los
fragmentos persistidos en cada arranque (D-022). Si este paso falla, la app
arranca pero sin poder preguntar sobre lo ya importado.

---

## 1. Importación de un documento

```
ImportScreen  →  importDocument(services, picked, now)        [appServices.ts]
  ⇄ readPickedFile(picked, reader)                            → ExpoFileReader (bytes)
  → assertProcessingAllowed(policy, { requiresCloud:false })  (gate local)
  → ingestion.ingest({ fileName, mimeType, bytes, uri }, opts) [ingestionService.ts]
      → ExtractorRegistry.extract(mimeType, fileName, bytes)   [extractors.ts]
          ├─ PlainTextExtractor     (.txt/.md/.markdown)       ⇒ texto
          └─ PdfTextExtractor       (pdf-minimal)              ⇒ texto
              · fflateInflate()  (unzlib → inflate)            [inflate.ts]
              · respeta bloques BT…ET y arrays TJ
              └─ sin capa de texto ⇒ IngestError('pdf-sin-texto')
      → rag.indexDocument(document, text, chunkOptions)        [engine.ts]
          → chunkText(text, {maxChars:900, overlapChars:150, minChars:40})
          → provider.embed(chunk)  por fragmento
          ⇄ store.add(vector)                                  (InMemoryVectorStore hoy)
      ⇒ IngestResult { document, text, chunkCount, chunks }

  ── rama OCR (solo si la extracción local no produce texto) ──
  if (!ingested.ok && (isOcrImage(mimeType,name) || code==='pdf-sin-texto'))
      → [nube] HttpOcrPort.recognize({ fileName, mimeType, bytes })   [ocrPort.ts]
          ⇄ POST /mayeutic/ocr   (Authorization: Bearer <token>)      [httpSyncClient.ts]
              → server.ts: authenticate() → deps.mayeuticAi (Gemini OCR)
              ⇒ { text }
      → ingestion.ingestText(meta, recognizedText, opts)   (mismo pipeline, salta extracción)

  → persistIngested(services, ingested, now)                 [appServices.ts]
      → extractCurriculum(text)                              [conceptExtractor.ts]
          · cleanHeading() unifica "## Tema 1. X" y "Tema 1. X"
          · splitSentences() (sin lookbehind: compatible Hermes)
          ⇒ Topic[] + Concept[] { id, label, definition, keywords }
      ⇄ storage.documents.saveDocument / saveCurriculum / saveChunks
  ⇒ { documentId, title, conceptCount }
```

Fronteras que cruzan la red aquí: **solo el OCR**, y solo con política
`allow-cloud`, sesión iniciada y consentimiento del documento.

---

## 2. Preparar la sesión (generar preguntas ancladas)

```
StudyScreen  →  services.session.start(documentId, now, sessionId)
  → MayeuticSessionController.start()                        [sessionController.ts]
      ⇄ storage.documents.getCurriculum(documentId)          ⇒ Concept[]
      ⇄ storage.documents.listDocuments()                    ⇒ KnowledgeDocument[]
      → study.prepareSession(userId, curriculum, docs, now, sessionId)  [studyService.ts]
          → generateForConcepts(concepts, documents)
              ── por cada concepto ──
              → rag.generateConceptQuestions(concept, docs, opts, N)   (plantillas + cita)
                  ⇒ SocraticQuestion[] con Citation{chunkId, excerpt, charStart…}
              if (semanticProvider.canProcess(sourceDoc))        ← documento autorizado + sesión
                  → [nube] semanticProvider.generateQuestions(...)
                      ⇄ POST /mayeutic/generate  → Gemini
                  else si falla y degradeOnProviderFailure ⇒ se conservan las plantillas
              else if (questionGenerator)  (motor de modelo inyectado)
                  → generateForConcept(concept, docs)
                      → retrievePassages(concept, docs)          [llmEngine.ts]
                          → rag.retrieveRelevant("label. definition")  (umbral 0.2)
                          ⇒ LlmPassage[] (≤3, con Citation real)
                      → generator.generate(target, passages)     [LlmQuestionGenerator]
                          → provider.complete()  ⇒ ConsentGated → Resilient → HTTP
                              ⇄ POST /llm/complete   → backend → Gemini
                  (si el modelo no produce ninguna válida ⇒ plantillas)
              → filterNonTrivial(questions)                      [questionQuality.ts]
                  · descarta nivel 'recordar' y triviales
              ⇄ storage.questions.saveQuestions(accepted)

          → storage.progress.listEvaluations(userId)              (histórico)
          → buildItinerary(generated, priorEvaluations, opts)     [itinerary.ts]
              rank(): lagunas (<0.6) → sin evaluar → dominados
          → startSession(sessionId, userId, topicId, steps, now)
          → new MayeuticSessionEngine(session, steps, concepts, opts, now)   [session.ts]
          ⇄ storage.progress.saveSession(session)
      ⇒ ActiveStudySession { session, engine, steps, documents, usesModel }
  → buildView(null)  ⇒ StudyViewState { phase:'preguntando', question, citation, progress }
```

**Invariante de anclaje:** cada pregunta lleva su `Citation` (chunk real del
temario). Es el único fragmento que viajará al evaluador; el documento completo
nunca sale.

---

## 3. Responder (evaluar → repreguntar → explicar)

```
StudyScreen  →  services.session.answer(text, latencyMs, now)
  → MayeuticSessionController.answer()
      → study.answer(active, userId, text, latencyMs, now)      [studyService.ts]
          question = engine.currentQuestion()
          document = active.documents.find(id === question.citation.documentId)

          ── 3a. evaluación ──
          if (semanticProvider.canProcess(document))
              → [nube] semanticProvider.evaluateAnswer(question, answer)
                  ⇄ POST /mayeutic/evaluate → Gemini
                  ⇒ assessment { score, feedback, missingKeyTerms }
              └─ falla: si degradeOnProviderFailure ⇒ providerFailed=true (heurística);
                        si no ⇒ err('evaluacion-fallida')  (contrato estricto del núcleo)
          turn = assessment!==undefined || usesModel
                 ? engine.submitAsync(text, latencyMs, now, assessment)
                 : engine.submit(text, latencyMs, now)

          ── 3b. motor de sesión (común a los dos caminos) ──   [mayeu/session.ts]
          registerAnswer(step, answer, evaluation):
              evaluations.push; answers.push; attemptsOnCurrent++
              if (verdict ∈ {incorrecta, sin-respuesta})
                  failuresByConcept[conceptId]++
              scheduleReview(review, evaluation, now)            [gaps.ts]
                  · correcta   ⇒ ease+0.1, interval × ease, dueAt = now + días
                  · parcial    ⇒ ease igual, repite intervalo
                  · incorrecta ⇒ ease−0.2, interval = 1 día (reinicio)
              shouldRetry = needsScaffold(eval) && attempts < maxAttemptsPerQuestion(2)
                  ⇒ scaffold = buildScaffold(question, eval, conceptLabel)  (ataca missingKeyTerms)
                  ⇒ next = question (repregunta)  |  advance() (siguiente)

          ── 3c. enriquecimiento con modelo (solo submitAsync) ──
          enrichTurn(turn, step, answer):
              followUp → repregunta redactada para ESE error
              if (failuresByConcept >= failuresBeforeExplaining(2))
                  explainer.explain(question, passages, missingKeyTerms)
                      ⇄ POST /llm/complete → Gemini  ⇒ explicación fundamentada + citas

          ⇄ storage.progress.appendEvaluations(userId, [evaluation])
          ⇄ storage.progress.saveReviewStates(userId, reviewStates)
          ⇄ storage.progress.saveSession(engine.snapshot())
      ⇒ SessionTurn { evaluation, scaffold, next, progress, explanation, degraded }
  → buildView(turn)  ⇒ StudyViewState { phase:'retroalimentando'|'terminada', … }
```

**Qué decide el avance:** solo `registerAnswer` (heurística o evaluación ya
emitida). El modelo **enriquece el texto** (repregunta, explicación) pero nunca
mueve el cursor ni el repaso. La marca `degraded` viaja al `StudyViewState` para
que la insignia (`EngineBadge`) no mienta sobre quién evaluó.

---

## 4. Progreso, lagunas y repaso

```
ProgressScreen  →  services.session.overview(now)
  → study.overview(userId, concepts, now)                        [studyService.ts]
      ⇄ storage.progress.listEvaluations() / listReviewStates()
      → buildProgressOverview(...)                               [progressService.ts]
          · dominio por concepto, lagunas, repaso pendiente
      → nextActionHint(overview)
  ⇒ ProgressOverview & { hint }

study.refreshProgress(active, now)
  → engine.gapProfile(now) → detectGaps(userId, concepts, evaluations, now)  [gaps.ts]
      · umbral GAP_THRESHOLD = 0.6; puro (misma entrada ⇒ misma salida)
  ⇄ storage.progress.saveGapProfile(profile)
```

---

## 5. Guardianes transversales de privacidad

| Guardián                                                                     | Dónde                         | Qué bloquea                                               |
| ---------------------------------------------------------------------------- | ----------------------------- | --------------------------------------------------------- |
| `ProcessingPolicyHolder` (`local-only` por defecto)                          | `privacy/processingPolicy.ts` | Cualquier ruta a nube si el modo no es `allow-cloud`.     |
| `cloudProcessingEnabled()` = `cloudAvailable && hasSession() && allow-cloud` | `appServices.ts`              | Decide si la nube está viva **en tiempo real**.           |
| `assertProcessingAllowed(op, {requiresCloud})`                               | `privacy/processingPolicy.ts` | La importación local no puede exigir nube.                |
| `ConsentGatedLlmProvider` (capa **más externa**)                             | `llm/consent.ts`              | Revocar el permiso corta también la caché de resiliencia. |
| `documentConsent` / `setDocumentConsent`                                     | `appServices.ts`              | Consentimiento **por documento** (`cloudConsent`).        |
| `MayeuticSemanticProvider.canProcess(document)`                              | `appServices.ts`              | Gemini solo si el documento autoriza y hay sesión.        |

Cadena de envoltura del motor de modelo: `HTTP → Resilient → ConsentGated`
(de dentro hacia fuera). El guardián va por fuera a propósito.

---

## 6. Cuenta y sincronización (opcional; inerte sin sesión)

```
AccountScreen → account.register/login(email, password)
  ⇄ HttpSyncClient → POST /auth/register | /auth/login        [httpSyncClient.ts]
      ⇄ server.ts authenticate() → scrypt + token de sesión
  ⇄ SqliteCredentialStore.save(token)      (nunca en el bundle)

account.push(snapshot) / pull(userId)
  ⇄ POST /sync/push  |  GET /sync/pull?userId=…
      → mergeSnapshots(local, remoto)                         [sync/merge.ts]
          · identidad por contenido: questionId / conceptId / session.id
          · gana el updatedAt mayor  (fusión pura, compartida cliente+servidor)
```

Sin cuenta, el progreso vive bajo `local-user` y **nada** sale del dispositivo.

---

## 7. Backend (`apps/api`) — frontera de red

```
server.ts route()  [createRequestHandler]
  ├─ GET  /health                  ⇒ { status, version, commit, provider, ocr }
  ├─ POST /auth/register|login|logout, DELETE /account
  ├─ POST /sync/push, GET /sync/pull        (userId de la SESIÓN, no del cuerpo)
  ├─ POST /mayeutic/generate|evaluate       → GeminiMayeuticService  [mayeutic.ts]
  ├─ POST /mayeutic/ocr                     → OCR Gemini
  └─ POST /llm/complete                     → routeLlmCompletion    [llm.ts]
         · sin proveedor ⇒ 503 proveedor-no-configurado
         · fallo del proveedor ⇒ 502 proveedor-semantico
```

`GeminiMayeuticService.complete()` rota modelos
(`gemini-3.6-flash` → `gemini-3.5-flash-lite` → `gemini-3.1-flash-lite`) y aborta
cada intento a los 30 s (`AbortSignal.timeout`). La clave
`GEMINI_API_KEY` vive **solo** en `process.env` del servidor.

---

## Resumen: el viaje mayéutico en funciones

| Fase           | Entrada                 | Función núcleo                                                                | Salida                      | Frontera            |
| -------------- | ----------------------- | ----------------------------------------------------------------------------- | --------------------------- | ------------------- |
| Importar       | bytes + mimeType        | `ExtractorRegistry.extract` → `RagEngine.indexDocument` → `extractCurriculum` | `Concept[]`, chunks         | disco (SQLite)      |
| OCR (opcional) | imagen / PDF sin texto  | `HttpOcrPort.recognize` → `ingestText`                                        | texto reconocido            | **[nube]**          |
| Preparar       | `Concept[]` + histórico | `generateForConcepts` → `buildItinerary` → `MayeuticSessionEngine`            | `ItineraryStep[]`, sesión   | disco               |
| Preguntar      | pregunta actual         | `MayeuticSessionEngine.currentQuestion`                                       | `StudyViewState`            | —                   |
| Evaluar        | respuesta               | `evaluateAnswer` (heurística) / `evaluateAnswer` semántico                    | `AnswerEvaluation`          | **[nube]** opcional |
| Repreguntar    | evaluación + fallo      | `buildScaffold` / `followUp`                                                  | `Scaffold` (ataca el error) | **[nube]** opcional |
| Explicar       | ≥2 fallos               | `explainer.explain`                                                           | explicación + citas         | **[nube]** opcional |
| Repasar        | evaluación              | `scheduleReview` (SM-2)                                                       | `ReviewState{dueAt}`        | disco               |
| Lagunas        | evaluaciones            | `detectGaps`                                                                  | `GapProfile`                | disco               |
| Sincronizar    | snapshots               | `mergeSnapshots`                                                              | snapshot fusionado          | **[nube]** opcional |

**Dónde puede perderse la coherencia significante↔significado:** en la
extracción (PDF mal decodificado ⇒ texto basura), en la segmentación
(encabezados no unificados ⇒ conceptos duplicados) y en la evaluación (término
clave ausente en la `keyTerms` ⇒ repregunta que ataca el error equivocado). El
recorrido dorado (`goldenPath.test.ts`) cubre las tres con TXT, MD y PDF real.
