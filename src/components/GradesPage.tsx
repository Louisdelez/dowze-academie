import {
  Award,
  AlertTriangle,
  BookOpen,
  Bot,
  CalendarDays,
  FileCheck2,
  FileText,
  Filter,
  GraduationCap,
  MessageSquareText,
  Pencil,
  Plus,
  ScanLine,
  ClipboardPaste,
  RotateCcw,
  Trash2
} from "lucide-react";
import { format, isValid, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { useMemo, useState } from "react";
import { paperAssessmentKindLabel } from "../lib/assessment";
import type { AssessmentRecord, RecordedAssessmentKind, Subject } from "../types";
import { SubjectIcon } from "./SubjectIcon";

export type AssessmentPdfVariant = "blank" | "completed";

export interface GradesPageProps {
  assessments: AssessmentRecord[];
  subjects: Subject[];
  onAddAssessment: () => void;
  onEditAssessment: (assessment: AssessmentRecord) => void;
  onDeleteAssessment: (assessment: AssessmentRecord) => void;
  onOpenPdf: (
    assessment: AssessmentRecord,
    variant: AssessmentPdfVariant
  ) => void;
  onOpenConversation: (conversationId: string) => void;
}

const averageFormatter = new Intl.NumberFormat("fr-FR", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 2
});

const scoreFormatter = new Intl.NumberFormat("fr-FR", {
  maximumFractionDigits: 2
});

function assessmentKindLabel(kind: RecordedAssessmentKind): string {
  return kind === "mini-test" ? "Mini-test PDF" : paperAssessmentKindLabel(kind);
}

function normalizedScore(assessment: AssessmentRecord): number | null {
  if (
    !Number.isFinite(assessment.score) ||
    !Number.isFinite(assessment.maxScore) ||
    assessment.maxScore <= 0
  ) {
    return null;
  }
  return (assessment.score / assessment.maxScore) * 20;
}

function averageOf(assessments: AssessmentRecord[]): number | null {
  const weighted = assessments
    .map((assessment) => ({ score: normalizedScore(assessment), coefficient: assessment.coefficient ?? 1 }))
    .filter((entry): entry is { score: number; coefficient: number } => entry.score !== null && entry.coefficient > 0);
  const totalWeight = weighted.reduce((sum, entry) => sum + entry.coefficient, 0);
  if (!totalWeight) return null;
  return weighted.reduce((sum, entry) => sum + entry.score * entry.coefficient, 0) / totalWeight;
}

function scoreTone(score: number | null): "excellent" | "good" | "pass" | "low" | "ungraded" {
  if (score === null) return "ungraded";
  if (score >= 16) return "excellent";
  if (score >= 14) return "good";
  if (score >= 10) return "pass";
  return "low";
}

function displayDate(value: string): string {
  const date = parseISO(value);
  return isValid(date)
    ? format(date, "d MMMM yyyy", { locale: fr })
    : value;
}

function subjectName(subject: Subject | undefined): string {
  return subject?.name ?? "Matière inconnue";
}

export function GradesPage({
  assessments,
  subjects,
  onAddAssessment,
  onEditAssessment,
  onDeleteAssessment,
  onOpenPdf,
  onOpenConversation
}: GradesPageProps) {
  const [subjectFilter, setSubjectFilter] = useState("all");
  const [kindFilter, setKindFilter] = useState<"all" | RecordedAssessmentKind>("all");

  const availableKinds = useMemo(
    () => Array.from(new Set(assessments.map((assessment) => assessment.kind)))
      .sort((a, b) => assessmentKindLabel(a).localeCompare(assessmentKindLabel(b), "fr")),
    [assessments]
  );

  const subjectAverages = useMemo(() => {
    const grouped = new Map<string, AssessmentRecord[]>();
    assessments.forEach((assessment) => {
      const current = grouped.get(assessment.subjectId) ?? [];
      current.push(assessment);
      grouped.set(assessment.subjectId, current);
    });

    return Array.from(grouped, ([subjectId, records]) => {
      const subject = subjects.find((candidate) => candidate.id === subjectId);
      return {
        subjectId,
        subject,
        records,
        average: averageOf(records)
      };
    }).sort((a, b) => subjectName(a.subject).localeCompare(subjectName(b.subject), "fr"));
  }, [assessments, subjects]);

  const generalAverage = useMemo(() => {
    const averages = subjectAverages
      .map((entry) => entry.average)
      .filter((average): average is number => average !== null);
    return averages.length ? averages.reduce((sum, average) => sum + average, 0) / averages.length : null;
  }, [subjectAverages]);

  const failingFundamentalSubjects = useMemo(() => subjectAverages.filter(({ subject, average }) =>
    average !== null &&
    average < 10 &&
    subject?.validation?.toLocaleLowerCase("fr").includes("non compensable")
  ), [subjectAverages]);

  const visibleAssessments = useMemo(
    () => assessments
      .filter((assessment) => subjectFilter === "all" || assessment.subjectId === subjectFilter)
      .filter((assessment) => kindFilter === "all" || assessment.kind === kindFilter)
      .sort((a, b) =>
        b.assessmentDate.localeCompare(a.assessmentDate) ||
        a.title.localeCompare(b.title, "fr")
      ),
    [assessments, kindFilter, subjectFilter]
  );

  const filtersActive = subjectFilter !== "all" || kindFilter !== "all";
  const resetFilters = () => {
    setSubjectFilter("all");
    setKindFilter("all");
  };

  return (
    <main className="page grades-page">
      <header className="page-heading grades-heading">
        <div>
          <p className="eyebrow">Résultats académiques</p>
          <h1>Notes</h1>
          <p className="heading-subtitle">
            {assessments.length} évaluation{assessments.length === 1 ? "" : "s"} enregistrée{assessments.length === 1 ? "" : "s"}.
          </p>
        </div>
        <button className="primary-button" type="button" onClick={onAddAssessment}>
          <Plus /> Ajouter une note
        </button>
      </header>

      <section className="grades-correction-guide" aria-label="Parcours de correction">
        <p><strong>Après l’épreuve</strong><span>Un parcours simple, sans ressaisir le contexte.</span></p>
        <ol>
          <li><span><ScanLine /></span><p><strong>Scannez la copie</strong><small>Toutes les pages, nettes et dans l’ordre</small></p></li>
          <li><span><Bot /></span><p><strong>Corriger ma copie</strong><small>Depuis l’historique IA de l’épreuve</small></p></li>
          <li><span><ClipboardPaste /></span><p><strong>Enregistrez le résultat</strong><small>Note, appréciation et deux PDF</small></p></li>
        </ol>
      </section>

      <section className="grades-overview" aria-label="Synthèse des résultats">
        <article className="grade-summary-card grade-summary-card--average">
          <span className="grade-summary-icon"><Award /></span>
          <span className="grade-summary-copy">
            <small>Moyenne actuelle</small>
            <strong>
              {generalAverage === null ? "—" : averageFormatter.format(generalAverage)}
              <em>/20</em>
            </strong>
            <span>Indicateur · ne valide pas l’année</span>
          </span>
        </article>
        <article className="grade-summary-card">
          <span className="grade-summary-icon grade-summary-icon--blue"><FileCheck2 /></span>
          <span className="grade-summary-copy">
            <small>Évaluations</small>
            <strong>{assessments.length}</strong>
            <span>Sujets corrigés et notés</span>
          </span>
        </article>
        <article className="grade-summary-card">
          <span className="grade-summary-icon grade-summary-icon--green"><GraduationCap /></span>
          <span className="grade-summary-copy">
            <small>Matières évaluées</small>
            <strong>{subjectAverages.length}</strong>
            <span>Avec au moins une note</span>
          </span>
        </article>
      </section>

      {failingFundamentalSubjects.length > 0 && (
        <section className="grade-validation-alert" role="alert">
          <AlertTriangle />
          <span>
            <strong>Validation annuelle non acquise à ce stade</strong>
            <small>
              {failingFundamentalSubjects.map(({ subject }) => subjectName(subject)).join(", ")} :
              {" "}moyenne inférieure à 10/20 dans {failingFundamentalSubjects.length === 1 ? "une matière fondamentale non compensable" : "des matières fondamentales non compensables"}.
            </small>
          </span>
        </section>
      )}

      <section className="surface-card grade-subject-averages" aria-labelledby="subject-averages-title">
        <header className="grade-section-heading">
          <div>
            <p className="eyebrow">Vue par matière</p>
            <h2 id="subject-averages-title">Moyennes par matière</h2>
          </div>
          <span>{subjectAverages.length} matière{subjectAverages.length === 1 ? "" : "s"}</span>
        </header>

        {subjectAverages.length > 0 ? (
          <div className="grade-subject-grid">
            {subjectAverages.map(({ subjectId, subject, records, average }) => {
              const isNonCompensable = subject?.validation?.toLocaleLowerCase("fr").includes("non compensable") ?? false;
              const validationStatus = average === null ? "Non calculable" : average >= 10 ? "Validée" : "À rattraper";
              return <article className="grade-subject-card" key={subjectId}>
                {subject ? (
                  <SubjectIcon subject={subject} size="sm" />
                ) : (
                  <span className="grade-unknown-subject-icon" aria-hidden="true"><BookOpen /></span>
                )}
                <span className="grade-subject-copy">
                  <strong>{subjectName(subject)}</strong>
                  <small>
                    {records.length} évaluation{records.length === 1 ? "" : "s"} · {validationStatus}
                    {isNonCompensable ? " · non compensable" : ""}
                  </small>
                </span>
                <span
                  className={`grade-subject-average grade-score--${scoreTone(average)}`}
                  aria-label={`Moyenne : ${average === null ? "non calculable" : `${averageFormatter.format(average)} sur 20`}`}
                >
                  <strong>{average === null ? "—" : averageFormatter.format(average)}</strong>
                  <small>/20</small>
                </span>
              </article>;
            })}
          </div>
        ) : (
          <div className="grade-inline-empty">
            <GraduationCap />
            <span>Aucune moyenne à calculer pour le moment.</span>
          </div>
        )}
      </section>

      <section className="surface-card grade-records-section" aria-labelledby="grade-records-title">
        <header className="grade-records-toolbar">
          <div className="grade-section-heading-copy">
            <p className="eyebrow">Relevé détaillé</p>
            <h2 id="grade-records-title">Mes évaluations</h2>
            <span aria-live="polite">
              {visibleAssessments.length} résultat{visibleAssessments.length === 1 ? "" : "s"}
            </span>
          </div>
          <div className="grade-filters" aria-label="Filtres des évaluations">
            <span className="grade-filter-icon" aria-hidden="true"><Filter /></span>
            <label className="grade-filter-field">
              <span>Matière</span>
              <select value={subjectFilter} onChange={(event) => setSubjectFilter(event.target.value)}>
                <option value="all">Toutes les matières</option>
                {subjects.map((subject) => (
                  <option value={subject.id} key={subject.id}>{subject.name}</option>
                ))}
              </select>
            </label>
            <label className="grade-filter-field">
              <span>Type</span>
              <select
                value={kindFilter}
                onChange={(event) => setKindFilter(event.target.value as "all" | RecordedAssessmentKind)}
              >
                <option value="all">Tous les types</option>
                {availableKinds.map((kind) => (
                  <option value={kind} key={kind}>{assessmentKindLabel(kind)}</option>
                ))}
              </select>
            </label>
            {filtersActive && (
              <button className="grade-reset-filters" type="button" onClick={resetFilters}>
                <RotateCcw /> Réinitialiser
              </button>
            )}
          </div>
        </header>

        {visibleAssessments.length > 0 ? (
          <div className="grade-record-list">
            {visibleAssessments.map((assessment) => {
              const subject = subjects.find((candidate) => candidate.id === assessment.subjectId);
              const normalized = normalizedScore(assessment);
              const titleId = `assessment-${assessment.id}-title`;
              const blankPdf = assessment.blankPdf;
              const completedPdf = assessment.completedPdf;

              return (
                <article
                  className="grade-record"
                  style={{
                    "--grade-subject-color": subject?.color ?? "#74798e",
                    "--grade-subject-accent": subject?.accent ?? "#f1f2f6"
                  } as React.CSSProperties}
                  aria-labelledby={titleId}
                  key={assessment.id}
                >
                  <span className="grade-record-accent" aria-hidden="true" />
                  <div className="grade-record-main">
                    <header className="grade-record-heading">
                      <div className="grade-record-identity">
                        {subject ? (
                          <SubjectIcon subject={subject} size="sm" />
                        ) : (
                          <span className="grade-unknown-subject-icon" aria-hidden="true"><BookOpen /></span>
                        )}
                        <span>
                          <small>{subjectName(subject)}</small>
                          <strong id={titleId}>{assessment.title}</strong>
                        </span>
                      </div>
                      <span className="grade-record-meta">
                        <em>{assessmentKindLabel(assessment.kind)}</em>
                        <em>Coeff. {scoreFormatter.format(assessment.coefficient ?? 1)}</em>
                        <time dateTime={assessment.assessmentDate}>
                          <CalendarDays /> {displayDate(assessment.assessmentDate)}
                        </time>
                      </span>
                    </header>

                    <div className="grade-record-feedback">
                      <span>
                        <small>Appréciation</small>
                        <p>{assessment.appreciation.trim() || "Aucune appréciation renseignée."}</p>
                      </span>
                      {assessment.personalNote?.trim() && (
                        <aside>
                          <MessageSquareText />
                          <span><small>Note personnelle</small><p>{assessment.personalNote}</p></span>
                        </aside>
                      )}
                    </div>

                    <footer className="grade-record-footer">
                      <div className="grade-document-actions" aria-label={`Documents de ${assessment.title}`}>
                        <button
                          className="grade-document-button"
                          type="button"
                          disabled={!blankPdf}
                          title={blankPdf ? undefined : "Sujet vierge non disponible"}
                          onClick={() => blankPdf && onOpenPdf(assessment, "blank")}
                          aria-label={`Ouvrir le sujet vierge : ${assessment.title}`}
                        >
                          <FileText /> Sujet vierge
                        </button>
                        <button
                          className="grade-document-button grade-document-button--completed"
                          type="button"
                          disabled={!completedPdf}
                          title={completedPdf ? undefined : "Copie remplie non disponible"}
                          onClick={() => completedPdf && onOpenPdf(assessment, "completed")}
                          aria-label={`Ouvrir la copie remplie : ${assessment.title}`}
                        >
                          <FileCheck2 /> Copie remplie
                        </button>
                        {assessment.conversationId && (
                          <button
                            className="grade-conversation-button"
                            type="button"
                            onClick={() => onOpenConversation(assessment.conversationId as string)}
                            aria-label={`Rouvrir la conversation IA : ${assessment.title}`}
                          >
                            <Bot /> Conversation IA
                          </button>
                        )}
                      </div>
                      <div className="grade-management-actions">
                        <button
                          className="icon-button"
                          type="button"
                          onClick={() => onEditAssessment(assessment)}
                          aria-label={`Modifier la note : ${assessment.title}`}
                          title="Modifier"
                        >
                          <Pencil />
                        </button>
                        <button
                          className="icon-button danger-icon"
                          type="button"
                          onClick={() => onDeleteAssessment(assessment)}
                          aria-label={`Supprimer la note : ${assessment.title}`}
                          title="Supprimer"
                        >
                          <Trash2 />
                        </button>
                      </div>
                    </footer>
                  </div>

                  <div
                    className={`grade-record-score grade-score--${scoreTone(normalized)}`}
                    aria-label={`Note : ${scoreFormatter.format(assessment.score)} sur ${scoreFormatter.format(assessment.maxScore)}`}
                  >
                    <span>
                      <strong>{scoreFormatter.format(assessment.score)}</strong>
                      <small>/ {scoreFormatter.format(assessment.maxScore)}</small>
                    </span>
                    {normalized !== null && assessment.maxScore !== 20 && (
                      <em>{averageFormatter.format(normalized)}/20</em>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        ) : assessments.length === 0 ? (
          <div className="grade-empty-state">
            <span className="grade-empty-icon"><Award /></span>
            <h3>Aucune note pour le moment</h3>
            <p>Ajoutez votre première évaluation pour commencer le suivi de vos résultats.</p>
            <button className="primary-button" type="button" onClick={onAddAssessment}>
              <Plus /> Ajouter une note
            </button>
          </div>
        ) : (
          <div className="grade-empty-state grade-empty-state--filtered">
            <span className="grade-empty-icon"><Filter /></span>
            <h3>Aucune évaluation ne correspond</h3>
            <p>Modifiez les filtres de matière ou de type pour afficher d’autres résultats.</p>
            <button className="secondary-button" type="button" onClick={resetFilters}>
              <RotateCcw /> Réinitialiser les filtres
            </button>
          </div>
        )}
      </section>
    </main>
  );
}
