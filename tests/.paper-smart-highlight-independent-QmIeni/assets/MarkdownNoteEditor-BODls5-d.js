import { a as paperImageDimensions, f as validPaperImageRatio, i as paperImageAvailableWidth, l as paperImageRatioMarker, o as paperImageFrameHeight, s as paperImageOverlayPlacement } from "./paperTextSourceMap-0-Y9Psk7.js";
import { a as isPaperDocument, g as notebookDocumentId } from "./notebookDocument-yuVu6oXC.js";
import { S as putSnapshot, d as getDraft } from "./storage-Dsyjb46q.js";
import { r as resolvePaperPhotoReference } from "./paperAssets-CggUOk-G.js";
import { E as paperCodeRanges, T as loadPaperCodeLanguage, w as PaperAssetImage, x as registerNotebookWriter } from "../smart-highlight-independent.mjs";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Fragment, jsxDEV } from "react/jsx-dev-runtime";
import { AlertCircle, Eraser, Highlighter, ImagePlus, LoaderCircle, MoreHorizontal, Pencil, Redo2, Type, Undo2 } from "lucide-react";
import { createRoot } from "react-dom/client";
import { createTimer } from "@milkdown/kit/ctx";
import { editorViewCtx, editorViewTimerCtx, nodeViewCtx, parserCtx } from "@milkdown/kit/core";
import { $node, $prose, $remark, $view, insert } from "@milkdown/kit/utils";
import { Plugin, PluginKey, TextSelection } from "@milkdown/kit/prose/state";
import { Decoration, DecorationSet } from "@milkdown/kit/prose/view";
import { imageBlockConfig, imageBlockSchema } from "@milkdown/kit/component/image-block";
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
function PrivateNoteImage({ src, alt, title, ratio, media, context, onReady }) {
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
		imageRatio: ratio,
		onReady,
		current: () => latest.current.context?.current() ?? false
	}, void 0, false, {
		fileName: _jsxFileName$2,
		lineNumber: 31,
		columnNumber: 27
	}, this) : /* @__PURE__ */ jsxDEV("span", {
		role: "status",
		className: "paper-asset-missing note-photo-pending",
		"data-image-error": visible?.error ? "true" : void 0,
		children: visible?.error || "Chargement de l’image…"
	}, void 0, false, {
		fileName: _jsxFileName$2,
		lineNumber: 31,
		columnNumber: 315
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
			title: { default: null },
			ratio: { default: 1 },
			ratioPresent: { default: false }
		},
		parseDOM: [{
			tag: "img[data-dowze-photo]",
			getAttrs: (dom) => ({
				src: dom.dataset.dowzePhoto,
				alt: dom.getAttribute("alt") ?? "",
				title: dom.getAttribute("title"),
				ratio: validPaperImageRatio(Number(dom.dataset.dowzeRatio)) ? Number(dom.dataset.dowzeRatio) : 1,
				ratioPresent: dom.hasAttribute("data-dowze-ratio")
			})
		}],
		toDOM: (node) => ["img", {
			"data-dowze-photo": node.attrs.src,
			alt: node.attrs.alt,
			title: node.attrs.title,
			"data-dowze-ratio": node.attrs.ratio
		}],
		parseMarkdown: {
			match: (node) => node.type === "dowze-note-photo",
			runner: (state, node, type) => {
				state.addNode(type, {
					src: node.url,
					alt: node.alt ?? "",
					title: node.title ?? null,
					ratio: validPaperImageRatio(node.dowzeImageRatio) ? node.dowzeImageRatio : 1,
					ratioPresent: node.dowzeImageRatio !== void 0
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
				if (node.attrs.ratio !== 1 || node.attrs.ratioPresent) state.addNode("html", void 0, `<!-- dowze-image-size:v1 ratio=${validPaperImageRatio(node.attrs.ratio) ? node.attrs.ratio : 1} -->`);
			}
		}
	}));
	const view = $view(node, () => (initial, editor, getPos) => {
		const dom = document.createElement("span"), imageHost = document.createElement("span"), controls = document.createElement("span"), details = document.createElement("span"), resizeButton = document.createElement("button"), edit = document.createElement("button"), description = document.createElement("input"), caption = document.createElement("input");
		dom.className = "note-photo-node";
		dom.contentEditable = "false";
		controls.className = "image-edit note-photo-controls";
		imageHost.className = "note-photo-image";
		details.className = "note-photo-details";
		details.hidden = true;
		resizeButton.type = "button";
		resizeButton.className = "image-resize-handle";
		resizeButton.setAttribute("aria-label", "Redimensionner l’image");
		resizeButton.style.touchAction = "none";
		resizeButton.style.minWidth = "44px";
		resizeButton.style.minHeight = "44px";
		edit.type = "button";
		edit.textContent = "Description";
		edit.setAttribute("aria-label", "Modifier la description de l’image");
		description.setAttribute("aria-label", "Description de l’image");
		caption.setAttribute("aria-label", "Légende et titre de l’image");
		details.append(description, caption);
		controls.append(edit, resizeButton, details);
		dom.append(imageHost, controls);
		const root = createRoot(imageHost);
		let alive = true, current = initial, resize = null;
		const active = () => alive && (context?.current() ?? false) && editor.editable;
		const dimensions = (ratio) => {
			const image = imageHost.querySelector("img");
			return image ? paperImageDimensions(image.naturalWidth, image.naturalHeight, paperImageAvailableWidth(image), ratio, paperImageFrameHeight(image)) : void 0;
		};
		const positionControls = () => {
			const image = imageHost.querySelector("img");
			if (!image) return;
			const control = paperImageOverlayPlacement(image, 160), detail = paperImageOverlayPlacement(image, 320);
			if (control && detail) {
				dom.style.setProperty("--paper-photo-control-left", control.left + "px");
				dom.style.setProperty("--paper-photo-detail-left", detail.left - control.left + "px");
				dom.style.setProperty("--paper-photo-detail-width", detail.width + "px");
				controls.style.width = control.width + "px";
				controls.style.maxWidth = control.width + "px";
			}
			const clip = dom.closest(".paper-flow-clip");
			if (!clip) return;
			try {
				const box = dom.getBoundingClientRect(), frame = clip.getBoundingClientRect(), object = dom.closest(".paper-object"), page = dom.closest(".paper-page"), turn = new DOMMatrix(object ? getComputedStyle(object).transform : void 0), zoom = new DOMMatrix(page ? getComputedStyle(page).transform : void 0), angle = Math.atan2(turn.b, turn.a), scale = Math.hypot(zoom.a, zoom.b) || 1, dx = box.left + box.width / 2 - frame.left - frame.width / 2, dy = box.top + box.height / 2 - frame.top - frame.height / 2, height = clip.offsetHeight, y = height / 2 + (-Math.sin(angle) * dx + Math.cos(angle) * dy) / scale - dom.offsetHeight / 2, overlayHeight = 44 + (details.hidden ? 0 : details.scrollHeight || 80), top = y >= 0 && y < height ? Math.max(-y, Math.min(0, height - y - overlayHeight)) : 0;
				controls.style.setProperty("top", top + "px", "important");
			} catch {}
		};
		const paint = () => {
			positionControls();
			const image = imageHost.querySelector("img");
			if (image) {
				image.dataset.dowzePhoto = current.attrs.src;
				image.dataset.dowzeRatio = String(current.attrs.ratio);
			}
			if (document.activeElement !== description) description.value = current.attrs.alt;
			if (document.activeElement !== caption) caption.value = current.attrs.title ?? "";
			for (const control of [
				edit,
				description,
				caption
			]) control.disabled = !active();
			resizeButton.disabled = !active() || !dimensions(current.attrs.ratio);
		};
		const fit = (ratio) => {
			const image = imageHost.querySelector("img"), size = dimensions(ratio);
			if (!image || !size) return;
			image.style.height = size.height + "px";
			image.style.width = size.width + "px";
			image.style.setProperty("--paper-image-height", image.style.height);
		};
		const render = (ratio = current.attrs.ratio) => {
			if (!alive) return;
			const capturedSrc = current.attrs.src, viewContext = context ? {
				getDocument: () => context.getDocument(),
				current: () => alive && current.attrs.src === capturedSrc && context.current()
			} : void 0;
			root.render(/* @__PURE__ */ jsxDEV(PrivateNoteImage, {
				src: capturedSrc,
				alt: current.attrs.alt,
				title: current.attrs.title,
				ratio,
				media,
				context: viewContext,
				onReady: () => {
					if (alive) {
						paint();
						fit(resize?.nextRatio ?? current.attrs.ratio);
					}
				}
			}, void 0, false, {
				fileName: _jsxFileName$2,
				lineNumber: 55,
				columnNumber: 258
			}, this));
			paint();
		};
		const set = (attrs) => {
			if (!active()) return;
			const pos = getPos();
			if (pos === void 0) return;
			const actual = editor.state.doc.nodeAt(pos);
			if (!actual || actual.type !== initial.type || actual.attrs.src !== current.attrs.src) return;
			editor.dispatch(editor.state.tr.setNodeMarkup(pos, void 0, {
				...actual.attrs,
				...attrs
			}));
		};
		const release = () => {
			const gesture = resize;
			resize = null;
			if (!gesture) return;
			try {
				if (resizeButton.hasPointerCapture(gesture.id)) resizeButton.releasePointerCapture(gesture.id);
			} catch {}
		};
		const cancel = () => {
			release();
			fit(current.attrs.ratio);
			render();
		};
		edit.addEventListener("click", () => {
			if (!active()) return;
			details.hidden = !details.hidden;
			positionControls();
			if (!details.hidden) description.focus();
		});
		description.addEventListener("input", () => set({ alt: description.value }));
		caption.addEventListener("input", () => set({ title: caption.value || null }));
		resizeButton.addEventListener("pointerdown", (event) => {
			const size = dimensions(current.attrs.ratio);
			if (!active() || !size || event.button !== 0 || resize) return;
			event.preventDefault();
			event.stopPropagation();
			try {
				resizeButton.setPointerCapture(event.pointerId);
			} catch {
				return;
			}
			let angle = 0, scale = 1;
			try {
				const object = dom.closest(".paper-object"), page = dom.closest(".paper-page"), turn = new DOMMatrix(object ? getComputedStyle(object).transform : void 0), zoom = new DOMMatrix(page ? getComputedStyle(page).transform : void 0);
				angle = Math.atan2(turn.b, turn.a);
				scale = Math.hypot(zoom.a, zoom.b) || 1;
			} catch {}
			resize = {
				id: event.pointerId,
				x: event.clientX,
				y: event.clientY,
				base: size.baseHeight,
				height: size.height,
				ratio: current.attrs.ratio,
				nextRatio: current.attrs.ratio,
				src: current.attrs.src,
				angle,
				scale
			};
		});
		resizeButton.addEventListener("pointermove", (event) => {
			if (!resize || resize.id !== event.pointerId) return;
			event.preventDefault();
			event.stopPropagation();
			if (!active() || resize.src !== current.attrs.src || dimensions(current.attrs.ratio)?.baseHeight !== resize.base) {
				cancel();
				return;
			}
			const delta = (-Math.sin(resize.angle) * (event.clientX - resize.x) + Math.cos(resize.angle) * (event.clientY - resize.y)) / resize.scale;
			if (!delta) return;
			const requested = Math.max(16, resize.height + delta), size = dimensions(Math.min(1e4, requested / resize.base));
			if (!size) return;
			resize.nextRatio = size.height / resize.base;
			fit(resize.nextRatio);
			render(resize.nextRatio);
		});
		resizeButton.addEventListener("pointerup", (event) => {
			if (!resize || resize.id !== event.pointerId) return;
			event.preventDefault();
			event.stopPropagation();
			const gesture = resize;
			release();
			if (active() && gesture.src === current.attrs.src && dimensions(current.attrs.ratio)?.baseHeight === gesture.base) set({ ratio: gesture.nextRatio });
			else render();
		});
		resizeButton.addEventListener("pointercancel", cancel);
		resizeButton.addEventListener("lostpointercapture", () => {
			if (resize) cancel();
		});
		resizeButton.addEventListener("keydown", (event) => {
			if (!active() || ![
				"ArrowUp",
				"ArrowDown",
				"Home"
			].includes(event.key)) return;
			event.preventDefault();
			set({ ratio: event.key === "Home" ? 1 : Math.min(1e4, Math.max(.05, current.attrs.ratio + (event.key === "ArrowUp" ? .1 : -.1))) });
		});
		render();
		return {
			dom,
			update(next) {
				if (next.type !== initial.type) return false;
				if (next.attrs.src !== current.attrs.src || next.attrs.ratio !== current.attrs.ratio) release();
				current = next;
				render();
				return true;
			},
			ignoreMutation: () => true,
			stopEvent: (event) => event.target instanceof Element && !!event.target.closest("input,button"),
			selectNode: () => dom.classList.add("is-selected"),
			deselectNode: () => dom.classList.remove("is-selected"),
			destroy: () => {
				alive = false;
				release();
				queueMicrotask(() => root.unmount());
			}
		};
	});
	const remark = $remark("dowze-private-photo", () => () => (tree) => {
		const walk = (parent) => {
			if (!Array.isArray(parent.children)) return;
			for (let index = 0; index < parent.children.length; index++) {
				let child = parent.children[index];
				const image = child.type === "paragraph" && child.children?.length === 1 ? child.children[0] : child, following = parent.children[index + 1], html = following?.type === "paragraph" && following.children?.length === 1 ? following.children[0] : following, ratio = html?.type === "html" ? paperImageRatioMarker(html.value) : void 0;
				if ([
					"image",
					"image-block",
					"dowze-note-photo"
				].includes(image.type) && privateImage(image.url) && ratio !== void 0) {
					image.dowzeImageRatio = ratio;
					parent.children.splice(index + 1, 1);
				}
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
			}
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
				title: n.attrs.title ?? null,
				ratio: validPaperImageRatio(n.attrs.ratio) ? n.attrs.ratio : 1,
				ratioPresent: n.attrs.ratioPresent === true
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
var imageRatio = (value) => typeof value === "number" && Number.isFinite(value) && value > 0 && value <= 1e4 ? value : 1;
/** Installed Crepe stores its resize ratio in Markdown alt. Keep a real alt,
* title and independent size metadata; ordinary text edits never manufacture 1.00. */
function configureNotebookImageBlocks(editor, current = () => true) {
	editor.config((ctx) => ctx.update(imageBlockSchema.key, (previous) => (schemaContext) => {
		const base = previous(schemaContext);
		return {
			...base,
			attrs: {
				...base.attrs,
				alt: { default: "" },
				title: { default: null },
				sourceCaption: { default: "" },
				ratioPresent: { default: false }
			},
			parseDOM: [{
				tag: "img[data-type=\"image-block\"]",
				getAttrs: (dom) => {
					const image = dom, title = image.getAttribute("title"), alt = image.getAttribute("alt") ?? "", ratio = imageRatio(Number(image.getAttribute("data-dowze-ratio") ?? 1));
					return {
						src: image.getAttribute("src") ?? "",
						alt,
						title,
						caption: title ?? "",
						sourceCaption: title ?? "",
						ratio,
						ratioPresent: image.hasAttribute("data-dowze-ratio")
					};
				}
			}],
			toDOM: (node) => ["img", {
				"data-type": "image-block",
				src: node.attrs.src,
				alt: node.attrs.alt,
				title: node.attrs.caption !== node.attrs.sourceCaption ? node.attrs.caption || null : node.attrs.title,
				"data-dowze-ratio": node.attrs.ratio
			}],
			parseMarkdown: {
				match: base.parseMarkdown.match,
				runner: (state, node, type) => {
					const alt = typeof node.alt === "string" ? node.alt : "", title = typeof node.title === "string" ? node.title : null, ratio = imageRatio(node.dowzeImageRatio);
					state.addNode(type, {
						src: node.url,
						alt,
						title,
						caption: title ?? "",
						sourceCaption: title ?? "",
						ratio,
						ratioPresent: node.dowzeImageRatio !== void 0
					});
				}
			},
			toMarkdown: {
				match: base.toMarkdown.match,
				runner: (state, node) => {
					const ratio = imageRatio(node.attrs.ratio), alt = node.attrs.alt, title = node.attrs.caption !== node.attrs.sourceCaption ? node.attrs.caption || null : node.attrs.title;
					state.openNode("paragraph");
					state.addNode("image", void 0, void 0, {
						url: node.attrs.src,
						alt,
						title
					});
					state.closeNode();
					if (ratio !== 1 || node.attrs.ratioPresent) state.addNode("html", void 0, `<!-- dowze-image-size:v1 ratio=${ratio} -->`);
				}
			}
		};
	}));
	const metadata = $remark("dowze-image-size", () => () => (tree) => {
		const walk = (parent) => {
			if (!Array.isArray(parent.children)) return;
			for (let i = 0; i < parent.children.length; i++) {
				const block = parent.children[i], image = block.type === "paragraph" && block.children?.length === 1 && block.children[0].type === "image" ? block.children[0] : block, following = parent.children[i + 1], next = following?.type === "paragraph" && following.children?.length === 1 && following.children[0].type === "html" ? following.children[0] : following, ratio = next?.type === "html" ? paperImageRatioMarker(next.value) : void 0;
				if ((block.type === "image-block" || block.type === "paragraph" && block.children?.length === 1) && ["image", "image-block"].includes(image.type) && ratio !== void 0) {
					parent.children[i] = {
						...image,
						type: "image-block",
						dowzeImageRatio: ratio
					};
					parent.children.splice(i + 1, 1);
				} else walk(block);
			}
		};
		walk(tree);
	});
	const imageView = (ctx) => {
		const ready = createTimer("NotebookImageViewReady"), preceding = [...ctx.get(editorViewTimerCtx)];
		ctx.record(ready);
		ctx.update(editorViewTimerCtx, (timers) => [...timers, ready]);
		return async () => {
			await Promise.all(preceding.map((timer) => ctx.wait(timer)));
			const config = ctx.get(imageBlockConfig.key);
			const constructor = (initial, view, getPos) => {
				let alive = true, node = initial, resize = null;
				const dom = document.createElement("div"), wrapper = document.createElement("div"), image = document.createElement("img"), operations = document.createElement("div"), settings = document.createElement("div"), description = document.createElement("input"), caption = document.createElement("input"), handle = document.createElement("button"), upload = document.createElement("label"), file = document.createElement("input"), link = document.createElement("input"), confirm = document.createElement("button"), edit = document.createElement("button");
				dom.className = "milkdown-image-block";
				dom.contentEditable = "false";
				wrapper.className = "image-wrapper";
				operations.className = "operation";
				settings.className = "image-edit";
				caption.className = "caption-input";
				handle.className = "image-resize-handle";
				upload.className = "uploader";
				image.dataset.type = "image-block";
				description.type = "text";
				description.setAttribute("aria-label", "Description de l’image");
				description.placeholder = "Description de l’image";
				caption.setAttribute("aria-label", "Légende et titre de l’image");
				caption.placeholder = config.captionPlaceholderText;
				handle.type = "button";
				handle.setAttribute("aria-label", "Redimensionner l’image");
				handle.tabIndex = 0;
				handle.style.touchAction = "none";
				handle.style.minWidth = "44px";
				handle.style.minHeight = "44px";
				edit.type = "button";
				edit.textContent = "Description";
				edit.setAttribute("aria-label", "Modifier la description de l’image");
				edit.className = "operation-item";
				file.type = "file";
				file.accept = "image/png,image/jpeg,image/webp,image/gif";
				file.hidden = true;
				file.id = "note-image-" + crypto.randomUUID();
				upload.htmlFor = file.id;
				upload.textContent = config.uploadButton ?? "Choisir une image";
				upload.append(file);
				link.type = "text";
				link.setAttribute("aria-label", "Source de l’image");
				link.placeholder = config.uploadPlaceholderText;
				confirm.type = "button";
				confirm.textContent = "Insérer";
				confirm.setAttribute("aria-label", "Confirmer la source de l’image");
				settings.hidden = true;
				settings.append(description, upload, link, confirm);
				operations.append(edit);
				wrapper.append(image, operations, handle);
				dom.append(wrapper, caption, settings);
				confirm.className = "confirm";
				const active = () => alive && current() && view.editable;
				const set = (attrs) => {
					if (!active()) return;
					const pos = getPos();
					if (pos === void 0) return;
					const actual = view.state.doc.nodeAt(pos);
					if (!actual || actual.type !== initial.type || actual.attrs.src !== node.attrs.src) return;
					view.dispatch(view.state.tr.setNodeMarkup(pos, void 0, {
						...actual.attrs,
						...attrs
					}));
				};
				const paint = () => {
					const title = node.attrs.caption !== node.attrs.sourceCaption ? node.attrs.caption || null : node.attrs.title, alt = node.attrs.alt;
					if (image.getAttribute("src") !== node.attrs.src) image.setAttribute("src", node.attrs.src);
					image.alt = alt;
					image.title = title ?? "";
					image.hidden = !node.attrs.src;
					image.dataset.dowzeRatio = String(node.attrs.ratio);
					if (document.activeElement !== description) description.value = node.attrs.alt;
					if (document.activeElement !== caption) caption.value = node.attrs.caption;
					caption.hidden = !node.attrs.src;
					caption.classList.toggle("hidden", caption.hidden);
					wrapper.classList.toggle("hidden", !node.attrs.src);
					if (!node.attrs.src) wrapper.style.setProperty("display", "none", "important");
					else wrapper.style.removeProperty("display");
					if (!node.attrs.src) settings.hidden = false;
					settings.classList.toggle("hidden", Boolean(settings.hidden));
					link.value = node.attrs.src;
					for (const control of [
						description,
						caption,
						file,
						link,
						confirm,
						edit,
						handle
					]) control.disabled = !active();
					upload.setAttribute("aria-disabled", String(!active()));
				};
				const dimensions = (ratio) => paperImageDimensions(image.naturalWidth, image.naturalHeight, Math.min(paperImageAvailableWidth(image), config.maxWidth ?? Infinity), ratio, Math.min(paperImageFrameHeight(image), config.maxHeight ?? Infinity));
				const baseHeight = () => dimensions(1)?.baseHeight || Number(image.dataset.origin) || 100;
				const paintSize = (ratio) => {
					const computed = dimensions(ratio), base = computed?.baseHeight ?? baseHeight(), height = computed?.height ?? base * ratio;
					image.dataset.origin = String(base);
					image.dataset.height = String(height);
					image.style.height = height + "px";
					image.style.setProperty("--paper-image-height", image.style.height);
					image.style.width = computed ? computed.width + "px" : "auto";
					image.style.maxWidth = "100%";
					return height;
				};
				const size = () => paintSize(imageRatio(node.attrs.ratio));
				image.addEventListener("load", size);
				description.addEventListener("input", () => set({ alt: description.value }));
				description.addEventListener("change", () => set({ alt: description.value }));
				caption.addEventListener("input", () => set({ caption: caption.value }));
				edit.addEventListener("click", () => {
					if (!active()) return;
					settings.hidden = !settings.hidden;
					settings.classList.toggle("hidden", Boolean(settings.hidden));
					if (!settings.hidden) description.focus();
				});
				confirm.addEventListener("click", () => {
					const src = link.value.trim();
					if (src && !/^javascript:/i.test(src)) set({ src });
				});
				file.addEventListener("change", () => {
					const blob = file.files?.[0];
					file.value = "";
					if (!blob || !active()) return;
					const capturedSrc = node.attrs.src;
					config.onUpload(blob).then((src) => {
						if (active() && node.attrs.src === capturedSrc) set({ src });
					}).catch(() => {});
				});
				const release = () => {
					const gesture = resize;
					resize = null;
					if (!gesture) return;
					try {
						if (handle.hasPointerCapture(gesture.id)) handle.releasePointerCapture(gesture.id);
					} catch {}
				};
				handle.addEventListener("pointerdown", (event) => {
					if (!active() || event.button !== 0 || resize) return;
					event.preventDefault();
					event.stopPropagation();
					try {
						handle.setPointerCapture(event.pointerId);
					} catch {
						return;
					}
					const ratio = imageRatio(node.attrs.ratio);
					let angle = 0, scale = 1;
					try {
						const object = dom.closest(".paper-object"), page = dom.closest(".paper-page"), turn = new DOMMatrix(object ? getComputedStyle(object).transform : void 0), zoom = new DOMMatrix(page ? getComputedStyle(page).transform : void 0);
						angle = Math.atan2(turn.b, turn.a);
						scale = Math.hypot(zoom.a, zoom.b) || 1;
					} catch {}
					resize = {
						id: event.pointerId,
						start: event.clientY,
						x: event.clientX,
						angle,
						scale,
						base: baseHeight(),
						ratio,
						height: Number(image.dataset.height) || baseHeight() * ratio,
						nextRatio: ratio
					};
				});
				handle.addEventListener("pointermove", (event) => {
					if (!resize || resize.id !== event.pointerId) return;
					event.preventDefault();
					event.stopPropagation();
					if (!active() || baseHeight() !== resize.base) {
						release();
						size();
						return;
					}
					const delta = (-Math.sin(resize.angle) * (event.clientX - resize.x) + Math.cos(resize.angle) * (event.clientY - resize.start)) / resize.scale;
					if (!delta) return;
					const requested = Math.max(16, resize.height + delta), height = paintSize(imageRatio(Math.min(1e4, requested / resize.base)));
					resize.nextRatio = imageRatio(height / resize.base);
				});
				handle.addEventListener("pointerup", (event) => {
					if (!resize || resize.id !== event.pointerId) return;
					event.preventDefault();
					event.stopPropagation();
					const ratio = resize.nextRatio, valid = active() && baseHeight() === resize.base;
					release();
					if (valid) set({ ratio });
					else size();
				});
				const cancel = () => {
					release();
					size();
				};
				handle.addEventListener("pointercancel", cancel);
				handle.addEventListener("lostpointercapture", () => {
					if (resize) cancel();
				});
				handle.addEventListener("keydown", (event) => {
					if (!active() || ![
						"ArrowUp",
						"ArrowDown",
						"Home"
					].includes(event.key)) return;
					event.preventDefault();
					set({ ratio: event.key === "Home" ? 1 : imageRatio(Math.min(1e4, Math.max(.05, imageRatio(node.attrs.ratio) + (event.key === "ArrowUp" ? .1 : -.1)))) });
				});
				paint();
				size();
				return {
					dom,
					update(next) {
						if (next.type !== initial.type) return false;
						const sourceChanged = next.attrs.src !== node.attrs.src;
						if (sourceChanged || next.attrs.ratio !== node.attrs.ratio) release();
						node = next;
						if (sourceChanged && node.attrs.src) settings.hidden = true;
						paint();
						if (!resize) size();
						return true;
					},
					stopEvent: (event) => event.target instanceof Element && !!event.target.closest("input,button,label"),
					ignoreMutation: () => true,
					selectNode: () => dom.classList.add("selected"),
					deselectNode: () => dom.classList.remove("selected"),
					destroy: () => {
						alive = false;
						release();
					}
				};
			};
			ctx.update(nodeViewCtx, (views) => views.map(([name, view]) => [name, name === "image-block" ? constructor : view]));
			ctx.done(ready);
			return () => {
				ctx.update(editorViewTimerCtx, (timers) => timers.filter((timer) => timer !== ready));
				ctx.clearTimer(ready);
			};
		};
	};
	editor.use(metadata).use(imageView);
}
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
			lineNumber: 160,
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
					blockCaptionPlaceholderText: "Légende et titre de l’image",
					onUpload: uploadEmbeddedImage,
					inlineOnUpload: uploadEmbeddedImage,
					blockOnUpload: uploadEmbeddedImage
				}
			}
		});
		configureNotebookImageBlocks(crepe.editor, () => !disposed && ownerCurrent());
		if (flowEditing) crepe.editor.use(paperCodeView).use(paperCodeDecorations);
		crepeRef.current = crepe;
		if (media) crepe.editor.use(notePhotoPlugins(media, {
			getDocument: () => snapshotRef.current,
			current: () => !disposed && ownerCurrent() && mediaApiRef.current === media.api && snapshotRef.current?.noteId === logicalNoteId
		}));
		if (readOnly) crepe.setReadonly(true);
		const reportFlowCaret = (coordinates) => {
			const body = root.closest(".paper-flow-source");
			if (!flowEditing || disposed || !ownerCurrent() || !body) return;
			try {
				const box = body.getBoundingClientRect(), object = body.closest(".paper-object"), page = body.closest(".paper-page"), turn = new DOMMatrix(object ? getComputedStyle(object).transform : void 0), zoom = new DOMMatrix(page ? getComputedStyle(page).transform : void 0);
				caretRef.current?.(paperTextCaretY({
					x: box.left + box.width / 2,
					y: box.top + box.height / 2,
					height: body.offsetHeight
				}, {
					x: (coordinates.left + coordinates.right) / 2,
					y: (coordinates.top + coordinates.bottom) / 2
				}, Math.atan2(turn.b, turn.a) * 180 / Math.PI, Math.hypot(zoom.a, zoom.b)));
			} catch {}
		};
		const imageControlFocus = (event) => {
			const control = event.target;
			if (!(control instanceof HTMLElement) || !control.closest(".milkdown-image-block,.milkdown-image-inline,.note-photo-node")) return;
			requestAnimationFrame(() => {
				if (created && root.contains(control)) reportFlowCaret(control.getBoundingClientRect());
			});
		};
		root.addEventListener("focusin", imageControlFocus);
		crepe.on((listener) => {
			listener.selectionUpdated((ctx) => {
				if (!flowEditing) return;
				requestAnimationFrame(() => {
					if (disposed || !created) return;
					const view = ctx.get(editorViewCtx);
					if (view.composing || !view.hasFocus()) return;
					try {
						reportFlowCaret(view.coordsAtPos(view.state.selection.head));
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
						lineNumber: 406,
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
			root.removeEventListener("focusin", imageControlFocus);
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
					lineNumber: 437,
					columnNumber: 93
				}, this), /* @__PURE__ */ jsxDEV("small", { children: "Sélectionnez du texte pour le mettre en forme · / pour insérer un bloc" }, void 0, false, {
					fileName: _jsxFileName,
					lineNumber: 437,
					columnNumber: 137
				}, this)]
			}, void 0, true, {
				fileName: _jsxFileName,
				lineNumber: 437,
				columnNumber: 57
			}, this),
			!isReady && !error && /* @__PURE__ */ jsxDEV("div", {
				className: "markdown-editor-loading",
				role: "status",
				children: [/* @__PURE__ */ jsxDEV(LoaderCircle, {}, void 0, false, {
					fileName: _jsxFileName,
					lineNumber: 440,
					columnNumber: 11
				}, this), " Chargement de l’éditeur…"]
			}, void 0, true, {
				fileName: _jsxFileName,
				lineNumber: 439,
				columnNumber: 9
			}, this),
			error && /* @__PURE__ */ jsxDEV("div", {
				className: "markdown-editor-error",
				role: "alert",
				children: [
					/* @__PURE__ */ jsxDEV(AlertCircle, {}, void 0, false, {
						fileName: _jsxFileName,
						lineNumber: 445,
						columnNumber: 11
					}, this),
					" ",
					/* @__PURE__ */ jsxDEV("span", { children: error }, void 0, false, {
						fileName: _jsxFileName,
						lineNumber: 445,
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
						lineNumber: 446,
						columnNumber: 11
					}, this)
				]
			}, void 0, true, {
				fileName: _jsxFileName,
				lineNumber: 444,
				columnNumber: 9
			}, this),
			creationFailed && /* @__PURE__ */ jsxDEV("label", {
				className: "form-field",
				children: [
					/* @__PURE__ */ jsxDEV("span", { children: "Édition en texte Markdown" }, void 0, false, {
						fileName: _jsxFileName,
						lineNumber: 459,
						columnNumber: 9
					}, this),
					/* @__PURE__ */ jsxDEV("small", { children: "Vous pouvez continuer à écrire ici et enregistrer votre note pendant que l’éditeur est indisponible." }, void 0, false, {
						fileName: _jsxFileName,
						lineNumber: 460,
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
						lineNumber: 461,
						columnNumber: 9
					}, this)
				]
			}, void 0, true, {
				fileName: _jsxFileName,
				lineNumber: 458,
				columnNumber: 26
			}, this),
			/* @__PURE__ */ jsxDEV("div", {
				className: "markdown-editor-root",
				ref: rootRef,
				"data-note-id": noteId
			}, void 0, false, {
				fileName: _jsxFileName,
				lineNumber: 467,
				columnNumber: 7
			}, this)
		]
	}, void 0, true, {
		fileName: _jsxFileName,
		lineNumber: 437,
		columnNumber: 5
	}, this);
}
//#endregion
export { bindNotebookImageChooser, configureNotebookImageBlocks, MarkdownNoteEditor as default };
