import {
  Search,
  NotebookPen,
  CalendarDays,
  CheckSquare2,
  ClipboardCheck,
  GraduationCap,
  LayoutDashboard,
  LibraryBig,
  ChevronLeft,
  ChevronRight,
  Settings
} from "lucide-react";
import etudeAppMark from "../assets/generated/etude-app-mark-v3.webp";
import type { AppSection } from "../types";

interface SidebarProps {
  section: AppSection;
  pageActive: boolean;
  profileName: string;
  onSectionChange: (section: AppSection) => void;
  onSearch?: () => void;
  compact?: boolean;
  onToggleNavigation?: () => void;
}

const navItems = [
  { id: "home" as const, label: "Accueil", icon: LayoutDashboard },
  { id: "calendar" as const, label: "Planning", icon: CalendarDays },
  { id: "courses" as const, label: "Cours", icon: GraduationCap },
  { id: "grades" as const, label: "Évaluations", icon: ClipboardCheck },
  { id: "tasks" as const, label: "À faire", icon: CheckSquare2 }
];

export function Sidebar({
  section,
  pageActive,
  profileName,
  onSectionChange,
  onSearch,
  compact = false,
  onToggleNavigation
}: SidebarProps) {
  return (
    <aside id="main-navigation" className={`app-rail ${compact ? "is-compact" : ""}`}>
      <div className="rail-drag" />
      <button
        className="app-mark"
        onClick={() => onSectionChange("home")}
        aria-label="Accueil Dowze Academie"
      >
        <img src={etudeAppMark} alt="" aria-hidden="true" /><span className="rail-brand">Dowze<span>Académie</span></span>
      </button>

      {onSearch && <button type="button" className="rail-search" aria-label="Rechercher dans mon espace" onClick={onSearch} title="Rechercher (Ctrl / Cmd + K)"><Search aria-hidden="true"/><span>Rechercher</span><kbd>⌘ K</kbd></button>}
      {onToggleNavigation && <button type="button" className="panel-edge-tab navigation-edge-tab" onClick={onToggleNavigation} aria-label={compact ? "Développer la navigation" : "Réduire la navigation"} aria-controls="main-navigation" aria-expanded={!compact} title={compact ? "Développer la navigation" : "Réduire la navigation"}>
        {compact ? <ChevronRight aria-hidden="true" /> : <ChevronLeft aria-hidden="true" />}
      </button>}
      <nav className="rail-nav" aria-label="Navigation principale"><span className="rail-group-label">Mon apprentissage</span>
        {navItems.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            className={`rail-button ${pageActive && section === id ? "is-active" : ""}`}
            onClick={() => onSectionChange(id)}
            aria-label={label}
            aria-current={pageActive && section === id ? "page" : undefined}
            data-tooltip={label}
          >
            <Icon aria-hidden="true" /><span className="rail-label">{label}</span>
          </button>
        ))}
        <span className="rail-group-label rail-group-label--tools">Mon carnet</span>
        <button className={`rail-button ${section === "notes" || section === "drawing" || !pageActive ? "is-active" : ""}`} onClick={() => onSectionChange("notes")} aria-label="Mes notes" aria-current={section === "notes" || section === "drawing" || !pageActive ? "page" : undefined} data-tooltip="Mes notes"><NotebookPen aria-hidden="true"/><span className="rail-label">Notes</span></button>
      </nav>

      <div className="rail-bottom">
        <button
          className={`rail-button ${pageActive && section === "formations" ? "is-active" : ""}`}
          onClick={() => onSectionChange("formations")}
          aria-label="Formations"
          aria-current={pageActive && section === "formations" ? "page" : undefined}
          data-tooltip="Formations"
        >
          <LibraryBig aria-hidden="true" /><span className="rail-label">Formations</span>
        </button>
        <button
          className={`rail-button ${pageActive && section === "settings" ? "is-active" : ""}`}
          onClick={() => onSectionChange("settings")}
          aria-label="Réglages"
          aria-current={pageActive && section === "settings" ? "page" : undefined}
          data-tooltip="Réglages"
        >
          <Settings aria-hidden="true" /><span className="rail-label">Réglages</span>
        </button>
        <button
          className="avatar-button"
          aria-label={`Ouvrir le profil de ${profileName}`}
          title={`Profil de ${profileName}`}
          onClick={() => onSectionChange("settings")}
        >
          {profileName.trim().charAt(0).toLocaleUpperCase("fr") || "É"}
        </button>
      </div>
    </aside>
  );
}
