import {
  Atom,
  BookOpen,
  Braces,
  DraftingCompass,
  FlaskConical,
  FunctionSquare,
  Languages,
  Leaf,
  Palette,
  Ruler,
  Sigma,
  Wrench,
  Zap
} from "lucide-react";
import type { Subject } from "../types";

const icons = {
  function: FunctionSquare,
  atom: Atom,
  book: BookOpen,
  languages: Languages,
  leaf: Leaf,
  palette: Palette,
  matrix: Sigma,
  code: Braces,
  flask: FlaskConical,
  drafting: DraftingCompass,
  ruler: Ruler,
  zap: Zap,
  wrench: Wrench
};

interface SubjectIconProps {
  subject: Subject;
  size?: "sm" | "md" | "lg";
}

export function SubjectIcon({ subject, size = "md" }: SubjectIconProps) {
  const Icon = icons[subject.icon];
  return (
    <span
      className={`subject-icon subject-icon--${size}`}
      style={{ background: subject.accent, color: subject.color }}
      aria-hidden="true"
    >
      <Icon />
    </span>
  );
}
