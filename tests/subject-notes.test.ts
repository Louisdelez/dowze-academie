import assert from "node:assert/strict";
import test from "node:test";

import {
  activateSubjectNote,
  activeNoteDocument,
  activeSubjectNote,
  closeSubjectNote,
  createSubjectNote,
  deleteSubjectNote,
  EMPTY_SUBJECT_NOTES_STORE,
  isLegacySubjectNotesStore,
  isPersistedSubjectNotesStore,
  isSubjectNotesStore,
  normalizeSubjectNotesStore,
  openNoteDocuments,
  openSubjectNote,
  selectSubjectNote,
  updateSubjectNote
} from "../src/lib/subjectNotes.ts";
import type { SubjectNotesStore } from "../src/types.ts";

const firstDate = "2026-09-07T08:00:00.000Z";
const secondDate = "2026-09-08T09:30:00.000Z";
const thirdDate = "2026-09-09T10:45:00.000Z";

const legacyStore = {
  schemaVersion: 1,
  documents: [
    {
      id: "analyse-active",
      subjectId: "analyse",
      title: "Limites",
      markdown: "# Limites\n\n$$\\lim_{x \\to 0} x = 0$$",
      createdAt: firstDate,
      updatedAt: secondDate
    },
    {
      id: "mecanique-active",
      subjectId: "mecanique",
      title: "Forces",
      markdown: "- [x] Inventaire",
      createdAt: firstDate,
      updatedAt: thirdDate
    },
    {
      id: "analyse-fermee",
      subjectId: "analyse",
      title: "Continuité",
      markdown: "Contenu historique intact",
      createdAt: firstDate,
      updatedAt: firstDate
    }
  ],
  activeDocumentBySubject: {
    analyse: "analyse-active",
    mecanique: "mecanique-active"
  }
};

function noteStore(): SubjectNotesStore {
  const first = createSubjectNote(EMPTY_SUBJECT_NOTES_STORE, {
    id: "a",
    now: firstDate,
    title: "A"
  });
  const second = createSubjectNote(first.store, {
    id: "b",
    now: secondDate,
    title: "B"
  });
  return createSubjectNote(second.store, {
    id: "c",
    now: thirdDate,
    title: "C"
  }).store;
}

test("le magasin vide v2 ne contient aucun onglet actif", () => {
  assert.deepEqual(EMPTY_SUBJECT_NOTES_STORE, {
    schemaVersion: 2,
    documents: [],
    openDocumentIds: [],
    activeDocumentId: null
  });
  assert.equal(isSubjectNotesStore(EMPTY_SUBJECT_NOTES_STORE), true);
});

test("les validateurs stricts acceptent v1 et v2 et refusent les invariants ambigus", () => {
  assert.equal(isLegacySubjectNotesStore(legacyStore), true);
  assert.equal(isPersistedSubjectNotesStore(legacyStore), true);

  const current = noteStore();
  assert.equal(isSubjectNotesStore(current), true);
  assert.equal(isPersistedSubjectNotesStore(current), true);
  const pageActive = { ...current, activeDocumentId: null };
  assert.equal(isSubjectNotesStore(pageActive), true, "la page peut être active avec des notes ouvertes");
  assert.equal(normalizeSubjectNotesStore(pageActive).activeDocumentId, null);
  assert.equal(isSubjectNotesStore({ ...current, activeDocumentId: "absente" }), false);
  assert.equal(isSubjectNotesStore({ ...current, openDocumentIds: ["a", "a"] }), false);
  assert.equal(isSubjectNotesStore({ ...current, extra: true }), false);
  assert.equal(isLegacySubjectNotesStore({
    ...legacyStore,
    activeDocumentBySubject: { analyse: "mecanique-active" }
  }), false);
  assert.equal(isLegacySubjectNotesStore({
    ...legacyStore,
    documents: [{ ...legacyStore.documents[0], extra: true }]
  }), false);
});

test("la migration v1 vers v2 garde chaque Markdown, ouvre les anciens actifs et ajoute les métadonnées", () => {
  const migrated = normalizeSubjectNotesStore(legacyStore);

  assert.equal(migrated.schemaVersion, 2);
  assert.deepEqual(migrated.openDocumentIds, ["analyse-active", "mecanique-active"]);
  assert.equal(migrated.activeDocumentId, "mecanique-active");
  assert.deepEqual(migrated.documents.map(({ id, subjectIds, tags }) => ({ id, subjectIds, tags })), [
    { id: "analyse-active", subjectIds: ["analyse"], tags: [] },
    { id: "mecanique-active", subjectIds: ["mecanique"], tags: [] },
    { id: "analyse-fermee", subjectIds: ["analyse"], tags: [] }
  ]);
  assert.equal(migrated.documents[0]?.markdown, legacyStore.documents[0]?.markdown);
  assert.equal("subjectId" in (migrated.documents[0] ?? {}), false);
});

test("la normalisation v2 retire les doublons et répare onglets, tags et matières", () => {
  const normalized = normalizeSubjectNotesStore({
    schemaVersion: 2,
    documents: [
      {
        id: "a",
        title: "A",
        markdown: "Markdown exact  ",
        subjectIds: [" analyse ", "analyse", 12, "mecanique"],
        tags: [" Important ", "important", "Formules"],
        createdAt: firstDate,
        updatedAt: firstDate
      },
      {
        id: "a",
        title: "Doublon",
        markdown: "à retirer",
        subjectIds: [],
        tags: [],
        createdAt: firstDate,
        updatedAt: thirdDate
      },
      {
        id: "b",
        title: "B",
        markdown: "ok",
        subjectIds: [],
        tags: [],
        createdAt: firstDate,
        updatedAt: secondDate
      },
      { id: "invalide", title: "Invalide", subjectIds: [], tags: [] }
    ],
    openDocumentIds: ["absente", "b", "b", "a"],
    activeDocumentId: "absente"
  });

  assert.deepEqual(normalized.documents.map((note) => note.id), ["a", "b"]);
  assert.equal(normalized.documents[0]?.markdown, "Markdown exact  ");
  assert.deepEqual(normalized.documents[0]?.subjectIds, ["analyse", "mecanique"]);
  assert.deepEqual(normalized.documents[0]?.tags, ["Important", "Formules"]);
  assert.deepEqual(normalized.openDocumentIds, ["b", "a"]);
  assert.equal(normalized.activeDocumentId, "b");
  assert.equal(isSubjectNotesStore(normalized), true);
});

test("créer une note globale l’ouvre, l’active et normalise ses métadonnées", () => {
  const created = createSubjectNote(EMPTY_SUBJECT_NOTES_STORE, {
    id: "note-globale",
    now: firstDate,
    title: "  Thermodynamique  ",
    markdown: "Markdown initial",
    subjectIds: [" thermique ", "analyse", "thermique", ""],
    tags: [" Examen ", "examen", "Formules"]
  });

  assert.deepEqual(created.document, {
    id: "note-globale",
    title: "Thermodynamique",
    markdown: "Markdown initial",
    subjectIds: ["thermique", "analyse"],
    tags: ["Examen", "Formules"],
    createdAt: firstDate,
    updatedAt: firstDate
  });
  assert.deepEqual(created.store.openDocumentIds, ["note-globale"]);
  assert.equal(activeNoteDocument(created.store)?.id, "note-globale");
});

test("l’appel historique avec une matière reste compatible", () => {
  const created = createSubjectNote(EMPTY_SUBJECT_NOTES_STORE, "analyse", {
    id: "note-analyse",
    now: firstDate
  });
  assert.deepEqual(created.document.subjectIds, ["analyse"]);
  assert.throws(
    () => createSubjectNote(EMPTY_SUBJECT_NOTES_STORE, "   ", { id: "bad", now: firstDate }),
    /matière/
  );
});

test("le Markdown et la date de création restent exacts pendant l’autosauvegarde", () => {
  const created = createSubjectNote(EMPTY_SUBJECT_NOTES_STORE, {
    id: "note-1",
    now: firstDate
  });
  const markdown = "# Limites\n\n$$\\lim_{x \\to 0} \\frac{\\sin x}{x}=1$$\n\n- [x] Définition";
  const updated = updateSubjectNote(created.store, "note-1", {
    title: "Limites remarquables",
    markdown,
    subjectIds: ["analyse", "algebre", "analyse"],
    tags: ["Révision", " révision ", "Formules"]
  }, secondDate);

  const note = activeNoteDocument(updated);
  assert.equal(note?.title, "Limites remarquables");
  assert.equal(note?.markdown, markdown);
  assert.deepEqual(note?.subjectIds, ["analyse", "algebre"]);
  assert.deepEqual(note?.tags, ["Révision", "Formules"]);
  assert.equal(note?.createdAt, firstDate);
  assert.equal(note?.updatedAt, secondDate);
  assert.deepEqual(JSON.parse(JSON.stringify(updated)), updated);
});

test("ouvrir, activer et fermer des notes respecte l’ordre des onglets", () => {
  let store = noteStore();
  store = activateSubjectNote(store, "a");
  assert.equal(store.activeDocumentId, "a");

  store = closeSubjectNote(store, "b");
  assert.deepEqual(store.openDocumentIds, ["a", "c"]);
  assert.equal(store.activeDocumentId, "a");
  assert.equal(store.documents.length, 3, "fermer ne doit jamais supprimer la note");

  store = openSubjectNote(store, "b");
  assert.deepEqual(store.openDocumentIds, ["a", "c", "b"]);
  assert.equal(store.activeDocumentId, "b");
  assert.deepEqual(openNoteDocuments(store).map((note) => note.id), ["a", "c", "b"]);

  store = activateSubjectNote(store, "c");
  store = closeSubjectNote(store, "c");
  assert.deepEqual(store.openDocumentIds, ["a", "b"]);
  assert.equal(store.activeDocumentId, "b", "la fermeture active privilégie l’onglet à droite");
});

test("une activation invalide n’ouvre pas implicitement de document", () => {
  const initial = closeSubjectNote(noteStore(), "b");
  const unchanged = activateSubjectNote(initial, "b");
  assert.deepEqual(unchanged.openDocumentIds, initial.openDocumentIds);
  assert.equal(unchanged.activeDocumentId, initial.activeDocumentId);
  assert.deepEqual(openSubjectNote(initial, "inconnue"), initial);
});

test("supprimer l’onglet actif choisit son voisin et supprime seulement le document ciblé", () => {
  const initial = activateSubjectNote(noteStore(), "b");
  const afterDelete = deleteSubjectNote(initial, "b");

  assert.deepEqual(afterDelete.documents.map((note) => note.id), ["c", "a"]);
  assert.deepEqual(afterDelete.openDocumentIds, ["a", "c"]);
  assert.equal(afterDelete.activeDocumentId, "c");
  assert.equal(isSubjectNotesStore(afterDelete), true);
});

test("la sélection historique refuse une note étrangère mais accepte les associations multiples", () => {
  const analyse = createSubjectNote(EMPTY_SUBJECT_NOTES_STORE, {
    id: "commune",
    now: firstDate,
    subjectIds: ["analyse", "mecanique"]
  });
  const closed = closeSubjectNote(analyse.store, "commune");
  const refused = selectSubjectNote(closed, "chimie", "commune");
  assert.equal(refused.activeDocumentId, null);

  const selected = selectSubjectNote(closed, "mecanique", "commune");
  assert.equal(selected.activeDocumentId, "commune");
  assert.equal(activeSubjectNote(selected, "analyse")?.id, "commune");
});

test("les limites de métadonnées empêchent une croissance non bornée", () => {
  const tags = Array.from({ length: 40 }, (_, index) => `tag-${index}`);
  const subjectIds = Array.from({ length: 60 }, (_, index) => `subject-${index}`);
  const created = createSubjectNote(EMPTY_SUBJECT_NOTES_STORE, {
    id: "limites",
    now: firstDate,
    tags,
    subjectIds
  });
  assert.equal(created.document.tags.length, 30);
  assert.equal(created.document.subjectIds.length, 50);

  const longTag = "x".repeat(100);
  const updated = updateSubjectNote(created.store, "limites", { tags: [longTag] }, secondDate);
  assert.equal(updated.documents[0]?.tags[0]?.length, 64);
});

test("un v2 corrompu est réparé sans transformer les contenus valides", () => {
  const normalized = normalizeSubjectNotesStore({
    schemaVersion: 2,
    documents: [
      {
        id: "a",
        title: "A",
        markdown: "texte exact  ",
        subjectIds: [" analyse ", "analyse", 12],
        tags: [" Important ", "important", ""],
        createdAt: firstDate,
        updatedAt: firstDate
      },
      {
        id: "a",
        title: "doublon",
        markdown: "non",
        subjectIds: [],
        tags: [],
        createdAt: firstDate,
        updatedAt: secondDate
      },
      { id: "invalide", title: "", markdown: 12 }
    ],
    openDocumentIds: ["absente", "a", "a"],
    activeDocumentId: "absente"
  });

  assert.equal(normalized.documents.length, 1);
  assert.equal(normalized.documents[0]?.markdown, "texte exact  ");
  assert.deepEqual(normalized.documents[0]?.subjectIds, ["analyse"]);
  assert.deepEqual(normalized.documents[0]?.tags, ["Important"]);
  assert.deepEqual(normalized.openDocumentIds, ["a"]);
  assert.equal(normalized.activeDocumentId, "a");
  assert.equal(isSubjectNotesStore(normalized), true);
});
