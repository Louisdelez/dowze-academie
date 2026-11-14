import {
  CalendarClock,
  Check,
  CheckCircle2,
  Circle,
  ListChecks,
  Pencil,
  Plus,
  Search,
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
  const [showCompleted, setShowCompleted] = useState(false);
  const [dueFilter, setDueFilter] = useState<"all" | "today" | "overdue">("all");
  const [search, setSearch] = useState("");
  const query = search.trim().toLocaleLowerCase("fr");
  const now = useCurrentMinute();
  const todayKey = dateKeyAtTimeZone(now, timeZone);
  const visibleTasks = tasks
    .filter((task) => showCompleted || !task.completed)
    .filter((task) => dueFilter === "all" || (!task.completed && (dueFilter === "today" ? dateKeyAtTimeZone(new Date(task.dueAt), timeZone) === todayKey : new Date(task.dueAt) < now)))
    .filter((task) => !query || [task.title, subjects.find((subject) => subject.id === task.subjectId)?.name].filter(Boolean).join(" ").toLocaleLowerCase("fr").includes(query))
    .sort((a, b) => Number(a.completed) - Number(b.completed) || a.dueAt.localeCompare(b.dueAt));
  const completed = tasks.filter((task) => task.completed).length;

  return (
    <main className="page tasks-page-full">
      <header className="page-heading tasks-heading">
        <div>
          <p className="eyebrow">Organisation</p>
          <h1>Mes tâches</h1>
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

      <div className="learning-filter-tabs" aria-label="Filtrer par échéance">
        {([{ value: "all", label: "Toutes les échéances" }, { value: "today", label: "Aujourd’hui" }, { value: "overdue", label: "En retard" }] as const).map((filter) => <button key={filter.value} aria-pressed={dueFilter === filter.value} className={dueFilter === filter.value ? "is-active" : ""} onClick={() => setDueFilter(filter.value)}>{filter.label}</button>)}
      </div>
      <section className="surface-card task-list-card">
        <div className="task-list-toolbar">
          <div>
            <h2>Mes tâches</h2>
            <span aria-live="polite">{visibleTasks.length} élément{visibleTasks.length > 1 ? "s" : ""}</span>
          </div>
          <label className="search-field task-search">
            <Search aria-hidden="true" />
            <input type="search" aria-label="Rechercher une tâche ou une matière" placeholder="Rechercher une tâche…" value={search} onChange={(event) => setSearch(event.target.value)} />
            {search && <button type="button" aria-label="Effacer la recherche" onClick={() => setSearch("")}>×</button>}
          </label>
          <button aria-pressed={showCompleted} aria-label="Afficher aussi les tâches terminées" className={`filter-button ${showCompleted ? "is-active" : ""}`} onClick={() => setShowCompleted((value) => !value)}>
            <SlidersHorizontal /> {showCompleted ? "Terminées incluses" : "Afficher les terminées"}
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
                <span aria-label={`Priorité ${task.priority === "high" ? "haute" : task.priority === "low" ? "basse" : "normale"}`} className={`priority-dot priority-dot--${task.priority}`} title={`Priorité ${task.priority === "high" ? "haute" : task.priority === "low" ? "basse" : "normale"}`}>{task.priority === "high" ? "Haute" : task.priority === "low" ? "Basse" : "Normale"}</span>
                <span className="task-row-actions">
                  <button onClick={() => onEdit(task)} aria-label={`Modifier « ${task.title} »`}><Pencil /></button>
                  <button onClick={() => onDelete(task)} aria-label={`Supprimer « ${task.title} »`}><Trash2 /></button>
                </span>
              </article>
            );
          })}
          {visibleTasks.length === 0 && (
            <div className="task-empty">
              <CheckCircle2 aria-hidden="true" />
              <strong>{query || dueFilter !== "all" ? "Aucune tâche ne correspond" : tasks.length ? "Toutes tes tâches sont terminées" : "Ta liste est prête"}</strong>
              <span>{query || dueFilter !== "all" ? "Essaie un autre filtre ou un autre mot." : tasks.length ? "Tu peux retrouver les tâches terminées avec le filtre." : "Ajoute un objectif ou un travail à rendre pour organiser ta semaine."}</span>
              {query || dueFilter !== "all" ? <button className="secondary-button" onClick={() => { setSearch(""); setDueFilter("all"); setShowCompleted(true); }}>Voir toutes les tâches</button> : <button className="primary-button" onClick={onAdd}><Plus /> Ajouter une tâche</button>}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
