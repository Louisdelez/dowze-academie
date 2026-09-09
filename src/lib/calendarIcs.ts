import type { CalendarEvent, Subject } from "../types";

export type CalendarExportGroup = "learning" | "assessments" | "other";

export type CalendarExportSelection = Record<CalendarExportGroup, boolean>;

export const DEFAULT_CALENDAR_EXPORT_SELECTION: CalendarExportSelection = {
  learning: true,
  assessments: true,
  other: true
};

export const CALENDAR_EXPORT_GROUPS: ReadonlyArray<{
  id: CalendarExportGroup;
  label: string;
  description: string;
}> = [
  { id: "learning", label: "Cours et travail", description: "Cours, TP, exercices et révisions" },
  { id: "assessments", label: "Examens et jalons", description: "Contrôles, partiels, examens et validations" },
  { id: "other", label: "Vacances et personnel", description: "Congés, pauses et événements personnels" }
];

const EVENT_TYPE_LABELS: Record<CalendarEvent["type"], string> = {
  course: "Cours",
  study: "Travail personnel",
  exam: "Évaluation",
  personal: "Personnel",
  milestone: "Jalon académique",
  break: "Vacances"
};

export interface CalendarIcsEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  startDate?: string;
  endDate?: string;
  location?: string;
  description?: string;
  category: string;
  subject?: string;
}

export interface CalendarIcsBuildResult {
  content: string;
  exportedEvents: CalendarIcsEvent[];
  skippedEventIds: string[];
  byteLength: number;
}

export const NATIVE_CALENDAR_MAX_EVENTS = 5_000;
export const NATIVE_CALENDAR_MAX_ICS_BYTES = 4 * 1024 * 1024;

const NATIVE_CALENDAR_TEXT_LIMITS = {
  id: 160,
  title: 500,
  category: 120,
  location: 1_000,
  description: 12_000,
  subject: 300
} as const satisfies Record<
  keyof Pick<CalendarIcsEvent, "id" | "title" | "category" | "location" | "description" | "subject">,
  number
>;

export function calendarExportGroup(event: CalendarEvent): CalendarExportGroup {
  if (event.type === "course" || event.type === "study") return "learning";
  if (event.type === "exam" || event.type === "milestone") return "assessments";
  return "other";
}

export function selectCalendarEvents(
  events: CalendarEvent[],
  selection: CalendarExportSelection
): CalendarEvent[] {
  return events.filter((event) => selection[calendarExportGroup(event)]);
}

const dayFormatters = new Map<string, Intl.DateTimeFormat>();

function dayFormatter(timeZone: string) {
  const existing = dayFormatters.get(timeZone);
  if (existing) return existing;
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  dayFormatters.set(timeZone, formatter);
  return formatter;
}

function dateInTimeZone(date: Date, timeZone: string): string {
  const parts = dayFormatter(timeZone).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}${value("month")}${value("day")}`;
}

function utcDateTime(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

export function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

export function foldIcsLine(line: string): string {
  const folded: string[] = [];
  let current = "";
  let currentBytes = 0;

  for (const character of line) {
    const codePoint = character.codePointAt(0) ?? 0;
    const characterBytes = codePoint <= 0x7f
      ? 1
      : codePoint <= 0x7ff
        ? 2
        : codePoint <= 0xffff
          ? 3
          : 4;
    if (current && currentBytes + characterBytes > 75) {
      folded.push(current);
      current = ` ${character}`;
      currentBytes = 1 + characterBytes;
    } else {
      current += character;
      currentBytes += characterBytes;
    }
  }
  folded.push(current);
  return folded.join("\r\n");
}

function hexadecimalIdentity(value: string): string {
  const bytes = new TextEncoder().encode(value);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function stableEventUid(id: string, uidNamespace?: string): string {
  const namespacePrefix = uidNamespace === undefined
    ? ""
    : `${hexadecimalIdentity(uidNamespace)}-`;
  return `etude-${namespacePrefix}${hexadecimalIdentity(id)}@com.etude.desktop`;
}

function utf8Length(value: string) {
  return new TextEncoder().encode(value).byteLength;
}

function containsForbiddenNativeControl(value: string) {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return (
      codePoint === 0 ||
      ((codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f)) &&
        ![9, 10, 13].includes(codePoint))
    );
  });
}

function nativeCalendarTextError(value: string, label: string, maximumBytes: number) {
  if (!value || value.trim() !== value) {
    return `${label} est vide ou comporte des espaces extérieurs.`;
  }
  if (containsForbiddenNativeControl(value)) {
    return `${label} contient un caractère de contrôle interdit.`;
  }
  const bytes = utf8Length(value);
  if (bytes > maximumBytes) {
    return `${label} occupe ${bytes} octets, au-delà de la limite de ${maximumBytes}.`;
  }
  return null;
}

/** Vérifie le contrat exact appliqué par les commandes calendrier Tauri. */
export function nativeCalendarCompatibilityError(
  calendar: CalendarIcsBuildResult,
  calendarName: string
): string | null {
  const nameError = nativeCalendarTextError(calendarName, "Le nom du calendrier", 200);
  if (nameError) return nameError;
  if (!calendar.exportedEvents.length) return "Le calendrier ne contient aucun événement exportable.";
  if (calendar.exportedEvents.length > NATIVE_CALENDAR_MAX_EVENTS) {
    return `Le calendrier dépasse la limite de ${NATIVE_CALENDAR_MAX_EVENTS.toLocaleString("fr-CH")} événements.`;
  }
  if (calendar.skippedEventIds.length) {
    return `${calendar.skippedEventIds.length} événement(s) invalide(s) seraient ignorés. Corrige-les avant l’export.`;
  }
  const labels = {
    id: "L’identifiant d’un événement",
    title: "Le titre d’un événement",
    category: "La catégorie d’un événement",
    location: "Le lieu d’un événement",
    description: "La description d’un événement",
    subject: "La matière d’un événement"
  } as const;
  for (const event of calendar.exportedEvents) {
    for (const key of Object.keys(NATIVE_CALENDAR_TEXT_LIMITS) as Array<keyof typeof NATIVE_CALENDAR_TEXT_LIMITS>) {
      const value = event[key];
      if (value === undefined) continue;
      const error = nativeCalendarTextError(value, labels[key], NATIVE_CALENDAR_TEXT_LIMITS[key]);
      if (error) return `${error} Événement : « ${event.title} ».`;
    }
  }
  if (calendar.byteLength > NATIVE_CALENDAR_MAX_ICS_BYTES) {
    return `Le fichier calendrier occupe ${calendar.byteLength.toLocaleString("fr-CH")} octets, au-delà de la limite de ${NATIVE_CALENDAR_MAX_ICS_BYTES.toLocaleString("fr-CH")}. Désactive une partie du planning.`;
  }
  return null;
}

function validateCalendarBuildOptions(
  calendarName: string,
  timeZone: string,
  uidNamespace?: string
) {
  if (!calendarName || calendarName.trim() !== calendarName || utf8Length(calendarName) > 200) {
    throw new Error("Le nom du calendrier est vide, trop long ou mal formé.");
  }
  if (calendarName.split("").some((character) => {
    const code = character.codePointAt(0) ?? 0;
    return (code < 32 || (code >= 127 && code <= 159)) && ![9, 10, 13].includes(code);
  })) {
    throw new Error("Le nom du calendrier contient un caractère de contrôle interdit.");
  }
  if (
    !timeZone ||
    timeZone.trim() !== timeZone ||
    utf8Length(timeZone) > 80 ||
    !/^[A-Za-z0-9_+\-/]+$/.test(timeZone) ||
    timeZone.split("/").some((part) => !part || part === "." || part === "..")
  ) {
    throw new Error("Le fuseau du calendrier est vide ou mal formé.");
  }
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(0);
  } catch {
    throw new Error("Le fuseau du calendrier n’est pas reconnu.");
  }
  if (uidNamespace !== undefined && (
    !uidNamespace ||
    uidNamespace.trim() !== uidNamespace ||
    utf8Length(uidNamespace) > 128 ||
    [...uidNamespace].some((character) => {
      const code = character.codePointAt(0) ?? 0;
      return code < 32 || (code >= 127 && code <= 159);
    })
  )) {
    throw new Error("L’espace UID du calendrier est vide ou mal formé.");
  }
}

export function toCalendarIcsEvents(
  events: CalendarEvent[],
  subjects: Subject[],
  timeZone = "Europe/Zurich"
): { exportedEvents: CalendarIcsEvent[]; skippedEventIds: string[] } {
  const subjectsById = new Map(subjects.map((subject) => [subject.id, subject]));
  const skippedEventIds: string[] = [];
  const exportedEvents = events
    .slice()
    .sort((left, right) =>
      left.start.localeCompare(right.start) || left.end.localeCompare(right.end) || left.id.localeCompare(right.id)
    )
    .flatMap<CalendarIcsEvent>((event) => {
      const start = new Date(event.start);
      const end = new Date(event.end);
      if (
        !event.id.trim() ||
        !event.title.trim() ||
        Number.isNaN(start.getTime()) ||
        Number.isNaN(end.getTime()) ||
        end <= start
      ) {
        skippedEventIds.push(event.id);
        return [];
      }
      const subject = event.subjectId ? subjectsById.get(event.subjectId) : undefined;
      const typeLabel = EVENT_TYPE_LABELS[event.type];
      const description = [
        event.description?.trim(),
        subject ? `Matière : ${subject.name}` : undefined,
        `Type : ${typeLabel}`,
        "Source : Dowze Academie"
      ].filter(Boolean).join("\n");
      const allDay = event.allDay === true;
      return [{
        id: event.id,
        title: event.title.trim(),
        start: start.toISOString(),
        end: end.toISOString(),
        allDay,
        ...(allDay ? {
          startDate: dateInTimeZone(start, timeZone),
          endDate: dateInTimeZone(end, timeZone)
        } : {}),
        ...(event.location?.trim() ? { location: event.location.trim() } : {}),
        description,
        category: typeLabel,
        ...(subject ? { subject: subject.shortName || subject.name } : {})
      }];
    });
  return { exportedEvents, skippedEventIds };
}

function eventLines(
  event: CalendarIcsEvent,
  generatedAt: Date,
  uidNamespace?: string
): string[] {
  const lines = [
    "BEGIN:VEVENT",
    `UID:${stableEventUid(event.id, uidNamespace)}`,
    `DTSTAMP:${utcDateTime(generatedAt)}`
  ];
  if (event.allDay) {
    lines.push(`DTSTART;VALUE=DATE:${event.startDate}`);
    lines.push(`DTEND;VALUE=DATE:${event.endDate}`);
  } else {
    lines.push(`DTSTART:${utcDateTime(new Date(event.start))}`);
    lines.push(`DTEND:${utcDateTime(new Date(event.end))}`);
  }
  lines.push(`SUMMARY:${escapeIcsText(event.title)}`);
  if (event.location) lines.push(`LOCATION:${escapeIcsText(event.location)}`);
  if (event.description) lines.push(`DESCRIPTION:${escapeIcsText(event.description)}`);
  const categories = [event.category, event.subject]
    .filter((value): value is string => Boolean(value))
    .map(escapeIcsText)
    .join(",");
  if (categories) lines.push(`CATEGORIES:${categories}`);
  lines.push("STATUS:CONFIRMED", "TRANSP:OPAQUE", "END:VEVENT");
  return lines;
}

export function buildCalendarIcs(
  events: CalendarEvent[],
  subjects: Subject[],
  options: {
    calendarName?: string;
    timeZone?: string;
    generatedAt?: Date;
    uidNamespace?: string;
  } = {}
): CalendarIcsBuildResult {
  const calendarName = options.calendarName ?? "Dowze Academie — Année 1";
  const timeZone = options.timeZone ?? "Europe/Zurich";
  const generatedAt = options.generatedAt ?? new Date();
  validateCalendarBuildOptions(calendarName, timeZone, options.uidNamespace);
  if (Number.isNaN(generatedAt.getTime())) throw new Error("La date de génération du calendrier est invalide.");
  const { exportedEvents, skippedEventIds } = toCalendarIcsEvents(events, subjects, timeZone);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Dowze Academie//Planning scolaire//FR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeIcsText(calendarName)}`,
    `X-WR-TIMEZONE:${escapeIcsText(timeZone)}`,
    ...exportedEvents.flatMap((event) => eventLines(event, generatedAt, options.uidNamespace)),
    "END:VCALENDAR"
  ];
  const content = `${lines.map(foldIcsLine).join("\r\n")}\r\n`;
  return {
    content,
    exportedEvents,
    skippedEventIds,
    byteLength: new TextEncoder().encode(content).length
  };
}
