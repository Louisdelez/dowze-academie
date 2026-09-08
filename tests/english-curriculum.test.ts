import assert from "node:assert/strict";
import test from "node:test";

import {
  CEFR_LEVEL_ORDER,
  CEFR_LEVELS,
  DEFAULT_ENGLISH_SUBJECT,
  ENGLISH_LEVEL_OPTIONS,
  ENGLISH_SUBJECT_PLACEHOLDER,
  createEnglishCatalogSubject,
  createEnglishSubject,
  hydrateEnglishSubject,
  projectEnglishSubject,
  projectSubjectsForActiveCurricula
} from "../src/data/englishCurriculum.ts";

const EXPECTED_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"];

test("les niveaux CECRL suivent l’ordre A1 à C2 et ont une option explicite", () => {
  assert.deepEqual([...CEFR_LEVELS], EXPECTED_LEVELS);
  assert.deepEqual([...CEFR_LEVEL_ORDER], EXPECTED_LEVELS);
  assert.deepEqual(
    ENGLISH_LEVEL_OPTIONS.map((option) => option.value),
    EXPECTED_LEVELS
  );
  assert.equal(
    new Set(ENGLISH_LEVEL_OPTIONS.map((option) => option.value)).size,
    EXPECTED_LEVELS.length
  );
  for (const option of ENGLISH_LEVEL_OPTIONS) {
    assert.match(option.label, new RegExp(`^${option.value}\\b`));
    assert.ok(option.description.trim().length >= 30);
  }
});

test("le sujet placeholder anglais n’invente aucun programme avant le choix", () => {
  assert.equal(ENGLISH_SUBJECT_PLACEHOLDER.id, "anglais");
  assert.equal(ENGLISH_SUBJECT_PLACEHOLDER.name, "Anglais");
  assert.equal(ENGLISH_SUBJECT_PLACEHOLDER.chapterCount, 0);
  assert.deepEqual(ENGLISH_SUBJECT_PLACEHOLDER.modules, []);
  assert.match(ENGLISH_SUBJECT_PLACEHOLDER.domain ?? "", /CECRL/);
  assert.match(ENGLISH_SUBJECT_PLACEHOLDER.validation ?? "", /non certifiantes/i);
});

for (const level of CEFR_LEVELS) {
  test(`le programme ${level} contient 2 semestres, 12 chapitres et 60 notions`, () => {
    const subject = createEnglishSubject(level);
    const chapters = subject.modules.flatMap((module) => module.items);
    const notions = chapters.flatMap((item) => item.lessons ?? []);

    assert.equal(subject.id, "anglais");
    assert.equal(subject.cefrLevel, level);
    assert.equal(subject.chapterCount, 12);
    assert.equal(subject.modules.length, 2);
    assert.deepEqual(
      subject.modules.map((module) => module.period),
      ["Semestre 1", "Semestre 2"]
    );
    assert.ok(subject.modules.every((module) => module.cefrLevel === level));
    assert.ok(subject.modules.every((module) => module.items.length === 6));
    assert.equal(chapters.length, 12);
    assert.equal(notions.length, 60);
    assert.ok(chapters.every((item) => item.lessons?.length === 5));

    assert.match(subject.name, new RegExp(`\\b${level}\\b`));
    assert.match(subject.domain ?? "", /CECRL/);
    assert.match(subject.validation ?? "", /aligné sur le CECRL/i);
    assert.match(subject.validation ?? "", /non certifiantes/i);
    assert.match(subject.objective ?? "", new RegExp(`\\b${level}\\b`));
    assert.match(subject.objective ?? "", /réception, production, interaction et médiation/i);

    const allIds = [
      ...subject.modules.map((module) => module.id),
      ...chapters.map((item) => item.id),
      ...notions.map((notion) => notion.id)
    ];
    assert.equal(new Set(allIds).size, allIds.length);
    assert.ok(allIds.every((id) => id.includes(`-${level.toLowerCase()}-`)));

    for (const chapter of chapters) {
      assert.match(chapter.description ?? "", new RegExp(`CECRL ${level}`));
      assert.equal(chapter.completed, false);
      assert.ok(chapter.title.trim().length > 0);
    }
    for (const notion of notions) {
      assert.equal(notion.completed, false);
      assert.ok(notion.title.trim().length > 0);
      assert.ok(notion.objective.trim().length >= 30);
    }
  });
}

test("le builder retourne des progressions indépendantes", () => {
  const first = createEnglishSubject("A1");
  const second = createEnglishSubject("A1");
  const firstNotion = first.modules[0].items[0].lessons?.[0];
  const secondNotion = second.modules[0].items[0].lessons?.[0];

  assert.ok(firstNotion);
  assert.ok(secondNotion);
  firstNotion.completed = true;
  assert.equal(secondNotion.completed, false);
});

test("le catalogue brut conserve les six niveaux mais la projection n'en expose qu'un", () => {
  assert.equal(DEFAULT_ENGLISH_SUBJECT.modules.length, 12);
  assert.equal(DEFAULT_ENGLISH_SUBJECT.modules.flatMap((item) => item.items).length, 72);
  assert.equal(DEFAULT_ENGLISH_SUBJECT.modules
    .flatMap((item) => item.items)
    .flatMap((item) => item.lessons ?? []).length, 360);
  assert.equal(projectEnglishSubject(DEFAULT_ENGLISH_SUBJECT).modules.length, 0);

  const selected = hydrateEnglishSubject({ ...DEFAULT_ENGLISH_SUBJECT, cefrLevel: "B2" });
  const projected = projectEnglishSubject(selected);
  assert.equal(projected.cefrLevel, "B2");
  assert.equal(projected.modules.length, 2);
  assert.ok(projected.modules.every((item) => item.cefrLevel === "B2"));
  assert.equal(projected.modules.flatMap((item) => item.items).length, 12);
  assert.equal(projected.modules.flatMap((item) => item.items).flatMap((item) => item.lessons ?? []).length, 60);
  assert.equal(projectSubjectsForActiveCurricula([selected])[0].name, "Anglais · B2");
});

test("la réhydratation préserve la progression de chaque niveau après plusieurs changements", () => {
  const stored = createEnglishCatalogSubject("A1");
  const a1Lesson = stored.modules.find((item) => item.cefrLevel === "A1")!.items[0].lessons![0];
  const c1Lesson = stored.modules.find((item) => item.cefrLevel === "C1")!.items[0].lessons![0];
  a1Lesson.completed = true;
  c1Lesson.completed = true;

  const hydrated = hydrateEnglishSubject({ ...stored, cefrLevel: "B1" });
  assert.equal(hydrated.cefrLevel, "B1");
  assert.equal(hydrated.modules.find((item) => item.cefrLevel === "A1")!.items[0].lessons![0].completed, true);
  assert.equal(hydrated.modules.find((item) => item.cefrLevel === "C1")!.items[0].lessons![0].completed, true);
  assert.equal(projectEnglishSubject(hydrated, "A1").modules[0].items[0].lessons![0].completed, true);
});
