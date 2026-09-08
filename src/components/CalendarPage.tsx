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
import { timeZoneOffsetLabel } from "../lib/zonedDate";
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
  onExportCalendar
}: CalendarPageProps) {
  const [contextMenu, setContextMenu] = useState<EventContextMenuState | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const eventIndex = useMemo(() => indexEventsByDay(events), [events]);
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
            <h1>{calendarTitle(currentDate, view)}</h1>
            <div className="date-stepper">
              <button
                onClick={() => onDateChange(shiftCalendarDate(currentDate, view, -1))}
                aria-label="Période précédente"
              >
                <ChevronLeft />
              </button>
              <button
                onClick={() => onDateChange(shiftCalendarDate(currentDate, view, 1))}
                aria-label="Période suivante"
              >
                <ChevronRight />
              </button>
            </div>
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
            Événement
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
        <span className="timezone-label">Heure locale · Europe/Zurich</span>
      </div>

      <section className={`calendar-surface calendar-surface--${view}`}>
        {view === "year" && (
          <YearView
            date={currentDate}
            eventIndex={eventIndex}
            onDateChange={onDateChange}
            onViewChange={onViewChange}
          />
        )}
        {view === "month" && (
          <MonthView
            date={currentDate}
            eventIndex={eventIndex}
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
  onDateChange,
  onViewChange
}: {
  date: Date;
  eventIndex: CalendarEventIndex;
  onDateChange: (date: Date) => void;
  onViewChange: (view: CalendarView) => void;
}) {
  return (
    <div className="year-grid">
      {Array.from({ length: 12 }, (_, monthIndex) => {
        const year = calendarDateParts(date).year;
        const monthDate = calendarDateFor(year, monthIndex + 1, 1);
        const days = monthGridDays(monthDate);
        const monthEventIds = new Set<string>();
        const numberOfDays = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
        for (let day = 1; day <= numberOfDays; day += 1) {
          indexedEventsForDay(eventIndex, calendarDateFor(year, monthIndex + 1, day))
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
              <strong>{formatCalendarDate(monthDate, { month: "long" })}</strong>
              {monthEventCount > 0 && <span>{monthEventCount}</span>}
            </button>
            <div className="mini-week-labels">
              {WEEK_DAYS_SHORT.map((day) => <span key={day}>{day.charAt(0)}</span>)}
            </div>
            <div className="mini-days">
              {days.map((day) => {
                const dayEvents = indexedEventsForDay(eventIndex, day);
                return (
                  <button
                    key={day.toISOString()}
                    className={`${isCurrentMonth(day, monthDate) ? "" : "is-outside"} ${
                      isDateToday(day) ? "is-today" : ""
                    }`}
                    onClick={() => {
                      onDateChange(day);
                      onViewChange("day");
                    }}
                    aria-label={`${formatCalendarDate(day, { day: "numeric", month: "long", year: "numeric" })}${dayEvents.length ? `, ${dayEvents.length} événement${dayEvents.length > 1 ? "s" : ""}` : ", aucun événement"}`}
                  >
                    <span>{formatCalendarDate(day, { day: "numeric" })}</span>
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
  onDateChange,
  onViewChange,
  onNewEvent,
  eventInteractionProps
}: {
  date: Date;
  eventIndex: CalendarEventIndex;
  onDateChange: (date: Date) => void;
  onViewChange: (view: CalendarView) => void;
  onNewEvent: (date?: Date) => void;
  eventInteractionProps: (event: CalendarEvent) => React.ButtonHTMLAttributes<HTMLButtonElement>;
}) {
  const days = monthGridDays(date);
  return (
    <div className="month-calendar">
      <div className="month-weekdays">
        {WEEK_DAYS_SHORT.map((day) => <span key={day}>{day}</span>)}
      </div>
      <div className="month-days">
        {days.map((day) => {
          const dayEvents = indexedEventsForDay(eventIndex, day);
          return (
            <div
              key={day.toISOString()}
              className={`month-day ${!isCurrentMonth(day, date) ? "is-outside" : ""} ${
                isDateToday(day) ? "is-today" : ""
              }`}
              onDoubleClick={() => onNewEvent(day)}
            >
              <button
                className="month-day-number"
                onClick={() => {
                  onDateChange(day);
                  onViewChange("day");
                }}
                aria-label={formatCalendarDate(day, { day: "numeric", month: "long" })}
              >
                {formatCalendarDate(day, { day: "numeric" })}
              </button>
              <div className="month-events">
                {dayEvents.slice(0, 3).map((event) => (
                  <button
                    key={event.id}
                    className={`month-event ${isAllDayEvent(event) ? "is-all-day" : ""}`}
                    style={{ "--event-color": event.color } as React.CSSProperties}
                    {...eventInteractionProps(event)}
                    aria-label={`${event.title}${isAllDayEvent(event) ? ", toute la journée" : `, ${timeLabel(event.start)}`}`}
                  >
                    {!isAllDayEvent(event) && <span>{timeLabel(event.start)}</span>}
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
              <button className="day-add" onClick={() => onNewEvent(day)} aria-label="Ajouter un événement">
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
  onDateChange,
  onViewChange,
  onNewEvent,
  eventInteractionProps
}: {
  date: Date;
  mode: "week" | "day";
  events: CalendarEvent[];
  eventIndex: CalendarEventIndex;
  onDateChange: (date: Date) => void;
  onViewChange: (view: CalendarView) => void;
  onNewEvent: (date?: Date) => void;
  eventInteractionProps: (event: CalendarEvent) => React.ButtonHTMLAttributes<HTMLButtonElement>;
}) {
  const calendarRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const days = mode === "week" ? weekDays(date) : [date];
  const now = useCurrentMinute();
  const nowLabel = timeLabel(now.toISOString());
  const nowOffset = (wallMinutes(now) / 60 - HOURS[0]) * 68;
  const periodContainsToday = days.some((day) => isSameCalendarDay(day, now));
  const zoneLabel = timeZoneOffsetLabel(date);
  const allDayEventsByDay = days.map((day) =>
    indexedEventsForDay(eventIndex, day).filter(isAllDayEvent)
  );
  const hasAllDayEvents = allDayEventsByDay.some((dayEvents) => dayEvents.length > 0);

  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    const current = new Date();
    const currentOffset = (wallMinutes(current) / 60 - HOURS[0]) * 68;
    const target = periodContainsToday
      ? currentOffset - scroller.clientHeight * 0.36
      : (8.5 - HOURS[0]) * 68 - 24;
    scroller.scrollTo({ top: Math.max(0, target), behavior: "auto" });
  }, [date, mode, periodContainsToday]);

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
            className={isDateToday(day) ? "is-today" : ""}
            onClick={() => {
              onDateChange(day);
              onViewChange("day");
            }}
          >
            <span>{formatCalendarDate(day, { weekday: "short" }).replace(".", "")}</span>
            <strong>{formatCalendarDate(day, { day: "numeric" })}</strong>
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
            const dayEvents = indexedEventsForDay(eventIndex, day).filter((event) => !isAllDayEvent(event));
            const eventLayouts = layoutOverlappingEvents(dayEvents);
            return (
              <div className="time-day-column" key={day.toISOString()}>
                {HOURS.map((hour) => (
                  <button
                    className="hour-cell"
                    key={hour}
                    onDoubleClick={() => onNewEvent(calendarTimeFor(day, hour))}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter" && event.key !== " ") return;
                      event.preventDefault();
                      onNewEvent(calendarTimeFor(day, hour));
                    }}
                    aria-label={`Ajouter à ${hour} heures`}
                  />
                ))}
                {dayEvents.map((event) => {
                  const layout = eventLayouts.get(event) ?? { column: 0, columns: 1 };
                  const start = new Date(event.start);
                  const end = new Date(event.end);
                  const dayKey = localDayKey(day);
                  const continuesFromEarlier = localDayKey(start) < dayKey;
                  const continuesLater = localDayKey(end) > dayKey;
                  const startMinute = continuesFromEarlier ? 0 : wallMinutes(start);
                  const endMinute = continuesLater ? 24 * 60 : wallMinutes(end);
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
                  const startLabel = continuesFromEarlier ? "↤ 00:00" : timeLabel(event.start);
                  const endLabel = continuesLater ? "24:00 ↦" : timeLabel(event.end);
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
