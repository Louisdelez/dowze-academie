import {
  FileCheck2,
  FileText,
  FileUp,
  GraduationCap,
  Save,
  ScanLine
} from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import { PAPER_ASSESSMENT_KIND_OPTIONS } from "../lib/assessment";
import type { FormationManifest } from "../lib/formations";
import { dateKeyAtTimeZone } from "../lib/zonedDate";
import type {
  AssessmentRecord,
  RecordedAssessmentKind,
  Subject
} from "../types";
import { Modal } from "./Modal";

export interface AssessmentPdfSources {
  blank?: string;
  completed?: string;
}

const MINI_TEST_OPTION = { value: "mini-test" as const, label: "Mini-test de chapitre" };

const DEFAULT_COEFFICIENT: Record<RecordedAssessmentKind, number> = {
  "mini-test": 1,
  test: 1,
  control: 2,
  midterm: 3,
  exam: 4,
  "final-exam": 5,
  "written-practical": 3,
  resit: 4,
  evaluation: 1
};

function dateInputValue(value?: string, timeZone = "Europe/Zurich") {
  if (!value) return dateKeyAtTimeZone(new Date(), timeZone);
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value.slice(0, 10) : dateKeyAtTimeZone(parsed, timeZone);
}

function fileName(path: string) {
  return path.split(/[\\/]/).filter(Boolean).at(-1) ?? path;
}

function parseScore(value: string) {
  return Number(value.trim().replace(",", "."));
}

export function AssessmentEditor({
  assessment,
  initial,
  subjects,
  onChoosePdf,
  onSave,
  onClose,
  grading = { scaleMax: 20, passMark: 10 },
  timeZone = "Europe/Zurich"
}: {
  assessment?: AssessmentRecord;
  initial?: Partial<AssessmentRecord>;
  subjects: Subject[];
  onChoosePdf: () => Promise<string | null>;
  onSave: (assessment: AssessmentRecord, sources: AssessmentPdfSources) => Promise<void> | void;
  onClose: () => void;
  grading?: FormationManifest["grading"];
  timeZone?: string;
}) {
  const seed = assessment ?? initial;
  const [recordId] = useState(seed?.id ?? crypto.randomUUID());
  const [subjectId, setSubjectId] = useState(seed?.subjectId ?? subjects[0]?.id ?? "");
  const [title, setTitle] = useState(seed?.title ?? "");
  const [kind, setKind] = useState<RecordedAssessmentKind>(seed?.kind ?? "test");
  const [coefficient, setCoefficient] = useState(seed?.coefficient ?? DEFAULT_COEFFICIENT[seed?.kind ?? "test"]);
  const [assessmentDate, setAssessmentDate] = useState(dateInputValue(seed?.assessmentDate, timeZone));
  const [score, setScore] = useState(seed?.score === undefined ? "" : String(seed.score).replace(".", ","));
  const [appreciation, setAppreciation] = useState(seed?.appreciation ?? "");
  const [personalNote, setPersonalNote] = useState(seed?.personalNote ?? "");
  const [blankSource, setBlankSource] = useState<string>();
  const [completedSource, setCompletedSource] = useState<string>();
  const [choosing, setChoosing] = useState<"blank" | "completed" | null>(null);
  const [saving, setSaving] = useState(false);
  const numericScore = useMemo(() => parseScore(score), [score]);

  const choose = async (variant: "blank" | "completed") => {
    setChoosing(variant);
    try {
      const path = await onChoosePdf();
      if (!path) return;
      if (variant === "blank") setBlankSource(path);
      else setCompletedSource(path);
    } finally {
      setChoosing(null);
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!subjectId || !title.trim() || !Number.isFinite(numericScore) || numericScore < 0 || numericScore > grading.scaleMax || !Number.isFinite(coefficient) || coefficient < 0.1 || coefficient > 20 || !appreciation.trim()) return;
    const now = new Date().toISOString();
    setSaving(true);
    try {
      await onSave({
        id: recordId,
        subjectId,
        title: title.trim(),
        kind,
        assessmentDate,
        score: numericScore,
        maxScore: grading.scaleMax,
        coefficient,
        appreciation: appreciation.trim(),
        personalNote: personalNote.trim() || undefined,
        conversationId: seed?.conversationId,
        conversationUrl: seed?.conversationUrl,
        provider: seed?.provider,
        blankPdf: assessment?.blankPdf,
        completedPdf: assessment?.completedPdf,
        createdAt: assessment?.createdAt ?? now,
        updatedAt: now
      }, { blank: blankSource, completed: completedSource });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={assessment ? "Modifier l’évaluation" : "Enregistrer une note"}
      subtitle={`Carnet de notes · barème sur ${grading.scaleMax}`}
      onClose={saving ? () => undefined : onClose}
      size="lg"
    >
      <form className="modal-form assessment-record-form" onSubmit={(event) => void submit(event)}>
        <div className="assessment-record-intro">
          <GraduationCap />
          <p>
            <strong>Résultat corrigé par votre professeur IA</strong>
            <span>Copiez la note et la phrase d’appréciation données dans la conversation, puis archivez les deux versions du PDF.</span>
          </p>
        </div>

        <div className="form-row">
          <label className="form-field">
            <span>Matière</span>
            <select value={subjectId} onChange={(event) => setSubjectId(event.target.value)} required>
              {subjects.map((subject) => <option value={subject.id} key={subject.id}>{subject.name}</option>)}
            </select>
          </label>
          <label className="form-field">
            <span>Type</span>
            <select value={kind} onChange={(event) => {
              const nextKind = event.target.value as RecordedAssessmentKind;
              setKind(nextKind);
              if (!assessment) setCoefficient(DEFAULT_COEFFICIENT[nextKind]);
            }}>
              {[MINI_TEST_OPTION, ...PAPER_ASSESSMENT_KIND_OPTIONS].map((option) => (
                <option value={option.value} key={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
        </div>

        <label className="form-field">
          <span>Intitulé</span>
          <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Ex. Mini-test — Dérivation et applications" required />
        </label>

        <div className="form-row assessment-score-row">
          <label className="form-field">
            <span>Date de l’épreuve</span>
            <input type="date" value={assessmentDate} onChange={(event) => setAssessmentDate(event.target.value)} required />
          </label>
          <label className="form-field score-field">
            <span>Note</span>
            <span className="score-input-wrap">
              <input
                value={score}
                onChange={(event) => setScore(event.target.value)}
                inputMode="decimal"
                placeholder={String(Math.round(grading.scaleMax * 0.7 * 10) / 10).replace(".", ",")}
                aria-label={`Note sur ${grading.scaleMax}`}
                required
              />
              <em>/ {grading.scaleMax}</em>
            </span>
          </label>
        </div>

        <label className="form-field">
          <span>Coefficient <em>poids dans la moyenne de la matière</em></span>
          <input
            type="number"
            min="0.1"
            max="20"
            step="0.1"
            value={coefficient}
            onChange={(event) => setCoefficient(Number(event.target.value))}
            required
          />
        </label>

        <label className="form-field">
          <span>Appréciation du professeur IA</span>
          <textarea
            value={appreciation}
            onChange={(event) => setAppreciation(event.target.value)}
            placeholder="Ex. Travail sérieux et méthodes bien maîtrisées ; veillez à mieux justifier vos résultats numériques."
            rows={3}
            required
          />
        </label>
        <label className="form-field">
          <span>Note personnelle <em>facultatif</em></span>
          <textarea value={personalNote} onChange={(event) => setPersonalNote(event.target.value)} placeholder="Ce que je veux retravailler…" rows={2} />
        </label>

        <fieldset className="assessment-files-field">
          <legend>Copies PDF conservées dans Dowze Academie</legend>
          <div className="assessment-file-pickers">
            <button type="button" onClick={() => void choose("blank")} disabled={choosing !== null}>
              <span><FileText /></span>
              <p>
                <strong>Sujet vierge</strong>
                <small>{blankSource ? `Sélectionné · ${fileName(blankSource)}` : assessment?.blankPdf?.originalName ?? "Ajouter le PDF imprimé"}</small>
              </p>
              {blankSource || assessment?.blankPdf ? <FileCheck2 /> : <FileUp />}
            </button>
            <button type="button" onClick={() => void choose("completed")} disabled={choosing !== null}>
              <span><ScanLine /></span>
              <p>
                <strong>Copie remplie scannée</strong>
                <small>{completedSource ? `Sélectionné · ${fileName(completedSource)}` : assessment?.completedPdf?.originalName ?? "Ajouter le scan envoyé à l’IA"}</small>
              </p>
              {completedSource || assessment?.completedPdf ? <FileCheck2 /> : <FileUp />}
            </button>
          </div>
          <p className="assessment-storage-note">Les fichiers sélectionnés seront validés ensemble à l’enregistrement, puis copiés dans les données locales de l’application. Les originaux restent intacts.</p>
        </fieldset>

        <div className="modal-actions">
          <span />
          <button type="button" className="secondary-button" onClick={onClose} disabled={saving}>Annuler</button>
          <button className="primary-button" disabled={saving || !Number.isFinite(numericScore) || numericScore < 0 || numericScore > grading.scaleMax || !Number.isFinite(coefficient) || coefficient < 0.1 || coefficient > 20}>
            <Save /> {saving ? "Enregistrement…" : "Enregistrer dans les notes"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
