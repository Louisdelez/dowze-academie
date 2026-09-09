import {
  BookOpen,
  Bot,
  CalendarDays,
  Check,
  ClipboardCheck,
  ChevronDown,
  ChevronRight,
  Clock3,
  Copy,
  ExternalLink,
  FileText,
  Gauge,
  History,
  Languages,
  MessageSquarePlus,
  NotebookTabs,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Play,
  Plus,
  Search,
  ScanLine,
  ShieldCheck,
  Sparkles,
  Target,
  Trash2
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { useEffect, useMemo, useState } from "react";
import aiProfessorArt from "../assets/generated/ai-professor.webp";
import { ENGLISH_LEVEL_OPTIONS } from "../data/englishCurriculum";
import { providerLabel } from "../lib/tauri";
import type {
  AiProvider,
  CefrLevel,
  Conversation,
  LessonMode,
  Subject,
  SubjectNoteDocument
} from "../types";
import { Modal } from "./Modal";
import { SubjectIcon } from "./SubjectIcon";

function providerMark(provider: Conversation["provider"]) {
  switch (provider) {
    case "chatgpt": return "GPT";
    case "claude": return "CL";
    case "gemini": return "GE";
    case "mistral": return "MI";
    case "deepseek": return "DS";
    case "kimi": return "KI";
    case "freechat": return "FL";
    case "duolingo": return "DU";
    case "khanacademy": return "KA";
    case "youtube": return "YT";
    case "tiktok": return "TK";
    case "notebooklm": return "NB";
  }
}

function historySessionLabel(conversation: Conversation) {
  if (conversation.provider === "duolingo") return "Pratique Duolingo";
  if (conversation.provider === "khanacademy") return "Ressource Khan Academy";
  if (conversation.provider === "youtube") return "Recherche YouTube";
  if (conversation.provider === "tiktok") return "Recherche TikTok";
  if (conversation.provider === "notebooklm") return "NotebookLM";
  const mode = conversation.lessonMode ?? "course";
  return mode === "paper-assessment" ? "Évaluation PDF"
    : mode === "chapter-test" ? "Mini-test PDF"
      : mode === "exercises" ? "Exercices IA"
        : "Cours IA";
}

interface CoursesPageProps {
  subjects: Subject[];
  conversations: Conversation[];
  notes: readonly SubjectNoteDocument[];
  sidebarStorageKey: string;
  provider: AiProvider;
  selectedSubjectId: string | null;
  pendingSubjectId: string | null;
  onSelectSubject: (id: string) => void;
  onSelectEnglishLevel: (level: CefrLevel) => void;
  onAddSubject: () => void;
  onToggleProgramItem: (subjectId: string, moduleId: string, itemId: string) => void;
  onToggleLessonUnit: (subjectId: string, moduleId: string, itemId: string, lessonUnitId: string) => void;
  onStartAi: (subjectId: string) => void;
  onStartSubjectLesson: (subjectId: string) => void;
  onStartLesson: (
    subjectId: string,
    moduleId: string,
    itemId: string,
    lessonUnitId: string | undefined,
    mode: LessonMode
  ) => void;
  onStartChapterTest: (subjectId: string, moduleId: string, itemId: string) => void;
  onOpenConversation: (conversation: Conversation) => void;
  onOpenNote: (noteId: string) => void;
  onOpenNoteLibrary: () => void;
  onCorrectAssessment: (conversation: Conversation) => void;
  onRecordAssessment: (conversation: Conversation) => void;
  onEditConversation: (conversation: Conversation) => void;
  onDeleteConversation: (conversation: Conversation) => void;
}

type CourseTab = "program" | "history";

function notePreview(markdown: string) {
  return markdown
    .replace(/```[\s\S]*?```/gu, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/gu, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/gu, "$1")
    .replace(/<[^>]+>/gu, " ")
    .replace(/[#>*_~`|\\-]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function noteUpdatedAt(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Date inconnue";
  return new Intl.DateTimeFormat("fr-CH", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function readLocalFlag(key: string, fallback: boolean) {
  try {
    const value = window.localStorage.getItem(key);
    return value === null ? fallback : value === "true";
  } catch {
    return fallback;
  }
}

function writeLocalFlag(key: string, value: boolean) {
  try {
    window.localStorage.setItem(key, String(value));
  } catch {
    window.dispatchEvent(new CustomEvent("etude:persistence-error", { detail: { key } }));
  }
}

export function CoursesPage({
  subjects,
  conversations,
  notes,
  sidebarStorageKey,
  provider,
  selectedSubjectId,
  pendingSubjectId,
  onSelectSubject,
  onSelectEnglishLevel,
  onAddSubject,
  onToggleProgramItem,
  onToggleLessonUnit,
  onStartAi,
  onStartSubjectLesson,
  onStartLesson,
  onStartChapterTest,
  onOpenConversation,
  onOpenNote,
  onOpenNoteLibrary,
  onCorrectAssessment,
  onRecordAssessment,
  onEditConversation,
  onDeleteConversation
}: CoursesPageProps) {
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<CourseTab>("program");
  const [historySearch, setHistorySearch] = useState("");
  const [coursesSidebarOpen, setCoursesSidebarOpen] = useState(() =>
    readLocalFlag(sidebarStorageKey, true)
  );
  const [openModules, setOpenModules] = useState<string[]>([]);
  const [openItems, setOpenItems] = useState<string[]>([]);
  const [levelDialogOpen, setLevelDialogOpen] = useState(false);
  const [pendingEnglishLevel, setPendingEnglishLevel] = useState<CefrLevel | null>(null);
  const selected = subjects.find((subject) => subject.id === selectedSubjectId) ?? subjects[0];
  const isEnglish = selected?.id === "anglais";
  const isEnglishUnconfigured = isEnglish && !selected?.cefrLevel;
  const selectedCurriculumScope = isEnglish && selected?.cefrLevel
    ? `cefr:${selected.cefrLevel}`
    : undefined;
  const conversationMatchesSelectedCurriculum = (conversation: Conversation) =>
    !isEnglish || conversation.curriculumScope === selectedCurriculumScope;

  useEffect(() => {
    if (selected?.modules.length) {
      setOpenModules([selected.modules[0].id]);
      setOpenItems(selected.modules[0].items[0] ? [selected.modules[0].items[0].id] : []);
    }
  }, [selected?.cefrLevel, selected?.id]);

  useEffect(() => {
    writeLocalFlag(sidebarStorageKey, coursesSidebarOpen);
  }, [coursesSidebarOpen, sidebarStorageKey]);

  const filteredSubjects = useMemo(
    () => subjects.filter((subject) => {
      const query = search.trim().toLocaleLowerCase("fr");
      if (!query) return true;
      return [subject.name, subject.shortName, subject.domain, subject.period, subject.objective]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("fr")
        .includes(query);
    }),
    [search, subjects]
  );

  const subjectConversations = conversations
    .filter((conversation) => conversation.subjectId === selected?.id)
    .filter(conversationMatchesSelectedCurriculum)
    .filter((conversation) => {
      const query = historySearch.trim().toLowerCase();
      if (!query) return true;
      const lessonLabel = conversation.kind === "lesson"
        ? conversation.lessonMode === "paper-assessment"
          ? "évaluation pdf contrôle test partiel examen rattrapage sujet papier corrigé"
          : conversation.lessonMode === "chapter-test"
            ? "mini-test pdf sujet papier a4 corrigé génération"
          : conversation.lessonMode === "exercises"
            ? "exercices ia"
            : "cours ia"
        : "";
      return `${conversation.name ?? ""} ${conversation.note ?? ""} ${conversation.lessonTitle ?? ""} ${lessonLabel} ${providerLabel(conversation.provider)}`
        .toLowerCase()
        .includes(query);
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const subjectNotes = notes
    .filter((note) => note.subjectIds.includes(selected?.id ?? ""))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  const conversationCountByLessonMode = useMemo(() => {
    const counts = new Map<string, number>();
    conversations.forEach((conversation) => {
      if (
        conversation.subjectId === selected?.id &&
        conversationMatchesSelectedCurriculum(conversation) &&
        conversation.kind === "lesson" &&
        conversation.itemId &&
        conversation.lessonMode !== "paper-assessment"
      ) {
        const mode = (conversation.lessonMode ?? "course") as LessonMode;
        const lessonId = mode === "chapter-test"
          ? conversation.itemId
          : conversation.lessonUnitId ?? conversation.itemId;
        const key = `${lessonId}:${mode}:${conversation.provider}`;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    });
    return counts;
  }, [conversations, selected?.id, selectedCurriculumScope]);
  const latestChapterTestByItem = useMemo(() => {
    const latest = new Map<string, Conversation>();
    conversations.forEach((conversation) => {
      if (
        conversation.subjectId !== selected?.id ||
        !conversationMatchesSelectedCurriculum(conversation) ||
        conversation.kind === "general" ||
        conversation.lessonMode !== "chapter-test" ||
        conversation.provider === "duolingo" ||
        conversation.provider === "khanacademy" ||
        conversation.provider === "youtube" ||
        conversation.provider === "tiktok" ||
        conversation.provider === "notebooklm" ||
        conversation.provider === "freechat" ||
        !conversation.itemId
      ) return;
      const previous = latest.get(conversation.itemId);
      const previousTime = previous ? Date.parse(previous.createdAt) : Number.NEGATIVE_INFINITY;
      const currentTime = Date.parse(conversation.createdAt);
      if (!previous || (Number.isNaN(previousTime) ? 0 : previousTime) <= (Number.isNaN(currentTime) ? 0 : currentTime)) {
        latest.set(conversation.itemId, conversation);
      }
    });
    return latest;
  }, [conversations, selected?.id, selectedCurriculumScope]);

  if (!selected) {
    return (
      <main className="page empty-page">
        <div className="large-empty-state">
          <FileText />
          <h1>Ajoutez votre première matière</h1>
          <p>Centralisez le programme de l’année et vos conversations IA.</p>
          <button className="primary-button" onClick={onAddSubject}><Plus /> Ajouter une matière</button>
        </div>
      </main>
    );
  }

  const allItems = selected.modules.flatMap((item) => item.items);
  const allLessons = allItems.flatMap((item) => item.lessons?.length
    ? item.lessons
    : [{ id: item.id, title: item.title, objective: item.description ?? item.title, completed: item.completed }]
  );
  const completedLessons = allLessons.filter((lesson) => lesson.completed).length;
  const progress = allLessons.length ? Math.round((completedLessons / allLessons.length) * 100) : 0;
  const chapterCount = selected.chapterCount ?? allItems.length;
  const courseCount = allLessons.length;
  const hasCurriculumMetadata = Boolean(
    selected.domain ||
    selected.period ||
    selected.validation ||
    selected.chapterCount !== undefined ||
    selected.objective
  );
  return (
    <>
    <main className={`courses-layout ${isEnglishUnconfigured ? "courses-layout--english-onboarding" : ""} ${coursesSidebarOpen ? "" : "courses-layout--sidebar-collapsed"}`}>
      <aside className="courses-sidebar" id="courses-subject-sidebar">
        <div className="courses-sidebar-heading">
          <div>
            <p className="eyebrow">Bibliothèque</p>
            <h1>Mes cours</h1>
          </div>
          <button className="icon-button" onClick={onAddSubject} aria-label="Ajouter une matière">
            <Plus />
          </button>
        </div>
        <label className="search-field">
          <Search />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Rechercher une matière"
            aria-label="Rechercher une matière"
          />
          {search && <button onClick={() => setSearch("")} aria-label="Effacer la recherche de matière">×</button>}
        </label>
        <div className="subject-list">
          {filteredSubjects.map((subject) => {
            const curriculumScope = subject.id === "anglais" && subject.cefrLevel
              ? `cefr:${subject.cefrLevel}`
              : undefined;
            const conversationCount = conversations.filter((item) =>
              item.subjectId === subject.id &&
              (subject.id !== "anglais" || item.curriculumScope === curriculumScope)
            ).length;
            const curriculumLabel = [subject.domain, subject.period].filter(Boolean).join(" · ");
            return (
              <button
                key={subject.id}
                className={selected.id === subject.id ? "is-active" : ""}
                onClick={() => onSelectSubject(subject.id)}
                aria-current={selected.id === subject.id ? "true" : undefined}
                title={isEnglishUnconfigured ? subject.name : undefined}
              >
                <SubjectIcon subject={subject} />
                <span>
                  <strong>{subject.name}</strong>
                  <small>{curriculumLabel || `${subject.teacher} · ${subject.room}`}</small>
                </span>
                {conversationCount > 0 && <em>{conversationCount}</em>}
                <ChevronRight />
              </button>
            );
          })}
          {filteredSubjects.length === 0 && (
            <div className="sidebar-empty">Aucune matière ne correspond.</div>
          )}
        </div>
        <button className="add-subject-button" onClick={onAddSubject}>
          <Plus /> Ajouter une matière
        </button>
      </aside>

      <section className="course-detail">
        <header className="course-detail-header">
          <button
            className="course-sidebar-toggle"
            onClick={() => setCoursesSidebarOpen((open) => !open)}
            aria-expanded={coursesSidebarOpen}
            aria-controls="courses-subject-sidebar"
            aria-label={coursesSidebarOpen ? "Masquer la barre des matières" : "Afficher la barre des matières"}
            title={coursesSidebarOpen ? "Masquer les matières" : "Afficher les matières"}
          >
            {coursesSidebarOpen ? <PanelLeftClose /> : <PanelLeftOpen />}
          </button>
          <div className="course-title-block">
            <SubjectIcon subject={selected} size="lg" />
            <div>
              <div className="course-title-line">
                <h2>{selected.name}</h2>
                {selected.domain ? (
                  <span className="course-domain">{selected.domain}</span>
                ) : selected.room ? (
                  <span className="course-room">{selected.room}</span>
                ) : null}
              </div>
              {hasCurriculumMetadata ? (
                <p className="course-subtitle">
                  {selected.period || "Année académique 2026–2027"}
                  {selected.nextClass && <><span>•</span> Prochain cours {selected.nextClass}</>}
                </p>
              ) : (
                <p>
                  {selected.teacher}
                  {selected.nextClass && <><span>•</span> Prochain cours {selected.nextClass}</>}
                </p>
              )}
            </div>
          </div>
          <div className="course-header-actions">
            {isEnglish && selected.cefrLevel && (
              <>
                <span className="english-active-level" aria-label={`Niveau d’anglais actuel ${selected.cefrLevel}`}>
                  <Languages /> {selected.cefrLevel}
                </span>
                <button
                  type="button"
                  className="english-change-level-button"
                  onClick={() => {
                    setPendingEnglishLevel(selected.cefrLevel ?? null);
                    setLevelDialogOpen(true);
                  }}
                >
                  <Gauge /> Niveau mal adapté ? Changer
                </button>
              </>
            )}
            {!isEnglishUnconfigured && (
              <button className="ai-action-button" onClick={() => onStartSubjectLesson(selected.id)}>
                <Sparkles />
                Cours général IA
              </button>
            )}
          </div>
        </header>

        {hasCurriculumMetadata && !isEnglishUnconfigured && (
          <section className="course-facts" aria-label="Synthèse de la matière">
            {selected.period && (
              <div className="course-fact">
                <span className="course-fact-icon"><CalendarDays /></span>
                <span>
                  <small>Période</small>
                  <strong>{selected.period}</strong>
                </span>
              </div>
            )}
            <div className="course-fact">
              <span className="course-fact-icon"><BookOpen /></span>
                <span>
                  <small>Programme</small>
                  <strong>{chapterCount} chapitre{chapterCount === 1 ? "" : "s"} · {courseCount} cours</strong>
                </span>
            </div>
            {selected.validation && (
              <div className="course-fact course-fact--validation">
                <span className="course-fact-icon"><ShieldCheck /></span>
                <span>
                  <small>Validation / compensation</small>
                  <strong>{selected.validation}</strong>
                </span>
              </div>
            )}
            {selected.objective && (
              <div className="course-objective">
                <Target />
                <p><small>Objectif annuel</small><strong>{selected.objective}</strong></p>
              </div>
            )}
          </section>
        )}

        {!isEnglishUnconfigured && pendingSubjectId === selected.id && (
          <div className="capture-banner">
            <span className="capture-pulse" />
            <div>
              <strong>Conversation prête à être associée</strong>
              <small>Le premier échange sera classé automatiquement ici avec le chapitre concerné.</small>
            </div>
            <Bot />
          </div>
        )}

        <section className="course-linked-notes" aria-labelledby="course-linked-notes-title">
          <div className="course-linked-notes-heading">
            <span className="course-linked-notes-heading-icon" style={{ color: selected.color, background: selected.accent }}>
              <NotebookTabs aria-hidden="true" />
            </span>
            <div>
              <p className="eyebrow">Carnet du cours</p>
              <h3 id="course-linked-notes-title">Notes associées à {selected.name}</h3>
              <p>{subjectNotes.length} note{subjectNotes.length === 1 ? "" : "s"} liée{subjectNotes.length === 1 ? "" : "s"} à cette matière</p>
            </div>
            <button type="button" className="secondary-button" onClick={onOpenNoteLibrary}>
              <Plus /> Gérer mes notes
            </button>
          </div>

          {subjectNotes.length ? (
            <div className="course-linked-note-grid" role="list">
              {subjectNotes.map((note) => {
                const title = note.title.trim() || "Sans titre";
                const preview = notePreview(note.markdown);
                return (
                  <article className="course-linked-note-card" key={note.id} role="listitem">
                    <button
                      type="button"
                      className="course-linked-note-main"
                      onClick={() => onOpenNote(note.id)}
                      aria-label={`Ouvrir la note « ${title} »`}
                    >
                      <span className="course-linked-note-icon" style={{ color: selected.color, background: selected.accent }}>
                        <NotebookTabs aria-hidden="true" />
                      </span>
                      <span className="course-linked-note-copy">
                        <span className="course-linked-note-title">
                          <strong>{title}</strong>
                          <time dateTime={note.updatedAt}>{noteUpdatedAt(note.updatedAt)}</time>
                        </span>
                        <span className="course-linked-note-preview">
                          {preview || "Cette note est encore vide."}
                        </span>
                        {note.tags.length > 0 && (
                          <span className="course-linked-note-tags" aria-label="Tags de la note">
                            {note.tags.map((tag) => <em key={tag.toLocaleLowerCase("fr")}>#{tag}</em>)}
                          </span>
                        )}
                      </span>
                      <ExternalLink aria-hidden="true" />
                    </button>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="course-linked-notes-empty">
              <span>Aucune note associée.</span>
              Associe cette matière depuis un onglet de note pour la retrouver automatiquement ici.
            </div>
          )}
        </section>

        {!isEnglishUnconfigured && <div className="course-tabs" role="tablist" aria-label="Contenu de la matière">
          <button role="tab" aria-selected={tab === "program"} className={tab === "program" ? "is-active" : ""} onClick={() => setTab("program")}>
            <FileText /> Programme annuel
          </button>
          <button role="tab" aria-selected={tab === "history"} className={tab === "history" ? "is-active" : ""} onClick={() => setTab("history")}>
            <History /> Historique IA
              <span>{subjectConversations.length}</span>
          </button>
        </div>}

        {isEnglishUnconfigured ? (
          <section className="english-level-onboarding" aria-labelledby="english-level-title">
            <div className="english-level-intro">
              <span className="english-level-intro-icon" aria-hidden="true"><Languages /></span>
              <div>
                <p className="eyebrow">Ton parcours annuel</p>
                <h3 id="english-level-title">Quel niveau d’anglais veux-tu travailler ?</h3>
                <p>
                  Choisis une seule fois ton niveau, de A1 à C2. Dowze Academie ouvrira ensuite directement ce
                  programme lors de chaque cours du matin. Tu pourras le modifier plus tard sans perdre ta progression.
                </p>
              </div>
            </div>
            <div className="english-level-grid" aria-label="Niveaux d’anglais CECRL">
              {ENGLISH_LEVEL_OPTIONS.map((option, index) => (
                <button
                  type="button"
                  className="english-level-card"
                  key={option.value}
                  onClick={() => onSelectEnglishLevel(option.value)}
                  aria-label={`Choisir le niveau ${option.value}`}
                >
                  <span className="english-level-code">{option.value}</span>
                  <span className="english-level-card-copy">
                    <small>{index < 2 ? "Utilisateur élémentaire" : index < 4 ? "Utilisateur indépendant" : "Utilisateur expérimenté"}</small>
                    <strong>{option.label.replace(`${option.value} · `, "")}</strong>
                    <em>{option.description}</em>
                  </span>
                  <ChevronRight />
                </button>
              ))}
            </div>
            <div className="english-level-method-note">
              <ShieldCheck />
              <p>
                <strong>Un vrai cursus, à ton rythme.</strong>
                Chaque niveau contient 2 semestres, 12 chapitres et 60 cours, avec théorie, pratique,
                mini-tests et examens écrits. Les 69 heures du planning forment un parcours interne aligné
                sur le CECRL ; elles ne constituent ni une certification, ni une garantie automatique de niveau.
              </p>
            </div>
          </section>
        ) : tab === "program" ? (
          <div className="program-view">
            <section className="ai-teacher-card" aria-labelledby="ai-teacher-title">
              <span className="ai-teacher-art" aria-hidden="true">
                <img
                  src={aiProfessorArt}
                  alt=""
                  width="640"
                  height="480"
                  decoding="async"
                  draggable={false}
                />
              </span>
              <div className="ai-teacher-copy">
                <p className="eyebrow">École IA</p>
                <h3 id="ai-teacher-title">{isEnglish ? `Ton professeur d’anglais · ${selected.cefrLevel}` : "Ton professeur IA"}</h3>
                <p>
                  {isEnglish
                    ? "Travaille la compréhension, l’expression, l’interaction et la médiation avec un niveau de langue adapté, puis valide chaque chapitre par une épreuve écrite séparée."
                    : "Apprends chaque notion dans une conversation de cours dédiée, entraîne-toi dans une conversation d’exercices séparée, puis génère une épreuve papier pour valider le chapitre."}
                </p>
              </div>
              <div className="ai-teacher-steps" aria-label="Parcours pédagogique IA">
                <span><BookOpen /> {isEnglish ? "Compréhension & langue" : "Cours interactif"}</span>
                <span><MessageSquarePlus /> {isEnglish ? "Expression & interaction" : "Exercices séparés"}</span>
                <span><FileText /> {isEnglish ? "Évaluation écrite" : "Mini-test PDF A4"}</span>
              </div>
            </section>

            <div className="program-summary">
              <div>
                <p className="eyebrow">Progression annuelle</p>
                <strong>{completedLessons} cours terminé{completedLessons > 1 ? "s" : ""} sur {courseCount}</strong>
              </div>
              <div className="program-progress-copy">
                <span>{progress}%</span>
                <div><i style={{ width: `${progress}%`, background: selected.color }} /></div>
              </div>
            </div>

            <div className="module-list">
              {selected.modules.map((courseModule, index) => {
                const isOpen = openModules.includes(courseModule.id);
                const moduleLessons = courseModule.items.flatMap((item) => item.lessons?.length
                  ? item.lessons
                  : [{ id: item.id, completed: item.completed }]
                );
                const moduleDone = moduleLessons.filter((lesson) => lesson.completed).length;
                return (
                  <article className={`program-module ${isOpen ? "is-open" : ""}`} key={courseModule.id}>
                    <button
                      className="module-heading"
                      onClick={() => setOpenModules((current) =>
                        current.includes(courseModule.id)
                          ? current.filter((id) => id !== courseModule.id)
                          : [...current, courseModule.id]
                      )}
                    >
                      <span className="module-index" style={{ color: selected.color, background: selected.accent }}>
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <span className="module-title">
                        <small>{courseModule.period}</small>
                        <strong>{courseModule.title}</strong>
                      </span>
                      <span className="module-count">{moduleDone}/{moduleLessons.length} cours</span>
                      <ChevronDown />
                    </button>
                    {isOpen && (
                      <div className="module-items">
                        {courseModule.items.map((item) => {
                          const itemLessons = item.lessons ?? [];
                          const isItemOpen = openItems.includes(item.id);
                          const itemCompleted = itemLessons.length
                            ? itemLessons.every((lesson) => lesson.completed)
                            : item.completed;
                          const itemDone = itemLessons.length
                            ? itemLessons.filter((lesson) => lesson.completed).length
                            : Number(item.completed);
                          const itemTotal = itemLessons.length || 1;
                          const legacyCourseCount = conversationCountByLessonMode.get(`${item.id}:course:${provider}`) ?? 0;
                          const legacyExerciseCount = conversationCountByLessonMode.get(`${item.id}:exercises:${provider}`) ?? 0;
                          const chapterTestCount = conversationCountByLessonMode.get(`${item.id}:chapter-test:${provider}`) ?? 0;
                          const latestChapterTest = latestChapterTestByItem.get(item.id);
                          return (
                            <article className={`program-topic ${isItemOpen ? "is-open" : ""} ${itemCompleted ? "is-complete" : ""}`} key={item.id}>
                              <div className="program-topic-heading">
                                <label className="program-progress-toggle">
                                  <input
                                    type="checkbox"
                                    checked={itemCompleted}
                                    onChange={() => onToggleProgramItem(selected.id, courseModule.id, item.id)}
                                    aria-label={`${itemCompleted ? "Marquer le chapitre comme à revoir" : "Marquer tout le chapitre comme terminé"} : ${item.title}`}
                                  />
                                  <span className="program-check" style={{ "--subject-color": selected.color } as React.CSSProperties}>
                                    <Check />
                                  </span>
                                </label>
                                <button
                                  className="program-topic-toggle"
                                  onClick={() => setOpenItems((current) => current.includes(item.id)
                                    ? current.filter((id) => id !== item.id)
                                    : [...current, item.id]
                                  )}
                                  aria-expanded={isItemOpen}
                                >
                                  <span className="program-item-copy">
                                    <small>Chapitre {courseModule.items.indexOf(item) + 1}</small>
                                    <strong>{item.title}</strong>
                                    {item.description && <em>{item.description}</em>}
                                  </span>
                                  <span className="program-topic-count">{itemDone}/{itemTotal} cours</span>
                                  <ChevronDown />
                                </button>
                              </div>

                              {isItemOpen && itemLessons.length > 0 && (
                                <div className="lesson-unit-list">
                                  {itemLessons.map((lesson, lessonIndex) => {
                                    const lessonCourseCount = conversationCountByLessonMode.get(`${lesson.id}:course:${provider}`) ?? 0;
                                    const lessonExerciseCount = conversationCountByLessonMode.get(`${lesson.id}:exercises:${provider}`) ?? 0;
                                    return (
                                      <div className={`lesson-unit-row ${lesson.completed ? "is-complete" : ""}`} key={lesson.id}>
                                        <label className="program-progress-toggle lesson-progress-toggle">
                                          <input
                                            type="checkbox"
                                            checked={lesson.completed}
                                            onChange={() => onToggleLessonUnit(selected.id, courseModule.id, item.id, lesson.id)}
                                            aria-label={`${lesson.completed ? "Marquer comme à revoir" : "Marquer comme terminé"} : ${lesson.title}`}
                                          />
                                          <span className="program-check" style={{ "--subject-color": selected.color } as React.CSSProperties}>
                                            <Check />
                                          </span>
                                        </label>
                                        <span className="lesson-unit-index">Cours {lessonIndex + 1}</span>
                                        <span className="lesson-unit-copy">
                                          <strong>{lesson.title}</strong>
                                          <small>{lesson.objective}</small>
                                        </span>
                                        <span className="lesson-actions">
                                          <button
                                            className={`lesson-start-button lesson-start-button--course ${lessonCourseCount > 0 ? "has-lessons" : ""}`}
                                            onClick={() => onStartLesson(selected.id, courseModule.id, item.id, lesson.id, "course")}
                                            aria-label={`${lessonCourseCount > 0 ? "Reprendre le cours" : "Commencer le cours"} : ${lesson.title}`}
                                          >
                                            {lessonCourseCount > 0 ? <Sparkles /> : <Play />}
                                            <span>{lessonCourseCount > 0 ? "Reprendre le cours" : "Commencer le cours"}</span>
                                            {lessonCourseCount > 0 && <em aria-label={`${lessonCourseCount} session${lessonCourseCount > 1 ? "s" : ""} de cours déjà créée${lessonCourseCount > 1 ? "s" : ""}`}>{lessonCourseCount}</em>}
                                          </button>
                                          <button
                                            className={`lesson-start-button lesson-start-button--exercises ${lessonExerciseCount > 0 ? "has-lessons" : ""}`}
                                            onClick={() => onStartLesson(selected.id, courseModule.id, item.id, lesson.id, "exercises")}
                                            aria-label={`${lessonExerciseCount > 0 ? "Reprendre les exercices" : "Faire les exercices"} : ${lesson.title}`}
                                          >
                                            {lessonExerciseCount > 0 ? <Sparkles /> : <Pencil />}
                                            <span>{lessonExerciseCount > 0 ? "Reprendre les exercices" : "Faire les exercices"}</span>
                                            {lessonExerciseCount > 0 && <em aria-label={`${lessonExerciseCount} session${lessonExerciseCount > 1 ? "s" : ""} d’exercices déjà créée${lessonExerciseCount > 1 ? "s" : ""}`}>{lessonExerciseCount}</em>}
                                          </button>
                                        </span>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}

                              {isItemOpen && itemLessons.length === 0 && (
                                <div className="lesson-unit-list lesson-unit-list--legacy">
                                  <div className="lesson-unit-row">
                                    <span className="lesson-unit-index">Cours 1</span>
                                    <span className="lesson-unit-copy">
                                      <strong>{item.title}</strong>
                                      <small>{item.description ?? "Cours personnalisé"}</small>
                                    </span>
                                    <span className="lesson-actions">
                                      <button
                                        className={`lesson-start-button lesson-start-button--course ${legacyCourseCount > 0 ? "has-lessons" : ""}`}
                                        onClick={() => onStartLesson(selected.id, courseModule.id, item.id, undefined, "course")}
                                        aria-label={`${legacyCourseCount > 0 ? "Reprendre le cours" : "Commencer le cours"} : ${item.title}`}
                                      >
                                        {legacyCourseCount > 0 ? <Sparkles /> : <Play />}
                                        <span>{legacyCourseCount > 0 ? "Reprendre le cours" : "Commencer le cours"}</span>
                                        {legacyCourseCount > 0 && <em>{legacyCourseCount}</em>}
                                      </button>
                                      <button
                                        className={`lesson-start-button lesson-start-button--exercises ${legacyExerciseCount > 0 ? "has-lessons" : ""}`}
                                        onClick={() => onStartLesson(selected.id, courseModule.id, item.id, undefined, "exercises")}
                                        aria-label={`${legacyExerciseCount > 0 ? "Reprendre les exercices" : "Faire les exercices"} : ${item.title}`}
                                      >
                                        {legacyExerciseCount > 0 ? <Sparkles /> : <Pencil />}
                                        <span>{legacyExerciseCount > 0 ? "Reprendre les exercices" : "Faire les exercices"}</span>
                                        {legacyExerciseCount > 0 && <em>{legacyExerciseCount}</em>}
                                      </button>
                                    </span>
                                  </div>
                                </div>
                              )}

                              {isItemOpen && (
                                <div
                                  className="chapter-test-card"
                                  style={{
                                    "--subject-color": selected.color,
                                    "--subject-accent": selected.accent
                                  } as React.CSSProperties}
                                >
                                  <span className="chapter-test-icon" aria-hidden="true"><FileText /></span>
                                  <span className="chapter-test-copy">
                                    <small>Épreuve papier · PDF</small>
                                    <strong>Mini-test du chapitre</strong>
                                    <em>
                                      Un sujet au format A4 couvrant {itemTotal > 1 ? `les ${itemTotal} cours` : "le cours"} du chapitre, avec un corrigé séparé.
                                    </em>
                                    <span className="chapter-test-deliverables" aria-label="Documents générés">
                                      <span><FileText /> Sujet A4 imprimable</span>
                                      <span><Check /> Corrigé séparé</span>
                                    </span>
                                  </span>
                                  <span className="chapter-test-actions">
                                    <button
                                      className={`chapter-test-button ${chapterTestCount > 0 ? "has-tests" : ""}`}
                                      onClick={() => onStartChapterTest(selected.id, courseModule.id, item.id)}
                                      aria-label={`${chapterTestCount > 0 ? "Rouvrir la génération PDF" : "Générer le mini-test PDF"} : ${item.title}`}
                                    >
                                      {chapterTestCount > 0 ? <ExternalLink /> : <FileText />}
                                      <span>{chapterTestCount > 0 ? "Rouvrir la génération PDF" : "Générer le mini-test PDF"}</span>
                                      {chapterTestCount > 0 && (
                                        <em aria-label={`${chapterTestCount} génération${chapterTestCount > 1 ? "s" : ""} PDF déjà créée${chapterTestCount > 1 ? "s" : ""}`}>
                                          {chapterTestCount}
                                        </em>
                                      )}
                                    </button>
                                    <button
                                      className="chapter-test-correction-button"
                                      onClick={() => latestChapterTest && onCorrectAssessment(latestChapterTest)}
                                      disabled={!latestChapterTest}
                                      title={latestChapterTest ? `Envoyer la copie scannée dans ${providerLabel(latestChapterTest.provider)}` : "Générez d’abord le mini-test"}
                                      aria-label={`Corriger ma copie : ${item.title}`}
                                    >
                                      <ScanLine />
                                      <span>Corriger ma copie</span>
                                    </button>
                                  </span>
                                </div>
                              )}
                            </article>
                          );
                        })}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="history-view">
            <div className="history-toolbar">
              <label className="search-field history-search">
                <Search />
                <input
                  value={historySearch}
                  onChange={(event) => setHistorySearch(event.target.value)}
                  placeholder="Rechercher dans les noms et notes"
                  aria-label="Rechercher dans l’historique IA"
                />
              </label>
              <button className="secondary-button" onClick={() => onStartAi(selected.id)}>
                <MessageSquarePlus /> Nouvelle conversation
              </button>
            </div>

            {subjectConversations.length > 0 ? (
              <div className="conversation-list">
                {subjectConversations.map((conversation) => {
                  const lessonMode = conversation.lessonMode ?? "course";
                  const isAssessment = conversation.kind === "lesson" &&
                    conversation.provider !== "duolingo" &&
                    conversation.provider !== "khanacademy" &&
                    conversation.provider !== "youtube" &&
                    conversation.provider !== "tiktok" &&
                    conversation.provider !== "notebooklm" &&
                    conversation.provider !== "freechat" &&
                    (lessonMode === "paper-assessment" || lessonMode === "chapter-test");
                  return (
                  <article className="conversation-card" key={conversation.id}>
                    <button className="conversation-main" onClick={() => onOpenConversation(conversation)}>
                      <span className={`provider-mark provider-mark--${conversation.provider}`}>
                        {providerMark(conversation.provider)}
                      </span>
                      <span className="conversation-copy">
                        <span className="conversation-title-row">
                          <strong>
                            {conversation.name || format(parseISO(conversation.createdAt), "d MMMM yyyy 'à' HH:mm", { locale: fr })}
                          </strong>
                          {conversation.kind === "lesson" && (
                            <em className={`lesson-history-badge lesson-history-badge--${lessonMode}`}>
                              {conversation.provider === "youtube" || conversation.provider === "tiktok" ? <Play />
                                : conversation.provider === "notebooklm" ? <NotebookTabs />
                                  : lessonMode === "paper-assessment" || lessonMode === "chapter-test" ? <FileText />
                                    : lessonMode === "exercises" ? <Pencil /> : <BookOpen />}
                              {historySessionLabel(conversation)}
                            </em>
                          )}
                        </span>
                        {conversation.name && (
                          <small>{providerLabel(conversation.provider)} · {format(parseISO(conversation.createdAt), "d MMMM yyyy 'à' HH:mm", { locale: fr })}</small>
                        )}
                        {conversation.note && <p>{conversation.note}</p>}
                      </span>
                      {conversation.provider === "freechat" ? <Bot /> : <ExternalLink />}
                    </button>
                    {isAssessment && (
                      <div className="assessment-history-actions">
                        <button className="assessment-correct-button" onClick={() => onCorrectAssessment(conversation)}>
                          <ScanLine /> Corriger ma copie
                        </button>
                        <button className="assessment-record-button" onClick={() => onRecordAssessment(conversation)}>
                          <ClipboardCheck /> Enregistrer la note
                        </button>
                      </div>
                    )}
                    <div className="conversation-actions">
                      <span><Clock3 /> {format(parseISO(conversation.createdAt), "d MMM · HH:mm", { locale: fr })}</span>
                      <div>
                        {conversation.provider !== "freechat" && (
                          <button
                            aria-label="Copier le lien"
                            onClick={() => navigator.clipboard.writeText(conversation.url)}
                          ><Copy /></button>
                        )}
                        <button aria-label="Modifier" onClick={() => onEditConversation(conversation)}><Pencil /></button>
                        <button className="danger-icon" aria-label="Supprimer" onClick={() => onDeleteConversation(conversation)}><Trash2 /></button>
                      </div>
                    </div>
                  </article>
                  );
                })}
              </div>
            ) : (
              <div className="history-empty">
                <span className="empty-illustration"><Bot /><Sparkles /></span>
                <h3>{historySearch ? "Aucun résultat" : "Aucune conversation pour le moment"}</h3>
                <p>
                  {historySearch
                    ? "Essayez un autre mot dans le nom ou la note."
                    : "Démarrez une session : son lien apparaîtra ici après votre premier message."}
                </p>
                {!historySearch && (
                  <button className="primary-button" onClick={() => onStartAi(selected.id)}>
                    <MessageSquarePlus /> Commencer une conversation
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </section>
    </main>
    {levelDialogOpen && selected.cefrLevel && (
      <Modal
        title="Changer de niveau d’anglais"
        subtitle="Ta progression de chaque niveau reste enregistrée séparément."
        size="md"
        onClose={() => {
          setLevelDialogOpen(false);
          setPendingEnglishLevel(null);
        }}
      >
        <div className="english-level-dialog-options" role="radiogroup" aria-label="Nouveau niveau d’anglais">
          {ENGLISH_LEVEL_OPTIONS.map((option) => (
            <button
              type="button"
              role="radio"
              aria-checked={pendingEnglishLevel === option.value}
              className={pendingEnglishLevel === option.value ? "is-selected" : ""}
              key={option.value}
              onClick={() => setPendingEnglishLevel(option.value)}
            >
              <span>{option.value}</span>
              <p><strong>{option.label.replace(`${option.value} · `, "")}</strong><small>{option.description}</small></p>
              {pendingEnglishLevel === option.value && <Check />}
            </button>
          ))}
        </div>
        <p className="english-level-dialog-note">
          Le changement ferme la séance IA en cours pour éviter de mélanger deux niveaux. Tes cours déjà cochés restent conservés.
        </p>
        <footer className="modal-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={() => {
              setLevelDialogOpen(false);
              setPendingEnglishLevel(null);
            }}
          >
            Annuler
          </button>
          <button
            type="button"
            className="primary-button"
            disabled={!pendingEnglishLevel || pendingEnglishLevel === selected.cefrLevel}
            onClick={() => {
              if (!pendingEnglishLevel || pendingEnglishLevel === selected.cefrLevel) return;
              onSelectEnglishLevel(pendingEnglishLevel);
              setLevelDialogOpen(false);
              setPendingEnglishLevel(null);
              setTab("program");
            }}
          >
            Confirmer le nouveau niveau
          </button>
        </footer>
      </Modal>
    )}
    </>
  );
}
