import "../planning-redesign.css";
import {
  CalendarPlus,
  CalendarSync,
  ChevronLeft,
  ChevronRight,
  Clock3,
  MapPin,
  Pencil,
  Plus
} from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, MouseEvent as ReactMouseEvent } from "react";
import { createPortal } from "react-dom";
import { useCurrentMinute } from "../hooks/useCurrentMinute";
import {
  CALENDAR_TIME_ZONE,
  HOURS,
  WEEK_DAYS_SHORT,
  type CalendarEventIndex,
  calendarDateFor,
  calendarDateParts,
  calendarTimeFor,
  calendarTitle,
  formatCalendarDate,
  indexEventsByDay,
  indexedEventsForDay,
  isAllDayEvent,
  isCurrentMonth,
  isDateToday,
  isSameCalendarDay,
  localDayKey,
  monthGridDays,
  shiftCalendarDate,
  timeLabel,
  wallMinutes,
  weekDays
} from "../lib/date";
import { calendarDateFromKey, dateKeyAtTimeZone, timeZoneOffsetLabel } from "../lib/zonedDate";
import type { CalendarEvent, CalendarView, Subject } from "../types";

interface CalendarPageProps {
  currentDate: Date;
  view: CalendarView;
  events: CalendarEvent[];
  subjects: Subject[];
  onDateChange: (date: Date) => void;
  onViewChange: (view: CalendarView) => void;
  onNewEvent: (date?: Date) => void;
  onOpenEvent: (event: CalendarEvent) => void;
  onEditEvent: (event: CalendarEvent) => void;
  onExportCalendar: () => void;
  timeZone?: string;
}

interface EventContextMenuState {
  event: CalendarEvent;
  trigger: HTMLButtonElement;
  x: number;
  y: number;
}

const CONTEXT_MENU_WIDTH = 184;
const CONTEXT_MENU_HEIGHT = 52;
const CONTEXT_MENU_MARGIN = 8;

const views: Array<{ value: CalendarView; label: string }> = [
  { value: "year", label: "Année" },
  { value: "month", label: "Mois" },
  { value: "week", label: "Semaine" },
  { value: "day", label: "Jour" }
];

function layoutOverlappingEvents(events: CalendarEvent[]) {
  const result = new Map<CalendarEvent, { column: number; columns: number }>();
  const sorted = [...events].sort((left, right) =>
    left.start.localeCompare(right.start) || left.end.localeCompare(right.end)
  );
  let group: CalendarEvent[] = [];
  let groupEnd = Number.NEGATIVE_INFINITY;

  const commitGroup = () => {
    if (!group.length) return;
    const columnEnds: number[] = [];
    const assigned: Array<{ event: CalendarEvent; column: number }> = [];
    group.forEach((event) => {
      const start = Date.parse(event.start);
      const end = Date.parse(event.end);
      let column = columnEnds.findIndex((columnEnd) => columnEnd <= start);
      if (column < 0) column = columnEnds.length;
      columnEnds[column] = end;
      assigned.push({ event, column });
    });
    const columns = Math.max(1, columnEnds.length);
    assigned.forEach(({ event, column }) => result.set(event, { column, columns }));
    group = [];
    groupEnd = Number.NEGATIVE_INFINITY;
  };

  sorted.forEach((event) => {
    const start = Date.parse(event.start);
    const end = Date.parse(event.end);
    if (group.length && start >= groupEnd) commitGroup();
    group.push(event);
    groupEnd = Math.max(groupEnd, end);
  });
  commitGroup();
  return result;
}

export function CalendarPage({
  currentDate,
  view,
  events,
  subjects,
  onDateChange,
  onViewChange,
  onNewEvent,
  onOpenEvent,
  onEditEvent,
  onExportCalendar,
  timeZone = CALENDAR_TIME_ZONE
}: CalendarPageProps) {
  const [contextMenu, setContextMenu] = useState<EventContextMenuState | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const eventIndex = useMemo(() => indexEventsByDay(events, timeZone), [events, timeZone]);
  const eventSubjectIds = useMemo(
    () => new Set(events.map((event) => event.subjectId).filter(Boolean)),
    [events]
  );
  const subjectLegend = subjects.filter((subject) => eventSubjectIds.has(subject.id));

  const openContextMenu = (
    event: CalendarEvent,
    trigger: HTMLButtonElement,
    clientX: number,
    clientY: number
  ) => {
    const workspaceBounds = trigger.closest(".main-workspace")?.getBoundingClientRect();
    const minimumX = (workspaceBounds?.left ?? 0) + CONTEXT_MENU_MARGIN;
    const minimumY = (workspaceBounds?.top ?? 0) + CONTEXT_MENU_MARGIN;
    const maximumX = Math.max(
      minimumX,
      (workspaceBounds?.right ?? window.innerWidth) - CONTEXT_MENU_WIDTH - CONTEXT_MENU_MARGIN
    );
    const maximumY = Math.max(
      minimumY,
      (workspaceBounds?.bottom ?? window.innerHeight) - CONTEXT_MENU_HEIGHT - CONTEXT_MENU_MARGIN
    );
    setContextMenu({
      event,
      trigger,
      x: Math.min(Math.max(minimumX, clientX), maximumX),
      y: Math.min(Math.max(minimumY, clientY), maximumY)
    });
  };

  const eventInteractionProps = (calendarEvent: CalendarEvent) => ({
    "aria-haspopup": "menu" as const,
    "aria-expanded": contextMenu?.event.id === calendarEvent.id,
    onClick: (event: ReactMouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      setContextMenu(null);
      onOpenEvent(calendarEvent);
    },
    onDoubleClick: (event: ReactMouseEvent<HTMLButtonElement>) => event.stopPropagation(),
    onContextMenu: (event: ReactMouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      openContextMenu(calendarEvent, event.currentTarget, event.clientX, event.clientY);
    },
    onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => {
      if (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10")) return;
      event.preventDefault();
      event.stopPropagation();
      const bounds = event.currentTarget.getBoundingClientRect();
      openContextMenu(
        calendarEvent,
        event.currentTarget,
        bounds.left + Math.min(bounds.width / 2, 80),
        bounds.bottom + 4
      );
    }
  });

  useEffect(() => {
    if (!contextMenu) return;

    contextMenuRef.current?.querySelector<HTMLButtonElement>("[role='menuitem']")?.focus();

    const closeFromOutside = (event: Event) => {
      if (contextMenuRef.current?.contains(event.target as Node)) return;
      setContextMenu(null);
    };
    const closeFromEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setContextMenu(null);
      contextMenu.trigger.focus();
    };
    const close = () => setContextMenu(null);

    document.addEventListener("pointerdown", closeFromOutside, true);
    document.addEventListener("contextmenu", closeFromOutside, true);
    document.addEventListener("keydown", closeFromEscape, true);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    window.addEventListener("blur", close);
    return () => {
      document.removeEventListener("pointerdown", closeFromOutside, true);
      document.removeEventListener("contextmenu", closeFromOutside, true);
      document.removeEventListener("keydown", closeFromEscape, true);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("blur", close);
    };
  }, [contextMenu]);

  return (
    <main className="page calendar-page">
      <header className="calendar-toolbar">
        <div className="calendar-title-group">
          <p className="eyebrow">Mon planning</p>
          <div className="calendar-title-row">
            <h1 aria-live="polite" aria-atomic="true">{calendarTitle(currentDate, view, timeZone)}</h1>
            <div className="date-stepper">
              <button
                onClick={() => onDateChange(shiftCalendarDate(currentDate, view, -1, timeZone))}
                aria-label="Période précédente"
              >
                <ChevronLeft />
              </button>
              <button
                onClick={() => onDateChange(shiftCalendarDate(currentDate, view, 1, timeZone))}
                aria-label="Période suivante"
              >
                <ChevronRight />
              </button>
            </div>
            <label className="calendar-jump-date"><span>Aller à une date</span><input type="date" value={dateKeyAtTimeZone(currentDate, timeZone)} onChange={(event) => { if (/^\d{4}-\d{2}-\d{2}$/.test(event.target.value)) onDateChange(calendarDateFromKey(event.target.value, timeZone)); }} /></label>
            <button className="today-button" onClick={() => onDateChange(new Date())}>
              Aujourd’hui
            </button>
          </div>
        </div>
        <div className="calendar-toolbar-actions">
          <div className="segmented-control" role="group" aria-label="Vue du calendrier">
            {views.map((item) => (
              <button
                key={item.value}
                className={view === item.value ? "is-active" : ""}
                onClick={() => onViewChange(item.value)}
                aria-pressed={view === item.value}
              >
                {item.label}
              </button>
            ))}
          </div>
          <button className="secondary-button calendar-sync-trigger" onClick={onExportCalendar}>
            <CalendarSync />
            Envoyer vers un agenda
          </button>
          <button className="primary-button" onClick={() => onNewEvent(currentDate)}>
            <Plus />
            Nouvel événement
          </button>
        </div>
      </header>

      <div className="calendar-meta-row">
        <div className="calendar-legend">
          {subjectLegend.slice(0, 5).map((subject) => (
            <span key={subject.id}>
              <i style={{ background: subject.color }} />
              {subject.shortName}
            </span>
          ))}
        </div>
        <span className="timezone-label">Fuseau horaire · {timeZone}</span>
      </div>

      <p className="calendar-interaction-hint">Ouvre un événement pour ses détails. Pour le modifier, utilise son menu contextuel ou la touche Menu.</p>
      <section className={`calendar-surface calendar-surface--${view}`}>
        {view === "year" && (
          <YearView
            date={currentDate}
            eventIndex={eventIndex}
            timeZone={timeZone}
            onDateChange={onDateChange}
            onViewChange={onViewChange}
          />
        )}
        {view === "month" && (
          <MonthView
            date={currentDate}
            eventIndex={eventIndex}
            timeZone={timeZone}
            onDateChange={onDateChange}
            onViewChange={onViewChange}
            onNewEvent={onNewEvent}
            eventInteractionProps={eventInteractionProps}
          />
        )}
        {(view === "week" || view === "day") && (
          <TimeGrid
            date={currentDate}
            mode={view}
            events={events}
            eventIndex={eventIndex}
            timeZone={timeZone}
            onDateChange={onDateChange}
            onViewChange={onViewChange}
            onNewEvent={onNewEvent}
            eventInteractionProps={eventInteractionProps}
          />
        )}
      </section>
      {contextMenu && createPortal(
        <div
          ref={contextMenuRef}
          className="calendar-event-context-menu"
          role="menu"
          aria-label={`Actions pour « ${contextMenu.event.title} »`}
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              const selectedEvent = contextMenu.event;
              setContextMenu(null);
              onEditEvent(selectedEvent);
            }}
          >
            <Pencil aria-hidden="true" />
            Modifier
          </button>
        </div>,
        document.getElementById("workspace-modal-root") ?? document.body
      )}
    </main>
  );
}

function YearView({
  date,
  eventIndex,
  timeZone,
  onDateChange,
  onViewChange
}: {
  date: Date;
  eventIndex: CalendarEventIndex;
  timeZone: string;
  onDateChange: (date: Date) => void;
  onViewChange: (view: CalendarView) => void;
}) {
  return (
    <div className="year-grid">
      {Array.from({ length: 12 }, (_, monthIndex) => {
        const year = calendarDateParts(date, timeZone).year;
        const monthDate = calendarDateFor(year, monthIndex + 1, 1, timeZone);
        const days = monthGridDays(monthDate, timeZone);
        const monthEventIds = new Set<string>();
        const numberOfDays = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
        for (let day = 1; day <= numberOfDays; day += 1) {
          indexedEventsForDay(
            eventIndex,
            calendarDateFor(year, monthIndex + 1, day, timeZone),
            timeZone
          )
            .forEach((event) => monthEventIds.add(event.id));
        }
        const monthEventCount = monthEventIds.size;
        return (
          <article className="mini-month" key={monthIndex}>
            <button
              className="mini-month-title"
              onClick={() => {
                onDateChange(monthDate);
                onViewChange("month");
              }}
            >
              <strong>{formatCalendarDate(monthDate, { month: "long" }, timeZone)}</strong>
              {monthEventCount > 0 && <span>{monthEventCount}</span>}
            </button>
            <div className="mini-week-labels">
              {WEEK_DAYS_SHORT.map((day) => <span key={day}>{day.charAt(0)}</span>)}
            </div>
            <div className="mini-days">
              {days.map((day) => {
                const dayEvents = indexedEventsForDay(eventIndex, day, timeZone);
                return (
                  <button
                    key={day.toISOString()}
                    className={`${isCurrentMonth(day, monthDate, timeZone) ? "" : "is-outside"} ${
                      isDateToday(day, timeZone) ? "is-today" : ""
                    }`}
                    onClick={() => {
                      onDateChange(day);
                      onViewChange("day");
                    }}
                    aria-label={`${formatCalendarDate(day, { day: "numeric", month: "long", year: "numeric" }, timeZone)}${dayEvents.length ? `, ${dayEvents.length} événement${dayEvents.length > 1 ? "s" : ""}` : ", aucun événement"}`}
                  >
                    <span>{formatCalendarDate(day, { day: "numeric" }, timeZone)}</span>
                    {dayEvents.length > 0 && (
                      <i style={{ background: dayEvents[0].color }} />
                    )}
                  </button>
                );
              })}
            </div>
          </article>
        );
      })}
    </div>
  );
}

function MonthView({
  date,
  eventIndex,
  timeZone,
  onDateChange,
  onViewChange,
  onNewEvent,
  eventInteractionProps
}: {
  date: Date;
  eventIndex: CalendarEventIndex;
  timeZone: string;
  onDateChange: (date: Date) => void;
  onViewChange: (view: CalendarView) => void;
  onNewEvent: (date?: Date) => void;
  eventInteractionProps: (event: CalendarEvent) => React.ButtonHTMLAttributes<HTMLButtonElement>;
}) {
  const days = monthGridDays(date, timeZone);
  return (
    <div className="month-calendar">
      <div className="month-weekdays">
        {WEEK_DAYS_SHORT.map((day) => <span key={day}>{day}</span>)}
      </div>
      <div className="month-days">
        {days.map((day) => {
          const dayEvents = indexedEventsForDay(eventIndex, day, timeZone);
          return (
            <div
              key={day.toISOString()}
              className={`month-day ${!isCurrentMonth(day, date, timeZone) ? "is-outside" : ""} ${
                isDateToday(day, timeZone) ? "is-today" : ""
              }`}
              onDoubleClick={() => onNewEvent(day)}
            >
              <button
                className="month-day-number"
                onClick={() => {
                  onDateChange(day);
                  onViewChange("day");
                }}
                aria-label={formatCalendarDate(day, { day: "numeric", month: "long" }, timeZone)}
              >
                {formatCalendarDate(day, { day: "numeric" }, timeZone)}
              </button>
              <div className="month-events">
                {dayEvents.slice(0, 3).map((event) => (
                  <button
                    key={event.id}
                    className={`month-event ${isAllDayEvent(event) ? "is-all-day" : ""}`}
                    style={{ "--event-color": event.color } as React.CSSProperties}
                    {...eventInteractionProps(event)}
                    aria-label={`${event.title}${isAllDayEvent(event) ? ", toute la journée" : `, ${timeLabel(event.start, timeZone)}`}`}
                  >
                    {!isAllDayEvent(event) && <span>{timeLabel(event.start, timeZone)}</span>}
                    <strong>{event.title}</strong>
                  </button>
                ))}
                {dayEvents.length > 3 && (
                  <button
                    className="more-events"
                    onClick={() => {
                      onDateChange(day);
                      onViewChange("day");
                    }}
                  >
                    +{dayEvents.length - 3} autre{dayEvents.length > 4 ? "s" : ""}
                  </button>
                )}
              </div>
              <button className="day-add" onClick={() => onNewEvent(day)} aria-label={`Ajouter un événement le ${formatCalendarDate(day, { day: "numeric", month: "long" }, timeZone)}`}>
                <Plus />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TimeGrid({
  date,
  mode,
  events,
  eventIndex,
  timeZone,
  onDateChange,
  onViewChange,
  onNewEvent,
  eventInteractionProps
}: {
  date: Date;
  mode: "week" | "day";
  events: CalendarEvent[];
  eventIndex: CalendarEventIndex;
  timeZone: string;
  onDateChange: (date: Date) => void;
  onViewChange: (view: CalendarView) => void;
  onNewEvent: (date?: Date) => void;
  eventInteractionProps: (event: CalendarEvent) => React.ButtonHTMLAttributes<HTMLButtonElement>;
}) {
  const calendarRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const days = mode === "week" ? weekDays(date, timeZone) : [date];
  const now = useCurrentMinute();
  const nowLabel = timeLabel(now.toISOString(), timeZone);
  const nowOffset = (wallMinutes(now, timeZone) / 60 - HOURS[0]) * 68;
  const periodContainsToday = days.some((day) => isSameCalendarDay(day, now, timeZone));
  const zoneLabel = timeZoneOffsetLabel(date, timeZone);
  const allDayEventsByDay = days.map((day) =>
    indexedEventsForDay(eventIndex, day, timeZone).filter(isAllDayEvent)
  );
  const hasAllDayEvents = allDayEventsByDay.some((dayEvents) => dayEvents.length > 0);

  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    const current = new Date();
    const currentOffset = (wallMinutes(current, timeZone) / 60 - HOURS[0]) * 68;
    const target = periodContainsToday
      ? currentOffset - scroller.clientHeight * 0.36
      : (8.5 - HOURS[0]) * 68 - 24;
    scroller.scrollTo({ top: Math.max(0, target), behavior: "auto" });
  }, [date, mode, periodContainsToday, timeZone]);

  useLayoutEffect(() => {
    const calendar = calendarRef.current;
    const scroller = scrollRef.current;
    if (!calendar || !scroller) return;

    const syncScrollbarWidth = () => {
      const scrollbarWidth = Math.max(0, scroller.offsetWidth - scroller.clientWidth);
      calendar.style.setProperty("--calendar-scrollbar-width", `${scrollbarWidth}px`);
    };

    syncScrollbarWidth();
    const observer = typeof ResizeObserver === "undefined"
      ? undefined
      : new ResizeObserver(syncScrollbarWidth);
    observer?.observe(scroller);
    window.addEventListener("resize", syncScrollbarWidth);

    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", syncScrollbarWidth);
    };
  }, [mode]);

  return (
    <div ref={calendarRef} className={`time-calendar ${mode === "day" ? "is-day" : ""}`}>
      <div className="time-grid-header">
        <div className="time-zone-cell">{zoneLabel}</div>
        {days.map((day) => (
          <button
            key={day.toISOString()}
            className={isDateToday(day, timeZone) ? "is-today" : ""}
            onClick={() => {
              onDateChange(day);
              onViewChange("day");
            }}
          >
            <span>{formatCalendarDate(day, { weekday: "short" }, timeZone).replace(".", "")}</span>
            <strong>{formatCalendarDate(day, { day: "numeric" }, timeZone)}</strong>
          </button>
        ))}
      </div>
      {hasAllDayEvents && (
        <div className="time-all-day-row">
          <span className="time-all-day-label">Journée</span>
          <div
            className="time-all-day-columns"
            style={{ "--day-count": days.length } as React.CSSProperties}
          >
            {days.map((day, dayIndex) => (
              <div className="time-all-day-cell" key={day.toISOString()}>
                {allDayEventsByDay[dayIndex].map((event) => (
                  <button
                    key={event.id}
                    className={`all-day-event all-day-event--${event.type}`}
                    style={{ "--event-color": event.color } as React.CSSProperties}
                    {...eventInteractionProps(event)}
                    title={`${event.title} · Toute la journée`}
                  >
                    <strong>{event.title}</strong>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
      <div
        className="time-scroll"
        ref={scrollRef}
        style={{ "--hour-count": HOURS.length } as React.CSSProperties}
      >
        <div className="time-label-column">
          {HOURS.map((hour) => (
            <span key={hour} style={{ top: `${(hour - HOURS[0]) * 68}px` }}>
              {String(hour).padStart(2, "0")}:00
            </span>
          ))}
        </div>
        <div className="day-columns" style={{ "--day-count": days.length } as React.CSSProperties}>
          {periodContainsToday && nowOffset >= 0 && nowOffset <= HOURS.length * 68 && (
            <div className="now-line" style={{ top: nowOffset }}>
              <span className="now-line-dot" aria-hidden="true" />
              <time
                className="now-line-label"
                dateTime={nowLabel}
                aria-label={`Heure actuelle : ${nowLabel}`}
              >
                {nowLabel}
              </time>
            </div>
          )}
          {days.map((day) => {
            const dayEvents = indexedEventsForDay(eventIndex, day, timeZone)
              .filter((event) => !isAllDayEvent(event));
            const eventLayouts = layoutOverlappingEvents(dayEvents);
            return (
              <div className="time-day-column" key={day.toISOString()}>
                {HOURS.map((hour) => (
                  <button
                    className="hour-cell"
                    key={hour}
                    onDoubleClick={() => onNewEvent(calendarTimeFor(day, hour, 0, timeZone))}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter" && event.key !== " ") return;
                      event.preventDefault();
                      onNewEvent(calendarTimeFor(day, hour, 0, timeZone));
                    }}
                    aria-label={`Ajouter un événement le ${formatCalendarDate(day, { weekday: "long", day: "numeric", month: "long" }, timeZone)} à ${hour} heures`}
                  />
                ))}
                {dayEvents.map((event) => {
                  const layout = eventLayouts.get(event) ?? { column: 0, columns: 1 };
                  const start = new Date(event.start);
                  const end = new Date(event.end);
                  const dayKey = localDayKey(day, timeZone);
                  const continuesFromEarlier = localDayKey(start, timeZone) < dayKey;
                  const continuesLater = localDayKey(end, timeZone) > dayKey;
                  const startMinute = continuesFromEarlier ? 0 : wallMinutes(start, timeZone);
                  const endMinute = continuesLater ? 24 * 60 : wallMinutes(end, timeZone);
                  const visibleStartMinute = Math.max(HOURS[0] * 60, startMinute);
                  const visibleEndMinute = Math.min((HOURS[0] + HOURS.length) * 60, endMinute);
                  if (visibleEndMinute <= visibleStartMinute) return null;
                  const top = ((visibleStartMinute - HOURS[0] * 60) / 60) * 68;
                  const height = Math.max(
                    34,
                    ((visibleEndMinute - visibleStartMinute) / 60) * 68 - 4
                  );
                  const renderedHeight = Math.min(height, HOURS.length * 68 - top);
                  const isCompact = renderedHeight <= 40;
                  const startLabel = continuesFromEarlier ? "↤ 00:00" : timeLabel(event.start, timeZone);
                  const endLabel = continuesLater ? "24:00 ↦" : timeLabel(event.end, timeZone);
                  return (
                    <button
                      key={event.id}
                      className={`time-event time-event--${event.type}${isCompact ? " time-event--compact" : ""}`}
                      style={{
                        top,
                        height: renderedHeight,
                        "--event-color": event.color,
                        "--event-column": layout.column,
                        "--event-columns": layout.columns
                      } as React.CSSProperties}
                      {...eventInteractionProps(event)}
                      aria-label={`${event.title}, ${startLabel} à ${endLabel}`}
                      title={`${event.title} · Clic pour ouvrir${event.subjectId ? " la matière" : " la journée"} · Clic droit pour modifier`}
                    >
                      <strong>{event.title}</strong>
                      <span className="time-event-time" aria-hidden="true">
                        <Clock3 />
                        <time>{startLabel}</time>
                        <i className="time-event-time-separator">–</i>
                        <time className="time-event-time-end">{endLabel}</time>
                      </span>
                      {height > 62 && event.location && <span><MapPin /> {event.location}</span>}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
      {events.length === 0 && (
        <div className="calendar-empty">
          <CalendarPlus />
          <strong>Votre planning est encore vide</strong>
          <span>Utilisez le bouton « Événement » pour créer votre premier rendez-vous.</span>
        </div>
      )}
    </div>
  );
}
