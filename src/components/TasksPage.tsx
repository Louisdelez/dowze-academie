import {
  CalendarClock,
  Check,
  CheckCircle2,
  Circle,
  ListChecks,
  Pencil,
  Plus,
  SlidersHorizontal,
  Trash2
} from "lucide-react";
import { useState } from "react";
import { useCurrentMinute } from "../hooks/useCurrentMinute";
import { formatCalendarDate } from "../lib/date";
import { dateKeyAtTimeZone } from "../lib/zonedDate";
import type { Subject, TaskItem } from "../types";

interface TasksPageProps {
  tasks: TaskItem[];
  subjects: Subject[];
  timeZone?: string;
  onToggle: (id: string) => void;
  onAdd: () => void;
  onEdit: (task: TaskItem) => void;
  onDelete: (task: TaskItem) => void;
}

export function TasksPage({ tasks, subjects, timeZone = "Europe/Zurich", onToggle, onAdd, onEdit, onDelete }: TasksPageProps) {
  const [showCompleted, setShowCompleted] = useState(true);
  const now = useCurrentMinute();
  const todayKey = dateKeyAtTimeZone(now, timeZone);
  const visibleTasks = tasks
    .filter((task) => showCompleted || !task.completed)
    .sort((a, b) => Number(a.completed) - Number(b.completed) || a.dueAt.localeCompare(b.dueAt));
  const completed = tasks.filter((task) => task.completed).length;

  return (
    <main className="page tasks-page-full">
      <header className="page-heading tasks-heading">
        <div>
          <p className="eyebrow">Organisation</p>
          <h1>À faire</h1>
          <p className="heading-subtitle">{tasks.length - completed} tâche{tasks.length - completed > 1 ? "s" : ""} à terminer.</p>
        </div>
        <button className="primary-button" onClick={onAdd}><Plus /> Nouvelle tâche</button>
      </header>

      <div className="task-stats">
        <article>
          <span className="stat-icon stat-icon--purple"><ListChecks /></span>
          <div><strong>{tasks.length}</strong><small>Au total</small></div>
        </article>
        <article>
          <span className="stat-icon stat-icon--amber"><CalendarClock /></span>
          <div><strong>{tasks.filter((task) => !task.completed && dateKeyAtTimeZone(new Date(task.dueAt), timeZone) === todayKey).length}</strong><small>Pour aujourd’hui</small></div>
        </article>
        <article>
          <span className="stat-icon stat-icon--green"><CheckCircle2 /></span>
          <div><strong>{completed}</strong><small>Terminées</small></div>
        </article>
      </div>

      <section className="surface-card task-list-card">
        <div className="task-list-toolbar">
          <div>
            <h2>Mes tâches</h2>
            <span>{visibleTasks.length} élément{visibleTasks.length > 1 ? "s" : ""}</span>
          </div>
          <button className={`filter-button ${showCompleted ? "is-active" : ""}`} onClick={() => setShowCompleted((value) => !value)}>
            <SlidersHorizontal /> {showCompleted ? "Toutes" : "En cours"}
          </button>
        </div>
        <div className="full-task-list">
          {visibleTasks.map((task) => {
            const subject = subjects.find((item) => item.id === task.subjectId);
            const dueAt = new Date(task.dueAt);
            const overdue = !task.completed && dueAt < now;
            return (
              <article className={`full-task ${task.completed ? "is-complete" : ""}`} key={task.id}>
                <label className="full-task-toggle" aria-label={`${task.completed ? "Marquer comme non terminée" : "Marquer comme terminée"} : ${task.title}`}>
                  <input type="checkbox" checked={task.completed} onChange={() => onToggle(task.id)} />
                  <span className="large-task-check">{task.completed ? <Check /> : <Circle />}</span>
                </label>
                <span className="full-task-copy">
                  <strong>{task.title}</strong>
                  <small className={overdue ? "is-overdue" : ""}>
                    {overdue ? "En retard · " : ""}{formatCalendarDate(dueAt, { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }, timeZone).replace(",", " à")}
                  </small>
                </span>
                {subject && <span className="task-subject" style={{ color: subject.color, background: subject.accent }}>{subject.shortName}</span>}
                <span className={`priority-dot priority-dot--${task.priority}`} title={`Priorité ${task.priority === "high" ? "haute" : task.priority === "low" ? "basse" : "normale"}`} />
                <span className="task-row-actions">
                  <button onClick={() => onEdit(task)} aria-label={`Modifier « ${task.title} »`}><Pencil /></button>
                  <button onClick={() => onDelete(task)} aria-label={`Supprimer « ${task.title} »`}><Trash2 /></button>
                </span>
              </article>
            );
          })}
          {visibleTasks.length === 0 && (
            <div className="task-empty"><CheckCircle2 /><strong>Tout est fait !</strong><span>Vous pouvez profiter de ce moment.</span></div>
          )}
        </div>
      </section>
    </main>
  );
}
