import { Crepe } from "@milkdown/crepe";
import { AlertCircle, LoaderCircle } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import "@milkdown/crepe/theme/common/style.css";
import "@milkdown/crepe/theme/frame.css";
import "katex/dist/katex.min.css";

const AUTOSAVE_DELAY_MS = 300;
const MAX_EMBEDDED_IMAGE_BYTES = 350_000;
const MAX_NOTE_MARKDOWN_CHARACTERS = 1_500_000;
const EMBEDDED_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp"
]);

interface MarkdownNoteEditorProps {
  noteId: string;
  initialMarkdown: string;
  onChange: (markdown: string) => void;
}

function fileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("L’image n’a pas pu être lue."));
    }, { once: true });
    reader.addEventListener("error", () => reject(new Error("L’image n’a pas pu être lue.")), { once: true });
    reader.readAsDataURL(file);
  });
}

export default function MarkdownNoteEditor({
  noteId,
  initialMarkdown,
  onChange
}: MarkdownNoteEditorProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const onChangeRef = useRef(onChange);
  const pendingMarkdownRef = useRef<string | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creationFailed, setCreationFailed] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let disposed = false;
    let created = false;
    let crepe: Crepe | null = null;
    let lastPersistedMarkdown = initialMarkdown;
    setIsReady(false);
    setError(null);
    setCreationFailed(false);
    root.replaceChildren();

    const flush = () => {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      let markdown = pendingMarkdownRef.current;
      if (created && crepe) markdown = crepe.getMarkdown();
      if (markdown === null || markdown === lastPersistedMarkdown) {
        pendingMarkdownRef.current = null;
        return;
      }
      pendingMarkdownRef.current = null;
      lastPersistedMarkdown = markdown;
      onChangeRef.current(markdown);
    };

    const scheduleSave = (markdown: string) => {
      pendingMarkdownRef.current = markdown;
      if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = window.setTimeout(flush, AUTOSAVE_DELAY_MS);
    };

    const uploadEmbeddedImage = async (file: File) => {
      if (!EMBEDDED_IMAGE_TYPES.has(file.type)) {
        const message = "Utilise une image PNG, JPEG, GIF ou WebP.";
        setError(message);
        throw new Error(message);
      }
      if (file.size > MAX_EMBEDDED_IMAGE_BYTES) {
        const message = "L’image dépasse 350 ko. Compresse-la avant de l’intégrer à la note.";
        setError(message);
        throw new Error(message);
      }
      const currentMarkdown = created && crepe ? crepe.getMarkdown() : initialMarkdown;
      if (currentMarkdown.length + Math.ceil(file.size * 4 / 3) > MAX_NOTE_MARKDOWN_CHARACTERS) {
        const message = "Cette note approche la capacité locale. Exporte-la en .md puis crée une nouvelle note avant d’ajouter cette image.";
        setError(message);
        throw new Error(message);
      }
      setError(null);
      return fileAsDataUrl(file);
    };

    crepe = new Crepe({
      root,
      defaultValue: initialMarkdown,
      features: {
        [Crepe.Feature.Cursor]: true,
        [Crepe.Feature.ListItem]: true,
        [Crepe.Feature.LinkTooltip]: true,
        [Crepe.Feature.ImageBlock]: true,
        [Crepe.Feature.BlockEdit]: true,
        [Crepe.Feature.Toolbar]: true,
        [Crepe.Feature.Placeholder]: true,
        [Crepe.Feature.CodeMirror]: true,
        [Crepe.Feature.Table]: true,
        [Crepe.Feature.Latex]: true,
        [Crepe.Feature.TopBar]: true,
        [Crepe.Feature.AI]: false
      },
      featureConfigs: {
        [Crepe.Feature.Placeholder]: {
          text: "Commence à écrire… Tape / pour insérer un bloc ou une formule.",
          mode: "block"
        },
        [Crepe.Feature.TopBar]: {
          headingOptions: [
            { label: "Paragraphe", level: null },
            { label: "Titre 1", level: 1 },
            { label: "Titre 2", level: 2 },
            { label: "Titre 3", level: 3 },
            { label: "Titre 4", level: 4 },
            { label: "Titre 5", level: 5 },
            { label: "Titre 6", level: 6 }
          ]
        },
        [Crepe.Feature.Toolbar]: {
          boldLabel: "Gras",
          italicLabel: "Italique",
          strikethroughLabel: "Barré",
          codeLabel: "Code",
          linkLabel: "Lien",
          latexLabel: "Formule"
        },
        [Crepe.Feature.BlockEdit]: {
          textGroup: {
            label: "Texte",
            text: { label: "Paragraphe" },
            h1: { label: "Titre 1" },
            h2: { label: "Titre 2" },
            h3: { label: "Titre 3" },
            h4: { label: "Titre 4" },
            h5: { label: "Titre 5" },
            h6: { label: "Titre 6" },
            quote: { label: "Citation" },
            divider: { label: "Séparateur" }
          },
          listGroup: {
            label: "Listes",
            bulletList: { label: "Liste à puces" },
            orderedList: { label: "Liste numérotée" },
            taskList: { label: "Liste de tâches" }
          },
          advancedGroup: {
            label: "Blocs avancés",
            image: { label: "Image" },
            codeBlock: { label: "Bloc de code" },
            table: { label: "Tableau" },
            math: { label: "Formule mathématique" }
          }
        },
        [Crepe.Feature.Latex]: {
          katexOptions: {
            throwOnError: false,
            trust: false
          }
        },
        [Crepe.Feature.ImageBlock]: {
          onUpload: uploadEmbeddedImage,
          inlineOnUpload: uploadEmbeddedImage,
          blockOnUpload: uploadEmbeddedImage
        }
      }
    });

    crepe.on((listener) => {
      listener.markdownUpdated((_, markdown, previousMarkdown) => {
        if (markdown !== previousMarkdown) scheduleSave(markdown);
      });
      listener.blur(flush);
    });

    const refreshBeforeLeaving = () => flush();
    window.addEventListener("pagehide", refreshBeforeLeaving);

    const creation = crepe.create()
      .then(() => {
        created = true;
        if (disposed) return crepe.destroy();
        const editable = root.querySelector<HTMLElement>("[contenteditable='true']");
        editable?.setAttribute("aria-label", "Éditeur Markdown de la note");
        editable?.setAttribute("lang", "fr");
        editable?.setAttribute("spellcheck", "true");
        const toolbarLabels = [
          "Style de paragraphe", "Gras", "Italique", "Barré", "Code en ligne",
          "Liste à puces", "Liste numérotée", "Liste de tâches", "Ajouter un lien",
          "Ajouter une image", "Insérer un tableau", "Bloc de code",
          "Formule mathématique", "Citation", "Séparateur"
        ];
        root.querySelectorAll<HTMLButtonElement>(".milkdown-top-bar button").forEach((button, index) => {
          const label = toolbarLabels[index] ?? `Outil Markdown ${index + 1}`;
          if (!button.getAttribute("aria-label")) button.setAttribute("aria-label", label);
          button.setAttribute("title", label);
          button.dataset.tooltip = label;
        });
        setIsReady(true);
        return undefined;
      })
      .catch((caught) => {
        if (!disposed) {
          setCreationFailed(true);
          setError(`Impossible de charger l’éditeur Markdown : ${caught instanceof Error ? caught.message : String(caught)}`);
        }
      });

    return () => {
      disposed = true;
      window.removeEventListener("pagehide", refreshBeforeLeaving);
      flush();
      if (created) void crepe.destroy().catch(() => undefined);
      else void creation;
    };
  }, [noteId, retryKey]);

  return (
    <div className="markdown-editor-shell">
      {!isReady && !error && (
        <div className="markdown-editor-loading" role="status">
          <LoaderCircle /> Chargement de l’éditeur…
        </div>
      )}
      {error && (
        <div className="markdown-editor-error" role="alert">
          <AlertCircle /> <span>{error}</span>
          <button
            onClick={() => {
              if (creationFailed) setRetryKey((value) => value + 1);
              else setError(null);
            }}
            aria-label={creationFailed ? "Réessayer de charger l’éditeur" : "Fermer l’erreur"}
          >
            {creationFailed ? "Réessayer" : "×"}
          </button>
        </div>
      )}
      <div className="markdown-editor-root" ref={rootRef} data-note-id={noteId} />
    </div>
  );
}
