const formatterCache = new Map<string, Intl.DateTimeFormat>();

function zonedPartsFormatter(timeZone: string) {
  const cached = formatterCache.get(timeZone);
  if (cached) return cached;
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    calendar: "gregory",
    numberingSystem: "latn",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  });
  formatterCache.set(timeZone, formatter);
  return formatter;
}

export interface ZonedDateParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

export function zonedDateParts(date: Date, timeZone = "Europe/Zurich"): ZonedDateParts {
  const values = Object.fromEntries(
    zonedPartsFormatter(timeZone)
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)])
  );
  return {
    year: values.year,
    month: values.month,
    day: values.day,
    hour: values.hour,
    minute: values.minute,
    second: values.second
  };
}

/** Construit un instant depuis une date/heure murale dans un fuseau IANA. */
export function dateAtTimeZone(
  dateKey: string,
  hour = 0,
  minute = 0,
  timeZone = "Europe/Zurich"
) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) throw new Error(`Date civile invalide : ${dateKey}`);
  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const desired = Date.UTC(year, month - 1, day, hour, minute, 0);
  let instant = desired;
  const candidates = new Map<number, ZonedDateParts>();

  // Les corrections convergent normalement en deux passages. Lorsqu'une heure
  // est sautée, elles oscillent entre les décalages placés avant et après la
  // transition : on conserve alors les deux côtés pour choisir le premier
  // instant représentable après l'heure murale demandée.
  for (let index = 0; index < 4; index += 1) {
    if (candidates.has(instant)) break;
    const parts = zonedDateParts(new Date(instant), timeZone);
    candidates.set(instant, parts);
    const represented = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second
    );
    const correction = desired - represented;
    if (correction === 0) return new Date(instant);
    instant += correction;
  }

  const afterRequestedTime = [...candidates.entries()]
    .map(([candidateInstant, parts]) => ({
      instant: candidateInstant,
      parts,
      wallTime: Date.UTC(
        parts.year,
        parts.month - 1,
        parts.day,
        parts.hour,
        parts.minute,
        parts.second
      )
    }))
    .filter((candidate) => candidate.wallTime > desired)
    .sort((left, right) =>
      left.wallTime - right.wallTime || left.instant - right.instant
    );
  const sameCivilDate = afterRequestedTime.find(({ parts }) =>
    parts.year === year && parts.month === month && parts.day === day
  );
  if (sameCivilDate) return new Date(sameCivilDate.instant);

  // Si aucun candidat ne tombe sur ce jour (par exemple Apia 2011-12-30), la
  // date civile entière a été sautée. Avancer silencieusement au lendemain
  // changerait notamment les frontières des événements sur la journée entière.
  const hasCandidateOnCivilDate = [...candidates.values()].some((parts) =>
    parts.year === year && parts.month === month && parts.day === day
  );
  if (!hasCandidateOnCivilDate) {
    throw new Error(`La date civile ${dateKey} n’existe pas dans le fuseau ${timeZone}.`);
  }

  throw new Error(`La date et l’heure ${dateKey} ${hour}:${minute} n’existent pas dans le fuseau ${timeZone}.`);
}

export function dateKeyAtTimeZone(date: Date, timeZone = "Europe/Zurich") {
  if (Number.isNaN(date.getTime())) throw new Error("Instant invalide.");
  const parts = zonedDateParts(date, timeZone);
  return [
    parts.year,
    String(parts.month).padStart(2, "0"),
    String(parts.day).padStart(2, "0")
  ].join("-");
}

/** Arithmétique de calendrier stable, indépendante du fuseau de la machine. */
export function addCalendarDays(dateKey: string, amount: number) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match || !Number.isInteger(amount)) throw new Error(`Date civile invalide : ${dateKey}`);
  const [, yearText, monthText, dayText] = match;
  const date = new Date(Date.UTC(Number(yearText), Number(monthText) - 1, Number(dayText) + amount));
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0")
  ].join("-");
}

export function weekdayFromDateKey(dateKey: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) throw new Error(`Date civile invalide : ${dateKey}`);
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))).getUTCDay();
}

/** Date porteuse d'un jour civil, fixée à midi pour rester stable autour des changements d'heure. */
export function calendarDateFromKey(dateKey: string, timeZone = "Europe/Zurich") {
  return dateAtTimeZone(dateKey, 12, 0, timeZone);
}

export function dateTimeInputValueAtTimeZone(date: Date, timeZone = "Europe/Zurich") {
  const parts = zonedDateParts(date, timeZone);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}T${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`;
}

export function dateFromTimeZoneInput(value: string, timeZone = "Europe/Zurich") {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) throw new Error("Date et heure invalides.");
  const date = dateAtTimeZone(
    `${match[1]}-${match[2]}-${match[3]}`,
    Number(match[4]),
    Number(match[5]),
    timeZone
  );
  const parts = zonedDateParts(date, timeZone);
  if (
    parts.year !== Number(match[1]) ||
    parts.month !== Number(match[2]) ||
    parts.day !== Number(match[3]) ||
    parts.hour !== Number(match[4]) ||
    parts.minute !== Number(match[5])
  ) {
    throw new Error("Cette heure n’existe pas dans le fuseau choisi (changement d’heure)." );
  }
  return date;
}

export function timeZoneOffsetLabel(date: Date, timeZone = "Europe/Zurich") {
  const part = new Intl.DateTimeFormat("fr-CH", {
    timeZone,
    timeZoneName: "longOffset"
  }).formatToParts(date).find((item) => item.type === "timeZoneName")?.value;
  return (part ?? "UTC").replace("UTC", "GMT").replace(":00", "");
}
