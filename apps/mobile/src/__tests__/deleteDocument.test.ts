import { inMemoryStorage, type ProgressRepository, type StoragePort } from '@socracia/core';

import { deleteDocument } from '../services/appServices';
import { importTemario, makeServices, NOW } from './helpers/appTestHarness';

const USER = 'local-user';

/**
 * El usuario es dueño de su material y debe poder retirarlo. La prueba comprueba
 * que el borrado no deja datos huérfanos: si quedaran evaluaciones o estados de
 * repaso de conceptos ya inexistentes, la pantalla de progreso mostraría repasos
 * pendientes de un documento que el usuario acaba de eliminar.
 */
describe('Eliminar un documento', () => {
  it('borra documento, temario, fragmentos e índice', async () => {
    const services = makeServices();
    const documentId = await importTemario(services);

    expect(await services.storage.documents.listDocuments()).toHaveLength(1);
    expect(services.rag.indexedChunks()).toBeGreaterThan(0);

    const result = await deleteDocument(services, documentId);

    expect(result.ok).toBe(true);
    expect(await services.storage.documents.listDocuments()).toHaveLength(0);
    expect(await services.storage.documents.getCurriculum(documentId)).toBeNull();
    expect(await services.storage.documents.listChunks(documentId)).toHaveLength(0);
    expect(await services.storage.documents.listAllChunks()).toHaveLength(0);
    expect(services.rag.indexedChunks()).toBe(0);
  });

  it('no deja lagunas ni repasos huérfanos tras estudiar', async () => {
    const services = makeServices();
    const documentId = await importTemario(services);

    const started = await services.session.start(documentId, NOW, 'sesion-1');
    expect(started.ok).toBe(true);

    // Se responde mal a propósito para generar lagunas y estados de repaso.
    for (let i = 0; i < 4; i += 1) {
      await services.session.answer('no lo sé', 500, NOW);
    }

    const before = await services.session.overview(NOW);
    expect(before.gaps.length).toBeGreaterThan(0);
    expect(before.dueForReview.length).toBeGreaterThan(0);
    expect(await services.storage.progress.listEvaluations(USER)).not.toHaveLength(0);

    await deleteDocument(services, documentId);

    const after = await services.session.overview(NOW);
    expect(after.gaps).toHaveLength(0);
    expect(after.dueForReview).toHaveLength(0);
    expect(after.mastery.conceptsTracked).toBe(0);
    expect(await services.storage.progress.listEvaluations(USER)).toHaveLength(0);
    expect(await services.storage.progress.listReviewStates(USER)).toHaveLength(0);
  });

  it('no toca el progreso de otros documentos', async () => {
    const storage = inMemoryStorage();
    const services = makeServices(storage);
    const documentId = await importTemario(services);
    const curriculum = await services.storage.documents.getCurriculum(documentId);
    const ownConcept = curriculum?.concepts[0];
    expect(ownConcept).toBeDefined();

    await services.storage.progress.appendEvaluations(USER, [
      {
        questionId: 'q-propio',
        conceptId: ownConcept?.id ?? '',
        verdict: 'correcta',
        score: 1,
        matchedKeyTerms: [],
        missingKeyTerms: [],
        feedback: 'bien',
      },
      {
        questionId: 'q-ajeno',
        conceptId: 'concepto-de-otro-temario',
        verdict: 'parcial',
        score: 0.5,
        matchedKeyTerms: [],
        missingKeyTerms: [],
        feedback: 'regular',
      },
    ]);

    await deleteDocument(services, documentId);

    const remaining = await services.storage.progress.listEvaluations(USER);
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.conceptId).toBe('concepto-de-otro-temario');
  });

  it('informa del número de conceptos eliminados', async () => {
    const services = makeServices();
    const documentId = await importTemario(services);
    const curriculum = await services.storage.documents.getCurriculum(documentId);

    const result = await deleteDocument(services, documentId);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.deletedConcepts).toBe(curriculum?.concepts.length ?? 0);
      expect(result.value.deletedConcepts).toBeGreaterThan(0);
    }
  });

  it('devuelve un error de dominio si el repositorio falla, en lugar de lanzar', async () => {
    const services = makeServices();
    // Se envuelve el repositorio real en lugar de reconstruirlo con spread: una
    // instancia de clase pierde sus métodos de prototipo al copiarla así.
    const brokenProgress: ProgressRepository = {
      saveSession: (session) => services.storage.progress.saveSession(session),
      getSession: (id) => services.storage.progress.getSession(id),
      listSessions: (userId) => services.storage.progress.listSessions(userId),
      appendEvaluations: (userId, evaluations) =>
        services.storage.progress.appendEvaluations(userId, evaluations),
      listEvaluations: (userId) => services.storage.progress.listEvaluations(userId),
      saveReviewStates: (userId, states) =>
        services.storage.progress.saveReviewStates(userId, states),
      listReviewStates: (userId) => services.storage.progress.listReviewStates(userId),
      saveGapProfile: (profile) => services.storage.progress.saveGapProfile(profile),
      getGapProfile: (userId) => services.storage.progress.getGapProfile(userId),
      removeConcepts: async () => {
        throw new Error('disco lleno');
      },
    };
    const storage: StoragePort = { ...services.storage, progress: brokenProgress };

    const result = await deleteDocument({ ...services, storage }, 'doc-x');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('borrado-fallido');
      expect(result.error.message).toContain('disco lleno');
    }
  });
});
