import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";
import type { CalendarEvent } from "../src/types.ts";

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
const [
  {
    ACADEMIC_SCHEDULE_REVISION,
    defaultEvents,
    defaultSubjects,
    hydratePersistedEvents,
    hydratePersistedSubjects
  },
  { dateAtTimeZone, dateKeyAtTimeZone, zonedDateParts }
] = await Promise.all([
  import("../src/data/seed.ts"),
  import("../src/lib/zonedDate.ts")
]);
moduleHooks.deregister();

const recurringEvents = defaultEvents.filter((event) => event.id.startsWith("course-"));
const englishEvents = recurringEvents.filter((event) => event.title === "Anglais");

function localTime(value: string): string {
  const parts = zonedDateParts(new Date(value));
  return `${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`;
}

function recurringDate(event: CalendarEvent): string {
  const match = /^course-s[12]-(\d{4}-\d{2}-\d{2})-/.exec(event.id);
  assert.ok(match, `identifiant récurrent invalide : ${event.id}`);
  return match[1];
}

function eventBySuffix(date: string, suffix: string): CalendarEvent {
  const event = recurringEvents.find((candidate) => (
    recurringDate(candidate) === date && candidate.id.endsWith(`-${suffix}`)
  ));
  assert.ok(event, `créneau ${suffix} absent le ${date}`);
  return event;
}

test("le planning réserve 30 minutes d’anglais au début de chaque matin", () => {
  assert.equal(ACADEMIC_SCHEDULE_REVISION, 2);
  assert.equal(defaultEvents.length, 1_115);
  assert.equal(recurringEvents.length, 1_076);
  assert.equal(englishEvents.length, 138);
  assert.equal(englishEvents.filter((event) => event.id.startsWith("course-s1-")).length, 69);
  assert.equal(englishEvents.filter((event) => event.id.startsWith("course-s2-")).length, 69);
  assert.ok(englishEvents.every((event) => event.subjectId === "anglais"));
  assert.ok(englishEvents.every((event) => event.type === "course"));
  assert.ok(englishEvents.every((event) => event.description?.includes("parcours annuel CECRL")));
  assert.equal(new Set(defaultEvents.map((event) => event.id)).size, defaultEvents.length);

  const byDate = new Map<string, CalendarEvent[]>();
  for (const event of recurringEvents) {
    const date = recurringDate(event);
    byDate.set(date, [...(byDate.get(date) ?? []), event]);
  }

  assert.equal(byDate.size, 138);
  for (const [date, events] of byDate) {
    const sorted = [...events].sort((left, right) => left.start.localeCompare(right.start));
    const english = sorted.filter((event) => event.title === "Anglais");
    assert.equal(english.length, 1, `une seule séance d’anglais le ${date}`);
    assert.equal(sorted[0], english[0], `l’anglais doit être le premier créneau le ${date}`);
    assert.equal(localTime(english[0].start), "08:30");
    assert.equal(localTime(english[0].end), "09:00");
    assert.equal(localTime(sorted.at(-1)!.end), "17:45");

    const duration = events.reduce(
      (sum, event) => sum + (Date.parse(event.end) - Date.parse(event.start)) / 60_000,
      0
    );
    assert.equal(duration, 450, `la durée journalière doit rester de 450 min le ${date}`);

    for (let index = 1; index < sorted.length; index += 1) {
      assert.ok(
        Date.parse(sorted[index - 1].end) <= Date.parse(sorted[index].start),
        `chevauchement entre ${sorted[index - 1].id} et ${sorted[index].id}`
      );
    }
  }
});

test("les cours du matin sont réduits sans déplacer les pauses ni la fin de journée", () => {
  const mondayAnalysis = eventBySuffix("2026-09-07", "lun-analyse-cours");
  assert.deepEqual([localTime(mondayAnalysis.start), localTime(mondayAnalysis.end)], ["09:00", "10:30"]);

  const wednesdayCourse = eventBySuffix("2026-09-09", "mer-analyse-cours");
  const wednesdayExercises = eventBySuffix("2026-09-09", "mer-analyse-ex");
  assert.deepEqual([localTime(wednesdayCourse.start), localTime(wednesdayCourse.end)], ["09:00", "09:45"]);
  assert.deepEqual([localTime(wednesdayExercises.start), localTime(wednesdayExercises.end)], ["09:45", "10:30"]);

  const fridayCourse = eventBySuffix("2026-09-11", "ven-physique-cours");
  const fridayExercises = eventBySuffix("2026-09-11", "ven-physique-ex");
  assert.deepEqual([localTime(fridayCourse.start), localTime(fridayCourse.end)], ["09:00", "09:45"]);
  assert.deepEqual([localTime(fridayExercises.start), localTime(fridayExercises.end)], ["09:45", "10:30"]);

  for (const date of ["2026-09-07", "2026-09-08", "2026-09-09", "2026-09-10", "2026-09-11"]) {
    const events = recurringEvents
      .filter((event) => recurringDate(event) === date)
      .sort((left, right) => left.start.localeCompare(right.start));
    assert.ok(events.some((event) => localTime(event.end) === "10:30"));
    assert.ok(events.some((event) => localTime(event.start) === "10:45"));
    assert.ok(events.some((event) => localTime(event.end) === "12:45"));
    assert.ok(events.some((event) => localTime(event.start) === "14:00"));
    assert.ok(events.some((event) => localTime(event.end) === "16:00"));
    assert.ok(events.some((event) => localTime(event.start) === "16:15"));
    assert.equal(localTime(events.at(-1)!.end), "17:45");
  }
});

test("les vacances restent sans anglais et les horaires suivent Europe/Zurich", () => {
  const englishDates = new Set(englishEvents.map(recurringDate));
  for (const excluded of ["2026-09-21", "2026-10-19", "2027-03-26", "2027-04-02"]) {
    assert.equal(englishDates.has(excluded), false, `aucun anglais attendu le ${excluded}`);
  }

  const beforeWinterTime = englishEvents.find((event) => recurringDate(event) === "2026-09-07");
  const winterTime = englishEvents.find((event) => recurringDate(event) === "2027-02-22");
  const afterSummerTime = englishEvents.find((event) => recurringDate(event) === "2027-04-05");
  assert.ok(beforeWinterTime && winterTime && afterSummerTime);
  assert.equal(beforeWinterTime.start, "2026-09-07T06:30:00.000Z");
  assert.equal(winterTime.start, "2027-02-22T07:30:00.000Z");
  assert.equal(afterSummerTime.start, "2027-04-05T06:30:00.000Z");
});

test("la migration du planning préserve les personnalisations et reste idempotente", () => {
  const legacyOffsets = new Map<string, { start: number; end: number }>([
    ["lun-analyse-cours", { start: -30, end: 0 }],
    ["mar-physique-cours", { start: -30, end: 0 }],
    ["mer-analyse-cours", { start: -30, end: -15 }],
    ["mer-analyse-ex", { start: -15, end: 0 }],
    ["jeu-algebre-cours", { start: -30, end: 0 }],
    ["ven-physique-cours", { start: -30, end: -15 }],
    ["ven-physique-ex", { start: -15, end: 0 }]
  ]);
  const shift = (value: string, minutes: number) =>
    new Date(Date.parse(value) + minutes * 60_000).toISOString();

  const legacyEvents = defaultEvents
    .filter((event) => event.title !== "Anglais")
    .map((event) => {
      const slotKey = /^course-s[12]-\d{4}-\d{2}-\d{2}-(.+)$/.exec(event.id)?.[1] ?? "";
      const offsets = legacyOffsets.get(slotKey);
      return offsets
        ? { ...event, start: shift(event.start, offsets.start), end: shift(event.end, offsets.end) }
        : { ...event };
    });
  assert.equal(legacyEvents.length, 977);

  const customized = legacyEvents.find((event) => event.id === "course-s1-2026-09-07-lun-analyse-cours");
  assert.ok(customized);
  customized.start = dateAtTimeZone("2026-09-07", 8, 45).toISOString();
  customized.end = dateAtTimeZone("2026-09-07", 10, 15).toISOString();
  const personal: CalendarEvent = {
    id: "personal-migration-test",
    title: "Rendez-vous personnel",
    start: dateAtTimeZone("2026-09-08", 19).toISOString(),
    end: dateAtTimeZone("2026-09-08", 20).toISOString(),
    type: "personal",
    color: "#123456"
  };

  const migrated = hydratePersistedEvents([...legacyEvents, personal]);
  assert.equal(migrated.length, 1_116);
  assert.equal(migrated.filter((event) => event.title === "Anglais").length, 138);
  assert.strictEqual(migrated.find((event) => event.id === personal.id), personal);
  assert.deepEqual(
    migrated.find((event) => event.id === customized.id),
    customized,
    "un créneau canonique déjà personnalisé ne doit pas être écrasé"
  );

  const migratedTuesday = migrated.find((event) => event.id === "course-s1-2026-09-08-mar-physique-cours");
  assert.ok(migratedTuesday);
  assert.deepEqual([localTime(migratedTuesday.start), localTime(migratedTuesday.end)], ["09:00", "10:30"]);
  assert.strictEqual(hydratePersistedEvents(migrated), migrated);

  const customOnly = [personal];
  assert.strictEqual(hydratePersistedEvents(customOnly), customOnly);
});

test("la migration v1 relie uniquement les séances d’anglais canoniques à leur cours", () => {
  const v1Events = defaultEvents.map((event) => event.title === "Anglais"
    ? {
        ...event,
        subjectId: undefined,
        type: "study" as const,
        description: "Langue étrangère · pratique quotidienne — 30 min"
      }
    : { ...event }
  );
  const customized = v1Events.find((event) => event.id === "course-s1-2026-09-07-lun-anglais");
  assert.ok(customized);
  customized.description = "Séance personnalisée par Louis";

  const migrated = hydratePersistedEvents(v1Events);
  const migratedEnglish = migrated.filter((event) => event.title === "Anglais");
  assert.equal(migrated.length, 1_115);
  assert.equal(migratedEnglish.filter((event) => event.subjectId === "anglais").length, 137);
  assert.deepEqual(migrated.find((event) => event.id === customized.id), customized);
  assert.strictEqual(hydratePersistedEvents(migrated), migrated);
});

test("la migration des matières actualise les prochains cours sans perdre la progression", () => {
  const persisted = structuredClone(defaultSubjects);
  persisted.find((subject) => subject.id === "analyse")!.nextClass = "Lun. 08:30";
  persisted.find((subject) => subject.id === "mecanique")!.nextClass = "Mar. 08:30";
  persisted.find((subject) => subject.id === "thermodynamique")!.nextClass = "Mar. 08:30";
  persisted[0].modules[0].items[0].lessons![0].completed = true;

  const migrated = hydratePersistedSubjects(persisted);
  assert.equal(migrated.find((subject) => subject.id === "analyse")!.nextClass, "Lun. 09:00");
  assert.equal(migrated.find((subject) => subject.id === "mecanique")!.nextClass, "Mar. 09:00");
  assert.equal(migrated.find((subject) => subject.id === "thermodynamique")!.nextClass, "Mar. 09:00");
  assert.equal(migrated[0].modules[0].items[0].lessons![0].completed, true);
  assert.equal(migrated.filter((subject) => subject.id === "anglais").length, 1);
  assert.equal(migrated.find((subject) => subject.id === "anglais")!.modules.length, 12);

  const oldProfile = structuredClone(defaultSubjects.filter((subject) => subject.id !== "anglais"));
  const oldProfileMigrated = hydratePersistedSubjects(oldProfile);
  assert.equal(oldProfileMigrated.filter((subject) => subject.id === "anglais").length, 1);
  assert.equal(oldProfileMigrated.find((subject) => subject.id === "anglais")!.modules.length, 12);
});

test("chaque séance anglaise reste sur sa date civile scolaire", () => {
  for (const event of englishEvents) {
    assert.equal(dateKeyAtTimeZone(new Date(event.start)), recurringDate(event));
    assert.equal(dateKeyAtTimeZone(new Date(event.end)), recurringDate(event));
  }
});
