import assert from "node:assert/strict";
import test from "node:test";
import { indexEventsByDay } from "../src/lib/date.ts";
import {
  dateAtTimeZone,
  dateFromTimeZoneInput,
  dateKeyAtTimeZone,
  dateTimeInputValueAtTimeZone
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
