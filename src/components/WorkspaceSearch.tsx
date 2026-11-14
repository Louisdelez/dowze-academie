import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpRight, BookOpen, CalendarDays, CheckSquare2, FileText, Search } from 'lucide-react';
import { Modal } from './Modal';
import type { AppSection, CalendarEvent, Subject, SubjectNoteDocument, TaskItem } from '../types';

interface Props {
  subjects: readonly Subject[];
  notes: readonly SubjectNoteDocument[];
  tasks: readonly TaskItem[];
  events: readonly CalendarEvent[];
  onSubject: (id: string) => void;
  onNote: (id: string) => void;
  onEvent: (event: CalendarEvent) => void;
  onNavigate: (section: AppSection) => void;
  onClose: () => void;
}
const normalize = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('fr');

/** One account/formation scope, supplied by the workspace; no external search service. */
export function WorkspaceSearch({ subjects, notes, tasks, events, onSubject, onNote, onEvent, onNavigate, onClose }: Props) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const entries = useMemo(() => [
    ...subjects.map(subject => ({ key: `subject-${subject.id}`, title: subject.name, detail: 'Matière et programme', icon: BookOpen,
      text: `${subject.name} ${subject.shortName} ${subject.modules.flatMap(module => module.items.map(item => item.title)).join(' ')}`, run: () => onSubject(subject.id) })),
    ...notes.map(note => ({ key: `note-${note.id}`, title: note.title || 'Sans titre', detail: 'Note personnelle', icon: FileText,
      text: `${note.title} ${note.markdown}`, run: () => onNote(note.id) })),
    ...tasks.filter(task => !task.completed).map(task => ({ key: `task-${task.id}`, title: task.title, detail: 'Tâche à terminer', icon: CheckSquare2,
      text: task.title, run: () => onNavigate('tasks') })),
    ...events.map(event => ({ key: `event-${event.id}`, title: event.title, detail: 'Rendez-vous du planning', icon: CalendarDays,
      text: `${event.title} ${event.location ?? ''}`, run: () => onEvent(event) }))
  ], [subjects, notes, tasks, events, onSubject, onNote, onNavigate, onEvent]);
  const words = normalize(query.trim()).split(/\s+/).filter(Boolean);
  const matches = words.length ? entries.filter(entry => words.every(word => normalize(entry.text).includes(word))) : entries;
  const results = matches.slice(0, 30);
  useEffect(() => setSelected(0), [query]);
  const choose = (index: number) => { const entry = results[index]; if (entry) { onClose(); entry.run(); } };
  return <Modal title="Retrouver dans mon espace" subtitle="Cours, notes, tâches et planning de la formation active." onClose={onClose}>
    <div className="desk-search" onKeyDown={event => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const next = results.length ? (selected + (event.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length : 0;
        setSelected(next); refs.current[next]?.scrollIntoView({ block: 'nearest' });
      } else if (event.key === 'Enter') { event.preventDefault(); choose(selected); }
    }}>
      <label className="desk-search-input"><Search aria-hidden="true" /><input type="search" autoFocus aria-label="Rechercher dans mon espace" placeholder="Une matière, une note, un rendez-vous…" value={query} onChange={event => setQuery(event.target.value)} />{query && <button type="button" aria-label="Effacer la recherche" onClick={() => setQuery('')}>×</button>}</label>
      <p className="desk-search-count" role="status">{query.trim() ? `${matches.length} résultat${matches.length > 1 ? 's' : ''}${matches.length > 30 ? ' · 30 affichés, précise ta recherche' : ''}` : 'Accès rapide à ton travail'}</p>
      <div className="desk-search-results">
        {results.map(({ key, title, detail, icon: Icon }, index) => <button type="button" key={key} ref={element => { refs.current[index] = element; }} className={selected === index ? 'is-selected' : ''} onFocus={() => setSelected(index)} onClick={() => choose(index)}><Icon aria-hidden="true" /><span><strong>{title}</strong><small>{detail}</small></span><ArrowUpRight aria-hidden="true" /></button>)}
        {!results.length && <div className="desk-search-empty"><strong>Aucun résultat</strong><p>Essaie le nom d’une matière ou un mot de ta note.</p></div>}
      </div>
      <p className="desk-search-hint">Flèches pour parcourir · Entrée pour ouvrir · Échap pour fermer</p>
    </div>
  </Modal>;
}
