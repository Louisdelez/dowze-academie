import type { FormationManifest } from "../../../src/lib/formations.ts";

/** Manifeste non-/20 utilisé pour prouver que les prompts restent génériques. */
export const SIX_POINT_FORMATION: FormationManifest = {
  schemaVersion: "dowze-formation@1",
  packageVersion: "1.0.0",
  id: "maturite-federale-2026-2027",
  name: "Maturité fédérale",
  shortName: "Maturité",
  yearLabel: "Année préparatoire",
  description: "Préparation annuelle à la maturité fédérale.",
  locale: "fr-CH",
  timeZone: "Europe/Zurich",
  academicYear: {
    startDate: "2026-09-01",
    endDate: "2027-06-30"
  },
  level: {
    label: "Secondaire II",
    targetAudience: "Candidats à la maturité fédérale"
  },
  pedagogy: {
    teachingLanguage: "fr",
    instructionLevel: "Préparation certificative",
    approach: "Progression structurée, entraînement régulier et examens blancs."
  },
  grading: {
    scaleMax: 6,
    passMark: 4
  },
  theme: {
    color: "#5868de",
    accent: "#eef0ff",
    icon: "book"
  },
  files: {
    subjects: "matieres.json",
    curriculum: "programme.json",
    schedule: "planning.json",
    assessments: "evaluations.json",
    tasks: "taches.json"
  }
};
