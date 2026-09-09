import {
  CalendarDays,
  CheckSquare2,
  ClipboardCheck,
  GraduationCap,
  LayoutDashboard,
  LibraryBig,
  NotebookPen,
  Plus,
  Settings,
  X
} from "lucide-react";
import { useRef } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import type { AppSection, SubjectNoteDocument } from "../types";

const sectionDetails = {
  home: { label: "Accueil", icon: LayoutDashboard },
  calendar: { label: "Planning", icon: CalendarDays },
  courses: { label: "Cours", icon: GraduationCap },
  grades: { label: "Notes & évaluations", icon: ClipboardCheck },
  tasks: { label: "À faire", icon: CheckSquare2 },
  formations: { label: "Formations", icon: LibraryBig },
  settings: { label: "Réglages", icon: Settings }
} satisfies Record<AppSection, { label: string; icon: typeof LayoutDashboard }>;

export interface WorkspaceTabsProps {
  section: AppSection;
  /** Permet à une vue détaillée d'afficher un intitulé plus précis que la section. */
  pageLabel?: string;
  documents: readonly SubjectNoteDocument[];
  openDocumentIds: readonly string[];
  /** `null` signifie que la page principale courante est active. */
  activeDocumentId: string | null;
  onActivatePage: () => void;
  onActivateNote: (noteId: string) => void;
  onCloseNote: (noteId: string) => void;
  onOpenLibrary: () => void;
}

/**
 * Barre d'onglets globale du panneau central. La première entrée représente
 * toujours la page Dowze Academie courante ; les autres sont des documents Markdown.
 */
export function WorkspaceTabs({
  section,
  pageLabel,
  documents,
  openDocumentIds,
  activeDocumentId,
  onActivatePage,
  onActivateNote,
  onCloseNote,
  onOpenLibrary
}: WorkspaceTabsProps) {
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const documentById = new Map(documents.map((document) => [document.id, document]));
  const openDocuments = openDocumentIds
    .map((id) => documentById.get(id))
    .filter((document): document is SubjectNoteDocument => Boolean(document));
  const sectionDetail = sectionDetails[section];
  const SectionIcon = sectionDetail.icon;

  const focusRelativeTab = (event: ReactKeyboardEvent<HTMLButtonElement>, index: number) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const lastIndex = openDocuments.length;
    const nextIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? lastIndex
        : event.key === "ArrowLeft"
          ? (index - 1 + lastIndex + 1) % (lastIndex + 1)
          : (index + 1) % (lastIndex + 1);
    tabRefs.current[nextIndex]?.focus();
  };

  return (
    <div className="workspace-tabs-shell" data-tauri-drag-region>
      <div
        className="workspace-tabs"
        role="tablist"
        aria-label="Pages ouvertes"
        data-tauri-drag-region
      >
        <div className="workspace-tab-frame workspace-tab-frame--page">
          <button
            ref={(element) => { tabRefs.current[0] = element; }}
            type="button"
            role="tab"
            className={`workspace-tab ${activeDocumentId === null ? "is-active" : ""}`}
            aria-selected={activeDocumentId === null}
            tabIndex={activeDocumentId === null ? 0 : -1}
            onClick={onActivatePage}
            onKeyDown={(event) => focusRelativeTab(event, 0)}
            title={pageLabel ?? sectionDetail.label}
          >
            <SectionIcon aria-hidden="true" />
            <span>{pageLabel ?? sectionDetail.label}</span>
          </button>
        </div>

        {openDocuments.map((note, noteIndex) => {
          const tabIndex = noteIndex + 1;
          const isActive = activeDocumentId === note.id;
          const title = note.title.trim() || "Sans titre";
          return (
            <div className="workspace-tab-frame workspace-tab-frame--note" key={note.id}>
              <button
                ref={(element) => { tabRefs.current[tabIndex] = element; }}
                type="button"
                role="tab"
                className={`workspace-tab ${isActive ? "is-active" : ""}`}
                aria-selected={isActive}
                tabIndex={isActive ? 0 : -1}
                onClick={() => onActivateNote(note.id)}
                onKeyDown={(event) => focusRelativeTab(event, tabIndex)}
                title={title}
              >
                <NotebookPen aria-hidden="true" />
                <span>{title}</span>
              </button>
              <button
                type="button"
                className="workspace-tab-close"
                onClick={() => onCloseNote(note.id)}
                aria-label={`Fermer la note « ${title} »`}
                title="Fermer l’onglet"
              >
                <X aria-hidden="true" />
              </button>
            </div>
          );
        })}

        <button
          type="button"
          className="workspace-tab-add"
          onClick={onOpenLibrary}
          aria-label="Nouvel onglet de note"
          title="Créer ou ouvrir une note"
        >
          <Plus aria-hidden="true" />
        </button>
        <div className="workspace-window-drag" data-tauri-drag-region aria-hidden="true" />
      </div>
    </div>
  );
}
