import {
  CalendarDays,
  Download,
  ExternalLink,
  Info,
  LoaderCircle
} from "lucide-react";
import { useMemo, useState } from "react";
import calendarTransferArt from "../assets/generated/calendar-transfer.webp";
import {
  CALENDAR_EXPORT_GROUPS,
  DEFAULT_CALENDAR_EXPORT_SELECTION,
  buildCalendarIcs,
  calendarExportGroup,
  nativeCalendarCompatibilityError,
  selectCalendarEvents,
  type CalendarExportGroup,
  type CalendarExportSelection
} from "../lib/calendarIcs";
import { CALENDAR_TIME_ZONE, formatCalendarDate } from "../lib/date";
import {
  isTauri,
  openCalendarInSystem,
  openGoogleCalendarImport,
  saveCalendarIcs
} from "../lib/tauri";
import type { CalendarEvent, Subject } from "../types";
import { Modal } from "./Modal";

const DEFAULT_CALENDAR_NAME = "Dowze Academie — Année 1";
const DEFAULT_CALENDAR_FILENAME = "Dowze-Academie-Planning-2026-2027.ics";
const GOOGLE_ICS_MAX_BYTES = 1_000_000;

type TransferAction = "system" | "google" | "file";

function calendarRange(events: CalendarEvent[], timeZone = CALENDAR_TIME_ZONE) {
  if (!events.length) return "Aucun événement sélectionné";
  const start = new Date(Math.min(...events.map((event) => new Date(event.start).getTime())));
  const end = new Date(Math.max(...events.map((event) => new Date(event.end).getTime())) - 1);
  const options: Intl.DateTimeFormatOptions = { day: "numeric", month: "long", year: "numeric" };
  return `${formatCalendarDate(start, options, timeZone)} – ${formatCalendarDate(end, options, timeZone)}`;
}

export function CalendarExportModal({
  events,
  subjects,
  onClose,
  calendarName = DEFAULT_CALENDAR_NAME,
  filename = DEFAULT_CALENDAR_FILENAME,
  timeZone = CALENDAR_TIME_ZONE,
  uidNamespace
}: {
  events: CalendarEvent[];
  subjects: Subject[];
  onClose: () => void;
  calendarName?: string;
  filename?: string;
  timeZone?: string;
  uidNamespace?: string;
}) {
  const [selection, setSelection] = useState<CalendarExportSelection>(DEFAULT_CALENDAR_EXPORT_SELECTION);
  const [busy, setBusy] = useState<TransferAction | null>(null);
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const selectedEvents = useMemo(() => selectCalendarEvents(events, selection), [events, selection]);
  const groupCounts = useMemo(() => Object.fromEntries(
    CALENDAR_EXPORT_GROUPS.map((group) => [
      group.id,
      events.reduce((count, event) => count + Number(calendarExportGroup(event) === group.id), 0)
    ])
  ) as Record<CalendarExportGroup, number>, [events]);
  const selectedRange = useMemo(
    () => calendarRange(selectedEvents, timeZone),
    [selectedEvents, timeZone]
  );
  const calendarState = useMemo(
    () => {
      try {
        const calendar = buildCalendarIcs(selectedEvents, subjects, { calendarName, timeZone, uidNamespace });
        return { calendar, error: nativeCalendarCompatibilityError(calendar, calendarName) };
      } catch (error) {
        return {
          calendar: null,
          error: error instanceof Error ? error.message : "Le calendrier ne peut pas être préparé."
        };
      }
    },
    [calendarName, selectedEvents, subjects, timeZone, uidNamespace]
  );
  const calendar = calendarState.calendar;
  const nativeExportError = calendarState.error;
  const googleFileTooLarge = (calendar?.byteLength ?? 0) > GOOGLE_ICS_MAX_BYTES;

  const toggleGroup = (group: CalendarExportGroup) => {
    setSelection((current) => ({ ...current, [group]: !current[group] }));
    setFeedback(null);
  };

  const transfer = async (action: TransferAction) => {
    if (!selectedEvents.length || busy || !calendar || nativeExportError) return;
    const payload = {
      events: calendar.exportedEvents,
      content: calendar.content,
      calendarName,
      filename,
      timeZone,
      uidNamespace
    };
    setBusy(action);
    setFeedback(null);
    try {
      if (action === "system") {
        await openCalendarInSystem(payload);
        setFeedback({
          tone: "success",
          text: isTauri()
            ? `Le fichier a été ouvert avec l’application de calendrier de cet appareil. Choisis le calendrier dans lequel importer « ${calendarName} ».`
            : "Le fichier .ics a été téléchargé. Ouvre-le avec ton application de calendrier."
        });
      } else if (action === "google") {
        if (googleFileTooLarge) {
          throw new Error("Google limite l’import à 1 Mo. Désactive une partie du planning avant de continuer.");
        }
        const savedPath = await saveCalendarIcs(payload);
        if (!savedPath) return;
        await openGoogleCalendarImport();
        setFeedback({
          tone: "success",
          text: "Le fichier est prêt. Dans Google Calendar, clique sur « Sélectionner un fichier sur votre ordinateur », puis choisis ce fichier."
        });
      } else {
        const savedPath = await saveCalendarIcs(payload);
        if (!savedPath) return;
        setFeedback({ tone: "success", text: "Le fichier calendrier .ics a bien été enregistré." });
      }
    } catch (error) {
      setFeedback({
        tone: "error",
        text: error instanceof Error ? error.message : "Impossible d’exporter le calendrier."
      });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal
      title="Envoyer le planning"
      subtitle="Calendrier de l’appareil, Google Calendar ou fichier iCalendar universel"
      onClose={busy ? () => undefined : onClose}
      size="lg"
    >
      <div className="calendar-export-modal">
        <section className="calendar-export-summary" aria-label="Résumé de l’export">
          <span className="calendar-export-summary-art" aria-hidden="true">
            <img
              src={calendarTransferArt}
              alt=""
              width="420"
              height="420"
              loading="lazy"
              decoding="async"
              draggable={false}
            />
          </span>
          <div>
            <strong>{selectedEvents.length} événement{selectedEvents.length === 1 ? "" : "s"}</strong>
            <small>{selectedRange} · {Math.ceil((calendar?.byteLength ?? 0) / 1024)} Ko</small>
          </div>
          <em>{timeZone}</em>
        </section>

        <fieldset className="calendar-export-groups">
          <legend>Contenu à envoyer</legend>
          <div>
            {CALENDAR_EXPORT_GROUPS.map((group) => {
              const count = groupCounts[group.id];
              return (
                <label key={group.id} className={selection[group.id] ? "is-selected" : ""}>
                  <input
                    type="checkbox"
                    checked={selection[group.id]}
                    onChange={() => toggleGroup(group.id)}
                  />
                  <span>
                    <strong>{group.label}</strong>
                    <small>{group.description}</small>
                  </span>
                  <em>{count}</em>
                </label>
              );
            })}
          </div>
        </fieldset>

        <div className="calendar-export-providers">
          <article className="calendar-export-provider calendar-export-provider--apple">
            <span className="calendar-export-provider-logo"><CalendarDays /></span>
            <div>
              <strong>Calendrier de l’appareil</strong>
              <p>Ouvre le fichier directement dans ton application de calendrier par défaut.</p>
            </div>
            <button
              className="primary-button"
              disabled={!selectedEvents.length || busy !== null || Boolean(nativeExportError)}
              onClick={() => void transfer("system")}
            >
              {busy === "system" ? <LoaderCircle className="is-spinning" /> : <CalendarDays />}
              {isTauri() ? "Ouvrir dans Calendrier" : "Télécharger .ics"}
            </button>
          </article>

          <article className="calendar-export-provider calendar-export-provider--google">
            <span className="calendar-export-provider-logo calendar-export-provider-logo--google">G</span>
            <div>
              <strong>Google Calendar</strong>
              <p>Enregistre le fichier, puis ouvre directement la rubrique officielle « Importer et exporter ».</p>
            </div>
            <button
              className="primary-button"
              disabled={!selectedEvents.length || busy !== null || googleFileTooLarge || Boolean(nativeExportError)}
              onClick={() => void transfer("google")}
            >
              {busy === "google" ? <LoaderCircle className="is-spinning" /> : <ExternalLink />}
              Enregistrer puis ouvrir Google
            </button>
          </article>
        </div>

        <aside className="calendar-export-information">
          <Info />
          <p>
            <strong>Import ponctuel.</strong> Une fois ajoutés, les événements suivent la synchronisation de ton
            compte Apple ou Google. Si tu modifies ensuite le planning dans Dowze Academie, exporte-le à nouveau.
            Utilise un calendrier séparé nommé « {calendarName} » pour pouvoir le remplacer sans doublons.
          </p>
        </aside>

        {nativeExportError && (
          <p className="calendar-export-warning" role="alert">
            {nativeExportError}
          </p>
        )}
        {calendar && !nativeExportError && calendar.skippedEventIds.length > 0 && (
          <p className="calendar-export-warning" role="alert">
            {calendar.skippedEventIds.length} événement{calendar.skippedEventIds.length === 1 ? "" : "s"} invalide{calendar.skippedEventIds.length === 1 ? "" : "s"} ignoré{calendar.skippedEventIds.length === 1 ? "" : "s"}.
          </p>
        )}
        {feedback && (
          <p className={`calendar-export-feedback is-${feedback.tone}`} role={feedback.tone === "error" ? "alert" : "status"}>
            {feedback.text}
          </p>
        )}

        <div className="calendar-export-actions">
          <span>Format RFC 5545 compatible Apple et Google</span>
          <button className="secondary-button" onClick={onClose} disabled={busy !== null}>Fermer</button>
          <button
            className="secondary-button"
            onClick={() => void transfer("file")}
            disabled={!selectedEvents.length || busy !== null || Boolean(nativeExportError)}
          >
            {busy === "file" ? <LoaderCircle className="is-spinning" /> : <Download />}
            Enregistrer le fichier .ics
          </button>
        </div>
      </div>
    </Modal>
  );
}
