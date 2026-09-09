import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "vite";
import {
  buildCalendarIcs,
  escapeIcsText,
  foldIcsLine,
  nativeCalendarCompatibilityError,
  NATIVE_CALENDAR_MAX_ICS_BYTES,
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

function uidLine(content: string) {
  return content.split("\r\n").find((line) => line.startsWith("UID:"));
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

test("la sortie historique sans nouvelle option reste strictement identique", () => {
  const result = buildCalendarIcs([event()], defaultSubjects, { generatedAt });
  const expected = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Dowze Academie//Planning scolaire//FR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Dowze Academie — Année 1",
    "X-WR-TIMEZONE:Europe/Zurich",
    "BEGIN:VEVENT",
    "UID:etude-6576656e742d74657374@com.etude.desktop",
    "DTSTAMP:20260830T130000Z",
    "DTSTART:20260907T063000Z",
    "DTEND:20260907T083000Z",
    "SUMMARY:Analyse I & II",
    "DESCRIPTION:Matière : Analyse I & II\\nType : Cours\\nSource : Dowze Academi",
    " e",
    "CATEGORIES:Cours,Analyse",
    "STATUS:CONFIRMED",
    "TRANSP:OPAQUE",
    "END:VEVENT",
    "END:VCALENDAR",
    ""
  ].join("\r\n");

  assert.equal(result.content, expected);
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

test("une journée entière suit le fuseau fourni à l’export", () => {
  const sharedEvent = event({
    id: "jour-partage",
    title: "Journée partagée",
    start: "2026-09-07T00:30:00.000Z",
    end: "2026-09-08T00:30:00.000Z",
    allDay: true,
    type: "break"
  });
  const losAngeles = buildCalendarIcs([sharedEvent], defaultSubjects, {
    generatedAt,
    timeZone: "America/Los_Angeles"
  });
  const tokyo = buildCalendarIcs([sharedEvent], defaultSubjects, {
    generatedAt,
    timeZone: "Asia/Tokyo"
  });

  assert.match(losAngeles.content, /X-WR-TIMEZONE:America\/Los_Angeles\r\n/);
  assert.match(losAngeles.content, /DTSTART;VALUE=DATE:20260906\r\n/);
  assert.match(losAngeles.content, /DTEND;VALUE=DATE:20260907\r\n/);
  assert.match(tokyo.content, /X-WR-TIMEZONE:Asia\/Tokyo\r\n/);
  assert.match(tokyo.content, /DTSTART;VALUE=DATE:20260907\r\n/);
  assert.match(tokyo.content, /DTEND;VALUE=DATE:20260908\r\n/);
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
  assert.equal(uidLine(first.content), uidLine(second.content));
  assert.deepEqual(first.skippedEventIds, ["invalide"]);
  assert.equal(first.exportedEvents.length, 1);
});

test("deux formations donnent des UID distincts sans modifier les ids fonctionnels", () => {
  const input = [event(), event({ id: "invalide", end: "date impossible" })];
  const formationA = buildCalendarIcs(input, defaultSubjects, {
    generatedAt,
    uidNamespace: "formation-a"
  });
  const formationB = buildCalendarIcs(input, defaultSubjects, {
    generatedAt,
    uidNamespace: "formation-b"
  });

  assert.equal(
    uidLine(formationA.content),
    "UID:etude-666f726d6174696f6e2d61-6576656e742d74657374@com.etude.desktop"
  );
  assert.notEqual(uidLine(formationA.content), uidLine(formationB.content));
  assert.deepEqual(formationA.exportedEvents.map((item) => item.id), ["event-test"]);
  assert.deepEqual(formationB.exportedEvents.map((item) => item.id), ["event-test"]);
  assert.deepEqual(formationA.skippedEventIds, ["invalide"]);
  assert.deepEqual(formationB.skippedEventIds, ["invalide"]);
});

test("les options calendrier mal formées sont refusées avant de produire un ICS", () => {
  assert.throws(
    () => buildCalendarIcs([event()], defaultSubjects, { calendarName: " Dowze" }),
    /nom du calendrier/
  );
  assert.throws(
    () => buildCalendarIcs([event()], defaultSubjects, { timeZone: "Europe//Zurich" }),
    /fuseau du calendrier/
  );
  assert.throws(
    () => buildCalendarIcs([event()], defaultSubjects, { timeZone: "Mars/Olympus_Mons" }),
    /n’est pas reconnu/
  );
  assert.throws(
    () => buildCalendarIcs([event()], defaultSubjects, { uidNamespace: "" }),
    /espace UID/
  );
  assert.throws(
    () => buildCalendarIcs([event()], defaultSubjects, { uidNamespace: "formation\nA" }),
    /espace UID/
  );
});

test("la compatibilité native tient compte des octets UTF-8 et des métadonnées ajoutées", () => {
  const oversizedLocation = buildCalendarIcs([
    event({ location: "界".repeat(334) })
  ], defaultSubjects, { generatedAt });
  assert.match(
    nativeCalendarCompatibilityError(oversizedLocation, "Dowze Academie — Année 1") ?? "",
    /lieu.*1002 octets/i
  );

  const enrichedDescription = buildCalendarIcs([
    event({ description: "界".repeat(3_990) })
  ], defaultSubjects, { generatedAt });
  assert.match(
    nativeCalendarCompatibilityError(enrichedDescription, "Dowze Academie — Année 1") ?? "",
    /description.*limite de 12000/i
  );
});

test("la compatibilité native bloque un export vide, incomplet ou supérieur à 4 Mio", () => {
  const empty = buildCalendarIcs([], defaultSubjects, { generatedAt });
  assert.match(nativeCalendarCompatibilityError(empty, "Dowze Academie — Année 1") ?? "", /aucun événement/);

  const skipped = buildCalendarIcs([
    event(),
    event({ id: "invalide", end: "date impossible" })
  ], defaultSubjects, { generatedAt });
  assert.match(nativeCalendarCompatibilityError(skipped, "Dowze Academie — Année 1") ?? "", /seraient ignorés/);

  const normal = buildCalendarIcs([event()], defaultSubjects, { generatedAt });
  assert.match(
    nativeCalendarCompatibilityError(
      { ...normal, byteLength: NATIVE_CALENDAR_MAX_ICS_BYTES + 1 },
      "Dowze Academie — Année 1"
    ) ?? "",
    /fichier calendrier.*au-delà/i
  );
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
  const vite = await createServer({
    server: { middlewareMode: true, hmr: false },
    appType: "custom"
  });
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
