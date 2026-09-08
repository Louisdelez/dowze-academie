import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "vite";
import {
  buildCalendarIcs,
  escapeIcsText,
  foldIcsLine,
  selectCalendarEvents
} from "../src/lib/calendarIcs.ts";
import type { CalendarEvent } from "../src/types.ts";
import type { Subject } from "../src/types.ts";

const generatedAt = new Date("2026-08-30T13:00:00.000Z");
const defaultSubjects = [{
  id: "analyse",
  name: "Analyse I & II",
  shortName: "Analyse"
}] as Subject[];

function event(patch: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: "event-test",
    title: "Analyse I & II",
    subjectId: "analyse",
    start: "2026-09-07T06:30:00.000Z",
    end: "2026-09-07T08:30:00.000Z",
    type: "course",
    color: "#5868d8",
    ...patch
  };
}

test("un cours horaire devient un VEVENT UTC compatible iCalendar", () => {
  const result = buildCalendarIcs([event()], defaultSubjects, { generatedAt });
  assert.match(result.content, /^BEGIN:VCALENDAR\r\nVERSION:2\.0\r\n/);
  assert.match(result.content, /DTSTAMP:20260830T130000Z\r\n/);
  assert.match(result.content, /DTSTART:20260907T063000Z\r\n/);
  assert.match(result.content, /DTEND:20260907T083000Z\r\n/);
  assert.match(result.content, /SUMMARY:Analyse I & II\r\n/);
  assert.match(result.content, /CATEGORIES:Cours,Analyse\r\n/);
  assert.match(result.content, /END:VCALENDAR\r\n$/);
});

test("une journée entière conserve la date Europe/Zurich et une fin exclusive", () => {
  const result = buildCalendarIcs([event({
    id: "jour-ferie",
    title: "Congé",
    start: "2026-09-06T22:00:00.000Z",
    end: "2026-09-07T22:00:00.000Z",
    allDay: true,
    type: "break"
  })], defaultSubjects, { generatedAt });
  assert.match(result.content, /DTSTART;VALUE=DATE:20260907\r\n/);
  assert.match(result.content, /DTEND;VALUE=DATE:20260908\r\n/);
});

test("les textes ICS sont échappés et les lignes UTF-8 restent sous 75 octets", () => {
  assert.equal(
    escapeIcsText("Énergie, chaleur; chemin\\suite\nligne"),
    "Énergie\\, chaleur\\; chemin\\\\suite\\nligne"
  );
  const longTitle = "Énergie très détaillée — ".repeat(12);
  const result = buildCalendarIcs([event({ title: longTitle })], defaultSubjects, { generatedAt });
  for (const line of result.content.split("\r\n").filter(Boolean)) {
    assert.ok(new TextEncoder().encode(line).length <= 75, `ligne trop longue: ${line}`);
  }
  assert.ok(foldIcsLine(`SUMMARY:${longTitle}`).includes("\r\n "));
});

test("les UID restent stables tandis que les événements invalides sont ignorés", () => {
  const first = buildCalendarIcs([event(), event({ id: "invalide", end: "date impossible" })], defaultSubjects, {
    generatedAt
  });
  const second = buildCalendarIcs([event()], defaultSubjects, {
    generatedAt: new Date("2026-09-01T00:00:00.000Z")
  });
  const uid = (content: string) => content.split("\r\n").find((line) => line.startsWith("UID:"));
  assert.equal(uid(first.content), uid(second.content));
  assert.deepEqual(first.skippedEventIds, ["invalide"]);
  assert.equal(first.exportedEvents.length, 1);
});

test("les groupes permettent de choisir cours, évaluations ou autres événements", () => {
  const events = [
    event({ id: "cours", type: "course" }),
    event({ id: "revision", type: "study" }),
    event({ id: "examen", type: "exam" }),
    event({ id: "jalon", type: "milestone" }),
    event({ id: "vacances", type: "break" }),
    event({ id: "personnel", type: "personal" })
  ];
  assert.deepEqual(
    selectCalendarEvents(events, { learning: false, assessments: true, other: false }).map((item) => item.id),
    ["examen", "jalon"]
  );
});

test("le cursus complet exporte les 1 115 occurrences et reste sous la limite Google", async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: "custom" });
  const { defaultEvents, defaultSubjects } = await vite.ssrLoadModule("/src/data/seed.ts") as typeof import("../src/data/seed.ts");
  await vite.close();
  const result = buildCalendarIcs(defaultEvents, defaultSubjects, { generatedAt });
  assert.equal(defaultEvents.length, 1_115);
  assert.equal(result.exportedEvents.length, 1_115);
  assert.deepEqual(result.skippedEventIds, []);
  assert.ok(result.byteLength < 1_000_000, `${result.byteLength} octets`);
  assert.ok(result.content.includes("Contrôle 1 — Analyse + Algèbre linéaire"));
  assert.ok(result.content.includes("SUMMARY:Anglais"));
});
