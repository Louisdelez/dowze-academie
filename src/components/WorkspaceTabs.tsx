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
import { useLayoutEffect, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import type { AppSection, SubjectNoteDocument } from "../types";

const sectionDetails = {
  home: { label: "Accueil", icon: LayoutDashboard },
  calendar: { label: "Planning", icon: CalendarDays },
  courses: { label: "Cours", icon: GraduationCap },
  grades: { label: "Évaluations", icon: ClipboardCheck },
  tasks: { label: "À faire", icon: CheckSquare2 },
  formations: { label: "Formations", icon: LibraryBig },
  notes: { label: "Notes", icon: NotebookPen },
  drawing: { label: "Notes", icon: NotebookPen },
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
  secondaryDocumentId?: string | null;
  onActivatePage: () => void;
  onActivateNote: (noteId: string) => void;
  onCloseNote: (noteId: string) => void;
  onCreateNote: () => void;
  creatingDisabled?:boolean;
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
  activeDocumentId,secondaryDocumentId,
  onActivatePage,
  onActivateNote,
  onCloseNote,
  onCreateNote,creatingDisabled=false
}: WorkspaceTabsProps) {
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const stripRef = useRef<HTMLDivElement>(null);
  const [companionGap, setCompanionGap] = useState({ index: -1, width: 0 });
  const documentById = new Map(documents.map((document) => [document.id, document]));
  const openDocuments = openDocumentIds
    .map((id) => documentById.get(id))
    .filter((document): document is SubjectNoteDocument => Boolean(document));
  const sectionDetail = sectionDetails[section];
  const SectionIcon = sectionDetail.icon;
  const tabLayoutKey = openDocuments.map(note => `${note.id}:${note.title}`).join("|");
  useLayoutEffect(() => {
    const strip = stripRef.current;
    if (!strip || typeof ResizeObserver === "undefined") return;
    // Keep every tab and its close button outside the always-visible 64px pet.
    const measure = () => {
      const left = window.innerWidth / 2 - 40, right = window.innerWidth / 2 + 40;
      let adjustment = 0;
      let next = { index: -1, width: 0 };
      Array.from(strip.querySelectorAll<HTMLElement>("[data-workspace-tab-item]")).forEach((item, index) => {
        adjustment += parseFloat(item.style.marginLeft) || 0;
        const box = item.getBoundingClientRect();
        const start = box.left - adjustment, end = start + box.width;
        if (next.index < 0 && end > left && start < right) next = { index, width: Math.ceil(right - start + 4) };
      });
      setCompanionGap(current => current.index === next.index && current.width === next.width ? current : next);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(strip);
    strip.querySelectorAll("[data-workspace-tab-item]").forEach(item => observer.observe(item));
    strip.addEventListener("scroll", measure);
    window.addEventListener("resize", measure);
    measure();
    return () => { observer.disconnect(); strip.removeEventListener("scroll", measure); window.removeEventListener("resize", measure); };
  }, [tabLayoutKey, section, pageLabel]);
  const itemStyle = (index: number) => ({ marginLeft: companionGap.index === index ? companionGap.width : 0 });

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
    if (nextIndex === 0) onActivatePage();
    else onActivateNote(openDocuments[nextIndex - 1].id);
    tabRefs.current[nextIndex]?.focus();
  };

  return (
    <div className="workspace-tabs-shell">
      <div
        ref={stripRef}
        className="workspace-tabs"
        role="tablist"
        aria-multiselectable={!!secondaryDocumentId}
        aria-label="Pages ouvertes"
       
      >
        <div className="workspace-tab-frame workspace-tab-frame--page" data-workspace-tab-item style={itemStyle(0)}>
          <button
            ref={(element) => { tabRefs.current[0] = element; }}
            type="button"
            role="tab"
            className={`workspace-tab ${activeDocumentId === null ? "is-active" : ""}`}
            id="workspace-tab-page"
            aria-controls="workspace-panel-page"
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
            <div className="workspace-tab-frame workspace-tab-frame--note" key={note.id} data-workspace-tab-item style={itemStyle(tabIndex)}>
              <button
                ref={(element) => { tabRefs.current[tabIndex] = element; }}
                type="button"
                role="tab"
                className={`workspace-tab ${isActive ? "is-active" : ""} ${secondaryDocumentId===note.id?"is-in-split":""}`}
                id={`workspace-tab-${note.id}`}
                aria-controls={`workspace-panel-${note.id}`}
                aria-selected={isActive||secondaryDocumentId===note.id}
                tabIndex={isActive ? 0 : -1}
                onClick={() => onActivateNote(note.id)}
                onKeyDown={(event) => {
                  if (event.key === "Delete") { event.preventDefault(); onCloseNote(note.id); }
                  else focusRelativeTab(event, tabIndex);
                }}
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
          data-workspace-tab-item
          style={itemStyle(openDocuments.length + 1)}
          onClick={onCreateNote}
          disabled={creatingDisabled}
          aria-label="Nouvel onglet de note"
          title="Créer une nouvelle note"
        >
          <svg className="workspace-tab-add-shape" viewBox="0 0 48 38" aria-hidden="true" focusable="false">
            <path d="M0 37.5C4.5 37.5 7.5 34.5 7.5 30V10C7.5 4.75 11.75.5 17 .5H31C36.25.5 40.5 4.75 40.5 10V30C40.5 34.5 43.5 37.5 48 37.5" />
          </svg>
          <Plus className="workspace-tab-add-icon" aria-hidden="true" />
        </button>
        <div className="workspace-window-drag" aria-hidden="true" />
      </div>
    </div>
  );
}
