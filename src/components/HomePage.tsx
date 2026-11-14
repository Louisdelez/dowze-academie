import {
  ArrowRight,
  BookMarked,
  Check,
  ChevronRight,
  Clock3,
  GraduationCap,
  Target
} from "lucide-react";
import { parseISO } from "date-fns";
import { useCurrentMinute } from "../hooks/useCurrentMinute";
import { formatCalendarDate, timeLabel } from "../lib/date";
import type { InstalledFormation } from "../lib/formations";
import { addCalendarDays, calendarDateFromKey, dateKeyAtTimeZone, weekdayFromDateKey, zonedDateParts } from "../lib/zonedDate";
import { SubjectIcon } from "./SubjectIcon";
import type { AppSection, CalendarEvent, Subject, TaskItem } from "../types";

interface HomePageProps {
  displayName: string;
  subjects: Subject[];
  events: CalendarEvent[];
  tasks: TaskItem[];
  formation: InstalledFormation;
  onNavigate: (section: AppSection) => void;
  onSelectSubject: (id: string) => void;
  onToggleTask: (id: string) => void;
  onOpenEvent: (event: CalendarEvent) => void;
}

function getGreeting(now: Date, timeZone: string) {
  const hour = zonedDateParts(now, timeZone).hour;
  if (hour < 12) return "Bonjour";
  if (hour < 18) return "Bon après-midi";
  return "Bonsoir";
}

function academicDateLabel(dateKey: string, locale: string, timeZone: string) {
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone
  }).format(calendarDateFromKey(dateKey, timeZone));
}

export function HomePage({
  displayName,
  subjects,
  events,
  tasks,
  formation,
  onNavigate,
  onSelectSubject,
  onToggleTask,
  onOpenEvent
}: HomePageProps) {
  const now = useCurrentMinute();
  const { manifest } = formation;
  const timeZone = manifest.timeZone;
  const nextEvents = events
    .filter((event) => parseISO(event.end) > now)
    .sort((a, b) => a.start.localeCompare(b.start))
    .slice(0, 3);
  const priorityWeight = { high: 0, medium: 1, low: 2 } as const;
  const openTasks = tasks
    .filter((task) => !task.completed)
    .sort((left, right) =>
      left.dueAt.localeCompare(right.dueAt) ||
      priorityWeight[left.priority] - priorityWeight[right.priority]
    );
  const todayKey = dateKeyAtTimeZone(now, timeZone);
  const weekStartKey = addCalendarDays(todayKey, -((weekdayFromDateKey(todayKey) + 6) % 7));
  const weekEndKey = addCalendarDays(weekStartKey, 6);
  const weekTasks = tasks.filter((task) => {
    const dueAt = parseISO(task.dueAt);
    if (Number.isNaN(dueAt.getTime())) return false;
    const dueKey = dateKeyAtTimeZone(dueAt, timeZone);
    return dueKey >= weekStartKey && dueKey <= weekEndKey;
  });
  const weekDoneCount = weekTasks.filter((task) => task.completed).length;
  const weekOpenCount = weekTasks.length - weekDoneCount;
  const completion = weekTasks.length ? Math.round((weekDoneCount / weekTasks.length) * 100) : 0;
  const chapterCount = subjects.reduce(
    (sum, subject) => sum + subject.modules.reduce((moduleSum, item) => moduleSum + item.items.length, 0),
    0
  );
  const courseCount = subjects.reduce(
    (sum, subject) => sum + subject.modules.reduce(
      (moduleSum, courseModule) => moduleSum + courseModule.items.reduce(
        (itemSum, item) => itemSum + (item.lessons?.length || 1),
        0
      ),
      0
    ),
    0
  );

  const greetingName = displayName.trim();
  const friendlyName = greetingName.length <= 28 && !greetingName.includes("@") && !/test|smoke|e2e/i.test(greetingName) ? greetingName : "";
  const nextSubject = subjects.find((subject) => subject.modules.some((module) => module.items.some((item) => item.lessons?.length ? item.lessons.some((lesson) => !lesson.completed) : !item.completed)));
  const nextChapter = nextSubject?.modules.flatMap((module) => module.items).find((item) => item.lessons?.length ? item.lessons.some((lesson) => !lesson.completed) : !item.completed);

  return (
    <main className="page home-page">
      <header className="page-heading home-heading">
        <div>
          <p className="eyebrow">
            {formatCalendarDate(now, { weekday: "long", day: "numeric", month: "long" }, timeZone)}
          </p>
          <h1>{getGreeting(now, timeZone)}{friendlyName ? `, ${friendlyName}` : ""}.</h1>
          <p className="heading-subtitle">Un espace pour apprendre, avancer et organiser ta journée.</p>
        </div>
      </header>

      <section className="desk-study-focus" aria-labelledby="study-focus-title">
        <div className="desk-focus-copy">
          <span className="desk-formation-name">{manifest.shortName} · {manifest.yearLabel}</span>
          <h2 id="study-focus-title">{nextSubject ? 'Reprendre mon apprentissage' : 'Prêt pour la suite ?'}</h2>
          <p>{nextSubject ? 'Un cours à la fois. Retrouve le programme de ta prochaine matière.' : 'Ouvre tes matières et choisis ce que tu veux étudier.'}</p>
          <button className="primary-button" onClick={() => nextSubject ? onSelectSubject(nextSubject.id) : onNavigate('courses')}>{nextSubject ? 'Continuer cette matière' : 'Ouvrir mes cours'}<ArrowRight aria-hidden="true" /></button>
        </div>
        <div className="desk-focus-lesson">
          <BookMarked aria-hidden="true" />
          <div><h3>{nextSubject?.name ?? 'Mes cours'}</h3><p>{nextChapter?.title ?? 'Les cours et leurs ressources sont réunis dans ton programme.'}</p></div>
          <span>{subjects.length} matières · {courseCount} cours disponibles</span>
        </div>
      </section>
      <section className="dashboard-grid">
        <article className="surface-card focus-card">
          <div className="card-label-row">
            <h2 className="card-label">Prochains rendez-vous</h2>
            <button className="text-button" onClick={() => onNavigate("calendar")}>
              Planning <ChevronRight />
            </button>
          </div>
          {nextEvents.length > 0 ? (
            <div className="next-event-list">
              {nextEvents.map((event, index) => {
                const subject = subjects.find((item) => item.id === event.subjectId);
                const start = parseISO(event.start);
                return (
                  <button
                    className={`next-event ${index === 0 ? "is-featured" : ""}`}
                    key={event.id}
                    onClick={() => onOpenEvent(event)}
                  >
                    <span className="event-color" style={{ background: event.color }} />
                    <span className="next-event-time">
                      <strong>{event.allDay ? formatCalendarDate(start, { day: "numeric", month: "short" }, timeZone) : timeLabel(event.start, timeZone)}</strong>
                      <small>{event.allDay ? "Journée" : index === 0 ? "Prochain" : formatCalendarDate(start, { weekday: "short" }, timeZone).replace(".", "")}</small>
                    </span>
                    <span className="next-event-copy">
                      <strong>{event.title}</strong>
                      <small>{event.location || subject?.room || ""}</small>
                    </span>
                    <ArrowRight />
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="empty-compact">Aucun événement à venir. Ton planning reste disponible.</div>
          )}
        </article>

        <article className="surface-card progress-card">
          <div className="card-label-row">
            <h2 className="card-label">Cette semaine</h2>
            <Target />
          </div>
          <div className="progress-hero">
            <div className="desk-week-progress"><strong>{completion}<span>%</span></strong><progress value={completion} max={100} aria-label="Tâches de la semaine terminées" /></div>
            <div className="progress-copy">
              <strong>{weekTasks.length ? `${weekOpenCount} tâche${weekOpenCount > 1 ? "s" : ""} restante${weekOpenCount > 1 ? "s" : ""}` : "Aucune tâche prévue"}</strong>
              <span>{weekTasks.length ? `${weekDoneCount} sur ${weekTasks.length} terminée${weekDoneCount > 1 ? "s" : ""}` : "Ta semaine est libre pour le moment"}</span>
            </div>
          </div>
          <button className="soft-button full-width" onClick={() => onNavigate("tasks")}>
            Voir mes objectifs
            <ArrowRight />
          </button>
        </article>

        <article className="surface-card subjects-card">
          <div className="card-label-row">
            <h2 className="card-label">Mes matières</h2>
            <button className="text-button" onClick={() => onNavigate("courses")}>
              Tout voir <ChevronRight />
            </button>
          </div>
          <div className="subject-shortcuts">
            {subjects.slice(0, 5).map((subject) => {
              const total = subject.modules.reduce(
                (sum, courseModule) => sum + courseModule.items.reduce(
                  (itemSum, item) => itemSum + (item.lessons?.length || 1),
                  0
                ),
                0
              );
              const completed = subject.modules.reduce(
                (sum, courseModule) => sum + courseModule.items.reduce(
                  (itemSum, item) => itemSum + (item.lessons?.length
                    ? item.lessons.filter((lesson) => lesson.completed).length
                    : Number(item.completed)
                  ),
                  0
                ),
                0
              );
              return (
                <button key={subject.id} onClick={() => onSelectSubject(subject.id)}>
                  <SubjectIcon subject={subject} />
                  <span>
                    <strong>{subject.shortName}</strong>
                    <small>{completed}/{total} cours</small>
                  </span>
                  <ChevronRight />
                </button>
              );
            })}
          </div>
        </article>

        <article className="surface-card tasks-card">
          <div className="card-label-row">
            <h2 className="card-label">À faire en priorité</h2>
            <BookMarked />
          </div>
          <div className="dashboard-tasks">
            {openTasks.length === 0 && <div className="empty-compact">Aucune tâche en attente. Ajoute ton prochain objectif dans la liste.</div>}
            {openTasks.slice(0, 3).map((task) => {
              const subject = subjects.find((item) => item.id === task.subjectId);
              return (
                <label key={task.id} className="dashboard-task">
                  <input
                    type="checkbox"
                    checked={task.completed}
                    aria-label={`Terminer la tâche : ${task.title}`}
                    onChange={() => onToggleTask(task.id)}
                  />
                  <span className="task-check"><Check /></span>
                  <span className="task-main">
                    <strong>{task.title}</strong>
                    <small>
                      <Clock3 /> {formatCalendarDate(parseISO(task.dueAt), { weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }, timeZone).replace(".", "")}
                    </small>
                  </span>
                  {subject && (
                    <span className="mini-subject-dot" style={{ background: subject.color }} />
                  )}
                </label>
              );
            })}
          </div>
          <button className="soft-button full-width" onClick={() => onNavigate("tasks")}>
            Ouvrir la liste
            <ArrowRight />
          </button>
        </article>
      </section>
      <footer className="desk-formation-footer"><GraduationCap aria-hidden="true" /><div><strong>{manifest.name}</strong><span>{academicDateLabel(manifest.academicYear.startDate, manifest.locale, timeZone)} au {academicDateLabel(manifest.academicYear.endDate, manifest.locale, timeZone)} · {chapterCount} chapitres</span></div><button className="text-button" onClick={() => onNavigate('formations')}>Mes formations<ChevronRight aria-hidden="true" /></button></footer>
    </main>
  );
}
