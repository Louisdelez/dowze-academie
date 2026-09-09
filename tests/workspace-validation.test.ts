import assert from "node:assert/strict";
import test from "node:test";

import { isStoredSubjects } from "../src/lib/workspaceValidation.ts";
import type { Subject } from "../src/types.ts";

const baseSubject: Subject = {
  id: "allemand",
  name: "Allemand",
  shortName: "Allemand",
  teacher: "Tuteur IA",
  room: "Langues",
  color: "#123456",
  accent: "#eef0ff",
  icon: "languages",
  modules: [
    {
      id: "allemand-b1",
      period: "Annuel",
      title: "Allemand B1",
      cefrLevel: "B1",
      items: [
        {
          id: "allemand-b1-ch1",
          title: "Communication",
          completed: false,
          lessons: []
        }
      ]
    }
  ]
};

test("le workspace accepte une matière CECRL avec une langue BCP 47 complète", () => {
  assert.equal(isStoredSubjects([{
    ...baseSubject,
    languageCode: "de",
    languageName: "allemand"
  }]), true);
});

test("le workspace refuse une langue corrompue, incomplète ou CECRL implicite", () => {
  assert.equal(isStoredSubjects([{
    ...baseSubject,
    languageCode: 42,
    languageName: "allemand"
  }]), false);
  assert.equal(isStoredSubjects([{
    ...baseSubject,
    languageCode: "de"
  }]), false);
  assert.equal(isStoredSubjects([baseSubject]), false);
});

test("le cursus anglais historique reste compatible avec ses anciens états persistés", () => {
  assert.equal(isStoredSubjects([{
    ...baseSubject,
    id: "anglais",
    name: "Anglais",
    curriculumKind: "cefr-selectable"
  }]), true);
});
