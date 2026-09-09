import {
  Bot,
  CalendarDays,
  CheckSquare2,
  ClipboardCheck,
  GraduationCap,
  LayoutDashboard,
  LibraryBig,
  PanelRightOpen,
  Settings
} from "lucide-react";
import etudeAppMark from "../assets/generated/etude-app-mark-v3.webp";
import type { AppSection } from "../types";

interface SidebarProps {
  section: AppSection;
  pageActive: boolean;
  aiVisible: boolean;
  profileName: string;
  onSectionChange: (section: AppSection) => void;
  onToggleAi: () => void;
}

const navItems = [
  { id: "home" as const, label: "Accueil", icon: LayoutDashboard },
  { id: "calendar" as const, label: "Planning", icon: CalendarDays },
  { id: "courses" as const, label: "Cours", icon: GraduationCap },
  { id: "grades" as const, label: "Notes & évaluations", icon: ClipboardCheck },
  { id: "tasks" as const, label: "À faire", icon: CheckSquare2 }
];

export function Sidebar({
  section,
  pageActive,
  aiVisible,
  profileName,
  onSectionChange,
  onToggleAi
}: SidebarProps) {
  return (
    <aside className="app-rail">
      <div className="rail-drag" data-tauri-drag-region />
      <button
        className="app-mark"
        onClick={() => onSectionChange("home")}
        aria-label="Accueil Dowze Academie"
      >
        <img src={etudeAppMark} alt="" aria-hidden="true" />
      </button>

      <nav className="rail-nav" aria-label="Navigation principale">
        {navItems.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            className={`rail-button ${pageActive && section === id ? "is-active" : ""}`}
            onClick={() => onSectionChange(id)}
            aria-label={label}
            aria-current={pageActive && section === id ? "page" : undefined}
            data-tooltip={label}
          >
            <Icon />
          </button>
        ))}
      </nav>

      <div className="rail-bottom">
        <button
          className={`rail-button rail-ai-button ${aiVisible ? "is-active" : ""}`}
          onClick={onToggleAi}
          aria-label={aiVisible ? "Masquer l’assistant IA" : "Afficher l’assistant IA"}
          data-tooltip={aiVisible ? "Masquer l’IA" : "Afficher l’IA"}
        >
          {aiVisible ? <Bot /> : <PanelRightOpen />}
          <span className="status-dot" />
        </button>
        <button
          className={`rail-button ${pageActive && section === "formations" ? "is-active" : ""}`}
          onClick={() => onSectionChange("formations")}
          aria-label="Formations"
          aria-current={pageActive && section === "formations" ? "page" : undefined}
          data-tooltip="Formations"
        >
          <LibraryBig />
        </button>
        <button
          className={`rail-button ${pageActive && section === "settings" ? "is-active" : ""}`}
          onClick={() => onSectionChange("settings")}
          aria-label="Réglages"
          aria-current={pageActive && section === "settings" ? "page" : undefined}
          data-tooltip="Réglages"
        >
          <Settings />
        </button>
        <button
          className="avatar-button"
          aria-label={`Ouvrir le profil local de ${profileName}`}
          title={`Profil local de ${profileName}`}
          onClick={() => onSectionChange("settings")}
        >
          {profileName.trim().charAt(0).toLocaleUpperCase("fr") || "É"}
        </button>
      </div>
    </aside>
  );
}
