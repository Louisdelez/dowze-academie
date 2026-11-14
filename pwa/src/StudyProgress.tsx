import "./shared-study.css";
import { useState } from "react";
import { isStoredSubjects, isStoredTasks } from '../../src/lib/workspaceValidation';
import type { Subject, TaskItem } from '../../src/types';
import type { Draft } from './storage';

type Edit = (type: Draft['type'], id: string, content: Record<string, unknown>) => Promise<void>;
export function StudyProgress({ drafts, onEdit, onError }: { drafts: Draft[]; onEdit: Edit; onError: (message: string) => void }) {
  const [query, setQuery] = useState("");
  const subjects = drafts.filter(draft => draft.type === 'progression' && isStoredSubjects([draft.content]));
  const save = (subject: Subject) => void onEdit('progression', subject.id, { ...subject }).catch(error => onError(String(error)));
  const visibleSubjects = subjects.filter(draft => (draft.content as Subject).name.toLocaleLowerCase("fr").includes(query.trim().toLocaleLowerCase("fr")));
  return <section className="shared-study shared-study-progress"><h2>Ma progression</h2><p className="shared-study-caption">Cochez les cours terminés pour retrouver votre avancée réelle.</p>{subjects.length > 3 && <label className="shared-study-search">Rechercher une matière<input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Nom de la matière…" /></label>}{visibleSubjects.map(draft => {
    const subject = draft.content as Subject;
    const modules = subject.modules.filter(module => subject.curriculumKind !== 'cefr-selectable' || module.cefrLevel === subject.cefrLevel);
    const lessons = modules.flatMap(module => module.items.flatMap(chapter => chapter.lessons ?? []));
    const completed = lessons.filter(lesson => lesson.completed).length;
    return <details className="card" key={draft.documentId}><summary><span>{subject.name}</span><span className="shared-study-caption">{completed}/{lessons.length} cours terminés</span></summary>{lessons.length > 0 && <progress aria-label={`Progression en ${subject.name}`} value={completed} max={lessons.length} />}{!lessons.length && <p className="shared-study-caption">Aucun cours à cocher pour cette matière.</p>}
      {modules.map(module => <section key={module.id}><h3>{module.title}</h3>
        {module.items.map(chapter => <details key={chapter.id}><summary>{chapter.title}</summary>{chapter.lessons?.map(lesson => <label className="study-check" key={lesson.id}>
          <input type="checkbox" disabled={draft.syncState === 'conflict'} checked={lesson.completed} onChange={event => {
            const updated = { ...subject, modules: subject.modules.map(m => m.id !== module.id ? m : { ...m, items: m.items.map(c => {
              if (c.id !== chapter.id) return c;
              const next = c.lessons!.map(l => l.id === lesson.id ? { ...l, completed: event.target.checked } : l);
              return { ...c, lessons: next, completed: next.every(l => l.completed) };
            }) }) }; save(updated);
          }} />{lesson.title}</label>)}</details>)}
      </section>)}
      {draft.syncState === 'conflict' && <p role="alert">Deux versions de cette progression sont conservées. Résolvez le conflit avant de continuer.</p>}
    </details>;
  })}{!subjects.length && <div className="shared-study-empty"><h3>Votre progression commence avec vos cours</h3><p>Elle apparaîtra ici dès la synchronisation de votre année.</p></div>}{!!subjects.length && !visibleSubjects.length && <div className="shared-study-empty"><p>Aucune matière ne correspond.</p><button onClick={() => setQuery("")}>Effacer la recherche</button></div>}</section>;
}

export function StudyTasks({ drafts, onEdit, onError }: { drafts: Draft[]; onEdit: Edit; onError: (message: string) => void }) {
  const tasks = drafts.filter(draft => draft.type === 'tasks' && isStoredTasks([draft.content]));
  return <section className="shared-study shared-study-tasks"><h2>À faire</h2>{!tasks.length && <p>Aucune tâche pour cette année. Vos prochaines tâches synchronisées apparaîtront ici.</p>}{tasks.map(draft => {
    const task = draft.content as TaskItem;
    return <label className="card study-check" key={task.id}><input type="checkbox" checked={task.completed} disabled={draft.syncState === 'conflict'} onChange={event => {
      const completed = event.target.checked;
      const updated = { ...task, completed, ...(completed ? { completedAt: new Date().toISOString() } : {}) };
      if (!completed) delete updated.completedAt;
      void onEdit('tasks', task.id, updated).catch(error => onError(String(error)));
    }} /><span>{task.title}<small>{new Intl.DateTimeFormat('fr-CH', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(task.dueAt))}</small></span></label>;
  })}</section>;
}
