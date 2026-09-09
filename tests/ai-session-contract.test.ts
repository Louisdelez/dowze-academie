import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

const moduleHooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if (specifier.startsWith(".") && !specifier.endsWith(".ts")) {
        return nextResolve(`${specifier}.ts`, context);
      }
      throw error;
    }
  }
});

const contract = await import("../src/lib/aiSessionContract.ts");
const { createActiveLesson } = await import("../src/lib/lesson.ts");
const { createActivePaperAssessment } = await import("../src/lib/assessment.ts");
moduleHooks.deregister();

const id64 = (character: string) => character.repeat(64);
const subject = {
  id: id64("a"),
  name: "Matière de test",
  shortName: "Test",
  teacher: "Équipe pédagogique",
  room: "Salle",
  color: "#112233",
  accent: "#ddeeff",
  icon: "book" as const,
  modules: [{
    id: id64("b"),
    period: "Période 1",
    title: "Module",
    items: [{
      id: id64("c"),
      title: "Chapitre",
      completed: false,
      lessons: [{
        id: id64("d"),
        title: "Cours",
        objective: "Comprendre le cours.",
        completed: false
      }]
    }]
  }]
};

test("borne et stabilise les identifiants IA sans modifier un identifiant déjà conforme", () => {
  assert.equal(contract.nativeAiSessionId("lesson-safe_1:ok"), "lesson-safe_1:ok");
  const first = contract.nativeAiSessionId(`Séance ${"très-longue-".repeat(30)}A`);
  const second = contract.nativeAiSessionId(`Séance ${"très-longue-".repeat(30)}B`);
  assert.equal(first, contract.nativeAiSessionId(`Séance ${"très-longue-".repeat(30)}A`));
  assert.notEqual(first, second);
  assert.ok(first.length <= contract.NATIVE_AI_SESSION_ID_MAX_BYTES);
  assert.match(first, /^[A-Za-z0-9_.:-]+$/);
});

test("les cours et évaluations aux ids importés maximaux restent acceptés par le pont natif", () => {
  const courseModule = subject.modules[0];
  const chapter = courseModule.items[0];
  const lesson = chapter.lessons[0];
  const activeLesson = createActiveLesson(subject, courseModule, chapter, lesson, {
    startedAt: "2026-09-09T10:00:00.000Z"
  });
  const assessment = createActivePaperAssessment(subject, {
    eventId: id64("e"),
    kind: "exam",
    title: "Examen",
    scheduledAt: "2026-10-10T08:00:00.000Z",
    durationMinutes: 60,
    chapterIds: [chapter.id],
    allowedMaterials: "Aucun matériel"
  }, { startedAt: "2026-09-09T10:00:00.000Z" });

  for (const session of [activeLesson, assessment]) {
    assert.ok(session.id.length <= contract.NATIVE_AI_SESSION_ID_MAX_BYTES);
    assert.match(session.id, /^[A-Za-z0-9_.:-]+$/);
  }
});
