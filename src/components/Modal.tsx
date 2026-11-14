import { useDialogFocus } from "../hooks/useDialogFocus";
import { AlertTriangle, Bot, CalendarDays, FileText, Link2, Plus, RotateCcw, Sparkles, Trash2, X } from "lucide-react";
import { FormEvent, ReactNode, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  buildPaperAssessmentPrompt,
  PAPER_ASSESSMENT_KIND_OPTIONS,
  candidateSubjectsForAssessment,
  defaultChapterIdsForAssessment,
  defaultPaperAssessmentDuration,
  inferPaperAssessmentKind
} from "../lib/assessment";
import {
  aiPromptByteLength,
  NATIVE_AI_PROMPT_MAX_BYTES
} from "../lib/aiSessionContract";
import {
  buildCalendarIcs,
  nativeCalendarCompatibilityError
} from "../lib/calendarIcs";
import {
  addCalendarDays,
  dateAtTimeZone,
  dateFromTimeZoneInput,
  dateKeyAtTimeZone,
  dateTimeInputValueAtTimeZone
} from "../lib/zonedDate";
import { providerHome, providerLabel } from "../lib/tauri";
import type {
  AiProvider,
  CalendarEvent,
  Conversation,
  PaperAssessmentConfig,
  PaperAssessmentKind,
  Subject,
  TaskItem
} from "../types";
import type { FormationManifest } from "../lib/formations";
import "../dialogs-redesign.css";

export function Modal({ title, subtitle, children, onClose, size = "md" }: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onClose: () => void;
  size?: "sm" | "md" | "lg";
}) {
  const dialogRef = useRef<HTMLElement>(null);
  const titleId = useId();
  const subtitleId = useId();

  useDialogFocus(dialogRef, onClose);

  const content = (
    <div
      className="modal-backdrop modal-backdrop--workspace"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        ref={dialogRef}
        className={`modal-card modal-card--${size}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={subtitle ? subtitleId : undefined}
        tabIndex={-1}
      >
        <header>
          <div>
            <h2 id={titleId}>{title}</h2>
            {subtitle && <p id={subtitleId}>{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label={`Fermer « ${title} »`}><X aria-hidden="true" /></button>
        </header>
        <div className="dialog-content">{children}</div>
      </section>
    </div>
  );

  const workspaceModalRoot = document.getElementById("workspace-modal-root");
  if (workspaceModalRoot) return createPortal(content, workspaceModalRoot);

  return content;
}

export function EventEditor({ event, date, subjects, onSave, onDelete, onGeneratePaper, onClose, timeZone = "Europe/Zurich" }: {
  event?: CalendarEvent;
  date: Date;
  subjects: Subject[];
  onSave: (event: CalendarEvent) => void;
  onDelete?: (id: string) => void;
  onGeneratePaper?: (event: CalendarEvent) => void;
  onClose: () => void;
  timeZone?: string;
}) {
  const initialStart = event
    ? dateTimeInputValueAtTimeZone(new Date(event.start), timeZone)
    : `${dateTimeInputValueAtTimeZone(date, timeZone).slice(0, 13)}:00`;
  const initialEnd = event
    ? dateTimeInputValueAtTimeZone(new Date(event.end), timeZone)
    : dateTimeInputValueAtTimeZone(
        new Date(dateFromTimeZoneInput(initialStart, timeZone).getTime() + 60 * 60_000),
        timeZone
      );
  const [title, setTitle] = useState(event?.title ?? "");
  const [start, setStart] = useState(initialStart);
  const [end, setEnd] = useState(initialEnd);
  const [allDay, setAllDay] = useState(Boolean(event?.allDay));
  const [allDayStart, setAllDayStart] = useState(() => event?.allDay
    ? dateKeyAtTimeZone(new Date(event.start), timeZone)
    : initialStart.slice(0, 10));
  const [allDayEnd, setAllDayEnd] = useState(() => event?.allDay
    ? dateKeyAtTimeZone(new Date(new Date(event.end).getTime() - 1), timeZone)
    : initialEnd.slice(0, 10));
  const [subjectId, setSubjectId] = useState(event?.subjectId ?? "");
  const [location, setLocation] = useState(event?.location ?? "");
  const [description, setDescription] = useState(event?.description ?? "");
  const [type, setType] = useState<CalendarEvent["type"]>(event?.type ?? "course");
  const [formError, setFormError] = useState<string | null>(null);
  const selectedSubject = subjects.find((subject) => subject.id === subjectId);
  const assessmentWillBeRemoved = Boolean(
    event?.assessment && (type !== "exam" || subjectId !== (event.subjectId ?? ""))
  );
  const buildEvent = () => {
    const normalizedTitle = title.trim();
    const normalizedLocation = location.trim();
    const normalizedDescription = description.trim();
    if (!normalizedTitle) {
      setFormError("Ajoute un titre à l’événement.");
      return null;
    }
    const encoder = new TextEncoder();
    if (encoder.encode(normalizedTitle).length > 500) {
      setFormError("Le titre est trop long pour être exporté vers un agenda (500 octets maximum).");
      return null;
    }
    if (encoder.encode(normalizedLocation).length > 1_000) {
      setFormError("Le lieu est trop long pour être exporté vers un agenda (1 000 octets maximum).");
      return null;
    }
    if (encoder.encode(normalizedDescription).length > 12_000) {
      setFormError("La note est trop longue pour être exportée vers un agenda (12 000 octets maximum).");
      return null;
    }
    let startDate: Date;
    let endDate: Date;
    try {
      if (allDay) {
        if (allDayEnd < allDayStart) {
          setFormError("La date de fin doit être égale ou postérieure à la date de début.");
          return null;
        }
        startDate = dateAtTimeZone(allDayStart, 0, 0, timeZone);
        endDate = dateAtTimeZone(addCalendarDays(allDayEnd, 1), 0, 0, timeZone);
      } else {
        startDate = dateFromTimeZoneInput(start, timeZone);
        endDate = dateFromTimeZoneInput(end, timeZone);
        if (endDate <= startDate) {
          setFormError("L’heure de fin doit être postérieure à l’heure de début.");
          return null;
        }
      }
      if (endDate.getTime() - startDate.getTime() > 3_660 * 24 * 60 * 60_000) {
        setFormError("Un événement ne peut pas couvrir plus de dix ans.");
        return null;
      }
      if (startDate.getUTCFullYear() < 1900 || endDate.getUTCFullYear() > 2101) {
        setFormError("Les instants UTC doivent rester compris entre 1900 et 2101 pour être conservés après redémarrage.");
        return null;
      }
    } catch {
      setFormError("Vérifie les dates et les heures saisies.");
      return null;
    }
    const id = event?.id ?? crypto.randomUUID();
    let retainedAssessment: PaperAssessmentConfig | undefined;
    if (event?.assessment && !assessmentWillBeRemoved) {
      let durationMinutes = event.assessment.durationMinutes;
      if (!allDay) {
        durationMinutes = (endDate.getTime() - startDate.getTime()) / 60_000;
        if (!Number.isInteger(durationMinutes) || durationMinutes < 10 || durationMinutes > 360) {
          setFormError("Une épreuve préparée pour les PDF doit durer entre 10 et 360 minutes entières.");
          return null;
        }
      }
      retainedAssessment = {
        ...event.assessment,
        eventId: id,
        title: normalizedTitle,
        scheduledAt: startDate.toISOString(),
        durationMinutes
      };
      const descriptionChanged = normalizedDescription !== (event.description?.trim() ?? "");
      if (descriptionChanged) {
        if (normalizedDescription) retainedAssessment.instructions = normalizedDescription;
        else delete retainedAssessment.instructions;
      }
    }
    const nextEvent = {
      id,
      title: normalizedTitle,
      subjectId: subjectId || undefined,
      start: startDate.toISOString(),
      end: endDate.toISOString(),
      location: normalizedLocation || undefined,
      description: normalizedDescription || undefined,
      allDay,
      type,
      color: selectedSubject?.color ?? event?.color ?? "#5c6ce5",
      ...(retainedAssessment ? { assessment: retainedAssessment } : {})
    } satisfies CalendarEvent;
    const calendar = buildCalendarIcs([nextEvent], subjects, { timeZone });
    const calendarError = nativeCalendarCompatibilityError(calendar, "Dowze Academie — Année 1");
    if (calendarError) {
      setFormError(calendarError);
      return null;
    }
    setFormError(null);
    return nextEvent;
  };
  const submit = (formEvent: FormEvent) => {
    formEvent.preventDefault();
    const nextEvent = buildEvent();
    if (nextEvent) onSave(nextEvent);
  };
  return (
    <Modal title={event ? "Modifier l’événement" : "Nouvel événement"} subtitle="Ajoutez-le à votre planning" onClose={onClose}>
      <form className="modal-form" onSubmit={submit}>
        <label className="form-field"><span>Titre</span><input autoFocus maxLength={500} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex. Révision du chapitre 3" required /></label>
        <label className="form-check-row">
          <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
          <span>Toute la journée</span>
        </label>
        {allDay ? (
          <div className="form-row">
            <label className="form-field"><span>Début</span><input type="date" min="1900-01-01" max="2100-12-31" value={allDayStart} onChange={(e) => setAllDayStart(e.target.value)} required /></label>
            <label className="form-field"><span>Fin incluse</span><input type="date" min={allDayStart || "1900-01-01"} max="2100-12-31" value={allDayEnd} onChange={(e) => setAllDayEnd(e.target.value)} required /></label>
          </div>
        ) : (
          <div className="form-row">
            <label className="form-field"><span>Début</span><input type="datetime-local" min="1900-01-01T00:00" max="2100-12-31T23:59" value={start} onChange={(e) => setStart(e.target.value)} required /></label>
            <label className="form-field"><span>Fin</span><input type="datetime-local" min={start || "1900-01-01T00:00"} max="2100-12-31T23:59" value={end} onChange={(e) => setEnd(e.target.value)} required /></label>
          </div>
        )}
        <div className="form-row">
          <label className="form-field"><span>Matière</span><select value={subjectId} onChange={(e) => setSubjectId(e.target.value)}><option value="">Aucune</option>{subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select></label>
          <label className="form-field"><span>Type</span><select value={type} onChange={(e) => setType(e.target.value as CalendarEvent["type"])}><option value="course">Cours</option><option value="study">Révision</option><option value="exam">Examen</option><option value="milestone">Jalon</option><option value="break">Vacances / congé</option><option value="personal">Personnel</option></select></label>
        </div>
        <label className="form-field"><span>Lieu</span><input maxLength={1000} value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Salle ou adresse" /></label>
        <label className="form-field"><span>Note</span><textarea maxLength={12000} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Consignes ou informations utiles" rows={3} /></label>
        {assessmentWillBeRemoved && (
          <p className="form-validation-error" role="status">
            Changer la matière ou le type retirera la préparation PDF existante. Tu pourras en créer une nouvelle depuis cet événement.
          </p>
        )}
        {formError && <p className="form-validation-error" role="alert">{formError}</p>}
        {type === "exam" && onGeneratePaper && (
          <div className="paper-exam-callout">
            <FileText aria-hidden="true" />
            <p>
              <strong>Épreuve écrite sur papier</strong>
              <span>L’IA générera un sujet PDF A4 sans réponses et un corrigé PDF séparé.</span>
            </p>
            <button type="button" onClick={() => {
              const nextEvent = buildEvent();
              if (nextEvent) onGeneratePaper(nextEvent);
            }}>
              <Sparkles aria-hidden="true" /> Préparer les PDF
            </button>
          </div>
        )}
        <div className="modal-actions">
          {event && onDelete && <button type="button" className="delete-button" onClick={() => onDelete(event.id)}><Trash2 aria-hidden="true" /> Supprimer</button>}
          <span />
          <button type="button" className="secondary-button" onClick={onClose}>Annuler</button>
          <button className="primary-button"><CalendarDays aria-hidden="true" /> {event ? "Enregistrer" : "Ajouter"}</button>
        </div>
      </form>
    </Modal>
  );
}

export function PaperAssessmentEditor({ event, subjects, onGenerate, onEditEvent, onClose, timeZone = "Europe/Zurich", formation, legacyEnergyYear1 }: {
  event: CalendarEvent;
  subjects: Subject[];
  onGenerate: (subject: Subject, config: PaperAssessmentConfig) => void;
  onEditEvent: () => void;
  onClose: () => void;
  timeZone?: string;
  formation?: FormationManifest;
  legacyEnergyYear1?: boolean;
}) {
  const suggestedSubjects = candidateSubjectsForAssessment(
    event,
    subjects,
    formation,
    legacyEnergyYear1
  );
  const plannedAssessment = event.assessment;
  const plannedSubject = plannedAssessment
    ? subjects.find((subject) => plannedAssessment.chapterIds.every((chapterId) =>
        subject.modules.some((courseModule) =>
          courseModule.items.some((item) => item.id === chapterId)
        )
      ))
    : undefined;
  const initialSubject = plannedSubject ?? suggestedSubjects[0] ?? subjects[0];
  const inferredKind = plannedAssessment?.kind ?? inferPaperAssessmentKind(event.title);
  const [subjectId, setSubjectId] = useState(initialSubject?.id ?? "");
  const [kind, setKind] = useState<PaperAssessmentKind>(inferredKind);
  const [durationMinutes, setDurationMinutes] = useState(
    plannedAssessment?.durationMinutes ?? defaultPaperAssessmentDuration(inferredKind)
  );
  const [allowedMaterials, setAllowedMaterials] = useState(
    plannedAssessment?.allowedMaterials ??
      "Aucun matériel"
  );
  const [instructions, setInstructions] = useState(
    plannedAssessment ? plannedAssessment.instructions ?? "" : event.description ?? ""
  );
  const [chapterIds, setChapterIds] = useState<string[]>(
    initialSubject
      ? plannedAssessment?.chapterIds.length
        ? plannedAssessment.chapterIds.filter((id) =>
            initialSubject.modules.some((courseModule) =>
              courseModule.items.some((item) => item.id === id)
            )
          )
        : defaultChapterIdsForAssessment(event, initialSubject, timeZone, formation?.academicYear)
      : []
  );
  const selectedSubject = subjects.find((subject) => subject.id === subjectId);
  const allChapters = selectedSubject?.modules.flatMap((courseModule) => courseModule.items) ?? [];
  const selectedSet = new Set(chapterIds);
  const selectedChapters = allChapters.filter((item) => selectedSet.has(item.id));
  const selectedCourseCount = selectedChapters.reduce(
    (total, item) => total + Math.max(1, item.lessons?.length ?? 0),
    0
  );
  const validDuration = Number.isInteger(durationMinutes) && durationMinutes >= 10 && durationMinutes <= 360;
  const draftConfig = (): PaperAssessmentConfig => ({
    eventId: event.id,
    kind,
    title: event.title,
    scheduledAt: event.start,
    durationMinutes,
    chapterIds,
    allowedMaterials: allowedMaterials.trim() || "Aucun matériel",
    instructions: instructions.trim() || undefined
  });
  const promptBytes = selectedSubject && chapterIds.length && validDuration
    ? aiPromptByteLength(buildPaperAssessmentPrompt(selectedSubject, draftConfig(), formation))
    : 0;
  const promptTooLarge = promptBytes > NATIVE_AI_PROMPT_MAX_BYTES;

  const changeSubject = (nextSubjectId: string) => {
    setSubjectId(nextSubjectId);
    const nextSubject = subjects.find((subject) => subject.id === nextSubjectId);
    setChapterIds(nextSubject
      ? defaultChapterIdsForAssessment(event, nextSubject, timeZone, formation?.academicYear)
      : []);
  };

  const changeKind = (nextKind: PaperAssessmentKind) => {
    setKind(nextKind);
    setDurationMinutes(defaultPaperAssessmentDuration(nextKind));
  };

  const submit = (formEvent: FormEvent) => {
    formEvent.preventDefault();
    if (!selectedSubject || !chapterIds.length || !validDuration || promptTooLarge) return;
    onGenerate(selectedSubject, draftConfig());
  };

  return (
    <Modal
      title="Générer l’épreuve papier"
      subtitle={event.title}
      onClose={onClose}
      size="lg"
    >
      <form className="modal-form paper-assessment-form" onSubmit={submit}>
        <div className="paper-assessment-intro">
          <FileText aria-hidden="true" />
          <p>
            <strong>Deux documents réellement imprimables</strong>
            <span>Le sujet élève restera sans réponses. Le barème et les solutions seront placés dans un second PDF réservé à la correction.</span>
          </p>
        </div>

        <div className="form-row">
          <label className="form-field">
            <span>Matière</span>
            <select value={subjectId} onChange={(event) => changeSubject(event.target.value)} required>
              {subjects.map((subject) => (
                <option value={subject.id} key={subject.id}>{subject.name}</option>
              ))}
            </select>
          </label>
          <label className="form-field">
            <span>Nature de l’épreuve</span>
            <select value={kind} onChange={(event) => changeKind(event.target.value as PaperAssessmentKind)}>
              {PAPER_ASSESSMENT_KIND_OPTIONS.map((option) => (
                <option value={option.value} key={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="form-row">
          <label className="form-field">
            <span>Durée réelle <em>10 à 360 minutes</em></span>
            <input
              type="number"
              min={10}
              max={360}
              step={5}
              value={durationMinutes}
              onChange={(event) => setDurationMinutes(Number(event.target.value))}
              required
            />
          </label>
          <label className="form-field">
            <span>Matériel autorisé</span>
            <input maxLength={2000} value={allowedMaterials} onChange={(event) => setAllowedMaterials(event.target.value)} required />
          </label>
        </div>

        <fieldset className="paper-scope-field">
          <legend>
            <span>
              <strong>Programme évalué</strong>
              <small>{selectedChapters.length} chapitre{selectedChapters.length > 1 ? "s" : ""} · {selectedCourseCount} cours</small>
            </span>
            <span>
              <button type="button" onClick={() => setChapterIds(allChapters.map((item) => item.id))}>Tout sélectionner</button>
              <button type="button" onClick={() => setChapterIds([])}>Tout retirer</button>
            </span>
          </legend>
          <div className="paper-scope-list">
            {selectedSubject?.modules.map((courseModule) => (
              <section key={courseModule.id}>
                <header><strong>{courseModule.title}</strong><small>{courseModule.period}</small></header>
                {courseModule.items.map((item) => (
                  <label key={item.id}>
                    <input
                      type="checkbox"
                      checked={selectedSet.has(item.id)}
                      onChange={() => setChapterIds((current) => current.includes(item.id)
                        ? current.filter((id) => id !== item.id)
                        : [...current, item.id]
                      )}
                    />
                    <span><strong>{item.title}</strong><small>{item.lessons?.length ?? 1} cours</small></span>
                  </label>
                ))}
              </section>
            ))}
          </div>
          {!chapterIds.length && <p className="paper-scope-error">Sélectionne au moins un chapitre.</p>}
        </fieldset>

        {promptTooLarge && (
          <p className="form-validation-error" role="alert">
            Cette sélection produit {promptBytes.toLocaleString("fr-CH")} octets de contexte IA, au-delà de la limite de {NATIVE_AI_PROMPT_MAX_BYTES.toLocaleString("fr-CH")}. Sélectionne moins de chapitres.
          </p>
        )}

        <label className="form-field">
          <span>Consignes particulières <em>facultatif</em></span>
          <textarea
            maxLength={4000}
            value={instructions}
            onChange={(event) => setInstructions(event.target.value)}
            placeholder="Ex. privilégier la modélisation, inclure un formulaire en annexe…"
            rows={3}
          />
        </label>

        <p className="paper-provider-note">
          Chaque matière est générée séparément. Pour un événement regroupant plusieurs matières, rouvre-le ensuite et choisis la matière suivante.
        </p>

        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onEditEvent}><CalendarDays aria-hidden="true" /> Modifier l’événement</button>
          <span />
          <button type="button" className="secondary-button" onClick={onClose}>Annuler</button>
          <button className="primary-button" disabled={!selectedSubject || !chapterIds.length || !validDuration || promptTooLarge}>
            <Sparkles aria-hidden="true" /> Générer les deux PDF
          </button>
        </div>
      </form>
    </Modal>
  );
}

const subjectColors = ["#5c6ce5", "#169c83", "#d98932", "#9a63d8", "#e35f70", "#2f86cf"];
const subjectColorNames: Record<string, string> = { "#5c6ce5": "Indigo", "#169c83": "Vert", "#d98932": "Orange", "#9a63d8": "Violet", "#e35f70": "Rose", "#2f86cf": "Bleu" };

export function SubjectEditor({ onSave, onClose }: { onSave: (subject: Subject) => void; onClose: () => void }) {
  const [name, setName] = useState("");
  const [teacher, setTeacher] = useState("");
  const [room, setRoom] = useState("");
  const [color, setColor] = useState(subjectColors[0]);
  const [formError, setFormError] = useState<string | null>(null);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) {
      setFormError("Saisis un nom de matière.");
      return;
    }
    const id = `${name.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-")}-${Date.now()}`;
    onSave({ id, name: name.trim(), shortName: name.trim(), teacher: teacher.trim() || "Enseignant à préciser", room: room.trim() || "Salle à préciser", color, accent: `${color}18`, icon: "book", modules: [] });
  };
  return (
    <Modal title="Ajouter une matière" subtitle="Créez un espace personnalisé pour ses notes et conversations." onClose={onClose}>
      <form className="modal-form" onSubmit={submit}>
        <label className="form-field"><span>Nom de la matière</span><input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex. Philosophie" required /></label>
        {formError && <p className="form-validation-error" role="alert">{formError}</p>}
        <div className="form-row"><label className="form-field"><span>Enseignant</span><input value={teacher} onChange={(e) => setTeacher(e.target.value)} placeholder="Mme Dupont" /></label><label className="form-field"><span>Salle</span><input value={room} onChange={(e) => setRoom(e.target.value)} placeholder="A101" /></label></div>
        <fieldset className="color-field"><legend>Couleur</legend><div>{subjectColors.map((item) => <button type="button" key={item} className={color === item ? "is-active" : ""} style={{ background: item }} onClick={() => setColor(item)} aria-label={`Choisir ${subjectColorNames[item]}`} aria-pressed={color === item}>{color === item && <CheckIcon />}</button>)}</div></fieldset>
        <div className="modal-actions"><span /><button type="button" className="secondary-button" onClick={onClose}>Annuler</button><button className="primary-button"><Plus aria-hidden="true" /> Ajouter</button></div>
      </form>
    </Modal>
  );
}

function CheckIcon() { return <span className="color-check">✓</span>; }

export function ConversationEditor({ conversation, onSave, onClose }: { conversation: Conversation; onSave: (conversation: Conversation) => void; onClose: () => void }) {
  const [name, setName] = useState(conversation.name ?? "");
  const [note, setNote] = useState(conversation.note ?? "");
  return (
    <Modal title="Détails de la conversation" subtitle="Un nom et une note pour retrouver facilement cet échange." onClose={onClose}>
      <form className="modal-form" onSubmit={(event) => { event.preventDefault(); onSave({ ...conversation, name: name.trim() || undefined, note: note.trim() || undefined }); }}>
        <label className="form-field"><span>Nom personnalisé <em>facultatif</em></span><input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex. Révisions sur les suites" /></label>
        <label className="form-field"><span>Note <em>facultative</em></span><textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ce que vous voulez retrouver rapidement…" rows={5} /></label>
        {conversation.provider === "freechat" ? (
          <div className="association-callout"><Bot aria-hidden="true" /><p><strong>Chat libre</strong><span>Conversation enregistrée localement dans Dowze Academie, sans lien externe.</span></p></div>
        ) : (
          <label className="form-field"><span>Lien enregistré</span><div className="readonly-link"><Link2 aria-hidden="true" /><input value={conversation.url} readOnly /></div></label>
        )}
        <div className="modal-actions"><span /><button type="button" className="secondary-button" onClick={onClose}>Annuler</button><button className="primary-button">Enregistrer</button></div>
      </form>
    </Modal>
  );
}

export function LinkConversationEditor({ subject, provider, initialUrl, onSave, onClose }: { subject: Subject; provider: AiProvider; initialUrl?: string; onSave: (url: string) => void; onClose: () => void }) {
  const [url, setUrl] = useState(initialUrl ?? "");
  return (
    <Modal title="Associer une conversation" subtitle={`Elle sera classée dans ${subject.name}.`} onClose={onClose}>
      <form className="modal-form" onSubmit={(event) => { event.preventDefault(); onSave(url.trim()); }}>
        <div className="association-callout"><Bot aria-hidden="true" /><p><strong>{providerLabel(provider)}</strong><span>Collez le lien complet de la conversation, du notebook, de la recherche ou de la vidéo ouverte.</span></p></div>
        <label className="form-field"><span>Lien à conserver</span><input autoFocus type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder={`${providerHome(provider)}…`} required /></label>
        <div className="modal-actions"><span /><button type="button" className="secondary-button" onClick={onClose}>Annuler</button><button className="primary-button"><Link2 aria-hidden="true" /> Associer</button></div>
      </form>
    </Modal>
  );
}

export function TaskEditor({ task, subjects, onSave, onClose, timeZone = "Europe/Zurich" }: { task?: TaskItem; subjects: Subject[]; onSave: (task: TaskItem) => void; onClose: () => void; timeZone?: string }) {
  const [title, setTitle] = useState(task?.title ?? "");
  const defaultDueAt = dateAtTimeZone(
    addCalendarDays(dateKeyAtTimeZone(new Date(), timeZone), 1),
    18,
    0,
    timeZone
  );
  const [dueAt, setDueAt] = useState(
    dateTimeInputValueAtTimeZone(task ? new Date(task.dueAt) : defaultDueAt, timeZone)
  );
  const [subjectId, setSubjectId] = useState(task?.subjectId ?? "");
  const [priority, setPriority] = useState<TaskItem["priority"]>(task?.priority ?? "medium");
  const [formError, setFormError] = useState<string | null>(null);
  const submitTask = (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim()) {
      setFormError("Décris la tâche à accomplir.");
      return;
    }
    let dueDate: Date;
    try {
      dueDate = dateFromTimeZoneInput(dueAt, timeZone);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Échéance invalide.");
      return;
    }
    setFormError(null);
    onSave({
      id: task?.id ?? crypto.randomUUID(),
      title: title.trim(),
      dueAt: dueDate.toISOString(),
      subjectId: subjectId || undefined,
      completed: task?.completed ?? false,
      completedAt: task?.completedAt,
      priority
    });
  };
  return (
    <Modal title={task ? "Modifier la tâche" : "Nouvelle tâche"} subtitle="Ajoutez un objectif clair et daté." onClose={onClose} size="sm">
      <form className="modal-form" onSubmit={submitTask}>
        <label className="form-field"><span>Tâche</span><input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ce que je dois faire…" required /></label>
        {formError && <p className="form-validation-error" role="alert">{formError}</p>}
        <label className="form-field"><span>Échéance</span><input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} required /></label>
        <div className="form-row"><label className="form-field"><span>Matière</span><select value={subjectId} onChange={(e) => setSubjectId(e.target.value)}><option value="">Aucune</option>{subjects.map((subject) => <option value={subject.id} key={subject.id}>{subject.name}</option>)}</select></label><label className="form-field"><span>Priorité</span><select value={priority} onChange={(e) => setPriority(e.target.value as TaskItem["priority"])}><option value="low">Basse</option><option value="medium">Normale</option><option value="high">Haute</option></select></label></div>
        <div className="modal-actions"><span /><button type="button" className="secondary-button" onClick={onClose}>Annuler</button><button className="primary-button"><Plus aria-hidden="true" /> {task ? "Enregistrer" : "Ajouter"}</button></div>
      </form>
    </Modal>
  );
}

export function ConfirmDialog({ title, detail, onConfirm, onClose, confirmLabel = "Supprimer", destructive = true }: { title: string; detail: string; onConfirm: () => void | Promise<void>; onClose: () => void; confirmLabel?: string; destructive?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirm = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "L’action n’a pas abouti. Réessayez.");
    } finally {
      setBusy(false);
    }
  };
  return <Modal title={title} onClose={busy ? () => undefined : onClose} size="sm"><div className="confirm-content"><span><AlertTriangle aria-hidden="true" /></span><p>{detail}</p></div>{error && <p className="form-validation-error" role="alert">{error}</p>}<div className="modal-actions confirm-actions"><span /><button className="secondary-button" onClick={onClose} disabled={busy}>Annuler</button><button className={destructive ? "delete-button solid" : "primary-button"} onClick={() => void confirm()} disabled={busy}>{destructive ? <Trash2 aria-hidden="true" /> : <RotateCcw aria-hidden="true" />} {busy ? "Traitement…" : confirmLabel}</button></div></Modal>;
}
