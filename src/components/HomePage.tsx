import {
  ArrowRight,
  BookMarked,
  CalendarRange,
  Check,
  ChevronRight,
  Clock3,
  GraduationCap,
  Layers3,
  Sparkles,
  Target
} from "lucide-react";
import { parseISO } from "date-fns";
import energyLearningHero from "../assets/generated/energy-learning-hero.webp";
import { useCurrentMinute } from "../hooks/useCurrentMinute";
import { formatCalendarDate, timeLabel } from "../lib/date";
import { addCalendarDays, dateKeyAtTimeZone, weekdayFromDateKey, zonedDateParts } from "../lib/zonedDate";
import { SubjectIcon } from "./SubjectIcon";
import type { AppSection, CalendarEvent, Subject, TaskItem } from "../types";

interface HomePageProps {
  displayName: string;
  subjects: Subject[];
  events: CalendarEvent[];
  tasks: TaskItem[];
  onNavigate: (section: AppSection) => void;
  onSelectSubject: (id: string) => void;
  onToggleTask: (id: string) => void;
  onOpenAi: () => void;
  onOpenEvent: (event: CalendarEvent) => void;
}

function getGreeting(now: Date) {
  const hour = zonedDateParts(now).hour;
  if (hour < 12) return "Bonjour";
  if (hour < 18) return "Bon après-midi";
  return "Bonsoir";
}

export function HomePage({
  displayName,
  subjects,
  events,
  tasks,
  onNavigate,
  onSelectSubject,
  onToggleTask,
  onOpenAi,
  onOpenEvent
}: HomePageProps) {
  const now = useCurrentMinute();
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
  const todayKey = dateKeyAtTimeZone(now);
  const weekStartKey = addCalendarDays(todayKey, -((weekdayFromDateKey(todayKey) + 6) % 7));
  const weekEndKey = addCalendarDays(weekStartKey, 6);
  const weekTasks = tasks.filter((task) => {
    const dueAt = parseISO(task.dueAt);
    if (Number.isNaN(dueAt.getTime())) return false;
    const dueKey = dateKeyAtTimeZone(dueAt);
    return dueKey >= weekStartKey && dueKey <= weekEndKey;
  });
  const weekDoneCount = weekTasks.filter((task) => task.completed).length;
  const completedThisWeek = tasks.filter((task) => {
    if (!task.completed) return false;
    const completedDate = parseISO(task.completedAt ?? task.dueAt);
    if (Number.isNaN(completedDate.getTime())) return false;
    const completedKey = dateKeyAtTimeZone(completedDate);
    return completedKey >= weekStartKey && completedKey <= weekEndKey;
  }).length;
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

  return (
    <main className="page home-page">
      <header className="page-heading home-heading">
        <div>
          <p className="eyebrow">
            {formatCalendarDate(now, { weekday: "long", day: "numeric", month: "long" })}
          </p>
          <h1>{getGreeting(now)}, {displayName}</h1>
          <p className="heading-subtitle">Ton cursus d’ingénierie énergétique est prêt.</p>
        </div>
        <button className="primary-button" onClick={onOpenAi}>
          <Sparkles />
          Demander à l’IA
        </button>
      </header>

      <section className="academic-banner" aria-label="Cursus académique">
        <div className="academic-banner-title">
          <span><GraduationCap /></span>
          <div>
            <p className="eyebrow">Parcours personnel · Année 1</p>
            <strong>Ingénierie de l’énergie &amp; physique appliquée</strong>
            <small>Comprendre · modéliser · expérimenter · concevoir · créer</small>
          </div>
        </div>
        <img
          className="academic-banner-art"
          src={energyLearningHero}
          alt=""
          aria-hidden="true"
          width="900"
          height="600"
          decoding="async"
          draggable={false}
        />
        <div className="academic-banner-stats">
          <span><CalendarRange /><span><strong>7 sept. 2026</strong><small>24 juil. 2027</small></span></span>
          <span><Layers3 /><span><strong>{subjects.length} matières</strong><small>{chapterCount} chapitres · {courseCount} cours</small></span></span>
        </div>
      </section>

      <section className="dashboard-grid">
        <article className="surface-card focus-card">
          <div className="card-label-row">
            <span className="card-label">À venir</span>
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
                      <strong>{event.allDay ? formatCalendarDate(start, { day: "numeric", month: "short" }) : timeLabel(event.start)}</strong>
                      <small>{event.allDay ? "Journée" : index === 0 ? "Prochain" : formatCalendarDate(start, { weekday: "short" }).replace(".", "")}</small>
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
            <div className="empty-compact">Aucun cours à venir.</div>
          )}
        </article>

        <article className="surface-card progress-card">
          <div className="card-label-row">
            <span className="card-label">Cette semaine</span>
            <Target />
          </div>
          <div className="progress-hero">
            <div className="progress-ring" style={{ "--progress": `${completion * 3.6}deg` } as React.CSSProperties}>
              <div>
                <strong>{completion}%</strong>
                <small>réalisé</small>
              </div>
            </div>
            <div className="progress-copy">
              <strong>{weekTasks.length ? `${weekOpenCount} tâche${weekOpenCount > 1 ? "s" : ""} restante${weekOpenCount > 1 ? "s" : ""}` : "Aucune tâche prévue"}</strong>
              <span>{weekTasks.length ? `${completedThisWeek} terminée${completedThisWeek > 1 ? "s" : ""} cette semaine` : "Ta semaine est libre pour le moment"}</span>
            </div>
          </div>
          <button className="soft-button full-width" onClick={() => onNavigate("tasks")}>
            Voir mes objectifs
            <ArrowRight />
          </button>
        </article>

        <article className="surface-card subjects-card">
          <div className="card-label-row">
            <span className="card-label">Mes matières</span>
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
            <span className="card-label">À faire</span>
            <BookMarked />
          </div>
          <div className="dashboard-tasks">
            {openTasks.slice(0, 3).map((task) => {
              const subject = subjects.find((item) => item.id === task.subjectId);
              return (
                <label key={task.id} className="dashboard-task">
                  <input
                    type="checkbox"
                    checked={task.completed}
                    onChange={() => onToggleTask(task.id)}
                  />
                  <span className="task-check"><Check /></span>
                  <span className="task-main">
                    <strong>{task.title}</strong>
                    <small>
                      <Clock3 /> {formatCalendarDate(parseISO(task.dueAt), { weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).replace(".", "")}
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
    </main>
  );
}
