import {
  BookOpenCheck,
  Check,
  Download,
  FilePlus2,
  Hash,
  NotebookPen,
  Search,
  Tags,
  Trash2,
  X
} from "lucide-react";
import {
  lazy,
  Suspense,
  useEffect,
  useId,
  useMemo,
  useState
} from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { saveTextDocument } from "../lib/tauri";
import type { Subject, SubjectNoteDocument } from "../types";
import { Modal } from "./Modal";
import { SubjectIcon } from "./SubjectIcon";

const MarkdownNoteEditor = lazy(() => import("./MarkdownNoteEditor"));
const MAX_TAGS = 30;
const MAX_TAG_LENGTH = 64;

type NotePatch = Partial<Pick<
  SubjectNoteDocument,
  "title" | "markdown" | "tags" | "subjectIds"
>>;

function normalizeTag(value: string) {
  return value.trim().replace(/\s+/gu, " ").slice(0, MAX_TAG_LENGTH);
}

function plainTextPreview(markdown: string) {
  return markdown
    .replace(/```[\s\S]*?```/gu, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/gu, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/gu, "$1")
    .replace(/<[^>]+>/gu, " ")
    .replace(/[#>*_~`|\\-]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function formattedUpdatedAt(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Date inconnue";
  return new Intl.DateTimeFormat("fr-CH", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function noteFilename(title: string) {
  return (title.trim() || "note")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "")
    .replace(/[^A-Za-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .toLocaleLowerCase("fr") || "note";
}

export interface WorkspaceNotePageProps {
  note: SubjectNoteDocument;
  subjects: readonly Subject[];
  /** Clé locale surveillée pour afficher le vrai état de sauvegarde. */
  storageKey: string;
  onUpdateNote: (noteId: string, patch: NotePatch) => void;
  onOpenSubjects: (note: SubjectNoteDocument) => void;
  onDeleteNote: (note: SubjectNoteDocument) => void;
}

export function WorkspaceNotePage({
  note,
  subjects,
  storageKey,
  onUpdateNote,
  onOpenSubjects,
  onDeleteNote
}: WorkspaceNotePageProps) {
  const [tagDraft, setTagDraft] = useState("");
  const [saveFailed, setSaveFailed] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const linkedSubjects = subjects.filter((subject) => note.subjectIds.includes(subject.id));
  const wordCount = note.markdown.trim() ? note.markdown.trim().split(/\s+/u).length : 0;

  useEffect(() => {
    setTagDraft("");
    setExportError(null);
  }, [note.id]);

  useEffect(() => {
    const updateStatus = (event: Event) => {
      const detail = (event as CustomEvent<{ key?: string }>).detail;
      if (detail?.key !== storageKey) return;
      setSaveFailed(event.type === "etude:persistence-error");
    };
    window.addEventListener("etude:persistence-error", updateStatus);
    window.addEventListener("etude:persistence-success", updateStatus);
    return () => {
      window.removeEventListener("etude:persistence-error", updateStatus);
      window.removeEventListener("etude:persistence-success", updateStatus);
    };
  }, [storageKey]);

  const addTag = (rawTag = tagDraft) => {
    const tag = normalizeTag(rawTag);
    setTagDraft("");
    if (!tag || note.tags.length >= MAX_TAGS) return;
    if (note.tags.some((candidate) => candidate.toLocaleLowerCase("fr") === tag.toLocaleLowerCase("fr"))) return;
    onUpdateNote(note.id, { tags: [...note.tags, tag] });
  };

  const handleTagKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      addTag();
      return;
    }
    if (event.key === "Backspace" && !tagDraft && note.tags.length) {
      onUpdateNote(note.id, { tags: note.tags.slice(0, -1) });
    }
  };

  const exportNote = async () => {
    try {
      await saveTextDocument(note.markdown, `${noteFilename(note.title)}.md`, "markdown");
      setExportError(null);
    } catch (error) {
      setExportError(`Impossible d’exporter la note : ${String(error)}`);
    }
  };

  return (
    <main className="workspace-note-page">
      <header className="workspace-note-header">
        <div className="workspace-note-heading">
          <NotebookPen aria-hidden="true" />
          <div className="workspace-note-title-block">
            <input
              className="workspace-note-title"
              value={note.title}
              maxLength={500}
              onChange={(event) => onUpdateNote(note.id, { title: event.target.value })}
              onBlur={() => {
                if (!note.title.trim()) onUpdateNote(note.id, { title: "Sans titre" });
              }}
              aria-label="Titre de la note"
              placeholder="Sans titre"
            />
            <div className={`workspace-note-save-status ${saveFailed ? "is-error" : ""}`} role="status">
              {saveFailed ? (
                <><span aria-hidden="true">!</span> Non enregistrée — stockage local plein</>
              ) : (
                <><Check aria-hidden="true" /> Enregistrée automatiquement</>
              )}
              <time dateTime={note.updatedAt}>Modifiée le {formattedUpdatedAt(note.updatedAt)}</time>
            </div>
          </div>
        </div>

        <div className="workspace-note-actions">
          <button
            type="button"
            className="workspace-note-subject-button"
            onClick={() => onOpenSubjects(note)}
            aria-label={`Modifier les matières de la note, ${linkedSubjects.length} sélectionnée${linkedSubjects.length === 1 ? "" : "s"}`}
          >
            <BookOpenCheck aria-hidden="true" />
            <span>Matières</span>
            <em>{linkedSubjects.length}</em>
          </button>
          <button type="button" onClick={() => void exportNote()} title="Télécharger en Markdown">
            <Download aria-hidden="true" />
            <span>Exporter .md</span>
          </button>
          <button
            type="button"
            className="workspace-note-delete"
            onClick={() => onDeleteNote(note)}
            aria-label={`Supprimer la note « ${note.title.trim() || "Sans titre"} »`}
            title="Supprimer la note"
          >
            <Trash2 aria-hidden="true" />
          </button>
        </div>
      </header>

      <section className="workspace-note-metadata" aria-label="Classement de la note">
        <div className="workspace-note-subjects" aria-label="Matières associées">
          {linkedSubjects.length ? linkedSubjects.map((subject) => (
            <span className="workspace-note-subject-chip" key={subject.id}>
              <span aria-hidden="true" style={{ backgroundColor: subject.color }} />
              {subject.shortName || subject.name}
            </span>
          )) : (
            <button type="button" onClick={() => onOpenSubjects(note)}>
              <BookOpenCheck aria-hidden="true" /> Associer une matière
            </button>
          )}
        </div>

        <div className="workspace-note-tags" aria-label="Tags de la note">
          <Tags aria-hidden="true" />
          {note.tags.map((tag) => (
            <span className="workspace-note-tag" key={tag.toLocaleLowerCase("fr")}>
              <Hash aria-hidden="true" />{tag}
              <button
                type="button"
                onClick={() => onUpdateNote(note.id, {
                  tags: note.tags.filter((candidate) => candidate !== tag)
                })}
                aria-label={`Retirer le tag « ${tag} »`}
              >
                <X aria-hidden="true" />
              </button>
            </span>
          ))}
          <input
            value={tagDraft}
            maxLength={MAX_TAG_LENGTH}
            disabled={note.tags.length >= MAX_TAGS}
            onChange={(event) => setTagDraft(event.target.value.replace(/^,+/u, ""))}
            onKeyDown={handleTagKeyDown}
            onBlur={() => addTag()}
            aria-label="Ajouter un tag"
            placeholder={note.tags.length ? "Ajouter un tag…" : "Ajouter des tags…"}
          />
        </div>
      </section>

      {exportError && (
        <div className="workspace-note-error" role="alert">
          <span>{exportError}</span>
          <button type="button" onClick={() => setExportError(null)} aria-label="Fermer l’erreur d’export">
            <X aria-hidden="true" />
          </button>
        </div>
      )}

      <section className="workspace-note-editor" aria-label="Contenu de la note">
        <Suspense fallback={(
          <div className="workspace-note-editor-loading" role="status">Chargement de l’éditeur Markdown…</div>
        )}>
          <MarkdownNoteEditor
            key={note.id}
            noteId={note.id}
            initialMarkdown={note.markdown}
            onChange={(markdown) => onUpdateNote(note.id, { markdown })}
          />
        </Suspense>
      </section>

      <footer className="workspace-note-statusbar" aria-label="Statistiques de la note">
        <span>Markdown</span>
        <span>LaTeX</span>
        <span>{wordCount} mot{wordCount === 1 ? "" : "s"}</span>
        <span>{note.markdown.length} caractère{note.markdown.length === 1 ? "" : "s"}</span>
      </footer>
    </main>
  );
}

export interface NoteLibraryDialogProps {
  documents: readonly SubjectNoteDocument[];
  subjects: readonly Subject[];
  onCreate: () => void | boolean;
  onOpen: (noteId: string) => void | boolean;
  onClose: () => void;
}

export function NoteLibraryDialog({
  documents,
  subjects,
  onCreate,
  onOpen,
  onClose
}: NoteLibraryDialogProps) {
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLocaleLowerCase("fr");
  const subjectsById = useMemo(
    () => new Map(subjects.map((subject) => [subject.id, subject])),
    [subjects]
  );
  const filteredDocuments = useMemo(() => documents
    .filter((note) => {
      if (!normalizedQuery) return true;
      const subjectNames = note.subjectIds
        .map((id) => subjectsById.get(id))
        .flatMap((subject) => subject ? [subject.name, subject.shortName] : []);
      return [note.title, note.markdown, ...note.tags, ...subjectNames]
        .join(" ")
        .toLocaleLowerCase("fr")
        .includes(normalizedQuery);
    })
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)), [
      documents,
      normalizedQuery,
      subjectsById
    ]);

  const handleCreate = () => {
    if (onCreate() !== false) onClose();
  };

  const handleOpen = (noteId: string) => {
    if (onOpen(noteId) !== false) onClose();
  };

  return (
    <Modal
      title="Ouvrir un onglet de note"
      subtitle="Crée une page vierge ou reprends une note déjà enregistrée."
      size="lg"
      onClose={onClose}
    >
      <div className="global-note-library">
        <button type="button" className="global-note-create" onClick={handleCreate}>
          <span><FilePlus2 aria-hidden="true" /></span>
          <strong>Nouvelle note</strong>
          <small>Ouvrir une page Markdown vierge</small>
        </button>

        <div className="global-note-library-divider" aria-hidden="true"><span>ou</span></div>

        <section className="global-note-existing" aria-labelledby="global-note-existing-title">
          <div className="global-note-existing-heading">
            <div>
              <h3 id="global-note-existing-title">Reprendre une note</h3>
              <span>{documents.length} note{documents.length === 1 ? "" : "s"} enregistrée{documents.length === 1 ? "" : "s"}</span>
            </div>
            <label className="global-note-search">
              <Search aria-hidden="true" />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Titre, tag ou matière…"
                aria-label="Rechercher une note"
              />
              {query && (
                <button type="button" onClick={() => setQuery("")} aria-label="Effacer la recherche">
                  <X aria-hidden="true" />
                </button>
              )}
            </label>
          </div>

          {filteredDocuments.length ? (
            <div className="global-note-list" role="list">
              {filteredDocuments.map((note) => {
                const linkedSubjects = note.subjectIds
                  .map((id) => subjectsById.get(id))
                  .filter((subject): subject is Subject => Boolean(subject));
                const preview = plainTextPreview(note.markdown);
                const title = note.title.trim() || "Sans titre";
                return (
                  <div className="global-note-list-entry" key={note.id} role="listitem">
                    <button
                      type="button"
                      className="global-note-list-item"
                      onClick={() => handleOpen(note.id)}
                      aria-label={`Ouvrir la note « ${title} »`}
                    >
                      <span className="global-note-list-icon"><NotebookPen aria-hidden="true" /></span>
                      <span className="global-note-list-content">
                        <span className="global-note-list-title">
                          <strong>{title}</strong>
                          <time dateTime={note.updatedAt}>{formattedUpdatedAt(note.updatedAt)}</time>
                        </span>
                        <span className="global-note-list-preview">
                          {preview || "Cette note est encore vide."}
                        </span>
                        <span className="global-note-list-metadata">
                          {linkedSubjects.length ? linkedSubjects.map((subject) => (
                            <span className="global-note-subject-chip" key={subject.id}>
                              <i aria-hidden="true" style={{ backgroundColor: subject.color }} />
                              {subject.shortName || subject.name}
                            </span>
                          )) : <span className="global-note-unassigned">Aucune matière</span>}
                          {note.tags.map((tag) => (
                            <span className="global-note-tag-chip" key={tag.toLocaleLowerCase("fr")}>
                              #{tag}
                            </span>
                          ))}
                        </span>
                      </span>
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="global-note-library-empty">
              <Search aria-hidden="true" />
              <strong>{documents.length ? "Aucune note ne correspond" : "Aucune note pour le moment"}</strong>
              <p>{documents.length ? "Essaie avec un autre titre, tag ou nom de matière." : "Crée ta première note pour la retrouver ensuite ici."}</p>
            </div>
          )}
        </section>
      </div>
    </Modal>
  );
}

export interface NoteSubjectsDialogProps {
  note: SubjectNoteDocument;
  subjects: readonly Subject[];
  onChangeSubjectIds: (subjectIds: string[]) => void;
  onClose: () => void;
}

export function NoteSubjectsDialog({
  note,
  subjects,
  onChangeSubjectIds,
  onClose
}: NoteSubjectsDialogProps) {
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState(() => new Set(note.subjectIds));
  const statusId = useId();
  const normalizedQuery = query.trim().toLocaleLowerCase("fr");
  const visibleSubjects = subjects.filter((subject) => !normalizedQuery || [
    subject.name,
    subject.shortName,
    subject.domain ?? "",
    subject.teacher
  ].join(" ").toLocaleLowerCase("fr").includes(normalizedQuery));

  useEffect(() => {
    setSelectedIds(new Set(note.subjectIds));
  }, [note.id, note.subjectIds]);

  const toggleSubject = (subjectId: string) => {
    const next = new Set(selectedIds);
    if (next.has(subjectId)) next.delete(subjectId);
    else next.add(subjectId);
    setSelectedIds(next);
    onChangeSubjectIds(subjects.filter((subject) => next.has(subject.id)).map((subject) => subject.id));
  };

  return (
    <Modal
      title="Matières associées"
      subtitle={`Choisis les cours concernés par « ${note.title.trim() || "Sans titre"} ».`}
      size="lg"
      onClose={onClose}
    >
      <div className="global-note-subjects-dialog">
        <div className="global-note-subjects-toolbar">
          <label className="global-note-search">
            <Search aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Rechercher une matière…"
              aria-label="Rechercher une matière"
            />
            {query && (
              <button type="button" onClick={() => setQuery("")} aria-label="Effacer la recherche">
                <X aria-hidden="true" />
              </button>
            )}
          </label>
          <span className="global-note-subjects-count">
            {selectedIds.size} sélectionnée{selectedIds.size === 1 ? "" : "s"}
          </span>
        </div>

        <p className="global-note-subjects-status" id={statusId}>
          <Check aria-hidden="true" /> Chaque choix est enregistré automatiquement.
        </p>

        <div className="global-note-subjects-list" aria-describedby={statusId}>
          {visibleSubjects.map((subject) => {
            const inputId = `note-subject-${note.id}-${subject.id}`;
            return (
              <label className={`global-note-subject-option ${selectedIds.has(subject.id) ? "is-selected" : ""}`} htmlFor={inputId} key={subject.id}>
                <input
                  id={inputId}
                  type="checkbox"
                  checked={selectedIds.has(subject.id)}
                  onChange={() => toggleSubject(subject.id)}
                />
                <SubjectIcon subject={subject} size="sm" />
                <span>
                  <strong>{subject.name}</strong>
                  <small>{[subject.domain, subject.period].filter(Boolean).join(" · ") || "Cours"}</small>
                </span>
                <span className="global-note-subject-check" aria-hidden="true"><Check /></span>
              </label>
            );
          })}
          {!visibleSubjects.length && (
            <div className="global-note-subjects-empty">
              <Search aria-hidden="true" /> Aucune matière ne correspond à cette recherche.
            </div>
          )}
        </div>

        <footer className="global-note-subjects-footer">
          <span>Une note peut être reliée à plusieurs matières.</span>
          <button type="button" className="global-note-done" onClick={onClose}>Terminé</button>
        </footer>
      </div>
    </Modal>
  );
}
