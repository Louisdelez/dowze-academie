import assert from "node:assert/strict";
import test from "node:test";
import {
  calendarDateFor,
  calendarTimeFor,
  indexEventsByDay,
  localDayKey,
  timeLabel,
  weekDays
} from "../src/lib/date.ts";
import {
  calendarDateFromKey,
  dateAtTimeZone,
  dateFromTimeZoneInput,
  dateKeyAtTimeZone,
  dateTimeInputValueAtTimeZone,
  zonedDateParts
} from "../src/lib/zonedDate.ts";
import type { CalendarEvent } from "../src/types.ts";

test("convertit une heure scolaire Zurich indépendamment du fuseau système", () => {
  const instant = dateAtTimeZone("2026-09-07", 8, 30);
  assert.equal(dateKeyAtTimeZone(instant), "2026-09-07");
  assert.equal(dateTimeInputValueAtTimeZone(instant), "2026-09-07T08:30");
});

test("refuse une heure inexistante au passage à l’heure d’été", () => {
  assert.throws(
    () => dateFromTimeZoneInput("2027-03-28T02:30"),
    /n’existe pas/
  );
});

test("préserve le jour civil lorsque le fuseau saute minuit", () => {
  for (const [dateKey, timeZone] of [
    ["2027-03-28", "Asia/Beirut"],
    ["2027-04-30", "Africa/Cairo"]
  ] as const) {
    const instant = dateAtTimeZone(dateKey, 0, 0, timeZone);
    const parts = zonedDateParts(instant, timeZone);
    assert.equal(dateKeyAtTimeZone(instant, timeZone), dateKey, timeZone);
    assert.equal(parts.hour, 1, timeZone);
    assert.equal(parts.minute, 0, timeZone);
    assert.throws(
      () => dateFromTimeZoneInput(`${dateKey}T00:00`, timeZone),
      /n’existe pas/,
      timeZone
    );
  }
});

test("refuse une date civile entièrement sautée", () => {
  assert.throws(
    () => dateAtTimeZone("2011-12-30", 0, 0, "Pacific/Apia"),
    /date civile 2011-12-30 n’existe pas/i
  );
  assert.throws(
    () => calendarDateFromKey("2011-12-30", "Pacific/Apia"),
    /date civile 2011-12-30 n’existe pas/i
  );
});

test("indexe une journée entière uniquement sur ses jours civils Zurich", () => {
  const event: CalendarEvent = {
    id: "rentree",
    title: "Rentrée",
    start: dateAtTimeZone("2026-09-07").toISOString(),
    end: dateAtTimeZone("2026-09-08").toISOString(),
    allDay: true,
    type: "milestone",
    color: "#5868de"
  };
  const index = indexEventsByDay([event]);
  assert.deepEqual([...index.keys()], ["2026-09-07"]);
});

test("les helpers calendrier suivent le fuseau optionnel sans changer leur défaut", () => {
  const instant = new Date("2026-09-07T00:30:00.000Z");

  assert.equal(localDayKey(instant), "2026-09-07");
  assert.equal(localDayKey(instant, "America/Los_Angeles"), "2026-09-06");
  assert.equal(localDayKey(instant, "Asia/Tokyo"), "2026-09-07");
  assert.equal(timeLabel(instant.toISOString(), "America/Los_Angeles"), "17:30");
  assert.equal(timeLabel(instant.toISOString(), "Asia/Tokyo"), "09:30");

  const losAngelesDate = calendarDateFor(2026, 9, 6, "America/Los_Angeles");
  const losAngelesSlot = calendarTimeFor(
    losAngelesDate,
    8,
    30,
    "America/Los_Angeles"
  );
  assert.equal(dateKeyAtTimeZone(losAngelesSlot, "America/Los_Angeles"), "2026-09-06");
  assert.equal(timeLabel(losAngelesSlot.toISOString(), "America/Los_Angeles"), "08:30");

  assert.deepEqual(
    weekDays(instant, "America/Los_Angeles").map((date) => localDayKey(date, "America/Los_Angeles")),
    ["2026-08-31", "2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-05", "2026-09-06"]
  );
  assert.deepEqual(
    weekDays(instant, "Asia/Tokyo").map((date) => localDayKey(date, "Asia/Tokyo")),
    ["2026-09-07", "2026-09-08", "2026-09-09", "2026-09-10", "2026-09-11", "2026-09-12", "2026-09-13"]
  );
});

test("le même événement est indexé sur le bon jour civil de chaque formation", () => {
  const sharedEvent: CalendarEvent = {
    id: "cours-mondial",
    title: "Cours mondial",
    start: "2026-09-07T00:30:00.000Z",
    end: "2026-09-07T01:30:00.000Z",
    type: "course",
    color: "#5868de"
  };

  assert.deepEqual([...indexEventsByDay([sharedEvent], "America/Los_Angeles").keys()], ["2026-09-06"]);
  assert.deepEqual([...indexEventsByDay([sharedEvent], "Asia/Tokyo").keys()], ["2026-09-07"]);
});
