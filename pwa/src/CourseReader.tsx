import "./shared-study.css";
import { FormationChoicePicker } from "../../src/components/FormationChoicePicker";
import { selectFormationChoices } from "../../src/lib/formationChoices";
import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormationImportPreview, FormationPackageFiles } from '../../src/lib/formations';
import { validateAndCompileFormationPackage } from '../../src/lib/formations';
import { ApiClient, type CatalogEntry } from './api';
import { listSnapshots, putSnapshot, type Draft } from './storage';
import { sharedFormationManifest } from '../../src/lib/sharedFormation';
import { isStoredSubjects } from '../../src/lib/workspaceValidation';
import type { Subject } from '../../src/types';

export function CourseReader({ api, entry, accountId, spaceId, onDownloaded, drafts = [], onEdit }: { drafts?: Draft[]; onEdit?: (type: Draft["type"], id: string, content: Record<string, unknown>) => Promise<void>; onDownloaded?: (entry: CatalogEntry) => void; api: ApiClient; entry: CatalogEntry; accountId: string; spaceId: string }) {
  const [loadedPreview, setPreview] = useState<FormationImportPreview>();
  const [error, setError] = useState('');
  const [pendingSubject, setPendingSubject] = useState('');
  const [query, setQuery] = useState('');
  const [localSelection, setLocalSelection] = useState<string[]>();
  const scope = `${accountId}:${spaceId}:${entry.formation_id}:${entry.version}`;
  const currentScope = useRef(scope); currentScope.current = scope;
  useEffect(() => () => { currentScope.current = ''; }, []);
  useEffect(() => {
    let cancelled = false;
    setPreview(undefined); setLocalSelection(undefined); setError('');
    const key = `course|${accountId}|${spaceId}|${entry.formation_id}|${entry.version}`;
    (async () => {
      try {
        const snapshots = await listSnapshots(accountId, spaceId);
        const cached = snapshots.find(item => item.key === key);
        const savedChoice = snapshots.find(item => item.key === `${key}|choices`);
        const files = cached?.value ?? (await api.courseContent(entry.formation_id, entry.version)).files;
        let result = validateAndCompileFormationPackage(files as FormationPackageFiles);
        if (!result.valid || result.manifest?.id !== entry.formation_id || result.manifest.packageVersion !== entry.version) throw new Error('Cette formation ne peut pas être ouverte : son contenu est invalide.');
        if (result.manifest?.choices && !result.manifest.choices.selected && savedChoice) {
          const selection = savedChoice.value;
          if (!Array.isArray(selection) || !selection.every(id => typeof id === "string")) throw new Error("Choix annuels illisibles : les données conservées n’ont pas été modifiées.");
          if (!cancelled) setLocalSelection(selection);
        }
        if (!cached) await putSnapshot({ key, accountId, spaceId, value: files });
        if (!cancelled) { setPreview(result); onDownloaded?.(entry); }
      } catch (error) { if (!cancelled) setError(error instanceof Error ? error.message : 'Formation indisponible.'); }
    })();
    return () => { cancelled = true; };
  }, [api, entry.formation_id, entry.version, accountId, spaceId]);
  const choiceDocument = drafts.find(draft => draft.type === 'formation' && draft.documentId === entry.formation_id);
  const remoteManifest = sharedFormationManifest(choiceDocument?.content);
  const preview = useMemo(() => {
    const selection = remoteManifest?.choices?.selected ?? localSelection;
    if (!loadedPreview || !selection || !loadedPreview.manifest?.choices) return loadedPreview;
    try {
      const unselected = { ...loadedPreview, manifest: { ...loadedPreview.manifest, choices: { ...loadedPreview.manifest.choices, selected: undefined } } };
      return selectFormationChoices(unselected, selection);
    } catch { return loadedPreview; }
  }, [loadedPreview, choiceDocument?.content, localSelection]);
  const subjects = preview?.subjects.map(subject => {
    const saved = drafts.find(draft => draft.type === 'progression' && draft.documentId === subject.id);
    return saved && isStoredSubjects([saved.content]) ? saved.content as Subject : subject;
  }) ?? [];
  const registration = useRef('');
  useEffect(() => {
    if (!preview?.valid || !preview.manifest || !onEdit || choiceDocument ||
      (preview.manifest.choices && !preview.manifest.choices.selected) || registration.current === scope) return;
    registration.current = scope;
    void onEdit('formation', entry.formation_id, { schema: 1, manifest: preview.manifest }).catch(error => {
      registration.current = ''; if (currentScope.current === scope) setError(String(error));
    });
  }, [preview, choiceDocument, onEdit, scope, entry.formation_id]);
  async function toggleLesson(subject: Subject, moduleId: string, chapterId: string, lessonId: string, completed: boolean) {
    if (!onEdit || pendingSubject) return;
    setPendingSubject(subject.id); setError('');
    const updated = { ...subject, modules: subject.modules.map(module => module.id !== moduleId ? module : { ...module,
      items: module.items.map(chapter => {
        if (chapter.id !== chapterId) return chapter;
        const lessons = chapter.lessons?.map(lesson => lesson.id === lessonId ? { ...lesson, completed } : lesson);
        return { ...chapter, lessons, completed: !!lessons?.length && lessons.every(lesson => lesson.completed) };
      }) }) };
    try { await onEdit('progression', subject.id, { ...updated }); }
    catch (error) { if (currentScope.current === scope) setError(String(error)); }
    finally { if (currentScope.current === scope) setPendingSubject(''); }
  }
  if (!preview && error) return <section className="shared-study shared-study-empty" role="alert"><h2>Ce cours n’est pas disponible</h2><p>{error}</p><p>Votre travail conservé sur cet appareil reste intact. Revenez à vos cours pour réessayer.</p></section>;
  if (!preview) return <section className="shared-study shared-study-empty" role="status"><h2>Préparation de votre cours…</h2><p>Lecture et vérification du contenu de la formation.</p></section>;
  if (preview.manifest?.choices && !preview.manifest.choices.selected) return <FormationChoicePicker key={`${accountId}:${spaceId}:${entry.formation_id}`} preview={preview} onConfirm={async chosen => {
    const key = `course|${accountId}|${spaceId}|${entry.formation_id}|${entry.version}|choices`;
    try {
    await putSnapshot({ key, accountId, spaceId, value: chosen.manifest!.choices!.selected });
    if (onEdit) await onEdit('formation', entry.formation_id, { schema: 1, manifest: chosen.manifest });
    if (currentScope.current === scope) setLocalSelection(chosen.manifest!.choices!.selected);
    } catch (failure) { if (currentScope.current === scope) setError(failure instanceof Error ? failure.message : 'Vos choix n’ont pas pu être enregistrés. Réessayez.'); throw failure; }
  }} />;
  const visibleSubjects = subjects.filter(subject => !query.trim() || [subject.name, subject.shortName].join(" ").toLocaleLowerCase("fr").includes(query.trim().toLocaleLowerCase("fr")));
  return <section className="shared-study shared-course-reader"><h1>{preview.manifest?.name}</h1><p>{preview.manifest?.description}</p>{error && <p role="alert" className="notice">{error}</p>}
    <label className="shared-study-search">Rechercher une matière<input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Nom de la matière…" /></label><p className="shared-study-caption" role="status">{visibleSubjects.length} matière{visibleSubjects.length > 1 ? "s" : ""}</p>
    {!visibleSubjects.length && <div className="shared-study-empty"><h2>{query ? "Aucune matière ne correspond" : "Aucune matière dans ce cours"}</h2><p>{query ? "Essayez un autre nom de matière." : "Les matières disponibles apparaîtront ici."}</p>{query && <button onClick={() => setQuery("")}>Effacer la recherche</button>}</div>}
    {visibleSubjects.map(subject => <article className="card" key={subject.id}><h2>{subject.name}</h2>{drafts.some(draft => draft.type === "progression" && draft.documentId === subject.id && draft.syncState === "conflict") && <p role="alert" className="shared-study-conflict">Deux versions de cette progression sont conservées. Résolvez le conflit pour reprendre les modifications.</p>}
      {subject.modules.filter(module => subject.curriculumKind !== 'cefr-selectable' || module.cefrLevel === subject.cefrLevel).map(module => <section key={module.id}><h3>{module.title}</h3>{module.items.map(chapter => <details key={chapter.id}><summary>{chapter.title}</summary><p>{chapter.description}</p>{chapter.lessons?.map(lesson => <section className="shared-study-lesson" key={lesson.id}><h4>{lesson.title}</h4><p>{lesson.objective}</p>{onEdit && <label className="study-check"><input type="checkbox" disabled={!!pendingSubject || drafts.some(draft => draft.type === "progression" && draft.documentId === subject.id && draft.syncState === "conflict")} checked={lesson.completed} onChange={event => void toggleLesson(subject, module.id, chapter.id, lesson.id, event.target.checked)} />Cours terminé · {lesson.title}</label>}</section>)}</details>)}</section>)}
    </article>)}
  </section>;
}
