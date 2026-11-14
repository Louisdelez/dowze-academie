import { C as putSnapshot, d as getDraft } from "./storage-BJWvsK9s.js";
import { S as notebookDocumentId, a as isPaperDocument } from "./notebookDocument-C3DZiTlV.js";
import { A as resolvePaperPhotoReference, M as paperCodeRanges, N as registerNotebookWriter, T as PaperAssetImage, j as loadPaperCodeLanguage } from "../split.mjs";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { AlertCircle, Eraser, Highlighter, ImagePlus, LoaderCircle, MoreHorizontal, Pencil, Redo2, Type, Undo2 } from "lucide-react";
import { Fragment, jsxDEV } from "react/jsx-dev-runtime";
import { createRoot } from "react-dom/client";
import { createTimer } from "@milkdown/kit/ctx";
import { editorViewCtx, editorViewTimerCtx, nodeViewCtx, parserCtx } from "@milkdown/kit/core";
import { $node, $prose, $remark, $view, insert } from "@milkdown/kit/utils";
import { Plugin, PluginKey, TextSelection } from "@milkdown/kit/prose/state";
import { Decoration, DecorationSet } from "@milkdown/kit/prose/view";
import { Crepe } from "@milkdown/crepe";
//#region src/lib/paperTextCaret.ts
/** Recover a caret's source ordinate from transformed visual centres. */
function paperTextCaretY(source, caret, rotation, scale) {
	if (![
		source.x,
		source.y,
		source.height,
		caret.x,
		caret.y,
		rotation,
		scale
	].every(Number.isFinite) || scale <= 0) throw Error("Position du curseur indisponible.");
	const angle = rotation * Math.PI / 180, dx = caret.x - source.x, dy = caret.y - source.y;
	return source.height / 2 + (-Math.sin(angle) * dx + Math.cos(angle) * dy) / scale;
}
//#endregion
//#region src/lib/paperCodeView.ts
/** Code stays in the paginated document; maths retain their existing preview editor. */
var paperCodeView = (ctx) => {
	const ready = createTimer("PaperCodeViewReady");
	const preceding = [...ctx.get(editorViewTimerCtx)];
	ctx.record(ready);
	ctx.update(editorViewTimerCtx, (timers) => [...timers, ready]);
	return async () => {
		await Promise.all(preceding.map((timer) => ctx.wait(timer)));
		const original = ctx.get(nodeViewCtx).find(([name]) => name === "code_block")?.[1];
		const paperView = (node, view, getPos, decorations, inner) => {
			if (String(node.attrs.language ?? "").toLowerCase() === "latex" && original) return original(node, view, getPos, decorations, inner);
			const dom = document.createElement("pre"), contentDOM = document.createElement("code");
			dom.className = "paper-code-block";
			dom.appendChild(contentDOM);
			const setLanguage = (language) => {
				contentDOM.dataset.language = String(language ?? "");
			};
			setLanguage(node.attrs.language);
			return {
				dom,
				contentDOM,
				update(next) {
					if (next.type !== node.type || String(next.attrs.language ?? "").toLowerCase() === "latex") return false;
					setLanguage(next.attrs.language);
					return true;
				}
			};
		};
		ctx.update(nodeViewCtx, (values) => values.map(([name, constructor]) => [name, name === "code_block" ? paperView : constructor]));
		ctx.done(ready);
		return () => {
			ctx.update(editorViewTimerCtx, (timers) => timers.filter((timer) => timer !== ready));
			ctx.clearTimer(ready);
		};
	};
};
//#endregion
//#region src/lib/paperCodeDecorations.ts
var key = new PluginKey("paper-code-colours");
var decorate = (doc) => {
	const decorations = [];
	doc.descendants((node, pos) => {
		if (node.type.name === "code_block" && String(node.attrs.language).toLowerCase() !== "latex") for (const range of paperCodeRanges(node.textContent, String(node.attrs.language ?? ""))) decorations.push(Decoration.inline(pos + 1 + range.from, pos + 1 + range.to, { class: range.className }));
	});
	return DecorationSet.create(doc, decorations);
};
var paperCodeDecorations = $prose(() => new Plugin({
	key,
	state: {
		init: (_, state) => decorate(state.doc),
		apply: (tr, previous) => tr.docChanged || tr.getMeta(key) ? decorate(tr.doc) : previous.map(tr.mapping, tr.doc)
	},
	props: { decorations: (state) => key.getState(state) },
	view(view) {
		let disposed = false;
		const requested = /* @__PURE__ */ new Set();
		const request = () => view.state.doc.descendants((node) => {
			if (node.type.name !== "code_block") return;
			const language = String(node.attrs.language ?? "");
			if (!language || language.toLowerCase() === "latex" || requested.has(language)) return;
			requested.add(language);
			loadPaperCodeLanguage(language).then(() => {
				if (!disposed) view.dispatch(view.state.tr.setMeta(key, true).setMeta("addToHistory", false));
			});
		});
		request();
		return {
			update() {
				request();
			},
			destroy() {
				disposed = true;
			}
		};
	}
}));
//#endregion
//#region src/lib/paperEditorTransaction.ts
/** Apply the smallest rich-document replacement. The current selection maps through only that edit. */
function remotePaperEditorTransaction(state, next) {
	const start = state.doc.content.findDiffStart(next.content);
	if (start === null) return null;
	const end = state.doc.content.findDiffEnd(next.content);
	const overlap = start - Math.min(end.a, end.b), a = end.a + Math.max(0, overlap), b = end.b + Math.max(0, overlap);
	let tr = state.tr.replace(start, a, next.slice(start, b));
	if (!tr.doc.eq(next)) tr = state.tr.replaceWith(0, state.doc.content.size, next.content);
	if (state.selection instanceof TextSelection && state.doc.content.size === next.content.size && state.doc.textContent === next.textContent) {
		const { $anchor, $head } = state.selection;
		if (tr.doc.resolve($anchor.pos).parent.inlineContent && tr.doc.resolve($head.pos).parent.inlineContent) tr.setSelection(TextSelection.create(tr.doc, $anchor.pos, $head.pos));
	}
	return tr.setMeta("addToHistory", false).setMeta("dowzeRemote", true);
}
//#endregion
//#region src/components/NotePhotoNode.tsx
var _jsxFileName$2 = "/home/louis/DowzeBuild/20260923/collections-060/src/components/NotePhotoNode.tsx";
var privateImage = (src) => typeof src === "string" && src.startsWith("dowze-photo:");
var check = (context) => {
	if (!context.current()) throw Error("Le carnet ou le compte a changé pendant le chargement de l’image.");
};
/** A newly inserted image may be durable before React receives its refreshed manifest. */
async function resolveEditorPaperPhoto(src, media, context) {
	check(context);
	const document = context.getDocument();
	if (!document) throw Error("Le carnet de cette image attend son ouverture. Sa référence reste conservée.");
	const resolved = resolvePaperPhotoReference(document, src);
	if (resolved.kind === "asset") return {
		document,
		asset: resolved.asset,
		reference: resolved.reference
	};
	if (resolved.kind !== "unavailable" || resolved.reason !== "missing-file") throw Error(resolved.kind === "unavailable" ? resolved.message : "Cette image ne possède pas une référence de carnet.");
	const noteId = document.noteId, scope = {
		accountId: media.accountId,
		spaceId: media.spaceId
	}, identity = {
		...scope,
		type: "whiteboard",
		documentId: notebookDocumentId(noteId)
	}, stored = await getDraft(identity);
	check(context);
	if (context.getDocument()?.noteId !== noteId || !stored || stored.accountId !== scope.accountId || stored.spaceId !== scope.spaceId || stored.documentId !== identity.documentId || stored.type !== "whiteboard" || stored.identityAlias || stored.staged || !isPaperDocument(stored.content) || stored.content.noteId !== noteId) throw Error("Le fichier de cette image n’est pas encore conservé dans le carnet courant. Sa référence reste intacte.");
	const durable = resolvePaperPhotoReference(stored.content, src);
	if (durable.kind !== "asset") throw Error(durable.kind === "unavailable" ? durable.message : "Cette référence d’image est incompatible.");
	return {
		document: stored.content,
		asset: durable.asset,
		reference: durable.reference
	};
}
function PrivateNoteImage({ src, alt, title, media, context }) {
	const noteId = context?.getDocument()?.noteId, key = JSON.stringify([
		media.accountId,
		media.spaceId,
		noteId ?? null,
		src
	]), [state, setState] = useState({ key: "" }), latest = useRef({
		key,
		context
	});
	latest.current = {
		key,
		context
	};
	useEffect(() => {
		let stopped = false;
		const current = () => !stopped && latest.current.key === key && (latest.current.context?.current() ?? false) && latest.current.context?.getDocument()?.noteId === noteId;
		const load = async () => {
			if (stopped) return;
			setState({ key });
			try {
				if (!context) throw Error("Le carnet de cette image doit être ouvert avant son affichage.");
				const resolved = await resolveEditorPaperPhoto(src, media, {
					getDocument: () => latest.current.context?.getDocument(),
					current
				});
				if (current()) setState({
					key,
					resolved
				});
			} catch (error) {
				if (!stopped && latest.current.key === key) setState({
					key,
					error: String(error instanceof Error ? error.message : error)
				});
			}
		};
		load();
		const retry = () => void load();
		addEventListener("online", retry);
		addEventListener("dowze:note-media", retry);
		return () => {
			stopped = true;
			removeEventListener("online", retry);
			removeEventListener("dowze:note-media", retry);
		};
	}, [key, media.api]);
	const visible = state.key === key ? state : void 0;
	return visible?.resolved ? /* @__PURE__ */ jsxDEV(PaperAssetImage, {
		asset: visible.resolved.asset,
		document: visible.resolved.document,
		referenceDocumentId: visible.resolved.reference.documentId,
		media,
		alt,
		title: title ?? void 0,
		current: () => latest.current.context?.current() ?? false
	}, void 0, false, {
		fileName: _jsxFileName$2,
		lineNumber: 30,
		columnNumber: 27
	}, this) : /* @__PURE__ */ jsxDEV("span", {
		role: "status",
		className: "paper-asset-missing note-photo-pending",
		"data-image-error": visible?.error ? "true" : void 0,
		children: visible?.error || "Chargement de l’image…"
	}, void 0, false, {
		fileName: _jsxFileName$2,
		lineNumber: 30,
		columnNumber: 278
	}, this);
}
/** Private images are inline document nodes; text ordering, image alt/title and undo remain together. */
function notePhotoPlugins(media, context) {
	const node = $node("dowze_note_photo", () => ({
		group: "inline",
		inline: true,
		atom: true,
		draggable: true,
		selectable: true,
		isolating: true,
		priority: 200,
		attrs: {
			src: { default: "" },
			alt: { default: "" },
			title: { default: null }
		},
		parseDOM: [{
			tag: "img[data-dowze-photo]",
			getAttrs: (dom) => ({
				src: dom.dataset.dowzePhoto,
				alt: dom.getAttribute("alt") ?? "",
				title: dom.getAttribute("title")
			})
		}],
		toDOM: (node) => ["img", {
			"data-dowze-photo": node.attrs.src,
			alt: node.attrs.alt,
			title: node.attrs.title
		}],
		parseMarkdown: {
			match: (node) => node.type === "dowze-note-photo",
			runner: (state, node, type) => {
				state.addNode(type, {
					src: node.url,
					alt: node.alt ?? "",
					title: node.title ?? null
				});
			}
		},
		toMarkdown: {
			match: (node) => node.type.name === "dowze_note_photo",
			runner: (state, node) => {
				state.addNode("image", void 0, void 0, {
					url: node.attrs.src,
					alt: node.attrs.alt,
					title: node.attrs.title
				});
			}
		}
	}));
	const view = $view(node, () => (node) => {
		const dom = document.createElement("span");
		dom.className = "note-photo-node";
		dom.contentEditable = "false";
		const root = createRoot(dom);
		let current = node;
		const render = () => root.render(/* @__PURE__ */ jsxDEV(PrivateNoteImage, {
			src: current.attrs.src,
			alt: current.attrs.alt,
			title: current.attrs.title,
			media,
			context
		}, void 0, false, {
			fileName: _jsxFileName$2,
			lineNumber: 44,
			columnNumber: 32
		}, this));
		render();
		return {
			dom,
			update(next) {
				if (next.type !== current.type) return false;
				current = next;
				render();
				return true;
			},
			ignoreMutation: () => true,
			selectNode: () => dom.classList.add("is-selected"),
			deselectNode: () => dom.classList.remove("is-selected"),
			destroy: () => queueMicrotask(() => root.unmount())
		};
	});
	const remark = $remark("dowze-private-photo", () => () => (tree) => {
		const walk = (parent) => {
			if (!parent.children) return;
			parent.children.forEach((child, index) => {
				if (["image", "image-block"].includes(child.type) && privateImage(child.url)) {
					const image = {
						...child,
						type: "dowze-note-photo"
					};
					parent.children[index] = child.type === "image-block" ? {
						type: "paragraph",
						children: [image]
					} : image;
				} else walk(child);
			});
		};
		walk(tree);
	});
	const normalizeUpload = $prose(() => new Plugin({ appendTransaction(transactions, _old, state) {
		if (!transactions.some((t) => t.docChanged)) return null;
		const replacements = [];
		state.doc.descendants((n, pos) => {
			if (["image-block", "image"].includes(n.type.name) && privateImage(n.attrs.src)) replacements.push({
				pos,
				node: n
			});
		});
		if (!replacements.length) return null;
		const tr = state.tr;
		for (const { pos, node: n } of replacements.reverse()) {
			const attrs = {
				src: n.attrs.src,
				alt: n.attrs.alt ?? n.attrs.caption ?? "",
				title: n.attrs.title ?? null
			}, image = state.schema.nodes.dowze_note_photo.create(attrs);
			if (n.type.name === "image-block") tr.replaceWith(pos, pos + n.nodeSize, state.schema.nodes.paragraph.create(null, image));
			else tr.setNodeMarkup(pos, state.schema.nodes.dowze_note_photo, attrs);
		}
		return tr;
	} }));
	return [
		...remark,
		node,
		view,
		normalizeUpload
	];
}
//#endregion
//#region src/components/NotePaperTools.tsx
var _jsxFileName$1 = "/home/louis/DowzeBuild/20260923/collections-060/src/components/NotePaperTools.tsx";
function NotePaperTools({ tools, onImage, readOnly }) {
	const input = useRef(null);
	return /* @__PURE__ */ jsxDEV("div", {
		className: "note-paper-tools",
		role: "group",
		"aria-label": "Outils de la page",
		children: [
			[
				[
					"text",
					"Écrire",
					Type
				],
				[
					"pen",
					"Stylo",
					Pencil
				],
				[
					"highlighter",
					"Surligneur",
					Highlighter
				],
				[
					"eraser",
					"Gomme",
					Eraser
				]
			].map(([mode, label, Icon]) => /* @__PURE__ */ jsxDEV("button", {
				type: "button",
				"aria-label": label,
				title: label,
				"aria-pressed": tools.tool === mode,
				disabled: readOnly,
				onMouseDown: (e) => e.preventDefault(),
				onClick: () => tools.onTool(mode),
				children: /* @__PURE__ */ jsxDEV(Icon, { "aria-hidden": "true" }, void 0, false, {
					fileName: _jsxFileName$1,
					lineNumber: 8,
					columnNumber: 343
				}, this)
			}, mode, false, {
				fileName: _jsxFileName$1,
				lineNumber: 8,
				columnNumber: 155
			}, this)),
			/* @__PURE__ */ jsxDEV("label", {
				className: "note-ink-color",
				title: "Couleur de l’encre",
				children: /* @__PURE__ */ jsxDEV("input", {
					type: "color",
					"aria-label": "Couleur de l’encre",
					value: tools.color,
					disabled: readOnly,
					onChange: (e) => tools.onColor(e.target.value)
				}, void 0, false, {
					fileName: _jsxFileName$1,
					lineNumber: 9,
					columnNumber: 64
				}, this)
			}, void 0, false, {
				fileName: _jsxFileName$1,
				lineNumber: 9,
				columnNumber: 3
			}, this),
			/* @__PURE__ */ jsxDEV("select", {
				"aria-label": "Épaisseur du trait",
				value: tools.width,
				disabled: readOnly,
				onChange: (e) => tools.onWidth(Number(e.target.value)),
				children: [
					/* @__PURE__ */ jsxDEV("option", {
						value: 2,
						children: "Fin"
					}, void 0, false, {
						fileName: _jsxFileName$1,
						lineNumber: 10,
						columnNumber: 135
					}, this),
					/* @__PURE__ */ jsxDEV("option", {
						value: 3,
						children: "Normal"
					}, void 0, false, {
						fileName: _jsxFileName$1,
						lineNumber: 10,
						columnNumber: 165
					}, this),
					/* @__PURE__ */ jsxDEV("option", {
						value: 6,
						children: "Épais"
					}, void 0, false, {
						fileName: _jsxFileName$1,
						lineNumber: 10,
						columnNumber: 198
					}, this)
				]
			}, void 0, true, {
				fileName: _jsxFileName$1,
				lineNumber: 10,
				columnNumber: 3
			}, this),
			tools.tool !== "text" && /* @__PURE__ */ jsxDEV(Fragment, { children: [/* @__PURE__ */ jsxDEV("button", {
				type: "button",
				"aria-label": "Annuler le trait",
				title: "Annuler le trait",
				disabled: readOnly,
				onClick: () => tools.onAction("undo"),
				children: /* @__PURE__ */ jsxDEV(Undo2, {}, void 0, false, {
					fileName: _jsxFileName$1,
					lineNumber: 11,
					columnNumber: 161
				}, this)
			}, void 0, false, {
				fileName: _jsxFileName$1,
				lineNumber: 11,
				columnNumber: 27
			}, this), /* @__PURE__ */ jsxDEV("button", {
				type: "button",
				"aria-label": "Rétablir le trait",
				title: "Rétablir le trait",
				disabled: readOnly,
				onClick: () => tools.onAction("redo"),
				children: /* @__PURE__ */ jsxDEV(Redo2, {}, void 0, false, {
					fileName: _jsxFileName$1,
					lineNumber: 11,
					columnNumber: 314
				}, this)
			}, void 0, false, {
				fileName: _jsxFileName$1,
				lineNumber: 11,
				columnNumber: 178
			}, this)] }, void 0, true, {
				fileName: _jsxFileName$1,
				lineNumber: 11,
				columnNumber: 25
			}, this),
			/* @__PURE__ */ jsxDEV("button", {
				type: "button",
				"aria-label": "Insérer une image dans la note",
				title: "Insérer une image",
				disabled: readOnly,
				onMouseDown: (e) => e.preventDefault(),
				onClick: () => input.current?.click(),
				children: /* @__PURE__ */ jsxDEV(ImagePlus, {}, void 0, false, {
					fileName: _jsxFileName$1,
					lineNumber: 12,
					columnNumber: 188
				}, this)
			}, void 0, false, {
				fileName: _jsxFileName$1,
				lineNumber: 12,
				columnNumber: 3
			}, this),
			/* @__PURE__ */ jsxDEV("button", {
				type: "button",
				"aria-label": "Autres outils de mise en forme",
				title: "Autres outils",
				onMouseDown: (e) => e.preventDefault(),
				onClick: (e) => {
					const bar = e.currentTarget.closest(".note-unified-toolbar");
					bar?.classList.toggle("is-expanded");
					e.currentTarget.setAttribute("aria-expanded", String(bar?.classList.contains("is-expanded")));
				},
				children: /* @__PURE__ */ jsxDEV(MoreHorizontal, {}, void 0, false, {
					fileName: _jsxFileName$1,
					lineNumber: 13,
					columnNumber: 332
				}, this)
			}, void 0, false, {
				fileName: _jsxFileName$1,
				lineNumber: 13,
				columnNumber: 3
			}, this),
			/* @__PURE__ */ jsxDEV("input", {
				ref: input,
				hidden: true,
				type: "file",
				"aria-label": "Image à insérer dans la note",
				accept: "image/png,image/jpeg,image/webp",
				onChange: (e) => {
					const file = e.target.files?.[0];
					e.target.value = "";
					if (file) onImage(file);
				}
			}, void 0, false, {
				fileName: _jsxFileName$1,
				lineNumber: 14,
				columnNumber: 3
			}, this)
		]
	}, void 0, true, {
		fileName: _jsxFileName$1,
		lineNumber: 7,
		columnNumber: 9
	}, this);
}
//#endregion
//#region src/components/MarkdownNoteEditor.tsx
var _jsxFileName = "/home/louis/DowzeBuild/20260923/collections-060/src/components/MarkdownNoteEditor.tsx";
var AUTOSAVE_DELAY_MS = 300;
var MAX_EMBEDDED_IMAGE_BYTES = 35e4;
var MAX_NOTE_MARKDOWN_CHARACTERS = 15e5;
var EMBEDDED_IMAGE_TYPES = /* @__PURE__ */ new Set([
	"image/png",
	"image/jpeg",
	"image/gif",
	"image/webp"
]);
/** Milkdown's uploader is a label; ProseMirror can cancel its default activation.
* Keep the existing input/change callback and activate it synchronously in the user gesture. */
function bindNotebookImageChooser(root, current, readOnly) {
	const labelFor = (event) => event.target instanceof Element ? event.target.closest(".milkdown-image-block label.uploader,.milkdown-image-inline label.uploader") : null;
	const inputFor = (label) => {
		const id = label.getAttribute("for"), input = id ? root.ownerDocument.getElementById(id) : null;
		return input instanceof HTMLInputElement && input.type === "file" && root.contains(input) ? input : null;
	};
	const decorate = () => {
		for (const label of root.querySelectorAll(".milkdown-image-block label.uploader,.milkdown-image-inline label.uploader")) {
			const input = inputFor(label), disabled = !current() || readOnly() || !input || input.disabled;
			label.setAttribute("role", "button");
			label.setAttribute("aria-label", "Choisir une image");
			label.setAttribute("title", "Choisir une image sur cet appareil");
			label.setAttribute("aria-disabled", String(disabled));
			label.tabIndex = disabled ? -1 : 0;
		}
	};
	const open = (event, label) => {
		event.preventDefault();
		event.stopPropagation();
		const input = inputFor(label);
		if (!current() || readOnly() || !input || input.disabled) return;
		input.click();
	};
	const click = (event) => {
		const label = labelFor(event);
		if (label && root.contains(label)) open(event, label);
	};
	const keydown = (event) => {
		if (event.key !== "Enter" && event.key !== " ") return;
		const label = labelFor(event);
		if (label && root.contains(label)) open(event, label);
	};
	const pointer = (event) => {
		const label = labelFor(event);
		if (label && root.contains(label)) event.stopPropagation();
	};
	root.addEventListener("click", click, true);
	root.addEventListener("keydown", keydown, true);
	root.addEventListener("mousedown", pointer, true);
	root.addEventListener("pointerdown", pointer, true);
	const observer = new MutationObserver(decorate);
	observer.observe(root, {
		subtree: true,
		childList: true,
		attributes: true,
		attributeFilter: ["disabled"]
	});
	decorate();
	return () => {
		observer.disconnect();
		root.removeEventListener("click", click, true);
		root.removeEventListener("keydown", keydown, true);
		root.removeEventListener("mousedown", pointer, true);
		root.removeEventListener("pointerdown", pointer, true);
	};
}
function fileAsDataUrl(file) {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.addEventListener("load", () => {
			if (typeof reader.result === "string") resolve(reader.result);
			else reject(/* @__PURE__ */ new Error("L’image n’a pas pu être lue."));
		}, { once: true });
		reader.addEventListener("error", () => reject(/* @__PURE__ */ new Error("L’image n’a pas pu être lue.")), { once: true });
		reader.readAsDataURL(file);
	});
}
function MarkdownNoteEditor({ noteId, initialMarkdown, externalMarkdown, documentSnapshot, onChange, media, paperTools, onUploadImage, readOnly = false, flowEditing = false, onCaretPosition }) {
	const ownerKey = JSON.stringify([
		media?.accountId ?? null,
		media?.spaceId ?? null,
		noteId,
		documentSnapshot?.noteId ?? null
	]), ownerRef = useRef(ownerKey), mediaApiRef = useRef(media?.api);
	ownerRef.current = ownerKey;
	mediaApiRef.current = media?.api;
	const baselineRef = useRef(documentSnapshot), snapshotRef = useRef(documentSnapshot);
	snapshotRef.current = documentSnapshot;
	const crepeRef = useRef(null);
	const createdRef = useRef(false);
	const caretRef = useRef(onCaretPosition);
	caretRef.current = onCaretPosition;
	const readonlyRef = useRef(readOnly);
	readonlyRef.current = readOnly;
	const lastPersistedRef = useRef(initialMarkdown);
	const lastExternalRef = useRef(externalMarkdown ?? initialMarkdown);
	const toolsRoot = useRef(null);
	const toolsRef = useRef(paperTools);
	toolsRef.current = paperTools;
	const imageUploadRef = useRef(onUploadImage);
	imageUploadRef.current = onUploadImage;
	const imageInsertRef = useRef(null);
	const rootRef = useRef(null);
	const onChangeRef = useRef(onChange);
	const pendingMarkdownRef = useRef(null);
	const saveTimerRef = useRef(null);
	const [isReady, setIsReady] = useState(false);
	const [reconcileTick, setReconcileTick] = useState(0);
	const [error, setError] = useState(null);
	const [creationFailed, setCreationFailed] = useState(false);
	const [retryKey, setRetryKey] = useState(0);
	const [fallbackMarkdown, setFallbackMarkdown] = useState(initialMarkdown);
	useEffect(() => {
		onChangeRef.current = onChange;
	}, [onChange]);
	useEffect(() => {
		if (isReady) crepeRef.current?.setReadonly(readOnly);
	}, [readOnly, isReady]);
	useEffect(() => {
		if (toolsRoot.current && paperTools) toolsRoot.current.render(/* @__PURE__ */ jsxDEV(NotePaperTools, {
			tools: paperTools,
			readOnly,
			onImage: (file) => imageInsertRef.current?.(file) ?? Promise.resolve()
		}, void 0, false, {
			fileName: _jsxFileName,
			lineNumber: 105,
			columnNumber: 76
		}, this));
	}, [paperTools, readOnly]);
	useEffect(() => {
		if (!isReady || externalMarkdown === void 0 || externalMarkdown === lastExternalRef.current) return;
		const crepe = crepeRef.current;
		if (!crepe || !createdRef.current) return;
		const current = crepe.getMarkdown();
		const view = crepe.editor.action((ctx) => ctx.get(editorViewCtx));
		if (pendingMarkdownRef.current !== null || view.composing || current !== lastPersistedRef.current) return;
		if (current !== externalMarkdown) {
			const viewport = view.dom.closest(".paper-viewport"), top = viewport?.scrollTop, left = viewport?.scrollLeft;
			try {
				crepe.editor.action((ctx) => {
					const parsed = ctx.get(parserCtx)(externalMarkdown);
					if (!parsed) throw Error("Le texte reçu ne peut pas être interprété.");
					const tr = remotePaperEditorTransaction(view.state, parsed);
					if (tr) view.dispatch(tr);
				});
			} catch (caught) {
				setError(String(caught instanceof Error ? caught.message : caught));
				return;
			}
			if (viewport && top !== void 0 && left !== void 0) {
				viewport.scrollTop = top;
				viewport.scrollLeft = left;
			}
		}
		lastExternalRef.current = externalMarkdown;
		lastPersistedRef.current = crepe.getMarkdown();
		baselineRef.current = snapshotRef.current;
	}, [
		externalMarkdown,
		isReady,
		reconcileTick
	]);
	useLayoutEffect(() => {
		const root = rootRef.current;
		if (!root) return;
		let disposed = false;
		let created = false;
		let crepe = null;
		const capturedOwner = ownerKey, logicalNoteId = documentSnapshot?.noteId, ownerCurrent = () => ownerRef.current === capturedOwner;
		const releaseImageChooser = bindNotebookImageChooser(root, () => !disposed && ownerCurrent(), () => readonlyRef.current);
		lastPersistedRef.current = initialMarkdown;
		lastExternalRef.current = externalMarkdown ?? initialMarkdown;
		baselineRef.current = documentSnapshot;
		pendingMarkdownRef.current = null;
		createdRef.current = false;
		setFallbackMarkdown(initialMarkdown);
		setIsReady(false);
		setError(null);
		setCreationFailed(false);
		root.replaceChildren();
		const flush = () => {
			if (saveTimerRef.current !== null) {
				window.clearTimeout(saveTimerRef.current);
				saveTimerRef.current = null;
			}
			if (!created) return;
			let markdown = pendingMarkdownRef.current;
			if (created && crepe) markdown = crepe.getMarkdown();
			if (markdown === null || markdown === lastPersistedRef.current) {
				pendingMarkdownRef.current = null;
				return;
			}
			if (!ownerCurrent()) {
				if (media) putSnapshot({
					key: `paper-editor-recovery|${media.accountId}|${media.spaceId}|${noteId}|${crypto.randomUUID()}`,
					accountId: media.accountId,
					spaceId: media.spaceId,
					value: {
						schema: 1,
						kind: "paper-editor-buffer",
						noteId: logicalNoteId ?? null,
						editorId: noteId,
						markdown,
						baseline: baselineRef.current,
						createdAt: (/* @__PURE__ */ new Date()).toISOString()
					}
				}).catch(() => {});
				return;
			}
			const result = onChangeRef.current(markdown, baselineRef.current);
			if (result === false) {
				pendingMarkdownRef.current = markdown;
				setError("Votre texte reste dans l’éditeur ; son enregistrement doit être repris.");
				return;
			}
			pendingMarkdownRef.current = null;
			lastPersistedRef.current = markdown;
			if (result && typeof result === "object" && "notebookSchema" in result && result.notebookSchema === 3) baselineRef.current = result;
			if (!disposed) setReconcileTick((t) => t + 1);
		};
		const flushPaper = (event) => {
			const prefix = event.detail?.prefix;
			if (prefix && noteId.startsWith(prefix)) flush();
		};
		window.addEventListener("dowze:paper-flush", flushPaper);
		const scheduleSave = (markdown) => {
			if (disposed || !ownerCurrent()) return;
			pendingMarkdownRef.current = markdown;
			if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
			saveTimerRef.current = window.setTimeout(flush, AUTOSAVE_DELAY_MS);
		};
		const uploadEmbeddedImage = async (file) => {
			if (disposed || !ownerCurrent()) throw Error("Le carnet a changé avant l’ajout de l’image.");
			if (imageUploadRef.current) {
				const src = await imageUploadRef.current(file);
				if (disposed || !ownerCurrent()) throw Error("Le carnet a changé pendant l’ajout de l’image. L’original reste conservé.");
				return src;
			}
			if (documentSnapshot && media) throw Error("L’ajout d’image attend la préparation de son fichier dans ce carnet. Réessayez après son ouverture.");
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
			if ((created && crepe ? crepe.getMarkdown() : initialMarkdown).length + Math.ceil(file.size * 4 / 3) > MAX_NOTE_MARKDOWN_CHARACTERS) {
				const message = "Cette note approche la capacité locale. Exporte-la en .md puis crée une nouvelle note avant d’ajouter cette image.";
				setError(message);
				throw new Error(message);
			}
			setError(null);
			const src = await fileAsDataUrl(file);
			if (disposed || !ownerCurrent()) throw Error("Le carnet a changé pendant la lecture de l’image.");
			return src;
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
				[Crepe.Feature.TopBar]: { headingOptions: [
					{
						label: "Paragraphe",
						level: null
					},
					{
						label: "Titre 1",
						level: 1
					},
					{
						label: "Titre 2",
						level: 2
					},
					{
						label: "Titre 3",
						level: 3
					},
					{
						label: "Titre 4",
						level: 4
					},
					{
						label: "Titre 5",
						level: 5
					},
					{
						label: "Titre 6",
						level: 6
					}
				] },
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
				[Crepe.Feature.Latex]: { katexOptions: {
					throwOnError: false,
					trust: false
				} },
				[Crepe.Feature.ImageBlock]: {
					blockUploadButton: "Choisir une image",
					inlineUploadButton: "Choisir une image",
					blockUploadPlaceholderText: "Ou coller le lien d’une image…",
					inlineUploadPlaceholderText: "Ou coller le lien d’une image…",
					blockCaptionPlaceholderText: "Description de l’image",
					onUpload: uploadEmbeddedImage,
					inlineOnUpload: uploadEmbeddedImage,
					blockOnUpload: uploadEmbeddedImage
				}
			}
		});
		if (flowEditing) crepe.editor.use(paperCodeView).use(paperCodeDecorations);
		crepeRef.current = crepe;
		if (media) crepe.editor.use(notePhotoPlugins(media, {
			getDocument: () => snapshotRef.current,
			current: () => !disposed && ownerCurrent() && mediaApiRef.current === media.api && snapshotRef.current?.noteId === logicalNoteId
		}));
		if (readOnly) crepe.setReadonly(true);
		crepe.on((listener) => {
			listener.selectionUpdated((ctx) => {
				if (!flowEditing) return;
				requestAnimationFrame(() => {
					if (disposed || !created) return;
					const view = ctx.get(editorViewCtx), body = root.closest(".paper-flow-source");
					if (!body || view.composing || !view.hasFocus()) return;
					try {
						const box = body.getBoundingClientRect(), coordinates = view.coordsAtPos(view.state.selection.head), object = body.closest(".paper-object"), page = body.closest(".paper-page"), turn = new DOMMatrix(object ? getComputedStyle(object).transform : void 0), zoom = new DOMMatrix(page ? getComputedStyle(page).transform : void 0);
						caretRef.current?.(paperTextCaretY({
							x: box.left + box.width / 2,
							y: box.top + box.height / 2,
							height: body.offsetHeight
						}, {
							x: (coordinates.left + coordinates.right) / 2,
							y: (coordinates.top + coordinates.bottom) / 2
						}, Math.atan2(turn.b, turn.a) * 180 / Math.PI, Math.hypot(zoom.a, zoom.b)));
					} catch {}
				});
			});
			listener.markdownUpdated((_, markdown, previousMarkdown) => {
				if (created && !disposed && markdown !== previousMarkdown && markdown !== lastPersistedRef.current) scheduleSave(markdown);
			});
			listener.blur(flush);
		});
		const compositionFinished = () => {
			if (!disposed) setReconcileTick((t) => t + 1);
		};
		root.addEventListener("compositionend", compositionFinished);
		const unregisterWriter = media ? registerNotebookWriter(media.accountId, {
			flush,
			settled: async () => {
				if (pendingMarkdownRef.current !== null || created && crepe && crepe.getMarkdown() !== lastPersistedRef.current) throw Error("Le texte visible doit être enregistré avant de fermer la fenêtre.");
			},
			pending: () => !!pendingMarkdownRef.current || created && !!crepe && crepe.getMarkdown() !== lastPersistedRef.current,
			suspend: () => crepe?.setReadonly(true),
			resume: () => crepe?.setReadonly(readonlyRef.current)
		}) : () => {};
		const refreshBeforeLeaving = () => flush();
		window.addEventListener("pagehide", refreshBeforeLeaving);
		crepe.create().then(() => {
			created = true;
			createdRef.current = true;
			if (disposed || !ownerCurrent()) return crepe.destroy();
			const editable = root.querySelector("[contenteditable='true']");
			editable?.setAttribute("aria-label", "Éditeur Markdown de la note");
			editable?.setAttribute("lang", "fr");
			editable?.setAttribute("role", "textbox");
			editable?.setAttribute("aria-multiline", "true");
			editable?.setAttribute("spellcheck", "true");
			const toolbarLabels = [
				"Style de paragraphe",
				"Gras",
				"Italique",
				"Barré",
				"Code en ligne",
				"Liste à puces",
				"Liste numérotée",
				"Liste de tâches",
				"Ajouter un lien",
				"Ajouter une image",
				"Insérer un tableau",
				"Bloc de code",
				"Formule mathématique",
				"Citation",
				"Séparateur"
			];
			root.querySelectorAll(".milkdown-top-bar button").forEach((button, index) => {
				const label = toolbarLabels[index] ?? `Outil Markdown ${index + 1}`;
				if (!button.getAttribute("aria-label")) button.setAttribute("aria-label", label);
				button.setAttribute("title", label);
				button.dataset.tooltip = label;
				button.dataset.noteFormat = String(index);
			});
			if (toolsRef.current) {
				const toolbar = root.querySelector(".milkdown-top-bar");
				if (toolbar) {
					toolbar.classList.add("note-unified-toolbar");
					const originalImage = toolbar.querySelector("button[aria-label=\"Ajouter une image\"]");
					if (originalImage) originalImage.style.display = "none";
					const slot = document.createElement("div");
					slot.className = "note-paper-tools-slot";
					toolbar.appendChild(slot);
					toolsRoot.current = createRoot(slot);
					imageInsertRef.current = async (file) => {
						try {
							const src = await uploadEmbeddedImage(file);
							if (disposed || !crepe) return;
							crepe.editor.action(insert(`![${file.name.replace(/[\[\]\\]/g, "")}](${src})\n\n`));
							crepe.editor.action((ctx) => ctx.get(editorViewCtx).focus());
							setError(null);
						} catch (error) {
							if (!disposed) setError(error instanceof Error ? error.message : String(error));
						}
					};
					toolsRoot.current.render(/* @__PURE__ */ jsxDEV(NotePaperTools, {
						tools: toolsRef.current,
						readOnly,
						onImage: (file) => imageInsertRef.current?.(file) ?? Promise.resolve()
					}, void 0, false, {
						fileName: _jsxFileName,
						lineNumber: 342,
						columnNumber: 38
					}, this));
				}
			}
			if (flowEditing) {
				const toolbar = root.querySelector(".milkdown-top-bar"), slot = root.closest(".paper-notebook")?.querySelector(".paper-flow-toolbar-slot");
				if (toolbar && slot) slot.appendChild(toolbar);
			}
			lastPersistedRef.current = crepe.getMarkdown();
			setIsReady(true);
		}).catch((caught) => {
			if (!disposed) {
				setCreationFailed(true);
				setError(`Impossible de charger l’éditeur Markdown : ${caught instanceof Error ? caught.message : String(caught)}`);
			}
		});
		return () => {
			disposed = true;
			releaseImageChooser();
			window.removeEventListener("dowze:paper-flush", flushPaper);
			window.removeEventListener("pagehide", refreshBeforeLeaving);
			root.removeEventListener("compositionend", compositionFinished);
			unregisterWriter();
			flush();
			createdRef.current = false;
			crepeRef.current = null;
			const nested = toolsRoot.current;
			toolsRoot.current = null;
			imageInsertRef.current = null;
			if (nested) queueMicrotask(() => nested.unmount());
			if (created) crepe.destroy().catch(() => void 0);
		};
	}, [
		noteId,
		retryKey,
		media?.accountId,
		media?.spaceId,
		media?.api,
		documentSnapshot?.noteId
	]);
	return /* @__PURE__ */ jsxDEV("div", {
		className: "markdown-editor-shell studio-tools",
		children: [
			/* @__PURE__ */ jsxDEV("div", {
				className: "studio-editor-help",
				children: [/* @__PURE__ */ jsxDEV("span", { children: "Écrivez et structurez vos idées" }, void 0, false, {
					fileName: _jsxFileName,
					lineNumber: 372,
					columnNumber: 93
				}, this), /* @__PURE__ */ jsxDEV("small", { children: "Sélectionnez du texte pour le mettre en forme · / pour insérer un bloc" }, void 0, false, {
					fileName: _jsxFileName,
					lineNumber: 372,
					columnNumber: 137
				}, this)]
			}, void 0, true, {
				fileName: _jsxFileName,
				lineNumber: 372,
				columnNumber: 57
			}, this),
			!isReady && !error && /* @__PURE__ */ jsxDEV("div", {
				className: "markdown-editor-loading",
				role: "status",
				children: [/* @__PURE__ */ jsxDEV(LoaderCircle, {}, void 0, false, {
					fileName: _jsxFileName,
					lineNumber: 375,
					columnNumber: 11
				}, this), " Chargement de l’éditeur…"]
			}, void 0, true, {
				fileName: _jsxFileName,
				lineNumber: 374,
				columnNumber: 9
			}, this),
			error && /* @__PURE__ */ jsxDEV("div", {
				className: "markdown-editor-error",
				role: "alert",
				children: [
					/* @__PURE__ */ jsxDEV(AlertCircle, {}, void 0, false, {
						fileName: _jsxFileName,
						lineNumber: 380,
						columnNumber: 11
					}, this),
					" ",
					/* @__PURE__ */ jsxDEV("span", { children: error }, void 0, false, {
						fileName: _jsxFileName,
						lineNumber: 380,
						columnNumber: 27
					}, this),
					/* @__PURE__ */ jsxDEV("button", {
						type: "button",
						onClick: () => {
							if (creationFailed) setRetryKey((value) => value + 1);
							else setError(null);
						},
						"aria-label": creationFailed ? "Réessayer de charger l’éditeur" : "Fermer l’erreur",
						children: creationFailed ? "Réessayer" : "×"
					}, void 0, false, {
						fileName: _jsxFileName,
						lineNumber: 381,
						columnNumber: 11
					}, this)
				]
			}, void 0, true, {
				fileName: _jsxFileName,
				lineNumber: 379,
				columnNumber: 9
			}, this),
			creationFailed && /* @__PURE__ */ jsxDEV("label", {
				className: "form-field",
				children: [
					/* @__PURE__ */ jsxDEV("span", { children: "Édition en texte Markdown" }, void 0, false, {
						fileName: _jsxFileName,
						lineNumber: 394,
						columnNumber: 9
					}, this),
					/* @__PURE__ */ jsxDEV("small", { children: "Vous pouvez continuer à écrire ici et enregistrer votre note pendant que l’éditeur est indisponible." }, void 0, false, {
						fileName: _jsxFileName,
						lineNumber: 395,
						columnNumber: 9
					}, this),
					/* @__PURE__ */ jsxDEV("textarea", {
						"aria-label": "Contenu Markdown de la note",
						value: fallbackMarkdown,
						readOnly,
						rows: 16,
						maxLength: MAX_NOTE_MARKDOWN_CHARACTERS,
						spellCheck: true,
						onChange: (event) => {
							const markdown = event.target.value;
							setFallbackMarkdown(markdown);
							pendingMarkdownRef.current = markdown;
							const result = onChangeRef.current(markdown, baselineRef.current);
							if (result === false) {
								setError("Votre texte est conservé dans l’éditeur ; son enregistrement doit être repris.");
								return;
							}
							pendingMarkdownRef.current = null;
							lastPersistedRef.current = markdown;
							if (result && typeof result === "object" && "notebookSchema" in result && result.notebookSchema === 3) baselineRef.current = result;
						}
					}, void 0, false, {
						fileName: _jsxFileName,
						lineNumber: 396,
						columnNumber: 9
					}, this)
				]
			}, void 0, true, {
				fileName: _jsxFileName,
				lineNumber: 393,
				columnNumber: 26
			}, this),
			/* @__PURE__ */ jsxDEV("div", {
				className: "markdown-editor-root",
				ref: rootRef,
				"data-note-id": noteId
			}, void 0, false, {
				fileName: _jsxFileName,
				lineNumber: 402,
				columnNumber: 7
			}, this)
		]
	}, void 0, true, {
		fileName: _jsxFileName,
		lineNumber: 372,
		columnNumber: 5
	}, this);
}
//#endregion
export { bindNotebookImageChooser, MarkdownNoteEditor as default };
