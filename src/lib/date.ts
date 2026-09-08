import type { CalendarEvent, CalendarView } from "../types";
import {
  addCalendarDays,
  calendarDateFromKey,
  dateAtTimeZone,
  dateKeyAtTimeZone,
  weekdayFromDateKey,
  zonedDateParts
} from "./zonedDate.ts";

export const CALENDAR_TIME_ZONE = "Europe/Zurich";
export const WEEK_STARTS_ON = 1 as const;
export const HOURS = Array.from({ length: 24 }, (_, index) => index);
export const WEEK_DAYS_SHORT = ["LUN", "MAR", "MER", "JEU", "VEN", "SAM", "DIM"];

export type CalendarEventIndex = Map<string, CalendarEvent[]>;
const MAX_INDEXED_EVENT_DAYS = 3_660;

const frenchFormatterCache = new Map<string, Intl.DateTimeFormat>();

function frenchFormatter(options: Intl.DateTimeFormatOptions) {
  const normalized = { ...options, timeZone: CALENDAR_TIME_ZONE };
  const key = JSON.stringify(normalized);
  const cached = frenchFormatterCache.get(key);
  if (cached) return cached;
  const formatter = new Intl.DateTimeFormat("fr-CH", normalized);
  frenchFormatterCache.set(key, formatter);
  return formatter;
}

function dateKeyParts(dateKey: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) throw new Error(`Date civile invalide : ${dateKey}`);
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function shiftedMonthKey(dateKey: string, amount: number) {
  const { year, month, day } = dateKeyParts(dateKey);
  const monthCursor = new Date(Date.UTC(year, month - 1 + amount, 1));
  const targetYear = monthCursor.getUTCFullYear();
  const targetMonth = monthCursor.getUTCMonth() + 1;
  const targetDay = Math.min(day, daysInMonth(targetYear, targetMonth));
  return `${targetYear}-${String(targetMonth).padStart(2, "0")}-${String(targetDay).padStart(2, "0")}`;
}

export function localDayKey(date: Date) {
  return dateKeyAtTimeZone(date, CALENDAR_TIME_ZONE);
}

/**
 * Indexe les événements selon les jours civils de l'école (Europe/Zurich).
 * La borne de fin est exclusive : un congé du 7 au 8 apparaît uniquement le 7.
 */
export function indexEventsByDay(events: readonly CalendarEvent[]): CalendarEventIndex {
  const index: CalendarEventIndex = new Map();
  events.forEach((event) => {
    const start = new Date(event.start);
    const end = new Date(event.end);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return;

    let cursorKey = dateKeyAtTimeZone(start, CALENDAR_TIME_ZONE);
    const lastTouchedKey = dateKeyAtTimeZone(new Date(end.getTime() - 1), CALENDAR_TIME_ZONE);
    let indexedDays = 0;
    while (cursorKey <= lastTouchedKey && indexedDays < MAX_INDEXED_EVENT_DAYS) {
      const dayEvents = index.get(cursorKey);
      if (dayEvents) dayEvents.push(event);
      else index.set(cursorKey, [event]);
      cursorKey = addCalendarDays(cursorKey, 1);
      indexedDays += 1;
    }
  });

  index.forEach((dayEvents) => dayEvents.sort((a, b) => {
    const allDayOrder = Number(isAllDayEvent(b)) - Number(isAllDayEvent(a));
    return allDayOrder || a.start.localeCompare(b.start);
  }));
  return index;
}

export function indexedEventsForDay(index: CalendarEventIndex, date: Date) {
  return index.get(dateKeyAtTimeZone(date, CALENDAR_TIME_ZONE)) ?? [];
}

export function formatCalendarDate(date: Date, options: Intl.DateTimeFormatOptions) {
  return frenchFormatter(options).format(date);
}

export function calendarDateParts(date: Date) {
  return zonedDateParts(date, CALENDAR_TIME_ZONE);
}

export function calendarDateFor(year: number, month: number, day: number) {
  return calendarDateFromKey(
    `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    CALENDAR_TIME_ZONE
  );
}

export function calendarTimeFor(date: Date, hour: number, minute = 0) {
  return dateAtTimeZone(
    dateKeyAtTimeZone(date, CALENDAR_TIME_ZONE),
    hour,
    minute,
    CALENDAR_TIME_ZONE
  );
}

export function capitalize(value: string) {
  return value.charAt(0).toLocaleUpperCase("fr") + value.slice(1);
}

export function calendarTitle(date: Date, view: CalendarView) {
  if (view === "year") return formatCalendarDate(date, { year: "numeric" });
  if (view === "month") {
    return capitalize(formatCalendarDate(date, { month: "long", year: "numeric" }));
  }
  if (view === "day") {
    return capitalize(formatCalendarDate(date, {
      weekday: "long", day: "numeric", month: "long", year: "numeric"
    }));
  }
  const days = weekDays(date);
  const from = days[0];
  const to = days[6];
  return `${formatCalendarDate(from, { day: "numeric", month: "short" })} – ${formatCalendarDate(to, {
    day: "numeric", month: "short", year: "numeric"
  })}`;
}

export function shiftCalendarDate(date: Date, view: CalendarView, amount: number) {
  const dateKey = dateKeyAtTimeZone(date, CALENDAR_TIME_ZONE);
  if (view === "year") return calendarDateFromKey(shiftedMonthKey(dateKey, amount * 12), CALENDAR_TIME_ZONE);
  if (view === "month") return calendarDateFromKey(shiftedMonthKey(dateKey, amount), CALENDAR_TIME_ZONE);
  return calendarDateFromKey(addCalendarDays(dateKey, amount * (view === "week" ? 7 : 1)), CALENDAR_TIME_ZONE);
}

export function monthGridDays(date: Date) {
  const { year, month } = calendarDateParts(date);
  const firstKey = `${year}-${String(month).padStart(2, "0")}-01`;
  const weekday = weekdayFromDateKey(firstKey);
  const mondayOffset = (weekday + 6) % 7;
  const startKey = addCalendarDays(firstKey, -mondayOffset);
  const lastKey = `${year}-${String(month).padStart(2, "0")}-${String(daysInMonth(year, month)).padStart(2, "0")}`;
  const endWeekday = weekdayFromDateKey(lastKey);
  const trailingDays = (7 - endWeekday) % 7;
  const dayCount = daysInMonth(year, month) + mondayOffset + trailingDays;
  return Array.from({ length: dayCount }, (_, index) =>
    calendarDateFromKey(addCalendarDays(startKey, index), CALENDAR_TIME_ZONE)
  );
}

export function weekDays(date: Date) {
  const key = dateKeyAtTimeZone(date, CALENDAR_TIME_ZONE);
  const mondayOffset = (weekdayFromDateKey(key) + 6) % 7;
  const mondayKey = addCalendarDays(key, -mondayOffset);
  return Array.from({ length: 7 }, (_, index) =>
    calendarDateFromKey(addCalendarDays(mondayKey, index), CALENDAR_TIME_ZONE)
  );
}

export function eventsForDay(events: CalendarEvent[], date: Date) {
  return indexedEventsForDay(indexEventsByDay(events), date);
}

export function isAllDayEvent(event: CalendarEvent) {
  return "allDay" in event && event.allDay === true;
}

export function isCurrentMonth(date: Date, anchor: Date) {
  const dateParts = calendarDateParts(date);
  const anchorParts = calendarDateParts(anchor);
  return dateParts.year === anchorParts.year && dateParts.month === anchorParts.month;
}

export function isDateToday(date: Date) {
  return dateKeyAtTimeZone(date, CALENDAR_TIME_ZONE) === dateKeyAtTimeZone(new Date(), CALENDAR_TIME_ZONE);
}

export function isSameCalendarDay(left: Date, right: Date) {
  return dateKeyAtTimeZone(left, CALENDAR_TIME_ZONE) === dateKeyAtTimeZone(right, CALENDAR_TIME_ZONE);
}

export function timeLabel(dateString: string) {
  return formatCalendarDate(new Date(dateString), {
    hour: "2-digit", minute: "2-digit", hourCycle: "h23"
  });
}

export function wallMinutes(date: Date) {
  const parts = zonedDateParts(date, CALENDAR_TIME_ZONE);
  return parts.hour * 60 + parts.minute;
}

export function startOfLocalDay(date: Date) {
  return dateAtTimeZone(dateKeyAtTimeZone(date, CALENDAR_TIME_ZONE), 0, 0, CALENDAR_TIME_ZONE);
}
