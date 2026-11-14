import { t as __exportAll } from "./assets/rolldown-runtime-D7D4PA-g.js";
import { a as paperImageDimensions, c as paperImageRatioAt, d as remarkPaperImageRatioPresentation, i as paperImageAvailableWidth, n as rehypePaperSourceMap, o as paperImageFrameHeight, r as renderedMarkdownOffsets, t as measureMarkdownPageOffsets, u as parsePaperImageRatios } from "./assets/paperTextSourceMap-0-Y9Psk7.js";
import { A as calligraphyOutline, F as paperInkPointOnPage, M as lassoContains, N as objectPoint, P as paperDirectionOnPage, _ as notebookIdentityDigest, a as isPaperDocument, b as parsePhotoReference, c as ownsPaperDocument, f as planLegacyPaperImageRewrite, g as notebookDocumentId, h as legacyNotebookDocumentId, i as eraseInk, j as inkOutline, l as recordPaperHistory, m as validateLegacyRasterBytes, p as scanLegacyPaperImages, r as emptyPaperHistory, s as migratePaper, t as applyPaperCommand, u as travelPaperHistory, x as photoReference, y as noteBoardId } from "./assets/notebookDocument-yuVu6oXC.js";
import { C as queueLocalDrafts, E as resolvePaperDraft, O as saveDraftAndQueue, S as putSnapshot, T as readNotebookDeletionStatus, _ as localBlobDigest, b as putDraft, c as commitNotebookTransfer, d as getDraft, f as getSnapshot, g as listSnapshots, h as listMutations, i as activateNotebookAppendFiles, k as savePaperDraft, l as commitPaperIdentityPromotion, m as listLocalBlobs, n as acknowledgeLocalBlob, p as listDrafts, r as acknowledgeMutation, s as applyChangePage, t as DraftChangedError, v as notebookDeletionKey, w as queueMutation, x as putLocalBlob, y as paperIdentityMutationDigest } from "./assets/storage-Dsyjb46q.js";
import { n as readPaperAsset, r as resolvePaperPhotoReference } from "./assets/paperAssets-CggUOk-G.js";
import { a as textFlowPageIndex, i as textFlowFingerprint, n as reflowPaperText, r as textFlowBreaks, t as paperObjectsOnPage } from "./assets/paperTextFlow-T0_iEUZW.js";
import { n as copyMarkdownRange, r as duplicatePaperPage, t as copiedPageText } from "./assets/paperPageCopy-B4Nz_cZe.js";
import { a as mergePaperTextChange, c as applyUpdate, i as mergePaperCollaboration, l as encodeStateAsUpdate, n as forgetPaperCollaboration, o as verifyPaperCollaboration, r as hasPaperCollaboration, s as Doc, t as amendPaperCollaboration } from "./assets/paperCollaboration-Dln7Hroy.js";
import { t as openPaperPdf } from "./assets/paperPdf-Cx2IiY56.js";
import { Suspense, act, createContext, createElement, forwardRef, lazy, memo, useCallback, useContext, useEffect, useId, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from "react";
import { languages } from "@codemirror/language-data";
import { classHighlighter, highlightTree } from "@lezer/highlight";
import { Fragment, jsxDEV } from "react/jsx-dev-runtime";
import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { ArrowDown, ArrowDownToLine, ArrowUp, ArrowUpToLine, BookOpenCheck, Bookmark, Check, ChevronLeft, ChevronRight, ClipboardPaste, Copy, Download, Eraser, Eye, EyeOff, FlipHorizontal, FlipVertical, Focus, Group, Highlighter, History, ImageOff, ImagePlus, Layers, ListTree, Lock, Minimize, MoreHorizontal, MousePointer2, Move, Pencil, Plus, Redo2, RefreshCw, RotateCcw, RotateCw, Search, Settings2, StickyNote, Trash2, Type, Undo2, Ungroup, Unlock, Upload, Volume2, X, ZoomIn, ZoomOut } from "lucide-react";
import { TextLayer } from "pdfjs-dist";
import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import "@tauri-apps/api/event";
import { Gunzip, gzipSync, strFromU8, strToU8 } from "fflate";
import { createPortal, flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
//#region src/lib/paperRichFlowLayout.ts
/** Interactive adornments are never canonical painted content. */
var paperFlowChromeSelector = ".katex-mathml,.cm-gutters,.milkdown-top-bar,.milkdown-toolbar,.studio-editor-help,.markdown-editor-loading,.operation,.image-edit,.image-resize-handle,.milkdown-link-preview,.milkdown-link-edit,.milkdown-latex-inline-edit,.milkdown-slash-menu,.milkdown-block-edit,.cell-handle,.preview-label,.preview-divider";
var paperFlowContentElement = (source) => source.querySelector(".ProseMirror") ?? source;
var pathFrom = (root, node) => {
	const path = [];
	let current = node;
	while (current && current !== root) {
		const parent = current.parentElement;
		if (!parent) return "";
		path.unshift(`:nth-child(${[...parent.children].indexOf(current) + 1})`);
		current = parent;
	}
	return current === root ? path.join(" > ") : "";
};
/** Display KaTeX's HTML wrapper can be constrained to the frame while its bases
* still paint far outside it. Measure the union of those painted layout boxes. */
function mathPaintBounds(painted) {
	const wrapper = painted.getBoundingClientRect(), boxes = [...painted.querySelectorAll(".base")].map((base) => base.getBoundingClientRect()).filter((box) => box.width > 0 && box.height > 0);
	if (!boxes.length) return wrapper;
	const bounds = boxes.reduce((all, box) => ({
		left: Math.min(all.left, box.left),
		right: Math.max(all.right, box.right),
		top: Math.min(all.top, box.top),
		bottom: Math.max(all.bottom, box.bottom)
	}), {
		left: Infinity,
		right: -Infinity,
		top: Infinity,
		bottom: -Infinity
	});
	const top = Math.min(bounds.top, wrapper.top), bottom = Math.max(bounds.bottom, wrapper.bottom);
	return {
		...bounds,
		top,
		bottom,
		width: bounds.right - bounds.left,
		height: bottom - top
	};
}
/** KaTeX dimensions are expressed in em, so font sizing reserves its real scaled layout box. */
function fitPaperFlowMath(source, width, height) {
	const fits = [];
	for (const element of paperFlowContentElement(source).querySelectorAll(".katex")) {
		if (element.closest(".katex-mathml,.cm-gutters,.milkdown-top-bar,.milkdown-toolbar,.studio-editor-help,.markdown-editor-loading,.operation,.image-edit,.image-resize-handle,.milkdown-link-preview,.milkdown-link-edit,.milkdown-latex-inline-edit,.milkdown-slash-menu,.milkdown-block-edit,.cell-handle,.preview-label,.preview-divider")) continue;
		const painted = element.querySelector(".katex-html") ?? element, cell = element.closest("td,th"), cellStyle = cell ? getComputedStyle(cell) : void 0;
		const availableWidth = Math.max(1, cell ? cell.getBoundingClientRect().width - parseFloat(cellStyle?.paddingLeft ?? "0") - parseFloat(cellStyle?.paddingRight ?? "0") : width), availableHeight = Math.max(1, height - 40), naturalFont = parseFloat(getComputedStyle(element).fontSize);
		const rect = mathPaintBounds(painted);
		if (!(rect.width > 0 && rect.height > 0 && naturalFont > 0)) continue;
		const paintWidth = Math.max(.5, availableWidth - 8 - .5);
		let font = naturalFont * Math.min(1, paintWidth / rect.width, (availableHeight - .5) / rect.height);
		if (font >= naturalFont - .01) continue;
		for (let attempt = 0; attempt < 4; attempt++) {
			element.style.fontSize = `${font}px`;
			const box = mathPaintBounds(painted), factor = Math.min(1, paintWidth / box.width, (availableHeight - .5) / box.height);
			if (factor >= .999) break;
			font *= factor;
		}
		const path = pathFrom(source, element);
		if (path) fits.push({
			path,
			fontSize: font
		});
	}
	return fits;
}
/** Scoped stylesheet keeps presentation changes outside ProseMirror's observed source DOM. */
function paperMathFitCss(sourceId, fits) {
	if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(sourceId)) throw Error("Identifiant de mise en page invalide.");
	return fits.map((fit) => `#${sourceId} > ${fit.path}.katex{font-size:${fit.fontSize}px!important}`).join("\n");
}
//#endregion
//#region src/lib/paperTextHighlight.ts
var MAX_TEXT = 2e6;
var MAX_NODES = 1e5;
var MAX_FRAGMENTS = 5e3;
var excluded = "[data-md-atomic],.katex," + paperFlowChromeSelector;
function pathOf(root, node) {
	const path = [];
	while (node !== root) {
		const parent = node.parentNode;
		if (!parent) throw Error("Le texte n’appartient plus à cette zone.");
		path.unshift(Array.prototype.indexOf.call(parent.childNodes, node));
		node = parent;
	}
	return path;
}
function atPath(root, path) {
	let node = root;
	for (const index of path) {
		const child = node.childNodes[index];
		if (!child) return null;
		node = child;
	}
	return node.nodeType === 3 ? node : null;
}
function boundary(text, offset) {
	return Number.isSafeInteger(offset) && offset >= 0 && offset <= text.length && !(offset > 0 && offset < text.length && /[\uD800-\uDBFF]/.test(text[offset - 1]) && /[\uDC00-\uDFFF]/.test(text[offset]));
}
/** Parser-derived positions, never a search for a quote that may occur twice. */
function paperTextHighlightModel(root, markdown) {
	const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT), runs = [], cache = /* @__PURE__ */ new Map();
	let text = "", nodes = 0, block = null;
	while (walker.nextNode()) {
		if (++nodes > MAX_NODES) throw Error("Sélectionnez une zone de texte plus courte.");
		const node = walker.currentNode, parent = node.parentElement;
		if (!parent || parent.closest(excluded) || !node.length) continue;
		const owner = parent.closest("[data-md-from]");
		if (!owner || !root.contains(owner)) continue;
		const sourceFrom = Number(owner.dataset.mdFrom), sourceTo = Number(owner.dataset.mdTo);
		if (!Number.isSafeInteger(sourceFrom) || !Number.isSafeInteger(sourceTo) || sourceFrom < 0 || sourceTo > markdown.length || sourceTo < sourceFrom) continue;
		if (!cache.has(owner)) cache.set(owner, renderedMarkdownOffsets(markdown.slice(sourceFrom, sourceTo), owner.textContent ?? "", owner.dataset.mdMode));
		const mapping = cache.get(owner);
		if (!mapping) continue;
		const prefix = document.createRange();
		prefix.setStart(owner, 0);
		prefix.setEnd(node, 0);
		const local = prefix.toString().length;
		prefix.detach();
		if (local + node.length >= mapping.length) continue;
		const nextBlock = parent.closest("p,h1,h2,h3,h4,h5,h6,li,td,th,pre,blockquote");
		if (runs.length && nextBlock !== block && text && !text.endsWith("\n")) text += "\n";
		block = nextBlock;
		const from = text.length;
		text += node.data;
		if (text.length > MAX_TEXT) throw Error("Sélectionnez une zone de texte plus courte.");
		runs.push({
			path: pathOf(root, node),
			text: node.data,
			from,
			to: text.length,
			sourceOffsets: mapping.slice(local, local + node.length + 1).map((offset) => sourceFrom + offset)
		});
	}
	return {
		root,
		markdown,
		text,
		runs
	};
}
/** Return logical display offsets only for a selection inside this exact source. */
function paperTextHighlightRange(model, range) {
	if (range.collapsed || !model.root.contains(range.startContainer) || !model.root.contains(range.endContainer)) return null;
	for (const atom of model.root.querySelectorAll("[data-md-atomic],.katex")) if (range.intersectsNode(atom)) return null;
	let from = Infinity, to = -Infinity;
	for (const run of model.runs) {
		const node = atPath(model.root, run.path);
		if (!node || node.data !== run.text) return null;
		const before = range.comparePoint(node, 0);
		if (before === range.comparePoint(node, node.length) && before !== 0) continue;
		const start = range.startContainer === node ? range.startOffset : 0, end = range.endContainer === node ? range.endOffset : node.length;
		if (start < end) {
			from = Math.min(from, run.from + start);
			to = Math.max(to, run.from + end);
		}
	}
	return Number.isFinite(from) && to > from ? {
		from,
		to
	} : null;
}
/** Measure the real reader's copy at 100%. A rotated bounding box is never used as a glyph rectangle. */
function measurePaperTextHighlight(model, object, page, from, to) {
	if (!boundary(model.text, from) || !boundary(model.text, to) || to <= from || object.markdown !== model.markdown || !model.root.isConnected) throw Error("Le passage sélectionné a changé. Sélectionnez-le à nouveau.");
	const pageIndex = object.textFlow?.pageIds.indexOf(page.id) ?? -1;
	if (object.pageId !== page.id && pageIndex < 0) throw Error("Cette zone appartient à une autre page.");
	const offset = pageIndex >= 0 ? object.textFlow.breaks[pageIndex] : 0, frameHeight = pageIndex >= 0 ? Math.min(object.height, object.textFlow.breaks[pageIndex + 1] - offset) : object.height;
	const parent = model.root.closest("[data-object]"), insets = object.kind === "sticky" && parent ? getComputedStyle(parent) : null, leftInset = insets ? parseFloat(insets.paddingLeft) || 0 : 0, topInset = insets ? parseFloat(insets.paddingTop) || 0 : 0, rightInset = insets ? parseFloat(insets.paddingRight) || 0 : 0, bottomInset = insets ? parseFloat(insets.paddingBottom) || 0 : 0, contentWidth = object.width - leftInset - rightInset;
	const host = document.createElement("div"), copy = model.root.cloneNode(true);
	host.className = "paper-object" + (object.kind === "text" ? " has-text-flow" : "");
	host.style.cssText = `position:fixed;left:-30000px;top:0;width:${contentWidth}px;pointer-events:none;visibility:hidden;`;
	host.style.font = getComputedStyle(model.root).font;
	host.style.color = getComputedStyle(model.root).color;
	host.style.setProperty("--flow-height", object.height + "px");
	copy.removeAttribute("id");
	copy.style.transform = "none";
	copy.style.width = contentWidth + "px";
	host.append(copy);
	document.body.append(host);
	try {
		fitPaperFlowMath(copy, contentWidth, object.height);
		const origin = copy.getBoundingClientRect();
		const bands = [];
		let measured = 0;
		for (const run of model.runs) {
			const start = Math.max(from, run.from), end = Math.min(to, run.to);
			if (end <= start) continue;
			const node = atPath(copy, run.path);
			if (!node || node.data !== run.text) throw Error("La géométrie du texte a changé.");
			const range = document.createRange();
			for (let cursor = start - run.from; cursor < end - run.from;) {
				if (++measured > 5e4) throw Error("Surlignez ce passage en plusieurs parties.");
				const length = (node.data.codePointAt(cursor) ?? 0) > 65535 ? 2 : 1, next = Math.min(end - run.from, cursor + length);
				range.setStart(node, cursor);
				range.setEnd(node, next);
				for (const rect of range.getClientRects()) {
					if (rect.width <= 0 || rect.height <= 0) continue;
					const left = Math.max(0, rect.left - origin.left) + leftInset, right = Math.min(contentWidth, rect.right - origin.left) + leftInset, top = Math.max(0, rect.top - origin.top - offset) + topInset, bottom = Math.min(frameHeight - bottomInset, rect.bottom - origin.top - offset + topInset);
					if (right <= left || bottom <= top) continue;
					const band = {
						left,
						right,
						top,
						bottom,
						text: node.data.slice(cursor, next),
						from: run.sourceOffsets[cursor],
						to: run.sourceOffsets[next]
					}, previous = bands.at(-1), gap = previous ? Math.max(left - previous.right, previous.left - right) : Infinity;
					if (previous && Math.abs(top - previous.top) < .75 && Math.abs(bottom - previous.bottom) < .75 && gap <= Math.max(1, (bottom - top) * .12) && band.from >= previous.from) {
						previous.left = Math.min(previous.left, left);
						previous.right = Math.max(previous.right, right);
						previous.text += band.text;
						previous.to = band.to;
					} else bands.push(band);
					if (bands.length > MAX_FRAGMENTS) throw Error("Surlignez ce passage en plusieurs parties.");
				}
				cursor = next;
			}
			range.detach();
		}
		const fragments = bands.map((band) => ({
			quad: [
				{
					x: band.left,
					y: band.top
				},
				{
					x: band.right,
					y: band.top
				},
				{
					x: band.right,
					y: band.bottom
				},
				{
					x: band.left,
					y: band.bottom
				}
			].map((point) => objectPoint(object, point)),
			text: band.text,
			from: band.from,
			to: band.to
		}));
		return fragments.length ? {
			kind: "text",
			objectId: object.id,
			pageId: page.id,
			source: model.markdown,
			objectSnapshot: JSON.stringify(object),
			from,
			to,
			text: model.text.slice(from, to),
			fragments
		} : null;
	} finally {
		host.remove();
	}
}
/** Every disjoint line fragment is its own band. One batch is one undo step. */
function paperHighlightCommand(fragments, pageId, color, z) {
	if (!fragments.length || fragments.length > MAX_FRAGMENTS || !/^#[\da-f]{6}$/i.test(color) || !Number.isFinite(z)) throw Error("Le surlignage sélectionné est invalide.");
	const groupId = crypto.randomUUID(), createdAt = Date.now();
	return {
		type: "batch",
		commands: fragments.map((fragment) => {
			const q = fragment.quad;
			if (q.length !== 4 || q.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))) throw Error("Le passage ne peut pas être mesuré.");
			const ux = q[1].x - q[0].x, uy = q[1].y - q[0].y, vx = q[3].x - q[0].x, vy = q[3].y - q[0].y, areaScale = Math.hypot(ux, uy) * Math.hypot(vx, vy);
			if (!areaScale || Math.abs(ux * vx + uy * vy) > areaScale * .001 || Math.hypot(q[2].x - q[1].x - vx, q[2].y - q[1].y - vy) > Math.max(.01, Math.sqrt(areaScale) * .001)) throw Error("Ce texte incliné nécessite un tracé libre. Son original est conservé.");
			const start = {
				x: (q[0].x + q[3].x) / 2,
				y: (q[0].y + q[3].y) / 2
			}, end = {
				x: (q[1].x + q[2].x) / 2,
				y: (q[1].y + q[2].y) / 2
			}, thickness = Math.hypot(q[0].x - q[3].x, q[0].y - q[3].y);
			if (thickness <= 0 || thickness > 1e4 || Math.hypot(start.x - end.x, start.y - end.y) <= 0) throw Error("Le passage ne peut pas être mesuré.");
			const pad = thickness / 2, x = Math.min(start.x, end.x) - pad, y = Math.min(start.y, end.y) - pad;
			return {
				type: "upsert-object",
				object: {
					id: crypto.randomUUID(),
					pageId,
					kind: "ink",
					x,
					y,
					width: Math.max(1, Math.abs(start.x - end.x) + thickness),
					height: Math.max(1, Math.abs(start.y - end.y) + thickness),
					rotation: 0,
					z,
					locked: false,
					groupId,
					createdAt,
					color,
					strokeWidth: thickness,
					pen: "highlighter",
					strokeStyle: "solid",
					opacity: .32,
					points: [{
						x: start.x - x,
						y: start.y - y,
						time: 0
					}, {
						x: end.x - x,
						y: end.y - y,
						time: 0
					}]
				}
			};
		})
	};
}
//#endregion
//#region src/hooks/usePaperSmartHighlight.ts
function usePaperSmartHighlight(props) {
	const [lease, setLeaseState] = useState(null), [color, setColor] = useState("#f6c447"), alive = useRef(true), frame = useRef(0), latest = useRef(props);
	latest.current = props;
	const leaseRef = useRef(null);
	const setLease = (value) => {
		leaseRef.current = value;
		setLeaseState(value);
	};
	const phase = useRef({
		owner: props.owner,
		generation: props.generation,
		api: props.media.api,
		enabled: props.enabled,
		disabled: props.disabled,
		visible: props.visible,
		textOnly: props.textOnly,
		serial: 0
	});
	const prior = phase.current;
	if (prior.owner !== props.owner || prior.generation !== props.generation || prior.api !== props.media.api || prior.enabled !== props.enabled || prior.disabled !== props.disabled || prior.visible !== props.visible || prior.textOnly !== props.textOnly) phase.current = {
		owner: props.owner,
		generation: props.generation,
		api: props.media.api,
		enabled: props.enabled,
		disabled: props.disabled,
		visible: props.visible,
		textOnly: props.textOnly,
		serial: prior.serial + 1
	};
	const serial = phase.current.serial;
	const models = useRef(/* @__PURE__ */ new Map());
	useEffect(() => {
		alive.current = true;
		return () => {
			alive.current = false;
			cancelAnimationFrame(frame.current);
		};
	}, []);
	const active = () => alive.current && phase.current.serial === serial && latest.current.enabled && !latest.current.disabled && latest.current.visible && !latest.current.textOnly && latest.current.owner === props.owner && latest.current.generation === props.generation && latest.current.media.api === props.media.api && props.enabled && !props.disabled && props.visible && !props.textOnly && props.current();
	const valid = (value) => {
		if (!value || !active() || value.owner !== props.owner || value.generation !== props.generation) return false;
		const document = props.getCurrent(), page = document?.pages.find((p) => p.id === props.page?.id);
		if (!document || document.revision !== value.revision || JSON.stringify(page) !== value.pageSnapshot) return false;
		const selection = value.selection;
		if (selection.kind === "pdf") return !!page?.pdf && page.pdf.assetId === selection.assetId && page.pdf.pageNumber === selection.pdfPageNumber && selection.isCurrent();
		return document.objects.some((object) => object.id === selection.objectId && JSON.stringify(object) === selection.objectSnapshot);
	};
	useEffect(() => {
		for (const [id, value] of models.current) if (value.owner !== props.owner || value.generation !== props.generation || value.revision !== props.document?.revision) models.current.delete(id);
		if (leaseRef.current && !valid(leaseRef.current)) setLease(null);
		cancelAnimationFrame(frame.current);
	}, [
		props.owner,
		props.generation,
		props.document?.revision
	]);
	const choose = (id) => {
		if (!active() || !props.page) return null;
		const document = props.getCurrent(), object = document?.objects.find((o) => o.id === id), source = Array.from(props.viewport.current?.querySelectorAll("[data-object]") ?? []).find((node) => node.dataset.object === id)?.querySelector(".paper-flow-source,.paper-selectable-text-source");
		if (!document || !object || !source || source.dataset.flowReady === "false" || globalThis.document.fonts?.status === "loading") return null;
		try {
			const model = paperTextHighlightModel(source, object.markdown ?? "");
			models.current.set(id, {
				model,
				objectSnapshot: JSON.stringify(object),
				revision: document.revision,
				generation: props.generation,
				owner: props.owner
			});
			return { text: model.text };
		} catch (error) {
			props.onNotice(String(error instanceof Error ? error.message : error));
			return null;
		}
	};
	const range = (id, from, to) => {
		if (!active() || !props.page) return;
		const saved = models.current.get(id), document = props.getCurrent(), object = document?.objects.find((o) => o.id === id);
		if (!saved || !document || !object || saved.revision !== document.revision || saved.generation !== props.generation || saved.owner !== props.owner || saved.objectSnapshot !== JSON.stringify(object)) {
			setLease(null);
			props.onNotice("La zone de texte a changé. Reprenez sa sélection.");
			return;
		}
		if (from === to) {
			setLease(null);
			return;
		}
		try {
			const selection = measurePaperTextHighlight(saved.model, object, props.page, from, to);
			setLease(selection ? {
				owner: props.owner,
				generation: props.generation,
				revision: document.revision,
				pageSnapshot: JSON.stringify(props.page),
				selection
			} : null);
		} catch (error) {
			setLease(null);
			props.onNotice(String(error instanceof Error ? error.message : error));
		}
	};
	const nativeRange = () => {
		if (!active()) return;
		const selection = globalThis.document.getSelection();
		if (!selection?.rangeCount || selection.isCollapsed) return;
		const selected = selection.getRangeAt(0), id = (selected.startContainer.nodeType === 3 ? selected.startContainer.parentElement : selected.startContainer)?.closest("[data-object]")?.getAttribute("data-object");
		if (!id || !choose(id)) return;
		const model = models.current.get(id)?.model;
		if (!model) return;
		const logical = paperTextHighlightRange(model, selected);
		if (logical) range(id, logical.from, logical.to);
	};
	const deferNative = () => {
		const revision = props.getCurrent()?.revision;
		cancelAnimationFrame(frame.current);
		frame.current = requestAnimationFrame(() => {
			frame.current = 0;
			if (active() && props.getCurrent()?.revision === revision) nativeRange();
		});
	};
	const apply = (value = lease) => {
		if (!valid(value) || !props.page) {
			if (active()) {
				props.onNotice("Le passage a changé. Sélectionnez-le à nouveau.");
				setLease(null);
			}
			return false;
		}
		try {
			const document = props.getCurrent(), fragments = value.selection.fragments.map((fragment) => ({
				quad: fragment.quad,
				text: fragment.text,
				from: fragment.from,
				to: fragment.to
			}));
			const success = props.commit(paperHighlightCommand(fragments, props.page.id, color, Math.max(0, ...document.objects.filter((o) => o.pageId === props.page.id).map((o) => o.z)) + 1));
			if (success) {
				setLease(null);
				props.onNotice(`${fragments.length} bandes surlignées. Vous pouvez annuler l’ensemble en une fois.`);
			}
			return success;
		} catch (error) {
			if (active()) props.onNotice(String(error instanceof Error ? error.message : error));
			return false;
		}
	};
	const pdfSelection = (selection) => {
		if (!active() || !props.page) return;
		const document = props.getCurrent();
		if (document) setLease(selection ? {
			owner: props.owner,
			generation: props.generation,
			revision: document.revision,
			pageSnapshot: JSON.stringify(props.page),
			selection
		} : null);
	};
	const pdfHighlight = (selection) => {
		if (!active() || !props.page) return false;
		if (!props.getCurrent()) return false;
		const captured = leaseRef.current;
		if (!captured || captured.selection !== selection || !valid(captured)) {
			props.onNotice("Le passage a changé. Sélectionnez-le à nouveau.");
			return false;
		}
		return apply(captured);
	};
	return {
		selection: valid(lease) ? lease.selection : null,
		color,
		setColor: (value) => {
			if (active() && /^#[\da-f]{6}$/i.test(value)) setColor(value);
		},
		choose,
		range,
		deferNative,
		pdfSelection,
		pdfHighlight,
		apply: () => apply(),
		clear: () => {
			if (active()) setLease(null);
		},
		current: active
	};
}
//#endregion
//#region src/lib/paperCodeHighlight.ts
var parsers = /* @__PURE__ */ new Map();
var pending = /* @__PURE__ */ new Map();
var normalize$1 = (language) => language.trim().toLowerCase();
function loadPaperCodeLanguage(language) {
	const name = normalize$1(language);
	if (parsers.has(name)) return Promise.resolve();
	const current = pending.get(name);
	if (current) return current;
	const description = languages.find((d) => normalize$1(d.name) === name || d.alias.some((alias) => normalize$1(alias) === name));
	if (!description) return Promise.resolve();
	const loading = description.load().then((support) => {
		parsers.set(name, support.language.parser);
	}).catch(() => void 0);
	pending.set(name, loading);
	return loading;
}
/** Parsing changes colours only; the complete code remains editable/exportable as text. */
function paperCodeRanges(code, language) {
	const parser = parsers.get(normalize$1(language));
	if (!parser || code.length > 2e5) return [];
	const ranges = [];
	highlightTree(parser.parse(code), classHighlighter, (from, to, className) => {
		ranges.push({
			from,
			to,
			className
		});
	});
	return ranges;
}
//#endregion
//#region src/components/PaperCodeText.tsx
var _jsxFileName$21 = "/home/louis/DowzeBuild/20260923/collections-060/src/components/PaperCodeText.tsx";
function PaperCodeText({ code, language, sourceFrom, sourceTo }) {
	const [ranges, setRanges] = useState([]), [ready, setReady] = useState(false);
	useEffect(() => {
		let stopped = false;
		setRanges([]);
		setReady(false);
		loadPaperCodeLanguage(language).then(() => {
			if (!stopped) {
				setRanges(paperCodeRanges(code, language));
				setReady(true);
			}
		});
		return () => {
			stopped = true;
		};
	}, [code, language]);
	let offset = 0;
	const output = [];
	for (const range of ranges) {
		if (range.from > offset) output.push(code.slice(offset, range.from));
		output.push(/* @__PURE__ */ jsxDEV("span", {
			className: range.className,
			children: code.slice(range.from, range.to)
		}, range.from + "-" + range.to, false, {
			fileName: _jsxFileName$21,
			lineNumber: 7,
			columnNumber: 105
		}, this));
		offset = range.to;
	}
	if (offset < code.length) output.push(code.slice(offset));
	return /* @__PURE__ */ jsxDEV("code", {
		"data-md-from": Number.isSafeInteger(sourceFrom) ? sourceFrom : void 0,
		"data-md-to": Number.isSafeInteger(sourceTo) ? sourceTo : void 0,
		"data-md-mode": "code",
		"data-code-ready": String(ready),
		className: "language-" + language,
		children: output
	}, void 0, false, {
		fileName: _jsxFileName$21,
		lineNumber: 8,
		columnNumber: 63
	}, this);
}
//#endregion
//#region src/lib/paperInkStyles.ts
var PAPER_STROKE_STYLES = [
	"solid",
	"dashed",
	"dotted"
];
function paperStrokeDashArray(style, width) {
	const unit = Number.isFinite(width) && width > 0 ? width : 3;
	return style === "dashed" ? `${unit * 4} ${unit * 2.5}` : style === "dotted" ? `0 ${unit * 2.5}` : void 0;
}
/** Parents apply this transform exactly once, for ink and non-vector content.
* Local reflection happens before the existing rotation, like objectPoint(). */
function paperObjectCssTransform(object) {
	return `rotate(${object.rotation}deg)` + (object.mirrorX || object.mirrorY ? ` scale(${object.mirrorX ? -1 : 1}, ${object.mirrorY ? -1 : 1})` : "");
}
function paperObjectSvgTransform(object, x = object.x, y = object.y) {
	const cx = object.width / 2, cy = object.height / 2;
	return `translate(${x} ${y}) rotate(${object.rotation} ${cx} ${cy})` + (object.mirrorX || object.mirrorY ? ` translate(${cx} ${cy}) scale(${object.mirrorX ? -1 : 1} ${object.mirrorY ? -1 : 1}) translate(${-cx} ${-cy})` : "");
}
/** A selection is reflected around its own painted bounding box, never around
* the page or an unrelated object. Locked objects stay byte-for-byte intact.
* Continuous text is explicitly excluded: reflecting one page must not move its
* canonical text across other pages or corrupt their shared layout identity. */
function mirrorPaperSelection(document, ids, axis, pageId) {
	if (axis !== "horizontal" && axis !== "vertical") throw Error("Choisissez un miroir horizontal ou vertical.");
	const selected = new Set(ids), chosen = document.objects.filter((object) => selected.has(object.id) && !object.locked);
	if (!chosen.length) return null;
	if (chosen.some((object) => object.textFlow && object.textFlow.pageIds.length > 1)) throw Error("Ce texte se poursuit sur plusieurs pages. Retournez ses dessins ou une zone de texte indépendante ; le texte continu reste conservé.");
	const page = pageId ?? chosen[0].pageId;
	if (chosen.some((object) => object.pageId !== page)) throw Error("Le miroir concerne une sélection sur une seule page. Les autres pages restent conservées.");
	const corners = chosen.flatMap((object) => {
		if (object.kind === "ink" && object.points?.length) {
			const pad = (object.strokeWidth ?? 3) * (object.pen === "calligraphy" ? 2 : 1), bounds = object.points.reduce((box, point) => {
				const p = objectPoint(object, point);
				return {
					left: Math.min(box.left, p.x),
					right: Math.max(box.right, p.x),
					top: Math.min(box.top, p.y),
					bottom: Math.max(box.bottom, p.y)
				};
			}, {
				left: Infinity,
				right: -Infinity,
				top: Infinity,
				bottom: -Infinity
			});
			return [{
				x: bounds.left - pad,
				y: bounds.top - pad
			}, {
				x: bounds.right + pad,
				y: bounds.bottom + pad
			}];
		}
		return [
			{
				x: 0,
				y: 0
			},
			{
				x: object.width,
				y: 0
			},
			{
				x: object.width,
				y: object.height
			},
			{
				x: 0,
				y: object.height
			}
		].map((point) => objectPoint(object, point));
	});
	const left = Math.min(...corners.map((p) => p.x)), right = Math.max(...corners.map((p) => p.x)), top = Math.min(...corners.map((p) => p.y)), bottom = Math.max(...corners.map((p) => p.y)), cx = (left + right) / 2, cy = (top + bottom) / 2;
	return {
		type: "batch",
		commands: chosen.map((object) => {
			const centerX = object.x + object.width / 2, centerY = object.y + object.height / 2, mirror = {
				...object,
				x: axis === "horizontal" ? 2 * cx - centerX - object.width / 2 : object.x,
				y: axis === "vertical" ? 2 * cy - centerY - object.height / 2 : object.y,
				rotation: -object.rotation
			};
			const field = axis === "horizontal" ? "mirrorX" : "mirrorY";
			if (mirror[field]) delete mirror[field];
			else mirror[field] = true;
			return {
				type: "upsert-object",
				object: mirror
			};
		})
	};
}
function setPaperSelectionStrokeStyle(document, ids, strokeStyle) {
	if (!PAPER_STROKE_STYLES.includes(strokeStyle)) throw Error("Le style du trait est invalide.");
	const selected = new Set(ids);
	const commands = document.objects.filter((object) => selected.has(object.id) && !object.locked && (object.kind === "ink" || object.kind === "shape") && (object.strokeStyle ?? "solid") !== strokeStyle).map((object) => ({
		type: "patch-object",
		id: object.id,
		patch: { strokeStyle }
	}));
	return commands.length ? {
		type: "batch",
		commands
	} : null;
}
//#endregion
//#region src/components/PaperObjectVisual.tsx
var _jsxFileName$20 = "/home/louis/DowzeBuild/20260923/collections-060/src/components/PaperObjectVisual.tsx";
function usePaperImageSizing(ratio, key) {
	const ref = useRef(null), fit = useCallback(() => {
		const image = ref.current;
		if (ratio === void 0 || !image) return;
		const dimensions = paperImageDimensions(image.naturalWidth, image.naturalHeight, paperImageAvailableWidth(image), ratio, paperImageFrameHeight(image));
		if (!dimensions) return;
		const height = dimensions.height + "px", width = dimensions.width + "px";
		if (image.style.getPropertyValue("--paper-image-height") !== height) image.style.setProperty("--paper-image-height", height);
		if (image.style.height !== height) image.style.height = height;
		if (image.style.width !== width) image.style.width = width;
	}, [ratio, key]);
	useEffect(() => {
		if (ratio === void 0) return;
		fit();
		const image = ref.current;
		if (!image || typeof ResizeObserver === "undefined") return;
		const observer = new ResizeObserver(fit);
		let parent = image.parentElement;
		while (parent) {
			observer.observe(parent);
			if (parent.classList.contains("paper-flow-source")) break;
			parent = parent.parentElement;
		}
		return () => observer.disconnect();
	}, [
		ratio,
		key,
		fit
	]);
	return {
		ref,
		fit
	};
}
function PaperImageUnavailable({ message, alt, title, onError }) {
	useEffect(() => {
		onError?.(message);
	}, [message, onError]);
	return /* @__PURE__ */ jsxDEV("span", {
		className: "paper-asset-missing",
		"data-image-error": "true",
		role: "status",
		title,
		children: [alt ? `${alt} — ` : "", message]
	}, void 0, true, {
		fileName: _jsxFileName$20,
		lineNumber: 23,
		columnNumber: 64
	}, this);
}
function PaperAssetImage({ asset, media, document, referenceDocumentId, alt, title, imageRatio, current: viewCurrent, onReady, onError }) {
	const stateKey = JSON.stringify([
		media.accountId,
		media.spaceId,
		document?.noteId ?? null,
		document?.legacy.boardId ?? null,
		referenceDocumentId ?? null,
		asset.id,
		asset.serverId ?? null,
		asset.mediaType,
		asset.size,
		asset.name
	]);
	const [state, setState] = useState({
		key: "",
		url: "",
		error: ""
	}), latest = useRef({
		stateKey,
		api: media.api,
		document,
		viewCurrent,
		onReady,
		onError
	});
	latest.current = {
		stateKey,
		api: media.api,
		document,
		viewCurrent,
		onReady,
		onError
	};
	useEffect(() => {
		let cancelled = false, objectUrl = "";
		const current = () => !cancelled && (latest.current.viewCurrent?.() ?? true) && latest.current.stateKey === stateKey && latest.current.api === media.api && (!latest.current.document || latest.current.document.assets.some((row) => row.id === asset.id && row.serverId === asset.serverId && row.mediaType === asset.mediaType && row.size === asset.size));
		setState({
			key: stateKey,
			url: "",
			error: ""
		});
		readPaperAsset(asset, media, {
			document,
			referenceDocumentId,
			current
		}).then((blob) => {
			if (current()) {
				objectUrl = URL.createObjectURL(blob);
				setState({
					key: stateKey,
					url: objectUrl,
					error: ""
				});
			}
		}).catch((error) => {
			if (current()) {
				const message = String(error instanceof Error ? error.message : error);
				setState({
					key: stateKey,
					url: "",
					error: message
				});
				latest.current.onError?.(message);
			}
		});
		return () => {
			cancelled = true;
			if (objectUrl) URL.revokeObjectURL(objectUrl);
		};
	}, [stateKey, media.api]);
	const visible = (viewCurrent?.() ?? true) && state.key === stateKey ? state : void 0;
	const sizing = usePaperImageSizing(imageRatio, visible?.url ?? "");
	return visible?.url ? /* @__PURE__ */ jsxDEV("img", {
		ref: sizing.ref,
		"data-paper-image-ratio": imageRatio,
		src: visible.url,
		alt: alt ?? asset.name,
		title,
		draggable: false,
		onLoad: () => {
			if (latest.current.stateKey === stateKey) {
				sizing.fit();
				latest.current.onReady?.();
			}
		},
		onError: () => {
			if (latest.current.stateKey !== stateKey) return;
			const message = `L’image « ${alt || asset.name} » n’a pas pu être lue. Son original reste conservé.`;
			setState({
				key: stateKey,
				url: "",
				error: message
			});
			latest.current.onError?.(message);
		}
	}, void 0, false, {
		fileName: _jsxFileName$20,
		lineNumber: 33,
		columnNumber: 22
	}, this) : visible?.error ? /* @__PURE__ */ jsxDEV("span", {
		className: "paper-asset-missing",
		"data-image-error": "true",
		role: "status",
		title,
		children: [alt ? `${alt} — ` : "", visible.error]
	}, void 0, true, {
		fileName: _jsxFileName$20,
		lineNumber: 33,
		columnNumber: 504
	}, this) : /* @__PURE__ */ jsxDEV("span", {
		className: "paper-asset-missing",
		role: "status",
		children: "Image en cours de chargement…"
	}, void 0, false, {
		fileName: _jsxFileName$20,
		lineNumber: 33,
		columnNumber: 637
	}, this);
}
function PaperExternalImage({ src, alt, title, imageRatio, onError }) {
	const [failed, setFailed] = useState(""), sizing = usePaperImageSizing(imageRatio, src);
	if (!src || failed === src) return /* @__PURE__ */ jsxDEV(PaperImageUnavailable, {
		message: "Cette image n’a pas pu être lue. Son texte original reste conservé.",
		alt,
		title,
		onError
	}, void 0, false, {
		fileName: _jsxFileName$20,
		lineNumber: 36,
		columnNumber: 112
	}, this);
	return /* @__PURE__ */ jsxDEV("img", {
		ref: sizing.ref,
		"data-paper-image-ratio": imageRatio,
		src,
		alt: alt ?? "Image dans la note",
		title,
		onLoad: sizing.fit,
		onError: () => setFailed(src)
	}, void 0, false, {
		fileName: _jsxFileName$20,
		lineNumber: 37,
		columnNumber: 9
	}, this);
}
var PaperRichText = memo(function PaperRichText({ markdown, document, media, onError }) {
	const ratios = useMemo(() => markdown.includes("<!-- dowze-image-size:v1 ratio=") ? parsePaperImageRatios(markdown) : [], [markdown]);
	return /* @__PURE__ */ jsxDEV(ReactMarkdown, {
		remarkPlugins: [
			remarkGfm,
			remarkMath,
			[remarkPaperImageRatioPresentation, { ratios }]
		],
		rehypePlugins: [rehypePaperSourceMap, [rehypeKatex, { throwOnError: false }]],
		urlTransform: (src) => src.startsWith("dowze-photo:") || /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=\s]+$/.test(src) ? src : defaultUrlTransform(src),
		components: {
			code: ({ className, children, node, ...properties }) => {
				const language = /language-([^\s]+)/.exec(className ?? "")?.[1];
				return language ? /* @__PURE__ */ jsxDEV(PaperCodeText, {
					code: String(children),
					language,
					sourceFrom: Number(properties["data-md-from"]),
					sourceTo: Number(properties["data-md-to"])
				}, void 0, false, {
					fileName: _jsxFileName$20,
					lineNumber: 41,
					columnNumber: 472
				}, this) : /* @__PURE__ */ jsxDEV("code", {
					...properties,
					className,
					children
				}, void 0, false, {
					fileName: _jsxFileName$20,
					lineNumber: 41,
					columnNumber: 679
				}, this);
			},
			img: ({ src, alt, title, node }) => {
				const url = typeof src === "string" ? src : "", imageRatio = paperImageRatioAt(ratios, node?.position?.start.offset, node?.position?.end.offset, url, alt, title), resolved = resolvePaperPhotoReference(document, url);
				return resolved.kind === "asset" ? /* @__PURE__ */ jsxDEV(PaperAssetImage, {
					asset: resolved.asset,
					document,
					referenceDocumentId: resolved.reference.documentId,
					media,
					alt,
					title,
					imageRatio,
					onError
				}, void 0, false, {
					fileName: _jsxFileName$20,
					lineNumber: 41,
					columnNumber: 999
				}, this) : resolved.kind === "unavailable" ? /* @__PURE__ */ jsxDEV(PaperImageUnavailable, {
					message: resolved.message,
					alt,
					title,
					onError
				}, void 0, false, {
					fileName: _jsxFileName$20,
					lineNumber: 41,
					columnNumber: 1223
				}, this) : /* @__PURE__ */ jsxDEV(PaperExternalImage, {
					src: url,
					alt,
					title,
					imageRatio,
					onError
				}, void 0, false, {
					fileName: _jsxFileName$20,
					lineNumber: 41,
					columnNumber: 1317
				}, this);
			}
		},
		children: markdown
	}, void 0, false, {
		fileName: _jsxFileName$20,
		lineNumber: 41,
		columnNumber: 9
	}, this);
}, (previous, next) => previous.markdown === next.markdown && previous.onError === next.onError && previous.media.accountId === next.media.accountId && previous.media.spaceId === next.media.spaceId && previous.media.api === next.media.api && previous.document.noteId === next.document.noteId && previous.document.legacy.boardId === next.document.legacy.boardId && previous.document.assets.length === next.document.assets.length && previous.document.assets.every((asset, i) => {
	const other = next.document.assets[i];
	return asset.id === other.id && asset.name === other.name && asset.mediaType === other.mediaType && asset.serverId === other.serverId && asset.size === other.size;
}));
function PaperInkVisual({ object }) {
	const id = `pencil-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`, pencil = object.pen === "pencil", points = object.points ?? [], width = object.strokeWidth ?? 3, dash = paperStrokeDashArray(object.strokeStyle, width), patternId = id + "-pattern";
	const bounds = points.reduce((box, p) => ({
		left: Math.min(box.left, p.x),
		right: Math.max(box.right, p.x),
		top: Math.min(box.top, p.y),
		bottom: Math.max(box.bottom, p.y)
	}), {
		left: Infinity,
		right: -Infinity,
		top: Infinity,
		bottom: -Infinity
	}), pad = width * 4;
	const masked = !!dash && points.length > 1;
	return /* @__PURE__ */ jsxDEV(Fragment, { children: [
		pencil && /* @__PURE__ */ jsxDEV("defs", { children: /* @__PURE__ */ jsxDEV("filter", {
			id,
			x: "-10%",
			y: "-10%",
			width: "120%",
			height: "120%",
			children: [
				/* @__PURE__ */ jsxDEV("feTurbulence", {
					type: "fractalNoise",
					baseFrequency: "0.55",
					numOctaves: "2",
					seed: "7",
					result: "grain"
				}, void 0, false, {
					fileName: _jsxFileName$20,
					lineNumber: 49,
					columnNumber: 87
				}, this),
				/* @__PURE__ */ jsxDEV("feColorMatrix", {
					in: "grain",
					type: "matrix",
					values: "0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.33 0.33 0.33 0 0",
					result: "alpha"
				}, void 0, false, {
					fileName: _jsxFileName$20,
					lineNumber: 49,
					columnNumber: 182
				}, this),
				/* @__PURE__ */ jsxDEV("feComponentTransfer", {
					in: "alpha",
					result: "texture",
					children: /* @__PURE__ */ jsxDEV("feFuncA", {
						type: "linear",
						slope: "2",
						intercept: "-0.1"
					}, void 0, false, {
						fileName: _jsxFileName$20,
						lineNumber: 49,
						columnNumber: 345
					}, this)
				}, void 0, false, {
					fileName: _jsxFileName$20,
					lineNumber: 49,
					columnNumber: 296
				}, this),
				/* @__PURE__ */ jsxDEV("feComposite", {
					in: "SourceGraphic",
					in2: "texture",
					operator: "in"
				}, void 0, false, {
					fileName: _jsxFileName$20,
					lineNumber: 49,
					columnNumber: 418
				}, this)
			]
		}, void 0, true, {
			fileName: _jsxFileName$20,
			lineNumber: 49,
			columnNumber: 26
		}, this) }, void 0, false, {
			fileName: _jsxFileName$20,
			lineNumber: 49,
			columnNumber: 20
		}, this),
		masked && /* @__PURE__ */ jsxDEV("defs", { children: /* @__PURE__ */ jsxDEV("mask", {
			id: patternId,
			maskUnits: "userSpaceOnUse",
			x: bounds.left - pad,
			y: bounds.top - pad,
			width: bounds.right - bounds.left + pad * 2,
			height: bounds.bottom - bounds.top + pad * 2,
			children: /* @__PURE__ */ jsxDEV("path", {
				d: `M${points.map((p) => `${p.x} ${p.y}`).join("L")}`,
				fill: "none",
				stroke: "white",
				strokeWidth: object.strokeStyle === "dotted" ? width : width * 4,
				strokeDasharray: dash,
				strokeLinecap: object.strokeStyle === "dotted" ? "round" : "butt"
			}, void 0, false, {
				fileName: _jsxFileName$20,
				lineNumber: 49,
				columnNumber: 677
			}, this)
		}, void 0, false, {
			fileName: _jsxFileName$20,
			lineNumber: 49,
			columnNumber: 511
		}, this) }, void 0, false, {
			fileName: _jsxFileName$20,
			lineNumber: 49,
			columnNumber: 505
		}, this),
		/* @__PURE__ */ jsxDEV("path", {
			"data-stroke-style": object.strokeStyle ?? "solid",
			d: object.pen === "calligraphy" ? calligraphyOutline(points, width, object.nibAngle ?? 45) : inkOutline(points, width, object.pen === "highlighter"),
			fill: object.color ?? "#20343b",
			opacity: object.opacity ?? (object.pen === "highlighter" ? .32 : 1),
			filter: pencil ? `url(#${id})` : void 0,
			mask: masked ? `url(#${patternId})` : void 0
		}, void 0, false, {
			fileName: _jsxFileName$20,
			lineNumber: 49,
			columnNumber: 919
		}, this)
	] }, void 0, true, {
		fileName: _jsxFileName$20,
		lineNumber: 49,
		columnNumber: 9
	}, this);
}
function PaperObjectVisual({ object, document, media, onReady, onError }) {
	if (object.kind === "text" || object.kind === "sticky") return /* @__PURE__ */ jsxDEV(PaperRichText, {
		markdown: object.markdown ?? "",
		document,
		media,
		onError
	}, void 0, false, {
		fileName: _jsxFileName$20,
		lineNumber: 52,
		columnNumber: 57
	}, this);
	if (object.kind === "image") {
		const asset = document.assets.find((a) => a.id === object.assetId);
		return asset ? /* @__PURE__ */ jsxDEV(PaperAssetImage, {
			asset,
			document,
			media,
			onReady,
			onError
		}, void 0, false, {
			fileName: _jsxFileName$20,
			lineNumber: 53,
			columnNumber: 100
		}, this) : /* @__PURE__ */ jsxDEV(PaperImageUnavailable, {
			message: "Le fichier de cette image n’est pas encore associé à la note. Son original reste conservé.",
			onError
		}, void 0, false, {
			fileName: _jsxFileName$20,
			lineNumber: 53,
			columnNumber: 203
		}, this);
	}
	const w = object.width, h = object.height, stroke = object.strokeWidth ?? 3, dash = paperStrokeDashArray(object.strokeStyle, stroke), linecap = object.strokeStyle === "dotted" ? "round" : void 0;
	return /* @__PURE__ */ jsxDEV("svg", {
		className: "paper-object-svg",
		viewBox: `0 0 ${w || 1} ${h || 1}`,
		width: w,
		height: h,
		style: { overflow: "visible" },
		opacity: object.kind === "shape" ? object.opacity : void 0,
		"aria-hidden": "true",
		children: object.kind === "ink" ? /* @__PURE__ */ jsxDEV(PaperInkVisual, { object }, void 0, false, {
			fileName: _jsxFileName$20,
			lineNumber: 55,
			columnNumber: 222
		}, this) : object.shape === "ellipse" ? /* @__PURE__ */ jsxDEV("ellipse", {
			cx: w / 2,
			cy: h / 2,
			rx: w / 2,
			ry: h / 2,
			fill: "none",
			stroke: object.color,
			strokeWidth: stroke,
			strokeDasharray: dash,
			strokeLinecap: linecap
		}, void 0, false, {
			fileName: _jsxFileName$20,
			lineNumber: 55,
			columnNumber: 281
		}, this) : object.shape === "line" || object.shape === "arrow" ? /* @__PURE__ */ jsxDEV(Fragment, { children: [/* @__PURE__ */ jsxDEV("path", {
			d: `M0 0 L${w} ${h}`,
			fill: "none",
			stroke: object.color,
			strokeWidth: stroke,
			strokeDasharray: dash,
			strokeLinecap: linecap
		}, void 0, false, {
			fileName: _jsxFileName$20,
			lineNumber: 55,
			columnNumber: 478
		}, this), object.shape === "arrow" && /* @__PURE__ */ jsxDEV("path", {
			d: `M${w - 20} ${h - 4} L${w} ${h} L${w - 4} ${h - 20}`,
			fill: "none",
			stroke: object.color,
			strokeWidth: stroke
		}, void 0, false, {
			fileName: _jsxFileName$20,
			lineNumber: 55,
			columnNumber: 634
		}, this)] }, void 0, true, {
			fileName: _jsxFileName$20,
			lineNumber: 55,
			columnNumber: 476
		}, this) : /* @__PURE__ */ jsxDEV("rect", {
			width: w,
			height: h,
			fill: "none",
			stroke: object.color,
			strokeWidth: stroke,
			strokeDasharray: dash,
			strokeLinecap: linecap
		}, void 0, false, {
			fileName: _jsxFileName$20,
			lineNumber: 55,
			columnNumber: 750
		}, this)
	}, void 0, false, {
		fileName: _jsxFileName$20,
		lineNumber: 55,
		columnNumber: 9
	}, this);
}
//#endregion
//#region src/lib/paperTextMeasurement.ts
/** Browser layout measurements in paper units, independent of the current zoom. */
function measureUnrotated(source, width, height, markdown) {
	const root = source.getBoundingClientRect(), scale = root.width / width;
	if (!Number.isFinite(scale) || scale <= 0) return null;
	const bands = [];
	const content = paperFlowContentElement(source);
	const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
	let count = 0;
	while (walker.nextNode()) {
		if (++count > 1e5) throw Error("Le texte est trop complexe pour une mise en page immédiate.");
		const node = walker.currentNode;
		if (!node.textContent?.trim() || node.parentElement?.closest(".katex,.katex-mathml,.cm-gutters,.milkdown-top-bar,.milkdown-toolbar,.studio-editor-help,.markdown-editor-loading,.operation,.image-edit,.image-resize-handle,.milkdown-link-preview,.milkdown-link-edit,.milkdown-latex-inline-edit,.milkdown-slash-menu,.milkdown-block-edit,.cell-handle,.preview-label,.preview-divider")) continue;
		const range = document.createRange();
		range.selectNodeContents(node);
		for (const rect of range.getClientRects()) if (rect.height > 0 && rect.width > 0) bands.push({
			top: (rect.top - root.top) / scale,
			bottom: (rect.bottom - root.top) / scale,
			unbreakable: true
		});
		range.detach();
	}
	for (const element of content.querySelectorAll("img,.katex-display,.katex:not(.katex-display .katex)")) {
		if (element.closest(".katex-mathml,.cm-gutters,.milkdown-top-bar,.milkdown-toolbar,.studio-editor-help,.markdown-editor-loading,.operation,.image-edit,.image-resize-handle,.milkdown-link-preview,.milkdown-link-edit,.milkdown-latex-inline-edit,.milkdown-slash-menu,.milkdown-block-edit,.cell-handle,.preview-label,.preview-divider")) continue;
		const r = element.getBoundingClientRect();
		if (r.height > 0) bands.push({
			top: (r.top - root.top) / scale,
			bottom: (r.bottom - root.top) / scale,
			unbreakable: true
		});
	}
	for (const element of content.querySelectorAll("pre,table,blockquote")) {
		const r = element.getBoundingClientRect();
		if (r.height <= 0) continue;
		const style = getComputedStyle(element), edge = Math.max(1, parseFloat(style.borderBottomWidth) || 0, element.tagName === "PRE" ? parseFloat(style.paddingBottom) || 0 : 0);
		bands.push({
			top: (r.bottom - root.top) / scale - Math.min(edge, r.height / scale),
			bottom: (r.bottom - root.top) / scale,
			unbreakable: true
		});
	}
	const splitRows = [];
	for (const row of content.querySelectorAll("table tr")) {
		const r = row.getBoundingClientRect(), band = {
			top: (r.top - root.top) / scale,
			bottom: (r.bottom - root.top) / scale
		};
		if (r.height <= 0) continue;
		if (band.bottom - band.top <= height + .1) bands.push({
			...band,
			unbreakable: true
		});
		else splitRows.push(band);
	}
	const body = Math.max(source.getBoundingClientRect().height / scale, bands.reduce((m, b) => Math.max(m, b.bottom), 0));
	const breaks = textFlowBreaks(body, height, bands);
	return {
		breaks,
		height: body,
		paintTop: bands.reduce((value, band) => Math.min(value, band.top), bands.length ? Infinity : 0),
		paintBottom: bands.reduce((value, band) => Math.max(value, band.bottom), 0),
		bands,
		...markdown !== void 0 ? { sourceOffsets: splitRows.some((row) => breaks.slice(1, -1).some((cut) => cut > row.top + .1 && cut < row.bottom - .1)) ? void 0 : measureMarkdownPageOffsets(source, markdown, breaks, scale) } : {}
	};
}
/** A detached view copy is measured at 100%, so zoom/rotation never changes the logical pagination. */
function measureTextFlow(source, width, height, markdown) {
	const host = document.createElement("div"), copy = source.cloneNode(true);
	host.className = "paper-object has-text-flow";
	host.style.cssText = `position:fixed;left:-30000px;top:0;width:${width}px;pointer-events:none;`;
	host.style.font = getComputedStyle(source).font;
	host.style.setProperty("--flow-height", height + "px");
	copy.removeAttribute("id");
	copy.style.transform = "none";
	copy.style.width = width + "px";
	host.appendChild(copy);
	document.body.appendChild(host);
	try {
		const mathFits = fitPaperFlowMath(copy, width, height), result = measureUnrotated(copy, width, height, markdown);
		if (result) {
			source.dataset.flowMeasuredHeight = String(result.height);
			source.dataset.flowMeasuredBreaks = JSON.stringify(result.breaks);
			return {
				...result,
				mathFits
			};
		}
		return null;
	} finally {
		host.remove();
	}
}
//#endregion
//#region src/components/PaperTextFlowView.tsx
var _jsxFileName$19 = "/home/louis/DowzeBuild/20260923/collections-060/src/components/PaperTextFlowView.tsx";
/** A page is a viewport onto one canonical rich text, never a duplicate paragraph. */
function PaperTextFlowView({ object, document, media, pageId, children, onLayout, onNotice, continuous = false }) {
	const source = useRef(null), handlers = useRef({
		onLayout,
		onNotice
	});
	handlers.current = {
		onLayout,
		onNotice
	};
	const sourceId = "paper-flow-" + useId().replace(/[^A-Za-z0-9_-]/g, ""), [math, setMath] = useState({
		expected: "",
		css: ""
	});
	const index = Math.max(0, textFlowPageIndex(object, pageId)), offset = object.textFlow?.breaks[index] ?? 0, expected = textFlowFingerprint(object.markdown ?? "", object.width, object.height);
	useEffect(() => {
		const node = source.current;
		if (!node || continuous) return;
		let stopped = false, frame = 0, retry = 0, last = "", lastNotice = "";
		const measure = () => {
			frame = 0;
			const content = paperFlowContentElement(node);
			if (stopped || node.querySelector(".markdown-editor-loading,.paper-asset-missing,[data-code-ready=\"false\"]") || children && !node.querySelector(".ProseMirror") || [...content.querySelectorAll("img")].some((image) => !image.closest(".katex-mathml,.cm-gutters,.milkdown-top-bar,.milkdown-toolbar,.studio-editor-help,.markdown-editor-loading,.operation,.image-edit,.image-resize-handle,.milkdown-link-preview,.milkdown-link-edit,.milkdown-latex-inline-edit,.milkdown-slash-menu,.milkdown-block-edit,.cell-handle,.preview-label,.preview-divider") && (!image.complete || !image.naturalWidth))) return;
			if (!handlers.current.onLayout && !node.querySelector(".katex")) {
				setMath((current) => current.expected === expected && current.css === "" ? current : {
					expected,
					css: ""
				});
				return;
			}
			try {
				const result = measureTextFlow(node, object.width, object.height, object.markdown);
				if (!result) return;
				delete node.dataset.flowLayoutError;
				const css = paperMathFitCss(sourceId, result.mathFits);
				setMath((current) => current.expected === expected && current.css === css ? current : {
					expected,
					css
				});
				const signature = JSON.stringify([result.breaks, result.sourceOffsets]);
				if (signature === last) return;
				if (handlers.current.onLayout?.(expected, result.breaks, result.sourceOffsets) !== false) last = signature;
				else {
					clearTimeout(retry);
					retry = window.setTimeout(schedule, 150);
				}
			} catch (error) {
				const message = String(error instanceof Error ? error.message : error);
				node.dataset.flowLayoutError = message;
				if (message !== lastNotice) {
					lastNotice = message;
					handlers.current.onNotice?.(message);
				}
			}
		};
		const schedule = () => {
			if (!frame && !stopped) frame = requestAnimationFrame(measure);
		};
		const mutation = new MutationObserver(schedule);
		mutation.observe(node, {
			childList: true,
			subtree: true,
			characterData: true
		});
		const resize = new ResizeObserver(schedule);
		resize.observe(node);
		node.addEventListener("load", schedule, true);
		documentFontsReady().then(schedule);
		schedule();
		return () => {
			stopped = true;
			cancelAnimationFrame(frame);
			clearTimeout(retry);
			mutation.disconnect();
			resize.disconnect();
			node.removeEventListener("load", schedule, true);
		};
	}, [
		expected,
		!!children,
		!!onLayout,
		continuous,
		sourceId
	]);
	const segmentHeight = object.textFlow ? Math.min(object.height, object.textFlow.breaks[index + 1] - offset) : object.height;
	return /* @__PURE__ */ jsxDEV("div", {
		className: `paper-flow-clip ${continuous ? "is-continuous" : ""}`,
		"data-flow-index": index,
		style: {
			height: continuous ? "auto" : segmentHeight,
			width: continuous ? "100%" : object.width,
			"--flow-height": object.height + "px"
		},
		children: [math.expected === expected && math.css && /* @__PURE__ */ jsxDEV("style", {
			"data-paper-flow-math": true,
			children: math.css
		}, void 0, false, {
			fileName: _jsxFileName$19,
			lineNumber: 16,
			columnNumber: 282
		}, this), /* @__PURE__ */ jsxDEV("div", {
			id: sourceId,
			className: "paper-flow-source",
			ref: source,
			"data-flow-ready": continuous || math.expected === expected ? "true" : "false",
			style: {
				width: continuous ? "100%" : object.width,
				transform: continuous ? "none" : `translateY(${-offset}px)`
			},
			children: children ?? /* @__PURE__ */ jsxDEV(PaperRichText, {
				markdown: object.markdown ?? "",
				document,
				media,
				onError: onNotice
			}, void 0, false, {
				fileName: _jsxFileName$19,
				lineNumber: 16,
				columnNumber: 574
			}, this)
		}, void 0, false, {
			fileName: _jsxFileName$19,
			lineNumber: 16,
			columnNumber: 329
		}, this)]
	}, void 0, true, {
		fileName: _jsxFileName$19,
		lineNumber: 16,
		columnNumber: 9
	}, this);
}
var documentFontsReady = () => globalThis.document.fonts?.ready ?? Promise.resolve();
//#endregion
//#region src/lib/paperTransforms.ts
/** Normalize ink bounds without changing any visible point, including rotated legacy strokes. */
function compactInk(object) {
	if (object.kind !== "ink" || !object.points?.length) return object;
	const pad = (object.strokeWidth ?? 3) * (object.pen === "calligraphy" ? 2.4 : 1.2), points = object.points.map((point) => paperInkPointOnPage(object, point));
	const bounds = points.reduce((b, p) => ({
		left: Math.min(b.left, p.x),
		right: Math.max(b.right, p.x),
		top: Math.min(b.top, p.y),
		bottom: Math.max(b.bottom, p.y)
	}), {
		left: Infinity,
		top: Infinity,
		right: -Infinity,
		bottom: -Infinity
	});
	const left = bounds.left - pad, top = bounds.top - pad, right = bounds.right + pad, bottom = bounds.bottom + pad;
	const { mirrorX: _, mirrorY: __, ...normal } = object;
	return {
		...normal,
		x: left,
		y: top,
		width: Math.max(1, right - left),
		height: Math.max(1, bottom - top),
		rotation: 0,
		...object.pen === "calligraphy" ? { nibAngle: paperDirectionOnPage(object, object.nibAngle ?? 45) } : {},
		points: points.map((p) => ({
			...p,
			x: p.x - left,
			y: p.y - top
		}))
	};
}
function resizePaperObject(object, width, height) {
	if (object.locked) throw Error("Déverrouillez cet objet avant de le redimensionner.");
	if (!Number.isFinite(width) || !Number.isFinite(height) || width < 8 || height < 8 || width > 2e4 || height > 1e5) throw Error("Dimensions invalides.");
	const normalized = compactInk(object), sx = width / Math.max(1, normalized.width), sy = height / Math.max(1, normalized.height);
	return {
		...normalized,
		width,
		height,
		...normalized.points ? {
			points: normalized.points.map((p) => ({
				...p,
				x: p.x * sx,
				y: p.y * sy
			})),
			strokeWidth: (normalized.strokeWidth ?? 3) * Math.sqrt(sx * sy)
		} : {}
	};
}
function expandPaperGroups(objects, ids) {
	const groups = new Set(objects.filter((o) => ids.includes(o.id) && o.groupId).map((o) => o.groupId));
	return objects.filter((o) => ids.includes(o.id) || o.groupId && groups.has(o.groupId)).map((o) => o.id);
}
function orderedPaperObjects(objects, ids, direction) {
	const sorted = [...objects].sort((a, b) => a.z - b.z), selected = sorted.filter((o) => ids.includes(o.id) && !o.locked), rest = sorted.filter((o) => !selected.some((s) => s.id === o.id));
	return (direction === "front" ? [...rest, ...selected] : [...selected, ...rest]).map((o, z) => ({
		...o,
		z
	}));
}
function rotatePaperSelection(objects, angle) {
	const editable = objects.filter((o) => !o.locked);
	if (!editable.length) return [];
	const corners = editable.flatMap((o) => [
		{
			x: 0,
			y: 0
		},
		{
			x: o.width,
			y: 0
		},
		{
			x: o.width,
			y: o.height
		},
		{
			x: 0,
			y: o.height
		}
	].map((p) => objectPoint(o, p)));
	const left = Math.min(...corners.map((p) => p.x)), right = Math.max(...corners.map((p) => p.x)), top = Math.min(...corners.map((p) => p.y)), bottom = Math.max(...corners.map((p) => p.y)), cx = (left + right) / 2, cy = (top + bottom) / 2, a = angle * Math.PI / 180;
	return editable.map((o) => {
		const x = o.x + o.width / 2 - cx, y = o.y + o.height / 2 - cy;
		return {
			...o,
			x: cx + x * Math.cos(a) - y * Math.sin(a) - o.width / 2,
			y: cy + x * Math.sin(a) + y * Math.cos(a) - o.height / 2,
			rotation: (o.rotation + angle) % 360
		};
	});
}
//#endregion
//#region src/lib/paperClipboard.ts
var selections = /* @__PURE__ */ new Map();
var serials = /* @__PURE__ */ new Map();
var scopeKey = (media) => JSON.stringify([media.accountId, media.spaceId]);
var equal$2 = (a, b) => JSON.stringify(a) === JSON.stringify(b);
var check$2 = (current) => {
	if (!current()) throw Error("Le carnet ou le compte a changé. Les objets copiés et leurs originaux restent conservés.");
};
/** A copy publishes one immutable selection only after its scoped reads finish.
* A newer copy or account cleanup cannot be overwritten by an old completion. */
async function copyPaperSelection(document, ids, media, current = () => true, pageId) {
	check$2(current);
	if (!isPaperDocument(document)) throw Error("La sélection attend un carnet valide.");
	const source = structuredClone(document), selected = [...new Set(ids)];
	if (!selected.length || selected.some((id) => !source.objects.some((object) => object.id === id))) throw Error("La sélection doit être retrouvée avant sa copie.");
	if (pageId && !source.pages.some((page) => page.id === pageId)) throw Error("La page de cette sélection a changé.");
	const key = scopeKey(media), serial = (serials.get(key) ?? 0) + 1;
	serials.set(key, serial);
	const valid = () => current() && serials.get(key) === serial;
	const objects = source.objects.filter((object) => selected.includes(object.id)).map((object) => {
		if (!pageId || !object.textFlow) return object;
		const { textFlow, ...copy } = object;
		return {
			...copy,
			pageId,
			markdown: copiedPageText(object, pageId)
		};
	}), needed = new Set(objects.flatMap((object) => object.assetId ? [object.assetId] : []));
	for (const object of objects) if (object.markdown) for (const image of scanLegacyPaperImages(object.markdown).images) {
		if (image.kind === "invalid-photo") throw Error("Une image de cette sélection doit être récupérée.");
		if (image.kind !== "photo") continue;
		const resolved = resolvePaperPhotoReference(source, image.url);
		if (resolved.kind !== "asset") throw Error(resolved.kind === "unavailable" ? resolved.message : "Une référence d’image est incompatible.");
		needed.add(resolved.asset.id);
	}
	const assets = source.assets.filter((asset) => needed.has(asset.id));
	if (assets.length !== needed.size) throw Error("Une pièce jointe de la sélection manque.");
	const bytes = /* @__PURE__ */ new Map();
	let total = 0;
	for (const asset of assets) {
		check$2(valid);
		const blob = await readPaperAsset(asset, media, {
			document: source,
			current: valid
		});
		check$2(valid);
		total += blob.size;
		if (total > 33554432) throw Error("Copiez cette sélection en plusieurs parties de moins de 32 Mo.");
		bytes.set(asset.id, blob);
	}
	check$2(valid);
	selections.set(key, {
		objects: structuredClone(objects),
		assets: structuredClone(assets),
		bytes,
		source: {
			noteId: source.noteId,
			revision: source.revision,
			...pageId ? { pageId } : {},
			objectIds: selected
		},
		serial
	});
	return objects.length;
}
function hasPaperSelection(media) {
	return !!selections.get(scopeKey(media))?.objects.length;
}
/** No storage mutation occurs here. The caller applies draft, bytes, receipt and
* exact recovery snapshot together through paper.applyPrepared/CAS. */
async function preparePastePaperSelection(document, pageId, media, current) {
	check$2(current);
	if (!isPaperDocument(document)) throw Error("Le carnet de destination doit être retrouvé.");
	const page = document.pages.find((page) => page.id === pageId);
	if (!page) throw Error("La page de destination a changé.");
	const scope = {
		accountId: media.accountId,
		spaceId: media.spaceId
	}, key = scopeKey(media), copy = selections.get(key);
	if (!copy?.objects.length) throw Error("Copiez d’abord une sélection dans cet espace.");
	const valid = () => current() && selections.get(key) === copy;
	check$2(valid);
	const identity = {
		...scope,
		type: "whiteboard",
		documentId: notebookDocumentId(document.noteId)
	}, stored = await getDraft(identity);
	check$2(valid);
	if (!stored || stored.accountId !== scope.accountId || stored.spaceId !== scope.spaceId || stored.type !== "whiteboard" || stored.documentId !== identity.documentId || stored.identityAlias || stored.staged || stored.syncState === "conflict" || !isPaperDocument(stored.content) || !equal$2(stored.content, document)) throw Error("La note a changé ou attend son enregistrement. Reprenez le collage depuis sa version conservée.");
	if (await readNotebookDeletionStatus(document.noteId, scope, valid)) throw Error("Cette note est supprimée. Le collage ne la recrée pas.");
	check$2(valid);
	const deletionKey = notebookDeletionKey(identity), deletion = await getSnapshot(deletionKey);
	check$2(valid);
	if (deletion) throw Error("La suppression de cette note doit être départagée.");
	const files = await listLocalBlobs(scope.accountId, scope.spaceId);
	check$2(valid);
	const occupied = /* @__PURE__ */ new Set([
		...document.objects.map((object) => object.id),
		...document.objects.flatMap((object) => object.groupId ? [object.groupId] : []),
		...document.assets.map((asset) => asset.id),
		...files.map((file) => file.id)
	]);
	const allocate = () => {
		for (let i = 0; i < 32; i++) {
			const value = crypto.randomUUID();
			if (!occupied.has(value)) {
				occupied.add(value);
				return value;
			}
		}
		throw Error("Le collage attend des identités nouvelles.");
	};
	const assets = new Map(copy.assets.map((asset) => [asset.id, allocate()])), groups = new Map(copy.objects.filter((object) => object.groupId).map((object) => [object.groupId, allocate()])), commands = [], ids = [], blobs = [], now = (/* @__PURE__ */ new Date()).toISOString(), at = Date.parse(now), warnings = [];
	for (const asset of copy.assets) {
		check$2(valid);
		const original = copy.bytes.get(asset.id);
		if (!original || asset.size > 0 && original.size !== asset.size) throw Error("Un original copié manque ou possède une autre taille.");
		const id = assets.get(asset.id), blob = original.slice(0, void 0, asset.mediaType), sha256 = await localBlobDigest(blob);
		check$2(valid);
		blobs.push({
			...scope,
			id,
			documentId: identity.documentId,
			blob,
			name: asset.name,
			createdAt: at,
			status: "pending",
			removedFromNote: false,
			revision: 1,
			sha256
		});
		commands.push({
			type: "add-asset",
			asset: {
				...asset,
				id,
				size: blob.size,
				serverId: void 0
			}
		});
	}
	const top = Math.max(0, ...document.objects.filter((object) => object.pageId === pageId || object.textFlow?.pageIds.includes(pageId)).map((object) => object.z));
	for (const original of copy.objects) {
		check$2(valid);
		const id = allocate();
		ids.push(id);
		const { audioAnchor, textFlow, ...object } = structuredClone(original);
		let markdown = object.markdown;
		if (markdown !== void 0) {
			const scan = scanLegacyPaperImages(markdown), replacements = /* @__PURE__ */ new Map();
			for (const image of scan.images) if (image.kind === "photo") {
				const asset = assets.get(image.photo.id);
				if (!asset) throw Error("Une image copiée ne possède plus son original.");
				replacements.set(image.id, photoReference(identity.documentId, asset));
			}
			markdown = planLegacyPaperImageRewrite(scan, replacements).markdown;
		}
		const anchor = audioAnchor && copy.source.noteId === document.noteId && document.audio.some((track) => track.id === audioAnchor.sessionId) ? audioAnchor : void 0;
		if (audioAnchor && !anchor && !warnings.length) warnings.push("Les liens vers les passages audio de la note d’origine restent dans cette note.");
		commands.push({
			type: "upsert-object",
			object: {
				...object,
				id,
				pageId,
				x: Math.max(0, Math.min(object.x + 24, page.width - Math.min(page.width, object.width))),
				y: Math.max(0, Math.min(object.y + 24, page.height - Math.min(page.height, object.height))),
				z: top + ids.length,
				locked: false,
				createdAt: at,
				...markdown !== void 0 ? { markdown } : {},
				...object.assetId ? { assetId: assets.get(object.assetId) } : {},
				...object.groupId ? { groupId: groups.get(object.groupId) } : {},
				...anchor ? { audioAnchor: anchor } : {}
			}
		});
	}
	const next = amendPaperCollaboration(document, applyPaperCommand(document, {
		type: "batch",
		commands
	}, now), JSON.stringify([
		scope.accountId,
		scope.spaceId,
		document.noteId
	])), draft = {
		...stored,
		content: next,
		updatedAt: at,
		syncState: "local"
	};
	const historyKey = `paper-history|${scope.accountId}|${scope.spaceId}|whiteboard|${identity.documentId}|${String(document.revision).padStart(12, "0")}`, history = await getSnapshot(historyKey);
	check$2(valid);
	if (history && (history.accountId !== scope.accountId || history.spaceId !== scope.spaceId || history.key !== historyKey)) throw Error("L’historique de cette note possède une autre portée.");
	const exactHistoryKey = history && !equal$2(history.value, document) ? `${historyKey}|clipboard-${allocate()}` : historyKey, exactHistory = exactHistoryKey === historyKey ? history : await getSnapshot(exactHistoryKey);
	check$2(valid);
	if (exactHistoryKey !== historyKey && exactHistory) throw Error("Une version du collage utilise déjà cette identité.");
	const receiptKey = `paper-clipboard-paste|v1|${notebookIdentityDigest(JSON.stringify([
		scope.accountId,
		scope.spaceId,
		document.noteId
	]))}|${allocate()}`, receiptBefore = await getSnapshot(receiptKey);
	check$2(valid);
	if (receiptBefore) throw Error("Un reçu de collage utilise déjà cette identité.");
	const receipt = {
		...scope,
		key: receiptKey,
		value: {
			schema: 1,
			kind: "paper-clipboard-paste",
			noteId: document.noteId,
			pageId,
			source: copy.source,
			objectIds: ids,
			files: blobs.map((file) => ({
				assetId: file.id,
				sha256: file.sha256,
				size: file.blob.size
			})),
			beforeHistoryKey: exactHistoryKey,
			warnings,
			appliedAt: now
		}
	};
	const commit = {
		target: scope,
		sources: [scope],
		drafts: [draft],
		blobs,
		snapshots: [receipt, ...exactHistory && equal$2(exactHistory.value, document) ? [] : [{
			...scope,
			key: exactHistoryKey,
			value: document
		}]],
		draftChecks: [{
			identity,
			expected: stored
		}],
		blobChecks: blobs.map((file) => ({
			identity: file,
			expected: void 0
		})),
		snapshotChecks: [
			{
				key: deletionKey,
				expected: void 0
			},
			{
				key: receiptKey,
				expected: void 0
			},
			{
				key: historyKey,
				expected: history
			},
			...exactHistoryKey !== historyKey ? [{
				key: exactHistoryKey,
				expected: void 0
			}] : []
		]
	};
	check$2(valid);
	return {
		draft,
		commit,
		ids,
		commands,
		warnings
	};
}
/** Legacy command-only callers can still paste objects without files. File
* selections require the atomic prepared path; never prewrite orphan blobs. */
async function pastePaperSelection(noteId, pageId, media, current = () => true) {
	check$2(current);
	const copy = selections.get(scopeKey(media));
	if (!copy?.objects.length) throw Error("Copiez d’abord une sélection dans cet espace.");
	if (copy.assets.length) throw Error("Le collage de fichiers doit utiliser la préparation protégée du carnet.");
	const stored = await getDraft({
		...media,
		type: "whiteboard",
		documentId: notebookDocumentId(noteId)
	});
	check$2(current);
	if (!stored || !isPaperDocument(stored.content)) throw Error("Le carnet de destination attend son ouverture.");
	const prepared = await preparePastePaperSelection(stored.content, pageId, media, current);
	return {
		commands: prepared.commands,
		ids: prepared.ids
	};
}
function clearPaperSelections(accountId) {
	for (const key of /* @__PURE__ */ new Set([...selections.keys(), ...serials.keys()])) if (JSON.parse(key)[0] === accountId) {
		selections.delete(key);
		serials.set(key, (serials.get(key) ?? 0) + 1);
	}
}
//#endregion
//#region src/lib/paperNotebookCommands.ts
var PAPER_NOTEBOOK_COMMANDS = [
	{
		id: "move-left",
		label: "Déplacer à gauche",
		shortcut: "← · Maj : 10 unités",
		changesDocument: true
	},
	{
		id: "move-right",
		label: "Déplacer à droite",
		shortcut: "→ · Maj : 10 unités",
		changesDocument: true
	},
	{
		id: "move-up",
		label: "Déplacer vers le haut",
		shortcut: "↑ · Maj : 10 unités",
		changesDocument: true
	},
	{
		id: "move-down",
		label: "Déplacer vers le bas",
		shortcut: "↓ · Maj : 10 unités",
		changesDocument: true
	},
	{
		id: "copy",
		label: "Copier la sélection",
		shortcut: "Ctrl/Cmd+C",
		changesDocument: false
	},
	{
		id: "paste",
		label: "Coller les objets copiés",
		shortcut: "Ctrl/Cmd+V",
		changesDocument: true
	},
	{
		id: "duplicate",
		label: "Dupliquer la sélection",
		changesDocument: true
	},
	{
		id: "lock",
		label: "Verrouiller la sélection",
		changesDocument: true
	},
	{
		id: "unlock",
		label: "Déverrouiller la sélection",
		changesDocument: true
	},
	{
		id: "rotate-right",
		label: "Tourner à droite de 15°",
		changesDocument: true
	},
	{
		id: "rotate-left",
		label: "Tourner à gauche de 15°",
		changesDocument: true
	},
	{
		id: "group",
		label: "Grouper la sélection",
		changesDocument: true
	},
	{
		id: "ungroup",
		label: "Dégrouper la sélection",
		changesDocument: true
	},
	{
		id: "front",
		label: "Mettre au premier plan",
		changesDocument: true
	},
	{
		id: "back",
		label: "Mettre à l’arrière-plan",
		changesDocument: true
	},
	{
		id: "delete",
		label: "Supprimer la sélection",
		shortcut: "Suppr",
		changesDocument: true
	},
	{
		id: "audio",
		label: "Écouter le passage audio",
		changesDocument: false
	}
];
var equal$1 = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function capturePaperNotebookCommandTarget(context, ids = context.selected) {
	const page = context.document.pages.find((value) => value.id === context.pageId);
	if (!page || !Number.isSafeInteger(context.generation)) throw Error("La page doit être retrouvée avant cette commande.");
	const selected = [...new Set(ids)], visible = new Set(context.objects.map((object) => object.id));
	if (selected.some((id) => !visible.has(id) || !context.document.objects.some((object) => object.id === id))) throw Error("La sélection a changé de page.");
	return structuredClone({
		ownerKey: context.ownerKey,
		generation: context.generation,
		noteId: context.document.noteId,
		pageId: context.pageId,
		revision: context.document.revision,
		page,
		objects: selected.map((id) => context.document.objects.find((object) => object.id === id)),
		selected,
		assets: context.document.assets,
		audio: context.document.audio,
		pageObjects: JSON.stringify(context.objects),
		lineage: context.document.collaboration?.lineage ?? null,
		readOnly: context.readOnly,
		blocked: context.blocked === true,
		tombstone: context.tombstone === true,
		mode: context.mode ?? null
	});
}
function samePaperNotebookCommandScope(target, context) {
	return !!context && target.ownerKey === context.ownerKey && target.generation === context.generation && target.noteId === context.document.noteId && target.pageId === context.pageId && target.mode === (context.mode ?? null) && target.lineage === (context.document.collaboration?.lineage ?? null) && target.readOnly === context.readOnly && target.blocked === (context.blocked === true) && target.tombstone === (context.tombstone === true) && !context.tombstone;
}
function paperNotebookCommandTargetCurrent(target, context) {
	if (!samePaperNotebookCommandScope(target, context) || target.revision !== context.document.revision || target.pageObjects !== JSON.stringify(context.objects) || !equal$1(target.page, context.document.pages.find((page) => page.id === target.pageId)) || !equal$1(target.assets, context.document.assets) || !equal$1(target.audio, context.document.audio) || !equal$1(target.selected, [...new Set(context.selected)])) return false;
	return target.objects.every((expected) => context.objects.some((object) => object.id === expected.id) && equal$1(expected, context.document.objects.find((object) => object.id === expected.id)));
}
function paperNotebookObjectLabel(object, index) {
	const kind = object.kind === "ink" ? object.pen === "highlighter" ? "Surlignage" : "Trait" : object.kind === "image" ? "Image" : object.kind === "shape" ? "Forme" : object.kind === "sticky" ? "Post-it" : "Texte";
	const excerpt = (object.markdown ?? "").replace(/\s+/g, " ").trim().slice(0, 70);
	return `${kind} ${index + 1}${excerpt ? " · " + excerpt : ""}${object.locked ? " · verrouillé" : ""}${object.audioAnchor ? " · passage audio" : ""}`;
}
function paperNotebookCommandAvailability(id, context, media) {
	const chosen = context.objects.filter((object) => context.selected.includes(object.id)), editable = chosen.filter((object) => !object.locked), definition = PAPER_NOTEBOOK_COMMANDS.find((item) => item.id === id);
	if (context.tombstone) return {
		enabled: false,
		reason: "Cette note est supprimée."
	};
	if (definition.changesDocument && (context.readOnly || context.blocked)) return {
		enabled: false,
		reason: context.blocked ? "La note attend la résolution de ses versions." : "La note est en lecture seule."
	};
	if (id === "paste") return hasPaperSelection(media) ? { enabled: true } : {
		enabled: false,
		reason: "Copiez d’abord des objets dans cet espace."
	};
	if (!chosen.length) return {
		enabled: false,
		reason: "Sélectionnez un objet dans la liste."
	};
	if (id === "copy" || id === "duplicate") return { enabled: true };
	if (id === "audio") return chosen.length === 1 && !!chosen[0].audioAnchor && context.document.audio.some((track) => track.id === chosen[0].audioAnchor.sessionId) ? { enabled: true } : {
		enabled: false,
		reason: "Sélectionnez un objet lié à un passage audio."
	};
	if (id === "lock") return chosen.some((object) => !object.locked) ? { enabled: true } : {
		enabled: false,
		reason: "La sélection est déjà verrouillée."
	};
	if (id === "unlock") return chosen.some((object) => object.locked) ? { enabled: true } : {
		enabled: false,
		reason: "La sélection est déjà déverrouillée."
	};
	if (!editable.length) return {
		enabled: false,
		reason: "Déverrouillez les objets pour les modifier."
	};
	if (id === "group" && editable.length < 2) return {
		enabled: false,
		reason: "Sélectionnez au moins deux objets déverrouillés."
	};
	if (id === "ungroup" && !editable.some((object) => object.groupId)) return {
		enabled: false,
		reason: "Ces objets ne sont pas groupés."
	};
	return { enabled: true };
}
function planPaperNotebookCommand(id, context, step = 1, newId = () => crypto.randomUUID()) {
	const chosen = context.objects.filter((object) => context.selected.includes(object.id)), editable = chosen.filter((object) => !object.locked), batch = (commands) => commands.length ? { command: {
		type: "batch",
		commands
	} } : null;
	if (!Number.isFinite(step) || step <= 0 || step > 1e3) throw Error("Le déplacement demandé est invalide.");
	if (id.startsWith("move-")) {
		const dx = id === "move-left" ? -step : id === "move-right" ? step : 0, dy = id === "move-up" ? -step : id === "move-down" ? step : 0;
		return batch(editable.map((object) => ({
			type: "patch-object",
			id: object.id,
			patch: {
				x: object.x + dx,
				y: object.y + dy
			}
		})));
	}
	if (id === "lock" || id === "unlock") return batch(chosen.filter((object) => object.locked !== (id === "lock")).map((object) => ({
		type: "patch-object",
		id: object.id,
		patch: { locked: id === "lock" }
	})));
	if (id === "rotate-right" || id === "rotate-left") return batch(rotatePaperSelection(chosen, id === "rotate-right" ? 15 : -15).map((object) => ({
		type: "upsert-object",
		object
	})));
	if (id === "front" || id === "back") return batch(orderedPaperObjects([...context.objects], [...context.selected], id).filter((object) => object.z !== context.objects.find((source) => source.id === object.id)?.z).map((object) => ({
		type: "patch-object",
		id: object.id,
		patch: { z: object.z }
	})));
	if (id === "group") {
		let groupId = "";
		for (let attempt = 0; attempt < 32; attempt++) {
			const value = newId();
			if (!context.document.objects.some((object) => object.id === value || object.groupId === value)) {
				groupId = value;
				break;
			}
		}
		if (!groupId) throw Error("Le groupe attend une nouvelle identité.");
		return batch(editable.map((object) => ({
			type: "patch-object",
			id: object.id,
			patch: { groupId }
		})));
	}
	if (id === "ungroup") return batch(editable.filter((object) => object.groupId).map((object) => ({
		type: "patch-object",
		id: object.id,
		patch: { groupId: void 0 }
	})));
	if (id === "delete") return editable.length ? {
		command: {
			type: "remove-objects",
			ids: editable.map((object) => object.id)
		},
		selected: chosen.filter((object) => object.locked).map((object) => object.id)
	} : null;
	if (id === "duplicate") {
		const occupied = new Set(context.document.objects.flatMap((object) => object.groupId ? [object.id, object.groupId] : [object.id])), groups = /* @__PURE__ */ new Map(), ids = [], top = Math.max(0, ...context.objects.map((object) => object.z));
		const allocate = () => {
			for (let i = 0; i < 32; i++) {
				const id = newId();
				if (!occupied.has(id)) {
					occupied.add(id);
					return id;
				}
			}
			throw Error("La copie attend une nouvelle identité.");
		};
		for (const object of chosen) if (object.groupId && !groups.has(object.groupId)) {
			const id = allocate();
			groups.set(object.groupId, id);
		}
		const commands = chosen.map((original, index) => {
			const id = allocate();
			ids.push(id);
			const { textFlow, ...object } = structuredClone(original);
			return {
				type: "upsert-object",
				object: {
					...object,
					id,
					pageId: context.pageId,
					x: object.x + 20,
					y: object.y + 20,
					z: top + index + 1,
					locked: false,
					createdAt: Date.now(),
					...object.groupId ? { groupId: groups.get(object.groupId) } : {}
				}
			};
		});
		return commands.length ? {
			command: {
				type: "batch",
				commands
			},
			selected: ids
		} : null;
	}
	return null;
}
async function executePaperNotebookCommand(host, id, target, step = 1) {
	const current = () => paperNotebookCommandTargetCurrent(target, host.getCurrent());
	if (!current()) return false;
	const context = host.getCurrent();
	if (!paperNotebookCommandAvailability(id, context, host.media).enabled) return false;
	try {
		if (id === "copy") {
			const count = await copyPaperSelection(context.document, target.selected, host.media, current, target.pageId);
			if (!current()) return false;
			host.onNotice?.(`${count} objet${count > 1 ? "s" : ""} copié${count > 1 ? "s" : ""}.`);
			return true;
		}
		if (id === "paste") {
			if (!current()) return false;
			return await host.onPaste(target);
		}
		if (id === "audio") {
			const anchor = target.objects[0]?.audioAnchor;
			if (!anchor || !current() || !host.onAudio) return false;
			host.onAudio({ ...anchor }, target);
			return true;
		}
		const plan = planPaperNotebookCommand(id, context, step);
		if (!plan || !current()) return false;
		if (!await host.onCommit(plan.command, target)) return false;
		const latest = host.getCurrent();
		if (plan.selected && samePaperNotebookCommandScope(target, latest) && plan.selected.every((value) => latest.document.objects.some((object) => object.id === value))) host.onSelect(plan.selected, target);
		return true;
	} catch (error) {
		if (current()) host.onNotice?.(String(error instanceof Error ? error.message : error));
		return false;
	}
}
function paperNotebookSelectedGroup(context, id, multi = false) {
	const group = expandPaperGroups([...context.objects], [id]);
	return multi ? context.selected.includes(id) ? context.selected.filter((value) => !group.includes(value)) : [.../* @__PURE__ */ new Set([...context.selected, ...group])] : group;
}
//#endregion
//#region src/components/PaperCommandMenu.tsx
var _jsxFileName$18 = "/home/louis/DowzeBuild/20260923/collections-060/src/components/PaperCommandMenu.tsx";
var editing = (target) => target instanceof Element && !!target.closest("input,textarea,select,[contenteditable=\"true\"]");
/** The visible trigger and object list remain the primary paths on touch screens.
* The page integration delegates contextmenu/Maj+F10 and surface keys to this ref. */
var PaperCommandMenu = forwardRef(function PaperCommandMenu(props, ref) {
	const latest = useRef(props);
	latest.current = props;
	const alive = useRef(true), scope = useRef({
		key: "",
		lease: 0
	}), serial = useRef(0), trigger = useRef(null), panel = useRef(null), objectsList = useRef(null), commandsList = useRef(null);
	const [session, setSession] = useState(null), sessionRef = useRef(session);
	sessionRef.current = session;
	const busyRef = useRef(false);
	const [busy, setBusy] = useState(false), [objectFocus, setObjectFocus] = useState(0), [commandFocus, setCommandFocus] = useState(0), [position, setPosition] = useState({
		left: 12,
		top: 60
	});
	const rangeAnchor = useRef(null), focusRequested = useRef(false);
	const scopeKey = JSON.stringify([
		props.context.ownerKey,
		props.context.generation,
		props.context.pageId,
		props.context.mode ?? null,
		props.context.readOnly,
		props.context.blocked === true,
		props.context.tombstone === true,
		props.context.document.collaboration?.lineage ?? null
	]);
	if (scope.current.key !== scopeKey) scope.current = {
		key: scopeKey,
		lease: scope.current.lease + 1
	};
	const renderLease = scope.current.lease;
	const visible = session?.lease === renderLease ? session : null;
	const live = () => alive.current && scope.current.lease === renderLease;
	const ownedSession = (value) => live() && sessionRef.current === value && value.lease === renderLease;
	const close = (value = sessionRef.current, restore = true) => {
		if (!live() || value && sessionRef.current !== value) return;
		sessionRef.current = null;
		setSession(null);
		busyRef.current = false;
		setBusy(false);
		if (restore && value?.lease === renderLease && value.returnFocus?.isConnected) try {
			value.returnFocus.focus();
		} catch {}
	};
	const open = (options = {}) => {
		if (!live()) return false;
		latest.current.onOpen?.();
		const context = latest.current.getCurrent();
		if (!context || context.ownerKey !== latest.current.context.ownerKey || context.generation !== latest.current.context.generation || context.pageId !== latest.current.context.pageId || context.tombstone) return false;
		try {
			let ids = [...context.selected];
			const before = capturePaperNotebookCommandTarget(context);
			if (options.objectId && !ids.includes(options.objectId)) {
				ids = paperNotebookSelectedGroup(context, options.objectId);
				if (!ids.length) return false;
				if (!paperNotebookCommandTargetCurrent(before, latest.current.getCurrent())) return false;
				latest.current.onSelect(ids, before);
			}
			const target = capturePaperNotebookCommandTarget({
				...context,
				selected: ids
			}), value = {
				id: ++serial.current,
				lease: renderLease,
				target,
				returnFocus: options.returnFocus ?? trigger.current,
				point: options.point
			};
			sessionRef.current = value;
			setSession(value);
			busyRef.current = false;
			setBusy(false);
			rangeAnchor.current = null;
			setObjectFocus(Math.max(0, context.objects.findIndex((object) => ids.includes(object.id))));
			setCommandFocus(0);
			return true;
		} catch (error) {
			if (live()) latest.current.onNotice?.(String(error instanceof Error ? error.message : error));
			return false;
		}
	};
	const run = async (id, value, step = 1) => {
		if (!ownedSession(value) || busyRef.current) return false;
		busyRef.current = true;
		setBusy(true);
		const success = await executePaperNotebookCommand({
			...latest.current,
			getCurrent: () => ownedSession(value) ? latest.current.getCurrent() : null
		}, id, value.target, step);
		if (!ownedSession(value)) return false;
		busyRef.current = false;
		setBusy(false);
		if (success) close(value);
		return success;
	};
	const contextMenu = (event) => {
		if (!live() || event.defaultPrevented || editing(event.target)) return false;
		const objectId = event.target instanceof Element ? event.target.closest("[data-object]")?.getAttribute("data-object") ?? void 0 : void 0, returnFocus = event.currentTarget instanceof HTMLElement || event.currentTarget instanceof SVGElement ? event.currentTarget : trigger.current;
		const success = open({
			objectId,
			returnFocus,
			point: typeof event.clientX === "number" && typeof event.clientY === "number" ? {
				x: event.clientX,
				y: event.clientY
			} : void 0
		});
		if (success) {
			event.preventDefault();
			event.stopPropagation();
		}
		return success;
	};
	const surfaceKeys = (event) => {
		if (!live() || event.defaultPrevented || event.isComposing || editing(event.target)) return false;
		if (event.key === "ContextMenu" || event.key === "F10" && event.shiftKey) return contextMenu(event);
		if (sessionRef.current) return false;
		if (!(event.target instanceof Element ? event.target : null)?.closest("[data-paper-command-surface]")) return false;
		let id;
		if ((event.ctrlKey || event.metaKey) && !event.altKey) id = event.key?.toLowerCase() === "c" ? "copy" : event.key?.toLowerCase() === "v" ? "paste" : void 0;
		else if (!event.ctrlKey && !event.metaKey && !event.altKey) id = event.key === "ArrowLeft" ? "move-left" : event.key === "ArrowRight" ? "move-right" : event.key === "ArrowUp" ? "move-up" : event.key === "ArrowDown" ? "move-down" : event.key === "Delete" ? "delete" : void 0;
		if (!id) return false;
		const context = latest.current.getCurrent();
		if (!context || !paperNotebookCommandAvailability(id, context, latest.current.media).enabled) return false;
		const targetSnapshot = capturePaperNotebookCommandTarget(context), host = {
			...latest.current,
			getCurrent: () => live() ? latest.current.getCurrent() : null
		};
		event.preventDefault();
		event.stopPropagation();
		executePaperNotebookCommand(host, id, targetSnapshot, event.shiftKey ? 10 : 1);
		return true;
	};
	useImperativeHandle(ref, () => ({
		open,
		close: () => close(),
		handleContextMenu: contextMenu,
		handleKeyDown: surfaceKeys
	}));
	useLayoutEffect(() => {
		alive.current = true;
		return () => {
			alive.current = false;
			serial.current++;
			sessionRef.current = null;
		};
	}, []);
	useLayoutEffect(() => {
		if (sessionRef.current?.lease !== renderLease) {
			sessionRef.current = null;
			setSession(null);
			busyRef.current = false;
			setBusy(false);
		}
	}, [renderLease]);
	useLayoutEffect(() => {
		if (!visible || !panel.current) return;
		const value = visible, place = () => {
			if (!ownedSession(value) || !panel.current) return;
			const anchor = value.point ?? (() => {
				const box = trigger.current?.getBoundingClientRect();
				return {
					x: box?.left ?? 12,
					y: box?.bottom ?? 52
				};
			})(), box = panel.current.getBoundingClientRect();
			setPosition({
				left: Math.max(8, Math.min(anchor.x, innerWidth - box.width - 8)),
				top: Math.max(8, Math.min(anchor.y, innerHeight - box.height - 8))
			});
		};
		place();
		const task = requestAnimationFrame(() => {
			if (!ownedSession(value)) return;
			(objectsList.current?.querySelector("[tabindex=\"0\"]") ?? panel.current?.querySelector("button"))?.focus();
		});
		addEventListener("resize", place);
		return () => {
			cancelAnimationFrame(task);
			removeEventListener("resize", place);
		};
	}, [visible?.id]);
	const selectObjects = (ids, value) => {
		if (!ownedSession(value) || busyRef.current) return;
		const context = latest.current.getCurrent();
		if (!context || !paperNotebookCommandTargetCurrent(value.target, context)) return;
		const next = {
			...value,
			id: ++serial.current,
			target: capturePaperNotebookCommandTarget({
				...context,
				selected: ids
			})
		};
		latest.current.onSelect(ids, value.target);
		sessionRef.current = next;
		setSession(next);
	};
	const choose = (index, value, multi = false, range = false) => {
		const context = latest.current.getCurrent();
		if (!context || !ownedSession(value)) return;
		const object = context.objects[index];
		if (!object) return;
		let ids;
		if (range) {
			const from = rangeAnchor.current ?? objectFocus;
			ids = [...new Set(context.objects.slice(Math.min(from, index), Math.max(from, index) + 1).flatMap((object) => paperNotebookSelectedGroup(context, object.id)))];
		} else {
			rangeAnchor.current = index;
			ids = paperNotebookSelectedGroup(context, object.id, multi);
		}
		setObjectFocus(index);
		selectObjects(ids, value);
	};
	const focusObject = (index) => {
		focusRequested.current = true;
		setObjectFocus(index);
		objectsList.current?.querySelector(`[data-command-object-index="${index}"]`)?.focus();
	};
	const objectKeys = (event, value) => {
		if (!ownedSession(value) || event.defaultPrevented) return;
		const count = props.context.objects.length;
		if (event.key === "ArrowUp" || event.key === "ArrowDown" || event.key === "Home" || event.key === "End") {
			event.preventDefault();
			event.stopPropagation();
			const next = event.key === "Home" ? 0 : event.key === "End" ? count - 1 : Math.max(0, Math.min(count - 1, objectFocus + (event.key === "ArrowDown" ? 1 : -1)));
			if (event.shiftKey) choose(next, value, false, true);
			focusObject(next);
			return;
		}
		if (event.key === " " || event.key === "Enter") {
			event.preventDefault();
			event.stopPropagation();
			choose(objectFocus, value, event.key === " " || event.ctrlKey || event.metaKey);
			return;
		}
		if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a") {
			event.preventDefault();
			event.stopPropagation();
			selectObjects(props.context.objects.map((object) => object.id), value);
			return;
		}
		if ((event.ctrlKey || event.metaKey) && ["c", "v"].includes(event.key.toLowerCase()) || event.key === "Delete") {
			event.preventDefault();
			event.stopPropagation();
			run(event.key === "Delete" ? "delete" : event.key.toLowerCase() === "c" ? "copy" : "paste", value);
		}
	};
	const menuKeys = (event, value) => {
		if (!ownedSession(value) || event.defaultPrevented) return;
		const enabled = PAPER_NOTEBOOK_COMMANDS.map((item, index) => paperNotebookCommandAvailability(item.id, props.context, props.media).enabled ? index : -1).filter((index) => index >= 0);
		if (!enabled.length) return;
		if (![
			"ArrowUp",
			"ArrowDown",
			"Home",
			"End"
		].includes(event.key)) return;
		event.preventDefault();
		event.stopPropagation();
		const at = enabled.indexOf(commandFocus), next = event.key === "Home" ? enabled[0] : event.key === "End" ? enabled.at(-1) : enabled[(at + (event.key === "ArrowDown" ? 1 : -1) + enabled.length) % enabled.length];
		setCommandFocus(next);
		commandsList.current?.querySelector(`[data-command-index="${next}"]`)?.focus();
	};
	const dialogKeys = (event, value) => {
		if (!ownedSession(value)) return;
		if (event.key === "Escape") {
			event.preventDefault();
			event.stopPropagation();
			close(value);
			return;
		}
		if (event.key === "Tab") {
			const controls = [...event.currentTarget.querySelectorAll("button:not(:disabled):not([tabindex=\"-1\"])")], first = controls[0], last = controls.at(-1);
			if (event.shiftKey && document.activeElement === first) {
				event.preventDefault();
				last?.focus();
			} else if (!event.shiftKey && document.activeElement === last) {
				event.preventDefault();
				first?.focus();
			}
		}
	};
	useLayoutEffect(() => {
		if (!focusRequested.current || !visible) return;
		focusRequested.current = false;
		objectsList.current?.querySelector(`[data-command-object-index="${objectFocus}"]`)?.focus();
	}, [objectFocus, visible?.id]);
	const windowStart = Math.floor(objectFocus / 100) * 100, windowObjects = props.context.objects.slice(windowStart, windowStart + 100);
	const valid = !!visible && paperNotebookCommandTargetCurrent(visible.target, props.getCurrent()), firstEnabled = PAPER_NOTEBOOK_COMMANDS.findIndex((item) => paperNotebookCommandAvailability(item.id, props.context, props.media).enabled), rovingCommand = paperNotebookCommandAvailability(PAPER_NOTEBOOK_COMMANDS[commandFocus]?.id ?? "copy", props.context, props.media).enabled ? commandFocus : firstEnabled;
	return /* @__PURE__ */ jsxDEV("div", {
		className: `paper-command-menu ${props.className ?? ""}`,
		children: [/* @__PURE__ */ jsxDEV("button", {
			ref: trigger,
			type: "button",
			className: "paper-command-trigger",
			"aria-label": "Commandes de la note",
			"aria-haspopup": "dialog",
			"aria-expanded": !!visible,
			disabled: props.context.tombstone,
			onClick: () => visible ? close(visible) : open(),
			children: [/* @__PURE__ */ jsxDEV("span", {
				"aria-hidden": "true",
				children: "⋯"
			}, void 0, false, {
				fileName: _jsxFileName$18,
				lineNumber: 55,
				columnNumber: 302
			}, this), /* @__PURE__ */ jsxDEV("span", { children: "Commandes" }, void 0, false, {
				fileName: _jsxFileName$18,
				lineNumber: 55,
				columnNumber: 335
			}, this)]
		}, void 0, true, {
			fileName: _jsxFileName$18,
			lineNumber: 55,
			columnNumber: 70
		}, this), visible && /* @__PURE__ */ jsxDEV(Fragment, { children: [/* @__PURE__ */ jsxDEV("div", {
			className: "paper-command-backdrop",
			onClick: () => close(visible)
		}, void 0, false, {
			fileName: _jsxFileName$18,
			lineNumber: 56,
			columnNumber: 2
		}, this), /* @__PURE__ */ jsxDEV("div", {
			ref: panel,
			className: "paper-command-dialog",
			role: "dialog",
			"aria-modal": "true",
			"aria-label": "Commandes de la note",
			style: {
				left: position.left,
				top: position.top
			},
			onKeyDown: (event) => dialogKeys(event, visible),
			children: [
				/* @__PURE__ */ jsxDEV("header", { children: [/* @__PURE__ */ jsxDEV("strong", { children: "Objets et commandes" }, void 0, false, {
					fileName: _jsxFileName$18,
					lineNumber: 57,
					columnNumber: 10
				}, this), /* @__PURE__ */ jsxDEV("button", {
					type: "button",
					"aria-label": "Fermer les commandes",
					onClick: () => close(visible),
					children: "Fermer"
				}, void 0, false, {
					fileName: _jsxFileName$18,
					lineNumber: 57,
					columnNumber: 46
				}, this)] }, void 0, true, {
					fileName: _jsxFileName$18,
					lineNumber: 57,
					columnNumber: 2
				}, this),
				/* @__PURE__ */ jsxDEV("p", {
					className: "paper-command-help",
					children: "Flèches : parcourir · Espace : sélectionner · Maj + flèches : étendre la sélection"
				}, void 0, false, {
					fileName: _jsxFileName$18,
					lineNumber: 57,
					columnNumber: 155
				}, this),
				/* @__PURE__ */ jsxDEV("div", {
					ref: objectsList,
					className: "paper-command-objects",
					role: "listbox",
					"aria-label": "Objets de la page",
					"aria-multiselectable": "true",
					onKeyDown: (event) => objectKeys(event, visible),
					children: props.context.objects.length ? windowObjects.map((object, localIndex) => {
						const index = windowStart + localIndex;
						return /* @__PURE__ */ jsxDEV("button", {
							type: "button",
							role: "option",
							"data-command-object-index": index,
							tabIndex: objectFocus === index ? 0 : -1,
							"aria-selected": props.context.selected.includes(object.id),
							onFocus: () => setObjectFocus(index),
							onClick: (event) => choose(index, visible, event.ctrlKey || event.metaKey || event.shiftKey, event.shiftKey),
							children: [/* @__PURE__ */ jsxDEV("span", {
								"aria-hidden": "true",
								children: props.context.selected.includes(object.id) ? "✓" : "○"
							}, void 0, false, {
								fileName: _jsxFileName$18,
								lineNumber: 58,
								columnNumber: 606
							}, this), paperNotebookObjectLabel(object, index)]
						}, object.id, true, {
							fileName: _jsxFileName$18,
							lineNumber: 58,
							columnNumber: 290
						}, this);
					}) : /* @__PURE__ */ jsxDEV("p", { children: "Aucun objet sur cette page." }, void 0, false, {
						fileName: _jsxFileName$18,
						lineNumber: 58,
						columnNumber: 743
					}, this)
				}, void 0, false, {
					fileName: _jsxFileName$18,
					lineNumber: 58,
					columnNumber: 2
				}, this),
				props.context.objects.length > 100 && /* @__PURE__ */ jsxDEV("div", {
					className: "paper-command-object-pages",
					children: [
						/* @__PURE__ */ jsxDEV("button", {
							type: "button",
							"aria-label": "Objets précédents",
							disabled: windowStart === 0,
							onClick: () => focusObject(Math.max(0, windowStart - 100)),
							children: "Précédents"
						}, void 0, false, {
							fileName: _jsxFileName$18,
							lineNumber: 59,
							columnNumber: 81
						}, this),
						/* @__PURE__ */ jsxDEV("span", { children: [
							windowStart + 1,
							"–",
							Math.min(windowStart + 100, props.context.objects.length),
							" / ",
							props.context.objects.length
						] }, void 0, true, {
							fileName: _jsxFileName$18,
							lineNumber: 59,
							columnNumber: 235
						}, this),
						/* @__PURE__ */ jsxDEV("button", {
							type: "button",
							"aria-label": "Objets suivants",
							disabled: windowStart + 100 >= props.context.objects.length,
							onClick: () => focusObject(windowStart + 100),
							children: "Suivants"
						}, void 0, false, {
							fileName: _jsxFileName$18,
							lineNumber: 59,
							columnNumber: 353
						}, this)
					]
				}, void 0, true, {
					fileName: _jsxFileName$18,
					lineNumber: 59,
					columnNumber: 37
				}, this),
				/* @__PURE__ */ jsxDEV("p", {
					className: "paper-command-selection",
					children: [
						props.context.selected.length,
						" objet",
						props.context.selected.length > 1 ? "s" : "",
						" sélectionné",
						props.context.selected.length > 1 ? "s" : ""
					]
				}, void 0, true, {
					fileName: _jsxFileName$18,
					lineNumber: 60,
					columnNumber: 2
				}, this),
				!valid && /* @__PURE__ */ jsxDEV("p", {
					role: "status",
					children: "La note ou la sélection a changé. Fermez puis rouvrez les commandes."
				}, void 0, false, {
					fileName: _jsxFileName$18,
					lineNumber: 61,
					columnNumber: 11
				}, this),
				/* @__PURE__ */ jsxDEV("div", {
					ref: commandsList,
					className: "paper-command-actions",
					role: "menu",
					"aria-label": "Actions sur la sélection",
					onKeyDown: (event) => menuKeys(event, visible),
					children: PAPER_NOTEBOOK_COMMANDS.map((item, index) => {
						const availability = paperNotebookCommandAvailability(item.id, props.context, props.media);
						return /* @__PURE__ */ jsxDEV("button", {
							type: "button",
							role: "menuitem",
							"data-command-index": index,
							tabIndex: rovingCommand === index ? 0 : -1,
							disabled: !valid || busy || !availability.enabled,
							title: availability.reason,
							onFocus: () => setCommandFocus(index),
							onClick: () => void run(item.id, visible),
							children: [/* @__PURE__ */ jsxDEV("span", { children: item.label }, void 0, false, {
								fileName: _jsxFileName$18,
								lineNumber: 62,
								columnNumber: 560
							}, this), item.shortcut && /* @__PURE__ */ jsxDEV("small", { children: item.shortcut }, void 0, false, {
								fileName: _jsxFileName$18,
								lineNumber: 62,
								columnNumber: 601
							}, this)]
						}, item.id, true, {
							fileName: _jsxFileName$18,
							lineNumber: 62,
							columnNumber: 291
						}, this);
					})
				}, void 0, false, {
					fileName: _jsxFileName$18,
					lineNumber: 62,
					columnNumber: 2
				}, this),
				busy && /* @__PURE__ */ jsxDEV("p", {
					role: "status",
					children: "Préparation de la commande…"
				}, void 0, false, {
					fileName: _jsxFileName$18,
					lineNumber: 63,
					columnNumber: 9
				}, this)
			]
		}, void 0, true, {
			fileName: _jsxFileName$18,
			lineNumber: 56,
			columnNumber: 72
		}, this)] }, void 0, true, {
			fileName: _jsxFileName$18,
			lineNumber: 55,
			columnNumber: 376
		}, this)]
	}, void 0, true, {
		fileName: _jsxFileName$18,
		lineNumber: 55,
		columnNumber: 9
	}, this);
});
//#endregion
//#region src/components/PaperTextHighlightPanel.tsx
var _jsxFileName$17 = "/home/louis/DowzeBuild/20260923/collections-060/src/components/PaperTextHighlightPanel.tsx";
function PaperTextHighlightPanel({ choices, selection, color, disabled, onColor, onChoose, onRange, onApply, onClear, onClose }) {
	const [picker, setPicker] = useState(false), [choice, setChoice] = useState(""), [text, setText] = useState(""), [notice, setNotice] = useState("");
	const input = useRef(null), latest = useRef({
		disabled,
		onChoose,
		onRange
	});
	latest.current = {
		disabled,
		onChoose,
		onRange
	};
	useEffect(() => {
		if (choice && !choices.some((row) => row.id === choice)) {
			setChoice("");
			setText("");
		}
	}, [choices, choice]);
	const choose = (id) => {
		if (disabled) return;
		const value = onChoose(id);
		if (!value) {
			setNotice("Cette zone n’est pas prête. Reprenez le passage dans la page.");
			return;
		}
		setChoice(id);
		setText(value.text);
		setNotice("");
	};
	return /* @__PURE__ */ jsxDEV("section", {
		className: "paper-smart-highlight-panel",
		"aria-label": "Surlignage guidé du texte",
		children: [
			/* @__PURE__ */ jsxDEV("div", {
				className: "paper-highlight-bar",
				children: [
					/* @__PURE__ */ jsxDEV("strong", { children: "Surligner le texte" }, void 0, false, {
						fileName: _jsxFileName$17,
						lineNumber: 10,
						columnNumber: 134
					}, this),
					/* @__PURE__ */ jsxDEV("label", { children: ["Couleur", /* @__PURE__ */ jsxDEV("input", {
						"aria-label": "Couleur du surlignage guidé",
						type: "color",
						value: color,
						disabled,
						onChange: (event) => onColor(event.target.value)
					}, void 0, false, {
						fileName: _jsxFileName$17,
						lineNumber: 10,
						columnNumber: 183
					}, this)] }, void 0, true, {
						fileName: _jsxFileName$17,
						lineNumber: 10,
						columnNumber: 169
					}, this),
					/* @__PURE__ */ jsxDEV("button", {
						type: "button",
						disabled: disabled || !choices.length,
						"aria-expanded": picker,
						onClick: () => {
							setPicker((value) => !value);
							if (!choice && choices[0]) choose(choices[0].id);
						},
						children: "Choisir un passage au clavier"
					}, void 0, false, {
						fileName: _jsxFileName$17,
						lineNumber: 10,
						columnNumber: 333
					}, this),
					/* @__PURE__ */ jsxDEV("button", {
						type: "button",
						disabled: disabled || !selection,
						onClick: onApply,
						children: "Surligner la sélection"
					}, void 0, false, {
						fileName: _jsxFileName$17,
						lineNumber: 10,
						columnNumber: 540
					}, this),
					/* @__PURE__ */ jsxDEV("button", {
						type: "button",
						disabled: !selection,
						onClick: onClear,
						children: "Effacer la sélection"
					}, void 0, false, {
						fileName: _jsxFileName$17,
						lineNumber: 10,
						columnNumber: 643
					}, this),
					/* @__PURE__ */ jsxDEV("button", {
						type: "button",
						"aria-label": "Fermer le surlignage guidé",
						onClick: onClose,
						children: "×"
					}, void 0, false, {
						fileName: _jsxFileName$17,
						lineNumber: 10,
						columnNumber: 734
					}, this)
				]
			}, void 0, true, {
				fileName: _jsxFileName$17,
				lineNumber: 10,
				columnNumber: 97
			}, this),
			/* @__PURE__ */ jsxDEV("p", { children: "Glissez sur le texte de la page, puis surlignez le passage. Les bandes suivent chaque ligne de cette page. Le PDF et le texte d’origine sont conservés." }, void 0, false, {
				fileName: _jsxFileName$17,
				lineNumber: 11,
				columnNumber: 2
			}, this),
			picker && /* @__PURE__ */ jsxDEV("div", {
				className: "paper-highlight-picker",
				children: [
					/* @__PURE__ */ jsxDEV("label", { children: ["Zone de texte", /* @__PURE__ */ jsxDEV("select", {
						"aria-label": "Zone de texte à surligner",
						disabled,
						value: choice,
						onChange: (event) => choose(event.target.value),
						children: [/* @__PURE__ */ jsxDEV("option", {
							value: "",
							children: "Choisir une zone"
						}, void 0, false, {
							fileName: _jsxFileName$17,
							lineNumber: 12,
							columnNumber: 198
						}, this), choices.map((row) => /* @__PURE__ */ jsxDEV("option", {
							value: row.id,
							children: row.label
						}, row.id, false, {
							fileName: _jsxFileName$17,
							lineNumber: 12,
							columnNumber: 258
						}, this))]
					}, void 0, true, {
						fileName: _jsxFileName$17,
						lineNumber: 12,
						columnNumber: 71
					}, this)] }, void 0, true, {
						fileName: _jsxFileName$17,
						lineNumber: 12,
						columnNumber: 51
					}, this),
					/* @__PURE__ */ jsxDEV("label", { children: ["Passage", /* @__PURE__ */ jsxDEV("textarea", {
						ref: input,
						"aria-label": "Passage à surligner au clavier",
						readOnly: true,
						value: text,
						disabled,
						onSelect: (event) => {
							if (latest.current.disabled || !choice) return;
							latest.current.onRange(choice, event.currentTarget.selectionStart, event.currentTarget.selectionEnd);
						}
					}, void 0, false, {
						fileName: _jsxFileName$17,
						lineNumber: 12,
						columnNumber: 347
					}, this)] }, void 0, true, {
						fileName: _jsxFileName$17,
						lineNumber: 12,
						columnNumber: 333
					}, this),
					/* @__PURE__ */ jsxDEV("small", { children: "Placez le curseur, puis maintenez Maj avec les flèches pour sélectionner. Seule la partie visible sur cette page sera surlignée." }, void 0, false, {
						fileName: _jsxFileName$17,
						lineNumber: 12,
						columnNumber: 627
					}, this)
				]
			}, void 0, true, {
				fileName: _jsxFileName$17,
				lineNumber: 12,
				columnNumber: 11
			}, this),
			selection && /* @__PURE__ */ jsxDEV("p", {
				role: "status",
				children: [
					selection.fragments.length,
					" bande",
					selection.fragments.length > 1 ? "s" : "",
					" prête",
					selection.fragments.length > 1 ? "s" : "",
					" · ",
					selection.text.slice(0, 160),
					selection.text.length > 160 ? "…" : ""
				]
			}, void 0, true, {
				fileName: _jsxFileName$17,
				lineNumber: 13,
				columnNumber: 14
			}, this),
			notice && /* @__PURE__ */ jsxDEV("p", {
				role: "status",
				children: notice
			}, void 0, false, {
				fileName: _jsxFileName$17,
				lineNumber: 13,
				columnNumber: 225
			}, this)
		]
	}, void 0, true, {
		fileName: _jsxFileName$17,
		lineNumber: 10,
		columnNumber: 9
	}, this);
}
function paperHighlightChoice(object) {
	return {
		id: object.id,
		label: (object.kind === "sticky" ? "Post-it · " : "Texte · ") + (object.markdown ?? "").replace(/\s+/g, " ").slice(0, 80)
	};
}
//#endregion
//#region src/lib/notebookSession.ts
var writers = /* @__PURE__ */ new Map();
var transitions = /* @__PURE__ */ new Map();
function registerNotebookWriter(accountId, writer) {
	let set = writers.get(accountId);
	if (!set) {
		set = /* @__PURE__ */ new Set();
		writers.set(accountId, set);
	}
	set.add(writer);
	const closing = transitions.get(accountId);
	if (closing) {
		closing.participants.add(writer);
		writer.suspend();
	} else writer.resume();
	return () => {
		set.delete(writer);
		if (!set.size) writers.delete(accountId);
	};
}
function resumeNotebookAccount(accountId) {
	const t = transitions.get(accountId);
	for (const w of t?.participants ?? writers.get(accountId) ?? []) w.resume();
	transitions.delete(accountId);
}
/** Creation/import can finish safely before a profile closes, without changing another profile. */
async function runNotebookOperation(accountId, operation) {
	let enabled = true, finish;
	const settled = new Promise((resolve) => finish = resolve);
	const unregister = registerNotebookWriter(accountId, {
		flush: () => {},
		settled: () => settled,
		pending: () => true,
		suspend: () => {
			enabled = false;
		},
		resume: () => {
			enabled = true;
		}
	});
	try {
		if (!enabled) throw Error("La session se ferme. Reprenez cette opération après connexion.");
		return await operation();
	} finally {
		finish();
		unregister();
	}
}
function resumeAllNotebookAccounts() {
	for (const id of /* @__PURE__ */ new Set([...writers.keys(), ...transitions.keys()])) resumeNotebookAccount(id);
}
function hasPendingNotebookWrites() {
	for (const set of writers.values()) for (const writer of set) try {
		if (writer.pending?.()) return true;
	} catch {
		return true;
	}
	return false;
}
//#endregion
//#region src/lib/paperPageRotation.ts
/** Rotate the page coordinate system and every annotation, including locked objects. */
function rotatePaperPage(document, pageId, direction) {
	if (!document.pages.find((p) => p.id === pageId)) throw Error("La page n’existe plus.");
	if (direction !== 1 && direction !== -1) throw Error("Rotation invalide.");
	const flow = document.objects.find((o) => o.textFlow?.pageIds.includes(pageId));
	const targets = new Set(flow?.textFlow?.pageIds ?? [pageId]);
	const commands = [];
	for (const page of document.pages.filter((p) => targets.has(p.id))) {
		commands.push({
			type: "update-page",
			page: {
				...page,
				width: page.height,
				height: page.width,
				rotation: (page.rotation + direction * 90 + 360) % 360
			}
		});
		for (const o of document.objects.filter((o) => o.pageId === page.id)) {
			const cx = o.x + o.width / 2, cy = o.y + o.height / 2, x = direction === 1 ? page.height - cy : cy, y = direction === 1 ? cx : page.width - cx;
			commands.push({
				type: "patch-object",
				id: o.id,
				patch: {
					x: x - o.width / 2,
					y: y - o.height / 2,
					rotation: (o.rotation + direction * 90 + 360) % 360
				}
			});
		}
	}
	return {
		type: "batch",
		commands
	};
}
//#endregion
//#region src/lib/paperPdfNavigation.ts
function safePdfUrl(value) {
	if (typeof value !== "string" || value.length > 8192) return;
	try {
		const url = new URL(value);
		if ([
			"http:",
			"https:",
			"mailto:"
		].includes(url.protocol)) return url.href;
	} catch {}
}
/** PDF destinations are page references or zero-based indexes, never executable actions. */
async function pdfDestinationPage(pdf, dest) {
	const value = typeof dest === "string" ? await pdf.getDestination(dest) : dest;
	if (!Array.isArray(value) || !value.length) return;
	const reference = value[0];
	let index;
	if (Number.isInteger(reference)) index = reference;
	else if (reference && typeof reference === "object" && Number.isSafeInteger(reference.num) && Number.isSafeInteger(reference.gen)) index = await pdf.getPageIndex(reference);
	else return;
	return Number.isInteger(index) && index >= 0 && index < pdf.numPages ? index + 1 : void 0;
}
function pdfLinkRectangle(viewport, rect) {
	if (!Array.isArray(rect) || rect.length !== 4 || !rect.every(Number.isFinite)) return;
	const a = viewport.convertToViewportPoint(rect[0], rect[1]), b = viewport.convertToViewportPoint(rect[2], rect[3]), box = [...a, ...b], x = Math.max(0, Math.min(box[0], box[2])), y = Math.max(0, Math.min(box[1], box[3])), right = Math.min(viewport.width, Math.max(box[0], box[2])), bottom = Math.min(viewport.height, Math.max(box[1], box[3]));
	if (right <= x || bottom <= y) return;
	return {
		left: x / viewport.width * 100,
		top: y / viewport.height * 100,
		width: (right - x) / viewport.width * 100,
		height: (bottom - y) / viewport.height * 100
	};
}
//#endregion
//#region src/components/PaperPdfOutline.tsx
var _jsxFileName$16 = "/home/louis/DowzeBuild/20260923/collections-060/src/components/PaperPdfOutline.tsx";
function PaperPdfOutline({ asset, media, onPage, onClose }) {
	const [items, setItems] = useState([]), [status, setStatus] = useState("Ouverture du sommaire…");
	useEffect(() => {
		let stopped = false;
		setStatus("Ouverture du sommaire…");
		setItems([]);
		(async () => {
			const pdf = await openPaperPdf(await readPaperAsset(asset, media));
			try {
				const root = await pdf.getOutline(), result = [];
				const visit = async (list, depth = 0) => {
					for (const item of list ?? []) {
						if (stopped || result.length >= 2e3 || depth > 20) return;
						let page;
						try {
							page = await pdfDestinationPage(pdf, item.dest);
						} catch {}
						result.push({
							title: String(item.title ?? "Section").slice(0, 500),
							depth,
							page,
							url: safePdfUrl(item.url)
						});
						await visit(item.items, depth + 1);
					}
				};
				await visit(root);
				if (!stopped) {
					setItems(result);
					setStatus(result.length ? "" : "Ce PDF ne contient pas de sommaire.");
				}
			} finally {
				await pdf.destroy();
			}
		})().catch((e) => {
			if (!stopped) setStatus(String(e instanceof Error ? e.message : e));
		});
		return () => {
			stopped = true;
		};
	}, [
		asset.id,
		asset.serverId,
		media.accountId,
		media.spaceId,
		media.api
	]);
	return /* @__PURE__ */ jsxDEV("aside", {
		className: "paper-pdf-outline",
		"aria-label": "Sommaire du PDF",
		children: [
			/* @__PURE__ */ jsxDEV("header", { children: [
				/* @__PURE__ */ jsxDEV(ListTree, {}, void 0, false, {
					fileName: _jsxFileName$16,
					lineNumber: 12,
					columnNumber: 83
				}, this),
				/* @__PURE__ */ jsxDEV("strong", { children: "Sommaire" }, void 0, false, {
					fileName: _jsxFileName$16,
					lineNumber: 12,
					columnNumber: 94
				}, this),
				/* @__PURE__ */ jsxDEV("button", {
					"aria-label": "Fermer le sommaire PDF",
					onClick: onClose,
					children: /* @__PURE__ */ jsxDEV(X, {}, void 0, false, {
						fileName: _jsxFileName$16,
						lineNumber: 12,
						columnNumber: 181
					}, this)
				}, void 0, false, {
					fileName: _jsxFileName$16,
					lineNumber: 12,
					columnNumber: 119
				}, this)
			] }, void 0, true, {
				fileName: _jsxFileName$16,
				lineNumber: 12,
				columnNumber: 75
			}, this),
			/* @__PURE__ */ jsxDEV("small", { children: asset.name }, void 0, false, {
				fileName: _jsxFileName$16,
				lineNumber: 12,
				columnNumber: 203
			}, this),
			status && /* @__PURE__ */ jsxDEV("p", {
				role: "status",
				children: status
			}, void 0, false, {
				fileName: _jsxFileName$16,
				lineNumber: 12,
				columnNumber: 239
			}, this),
			/* @__PURE__ */ jsxDEV("nav", {
				"aria-label": "Sections du PDF",
				children: items.map((item, i) => /* @__PURE__ */ jsxDEV("div", {
					style: { paddingLeft: Math.min(item.depth, 8) * 12 },
					children: item.page ? /* @__PURE__ */ jsxDEV("button", {
						onClick: () => onPage(item.page),
						children: [item.title, /* @__PURE__ */ jsxDEV("small", { children: ["p. ", item.page] }, void 0, true, {
							fileName: _jsxFileName$16,
							lineNumber: 12,
							columnNumber: 449
						}, this)]
					}, void 0, true, {
						fileName: _jsxFileName$16,
						lineNumber: 12,
						columnNumber: 396
					}, this) : item.url ? /* @__PURE__ */ jsxDEV("a", {
						href: item.url,
						target: "_blank",
						rel: "noopener noreferrer",
						children: item.title
					}, void 0, false, {
						fileName: _jsxFileName$16,
						lineNumber: 12,
						columnNumber: 497
					}, this) : /* @__PURE__ */ jsxDEV("span", { children: item.title }, void 0, false, {
						fileName: _jsxFileName$16,
						lineNumber: 12,
						columnNumber: 575
					}, this)
				}, i, false, {
					fileName: _jsxFileName$16,
					lineNumber: 12,
					columnNumber: 324
				}, this))
			}, void 0, false, {
				fileName: _jsxFileName$16,
				lineNumber: 12,
				columnNumber: 269
			}, this)
		]
	}, void 0, true, {
		fileName: _jsxFileName$16,
		lineNumber: 12,
		columnNumber: 9
	}, this);
}
//#endregion
//#region src/components/PaperBackground.tsx
var _jsxFileName$15 = "/home/louis/DowzeBuild/20260923/collections-060/src/components/PaperBackground.tsx";
/** The same vector paper background is used by the editor, thumbnails and exports. */
function PaperBackground({ page: visualPage }) {
	const rotation = (visualPage.rotation % 360 + 360) % 360;
	const page = rotation === 90 || rotation === 270 ? {
		...visualPage,
		width: visualPage.height,
		height: visualPage.width
	} : visualPage;
	const turn = rotation === 90 ? `translate(${visualPage.width} 0) rotate(90)` : rotation === 180 ? `translate(${visualPage.width} ${visualPage.height}) rotate(180)` : rotation === 270 ? `translate(0 ${visualPage.height}) rotate(270)` : void 0;
	const id = "paper-pattern-" + useId().replace(/[^\w-]/g, ""), spacing = page.spacing ?? (page.pattern === "ruled" ? 28 : page.pattern === "grid" ? 24 : 20), line = "#91a3be", margin = 48;
	const template = page.template ?? "standard";
	return /* @__PURE__ */ jsxDEV("svg", {
		className: "paper-background",
		viewBox: `0 0 ${visualPage.width} ${visualPage.height}`,
		preserveAspectRatio: "none",
		"aria-hidden": "true",
		children: /* @__PURE__ */ jsxDEV("g", {
			transform: turn,
			children: [
				/* @__PURE__ */ jsxDEV("defs", { children: /* @__PURE__ */ jsxDEV("pattern", {
					id,
					width: spacing,
					height: spacing,
					patternUnits: "userSpaceOnUse",
					children: page.pattern === "dots" ? /* @__PURE__ */ jsxDEV("circle", {
						cx: spacing / 2,
						cy: spacing / 2,
						r: ".9",
						fill: line,
						opacity: ".6"
					}, void 0, false, {
						fileName: _jsxFileName$15,
						lineNumber: 11,
						columnNumber: 111
					}, this) : page.pattern === "grid" ? /* @__PURE__ */ jsxDEV("path", {
						d: `M ${spacing} 0 H 0 V ${spacing}`,
						fill: "none",
						stroke: line,
						strokeWidth: ".65",
						opacity: ".4"
					}, void 0, false, {
						fileName: _jsxFileName$15,
						lineNumber: 11,
						columnNumber: 205
					}, this) : page.pattern === "ruled" ? /* @__PURE__ */ jsxDEV("path", {
						d: `M 0 ${spacing - .5} H ${spacing}`,
						stroke: line,
						strokeWidth: ".7",
						opacity: ".4"
					}, void 0, false, {
						fileName: _jsxFileName$15,
						lineNumber: 11,
						columnNumber: 331
					}, this) : null
				}, void 0, false, {
					fileName: _jsxFileName$15,
					lineNumber: 11,
					columnNumber: 8
				}, this) }, void 0, false, {
					fileName: _jsxFileName$15,
					lineNumber: 11,
					columnNumber: 2
				}, this),
				template === "standard" && page.pattern !== "plain" && /* @__PURE__ */ jsxDEV("rect", {
					width: page.width,
					height: page.height,
					fill: `url(#${id})`
				}, void 0, false, {
					fileName: _jsxFileName$15,
					lineNumber: 12,
					columnNumber: 50
				}, this),
				template === "cornell" && /* @__PURE__ */ jsxDEV(Fragment, { children: [
					/* @__PURE__ */ jsxDEV("rect", {
						x: margin,
						y: 88,
						width: Math.max(0, page.width - 96),
						height: Math.max(0, page.height - 96 - 160),
						fill: `url(#${id})`
					}, void 0, false, {
						fileName: _jsxFileName$15,
						lineNumber: 13,
						columnNumber: 27
					}, this),
					/* @__PURE__ */ jsxDEV("path", {
						d: `M ${margin} 88 H ${page.width - margin} M ${page.width * .27} 88 V ${page.height - margin - 120} M ${margin} ${page.height - margin - 120} H ${page.width - margin}`,
						fill: "none",
						stroke: line,
						strokeWidth: "1"
					}, void 0, false, {
						fileName: _jsxFileName$15,
						lineNumber: 13,
						columnNumber: 166
					}, this),
					/* @__PURE__ */ jsxDEV("g", {
						fill: line,
						fontSize: "12",
						children: [
							/* @__PURE__ */ jsxDEV("text", {
								x: margin,
								y: 66,
								children: "Sujet · Date"
							}, void 0, false, {
								fileName: _jsxFileName$15,
								lineNumber: 13,
								columnNumber: 420
							}, this),
							/* @__PURE__ */ jsxDEV("text", {
								x: 56,
								y: 113,
								children: "Repères"
							}, void 0, false, {
								fileName: _jsxFileName$15,
								lineNumber: 13,
								columnNumber: 470
							}, this),
							/* @__PURE__ */ jsxDEV("text", {
								x: page.width * .27 + 12,
								y: 113,
								children: "Notes"
							}, void 0, false, {
								fileName: _jsxFileName$15,
								lineNumber: 13,
								columnNumber: 517
							}, this),
							/* @__PURE__ */ jsxDEV("text", {
								x: 56,
								y: page.height - margin - 100,
								children: "Synthèse"
							}, void 0, false, {
								fileName: _jsxFileName$15,
								lineNumber: 13,
								columnNumber: 571
							}, this)
						]
					}, void 0, true, {
						fileName: _jsxFileName$15,
						lineNumber: 13,
						columnNumber: 391
					}, this)
				] }, void 0, true, {
					fileName: _jsxFileName$15,
					lineNumber: 13,
					columnNumber: 25
				}, this),
				template === "music" && Array.from({ length: Math.max(0, Math.min(40, Math.floor((page.height - 96) / (spacing * 8)))) }, (_, staff) => /* @__PURE__ */ jsxDEV("g", { children: Array.from({ length: 5 }, (_, i) => /* @__PURE__ */ jsxDEV("path", {
					d: `M ${margin} ${margin + staff * spacing * 8 + i * spacing / 2} H ${page.width - margin}`,
					stroke: line,
					strokeWidth: ".9"
				}, i, false, {
					fileName: _jsxFileName$15,
					lineNumber: 14,
					columnNumber: 171
				}, this)) }, staff, false, {
					fileName: _jsxFileName$15,
					lineNumber: 14,
					columnNumber: 126
				}, this)),
				template === "weekly" && /* @__PURE__ */ jsxDEV(Fragment, { children: [/* @__PURE__ */ jsxDEV("g", {
					fill: line,
					fontSize: "16",
					children: /* @__PURE__ */ jsxDEV("text", {
						x: margin,
						y: margin,
						children: "Ma semaine"
					}, void 0, false, {
						fileName: _jsxFileName$15,
						lineNumber: 15,
						columnNumber: 55
					}, this)
				}, void 0, false, {
					fileName: _jsxFileName$15,
					lineNumber: 15,
					columnNumber: 26
				}, this), [
					"Lundi",
					"Mardi",
					"Mercredi",
					"Jeudi",
					"Vendredi",
					"Samedi",
					"Dimanche"
				].map((day, i) => {
					const top = 78 + i * (page.height - 96 - 30) / 7;
					return /* @__PURE__ */ jsxDEV("g", { children: [/* @__PURE__ */ jsxDEV("rect", {
						x: margin,
						y: top,
						width: page.width - 96,
						height: (page.height - 96 - 30) / 7,
						fill: "none",
						stroke: line,
						strokeWidth: ".7"
					}, void 0, false, {
						fileName: _jsxFileName$15,
						lineNumber: 15,
						columnNumber: 195
					}, this), /* @__PURE__ */ jsxDEV("text", {
						x: 60,
						y: top + 20,
						fontSize: "12",
						fill: line,
						children: day
					}, void 0, false, {
						fileName: _jsxFileName$15,
						lineNumber: 15,
						columnNumber: 329
					}, this)] }, day, true, {
						fileName: _jsxFileName$15,
						lineNumber: 15,
						columnNumber: 182
					}, this);
				})] }, void 0, true, {
					fileName: _jsxFileName$15,
					lineNumber: 15,
					columnNumber: 24
				}, this)
			]
		}, void 0, true, {
			fileName: _jsxFileName$15,
			lineNumber: 10,
			columnNumber: 146
		}, this)
	}, void 0, false, {
		fileName: _jsxFileName$15,
		lineNumber: 10,
		columnNumber: 9
	}, this);
}
//#endregion
//#region src/components/PaperPagePreview.tsx
var _jsxFileName$14 = "/home/louis/DowzeBuild/20260923/collections-060/src/components/PaperPagePreview.tsx";
var PaperPdfPage$3 = lazy(() => Promise.resolve().then(() => PaperPdfPage_exports).then((module) => ({ default: module.PaperPdfPage })));
/** Same page geometry and content as the reader; only near-visible previews allocate renderers. */
function PaperPagePreview({ document, page, media }) {
	const root = useRef(null), [visible, setVisible] = useState(false);
	useEffect(() => {
		const target = root.current;
		if (!target) return;
		if (typeof IntersectionObserver === "undefined") {
			setVisible(true);
			return;
		}
		const observer = new IntersectionObserver((entries) => setVisible(entries.some((entry) => entry.isIntersecting)), { rootMargin: "180px" });
		observer.observe(target);
		return () => observer.disconnect();
	}, [page.id]);
	const objects = useMemo(() => visible ? paperObjectsOnPage(document, page.id) : [], [
		visible,
		document,
		page.id
	]);
	const scale = Math.min(80 / page.width, 116 / page.height), width = page.width * scale, height = page.height * scale, pdf = page.pdf ? document.assets.find((a) => a.id === page.pdf.assetId) : void 0;
	return /* @__PURE__ */ jsxDEV("div", {
		ref: root,
		className: "paper-thumbnail-stage",
		style: {
			width,
			height
		},
		"aria-hidden": "true",
		inert: true,
		"data-preview-page": page.id,
		"data-preview-rendered": visible ? "true" : "false",
		children: /* @__PURE__ */ jsxDEV("div", {
			className: "paper-page paper-thumbnail-content",
			style: {
				width: page.width,
				height: page.height,
				backgroundColor: page.color,
				transform: `scale(${scale})`
			},
			children: visible && /* @__PURE__ */ jsxDEV(Fragment, { children: [
				/* @__PURE__ */ jsxDEV(PaperBackground, { page }, void 0, false, {
					fileName: _jsxFileName$14,
					lineNumber: 18,
					columnNumber: 16
				}, this),
				pdf && /* @__PURE__ */ jsxDEV(Suspense, {
					fallback: null,
					children: /* @__PURE__ */ jsxDEV(PaperPdfPage$3, {
						page,
						asset: pdf,
						media,
						pixelWidth: 160
					}, void 0, false, {
						fileName: _jsxFileName$14,
						lineNumber: 18,
						columnNumber: 78
					}, this)
				}, void 0, false, {
					fileName: _jsxFileName$14,
					lineNumber: 18,
					columnNumber: 52
				}, this),
				objects.map((object) => /* @__PURE__ */ jsxDEV("div", {
					className: `paper-object paper-${object.kind}`,
					"data-preview-object": object.id,
					style: {
						left: object.x,
						top: object.y,
						width: object.width,
						height: object.height,
						transform: paperObjectCssTransform(object),
						transformOrigin: `${object.width / 2}px ${object.height / 2}px`,
						zIndex: object.z,
						background: object.kind === "sticky" ? object.color : void 0,
						overflow: object.kind === "text" ? "hidden" : void 0
					},
					children: object.kind === "text" ? /* @__PURE__ */ jsxDEV(PaperTextFlowView, {
						object,
						document,
						media,
						pageId: page.id
					}, void 0, false, {
						fileName: _jsxFileName$14,
						lineNumber: 20,
						columnNumber: 27
					}, this) : /* @__PURE__ */ jsxDEV(PaperObjectVisual, {
						object,
						document,
						media
					}, void 0, false, {
						fileName: _jsxFileName$14,
						lineNumber: 20,
						columnNumber: 115
					}, this)
				}, object.id, false, {
					fileName: _jsxFileName$14,
					lineNumber: 19,
					columnNumber: 25
				}, this))
			] }, void 0, true, {
				fileName: _jsxFileName$14,
				lineNumber: 18,
				columnNumber: 14
			}, this)
		}, void 0, false, {
			fileName: _jsxFileName$14,
			lineNumber: 17,
			columnNumber: 3
		}, this)
	}, void 0, false, {
		fileName: _jsxFileName$14,
		lineNumber: 16,
		columnNumber: 9
	}, this);
}
//#endregion
//#region src/lib/paperTemplates.ts
var PAPER_FORMATS = {
	A4: [210, 297],
	A5: [148, 210],
	A3: [297, 420],
	Letter: [215.9, 279.4]
};
var paperUnits = (millimetres) => Math.round(millimetres * 96 / 25.4 * 100) / 100;
var paperMillimetres = (units) => Math.round(units * 25.4 / 96 * 10) / 10;
function pageFormat(page) {
	const sides = [page.width, page.height].sort((a, b) => a - b);
	for (const [name, size] of Object.entries(PAPER_FORMATS)) if (size.every((mm, i) => Math.abs(paperUnits(mm) - sides[i]) < 2)) return name;
	return "custom";
}
/** Paper geometry changes never scale handwriting. Shrinking must not hide existing objects. */
function changePaperFormat(document, pageId, widthMm, heightMm) {
	const page = document.pages.find((p) => p.id === pageId);
	if (!page) throw Error("Cette page n’existe plus.");
	if (page.pdf) throw Error("Le format du PDF est conservé. Ajoutez une page vierge pour changer de format.");
	if (!Number.isFinite(widthMm) || !Number.isFinite(heightMm) || widthMm < 50 || heightMm < 50 || widthMm > 2e3 || heightMm > 2e3) throw Error("Choisissez des dimensions de 50 à 2000 mm.");
	const width = paperUnits(widthMm), height = paperUnits(heightMm);
	if (width < page.width - .1 || height < page.height - .1) for (const o of paperObjectsOnPage(document, pageId)) {
		const vertices = o.kind === "ink" ? o.points ?? [] : [
			{
				x: 0,
				y: 0
			},
			{
				x: o.width,
				y: 0
			},
			{
				x: o.width,
				y: o.height
			},
			{
				x: 0,
				y: o.height
			}
		];
		const padding = o.kind === "ink" ? (o.strokeWidth ?? 3) * 1.2 : 0;
		if (vertices.some((p) => {
			const point = objectPoint(o, p);
			return point.x + padding > width + .1 || point.y + padding > height + .1;
		})) throw Error("Ce format couperait une annotation. Déplacez-la ou choisissez un format plus grand ; la page reste intacte.");
	}
	return {
		type: "update-page",
		page: {
			...page,
			width,
			height
		}
	};
}
function inheritedBlankPage(page, id = crypto.randomUUID()) {
	const { pdf, bookmark, rotation, flowRootId, ...rest } = page;
	return {
		...rest,
		id,
		bookmark: false,
		rotation: 0
	};
}
//#endregion
//#region src/components/PaperPageSettings.tsx
var _jsxFileName$13 = "/home/louis/DowzeBuild/20260923/collections-060/src/components/PaperPageSettings.tsx";
function PaperPageSettings({ document, page, disabled, onCommit, onNotice }) {
	const [format, setFormat] = useState(pageFormat(page)), [landscape, setLandscape] = useState(page.width > page.height), [width, setWidth] = useState(paperMillimetres(page.width)), [height, setHeight] = useState(paperMillimetres(page.height));
	const apply = () => {
		try {
			const mm = format === "custom" ? [width, height] : [...PAPER_FORMATS[format]];
			if (format !== "custom" && landscape) mm.reverse();
			if (onCommit(changePaperFormat(document, page.id, mm[0], mm[1]))) onNotice("Format modifié. Vos annotations gardent leurs dimensions et leur position.");
		} catch (e) {
			onNotice(String(e instanceof Error ? e.message : e));
		}
	};
	return /* @__PURE__ */ jsxDEV("details", {
		className: "paper-page-settings",
		children: [/* @__PURE__ */ jsxDEV("summary", { children: "Format et modèle" }, void 0, false, {
			fileName: _jsxFileName$13,
			lineNumber: 7,
			columnNumber: 50
		}, this), /* @__PURE__ */ jsxDEV("div", { children: [
			/* @__PURE__ */ jsxDEV("label", { children: ["Modèle", /* @__PURE__ */ jsxDEV("select", {
				"aria-label": "Modèle de papier",
				value: page.template ?? "standard",
				disabled: disabled || !!page.pdf,
				onChange: (e) => onCommit({
					type: "update-page",
					page: {
						...page,
						template: e.target.value
					}
				}),
				children: [
					/* @__PURE__ */ jsxDEV("option", {
						value: "standard",
						children: "Standard"
					}, void 0, false, {
						fileName: _jsxFileName$13,
						lineNumber: 7,
						columnNumber: 307
					}, this),
					/* @__PURE__ */ jsxDEV("option", {
						value: "cornell",
						children: "Prise de notes Cornell"
					}, void 0, false, {
						fileName: _jsxFileName$13,
						lineNumber: 7,
						columnNumber: 349
					}, this),
					/* @__PURE__ */ jsxDEV("option", {
						value: "music",
						children: "Portées musicales"
					}, void 0, false, {
						fileName: _jsxFileName$13,
						lineNumber: 7,
						columnNumber: 404
					}, this),
					/* @__PURE__ */ jsxDEV("option", {
						value: "weekly",
						children: "Semaine"
					}, void 0, false, {
						fileName: _jsxFileName$13,
						lineNumber: 7,
						columnNumber: 452
					}, this)
				]
			}, void 0, true, {
				fileName: _jsxFileName$13,
				lineNumber: 7,
				columnNumber: 103
			}, this)] }, void 0, true, {
				fileName: _jsxFileName$13,
				lineNumber: 7,
				columnNumber: 90
			}, this),
			/* @__PURE__ */ jsxDEV("label", { children: ["Espacement", /* @__PURE__ */ jsxDEV("select", {
				"aria-label": "Espacement du papier",
				value: page.spacing ?? (page.pattern === "ruled" ? 28 : page.pattern === "grid" ? 24 : 20),
				disabled: disabled || !!page.pdf,
				onChange: (e) => onCommit({
					type: "update-page",
					page: {
						...page,
						spacing: Number(e.target.value)
					}
				}),
				children: [
					12,
					16,
					20,
					24,
					28,
					32,
					40
				].map((n) => /* @__PURE__ */ jsxDEV("option", {
					value: n,
					children: [paperMillimetres(n), " mm"]
				}, n, true, {
					fileName: _jsxFileName$13,
					lineNumber: 8,
					columnNumber: 293
				}, this))
			}, void 0, false, {
				fileName: _jsxFileName$13,
				lineNumber: 8,
				columnNumber: 19
			}, this)] }, void 0, true, {
				fileName: _jsxFileName$13,
				lineNumber: 8,
				columnNumber: 2
			}, this),
			/* @__PURE__ */ jsxDEV("label", { children: ["Format", /* @__PURE__ */ jsxDEV("select", {
				"aria-label": "Format de la page",
				disabled: disabled || !!page.pdf,
				value: format,
				onChange: (e) => setFormat(e.target.value),
				children: [Object.keys(PAPER_FORMATS).map((name) => /* @__PURE__ */ jsxDEV("option", { children: name }, name, false, {
					fileName: _jsxFileName$13,
					lineNumber: 9,
					columnNumber: 196
				}, this)), /* @__PURE__ */ jsxDEV("option", {
					value: "custom",
					children: "Personnalisé"
				}, void 0, false, {
					fileName: _jsxFileName$13,
					lineNumber: 9,
					columnNumber: 232
				}, this)]
			}, void 0, true, {
				fileName: _jsxFileName$13,
				lineNumber: 9,
				columnNumber: 15
			}, this)] }, void 0, true, {
				fileName: _jsxFileName$13,
				lineNumber: 9,
				columnNumber: 2
			}, this),
			format === "custom" ? /* @__PURE__ */ jsxDEV(Fragment, { children: [/* @__PURE__ */ jsxDEV("label", { children: ["Largeur (mm)", /* @__PURE__ */ jsxDEV("input", {
				"aria-label": "Largeur de la page en millimètres",
				type: "number",
				min: "50",
				max: "2000",
				step: ".1",
				value: width,
				disabled: disabled || !!page.pdf,
				onChange: (e) => setWidth(Number(e.target.value))
			}, void 0, false, {
				fileName: _jsxFileName$13,
				lineNumber: 10,
				columnNumber: 42
			}, this)] }, void 0, true, {
				fileName: _jsxFileName$13,
				lineNumber: 10,
				columnNumber: 23
			}, this), /* @__PURE__ */ jsxDEV("label", { children: ["Hauteur (mm)", /* @__PURE__ */ jsxDEV("input", {
				"aria-label": "Hauteur de la page en millimètres",
				type: "number",
				min: "50",
				max: "2000",
				step: ".1",
				value: height,
				disabled: disabled || !!page.pdf,
				onChange: (e) => setHeight(Number(e.target.value))
			}, void 0, false, {
				fileName: _jsxFileName$13,
				lineNumber: 10,
				columnNumber: 261
			}, this)] }, void 0, true, {
				fileName: _jsxFileName$13,
				lineNumber: 10,
				columnNumber: 242
			}, this)] }, void 0, true, {
				fileName: _jsxFileName$13,
				lineNumber: 10,
				columnNumber: 21
			}, this) : /* @__PURE__ */ jsxDEV("label", { children: ["Orientation", /* @__PURE__ */ jsxDEV("select", {
				"aria-label": "Orientation de la page",
				value: landscape ? "landscape" : "portrait",
				disabled: disabled || !!page.pdf,
				onChange: (e) => setLandscape(e.target.value === "landscape"),
				children: [/* @__PURE__ */ jsxDEV("option", {
					value: "portrait",
					children: "Portrait"
				}, void 0, false, {
					fileName: _jsxFileName$13,
					lineNumber: 10,
					columnNumber: 659
				}, this), /* @__PURE__ */ jsxDEV("option", {
					value: "landscape",
					children: "Paysage"
				}, void 0, false, {
					fileName: _jsxFileName$13,
					lineNumber: 10,
					columnNumber: 701
				}, this)]
			}, void 0, true, {
				fileName: _jsxFileName$13,
				lineNumber: 10,
				columnNumber: 485
			}, this)] }, void 0, true, {
				fileName: _jsxFileName$13,
				lineNumber: 10,
				columnNumber: 467
			}, this),
			/* @__PURE__ */ jsxDEV("button", {
				disabled: disabled || !!page.pdf,
				onClick: apply,
				children: "Appliquer le format"
			}, void 0, false, {
				fileName: _jsxFileName$13,
				lineNumber: 11,
				columnNumber: 2
			}, this),
			/* @__PURE__ */ jsxDEV("small", { children: page.pdf ? "Le format d’origine du PDF est conservé." : "Aucun changement d’échelle des annotations." }, void 0, false, {
				fileName: _jsxFileName$13,
				lineNumber: 11,
				columnNumber: 86
			}, this)
		] }, void 0, true, {
			fileName: _jsxFileName$13,
			lineNumber: 7,
			columnNumber: 85
		}, this)]
	}, void 0, true, {
		fileName: _jsxFileName$13,
		lineNumber: 7,
		columnNumber: 9
	}, this);
}
//#endregion
//#region src/lib/paperToolPreferences.ts
/** Tool instances have stable identities: two pens can keep different presets. */
var PAPER_TOOL_KINDS = [
	"text",
	"pen",
	"pencil",
	"calligraphy",
	"highlighter",
	"eraser",
	"select",
	"lasso",
	"laser"
];
var defaultPalette = [
	"#20343b",
	"#2855ce",
	"#dd4050",
	"#16a08a",
	"#f6c447",
	"#965ac8"
];
var record$2 = (value) => !!value && typeof value === "object" && !Array.isArray(value);
var slotId = (value) => typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{0,126}$/.test(value) && !value.includes("..");
var strokeStyle = (value) => value === "solid" || value === "dashed" || value === "dotted";
var inkKind = (tool) => [
	"pen",
	"pencil",
	"calligraphy",
	"highlighter"
].includes(tool);
var toolKind = (value) => typeof value === "string" && PAPER_TOOL_KINDS.includes(value);
var finite$4 = (value) => typeof value === "number" && Number.isFinite(value);
var clone = (value) => structuredClone(value);
var same$1 = (first, second) => JSON.stringify(first) === JSON.stringify(second);
var own = (value, key) => Object.hasOwn(value, key);
var currentCheck = (current) => {
	if (!current()) throw new PaperToolPreferenceChangedError("Le compte ou la note a changé. Les réglages précédents restent conservés.");
};
function scopeOnly(scope) {
	if (typeof scope.accountId !== "string" || !scope.accountId.length || scope.accountId.length > 2048 || typeof scope.spaceId !== "string" || !scope.spaceId.length || scope.spaceId.length > 2048) throw Error("Le compte et l’année sont nécessaires pour les réglages du carnet.");
	return {
		accountId: scope.accountId,
		spaceId: scope.spaceId
	};
}
function noteIdentity(noteId) {
	if (noteId !== void 0 && (typeof noteId !== "string" || !noteId.length || noteId.length > 4096)) throw Error("L’identité complète de la note est nécessaire.");
	return noteId;
}
function normalizePaperToolColor(value) {
	if (typeof value !== "string") return;
	const color = value.trim().toLowerCase();
	if (/^#[0-9a-f]{6}$/.test(color)) return color;
	if (/^#[0-9a-f]{3}$/.test(color)) return "#" + [...color.slice(1)].map((char) => char + char).join("");
}
function defaultPaperToolPreset(tool) {
	return {
		color: tool === "highlighter" ? "#f6c447" : "#20343b",
		width: tool === "highlighter" ? 14 : tool === "pencil" ? 2 : tool === "eraser" ? 3 : 3,
		opacity: tool === "highlighter" ? .35 : 1,
		wholeEraser: false
	};
}
var PAPER_FALLBACK_TEXT_SLOT = Object.freeze({
	id: "paper-tool-fallback-text",
	tool: "text",
	visible: true,
	preset: Object.freeze(defaultPaperToolPreset("text"))
});
function defaultPaperToolPreferences() {
	return {
		schema: 1,
		toolbar: PAPER_TOOL_KINDS.map((tool) => ({
			id: `paper-tool-${tool}`,
			tool,
			visible: true,
			preset: defaultPaperToolPreset(tool)
		})),
		palette: [...defaultPalette],
		activeSlotId: "paper-tool-text",
		dominantHand: "right",
		fingerInk: false
	};
}
function validPreset(value) {
	return record$2(value) && Object.keys(value).every((key) => [
		"color",
		"width",
		"opacity",
		"wholeEraser",
		"strokeStyle"
	].includes(key)) && normalizePaperToolColor(value.color) === value.color && finite$4(value.width) && value.width >= .1 && value.width <= 64 && finite$4(value.opacity) && value.opacity >= 0 && value.opacity <= 1 && typeof value.wholeEraser === "boolean" && (value.strokeStyle === void 0 || strokeStyle(value.strokeStyle));
}
function validSlot(value) {
	return record$2(value) && Object.keys(value).every((key) => [
		"id",
		"tool",
		"visible",
		"preset",
		"label"
	].includes(key)) && slotId(value.id) && value.id !== PAPER_FALLBACK_TEXT_SLOT.id && toolKind(value.tool) && typeof value.visible === "boolean" && validPreset(value.preset) && (value.label === void 0 || typeof value.label === "string" && value.label.trim().length > 0 && value.label.length <= 80);
}
function validPalette(value) {
	return Array.isArray(value) && value.length <= 32 && value.every((color) => normalizePaperToolColor(color) === color) && new Set(value).size === value.length;
}
function validActive(value, toolbar) {
	return value === PAPER_FALLBACK_TEXT_SLOT.id || typeof value === "string" && toolbar.some((slot) => slot.id === value && slot.visible);
}
function isPaperToolPreferences(value) {
	return record$2(value) && Object.keys(value).every((key) => [
		"schema",
		"toolbar",
		"palette",
		"activeSlotId",
		"dominantHand",
		"fingerInk",
		"returnToPen",
		"previousInkSlotId"
	].includes(key)) && value.schema === 1 && Array.isArray(value.toolbar) && value.toolbar.length <= 64 && value.toolbar.every(validSlot) && new Set(value.toolbar.map((slot) => slot.id)).size === value.toolbar.length && validPalette(value.palette) && validActive(value.activeSlotId, value.toolbar) && ["right", "left"].includes(String(value.dominantHand)) && typeof value.fingerInk === "boolean" && (value.returnToPen === void 0 || typeof value.returnToPen === "boolean") && (value.previousInkSlotId === void 0 || slotId(value.previousInkSlotId));
}
/** Loading an older/invalid value never writes over it. A later explicit edit
* archives the exact original row together with its replacement. */
function normalizePaperToolPreferences(value) {
	const defaults = defaultPaperToolPreferences();
	if (!record$2(value)) return defaults;
	const toolbar = [], used = /* @__PURE__ */ new Set();
	if (Array.isArray(value.toolbar)) for (const raw of value.toolbar) {
		if (toolbar.length >= 64) break;
		if (!record$2(raw) || !slotId(raw.id) || raw.id === PAPER_FALLBACK_TEXT_SLOT.id || used.has(raw.id) || !toolKind(raw.tool)) continue;
		const base = defaultPaperToolPreset(raw.tool), preset = record$2(raw.preset) ? raw.preset : {};
		used.add(raw.id);
		toolbar.push({
			id: raw.id,
			tool: raw.tool,
			visible: typeof raw.visible === "boolean" ? raw.visible : true,
			preset: {
				color: normalizePaperToolColor(preset.color) ?? base.color,
				width: finite$4(preset.width) && preset.width >= .1 && preset.width <= 64 ? preset.width : base.width,
				opacity: finite$4(preset.opacity) && preset.opacity >= 0 && preset.opacity <= 1 ? preset.opacity : base.opacity,
				wholeEraser: typeof preset.wholeEraser === "boolean" ? preset.wholeEraser : base.wholeEraser,
				...strokeStyle(preset.strokeStyle) ? { strokeStyle: preset.strokeStyle } : {}
			},
			...typeof raw.label === "string" && raw.label.trim() && raw.label.length <= 80 ? { label: raw.label } : {}
		});
	}
	const selectedToolbar = Array.isArray(value.toolbar) ? toolbar : defaults.toolbar;
	return {
		schema: 1,
		toolbar: selectedToolbar,
		palette: Array.isArray(value.palette) ? [...new Set(value.palette.map(normalizePaperToolColor).filter((color) => !!color))].slice(0, 32) : defaults.palette,
		activeSlotId: validActive(value.activeSlotId, selectedToolbar) ? value.activeSlotId : selectedToolbar.find((slot) => slot.visible && slot.tool === "text")?.id ?? selectedToolbar.find((slot) => slot.visible)?.id ?? PAPER_FALLBACK_TEXT_SLOT.id,
		dominantHand: value.dominantHand === "left" ? "left" : "right",
		fingerInk: value.fingerInk === true,
		...typeof value.returnToPen === "boolean" ? { returnToPen: value.returnToPen } : {},
		...slotId(value.previousInkSlotId) ? { previousInkSlotId: value.previousInkSlotId } : {}
	};
}
function activePaperToolSlot(preferences) {
	return clone(preferences.toolbar.find((slot) => slot.id === preferences.activeSlotId && slot.visible) ?? PAPER_FALLBACK_TEXT_SLOT);
}
function settleActive(preferences) {
	if (!validActive(preferences.activeSlotId, preferences.toolbar)) preferences.activeSlotId = preferences.toolbar.find((slot) => slot.visible && slot.tool === "text")?.id ?? preferences.toolbar.find((slot) => slot.visible)?.id ?? PAPER_FALLBACK_TEXT_SLOT.id;
	return preferences;
}
/** Indices are logical storage order, independent of the left-hand UI mirror.
* A keyboard move therefore preserves focus on the same stable slot identity. */
function applyPaperToolPreferenceCommand(preferences, command, newId = () => crypto.randomUUID()) {
	if (!isPaperToolPreferences(preferences)) throw Error("Les réglages d’outils sont invalides. Leur original reste conservé.");
	let next = clone(preferences);
	const find = (id) => {
		const slot = next.toolbar.find((candidate) => candidate.id === id);
		if (!slot) throw Error("Cet outil n’est plus dans la barre.");
		return slot;
	};
	const allocate = () => {
		const id = newId();
		if (!slotId(id) || id === PAPER_FALLBACK_TEXT_SLOT.id || next.toolbar.some((slot) => slot.id === id)) throw Error("Le nouvel outil doit avoir une identité distincte.");
		if (next.toolbar.length >= 64) throw Error("La barre peut contenir au maximum 64 outils.");
		return id;
	};
	switch (command.type) {
		case "select":
			if (command.id !== PAPER_FALLBACK_TEXT_SLOT.id && !find(command.id).visible) throw Error("Affichez cet outil avant de le sélectionner.");
			next.activeSlotId = command.id;
			if (command.id !== PAPER_FALLBACK_TEXT_SLOT.id && inkKind(find(command.id).tool)) next.previousInkSlotId = command.id;
			break;
		case "move": {
			find(command.id);
			if (!Number.isInteger(command.to) || command.to < 0 || command.to >= next.toolbar.length) throw Error("La nouvelle position de l’outil est invalide.");
			const index = next.toolbar.findIndex((slot) => slot.id === command.id), [slot] = next.toolbar.splice(index, 1);
			next.toolbar.splice(command.to, 0, slot);
			break;
		}
		case "reorder":
			if (command.ids.length !== next.toolbar.length || new Set(command.ids).size !== next.toolbar.length || command.ids.some((id) => !next.toolbar.some((slot) => slot.id === id))) throw Error("L’ordre doit contenir chaque outil exactement une fois.");
			next.toolbar = command.ids.map((id) => find(id));
			break;
		case "hide":
			find(command.id).visible = false;
			break;
		case "show":
			find(command.id).visible = true;
			break;
		case "remove":
			find(command.id);
			next.toolbar = next.toolbar.filter((slot) => slot.id !== command.id);
			break;
		case "duplicate": {
			const source = find(command.id), slot = {
				...clone(source),
				id: allocate(),
				visible: true
			};
			const at = next.toolbar.findIndex((candidate) => candidate.id === source.id);
			next.toolbar.splice(at + 1, 0, slot);
			next.activeSlotId = slot.id;
			break;
		}
		case "add": {
			if (!toolKind(command.tool)) throw Error("Cet outil n’est pas disponible.");
			const preset = {
				...defaultPaperToolPreset(command.tool),
				...command.preset
			};
			if (command.preset && own(command.preset, "color")) {
				const color = normalizePaperToolColor(command.preset.color);
				if (!color) throw Error("Choisissez une couleur HEX valide.");
				preset.color = color;
			}
			next.toolbar.push({
				id: allocate(),
				tool: command.tool,
				visible: true,
				preset,
				...command.label !== void 0 ? { label: command.label } : {}
			});
			next.activeSlotId = next.toolbar.at(-1).id;
			break;
		}
		case "patch-preset": {
			const slot = find(command.id);
			const color = own(command.patch, "color") ? normalizePaperToolColor(command.patch.color) : void 0;
			if (own(command.patch, "color") && !color) throw Error("Choisissez une couleur HEX valide.");
			slot.preset = {
				...slot.preset,
				...command.patch,
				...color ? { color } : {}
			};
			break;
		}
		case "rename": {
			const slot = find(command.id);
			if (command.label === void 0) delete slot.label;
			else {
				if (typeof command.label !== "string" || !command.label.trim() || command.label.trim().length > 80) throw Error("Le nom de ce préréglage doit contenir entre 1 et 80 caractères.");
				slot.label = command.label.trim();
			}
			break;
		}
		case "set-input":
			if (command.dominantHand !== void 0) next.dominantHand = command.dominantHand;
			if (command.fingerInk !== void 0) next.fingerInk = command.fingerInk;
			if (command.returnToPen !== void 0) next.returnToPen = command.returnToPen;
			break;
		case "palette-add": {
			const color = normalizePaperToolColor(command.color);
			if (!color) throw Error("Choisissez une couleur HEX valide.");
			if (!next.palette.includes(color)) {
				if (next.palette.length >= 32) throw Error("La palette peut contenir au maximum 32 couleurs.");
				next.palette.push(color);
			}
			break;
		}
		case "palette-remove": {
			const color = normalizePaperToolColor(command.color);
			if (!color) throw Error("Choisissez une couleur HEX valide.");
			next.palette = next.palette.filter((value) => value !== color);
			break;
		}
		case "reset-tool":
			if (!toolKind(command.tool)) throw Error("Cet outil n’est pas disponible.");
			next.toolbar = next.toolbar.map((slot) => slot.tool === command.tool ? {
				...slot,
				preset: defaultPaperToolPreset(slot.tool)
			} : slot);
			break;
		case "reset-toolbar": {
			const active = activePaperToolSlot(next).tool;
			next.toolbar = defaultPaperToolPreferences().toolbar.map((slot) => ({
				...slot,
				preset: clone(next.toolbar.find((previous) => previous.tool === slot.tool)?.preset ?? slot.preset)
			}));
			next.activeSlotId = next.toolbar.find((slot) => slot.tool === active).id;
			break;
		}
		case "reset-palette":
			next.palette = [...defaultPalette];
			break;
		case "reset-all":
			next = defaultPaperToolPreferences();
			break;
		default: throw Error("Cette modification de la barre d’outils est inconnue.");
	}
	settleActive(next);
	if ([
		"select",
		"duplicate",
		"add",
		"reset-toolbar"
	].includes(command.type)) {
		const active = activePaperToolSlot(next);
		if (inkKind(active.tool)) next.previousInkSlotId = active.id;
	}
	if (!isPaperToolPreferences(next)) throw Error("Cette modification produirait des réglages d’outils invalides.");
	return next;
}
function validPresetPatch(value) {
	return record$2(value) && Object.keys(value).every((key) => [
		"color",
		"width",
		"opacity",
		"wholeEraser",
		"strokeStyle"
	].includes(key)) && (!own(value, "color") || normalizePaperToolColor(value.color) === value.color) && (!own(value, "width") || finite$4(value.width) && value.width >= .1 && value.width <= 64) && (!own(value, "opacity") || finite$4(value.opacity) && value.opacity >= 0 && value.opacity <= 1) && (!own(value, "wholeEraser") || typeof value.wholeEraser === "boolean") && (!own(value, "strokeStyle") || strokeStyle(value.strokeStyle));
}
function isPaperToolPreferenceOverride(value) {
	if (!record$2(value) || value.schema !== 1 || Object.keys(value).some((key) => ![
		"schema",
		"toolbar",
		"presets",
		"labels",
		"palette",
		"activeSlotId",
		"dominantHand",
		"fingerInk",
		"returnToPen",
		"previousInkSlotId"
	].includes(key))) return false;
	if (value.toolbar !== void 0) {
		if (!record$2(value.toolbar) || Object.keys(value.toolbar).some((key) => ![
			"order",
			"added",
			"removed",
			"visibility"
		].includes(key))) return false;
		for (const key of ["order", "removed"]) if (value.toolbar[key] !== void 0 && (!Array.isArray(value.toolbar[key]) || value.toolbar[key].length > 64 || !value.toolbar[key].every(slotId) || new Set(value.toolbar[key]).size !== value.toolbar[key].length)) return false;
		if (value.toolbar.added !== void 0 && (!Array.isArray(value.toolbar.added) || value.toolbar.added.length > 64 || !value.toolbar.added.every(validSlot) || new Set(value.toolbar.added.map((slot) => slot.id)).size !== value.toolbar.added.length)) return false;
		if (value.toolbar.visibility !== void 0 && (!record$2(value.toolbar.visibility) || Object.keys(value.toolbar.visibility).length > 64 || !Object.entries(value.toolbar.visibility).every(([id, visible]) => slotId(id) && typeof visible === "boolean"))) return false;
	}
	return (value.presets === void 0 || record$2(value.presets) && Object.keys(value.presets).length <= 64 && Object.entries(value.presets).every(([id, preset]) => slotId(id) && validPresetPatch(preset))) && (value.labels === void 0 || record$2(value.labels) && Object.keys(value.labels).length <= 64 && Object.entries(value.labels).every(([id, label]) => slotId(id) && (label === null || typeof label === "string" && label.trim() === label && label.length > 0 && label.length <= 80))) && (value.palette === void 0 || validPalette(value.palette)) && (value.activeSlotId === void 0 || slotId(value.activeSlotId)) && (value.dominantHand === void 0 || value.dominantHand === "right" || value.dominantHand === "left") && (value.fingerInk === void 0 || typeof value.fingerInk === "boolean") && (value.returnToPen === void 0 || typeof value.returnToPen === "boolean") && (value.previousInkSlotId === void 0 || value.previousInkSlotId === null || slotId(value.previousInkSlotId));
}
function resolvePaperToolPreferences(global, override = { schema: 1 }) {
	if (!isPaperToolPreferences(global) || !isPaperToolPreferenceOverride(override)) throw Error("Les réglages d’outils ne peuvent pas être réunis.");
	const next = clone(global), removed = new Set(override.toolbar?.removed ?? []);
	next.toolbar = next.toolbar.filter((slot) => !removed.has(slot.id));
	for (const added of override.toolbar?.added ?? []) {
		const existing = next.toolbar.findIndex((slot) => slot.id === added.id);
		if (existing >= 0) {
			if (next.toolbar[existing].tool !== added.tool) throw Error("Un outil propre à la note partage l’identité d’un outil global différent. Les versions sont conservées.");
			next.toolbar[existing] = clone(added);
		} else next.toolbar.push(clone(added));
	}
	if (next.toolbar.length > 64) throw Error("La barre réunie dépasse 64 outils. Réduisez les outils propres à cette note.");
	for (const slot of next.toolbar) {
		if (own(override.toolbar?.visibility ?? {}, slot.id)) slot.visible = override.toolbar.visibility[slot.id];
		if (own(override.presets ?? {}, slot.id)) slot.preset = {
			...slot.preset,
			...override.presets[slot.id]
		};
		if (own(override.labels ?? {}, slot.id)) {
			const label = override.labels[slot.id];
			if (label === null) delete slot.label;
			else slot.label = label;
		}
	}
	if (override.toolbar?.order) {
		const ordered = override.toolbar.order;
		next.toolbar.sort((first, second) => {
			const a = ordered.indexOf(first.id), b = ordered.indexOf(second.id);
			return (a < 0 ? ordered.length : a) - (b < 0 ? ordered.length : b);
		});
	}
	if (override.palette !== void 0) next.palette = [...override.palette];
	if (override.activeSlotId !== void 0) next.activeSlotId = override.activeSlotId;
	if (override.dominantHand !== void 0) next.dominantHand = override.dominantHand;
	if (override.fingerInk !== void 0) next.fingerInk = override.fingerInk;
	if (override.returnToPen !== void 0) next.returnToPen = override.returnToPen;
	if (override.previousInkSlotId === null) delete next.previousInkSlotId;
	else if (override.previousInkSlotId !== void 0) next.previousInkSlotId = override.previousInkSlotId;
	settleActive(next);
	if (!isPaperToolPreferences(next)) throw Error("La barre réunie contient des réglages invalides.");
	return next;
}
function paperToolPreferenceOverride(global, effective) {
	if (!isPaperToolPreferences(global) || !isPaperToolPreferences(effective)) throw Error("Les réglages d’outils sont invalides.");
	const override = { schema: 1 }, toolbar = {}, presets = {}, labels = {};
	const globalById = new Map(global.toolbar.map((slot) => [slot.id, slot]));
	const ids = new Set(effective.toolbar.map((slot) => slot.id));
	const removed = global.toolbar.filter((slot) => !ids.has(slot.id)).map((slot) => slot.id);
	if (removed.length) toolbar.removed = removed;
	const added = effective.toolbar.filter((slot) => !globalById.has(slot.id));
	if (added.length) toolbar.added = clone(added);
	const normalOrder = [...global.toolbar.filter((slot) => ids.has(slot.id)).map((slot) => slot.id), ...added.map((slot) => slot.id)];
	const desiredOrder = effective.toolbar.map((slot) => slot.id);
	if (!same$1(normalOrder, desiredOrder)) toolbar.order = desiredOrder;
	const visibility = {};
	for (const slot of effective.toolbar) {
		const original = globalById.get(slot.id);
		if (!original) continue;
		if (original.tool !== slot.tool) throw Error("Une identité d’outil ne peut pas changer de type. Dupliquez cet outil.");
		if (original.label !== slot.label) labels[slot.id] = slot.label ?? null;
		if (original.visible !== slot.visible) visibility[slot.id] = slot.visible;
		const patch = {};
		for (const key of [
			"color",
			"width",
			"opacity",
			"wholeEraser",
			"strokeStyle"
		]) if (original.preset[key] !== slot.preset[key]) Object.assign(patch, { [key]: key === "strokeStyle" ? slot.preset.strokeStyle ?? "solid" : slot.preset[key] });
		if (Object.keys(patch).length) presets[slot.id] = patch;
	}
	if (Object.keys(visibility).length) toolbar.visibility = visibility;
	if (Object.keys(toolbar).length) override.toolbar = toolbar;
	if (Object.keys(presets).length) override.presets = presets;
	if (Object.keys(labels).length) override.labels = labels;
	if (!same$1(global.palette, effective.palette)) override.palette = [...effective.palette];
	if (global.activeSlotId !== effective.activeSlotId) override.activeSlotId = effective.activeSlotId;
	if (global.dominantHand !== effective.dominantHand) override.dominantHand = effective.dominantHand;
	if (global.fingerInk !== effective.fingerInk) override.fingerInk = effective.fingerInk;
	if ((global.returnToPen ?? false) !== (effective.returnToPen ?? false)) override.returnToPen = effective.returnToPen ?? false;
	if (global.previousInkSlotId !== effective.previousInkSlotId) override.previousInkSlotId = effective.previousInkSlotId ?? null;
	return override;
}
function paperToolPreferenceKey(scope, noteId) {
	const clean = scopeOnly(scope);
	noteIdentity(noteId);
	return `paper-tool-preferences|v1|${notebookIdentityDigest(JSON.stringify([
		"tools",
		clean.accountId,
		clean.spaceId,
		noteId ?? null
	]))}`;
}
function paperToolPreferenceHistoryPrefix(scope, noteId) {
	return `${paperToolPreferenceKey(scope, noteId)}|history|`;
}
function inScope(row, scope, key) {
	if (row && (row.key !== key || row.accountId !== scope.accountId || row.spaceId !== scope.spaceId)) throw Error("Les réglages conservés appartiennent à un autre compte ou à une autre année. Aucun original n’est remplacé.");
}
function assertRecordOwner(value, scope, noteId) {
	if (record$2(value) && (own(value, "accountId") && value.accountId !== scope.accountId || own(value, "spaceId") && value.spaceId !== scope.spaceId || own(value, "noteId") && value.noteId !== noteId)) throw Error("La provenance de ces réglages appartient à un autre compte, une autre année ou une autre note. Aucun original n’est remplacé.");
}
function validRecord(value, scope, noteId) {
	return record$2(value) && value.schema === 1 && value.kind === "paper-tool-preferences" && value.level === (noteId === void 0 ? "global" : "note") && value.accountId === scope.accountId && value.spaceId === scope.spaceId && value.noteId === noteId && Number.isSafeInteger(value.revision) && Number(value.revision) >= 1 && typeof value.updatedAt === "string" && Number.isFinite(Date.parse(value.updatedAt)) && (noteId === void 0 ? isPaperToolPreferences(value.preferences) && value.override === void 0 : isPaperToolPreferenceOverride(value.override) && value.preferences === void 0);
}
function loadedFromRows(scope, noteId, globalRow, noteRow, deletionRow) {
	inScope(globalRow, scope, paperToolPreferenceKey(scope));
	if (noteId !== void 0) inScope(noteRow, scope, paperToolPreferenceKey(scope, noteId));
	assertRecordOwner(globalRow?.value, scope);
	assertRecordOwner(noteRow?.value, scope, noteId);
	const warnings = [], globalRecord = validRecord(globalRow?.value, scope) ? globalRow.value : void 0, noteRecord = noteId !== void 0 && validRecord(noteRow?.value, scope, noteId) ? noteRow.value : void 0;
	const global = globalRecord?.preferences ?? normalizePaperToolPreferences(record$2(globalRow?.value) ? globalRow.value.preferences ?? globalRow.value : void 0);
	if (globalRow && !globalRecord) warnings.push("Les anciens réglages globaux sont conservés. Leur forme compatible est utilisée sans remplacer l’original.");
	let override = noteRecord?.override ?? { schema: 1 };
	if (noteRow && !noteRecord) warnings.push("Les réglages propres à cette note sont illisibles. Leur original est conservé ; la barre globale reste disponible.");
	let effective;
	try {
		effective = resolvePaperToolPreferences(global, override);
	} catch (error) {
		warnings.push(error instanceof Error ? error.message : String(error));
		override = { schema: 1 };
		effective = clone(global);
	}
	return {
		scope: scopeOnly(scope),
		...noteId !== void 0 ? { noteId } : {},
		...globalRow ? { globalRow: clone(globalRow) } : {},
		...noteRow ? { noteRow: clone(noteRow) } : {},
		...deletionRow ? { deletionRow: clone(deletionRow) } : {},
		global: clone(global),
		override: clone(override),
		effective,
		warnings
	};
}
async function loadPaperToolPreferences(scope, noteId, current = () => true) {
	const clean = scopeOnly(scope);
	noteIdentity(noteId);
	currentCheck(current);
	const [globalRow, noteRow] = await Promise.all([getSnapshot(paperToolPreferenceKey(clean)), noteId === void 0 ? Promise.resolve(void 0) : getSnapshot(paperToolPreferenceKey(clean, noteId))]);
	currentCheck(current);
	let deletionRow;
	if (noteId !== void 0) {
		const deletion = await readNotebookDeletionStatus(noteId, clean, current);
		currentCheck(current);
		if (deletion) throw Error("Cette note a été supprimée. Ses réglages restent conservés.");
		deletionRow = await getSnapshot(notebookDeletionKey({
			...clean,
			type: "whiteboard",
			documentId: notebookDocumentId(noteId)
		}));
		currentCheck(current);
		if (deletionRow) throw Error("Le statut de cette note doit être réexaminé avant de modifier ses réglages.");
	}
	return loadedFromRows(clean, noteId, globalRow, noteRow, deletionRow);
}
var PaperToolPreferenceChangedError = class extends Error {};
async function preparePreferenceWrite(input) {
	const { loaded, target, current } = input, scope = scopeOnly(loaded.scope);
	noteIdentity(loaded.noteId);
	currentCheck(current);
	if (target === "note" && loaded.noteId === void 0) throw Error("Choisissez une note pour ces réglages.");
	inScope(loaded.globalRow, scope, paperToolPreferenceKey(scope));
	if (loaded.noteId !== void 0) inScope(loaded.noteRow, scope, paperToolPreferenceKey(scope, loaded.noteId));
	assertRecordOwner(loaded.globalRow?.value, scope);
	assertRecordOwner(loaded.noteRow?.value, scope, loaded.noteId);
	if (!isPaperToolPreferences(loaded.global) || !isPaperToolPreferences(loaded.effective) || !isPaperToolPreferenceOverride(loaded.override)) throw Error("Rechargez la barre d’outils avant de conserver ses réglages.");
	if (input.preferences !== void 0 && !isPaperToolPreferences(input.preferences)) throw Error("Les nouveaux réglages d’outils sont invalides.");
	const before = target === "global" ? loaded.globalRow : loaded.noteRow, noteId = target === "note" ? loaded.noteId : void 0, key = paperToolPreferenceKey(scope, noteId);
	const override = target === "note" ? input.override ?? paperToolPreferenceOverride(loaded.global, input.preferences) : void 0;
	if (override && !isPaperToolPreferenceOverride(override)) throw Error("Les réglages propres à cette note sont invalides.");
	const value = target === "global" ? input.preferences : override;
	const oldValue = validRecord(before?.value, scope, noteId) ? target === "global" ? before.value.preferences : before.value.override : void 0;
	const unchanged = oldValue !== void 0 && same$1(oldValue, value) || !before && target === "note" && same$1(override, { schema: 1 });
	const commit = {
		target: scope,
		sources: [],
		drafts: [],
		blobs: [],
		snapshots: [],
		draftChecks: [],
		blobChecks: [],
		snapshotChecks: [{
			key: paperToolPreferenceKey(scope),
			expected: loaded.globalRow
		}]
	};
	if (loaded.noteId !== void 0) {
		commit.snapshotChecks.push({
			key: paperToolPreferenceKey(scope, loaded.noteId),
			expected: loaded.noteRow
		}, {
			key: notebookDeletionKey({
				...scope,
				type: "whiteboard",
				documentId: notebookDocumentId(loaded.noteId)
			}),
			expected: loaded.deletionRow
		});
		if (loaded.deletionRow) throw Error("Cette note a été supprimée. Ses réglages restent conservés.");
	}
	if (unchanged) return {
		commit,
		loaded: clone(loaded),
		changed: false
	};
	const now = input.now ?? (/* @__PURE__ */ new Date()).toISOString();
	if (!Number.isFinite(Date.parse(now))) throw Error("La date des nouveaux réglages est invalide.");
	const revision = record$2(before?.value) && Number.isSafeInteger(before.value.revision) && Number(before.value.revision) >= 0 ? Number(before.value.revision) + 1 : 1;
	if (!Number.isSafeInteger(revision)) throw Error("La révision des réglages doit être réexaminée.");
	const nextValue = {
		schema: 1,
		kind: "paper-tool-preferences",
		level: target,
		...scope,
		...noteId !== void 0 ? { noteId } : {},
		revision,
		updatedAt: now,
		...target === "global" ? { preferences: clone(input.preferences) } : { override: clone(override) }
	}, nextRow = {
		key,
		...scope,
		value: nextValue
	};
	if (before) {
		const historyKey = paperToolPreferenceHistoryPrefix(scope, noteId) + notebookIdentityDigest(JSON.stringify(before.value)), history = await getSnapshot(historyKey);
		currentCheck(current);
		inScope(history, scope, historyKey);
		if (history && !same$1(history.value, before.value)) throw Error("Une version antérieure de ces réglages utilise une identité incompatible. Aucun original n’est remplacé.");
		commit.snapshotChecks.push({
			key: historyKey,
			expected: history
		});
		if (!history) commit.snapshots.push({
			key: historyKey,
			...scope,
			value: clone(before.value)
		});
	}
	commit.snapshots.push(nextRow);
	return {
		commit,
		loaded: loadedFromRows(scope, loaded.noteId, target === "global" ? nextRow : loaded.globalRow, target === "note" ? nextRow : loaded.noteRow, loaded.deletionRow),
		changed: true
	};
}
async function preparePaperToolPreferenceCommit(input) {
	return preparePreferenceWrite(input);
}
async function commitPaperToolPreferences(input) {
	const plan = await preparePaperToolPreferenceCommit(input);
	currentCheck(input.current);
	try {
		await commitNotebookTransfer(plan.commit, input.current);
	} catch (error) {
		if (!input.current()) currentCheck(input.current);
		throw new PaperToolPreferenceChangedError(error instanceof Error ? error.message : "Les réglages ont changé pendant leur enregistrement.");
	}
	currentCheck(input.current);
	return plan.loaded;
}
/** Reset only this note's override. The user's global defaults and every old
* version are preserved; no unrelated note or server document is changed. */
async function clearPaperToolPreferenceOverride(input) {
	const plan = await preparePreferenceWrite({
		...input,
		target: "note",
		override: { schema: 1 }
	});
	currentCheck(input.current);
	try {
		await commitNotebookTransfer(plan.commit, input.current);
	} catch (error) {
		if (!input.current()) currentCheck(input.current);
		throw new PaperToolPreferenceChangedError(error instanceof Error ? error.message : "Les réglages ont changé pendant leur réinitialisation.");
	}
	currentCheck(input.current);
	return plan.loaded;
}
/** A targeted note reset removes the relevant differences rather than pinning
* today's global value. Future global edits then remain inherited. */
async function resetPaperToolPreferenceSection(input) {
	const { loaded, target, section } = input;
	if (target === "global") {
		const preferences = section === "all" ? defaultPaperToolPreferences() : section === "toolbar" ? applyPaperToolPreferenceCommand(loaded.global, { type: "reset-toolbar" }) : section === "palette" ? applyPaperToolPreferenceCommand(loaded.global, { type: "reset-palette" }) : section === "input" ? applyPaperToolPreferenceCommand(loaded.global, {
			type: "set-input",
			dominantHand: "right",
			fingerInk: false,
			returnToPen: false
		}) : applyPaperToolPreferenceCommand(loaded.global, {
			type: "reset-tool",
			tool: section
		});
		return commitPaperToolPreferences({
			...input,
			preferences
		});
	}
	if (section === "all") return clearPaperToolPreferenceOverride(input);
	const override = clone(loaded.override);
	if (section === "toolbar") {
		const added = new Set(override.toolbar?.added?.map((slot) => slot.id) ?? []);
		delete override.toolbar;
		delete override.activeSlotId;
		delete override.labels;
		if (override.presets) {
			for (const id of Object.keys(override.presets)) if (added.has(id)) delete override.presets[id];
			if (!Object.keys(override.presets).length) delete override.presets;
		}
	} else if (section === "palette") delete override.palette;
	else if (section === "input") {
		delete override.dominantHand;
		delete override.fingerInk;
		delete override.returnToPen;
		delete override.previousInkSlotId;
	} else {
		if (!toolKind(section)) throw Error("Cet outil n’est pas disponible.");
		const source = [...loaded.global.toolbar, ...override.toolbar?.added ?? []], ids = new Set(source.filter((slot) => slot.tool === section).map((slot) => slot.id));
		if (override.presets) {
			for (const id of Object.keys(override.presets)) if (ids.has(id)) delete override.presets[id];
			if (!Object.keys(override.presets).length) delete override.presets;
		}
		if (override.toolbar?.added) override.toolbar.added = override.toolbar.added.map((slot) => slot.tool === section ? {
			...slot,
			preset: clone(loaded.global.toolbar.find((globalSlot) => globalSlot.tool === section)?.preset ?? defaultPaperToolPreset(section))
		} : slot);
	}
	const plan = await preparePreferenceWrite({
		...input,
		override
	});
	currentCheck(input.current);
	try {
		await commitNotebookTransfer(plan.commit, input.current);
	} catch (error) {
		if (!input.current()) currentCheck(input.current);
		throw new PaperToolPreferenceChangedError(error instanceof Error ? error.message : "Les réglages ont changé pendant leur réinitialisation.");
	}
	currentCheck(input.current);
	return plan.loaded;
}
//#endregion
//#region src/hooks/usePaperToolPreferences.ts
function usePaperToolPreferences(scope, noteId) {
	const key = JSON.stringify([
		scope.accountId,
		scope.spaceId,
		noteId
	]), latest = useRef(key);
	latest.current = key;
	const session = useMemo(() => ({
		key,
		alive: true,
		writable: true,
		pending: 0,
		loaded: null,
		opening: Promise.resolve(),
		tail: Promise.resolve()
	}), [key]);
	const [state, setState] = useState({
		key,
		loaded: null,
		saving: false,
		notice: ""
	});
	const current = () => session.alive && session.writable && latest.current === session.key;
	useEffect(() => {
		session.alive = true;
		setState({
			key,
			loaded: null,
			saving: false,
			notice: ""
		});
		session.opening = loadPaperToolPreferences(scope, noteId, () => session.alive && latest.current === key).then((loaded) => {
			if (session.alive && latest.current === key) {
				session.loaded = loaded;
				setState({
					key,
					loaded,
					saving: session.pending > 0,
					notice: ""
				});
			}
		}).catch((error) => {
			if (session.alive && latest.current === key) setState({
				key,
				loaded: null,
				saving: false,
				notice: String(error instanceof Error ? error.message : error)
			});
		});
		const unregister = registerNotebookWriter(scope.accountId, {
			flush: () => {},
			settled: async () => {
				await session.opening;
				await session.tail;
			},
			pending: () => session.pending > 0,
			suspend: () => {
				session.writable = false;
			},
			resume: () => {
				session.writable = true;
			}
		});
		return () => {
			session.alive = false;
			unregister();
		};
	}, [session]);
	const queue = (operation) => {
		if (!current()) return Promise.resolve(false);
		session.pending++;
		setState((old) => old.key === key ? {
			...old,
			saving: true,
			notice: ""
		} : old);
		const work = session.tail.catch(() => {}).then(async () => {
			await session.opening;
			if (!current() || !session.loaded) return false;
			try {
				const loaded = await operation(session.loaded);
				if (!current()) return false;
				session.loaded = loaded;
				setState({
					key,
					loaded,
					saving: session.pending > 1,
					notice: ""
				});
				return true;
			} catch (error) {
				if (current()) {
					try {
						session.loaded = await loadPaperToolPreferences(scope, noteId, current);
					} catch {}
					if (current()) setState({
						key,
						loaded: session.loaded,
						saving: session.pending > 1,
						notice: `Réglages précédents conservés. ${String(error instanceof Error ? error.message : error)}`
					});
				}
				return false;
			}
		}).finally(() => {
			session.pending--;
			if (session.alive && latest.current === key) setState((old) => old.key === key ? {
				...old,
				saving: session.pending > 0
			} : old);
		});
		session.tail = work.then(() => {});
		return work;
	};
	const change = (command, target = "note") => queue((loaded) => commitPaperToolPreferences({
		loaded,
		target,
		preferences: applyPaperToolPreferenceCommand(target === "global" ? loaded.global : loaded.effective, command),
		current
	}));
	const clearNote = () => queue((loaded) => clearPaperToolPreferenceOverride({
		loaded,
		current
	}));
	const reset = (target, section) => queue((loaded) => resetPaperToolPreferenceSection({
		loaded,
		target,
		section,
		current
	}));
	const loaded = state.key === key ? state.loaded : null;
	return {
		scopeKey: key,
		loaded,
		effective: loaded?.effective ?? defaultPaperToolPreferences(),
		ready: !!loaded,
		saving: state.key === key && state.saving,
		notice: state.key === key ? state.notice : "",
		change,
		clearNote,
		reset,
		settled: () => session.tail
	};
}
//#endregion
//#region src/components/PaperToolSettings.tsx
var _jsxFileName$12 = "/home/louis/DowzeBuild/20260923/collections-060/src/components/PaperToolSettings.tsx";
var labels = {
	text: "Texte",
	pen: "Stylo",
	pencil: "Crayon",
	calligraphy: "Calligraphie",
	highlighter: "Surligneur",
	eraser: "Gomme",
	select: "Sélection",
	lasso: "Lasso",
	laser: "Pointeur laser"
};
function paperToolSlotLabel(slot, preferences) {
	if (slot.label) return slot.label;
	const siblings = preferences.toolbar.filter((other) => other.tool === slot.tool);
	return labels[slot.tool] + (siblings.length > 1 ? ` ${siblings.findIndex((other) => other.id === slot.id) + 1}` : "");
}
function PaperToolIcon({ tool }) {
	const Icon = tool === "text" ? Type : [
		"pen",
		"pencil",
		"calligraphy"
	].includes(tool) ? Pencil : tool === "highlighter" ? Highlighter : tool === "eraser" ? Eraser : tool === "select" ? MousePointer2 : tool === "lasso" ? Move : ZoomIn;
	return /* @__PURE__ */ jsxDEV(Icon, {}, void 0, false, {
		fileName: _jsxFileName$12,
		lineNumber: 11,
		columnNumber: 263
	}, this);
}
function PresetInput({ value, label, type = "text", disabled, placeholder, min, max, step, maxLength, normalize, onCommit }) {
	const [draft, setDraft] = useState(value), dirty = useRef(false), serial = useRef(0), pending = useRef(null), alive = useRef(true), external = useRef(value);
	external.current = value;
	useEffect(() => {
		if (!dirty.current && pending.current === null) setDraft(value);
	}, [value]);
	useEffect(() => {
		alive.current = true;
		return () => {
			alive.current = false;
		};
	}, []);
	const save = () => {
		if (!dirty.current) return;
		const next = normalize(draft);
		dirty.current = false;
		if (next === null || next === external.current) {
			setDraft(external.current);
			return;
		}
		setDraft(next);
		const version = serial.current;
		pending.current = version;
		const confirmed = (saved) => {
			if (pending.current === version) pending.current = null;
			if (alive.current && serial.current === version && !dirty.current) setDraft(saved ? next : external.current);
		};
		onCommit(next).then(confirmed).catch(() => confirmed(false));
	};
	return /* @__PURE__ */ jsxDEV("input", {
		type,
		"aria-label": label,
		value: draft,
		disabled,
		placeholder,
		min,
		max,
		step,
		maxLength,
		onChange: (event) => {
			dirty.current = true;
			serial.current++;
			setDraft(event.target.value);
		},
		onBlur: save,
		onKeyDown: (event) => {
			if (event.key === "Enter") {
				event.preventDefault();
				event.currentTarget.blur();
			}
		}
	}, void 0, false, {
		fileName: _jsxFileName$12,
		lineNumber: 21,
		columnNumber: 9
	}, this);
}
function PaperToolSettings({ preferences }) {
	const [open, setOpen] = useState(false), [target, setTarget] = useState("global"), [configured, setConfigured] = useState(""), [newTool, setNewTool] = useState("pen"), [paletteColor, setPaletteColor] = useState("#2855ce");
	const trigger = useRef(null), panel = useRef(null), presetEditor = useRef(null);
	const config = target === "global" ? preferences.loaded?.global ?? preferences.effective : preferences.effective, busy = !preferences.ready || preferences.saving, slot = config.toolbar.find((value) => value.id === configured) ?? config.toolbar.find((value) => value.id === config.activeSlotId) ?? config.toolbar[0];
	useEffect(() => {
		setOpen(false);
		setConfigured("");
	}, [preferences.scopeKey]);
	useLayoutEffect(() => {
		if (configured) presetEditor.current?.scrollIntoView?.({ block: "nearest" });
	}, [configured]);
	useEffect(() => {
		if (!open) return;
		panel.current?.querySelector("button")?.focus();
	}, [open]);
	const close = () => {
		setOpen(false);
		trigger.current?.focus();
	};
	const reset = (section) => void preferences.reset(target, section);
	return /* @__PURE__ */ jsxDEV("div", {
		className: "paper-tool-settings",
		children: [/* @__PURE__ */ jsxDEV("button", {
			ref: trigger,
			"aria-label": "Personnaliser les outils",
			"aria-expanded": open,
			onClick: () => setOpen((value) => !value),
			children: /* @__PURE__ */ jsxDEV(Settings2, {}, void 0, false, {
				fileName: _jsxFileName$12,
				lineNumber: 32,
				columnNumber: 164
			}, this)
		}, void 0, false, {
			fileName: _jsxFileName$12,
			lineNumber: 32,
			columnNumber: 46
		}, this), open && /* @__PURE__ */ jsxDEV(Fragment, { children: [/* @__PURE__ */ jsxDEV("div", {
			className: "paper-tool-settings-backdrop",
			onClick: close
		}, void 0, false, {
			fileName: _jsxFileName$12,
			lineNumber: 33,
			columnNumber: 2
		}, this), /* @__PURE__ */ jsxDEV("div", {
			ref: panel,
			className: "paper-tool-settings-panel",
			role: "dialog",
			"aria-modal": "true",
			"aria-label": "Personnaliser les outils",
			onKeyDown: (event) => {
				if (event.key === "Escape") {
					event.preventDefault();
					event.stopPropagation();
					close();
				}
				if (event.key === "Tab") {
					const controls = [...event.currentTarget.querySelectorAll("button:not(:disabled),input:not(:disabled),select:not(:disabled),[tabindex=\"0\"]")].filter((element) => element.offsetParent !== null), first = controls[0], last = controls.at(-1);
					if (event.shiftKey && document.activeElement === first) {
						event.preventDefault();
						last?.focus();
					} else if (!event.shiftKey && document.activeElement === last) {
						event.preventDefault();
						first?.focus();
					}
				}
			},
			children: [
				/* @__PURE__ */ jsxDEV("header", { children: [/* @__PURE__ */ jsxDEV("div", { children: [/* @__PURE__ */ jsxDEV("strong", { children: "Vos outils" }, void 0, false, {
					fileName: _jsxFileName$12,
					lineNumber: 37,
					columnNumber: 15
				}, this), /* @__PURE__ */ jsxDEV("p", { children: "Une barre et des styles à votre façon." }, void 0, false, {
					fileName: _jsxFileName$12,
					lineNumber: 37,
					columnNumber: 42
				}, this)] }, void 0, true, {
					fileName: _jsxFileName$12,
					lineNumber: 37,
					columnNumber: 10
				}, this), /* @__PURE__ */ jsxDEV("button", {
					"aria-label": "Fermer les réglages des outils",
					onClick: close,
					children: /* @__PURE__ */ jsxDEV(X, {}, void 0, false, {
						fileName: _jsxFileName$12,
						lineNumber: 37,
						columnNumber: 161
					}, this)
				}, void 0, false, {
					fileName: _jsxFileName$12,
					lineNumber: 37,
					columnNumber: 93
				}, this)] }, void 0, true, {
					fileName: _jsxFileName$12,
					lineNumber: 37,
					columnNumber: 2
				}, this),
				/* @__PURE__ */ jsxDEV("label", {
					className: "paper-settings-scope",
					children: ["Appliquer à", /* @__PURE__ */ jsxDEV("select", {
						"aria-label": "Portée des réglages des outils",
						value: target,
						onChange: (e) => {
							setTarget(e.target.value);
							setConfigured("");
						},
						children: [/* @__PURE__ */ jsxDEV("option", {
							value: "global",
							children: "Toutes les notes de cet espace"
						}, void 0, false, {
							fileName: _jsxFileName$12,
							lineNumber: 38,
							columnNumber: 200
						}, this), /* @__PURE__ */ jsxDEV("option", {
							value: "note",
							children: "Cette note uniquement"
						}, void 0, false, {
							fileName: _jsxFileName$12,
							lineNumber: 38,
							columnNumber: 262
						}, this)]
					}, void 0, true, {
						fileName: _jsxFileName$12,
						lineNumber: 38,
						columnNumber: 53
					}, this)]
				}, void 0, true, {
					fileName: _jsxFileName$12,
					lineNumber: 38,
					columnNumber: 2
				}, this),
				/* @__PURE__ */ jsxDEV("section", { children: [
					/* @__PURE__ */ jsxDEV("div", {
						className: "paper-settings-section-title",
						children: [/* @__PURE__ */ jsxDEV("h3", { children: "Barre d’outils" }, void 0, false, {
							fileName: _jsxFileName$12,
							lineNumber: 39,
							columnNumber: 57
						}, this), /* @__PURE__ */ jsxDEV("button", {
							disabled: busy,
							onClick: () => reset("toolbar"),
							"aria-label": "Réinitialiser la barre d’outils",
							children: /* @__PURE__ */ jsxDEV(RotateCcw, {}, void 0, false, {
								fileName: _jsxFileName$12,
								lineNumber: 39,
								columnNumber: 180
							}, this)
						}, void 0, false, {
							fileName: _jsxFileName$12,
							lineNumber: 39,
							columnNumber: 80
						}, this)]
					}, void 0, true, {
						fileName: _jsxFileName$12,
						lineNumber: 39,
						columnNumber: 11
					}, this),
					/* @__PURE__ */ jsxDEV("p", {
						className: "paper-settings-help",
						children: "Déplacez les outils avec les flèches. Au clavier : Alt + ↑ ou ↓."
					}, void 0, false, {
						fileName: _jsxFileName$12,
						lineNumber: 39,
						columnNumber: 207
					}, this),
					/* @__PURE__ */ jsxDEV("ul", {
						className: "paper-tool-order",
						children: config.toolbar.map((item, index) => {
							const name = paperToolSlotLabel(item, config);
							return /* @__PURE__ */ jsxDEV("li", {
								"data-tool-slot": item.id,
								className: slot?.id === item.id ? "is-configured" : "",
								onKeyDown: (event) => {
									if (event.altKey && ["ArrowUp", "ArrowDown"].includes(event.key)) {
										const to = index + (event.key === "ArrowUp" ? -1 : 1);
										event.preventDefault();
										if (!busy && to >= 0 && to < config.toolbar.length) preferences.change({
											type: "move",
											id: item.id,
											to
										}, target);
									}
								},
								children: [/* @__PURE__ */ jsxDEV("button", {
									className: "paper-tool-configure",
									"aria-label": `Régler ${name}`,
									onClick: () => {
										setConfigured(item.id);
										if (configured === item.id) presetEditor.current?.scrollIntoView?.({ block: "nearest" });
									},
									children: [
										/* @__PURE__ */ jsxDEV(PaperToolIcon, { tool: item.tool }, void 0, false, {
											fileName: _jsxFileName$12,
											lineNumber: 41,
											columnNumber: 195
										}, this),
										/* @__PURE__ */ jsxDEV("span", { children: name }, void 0, false, {
											fileName: _jsxFileName$12,
											lineNumber: 41,
											columnNumber: 228
										}, this),
										/* @__PURE__ */ jsxDEV("i", {
											"aria-hidden": "true",
											style: { background: item.preset.color }
										}, void 0, false, {
											fileName: _jsxFileName$12,
											lineNumber: 41,
											columnNumber: 247
										}, this)
									]
								}, void 0, true, {
									fileName: _jsxFileName$12,
									lineNumber: 41,
									columnNumber: 2
								}, this), /* @__PURE__ */ jsxDEV("div", { children: [
									/* @__PURE__ */ jsxDEV("button", {
										"aria-label": `Déplacer ${name} avant`,
										disabled: busy || index === 0,
										onClick: () => void preferences.change({
											type: "move",
											id: item.id,
											to: index - 1
										}, target),
										children: /* @__PURE__ */ jsxDEV(ArrowUp, {}, void 0, false, {
											fileName: _jsxFileName$12,
											lineNumber: 42,
											columnNumber: 162
										}, this)
									}, void 0, false, {
										fileName: _jsxFileName$12,
										lineNumber: 42,
										columnNumber: 7
									}, this),
									/* @__PURE__ */ jsxDEV("button", {
										"aria-label": `Déplacer ${name} après`,
										disabled: busy || index === config.toolbar.length - 1,
										onClick: () => void preferences.change({
											type: "move",
											id: item.id,
											to: index + 1
										}, target),
										children: /* @__PURE__ */ jsxDEV(ArrowDown, {}, void 0, false, {
											fileName: _jsxFileName$12,
											lineNumber: 42,
											columnNumber: 358
										}, this)
									}, void 0, false, {
										fileName: _jsxFileName$12,
										lineNumber: 42,
										columnNumber: 181
									}, this),
									/* @__PURE__ */ jsxDEV("button", {
										"aria-label": `${item.visible ? "Masquer" : "Afficher"} ${name}`,
										"aria-pressed": item.visible,
										disabled: busy,
										onClick: () => void preferences.change({
											type: item.visible ? "hide" : "show",
											id: item.id
										}, target),
										children: item.visible ? /* @__PURE__ */ jsxDEV(Eye, {}, void 0, false, {
											fileName: _jsxFileName$12,
											lineNumber: 42,
											columnNumber: 596
										}, this) : /* @__PURE__ */ jsxDEV(EyeOff, {}, void 0, false, {
											fileName: _jsxFileName$12,
											lineNumber: 42,
											columnNumber: 603
										}, this)
									}, void 0, false, {
										fileName: _jsxFileName$12,
										lineNumber: 42,
										columnNumber: 379
									}, this),
									/* @__PURE__ */ jsxDEV("button", {
										"aria-label": `Dupliquer ${name}`,
										disabled: busy,
										onClick: () => void preferences.change({
											type: "duplicate",
											id: item.id
										}, target),
										children: /* @__PURE__ */ jsxDEV(Copy, {}, void 0, false, {
											fileName: _jsxFileName$12,
											lineNumber: 42,
											columnNumber: 755
										}, this)
									}, void 0, false, {
										fileName: _jsxFileName$12,
										lineNumber: 42,
										columnNumber: 622
									}, this),
									/* @__PURE__ */ jsxDEV("button", {
										"aria-label": `Retirer ${name} de la barre`,
										disabled: busy,
										onClick: () => void preferences.change({
											type: "remove",
											id: item.id
										}, target),
										children: /* @__PURE__ */ jsxDEV(Trash2, {}, void 0, false, {
											fileName: _jsxFileName$12,
											lineNumber: 42,
											columnNumber: 911
										}, this)
									}, void 0, false, {
										fileName: _jsxFileName$12,
										lineNumber: 42,
										columnNumber: 771
									}, this)
								] }, void 0, true, {
									fileName: _jsxFileName$12,
									lineNumber: 42,
									columnNumber: 2
								}, this)]
							}, item.id, true, {
								fileName: _jsxFileName$12,
								lineNumber: 40,
								columnNumber: 120
							}, this);
						})
					}, void 0, false, {
						fileName: _jsxFileName$12,
						lineNumber: 40,
						columnNumber: 2
					}, this),
					/* @__PURE__ */ jsxDEV("div", {
						className: "paper-tool-add",
						children: [/* @__PURE__ */ jsxDEV("select", {
							"aria-label": "Outil à ajouter",
							value: newTool,
							onChange: (e) => setNewTool(e.target.value),
							children: PAPER_TOOL_KINDS.map((tool) => /* @__PURE__ */ jsxDEV("option", {
								value: tool,
								children: labels[tool]
							}, tool, false, {
								fileName: _jsxFileName$12,
								lineNumber: 43,
								columnNumber: 173
							}, this))
						}, void 0, false, {
							fileName: _jsxFileName$12,
							lineNumber: 43,
							columnNumber: 34
						}, this), /* @__PURE__ */ jsxDEV("button", {
							disabled: busy,
							onClick: () => void preferences.change({
								type: "add",
								tool: newTool
							}, target),
							children: [/* @__PURE__ */ jsxDEV(Plus, {}, void 0, false, {
								fileName: _jsxFileName$12,
								lineNumber: 43,
								columnNumber: 335
							}, this), "Ajouter"]
						}, void 0, true, {
							fileName: _jsxFileName$12,
							lineNumber: 43,
							columnNumber: 239
						}, this)]
					}, void 0, true, {
						fileName: _jsxFileName$12,
						lineNumber: 43,
						columnNumber: 2
					}, this)
				] }, void 0, true, {
					fileName: _jsxFileName$12,
					lineNumber: 39,
					columnNumber: 2
				}, this),
				slot && /* @__PURE__ */ jsxDEV("section", {
					ref: presetEditor,
					className: "paper-preset-editor",
					children: [
						/* @__PURE__ */ jsxDEV("div", {
							className: "paper-settings-section-title",
							children: [/* @__PURE__ */ jsxDEV("h3", { children: paperToolSlotLabel(slot, config) }, void 0, false, {
								fileName: _jsxFileName$12,
								lineNumber: 44,
								columnNumber: 115
							}, this), /* @__PURE__ */ jsxDEV("button", {
								disabled: busy,
								onClick: () => reset(slot.tool),
								"aria-label": `Réinitialiser les styles ${labels[slot.tool]}`,
								children: /* @__PURE__ */ jsxDEV(RotateCcw, {}, void 0, false, {
									fileName: _jsxFileName$12,
									lineNumber: 44,
									columnNumber: 273
								}, this)
							}, void 0, false, {
								fileName: _jsxFileName$12,
								lineNumber: 44,
								columnNumber: 157
							}, this)]
						}, void 0, true, {
							fileName: _jsxFileName$12,
							lineNumber: 44,
							columnNumber: 69
						}, this),
						/* @__PURE__ */ jsxDEV("label", { children: ["Nom", /* @__PURE__ */ jsxDEV(PresetInput, {
							label: "Nom du préréglage",
							value: slot.label ?? "",
							placeholder: labels[slot.tool],
							maxLength: 80,
							disabled: !preferences.ready,
							normalize: (raw) => raw.trim(),
							onCommit: (label) => preferences.change({
								type: "rename",
								id: slot.id,
								label: label || void 0
							}, target)
						}, `${preferences.scopeKey}:${target}:${slot.id}:name`, false, {
							fileName: _jsxFileName$12,
							lineNumber: 45,
							columnNumber: 12
						}, this)] }, void 0, true, {
							fileName: _jsxFileName$12,
							lineNumber: 45,
							columnNumber: 2
						}, this),
						/* @__PURE__ */ jsxDEV("div", {
							className: "paper-preset-fields",
							children: [
								/* @__PURE__ */ jsxDEV("label", { children: ["Couleur", /* @__PURE__ */ jsxDEV("input", {
									type: "color",
									"aria-label": "Couleur du préréglage",
									value: slot.preset.color,
									disabled: !preferences.ready,
									onChange: (e) => void preferences.change({
										type: "patch-preset",
										id: slot.id,
										patch: { color: e.target.value }
									}, target)
								}, void 0, false, {
									fileName: _jsxFileName$12,
									lineNumber: 46,
									columnNumber: 53
								}, this)] }, void 0, true, {
									fileName: _jsxFileName$12,
									lineNumber: 46,
									columnNumber: 39
								}, this),
								/* @__PURE__ */ jsxDEV("label", { children: ["Épaisseur", /* @__PURE__ */ jsxDEV(PresetInput, {
									type: "number",
									label: "Épaisseur du préréglage",
									min: .1,
									max: 64,
									step: .1,
									value: String(slot.preset.width),
									disabled: !preferences.ready,
									normalize: (raw) => {
										const value = Number(raw);
										return raw.trim() && Number.isFinite(value) && value >= .1 && value <= 64 ? String(value) : null;
									},
									onCommit: (value) => preferences.change({
										type: "patch-preset",
										id: slot.id,
										patch: { width: Number(value) }
									}, target)
								}, `${preferences.scopeKey}:${target}:${slot.id}:width`, false, {
									fileName: _jsxFileName$12,
									lineNumber: 46,
									columnNumber: 297
								}, this)] }, void 0, true, {
									fileName: _jsxFileName$12,
									lineNumber: 46,
									columnNumber: 281
								}, this),
								/* @__PURE__ */ jsxDEV("label", { children: ["Opacité", /* @__PURE__ */ jsxDEV(PresetInput, {
									type: "number",
									label: "Opacité du préréglage",
									min: 0,
									max: 100,
									step: 5,
									value: String(Math.round(slot.preset.opacity * 100)),
									disabled: !preferences.ready,
									normalize: (raw) => {
										const value = Number(raw);
										return raw.trim() && Number.isFinite(value) && value >= 0 && value <= 100 ? String(value) : null;
									},
									onCommit: (value) => preferences.change({
										type: "patch-preset",
										id: slot.id,
										patch: { opacity: Number(value) / 100 }
									}, target)
								}, `${preferences.scopeKey}:${target}:${slot.id}:opacity`, false, {
									fileName: _jsxFileName$12,
									lineNumber: 46,
									columnNumber: 765
								}, this)] }, void 0, true, {
									fileName: _jsxFileName$12,
									lineNumber: 46,
									columnNumber: 751
								}, this)
							]
						}, void 0, true, {
							fileName: _jsxFileName$12,
							lineNumber: 46,
							columnNumber: 2
						}, this),
						[
							"pen",
							"pencil",
							"calligraphy",
							"highlighter"
						].includes(slot.tool) && /* @__PURE__ */ jsxDEV("label", { children: ["Style du trait", /* @__PURE__ */ jsxDEV("select", {
							"aria-label": "Style du préréglage",
							value: slot.preset.strokeStyle ?? "solid",
							disabled: busy,
							onChange: (e) => void preferences.change({
								type: "patch-preset",
								id: slot.id,
								patch: { strokeStyle: e.target.value }
							}, target),
							children: [
								/* @__PURE__ */ jsxDEV("option", {
									value: "solid",
									children: "Continu"
								}, void 0, false, {
									fileName: _jsxFileName$12,
									lineNumber: 47,
									columnNumber: 331
								}, this),
								/* @__PURE__ */ jsxDEV("option", {
									value: "dashed",
									children: "Tirets"
								}, void 0, false, {
									fileName: _jsxFileName$12,
									lineNumber: 47,
									columnNumber: 369
								}, this),
								/* @__PURE__ */ jsxDEV("option", {
									value: "dotted",
									children: "Pointillés"
								}, void 0, false, {
									fileName: _jsxFileName$12,
									lineNumber: 47,
									columnNumber: 407
								}, this)
							]
						}, void 0, true, {
							fileName: _jsxFileName$12,
							lineNumber: 47,
							columnNumber: 90
						}, this)] }, void 0, true, {
							fileName: _jsxFileName$12,
							lineNumber: 47,
							columnNumber: 69
						}, this),
						slot.tool === "eraser" && /* @__PURE__ */ jsxDEV("label", {
							className: "paper-settings-check",
							children: [/* @__PURE__ */ jsxDEV("input", {
								type: "checkbox",
								"aria-label": "Gomme par trait entier",
								checked: slot.preset.wholeEraser,
								disabled: busy,
								onChange: (e) => void preferences.change({
									type: "patch-preset",
									id: slot.id,
									patch: { wholeEraser: e.target.checked }
								}, target)
							}, void 0, false, {
								fileName: _jsxFileName$12,
								lineNumber: 48,
								columnNumber: 65
							}, this), "Effacer le trait entier"]
						}, void 0, true, {
							fileName: _jsxFileName$12,
							lineNumber: 48,
							columnNumber: 25
						}, this)
					]
				}, void 0, true, {
					fileName: _jsxFileName$12,
					lineNumber: 44,
					columnNumber: 9
				}, this),
				/* @__PURE__ */ jsxDEV("label", {
					className: "paper-settings-check",
					children: [/* @__PURE__ */ jsxDEV("input", {
						type: "checkbox",
						"aria-label": "Revenir au stylo après la gomme",
						checked: config.returnToPen === true,
						disabled: busy,
						onChange: (e) => void preferences.change({
							type: "set-input",
							returnToPen: e.target.checked
						}, target)
					}, void 0, false, {
						fileName: _jsxFileName$12,
						lineNumber: 49,
						columnNumber: 42
					}, this), "Revenir au dernier stylo après la gomme"]
				}, void 0, true, {
					fileName: _jsxFileName$12,
					lineNumber: 49,
					columnNumber: 2
				}, this),
				/* @__PURE__ */ jsxDEV("section", { children: [
					/* @__PURE__ */ jsxDEV("div", {
						className: "paper-settings-section-title",
						children: [/* @__PURE__ */ jsxDEV("h3", { children: "Votre palette" }, void 0, false, {
							fileName: _jsxFileName$12,
							lineNumber: 50,
							columnNumber: 57
						}, this), /* @__PURE__ */ jsxDEV("button", {
							disabled: busy,
							onClick: () => reset("palette"),
							"aria-label": "Réinitialiser la palette",
							children: /* @__PURE__ */ jsxDEV(RotateCcw, {}, void 0, false, {
								fileName: _jsxFileName$12,
								lineNumber: 50,
								columnNumber: 172
							}, this)
						}, void 0, false, {
							fileName: _jsxFileName$12,
							lineNumber: 50,
							columnNumber: 79
						}, this)]
					}, void 0, true, {
						fileName: _jsxFileName$12,
						lineNumber: 50,
						columnNumber: 11
					}, this),
					/* @__PURE__ */ jsxDEV("div", {
						className: "paper-settings-palette",
						children: config.palette.map((color) => /* @__PURE__ */ jsxDEV("div", { children: [/* @__PURE__ */ jsxDEV("button", {
							className: "paper-color-swatch",
							"aria-label": `Choisir la couleur ${color}`,
							title: color,
							style: { background: color },
							disabled: busy || !slot,
							onClick: () => {
								if (slot) preferences.change({
									type: "patch-preset",
									id: slot.id,
									patch: { color }
								}, target);
							}
						}, void 0, false, {
							fileName: _jsxFileName$12,
							lineNumber: 50,
							columnNumber: 283
						}, this), /* @__PURE__ */ jsxDEV("button", {
							className: "paper-palette-remove",
							"aria-label": `Retirer la couleur ${color}`,
							disabled: busy,
							onClick: () => void preferences.change({
								type: "palette-remove",
								color
							}, target),
							children: /* @__PURE__ */ jsxDEV(X, {}, void 0, false, {
								fileName: _jsxFileName$12,
								lineNumber: 50,
								columnNumber: 709
							}, this)
						}, void 0, false, {
							fileName: _jsxFileName$12,
							lineNumber: 50,
							columnNumber: 533
						}, this)] }, color, true, {
							fileName: _jsxFileName$12,
							lineNumber: 50,
							columnNumber: 266
						}, this))
					}, void 0, false, {
						fileName: _jsxFileName$12,
						lineNumber: 50,
						columnNumber: 199
					}, this),
					/* @__PURE__ */ jsxDEV("div", {
						className: "paper-palette-add",
						children: [
							/* @__PURE__ */ jsxDEV("input", {
								type: "color",
								"aria-label": "Nouvelle couleur",
								value: normalizePaperToolColor(paletteColor) ?? "#2855ce",
								onChange: (e) => setPaletteColor(e.target.value)
							}, void 0, false, {
								fileName: _jsxFileName$12,
								lineNumber: 50,
								columnNumber: 771
							}, this),
							/* @__PURE__ */ jsxDEV("input", {
								type: "text",
								"aria-label": "Couleur HEX",
								value: paletteColor,
								maxLength: 7,
								onChange: (e) => setPaletteColor(e.target.value)
							}, void 0, false, {
								fileName: _jsxFileName$12,
								lineNumber: 50,
								columnNumber: 925
							}, this),
							/* @__PURE__ */ jsxDEV("button", {
								disabled: busy || !normalizePaperToolColor(paletteColor),
								onClick: () => void preferences.change({
									type: "palette-add",
									color: paletteColor
								}, target),
								children: [/* @__PURE__ */ jsxDEV(Plus, {}, void 0, false, {
									fileName: _jsxFileName$12,
									lineNumber: 50,
									columnNumber: 1201
								}, this), "Ajouter"]
							}, void 0, true, {
								fileName: _jsxFileName$12,
								lineNumber: 50,
								columnNumber: 1051
							}, this)
						]
					}, void 0, true, {
						fileName: _jsxFileName$12,
						lineNumber: 50,
						columnNumber: 736
					}, this)
				] }, void 0, true, {
					fileName: _jsxFileName$12,
					lineNumber: 50,
					columnNumber: 2
				}, this),
				/* @__PURE__ */ jsxDEV("section", { children: [
					/* @__PURE__ */ jsxDEV("div", {
						className: "paper-settings-section-title",
						children: [/* @__PURE__ */ jsxDEV("h3", { children: "Écriture et navigation" }, void 0, false, {
							fileName: _jsxFileName$12,
							lineNumber: 51,
							columnNumber: 57
						}, this), /* @__PURE__ */ jsxDEV("button", {
							disabled: busy,
							onClick: () => reset("input"),
							"aria-label": "Réinitialiser les préférences de geste",
							children: /* @__PURE__ */ jsxDEV(RotateCcw, {}, void 0, false, {
								fileName: _jsxFileName$12,
								lineNumber: 51,
								columnNumber: 193
							}, this)
						}, void 0, false, {
							fileName: _jsxFileName$12,
							lineNumber: 51,
							columnNumber: 88
						}, this)]
					}, void 0, true, {
						fileName: _jsxFileName$12,
						lineNumber: 51,
						columnNumber: 11
					}, this),
					/* @__PURE__ */ jsxDEV("label", { children: ["Main dominante", /* @__PURE__ */ jsxDEV("select", {
						"aria-label": "Main dominante",
						value: config.dominantHand,
						disabled: busy,
						onChange: (e) => void preferences.change({
							type: "set-input",
							dominantHand: e.target.value
						}, target),
						children: [/* @__PURE__ */ jsxDEV("option", {
							value: "right",
							children: "Droite"
						}, void 0, false, {
							fileName: _jsxFileName$12,
							lineNumber: 51,
							columnNumber: 432
						}, this), /* @__PURE__ */ jsxDEV("option", {
							value: "left",
							children: "Gauche"
						}, void 0, false, {
							fileName: _jsxFileName$12,
							lineNumber: 51,
							columnNumber: 469
						}, this)]
					}, void 0, true, {
						fileName: _jsxFileName$12,
						lineNumber: 51,
						columnNumber: 241
					}, this)] }, void 0, true, {
						fileName: _jsxFileName$12,
						lineNumber: 51,
						columnNumber: 220
					}, this),
					/* @__PURE__ */ jsxDEV("label", {
						className: "paper-settings-check",
						children: [/* @__PURE__ */ jsxDEV("input", {
							type: "checkbox",
							"aria-label": "Dessiner avec le doigt",
							checked: config.fingerInk,
							disabled: busy,
							onChange: (e) => void preferences.change({
								type: "set-input",
								fingerInk: e.target.checked
							}, target)
						}, void 0, false, {
							fileName: _jsxFileName$12,
							lineNumber: 51,
							columnNumber: 562
						}, this), "Dessiner avec le doigt"]
					}, void 0, true, {
						fileName: _jsxFileName$12,
						lineNumber: 51,
						columnNumber: 522
					}, this),
					/* @__PURE__ */ jsxDEV("p", {
						className: "paper-settings-help",
						children: "Le stylet écrit. Un doigt déplace la feuille ; deux doigts la déplacent ou la zooment. Si le dessin au doigt est activé, utilisez deux doigts pour naviguer."
					}, void 0, false, {
						fileName: _jsxFileName$12,
						lineNumber: 51,
						columnNumber: 787
					}, this)
				] }, void 0, true, {
					fileName: _jsxFileName$12,
					lineNumber: 51,
					columnNumber: 2
				}, this),
				/* @__PURE__ */ jsxDEV("footer", { children: [
					/* @__PURE__ */ jsxDEV("button", {
						disabled: busy,
						onClick: () => reset("all"),
						children: ["Réinitialiser ", target === "note" ? "cette note" : "les réglages globaux"]
					}, void 0, true, {
						fileName: _jsxFileName$12,
						lineNumber: 52,
						columnNumber: 10
					}, this),
					target === "note" && /* @__PURE__ */ jsxDEV("button", {
						disabled: busy,
						onClick: () => void preferences.clearNote(),
						children: "Utiliser tous les réglages globaux"
					}, void 0, false, {
						fileName: _jsxFileName$12,
						lineNumber: 52,
						columnNumber: 155
					}, this),
					/* @__PURE__ */ jsxDEV("span", {
						role: "status",
						children: preferences.notice || (preferences.saving ? "Enregistrement des réglages…" : "")
					}, void 0, false, {
						fileName: _jsxFileName$12,
						lineNumber: 52,
						columnNumber: 266
					}, this)
				] }, void 0, true, {
					fileName: _jsxFileName$12,
					lineNumber: 52,
					columnNumber: 2
				}, this)
			]
		}, void 0, true, {
			fileName: _jsxFileName$12,
			lineNumber: 33,
			columnNumber: 65
		}, this)] }, void 0, true, {
			fileName: _jsxFileName$12,
			lineNumber: 32,
			columnNumber: 192
		}, this)]
	}, void 0, true, {
		fileName: _jsxFileName$12,
		lineNumber: 32,
		columnNumber: 9
	}, this);
}
//#endregion
//#region src/lib/paperInkInput.ts
var intents = /* @__PURE__ */ new Set([
	"pen",
	"pencil",
	"calligraphy",
	"highlighter",
	"eraser",
	"lasso",
	"select",
	"laser"
]);
var finite$3 = (value) => typeof value === "number" && Number.isFinite(value);
var clamp$1 = (n, min, max) => Math.max(min, Math.min(max, n));
var matrixKeys = [
	"a",
	"b",
	"c",
	"d",
	"e",
	"f"
];
function validContext(context) {
	if (!context || typeof context.ownershipKey !== "string" || !context.ownershipKey || typeof context.pageId !== "string" || !context.pageId || !(typeof context.generation === "string" || finite$3(context.generation)) || !intents.has(context.intent) || ![context.pageWidth, context.pageHeight].every((n) => finite$3(n) && n > 0) || context.pageRotation !== void 0 && !finite$3(context.pageRotation)) return false;
	const rect = context.clientRect;
	if (!rect || ![
		rect.left,
		rect.top,
		rect.width,
		rect.height
	].every(finite$3) || rect.width <= 0 || rect.height <= 0) return false;
	const matrix = context.clientToPage;
	return !matrix || matrixKeys.every((key) => finite$3(matrix[key])) && Math.abs(matrix.a * matrix.d - matrix.b * matrix.c) > 1e-12;
}
var cloneContext = (context) => ({
	...context,
	clientRect: { ...context.clientRect },
	...context.clientToPage ? { clientToPage: { ...context.clientToPage } } : {}
});
function changedContext(captured, current) {
	if (captured.ownershipKey !== current.ownershipKey || captured.generation !== current.generation || captured.pageId !== current.pageId) return "owner-changed";
	if (captured.intent !== current.intent) return "tool-changed";
	if (captured.pageWidth !== current.pageWidth || captured.pageHeight !== current.pageHeight || (captured.pageRotation ?? 0) !== (current.pageRotation ?? 0)) return "geometry-changed";
	if ([
		"left",
		"top",
		"width",
		"height"
	].some((key) => Math.abs(captured.clientRect[key] - current.clientRect[key]) > .01)) return "geometry-changed";
	if (!!captured.clientToPage !== !!current.clientToPage) return "geometry-changed";
	if (captured.clientToPage && current.clientToPage && matrixKeys.some((key) => Math.abs(captured.clientToPage[key] - current.clientToPage[key]) > 1e-7)) return "geometry-changed";
}
function eraser(event) {
	return event.pointerType === "pen" && (event.button === 5 || finite$3(event.buttons) && (event.buttons & 32) !== 0);
}
function point(event, stroke) {
	if (!finite$3(event.clientX) || !finite$3(event.clientY) || !finite$3(event.timeStamp) || event.timeStamp < 0 || event.pointerId !== stroke.pointerId || event.pointerType !== stroke.pointerType) return;
	const { clientRect: rect, clientToPage: matrix, pageWidth, pageHeight } = stroke.context;
	const x = matrix ? matrix.a * event.clientX + matrix.c * event.clientY + matrix.e : (event.clientX - rect.left) / rect.width * pageWidth;
	const y = matrix ? matrix.b * event.clientX + matrix.d * event.clientY + matrix.f : (event.clientY - rect.top) / rect.height * pageHeight;
	if (!finite$3(x) || !finite$3(y)) return;
	const p = {
		x,
		y,
		time: event.timeStamp
	};
	if (stroke.pointerType === "pen") {
		if (finite$3(event.pressure)) p.pressure = clamp$1(event.pressure, 0, 1);
		if (finite$3(event.tiltX)) p.tiltX = clamp$1(event.tiltX, -90, 90);
		if (finite$3(event.tiltY)) p.tiltY = clamp$1(event.tiltY, -90, 90);
		if (finite$3(event.twist)) p.twist = clamp$1(event.twist, 0, 359);
	}
	return p;
}
function equalPoint(a, b) {
	return a.x === b.x && a.y === b.y && a.time === b.time && a.pressure === b.pressure && a.tiltX === b.tiltX && a.tiltY === b.tiltY && a.twist === b.twist;
}
var cloneStroke = (stroke) => ({
	...stroke,
	context: cloneContext(stroke.context),
	points: stroke.points.map((p) => ({ ...p }))
});
var ignored = (reason) => ({
	status: "ignored",
	accepted: false,
	added: 0,
	reason
});
/** Stateful capture, independent of DOM/React. snapshot() copies only on RAF. */
function createPaperInkInput() {
	let active = null, lastPenTime = -Infinity, maxPoints = 25e4;
	const observePen = (event) => {
		if (event.pointerType === "pen" && finite$3(event.timeStamp) && event.timeStamp >= 0) lastPenTime = Math.max(lastPenTime, event.timeStamp);
	};
	const cancel = (reason = "cancelled") => {
		if (!active) return ignored("no-active-stroke");
		const stroke = cloneStroke(active);
		active = null;
		return {
			status: "cancelled",
			accepted: false,
			added: 0,
			reason,
			pointerId: stroke.pointerId,
			intent: stroke.intent,
			stroke
		};
	};
	const inspect = (event, context) => {
		if (!active) return ignored("no-active-stroke");
		if (event.pointerId !== active.pointerId) return ignored("other-pointer");
		if (!validContext(context)) return cancel("invalid-context");
		const changed = changedContext(active.context, context);
		if (changed) return cancel(changed);
		if (event.pointerType !== active.pointerType) return cancel("invalid-pointer");
	};
	const append = (event, context, coalesced = []) => {
		observePen(event);
		const invalid = inspect(event, context);
		if (invalid) return invalid;
		const stroke = active;
		if (event.pointerType === "pen" && finite$3(event.buttons) && event.buttons !== 0 && eraser(event) !== stroke.eraserButton) return cancel("buttons-changed");
		let added = 0;
		if (coalesced.length > 25e4) return cancel("point-limit");
		const valid = (coalesced.length ? coalesced : [event]).map((sample) => point(sample, stroke)).filter((p) => !!p && p.time <= event.timeStamp).sort((a, b) => a.time - b.time);
		for (const p of valid) {
			const previous = stroke.points[stroke.points.length - 1];
			if (previous && (p.time < previous.time || equalPoint(p, previous))) continue;
			if (stroke.points.length >= maxPoints) return cancel("point-limit");
			stroke.points.push(p);
			added++;
		}
		return {
			status: "updated",
			accepted: true,
			added,
			pointerId: stroke.pointerId,
			intent: stroke.intent
		};
	};
	return {
		begin(event, context, policy = {}) {
			observePen(event);
			if (policy.enabled === false) return ignored("disabled");
			if (!validContext(context)) return ignored("invalid-context");
			if (!Number.isSafeInteger(event.pointerId) || event.pointerId < 0 || ![
				"mouse",
				"pen",
				"touch"
			].includes(event.pointerType)) return ignored("invalid-pointer");
			if (active) {
				if (event.pointerId === active.pointerId) return ignored("already-active");
				if (active.pointerType === "touch" && event.pointerType === "touch") return cancel("multitouch");
				return ignored(active.pointerType === "pen" && event.pointerType === "touch" ? "palm" : "other-pointer");
			}
			if (event.isPrimary === false) return ignored("non-primary");
			if (event.pointerType === "touch") {
				if (!policy.fingerInk) return ignored("navigation");
				if (event.isPrimary !== true) return ignored("non-primary");
				const delay = finite$3(policy.penTouchDelay) ? clamp$1(policy.penTouchDelay, 0, 1e4) : 800, palm = finite$3(policy.palmSize) ? clamp$1(policy.palmSize, 1, 200) : 28;
				if (event.timeStamp - lastPenTime < delay || finite$3(event.width) && event.width > palm || finite$3(event.height) && event.height > palm) return ignored("palm");
			}
			const eraserButton = eraser(event);
			if (!eraserButton && (event.button !== void 0 && event.button !== 0 || finite$3(event.buttons) && event.buttons !== 1)) return ignored("buttons-changed");
			const candidate = {
				pointerId: event.pointerId,
				pointerType: event.pointerType,
				intent: eraserButton ? "eraser" : context.intent,
				context: cloneContext(context),
				points: [],
				eraserButton
			};
			const first = point(event, candidate);
			if (!first) return ignored("invalid-sample");
			candidate.points.push(first);
			active = candidate;
			maxPoints = finite$3(policy.maxPoints) ? Math.floor(clamp$1(policy.maxPoints, 1, 25e4)) : 25e4;
			return {
				status: "started",
				accepted: true,
				added: 1,
				pointerId: candidate.pointerId,
				intent: candidate.intent,
				stroke: cloneStroke(candidate)
			};
		},
		append,
		finish(event, context, wasCancelled = false) {
			observePen(event);
			const invalid = inspect(event, context);
			if (invalid) return invalid;
			if (wasCancelled) return cancel("cancelled");
			const result = append(event, context);
			if (result.status === "cancelled" || result.status === "ignored") return result;
			const stroke = cloneStroke(active);
			active = null;
			return {
				status: "finished",
				accepted: true,
				added: result.added,
				pointerId: stroke.pointerId,
				intent: stroke.intent,
				stroke
			};
		},
		cancel,
		snapshot() {
			return active ? cloneStroke(active) : null;
		}
	};
}
//#endregion
//#region src/lib/paperViewportGesture.ts
var finite$2 = (value) => typeof value === "number" && Number.isFinite(value);
var validPoint = (event) => event.pointerType === "touch" && Number.isSafeInteger(event.pointerId) && finite$2(event.clientX) && finite$2(event.clientY) && finite$2(event.timeStamp);
function createPaperViewportGesture() {
	const points = /* @__PURE__ */ new Map();
	let owner = "", pageId = "", finger = false, taken = false, base = null, center = {
		x: 0,
		y: 0
	}, distance = 0, penUntil = -Infinity;
	const observePen = (time) => {
		if (finite$2(time)) penUntil = Math.max(penUntil, time + 800);
	};
	const reset = () => {
		points.clear();
		base = null;
		taken = false;
	};
	const geometry = () => {
		const p = [...points.values()];
		return {
			center: {
				x: p.reduce((s, v) => s + v.x, 0) / p.length,
				y: p.reduce((s, v) => s + v.y, 0) / p.length
			},
			distance: p.length > 1 ? Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) : 0
		};
	};
	const matches = (context) => context.owner === owner && context.pageId === pageId && context.fingerInk === finger;
	const capture = (context) => {
		base = { ...context };
		const g = geometry();
		center = g.center;
		distance = g.distance;
	};
	const action = (start = false) => {
		const g = geometry();
		if (points.size > 1) return {
			mode: "pinch",
			handled: true,
			start,
			center: g.center,
			zoom: Math.max(.3, Math.min(2, base.zoom * (distance > 1 ? g.distance / distance : 1)))
		};
		if (taken || !finger) return {
			mode: "pan",
			handled: true,
			start,
			scrollLeft: Math.max(0, base.scrollLeft - (g.center.x - center.x)),
			scrollTop: Math.max(0, base.scrollTop - (g.center.y - center.y))
		};
		return {
			mode: "pending",
			handled: false
		};
	};
	return {
		observePen,
		begin(event, context, penActive = false) {
			if (!validPoint(event)) return {
				mode: "ignored",
				handled: false
			};
			if (penActive || event.timeStamp < penUntil || (event.width ?? 0) > 28 || (event.height ?? 0) > 28) return {
				mode: "ignored",
				handled: false,
				reason: "palm"
			};
			if (!finite$2(context.zoom) || context.zoom <= 0 || !finite$2(context.scrollLeft) || !finite$2(context.scrollTop)) return {
				mode: "ignored",
				handled: false
			};
			if (points.size && !matches(context)) {
				reset();
				return {
					mode: "cancelled",
					handled: true,
					reason: "owner-changed"
				};
			}
			if (points.has(event.pointerId) || points.size >= 2) return {
				mode: "ignored",
				handled: false
			};
			if (!points.size) {
				owner = context.owner;
				pageId = context.pageId;
				finger = context.fingerInk;
			}
			points.set(event.pointerId, {
				x: event.clientX,
				y: event.clientY
			});
			if (points.size === 2) taken = true;
			capture(context);
			return action(true);
		},
		move(event, context) {
			if (!points.has(event.pointerId) || !validPoint(event)) return {
				mode: "ignored",
				handled: false
			};
			if (!matches(context)) {
				reset();
				return {
					mode: "cancelled",
					handled: true,
					reason: "owner-changed"
				};
			}
			points.set(event.pointerId, {
				x: event.clientX,
				y: event.clientY
			});
			return action();
		},
		end(event, context, cancelled = false) {
			if (!points.has(event.pointerId)) return {
				mode: "ignored",
				handled: false
			};
			const handled = taken || !finger;
			if (cancelled || !matches(context)) {
				reset();
				return {
					mode: "cancelled",
					handled,
					reason: cancelled ? "cancelled" : "owner-changed"
				};
			}
			points.delete(event.pointerId);
			if (!points.size) {
				reset();
				return {
					mode: "ended",
					handled
				};
			}
			capture(context);
			return action(true);
		},
		cancel: reset,
		has: (id) => points.has(id),
		active: () => points.size > 0 && (taken || !finger)
	};
}
//#endregion
//#region src/components/PaperInkPreview.tsx
var _jsxFileName$11 = "/home/louis/DowzeBuild/20260923/collections-060/src/components/PaperInkPreview.tsx";
/** Only this small SVG subtree renders on a preview frame, never the notebook/document. */
var PaperInkPreview = forwardRef(function PaperInkPreview(_, ref) {
	const [preview, setPreview] = useState(null);
	useImperativeHandle(ref, () => ({ paint: (stroke, style) => setPreview({
		stroke,
		style
	}) }), []);
	const stroke = preview?.stroke, style = preview?.style;
	if (!stroke?.points.length || !style) return null;
	if (stroke.intent === "laser") {
		const last = stroke.points.at(-1);
		return /* @__PURE__ */ jsxDEV("circle", {
			cx: last.x,
			cy: last.y,
			r: 8,
			fill: "#ef476f",
			opacity: .7
		}, void 0, false, {
			fileName: _jsxFileName$11,
			lineNumber: 12,
			columnNumber: 70
		}, this);
	}
	if (stroke.intent === "lasso" || stroke.intent === "eraser") return /* @__PURE__ */ jsxDEV("path", {
		d: `M${stroke.points.map((p) => `${p.x} ${p.y}`).join("L")}`,
		fill: "none",
		stroke: stroke.intent === "eraser" ? "#b6bdcc" : "#4461dc",
		strokeWidth: stroke.intent === "eraser" ? style.width * 6 : 1.5,
		opacity: .5,
		strokeDasharray: stroke.intent === "lasso" ? "5 4" : void 0
	}, void 0, false, {
		fileName: _jsxFileName$11,
		lineNumber: 13,
		columnNumber: 62
	}, this);
	if (![
		"pen",
		"pencil",
		"calligraphy",
		"highlighter"
	].includes(stroke.intent)) return null;
	return /* @__PURE__ */ jsxDEV(PaperInkVisual, { object: {
		id: "live-stroke",
		pageId: stroke.context.pageId,
		kind: "ink",
		x: 0,
		y: 0,
		width: stroke.context.pageWidth,
		height: stroke.context.pageHeight,
		rotation: 0,
		z: 0,
		locked: false,
		createdAt: 0,
		points: stroke.points,
		color: style.color,
		strokeWidth: style.width,
		opacity: style.opacity,
		strokeStyle: style.strokeStyle,
		pen: stroke.intent
	} }, void 0, false, {
		fileName: _jsxFileName$11,
		lineNumber: 15,
		columnNumber: 9
	}, this);
});
//#endregion
//#region src/lib/paperWritingLoupe.ts
var finite$1 = (value) => typeof value === "number" && Number.isFinite(value);
var clamp = (value, low, high) => Math.max(low, Math.min(high, value));
var number = (value, fallback, low, high) => clamp(finite$1(value) ? value : fallback, low, high);
function assertPage(page) {
	if (!finite$1(page.width) || !finite$1(page.height) || page.width <= 0 || page.height <= 0) throw Error("La page de la loupe est invalide.");
}
function paperWritingLoupeOptions(page, options = {}) {
	assertPage(page);
	return {
		autoAdvance: options.autoAdvance ?? true,
		autoReturn: options.autoReturn ?? true,
		advanceAt: number(options.advanceAt, .72, .3, .95),
		overlap: number(options.overlap, .2, 0, .6),
		lineHeight: number(options.lineHeight, page.spacing ?? 28, 8, 100),
		leftMargin: number(options.leftMargin, 48, 0, page.width * .4),
		rightMargin: number(options.rightMargin, 48, 0, page.width * .4),
		topMargin: number(options.topMargin, 48, 0, page.height * .4),
		bottomMargin: number(options.bottomMargin, 48, 0, page.height * .4)
	};
}
/** Regions alone are bounded. Captured ink samples are never clamped or rescaled after capture. */
function boundPaperWritingLoupeRegion(page, region) {
	assertPage(page);
	const width = number(region.width, Math.min(240, page.width), 1, page.width), height = number(region.height, Math.min(64, page.height), 1, page.height);
	return {
		x: number(region.x, 0, 0, page.width - width),
		y: number(region.y, 0, 0, page.height - height),
		width,
		height,
		zoom: number(region.zoom, 3, 1, 6)
	};
}
function createPaperWritingLoupeRegion(page, viewport, zoom = 3, anchor, options = {}) {
	const configuration = paperWritingLoupeOptions(page, options), scale = number(zoom, 3, 1, 6), width = number(viewport.width, 600, 1, 1e4) / scale, height = number(viewport.height, 180, 1, 1e4) / scale;
	return boundPaperWritingLoupeRegion(page, {
		x: anchor ? anchor.x - width / 2 : configuration.leftMargin,
		y: anchor ? anchor.y - height / 2 : configuration.topMargin,
		width,
		height,
		zoom: scale
	});
}
function movePaperWritingLoupeRegion(page, region, dx, dy) {
	return boundPaperWritingLoupeRegion(page, {
		...region,
		x: region.x + (finite$1(dx) ? dx : 0),
		y: region.y + (finite$1(dy) ? dy : 0)
	});
}
function samePaperWritingLoupeOwner(captured, current) {
	return !!current && !current.tombstoned && !captured.tombstoned && current.ownershipKey === captured.ownershipKey && current.generation === captured.generation && current.pageId === captured.pageId && current.pageWidth === captured.pageWidth && current.pageHeight === captured.pageHeight && (current.pageRotation ?? 0) === (captured.pageRotation ?? 0);
}
function paperWritingLoupeContext(owner, region, clientRect, intent) {
	if (owner.tombstoned || !owner.ownershipKey || !owner.pageId || !finite$1(owner.pageWidth) || !finite$1(owner.pageHeight) || owner.pageWidth <= 0 || owner.pageHeight <= 0 || ![
		clientRect.left,
		clientRect.top,
		clientRect.width,
		clientRect.height,
		region.x,
		region.y,
		region.width,
		region.height
	].every(finite$1) || clientRect.width <= 0 || clientRect.height <= 0 || region.width <= 0 || region.height <= 0) return null;
	const a = region.width / clientRect.width, d = region.height / clientRect.height;
	return {
		...owner,
		clientRect: { ...clientRect },
		intent,
		clientToPage: {
			a,
			b: 0,
			c: 0,
			d,
			e: region.x - clientRect.left * a,
			f: region.y - clientRect.top * d
		}
	};
}
function nextPaperWritingLoupeLine(page, region, options = {}) {
	const configuration = paperWritingLoupeOptions(page, options), current = boundPaperWritingLoupeRegion(page, region), bottom = Math.max(0, page.height - configuration.bottomMargin - current.height);
	if (current.y + configuration.lineHeight > bottom + .001) return {
		region: current,
		moved: false,
		lineReturned: false,
		pageEnd: true
	};
	const next = boundPaperWritingLoupeRegion(page, {
		...current,
		x: configuration.leftMargin,
		y: current.y + configuration.lineHeight
	});
	return {
		region: next,
		moved: next.x !== current.x || next.y !== current.y,
		lineReturned: true,
		pageEnd: false
	};
}
function advancePaperWritingLoupe(page, region, points, options = {}) {
	const configuration = paperWritingLoupeOptions(page, options), current = boundPaperWritingLoupeRegion(page, region), unchanged = {
		region: current,
		moved: false,
		lineReturned: false,
		pageEnd: false
	};
	if (!configuration.autoAdvance || !points.length) return unchanged;
	const right = points.reduce((max, p) => finite$1(p.x) ? Math.max(max, p.x) : max, -Infinity), edge = Math.max(configuration.leftMargin, page.width - configuration.rightMargin);
	if (right < Math.min(current.x + current.width * configuration.advanceAt, edge - current.width * (1 - configuration.advanceAt))) return unchanged;
	if (current.x + current.width >= edge - .001) return configuration.autoReturn ? nextPaperWritingLoupeLine(page, current, configuration) : unchanged;
	const next = boundPaperWritingLoupeRegion(page, {
		...current,
		x: Math.min(Math.max(current.x, edge - current.width), Math.max(current.x + current.width * (1 - configuration.overlap), right - current.width * configuration.overlap))
	});
	return {
		...unchanged,
		region: next,
		moved: next.x !== current.x
	};
}
/** The same input engine as the page. The loupe adds only its inverse viewport transform. */
function createPaperWritingLoupeInput() {
	const ink = createPaperInkInput();
	let captured = null;
	const context = (owner, region, rect, intent) => owner ? paperWritingLoupeContext(owner, region, rect, intent) : null;
	const invalid = (owner) => captured && !samePaperWritingLoupeOwner(captured, owner);
	const cancel = (reason = "cancelled") => {
		captured = null;
		return ink.cancel(reason);
	};
	return {
		begin(event, owner, region, rect, intent, policy = {}) {
			if (invalid(owner)) return cancel("owner-changed");
			const value = context(owner, region, rect, intent);
			if (!value) return {
				status: "ignored",
				accepted: false,
				added: 0,
				reason: "invalid-context"
			};
			const result = ink.begin(event, value, policy);
			if (result.status === "cancelled") captured = null;
			else if (result.accepted && result.stroke) captured = { ...owner };
			return result;
		},
		append(event, owner, region, rect, intent, coalesced = []) {
			if (invalid(owner)) return cancel("owner-changed");
			const value = context(owner, region, rect, intent);
			if (!value) return cancel("invalid-context");
			const result = ink.append(event, value, coalesced);
			if (result.status === "cancelled") captured = null;
			return result;
		},
		finish(event, owner, region, rect, intent, wasCancelled = false) {
			if (invalid(owner)) return cancel("owner-changed");
			const value = context(owner, region, rect, intent);
			if (!value) return cancel("invalid-context");
			const result = ink.finish(event, value, wasCancelled);
			if (result.status !== "ignored") captured = null;
			return result;
		},
		cancel,
		snapshot: ink.snapshot
	};
}
//#endregion
//#region src/components/PaperWritingLoupe.tsx
var _jsxFileName$10 = "/home/louis/DowzeBuild/20260923/collections-060/src/components/PaperWritingLoupe.tsx";
var PaperPdfPage$2 = lazy(() => Promise.resolve().then(() => PaperPdfPage_exports).then((module) => ({ default: module.PaperPdfPage })));
/** Place inside the original page SVG. It identifies the same canonical page coordinates. */
function PaperWritingLoupeTarget({ region }) {
	return /* @__PURE__ */ jsxDEV("g", {
		className: "paper-writing-loupe-target",
		pointerEvents: "none",
		"aria-hidden": "true",
		children: [/* @__PURE__ */ jsxDEV("rect", {
			x: region.x,
			y: region.y,
			width: region.width,
			height: region.height,
			rx: 2,
			fill: "#4461dc",
			fillOpacity: .06,
			stroke: "#4461dc",
			strokeWidth: 1.5,
			vectorEffect: "non-scaling-stroke"
		}, void 0, false, {
			fileName: _jsxFileName$10,
			lineNumber: 33,
			columnNumber: 91
		}, this), /* @__PURE__ */ jsxDEV("path", {
			d: `M${region.x} ${region.y + region.height * .72}h${region.width}`,
			stroke: "#4461dc",
			strokeOpacity: .35,
			strokeDasharray: "4 4",
			vectorEffect: "non-scaling-stroke"
		}, void 0, false, {
			fileName: _jsxFileName$10,
			lineNumber: 33,
			columnNumber: 277
		}, this)]
	}, void 0, true, {
		fileName: _jsxFileName$10,
		lineNumber: 33,
		columnNumber: 9
	}, this);
}
function PageProjection({ document, page, media, region, width, height }) {
	const objects = useMemo(() => paperObjectsOnPage(document, page.id), [document, page.id]), pdf = page.pdf ? document.assets.find((asset) => asset.id === page.pdf.assetId) : void 0;
	const scaleX = width / region.width, scaleY = height / region.height;
	return /* @__PURE__ */ jsxDEV("div", {
		"aria-hidden": "true",
		inert: true,
		className: "paper-writing-loupe-projection",
		style: {
			width: page.width,
			height: page.height,
			background: page.color,
			transform: `translate(${-region.x * scaleX}px, ${-region.y * scaleY}px) scale(${scaleX}, ${scaleY})`
		},
		children: [
			/* @__PURE__ */ jsxDEV(PaperBackground, { page }, void 0, false, {
				fileName: _jsxFileName$10,
				lineNumber: 39,
				columnNumber: 3
			}, this),
			pdf && /* @__PURE__ */ jsxDEV(Suspense, {
				fallback: null,
				children: /* @__PURE__ */ jsxDEV(PaperPdfPage$2, {
					page,
					asset: pdf,
					media,
					pixelWidth: Math.min(1200, page.width * scaleX)
				}, void 0, false, {
					fileName: _jsxFileName$10,
					lineNumber: 39,
					columnNumber: 65
				}, this)
			}, void 0, false, {
				fileName: _jsxFileName$10,
				lineNumber: 39,
				columnNumber: 39
			}, this),
			objects.map((object) => /* @__PURE__ */ jsxDEV("div", {
				className: `paper-object paper-${object.kind}`,
				"data-loupe-object": object.id,
				style: {
					position: "absolute",
					left: object.x,
					top: object.y,
					width: object.width,
					height: object.height,
					transform: paperObjectCssTransform(object),
					transformOrigin: `${object.width / 2}px ${object.height / 2}px`,
					zIndex: object.z,
					background: object.kind === "sticky" ? object.color : void 0,
					overflow: object.kind === "text" ? "hidden" : void 0
				},
				children: object.kind === "text" ? /* @__PURE__ */ jsxDEV(PaperTextFlowView, {
					object,
					document,
					media,
					pageId: page.id
				}, void 0, false, {
					fileName: _jsxFileName$10,
					lineNumber: 40,
					columnNumber: 465
				}, this) : /* @__PURE__ */ jsxDEV(PaperObjectVisual, {
					object,
					document,
					media
				}, void 0, false, {
					fileName: _jsxFileName$10,
					lineNumber: 40,
					columnNumber: 553
				}, this)
			}, object.id, false, {
				fileName: _jsxFileName$10,
				lineNumber: 40,
				columnNumber: 24
			}, this))
		]
	}, void 0, true, {
		fileName: _jsxFileName$10,
		lineNumber: 38,
		columnNumber: 9
	}, this);
}
var inkTools$1 = /* @__PURE__ */ new Set([
	"pen",
	"pencil",
	"calligraphy",
	"highlighter",
	"eraser",
	"lasso",
	"laser"
]);
/** A viewport over the actual document. It owns no notebook storage or undo history. */
var PaperWritingLoupe = forwardRef(function PaperWritingLoupe(props, ref) {
	const { document, page, media, ownershipKey, generation, tool, style, fingerInk = false, disabled = false } = props;
	const scope = JSON.stringify([
		ownershipKey,
		generation,
		page.id,
		page.width,
		page.height,
		page.rotation
	]);
	const renderedOwner = {
		ownershipKey,
		generation,
		pageId: page.id,
		pageWidth: page.width,
		pageHeight: page.height,
		pageRotation: page.rotation
	};
	const latest = useRef(props);
	latest.current = props;
	const helpId = "paper-writing-loupe-help-" + useId().replace(/[^\w-]/g, ""), mounted = useRef(true), panel = useRef(null), stage = useRef(null), surface = useRef(null), preview = useRef(null), engine = useRef(createPaperWritingLoupeInput()), raf = useRef(0), viewEpoch = useRef(0), measured = useRef(false);
	const [viewport, setViewport] = useState({
		width: 600,
		height: 180
	}), [region, setRegion] = useState(() => createPaperWritingLoupeRegion(page, {
		width: 600,
		height: 180
	}, props.initialZoom)), [configuration, setConfiguration] = useState(() => paperWritingLoupeOptions(page, props.options)), [notice, setNotice] = useState(""), [writing, setWriting] = useState(false);
	const regionRef = useRef(region);
	regionRef.current = region;
	const configurationRef = useRef(configuration);
	configurationRef.current = configuration;
	const capture = useRef(null), queuedAdvance = useRef(null);
	const notifyPreview = (stroke, capturedStyle = latest.current.style) => {
		preview.current?.paint(stroke, capturedStyle);
		latest.current.onPreview?.(stroke, capturedStyle);
	};
	const clear = (cancelled = true) => {
		cancelAnimationFrame(raf.current);
		raf.current = 0;
		const held = capture.current;
		capture.current = null;
		engine.current.cancel();
		setWriting(false);
		if (cancelled && held) latest.current.onInputCancel?.();
		notifyPreview(null, held?.style);
	};
	const live = (owner = renderedOwner) => mounted.current && !latest.current.disabled && samePaperWritingLoupeOwner(owner, latest.current.currentOwner());
	const close = () => {
		if (!mounted.current || !samePaperWritingLoupeOwner(renderedOwner, latest.current.currentOwner())) return;
		clear();
		latest.current.onClose();
	};
	const replaceRegion = (next) => {
		if (engine.current.snapshot()) return;
		viewEpoch.current++;
		queuedAdvance.current = null;
		regionRef.current = next;
		setRegion(next);
		setNotice("");
	};
	const advance = () => {
		const queued = queuedAdvance.current;
		if (!queued || engine.current.snapshot()) return;
		queuedAdvance.current = null;
		if (!live(queued.owner) || queued.scope !== scope) return;
		const next = advancePaperWritingLoupe(page, regionRef.current, queued.points, configurationRef.current);
		if (next.moved) {
			regionRef.current = next.region;
			setRegion(next.region);
		}
		if (next.pageEnd) setNotice("Fin de page. Choisissez une autre zone ou une autre page pour poursuivre.");
	};
	useImperativeHandle(ref, () => ({
		reposition: (x, y) => {
			if (!live() || engine.current.snapshot()) return;
			replaceRegion(boundPaperWritingLoupeRegion(page, {
				...regionRef.current,
				x: x - regionRef.current.width / 2,
				y: y - regionRef.current.height / 2
			}));
		},
		cancel: () => clear(),
		focus: () => surface.current?.focus()
	}));
	useLayoutEffect(() => {
		clear();
		measured.current = false;
		viewEpoch.current++;
		queuedAdvance.current = null;
		const next = createPaperWritingLoupeRegion(page, viewport, props.initialZoom, void 0, props.options);
		regionRef.current = next;
		setRegion(next);
		const settings = paperWritingLoupeOptions(page, props.options);
		configurationRef.current = settings;
		setConfiguration(settings);
		setNotice("");
	}, [scope]);
	useEffect(() => {
		mounted.current = true;
		const previous = globalThis.document.activeElement;
		surface.current?.focus();
		return () => {
			mounted.current = false;
			engine.current.cancel();
			cancelAnimationFrame(raf.current);
			if (capture.current) latest.current.onInputCancel?.();
			latest.current.onPreview?.(null, latest.current.style);
			latest.current.onRegionChange?.(null, renderedOwner);
			if (previous?.isConnected) previous.focus();
		};
	}, []);
	useLayoutEffect(() => {
		if (live()) props.onRegionChange?.(region, renderedOwner);
		else props.onRegionChange?.(null, renderedOwner);
	}, [
		scope,
		region,
		disabled
	]);
	useEffect(() => {
		if (!engine.current.snapshot()) return;
		clear();
		queuedAdvance.current = null;
	}, [disabled, tool]);
	useLayoutEffect(() => {
		const node = stage.current;
		if (!node) return;
		const measure = () => {
			const rect = node.getBoundingClientRect();
			if (rect.width <= 0 || rect.height <= 0) return;
			const size = {
				width: rect.width,
				height: rect.height
			};
			setViewport((old) => old.width === size.width && old.height === size.height ? old : size);
			if (engine.current.snapshot()) clear();
			viewEpoch.current++;
			queuedAdvance.current = null;
			const old = regionRef.current, next = createPaperWritingLoupeRegion(page, size, old.zoom, measured.current ? {
				x: old.x + old.width / 2,
				y: old.y + old.height / 2
			} : void 0, configurationRef.current);
			measured.current = true;
			regionRef.current = next;
			setRegion(next);
		};
		measure();
		if (typeof ResizeObserver === "undefined") return;
		const observer = new ResizeObserver(measure);
		observer.observe(node);
		return () => observer.disconnect();
	}, [scope]);
	const rect = () => {
		const value = surface.current?.getBoundingClientRect();
		return {
			left: value?.left ?? 0,
			top: value?.top ?? 0,
			width: value?.width ?? 0,
			height: value?.height ?? 0
		};
	};
	const owner = () => live() ? latest.current.currentOwner() : null;
	const paint = (phase, stroke) => notifyPreview(latest.current.previewStroke?.(phase, stroke) ?? stroke, capture.current?.style);
	const holdFrame = () => {
		raf.current = 0;
		const held = capture.current, stroke = engine.current.snapshot();
		if (!held || !stroke || !live(held.owner)) return;
		paint("tick", stroke);
		if (latest.current.previewStroke) raf.current = requestAnimationFrame(holdFrame);
	};
	const down = (event) => {
		if (!inkTools$1.has(tool) || !live()) return;
		const result = engine.current.begin(event.nativeEvent, owner(), regionRef.current, rect(), tool, {
			enabled: !disabled,
			fingerInk
		});
		if (result.status === "cancelled") {
			clear();
			return;
		}
		if (!result.accepted || !result.stroke) return;
		capture.current = {
			owner: { ...renderedOwner },
			region: { ...regionRef.current },
			style: { ...style },
			scope,
			viewEpoch: viewEpoch.current
		};
		try {
			event.currentTarget.setPointerCapture(event.pointerId);
		} catch {
			clear();
			setNotice("La capture du pointeur est indisponible.");
			return;
		}
		event.preventDefault();
		event.stopPropagation();
		setWriting(true);
		paint("begin", result.stroke);
		if (latest.current.previewStroke) raf.current = requestAnimationFrame(holdFrame);
	};
	const move = (event) => {
		if (!capture.current) return;
		let coalesced = [];
		try {
			coalesced = event.nativeEvent.getCoalescedEvents?.() ?? [];
		} catch {}
		const result = engine.current.append(event.nativeEvent, owner(), regionRef.current, rect(), tool, coalesced);
		if (result.status === "cancelled") {
			clear();
			queuedAdvance.current = null;
			return;
		}
		if (!result.accepted) return;
		event.preventDefault();
		event.stopPropagation();
		const raw = engine.current.snapshot();
		if (raw) paint("update", raw);
		if (!raf.current) raf.current = requestAnimationFrame(holdFrame);
	};
	const finish = (event, cancelled = false) => {
		const held = capture.current;
		if (!held) return;
		const result = engine.current.finish(event.nativeEvent, owner(), regionRef.current, rect(), tool, cancelled);
		if (result.status === "ignored") return;
		clear(!result.accepted);
		event.preventDefault();
		event.stopPropagation();
		try {
			if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
		} catch {}
		if (!result.accepted || !result.stroke || !live(held.owner)) return;
		const stroke = result.stroke;
		const accepted = (success) => {
			if (!success || !live(held.owner) || held.scope !== scope || held.viewEpoch !== viewEpoch.current) return;
			if ([
				"pen",
				"pencil",
				"calligraphy",
				"highlighter"
			].includes(stroke.intent)) {
				const prior = queuedAdvance.current;
				queuedAdvance.current = {
					owner: held.owner,
					scope: held.scope,
					points: [...prior?.scope === held.scope ? prior.points : [], ...stroke.points]
				};
				advance();
			}
		};
		try {
			const result = latest.current.onStroke(stroke, held.style);
			if (typeof result === "boolean") accepted(result);
			else result.then(accepted).catch((error) => {
				if (live(held.owner)) setNotice(String(error instanceof Error ? error.message : error));
			});
		} catch (error) {
			if (live(held.owner)) setNotice(String(error instanceof Error ? error.message : error));
		}
		advance();
	};
	const shift = (dx, dy) => {
		if (!live()) return;
		replaceRegion(movePaperWritingLoupeRegion(page, regionRef.current, dx, dy));
	};
	const zoom = (amount) => {
		if (!live() || writing) return;
		const old = regionRef.current, next = createPaperWritingLoupeRegion(page, viewport, old.zoom + amount, {
			x: old.x + old.width / 2,
			y: old.y + old.height / 2
		});
		replaceRegion(next);
		latest.current.onZoomChange?.(next.zoom);
	};
	const line = () => {
		if (!live() || writing) return;
		const next = nextPaperWritingLoupeLine(page, regionRef.current, configurationRef.current);
		if (next.moved) replaceRegion(next.region);
		if (next.pageEnd) setNotice("Fin de page. Choisissez une autre zone ou une autre page pour poursuivre.");
	};
	const controlsDisabled = disabled || writing, overviewWidth = 64, overviewHeight = Math.min(180, overviewWidth * page.height / page.width);
	const overlayContext = paperWritingLoupeContext(renderedOwner, region, rect(), tool);
	const configure = (patch) => {
		if (!live() || engine.current.snapshot()) return;
		const next = paperWritingLoupeOptions(page, {
			...configurationRef.current,
			...patch
		});
		configurationRef.current = next;
		setConfiguration(next);
		latest.current.onOptionsChange?.(next);
	};
	const keydown = (event) => {
		if (event.key === "Escape") {
			event.preventDefault();
			close();
			return;
		}
		if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z" && event.target === surface.current) {
			event.preventDefault();
			if (!controlsDisabled && live()) {
				if (event.shiftKey) latest.current.onRedo?.();
				else latest.current.onUndo?.();
			}
			return;
		}
		if (event.target !== surface.current) return;
		const step = event.shiftKey ? configuration.lineHeight : region.width * .2;
		if (event.key.startsWith("Arrow")) {
			event.preventDefault();
			shift(event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0, event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0);
		}
		if (event.key === "Enter") {
			event.preventDefault();
			line();
		}
	};
	return /* @__PURE__ */ jsxDEV("section", {
		ref: panel,
		className: "paper-writing-loupe",
		"aria-label": "Loupe d’écriture",
		onKeyDown: keydown,
		"data-loupe-owner": ownershipKey,
		"data-loupe-page": page.id,
		children: [
			/* @__PURE__ */ jsxDEV("div", {
				className: "paper-writing-loupe-toolbar",
				children: [
					/* @__PURE__ */ jsxDEV("strong", { children: "Loupe d’écriture" }, void 0, false, {
						fileName: _jsxFileName$10,
						lineNumber: 91,
						columnNumber: 48
					}, this),
					/* @__PURE__ */ jsxDEV("button", {
						type: "button",
						"aria-label": "Annuler dans la loupe",
						disabled: controlsDisabled || !props.canUndo,
						onClick: () => {
							if (live()) latest.current.onUndo?.();
						},
						children: "↶"
					}, void 0, false, {
						fileName: _jsxFileName$10,
						lineNumber: 91,
						columnNumber: 81
					}, this),
					/* @__PURE__ */ jsxDEV("button", {
						type: "button",
						"aria-label": "Rétablir dans la loupe",
						disabled: controlsDisabled || !props.canRedo,
						onClick: () => {
							if (live()) latest.current.onRedo?.();
						},
						children: "↷"
					}, void 0, false, {
						fileName: _jsxFileName$10,
						lineNumber: 91,
						columnNumber: 245
					}, this),
					/* @__PURE__ */ jsxDEV("button", {
						type: "button",
						"aria-label": "Réduire le zoom de la loupe",
						disabled: controlsDisabled || region.zoom <= 1,
						onClick: () => zoom(-.5),
						children: "−"
					}, void 0, false, {
						fileName: _jsxFileName$10,
						lineNumber: 91,
						columnNumber: 410
					}, this),
					/* @__PURE__ */ jsxDEV("output", {
						"aria-label": "Zoom de la loupe",
						children: [region.zoom.toFixed(1), "×"]
					}, void 0, true, {
						fileName: _jsxFileName$10,
						lineNumber: 91,
						columnNumber: 551
					}, this),
					/* @__PURE__ */ jsxDEV("button", {
						type: "button",
						"aria-label": "Augmenter le zoom de la loupe",
						disabled: controlsDisabled || region.zoom >= 6,
						onClick: () => zoom(.5),
						children: "+"
					}, void 0, false, {
						fileName: _jsxFileName$10,
						lineNumber: 91,
						columnNumber: 623
					}, this),
					/* @__PURE__ */ jsxDEV("button", {
						type: "button",
						"aria-label": "Fermer la loupe",
						onClick: close,
						children: "×"
					}, void 0, false, {
						fileName: _jsxFileName$10,
						lineNumber: 91,
						columnNumber: 765
					}, this)
				]
			}, void 0, true, {
				fileName: _jsxFileName$10,
				lineNumber: 91,
				columnNumber: 3
			}, this),
			/* @__PURE__ */ jsxDEV("div", {
				className: "paper-writing-loupe-body",
				children: [/* @__PURE__ */ jsxDEV("div", {
					className: "paper-writing-loupe-overview",
					style: {
						width: overviewWidth,
						height: overviewHeight
					},
					children: [/* @__PURE__ */ jsxDEV(PageProjection, {
						document,
						page,
						media,
						region: {
							x: 0,
							y: 0,
							width: page.width,
							height: page.height,
							zoom: 1
						},
						width: overviewWidth,
						height: overviewHeight
					}, void 0, false, {
						fileName: _jsxFileName$10,
						lineNumber: 92,
						columnNumber: 143
					}, this), /* @__PURE__ */ jsxDEV("svg", {
						viewBox: `0 0 ${page.width} ${page.height}`,
						preserveAspectRatio: "none",
						"aria-label": "Repositionner la loupe sur la page",
						onPointerDown: (event) => {
							if (controlsDisabled || !live() || event.button !== 0) return;
							const box = event.currentTarget.getBoundingClientRect();
							if (!box.width || !box.height) return;
							event.preventDefault();
							replaceRegion(boundPaperWritingLoupeRegion(page, {
								...regionRef.current,
								x: (event.clientX - box.left) / box.width * page.width - region.width / 2,
								y: (event.clientY - box.top) / box.height * page.height - region.height / 2
							}));
						},
						children: /* @__PURE__ */ jsxDEV(PaperWritingLoupeTarget, { region }, void 0, false, {
							fileName: _jsxFileName$10,
							lineNumber: 92,
							columnNumber: 831
						}, this)
					}, void 0, false, {
						fileName: _jsxFileName$10,
						lineNumber: 92,
						columnNumber: 314
					}, this)]
				}, void 0, true, {
					fileName: _jsxFileName$10,
					lineNumber: 92,
					columnNumber: 45
				}, this), /* @__PURE__ */ jsxDEV("div", {
					className: "paper-writing-loupe-stage",
					ref: stage,
					children: [/* @__PURE__ */ jsxDEV(PageProjection, {
						document,
						page,
						media,
						region,
						width: viewport.width,
						height: viewport.height
					}, void 0, false, {
						fileName: _jsxFileName$10,
						lineNumber: 93,
						columnNumber: 59
					}, this), /* @__PURE__ */ jsxDEV("svg", {
						ref: surface,
						className: "paper-writing-loupe-input",
						viewBox: `${region.x} ${region.y} ${region.width} ${region.height}`,
						preserveAspectRatio: "none",
						tabIndex: 0,
						"aria-label": "Écrire dans la loupe",
						"aria-describedby": helpId,
						style: { touchAction: "none" },
						onPointerDown: down,
						onPointerMove: move,
						onPointerUp: (event) => finish(event),
						onPointerCancel: (event) => finish(event, true),
						onLostPointerCapture: (event) => {
							if (capture.current && engine.current.snapshot()?.pointerId === event.pointerId) finish(event, true);
						},
						children: [
							/* @__PURE__ */ jsxDEV("path", {
								d: `M${region.x + region.width * configuration.advanceAt} ${region.y}v${region.height}`,
								stroke: "#4461dc",
								strokeOpacity: .2,
								strokeDasharray: "3 4",
								pointerEvents: "none"
							}, void 0, false, {
								fileName: _jsxFileName$10,
								lineNumber: 93,
								columnNumber: 689
							}, this),
							overlayContext && props.renderOverlay?.(overlayContext),
							/* @__PURE__ */ jsxDEV(PaperInkPreview, { ref: preview }, void 0, false, {
								fileName: _jsxFileName$10,
								lineNumber: 93,
								columnNumber: 915
							}, this)
						]
					}, void 0, true, {
						fileName: _jsxFileName$10,
						lineNumber: 93,
						columnNumber: 186
					}, this)]
				}, void 0, true, {
					fileName: _jsxFileName$10,
					lineNumber: 93,
					columnNumber: 4
				}, this)]
			}, void 0, true, {
				fileName: _jsxFileName$10,
				lineNumber: 92,
				columnNumber: 3
			}, this),
			/* @__PURE__ */ jsxDEV("div", {
				className: "paper-writing-loupe-controls",
				children: [
					/* @__PURE__ */ jsxDEV("button", {
						type: "button",
						"aria-label": "Déplacer la loupe vers la gauche",
						disabled: controlsDisabled || region.x <= 0,
						onClick: () => shift(-region.width * .6, 0),
						children: "←"
					}, void 0, false, {
						fileName: _jsxFileName$10,
						lineNumber: 95,
						columnNumber: 49
					}, this),
					/* @__PURE__ */ jsxDEV("button", {
						type: "button",
						"aria-label": "Déplacer la loupe vers la droite",
						disabled: controlsDisabled || region.x + region.width >= page.width,
						onClick: () => shift(region.width * .6, 0),
						children: "→"
					}, void 0, false, {
						fileName: _jsxFileName$10,
						lineNumber: 95,
						columnNumber: 208
					}, this),
					/* @__PURE__ */ jsxDEV("button", {
						type: "button",
						"aria-label": "Déplacer la loupe vers le haut",
						disabled: controlsDisabled || region.y <= 0,
						onClick: () => shift(0, -configuration.lineHeight),
						children: "↑"
					}, void 0, false, {
						fileName: _jsxFileName$10,
						lineNumber: 95,
						columnNumber: 388
					}, this),
					/* @__PURE__ */ jsxDEV("button", {
						type: "button",
						"aria-label": "Déplacer la loupe vers le bas",
						disabled: controlsDisabled || region.y + region.height >= page.height,
						onClick: () => shift(0, configuration.lineHeight),
						children: "↓"
					}, void 0, false, {
						fileName: _jsxFileName$10,
						lineNumber: 95,
						columnNumber: 554
					}, this),
					/* @__PURE__ */ jsxDEV("button", {
						type: "button",
						"aria-label": "Ligne suivante dans la loupe",
						disabled: controlsDisabled,
						onClick: line,
						children: "↵"
					}, void 0, false, {
						fileName: _jsxFileName$10,
						lineNumber: 95,
						columnNumber: 742
					}, this),
					/* @__PURE__ */ jsxDEV("label", { children: [/* @__PURE__ */ jsxDEV("input", {
						type: "checkbox",
						"aria-label": "Avancement automatique de la loupe",
						checked: configuration.autoAdvance,
						disabled: controlsDisabled,
						onChange: (event) => configure({ autoAdvance: event.target.checked })
					}, void 0, false, {
						fileName: _jsxFileName$10,
						lineNumber: 95,
						columnNumber: 866
					}, this), "Avancer"] }, void 0, true, {
						fileName: _jsxFileName$10,
						lineNumber: 95,
						columnNumber: 859
					}, this),
					/* @__PURE__ */ jsxDEV("label", { children: [/* @__PURE__ */ jsxDEV("input", {
						type: "checkbox",
						"aria-label": "Retour automatique à la ligne",
						checked: configuration.autoReturn,
						disabled: controlsDisabled,
						onChange: (event) => configure({ autoReturn: event.target.checked })
					}, void 0, false, {
						fileName: _jsxFileName$10,
						lineNumber: 95,
						columnNumber: 1088
					}, this), "Retour à la ligne"] }, void 0, true, {
						fileName: _jsxFileName$10,
						lineNumber: 95,
						columnNumber: 1081
					}, this),
					/* @__PURE__ */ jsxDEV("label", { children: ["Interligne", /* @__PURE__ */ jsxDEV("input", {
						type: "number",
						"aria-label": "Interligne de la loupe",
						min: 8,
						max: 100,
						step: 1,
						value: configuration.lineHeight,
						disabled: controlsDisabled,
						onChange: (event) => {
							const value = event.target.valueAsNumber;
							if (Number.isFinite(value) && value >= 8 && value <= 100) configure({ lineHeight: value });
						}
					}, void 0, false, {
						fileName: _jsxFileName$10,
						lineNumber: 95,
						columnNumber: 1323
					}, this)] }, void 0, true, {
						fileName: _jsxFileName$10,
						lineNumber: 95,
						columnNumber: 1306
					}, this)
				]
			}, void 0, true, {
				fileName: _jsxFileName$10,
				lineNumber: 95,
				columnNumber: 3
			}, this),
			/* @__PURE__ */ jsxDEV("p", {
				id: helpId,
				className: "paper-writing-loupe-help",
				children: ["Flèches : déplacer · Entrée : ligne suivante · Échap : fermer", !fingerInk ? " · Le doigt repositionne la zone dans l’aperçu." : ""]
			}, void 0, true, {
				fileName: _jsxFileName$10,
				lineNumber: 96,
				columnNumber: 3
			}, this),
			/* @__PURE__ */ jsxDEV("p", {
				className: "paper-writing-loupe-notice",
				role: "status",
				children: notice || (!inkTools$1.has(tool) ? "Choisissez un outil d’encre pour écrire dans la loupe." : disabled ? "La note ne peut pas être modifiée actuellement." : "Les traits restent à leur position exacte sur la page.")
			}, void 0, false, {
				fileName: _jsxFileName$10,
				lineNumber: 96,
				columnNumber: 185
			}, this)
		]
	}, void 0, true, {
		fileName: _jsxFileName$10,
		lineNumber: 90,
		columnNumber: 9
	}, this);
});
//#endregion
//#region src/lib/paperDrawingGuide.ts
var finite = (n) => typeof n === "number" && Number.isFinite(n);
var distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
var copyPoints = (points) => points.map((p) => ({ ...p }));
var map = (matrix, p) => ({
	x: matrix.a * p.x + matrix.c * p.y + matrix.e,
	y: matrix.b * p.x + matrix.d * p.y + matrix.f
});
var defaultPaperDrawingGuide = (width = 794, height = 1123) => ({
	enabled: false,
	x: width / 2,
	y: height / 2,
	angle: 0,
	space: "page",
	unit: "page",
	snapDistancePx: 20
});
var defaultPaperHoldCorrection = () => ({
	enabled: false,
	delayMs: 650,
	movementTolerancePx: 3,
	minLengthPx: 28,
	recognizeShapes: false
});
function normalizePaperDrawingGuide(value, width = 794, height = 1123) {
	const base = defaultPaperDrawingGuide(width, height), calibration = finite(value.pageUnitsPerMm) && value.pageUnitsPerMm > 0 && value.pageUnitsPerMm <= 1e4 ? value.pageUnitsPerMm : void 0;
	return {
		enabled: value.enabled === true,
		x: finite(value.x) ? value.x : base.x,
		y: finite(value.y) ? value.y : base.y,
		angle: finite(value.angle) ? (value.angle % 360 + 360) % 360 : 0,
		space: value.space === "screen" ? "screen" : "page",
		unit: calibration && (value.unit === "mm" || value.unit === "in") ? value.unit : "page",
		snapDistancePx: finite(value.snapDistancePx) ? Math.max(2, Math.min(80, value.snapDistancePx)) : 20,
		...calibration ? { pageUnitsPerMm: calibration } : {}
	};
}
function normalizePaperHoldCorrection(value) {
	return {
		enabled: value.enabled === true,
		delayMs: finite(value.delayMs) ? Math.max(250, Math.min(3e3, value.delayMs)) : 650,
		movementTolerancePx: finite(value.movementTolerancePx) ? Math.max(.5, Math.min(12, value.movementTolerancePx)) : 3,
		minLengthPx: finite(value.minLengthPx) ? Math.max(15, Math.min(200, value.minLengthPx)) : 28,
		recognizeShapes: value.recognizeShapes === true
	};
}
/** The inverse CTM is authoritative, including zoom, rotation and reflection. */
function paperGuideClientToPage(context) {
	if (context.clientToPage) {
		const m = context.clientToPage;
		if (![
			m.a,
			m.b,
			m.c,
			m.d,
			m.e,
			m.f
		].every(finite) || Math.abs(m.a * m.d - m.b * m.c) < 1e-12) throw Error("Le repère de la règle est invalide.");
		return { ...m };
	}
	const r = context.clientRect;
	if (![
		r.left,
		r.top,
		r.width,
		r.height,
		context.pageWidth,
		context.pageHeight
	].every(finite) || r.width <= 0 || r.height <= 0 || context.pageWidth <= 0 || context.pageHeight <= 0) throw Error("La géométrie de la règle est invalide.");
	return {
		a: context.pageWidth / r.width,
		b: 0,
		c: 0,
		d: context.pageHeight / r.height,
		e: -r.left * context.pageWidth / r.width,
		f: -r.top * context.pageHeight / r.height
	};
}
function paperGuidePageToClient(context) {
	const m = paperGuideClientToPage(context), det = m.a * m.d - m.b * m.c;
	return {
		a: m.d / det,
		b: -m.b / det,
		c: -m.c / det,
		d: m.a / det,
		e: (m.c * m.f - m.d * m.e) / det,
		f: (m.b * m.e - m.a * m.f) / det
	};
}
function paperGuideClientPoint(context, point) {
	return map(paperGuideClientToPage(context), point);
}
function paperGuidePagePoint(context, point) {
	return map(paperGuidePageToClient(context), point);
}
function paperGuideDirection(guide, context) {
	const a = guide.angle * Math.PI / 180, unit = {
		x: Math.cos(a),
		y: Math.sin(a)
	};
	if (guide.space === "page") return unit;
	const m = paperGuideClientToPage(context), x = m.a * unit.x + m.c * unit.y, y = m.b * unit.x + m.d * unit.y, len = Math.hypot(x, y);
	return {
		x: x / len,
		y: y / len
	};
}
function paperGuideMeasuredAngles(guide, context) {
	const d = paperGuideDirection(guide, context), m = paperGuidePageToClient(context), x = m.a * d.x + m.c * d.y, y = m.b * d.x + m.d * d.y;
	const angle = (x, y) => (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
	return {
		page: angle(d.x, d.y),
		screen: angle(x, y)
	};
}
/** Position changes only: pressure/tilt/twist/time/nibAngle remain exact. */
function projectPaperGuidePoint(point, guide, context) {
	const d = paperGuideDirection(guide, context), anchor = {
		x: guide.x,
		y: guide.y
	};
	if (guide.space === "page") {
		const t = (point.x - anchor.x) * d.x + (point.y - anchor.y) * d.y;
		return {
			...point,
			x: anchor.x + d.x * t,
			y: anchor.y + d.y * t
		};
	}
	const p = paperGuidePagePoint(context, point), a = paperGuidePagePoint(context, anchor), r = guide.angle * Math.PI / 180, u = {
		x: Math.cos(r),
		y: Math.sin(r)
	}, t = (p.x - a.x) * u.x + (p.y - a.y) * u.y;
	return {
		...point,
		...paperGuideClientPoint(context, {
			x: a.x + u.x * t,
			y: a.y + u.y * t
		})
	};
}
function paperGuideDistancePx(point, guide, context) {
	return distance(paperGuidePagePoint(context, point), paperGuidePagePoint(context, projectPaperGuidePoint(point, guide, context)));
}
/** Visible segment, in page coordinates. The SVG edge receives no pointer events. */
function paperGuideSegment(guide, context) {
	const d = paperGuideDirection(guide, context), hits = [];
	if (Math.abs(d.x) > 1e-12) for (const x of [0, context.pageWidth]) {
		const t = (x - guide.x) / d.x, y = guide.y + t * d.y;
		if (y >= -1e-7 && y <= context.pageHeight + 1e-7) hits.push(t);
	}
	if (Math.abs(d.y) > 1e-12) for (const y of [0, context.pageHeight]) {
		const t = (y - guide.y) / d.y, x = guide.x + t * d.x;
		if (x >= -1e-7 && x <= context.pageWidth + 1e-7) hits.push(t);
	}
	if (hits.length < 2) return null;
	const lo = Math.min(...hits), hi = Math.max(...hits);
	return {
		start: {
			x: guide.x + d.x * lo,
			y: guide.y + d.y * lo
		},
		end: {
			x: guide.x + d.x * hi,
			y: guide.y + d.y * hi
		},
		direction: d
	};
}
function projectedLine(points) {
	const a = points[0], b = points.at(-1), dx = b.x - a.x, dy = b.y - a.y, len2 = dx * dx + dy * dy;
	return points.map((p) => {
		const t = len2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0;
		return {
			...p,
			x: a.x + t * dx,
			y: a.y + t * dy
		};
	});
}
function pathLength(points) {
	let n = 0;
	for (let i = 1; i < points.length; i++) n += distance(points[i - 1], points[i]);
	return n;
}
function segmentDistance(p, a, b) {
	const dx = b.x - a.x, dy = b.y - a.y, n = dx * dx + dy * dy, t = n ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / n)) : 0;
	return distance(p, {
		x: a.x + t * dx,
		y: a.y + t * dy
	});
}
/** Deliberately conservative: a letter, a bend or a retraced stroke is refused. */
function recognizePaperStraightStroke(points, context, minLengthPx = 28) {
	if (points.length < 4) return null;
	const screen = points.map((p) => paperGuidePagePoint(context, p)), a = screen[0], b = screen.at(-1), chord = distance(a, b), length = pathLength(screen);
	if (chord < minLengthPx || length / chord > 1.065 || screen.some((p) => segmentDistance(p, a, b) > Math.max(2.2, chord * .025))) return null;
	const dx = b.x - a.x, dy = b.y - a.y;
	let progress = -Infinity;
	for (const p of screen) {
		const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / chord;
		if (t < progress - 2.5) return null;
		progress = Math.max(progress, t);
	}
	return {
		kind: "line",
		label: "Trait droit",
		points: projectedLine(points)
	};
}
function simplify(points, epsilon) {
	const keep = /* @__PURE__ */ new Set([0, points.length - 1]), stack = [[0, points.length - 1]];
	while (stack.length) {
		const [a, b] = stack.pop();
		let far = epsilon, index = -1;
		for (let i = a + 1; i < b; i++) {
			const d = segmentDistance(points[i], points[a], points[b]);
			if (d > far) {
				far = d;
				index = i;
			}
		}
		if (index >= 0) {
			keep.add(index);
			stack.push([a, index], [index, b]);
		}
	}
	return [...keep].sort((a, b) => a - b);
}
function projectToPolyline(points, vertices) {
	return points.map((p) => {
		let best = p, d = Infinity;
		for (let i = 1; i < vertices.length; i++) {
			const a = vertices[i - 1], b = vertices[i], dx = b.x - a.x, dy = b.y - a.y, n = dx * dx + dy * dy, t = n ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / n)) : 0, q = {
				x: a.x + t * dx,
				y: a.y + t * dy
			}, next = distance(p, q);
			if (next < d) {
				d = next;
				best = q;
			}
		}
		return {
			...p,
			...best
		};
	});
}
/** Shape proposals require a separate explicit acceptance. An O and a circle
* cannot be distinguished reliably by one stroke, so this never auto-applies. */
function recognizePaperShape(points, context) {
	const line = recognizePaperStraightStroke(points, context);
	if (line) return line;
	if (points.length < 12 || points.length > 2e4) return null;
	const screen = points.map((p) => paperGuidePagePoint(context, p)), xs = screen.map((p) => p.x), ys = screen.map((p) => p.y), left = Math.min(...xs), top = Math.min(...ys), width = Math.max(...xs) - left, height = Math.max(...ys) - top, diagonal = Math.hypot(width, height), length = pathLength(screen), closed = distance(screen[0], screen.at(-1)) < Math.min(12, diagonal * .1);
	if (Math.min(width, height) < 24 || length > diagonal * 4.1 || diagonal < 42) return null;
	if (closed) {
		const cx = left + width / 2, cy = top + height / 2, rx = width / 2, ry = height / 2, radii = screen.map((p) => Math.hypot((p.x - cx) / rx, (p.y - cy) / ry));
		let total = 0, previous = Math.atan2(screen[0].y - cy, screen[0].x - cx), sign = 0, turns = true;
		for (const p of screen.slice(1)) {
			const angle = Math.atan2(p.y - cy, p.x - cx);
			let step = angle - previous;
			while (step > Math.PI) step -= Math.PI * 2;
			while (step < -Math.PI) step += Math.PI * 2;
			if (Math.abs(step) > .03) {
				if (sign && Math.sign(step) !== sign) turns = false;
				sign = Math.sign(step);
			}
			total += step;
			previous = angle;
		}
		if (turns && Math.abs(total) > 5.5 && Math.abs(total) < 6.9 && radii.every((r) => Math.abs(r - 1) < .12)) return {
			kind: "ellipse",
			label: Math.abs(width - height) / Math.max(width, height) < .08 ? "Cercle proposé" : "Ellipse proposée",
			points: points.map((p, i) => {
				const s = screen[i], angle = Math.atan2((s.y - cy) / ry, (s.x - cx) / rx);
				return {
					...p,
					...paperGuideClientPoint(context, {
						x: cx + rx * Math.cos(angle),
						y: cy + ry * Math.sin(angle)
					})
				};
			})
		};
		const indices = simplify(screen, Math.max(2.5, diagonal * .025));
		if (indices.length >= 4 && indices.length <= 7) {
			const vertices = indices.map((i) => screen[i]);
			vertices[vertices.length - 1] = { ...vertices[0] };
			const sides = vertices.slice(1).map((p, i) => distance(p, vertices[i]));
			let winding = 0, convex = true;
			for (let i = 0; i < vertices.length - 1; i++) {
				const a = vertices[(i + vertices.length - 2) % (vertices.length - 1)], b = vertices[i], c = vertices[(i + 1) % (vertices.length - 1)], cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
				if (Math.abs(cross) < 20) {
					convex = false;
					break;
				}
				if (winding && Math.sign(cross) !== winding) convex = false;
				winding = Math.sign(cross);
			}
			if (convex && sides.every((n) => n > 18) && screen.every((p) => Math.min(...vertices.slice(1).map((v, i) => segmentDistance(p, vertices[i], v))) < Math.max(3, diagonal * .035))) {
				const page = vertices.map((p) => paperGuideClientPoint(context, p));
				return {
					kind: "polygon",
					label: `Polygone proposé (${page.length - 1} côtés)`,
					vertices: page,
					points: projectToPolyline(points, page)
				};
			}
		}
	}
	const indices = simplify(screen, Math.max(2.5, diagonal * .025));
	if (!closed && indices.length === 5) {
		const [a, tip, wing, back, other] = indices.map((i) => screen[i]), shaft = distance(a, tip), w1 = distance(tip, wing), w2 = distance(tip, other), dx = (tip.x - a.x) / shaft, dy = (tip.y - a.y) / shaft, dot = (p) => (p.x - tip.x) * dx + (p.y - tip.y) * dy, cross = (p) => (p.x - tip.x) * dy - (p.y - tip.y) * dx;
		if (shaft > 50 && distance(tip, back) < 6 && w1 > 14 && w2 > 14 && w1 < shaft * .5 && w2 < shaft * .5 && Math.min(w1, w2) / Math.max(w1, w2) > .5 && dot(wing) < -w1 * .35 && dot(other) < -w2 * .35 && cross(wing) * cross(other) < 0) {
			const page = [
				a,
				tip,
				wing,
				tip,
				other
			].map((p) => paperGuideClientPoint(context, p));
			return {
				kind: "arrow",
				label: "Flèche proposée",
				vertices: page,
				points: projectToPolyline(points, page)
			};
		}
	}
	return null;
}
var signature = (options) => JSON.stringify({
	guide: normalizePaperDrawingGuide(options.guide),
	hold: normalizePaperHoldCorrection(options.hold)
});
function samePaperGuideContext(a, b) {
	return a.ownershipKey === b.ownershipKey && a.generation === b.generation && a.pageId === b.pageId && a.intent === b.intent && a.pageWidth === b.pageWidth && a.pageHeight === b.pageHeight && (a.pageRotation ?? 0) === (b.pageRotation ?? 0) && [
		"left",
		"top",
		"width",
		"height"
	].every((k) => Math.abs(a.clientRect[k] - b.clientRect[k]) <= .01) && !!a.clientToPage === !!b.clientToPage && (!a.clientToPage || [
		"a",
		"b",
		"c",
		"d",
		"e",
		"f"
	].every((k) => Math.abs(a.clientToPage[k] - b.clientToPage[k]) <= 1e-7));
}
/** A captured contact owns its originals. Hold timing uses the supplied monotonic
* clock, never rewrites device timestamps, and is not triggered after release. */
function createPaperStrokeCorrection() {
	let active = null;
	const result = () => {
		if (!active) return {
			points: [],
			originalPoints: [],
			correction: "none",
			held: false,
			cancelled: false,
			candidate: null
		};
		const a = active, original = copyPoints(a.stroke.points);
		if (a.cancelled || a.bypass) return {
			points: copyPoints(original),
			originalPoints: original,
			correction: "none",
			held: false,
			cancelled: a.cancelled,
			candidate: null
		};
		const line = a.held ? recognizePaperStraightStroke(original, a.stroke.context, a.options.hold.minLengthPx) : null, candidate = a.held && a.options.hold.recognizeShapes ? recognizePaperShape(original, a.stroke.context) : null;
		const correction = a.guide ? "guide" : line ? "line" : a.accepted && candidate ? "shape" : "none";
		return {
			points: a.guide ? original.map((p) => projectPaperGuidePoint(p, a.options.guide, a.stroke.context)) : line ? line.points : a.accepted && candidate ? candidate.points : copyPoints(original),
			originalPoints: original,
			correction,
			held: a.held,
			cancelled: false,
			candidate: a.guide ? null : candidate
		};
	};
	const inspect = (context, options) => {
		if (!active) return;
		if (!samePaperGuideContext(active.stroke.context, context)) active.cancelled = true;
		if (options && signature(options) !== active.signature) {
			active.bypass = true;
			active.held = false;
			active.accepted = false;
		}
	};
	const tick = (now, context, options) => {
		inspect(context, options);
		if (active && finite(now) && now >= active.now) {
			active.now = now;
			active.held = !active.cancelled && !active.bypass && !active.guide && active.options.hold.enabled && now - active.stableSince >= active.options.hold.delayMs;
		}
		return result();
	};
	const update = (stroke, now, context = stroke.context, options) => {
		if (!active) return result();
		inspect(context, options);
		if (stroke.pointerId !== active.stroke.pointerId || stroke.pointerType !== active.stroke.pointerType) {
			active.cancelled = true;
			return result();
		}
		if (!samePaperGuideContext(active.stroke.context, stroke.context)) {
			active.cancelled = true;
			return result();
		}
		if (!finite(now) || now < active.now || stroke.points.length < active.stroke.points.length) return result();
		let moved = false;
		for (const p of stroke.points.slice(active.stroke.points.length)) {
			const screen = paperGuidePagePoint(context, p);
			if (distance(screen, active.anchor) > active.options.hold.movementTolerancePx) {
				active.anchor = screen;
				moved = true;
			}
		}
		active.stroke.points = copyPoints(stroke.points);
		if (moved) {
			active.stableSince = now;
			active.held = false;
			active.accepted = false;
		}
		return tick(now, context, options);
	};
	return {
		begin(stroke, options, now) {
			if (!stroke.points.length || !finite(now)) throw Error("Le contact de dessin est invalide.");
			const guide = normalizePaperDrawingGuide(options.guide, stroke.context.pageWidth, stroke.context.pageHeight), hold = normalizePaperHoldCorrection(options.hold), copy = {
				...stroke,
				context: structuredClone(stroke.context),
				points: copyPoints(stroke.points)
			}, eligible = [
				"pen",
				"pencil",
				"calligraphy",
				"highlighter"
			].includes(stroke.intent), last = paperGuidePagePoint(stroke.context, stroke.points.at(-1));
			active = {
				stroke: copy,
				options: {
					guide,
					hold
				},
				signature: signature(options),
				anchor: last,
				stableSince: now,
				now,
				guide: eligible && guide.enabled && paperGuideDistancePx(stroke.points[0], guide, stroke.context) <= guide.snapDistancePx,
				bypass: !eligible,
				cancelled: false,
				held: false,
				accepted: false
			};
			return result();
		},
		update,
		tick,
		acceptShape(context, options) {
			inspect(context, options);
			if (active && active.held && !active.bypass && !active.cancelled) active.accepted = true;
			return result();
		},
		disable() {
			if (active) {
				active.bypass = true;
				active.held = false;
				active.accepted = false;
			}
			return result();
		},
		snapshot: result,
		finish(stroke, now, context = stroke.context, options) {
			const held = active?.held === true;
			update(stroke, now, context, options);
			if (active && !held) {
				active.held = false;
				active.accepted = false;
			}
			const output = result();
			active = null;
			return output;
		},
		cancel() {
			if (active) {
				active.cancelled = true;
				active.held = false;
				active.accepted = false;
			}
			const output = result();
			active = null;
			return output;
		}
	};
}
//#endregion
//#region src/components/PaperDrawingGuide.tsx
var _jsxFileName$9 = "/home/louis/DowzeBuild/20260923/collections-060/src/components/PaperDrawingGuide.tsx";
/** Render inside the input SVG. Only the two handles receive contacts; the
* marked edge is transparent to the real ink pointer and its capture. */
function PaperDrawingGuide({ guide, context, onChange, disabled = false }) {
	const drag = useRef(null);
	if (!guide.enabled) return null;
	const segment = paperGuideSegment(guide, context);
	if (!segment) return null;
	const dir = segment.direction, anchor = {
		x: guide.x,
		y: guide.y
	}, screen = paperGuidePagePoint(context, anchor), screenDir = paperGuidePagePoint(context, {
		x: anchor.x + dir.x,
		y: anchor.y + dir.y
	}), scale = Math.hypot(screenDir.x - screen.x, screenDir.y - screen.y), angles = paperGuideMeasuredAngles(guide, context);
	const handle = paperGuideClientPoint(context, {
		x: screen.x - (screenDir.y - screen.y) / scale * 30,
		y: screen.y + (screenDir.x - screen.x) / scale * 30
	}), rotate = paperGuideClientPoint(context, {
		x: screen.x + (screenDir.x - screen.x) / scale * 90 - (screenDir.y - screen.y) / scale * 30,
		y: screen.y + (screenDir.y - screen.y) / scale * 90 + (screenDir.x - screen.x) / scale * 30
	}), matrix = paperGuideClientToPage(context), screenTransform = (p) => `matrix(${matrix.a} ${matrix.b} ${matrix.c} ${matrix.d} ${p.x} ${p.y})`;
	const unit = guide.unit === "page" || !guide.pageUnitsPerMm ? "u. page" : guide.unit, perUnit = unit === "mm" ? guide.pageUnitsPerMm : unit === "in" ? guide.pageUnitsPerMm * 25.4 : 1, visibleLength = Math.hypot(segment.end.x - segment.start.x, segment.end.y - segment.start.y), desired = 56 / scale / perUnit, power = 10 ** Math.floor(Math.log10(Math.max(1e-6, desired))), step = [
		1,
		2,
		5,
		10
	].map((n) => n * power).find((n) => n >= desired) ?? power * 10, tickStep = step * perUnit;
	const first = Math.ceil(((segment.start.x - anchor.x) * dir.x + (segment.start.y - anchor.y) * dir.y) / tickStep), count = Math.min(160, Math.ceil(visibleLength / tickStep) + 1), ticks = Array.from({ length: count }, (_, i) => first + i).filter((i) => {
		const p = {
			x: anchor.x + dir.x * i * tickStep,
			y: anchor.y + dir.y * i * tickStep
		};
		return p.x >= 0 && p.y >= 0 && p.x <= context.pageWidth && p.y <= context.pageHeight;
	});
	const down = (event, mode) => {
		if (disabled || event.button !== 0 || event.isPrimary === false) return;
		event.preventDefault();
		event.stopPropagation();
		if (drag.current) return;
		try {
			event.currentTarget.setPointerCapture(event.pointerId);
		} catch {
			return;
		}
		drag.current = {
			id: event.pointerId,
			mode,
			guide: { ...guide },
			context: structuredClone(context),
			start: paperGuideClientPoint(context, {
				x: event.clientX,
				y: event.clientY
			})
		};
	};
	const move = (event) => {
		const held = drag.current;
		if (!held || held.id !== event.pointerId) return;
		event.preventDefault();
		event.stopPropagation();
		if (disabled || !samePaperGuideContext(held.context, context)) {
			drag.current = null;
			return;
		}
		const p = paperGuideClientPoint(held.context, {
			x: event.clientX,
			y: event.clientY
		});
		if (held.mode === "move") onChange({
			...held.guide,
			x: held.guide.x + p.x - held.start.x,
			y: held.guide.y + p.y - held.start.y
		});
		else {
			const a = held.guide.space === "screen" ? paperGuidePagePoint(held.context, {
				x: held.guide.x,
				y: held.guide.y
			}) : {
				x: held.guide.x,
				y: held.guide.y
			}, point = held.guide.space === "screen" ? {
				x: event.clientX,
				y: event.clientY
			} : p, start = held.guide.space === "screen" ? paperGuidePagePoint(held.context, held.start) : held.start, delta = (Math.atan2(point.y - a.y, point.x - a.x) - Math.atan2(start.y - a.y, start.x - a.x)) * 180 / Math.PI, angle = (held.guide.angle + delta + 720) % 360;
			onChange({
				...held.guide,
				angle: event.shiftKey ? Math.round(angle / 15) * 15 : angle
			});
		}
	};
	const end = (event, cancel = false) => {
		const held = drag.current;
		if (!held || held.id !== event.pointerId) return;
		event.preventDefault();
		event.stopPropagation();
		drag.current = null;
		if (cancel && !disabled && samePaperGuideContext(held.context, context)) onChange(held.guide);
		try {
			event.currentTarget.releasePointerCapture(event.pointerId);
		} catch {}
	};
	const keys = (event, mode) => {
		if (disabled) return;
		const step = event.shiftKey ? 10 : 1;
		if (event.key === "Escape") {
			event.preventDefault();
			event.stopPropagation();
			const held = drag.current;
			drag.current = null;
			if (held && samePaperGuideContext(held.context, context)) onChange(held.guide);
			return;
		}
		if (![
			"ArrowLeft",
			"ArrowRight",
			"ArrowUp",
			"ArrowDown",
			"Home"
		].includes(event.key)) return;
		event.preventDefault();
		event.stopPropagation();
		if (mode === "rotate") onChange({
			...guide,
			angle: event.key === "Home" ? 0 : (guide.angle + (["ArrowLeft", "ArrowDown"].includes(event.key) ? -step : step) + 360) % 360
		});
		else {
			const d = event.key === "Home" ? {
				x: context.pageWidth / 2,
				y: context.pageHeight / 2
			} : guide.space === "screen" ? paperGuideClientPoint(context, {
				x: screen.x + (event.key === "ArrowRight" ? step : event.key === "ArrowLeft" ? -step : 0),
				y: screen.y + (event.key === "ArrowDown" ? step : event.key === "ArrowUp" ? -step : 0)
			}) : {
				x: guide.x + (event.key === "ArrowRight" ? step : event.key === "ArrowLeft" ? -step : 0),
				y: guide.y + (event.key === "ArrowDown" ? step : event.key === "ArrowUp" ? -step : 0)
			};
			onChange({
				...guide,
				...d
			});
		}
	};
	const handleProps = (mode) => ({
		role: "button",
		tabIndex: disabled ? -1 : 0,
		"aria-disabled": disabled,
		"aria-label": mode === "move" ? "Déplacer la règle : flèches, Maj pour dix unités, Début pour centrer" : "Tourner la règle : flèches, Maj pour dix degrés, Début pour zéro degré",
		onPointerDown: (e) => down(e, mode),
		onPointerMove: move,
		onPointerUp: (e) => end(e),
		onPointerCancel: (e) => end(e, true),
		onLostPointerCapture: (e) => {
			if (drag.current?.id === e.pointerId) end(e, true);
		},
		onKeyDown: (e) => keys(e, mode)
	});
	return /* @__PURE__ */ jsxDEV("g", {
		className: "paper-drawing-guide",
		"data-angle-page": angles.page,
		"data-angle-screen": angles.screen,
		children: [
			/* @__PURE__ */ jsxDEV("g", {
				"aria-hidden": "true",
				pointerEvents: "none",
				children: [
					/* @__PURE__ */ jsxDEV("line", {
						x1: segment.start.x,
						y1: segment.start.y,
						x2: segment.end.x,
						y2: segment.end.y,
						className: "paper-guide-band",
						strokeWidth: 48,
						vectorEffect: "non-scaling-stroke"
					}, void 0, false, {
						fileName: _jsxFileName$9,
						lineNumber: 24,
						columnNumber: 46
					}, this),
					/* @__PURE__ */ jsxDEV("line", {
						x1: segment.start.x,
						y1: segment.start.y,
						x2: segment.end.x,
						y2: segment.end.y,
						className: "paper-guide-edge",
						vectorEffect: "non-scaling-stroke"
					}, void 0, false, {
						fileName: _jsxFileName$9,
						lineNumber: 24,
						columnNumber: 213
					}, this),
					ticks.map((i) => {
						const x = anchor.x + dir.x * i * tickStep, y = anchor.y + dir.y * i * tickStep, s = paperGuidePagePoint(context, {
							x,
							y
						}), end = paperGuideClientPoint(context, {
							x: s.x - (screenDir.y - screen.y) / scale * 9,
							y: s.y + (screenDir.x - screen.x) / scale * 9
						}), label = paperGuideClientPoint(context, {
							x: s.x - (screenDir.y - screen.y) / scale * 17,
							y: s.y + (screenDir.x - screen.x) / scale * 17
						});
						return /* @__PURE__ */ jsxDEV("g", { children: [/* @__PURE__ */ jsxDEV("line", {
							x1: x,
							y1: y,
							x2: end.x,
							y2: end.y,
							className: "paper-guide-tick",
							vectorEffect: "non-scaling-stroke"
						}, void 0, false, {
							fileName: _jsxFileName$9,
							lineNumber: 25,
							columnNumber: 361
						}, this), /* @__PURE__ */ jsxDEV("text", {
							transform: screenTransform(label),
							fontSize: 11,
							textAnchor: "middle",
							fill: "#254e75",
							children: Number((i * step).toFixed(5))
						}, void 0, false, {
							fileName: _jsxFileName$9,
							lineNumber: 25,
							columnNumber: 467
						}, this)] }, i, true, {
							fileName: _jsxFileName$9,
							lineNumber: 25,
							columnNumber: 350
						}, this);
					})
				]
			}, void 0, true, {
				fileName: _jsxFileName$9,
				lineNumber: 24,
				columnNumber: 3
			}, this),
			/* @__PURE__ */ jsxDEV("g", {
				...handleProps("move"),
				className: "paper-guide-handle",
				transform: screenTransform(handle),
				children: [/* @__PURE__ */ jsxDEV("circle", { r: 22 }, void 0, false, {
					fileName: _jsxFileName$9,
					lineNumber: 27,
					columnNumber: 98
				}, this), /* @__PURE__ */ jsxDEV("text", {
					textAnchor: "middle",
					dominantBaseline: "central",
					fontSize: 18,
					pointerEvents: "none",
					children: "↔"
				}, void 0, false, {
					fileName: _jsxFileName$9,
					lineNumber: 27,
					columnNumber: 114
				}, this)]
			}, void 0, true, {
				fileName: _jsxFileName$9,
				lineNumber: 27,
				columnNumber: 3
			}, this),
			/* @__PURE__ */ jsxDEV("g", {
				...handleProps("rotate"),
				className: "paper-guide-handle",
				transform: screenTransform(rotate),
				children: [/* @__PURE__ */ jsxDEV("circle", { r: 22 }, void 0, false, {
					fileName: _jsxFileName$9,
					lineNumber: 28,
					columnNumber: 100
				}, this), /* @__PURE__ */ jsxDEV("text", {
					textAnchor: "middle",
					dominantBaseline: "central",
					fontSize: 18,
					pointerEvents: "none",
					children: "↻"
				}, void 0, false, {
					fileName: _jsxFileName$9,
					lineNumber: 28,
					columnNumber: 116
				}, this)]
			}, void 0, true, {
				fileName: _jsxFileName$9,
				lineNumber: 28,
				columnNumber: 3
			}, this)
		]
	}, void 0, true, {
		fileName: _jsxFileName$9,
		lineNumber: 23,
		columnNumber: 9
	}, this);
}
function PaperDrawingGuideControls({ guide, hold, pageWidth, pageHeight, onGuideChange, onHoldChange, context, disabled = false, candidate, onAcceptShape, onRestoreOriginal }) {
	const id = useId(), [calibrationSpan, setCalibrationSpan] = useState(String(pageWidth)), [physicalSpan, setPhysicalSpan] = useState(""), [physicalUnit, setPhysicalUnit] = useState("mm"), [notice, setNotice] = useState("");
	const patch = (next) => onGuideChange(normalizePaperDrawingGuide({
		...guide,
		...next
	}, pageWidth, pageHeight)), number = (value, fn) => {
		const n = Number(value);
		if (value.trim() && Number.isFinite(n)) fn(n);
	}, angles = context ? paperGuideMeasuredAngles(guide, context) : null;
	return /* @__PURE__ */ jsxDEV("section", {
		className: "paper-drawing-guide-controls",
		"aria-label": "Règle et maintien",
		children: [
			/* @__PURE__ */ jsxDEV("fieldset", {
				disabled,
				children: [
					/* @__PURE__ */ jsxDEV("legend", { children: "Règle et angles" }, void 0, false, {
						fileName: _jsxFileName$9,
						lineNumber: 39,
						columnNumber: 120
					}, this),
					/* @__PURE__ */ jsxDEV("label", {
						className: "paper-guide-check",
						children: [/* @__PURE__ */ jsxDEV("input", {
							type: "checkbox",
							checked: guide.enabled,
							onChange: (e) => patch({ enabled: e.target.checked })
						}, void 0, false, {
							fileName: _jsxFileName$9,
							lineNumber: 40,
							columnNumber: 40
						}, this), "Afficher et utiliser la règle"]
					}, void 0, true, {
						fileName: _jsxFileName$9,
						lineNumber: 40,
						columnNumber: 3
					}, this),
					/* @__PURE__ */ jsxDEV("div", {
						className: "paper-guide-fields",
						children: [
							/* @__PURE__ */ jsxDEV("label", { children: ["Angle", /* @__PURE__ */ jsxDEV("input", {
								type: "number",
								"aria-label": "Angle de la règle en degrés",
								value: Number(guide.angle.toFixed(3)),
								step: "1",
								onChange: (e) => number(e.target.value, (angle) => patch({ angle }))
							}, void 0, false, {
								fileName: _jsxFileName$9,
								lineNumber: 41,
								columnNumber: 51
							}, this)] }, void 0, true, {
								fileName: _jsxFileName$9,
								lineNumber: 41,
								columnNumber: 39
							}, this),
							/* @__PURE__ */ jsxDEV("label", { children: ["Repère", /* @__PURE__ */ jsxDEV("select", {
								"aria-label": "Repère de l’angle de la règle",
								value: guide.space,
								onChange: (e) => patch({ space: e.target.value }),
								children: [/* @__PURE__ */ jsxDEV("option", {
									value: "page",
									children: "Page"
								}, void 0, false, {
									fileName: _jsxFileName$9,
									lineNumber: 41,
									columnNumber: 376
								}, this), /* @__PURE__ */ jsxDEV("option", {
									value: "screen",
									children: "Écran"
								}, void 0, false, {
									fileName: _jsxFileName$9,
									lineNumber: 41,
									columnNumber: 410
								}, this)]
							}, void 0, true, {
								fileName: _jsxFileName$9,
								lineNumber: 41,
								columnNumber: 242
							}, this)] }, void 0, true, {
								fileName: _jsxFileName$9,
								lineNumber: 41,
								columnNumber: 229
							}, this),
							/* @__PURE__ */ jsxDEV("label", { children: ["X (u. page)", /* @__PURE__ */ jsxDEV("input", {
								type: "number",
								"aria-label": "Position X de la règle",
								step: "1",
								value: Number(guide.x.toFixed(3)),
								onChange: (e) => number(e.target.value, (x) => patch({ x }))
							}, void 0, false, {
								fileName: _jsxFileName$9,
								lineNumber: 41,
								columnNumber: 482
							}, this)] }, void 0, true, {
								fileName: _jsxFileName$9,
								lineNumber: 41,
								columnNumber: 464
							}, this),
							/* @__PURE__ */ jsxDEV("label", { children: ["Y (u. page)", /* @__PURE__ */ jsxDEV("input", {
								type: "number",
								"aria-label": "Position Y de la règle",
								step: "1",
								value: Number(guide.y.toFixed(3)),
								onChange: (e) => number(e.target.value, (y) => patch({ y }))
							}, void 0, false, {
								fileName: _jsxFileName$9,
								lineNumber: 41,
								columnNumber: 661
							}, this)] }, void 0, true, {
								fileName: _jsxFileName$9,
								lineNumber: 41,
								columnNumber: 643
							}, this)
						]
					}, void 0, true, {
						fileName: _jsxFileName$9,
						lineNumber: 41,
						columnNumber: 3
					}, this),
					/* @__PURE__ */ jsxDEV("div", {
						className: "paper-guide-buttons",
						children: [
							/* @__PURE__ */ jsxDEV("button", {
								type: "button",
								onClick: () => patch({
									x: pageWidth / 2,
									y: pageHeight / 2
								}),
								children: "Centrer"
							}, void 0, false, {
								fileName: _jsxFileName$9,
								lineNumber: 42,
								columnNumber: 40
							}, this),
							/* @__PURE__ */ jsxDEV("button", {
								type: "button",
								onClick: () => patch({ angle: 0 }),
								children: "0°"
							}, void 0, false, {
								fileName: _jsxFileName$9,
								lineNumber: 42,
								columnNumber: 130
							}, this),
							/* @__PURE__ */ jsxDEV("button", {
								type: "button",
								onClick: () => patch({ angle: 45 }),
								children: "45°"
							}, void 0, false, {
								fileName: _jsxFileName$9,
								lineNumber: 42,
								columnNumber: 194
							}, this),
							/* @__PURE__ */ jsxDEV("button", {
								type: "button",
								onClick: () => patch({ angle: 90 }),
								children: "90°"
							}, void 0, false, {
								fileName: _jsxFileName$9,
								lineNumber: 42,
								columnNumber: 260
							}, this)
						]
					}, void 0, true, {
						fileName: _jsxFileName$9,
						lineNumber: 42,
						columnNumber: 3
					}, this),
					/* @__PURE__ */ jsxDEV("p", {
						id: `${id}-guide-help`,
						children: "Commencez le tracé près du bord marqué pour l’aligner. Déplacez ou tournez les poignées ; les flèches du clavier les règlent aussi."
					}, void 0, false, {
						fileName: _jsxFileName$9,
						lineNumber: 43,
						columnNumber: 3
					}, this),
					angles && /* @__PURE__ */ jsxDEV("output", {
						"aria-label": "Angles mesurés de la règle",
						children: [
							"Page ",
							angles.page.toFixed(1),
							"° · Écran ",
							angles.screen.toFixed(1),
							"°"
						]
					}, void 0, true, {
						fileName: _jsxFileName$9,
						lineNumber: 44,
						columnNumber: 12
					}, this),
					/* @__PURE__ */ jsxDEV("label", { children: ["Unités", /* @__PURE__ */ jsxDEV("select", {
						"aria-label": "Unités de mesure de la règle",
						value: guide.unit,
						onChange: (e) => patch({ unit: e.target.value }),
						children: [
							/* @__PURE__ */ jsxDEV("option", {
								value: "page",
								children: "Unités de page"
							}, void 0, false, {
								fileName: _jsxFileName$9,
								lineNumber: 45,
								columnNumber: 148
							}, this),
							/* @__PURE__ */ jsxDEV("option", {
								value: "mm",
								disabled: !guide.pageUnitsPerMm,
								children: "Millimètres du document"
							}, void 0, false, {
								fileName: _jsxFileName$9,
								lineNumber: 45,
								columnNumber: 192
							}, this),
							/* @__PURE__ */ jsxDEV("option", {
								value: "in",
								disabled: !guide.pageUnitsPerMm,
								children: "Pouces du document"
							}, void 0, false, {
								fileName: _jsxFileName$9,
								lineNumber: 45,
								columnNumber: 276
							}, this)
						]
					}, void 0, true, {
						fileName: _jsxFileName$9,
						lineNumber: 45,
						columnNumber: 16
					}, this)] }, void 0, true, {
						fileName: _jsxFileName$9,
						lineNumber: 45,
						columnNumber: 3
					}, this),
					/* @__PURE__ */ jsxDEV("details", { children: [
						/* @__PURE__ */ jsxDEV("summary", { children: "Calibrer les unités du document" }, void 0, false, {
							fileName: _jsxFileName$9,
							lineNumber: 46,
							columnNumber: 12
						}, this),
						/* @__PURE__ */ jsxDEV("p", { children: "Indiquez une longueur connue dans la page et sa mesure réelle. Les centimètres de l’écran dépendent du matériel et ne sont pas déduits du zoom." }, void 0, false, {
							fileName: _jsxFileName$9,
							lineNumber: 46,
							columnNumber: 62
						}, this),
						/* @__PURE__ */ jsxDEV("div", {
							className: "paper-guide-fields",
							children: [
								/* @__PURE__ */ jsxDEV("label", { children: ["Longueur de page", /* @__PURE__ */ jsxDEV("input", {
									type: "number",
									"aria-label": "Longueur connue en unités de page",
									min: "0.001",
									step: "any",
									value: calibrationSpan,
									onChange: (e) => setCalibrationSpan(e.target.value)
								}, void 0, false, {
									fileName: _jsxFileName$9,
									lineNumber: 46,
									columnNumber: 271
								}, this)] }, void 0, true, {
									fileName: _jsxFileName$9,
									lineNumber: 46,
									columnNumber: 248
								}, this),
								/* @__PURE__ */ jsxDEV("label", { children: ["Mesure réelle", /* @__PURE__ */ jsxDEV("input", {
									type: "number",
									"aria-label": "Longueur réelle de calibration",
									min: "0.001",
									step: "any",
									value: physicalSpan,
									onChange: (e) => setPhysicalSpan(e.target.value)
								}, void 0, false, {
									fileName: _jsxFileName$9,
									lineNumber: 46,
									columnNumber: 464
								}, this)] }, void 0, true, {
									fileName: _jsxFileName$9,
									lineNumber: 46,
									columnNumber: 444
								}, this),
								/* @__PURE__ */ jsxDEV("label", { children: ["Unité réelle", /* @__PURE__ */ jsxDEV("select", {
									"aria-label": "Unité réelle de calibration",
									value: physicalUnit,
									onChange: (e) => setPhysicalUnit(e.target.value),
									children: [/* @__PURE__ */ jsxDEV("option", {
										value: "mm",
										children: "mm"
									}, void 0, false, {
										fileName: _jsxFileName$9,
										lineNumber: 46,
										columnNumber: 776
									}, this), /* @__PURE__ */ jsxDEV("option", {
										value: "in",
										children: "in"
									}, void 0, false, {
										fileName: _jsxFileName$9,
										lineNumber: 46,
										columnNumber: 806
									}, this)]
								}, void 0, true, {
									fileName: _jsxFileName$9,
									lineNumber: 46,
									columnNumber: 647
								}, this)] }, void 0, true, {
									fileName: _jsxFileName$9,
									lineNumber: 46,
									columnNumber: 628
								}, this)
							]
						}, void 0, true, {
							fileName: _jsxFileName$9,
							lineNumber: 46,
							columnNumber: 212
						}, this),
						/* @__PURE__ */ jsxDEV("div", {
							className: "paper-guide-buttons",
							children: [/* @__PURE__ */ jsxDEV("button", {
								type: "button",
								onClick: () => {
									const page = Number(calibrationSpan), physical = Number(physicalSpan), ratio = page / (physical * (physicalUnit === "in" ? 25.4 : 1));
									if (!page || !physical || page <= 0 || physical <= 0 || !Number.isFinite(ratio) || ratio > 1e4) {
										setNotice("Indiquez deux longueurs positives.");
										return;
									}
									patch({
										pageUnitsPerMm: ratio,
										unit: physicalUnit
									});
									setNotice("Calibration du document appliquée.");
								},
								children: "Appliquer la calibration"
							}, void 0, false, {
								fileName: _jsxFileName$9,
								lineNumber: 46,
								columnNumber: 896
							}, this), /* @__PURE__ */ jsxDEV("button", {
								type: "button",
								disabled: !guide.pageUnitsPerMm,
								onClick: () => {
									const next = {
										...guide,
										unit: "page"
									};
									delete next.pageUnitsPerMm;
									onGuideChange(next);
									setNotice("Calibration retirée.");
								},
								children: "Retirer la calibration"
							}, void 0, false, {
								fileName: _jsxFileName$9,
								lineNumber: 46,
								columnNumber: 1317
							}, this)]
						}, void 0, true, {
							fileName: _jsxFileName$9,
							lineNumber: 46,
							columnNumber: 859
						}, this)
					] }, void 0, true, {
						fileName: _jsxFileName$9,
						lineNumber: 46,
						columnNumber: 3
					}, this)
				]
			}, void 0, true, {
				fileName: _jsxFileName$9,
				lineNumber: 39,
				columnNumber: 90
			}, this),
			/* @__PURE__ */ jsxDEV("fieldset", {
				disabled,
				children: [
					/* @__PURE__ */ jsxDEV("legend", { children: "Rectification après maintien" }, void 0, false, {
						fileName: _jsxFileName$9,
						lineNumber: 47,
						columnNumber: 43
					}, this),
					/* @__PURE__ */ jsxDEV("label", {
						className: "paper-guide-check",
						children: [/* @__PURE__ */ jsxDEV("input", {
							type: "checkbox",
							checked: hold.enabled,
							onChange: (e) => onHoldChange({
								...hold,
								enabled: e.target.checked
							})
						}, void 0, false, {
							fileName: _jsxFileName$9,
							lineNumber: 47,
							columnNumber: 125
						}, this), "Rectifier les tracés presque droits"]
					}, void 0, true, {
						fileName: _jsxFileName$9,
						lineNumber: 47,
						columnNumber: 88
					}, this),
					/* @__PURE__ */ jsxDEV("label", { children: ["Délai (ms)", /* @__PURE__ */ jsxDEV("input", {
						type: "number",
						"aria-label": "Délai de maintien avant rectification",
						value: hold.delayMs,
						min: "250",
						max: "3000",
						step: "50",
						onChange: (e) => number(e.target.value, (delayMs) => {
							if (delayMs >= 250 && delayMs <= 3e3) onHoldChange({
								...hold,
								delayMs
							});
						})
					}, void 0, false, {
						fileName: _jsxFileName$9,
						lineNumber: 47,
						columnNumber: 295
					}, this)] }, void 0, true, {
						fileName: _jsxFileName$9,
						lineNumber: 47,
						columnNumber: 278
					}, this),
					/* @__PURE__ */ jsxDEV("label", {
						className: "paper-guide-check",
						children: [/* @__PURE__ */ jsxDEV("input", {
							type: "checkbox",
							checked: hold.recognizeShapes,
							onChange: (e) => onHoldChange({
								...hold,
								recognizeShapes: e.target.checked
							})
						}, void 0, false, {
							fileName: _jsxFileName$9,
							lineNumber: 47,
							columnNumber: 577
						}, this), "Proposer des formes après maintien"]
					}, void 0, true, {
						fileName: _jsxFileName$9,
						lineNumber: 47,
						columnNumber: 540
					}, this),
					/* @__PURE__ */ jsxDEV("p", { children: "Gardez le contact immobile jusqu’à la rectification. Reprendre le tracé ou désactiver le réglage restitue le tracé original. Les lettres et formes ambiguës nécessitent une confirmation." }, void 0, false, {
						fileName: _jsxFileName$9,
						lineNumber: 47,
						columnNumber: 745
					}, this),
					candidate && /* @__PURE__ */ jsxDEV("div", {
						role: "status",
						className: "paper-guide-candidate",
						children: [/* @__PURE__ */ jsxDEV("span", { children: candidate.label }, void 0, false, {
							fileName: _jsxFileName$9,
							lineNumber: 47,
							columnNumber: 1002
						}, this), /* @__PURE__ */ jsxDEV("button", {
							type: "button",
							disabled: !onAcceptShape,
							onClick: onAcceptShape,
							children: "Appliquer la forme proposée"
						}, void 0, false, {
							fileName: _jsxFileName$9,
							lineNumber: 47,
							columnNumber: 1032
						}, this)]
					}, void 0, true, {
						fileName: _jsxFileName$9,
						lineNumber: 47,
						columnNumber: 949
					}, this),
					onRestoreOriginal && /* @__PURE__ */ jsxDEV("button", {
						type: "button",
						onClick: onRestoreOriginal,
						children: "Restaurer le tracé original"
					}, void 0, false, {
						fileName: _jsxFileName$9,
						lineNumber: 47,
						columnNumber: 1167
					}, this)
				]
			}, void 0, true, {
				fileName: _jsxFileName$9,
				lineNumber: 47,
				columnNumber: 13
			}, this),
			/* @__PURE__ */ jsxDEV("p", {
				role: "status",
				children: notice
			}, void 0, false, {
				fileName: _jsxFileName$9,
				lineNumber: 47,
				columnNumber: 1265
			}, this)
		]
	}, void 0, true, {
		fileName: _jsxFileName$9,
		lineNumber: 39,
		columnNumber: 9
	}, this);
}
//#endregion
//#region src/hooks/usePaperWritingAids.ts
var paperWritingAidsKey = (scope, noteId) => "paper-writing-aids-v1|" + notebookIdentityDigest(JSON.stringify([
	scope.accountId,
	scope.spaceId,
	noteId
]));
var defaults = () => ({
	guide: defaultPaperDrawingGuide(),
	hold: defaultPaperHoldCorrection(),
	loupe: {
		zoom: 3,
		options: {}
	}
});
var normalized = (value) => ({
	guide: normalizePaperDrawingGuide(value.guide),
	hold: normalizePaperHoldCorrection(value.hold),
	loupe: {
		zoom: Number.isFinite(value.loupe?.zoom) ? Math.max(1, Math.min(6, value.loupe.zoom)) : 3,
		options: { ...value.loupe?.options }
	}
});
/** Local note-scoped settings use the common CAS transaction and close writer. No server preference is inferred. */
function usePaperWritingAids(scope, noteId, disabled) {
	const clean = {
		accountId: scope.accountId,
		spaceId: scope.spaceId
	};
	const owner = JSON.stringify([
		scope.accountId,
		scope.spaceId,
		noteId
	]), latest = useRef({
		owner,
		disabled
	});
	latest.current = {
		owner,
		disabled
	};
	const session = useMemo(() => ({
		owner,
		key: paperWritingAidsKey(scope, noteId),
		alive: true,
		writable: true,
		pending: 0,
		row: void 0,
		value: defaults(),
		tail: Promise.resolve(),
		opening: Promise.resolve()
	}), [owner]);
	const [state, setState] = useState({
		owner,
		ready: false,
		value: defaults(),
		notice: ""
	});
	const current = () => session.alive && session.writable && latest.current.owner === owner && !latest.current.disabled;
	const recordOwner = (row) => {
		if (!row) return;
		const value = row.value;
		if (row.accountId !== scope.accountId || row.spaceId !== scope.spaceId || value.kind !== "paper-writing-aids" || value.schema !== 1 || value.accountId !== scope.accountId || value.spaceId !== scope.spaceId || value.noteId !== noteId || !value.settings) throw Error("Les réglages d’écriture appartiennent à une autre note.");
	};
	useEffect(() => {
		session.alive = true;
		setState({
			owner,
			ready: false,
			value: defaults(),
			notice: ""
		});
		session.opening = getSnapshot(session.key).then((row) => {
			recordOwner(row);
			if (!session.alive || latest.current.owner !== owner) return;
			session.row = row;
			session.value = row ? normalized(row.value.settings) : defaults();
			setState({
				owner,
				ready: true,
				value: session.value,
				notice: ""
			});
		}).catch((error) => {
			if (session.alive && latest.current.owner === owner) setState({
				owner,
				ready: false,
				value: defaults(),
				notice: String(error instanceof Error ? error.message : error)
			});
		});
		const unregister = registerNotebookWriter(scope.accountId, {
			flush: () => {},
			settled: async () => {
				await session.opening;
				await session.tail;
			},
			pending: () => session.pending > 0,
			suspend: () => {
				session.writable = false;
			},
			resume: () => {
				session.writable = true;
			}
		});
		return () => {
			session.alive = false;
			unregister();
		};
	}, [session]);
	const change = (patch) => {
		if (!current() || !state.ready) return Promise.resolve(false);
		const value = normalized({
			...session.value,
			...patch,
			loupe: {
				...session.value.loupe,
				...patch.loupe
			}
		});
		session.value = value;
		session.pending++;
		setState({
			owner,
			ready: true,
			value,
			notice: ""
		});
		const work = session.tail.catch(() => {}).then(async () => {
			await session.opening;
			if (!current()) return false;
			try {
				if (await readNotebookDeletionStatus(noteId, clean, current)) throw Error("Cette note a été supprimée. Les réglages précédents restent conservés.");
				const deletionKey = notebookDeletionKey({
					...clean,
					type: "whiteboard",
					documentId: notebookDocumentId(noteId)
				}), deletionRow = await getSnapshot(deletionKey);
				if (!current()) return false;
				if (deletionRow) throw Error("Le statut de cette note doit être réexaminé.");
				const revision = Number((session.row?.value)?.revision ?? 0) + 1, row = {
					key: session.key,
					...clean,
					value: {
						schema: 1,
						kind: "paper-writing-aids",
						...clean,
						noteId,
						revision,
						settings: value,
						updatedAt: (/* @__PURE__ */ new Date()).toISOString()
					}
				};
				const historyKey = session.row ? session.key + "|history|" + notebookIdentityDigest(JSON.stringify(session.row.value)) : void 0, history = historyKey ? await getSnapshot(historyKey) : void 0;
				if (!current()) return false;
				await commitNotebookTransfer({
					target: clean,
					sources: [],
					drafts: [],
					blobs: [],
					snapshots: [row, ...session.row && historyKey && !history ? [{
						...session.row,
						key: historyKey
					}] : []],
					draftChecks: [],
					blobChecks: [],
					snapshotChecks: [
						{
							key: session.key,
							expected: session.row
						},
						{
							key: deletionKey,
							expected: deletionRow
						},
						...historyKey ? [{
							key: historyKey,
							expected: history
						}] : []
					]
				}, current);
				if (!current()) return false;
				session.row = row;
				return true;
			} catch (error) {
				if (current()) setState((old) => old.owner === owner ? {
					...old,
					notice: `Réglages non enregistrés. ${String(error instanceof Error ? error.message : error)}`
				} : old);
				return false;
			}
		}).finally(() => session.pending--);
		session.tail = work.then(() => {});
		return work;
	};
	return {
		value: state.owner === owner ? state.value : defaults(),
		ready: state.owner === owner && state.ready,
		notice: state.owner === owner ? state.notice : "",
		change,
		settled: () => session.tail
	};
}
//#endregion
//#region src/lib/paperSearch.ts
var normalize = (value) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr");
function textMatches(text, query, limit = 100) {
	const needle = normalize(query.trim());
	if (!needle) return [];
	let searchable = "", offset = 0;
	const starts = [], ends = [];
	for (const char of text) {
		const value = normalize(char);
		searchable += value;
		for (let i = 0; i < value.length; i++) {
			starts.push(offset);
			ends.push(offset + char.length);
		}
		offset += char.length;
	}
	const hits = [];
	let at = 0;
	while (hits.length < limit) {
		const position = searchable.indexOf(needle, at);
		if (position < 0) break;
		const start = starts[position], end = ends[position + needle.length - 1];
		hits.push({
			start,
			end,
			excerpt: (start > 55 ? "…" : "") + text.slice(Math.max(0, start - 55), Math.min(text.length, end + 95)) + (end + 95 < text.length ? "…" : "")
		});
		at = position + Math.max(1, needle.length);
	}
	return hits;
}
function searchPaperDocument(document, query, limit = 100) {
	const hits = [];
	for (const page of document.pages) {
		for (const object of document.objects.filter((o) => o.pageId === page.id && (o.kind === "text" || o.kind === "sticky"))) for (const hit of textMatches(object.markdown ?? "", query, limit - hits.length)) {
			hits.push({
				...hit,
				pageId: page.id,
				objectId: object.id,
				kind: "text"
			});
			if (hits.length >= limit) return hits;
		}
		for (const hit of textMatches(page.pdf?.text ?? "", query, limit - hits.length)) {
			hits.push({
				...hit,
				pageId: page.id,
				kind: "pdf"
			});
			if (hits.length >= limit) return hits;
		}
	}
	return hits;
}
//#endregion
//#region src/components/PaperSearchPanel.tsx
var _jsxFileName$8 = "/home/louis/DowzeBuild/20260923/collections-060/src/components/PaperSearchPanel.tsx";
function PaperSearchPanel({ document, onNavigate, onClose }) {
	const [query, setQuery] = useState(""), hits = useMemo(() => searchPaperDocument(document, query), [document, query]);
	return /* @__PURE__ */ jsxDEV("aside", {
		className: "paper-search-panel",
		"aria-label": "Rechercher dans la note",
		children: [/* @__PURE__ */ jsxDEV("header", { children: [
			/* @__PURE__ */ jsxDEV(Search, {}, void 0, false, {
				fileName: _jsxFileName$8,
				lineNumber: 7,
				columnNumber: 92
			}, this),
			/* @__PURE__ */ jsxDEV("input", {
				"aria-label": "Texte à rechercher dans la note",
				autoFocus: true,
				type: "search",
				placeholder: "Rechercher dans cette note",
				value: query,
				onChange: (e) => setQuery(e.target.value)
			}, void 0, false, {
				fileName: _jsxFileName$8,
				lineNumber: 7,
				columnNumber: 101
			}, this),
			/* @__PURE__ */ jsxDEV("button", {
				"aria-label": "Fermer la recherche",
				onClick: onClose,
				children: /* @__PURE__ */ jsxDEV(X, {}, void 0, false, {
					fileName: _jsxFileName$8,
					lineNumber: 7,
					columnNumber: 331
				}, this)
			}, void 0, false, {
				fileName: _jsxFileName$8,
				lineNumber: 7,
				columnNumber: 272
			}, this)
		] }, void 0, true, {
			fileName: _jsxFileName$8,
			lineNumber: 7,
			columnNumber: 84
		}, this), query.trim() && /* @__PURE__ */ jsxDEV(Fragment, { children: [
			/* @__PURE__ */ jsxDEV("p", {
				role: "status",
				children: [
					hits.length,
					hits.length === 100 ? " premières" : "",
					" correspondance",
					hits.length > 1 ? "s" : ""
				]
			}, void 0, true, {
				fileName: _jsxFileName$8,
				lineNumber: 7,
				columnNumber: 370
			}, this),
			/* @__PURE__ */ jsxDEV("div", {
				className: "paper-search-results",
				children: hits.map((hit, index) => /* @__PURE__ */ jsxDEV("button", {
					onClick: () => onNavigate(hit),
					children: [/* @__PURE__ */ jsxDEV("small", { children: [
						"Page ",
						document.pages.findIndex((p) => p.id === hit.pageId) + 1,
						" · ",
						hit.kind === "pdf" ? "Texte PDF" : "Note"
					] }, void 0, true, {
						fileName: _jsxFileName$8,
						lineNumber: 7,
						columnNumber: 635
					}, this), /* @__PURE__ */ jsxDEV("span", { children: hit.excerpt }, void 0, false, {
						fileName: _jsxFileName$8,
						lineNumber: 7,
						columnNumber: 745
					}, this)]
				}, `${hit.pageId}-${hit.objectId}-${hit.start}-${index}`, true, {
					fileName: _jsxFileName$8,
					lineNumber: 7,
					columnNumber: 537
				}, this))
			}, void 0, false, {
				fileName: _jsxFileName$8,
				lineNumber: 7,
				columnNumber: 476
			}, this),
			/* @__PURE__ */ jsxDEV("small", { children: "Le texte des PDF importés est recherché. Les pages scannées et l’écriture manuscrite demandent une reconnaissance supplémentaire." }, void 0, false, {
				fileName: _jsxFileName$8,
				lineNumber: 7,
				columnNumber: 788
			}, this)
		] }, void 0, true, {
			fileName: _jsxFileName$8,
			lineNumber: 7,
			columnNumber: 368
		}, this)]
	}, void 0, true, {
		fileName: _jsxFileName$8,
		lineNumber: 7,
		columnNumber: 9
	}, this);
}
//#endregion
//#region src/lib/paperImageRepair.ts
var paperImageRepair_exports = /* @__PURE__ */ __exportAll({
	inspectPaperImageRepair: () => inspectPaperImageRepair,
	loadPaperImageRepairVersion: () => loadPaperImageRepairVersion,
	preparePaperImageRepair: () => preparePaperImageRepair
});
var states = /* @__PURE__ */ new WeakMap();
var versions = /* @__PURE__ */ new WeakMap();
var record$1 = (v) => !!v && typeof v === "object" && !Array.isArray(v);
var equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
var plainDraft = (v) => v && {
	...v,
	key: void 0
};
var blobState = (v) => v && {
	...v,
	key: void 0,
	blob: void 0,
	size: v.blob.size,
	mediaType: v.blob.type
};
var check$1 = (current) => {
	if (!current()) throw Error("Le compte, l’année ou la note a changé. Les versions originales restent conservées.");
};
var safeId = (v) => typeof v === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{0,126}$/.test(v) && !v.includes("..");
var scopeId = (v) => typeof v === "string" && v.length > 0 && v.length <= 200 && !/[\u0000-\u001f\u007f]/.test(v);
var type = (v) => v.toLowerCase() === "image/jpg" ? "image/jpeg" : v.toLowerCase();
var raster = (v) => typeof v === "string" && [
	"image/png",
	"image/jpeg",
	"image/gif",
	"image/webp"
].includes(type(v));
var ownerKey = (scope, noteId) => `paper-legacy-owner|${scope.accountId}|${scope.spaceId}|whiteboard|${noteBoardId(noteId)}`;
function stateFor(plan) {
	const state = states.get(plan);
	if (!state) throw Error("Ce diagnostic d’image doit être rouvert avant la réparation.");
	return state;
}
async function assertCurrent(state, current) {
	check$1(current);
	for (const row of state.drafts) {
		const latest = await getDraft(row.identity);
		check$1(current);
		if (!equal(plainDraft(latest), plainDraft(row.expected))) throw Error("La note ou sa source a changé après le diagnostic. Rouvrez le choix des images.");
	}
	for (const row of state.snapshots) {
		const latest = await getSnapshot(row.key);
		check$1(current);
		if (!equal(latest, row.expected)) throw Error("Le propriétaire ou la suppression de cette note a changé. Aucun original n’est remplacé.");
	}
	const file = (await listLocalBlobs(state.scope.accountId, state.scope.spaceId)).find((row) => row.id === state.assetId);
	check$1(current);
	if (!equal(blobState(file), blobState(state.file))) throw Error("Le fichier local a changé après le diagnostic. Ses originaux sont conservés.");
	if (state.localOwned && file && await localBlobDigest(file.blob) !== state.localSHA) throw Error("Les octets locaux ont changé après le diagnostic.");
	check$1(current);
}
function replacements(markdown, state, url) {
	const scan = scanLegacyPaperImages(markdown), values = /* @__PURE__ */ new Map();
	for (const image of scan.images) if (image.photo && state.allowed.get(image.photo.documentId)?.has(image.photo.id)) values.set(image.id, url);
	return {
		scan,
		...planLegacyPaperImageRewrite(scan, values),
		count: values.size
	};
}
/** Keep continuation pages/geometry; invalidate measured layout and remap UTF-16 boundaries until the renderer measures it again. */
function remapOffsets(offsets, oldLength, newLength, edits) {
	if (offsets[0] !== 0 || offsets.at(-1) !== oldLength || offsets.some((n, i) => !Number.isSafeInteger(n) || n < 0 || n > oldLength || i > 0 && n < offsets[i - 1])) return void 0;
	return offsets.map((offset, index) => {
		if (index === 0) return 0;
		if (index === offsets.length - 1) return newLength;
		let delta = 0;
		for (const edit of edits) {
			if (offset < edit.from) break;
			if (offset >= edit.to) {
				delta += edit.text.length - (edit.to - edit.from);
				continue;
			}
			return edit.from + delta + Math.min(offset - edit.from, edit.text.length);
		}
		return offset + delta;
	});
}
/** Read-only diagnostic. Merely opening this choice neither downloads bytes nor writes claims or files. */
async function inspectPaperImageRepair(input) {
	const scope = {
		accountId: input.scope.accountId,
		spaceId: input.scope.spaceId
	}, document = structuredClone(input.document), { current } = input;
	check$1(current);
	if (!isPaperDocument(document) || !Object.values(scope).every(scopeId)) throw Error("La note ne possède pas une identité de réparation valide.");
	const documentId = notebookDocumentId(document.noteId), identity = {
		...scope,
		type: "whiteboard",
		documentId
	}, stored = await getDraft(identity);
	check$1(current);
	if (!stored || stored.accountId !== scope.accountId || stored.spaceId !== scope.spaceId || stored.type !== "whiteboard" || stored.documentId !== documentId || stored.identityAlias || stored.staged || stored.syncState === "conflict" || !isPaperDocument(stored.content) || stored.content.noteId !== document.noteId || !equal(stored.content, document)) throw Error("La version de ce carnet doit être retrouvée avant de réparer une image.");
	const asset = document.assets.find((row) => row.id === input.assetId);
	if (!asset) throw Error("Cette image n’appartient plus au carnet courant.");
	const state = {
		scope,
		document,
		assetId: asset.id,
		stored,
		localOwned: false,
		allowed: /* @__PURE__ */ new Map([[documentId, /* @__PURE__ */ new Set([asset.id])]]),
		candidates: /* @__PURE__ */ new Map(),
		drafts: [{
			identity,
			expected: stored
		}],
		snapshots: [],
		ownedSources: []
	};
	const unavailable = [];
	const snapshot = async (key) => {
		const row = await getSnapshot(key);
		check$1(current);
		if (row && (row.accountId !== scope.accountId || row.spaceId !== scope.spaceId)) throw Error("Un reçu d’image appartient à un autre compte ou à une autre année.");
		state.snapshots.push({
			key,
			expected: row
		});
		return row;
	};
	const read = async (documentId, type = "whiteboard") => {
		const identity = {
			...scope,
			type,
			documentId
		}, row = await getDraft(identity);
		check$1(current);
		if (row && (row.accountId !== scope.accountId || row.spaceId !== scope.spaceId || row.type !== type || row.documentId !== documentId)) throw Error("Une source appartient à un autre compte, une autre année ou une autre identité complète.");
		state.drafts.push({
			identity,
			expected: row
		});
		return row;
	};
	if (await readNotebookDeletionStatus(document.noteId, scope, current)) throw Error("Cette note a été supprimée. Sa réparation ne peut pas la recréer.");
	check$1(current);
	if (await snapshot(notebookDeletionKey(identity))) throw Error("La suppression de cette note doit être départagée avant la réparation.");
	state.metadata = await read(document.noteId, "notesMarkdown");
	if (state.metadata && (!record$1(state.metadata.content) || state.metadata.content.id !== document.noteId || state.metadata.staged || state.metadata.identityAlias || state.metadata.syncState === "conflict" || state.metadata.paperDependency && state.metadata.paperDependency !== documentId)) throw Error("Les métadonnées de cette note doivent être départagées avant la réparation.");
	const claim = await snapshot(ownerKey(scope, document.noteId)), board = noteBoardId(document.noteId);
	if (claim && (!record$1(claim.value) || claim.value.schema !== 1 || claim.value.noteId !== document.noteId || claim.value.documentId !== documentId || claim.value.boardId !== board || !Number.isFinite(Date.parse(String(claim.value.claimedAt))))) throw Error("Le propriétaire historique de cette note est contradictoire. Aucun fichier n’est emprunté.");
	const claimProved = !!claim;
	if (claimProved && document.legacy.boardId === board) for (const alias of [
		board,
		legacyNotebookDocumentId(document.noteId),
		`paper-v3-${document.noteId}`,
		document.noteId
	]) state.allowed.set(alias, /* @__PURE__ */ new Set([asset.id]));
	const addServer = (descriptor, source, label) => {
		if (!safeId(descriptor.serverId) || !raster(descriptor.mediaType) || descriptor.size !== void 0 && (!Number.isSafeInteger(descriptor.size) || Number(descriptor.size) < 0 || Number(descriptor.size) > 16777216) || descriptor.sha256 !== void 0 && (typeof descriptor.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(descriptor.sha256))) {
			unavailable.push({
				kind: "server",
				message: "Une version serveur possède un manifeste incompatible. Aucun téléchargement n’est demandé pour cette version."
			});
			return;
		}
		const value = {
			kind: "server",
			label,
			name: typeof descriptor.name === "string" ? descriptor.name.slice(0, 300) : asset.name,
			mediaType: type(descriptor.mediaType),
			...Number(descriptor.size) > 0 ? { size: Number(descriptor.size) } : {},
			...descriptor.sha256 ? { sha256: String(descriptor.sha256) } : {},
			serverId: descriptor.serverId,
			source
		};
		const id = `version-${notebookIdentityDigest(JSON.stringify(value))}`;
		state.candidates.set(id, Object.freeze({
			id,
			...value,
			source: Object.freeze({ ...source })
		}));
	};
	if (asset.serverId) addServer(asset, {
		noteId: document.noteId,
		documentId,
		assetId: asset.id
	}, "Original indiqué par le carnet");
	if (input.historicalSource) {
		const source = {
			documentId: input.historicalSource.documentId,
			assetId: input.historicalSource.assetId
		}, row = await read(source.documentId), ownGraph = !!row && isPaperDocument(row.content) && row.content.noteId === document.noteId && [documentId, legacyNotebookDocumentId(document.noteId)].includes(source.documentId), ownBoard = source.documentId === board && claimProved;
		if (!row || row.staged || row.syncState === "conflict" || row.identityAlias || !ownGraph && !ownBoard || !record$1(row.content) || ownBoard && !ownGraph && !state.metadata || isPaperDocument(row.content) && row.content.noteId !== document.noteId || record$1(row.content) && row.content.notebookSchema === 3 && !isPaperDocument(row.content) || source.assetId !== asset.id && document.assets.some((other) => other.id === source.assetId)) unavailable.push({
			kind: "historical",
			message: "Cette source historique ne possède pas un propriétaire complet prouvé ou sa référence est déjà utilisée par une autre image. Ses fichiers ne sont ni affichés ni empruntés."
		});
		else {
			const descriptors = (isPaperDocument(row.content) ? row.content.assets : source.documentId === board && Array.isArray(row.content.photos) ? row.content.photos : []).filter((v) => record$1(v) && v.id === source.assetId);
			if (!descriptors.length) unavailable.push({
				kind: "historical",
				message: "La source historique ne contient plus le manifeste de cette image."
			});
			else {
				state.ownedSources.push(row);
				const allowed = state.allowed.get(source.documentId) ?? /* @__PURE__ */ new Set();
				allowed.add(source.assetId);
				state.allowed.set(source.documentId, allowed);
				for (const descriptor of descriptors) addServer(descriptor, {
					noteId: document.noteId,
					...source
				}, "Original historique à choisir");
			}
		}
	}
	const file = (await listLocalBlobs(scope.accountId, scope.spaceId)).find((row) => row.id === asset.id);
	check$1(current);
	state.file = file;
	if (file) {
		const tag = file.documentId, canonical = tag === documentId, legacy = !!tag && claimProved && document.legacy.boardId === board && [
			board,
			legacyNotebookDocumentId(document.noteId),
			`paper-v3-${document.noteId}`,
			document.noteId
		].includes(tag);
		let proved = canonical || legacy;
		if (proved && tag && tag !== documentId) {
			const associated = await read(tag);
			if (associated && (associated.staged || associated.syncState === "conflict" || associated.identityAlias || isPaperDocument(associated.content) && associated.content.noteId !== document.noteId || record$1(associated.content) && associated.content.notebookSchema === 3 && !isPaperDocument(associated.content))) proved = false;
		}
		if (!proved || file.removedFromNote) unavailable.push({
			kind: "local",
			message: "Le fichier local ne possède pas un propriétaire utilisable prouvé. Il reste conservé et ne sera pas affiché."
		});
		else try {
			if (!raster(file.blob.type)) throw Error("Ce fichier local n’est pas un original raster pris en charge.");
			validateLegacyRasterBytes(new Uint8Array(await file.blob.arrayBuffer()), file.blob.type);
			check$1(current);
			const sha256 = await localBlobDigest(file.blob);
			check$1(current);
			if (file.sha256 && file.sha256 !== sha256) throw Error("L’empreinte du fichier local ne correspond plus à ses octets.");
			state.localOwned = true;
			state.localSHA = sha256;
			const source = {
				noteId: document.noteId,
				documentId: tag,
				assetId: file.id
			}, value = {
				kind: "local",
				label: "Copie conservée sur cet appareil",
				name: file.name,
				mediaType: type(file.blob.type),
				size: file.blob.size,
				sha256,
				...file.serverId ? { serverId: file.serverId } : {},
				source
			}, id = `version-${notebookIdentityDigest(JSON.stringify(value))}`;
			state.candidates.set(id, Object.freeze({
				id,
				...value,
				source: Object.freeze(source)
			}));
		} catch (error) {
			check$1(current);
			unavailable.push({
				kind: "local",
				message: error instanceof Error ? error.message : "Le fichier local ne peut pas être vérifié."
			});
		}
	}
	const floating = document.objects.filter((row) => row.kind === "image" && row.assetId === asset.id).length, inline = document.objects.reduce((sum, row) => sum + (row.kind === "text" || row.kind === "sticky" ? scanLegacyPaperImages(row.markdown ?? "").images.filter((image) => image.photo && state.allowed.get(image.photo.documentId)?.has(image.photo.id)).length : 0), 0);
	const id = notebookIdentityDigest(JSON.stringify({
		scope,
		document,
		asset,
		file: blobState(file),
		localSHA: state.localSHA,
		drafts: state.drafts.map((row) => plainDraft(row.expected)),
		snapshots: state.snapshots,
		candidates: [...state.candidates.values()]
	}));
	const reason = input.historicalSource ? "historical-source" : !file ? "missing-file" : !state.localOwned ? "unproved-file" : asset.serverId && file.serverId !== asset.serverId ? "server-mismatch" : asset.size > 0 && asset.size !== file.blob.size ? "size-mismatch" : "explicit-version";
	const plan = Object.freeze({
		schema: 1,
		id,
		noteId: document.noteId,
		documentId,
		asset: Object.freeze({ ...asset }),
		reason,
		candidates: Object.freeze([...state.candidates.values()]),
		unavailable: Object.freeze(unavailable.map((row) => Object.freeze(row))),
		references: Object.freeze({
			floating,
			inline
		})
	});
	states.set(plan, state);
	return plan;
}
/** A download remains in RAM and is bound to the captured account/source. No candidate is chosen implicitly. */
async function loadPaperImageRepairVersion(plan, versionId, input) {
	const state = stateFor(plan), candidate = state.candidates.get(versionId);
	if (!candidate) throw Error("Choisissez explicitement une version prouvée de cette image.");
	await assertCurrent(state, input.current);
	let original;
	if (candidate.kind === "local") {
		if (!state.localOwned || !state.file) throw Error("Ce fichier local ne possède pas un propriétaire prouvé.");
		original = state.file.blob;
	} else {
		if (!input.downloadOriginal) throw Error("Connectez cet appareil pour charger cette version originale avant de la choisir.");
		original = await input.downloadOriginal({
			...state.scope,
			...candidate.source,
			serverId: candidate.serverId,
			name: candidate.name,
			mediaType: candidate.mediaType,
			...candidate.size ? { size: candidate.size } : {},
			...candidate.sha256 ? { sha256: candidate.sha256 } : {}
		});
	}
	check$1(input.current);
	if (!(original instanceof Blob)) throw Error("Cette version ne possède pas un original binaire valide.");
	const servedType = type(original.type.split(";")[0].trim());
	if (servedType && servedType !== "application/octet-stream" && servedType !== candidate.mediaType) throw Error("Le type de cette version ne correspond pas à son manifeste.");
	const blob = new Blob([original], { type: candidate.mediaType }), bytes = new Uint8Array(await blob.arrayBuffer());
	check$1(input.current);
	validateLegacyRasterBytes(bytes, candidate.mediaType);
	if (candidate.size && candidate.size !== blob.size) throw Error("La taille de cette version ne correspond pas à son manifeste.");
	const sha256 = await localBlobDigest(blob);
	check$1(input.current);
	if (candidate.sha256 && candidate.sha256 !== sha256) throw Error("L’empreinte de cette version ne correspond pas à son manifeste.");
	await assertCurrent(state, input.current);
	const version = Object.freeze({
		planId: plan.id,
		versionId,
		sha256,
		size: blob.size,
		mediaType: candidate.mediaType,
		blob
	});
	versions.set(version, {
		plan,
		candidate,
		blob,
		sha256
	});
	return version;
}
/** Plan a new owned UUID copy, its references, metadata and recovery receipts under a single transaction. */
async function preparePaperImageRepair(input) {
	const { plan, version, current } = input, state = stateFor(plan), loaded = versions.get(version);
	check$1(current);
	if (!loaded || loaded.plan !== plan || version.planId !== plan.id || !state.candidates.has(version.versionId)) throw Error("La version choisie doit être chargée depuis ce diagnostic avant la réparation.");
	await assertCurrent(state, current);
	const id = (input.newId ?? (() => crypto.randomUUID()))(), files = await listLocalBlobs(state.scope.accountId, state.scope.spaceId);
	check$1(current);
	if (!safeId(id) || state.document.assets.some((asset) => asset.id === id) || files.some((file) => file.id === id)) throw Error("La réparation nécessite une nouvelle identité libre. Aucun fichier n’est remplacé.");
	const now = input.now ?? (/* @__PURE__ */ new Date()).toISOString();
	if (!Number.isFinite(Date.parse(now))) throw Error("La date de réparation est incompatible.");
	const asset = {
		id,
		name: loaded.candidate.name,
		mediaType: loaded.candidate.mediaType,
		size: loaded.blob.size
	}, url = photoReference(plan.documentId, id), commands = [{
		type: "add-asset",
		asset
	}], changedObjects = [];
	for (const object of state.document.objects) if (object.kind === "image" && object.assetId === plan.asset.id) {
		commands.push({
			type: "patch-object",
			id: object.id,
			patch: { assetId: id }
		});
		changedObjects.push(object.id);
	} else if (object.kind === "text" || object.kind === "sticky") {
		const before = object.markdown ?? "", result = replacements(before, state, url);
		if (result.markdown === before) continue;
		const textFlow = object.textFlow ? {
			...object.textFlow,
			source: "",
			sourceOffsets: object.textFlow.sourceOffsets ? remapOffsets(object.textFlow.sourceOffsets, before.length, result.markdown.length, result.edits) : void 0
		} : void 0;
		commands.push({
			type: "patch-object",
			id: object.id,
			patch: {
				markdown: result.markdown,
				...object.textFlow ? { textFlow } : {}
			}
		});
		changedObjects.push(object.id);
	}
	if (!changedObjects.length) throw Error("Cette image n’a plus de référence active à réparer. Les originaux restent conservés.");
	if (state.document.pages.some((page) => page.pdf?.assetId === plan.asset.id) || state.document.audio.some((audio) => audio.assetId === plan.asset.id || audio.source?.chunks.some((chunk) => chunk.assetId === plan.asset.id) || audio.segments?.some((segment) => segment.assetId === plan.asset.id || segment.source?.chunks.some((chunk) => chunk.assetId === plan.asset.id)))) throw Error("Cet original est aussi utilisé par un PDF ou une piste audio. Ces usages doivent être départagés avant de réparer son image.");
	const applied = applyPaperCommand(state.document, {
		type: "batch",
		commands
	}, now), active = {
		...applied,
		assets: applied.assets.filter((asset) => asset.id !== plan.asset.id)
	};
	if (!isPaperDocument(active) || active.objects.some((object) => object.kind === "image" && object.assetId === plan.asset.id) || active.objects.some((object) => (object.kind === "text" || object.kind === "sticky") && replacements(object.markdown ?? "", state, url).count)) throw Error("Cet original possède encore une référence active. La réparation ne modifie aucun fichier.");
	const next = amendPaperCollaboration(state.document, active, JSON.stringify([
		state.scope.accountId,
		state.scope.spaceId,
		state.document.noteId
	]));
	const draft = {
		...state.stored,
		content: next,
		updatedAt: Date.parse(now),
		syncState: "local"
	};
	let metadataDraft, metadataChange;
	if (state.metadata && record$1(state.metadata.content) && typeof state.metadata.content.markdown === "string") {
		const markdown = replacements(state.metadata.content.markdown, state, url).markdown;
		if (markdown !== state.metadata.content.markdown) {
			metadataDraft = {
				...state.metadata,
				content: {
					...state.metadata.content,
					markdown
				},
				updatedAt: Date.parse(now),
				syncState: "local",
				paperDependency: plan.documentId
			};
			metadataChange = {
				beforeMarkdown: state.metadata.content.markdown,
				afterMarkdown: markdown
			};
		}
	}
	const receiptKey = `paper-image-repair|${notebookIdentityDigest(JSON.stringify([
		state.scope.accountId,
		state.scope.spaceId,
		plan.noteId
	]))}|${id}`, historyKey = `paper-history|${state.scope.accountId}|${state.scope.spaceId}|whiteboard|${plan.documentId}|${String(state.document.revision).padStart(12, "0")}`;
	const [existingReceipt, history] = await Promise.all([getSnapshot(receiptKey), getSnapshot(historyKey)]);
	check$1(current);
	if (existingReceipt) throw Error("Un autre reçu utilise cette identité. Aucun original n’est remplacé.");
	const historyMatches = !!history && history.accountId === state.scope.accountId && history.spaceId === state.scope.spaceId && equal(history.value, state.document), beforeHistoryKey = history && !historyMatches ? `${historyKey}|image-repair-${id}` : historyKey;
	if (beforeHistoryKey !== historyKey && await getSnapshot(beforeHistoryKey)) throw Error("Une autre version utilise cette identité historique.");
	check$1(current);
	const sourceClaims = state.snapshots.flatMap(({ expected: row }) => {
		const value = row?.value;
		if (!row || !record$1(value) || row.key !== ownerKey(state.scope, plan.noteId)) return [];
		return [{
			key: row.key,
			...state.scope,
			value: {
				schema: 1,
				noteId: value.noteId,
				documentId: value.documentId,
				boardId: value.boardId,
				claimedAt: value.claimedAt
			}
		}];
	});
	const value = {
		schema: 1,
		kind: "paper-image-repair",
		noteId: plan.noteId,
		documentId: plan.documentId,
		planId: plan.id,
		originalAsset: { ...plan.asset },
		...state.file ? { retainedFile: {
			id: state.file.id,
			ownership: state.localOwned ? "proved" : "unproved",
			...state.localOwned ? {
				serverId: state.file.serverId,
				sha256: state.localSHA
			} : {}
		} } : {},
		chosen: {
			...loaded.candidate,
			sha256: loaded.sha256,
			size: loaded.blob.size
		},
		copy: {
			assetId: id,
			sha256: loaded.sha256,
			size: loaded.blob.size,
			mediaType: asset.mediaType
		},
		sourceDrafts: state.ownedSources.map((row) => structuredClone(row)),
		sourceClaims,
		beforeHistoryKey,
		changedObjects,
		...state.metadata ? { originalMetadata: structuredClone(state.metadata) } : {},
		repairedAt: now
	};
	const receipt = {
		key: receiptKey,
		...state.scope,
		value
	};
	const commit = {
		target: state.scope,
		sources: [state.scope],
		drafts: [draft, ...metadataDraft ? [metadataDraft] : []],
		blobs: [{
			...state.scope,
			id,
			documentId: plan.documentId,
			blob: loaded.blob,
			name: asset.name,
			createdAt: Date.parse(now),
			status: "pending",
			removedFromNote: false,
			revision: 1,
			sha256: loaded.sha256
		}],
		snapshots: [receipt, ...!historyMatches ? [{
			key: beforeHistoryKey,
			...state.scope,
			value: state.document
		}] : []],
		draftChecks: state.drafts,
		blobChecks: [{
			identity: {
				...state.scope,
				id: plan.asset.id
			},
			expected: state.file
		}, {
			identity: {
				...state.scope,
				id
			},
			expected: void 0
		}],
		snapshotChecks: [
			...state.snapshots,
			{
				key: receiptKey,
				expected: void 0
			},
			{
				key: historyKey,
				expected: history
			},
			...beforeHistoryKey !== historyKey ? [{
				key: beforeHistoryKey,
				expected: void 0
			}] : []
		]
	};
	return {
		draft,
		...metadataDraft ? {
			metadataDraft,
			metadataChange
		} : {},
		asset,
		url,
		receipt,
		commit
	};
}
//#endregion
//#region src/components/PaperImageRepair.tsx
var _jsxFileName$7 = "/home/louis/DowzeBuild/20260923/collections-060/src/components/PaperImageRepair.tsx";
/** An explicit choice repairs only the selected references. Original versions
* remain in the receipt/history and their bytes are never overwritten. */
function PaperImageRepair(props) {
	const scope = JSON.stringify([
		props.media.accountId,
		props.media.spaceId,
		props.noteId
	]), rendered = useRef(scope);
	rendered.current = scope;
	const live = useRef(true), latest = useRef(props);
	latest.current = props;
	const request = useRef(0), trigger = useRef(null), panel = useRef(null);
	const [open, setOpen] = useState(false), [source, setSource] = useState(null), [plan, setPlan] = useState(null), [version, setVersion] = useState(null), [busy, setBusy] = useState(false), [mutating, setMutating] = useState(false), [notice, setNotice] = useState(""), [url, setUrl] = useState("");
	useEffect(() => {
		live.current = true;
		return () => {
			live.current = false;
			request.current++;
		};
	}, []);
	useEffect(() => {
		request.current++;
		setOpen(false);
		setSource(null);
		setPlan(null);
		setVersion(null);
		setBusy(false);
		setMutating(false);
		setNotice("");
	}, [scope]);
	useEffect(() => {
		if (!version) {
			setUrl("");
			return;
		}
		const next = URL.createObjectURL(version.blob);
		setUrl(next);
		return () => URL.revokeObjectURL(next);
	}, [version]);
	useEffect(() => {
		if (open) panel.current?.querySelector("button:not(:disabled)")?.focus();
	}, [open]);
	const close = () => {
		if (mutating) return;
		request.current++;
		setOpen(false);
		setVersion(null);
		setBusy(false);
		trigger.current?.focus();
	};
	const begin = async () => {
		const nonce = ++request.current, valid = () => live.current && rendered.current === scope && request.current === nonce;
		setOpen(true);
		setPlan(null);
		setVersion(null);
		setSource(null);
		setNotice("Lecture des versions conservées…");
		setBusy(true);
		try {
			const doc = await latest.current.getDocument();
			if (!valid()) return;
			if (!doc || doc.noteId !== props.noteId) throw Error("La note doit être retrouvée avant de choisir une image.");
			setSource(doc);
			setNotice(doc.assets.some((asset) => asset.mediaType.startsWith("image/")) ? "Choisissez l’image à examiner." : "Cette note ne contient aucune image à réparer.");
		} catch (error) {
			if (valid()) setNotice(String(error instanceof Error ? error.message : error));
		} finally {
			if (valid()) setBusy(false);
		}
	};
	const inspect = async (assetId) => {
		if (!source) return;
		const nonce = ++request.current, valid = () => live.current && rendered.current === scope && request.current === nonce;
		setBusy(true);
		setVersion(null);
		setPlan(null);
		try {
			const result = await inspectPaperImageRepair({
				document: source,
				assetId,
				scope: props.media,
				current: valid
			});
			if (valid()) {
				setPlan(result);
				setNotice("Chargez une version pour la prévisualiser, puis confirmez votre choix.");
			}
		} catch (error) {
			if (valid()) setNotice(String(error instanceof Error ? error.message : error));
		} finally {
			if (valid()) setBusy(false);
		}
	};
	const choose = async (versionId) => {
		if (!plan) return;
		const nonce = ++request.current, valid = () => live.current && rendered.current === scope && request.current === nonce;
		setBusy(true);
		setVersion(null);
		try {
			const result = await loadPaperImageRepairVersion(plan, versionId, {
				current: valid,
				downloadOriginal: latest.current.downloadOriginal
			});
			if (valid()) {
				setVersion(result);
				setNotice("Cette version est prête à être choisie. L’original restera conservé.");
			}
		} catch (error) {
			if (valid()) setNotice(String(error instanceof Error ? error.message : error));
		} finally {
			if (valid()) setBusy(false);
		}
	};
	const apply = async () => {
		if (!live.current || rendered.current !== scope || !plan || !version) return;
		const nonce = ++request.current, valid = () => live.current && rendered.current === scope && request.current === nonce;
		if (!valid()) return;
		const handler = latest.current.onApply;
		setBusy(true);
		setMutating(true);
		try {
			await handler(plan, version);
			if (valid()) {
				setNotice("Image réparée. Les autres versions restent dans l’historique de la note.");
				setVersion(null);
				setPlan(null);
				const doc = await latest.current.getDocument();
				if (valid()) setSource(doc);
			}
		} catch (error) {
			if (valid()) setNotice(String(error instanceof Error ? error.message : error));
		} finally {
			if (valid()) {
				setBusy(false);
				setMutating(false);
			}
		}
	};
	return /* @__PURE__ */ jsxDEV("div", {
		className: "paper-image-repair",
		children: [/* @__PURE__ */ jsxDEV("button", {
			ref: trigger,
			type: "button",
			"aria-label": "Examiner et réparer les images",
			disabled: props.disabled,
			"aria-expanded": open,
			onClick: () => void begin(),
			children: [/* @__PURE__ */ jsxDEV(ImageOff, {}, void 0, false, {
				fileName: _jsxFileName$7,
				lineNumber: 22,
				columnNumber: 199
			}, this), /* @__PURE__ */ jsxDEV("span", { children: "Réparer les images" }, void 0, false, {
				fileName: _jsxFileName$7,
				lineNumber: 22,
				columnNumber: 210
			}, this)]
		}, void 0, true, {
			fileName: _jsxFileName$7,
			lineNumber: 22,
			columnNumber: 45
		}, this), open && /* @__PURE__ */ jsxDEV(Fragment, { children: [/* @__PURE__ */ jsxDEV("div", {
			className: "paper-repair-backdrop",
			onClick: mutating ? void 0 : close
		}, void 0, false, {
			fileName: _jsxFileName$7,
			lineNumber: 22,
			columnNumber: 259
		}, this), /* @__PURE__ */ jsxDEV("section", {
			className: "paper-repair-panel",
			ref: panel,
			role: "dialog",
			"aria-modal": "true",
			"aria-label": "Réparer les images de la note",
			onKeyDown: (event) => {
				if (event.key === "Escape") {
					event.preventDefault();
					event.stopPropagation();
					if (!mutating) close();
				}
				if (event.key === "Tab") {
					const controls = [...event.currentTarget.querySelectorAll("button:not(:disabled),select:not(:disabled),[tabindex=\"0\"]")].filter((control) => control.offsetParent !== null), first = controls[0], last = controls.at(-1);
					if (event.shiftKey && window.document.activeElement === first) {
						event.preventDefault();
						last?.focus();
					} else if (!event.shiftKey && window.document.activeElement === last) {
						event.preventDefault();
						first?.focus();
					}
				}
			},
			children: [
				/* @__PURE__ */ jsxDEV("header", { children: [/* @__PURE__ */ jsxDEV("h3", { children: "Réparer une image" }, void 0, false, {
					fileName: _jsxFileName$7,
					lineNumber: 22,
					columnNumber: 1022
				}, this), /* @__PURE__ */ jsxDEV("button", {
					type: "button",
					disabled: mutating,
					"aria-label": "Fermer la réparation des images",
					onClick: close,
					children: /* @__PURE__ */ jsxDEV(X, {}, void 0, false, {
						fileName: _jsxFileName$7,
						lineNumber: 22,
						columnNumber: 1151
					}, this)
				}, void 0, false, {
					fileName: _jsxFileName$7,
					lineNumber: 22,
					columnNumber: 1048
				}, this)] }, void 0, true, {
					fileName: _jsxFileName$7,
					lineNumber: 22,
					columnNumber: 1014
				}, this),
				/* @__PURE__ */ jsxDEV("p", { children: "Comparez les versions, puis choisissez celle à utiliser. Aucun fichier original ne sera supprimé." }, void 0, false, {
					fileName: _jsxFileName$7,
					lineNumber: 22,
					columnNumber: 1173
				}, this),
				/* @__PURE__ */ jsxDEV("label", { children: ["Image", /* @__PURE__ */ jsxDEV("select", {
					"aria-label": "Image à réparer",
					value: plan?.asset.id ?? "",
					disabled: busy || !source,
					onChange: (event) => {
						if (event.target.value) inspect(event.target.value);
					},
					children: [/* @__PURE__ */ jsxDEV("option", {
						value: "",
						children: "Choisir une image…"
					}, void 0, false, {
						fileName: _jsxFileName$7,
						lineNumber: 23,
						columnNumber: 179
					}, this), source?.assets.filter((asset) => asset.mediaType.startsWith("image/")).map((asset) => /* @__PURE__ */ jsxDEV("option", {
						value: asset.id,
						children: asset.name
					}, asset.id, false, {
						fileName: _jsxFileName$7,
						lineNumber: 23,
						columnNumber: 302
					}, this))]
				}, void 0, true, {
					fileName: _jsxFileName$7,
					lineNumber: 23,
					columnNumber: 14
				}, this)] }, void 0, true, {
					fileName: _jsxFileName$7,
					lineNumber: 23,
					columnNumber: 2
				}, this),
				plan && /* @__PURE__ */ jsxDEV(Fragment, { children: [
					/* @__PURE__ */ jsxDEV("p", { children: [
						plan.references.floating,
						" image",
						plan.references.floating > 1 ? "s" : "",
						" sur la feuille · ",
						plan.references.inline,
						" référence",
						plan.references.inline > 1 ? "s" : "",
						" dans le texte"
					] }, void 0, true, {
						fileName: _jsxFileName$7,
						lineNumber: 24,
						columnNumber: 11
					}, this),
					/* @__PURE__ */ jsxDEV("div", {
						className: "paper-repair-versions",
						children: plan.candidates.map((candidate) => /* @__PURE__ */ jsxDEV("button", {
							type: "button",
							disabled: busy,
							"aria-label": `Prévisualiser ${candidate.label}`,
							"aria-pressed": version?.versionId === candidate.id,
							onClick: () => void choose(candidate.id),
							children: [/* @__PURE__ */ jsxDEV("strong", { children: candidate.label }, void 0, false, {
								fileName: _jsxFileName$7,
								lineNumber: 24,
								columnNumber: 449
							}, this), /* @__PURE__ */ jsxDEV("span", { children: [
								candidate.name,
								" · ",
								candidate.mediaType,
								candidate.size ? ` · ${Math.round(candidate.size / 1024)} Ko` : ""
							] }, void 0, true, {
								fileName: _jsxFileName$7,
								lineNumber: 24,
								columnNumber: 483
							}, this)]
						}, candidate.id, true, {
							fileName: _jsxFileName$7,
							lineNumber: 24,
							columnNumber: 255
						}, this))
					}, void 0, false, {
						fileName: _jsxFileName$7,
						lineNumber: 24,
						columnNumber: 184
					}, this),
					plan.unavailable.map((item, index) => /* @__PURE__ */ jsxDEV("p", {
						className: "paper-repair-unavailable",
						children: item.message
					}, index, false, {
						fileName: _jsxFileName$7,
						lineNumber: 24,
						columnNumber: 651
					}, this))
				] }, void 0, true, {
					fileName: _jsxFileName$7,
					lineNumber: 24,
					columnNumber: 9
				}, this),
				version && url && /* @__PURE__ */ jsxDEV("figure", { children: [/* @__PURE__ */ jsxDEV("img", {
					src: url,
					alt: "Version de l’image choisie pour la réparation"
				}, void 0, false, {
					fileName: _jsxFileName$7,
					lineNumber: 25,
					columnNumber: 25
				}, this), /* @__PURE__ */ jsxDEV("figcaption", { children: [
					"Version vérifiée · ",
					Math.round(version.size / 1024),
					" Ko"
				] }, void 0, true, {
					fileName: _jsxFileName$7,
					lineNumber: 25,
					columnNumber: 93
				}, this)] }, void 0, true, {
					fileName: _jsxFileName$7,
					lineNumber: 25,
					columnNumber: 17
				}, this),
				/* @__PURE__ */ jsxDEV("p", {
					role: "status",
					children: busy ? "Vérification en cours…" : notice
				}, void 0, false, {
					fileName: _jsxFileName$7,
					lineNumber: 26,
					columnNumber: 2
				}, this),
				/* @__PURE__ */ jsxDEV("footer", { children: [/* @__PURE__ */ jsxDEV("button", {
					type: "button",
					disabled: mutating,
					onClick: close,
					children: "Fermer"
				}, void 0, false, {
					fileName: _jsxFileName$7,
					lineNumber: 26,
					columnNumber: 69
				}, this), /* @__PURE__ */ jsxDEV("button", {
					type: "button",
					"aria-label": "Utiliser cette version de l’image",
					disabled: busy || !plan || !version,
					onClick: () => void apply(),
					children: [busy ? /* @__PURE__ */ jsxDEV(RefreshCw, {}, void 0, false, {
						fileName: _jsxFileName$7,
						lineNumber: 26,
						columnNumber: 277
					}, this) : /* @__PURE__ */ jsxDEV(Check, {}, void 0, false, {
						fileName: _jsxFileName$7,
						lineNumber: 26,
						columnNumber: 290
					}, this), "Utiliser cette version"]
				}, void 0, true, {
					fileName: _jsxFileName$7,
					lineNumber: 26,
					columnNumber: 142
				}, this)] }, void 0, true, {
					fileName: _jsxFileName$7,
					lineNumber: 26,
					columnNumber: 61
				}, this)
			]
		}, void 0, true, {
			fileName: _jsxFileName$7,
			lineNumber: 22,
			columnNumber: 334
		}, this)] }, void 0, true, {
			fileName: _jsxFileName$7,
			lineNumber: 22,
			columnNumber: 257
		}, this)]
	}, void 0, true, {
		fileName: _jsxFileName$7,
		lineNumber: 22,
		columnNumber: 9
	}, this);
}
//#endregion
//#region src/components/PaperInkSelectionActions.tsx
var _jsxFileName$6 = "/home/louis/DowzeBuild/20260923/collections-060/src/components/PaperInkSelectionActions.tsx";
function PaperInkSelectionActions({ document, selected, pageId, onCommit, onNotice }) {
	const chosen = document.objects.filter((object) => selected.includes(object.id) && !object.locked), stroke = chosen.filter((object) => object.kind === "ink" || object.kind === "shape"), styles = new Set(stroke.map((object) => object.strokeStyle ?? "solid"));
	const mirror = (axis) => {
		try {
			const command = mirrorPaperSelection(document, selected, axis, pageId);
			if (command) onCommit(command);
		} catch (error) {
			onNotice(error instanceof Error ? error.message : String(error));
		}
	};
	return /* @__PURE__ */ jsxDEV(Fragment, { children: [
		/* @__PURE__ */ jsxDEV("button", {
			type: "button",
			"aria-label": "Miroir horizontal de la sélection",
			disabled: !chosen.length,
			onClick: () => mirror("horizontal"),
			children: /* @__PURE__ */ jsxDEV(FlipHorizontal, {}, void 0, false, {
				fileName: _jsxFileName$6,
				lineNumber: 7,
				columnNumber: 141
			}, this)
		}, void 0, false, {
			fileName: _jsxFileName$6,
			lineNumber: 7,
			columnNumber: 11
		}, this),
		/* @__PURE__ */ jsxDEV("button", {
			type: "button",
			"aria-label": "Miroir vertical de la sélection",
			disabled: !chosen.length,
			onClick: () => mirror("vertical"),
			children: /* @__PURE__ */ jsxDEV(FlipVertical, {}, void 0, false, {
				fileName: _jsxFileName$6,
				lineNumber: 7,
				columnNumber: 293
			}, this)
		}, void 0, false, {
			fileName: _jsxFileName$6,
			lineNumber: 7,
			columnNumber: 167
		}, this),
		/* @__PURE__ */ jsxDEV("label", { children: ["Style du trait", /* @__PURE__ */ jsxDEV("select", {
			"aria-label": "Style des traits sélectionnés",
			value: styles.size === 1 ? [...styles][0] : "",
			disabled: !stroke.length,
			onChange: (event) => {
				try {
					const command = setPaperSelectionStrokeStyle(document, selected, event.target.value);
					if (command) onCommit(command);
				} catch (error) {
					onNotice(error instanceof Error ? error.message : String(error));
				}
			},
			children: [
				styles.size !== 1 && /* @__PURE__ */ jsxDEV("option", {
					value: "",
					children: "Styles différents"
				}, void 0, false, {
					fileName: _jsxFileName$6,
					lineNumber: 7,
					columnNumber: 706
				}, this),
				/* @__PURE__ */ jsxDEV("option", {
					value: "solid",
					children: "Continu"
				}, void 0, false, {
					fileName: _jsxFileName$6,
					lineNumber: 7,
					columnNumber: 750
				}, this),
				/* @__PURE__ */ jsxDEV("option", {
					value: "dashed",
					children: "Tirets"
				}, void 0, false, {
					fileName: _jsxFileName$6,
					lineNumber: 7,
					columnNumber: 788
				}, this),
				/* @__PURE__ */ jsxDEV("option", {
					value: "dotted",
					children: "Pointillés"
				}, void 0, false, {
					fileName: _jsxFileName$6,
					lineNumber: 7,
					columnNumber: 826
				}, this)
			]
		}, void 0, true, {
			fileName: _jsxFileName$6,
			lineNumber: 7,
			columnNumber: 338
		}, this)] }, void 0, true, {
			fileName: _jsxFileName$6,
			lineNumber: 7,
			columnNumber: 317
		}, this)
	] }, void 0, true, {
		fileName: _jsxFileName$6,
		lineNumber: 7,
		columnNumber: 9
	}, this);
}
//#endregion
//#region src/components/PaperSelectionTools.tsx
var _jsxFileName$5 = "/home/louis/DowzeBuild/20260923/collections-060/src/components/PaperSelectionTools.tsx";
function PaperSelectionTools({ document, pageId, objects, selected, media, onCommit, onSelect, onNotice, onCommand }) {
	const alive = useRef(true), lease = useRef({
		key: "",
		epoch: 0
	}), latestDocument = useRef(document);
	latestDocument.current = document;
	const key = JSON.stringify([
		media.accountId,
		media.spaceId,
		document.noteId,
		pageId
	]);
	if (lease.current.key !== key) lease.current = {
		key,
		epoch: lease.current.epoch + 1
	};
	const epoch = lease.current.epoch, current = () => alive.current && lease.current.epoch === epoch && latestDocument.current.revision === document.revision;
	useEffect(() => {
		alive.current = true;
		return () => {
			alive.current = false;
		};
	}, []);
	const [busy, setBusy] = useState(false), [clipboard, setClipboard] = useState(hasPaperSelection(media));
	const chosen = objects.filter((o) => selected.includes(o.id)), one = chosen.length === 1 ? chosen[0] : null, editable = chosen.filter((o) => !o.locked);
	const batch = (patch) => current() && onCommit({
		type: "batch",
		commands: editable.map((o) => ({
			type: "patch-object",
			id: o.id,
			patch: patch(o)
		}))
	});
	const copy = async () => {
		if (!current()) return;
		if (onCommand) {
			if (await onCommand("copy") && current()) setClipboard(hasPaperSelection(media));
			return;
		}
		setBusy(true);
		try {
			const count = await copyPaperSelection(document, selected, media, current, pageId);
			if (!current()) return;
			setClipboard(true);
			onNotice(`${count} objets copiés. Vous pouvez les coller dans une autre note de cette année.`);
		} catch (e) {
			if (current()) onNotice(String(e instanceof Error ? e.message : e));
		} finally {
			if (current()) setBusy(false);
		}
	};
	const paste = async () => {
		if (!current()) return;
		if (onCommand) {
			await onCommand("paste");
			return;
		}
		setBusy(true);
		try {
			const value = await pastePaperSelection(document.noteId, pageId, media, current);
			if (!current()) return;
			const top = Math.max(0, ...objects.map((o) => o.z));
			for (const c of value.commands) if (c.type === "upsert-object") c.object.z += top + 1;
			if (onCommit({
				type: "batch",
				commands: value.commands
			})) onSelect(value.ids);
		} catch (e) {
			if (current()) onNotice(String(e instanceof Error ? e.message : e));
		} finally {
			if (current()) setBusy(false);
		}
	};
	return /* @__PURE__ */ jsxDEV("div", {
		className: "paper-selection-tools",
		role: "group",
		"aria-label": "Objets sélectionnés",
		children: [
			/* @__PURE__ */ jsxDEV("span", { children: [
				chosen.length,
				" objet",
				chosen.length > 1 ? "s" : ""
			] }, void 0, true, {
				fileName: _jsxFileName$5,
				lineNumber: 15,
				columnNumber: 94
			}, this),
			/* @__PURE__ */ jsxDEV("button", {
				"aria-label": "Copier la sélection",
				disabled: busy,
				onClick: () => void copy(),
				children: /* @__PURE__ */ jsxDEV(Copy, {}, void 0, false, {
					fileName: _jsxFileName$5,
					lineNumber: 16,
					columnNumber: 85
				}, this)
			}, void 0, false, {
				fileName: _jsxFileName$5,
				lineNumber: 16,
				columnNumber: 2
			}, this),
			/* @__PURE__ */ jsxDEV("button", {
				"aria-label": "Coller la sélection",
				disabled: busy || !(onCommand ? hasPaperSelection(media) : clipboard),
				onClick: () => void paste(),
				children: /* @__PURE__ */ jsxDEV(ClipboardPaste, {}, void 0, false, {
					fileName: _jsxFileName$5,
					lineNumber: 16,
					columnNumber: 234
				}, this)
			}, void 0, false, {
				fileName: _jsxFileName$5,
				lineNumber: 16,
				columnNumber: 101
			}, this),
			/* @__PURE__ */ jsxDEV("button", {
				"aria-label": "Dupliquer la sélection",
				onClick: () => {
					if (onCommand) {
						onCommand("duplicate");
						return;
					}
					const groupMap = new Map(chosen.filter((o) => o.groupId).map((o) => [o.groupId, crypto.randomUUID()]));
					onCommit({
						type: "batch",
						commands: chosen.map((o) => ({
							type: "upsert-object",
							object: {
								...o,
								textFlow: void 0,
								pageId,
								id: crypto.randomUUID(),
								x: o.x + 20,
								y: o.y + 20,
								z: Math.max(...objects.map((o) => o.z)) + 1,
								locked: false,
								...o.groupId ? { groupId: groupMap.get(o.groupId) } : {}
							}
						}))
					});
				},
				children: /* @__PURE__ */ jsxDEV(Copy, {}, void 0, false, {
					fileName: _jsxFileName$5,
					lineNumber: 17,
					columnNumber: 463
				}, this)
			}, void 0, false, {
				fileName: _jsxFileName$5,
				lineNumber: 17,
				columnNumber: 2
			}, this),
			/* @__PURE__ */ jsxDEV("button", {
				"aria-label": "Verrouiller la sélection",
				onClick: () => onCommand ? void onCommand(chosen.every((o) => o.locked) ? "unlock" : "lock") : onCommit({
					type: "batch",
					commands: chosen.map((o) => ({
						type: "patch-object",
						id: o.id,
						patch: { locked: !chosen.every((o) => o.locked) }
					}))
				}),
				children: chosen.every((o) => o.locked) ? /* @__PURE__ */ jsxDEV(Unlock, {}, void 0, false, {
					fileName: _jsxFileName$5,
					lineNumber: 18,
					columnNumber: 280
				}, this) : /* @__PURE__ */ jsxDEV(Lock, {}, void 0, false, {
					fileName: _jsxFileName$5,
					lineNumber: 18,
					columnNumber: 290
				}, this)
			}, void 0, false, {
				fileName: _jsxFileName$5,
				lineNumber: 18,
				columnNumber: 2
			}, this),
			/* @__PURE__ */ jsxDEV("button", {
				"aria-label": "Faire pivoter la sélection",
				disabled: !editable.length,
				onClick: () => onCommand ? void onCommand("rotate-right") : onCommit({
					type: "batch",
					commands: rotatePaperSelection(chosen, 15).map((object) => ({
						type: "upsert-object",
						object
					}))
				}),
				children: /* @__PURE__ */ jsxDEV(RotateCw, {}, void 0, false, {
					fileName: _jsxFileName$5,
					lineNumber: 19,
					columnNumber: 244
				}, this)
			}, void 0, false, {
				fileName: _jsxFileName$5,
				lineNumber: 19,
				columnNumber: 2
			}, this),
			/* @__PURE__ */ jsxDEV(PaperInkSelectionActions, {
				document,
				selected,
				pageId,
				onCommit,
				onNotice
			}, void 0, false, {
				fileName: _jsxFileName$5,
				lineNumber: 20,
				columnNumber: 2
			}, this),
			/* @__PURE__ */ jsxDEV("button", {
				"aria-label": "Grouper la sélection",
				disabled: editable.length < 2,
				onClick: () => {
					if (onCommand) {
						onCommand("group");
						return;
					}
					const groupId = crypto.randomUUID();
					batch(() => ({ groupId }));
				},
				children: /* @__PURE__ */ jsxDEV(Group, {}, void 0, false, {
					fileName: _jsxFileName$5,
					lineNumber: 21,
					columnNumber: 193
				}, this)
			}, void 0, false, {
				fileName: _jsxFileName$5,
				lineNumber: 21,
				columnNumber: 2
			}, this),
			/* @__PURE__ */ jsxDEV("button", {
				"aria-label": "Dégrouper la sélection",
				disabled: !editable.some((o) => o.groupId),
				onClick: () => onCommand ? void onCommand("ungroup") : batch(() => ({ groupId: void 0 })),
				children: /* @__PURE__ */ jsxDEV(Ungroup, {}, void 0, false, {
					fileName: _jsxFileName$5,
					lineNumber: 21,
					columnNumber: 377
				}, this)
			}, void 0, false, {
				fileName: _jsxFileName$5,
				lineNumber: 21,
				columnNumber: 210
			}, this),
			["front", "back"].map((direction) => /* @__PURE__ */ jsxDEV("button", {
				"aria-label": direction === "front" ? "Mettre au premier plan" : "Mettre à l’arrière-plan",
				disabled: !editable.length,
				onClick: () => onCommand ? void onCommand(direction) : onCommit({
					type: "batch",
					commands: orderedPaperObjects(objects, selected, direction).map((object) => ({
						type: "patch-object",
						id: object.id,
						patch: { z: object.z }
					}))
				}),
				children: direction === "front" ? /* @__PURE__ */ jsxDEV(ArrowUpToLine, {}, void 0, false, {
					fileName: _jsxFileName$5,
					lineNumber: 22,
					columnNumber: 404
				}, this) : /* @__PURE__ */ jsxDEV(ArrowDownToLine, {}, void 0, false, {
					fileName: _jsxFileName$5,
					lineNumber: 22,
					columnNumber: 421
				}, this)
			}, direction, false, {
				fileName: _jsxFileName$5,
				lineNumber: 22,
				columnNumber: 46
			}, this)),
			/* @__PURE__ */ jsxDEV("label", { children: ["Couleur", /* @__PURE__ */ jsxDEV("input", {
				"aria-label": "Couleur des objets sélectionnés",
				type: "color",
				value: editable[0]?.color ?? "#20343b",
				disabled: !editable.length,
				onChange: (e) => batch(() => ({ color: e.target.value }))
			}, void 0, false, {
				fileName: _jsxFileName$5,
				lineNumber: 23,
				columnNumber: 16
			}, this)] }, void 0, true, {
				fileName: _jsxFileName$5,
				lineNumber: 23,
				columnNumber: 2
			}, this),
			one && /* @__PURE__ */ jsxDEV(Fragment, { children: [/* @__PURE__ */ jsxDEV("label", { children: ["Largeur", /* @__PURE__ */ jsxDEV("input", {
				type: "number",
				min: "8",
				max: "20000",
				"aria-label": "Largeur de l’objet",
				defaultValue: Math.round(one.width),
				disabled: one.locked,
				onBlur: (e) => {
					try {
						onCommit({
							type: "upsert-object",
							object: resizePaperObject(one, Number(e.target.value), one.height)
						});
					} catch (error) {
						onNotice(String(error instanceof Error ? error.message : error));
					}
				}
			}, `w-${one.id}-${one.width}`, false, {
				fileName: _jsxFileName$5,
				lineNumber: 24,
				columnNumber: 24
			}, this)] }, void 0, true, {
				fileName: _jsxFileName$5,
				lineNumber: 24,
				columnNumber: 10
			}, this), /* @__PURE__ */ jsxDEV("label", { children: ["Hauteur", /* @__PURE__ */ jsxDEV("input", {
				type: "number",
				min: "8",
				max: "100000",
				"aria-label": "Hauteur de l’objet",
				defaultValue: Math.round(one.height),
				disabled: one.locked,
				onBlur: (e) => {
					try {
						onCommit({
							type: "upsert-object",
							object: resizePaperObject(one, one.width, Number(e.target.value))
						});
					} catch (error) {
						onNotice(String(error instanceof Error ? error.message : error));
					}
				}
			}, `h-${one.id}-${one.height}`, false, {
				fileName: _jsxFileName$5,
				lineNumber: 24,
				columnNumber: 426
			}, this)] }, void 0, true, {
				fileName: _jsxFileName$5,
				lineNumber: 24,
				columnNumber: 412
			}, this)] }, void 0, true, {
				fileName: _jsxFileName$5,
				lineNumber: 24,
				columnNumber: 8
			}, this),
			/* @__PURE__ */ jsxDEV("button", {
				"aria-label": "Supprimer la sélection",
				disabled: !editable.length,
				onClick: () => {
					if (onCommand) {
						onCommand("delete");
						return;
					}
					if (onCommit({
						type: "remove-objects",
						ids: selected
					})) onSelect([]);
				},
				children: /* @__PURE__ */ jsxDEV(Trash2, {}, void 0, false, {
					fileName: _jsxFileName$5,
					lineNumber: 25,
					columnNumber: 201
				}, this)
			}, void 0, false, {
				fileName: _jsxFileName$5,
				lineNumber: 25,
				columnNumber: 2
			}, this)
		]
	}, void 0, true, {
		fileName: _jsxFileName$5,
		lineNumber: 15,
		columnNumber: 9
	}, this);
}
//#endregion
//#region src/lib/paperEraserReturn.ts
var inkTools = /* @__PURE__ */ new Set([
	"pen",
	"pencil",
	"calligraphy",
	"highlighter"
]);
/** Return to the previous visible ink preset, preserving its stable slot ID and
* all its stored style fields. A stylus eraser while the pen is selected needs
* no toolbar switch. Cancellation never changes the selected tool. */
function createPaperEraserReturn() {
	let previous = null, selected = null;
	return {
		select(slot) {
			selected = slot.id;
			if (inkTools.has(slot.tool)) previous = slot.id;
		},
		seed(previousInkSlotId) {
			previous = previousInkSlotId;
		},
		previous() {
			return previous;
		},
		afterStroke(input) {
			if (!input.enabled || input.cancelled || input.intent !== "eraser" || input.activeSlot.tool !== "eraser" || input.activeSlot.id !== selected || !previous) return null;
			return input.toolbar.find((slot) => slot.id === previous && slot.visible && inkTools.has(slot.tool))?.id ?? null;
		},
		clear() {
			previous = null;
			selected = null;
		}
	};
}
//#endregion
//#region src/lib/tauri.ts
var isTauri = () => Boolean(window.__TAURI_INTERNALS__);
async function getNativeCapabilities() {
	if (!isTauri()) return {
		platform: "browser",
		googleWebProfileRemoval: false,
		microphoneAccessRequest: false
	};
	return invoke("native_capabilities");
}
async function requestMicrophoneAccess() {
	if (!isTauri()) return "unsupported";
	return invoke("request_microphone_access");
}
//#endregion
//#region src/lib/paperExport.ts
/** Each IPC message is bounded; an interrupted save aborts its staging file and preserves the destination. */
async function writePaperExportChunks(blob, destinationPath, kind, command = invoke) {
	if (!blob.size || blob.size > 268435456) throw Error("L’export doit contenir entre 1 octet et 256 Mo.");
	const exportId = await command("begin_notebook_export", {
		destinationPath,
		kind,
		totalBytes: blob.size
	});
	try {
		for (let offset = 0; offset < blob.size; offset += 65536) {
			const bytes = new Uint8Array(await blob.slice(offset, offset + 65536).arrayBuffer());
			let binary = "";
			for (let part = 0; part < bytes.length; part += 16384) binary += String.fromCharCode(...bytes.subarray(part, part + 16384));
			await command("push_notebook_export", {
				exportId,
				offset,
				dataBase64: btoa(binary)
			});
		}
		await command("finish_notebook_export", { exportId });
	} catch (error) {
		await command("abort_notebook_export", { exportId }).catch(() => {});
		throw error;
	}
}
function originalAudioExportKind(mediaType, originalName) {
	if (mediaType.split(";")[0] === "audio/mp4" && /\.mp4$/i.test(originalName ?? "")) return "mp4";
	const kind = {
		"audio/mpeg": "mp3",
		"audio/mp3": "mp3",
		"audio/mp4": "m4a",
		"audio/x-m4a": "m4a",
		"audio/wav": "wav",
		"audio/x-wav": "wav",
		"audio/ogg": "ogg",
		"audio/flac": "flac",
		"audio/x-flac": "flac",
		"audio/aac": "aac",
		"audio/webm": "webm",
		"audio/aiff": "aiff",
		"audio/x-aiff": "aiff"
	}[mediaType.split(";")[0].toLowerCase()];
	if (!kind) throw Error("Cet original peut être conservé dans l’archive de la note ; son format d’export direct reste à ajouter.");
	return kind;
}
async function savePaperExport(blob, name, kind) {
	if (!isTauri()) {
		const url = URL.createObjectURL(blob), a = document.createElement("a");
		a.href = url;
		a.download = name;
		a.click();
		setTimeout(() => URL.revokeObjectURL(url), 6e4);
		return true;
	}
	const extension = {
		archive: "dowze",
		template: "dowzetemplate",
		pdf: "pdf",
		png: "png",
		jpeg: "jpg",
		wav: "wav",
		mp3: "mp3",
		m4a: "m4a",
		mp4: "mp4",
		ogg: "ogg",
		flac: "flac",
		aac: "aac",
		webm: "webm",
		aiff: "aiff"
	}[kind];
	const selected = await save({
		title: "Exporter la note",
		defaultPath: name,
		filters: [{
			name: "Note Dowze",
			extensions: [extension]
		}]
	});
	if (!selected) return false;
	await writePaperExportChunks(blob, selected.toLowerCase().endsWith(`.${extension}`) ? selected : `${selected}.${extension}`, kind);
	return true;
}
//#endregion
//#region src/lib/paperIdentity.ts
var paperIdentityReceiptKey = (scope, sourceId) => `paper-identity|${scope.accountId}|${scope.spaceId}|whiteboard|${sourceId}`;
var check = (current) => {
	if (!current()) throw Error("Le compte ou le carnet a changé pendant la migration. Les originaux restent conservés.");
};
var owned = (draft, noteId) => {
	if (draft && (!isPaperDocument(draft.content) || draft.content.noteId !== noteId)) throw Error("L’identité de cette note désigne un autre document. Aucun contenu n’est remplacé.");
	return draft;
};
/** Promote a proved historical owner. A colliding alias is never a source for another note. */
async function ensureNotebookIdentity(noteId, scope, current = () => true, deletedMode = "error") {
	scope = {
		accountId: scope.accountId,
		spaceId: scope.spaceId
	};
	check(current);
	const documentId = notebookDocumentId(noteId), sourceId = legacyNotebookDocumentId(noteId), identity = {
		...scope,
		type: "whiteboard",
		documentId
	};
	const deletion = await readNotebookDeletionStatus(noteId, scope, current), deletedError = () => Error("Cette note a été supprimée sur le serveur. Ses versions restent conservées dans la récupération ; restaurez-la explicitement avant de la rouvrir.");
	const target = owned(await getDraft(identity), noteId);
	check(current);
	if (sourceId === documentId) {
		if (deletion && deletedMode === "error") throw deletedError();
		return target;
	}
	const source = await getDraft({
		...identity,
		documentId: sourceId
	});
	check(current);
	if (!source || !isPaperDocument(source.content) || source.content.noteId !== noteId) {
		if (deletion && deletedMode === "error") throw deletedError();
		return target;
	}
	const receiptKey = paperIdentityReceiptKey(scope, sourceId), receipt = await getSnapshot(receiptKey);
	check(current);
	const previous = (receipt?.value)?.source, processed = (receipt?.value)?.processedMutationStates ?? {};
	const pending = (await listMutations(scope.accountId, scope.spaceId)).filter((mutation) => mutation.accountId === scope.accountId && mutation.spaceId === scope.spaceId && mutation.type === "whiteboard" && mutation.documentId === sourceId && (!Object.hasOwn(processed, mutation.id) || processed[mutation.id] !== paperIdentityMutationDigest(mutation)));
	check(current);
	const contribution = (value) => {
		if (!isPaperDocument(value)) return value;
		const { revision, updatedAt, collaboration, ...content } = value;
		return content;
	};
	const sourceChanged = !(source.identityAlias === documentId && previous && JSON.stringify(contribution(source.content)) === JSON.stringify(contribution(previous.content)));
	if (deletion) {
		const previousDeletion = (receipt?.value)?.deletion;
		if (sourceChanged || pending.length || previousDeletion?.version !== deletion.version) {
			const contributions = pending.map((mutation) => ({
				mutation,
				kind: isPaperDocument(mutation.content) && mutation.content.noteId === noteId ? "conflict" : "collision"
			}));
			const assetIds = [.../* @__PURE__ */ new Set([...source.content.assets.map((asset) => asset.id), ...contributions.flatMap((row) => row.kind !== "collision" && isPaperDocument(row.mutation.content) ? row.mutation.content.assets.map((asset) => asset.id) : [])])];
			const canonical = {
				...target ?? source,
				...identity,
				content: target?.content ?? source.content,
				baseVersion: target?.baseVersion ?? 0,
				identityAlias: void 0
			};
			await commitPaperIdentityPromotion({
				source,
				target,
				canonical,
				assetIds,
				receiptKey,
				contributions,
				deletion
			}, current);
			check(current);
		}
		if (deletedMode === "error") throw deletedError();
		return target;
	}
	if (!sourceChanged && !pending.length) return target;
	let content = target && !sourceChanged ? target.content : source.content, conflict = target?.conflict, syncState = target && !sourceChanged ? target.syncState : "local";
	if (target && sourceChanged) {
		if (JSON.stringify(target.content) === JSON.stringify(content)) {
			content = target.content;
			syncState = target.syncState;
		} else {
			let merged = null;
			try {
				merged = mergePaperCollaboration(target.content, content);
			} catch {}
			if (merged) content = merged;
			else {
				content = target.content;
				syncState = "conflict";
				conflict = {
					...target.conflict && typeof target.conflict === "object" ? target.conflict : {},
					identitySource: sourceId,
					identityReceipt: receiptKey,
					sourceVersion: source.baseVersion
				};
			}
		}
	}
	const contributions = [], assetIds = new Set(source.content.assets.map((asset) => asset.id)), conflicted = [];
	for (const mutation of pending) {
		if (!isPaperDocument(mutation.content) || mutation.content.noteId !== noteId) {
			contributions.push({
				mutation,
				kind: "collision"
			});
			continue;
		}
		for (const asset of mutation.content.assets) assetIds.add(asset.id);
		if (JSON.stringify(contribution(content)) === JSON.stringify(contribution(mutation.content))) {
			contributions.push({
				mutation,
				kind: "same"
			});
			continue;
		}
		let merged = null;
		try {
			merged = mergePaperCollaboration(content, mutation.content);
		} catch {}
		if (merged) {
			content = merged;
			contributions.push({
				mutation,
				kind: "merged"
			});
			if (syncState !== "conflict") syncState = "local";
		} else {
			contributions.push({
				mutation,
				kind: "conflict"
			});
			conflicted.push(mutation.id);
			syncState = "conflict";
		}
	}
	if (target?.syncState === "conflict") syncState = "conflict";
	if (conflicted.length) conflict = {
		...conflict && typeof conflict === "object" ? conflict : {},
		identitySource: sourceId,
		identityReceipt: receiptKey,
		identityOutboxIds: conflicted,
		sourceVersion: source.baseVersion
	};
	const unchangedTarget = target && !sourceChanged && contributions.every((row) => row.kind === "same" || row.kind === "collision");
	const canonical = {
		...target ?? source,
		...identity,
		content,
		baseVersion: target?.baseVersion ?? 0,
		updatedAt: unchangedTarget ? target.updatedAt : Date.now(),
		syncState,
		identityAlias: void 0,
		...conflict ? { conflict } : { conflict: void 0 }
	};
	await commitPaperIdentityPromotion({
		source,
		target,
		canonical,
		assetIds: [...assetIds],
		receiptKey,
		contributions
	}, current);
	check(current);
	return owned(await getDraft(identity), noteId);
}
/** A colliding old board is kept for recovery, rather than copied into an unrelated note. */
async function readOwnedLegacyNotebookBoard(noteId, scope, current = () => true, knownNoteIds = []) {
	scope = {
		accountId: scope.accountId,
		spaceId: scope.spaceId
	};
	check(current);
	const paper = await getDraft({
		...scope,
		type: "whiteboard",
		documentId: legacyNotebookDocumentId(noteId)
	});
	check(current);
	if (paper && isPaperDocument(paper.content) && paper.content.noteId !== noteId) return void 0;
	const boardId = noteBoardId(noteId), claim = await getSnapshot(`paper-legacy-owner|${scope.accountId}|${scope.spaceId}|whiteboard|${boardId}`);
	check(current);
	if (claim) {
		const value = claim.value;
		if (claim.accountId !== scope.accountId || claim.spaceId !== scope.spaceId || !value || value.schema !== 1 || typeof value.noteId !== "string" || value.boardId !== boardId || value.documentId !== notebookDocumentId(value.noteId) || typeof value.claimedAt !== "string" || !Number.isFinite(Date.parse(value.claimedAt))) return void 0;
		if (value.noteId !== noteId) return void 0;
		const board = await getDraft({
			...scope,
			type: "whiteboard",
			documentId: boardId
		});
		check(current);
		return board;
	}
	const rows = await listDrafts(scope.accountId, scope.spaceId);
	check(current);
	if (new Set([
		noteId,
		...knownNoteIds,
		...rows.filter((row) => row.type === "notesMarkdown").map((row) => {
			const content = row.content;
			return typeof content?.id === "string" ? content.id : row.documentId;
		})
	].filter((id) => noteBoardId(id) === boardId)).size > 1) return void 0;
	const board = await getDraft({
		...scope,
		type: "whiteboard",
		documentId: boardId
	});
	check(current);
	return board;
}
/** Called before outbox publication and after reception, so aliases cannot be republished. */
async function normalizeNotebookIdentities(scope, current = () => true) {
	scope = {
		accountId: scope.accountId,
		spaceId: scope.spaceId
	};
	check(current);
	const rows = await listDrafts(scope.accountId, scope.spaceId);
	check(current);
	for (const row of rows) {
		if (row.type !== "whiteboard" || !row.documentId.startsWith("paper-v3-") || !isPaperDocument(row.content)) continue;
		const noteId = row.content.noteId, canonical = notebookDocumentId(noteId), legacy = legacyNotebookDocumentId(noteId);
		if (row.documentId === canonical) continue;
		if (row.documentId !== legacy) throw Error("Une ancienne note utilise une identité inconnue. Son original reste conservé.");
		await ensureNotebookIdentity(noteId, scope, current, "allow");
		check(current);
	}
}
//#endregion
//#region src/lib/paperRecordingHistory.ts
/** A saved recording is independent of the user's text/drawing undo steps. */
function retainRecordingHistory(history, command) {
	const valid = (item) => item.type === "batch" ? item.commands.every(valid) : item.type === "add-asset" ? item.asset.mediaType === "audio/wav" || item.asset.mediaType.startsWith("audio/") : item.type === "add-audio" || item.type === "patch-object" && Object.keys(item.patch).length === 1 && item.patch.audioAnchor !== void 0;
	if (!valid(command)) throw Error("Seules les sauvegardes audio peuvent être conservées dans cet historique.");
	const retain = (document) => {
		return {
			...applyPaperCommand(document, command, document.updatedAt),
			revision: document.revision
		};
	};
	return {
		past: history.past.map(retain),
		future: history.future.map(retain)
	};
}
//#endregion
//#region pwa/src/api.ts
var ApiError = class extends Error {
	status;
	code;
	currentVersion;
	constructor(status, message, code, currentVersion) {
		super(message);
		this.status = status;
		this.code = code;
		this.currentVersion = currentVersion;
	}
};
//#endregion
//#region src/lib/noteMetadataTransport.ts
var PREFIX = "note-meta-id2-";
var aliasPattern = /^note-meta-id2-[a-f0-9]{64}$/;
var record = (value) => !!value && typeof value === "object" && !Array.isArray(value);
var cleanScope = (scope) => ({
	accountId: scope.accountId,
	spaceId: scope.spaceId
});
function noteMetadataTransportId(logicalId) {
	if (!logicalId || logicalId.length > 200) throw Error("L’identité de cette note dépasse le format du carnet. Son original reste conservé.");
	return /^[A-Za-z0-9][A-Za-z0-9._-]{0,126}$/.test(logicalId) && !logicalId.includes("..") && !logicalId.startsWith(PREFIX) ? logicalId : PREFIX + notebookIdentityDigest("Dowze/metadata-transport/id2\0" + logicalId);
}
var noteMetadataBindingKey = (scope, documentId) => `paper-metadata-transport|${scope.accountId}|${scope.spaceId}|${documentId}`;
var sameBinding = (value, scope, id) => record(value) && value.schema === 1 && value.kind === "paper-metadata-transport" && value.accountId === scope.accountId && value.spaceId === scope.spaceId && value.documentId === id && typeof value.logicalId === "string" && value.logicalId.length > 0 && value.logicalId.length <= 200 && noteMetadataTransportId(value.logicalId) === id && value.graphId === notebookDocumentId(value.logicalId) && Number.isSafeInteger(value.confirmedVersion) && Number(value.confirmedVersion) >= 0 && (value.deletedVersion === void 0 || Number.isSafeInteger(value.deletedVersion) && Number(value.deletedVersion) > 0);
var currentOrThrow = (current) => {
	if (!current()) throw Error("Le compte ou l’année a changé pendant la synchronisation de la note.");
};
/** Transport identities never replace the logical ID in a draft, outbox or note. */
async function prepareNoteMetadataTransport(document, scope, current) {
	scope = cleanScope(scope);
	currentOrThrow(current);
	if (document.type !== "notesMarkdown") return document;
	const id = noteMetadataTransportId(document.id);
	if (id === document.id) return document;
	if (!record(document.content) || document.content.id !== document.id) throw Error("Les métadonnées ne prouvent pas l’identité complète de cette note.");
	const envelope = {
		notebookMetadataTransport: 1,
		...scope,
		logicalId: document.id,
		documentId: id,
		graphId: notebookDocumentId(document.id),
		note: document.content
	};
	const previous = await getSnapshot(noteMetadataBindingKey(scope, id));
	currentOrThrow(current);
	if (previous && sameBinding(previous.value, scope, id) && previous.value.deletedVersion !== void 0 && previous.value.deletedVersion >= previous.value.confirmedVersion) throw Error("Cette note a été supprimée sur le serveur. Son original local reste conservé.");
	await conserveBinding(scope, id, document.id, 0, {
		kind: "prepared",
		source: document
	}, current);
	return {
		id,
		content: envelope
	};
}
async function conserveBinding(scope, id, logicalId, version, source, current) {
	currentOrThrow(current);
	const key = noteMetadataBindingKey(scope, id), previous = await getSnapshot(key), metadata = await getDraft({
		...scope,
		type: "notesMarkdown",
		documentId: logicalId
	});
	currentOrThrow(current);
	if (previous && (previous.accountId !== scope.accountId || previous.spaceId !== scope.spaceId || !sameBinding(previous.value, scope, id) || previous.value.logicalId !== logicalId)) throw Error("Cet alias de synchronisation appartient à une autre note. Les deux originaux restent conservés.");
	if (metadata && (!record(metadata.content) || metadata.content.id !== logicalId)) throw Error("L’original local ne correspond pas à la note transmise.");
	const old = previous?.value;
	if (source?.kind === "prepared" && old?.deletedVersion !== void 0 && old.deletedVersion >= old.confirmedVersion) throw Error("Cette note a été supprimée sur le serveur. Son original local reste conservé.");
	const value = {
		schema: 1,
		kind: "paper-metadata-transport",
		...scope,
		logicalId,
		documentId: id,
		graphId: notebookDocumentId(logicalId),
		confirmedVersion: Math.max(version, old?.confirmedVersion ?? 0),
		...old?.deletedVersion ? { deletedVersion: old.deletedVersion } : {}
	};
	const proofKey = `${key}|proof-${notebookIdentityDigest(JSON.stringify(source))}`, oldProof = await getSnapshot(proofKey);
	currentOrThrow(current);
	const proof = {
		key: proofKey,
		...scope,
		value: {
			schema: 1,
			kind: "paper-metadata-transport-proof",
			binding: value,
			source,
			...!previous && metadata ? { originalDraft: metadata } : {}
		}
	};
	if (oldProof && (oldProof.accountId !== scope.accountId || oldProof.spaceId !== scope.spaceId || JSON.stringify(oldProof.value?.source) !== JSON.stringify(source))) throw Error("Le reçu original de cette note est incompatible.");
	const snapshots = [];
	if (JSON.stringify(previous?.value) !== JSON.stringify(value)) snapshots.push({
		key,
		...scope,
		value
	});
	if (!oldProof) snapshots.push(proof);
	if (!snapshots.length) return;
	const rebased = !previous && metadata ? [{
		...metadata,
		baseVersion: 0
	}] : [];
	await commitNotebookTransfer({
		target: scope,
		sources: [],
		drafts: rebased,
		blobs: [],
		snapshots,
		draftChecks: [{
			identity: {
				...scope,
				type: "notesMarkdown",
				documentId: logicalId
			},
			expected: metadata
		}],
		blobChecks: [],
		snapshotChecks: [{
			key,
			expected: previous
		}, {
			key: proofKey,
			expected: oldProof
		}]
	}, current);
}
/** A durable mutation keeps its first network base and payload across a lost
* acknowledgement; confirmed aliases must not change an idempotent retry. */
async function prepareNoteMetadataMutation(document, version, mutationId, scope, current) {
	scope = cleanScope(scope);
	if (!Number.isSafeInteger(version) || version < 0 || !mutationId || mutationId.length > 128) throw Error("Le journal de cette mutation est invalide. Son original reste conservé.");
	const prepared = await prepareNoteMetadataTransport(document, scope, current);
	if (document.type !== "notesMarkdown" || prepared.id === document.id) return {
		...prepared,
		baseVersion: version
	};
	const bindingKey = noteMetadataBindingKey(scope, prepared.id), binding = await getSnapshot(bindingKey), key = `${bindingKey}|mutation-${notebookIdentityDigest(mutationId)}`, previous = await getSnapshot(key);
	currentOrThrow(current);
	if (!binding || !sameBinding(binding.value, scope, prepared.id) || binding.value.logicalId !== document.id) throw Error("L’alias de la mutation n’est pas conservé dans le compte courant.");
	if (previous) {
		const value = previous.value;
		if (previous.accountId !== scope.accountId || previous.spaceId !== scope.spaceId || value.mutationId !== mutationId || value.originalVersion !== version || JSON.stringify(value.source) !== JSON.stringify(document) || JSON.stringify(value.content) !== JSON.stringify(prepared.content) || !Number.isSafeInteger(value.wireVersion)) throw Error("Cette mutation possède déjà un autre original. Aucun reçu n’est remplacé.");
		return {
			...prepared,
			baseVersion: Number(value.wireVersion)
		};
	}
	const wireVersion = Math.min(version, binding.value.confirmedVersion), snapshot = {
		key,
		...scope,
		value: {
			schema: 1,
			kind: "paper-metadata-transport-mutation",
			mutationId,
			originalVersion: version,
			wireVersion,
			source: document,
			content: prepared.content
		}
	};
	await commitNotebookTransfer({
		target: scope,
		sources: [],
		drafts: [],
		blobs: [],
		snapshots: [snapshot],
		draftChecks: [],
		blobChecks: [],
		snapshotChecks: [{
			key: bindingKey,
			expected: binding
		}, {
			key,
			expected: previous
		}]
	}, current);
	return {
		...prepared,
		baseVersion: wireVersion
	};
}
async function acknowledgeNoteMetadataTransport(document, version, scope, current) {
	scope = cleanScope(scope);
	if (document.type !== "notesMarkdown" || noteMetadataTransportId(document.id) === document.id) return;
	if (!Number.isSafeInteger(version) || version <= 0) throw Error("Confirmation de métadonnées invalide.");
	await conserveBinding(scope, noteMetadataTransportId(document.id), document.id, version, {
		kind: "acknowledged",
		version,
		source: document
	}, current);
}
async function retainRejected(scope, remote, reason, current) {
	const key = `paper-metadata-transport-rejected|${scope.accountId}|${scope.spaceId}|${notebookIdentityDigest(JSON.stringify(remote))}`, previous = await getSnapshot(key);
	currentOrThrow(current);
	if (!previous) await commitNotebookTransfer({
		target: scope,
		sources: [],
		drafts: [],
		blobs: [],
		snapshots: [{
			key,
			...scope,
			value: {
				schema: 1,
				kind: "paper-metadata-transport-rejected",
				reason,
				incoming: remote
			}
		}],
		draftChecks: [],
		blobChecks: [],
		snapshotChecks: [{
			key,
			expected: previous
		}]
	}, current);
	throw Error(reason + " La version reçue reste conservée, sans remplacer une autre note.");
}
async function retainRemote(scope, remote, kind, binding, current) {
	const key = `${binding.key}|${kind}-${notebookIdentityDigest(JSON.stringify(remote))}`, previous = await getSnapshot(key);
	currentOrThrow(current);
	if (!previous) await commitNotebookTransfer({
		target: scope,
		sources: [],
		drafts: [],
		blobs: [],
		snapshots: [{
			key,
			...scope,
			value: {
				schema: 1,
				kind: "paper-metadata-transport-" + kind,
				incoming: remote,
				bindingKey: binding.key
			}
		}],
		draftChecks: [],
		blobChecks: [],
		snapshotChecks: [{
			key,
			expected: previous
		}, {
			key: binding.key,
			expected: binding
		}]
	}, current);
}
async function retiredSource(scope, remote, current) {
	const replacementId = noteMetadataTransportId(remote.document_id);
	if (replacementId === remote.document_id) return false;
	const replacement = await getSnapshot(noteMetadataBindingKey(scope, replacementId));
	currentOrThrow(current);
	if (!replacement) return false;
	if (replacement.accountId !== scope.accountId || replacement.spaceId !== scope.spaceId || !sameBinding(replacement.value, scope, replacementId) || replacement.value.logicalId !== remote.document_id) return retainRejected(scope, remote, "La provenance de cette ancienne identité est incompatible.", current);
	if (replacement.value.confirmedVersion <= 0) return false;
	await retainRemote(scope, remote, "retired", replacement, current);
	return true;
}
async function confirmDeletion(scope, remote, binding, current) {
	const old = binding.value, value = {
		...old,
		deletedVersion: Math.max(remote.version, old.deletedVersion ?? 0)
	}, key = `${binding.key}|deletion-${notebookIdentityDigest(JSON.stringify(remote))}`, previous = await getSnapshot(key);
	currentOrThrow(current);
	const snapshots = [{
		...binding,
		value
	}];
	if (!previous) snapshots.push({
		key,
		...scope,
		value: {
			schema: 1,
			kind: "paper-metadata-transport-deletion",
			incoming: remote,
			bindingKey: binding.key
		}
	});
	await commitNotebookTransfer({
		target: scope,
		sources: [],
		drafts: [],
		blobs: [],
		snapshots,
		draftChecks: [],
		blobChecks: [],
		snapshotChecks: [{
			key: binding.key,
			expected: binding
		}, {
			key,
			expected: previous
		}]
	}, current);
}
/** Only a complete scoped envelope, or a previously confirmed binding for a
* tombstone, may translate a server alias back to an exact logical identity. */
async function receiveNoteMetadataTransport(remote, scope, current) {
	scope = cleanScope(scope);
	currentOrThrow(current);
	if (remote.document_type !== "notesMarkdown") return remote;
	const suppliedSpace = remote.space_id;
	if (suppliedSpace !== void 0 && suppliedSpace !== scope.spaceId) return retainRejected(scope, remote, "La note reçue appartient à une autre année.", current);
	if (remote.deleted) {
		const row = await getSnapshot(noteMetadataBindingKey(scope, remote.document_id));
		currentOrThrow(current);
		if (!row) {
			if (await retiredSource(scope, remote, current)) return null;
			if (aliasPattern.test(remote.document_id)) return retainRejected(scope, remote, "La suppression ne prouve pas encore à quelle note cet alias appartient.", current);
			return remote;
		}
		if (row.accountId !== scope.accountId || row.spaceId !== scope.spaceId || !sameBinding(row.value, scope, remote.document_id) || row.value.confirmedVersion <= 0) return retainRejected(scope, remote, "L’alias de cette suppression n’est pas confirmé par le serveur.", current);
		if (!Number.isSafeInteger(remote.version) || remote.version <= 0) return retainRejected(scope, remote, "La version de cette suppression est invalide.", current);
		if (remote.version < row.value.confirmedVersion) {
			await retainRemote(scope, remote, "stale-deletion", row, current);
			return null;
		}
		await confirmDeletion(scope, remote, row, current);
		return {
			...remote,
			document_id: row.value.logicalId
		};
	}
	if (!record(remote.content)) return retainRejected(scope, remote, "Les métadonnées reçues sont illisibles.", current);
	if (remote.content.notebookMetadataTransport !== void 0) {
		const value = remote.content;
		let valid = false;
		try {
			valid = value.notebookMetadataTransport === 1 && value.accountId === scope.accountId && value.spaceId === scope.spaceId && typeof value.logicalId === "string" && value.documentId === remote.document_id && noteMetadataTransportId(value.logicalId) === remote.document_id && value.logicalId !== remote.document_id && value.graphId === notebookDocumentId(value.logicalId) && record(value.note) && value.note.id === value.logicalId && Number.isSafeInteger(remote.version) && remote.version > 0;
		} catch {}
		if (!valid) return retainRejected(scope, remote, "L’alias reçu ne correspond pas à l’identité et au compte de cette note.", current);
		const previous = await getSnapshot(noteMetadataBindingKey(scope, remote.document_id));
		currentOrThrow(current);
		if (previous && (previous.accountId !== scope.accountId || previous.spaceId !== scope.spaceId || !sameBinding(previous.value, scope, remote.document_id) || previous.value.logicalId !== value.logicalId)) return retainRejected(scope, remote, "L’alias reçu possède déjà une autre preuve de propriété.", current);
		if (previous && sameBinding(previous.value, scope, remote.document_id) && previous.value.deletedVersion !== void 0 && remote.version <= previous.value.deletedVersion) {
			await retainRemote(scope, remote, "deleted-source", previous, current);
			return null;
		}
		await conserveBinding(scope, remote.document_id, value.logicalId, remote.version, {
			kind: "received",
			incoming: remote
		}, current);
		return {
			...remote,
			document_id: value.logicalId,
			content: value.note
		};
	}
	if (remote.content.id !== void 0 && remote.content.id !== remote.document_id) return retainRejected(scope, remote, "Le nom de transport et l’identité logique de la note sont différents.", current);
	const binding = await getSnapshot(noteMetadataBindingKey(scope, remote.document_id));
	currentOrThrow(current);
	if (binding) return retainRejected(scope, remote, "Cet identifiant serveur contient une autre note que l’alias enregistré.", current);
	if (await retiredSource(scope, remote, current)) return null;
	return remote;
}
//#endregion
//#region src/lib/notebookLibrary.ts
var LIBRARY_DOCUMENT_ID = "paper-library-v1";
var emptyNotebookLibrary = () => ({
	schema: 1,
	revision: 0,
	folders: [],
	notes: {},
	updatedAt: (/* @__PURE__ */ new Date()).toISOString()
});
var emptyClassification = () => ({
	folderId: null,
	favorite: false,
	deletedAt: null
});
function folderDepth(folders, id) {
	let depth = 0;
	const seen = /* @__PURE__ */ new Set();
	while (id) {
		if (seen.has(id)) throw Error("Un dossier ne peut pas contenir son parent.");
		seen.add(id);
		const folder = folders.find((f) => f.id === id);
		if (!folder) throw Error("Dossier introuvable.");
		depth++;
		id = folder.parentId;
	}
	return depth;
}
function isNotebookLibrary(value) {
	if (!value || typeof value !== "object") return false;
	const v = value;
	if (v.schema !== 1 || !Number.isSafeInteger(v.revision) || v.revision < 0 || !Array.isArray(v.folders) || v.folders.length > 1e4 || !v.notes || typeof v.notes !== "object" || Array.isArray(v.notes) || Object.keys(v.notes).length > 1e5 || !Number.isFinite(Date.parse(v.updatedAt))) return false;
	if (v.collaboration && (v.collaboration.schema !== 1 || typeof v.collaboration.lineage !== "string" || !v.collaboration.lineage || v.collaboration.lineage.length > 200 || typeof v.collaboration.state !== "string" || v.collaboration.state.length > 12582912)) return false;
	if (new Set(v.folders.map((f) => f.id)).size !== v.folders.length) return false;
	try {
		return v.folders.every((f) => typeof f.id === "string" && f.id.length > 0 && f.id.length <= 200 && typeof f.title === "string" && f.title.trim().length > 0 && f.title.length <= 100 && /^#[0-9a-f]{6}$/i.test(f.color) && Number.isFinite(f.order) && (f.parentId === null || typeof f.parentId === "string") && folderDepth(v.folders, f.id) <= 6) && Object.entries(v.notes).every(([id, n]) => id.length > 0 && id.length <= 200 && n && typeof n.favorite === "boolean" && (n.folderId === null || v.folders.some((f) => f.id === n.folderId)) && (n.deletedAt === null || Number.isFinite(Date.parse(n.deletedAt))) && (!n.cover || /^#[0-9a-f]{6}$/i.test(n.cover.color) && [
			"plain",
			"ruled",
			"grid",
			"dots"
		].includes(n.cover.pattern)));
	} catch {
		return false;
	}
}
/** Removing a folder keeps its contents: children and notes move one level up. */
function updateNotebookLibrary(value, change, now = (/* @__PURE__ */ new Date()).toISOString()) {
	if (change.restore && !isNotebookLibrary(change.restore)) throw Error("Version de classement incompatible.");
	const base = change.restore ? {
		...value,
		folders: change.restore.folders,
		notes: change.restore.notes
	} : value;
	let folders = change.folder ? [...base.folders.filter((f) => f.id !== change.folder.id), change.folder] : base.folders;
	const notes = { ...base.notes };
	if (change.removeFolder) {
		const removed = folders.find((f) => f.id === change.removeFolder);
		if (!removed) throw Error("Dossier introuvable.");
		folders = folders.filter((f) => f.id !== removed.id).map((f) => f.parentId === removed.id ? {
			...f,
			parentId: removed.parentId
		} : f);
		for (const [id, note] of Object.entries(notes)) if (note.folderId === removed.id) notes[id] = {
			...note,
			folderId: removed.parentId
		};
	}
	if (change.folderOrder) {
		if (change.folderOrder.length !== folders.length || new Set(change.folderOrder).size !== folders.length || change.folderOrder.some((id) => !folders.some((f) => f.id === id))) throw Error("Ordre des dossiers invalide.");
		folders = folders.map((f) => ({
			...f,
			order: change.folderOrder.indexOf(f.id)
		}));
	}
	for (const edit of [...change.note ? [change.note] : [], ...change.notes ?? []]) {
		const previous = Object.hasOwn(notes, edit.id) ? notes[edit.id] : emptyClassification();
		const { cover, ...patch } = edit.patch;
		Object.defineProperty(notes, edit.id, {
			enumerable: true,
			configurable: true,
			writable: true,
			value: {
				...previous,
				...patch,
				...cover === null ? { cover: void 0 } : cover ? { cover: {
					...previous.cover ?? {
						color: "#f1f4ff",
						pattern: "plain"
					},
					...cover
				} } : {}
			}
		});
	}
	const next = {
		...value,
		revision: value.revision + 1,
		updatedAt: now,
		folders,
		notes
	};
	if (!isNotebookLibrary(next)) throw Error("Classement invalide : six niveaux maximum, sans cycle.");
	return next;
}
//#endregion
//#region src/lib/notebookLibraryCollaboration.ts
var lexical = (a, b) => a < b ? -1 : a > b ? 1 : 0;
var stable = (value) => Array.isArray(value) ? value.map(stable) : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).filter(([, v]) => v !== void 0).sort(([a], [b]) => lexical(a, b)).map(([k, v]) => [k, stable(v)])) : value;
var same = (a, b) => JSON.stringify(stable(a)) === JSON.stringify(stable(b));
var binary = (value) => {
	if (value.length > 12582912 || value.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) throw Error("Historique du classement invalide.");
	return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
};
var encoded = (bytes) => {
	if (bytes.length > 8388608) throw Error("L’historique de classement dépasse sa capacité.");
	const chunks = [];
	for (let i = 0; i < bytes.length; i += 32768) chunks.push(String.fromCharCode(...bytes.subarray(i, i + 32768)));
	return btoa(chunks.join(""));
};
var field = (id, key) => JSON.stringify([id, key]);
function write(doc, before, after) {
	doc.transact(() => {
		const folderIds = doc.getMap("folder-ids"), folders = doc.getMap("folders");
		for (const old of before?.folders ?? []) if (!after.folders.some((f) => f.id === old.id)) {
			folderIds.delete(old.id);
			for (const key of Object.keys(old)) folders.delete(field(old.id, key));
		}
		for (const folder of after.folders) {
			if (!folderIds.has(folder.id)) folderIds.set(folder.id, true);
			const old = before?.folders.find((f) => f.id === folder.id);
			for (const [key, value] of Object.entries(folder)) if (!same(old?.[key], value)) folders.set(field(folder.id, key), value);
		}
		const noteIds = doc.getMap("note-ids"), notes = doc.getMap("notes");
		for (const [id, note] of Object.entries(after.notes)) {
			if (!noteIds.has(id)) noteIds.set(id, true);
			const old = before?.notes[id] ?? emptyClassification();
			for (const key of [
				"folderId",
				"favorite",
				"deletedAt"
			]) if (!same(old[key], note[key])) notes.set(field(id, key), note[key]);
			for (const key of ["color", "pattern"]) if (!same(old.cover?.[key], note.cover?.[key])) {
				if (note.cover?.[key] !== void 0) notes.set(field(id, `cover.${key}`), note.cover[key]);
				else notes.delete(field(id, `cover.${key}`));
			}
		}
	});
}
function read(template, doc) {
	const f = doc.getMap("folders"), n = doc.getMap("notes");
	const folders = [...doc.getMap("folder-ids").keys()].map((id) => Object.fromEntries([
		"id",
		"parentId",
		"title",
		"color",
		"order"
	].map((key) => [key, f.get(field(id, key))]))).sort((a, b) => a.order - b.order || lexical(a.id, b.id));
	const notes = Object.fromEntries([...doc.getMap("note-ids").keys()].sort(lexical).map((id) => {
		const note = { ...emptyClassification() };
		for (const key of [
			"folderId",
			"favorite",
			"deletedAt"
		]) if (n.has(field(id, key))) note[key] = n.get(field(id, key));
		const color = n.get(field(id, "cover.color")), pattern = n.get(field(id, "cover.pattern"));
		if (color !== void 0 || pattern !== void 0) note.cover = {
			color: String(color ?? "#f1f4ff"),
			pattern: pattern ?? "plain"
		};
		return [id, note];
	}));
	const result = {
		...template,
		folders,
		notes
	};
	if (!isNotebookLibrary(result)) throw Error("Deux changements de classement demandent une résolution. Les versions sont conservées.");
	return result;
}
function open(value) {
	const doc = new Doc();
	try {
		if (value.collaboration) {
			applyUpdate(doc, binary(value.collaboration.state));
			const restored = read(value, doc);
			if (!same(restored.folders, [...value.folders].sort((a, b) => a.order - b.order || lexical(a.id, b.id))) || !same(restored.notes, value.notes)) throw Error("Le classement et son historique ne correspondent pas.");
		} else write(doc, null, value);
		return doc;
	} catch (error) {
		doc.destroy();
		throw error;
	}
}
function scopeHash(key) {
	let hash = 14695981039346656037n;
	for (const c of key) {
		hash ^= BigInt(c.codePointAt(0));
		hash = BigInt.asUintN(64, hash * 1099511628211n);
	}
	return hash.toString(16);
}
function amendNotebookLibrary(before, after, scope) {
	const doc = open(before);
	try {
		write(doc, before, after);
		const lineage = before.collaboration?.lineage ?? (!before.folders.length && !Object.keys(before.notes).length ? `empty-library-${scopeHash(scope)}` : crypto.randomUUID());
		const result = {
			...after,
			collaboration: {
				schema: 1,
				lineage,
				state: encoded(encodeStateAsUpdate(doc))
			}
		};
		const restored = read(result, doc);
		if (!same(restored.notes, result.notes) || !same(restored.folders, [...result.folders].sort((a, b) => a.order - b.order || lexical(a.id, b.id)))) throw Error("Modification de classement incompatible.");
		return result;
	} finally {
		doc.destroy();
	}
}
function mergeNotebookLibrary(local, remote) {
	if (!local.collaboration || !remote.collaboration || local.collaboration.lineage !== remote.collaboration.lineage) return null;
	const doc = open(local);
	try {
		open(remote).destroy();
		applyUpdate(doc, binary(remote.collaboration.state));
		return {
			...read({
				...local,
				revision: Math.max(local.revision, remote.revision) + 1,
				updatedAt: new Date(Math.max(Date.parse(local.updatedAt), Date.parse(remote.updatedAt))).toISOString()
			}, doc),
			collaboration: {
				schema: 1,
				lineage: local.collaboration.lineage,
				state: encoded(encodeStateAsUpdate(doc))
			}
		};
	} finally {
		doc.destroy();
	}
}
//#endregion
//#region src/lib/paperSync.ts
var MAX_BODY = 16777216;
var hex = (bytes) => Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");
/** Large pages and ink travel as a compressed private blob, not oversized metadata JSON. */
async function encodePaperSync(api, spaceId, content, mutationId) {
	if (!isPaperDocument(content)) return content;
	const bytes = strToU8(JSON.stringify(content));
	if (bytes.length <= 262144) return content;
	if (bytes.length > MAX_BODY) throw Error("La note dépasse 16 Mo de contenu. Conservez une archive et répartissez-la en plusieurs notes.");
	const refs = content.blob_ids ?? [];
	if (refs.length >= 1e3) throw Error("Cette note dépasse la capacité de ses pièces jointes. Les originaux restent conservés.");
	const body = gzipSync(bytes, {
		level: 3,
		mtime: 0
	}), sha = hex(await crypto.subtle.digest("SHA-256", body));
	const blob = await api.uploadBlob(spaceId, new Blob([body], { type: "application/octet-stream" }), sha, `${mutationId}-body`);
	return {
		notebookEnvelope: 3,
		noteId: content.noteId,
		revision: content.revision,
		body_id: blob.id,
		body_sha256: sha,
		body_size: bytes.length,
		blob_ids: [...refs, blob.id]
	};
}
async function decodePaperSync(api, spaceId, content) {
	if (!content || typeof content !== "object" || content.notebookEnvelope !== 3) return content;
	const envelope = content;
	if (typeof envelope.body_id !== "string" || typeof envelope.body_sha256 !== "string" || !Number.isInteger(envelope.body_size) || !envelope.body_size || envelope.body_size > MAX_BODY) throw Error("Manifeste de la note incompatible.");
	const compressed = new Uint8Array(await (await api.downloadBlob(spaceId, envelope.body_id)).arrayBuffer());
	if (hex(await crypto.subtle.digest("SHA-256", compressed)) !== envelope.body_sha256) throw Error("La pièce jointe de la note est incomplète.");
	let size = 0;
	const chunks = [];
	new Gunzip((chunk) => {
		size += chunk.length;
		if (size > MAX_BODY) throw Error("Le document dépasse la capacité annoncée.");
		chunks.push(chunk);
	}).push(compressed, true);
	if (size !== envelope.body_size) throw Error("La taille de la note reçue est incorrecte.");
	const bytes = new Uint8Array(size);
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.length;
	}
	const document = JSON.parse(strFromU8(bytes));
	if (!isPaperDocument(document) || document.noteId !== envelope.noteId || document.revision !== envelope.revision) throw Error("La version reçue ne correspond pas à cette note.");
	return document;
}
//#endregion
//#region pwa/src/sync.ts
var serial = Promise.resolve();
var spaces = /* @__PURE__ */ new Map();
function synchronizeSpace(api, accountId, spaceId, current) {
	const key = `${accountId}|${spaceId}`;
	const next = (spaces.get(key) ?? Promise.resolve()).catch(() => void 0).then(async () => {
		if (!current() || !navigator.onLine) return;
		api.bindAccount(accountId);
		await normalizeNotebookIdentities({
			accountId,
			spaceId
		}, current);
		await queueLocalDrafts(accountId, spaceId, api.syncDocumentFilter);
		await flushMutations(api, accountId, spaceId, current);
		if (!current()) return;
		const saved = (await listSnapshots(accountId, spaceId)).find((item) => item.key === `sync-cursor|${key}`)?.value;
		let cursor = typeof saved === "string" ? saved : void 0;
		const seen = /* @__PURE__ */ new Set();
		while (current()) {
			const page = await api.changes(spaceId, cursor);
			if (!current()) return;
			const logicalChanges = [];
			for (const item of page.items) {
				const received = await receiveNoteMetadataTransport(item, {
					accountId,
					spaceId
				}, current);
				if (received) logicalChanges.push(received);
			}
			page.items = [...new Map(logicalChanges.map((item) => [`${item.document_type}|${item.document_id}`, item])).values()];
			for (const item of page.items) {
				if (item.document_type === "whiteboard" && item.document_id.startsWith("paper-v3-") && !item.deleted) item.content = await decodePaperSync(api, spaceId, item.content);
				if (!current()) return;
			}
			await applyChangePage(accountId, spaceId, page, current);
			await normalizeNotebookIdentities({
				accountId,
				spaceId
			}, current);
			if (!page.has_more) break;
			if (!page.next_cursor || seen.has(page.next_cursor)) throw new Error("Pagination de synchronisation incohérente.");
			seen.add(page.next_cursor);
			cursor = page.next_cursor;
		}
	});
	spaces.set(key, next);
	const clear = () => {
		if (spaces.get(key) === next) spaces.delete(key);
	};
	next.then(clear, clear);
	return next;
}
/** One uploader per browser instance; versions are sent in their durable order. */
function flushMutations(api, accountId, spaceId, current) {
	const next = serial.catch(() => void 0).then(async () => {
		if (!current()) return;
		api.bindAccount(accountId);
		for (const photo of await listLocalBlobs(accountId, spaceId)) {
			if (!current() || !navigator.onLine) return;
			if (photo.status === "uploaded" || photo.removedFromNote) continue;
			const digest = await crypto.subtle.digest("SHA-256", await photo.blob.arrayBuffer());
			if (!current()) return;
			const sha = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
			const uploadBlob = photo.blob.type.startsWith("audio/") || photo.blob.type === "image/gif" ? new Blob([photo.blob], { type: "application/octet-stream" }) : photo.blob;
			const uploaded = await api.uploadBlob(spaceId, uploadBlob, sha, photo.id);
			if (!current()) return;
			await acknowledgeLocalBlob(photo, uploaded.id, current);
		}
		const uploadedAssets = await listLocalBlobs(accountId, spaceId);
		const blocked = /* @__PURE__ */ new Set();
		for (const mutation of (await listMutations(accountId, spaceId)).sort((a, b) => Number(!ownsPaperDocument(a.type, a.documentId)) - Number(!ownsPaperDocument(b.type, b.documentId)))) {
			if (!current() || !navigator.onLine) return;
			if (mutation.identityAlias) continue;
			const durable = await getDraft(mutation);
			if (!current()) return;
			if (durable?.identityAlias || isPaperDocument(mutation.content) && mutation.documentId !== notebookDocumentId(mutation.content.noteId)) continue;
			if (isPaperDocument(mutation.content) && await readNotebookDeletionStatus(mutation.content.noteId, {
				accountId,
				spaceId
			}, current)) continue;
			if (!current()) return;
			if (api.syncDocumentFilter && !api.syncDocumentFilter(mutation.type, mutation.documentId)) continue;
			if (mutation.type === "notesMarkdown") {
				if (durable?.paperDependency) {
					const dependency = await getDraft({
						...mutation,
						type: "whiteboard",
						documentId: durable.paperDependency
					});
					if (!dependency || dependency.staged || dependency.syncState !== "synced") continue;
				}
			}
			const key = `${mutation.type}|${mutation.documentId}`;
			if (blocked.has(key) || mutation.status === "conflict") {
				blocked.add(key);
				continue;
			}
			try {
				const resolved = resolvePaperAssets(mutation.content, uploadedAssets);
				const content = isPaperDocument(mutation.content) && hasPaperCollaboration(mutation.content) && isPaperDocument(resolved) ? amendPaperCollaboration(mutation.content, resolved) : resolved;
				const transmitted = await encodePaperSync(api, spaceId, content, mutation.id);
				const metadataDocument = {
					type: mutation.type,
					id: mutation.documentId,
					content: transmitted
				}, prepared = await prepareNoteMetadataMutation(metadataDocument, mutation.baseVersion, mutation.id, {
					accountId,
					spaceId
				}, current);
				if (!current()) return;
				const result = await api.putDocument(spaceId, mutation.type, prepared.id, prepared.baseVersion, prepared.content, mutation.id);
				if (!current()) return;
				await acknowledgeNoteMetadataTransport(metadataDocument, result.version, {
					accountId,
					spaceId
				}, current);
				if (!current()) return;
				await acknowledgeMutation(mutation, result.version, content, current);
			} catch (error) {
				if (error instanceof ApiError && error.status === 409 && error.code !== "session_account_changed") {
					blocked.add(key);
					const draft = await getDraft(mutation);
					if (draft && current() && (isPaperDocument(draft.content) && hasPaperCollaboration(draft.content) || isNotebookLibrary(draft.content) && draft.content.collaboration)) {
						let cursor, remote;
						const seen = /* @__PURE__ */ new Set();
						do {
							const page = await api.changes(spaceId, cursor);
							if (!current()) return;
							for (const item of page.items) if (item.document_type === mutation.type && item.document_id === mutation.documentId) remote = item;
							if (!page.has_more) break;
							if (!page.next_cursor || seen.has(page.next_cursor)) throw Error("Pagination collaborative incohérente.");
							seen.add(page.next_cursor);
							cursor = page.next_cursor;
						} while (current());
						if (remote && !remote.deleted) {
							const received = await decodePaperSync(api, spaceId, remote.content);
							if (!current()) return;
							if (isPaperDocument(received) || isNotebookLibrary(received)) {
								let merged = null;
								try {
									merged = isPaperDocument(draft.content) && isPaperDocument(received) ? mergePaperCollaboration(draft.content, received) : isNotebookLibrary(draft.content) && isNotebookLibrary(received) ? mergeNotebookLibrary(draft.content, received) : null;
								} catch {}
								if (merged) try {
									await resolvePaperDraft(draft, draft.content, {
										...draft,
										content: received,
										baseVersion: remote.version,
										syncState: "synced"
									}, remote.version, merged, crypto.randomUUID());
									continue;
								} catch {}
							}
						}
					}
					await queueMutation({
						...mutation,
						status: "conflict",
						error: error.message
					});
					const latest = await getDraft(mutation);
					if (latest) await putDraft({
						...latest,
						syncState: "conflict",
						conflict: { serverVersion: error.currentVersion }
					});
				} else throw error;
			}
		}
		if (!current()) return;
		const photos = await listLocalBlobs(accountId, spaceId);
		for (const draft of await listDrafts(accountId, spaceId)) {
			if (!current()) return;
			if (draft.type !== "whiteboard" || draft.syncState !== "synced" || api.syncDocumentFilter && !api.syncDocumentFilter(draft.type, draft.documentId)) continue;
			if (draft.identityAlias || isPaperDocument(draft.content)) continue;
			const content = draft.content;
			if (!Array.isArray(content.photos)) continue;
			const updatedPhotos = content.photos.map((photo) => {
				const local = photos.find((item) => item.id === photo.id);
				return local?.serverId ? {
					...photo,
					serverId: local.serverId,
					status: "uploaded"
				} : photo;
			});
			const updated = {
				...content,
				photos: updatedPhotos,
				blob_ids: updatedPhotos.flatMap((photo) => photo.serverId ? [photo.serverId] : [])
			};
			if (JSON.stringify(updated) === JSON.stringify(content)) continue;
			let mutation;
			try {
				mutation = await saveDraftAndQueue({
					...draft,
					content: updated
				}, {
					...draft,
					id: crypto.randomUUID(),
					content: updated,
					createdAt: Date.now(),
					status: "pending"
				}, draft.content);
			} catch (error) {
				if (error instanceof DraftChangedError) continue;
				throw error;
			}
			if (!current()) return;
			const result = await api.putDocument(spaceId, mutation.type, mutation.documentId, mutation.baseVersion, mutation.content, mutation.id);
			if (!current()) return;
			await acknowledgeMutation(mutation, result.version, void 0, current);
		}
	});
	serial = next;
	return next;
}
/** Blob bytes are acknowledged before a v3 document can publish their references. */
function resolvePaperAssets(content, blobs) {
	if (!content || typeof content !== "object" || content.notebookSchema !== 3) return content;
	const paper = content;
	if (!Array.isArray(paper.assets)) throw Error("Manifeste des pièces jointes invalide.");
	const assets = paper.assets.map((asset) => {
		const local = blobs.find((blob) => blob.id === asset.id);
		const serverId = asset.serverId ?? (local?.status === "uploaded" ? local.serverId : void 0);
		if (!serverId) throw Error("Une pièce jointe attend son transfert avant la synchronisation de la note.");
		return {
			...asset,
			serverId
		};
	});
	const blob_ids = [...new Set(assets.map((asset) => asset.serverId))];
	if (blob_ids.length > 1e3) throw Error("La note dépasse la capacité de ses pièces jointes. Ses originaux restent conservés.");
	return {
		...content,
		assets,
		blob_ids
	};
}
//#endregion
//#region src/lib/continuousSync.ts
/** Coalesce edits while serializing requests. A change during a request gets a new pass. */
function continuousSync(run, onError, options = {}) {
	const delay = options.delay ?? 500;
	let stopped = false, running = false, requested = false;
	let timer;
	let retryAt = 0, failures = 0;
	async function drain() {
		if (stopped || running) return;
		if (Date.now() < retryAt) {
			if (timer) clearTimeout(timer);
			timer = setTimeout(() => {
				timer = void 0;
				drain();
			}, retryAt - Date.now());
			return;
		}
		running = true;
		try {
			while (requested && !stopped) {
				requested = false;
				try {
					await run();
					failures = 0;
					retryAt = 0;
				} catch (error) {
					failures++;
					const limited = typeof error === "object" && error !== null && "status" in error && error.status === 429;
					retryAt = Date.now() + (limited ? 6e4 : Math.min(6e4, (options.retryDelay ?? 3e3) * 2 ** Math.min(failures - 1, 5)));
					requested = true;
					if (!stopped) {
						onError(error);
						timer = setTimeout(() => {
							timer = void 0;
							drain();
						}, retryAt - Date.now());
					}
					break;
				}
			}
		} finally {
			running = false;
		}
	}
	function request(immediate = false) {
		if (stopped) return;
		requested = true;
		if (timer) clearTimeout(timer);
		if (immediate) drain();
		else timer = setTimeout(() => {
			timer = void 0;
			drain();
		}, delay);
	}
	const poll = setInterval(() => request(true), options.interval ?? 3e3);
	return {
		request,
		stop() {
			stopped = true;
			clearInterval(poll);
			if (timer) clearTimeout(timer);
		}
	};
}
//#endregion
//#region src/lib/subjectNotes.ts
var MAX_DOCUMENT_ID_LENGTH = 200;
var MAX_SUBJECTS_PER_NOTE = 50;
var MAX_TAGS_PER_NOTE = 30;
var MAX_TAG_LENGTH = 64;
var MAX_TITLE_LENGTH = 500;
var V1_STORE_FIELDS = /* @__PURE__ */ new Set([
	"schemaVersion",
	"documents",
	"activeDocumentBySubject"
]);
var V1_DOCUMENT_FIELDS = /* @__PURE__ */ new Set([
	"id",
	"subjectId",
	"title",
	"markdown",
	"createdAt",
	"updatedAt"
]);
var V2_STORE_FIELDS = /* @__PURE__ */ new Set([
	"schemaVersion",
	"documents",
	"openDocumentIds",
	"activeDocumentId"
]);
var V2_DOCUMENT_FIELDS = /* @__PURE__ */ new Set([
	"id",
	"title",
	"markdown",
	"subjectIds",
	"tags",
	"createdAt",
	"updatedAt"
]);
function isRecord(value) {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function hasOnlyFields(value, fields) {
	return Object.keys(value).every((field) => fields.has(field));
}
function validText(value, maxLength) {
	return typeof value === "string" && value.length > 0 && value.length <= maxLength;
}
function validIsoDate(value) {
	return typeof value === "string" && Number.isFinite(Date.parse(value));
}
function isNormalizedSubjectIds(value) {
	if (!Array.isArray(value) || value.length > MAX_SUBJECTS_PER_NOTE) return false;
	const seen = /* @__PURE__ */ new Set();
	return value.every((subjectId) => {
		if (!validText(subjectId, MAX_DOCUMENT_ID_LENGTH) || subjectId !== subjectId.trim() || seen.has(subjectId)) return false;
		seen.add(subjectId);
		return true;
	});
}
function isNormalizedTags(value) {
	if (!Array.isArray(value) || value.length > MAX_TAGS_PER_NOTE) return false;
	const seen = /* @__PURE__ */ new Set();
	return value.every((tag) => {
		if (!validText(tag, MAX_TAG_LENGTH) || tag !== tag.trim()) return false;
		const comparisonKey = tag.toLocaleLowerCase("fr");
		if (seen.has(comparisonKey)) return false;
		seen.add(comparisonKey);
		return true;
	});
}
function isLegacyDocument(value) {
	if (!isRecord(value) || !hasOnlyFields(value, V1_DOCUMENT_FIELDS)) return false;
	return validText(value.id, MAX_DOCUMENT_ID_LENGTH) && validText(value.subjectId, MAX_DOCUMENT_ID_LENGTH) && value.subjectId === value.subjectId.trim() && typeof value.title === "string" && value.title.length <= MAX_TITLE_LENGTH && typeof value.markdown === "string" && validIsoDate(value.createdAt) && validIsoDate(value.updatedAt);
}
function isV2Document(value) {
	if (!isRecord(value) || !hasOnlyFields(value, V2_DOCUMENT_FIELDS)) return false;
	return validText(value.id, MAX_DOCUMENT_ID_LENGTH) && typeof value.title === "string" && value.title.length <= MAX_TITLE_LENGTH && typeof value.markdown === "string" && isNormalizedSubjectIds(value.subjectIds) && isNormalizedTags(value.tags) && validIsoDate(value.createdAt) && validIsoDate(value.updatedAt);
}
function isLegacySubjectNotesStore(value) {
	if (!isRecord(value) || !hasOnlyFields(value, V1_STORE_FIELDS) || value.schemaVersion !== 1 || !Array.isArray(value.documents) || !isRecord(value.activeDocumentBySubject)) return false;
	const documentsById = /* @__PURE__ */ new Map();
	for (const document of value.documents) {
		if (!isLegacyDocument(document) || documentsById.has(document.id)) return false;
		documentsById.set(document.id, document);
	}
	return Object.entries(value.activeDocumentBySubject).every(([subjectId, documentId]) => {
		if (!validText(subjectId, MAX_DOCUMENT_ID_LENGTH) || subjectId !== subjectId.trim()) return false;
		if (typeof documentId !== "string") return false;
		return documentsById.get(documentId)?.subjectId === subjectId;
	});
}
function isSubjectNotesStore(value) {
	if (!isRecord(value) || !hasOnlyFields(value, V2_STORE_FIELDS) || value.schemaVersion !== 2 || !Array.isArray(value.documents) || !Array.isArray(value.openDocumentIds) || !(value.activeDocumentId === null || typeof value.activeDocumentId === "string")) return false;
	const documentIds = /* @__PURE__ */ new Set();
	for (const document of value.documents) {
		if (!isV2Document(document) || documentIds.has(document.id)) return false;
		documentIds.add(document.id);
	}
	const openIds = /* @__PURE__ */ new Set();
	for (const documentId of value.openDocumentIds) {
		if (typeof documentId !== "string" || !documentIds.has(documentId) || openIds.has(documentId)) return false;
		openIds.add(documentId);
	}
	return value.activeDocumentId === null || openIds.has(value.activeDocumentId);
}
/** Accepte strictement les deux formats réellement persistés. */
function isPersistedSubjectNotesStore(value) {
	return isLegacySubjectNotesStore(value) || isSubjectNotesStore(value);
}
//#endregion
//#region src/lib/paperArchiveMetadata.ts
var paperArchiveMetadata_exports = /* @__PURE__ */ __exportAll({
	isPaperArchiveMetadata: () => isPaperArchiveMetadata,
	paperArchiveMetadata: () => paperArchiveMetadata,
	paperMarkdown: () => paperMarkdown
});
var pagePositionError = () => Error("La disposition du texte doit être actualisée avant son export dans l’ordre des pages. Son contenu original reste conservé.");
function freshFlowOffsets(object) {
	const flow = object.textFlow, markdown = object.markdown ?? "", offsets = flow?.sourceOffsets;
	if (!flow || !offsets || flow.source !== textFlowFingerprint(markdown, object.width, object.height) || offsets.length !== flow.pageIds.length + 1 || offsets[0] !== 0 || offsets.at(-1) !== markdown.length || offsets.some((offset, index) => !Number.isSafeInteger(offset) || offset < 0 || index > 0 && offset < offsets[index - 1])) throw pagePositionError();
	return offsets;
}
/**
* Page position, rather than object creation order, determines the exported reading order.
* An untouched continuous passage is emitted once, byte for byte. When other text or
* reordered pages interrupt it, fresh parser positions provide independent rich passages.
*/
function paperMarkdown(document) {
	const positions = new Map(document.pages.map((page, index) => [page.id, index])), buckets = document.pages.map(() => []), contiguousFlows = /* @__PURE__ */ new Set();
	document.objects.forEach((object, objectIndex) => {
		if (object.kind !== "text") return;
		const flow = object.textFlow;
		if (flow && flow.pageIds.length > 1) {
			const pagePositions = flow.pageIds.map((id) => positions.get(id));
			if (pagePositions.some((position) => position === void 0)) throw pagePositionError();
			if (pagePositions.every((position, index) => position === pagePositions[0] + index)) contiguousFlows.add(object.id);
			else freshFlowOffsets(object);
			flow.pageIds.forEach((id, flowIndex) => buckets[positions.get(id)].push({
				object,
				objectIndex,
				flowIndex
			}));
		} else {
			const position = positions.get(object.pageId);
			if (position === void 0) throw pagePositionError();
			buckets[position].push({
				object,
				objectIndex,
				flowIndex: 0
			});
		}
	});
	const entries = buckets.flatMap((bucket) => bucket.sort((a, b) => a.object.y - b.object.y || a.object.x - b.object.x || a.object.z - b.object.z || a.objectIndex - b.objectIndex)), passages = [];
	for (let index = 0; index < entries.length;) {
		const entry = entries[index], object = entry.object, flow = object.textFlow;
		if (!flow || flow.pageIds.length === 1) {
			passages.push(object.markdown ?? "");
			index++;
			continue;
		}
		let end = index + 1;
		while (end < entries.length && entries[end].object.id === object.id && entries[end].flowIndex === entries[end - 1].flowIndex + 1) end++;
		const last = entries[end - 1];
		if (contiguousFlows.has(object.id) && entry.flowIndex === 0 && last.flowIndex === flow.pageIds.length - 1) passages.push(object.markdown ?? "");
		else {
			const offsets = freshFlowOffsets(object);
			passages.push(copyMarkdownRange(object.markdown ?? "", offsets[entry.flowIndex], offsets[last.flowIndex + 1]));
		}
		index = end;
	}
	return passages.join("\n\n");
}
function isPaperArchiveMetadata(value) {
	if (!value || typeof value !== "object") return false;
	const m = value;
	if (m.schema !== 1 || !Number.isFinite(Date.parse(m.exportedAt)) || !Array.isArray(m.folderPath) || m.folderPath.length > 6 || !m.note) return false;
	if (!isPersistedSubjectNotesStore({
		schemaVersion: 2,
		documents: [m.note],
		openDocumentIds: [],
		activeDocumentId: null
	})) return false;
	if (m.folderPath.some((folder, i) => !folder || folder.parentId !== (i ? m.folderPath[i - 1].id : null))) return false;
	if (m.classification?.folderId !== (m.folderPath.at(-1)?.id ?? null)) return false;
	return isNotebookLibrary({
		schema: 1,
		revision: 0,
		updatedAt: m.exportedAt,
		folders: m.folderPath,
		notes: { [m.note.id]: m.classification }
	});
}
/** Only this note's ancestor folders are exported; other notes never enter its archive. */
function paperArchiveMetadata(document, note, library, now = (/* @__PURE__ */ new Date()).toISOString()) {
	const classification = structuredClone(library && Object.hasOwn(library.notes, document.noteId) ? library.notes[document.noteId] : emptyClassification()), folderPath = [];
	let parent = classification.folderId;
	while (parent) {
		const folder = library?.folders.find((f) => f.id === parent);
		if (!folder || folderPath.length >= 6 || folderPath.some((f) => f.id === parent)) throw Error("Le classement de cette note doit être récupéré avant son export.");
		folderPath.unshift(structuredClone(folder));
		parent = folder.parentId;
	}
	const metadata = {
		schema: 1,
		exportedAt: now,
		note: {
			id: document.noteId,
			title: note?.title?.trim() || "Note Dowze",
			markdown: paperMarkdown(document),
			subjectIds: note?.subjectIds ?? [],
			tags: note?.tags ?? [],
			createdAt: note?.createdAt ?? document.legacy.migratedAt,
			updatedAt: note?.updatedAt ?? document.updatedAt
		},
		classification,
		folderPath
	};
	if (!isPaperArchiveMetadata(metadata)) throw Error("Les informations de la note ne peuvent pas être archivées dans leur format actuel.");
	return metadata;
}
//#endregion
//#region src/lib/paperArchive.ts
var paperArchive_exports = /* @__PURE__ */ __exportAll({
	MAX_PAPER_ARCHIVE_BYTES: () => MAX_PAPER_ARCHIVE_BYTES,
	MAX_PAPER_ARCHIVE_ENTRIES: () => MAX_PAPER_ARCHIVE_ENTRIES,
	MAX_PAPER_ARCHIVE_MEMBER_BYTES: () => MAX_PAPER_ARCHIVE_MEMBER_BYTES,
	appendPaperArchive: () => appendPaperArchive,
	verifyPaperArchiveBlob: () => verifyPaperArchiveBlob
});
/** Total archive quota; each media remains within the cloud's 16 MiB blob quota. */
var MAX_PAPER_ARCHIVE_BYTES = 268435456;
var MAX_PAPER_ARCHIVE_MEMBER_BYTES = 16777216;
var MAX_PAPER_ARCHIVE_ENTRIES = 10003;
var acceptedEntry = (name) => /^(document\.json|metadata\.json|integrity\.json|assets\/[A-Za-z0-9._-]{1,200})$/.test(name);
function parsePaperArchive(files, size, text) {
	if (Object.values(files).reduce((sum, file) => sum + size(file), 0) > 268435456 || Object.values(files).some((file) => size(file) > 16777216)) throw Error("Le contenu de l’archive dépasse la taille prise en charge.");
	if (!files["document.json"]) throw Error("Cette archive ne contient pas une note Dowze.");
	const document = JSON.parse(text["document.json"]);
	if (!isPaperDocument(document)) throw Error("Format de note invalide ou non pris en charge.");
	let metadata;
	if (files["metadata.json"]) {
		const value = JSON.parse(text["metadata.json"]);
		if (!isPaperArchiveMetadata(value) || value.note.id !== document.noteId) throw Error("Informations de note incompatibles dans l’archive.");
		metadata = value;
	}
	let integrity;
	if (files["integrity.json"]) {
		const value = JSON.parse(text["integrity.json"]);
		if (value?.schema !== 1 || !value.files || typeof value.files !== "object" || Array.isArray(value.files)) throw Error("Manifeste d’intégrité incompatible.");
		if (value.assetPaths !== void 0 && (!value.assetPaths || typeof value.assetPaths !== "object" || Array.isArray(value.assetPaths) || Object.keys(value.assetPaths).length !== document.assets.length || document.assets.some((a) => typeof value.assetPaths[a.id] !== "string" || !/^assets\/[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/.test(value.assetPaths[a.id])) || new Set(Object.values(value.assetPaths)).size !== document.assets.length)) throw Error("Références de pièces jointes incompatibles.");
		const required = [
			"document.json",
			...metadata ? ["metadata.json"] : [],
			...document.assets.map((a) => value.assetPaths?.[a.id] ?? `assets/${a.id}`)
		];
		if (Object.keys(value.files).length !== required.length || required.some((name) => {
			const row = value.files[name];
			return !row || !Number.isSafeInteger(row.size) || row.size < 0 || !files[name] || row.size !== size(files[name]) || typeof row.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(row.sha256);
		})) throw Error("Le manifeste ne correspond pas au contenu de l’archive.");
		integrity = value;
	}
	const logicalFiles = { ...files };
	for (const asset of document.assets) {
		const path = integrity?.assetPaths?.[asset.id] ?? `assets/${asset.id}`;
		if (!files[path]) throw Error(`La pièce jointe « ${asset.name} » manque dans l’archive.`);
		logicalFiles[`assets/${asset.id}`] = files[path];
	}
	if (metadata && !integrity) throw Error("Cette archive de note complète ne contient pas son manifeste d’intégrité.");
	return {
		document,
		files: logicalFiles,
		physicalFiles: files,
		metadata,
		integrity
	};
}
function corruptedEntry(archive, name) {
	const label = name === "document.json" ? "contenu de la note" : name === "metadata.json" ? "informations de la note" : archive.document.assets.find((a) => (archive.integrity?.assetPaths?.[a.id] ?? `assets/${a.id}`) === name)?.name ?? "pièce jointe";
	return Error(`L’archive contient un élément endommagé : ${label}. Votre carnet est inchangé.`);
}
/** Read the ZIP footer before extraction: incomplete archives never reach the storage transaction. */
async function archiveFooter(blob) {
	const offset = Math.max(0, blob.size - 65557), bytes = new Uint8Array(await blob.slice(offset).arrayBuffer()), view = new DataView(bytes.buffer);
	for (let i = bytes.length - 22; i >= 0; i--) if (view.getUint32(i, true) === 101010256 && i + 22 + view.getUint16(i + 20, true) === bytes.length) {
		const entries = view.getUint16(i + 10, true);
		if (view.getUint16(i + 4, true) !== 0 || view.getUint16(i + 6, true) !== 0 || view.getUint16(i + 8, true) !== entries || entries > 10003 || view.getUint32(i + 12, true) + view.getUint32(i + 16, true) !== offset + i) throw Error("Structure d’archive incompatible.");
		return entries;
	}
	throw Error("L’archive est incomplète. Son original et votre carnet sont conservés.");
}
/** Compressed input and expanded media are consumed in bounded pieces, never a whole ZIP ArrayBuffer. */
async function verifyPaperArchiveBlob(blob, current = () => true, onProgress) {
	const check = () => {
		if (!current()) throw Error("Le carnet a changé pendant l’importation.");
	};
	check();
	if (blob.size > 268435456) throw Error("L’archive dépasse 256 Mo.");
	const expectedEntries = await archiveFooter(blob);
	check();
	const files = Object.create(null), names = /* @__PURE__ */ new Set();
	let total = 0, count = 0, complete = 0, accepted = 0;
	const streams = [];
	const { Unzip, UnzipInflate } = await import("fflate");
	const unzip = new Unzip((file) => {
		check();
		if (++count > 10003 || names.has(file.name)) throw Error("L’archive contient trop d’éléments ou des noms répétés.");
		names.add(file.name);
		if (!acceptedEntry(file.name)) return;
		if (file.originalSize !== void 0 && file.originalSize > 16777216) throw Error("Une pièce de l’archive dépasse 16 Mo.");
		accepted++;
		streams.push(file);
		let size = 0;
		const pieces = [];
		file.ondata = (error, chunk, final) => {
			check();
			if (error) throw error;
			size += chunk.length;
			total += chunk.length;
			if (size > 16777216 || total > 268435456) throw Error("Le contenu décompressé dépasse la taille prise en charge.");
			if (chunk.length) pieces.push(new Blob([chunk]));
			if (final) {
				files[file.name] = new Blob(pieces);
				pieces.length = 0;
				complete++;
			}
		};
		file.start();
	});
	unzip.register(UnzipInflate);
	try {
		for (let offset = 0; offset < blob.size; offset += 16384) {
			check();
			const end = Math.min(blob.size, offset + 16384);
			unzip.push(new Uint8Array(await blob.slice(offset, end).arrayBuffer()), end === blob.size);
			onProgress?.(end, blob.size);
			if (offset % 1048576 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
		}
		if (count !== expectedEntries || complete !== accepted) throw Error("L’archive est incomplète. Votre carnet est inchangé.");
		check();
		const text = Object.create(null);
		for (const name of [
			"document.json",
			"metadata.json",
			"integrity.json"
		]) if (files[name]) {
			text[name] = await files[name].text();
			check();
		}
		const archive = parsePaperArchive(files, (file) => file.size, text);
		if (archive.integrity) for (const [name, row] of Object.entries(archive.integrity.files)) {
			check();
			const digest = await crypto.subtle.digest("SHA-256", await files[name].arrayBuffer());
			check();
			if ([...new Uint8Array(digest)].map((n) => n.toString(16).padStart(2, "0")).join("") !== row.sha256) throw corruptedEntry(archive, name);
		}
		return archive;
	} finally {
		for (const stream of streams) stream.terminate();
	}
}
/** Import is an append transaction: the destination note and its recovery source survive. */
function appendPaperArchive(source, destinationNoteId) {
	const groups = new Map(source.objects.filter((o) => o.groupId).map((o) => [o.groupId, crypto.randomUUID()]));
	const objects = new Map(source.objects.map((o) => [o.id, crypto.randomUUID()]));
	const pages = new Map(source.pages.map((p) => [p.id, crypto.randomUUID()])), assets = new Map(source.assets.map((a) => [a.id, crypto.randomUUID()])), audio = new Map(source.audio.map((a) => [a.id, crypto.randomUUID()]));
	return {
		commands: [
			...source.study ? source.study.cards.map((card) => ({
				type: "study-card",
				card: {
					...card,
					id: crypto.randomUUID(),
					...card.source ? { source: {
						...card.source,
						noteId: destinationNoteId,
						pageId: pages.get(card.source.pageId) ?? card.source.pageId,
						objectId: objects.get(card.source.objectId) ?? card.source.objectId
					} } : {}
				}
			})) : [],
			...source.assets.map((a) => ({
				type: "add-asset",
				asset: {
					id: assets.get(a.id),
					name: a.name,
					mediaType: a.mediaType,
					size: a.size
				}
			})),
			...source.audio.map((a) => ({
				type: "add-audio",
				audio: {
					...a,
					id: audio.get(a.id),
					assetId: assets.get(a.assetId),
					...a.source ? { source: {
						...a.source,
						chunks: a.source.chunks.map((chunk) => ({
							...chunk,
							assetId: assets.get(chunk.assetId)
						}))
					} } : {},
					...a.segments ? { segments: a.segments.map((part) => ({
						...part,
						assetId: assets.get(part.assetId),
						...part.source ? { source: {
							...part.source,
							chunks: part.source.chunks.map((chunk) => ({
								...chunk,
								assetId: assets.get(chunk.assetId)
							}))
						} } : {}
					})) } : {}
				}
			})),
			...source.pages.map((p) => ({
				type: "insert-page",
				page: {
					...p,
					...p.flowRootId ? { flowRootId: objects.get(p.flowRootId) } : {},
					id: pages.get(p.id),
					...p.pdf ? { pdf: {
						...p.pdf,
						assetId: assets.get(p.pdf.assetId)
					} } : {}
				}
			})),
			...source.objects.map((o) => ({
				type: "upsert-object",
				object: {
					...o,
					...o.textFlow ? { textFlow: {
						...o.textFlow,
						pageIds: o.textFlow.pageIds.map((id) => pages.get(id))
					} } : {},
					...o.markdown ? { markdown: o.markdown.replace(/dowze-photo:[^\s)]+/g, (src) => {
						const ref = parseArchivePhoto(src);
						return ref && assets.has(ref.id) ? photoReference(notebookDocumentId(destinationNoteId), assets.get(ref.id)) : src;
					}) } : {},
					...o.groupId ? { groupId: groups.get(o.groupId) } : {},
					id: objects.get(o.id),
					pageId: pages.get(o.pageId),
					...o.assetId ? { assetId: assets.get(o.assetId) } : {},
					...o.audioAnchor ? { audioAnchor: {
						...o.audioAnchor,
						sessionId: audio.get(o.audioAnchor.sessionId)
					} } : {}
				}
			}))
		],
		assets,
		firstPageId: pages.get(source.pages[0].id)
	};
}
/** Legacy document IDs can be longer than server keys; importing maps them to fresh bounded IDs. */
function parseArchivePhoto(src) {
	const known = parsePhotoReference(src);
	if (known) return known;
	const match = /^dowze-photo:([^/]+)\/([^/]+)$/.exec(src);
	if (!match) return null;
	try {
		const id = decodeURIComponent(match[2]);
		return id.length > 0 && id.length <= 200 ? { id } : null;
	} catch {
		return null;
	}
}
//#endregion
//#region src/lib/paperConflict.ts
/** Both versions keep their original page geometry, attachments and review sources. */
async function preparePaperResolution(local, remote, choice, media) {
	if (!isPaperDocument(local) || remote && (!isPaperDocument(remote) || remote.noteId !== local.noteId)) throw Error("Ces versions ne correspondent pas à la même note.");
	if (choice === "server" && !remote) throw Error("La note a été supprimée sur le serveur. Votre copie locale reste disponible.");
	let result = choice === "server" ? remote : local;
	if (choice === "both" && remote) {
		const mapped = appendPaperArchive(remote, local.noteId);
		for (const asset of remote.assets) {
			const blob = await readPaperAsset(asset, media);
			const id = mapped.assets.get(asset.id);
			await putLocalBlob({
				id,
				accountId: media.accountId,
				spaceId: media.spaceId,
				blob,
				name: asset.name,
				createdAt: Date.now(),
				status: "pending"
			});
		}
		result = applyPaperCommand(local, {
			type: "batch",
			commands: mapped.commands
		});
	}
	const selected = {
		...result,
		revision: Math.max(local.revision, remote?.revision ?? 0, result.revision) + 1,
		updatedAt: (/* @__PURE__ */ new Date()).toISOString()
	};
	try {
		return amendPaperCollaboration(choice === "server" ? remote : local, selected);
	} catch {
		const clean = { ...selected };
		delete clean.collaboration;
		return amendPaperCollaboration(clean, clean);
	}
}
//#endregion
//#region src/hooks/usePaperDocument.ts
function usePaperDocument(noteId, markdown, media, visible = true) {
	const sourceMarkdown = useRef(markdown);
	sourceMarkdown.current = markdown;
	const [legacyObserved, setLegacyObserved] = useState(null), [reconciling, setReconciling] = useState(false);
	const [legacyReconcileEpoch, setLegacyReconcileEpoch] = useState(0);
	const selfMirrors = useRef([]);
	const [importGeneration, setImportGeneration] = useState(0);
	const [document, setDocument] = useState(null), [notice, setNotice] = useState(""), [blocked, setBlocked] = useState(false), [saved, setSaved] = useState(false);
	const [resolution, setResolution] = useState(null), [resolving, setResolving] = useState(false);
	const writable = useRef(true), opening = useRef(Promise.resolve());
	const persistenceFailure = useRef(false);
	const current = useRef(null), draft = useRef(null), history = useRef(emptyPaperHistory()), tail = useRef(Promise.resolve()), alive = useRef(true), pending = useRef(0), generation = useRef(0);
	const owner = {
		accountId: media.accountId,
		spaceId: media.spaceId
	};
	const scope = {
		...owner,
		type: "whiteboard",
		documentId: notebookDocumentId(noteId)
	};
	const scopeKey = JSON.stringify([
		media.accountId,
		media.spaceId,
		noteId
	]);
	const renderedScope = useRef(scopeKey);
	renderedScope.current = scopeKey;
	const documentOwner = useRef(scopeKey);
	const accessEpoch = useRef({
		key: scopeKey,
		api: media.api,
		value: 0
	});
	if (accessEpoch.current.key !== scopeKey || accessEpoch.current.api !== media.api) accessEpoch.current = {
		key: scopeKey,
		api: media.api,
		value: accessEpoch.current.value + 1
	};
	const acceptedEpoch = accessEpoch.current.value;
	const accepts = () => alive.current && accessEpoch.current.value === acceptedEpoch && renderedScope.current === scopeKey && documentOwner.current === scopeKey;
	const renderedApi = useRef(media.api);
	renderedApi.current = media.api;
	const downloadOriginal = (valid) => {
		const api = media.api;
		if (!api) return void 0;
		return async (need) => {
			const active = () => valid() && renderedScope.current === scopeKey && renderedApi.current === api && writable.current;
			if (!active() || need.accountId !== owner.accountId || need.spaceId !== owner.spaceId || !need.serverId) throw Error("La connexion ou la source de l’image a changé. Ses originaux restent conservés.");
			api.bindAccount(owner.accountId);
			let blob;
			try {
				blob = await api.downloadBlob(owner.spaceId, need.serverId);
			} catch (error) {
				if (!active()) throw Error("La connexion a changé pendant la récupération de l’image. Aucun fichier n’a été remplacé.");
				if (error instanceof TypeError || error instanceof ApiError && error.status >= 500) throw new Error("Les images d’origine attendent la connexion au serveur. Vos notes restent conservées ; leur ouverture reprendra au retour de la connexion.", { cause: error });
				if (error instanceof ApiError && (error.status === 401 || error.status === 403)) throw new Error("Reconnectez-vous à Dowze pour retrouver les images de cette note. Ses originaux restent conservés.", { cause: error });
				throw error;
			}
			if (!active()) throw Error("La connexion a changé pendant la récupération de l’image. Aucun fichier n’a été remplacé.");
			return blob;
		};
	};
	const retryOpen = () => {
		if (writable.current && !current.current && !persistenceFailure.current && renderedScope.current === scopeKey) setImportGeneration((value) => value + 1);
	};
	useEffect(() => {
		const online = () => retryOpen();
		addEventListener("online", online);
		return () => removeEventListener("online", online);
	}, [scopeKey]);
	useEffect(() => {
		const ready = (event) => {
			const d = event.detail;
			if (d?.accountId === media.accountId && d?.spaceId === media.spaceId && d?.noteId === noteId) setImportGeneration((v) => v + 1);
		};
		addEventListener("dowze:paper-import-ready", ready);
		return () => removeEventListener("dowze:paper-import-ready", ready);
	}, [scopeKey]);
	useEffect(() => {
		alive.current = true;
		documentOwner.current = scopeKey;
		generation.current++;
		selfMirrors.current = [];
		generation.current;
		tail.current = Promise.resolve();
		pending.current = 0;
		let stopped = false;
		current.current = null;
		draft.current = null;
		history.current = emptyPaperHistory();
		setDocument(null);
		setBlocked(false);
		setSaved(false);
		setNotice("");
		setResolution(null);
		setResolving(false);
		setLegacyObserved(null);
		setReconciling(false);
		persistenceFailure.current = false;
		const openOnce = async () => {
			let existing = await ensureNotebookIdentity(noteId, owner, () => !stopped);
			if (stopped) return;
			if (!existing) {
				if (media.api && navigator.onLine) try {
					await synchronizeSpace(media.api, media.accountId, media.spaceId, () => !stopped);
					existing = await ensureNotebookIdentity(noteId, owner, () => !stopped);
				} catch (error) {
					if (!(error instanceof TypeError) && !(error instanceof ApiError && error.status >= 500)) throw error;
					if (!stopped) setNotice("Le serveur est temporairement inaccessible. Vous pouvez écrire sur cet appareil ; la synchronisation reprendra ensuite.");
				}
				if (stopped) return;
			}
			if (!existing) {
				const { migrateOwnedPaperNotebook } = await import("./assets/paperLegacyMigration-6XwJL1KK.js");
				const source = sourceMarkdown.current;
				const valid = () => !stopped && renderedScope.current === scopeKey && sourceMarkdown.current === source;
				existing = await migrateOwnedPaperNotebook(noteId, source, owner, valid, { downloadOriginal: downloadOriginal(valid) });
			}
			if (stopped) return;
			if (!existing) throw Error("La note doit être retrouvée avant son ouverture.");
			if (!isPaperDocument(existing.content) || existing.content.noteId !== noteId) throw Error("Format de note non pris en charge. L’original est conservé.");
			if (existing.staged) {
				if (existing.archiveImport) {
					const { activateNotebookArchive } = await import("./assets/importNotebookArchive-Crsd82zP.js");
					await activateNotebookArchive(noteId, media, () => !stopped);
				} else {
					const { activateNotebookDuplicate } = await import("./assets/duplicateNotebook-DK0zV-ya.js");
					await activateNotebookDuplicate(noteId, media);
				}
				if (stopped) return;
				const activated = await getDraft(scope);
				if (activated) existing = activated;
			}
			if (!isPaperDocument(existing.content) || existing.content.noteId !== noteId) throw Error("La version enregistrée est incompatible.");
			if (!hasPaperCollaboration(existing.content) && existing.syncState !== "conflict") {
				const original = existing.content, seed = amendPaperCollaboration(original, {
					...original,
					revision: original.revision + 1,
					updatedAt: (/* @__PURE__ */ new Date()).toISOString()
				});
				try {
					await savePaperDraft({
						...existing,
						content: seed,
						syncState: "local"
					}, original.revision);
				} catch {}
				if (stopped) return;
				const seeded = await getDraft(scope);
				if (!seeded || !isPaperDocument(seeded.content)) throw Error("L’historique collaboratif n’a pas pu être conservé.");
				existing = seeded;
			}
			if (!isPaperDocument(existing.content) || existing.content.noteId !== noteId) throw Error("La version enregistrée de la note est incompatible.");
			if (existing.syncState !== "conflict") {
				const { reconcilePaperLegacy } = await import("./assets/paperLegacyBridge-1XyIvuy7.js");
				const incoming = sourceMarkdown.current;
				const valid = () => !stopped && renderedScope.current === scopeKey && sourceMarkdown.current === incoming;
				const result = await reconcilePaperLegacy({
					noteId,
					scope: owner,
					incomingMarkdown: incoming,
					current: valid,
					downloadOriginal: downloadOriginal(valid)
				});
				if (stopped) return;
				existing = result.draft;
				setLegacyObserved({
					key: scopeKey,
					markdown: incoming
				});
				if (result.notices.length) setNotice(result.notices.join(" "));
			}
			if (!isPaperDocument(existing.content) || existing.content.noteId !== noteId) throw Error("La note conservée est incompatible.");
			draft.current = existing;
			current.current = existing.content;
			setDocument(existing.content);
			setBlocked(existing.syncState === "conflict");
			setSaved(true);
			if (hasPaperCollaboration(existing.content)) try {
				verifyPaperCollaboration(existing.content);
			} catch (error) {
				setBlocked(true);
				setNotice(`${String(error instanceof Error ? error.message : error)} Comparez les versions ou exportez votre note.`);
			}
			if (existing.syncState === "conflict") setNotice("Deux versions de la note nécessitent une résolution dans la synchronisation.");
		};
		const open = async () => {
			for (let attempt = 0; attempt < 3; attempt++) {
				const source = sourceMarkdown.current;
				try {
					await openOnce();
					return;
				} catch (error) {
					if (stopped) return;
					if (sourceMarkdown.current === source || attempt === 2) throw error;
				}
			}
		};
		opening.current = open().catch((error) => {
			if (!stopped) {
				setBlocked(true);
				setNotice(String(error instanceof Error ? error.message : error));
			}
		});
		return () => {
			stopped = true;
			alive.current = false;
			forgetPaperCollaboration(scopeKey);
		};
	}, [
		scopeKey,
		importGeneration,
		media.api
	]);
	useEffect(() => {
		let registered = true;
		const owns = () => registered && renderedScope.current === scopeKey && documentOwner.current === scopeKey;
		const unregister = registerNotebookWriter(media.accountId, {
			flush: () => {
				if (owns()) dispatchEvent(new CustomEvent("dowze:paper-flush", { detail: { prefix: `${noteId}-` } }));
			},
			settled: async () => {
				if (!owns()) return;
				await opening.current;
				if (owns()) await tail.current;
			},
			pending: () => owns() && (pending.current > 0 || persistenceFailure.current),
			suspend: () => {
				if (owns()) writable.current = false;
			},
			resume: () => {
				if (owns()) writable.current = true;
			},
			dispose: () => {
				forgetPaperCollaboration(scopeKey);
				clearPaperSelections(media.accountId);
			}
		});
		return () => {
			registered = false;
			unregister();
		};
	}, [scopeKey]);
	useEffect(() => {
		if (!visible) return;
		let stopped = false;
		const refresh = async () => {
			if (!writable.current) return;
			dispatchEvent(new CustomEvent("dowze:paper-flush", { detail: { prefix: `${noteId}-` } }));
			await tail.current;
			if (stopped) return;
			if (media.api) await synchronizeSpace(media.api, media.accountId, media.spaceId, () => !stopped && writable.current);
			let latest = await ensureNotebookIdentity(noteId, owner, () => !stopped && writable.current);
			if (stopped || pending.current || persistenceFailure.current || !latest) return;
			if (latest.syncState !== "conflict") {
				const { reconcilePaperLegacy } = await import("./assets/paperLegacyBridge-1XyIvuy7.js");
				const incoming = sourceMarkdown.current, baseline = current.current;
				const valid = () => !stopped && writable.current && !pending.current && sourceMarkdown.current === incoming && current.current === baseline;
				let result;
				try {
					result = await reconcilePaperLegacy({
						noteId,
						scope: owner,
						incomingMarkdown: incoming,
						current: valid,
						downloadOriginal: downloadOriginal(valid)
					});
				} catch (error) {
					if (!valid()) return;
					throw error;
				}
				if (stopped || pending.current) return;
				latest = result.draft;
				setLegacyObserved({
					key: scopeKey,
					markdown: incoming
				});
				if (result.notices.length) setNotice(result.notices.join(" "));
			}
			if (!isPaperDocument(latest.content) || latest.content.noteId !== noteId) throw Error("La version reçue est incompatible ; la note locale est conservée.");
			if (hasPaperCollaboration(latest.content)) verifyPaperCollaboration(latest.content);
			draft.current = latest;
			if (latest.syncState === "conflict") {
				setBlocked(true);
				setNotice("Cette note contient un conflit. Vos modifications sont conservées.");
				return;
			}
			setBlocked(false);
			if (current.current && JSON.stringify(current.current) !== JSON.stringify(latest.content)) {
				const changedRevision = current.current.revision !== latest.content.revision;
				current.current = latest.content;
				setDocument(latest.content);
				if (changedRevision) history.current = emptyPaperHistory();
			}
		};
		const sync = continuousSync(refresh, () => {
			if (!stopped) setNotice("Note conservée sur cet appareil. Synchronisation en attente.");
		});
		const online = () => sync.request(true);
		addEventListener("online", online);
		sync.request();
		return () => {
			stopped = true;
			sync.stop();
			removeEventListener("online", online);
		};
	}, [
		scopeKey,
		media.api,
		visible
	]);
	useEffect(() => {
		const ticket = generation.current;
		let stopped = false;
		if (legacyObserved?.key === scopeKey && legacyObserved.markdown === markdown) return;
		const echo = selfMirrors.current.find((proof) => !proof.acknowledged && proof.key === scopeKey && legacyObserved?.key === scopeKey && proof.generation === ticket && proof.accessEpoch === accessEpoch.current.value && proof.expected === legacyObserved.markdown && proof.desired === markdown && proof.lineage === current.current?.collaboration?.lineage && !!proof.receiptId);
		if (echo && accepts() && writable.current && !persistenceFailure.current) {
			echo.acknowledged = true;
			setLegacyObserved({
				key: scopeKey,
				markdown
			});
			return;
		}
		dispatchEvent(new CustomEvent("dowze:paper-flush", { detail: { prefix: `${noteId}-` } }));
		setReconciling(true);
		pending.current++;
		tail.current = tail.current.catch(() => void 0).then(async () => {
			await opening.current;
			if (stopped || ticket !== generation.current || !writable.current || persistenceFailure.current || !current.current) return;
			const { reconcilePaperLegacy } = await import("./assets/paperLegacyBridge-1XyIvuy7.js"), baseline = current.current;
			const valid = () => !stopped && ticket === generation.current && writable.current && sourceMarkdown.current === markdown && current.current === baseline;
			const result = await reconcilePaperLegacy({
				noteId,
				scope: owner,
				incomingMarkdown: markdown,
				current: valid,
				downloadOriginal: downloadOriginal(valid)
			});
			if (!valid()) return;
			const latest = result.draft;
			if (!isPaperDocument(latest.content) || latest.content.noteId !== noteId) throw Error("La reprise de cette note doit être vérifiée.");
			draft.current = latest;
			if (JSON.stringify(current.current) !== JSON.stringify(latest.content)) {
				current.current = latest.content;
				setDocument(latest.content);
				history.current = emptyPaperHistory();
			}
			setLegacyObserved({
				key: scopeKey,
				markdown
			});
			setSaved(true);
			if (result.notices.length) setNotice(result.notices.join(" "));
		}).catch((error) => {
			if (!stopped && ticket === generation.current && sourceMarkdown.current === markdown) setNotice(`${String(error instanceof Error ? error.message : error)} Les deux sources restent conservées.`);
		}).finally(() => {
			if (ticket === generation.current) {
				pending.current--;
				setReconciling(false);
			}
		});
		return () => {
			stopped = true;
		};
	}, [
		scopeKey,
		markdown,
		legacyReconcileEpoch
	]);
	const persist = (next) => {
		const previous = current.current, existing = draft.current;
		if (!accepts() || !previous || !existing || blocked || !writable.current) return false;
		current.current = next;
		setDocument(next);
		setSaved(false);
		pending.current++;
		const ticket = generation.current;
		const nextDraft = {
			...existing,
			content: next,
			updatedAt: Date.now(),
			syncState: "local"
		};
		let finish;
		const acceptedSettled = new Promise((resolve) => {
			finish = resolve;
		});
		const unregister = registerNotebookWriter(scope.accountId, {
			flush: () => {},
			settled: () => acceptedSettled,
			pending: () => true,
			suspend: () => {},
			resume: () => {}
		});
		const active = () => alive.current && ticket === generation.current && renderedScope.current === scopeKey && documentOwner.current === scopeKey;
		tail.current = tail.current.then(async () => {
			let written = nextDraft;
			try {
				await savePaperDraft(nextDraft, previous.revision);
			} catch (error) {
				let recovered = false;
				for (let attempt = 0; attempt < 3; attempt++) {
					const latest = await getDraft(scope), visible = active() ? current.current : next;
					if (!latest || latest.syncState === "conflict" || !visible || !isPaperDocument(latest.content) || !hasPaperCollaboration(visible)) break;
					const merged = mergePaperCollaboration(visible, latest.content);
					if (!merged) break;
					if (merged.collaboration?.state === latest.content.collaboration?.state) {
						written = latest;
						recovered = true;
						break;
					}
					try {
						written = await resolvePaperDraft(latest, visible, null, latest.baseVersion, merged, crypto.randomUUID());
						recovered = true;
						break;
					} catch {}
				}
				if (!recovered) throw error;
			}
			if (active()) {
				draft.current = written;
				if (written !== nextDraft) {
					current.current = written.content;
					setDocument(written.content);
					history.current = emptyPaperHistory();
					setNotice("Modifications des appareils réunies.");
				}
				if (pending.current === 1) setSaved(true);
			}
		}).catch(async (error) => {
			await putSnapshot({
				key: `paper-history|${scope.accountId}|${scope.spaceId}|whiteboard|${scope.documentId}|accepted-${crypto.randomUUID()}`,
				accountId: scope.accountId,
				spaceId: scope.spaceId,
				value: next
			}).catch(() => {});
			if (active()) {
				persistenceFailure.current = true;
				setBlocked(true);
				setNotice(`${String(error instanceof Error ? error.message : error)} Votre version reste visible ; exportez-la pour la conserver.`);
			}
			throw error;
		}).finally(() => {
			if (ticket === generation.current) pending.current--;
			finish();
			unregister();
		});
		tail.current.catch(() => {});
		return true;
	};
	const command = (cmd) => {
		if (!accepts() || !current.current || blocked || !writable.current) return false;
		try {
			const before = current.current, next = amendPaperCollaboration(before, applyPaperCommand(before, cmd), scopeKey);
			if (persist(next)) {
				history.current = recordPaperHistory(history.current, before);
				return true;
			}
			return false;
		} catch (error) {
			setNotice(String(error instanceof Error ? error.message : error));
			return false;
		}
	};
	const layout = (cmd) => {
		if (!accepts() || !current.current || blocked || !writable.current) return false;
		try {
			return persist(amendPaperCollaboration(current.current, applyPaperCommand(current.current, cmd), scopeKey));
		} catch (error) {
			setNotice(String(error instanceof Error ? error.message : error));
			return false;
		}
	};
	const recordingCommand = (cmd) => {
		if (!accepts() || !current.current || blocked || !writable.current) return false;
		try {
			const retained = retainRecordingHistory(history.current, cmd), next = amendPaperCollaboration(current.current, applyPaperCommand(current.current, cmd), scopeKey);
			if (!persist(next)) return false;
			history.current = retained;
			return true;
		} catch (error) {
			setNotice(String(error instanceof Error ? error.message : error));
			return false;
		}
	};
	const textChange = (objectId, markdown, baseline) => {
		if (!accepts() || !current.current || blocked || !writable.current) return null;
		try {
			const before = current.current, result = mergePaperTextChange(before, baseline, objectId, markdown);
			if (!persist(result.document)) return null;
			history.current = recordPaperHistory(history.current, before);
			if (result.recovered) setNotice("Votre texte a été conservé sur une nouvelle page ; la version reçue reste intacte.");
			return result;
		} catch (error) {
			setNotice(String(error instanceof Error ? error.message : error));
			return null;
		}
	};
	const travel = (direction) => {
		if (!accepts() || !current.current || blocked || !writable.current) return;
		const result = travelPaperHistory(history.current, current.current, direction);
		if (result) try {
			const next = amendPaperCollaboration(current.current, result.document, scopeKey);
			if (persist(next)) history.current = result.history;
		} catch (error) {
			setNotice(String(error instanceof Error ? error.message : error));
		}
	};
	const loadResolution = async () => {
		const ticket = generation.current;
		if (!current.current) return;
		setResolving(true);
		try {
			await tail.current.catch(() => void 0);
			const durable = await getDraft(scope);
			if (!durable) throw Error("La copie enregistrée est introuvable. Exportez la version visible.");
			const identityConflict = durable.conflict;
			if (typeof identityConflict?.identityReceipt === "string" && identityConflict.identityReceipt.startsWith(`paper-identity|${media.accountId}|${media.spaceId}|whiteboard|`)) {
				const value = (await getSnapshot(identityConflict.identityReceipt))?.value;
				const source = value?.source?.content;
				if (value?.source?.accountId !== media.accountId || value.source.spaceId !== media.spaceId || value?.canonical?.documentId !== scope.documentId || !isPaperDocument(source) || source.noteId !== noteId) throw Error("Les versions historiques doivent être retrouvées avant de les réunir.");
				const alternatives = (value.incomingConflicts ?? []).map((item) => {
					if (typeof item.mutationId !== "string" || !isPaperDocument(item.content) || item.content.noteId !== noteId) throw Error("Une contribution reçue appartient à une autre note.");
					return {
						id: item.mutationId,
						content: item.content
					};
				});
				const selected = alternatives.find((item) => item.id === value.chosenIncomingConflict?.mutationId) ?? alternatives.at(-1), received = selected?.content ?? source;
				if (ticket === generation.current) setResolution({
					durable,
					remote: received,
					version: durable.baseVersion,
					alternatives,
					selected: selected?.id
				});
				return;
			}
			if (!media.api) {
				if (ticket === generation.current) setResolution({
					durable,
					remote: isPaperDocument(durable.content) ? durable.content : null,
					version: durable.baseVersion
				});
				return;
			}
			let cursor, latest;
			do {
				const page = await media.api.changes(media.spaceId, cursor);
				for (const row of page.items) if (row.document_type === scope.type && row.document_id === scope.documentId) latest = row;
				cursor = page.has_more ? page.next_cursor : void 0;
			} while (cursor && ticket === generation.current);
			if (!latest) throw Error("La version serveur n’est pas encore disponible. Votre note est conservée.");
			const remote = latest.deleted ? null : await decodePaperSync(media.api, media.spaceId, latest.content);
			if (remote !== null && (!isPaperDocument(remote) || remote.noteId !== noteId)) throw Error("La version serveur est incompatible. Exportez votre note avant de continuer.");
			if (ticket === generation.current) setResolution({
				durable,
				remote,
				version: latest.version
			});
		} catch (error) {
			if (ticket === generation.current) setNotice(String(error instanceof Error ? error.message : error));
		} finally {
			if (ticket === generation.current) setResolving(false);
		}
	};
	const selectResolutionVersion = (id) => {
		if (resolving) return;
		setResolution((value) => {
			const selected = value?.alternatives?.find((item) => item.id === id);
			return value && selected ? {
				...value,
				selected: id,
				remote: selected.content
			} : value;
		});
	};
	const resolve = async (choice) => {
		const ticket = generation.current, visible = current.current;
		if (!resolution || !visible || resolving) return;
		setResolving(true);
		try {
			const content = await preparePaperResolution(visible, resolution.remote, choice, media);
			if (ticket !== generation.current) return;
			const server = resolution.remote ? {
				...resolution.durable,
				content: resolution.remote,
				baseVersion: resolution.version,
				syncState: "synced",
				conflict: void 0
			} : null;
			const selected = await resolvePaperDraft(resolution.durable, visible, server, resolution.version, content, crypto.randomUUID());
			if (ticket !== generation.current) return;
			tail.current = Promise.resolve();
			pending.current = 0;
			persistenceFailure.current = false;
			draft.current = selected;
			current.current = content;
			history.current = emptyPaperHistory();
			setDocument(content);
			setResolution(null);
			setBlocked(false);
			setSaved(true);
			setNotice("Versions originales conservées dans la récupération. La note peut être modifiée et synchronisée.");
		} catch (error) {
			if (ticket === generation.current) setNotice(String(error instanceof Error ? error.message : error));
		} finally {
			if (ticket === generation.current) setResolving(false);
		}
	};
	const mirrorMarkdown = (value, writer) => {
		if (!accepts() || blocked || !writable.current || persistenceFailure.current) return Promise.resolve(false);
		const ticket = generation.current, expectedMarkdown = sourceMarkdown.current;
		let published = false, proof;
		pending.current++;
		const operation = tail.current.then(async () => {
			const baseline = current.current;
			const inScope = () => alive.current && ticket === generation.current && renderedScope.current === scopeKey && documentOwner.current === scopeKey && writable.current && !persistenceFailure.current;
			if (!baseline || blocked || !inScope() || sourceMarkdown.current !== expectedMarkdown) return;
			const { stagePaperLegacyMirror, publishPaperLegacyMirror } = await import("./assets/paperLegacyBridge-1XyIvuy7.js");
			const staged = await stagePaperLegacyMirror({
				noteId,
				scope: owner,
				expectedMarkdown,
				desiredMarkdown: value,
				current: () => inScope() && sourceMarkdown.current === expectedMarkdown && current.current === baseline
			});
			if (!inScope() || current.current !== baseline) return;
			proof = {
				key: scopeKey,
				generation: ticket,
				accessEpoch: acceptedEpoch,
				expected: expectedMarkdown,
				desired: value,
				lineage: baseline.collaboration?.lineage,
				receiptId: staged.receipt.mirror.id,
				acknowledged: false,
				published: false
			};
			selfMirrors.current = selfMirrors.current.filter((value) => !value.acknowledged);
			selfMirrors.current.push(proof);
			const validPublication = () => inScope() && (sourceMarkdown.current === expectedMarkdown || sourceMarkdown.current === value);
			let atomic = false;
			if (await writer(value, {
				expectedMarkdown,
				commitMetadata: async (metadata) => {
					const valid = validPublication;
					if (!valid()) throw Error("Le carnet a changé avant la publication de ses métadonnées.");
					await publishPaperLegacyMirror(staged, {
						confirmedMarkdown: value,
						metadataDraft: metadata,
						current: valid
					});
					atomic = true;
					const confirmed = await getDraft({
						...owner,
						type: "notesMarkdown",
						documentId: noteId
					});
					if (!valid() || !confirmed) throw Error("Les métadonnées restent conservées dans leur carnet d’origine.");
					return confirmed;
				}
			}) === false || !validPublication()) return;
			if (!atomic) await publishPaperLegacyMirror(staged, {
				confirmedMarkdown: value,
				current: validPublication
			});
			if (inScope()) {
				published = true;
				proof.published = true;
			}
		}).catch((error) => {
			if (alive.current && ticket === generation.current) setNotice(`${String(error instanceof Error ? error.message : error)} Le carnet et ses sources restent conservés.`);
		}).finally(() => {
			if (proof && !published) {
				selfMirrors.current = selfMirrors.current.filter((value) => value !== proof);
				if (proof.acknowledged && alive.current && ticket === generation.current && sourceMarkdown.current === proof.desired) {
					setLegacyObserved(null);
					setLegacyReconcileEpoch((value) => value + 1);
				}
			}
			if (ticket === generation.current) pending.current--;
		});
		tail.current = operation;
		return operation.then(() => published);
	};
	const attachImage = (blob, name, stillCurrent, object) => {
		const ticket = generation.current;
		if (blocked || !writable.current || renderedScope.current !== scopeKey || documentOwner.current !== scopeKey) return Promise.reject(Error("La note ou le compte a changé. Reprenez l’ajout depuis la note courante."));
		pending.current++;
		setSaved(false);
		const operation = tail.current.then(async () => {
			await opening.current;
			const baseline = current.current;
			const valid = () => alive.current && ticket === generation.current && renderedScope.current === scopeKey && documentOwner.current === scopeKey && writable.current && !persistenceFailure.current && stillCurrent() && current.current === baseline;
			if (!baseline || !valid()) throw Error("La note ou le compte a changé pendant l’ajout de l’image.");
			const { insertPaperImage } = await import("./assets/paperImageInsertion-Dnwhr7xA.js");
			const result = await insertPaperImage({
				document: baseline,
				scope: owner,
				blob,
				name,
				object,
				current: valid
			});
			if (!valid()) throw Error("L’image est conservée dans sa note d’origine. Reprenez depuis la note courante.");
			const next = result.draft.content;
			if (!isPaperDocument(next) || next.noteId !== noteId) throw Error("L’image doit être récupérée dans sa note d’origine.");
			draft.current = result.draft;
			current.current = next;
			history.current = recordPaperHistory(history.current, baseline);
			setDocument(next);
			return result.url;
		}).finally(() => {
			if (ticket === generation.current) {
				pending.current--;
				if (!persistenceFailure.current && pending.current === 0) setSaved(true);
			}
		});
		tail.current = operation.then(() => void 0, (error) => {
			if (alive.current && ticket === generation.current) setNotice(String(error instanceof Error ? error.message : error));
		});
		return operation;
	};
	const applyPrepared = (prepare) => {
		if (!accepts() || blocked || !writable.current) return Promise.reject(Error("La note doit être retrouvée avant cette modification."));
		const ticket = generation.current;
		pending.current++;
		setSaved(false);
		let finish;
		const settled = new Promise((resolve) => {
			finish = resolve;
		});
		const unregister = registerNotebookWriter(scope.accountId, {
			flush: () => {},
			settled: () => settled,
			pending: () => true,
			suspend: () => {},
			resume: () => {}
		});
		const operation = tail.current.then(async () => {
			await opening.current;
			const baseline = current.current;
			const active = () => alive.current && ticket === generation.current && renderedScope.current === scopeKey && documentOwner.current === scopeKey && writable.current && !persistenceFailure.current;
			const valid = () => active() && current.current === baseline;
			if (!baseline || !valid()) throw Error("La note ou le compte a changé avant cette modification.");
			const prepared = await prepare(baseline, valid);
			if (!valid()) throw Error("La note a changé pendant la préparation. Ses modifications sont conservées.");
			const next = prepared.draft.content, rows = prepared.commit.drafts, check = prepared.commit.draftChecks.find((item) => item.identity.accountId === scope.accountId && item.identity.spaceId === scope.spaceId && item.identity.type === scope.type && item.identity.documentId === scope.documentId);
			const inScope = (row) => row.accountId === scope.accountId && row.spaceId === scope.spaceId && (row === prepared.draft || row.type === "notesMarkdown" && row.documentId === noteId);
			if (prepared.draft.accountId !== scope.accountId || prepared.draft.spaceId !== scope.spaceId || prepared.draft.type !== scope.type || prepared.draft.documentId !== scope.documentId || prepared.commit.target.accountId !== scope.accountId || prepared.commit.target.spaceId !== scope.spaceId || !rows.includes(prepared.draft) || !rows.every(inScope) || !prepared.commit.sources.every((source) => source.accountId === scope.accountId && source.spaceId === scope.spaceId) || !prepared.commit.snapshots.every((row) => row.accountId === scope.accountId && row.spaceId === scope.spaceId) || !check?.expected || JSON.stringify(check.expected.content) !== JSON.stringify(baseline) || !isPaperDocument(next) || next.noteId !== noteId || next.revision <= baseline.revision) throw Error("Cette modification préparée appartient à une autre version de la note.");
			if (hasPaperCollaboration(next)) verifyPaperCollaboration(next);
			await commitNotebookTransfer(prepared.commit, valid);
			if (!valid()) throw Error("La modification reste conservée dans sa note d’origine. Reprenez depuis la note courante.");
			draft.current = prepared.draft;
			current.current = next;
			history.current = recordPaperHistory(history.current, baseline);
			setDocument(next);
			return next;
		}).finally(() => {
			if (ticket === generation.current) {
				pending.current--;
				if (!persistenceFailure.current && pending.current === 0) setSaved(true);
			}
			finish();
			unregister();
		});
		tail.current = operation.then(() => void 0, (error) => {
			if (alive.current && ticket === generation.current && renderedScope.current === scopeKey) setNotice(String(error instanceof Error ? error.message : error));
		});
		return operation;
	};
	return {
		retryOpen,
		layout,
		recordingCommand,
		resolution: documentOwner.current === scopeKey ? resolution : null,
		resolving,
		loadResolution,
		selectResolutionVersion,
		resolve,
		document: documentOwner.current === scopeKey ? document : null,
		command,
		textChange,
		travel,
		blocked,
		saved,
		notice,
		setNotice,
		reconciling,
		legacyReady: legacyObserved?.key === scopeKey && legacyObserved.markdown === markdown,
		mirrorMarkdown,
		attachImage,
		applyPrepared,
		getCurrent: () => accepts() ? current.current : null,
		whenSaved: () => tail.current,
		canUndo: !!history.current.past.length,
		canRedo: !!history.current.future.length
	};
}
//#endregion
//#region src/lib/workspaceTabVisibility.tsx
var WorkspaceTabVisibility = createContext(true);
var useWorkspaceTabVisible = () => useContext(WorkspaceTabVisibility);
//#endregion
//#region src/components/PaperNotebook.tsx
var _jsxFileName$4 = "/home/louis/DowzeBuild/20260923/collections-060/src/components/PaperNotebook.tsx";
var PaperPersonalTemplates = lazy(() => import("./assets/PaperPersonalTemplates-C6QjCfEv.js").then((module) => ({ default: module.PaperPersonalTemplates })));
var PaperStudyPanel = lazy(() => import("./assets/PaperStudyPanel-CB4HC4Xg.js").then((module) => ({ default: module.PaperStudyPanel })));
var PaperAudioControls = lazy(() => import("./assets/PaperAudioControls-OYIX6UL_.js").then((module) => ({ default: module.PaperAudioControls })));
var PaperPdfPage$1 = lazy(() => Promise.resolve().then(() => PaperPdfPage_exports).then((module) => ({ default: module.PaperPdfPage })));
var MarkdownNoteEditor = lazy(() => import("./assets/MarkdownNoteEditor-BODls5-d.js"));
var uid = () => crypto.randomUUID();
var colors = [
	"#20343b",
	"#2855ce",
	"#dd4050",
	"#16a08a",
	"#f6c447",
	"#965ac8"
];
function PaperNotebook({ noteId, markdown, onChange, media, metadata, readOnly = false }) {
	const visible = useWorkspaceTabVisible(), paper = usePaperDocument(noteId, markdown, media, visible);
	const markdownRef = useRef(markdown);
	markdownRef.current = markdown;
	const doc = paper.document;
	const mediaApi = useRef(media.api);
	mediaApi.current = media.api;
	const metadataRef = useRef(metadata);
	metadataRef.current = metadata;
	const onChangeRef = useRef(onChange);
	onChangeRef.current = onChange;
	const renderedOwner = JSON.stringify([
		media.accountId,
		media.spaceId,
		noteId
	]);
	const exportScope = useRef("");
	exportScope.current = renderedOwner;
	const mounted = useRef(true);
	useEffect(() => {
		mounted.current = true;
		return () => {
			mounted.current = false;
		};
	}, []);
	const [pageId, setPageId] = useState(""), [tool, setTool] = useState("text"), [color, setColor] = useState(colors[0]), [width, setWidth] = useState(3), [zoom, setZoom] = useState(1), [manager, setManager] = useState(false), [wholeEraser, setWholeEraser] = useState(false), [strokeStyle, setStrokeStyle] = useState("solid"), [selected, setSelected] = useState([]), [textOnly, setTextOnly] = useState(false);
	const toolPreferences = usePaperToolPreferences(media, noteId), activeSlot = activePaperToolSlot(toolPreferences.effective), fingerInk = toolPreferences.effective.fingerInk;
	const [opacity, setOpacity] = useState(1);
	const visibleTools = toolPreferences.effective.toolbar.filter((slot) => slot.visible);
	const toolbarSlots = visibleTools.some((slot) => slot.tool === "text") ? visibleTools : [PAPER_FALLBACK_TEXT_SLOT, ...visibleTools];
	useEffect(() => {
		setLoupeOpen(false);
		setLoupeRegion(null);
		setAidsOpen(false);
	}, [renderedOwner]);
	useEffect(() => {
		setTool(activeSlot.tool);
		setColor(activeSlot.preset.color);
		setWidth(activeSlot.preset.width);
		setOpacity(activeSlot.preset.opacity);
		setWholeEraser(activeSlot.preset.wholeEraser);
		setStrokeStyle(activeSlot.preset.strokeStyle ?? "solid");
	}, [
		activeSlot.id,
		activeSlot.tool,
		JSON.stringify(activeSlot.preset)
	]);
	const selectToolSlot = (slot) => {
		if (!mounted.current || exportScope.current !== renderedOwner) return;
		setSmartHighlight(false);
		setTool(slot.tool);
		setColor(slot.preset.color);
		setWidth(slot.preset.width);
		setOpacity(slot.preset.opacity);
		setWholeEraser(slot.preset.wholeEraser);
		setStrokeStyle(slot.preset.strokeStyle ?? "solid");
		eraserReturn.current.select(slot);
		toolPreferences.change({
			type: "select",
			id: slot.id
		});
	};
	const activateTool = (next) => {
		if (!mounted.current || exportScope.current !== renderedOwner) return;
		const slot = toolbarSlots.find((slot) => slot.tool === next);
		if (slot) selectToolSlot(slot);
		else setTool(next);
	};
	const changeStyle = (patch) => {
		if (!mounted.current || exportScope.current !== renderedOwner) return;
		if (patch.color !== void 0) setColor(patch.color);
		if (patch.width !== void 0) setWidth(patch.width);
		if (patch.opacity !== void 0) setOpacity(patch.opacity);
		if (patch.wholeEraser !== void 0) setWholeEraser(patch.wholeEraser);
		if (patch.strokeStyle !== void 0) setStrokeStyle(patch.strokeStyle);
		if (activeSlot.id !== PAPER_FALLBACK_TEXT_SLOT.id) toolPreferences.change({
			type: "patch-preset",
			id: activeSlot.id,
			patch
		});
	};
	const eraserReturn = useRef(createPaperEraserReturn());
	const aids = usePaperWritingAids(media, noteId, readOnly || paper.blocked || paper.reconciling);
	const [aidsOpen, setAidsOpen] = useState(false), [loupeOpen, setLoupeOpen] = useState(false), [loupeRegion, setLoupeRegion] = useState(null);
	const loupe = useRef(null), correction = useRef(createPaperStrokeCorrection()), correctionFrame = useRef(0), correctionSource = useRef(null);
	const [shapeProposal, setShapeProposal] = useState(null), [originalRestore, setOriginalRestore] = useState(null);
	const shapeProposalRef = useRef(shapeProposal), originalRestoreRef = useRef(originalRestore);
	shapeProposalRef.current = shapeProposal;
	originalRestoreRef.current = originalRestore;
	const scopeEpoch = useRef({
		key: "",
		epoch: 0,
		api: media.api
	});
	const editableView = useRef({
		owner: renderedOwner,
		epoch: 0,
		pageId: "",
		width: 0,
		height: 0,
		rotation: 0,
		disabled: true,
		tool,
		document: paper
	});
	useEffect(() => {
		eraserReturn.current.clear();
	}, [toolPreferences.scopeKey]);
	useEffect(() => {
		eraserReturn.current.seed(toolPreferences.effective.previousInkSlotId ?? null);
		eraserReturn.current.select(activeSlot);
	}, [
		toolPreferences.scopeKey,
		activeSlot.id,
		activeSlot.tool,
		toolPreferences.effective.previousInkSlotId
	]);
	const reportedMarkdown = useRef(void 0);
	const readingOrder = doc ? JSON.stringify([doc.pages.map((page) => page.id), doc.objects.filter((object) => object.kind === "text").map(({ id, pageId, markdown, x, y, z, textFlow }) => ({
		id,
		pageId,
		markdown,
		x,
		y,
		z,
		textFlow
	}))]) : "";
	useEffect(() => {
		reportedMarkdown.current = void 0;
	}, [
		noteId,
		media.accountId,
		media.spaceId
	]);
	useEffect(() => {
		if (!doc || !paper.legacyReady || paper.reconciling || !paper.saved || paper.blocked || readOnly) return;
		let stopped = false;
		const capturedScope = exportScope.current;
		Promise.resolve().then(() => paperArchiveMetadata_exports).then(async ({ paperMarkdown }) => {
			await paper.whenSaved();
			if (stopped || !mounted.current || exportScope.current !== capturedScope) return;
			const latest = paper.getCurrent();
			if (!latest || latest.noteId !== noteId) return;
			try {
				const value = paperMarkdown(latest);
				if (value !== reportedMarkdown.current) {
					if (value === markdown) {
						reportedMarkdown.current = value;
						return;
					}
					if (await paper.mirrorMarkdown(value, (text, expected) => {
						if (stopped || !mounted.current || exportScope.current !== capturedScope) return false;
						return onChangeRef.current(text, expected);
					}) && !stopped && mounted.current && exportScope.current === capturedScope) reportedMarkdown.current = value;
				}
			} catch {}
		}).catch(() => {});
		return () => {
			stopped = true;
		};
	}, [
		readingOrder,
		noteId,
		media.accountId,
		media.spaceId,
		markdown,
		paper.legacyReady,
		paper.reconciling,
		paper.saved,
		paper.blocked,
		readOnly
	]);
	const [pdfOutline, setPdfOutline] = useState(false), [audioSeek, setAudioSeek] = useState(null);
	const seekAudio = (anchor) => setAudioSeek({
		...anchor,
		key: uid()
	});
	const [pageBusy, setPageBusy] = useState(false);
	useEffect(() => setPageBusy(false), [
		noteId,
		media.accountId,
		media.spaceId
	]);
	const [pageFilter, setPageFilter] = useState("all"), [pageNumber, setPageNumber] = useState("1");
	const pageList = useRef(null);
	const contentPages = useMemo(() => new Set(doc?.objects.flatMap((o) => o.kind === "text" || o.kind === "sticky" ? o.markdown?.trim() ? [o.pageId, ...o.textFlow?.pageIds ?? []] : [] : [o.pageId]) ?? []), [doc?.objects]);
	const filteredPages = doc?.pages.filter((p) => pageFilter === "bookmarks" ? p.bookmark : pageFilter === "pdf" ? !!p.pdf : pageFilter === "content" ? contentPages.has(p.id) : true) ?? [];
	const [studyOpen, setStudyOpen] = useState(false), [searchOpen, setSearchOpen] = useState(false);
	const [focusMode, setFocusMode] = useState(false);
	const [exportBusy, setExportBusy] = useState(false), [exportPreviewState, setExportPreview] = useState(null);
	const exportPreview = exportPreviewState?.scope === exportScope.current ? exportPreviewState : null;
	const [historyState, setHistoryState] = useState({
		scope: "",
		versions: [],
		open: false
	});
	const historyRequest = useRef(0), historyOpen = historyState.scope === exportScope.current && historyState.open, versions = historyOpen ? historyState.versions : [];
	const closeHistory = () => {
		historyRequest.current++;
		setHistoryState((old) => ({
			...old,
			open: false
		}));
	};
	const archiveInput = useRef(null);
	const manualZoom = useRef(false);
	const pdfInput = useRef(null);
	const viewport = useRef(null), svg = useRef(null), input = useRef(null), frame = useRef(0), drag = useRef(null), [dragDelta, setDragDelta] = useState({
		x: 0,
		y: 0
	});
	const ink = useRef(createPaperInkInput()), inkPreview = useRef(null), touchGesture = useRef(createPaperViewportGesture());
	const capture = useRef(null), laserTimer = useRef(null);
	const [pinchLayoutVersion, setPinchLayoutVersion] = useState(0);
	const pinch = useRef(null), pendingPinch = useRef(null);
	const [smartHighlight, setSmartHighlight] = useState(false), commandMenu = useRef(null);
	const disabled = readOnly || paper.blocked || paper.reconciling;
	const page = doc?.pages.find((p) => p.id === pageId) ?? doc?.pages[0];
	const objects = useMemo(() => doc && page ? paperObjectsOnPage(doc, page.id) : [], [doc, page?.id]);
	const epochKey = JSON.stringify([
		renderedOwner,
		page?.id,
		page?.width,
		page?.height,
		page?.rotation,
		doc?.collaboration?.lineage,
		visible,
		disabled,
		smartHighlight,
		textOnly
	]);
	if (scopeEpoch.current.key !== epochKey || scopeEpoch.current.api !== media.api) scopeEpoch.current = {
		key: epochKey,
		epoch: scopeEpoch.current.epoch + 1,
		api: media.api
	};
	const inkEpoch = scopeEpoch.current.epoch;
	editableView.current = {
		owner: renderedOwner,
		epoch: inkEpoch,
		pageId: page?.id ?? "",
		width: page?.width ?? 0,
		height: page?.height ?? 0,
		rotation: page?.rotation ?? 0,
		disabled,
		tool,
		document: paper
	};
	const editable = () => {
		const view = editableView.current;
		return mounted.current && view.owner === renderedOwner && view.epoch === inkEpoch && !view.disabled && !!view.document.getCurrent() && view.document.getCurrent()?.noteId === noteId;
	};
	const loupeOwner = () => {
		if (!editable()) return null;
		const view = editableView.current, target = view.document.getCurrent()?.pages.find((p) => p.id === view.pageId);
		if (!target || target.width !== view.width || target.height !== view.height || target.rotation !== view.rotation) return null;
		return {
			ownershipKey: view.owner,
			generation: view.epoch,
			pageId: target.id,
			pageWidth: target.width,
			pageHeight: target.height,
			pageRotation: target.rotation
		};
	};
	const correctionOptions = {
		guide: aids.value.guide,
		hold: aids.value.hold
	}, correctionOptionsRef = useRef(correctionOptions);
	correctionOptionsRef.current = correctionOptions;
	useEffect(() => {
		if (shapeProposal && (shapeProposal.revision !== doc?.revision || !samePaperWritingLoupeOwner(shapeProposal.owner, loupeOwner()))) setShapeProposal(null);
		if (originalRestore && (originalRestore.revision !== doc?.revision || !samePaperWritingLoupeOwner(originalRestore.owner, loupeOwner()))) setOriginalRestore(null);
	}, [
		doc?.revision,
		disabled,
		inkEpoch
	]);
	useEffect(() => {
		if (doc && !doc.pages.some((p) => p.id === pageId)) setPageId(doc.pages[0].id);
	}, [doc?.pages, pageId]);
	useEffect(() => {
		if (!doc || !page) return;
		setPageNumber(String(doc.pages.findIndex((p) => p.id === page.id) + 1));
		if (manager) Array.from(pageList.current?.querySelectorAll("[data-page-entry]") ?? []).find((node) => node.dataset.pageEntry === page.id)?.scrollIntoView({ block: "nearest" });
	}, [
		page?.id,
		manager,
		pageFilter
	]);
	const clearPreview = () => {
		cancelAnimationFrame(frame.current);
		frame.current = 0;
		inkPreview.current?.paint(null, {
			color,
			width,
			opacity
		});
	};
	const cancelStroke = () => {
		ink.current.cancel();
		capture.current = null;
		drag.current = null;
		setDragDelta({
			x: 0,
			y: 0
		});
		clearPreview();
		cancelAnimationFrame(correctionFrame.current);
		correctionFrame.current = 0;
		correction.current.cancel();
		correctionSource.current = null;
	};
	const cancelInputs = () => {
		cancelStroke();
		loupe.current?.cancel();
	};
	useEffect(() => {
		cancelInputs();
		setShapeProposal(null);
		setOriginalRestore(null);
		touchGesture.current.cancel();
		pinch.current = null;
		pendingPinch.current = null;
	}, [
		noteId,
		media.accountId,
		media.spaceId,
		page?.id,
		page?.width,
		page?.height,
		page?.rotation,
		disabled,
		textOnly,
		tool
	]);
	useEffect(() => () => {
		ink.current.cancel();
		correction.current.cancel();
		cancelAnimationFrame(correctionFrame.current);
		touchGesture.current.cancel();
		cancelAnimationFrame(frame.current);
		if (laserTimer.current) clearTimeout(laserTimer.current);
	}, []);
	useLayoutEffect(() => {
		const anchor = pendingPinch.current;
		pendingPinch.current = null;
		if (!anchor || !viewport.current || !svg.current || anchor.owner !== exportScope.current || anchor.pageId !== page?.id) return;
		const rect = svg.current.getBoundingClientRect();
		viewport.current.scrollLeft += rect.left + anchor.x * zoom - anchor.clientX;
		viewport.current.scrollTop += rect.top + anchor.y * zoom - anchor.clientY;
	}, [zoom, pinchLayoutVersion]);
	useEffect(() => {
		const target = viewport.current;
		if (!target || !page) return;
		const fit = () => {
			if (!manualZoom.current) setZoom(Math.max(.3, Math.min(1.5, (target.clientWidth - (parseFloat(getComputedStyle(target).paddingLeft) || 0) - (parseFloat(getComputedStyle(target).paddingRight) || 0) - 1) / page.width)));
		};
		const observer = new ResizeObserver(fit);
		observer.observe(target);
		fit();
		return () => observer.disconnect();
	}, [
		page?.id,
		page?.width,
		manager,
		textOnly
	]);
	useEffect(() => {
		if (!searchOpen || !doc || disabled) return;
		let stopped = false;
		(async () => {
			const { extractPaperPdfPageText } = await import("./assets/paperPdf-Cx2IiY56.js").then((n) => n.n);
			const { readPaperAsset } = await import("./assets/paperAssets-CggUOk-G.js").then((n) => n.t);
			let total = doc.pages.reduce((sum, p) => sum + (p.pdf?.text?.length ?? 0), 0);
			for (const source of doc.pages.filter((p) => p.pdf && p.pdf.text === void 0)) {
				if (stopped || total >= 2e6) return;
				const asset = doc.assets.find((a) => a.id === source.pdf.assetId);
				if (!asset) continue;
				const text = (await extractPaperPdfPageText(await readPaperAsset(asset, media), source.pdf.pageNumber)).slice(0, 2e6 - total);
				total += text.length;
				if (stopped) return;
				const latest = paper.getCurrent()?.pages.find((p) => p.id === source.id);
				if (latest?.pdf?.assetId === source.pdf.assetId && latest.pdf.pageNumber === source.pdf.pageNumber) paper.command({
					type: "update-page",
					page: {
						...latest,
						pdf: {
							...latest.pdf,
							text
						}
					}
				});
			}
		})().catch((error) => {
			if (!stopped) paper.setNotice(`Recherche PDF : ${String(error instanceof Error ? error.message : error)}`);
		});
		return () => {
			stopped = true;
		};
	}, [
		searchOpen,
		doc?.noteId,
		media.accountId,
		media.spaceId,
		disabled
	]);
	const flushText = () => dispatchEvent(new CustomEvent("dowze:paper-flush", { detail: { prefix: `${noteId}-` } }));
	const authored = (ids) => {
		if (ids.length) dispatchEvent(new CustomEvent("dowze:paper-authored", { detail: {
			accountId: media.accountId,
			spaceId: media.spaceId,
			noteId,
			ids,
			at: Date.now()
		} }));
	};
	const commit = (command) => {
		if (!editable()) return false;
		setShapeProposal(null);
		setOriginalRestore(null);
		flushText();
		const result = paper.command(command);
		if (result) {
			const ids = (c) => c.type === "upsert-object" ? [c.object.id] : c.type === "patch-object" && c.patch.audioAnchor === void 0 ? [c.id] : c.type === "batch" ? c.commands.flatMap(ids) : [];
			authored(ids(command));
		}
		return result;
	};
	const commandContext = doc && page ? {
		ownerKey: renderedOwner,
		generation: inkEpoch,
		document: doc,
		pageId: page.id,
		objects,
		selected,
		readOnly,
		blocked: paper.blocked || paper.reconciling || !visible,
		mode: tool
	} : null;
	const currentCommandContext = () => {
		const view = editableView.current, current = view.document.getCurrent(), target = current?.pages.find((p) => p.id === view.pageId);
		return mounted.current && view.owner === renderedOwner && view.epoch === inkEpoch && mediaApi.current === media.api && current && target ? {
			ownerKey: view.owner,
			generation: view.epoch,
			document: current,
			pageId: target.id,
			objects: paperObjectsOnPage(current, target.id),
			selected,
			readOnly,
			blocked: view.disabled || !visible,
			mode: view.tool
		} : null;
	};
	const commandCommit = (value, target) => paperNotebookCommandTargetCurrent(target, currentCommandContext()) && commit(value);
	const commandSelect = (ids, target) => {
		if (!paperNotebookCommandTargetCurrent(target, currentCommandContext())) return;
		setSelected(ids);
	};
	const commandPaste = async (target) => {
		if (!paperNotebookCommandTargetCurrent(target, currentCommandContext())) return false;
		let ids = [];
		try {
			flushText();
			await paper.whenSaved();
			if (!paperNotebookCommandTargetCurrent(target, currentCommandContext())) return false;
			await paper.applyPrepared(async (baseline, valid) => {
				const current = () => valid() && paperNotebookCommandTargetCurrent(target, currentCommandContext());
				const prepared = await preparePastePaperSelection(baseline, target.pageId, media, current);
				ids = prepared.ids;
				return prepared;
			});
			if (!mounted.current || exportScope.current !== renderedOwner || editableView.current.epoch !== inkEpoch) return false;
			setSelected(ids);
			setTool("select");
			setSmartHighlight(false);
			return true;
		} catch (error) {
			if (mounted.current && exportScope.current === renderedOwner) paper.setNotice(String(error instanceof Error ? error.message : error));
			return false;
		}
	};
	const selectionCommand = (id) => {
		const context = commandContext;
		return context ? executePaperNotebookCommand({
			getCurrent: currentCommandContext,
			media,
			onCommit: commandCommit,
			onSelect: commandSelect,
			onPaste: commandPaste,
			onAudio: (anchor, target) => {
				if (paperNotebookCommandTargetCurrent(target, currentCommandContext())) seekAudio(anchor);
			},
			onNotice: paper.setNotice
		}, id, capturePaperNotebookCommandTarget(context)) : false;
	};
	const smart = usePaperSmartHighlight({
		enabled: smartHighlight,
		disabled,
		visible,
		textOnly,
		owner: renderedOwner,
		generation: inkEpoch,
		document: doc,
		page,
		media,
		viewport,
		getCurrent: paper.getCurrent,
		current: editable,
		commit,
		onNotice: paper.setNotice
	});
	const pdfViewCurrent = () => mounted.current && exportScope.current === renderedOwner && editableView.current.epoch === inkEpoch && mediaApi.current === media.api && visible;
	const object = (kind, at = {
		x: 72,
		y: 72
	}) => ({
		id: uid(),
		pageId: page.id,
		kind,
		x: at.x,
		y: at.y,
		width: kind === "text" ? 450 : 240,
		height: kind === "text" ? 260 : 160,
		rotation: 0,
		z: Math.max(0, ...objects.map((o) => o.z)) + 1,
		locked: false,
		createdAt: Date.now(),
		...kind === "text" || kind === "sticky" ? { markdown: "" } : {}
	});
	const addObject = (kind, at, shape = "rectangle") => {
		if (!page || !editable()) return;
		const item = {
			...object(kind, at),
			...kind === "sticky" ? { color: "#fff3b0" } : kind === "shape" ? {
				shape,
				color,
				strokeWidth: width,
				strokeStyle
			} : {}
		};
		commit({
			type: "upsert-object",
			object: item
		});
		setSelected([item.id]);
		activateTool(kind === "shape" ? "select" : "text");
	};
	const point = (event) => {
		const rect = svg.current.getBoundingClientRect();
		let inverse;
		try {
			inverse = svg.current.getScreenCTM()?.inverse();
		} catch {}
		return {
			x: inverse ? inverse.a * event.clientX + inverse.c * event.clientY + inverse.e : (event.clientX - rect.left) / rect.width * page.width,
			y: inverse ? inverse.b * event.clientX + inverse.d * event.clientY + inverse.f : (event.clientY - rect.top) / rect.height * page.height,
			time: event.timeStamp,
			...event.pointerType === "pen" ? {
				pressure: event.pressure,
				tiltX: event.tiltX,
				tiltY: event.tiltY,
				twist: event.twist
			} : {}
		};
	};
	const inkContext = () => {
		if (!page || !svg.current || tool === "text" || !editable() || editableView.current.tool !== tool) return null;
		const rect = svg.current.getBoundingClientRect();
		let matrix;
		try {
			const inverse = svg.current.getScreenCTM()?.inverse();
			if (inverse) matrix = {
				a: inverse.a,
				b: inverse.b,
				c: inverse.c,
				d: inverse.d,
				e: inverse.e,
				f: inverse.f
			};
		} catch {}
		return {
			ownershipKey: renderedOwner,
			generation: inkEpoch,
			pageId: page.id,
			pageWidth: page.width,
			pageHeight: page.height,
			pageRotation: page.rotation,
			clientRect: {
				left: rect.left,
				top: rect.top,
				width: rect.width,
				height: rect.height
			},
			clientToPage: matrix,
			intent: tool
		};
	};
	const paintCorrected = (stroke, output) => ({
		...stroke,
		points: output.points
	});
	const holdTick = () => {
		correctionFrame.current = 0;
		const held = capture.current, stroke = ink.current.snapshot(), context = inkContext();
		if (!held || !stroke || !context || correctionSource.current !== "page") return;
		const result = correction.current.tick(performance.now(), context, correctionOptionsRef.current);
		if (result.cancelled) {
			cancelStroke();
			return;
		}
		inkPreview.current?.paint(paintCorrected(stroke, result), held.style);
		correctionFrame.current = requestAnimationFrame(holdTick);
	};
	const repaint = () => {
		if (!frame.current) frame.current = requestAnimationFrame(() => {
			frame.current = 0;
			const held = capture.current, stroke = ink.current.snapshot(), context = inkContext();
			if (held && stroke && context) {
				const result = correction.current.update(stroke, performance.now(), context, correctionOptionsRef.current);
				if (result.cancelled) {
					cancelStroke();
					return;
				}
				inkPreview.current?.paint(paintCorrected(stroke, result), held.style);
			}
		});
	};
	const previewLoupe = (phase, stroke) => {
		if (!samePaperWritingLoupeOwner(stroke.context, loupeOwner())) return stroke;
		if (phase === "begin") {
			cancelStroke();
			correctionSource.current = "loupe";
			return paintCorrected(stroke, correction.current.begin(stroke, correctionOptionsRef.current, performance.now()));
		}
		if (correctionSource.current !== "loupe") return stroke;
		const output = phase === "tick" ? correction.current.tick(performance.now(), stroke.context, correctionOptionsRef.current) : correction.current.update(stroke, performance.now(), stroke.context, correctionOptionsRef.current);
		return paintCorrected(stroke, output);
	};
	const commitStroke = (stroke, held, corrected) => {
		if (!samePaperWritingLoupeOwner(stroke.context, loupeOwner()) || !editable() || stroke.context.intent !== editableView.current.tool) return false;
		const pts = stroke.points;
		if (stroke.intent === "laser") {
			inkPreview.current?.paint(stroke, held.style);
			laserTimer.current = setTimeout(() => {
				inkPreview.current?.paint(null, held.style);
				laserTimer.current = null;
			}, 600);
			return true;
		}
		if (stroke.intent === "lasso") {
			setSelected(expandPaperGroups(objects, objects.filter((o) => lassoContains(o, pts)).map((o) => o.id)));
			activateTool("select");
			return true;
		}
		if (stroke.intent === "eraser") {
			const commands = [];
			for (const original of objects.filter((o) => o.kind === "ink" && !o.locked)) {
				let parts = [original];
				for (let i = 0; i < pts.length; i++) parts = parts.flatMap((o) => eraseInk(o, pts[Math.max(0, i - 1)], pts[i], held.style.width * 3, held.wholeEraser));
				if (parts.length !== 1 || parts[0] !== original) commands.push({
					type: "remove-objects",
					ids: [original.id]
				}, ...parts.map((o) => ({
					type: "upsert-object",
					object: o
				})));
			}
			if (commands.length) commit({
				type: "batch",
				commands
			});
			const previous = eraserReturn.current.afterStroke({
				intent: stroke.intent,
				cancelled: false,
				enabled: toolPreferences.effective.returnToPen === true,
				activeSlot,
				toolbar: toolbarSlots
			});
			const previousSlot = toolbarSlots.find((slot) => slot.id === previous);
			if (previousSlot) selectToolSlot(previousSlot);
			return true;
		}
		const original = {
			...object("ink", {
				x: 0,
				y: 0
			}),
			pageId: stroke.context.pageId,
			width: stroke.context.pageWidth,
			height: stroke.context.pageHeight,
			points: pts.map((p) => ({ ...p })),
			color: held.style.color,
			strokeWidth: held.style.width,
			opacity: held.style.opacity,
			strokeStyle: held.style.strokeStyle,
			pen: stroke.intent === "pencil" || stroke.intent === "calligraphy" || stroke.intent === "highlighter" ? stroke.intent : "pen"
		};
		if (!commit({
			type: "upsert-object",
			object: compactInk(original)
		})) return false;
		if (corrected && !corrected.cancelled && corrected.correction !== "none" && JSON.stringify(corrected.points) !== JSON.stringify(pts)) {
			const replacement = compactInk({
				...original,
				points: corrected.points
			});
			if (commit({
				type: "upsert-object",
				object: replacement
			})) {
				const current = paper.getCurrent(), owner = loupeOwner();
				if (current && owner) setOriginalRestore({
					original,
					expected: replacement,
					revision: current.revision,
					owner
				});
			}
		}
		if (corrected?.candidate && corrected.candidate.kind !== "line") {
			const current = paper.getCurrent(), owner = loupeOwner(), expected = current?.objects.find((o) => o.id === original.id);
			if (current && owner && expected) setShapeProposal({
				candidate: corrected.candidate,
				original,
				expected,
				revision: current.revision,
				owner
			});
		}
		return true;
	};
	const finishLoupe = (stroke, style) => {
		if (!samePaperWritingLoupeOwner(stroke.context, loupeOwner()) || !editable()) return false;
		const result = correctionSource.current === "loupe" ? correction.current.finish(stroke, performance.now(), stroke.context, correctionOptionsRef.current) : void 0;
		correctionSource.current = null;
		return commitStroke(stroke, {
			style,
			wholeEraser
		}, result);
	};
	const down = (event) => {
		if (!page || !editable() || textOnly) return;
		if (loupeOpen) {
			const p = point(event);
			loupe.current?.reposition(p.x, p.y);
			return;
		}
		if (laserTimer.current) {
			clearTimeout(laserTimer.current);
			laserTimer.current = null;
		}
		if (event.pointerType === "pen") touchGesture.current.observePen(event.timeStamp);
		if (tool === "text") {
			if (event.pointerType !== "touch") addObject("text", point(event));
			return;
		}
		const context = inkContext();
		if (!context) return;
		const result = ink.current.begin(event.nativeEvent, context, {
			enabled: !disabled,
			fingerInk
		});
		if (!result.accepted || !result.stroke) {
			if (result.status === "cancelled") cancelStroke();
			return;
		}
		capture.current = {
			stroke: result.stroke,
			style: {
				color,
				width,
				opacity,
				strokeStyle
			},
			wholeEraser,
			objects: [...objects]
		};
		try {
			event.currentTarget.setPointerCapture(event.pointerId);
		} catch {
			cancelStroke();
			return;
		}
		event.preventDefault();
		if (result.intent === "select") {
			const p = result.stroke.points[0], target = event.target.closest("[data-object]")?.getAttribute("data-object");
			if (!target) {
				setSelected([]);
				cancelStroke();
				return;
			}
			const group = expandPaperGroups(objects, [target]);
			const ids = event.shiftKey ? selected.includes(target) ? selected.filter((id) => !group.includes(id)) : [.../* @__PURE__ */ new Set([...selected, ...group])] : selected.includes(target) ? selected : group;
			setSelected(ids);
			drag.current = {
				point: p,
				objects: objects.filter((o) => ids.includes(o.id) && !o.locked)
			};
			return;
		}
		correctionSource.current = "page";
		const output = correction.current.begin(result.stroke, correctionOptionsRef.current, performance.now());
		inkPreview.current?.paint(paintCorrected(result.stroke, output), capture.current.style);
		if (aids.value.hold.enabled) correctionFrame.current = requestAnimationFrame(holdTick);
	};
	const move = (event) => {
		const context = inkContext();
		if (!context || !capture.current) return;
		let batch = [];
		try {
			batch = event.nativeEvent.getCoalescedEvents?.() ?? [];
		} catch {}
		const result = ink.current.append(event.nativeEvent, context, batch);
		if (result.status === "cancelled") {
			cancelStroke();
			return;
		}
		if (!result.accepted) return;
		event.preventDefault();
		if (drag.current) {
			const p = point(event);
			setDragDelta({
				x: p.x - drag.current.point.x,
				y: p.y - drag.current.point.y
			});
			return;
		}
		const raw = ink.current.snapshot();
		if (raw) correction.current.update(raw, performance.now(), context, correctionOptionsRef.current);
		repaint();
	};
	const finish = (event, cancel = false) => {
		const context = inkContext(), held = capture.current;
		if (!context || !held) return;
		const result = ink.current.finish(event.nativeEvent, context, cancel);
		if (result.status === "ignored") return;
		if (!result.accepted) correction.current.cancel();
		const corrected = result.accepted && result.stroke ? correction.current.finish(result.stroke, performance.now(), context, correctionOptionsRef.current) : void 0, oldDrag = drag.current;
		capture.current = null;
		drag.current = null;
		setDragDelta({
			x: 0,
			y: 0
		});
		clearPreview();
		cancelAnimationFrame(correctionFrame.current);
		correctionFrame.current = 0;
		correctionSource.current = null;
		try {
			if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
		} catch {}
		if (!result.accepted || !result.stroke || !editable() || corrected?.cancelled) return;
		const stroke = result.stroke, pts = stroke.points;
		if (oldDrag) {
			const p = pts.at(-1);
			const dx = p.x - oldDrag.point.x, dy = p.y - oldDrag.point.y;
			if (Math.hypot(dx, dy) > .1) {
				const latest = paper.getCurrent();
				const commands = oldDrag.objects.flatMap((o) => {
					const current = latest?.objects.find((item) => item.id === o.id);
					return current && !current.locked ? [{
						type: "patch-object",
						id: current.id,
						patch: {
							x: current.x + dx,
							y: current.y + dy
						}
					}] : [];
				});
				if (commands.length) commit({
					type: "batch",
					commands
				});
			}
			return;
		}
		commitStroke(stroke, held, corrected);
	};
	const bypassCorrection = () => {
		const output = correction.current.disable(), raw = ink.current.snapshot(), held = capture.current;
		if (raw && held && correctionSource.current === "page") inkPreview.current?.paint(paintCorrected(raw, output), held.style);
	};
	const updateGuide = (guide) => {
		if (!editable()) return;
		if ([
			"x",
			"y",
			"angle",
			"space",
			"unit",
			"pageUnitsPerMm",
			"snapDistancePx"
		].some((key) => guide[key] !== aids.value.guide[key])) cancelInputs();
		else bypassCorrection();
		setShapeProposal(null);
		setOriginalRestore(null);
		aids.change({ guide });
	};
	const updateHold = (hold) => {
		if (!editable()) return;
		bypassCorrection();
		setShapeProposal(null);
		setOriginalRestore(null);
		aids.change({ hold });
	};
	const applyProposal = () => {
		const proposal = shapeProposal, current = paper.getCurrent();
		if (!proposal || shapeProposalRef.current !== proposal || !current || !editable() || !samePaperWritingLoupeOwner(proposal.owner, loupeOwner()) || proposal.revision !== current.revision || JSON.stringify(current.objects.find((o) => o.id === proposal.expected.id)) !== JSON.stringify(proposal.expected)) return;
		const replacement = compactInk({
			...proposal.original,
			points: proposal.candidate.points
		});
		if (commit({
			type: "upsert-object",
			object: replacement
		})) {
			const latest = paper.getCurrent();
			if (latest) setOriginalRestore({
				original: proposal.original,
				expected: replacement,
				revision: latest.revision,
				owner: proposal.owner
			});
		}
	};
	const restoreOriginal = () => {
		const previous = originalRestore, current = paper.getCurrent();
		if (!previous || originalRestoreRef.current !== previous || !current || !editable() || !samePaperWritingLoupeOwner(previous.owner, loupeOwner()) || previous.revision !== current.revision || JSON.stringify(current.objects.find((o) => o.id === previous.expected.id)) !== JSON.stringify(previous.expected)) return;
		commit({
			type: "upsert-object",
			object: compactInk(previous.original)
		});
	};
	const viewContext = () => ({
		owner: exportScope.current,
		pageId: page?.id ?? "",
		zoom,
		scrollLeft: viewport.current?.scrollLeft ?? 0,
		scrollTop: viewport.current?.scrollTop ?? 0,
		fingerInk
	});
	const applyNavigation = (action) => {
		const target = viewport.current;
		if (!target) return;
		if (action.mode === "pan") {
			cancelInputs();
			target.scrollLeft = action.scrollLeft ?? target.scrollLeft;
			target.scrollTop = action.scrollTop ?? target.scrollTop;
		}
		if (action.mode === "pinch" && action.center && svg.current && page) {
			cancelInputs();
			if (action.start) {
				const rect = svg.current.getBoundingClientRect();
				pinch.current = {
					x: (action.center.x - rect.left) / zoom,
					y: (action.center.y - rect.top) / zoom,
					pageId: page.id,
					owner: exportScope.current
				};
			}
			const anchor = pinch.current;
			if (!anchor) return;
			pendingPinch.current = {
				...anchor,
				clientX: action.center.x,
				clientY: action.center.y
			};
			manualZoom.current = true;
			setZoom(action.zoom);
			setPinchLayoutVersion((version) => version + 1);
		}
		if (action.mode === "ended" || action.mode === "cancelled") pinch.current = null;
		if (action.mode === "cancelled") pendingPinch.current = null;
	};
	const touchDown = (event) => {
		if (event.pointerType === "pen") {
			touchGesture.current.observePen(event.timeStamp);
			return;
		}
		if (event.pointerType !== "touch" || textOnly || tool === "text" || disabled || event.target.closest("button,input,select,textarea,[contenteditable=\"true\"]")) return;
		const action = touchGesture.current.begin(event.nativeEvent, viewContext(), capture.current?.stroke.pointerType === "pen");
		if (action.reason === "palm") {
			event.preventDefault();
			event.stopPropagation();
			return;
		}
		if (action.handled) {
			event.preventDefault();
			event.stopPropagation();
			cancelInputs();
			try {
				event.currentTarget.setPointerCapture(event.pointerId);
			} catch {}
			applyNavigation(action);
		}
	};
	const touchMove = (event) => {
		const action = touchGesture.current.move(event.nativeEvent, viewContext());
		if (action.handled) {
			event.preventDefault();
			event.stopPropagation();
			applyNavigation(action);
		}
	};
	const touchEnd = (event, cancel = false) => {
		const action = touchGesture.current.end(event.nativeEvent, viewContext(), cancel);
		if (action.handled) {
			event.preventDefault();
			event.stopPropagation();
			applyNavigation(action);
			try {
				if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
			} catch {}
		}
	};
	const uploadImage = async (file) => {
		if (disabled || !doc || !page) return;
		const scope = renderedOwner, current = () => mounted.current && exportScope.current === scope, image = {
			...object("image"),
			width: 320,
			height: 240
		};
		try {
			await runNotebookOperation(media.accountId, async () => {
				flushText();
				await paper.whenSaved();
				if (!current()) return;
				await paper.attachImage(file, file.name, current, image);
				if (current()) authored([image.id]);
			});
		} catch (error) {
			if (current()) paper.setNotice(String(error instanceof Error ? error.message : error));
		}
	};
	const uploadInlineImage = async (file) => {
		if (disabled) throw Error("La note attend sa récupération avant d’ajouter une image.");
		const scope = renderedOwner, current = () => mounted.current && exportScope.current === scope;
		return runNotebookOperation(media.accountId, async () => {
			flushText();
			await paper.whenSaved();
			if (!current()) throw Error("La note courante a changé.");
			return paper.attachImage(file, file.name, current);
		});
	};
	const importPdf = async (file) => {
		if (disabled || !doc || !page) return;
		const captured = renderedOwner, current = () => mounted.current && exportScope.current === captured;
		try {
			if (file.size > 16777216) throw Error("Le PDF doit peser moins de 16 Mo.");
			const { importPaperPdf } = await import("./assets/paperPdf-Cx2IiY56.js").then((n) => n.n);
			const id = uid(), pages = await importPaperPdf(file, id);
			if (!current()) return;
			await putLocalBlob({
				id,
				accountId: media.accountId,
				spaceId: media.spaceId,
				blob: file,
				name: file.name,
				createdAt: Date.now(),
				status: "pending"
			});
			if (!current()) return;
			if (commit({
				type: "batch",
				commands: [{
					type: "add-asset",
					asset: {
						id,
						name: file.name,
						mediaType: "application/pdf",
						size: file.size
					}
				}, ...pages.map((p) => ({
					type: "insert-page",
					page: p
				}))]
			})) {
				setPageId(pages[0].id);
				setSelected([]);
				setManager(true);
				paper.setNotice(`${pages.length} pages PDF ajoutées. Vous pouvez écrire et dessiner dessus.`);
			}
		} catch (e) {
			if (current()) paper.setNotice(String(e instanceof Error ? e.message : e));
		}
	};
	const previewExport = async (blob, format, scope) => {
		if (!mounted.current || scope !== exportScope.current) return;
		setExportPreview({
			scope,
			url: URL.createObjectURL(blob),
			format,
			blob
		});
	};
	useEffect(() => () => {
		if (exportPreviewState) URL.revokeObjectURL(exportPreviewState.url);
	}, [exportPreviewState]);
	useEffect(() => {
		setExportBusy(false);
		setExportPreview(null);
		historyRequest.current++;
		setHistoryState({
			scope: exportScope.current,
			versions: [],
			open: false
		});
	}, [
		noteId,
		media.accountId,
		media.spaceId
	]);
	const exportName = (format) => `${(metadataRef.current?.title?.trim() || "note").replace(/[\/\\:*?"<>|\x00-\x1f]/g, "-").slice(0, 80)}.${format === "jpeg" ? "jpg" : format === "archive" ? "dowze" : format}`;
	const savePreview = () => {
		const preview = exportPreview;
		if (!preview || preview.scope !== exportScope.current) return;
		const captured = preview.scope, current = () => mounted.current && exportScope.current === captured;
		savePaperExport(preview.blob, exportName(preview.format), preview.format).then((saved) => {
			if (current()) paper.setNotice(saved ? "Export enregistré ou téléchargement demandé." : "Export annulé.");
		}).catch((error) => {
			if (current()) paper.setNotice(String(error));
		});
	};
	const exportBundle = async () => {
		if (exportBusy || !doc) return;
		setExportBusy(true);
		const captured = renderedOwner, current = () => mounted.current && captured === exportScope.current;
		try {
			await runNotebookOperation(media.accountId, async () => {
				flushText();
				await paper.whenSaved();
				const snapshot = paper.getCurrent();
				if (!snapshot || !current()) return;
				const { buildPaperArchive } = await import("./assets/paperArchiveExport-C6R8y7JR.js");
				const blob = await buildPaperArchive(snapshot, media, metadataRef.current, current, (done, total) => {
					if (current()) paper.setNotice(`Préparation de l’archive… ${Math.round(done / total * 100)} %`);
				});
				if (!current()) return;
				await previewExport(blob, "archive", captured);
				paper.setNotice("Archive prête : titre, matières, tags, classement, pages et médias conservés.");
			});
		} catch (e) {
			if (current()) paper.setNotice(String(e instanceof Error ? e.message : e));
		} finally {
			if (current()) setExportBusy(false);
		}
	};
	const importArchive = async (file) => {
		if (disabled) return;
		const captured = renderedOwner, current = () => mounted.current && captured === exportScope.current;
		try {
			await runNotebookOperation(media.accountId, async () => {
				const { verifyPaperArchiveBlob, appendPaperArchive, MAX_PAPER_ARCHIVE_BYTES } = await Promise.resolve().then(() => paperArchive_exports);
				if (file.size > MAX_PAPER_ARCHIVE_BYTES) throw Error("L’archive dépasse la taille prise en charge. Son original est conservé.");
				const archive = await verifyPaperArchiveBlob(file, current), mapped = appendPaperArchive(archive.document, noteId);
				if (!current()) throw Error("Le carnet a changé pendant l’importation.");
				const identity = {
					accountId: media.accountId,
					spaceId: media.spaceId,
					type: "whiteboard",
					documentId: notebookDocumentId(noteId)
				};
				await putSnapshot({
					key: `paper-import-append|${media.accountId}|${media.spaceId}|${noteId}|${uid()}`,
					accountId: media.accountId,
					spaceId: media.spaceId,
					value: {
						schema: 1,
						sourceName: file.name,
						sourceDocument: archive.document,
						sourceMetadata: archive.metadata,
						assets: Object.fromEntries(mapped.assets),
						commands: mapped.commands
					}
				});
				for (const asset of archive.document.assets) {
					if (!current()) throw Error("L’importation reste conservée dans son carnet d’origine.");
					const bytes = archive.files[`assets/${asset.id}`];
					await putLocalBlob({
						id: mapped.assets.get(asset.id),
						accountId: media.accountId,
						spaceId: media.spaceId,
						documentId: identity.documentId,
						blob: bytes.slice(0, void 0, asset.mediaType),
						name: asset.name,
						createdAt: Date.now(),
						status: "pending",
						removedFromNote: true
					});
				}
				if (!current() || !commit({
					type: "batch",
					commands: mapped.commands
				})) throw Error("La note ne peut pas encore recevoir ces pages. L’archive et ses fichiers restent conservés.");
				await paper.whenSaved();
				await activateNotebookAppendFiles(identity, [...mapped.assets.values()], current);
				if (!current()) return;
				setPageId(mapped.firstPageId);
				setManager(true);
				setSelected([]);
				paper.setNotice("Pages ajoutées. Le titre et le classement de votre note sont conservés.");
			});
		} catch (e) {
			if (current()) paper.setNotice(String(e instanceof Error ? e.message : e));
		}
	};
	const openHistory = async () => {
		const captured = renderedOwner, request = ++historyRequest.current, current = () => mounted.current && exportScope.current === captured && historyRequest.current === request;
		try {
			const prefix = `paper-history|${media.accountId}|${media.spaceId}|whiteboard|${notebookDocumentId(noteId)}|`;
			const recovered = (await listSnapshots(media.accountId, media.spaceId)).flatMap((s) => {
				if (s.key.startsWith(prefix)) return [s.value];
				if (s.key.startsWith(`paper-resolution|${media.accountId}|${media.spaceId}|whiteboard|${notebookDocumentId(noteId)}|`)) {
					const value = s.value;
					return [
						value.durable?.content,
						value.visibleContent,
						value.server?.content
					];
				}
				return [];
			}).filter((v) => isPaperDocument(v) && v.noteId === noteId);
			if (current()) setHistoryState({
				scope: captured,
				versions: [...new Map(recovered.map((v) => [JSON.stringify(v), v])).values()].sort((a, b) => b.revision - a.revision),
				open: true
			});
		} catch (e) {
			if (current()) paper.setNotice(String(e));
		}
	};
	const renderExport = async (format) => {
		if (exportBusy || !page) return;
		const captured = renderedOwner, current = () => mounted.current && exportScope.current === captured;
		setExportBusy(true);
		try {
			flushText();
			await paper.whenSaved().catch(() => void 0);
			const snapshot = paper.getCurrent();
			if (!snapshot || !current()) return;
			const { renderPaperPdf, renderPaperImage } = await import("./assets/paperRenderedExport-D7oqtVwM.js");
			const blob = format === "pdf" ? await renderPaperPdf(snapshot, media, (done, total) => {
				if (current()) paper.setNotice(`Préparation du PDF : ${done} / ${total} pages`);
			}) : await renderPaperImage(snapshot, page.id, media, format);
			if (!current()) return;
			await previewExport(blob, format, captured);
			paper.setNotice("Votre export est prêt. Vous pouvez le consulter puis l’enregistrer.");
		} catch (e) {
			if (current()) paper.setNotice(String(e instanceof Error ? e.message : e));
		} finally {
			if (current()) setExportBusy(false);
		}
	};
	const caretPosition = useRef(null);
	const reflow = (id, source, breaks, sourceOffsets) => {
		const latest = paper.getCurrent();
		if (!latest || disabled || hasPendingNotebookWrites()) return false;
		const command = reflowPaperText(latest, id, source, breaks, sourceOffsets);
		if (!command) return true;
		const saved = paper.layout(command);
		if (saved && caretPosition.current?.id === id) flowCaret(id, caretPosition.current.y);
		return saved;
	};
	const flowCaret = (id, y) => {
		caretPosition.current = {
			id,
			y
		};
		const flow = (paper.getCurrent()?.objects.find((o) => o.id === id))?.textFlow;
		if (!flow) return;
		const index = flow.breaks.findIndex((end, i) => i > 0 && y < end) - 1;
		const page = flow.pageIds[index < 0 ? flow.pageIds.length - 1 : index];
		if (page && page !== pageId) {
			setPageId(page);
			setSelected([id]);
		}
	};
	useEffect(() => {
		const caret = caretPosition.current, root = caret && paper.getCurrent()?.objects.find((o) => o.id === caret.id), target = viewport.current;
		if (!caret || !root || !target || !root.textFlow) return;
		const index = root.textFlow.pageIds.indexOf(pageId);
		if (index < 0) return;
		const localY = (root.y + caret.y - root.textFlow.breaks[index]) * zoom;
		const task = requestAnimationFrame(() => {
			if (localY < target.scrollTop + 32 || localY > target.scrollTop + target.clientHeight - 32) target.scrollTop = Math.max(0, localY - target.clientHeight / 2);
		});
		return () => cancelAnimationFrame(task);
	}, [pageId, zoom]);
	const goPdfPage = (number) => {
		const target = paper.getCurrent()?.pages.find((p) => p.pdf && p.pdf.assetId === page?.pdf?.assetId && p.pdf.pageNumber === number);
		if (target) {
			setPageId(target.id);
			setSelected([]);
			if (innerWidth <= 700) setPdfOutline(false);
		} else paper.setNotice("La page visée ne fait plus partie de cette note. Le PDF original est conservé.");
	};
	const duplicatePage = async () => {
		if (!doc || !page || pageBusy || disabled) return;
		const scope = exportScope.current, selectedPage = page.id;
		setPageBusy(true);
		const current = () => mounted.current && exportScope.current === scope;
		try {
			await runNotebookOperation(media.accountId, async () => {
				flushText();
				await paper.whenSaved();
				let snapshot = paper.getCurrent();
				if (!snapshot || !current()) return;
				const { duplicatePaperPage, alignCopiedPageText } = await import("./assets/paperPageCopy-B4Nz_cZe.js").then((n) => n.i);
				const { preparePaperFlowExport, measurePaperFlowObject } = await import("./assets/paperFlowExport-CjKPKSYo.js");
				if (paperObjectsOnPage(snapshot, selectedPage).some((o) => o.kind === "text" && o.textFlow && o.textFlow.pageIds.length > 1 && (!o.textFlow.sourceOffsets || o.textFlow.source !== textFlowFingerprint(o.markdown ?? "", o.width, o.height)))) {
					const baseline = snapshot;
					paper.setNotice("Préparation de la copie de cette page…");
					snapshot = await preparePaperFlowExport(snapshot, media);
					if (!current()) return;
					const latest = paper.getCurrent();
					if (!latest || JSON.stringify(latest.objects) !== JSON.stringify(baseline.objects)) throw Error("Le contenu a changé pendant la préparation. Relancez la copie de cette page.");
				}
				if (!current() || !paper.getCurrent()?.pages.some((p) => p.id === selectedPage)) return;
				const baseline = paper.getCurrent(), copied = duplicatePaperPage(snapshot, selectedPage);
				if (copied.command.type === "batch") {
					const sources = paperObjectsOnPage(snapshot, selectedPage);
					let textIndex = 0;
					for (const command of copied.command.commands) {
						if (command.type !== "upsert-object") continue;
						const source = sources[textIndex++];
						if (command.object.kind === "text" && source.textFlow && source.textFlow.pageIds.length > 1) {
							const originalLayout = await measurePaperFlowObject(source, snapshot, media), copyLayout = await measurePaperFlowObject(command.object, snapshot, media);
							command.object = alignCopiedPageText(command.object, source, selectedPage, originalLayout.bands, copyLayout);
						}
					}
				}
				if (!current()) return;
				const latest = paper.getCurrent();
				if (!latest || JSON.stringify(latest.objects) !== JSON.stringify(baseline.objects) || JSON.stringify(latest.pages.find((p) => p.id === selectedPage)) !== JSON.stringify(baseline.pages.find((p) => p.id === selectedPage))) throw Error("La page a changé pendant la copie. Sa version actuelle est conservée.");
				if (!commit(copied.command)) return;
				await paper.whenSaved();
				if (current()) {
					setPageId(copied.pageId);
					setSelected([]);
					paper.setNotice("Page dupliquée avec son texte, sa mise en forme et ses annotations.");
				}
			});
		} catch (error) {
			if (current()) paper.setNotice(String(error instanceof Error ? error.message : error));
		} finally {
			if (current()) setPageBusy(false);
		}
	};
	const modifyPages = async (operation) => {
		if (pageBusy || disabled) return;
		const scope = exportScope.current;
		setPageBusy(true);
		const current = () => mounted.current && exportScope.current === scope;
		try {
			await runNotebookOperation(media.accountId, async () => {
				flushText();
				await paper.whenSaved();
				const baseline = paper.getCurrent();
				if (!baseline || !current()) return;
				const { pageOperationFlows, planPaperPageOperation } = await import("./assets/paperPageOperations-tYR0iyrY.js");
				const { preparePaperFlowExport, measurePaperFlowObject } = await import("./assets/paperFlowExport-CjKPKSYo.js");
				const { alignCopiedPageText } = await import("./assets/paperPageCopy-B4Nz_cZe.js").then((n) => n.i);
				let snapshot = baseline;
				if (pageOperationFlows(snapshot, operation).some((o) => !o.textFlow?.sourceOffsets || o.textFlow.source !== textFlowFingerprint(o.markdown ?? "", o.width, o.height))) {
					paper.setNotice("Préparation des pages et de leur texte…");
					snapshot = await preparePaperFlowExport(snapshot, media);
					if (!current()) return;
					if (JSON.stringify(snapshot.pages.map((p) => p.id)) !== JSON.stringify(baseline.pages.map((p) => p.id))) throw Error("La pagination a changé. Laissez-la se terminer puis réessayez.");
				}
				const plan = planPaperPageOperation(snapshot, operation);
				for (const partition of plan.partitions) {
					const originalLayout = await measurePaperFlowObject(partition.source, snapshot, media);
					if (!current()) return;
					for (let i = 0; i < partition.objects.length; i++) {
						const fragment = partition.objects[i], layout = await measurePaperFlowObject(fragment, snapshot, media);
						if (!current()) return;
						partition.objects[i] = alignCopiedPageText(fragment, partition.source, fragment.pageId, originalLayout.bands, layout);
					}
				}
				for (const command of plan.command.commands) if (command.type === "partition-text-flow") command.expected = structuredClone(baseline.objects.find((o) => o.id === command.id));
				if (!current()) return;
				flushText();
				await paper.whenSaved();
				const latest = paper.getCurrent();
				if (!latest || JSON.stringify(latest.objects) !== JSON.stringify(baseline.objects) || JSON.stringify(latest.pages) !== JSON.stringify(baseline.pages)) throw Error("La note a changé pendant la préparation. Votre contenu actuel reste conservé. Réessayez.");
				for (const command of plan.command.commands) if (command.type === "partition-text-flow") command.expected = structuredClone(latest.objects.find((o) => o.id === command.id));
				if (!commit(plan.command)) return;
				await paper.whenSaved();
				if (!current()) return;
				if (plan.nextPageId) setPageId(plan.nextPageId);
				setSelected([]);
				paper.setNotice(operation.type === "remove-page" ? "Page supprimée. Les autres pages sont conservées ; vous pouvez annuler." : "Pages déplacées avec leur texte et leurs annotations.");
			});
		} catch (error) {
			if (current()) paper.setNotice(String(error instanceof Error ? error.message : error));
		} finally {
			if (current()) setPageBusy(false);
		}
	};
	const getRepairDocument = async () => {
		const captured = renderedOwner;
		await paper.whenSaved();
		if (!mounted.current || exportScope.current !== captured) return null;
		const current = paper.getCurrent();
		if (current) return current;
		const stored = await getDraft({
			...media,
			type: "whiteboard",
			documentId: notebookDocumentId(noteId)
		});
		if (!mounted.current || exportScope.current !== captured) return null;
		return stored && stored.accountId === media.accountId && stored.spaceId === media.spaceId && isPaperDocument(stored.content) && stored.content.noteId === noteId ? stored.content : null;
	};
	const downloadRepairOriginal = media.api ? async (need) => {
		const api = media.api, captured = renderedOwner, valid = () => mounted.current && exportScope.current === captured && mediaApi.current === api;
		if (!valid() || need.accountId !== media.accountId || need.spaceId !== media.spaceId || !need.serverId) throw Error("La connexion de cette image a changé.");
		api.bindAccount(media.accountId);
		const blob = await api.downloadBlob(media.spaceId, need.serverId);
		if (!valid()) throw Error("La connexion a changé pendant la récupération. Les originaux restent conservés.");
		return blob;
	} : void 0;
	const applyImageRepair = async (plan, version) => {
		const captured = renderedOwner, current = () => mounted.current && exportScope.current === captured;
		if (readOnly || !current()) throw Error("La note courante est en lecture seule ou a changé.");
		await runNotebookOperation(media.accountId, async () => {
			flushText();
			await paper.whenSaved();
			if (!current()) throw Error("La note courante a changé.");
			const { preparePaperImageRepair } = await Promise.resolve().then(() => paperImageRepair_exports);
			let prepared;
			if (paper.getCurrent()) await paper.applyPrepared(async (_, valid) => prepared = await preparePaperImageRepair({
				plan,
				version,
				current: () => current() && valid()
			}));
			else {
				prepared = await preparePaperImageRepair({
					plan,
					version,
					current
				});
				const { commitNotebookTransfer } = await import("./assets/storage-Dsyjb46q.js").then((n) => n.A);
				if (!current()) return;
				await commitNotebookTransfer(prepared.commit, current);
			}
			if (!current() || !prepared) return;
			if (prepared.metadataChange) {
				const change = prepared.metadataChange;
				if (await onChangeRef.current(change.afterMarkdown, { expectedMarkdown: change.beforeMarkdown }) === false) {
					await new Promise((resolve) => setTimeout(resolve, 0));
					if (current() && markdownRef.current !== change.afterMarkdown) throw Error("Le carnet est réparé et ses originaux sont conservés. Les métadonnées ont changé ; leur reprise attend la version courante pour préserver votre saisie.");
				}
			}
			if (current()) {
				paper.retryOpen();
				paper.setNotice("Image réparée. Les versions originales restent conservées dans l’historique.");
			}
		});
	};
	const usePersonalTemplate = async (template) => {
		const captured = renderedOwner, current = () => mounted.current && exportScope.current === captured;
		if (disabled || !current()) return false;
		let first = "";
		try {
			flushText();
			await paper.whenSaved();
			if (!current()) throw Error("La note courante a changé.");
			await paper.applyPrepared(async (baseline, valid) => {
				const { preparePaperPersonalTemplateUse } = await import("./assets/paperPersonalTemplates-pZgjRF90.js");
				const result = await preparePaperPersonalTemplateUse({
					template,
					document: baseline,
					media,
					current: () => current() && valid(),
					afterId: pageId
				});
				first = result.firstPageId;
				return result;
			});
			if (!current()) return false;
			setPageId(first);
			setSelected([]);
			return true;
		} catch (error) {
			if (current()) paper.setNotice(String(error instanceof Error ? error.message : error));
			return false;
		}
	};
	const repairImages = /* @__PURE__ */ jsxDEV(PaperImageRepair, {
		noteId,
		media,
		disabled: readOnly,
		getDocument: getRepairDocument,
		downloadOriginal: downloadRepairOriginal,
		onApply: applyImageRepair
	}, exportScope.current, false, {
		fileName: _jsxFileName$4,
		lineNumber: 299,
		columnNumber: 21
	}, this);
	if (!doc || !page) return /* @__PURE__ */ jsxDEV("div", {
		className: "paper-opening",
		children: [/* @__PURE__ */ jsxDEV("p", {
			role: "status",
			children: paper.notice || "Ouverture de votre carnet…"
		}, void 0, false, {
			fileName: _jsxFileName$4,
			lineNumber: 300,
			columnNumber: 55
		}, this), paper.blocked && /* @__PURE__ */ jsxDEV(Fragment, { children: [/* @__PURE__ */ jsxDEV("button", {
			type: "button",
			onClick: paper.retryOpen,
			children: "Réessayer l’ouverture"
		}, void 0, false, {
			fileName: _jsxFileName$4,
			lineNumber: 300,
			columnNumber: 138
		}, this), repairImages] }, void 0, true, {
			fileName: _jsxFileName$4,
			lineNumber: 300,
			columnNumber: 136
		}, this)]
	}, void 0, true, {
		fileName: _jsxFileName$4,
		lineNumber: 300,
		columnNumber: 24
	}, this);
	return /* @__PURE__ */ jsxDEV("div", {
		className: `paper-notebook ${smartHighlight ? "is-smart-highlighting" : ""} ${toolPreferences.effective.dominantHand === "left" ? "is-left-handed" : ""} ${focusMode ? "is-focused" : ""}`,
		onClick: (event) => {
			const target = event.target;
			if (target.closest(".paper-tool-popover button")) target.closest("details")?.removeAttribute("open");
		},
		onKeyDown: (event) => {
			commandMenu.current?.handleKeyDown(event);
			if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z" && !event.defaultPrevented && !event.target.closest("input,textarea,[contenteditable=\"true\"]")) {
				event.preventDefault();
				if (editable()) {
					cancelInputs();
					flushText();
					paper.travel(event.shiftKey ? "redo" : "undo");
					setShapeProposal(null);
					setOriginalRestore(null);
				}
			}
			if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") {
				event.preventDefault();
				setFocusMode(false);
				setSearchOpen(true);
			}
			if (event.key === "Escape" && !event.defaultPrevented) {
				setFocusMode(false);
				setSearchOpen(false);
				event.currentTarget.querySelectorAll("details.paper-tool-menu[open]").forEach((menu) => menu.removeAttribute("open"));
			}
		},
		children: [
			/* @__PURE__ */ jsxDEV("div", {
				className: "paper-toolbar",
				role: "toolbar",
				"aria-label": "Outils du carnet",
				children: [/* @__PURE__ */ jsxDEV("div", {
					className: "paper-primary-tools",
					children: [
						/* @__PURE__ */ jsxDEV("button", {
							"aria-label": "Afficher les pages",
							"aria-pressed": manager,
							onClick: () => setManager((v) => !v),
							children: /* @__PURE__ */ jsxDEV(Layers, {}, void 0, false, {
								fileName: _jsxFileName$4,
								lineNumber: 303,
								columnNumber: 97
							}, this)
						}, void 0, false, {
							fileName: _jsxFileName$4,
							lineNumber: 303,
							columnNumber: 2
						}, this),
						/* @__PURE__ */ jsxDEV("span", { className: "paper-tool-divider" }, void 0, false, {
							fileName: _jsxFileName$4,
							lineNumber: 303,
							columnNumber: 115
						}, this),
						toolbarSlots.map((slot) => /* @__PURE__ */ jsxDEV("button", {
							"data-tool-slot": slot.id,
							title: `${paperToolSlotLabel(slot, toolPreferences.effective)} · ${slot.preset.width} pt`,
							"aria-label": paperToolSlotLabel(slot, toolPreferences.effective),
							disabled: disabled || toolPreferences.saving,
							"aria-pressed": tool === slot.tool && activeSlot.id === slot.id,
							className: "paper-preset-tool",
							onClick: () => {
								if (!editable()) return;
								selectToolSlot(slot);
								if (slot.tool === "text") {
									const texts = objects.filter((o) => o.kind === "text" || o.kind === "sticky");
									const active = texts.find((o) => selected.includes(o.id)) ?? texts[0];
									if (active) setSelected([active.id]);
									else addObject("text");
								}
							},
							children: [/* @__PURE__ */ jsxDEV(PaperToolIcon, { tool: slot.tool }, void 0, false, {
								fileName: _jsxFileName$4,
								lineNumber: 304,
								columnNumber: 628
							}, this), [
								"pen",
								"pencil",
								"calligraphy",
								"highlighter"
							].includes(slot.tool) && /* @__PURE__ */ jsxDEV("i", {
								"aria-hidden": "true",
								style: {
									background: slot.preset.color,
									opacity: slot.preset.opacity
								}
							}, void 0, false, {
								fileName: _jsxFileName$4,
								lineNumber: 304,
								columnNumber: 728
							}, this)]
						}, slot.id, true, {
							fileName: _jsxFileName$4,
							lineNumber: 304,
							columnNumber: 26
						}, this)),
						[
							"pen",
							"pencil",
							"calligraphy",
							"highlighter",
							"eraser"
						].includes(tool) && /* @__PURE__ */ jsxDEV(Fragment, { children: [
							tool !== "eraser" && /* @__PURE__ */ jsxDEV("label", {
								title: "Couleur",
								children: /* @__PURE__ */ jsxDEV("input", {
									type: "color",
									"aria-label": "Couleur",
									value: color,
									disabled: toolPreferences.saving,
									onChange: (e) => changeStyle({ color: e.target.value })
								}, void 0, false, {
									fileName: _jsxFileName$4,
									lineNumber: 305,
									columnNumber: 116
								}, this)
							}, void 0, false, {
								fileName: _jsxFileName$4,
								lineNumber: 305,
								columnNumber: 93
							}, this),
							/* @__PURE__ */ jsxDEV("select", {
								"aria-label": "Épaisseur",
								value: width,
								disabled: toolPreferences.saving,
								onChange: (e) => changeStyle({ width: Number(e.target.value) }),
								children: [.../* @__PURE__ */ new Set([
									.5,
									1,
									2,
									3,
									5,
									8,
									12,
									14,
									20,
									width
								])].sort((a, b) => a - b).map((w) => /* @__PURE__ */ jsxDEV("option", {
									value: w,
									children: [w, " pt"]
								}, w, true, {
									fileName: _jsxFileName$4,
									lineNumber: 305,
									columnNumber: 471
								}, this))
							}, void 0, false, {
								fileName: _jsxFileName$4,
								lineNumber: 305,
								columnNumber: 265
							}, this),
							tool !== "eraser" && /* @__PURE__ */ jsxDEV("select", {
								"aria-label": "Style du trait",
								value: strokeStyle,
								disabled: toolPreferences.saving,
								onChange: (e) => changeStyle({ strokeStyle: e.target.value }),
								children: [
									/* @__PURE__ */ jsxDEV("option", {
										value: "solid",
										children: "Continu"
									}, void 0, false, {
										fileName: _jsxFileName$4,
										lineNumber: 305,
										columnNumber: 707
									}, this),
									/* @__PURE__ */ jsxDEV("option", {
										value: "dashed",
										children: "Tirets"
									}, void 0, false, {
										fileName: _jsxFileName$4,
										lineNumber: 305,
										columnNumber: 745
									}, this),
									/* @__PURE__ */ jsxDEV("option", {
										value: "dotted",
										children: "Pointillés"
									}, void 0, false, {
										fileName: _jsxFileName$4,
										lineNumber: 305,
										columnNumber: 783
									}, this)
								]
							}, void 0, true, {
								fileName: _jsxFileName$4,
								lineNumber: 305,
								columnNumber: 541
							}, this),
							tool === "eraser" ? /* @__PURE__ */ jsxDEV("label", {
								className: "paper-option",
								children: [/* @__PURE__ */ jsxDEV("input", {
									type: "checkbox",
									checked: wholeEraser,
									disabled: toolPreferences.saving,
									onChange: (e) => changeStyle({ wholeEraser: e.target.checked })
								}, void 0, false, {
									fileName: _jsxFileName$4,
									lineNumber: 305,
									columnNumber: 884
								}, this), "Trait entier"]
							}, void 0, true, {
								fileName: _jsxFileName$4,
								lineNumber: 305,
								columnNumber: 852
							}, this) : /* @__PURE__ */ jsxDEV("label", {
								className: "paper-opacity-control",
								title: "Opacité",
								children: [
									" ",
									/* @__PURE__ */ jsxDEV("input", {
										type: "range",
										min: "0",
										max: "100",
										step: "5",
										"aria-label": "Opacité de l’encre",
										value: Math.round(opacity * 100),
										disabled: toolPreferences.saving,
										onChange: (e) => changeStyle({ opacity: Number(e.target.value) / 100 })
									}, void 0, false, {
										fileName: _jsxFileName$4,
										lineNumber: 305,
										columnNumber: 1101
									}, this),
									/* @__PURE__ */ jsxDEV("span", { children: [Math.round(opacity * 100), " %"] }, void 0, true, {
										fileName: _jsxFileName$4,
										lineNumber: 305,
										columnNumber: 1311
									}, this)
								]
							}, void 0, true, {
								fileName: _jsxFileName$4,
								lineNumber: 305,
								columnNumber: 1043
							}, this)
						] }, void 0, true, {
							fileName: _jsxFileName$4,
							lineNumber: 305,
							columnNumber: 73
						}, this),
						/* @__PURE__ */ jsxDEV("button", {
							"aria-label": "Annuler",
							disabled: disabled || !paper.canUndo,
							onClick: () => {
								if (!editable()) return;
								cancelInputs();
								flushText();
								paper.travel("undo");
								setShapeProposal(null);
								setOriginalRestore(null);
							},
							children: /* @__PURE__ */ jsxDEV(Undo2, {}, void 0, false, {
								fileName: _jsxFileName$4,
								lineNumber: 306,
								columnNumber: 202
							}, this)
						}, void 0, false, {
							fileName: _jsxFileName$4,
							lineNumber: 306,
							columnNumber: 2
						}, this),
						/* @__PURE__ */ jsxDEV("button", {
							"aria-label": "Rétablir",
							disabled: disabled || !paper.canRedo,
							onClick: () => {
								if (!editable()) return;
								cancelInputs();
								flushText();
								paper.travel("redo");
								setShapeProposal(null);
								setOriginalRestore(null);
							},
							children: /* @__PURE__ */ jsxDEV(Redo2, {}, void 0, false, {
								fileName: _jsxFileName$4,
								lineNumber: 306,
								columnNumber: 420
							}, this)
						}, void 0, false, {
							fileName: _jsxFileName$4,
							lineNumber: 306,
							columnNumber: 219
						}, this),
						/* @__PURE__ */ jsxDEV("span", { className: "paper-tool-divider" }, void 0, false, {
							fileName: _jsxFileName$4,
							lineNumber: 306,
							columnNumber: 437
						}, this)
					]
				}, void 0, true, {
					fileName: _jsxFileName$4,
					lineNumber: 302,
					columnNumber: 78
				}, this), /* @__PURE__ */ jsxDEV("div", {
					className: "paper-toolbar-actions",
					children: [
						commandContext && /* @__PURE__ */ jsxDEV(PaperCommandMenu, {
							ref: commandMenu,
							context: commandContext,
							getCurrent: currentCommandContext,
							media,
							onCommit: commandCommit,
							onSelect: commandSelect,
							onPaste: commandPaste,
							onOpen: () => {
								cancelInputs();
								flushText();
							},
							onAudio: (anchor, target) => {
								if (paperNotebookCommandTargetCurrent(target, currentCommandContext())) seekAudio(anchor);
							},
							onNotice: paper.setNotice
						}, void 0, false, {
							fileName: _jsxFileName$4,
							lineNumber: 307,
							columnNumber: 64
						}, this),
						/* @__PURE__ */ jsxDEV("button", {
							"aria-label": "Surlignage guidé du texte",
							"aria-pressed": smartHighlight,
							disabled: disabled || textOnly,
							onClick: () => {
								if (!editable()) return;
								cancelInputs();
								setSelected([]);
								setSmartHighlight((value) => !value);
								setLoupeOpen(false);
							},
							children: /* @__PURE__ */ jsxDEV(Highlighter, {}, void 0, false, {
								fileName: _jsxFileName$4,
								lineNumber: 307,
								columnNumber: 666
							}, this)
						}, void 0, false, {
							fileName: _jsxFileName$4,
							lineNumber: 307,
							columnNumber: 436
						}, this),
						/* @__PURE__ */ jsxDEV("button", {
							"aria-label": "Loupe d’écriture",
							"aria-pressed": loupeOpen,
							disabled: disabled || textOnly || !aids.ready,
							onClick: () => {
								if (!editable()) return;
								cancelInputs();
								setLoupeOpen((value) => !value);
								if (tool === "text" || tool === "select") activateTool("pen");
							},
							children: /* @__PURE__ */ jsxDEV(ZoomIn, {}, void 0, false, {
								fileName: _jsxFileName$4,
								lineNumber: 307,
								columnNumber: 931
							}, this)
						}, void 0, false, {
							fileName: _jsxFileName$4,
							lineNumber: 307,
							columnNumber: 689
						}, this),
						/* @__PURE__ */ jsxDEV("button", {
							"aria-label": "Règle et maintien",
							"aria-pressed": aidsOpen,
							disabled: disabled || textOnly || !aids.ready,
							onClick: () => {
								if (editable()) setAidsOpen((value) => !value);
							},
							children: /* @__PURE__ */ jsxDEV(Move, {}, void 0, false, {
								fileName: _jsxFileName$4,
								lineNumber: 307,
								columnNumber: 1113
							}, this)
						}, void 0, false, {
							fileName: _jsxFileName$4,
							lineNumber: 307,
							columnNumber: 949
						}, this),
						/* @__PURE__ */ jsxDEV("button", {
							className: "paper-focus-toggle",
							"aria-label": focusMode ? "Quitter le mode concentration" : "Mode concentration",
							title: focusMode ? "Quitter le mode concentration (Échap)" : "Mode concentration",
							"aria-pressed": focusMode,
							onClick: () => {
								setFocusMode((value) => !value);
								setSearchOpen(false);
								setStudyOpen(false);
							},
							children: [focusMode ? /* @__PURE__ */ jsxDEV(Minimize, {}, void 0, false, {
								fileName: _jsxFileName$4,
								lineNumber: 307,
								columnNumber: 1445
							}, this) : /* @__PURE__ */ jsxDEV(Focus, {}, void 0, false, {
								fileName: _jsxFileName$4,
								lineNumber: 307,
								columnNumber: 1457
							}, this), focusMode && /* @__PURE__ */ jsxDEV("span", { children: "Quitter" }, void 0, false, {
								fileName: _jsxFileName$4,
								lineNumber: 307,
								columnNumber: 1478
							}, this)]
						}, void 0, true, {
							fileName: _jsxFileName$4,
							lineNumber: 307,
							columnNumber: 1129
						}, this),
						/* @__PURE__ */ jsxDEV(PaperToolSettings, { preferences: toolPreferences }, void 0, false, {
							fileName: _jsxFileName$4,
							lineNumber: 307,
							columnNumber: 1508
						}, this),
						/* @__PURE__ */ jsxDEV("details", {
							className: "paper-tool-menu",
							children: [/* @__PURE__ */ jsxDEV("summary", {
								"aria-label": "Insérer dans la note",
								children: [/* @__PURE__ */ jsxDEV(Plus, {}, void 0, false, {
									fileName: _jsxFileName$4,
									lineNumber: 307,
									columnNumber: 1638
								}, this), /* @__PURE__ */ jsxDEV("span", { children: "Insérer" }, void 0, false, {
									fileName: _jsxFileName$4,
									lineNumber: 307,
									columnNumber: 1645
								}, this)]
							}, void 0, true, {
								fileName: _jsxFileName$4,
								lineNumber: 307,
								columnNumber: 1595
							}, this), /* @__PURE__ */ jsxDEV("div", {
								className: "paper-tool-popover",
								children: [
									/* @__PURE__ */ jsxDEV("button", {
										"aria-label": "Ajouter une zone de texte",
										disabled,
										onClick: () => addObject("text"),
										children: [/* @__PURE__ */ jsxDEV(Type, {}, void 0, false, {
											fileName: _jsxFileName$4,
											lineNumber: 307,
											columnNumber: 1810
										}, this), "Zone de texte"]
									}, void 0, true, {
										fileName: _jsxFileName$4,
										lineNumber: 307,
										columnNumber: 1711
									}, this),
									/* @__PURE__ */ jsxDEV("button", {
										"aria-label": "Ajouter une image",
										disabled,
										onClick: () => input.current?.click(),
										children: [/* @__PURE__ */ jsxDEV(ImagePlus, {}, void 0, false, {
											fileName: _jsxFileName$4,
											lineNumber: 307,
											columnNumber: 1935
										}, this), "Image"]
									}, void 0, true, {
										fileName: _jsxFileName$4,
										lineNumber: 307,
										columnNumber: 1839
									}, this),
									/* @__PURE__ */ jsxDEV("button", {
										"aria-label": "Ajouter un post-it",
										disabled,
										onClick: () => addObject("sticky"),
										children: [/* @__PURE__ */ jsxDEV(StickyNote, {}, void 0, false, {
											fileName: _jsxFileName$4,
											lineNumber: 307,
											columnNumber: 2055
										}, this), "Post-it"]
									}, void 0, true, {
										fileName: _jsxFileName$4,
										lineNumber: 307,
										columnNumber: 1961
									}, this),
									/* @__PURE__ */ jsxDEV("select", {
										"aria-label": "Ajouter une forme",
										value: "",
										disabled,
										onChange: (e) => {
											if (e.target.value) addObject("shape", void 0, e.target.value);
										},
										children: [
											/* @__PURE__ */ jsxDEV("option", {
												value: "",
												children: "Forme…"
											}, void 0, false, {
												fileName: _jsxFileName$4,
												lineNumber: 307,
												columnNumber: 2255
											}, this),
											/* @__PURE__ */ jsxDEV("option", {
												value: "rectangle",
												children: "Rectangle"
											}, void 0, false, {
												fileName: _jsxFileName$4,
												lineNumber: 307,
												columnNumber: 2287
											}, this),
											/* @__PURE__ */ jsxDEV("option", {
												value: "ellipse",
												children: "Ellipse"
											}, void 0, false, {
												fileName: _jsxFileName$4,
												lineNumber: 307,
												columnNumber: 2331
											}, this),
											/* @__PURE__ */ jsxDEV("option", {
												value: "line",
												children: "Ligne"
											}, void 0, false, {
												fileName: _jsxFileName$4,
												lineNumber: 307,
												columnNumber: 2371
											}, this),
											/* @__PURE__ */ jsxDEV("option", {
												value: "arrow",
												children: "Flèche"
											}, void 0, false, {
												fileName: _jsxFileName$4,
												lineNumber: 307,
												columnNumber: 2406
											}, this)
										]
									}, void 0, true, {
										fileName: _jsxFileName$4,
										lineNumber: 307,
										columnNumber: 2084
									}, this),
									/* @__PURE__ */ jsxDEV("button", {
										"aria-label": "Coller les objets copiés",
										disabled,
										onClick: () => {
											const current = commandContext;
											if (current) commandPaste(capturePaperNotebookCommandTarget(current));
										},
										children: [/* @__PURE__ */ jsxDEV(ClipboardPaste, {}, void 0, false, {
											fileName: _jsxFileName$4,
											lineNumber: 308,
											columnNumber: 187
										}, this), "Coller les objets copiés"]
									}, void 0, true, {
										fileName: _jsxFileName$4,
										lineNumber: 308,
										columnNumber: 2
									}, this),
									/* @__PURE__ */ jsxDEV("button", {
										"aria-label": "Importer un PDF",
										disabled,
										onClick: () => pdfInput.current?.click(),
										children: [/* @__PURE__ */ jsxDEV(Layers, {}, void 0, false, {
											fileName: _jsxFileName$4,
											lineNumber: 309,
											columnNumber: 99
										}, this), "Importer un PDF"]
									}, void 0, true, {
										fileName: _jsxFileName$4,
										lineNumber: 309,
										columnNumber: 2
									}, this),
									/* @__PURE__ */ jsxDEV("input", {
										ref: pdfInput,
										type: "file",
										hidden: true,
										"aria-label": "PDF à importer",
										accept: "application/pdf",
										onChange: (e) => {
											const f = e.target.files?.[0];
											e.target.value = "";
											if (f) importPdf(f);
										}
									}, void 0, false, {
										fileName: _jsxFileName$4,
										lineNumber: 309,
										columnNumber: 132
									}, this),
									/* @__PURE__ */ jsxDEV("button", {
										"aria-label": "Importer une archive Dowze",
										disabled,
										onClick: () => archiveInput.current?.click(),
										children: [/* @__PURE__ */ jsxDEV(Upload, {}, void 0, false, {
											fileName: _jsxFileName$4,
											lineNumber: 309,
											columnNumber: 425
										}, this), "Importer une archive"]
									}, void 0, true, {
										fileName: _jsxFileName$4,
										lineNumber: 309,
										columnNumber: 313
									}, this),
									/* @__PURE__ */ jsxDEV("input", {
										ref: archiveInput,
										type: "file",
										hidden: true,
										accept: ".dowze,application/zip",
										onChange: (e) => {
											const f = e.target.files?.[0];
											e.target.value = "";
											if (f) importArchive(f);
										}
									}, void 0, false, {
										fileName: _jsxFileName$4,
										lineNumber: 309,
										columnNumber: 463
									}, this)
								]
							}, void 0, true, {
								fileName: _jsxFileName$4,
								lineNumber: 307,
								columnNumber: 1675
							}, this)]
						}, void 0, true, {
							fileName: _jsxFileName$4,
							lineNumber: 307,
							columnNumber: 1558
						}, this),
						/* @__PURE__ */ jsxDEV("button", {
							"aria-label": "Rechercher dans la note",
							"aria-pressed": searchOpen,
							onClick: () => setSearchOpen((v) => !v),
							children: /* @__PURE__ */ jsxDEV(Search, {}, void 0, false, {
								fileName: _jsxFileName$4,
								lineNumber: 309,
								columnNumber: 753
							}, this)
						}, void 0, false, {
							fileName: _jsxFileName$4,
							lineNumber: 309,
							columnNumber: 647
						}, this),
						/* @__PURE__ */ jsxDEV("button", {
							"aria-label": "Réviser la note",
							"aria-pressed": studyOpen,
							onClick: () => setStudyOpen((v) => !v),
							children: /* @__PURE__ */ jsxDEV(BookOpenCheck, {}, void 0, false, {
								fileName: _jsxFileName$4,
								lineNumber: 309,
								columnNumber: 867
							}, this)
						}, void 0, false, {
							fileName: _jsxFileName$4,
							lineNumber: 309,
							columnNumber: 771
						}, this),
						repairImages,
						/* @__PURE__ */ jsxDEV("details", {
							className: "paper-tool-menu",
							children: [/* @__PURE__ */ jsxDEV("summary", {
								"aria-label": "Options de la note",
								children: /* @__PURE__ */ jsxDEV(MoreHorizontal, {}, void 0, false, {
									fileName: _jsxFileName$4,
									lineNumber: 309,
									columnNumber: 984
								}, this)
							}, void 0, false, {
								fileName: _jsxFileName$4,
								lineNumber: 309,
								columnNumber: 943
							}, this), /* @__PURE__ */ jsxDEV("div", {
								className: "paper-tool-popover",
								children: [
									/* @__PURE__ */ jsxDEV("button", {
										"aria-label": "Historique des versions",
										onClick: () => void openHistory(),
										children: [/* @__PURE__ */ jsxDEV(History, {}, void 0, false, {
											fileName: _jsxFileName$4,
											lineNumber: 309,
											columnNumber: 1125
										}, this), "Historique des versions"]
									}, void 0, true, {
										fileName: _jsxFileName$4,
										lineNumber: 309,
										columnNumber: 1047
									}, this),
									/* @__PURE__ */ jsxDEV("select", {
										"aria-label": "Exporter la note ou la page",
										value: "",
										disabled: exportBusy,
										onChange: (e) => {
											const format = e.target.value;
											if (format) renderExport(format);
										},
										children: [
											/* @__PURE__ */ jsxDEV("option", {
												value: "",
												children: "Exporter…"
											}, void 0, false, {
												fileName: _jsxFileName$4,
												lineNumber: 309,
												columnNumber: 1350
											}, this),
											/* @__PURE__ */ jsxDEV("option", {
												value: "pdf",
												children: "Note complète en PDF"
											}, void 0, false, {
												fileName: _jsxFileName$4,
												lineNumber: 309,
												columnNumber: 1385
											}, this),
											/* @__PURE__ */ jsxDEV("option", {
												value: "png",
												children: "Page en PNG"
											}, void 0, false, {
												fileName: _jsxFileName$4,
												lineNumber: 309,
												columnNumber: 1434
											}, this),
											/* @__PURE__ */ jsxDEV("option", {
												value: "jpeg",
												children: "Page en JPEG"
											}, void 0, false, {
												fileName: _jsxFileName$4,
												lineNumber: 309,
												columnNumber: 1474
											}, this)
										]
									}, void 0, true, {
										fileName: _jsxFileName$4,
										lineNumber: 309,
										columnNumber: 1167
									}, this),
									/* @__PURE__ */ jsxDEV("button", {
										"aria-label": "Exporter l’archive complète",
										disabled: exportBusy,
										onClick: () => void exportBundle(),
										children: [/* @__PURE__ */ jsxDEV(Download, {}, void 0, false, {
											fileName: _jsxFileName$4,
											lineNumber: 309,
											columnNumber: 1630
										}, this), "Archive complète"]
									}, void 0, true, {
										fileName: _jsxFileName$4,
										lineNumber: 309,
										columnNumber: 1525
									}, this),
									/* @__PURE__ */ jsxDEV("label", {
										className: "paper-option",
										children: [/* @__PURE__ */ jsxDEV("input", {
											type: "checkbox",
											checked: fingerInk,
											onChange: (e) => void toolPreferences.change({
												type: "set-input",
												fingerInk: e.target.checked
											})
										}, void 0, false, {
											fileName: _jsxFileName$4,
											lineNumber: 310,
											columnNumber: 34
										}, this), "Dessiner au doigt"]
									}, void 0, true, {
										fileName: _jsxFileName$4,
										lineNumber: 310,
										columnNumber: 2
									}, this),
									/* @__PURE__ */ jsxDEV("label", {
										className: "paper-option",
										children: [/* @__PURE__ */ jsxDEV("input", {
											type: "checkbox",
											checked: textOnly,
											onChange: (e) => setTextOnly(e.target.checked)
										}, void 0, false, {
											fileName: _jsxFileName$4,
											lineNumber: 310,
											columnNumber: 224
										}, this), "Lecture mobile"]
									}, void 0, true, {
										fileName: _jsxFileName$4,
										lineNumber: 310,
										columnNumber: 192
									}, this),
									/* @__PURE__ */ jsxDEV("input", {
										ref: input,
										type: "file",
										hidden: true,
										"aria-label": "Image du carnet",
										accept: "image/png,image/jpeg,image/gif,image/webp",
										onChange: (e) => {
											const f = e.target.files?.[0];
											e.target.value = "";
											if (f) uploadImage(f);
										}
									}, void 0, false, {
										fileName: _jsxFileName$4,
										lineNumber: 311,
										columnNumber: 2
									}, this)
								]
							}, void 0, true, {
								fileName: _jsxFileName$4,
								lineNumber: 309,
								columnNumber: 1011
							}, this)]
						}, void 0, true, {
							fileName: _jsxFileName$4,
							lineNumber: 309,
							columnNumber: 906
						}, this)
					]
				}, void 0, true, {
					fileName: _jsxFileName$4,
					lineNumber: 307,
					columnNumber: 8
				}, this)]
			}, void 0, true, {
				fileName: _jsxFileName$4,
				lineNumber: 302,
				columnNumber: 2
			}, this),
			paper.blocked && /* @__PURE__ */ jsxDEV("section", {
				className: "paper-conflict",
				"aria-label": "Résoudre les versions de la note",
				children: [
					/* @__PURE__ */ jsxDEV("strong", { children: "Vos modifications sont conservées." }, void 0, false, {
						fileName: _jsxFileName$4,
						lineNumber: 313,
						columnNumber: 100
					}, this),
					/* @__PURE__ */ jsxDEV("p", { children: "Cette note a changé ailleurs. Comparez les versions avant de poursuivre ; les originaux restent dans la récupération." }, void 0, false, {
						fileName: _jsxFileName$4,
						lineNumber: 313,
						columnNumber: 151
					}, this),
					/* @__PURE__ */ jsxDEV("button", {
						disabled: paper.resolving,
						onClick: () => void paper.loadResolution(),
						children: paper.resolving ? "Chargement…" : "Comparer les versions"
					}, void 0, false, {
						fileName: _jsxFileName$4,
						lineNumber: 313,
						columnNumber: 275
					}, this),
					paper.resolution && /* @__PURE__ */ jsxDEV(Fragment, { children: [
						paper.resolution.alternatives && paper.resolution.alternatives.length > 1 && /* @__PURE__ */ jsxDEV("label", { children: ["Contribution à comparer", /* @__PURE__ */ jsxDEV("select", {
							"aria-label": "Contribution à comparer",
							value: paper.resolution.selected,
							onChange: (event) => paper.selectResolutionVersion(event.target.value),
							children: paper.resolution.alternatives.map((item, index) => /* @__PURE__ */ jsxDEV("option", {
								value: item.id,
								children: [
									"Version reçue ",
									index + 1,
									" · ",
									item.content.pages.length,
									" pages"
								]
							}, item.id, true, {
								fileName: _jsxFileName$4,
								lineNumber: 313,
								columnNumber: 735
							}, this))
						}, void 0, false, {
							fileName: _jsxFileName$4,
							lineNumber: 313,
							columnNumber: 539
						}, this)] }, void 0, true, {
							fileName: _jsxFileName$4,
							lineNumber: 313,
							columnNumber: 509
						}, this),
						/* @__PURE__ */ jsxDEV("div", {
							className: "paper-conflict-versions",
							children: [/* @__PURE__ */ jsxDEV("div", { children: [
								/* @__PURE__ */ jsxDEV("h3", { children: "Sur cet appareil" }, void 0, false, {
									fileName: _jsxFileName$4,
									lineNumber: 313,
									columnNumber: 907
								}, this),
								/* @__PURE__ */ jsxDEV("p", { children: [
									"Version ",
									doc.revision,
									" · ",
									doc.pages.length,
									" pages"
								] }, void 0, true, {
									fileName: _jsxFileName$4,
									lineNumber: 313,
									columnNumber: 932
								}, this),
								/* @__PURE__ */ jsxDEV("p", { children: doc.objects.find((o) => o.markdown)?.markdown?.slice(0, 240) || "Dessins et pièces jointes" }, void 0, false, {
									fileName: _jsxFileName$4,
									lineNumber: 313,
									columnNumber: 988
								}, this)
							] }, void 0, true, {
								fileName: _jsxFileName$4,
								lineNumber: 313,
								columnNumber: 902
							}, this), /* @__PURE__ */ jsxDEV("div", { children: [
								/* @__PURE__ */ jsxDEV("h3", { children: media.api ? "Sur le serveur" : "Copie enregistrée" }, void 0, false, {
									fileName: _jsxFileName$4,
									lineNumber: 313,
									columnNumber: 1092
								}, this),
								/* @__PURE__ */ jsxDEV("p", { children: paper.resolution.remote ? `Version ${paper.resolution.remote.revision} · ${paper.resolution.remote.pages.length} pages` : "Note supprimée sur le serveur" }, void 0, false, {
									fileName: _jsxFileName$4,
									lineNumber: 313,
									columnNumber: 1149
								}, this),
								/* @__PURE__ */ jsxDEV("p", { children: paper.resolution.remote?.objects.find((o) => o.markdown)?.markdown?.slice(0, 240) }, void 0, false, {
									fileName: _jsxFileName$4,
									lineNumber: 313,
									columnNumber: 1307
								}, this)
							] }, void 0, true, {
								fileName: _jsxFileName$4,
								lineNumber: 313,
								columnNumber: 1087
							}, this)]
						}, void 0, true, {
							fileName: _jsxFileName$4,
							lineNumber: 313,
							columnNumber: 861
						}, this),
						/* @__PURE__ */ jsxDEV("div", {
							className: "paper-conflict-actions",
							children: [
								/* @__PURE__ */ jsxDEV("button", {
									disabled: paper.resolving,
									onClick: () => void paper.resolve("both"),
									children: "Conserver les deux dans la note"
								}, void 0, false, {
									fileName: _jsxFileName$4,
									lineNumber: 313,
									columnNumber: 1444
								}, this),
								/* @__PURE__ */ jsxDEV("button", {
									disabled: paper.resolving,
									onClick: () => void paper.resolve("local"),
									children: "Utiliser ma version"
								}, void 0, false, {
									fileName: _jsxFileName$4,
									lineNumber: 313,
									columnNumber: 1560
								}, this),
								/* @__PURE__ */ jsxDEV("button", {
									disabled: paper.resolving || !paper.resolution.remote,
									onClick: () => void paper.resolve("server"),
									children: ["Utiliser ", media.api ? "la version serveur" : "la copie enregistrée"]
								}, void 0, true, {
									fileName: _jsxFileName$4,
									lineNumber: 313,
									columnNumber: 1665
								}, this)
							]
						}, void 0, true, {
							fileName: _jsxFileName$4,
							lineNumber: 313,
							columnNumber: 1404
						}, this)
					] }, void 0, true, {
						fileName: _jsxFileName$4,
						lineNumber: 313,
						columnNumber: 435
					}, this)
				]
			}, void 0, true, {
				fileName: _jsxFileName$4,
				lineNumber: 313,
				columnNumber: 18
			}, this),
			exportPreview && /* @__PURE__ */ jsxDEV("section", {
				className: "paper-export-preview",
				"aria-label": "Export prêt",
				children: [/* @__PURE__ */ jsxDEV("header", { children: [
					/* @__PURE__ */ jsxDEV("strong", { children: ["Export ", exportPreview.format.toUpperCase()] }, void 0, true, {
						fileName: _jsxFileName$4,
						lineNumber: 314,
						columnNumber: 93
					}, this),
					/* @__PURE__ */ jsxDEV("span", {
						className: "paper-export-size",
						children: exportPreview.blob.size >= 1048576 ? `${(exportPreview.blob.size / 1048576).toFixed(1)} Mo` : `${Math.max(1, Math.ceil(exportPreview.blob.size / 1024))} Ko`
					}, void 0, false, {
						fileName: _jsxFileName$4,
						lineNumber: 314,
						columnNumber: 153
					}, this),
					/* @__PURE__ */ jsxDEV("a", {
						href: exportPreview.url,
						download: exportName(exportPreview.format),
						children: "Télécharger l’export"
					}, void 0, false, {
						fileName: _jsxFileName$4,
						lineNumber: 314,
						columnNumber: 349
					}, this),
					/* @__PURE__ */ jsxDEV("button", {
						onClick: savePreview,
						children: "Enregistrer"
					}, void 0, false, {
						fileName: _jsxFileName$4,
						lineNumber: 314,
						columnNumber: 445
					}, this),
					/* @__PURE__ */ jsxDEV("button", {
						onClick: () => setExportPreview(null),
						children: "Fermer"
					}, void 0, false, {
						fileName: _jsxFileName$4,
						lineNumber: 314,
						columnNumber: 495
					}, this)
				] }, void 0, true, {
					fileName: _jsxFileName$4,
					lineNumber: 314,
					columnNumber: 85
				}, this), exportPreview.format !== "pdf" && exportPreview.format !== "archive" && /* @__PURE__ */ jsxDEV("img", {
					src: exportPreview.url,
					alt: "Aperçu de la page exportée"
				}, void 0, false, {
					fileName: _jsxFileName$4,
					lineNumber: 314,
					columnNumber: 629
				}, this)]
			}, void 0, true, {
				fileName: _jsxFileName$4,
				lineNumber: 314,
				columnNumber: 18
			}, this),
			historyOpen && /* @__PURE__ */ jsxDEV("section", {
				className: "paper-history",
				"aria-label": "Versions de récupération",
				children: [
					/* @__PURE__ */ jsxDEV("header", { children: [/* @__PURE__ */ jsxDEV("strong", { children: "Versions sur cet appareil" }, void 0, false, {
						fileName: _jsxFileName$4,
						lineNumber: 315,
						columnNumber: 97
					}, this), /* @__PURE__ */ jsxDEV("button", {
						onClick: closeHistory,
						children: "Fermer"
					}, void 0, false, {
						fileName: _jsxFileName$4,
						lineNumber: 315,
						columnNumber: 139
					}, this)] }, void 0, true, {
						fileName: _jsxFileName$4,
						lineNumber: 315,
						columnNumber: 89
					}, this),
					versions.length ? versions.map((v, index) => /* @__PURE__ */ jsxDEV("div", { children: [/* @__PURE__ */ jsxDEV("span", { children: [
						"Version ",
						v.revision,
						" · ",
						new Intl.DateTimeFormat("fr-CH", {
							dateStyle: "short",
							timeStyle: "short"
						}).format(new Date(v.updatedAt))
					] }, void 0, true, {
						fileName: _jsxFileName$4,
						lineNumber: 315,
						columnNumber: 252
					}, this), /* @__PURE__ */ jsxDEV("button", {
						disabled,
						onClick: () => {
							if (historyState.scope !== exportScope.current || !mounted.current) return;
							if (commit({
								type: "restore",
								document: v
							})) closeHistory();
						},
						children: "Restaurer"
					}, void 0, false, {
						fileName: _jsxFileName$4,
						lineNumber: 315,
						columnNumber: 390
					}, this)] }, index, true, {
						fileName: _jsxFileName$4,
						lineNumber: 315,
						columnNumber: 235
					}, this)) : /* @__PURE__ */ jsxDEV("p", { children: "Aucune version précédente enregistrée sur cet appareil." }, void 0, false, {
						fileName: _jsxFileName$4,
						lineNumber: 315,
						columnNumber: 584
					}, this),
					/* @__PURE__ */ jsxDEV("small", { children: "Restaurer conserve la version actuelle dans la récupération." }, void 0, false, {
						fileName: _jsxFileName$4,
						lineNumber: 315,
						columnNumber: 647
					}, this)
				]
			}, void 0, true, {
				fileName: _jsxFileName$4,
				lineNumber: 315,
				columnNumber: 16
			}, this),
			/* @__PURE__ */ jsxDEV("div", { className: "paper-flow-toolbar-slot milkdown" }, void 0, false, {
				fileName: _jsxFileName$4,
				lineNumber: 316,
				columnNumber: 2
			}, this),
			/* @__PURE__ */ jsxDEV(Suspense, {
				fallback: null,
				children: /* @__PURE__ */ jsxDEV(PaperAudioControls, {
					requestedSeek: audioSeek,
					document: doc,
					media,
					disabled,
					onCommit: commit,
					onRecordingCommit: (command) => {
						if (disabled) return false;
						flushText();
						return paper.recordingCommand(command);
					},
					whenSaved: paper.whenSaved,
					onNotice: paper.setNotice
				}, void 0, false, {
					fileName: _jsxFileName$4,
					lineNumber: 317,
					columnNumber: 28
				}, this)
			}, void 0, false, {
				fileName: _jsxFileName$4,
				lineNumber: 317,
				columnNumber: 2
			}, this),
			smartHighlight && objects.some((o) => o.kind === "text" || o.kind === "sticky") && /* @__PURE__ */ jsxDEV(PaperTextHighlightPanel, {
				choices: objects.filter((o) => o.kind === "text" || o.kind === "sticky").map(paperHighlightChoice),
				selection: smart.selection?.kind === "text" ? smart.selection : null,
				color: smart.color,
				disabled,
				onColor: smart.setColor,
				onChoose: smart.choose,
				onRange: smart.range,
				onApply: smart.apply,
				onClear: smart.clear,
				onClose: () => {
					if (mounted.current && exportScope.current === renderedOwner && editableView.current.epoch === inkEpoch) setSmartHighlight(false);
				}
			}, `${renderedOwner}|${inkEpoch}|${doc.revision}`, false, {
				fileName: _jsxFileName$4,
				lineNumber: 318,
				columnNumber: 72
			}, this),
			/* @__PURE__ */ jsxDEV("div", {
				className: "paper-work-area",
				children: [
					searchOpen && /* @__PURE__ */ jsxDEV(PaperSearchPanel, {
						document: doc,
						onNavigate: (hit) => {
							setPageId(hit.pageId);
							setSelected(hit.objectId ? [hit.objectId] : []);
							setTool("text");
							if (innerWidth <= 700) setSearchOpen(false);
						},
						onClose: () => setSearchOpen(false)
					}, void 0, false, {
						fileName: _jsxFileName$4,
						lineNumber: 318,
						columnNumber: 644
					}, this),
					manager && /* @__PURE__ */ jsxDEV("aside", {
						ref: pageList,
						className: "paper-pages",
						"aria-label": "Pages de la note",
						children: [
							/* @__PURE__ */ jsxDEV("div", {
								className: "paper-pages-navigation",
								children: [
									/* @__PURE__ */ jsxDEV("header", { children: [/* @__PURE__ */ jsxDEV("strong", { children: [
										doc.pages.length,
										" page",
										doc.pages.length > 1 ? "s" : ""
									] }, void 0, true, {
										fileName: _jsxFileName$4,
										lineNumber: 319,
										columnNumber: 136
									}, this), /* @__PURE__ */ jsxDEV("button", {
										"aria-label": "Ajouter une page",
										disabled,
										onClick: () => {
											const p = inheritedBlankPage(page);
											commit({
												type: "insert-page",
												page: p,
												afterId: page.id
											});
											setPageId(p.id);
											setSelected([]);
										},
										children: /* @__PURE__ */ jsxDEV(Plus, {}, void 0, false, {
											fileName: _jsxFileName$4,
											lineNumber: 319,
											columnNumber: 395
										}, this)
									}, void 0, false, {
										fileName: _jsxFileName$4,
										lineNumber: 319,
										columnNumber: 203
									}, this)] }, void 0, true, {
										fileName: _jsxFileName$4,
										lineNumber: 319,
										columnNumber: 128
									}, this),
									/* @__PURE__ */ jsxDEV("form", {
										className: "paper-page-jump",
										onSubmit: (event) => {
											event.preventDefault();
											const n = Number(pageNumber);
											if (Number.isSafeInteger(n) && n >= 1 && n <= doc.pages.length) {
												setPageId(doc.pages[n - 1].id);
												setSelected([]);
											}
										},
										children: [/* @__PURE__ */ jsxDEV("input", {
											type: "number",
											min: "1",
											max: doc.pages.length,
											"aria-label": "Aller à la page",
											value: pageNumber,
											onChange: (e) => setPageNumber(e.target.value)
										}, void 0, false, {
											fileName: _jsxFileName$4,
											lineNumber: 319,
											columnNumber: 626
										}, this), /* @__PURE__ */ jsxDEV("button", {
											type: "submit",
											children: "Aller"
										}, void 0, false, {
											fileName: _jsxFileName$4,
											lineNumber: 319,
											columnNumber: 771
										}, this)]
									}, void 0, true, {
										fileName: _jsxFileName$4,
										lineNumber: 319,
										columnNumber: 420
									}, this),
									/* @__PURE__ */ jsxDEV("select", {
										"aria-label": "Filtrer les pages",
										value: pageFilter,
										onChange: (e) => setPageFilter(e.target.value),
										children: [
											/* @__PURE__ */ jsxDEV("option", {
												value: "all",
												children: "Toutes les pages"
											}, void 0, false, {
												fileName: _jsxFileName$4,
												lineNumber: 319,
												columnNumber: 937
											}, this),
											/* @__PURE__ */ jsxDEV("option", {
												value: "bookmarks",
												children: "Signets"
											}, void 0, false, {
												fileName: _jsxFileName$4,
												lineNumber: 319,
												columnNumber: 982
											}, this),
											/* @__PURE__ */ jsxDEV("option", {
												value: "pdf",
												children: "Pages PDF"
											}, void 0, false, {
												fileName: _jsxFileName$4,
												lineNumber: 319,
												columnNumber: 1024
											}, this),
											/* @__PURE__ */ jsxDEV("option", {
												value: "content",
												children: "Avec contenu"
											}, void 0, false, {
												fileName: _jsxFileName$4,
												lineNumber: 319,
												columnNumber: 1062
											}, this)
										]
									}, void 0, true, {
										fileName: _jsxFileName$4,
										lineNumber: 319,
										columnNumber: 814
									}, this)
								]
							}, void 0, true, {
								fileName: _jsxFileName$4,
								lineNumber: 319,
								columnNumber: 88
							}, this),
							!filteredPages.length && /* @__PURE__ */ jsxDEV("p", { children: "Aucune page dans ce filtre." }, void 0, false, {
								fileName: _jsxFileName$4,
								lineNumber: 319,
								columnNumber: 1146
							}, this),
							filteredPages.map((p) => {
								const i = doc.pages.findIndex((item) => item.id === p.id);
								return /* @__PURE__ */ jsxDEV("div", {
									"data-page-entry": p.id,
									className: page.id === p.id ? "paper-page-entry active" : "paper-page-entry",
									children: [/* @__PURE__ */ jsxDEV("button", {
										className: "paper-thumbnail",
										"aria-label": `Ouvrir la page ${i + 1}`,
										"aria-pressed": page.id === p.id,
										onClick: () => {
											setPageId(p.id);
											setSelected([]);
										},
										children: [/* @__PURE__ */ jsxDEV(PaperPagePreview, {
											document: doc,
											page: p,
											media
										}, void 0, false, {
											fileName: _jsxFileName$4,
											lineNumber: 319,
											columnNumber: 1524
										}, this), /* @__PURE__ */ jsxDEV("span", { children: [p.bookmark ? "★ " : "", i + 1] }, void 0, true, {
											fileName: _jsxFileName$4,
											lineNumber: 319,
											columnNumber: 1581
										}, this)]
									}, void 0, true, {
										fileName: _jsxFileName$4,
										lineNumber: 319,
										columnNumber: 1372
									}, this), /* @__PURE__ */ jsxDEV("div", { children: [/* @__PURE__ */ jsxDEV("button", {
										"aria-label": `Déplacer la page ${i + 1} vers le haut`,
										disabled: disabled || pageBusy || i === 0,
										onClick: () => {
											const ids = doc.pages.map((p) => p.id);
											[ids[i - 1], ids[i]] = [ids[i], ids[i - 1]];
											modifyPages({
												type: "reorder-pages",
												ids
											});
										},
										children: /* @__PURE__ */ jsxDEV(ChevronLeft, {}, void 0, false, {
											fileName: _jsxFileName$4,
											lineNumber: 319,
											columnNumber: 1861
										}, this)
									}, void 0, false, {
										fileName: _jsxFileName$4,
										lineNumber: 319,
										columnNumber: 1633
									}, this), /* @__PURE__ */ jsxDEV("button", {
										"aria-label": `Déplacer la page ${i + 1} vers le bas`,
										disabled: disabled || pageBusy || i === doc.pages.length - 1,
										onClick: () => {
											const ids = doc.pages.map((p) => p.id);
											[ids[i], ids[i + 1]] = [ids[i + 1], ids[i]];
											modifyPages({
												type: "reorder-pages",
												ids
											});
										},
										children: /* @__PURE__ */ jsxDEV(ChevronRight, {}, void 0, false, {
											fileName: _jsxFileName$4,
											lineNumber: 319,
											columnNumber: 2128
										}, this)
									}, void 0, false, {
										fileName: _jsxFileName$4,
										lineNumber: 319,
										columnNumber: 1884
									}, this)] }, void 0, true, {
										fileName: _jsxFileName$4,
										lineNumber: 319,
										columnNumber: 1628
									}, this)]
								}, p.id, true, {
									fileName: _jsxFileName$4,
									lineNumber: 319,
									columnNumber: 1261
								}, this);
							}),
							/* @__PURE__ */ jsxDEV("select", {
								"aria-label": "Papier de la page",
								value: page.pattern,
								disabled,
								onChange: (e) => commit({
									type: "update-page",
									page: {
										...page,
										pattern: e.target.value
									}
								}),
								children: [
									/* @__PURE__ */ jsxDEV("option", {
										value: "plain",
										children: "Uni"
									}, void 0, false, {
										fileName: _jsxFileName$4,
										lineNumber: 320,
										columnNumber: 187
									}, this),
									/* @__PURE__ */ jsxDEV("option", {
										value: "ruled",
										children: "Ligné"
									}, void 0, false, {
										fileName: _jsxFileName$4,
										lineNumber: 320,
										columnNumber: 221
									}, this),
									/* @__PURE__ */ jsxDEV("option", {
										value: "grid",
										children: "Quadrillé"
									}, void 0, false, {
										fileName: _jsxFileName$4,
										lineNumber: 320,
										columnNumber: 257
									}, this),
									/* @__PURE__ */ jsxDEV("option", {
										value: "dots",
										children: "Pointillé"
									}, void 0, false, {
										fileName: _jsxFileName$4,
										lineNumber: 320,
										columnNumber: 296
									}, this)
								]
							}, void 0, true, {
								fileName: _jsxFileName$4,
								lineNumber: 320,
								columnNumber: 2
							}, this),
							/* @__PURE__ */ jsxDEV(PaperPageSettings, {
								document: doc,
								page,
								disabled,
								onCommit: commit,
								onNotice: paper.setNotice
							}, page.id, false, {
								fileName: _jsxFileName$4,
								lineNumber: 321,
								columnNumber: 2
							}, this),
							/* @__PURE__ */ jsxDEV(Suspense, {
								fallback: /* @__PURE__ */ jsxDEV("p", { children: "Ouverture des modèles…" }, void 0, false, {
									fileName: _jsxFileName$4,
									lineNumber: 321,
									columnNumber: 148
								}, this),
								children: /* @__PURE__ */ jsxDEV(PaperPersonalTemplates, {
									document: doc,
									pageId: page.id,
									media,
									disabled: disabled || pageBusy,
									onUse: usePersonalTemplate,
									onNotice: paper.setNotice,
									onExport: (blob, name) => savePaperExport(blob, name, "template")
								}, void 0, false, {
									fileName: _jsxFileName$4,
									lineNumber: 321,
									columnNumber: 179
								}, this)
							}, void 0, false, {
								fileName: _jsxFileName$4,
								lineNumber: 321,
								columnNumber: 128
							}, this),
							page.pdf && /* @__PURE__ */ jsxDEV("button", {
								"aria-pressed": pdfOutline,
								onClick: () => setPdfOutline((v) => !v),
								children: "Sommaire PDF"
							}, void 0, false, {
								fileName: _jsxFileName$4,
								lineNumber: 322,
								columnNumber: 13
							}, this),
							/* @__PURE__ */ jsxDEV("label", {
								className: "paper-option",
								children: ["Papier", /* @__PURE__ */ jsxDEV("input", {
									type: "color",
									"aria-label": "Couleur du papier",
									value: page.color,
									disabled,
									onChange: (e) => commit({
										type: "update-page",
										page: {
											...page,
											color: e.target.value
										}
									})
								}, void 0, false, {
									fileName: _jsxFileName$4,
									lineNumber: 323,
									columnNumber: 40
								}, this)]
							}, void 0, true, {
								fileName: _jsxFileName$4,
								lineNumber: 323,
								columnNumber: 2
							}, this),
							/* @__PURE__ */ jsxDEV("button", {
								"aria-label": "Tourner la page vers la droite",
								disabled,
								onClick: () => commit(rotatePaperPage(doc, page.id, 1)),
								children: [/* @__PURE__ */ jsxDEV(RotateCw, {}, void 0, false, {
									fileName: _jsxFileName$4,
									lineNumber: 324,
									columnNumber: 127
								}, this), "Tourner"]
							}, void 0, true, {
								fileName: _jsxFileName$4,
								lineNumber: 324,
								columnNumber: 2
							}, this),
							/* @__PURE__ */ jsxDEV("button", {
								disabled,
								onClick: () => commit({
									type: "update-page",
									page: {
										...page,
										bookmark: !page.bookmark
									}
								}),
								children: [/* @__PURE__ */ jsxDEV(Bookmark, {}, void 0, false, {
									fileName: _jsxFileName$4,
									lineNumber: 325,
									columnNumber: 112
								}, this), page.bookmark ? "Retirer le signet" : "Marquer la page"]
							}, void 0, true, {
								fileName: _jsxFileName$4,
								lineNumber: 325,
								columnNumber: 2
							}, this),
							/* @__PURE__ */ jsxDEV("button", {
								disabled: disabled || pageBusy,
								onClick: () => void duplicatePage(),
								children: [/* @__PURE__ */ jsxDEV(Copy, {}, void 0, false, {
									fileName: _jsxFileName$4,
									lineNumber: 325,
									columnNumber: 258
								}, this), "Dupliquer"]
							}, void 0, true, {
								fileName: _jsxFileName$4,
								lineNumber: 325,
								columnNumber: 185
							}, this),
							/* @__PURE__ */ jsxDEV("button", {
								disabled: disabled || pageBusy || doc.pages.length === 1,
								onClick: () => void modifyPages({
									type: "remove-page",
									id: page.id
								}),
								children: [/* @__PURE__ */ jsxDEV(Trash2, {}, void 0, false, {
									fileName: _jsxFileName$4,
									lineNumber: 325,
									columnNumber: 407
								}, this), "Supprimer la page"]
							}, void 0, true, {
								fileName: _jsxFileName$4,
								lineNumber: 325,
								columnNumber: 283
							}, this)
						]
					}, void 0, true, {
						fileName: _jsxFileName$4,
						lineNumber: 319,
						columnNumber: 12
					}, this),
					pdfOutline && page.pdf && doc.assets.find((a) => a.id === page.pdf.assetId) && /* @__PURE__ */ jsxDEV(PaperPdfOutline, {
						asset: doc.assets.find((a) => a.id === page.pdf.assetId),
						media,
						onPage: goPdfPage,
						onClose: () => setPdfOutline(false)
					}, void 0, false, {
						fileName: _jsxFileName$4,
						lineNumber: 326,
						columnNumber: 71
					}, this),
					/* @__PURE__ */ jsxDEV("div", {
						className: `paper-viewport ${textOnly ? "is-text-only" : ""}`,
						ref: viewport,
						onScroll: () => {
							if (capture.current || correctionSource.current) cancelInputs();
						},
						onPointerDownCapture: touchDown,
						onPointerMoveCapture: touchMove,
						onPointerUpCapture: (event) => touchEnd(event),
						onPointerCancelCapture: (event) => touchEnd(event, true),
						onLostPointerCapture: (event) => {
							if (event.target === event.currentTarget) touchEnd(event, true);
						},
						children: [selected.length > 0 && !disabled && tool === "select" && /* @__PURE__ */ jsxDEV(PaperSelectionTools, {
							document: doc,
							objects,
							selected,
							media,
							pageId: page.id,
							onCommit: (value) => commandContext ? commandCommit(value, capturePaperNotebookCommandTarget(commandContext)) : false,
							onSelect: (ids) => {
								if (commandContext) commandSelect(ids, capturePaperNotebookCommandTarget(commandContext));
							},
							onCommand: selectionCommand,
							onNotice: paper.setNotice
						}, void 0, false, {
							fileName: _jsxFileName$4,
							lineNumber: 328,
							columnNumber: 50
						}, this), /* @__PURE__ */ jsxDEV("div", {
							className: "paper-page-frame",
							style: {
								width: textOnly ? "100%" : page.width * zoom,
								height: textOnly ? "auto" : page.height * zoom
							},
							children: /* @__PURE__ */ jsxDEV("div", {
								className: "paper-page",
								"data-paper-command-surface": "true",
								onContextMenu: (event) => commandMenu.current?.handleContextMenu(event),
								onPointerUp: (event) => {
									if (smartHighlight && !event.target.closest("button,input,textarea,select,.paper-pdf-text-selection")) smart.deferNative();
								},
								onKeyUp: (event) => {
									if (smartHighlight && event.shiftKey) smart.deferNative();
								},
								style: {
									width: textOnly ? "100%" : page.width,
									height: textOnly ? "auto" : page.height,
									backgroundColor: page.color,
									transform: textOnly ? "none" : `scale(${zoom})`
								},
								children: [
									!page.pdf && /* @__PURE__ */ jsxDEV(PaperBackground, { page }, void 0, false, {
										fileName: _jsxFileName$4,
										lineNumber: 331,
										columnNumber: 14
									}, this),
									smartHighlight && smart.selection && /* @__PURE__ */ jsxDEV("svg", {
										className: "paper-highlight-preview",
										viewBox: `0 0 ${page.width} ${page.height}`,
										"aria-hidden": "true",
										children: smart.selection.fragments.map((fragment, index) => /* @__PURE__ */ jsxDEV("polygon", {
											points: fragment.quad.map((p) => `${p.x},${p.y}`).join(" "),
											fill: smart.color,
											opacity: ".25",
											stroke: "#987500",
											strokeWidth: ".5"
										}, index, false, {
											fileName: _jsxFileName$4,
											lineNumber: 332,
											columnNumber: 190
										}, this))
									}, void 0, false, {
										fileName: _jsxFileName$4,
										lineNumber: 332,
										columnNumber: 36
									}, this),
									page.pdf && doc.assets.find((a) => a.id === page.pdf.assetId) && /* @__PURE__ */ jsxDEV(Suspense, {
										fallback: /* @__PURE__ */ jsxDEV("p", { children: "Ouverture du PDF…" }, void 0, false, {
											fileName: _jsxFileName$4,
											lineNumber: 333,
											columnNumber: 79
										}, this),
										children: /* @__PURE__ */ jsxDEV(PaperPdfPage$1, {
											page,
											asset: doc.assets.find((a) => a.id === page.pdf.assetId),
											document: doc,
											media,
											linksEnabled: tool === "text" && !smartHighlight,
											current: pdfViewCurrent,
											textSelectionEnabled: smartHighlight && !textOnly && !disabled,
											onSelectionChange: smart.pdfSelection,
											onHighlight: smart.pdfHighlight,
											onNavigate: goPdfPage
										}, void 0, false, {
											fileName: _jsxFileName$4,
											lineNumber: 333,
											columnNumber: 105
										}, this)
									}, void 0, false, {
										fileName: _jsxFileName$4,
										lineNumber: 333,
										columnNumber: 59
									}, this),
									objects.filter((o) => o.kind !== "ink" && o.kind !== "shape").map((o) => {
										const isText = o.kind === "text" || o.kind === "sticky";
										const editing = isText && tool === "text" && !smartHighlight && selected.includes(o.id) && !disabled && !o.locked;
										const asset = doc.assets.find((a) => a.id === o.assetId);
										return /* @__PURE__ */ jsxDEV("div", {
											"data-object": o.id,
											className: `paper-object paper-${o.kind} ${selected.includes(o.id) ? "is-selected" : ""} ${editing ? "is-editing" : ""} ${o.kind === "text" ? "has-text-flow" : ""}`,
											style: textOnly ? {
												position: "relative",
												margin: "16px",
												background: o.kind === "sticky" ? o.color : void 0
											} : {
												left: o.x + (drag.current && selected.includes(o.id) ? dragDelta.x : 0),
												top: o.y + (drag.current && selected.includes(o.id) ? dragDelta.y : 0),
												width: o.width,
												minHeight: o.height,
												height: o.kind === "sticky" ? o.height : void 0,
												color: o.kind === "text" ? o.color : void 0,
												zIndex: editing ? 100 : o.z + 1,
												transform: paperObjectCssTransform(o),
												background: o.kind === "sticky" ? o.color : void 0,
												pointerEvents: tool === "text" || smartHighlight ? "auto" : "none"
											},
											onClick: () => {
												if (tool === "text" && isText) setSelected([o.id]);
											},
											children: [o.audioAnchor && /* @__PURE__ */ jsxDEV("button", {
												className: "paper-audio-anchor",
												"aria-label": `Écouter ce passage à ${Math.floor(o.audioAnchor.time / 60)}:${String(Math.floor(o.audioAnchor.time % 60)).padStart(2, "0")}`,
												onClick: (event) => {
													event.stopPropagation();
													if (o.audioAnchor) seekAudio(o.audioAnchor);
												},
												children: [/* @__PURE__ */ jsxDEV(Volume2, {}, void 0, false, {
													fileName: _jsxFileName$4,
													lineNumber: 338,
													columnNumber: 277
												}, this), /* @__PURE__ */ jsxDEV("span", { children: [
													Math.floor(o.audioAnchor.time / 60),
													":",
													String(Math.floor(o.audioAnchor.time % 60)).padStart(2, "0")
												] }, void 0, true, {
													fileName: _jsxFileName$4,
													lineNumber: 338,
													columnNumber: 287
												}, this)]
											}, void 0, true, {
												fileName: _jsxFileName$4,
												lineNumber: 338,
												columnNumber: 18
											}, this), o.kind === "text" ? /* @__PURE__ */ jsxDEV(PaperTextFlowView, {
												object: o,
												document: doc,
												media,
												pageId: page.id,
												continuous: textOnly,
												onLayout: (source, breaks, offsets) => reflow(o.id, source, breaks, offsets),
												onNotice: paper.setNotice,
												children: editing ? /* @__PURE__ */ jsxDEV(Suspense, {
													fallback: /* @__PURE__ */ jsxDEV("p", {
														className: "markdown-editor-loading",
														children: "Ouverture du texte…"
													}, void 0, false, {
														fileName: _jsxFileName$4,
														lineNumber: 339,
														columnNumber: 244
													}, this),
													children: /* @__PURE__ */ jsxDEV(MarkdownNoteEditor, {
														flowEditing: true,
														onCaretPosition: (y) => flowCaret(o.id, y),
														noteId: `${noteId}-${o.id}`,
														initialMarkdown: o.markdown ?? "",
														externalMarkdown: o.markdown ?? "",
														media,
														documentSnapshot: doc,
														onUploadImage: uploadInlineImage,
														onChange: (value, baseline) => {
															const result = paper.textChange(o.id, value, baseline);
															if (!result) return false;
															authored([result.objectId ?? o.id]);
															if (result.recovered) {
																setPageId(result.pageId);
																setSelected([result.objectId]);
															}
															return result.editorBaseline;
														}
													}, `${o.id}|${o.textPartition ?? "continuous"}`, false, {
														fileName: _jsxFileName$4,
														lineNumber: 339,
														columnNumber: 308
													}, this)
												}, void 0, false, {
													fileName: _jsxFileName$4,
													lineNumber: 339,
													columnNumber: 224
												}, this) : void 0
											}, void 0, false, {
												fileName: _jsxFileName$4,
												lineNumber: 339,
												columnNumber: 19
											}, this) : isText && editing ? /* @__PURE__ */ jsxDEV(Suspense, {
												fallback: /* @__PURE__ */ jsxDEV("p", { children: "Ouverture du texte…" }, void 0, false, {
													fileName: _jsxFileName$4,
													lineNumber: 339,
													columnNumber: 923
												}, this),
												children: /* @__PURE__ */ jsxDEV(MarkdownNoteEditor, {
													noteId: `${noteId}-${o.id}`,
													initialMarkdown: o.markdown ?? "",
													externalMarkdown: o.markdown ?? "",
													media,
													documentSnapshot: doc,
													onUploadImage: uploadInlineImage,
													onChange: (value, baseline) => {
														const changed = paper.textChange(o.id, value, baseline);
														if (changed) authored([changed.objectId ?? o.id]);
														return changed?.editorBaseline ?? false;
													}
												}, `${o.id}|${o.textPartition ?? "continuous"}`, false, {
													fileName: _jsxFileName$4,
													lineNumber: 339,
													columnNumber: 951
												}, this)
											}, void 0, false, {
												fileName: _jsxFileName$4,
												lineNumber: 339,
												columnNumber: 903
											}, this) : isText ? /* @__PURE__ */ jsxDEV("div", {
												className: "paper-selectable-text-source",
												children: /* @__PURE__ */ jsxDEV(PaperRichText, {
													markdown: o.markdown || "Commencez à écrire…",
													document: doc,
													media
												}, void 0, false, {
													fileName: _jsxFileName$4,
													lineNumber: 339,
													columnNumber: 1421
												}, this)
											}, void 0, false, {
												fileName: _jsxFileName$4,
												lineNumber: 339,
												columnNumber: 1375
											}, this) : asset ? /* @__PURE__ */ jsxDEV(PaperAssetImage, {
												asset,
												document: doc,
												media,
												onError: paper.setNotice
											}, void 0, false, {
												fileName: _jsxFileName$4,
												lineNumber: 339,
												columnNumber: 1524
											}, this) : null]
										}, o.id, true, {
											fileName: _jsxFileName$4,
											lineNumber: 337,
											columnNumber: 9
										}, this);
									}),
									!textOnly && objects.filter((o) => o.kind === "ink" || o.kind === "shape").map((o) => /* @__PURE__ */ jsxDEV("div", {
										className: "paper-object paper-vector",
										style: {
											left: o.x + (drag.current && selected.includes(o.id) ? dragDelta.x : 0),
											top: o.y + (drag.current && selected.includes(o.id) ? dragDelta.y : 0),
											width: o.width,
											height: o.height,
											zIndex: o.z + 1,
											transform: paperObjectCssTransform(o),
											pointerEvents: "none"
										},
										children: /* @__PURE__ */ jsxDEV(PaperObjectVisual, {
											object: o,
											document: doc,
											media
										}, void 0, false, {
											fileName: _jsxFileName$4,
											lineNumber: 342,
											columnNumber: 363
										}, this)
									}, o.id, false, {
										fileName: _jsxFileName$4,
										lineNumber: 342,
										columnNumber: 73
									}, this)),
									!textOnly && /* @__PURE__ */ jsxDEV("svg", {
										ref: svg,
										className: `paper-ink ${tool === "text" ? "text-mode" : ""}`,
										tabIndex: 0,
										"data-paper-command-surface": "true",
										onContextMenu: (event) => commandMenu.current?.handleContextMenu(event),
										style: {
											zIndex: tool === "text" ? 80 : 200,
											pointerEvents: smartHighlight ? "none" : void 0,
											touchAction: tool === "text" ? "pan-x pan-y pinch-zoom" : "none"
										},
										viewBox: `0 0 ${page.width} ${page.height}`,
										onPointerDown: down,
										onPointerMove: move,
										onPointerUp: (e) => finish(e),
										onPointerCancel: (e) => finish(e, true),
										onLostPointerCapture: (e) => {
											if (capture.current?.stroke.pointerId === e.pointerId) finish(e, true);
										},
										onDoubleClick: (e) => {
											const id = e.target.closest("[data-object]")?.getAttribute("data-object");
											const object = objects.find((o) => o.id === id);
											if (object?.audioAnchor) seekAudio(object.audioAnchor);
										},
										"aria-label": "Page de dessin",
										children: [
											objects.map((o) => {
												const dx = drag.current && selected.includes(o.id) ? dragDelta.x : 0, dy = drag.current && selected.includes(o.id) ? dragDelta.y : 0;
												const transform = paperObjectSvgTransform(o, o.x + dx, o.y + dy);
												return /* @__PURE__ */ jsxDEV("g", {
													transform,
													"data-object": o.id,
													children: [o.kind === "ink" ? /* @__PURE__ */ jsxDEV("path", {
														d: inkOutline(o.points ?? [], o.strokeWidth ?? 3, o.pen === "highlighter"),
														fill: "transparent"
													}, void 0, false, {
														fileName: _jsxFileName$4,
														lineNumber: 347,
														columnNumber: 18
													}, this) : o.kind === "shape" ? /* @__PURE__ */ jsxDEV("rect", {
														x: "0",
														y: "0",
														width: o.width,
														height: o.height,
														fill: "transparent",
														stroke: "transparent",
														strokeWidth: o.strokeWidth
													}, void 0, false, {
														fileName: _jsxFileName$4,
														lineNumber: 347,
														columnNumber: 127
													}, this) : tool === "select" ? /* @__PURE__ */ jsxDEV("rect", {
														width: o.width,
														height: o.height,
														fill: "transparent"
													}, void 0, false, {
														fileName: _jsxFileName$4,
														lineNumber: 347,
														columnNumber: 265
													}, this) : null, selected.includes(o.id) && tool === "select" && /* @__PURE__ */ jsxDEV("rect", {
														width: o.width,
														height: o.height,
														fill: "none",
														stroke: "#4461dc",
														strokeWidth: 1.5,
														strokeDasharray: "6 4"
													}, void 0, false, {
														fileName: _jsxFileName$4,
														lineNumber: 348,
														columnNumber: 45
													}, this)]
												}, o.id, true, {
													fileName: _jsxFileName$4,
													lineNumber: 346,
													columnNumber: 9
												}, this);
											}),
											loupeRegion && samePaperWritingLoupeOwner(loupeRegion.owner, loupeOwner()) && /* @__PURE__ */ jsxDEV(PaperWritingLoupeTarget, { region: loupeRegion.region }, void 0, false, {
												fileName: _jsxFileName$4,
												lineNumber: 351,
												columnNumber: 76
											}, this),
											aids.value.guide.enabled && inkContext() && /* @__PURE__ */ jsxDEV(PaperDrawingGuide, {
												guide: aids.value.guide,
												context: inkContext(),
												disabled,
												onChange: updateGuide
											}, `${renderedOwner}|${inkEpoch}`, false, {
												fileName: _jsxFileName$4,
												lineNumber: 352,
												columnNumber: 43
											}, this),
											/* @__PURE__ */ jsxDEV(PaperInkPreview, { ref: inkPreview }, void 0, false, {
												fileName: _jsxFileName$4,
												lineNumber: 353,
												columnNumber: 2
											}, this)
										]
									}, void 0, true, {
										fileName: _jsxFileName$4,
										lineNumber: 343,
										columnNumber: 14
									}, this)
								]
							}, void 0, true, {
								fileName: _jsxFileName$4,
								lineNumber: 330,
								columnNumber: 2
							}, this)
						}, void 0, false, {
							fileName: _jsxFileName$4,
							lineNumber: 329,
							columnNumber: 2
						}, this)]
					}, void 0, true, {
						fileName: _jsxFileName$4,
						lineNumber: 327,
						columnNumber: 2
					}, this),
					studyOpen && /* @__PURE__ */ jsxDEV(Suspense, {
						fallback: /* @__PURE__ */ jsxDEV("p", { children: "Ouverture des révisions…" }, void 0, false, {
							fileName: _jsxFileName$4,
							lineNumber: 355,
							columnNumber: 52
						}, this),
						children: /* @__PURE__ */ jsxDEV(PaperStudyPanel, {
							document: doc,
							media,
							disabled,
							onCommit: commit,
							onPage: (id) => {
								if (doc.pages.some((p) => p.id === id)) {
									setPageId(id);
									setSelected([]);
								}
							},
							onClose: () => setStudyOpen(false),
							onNotice: paper.setNotice
						}, void 0, false, {
							fileName: _jsxFileName$4,
							lineNumber: 355,
							columnNumber: 85
						}, this)
					}, void 0, false, {
						fileName: _jsxFileName$4,
						lineNumber: 355,
						columnNumber: 32
					}, this)
				]
			}, void 0, true, {
				fileName: _jsxFileName$4,
				lineNumber: 318,
				columnNumber: 598
			}, this),
			aidsOpen && !textOnly && /* @__PURE__ */ jsxDEV("div", {
				className: "paper-writing-aids-panel",
				children: [/* @__PURE__ */ jsxDEV("header", { children: [/* @__PURE__ */ jsxDEV("strong", { children: "Règle et maintien" }, void 0, false, {
					fileName: _jsxFileName$4,
					lineNumber: 356,
					columnNumber: 74
				}, this), /* @__PURE__ */ jsxDEV("button", {
					type: "button",
					"aria-label": "Fermer règle et maintien",
					onClick: () => {
						if (editable()) setAidsOpen(false);
					},
					children: "×"
				}, void 0, false, {
					fileName: _jsxFileName$4,
					lineNumber: 356,
					columnNumber: 108
				}, this)] }, void 0, true, {
					fileName: _jsxFileName$4,
					lineNumber: 356,
					columnNumber: 66
				}, this), /* @__PURE__ */ jsxDEV(PaperDrawingGuideControls, {
					guide: aids.value.guide,
					hold: aids.value.hold,
					pageWidth: page.width,
					pageHeight: page.height,
					context: inkContext() ?? void 0,
					disabled: disabled || !aids.ready,
					onGuideChange: updateGuide,
					onHoldChange: updateHold,
					candidate: shapeProposal?.candidate,
					onAcceptShape: shapeProposal ? applyProposal : void 0,
					onRestoreOriginal: originalRestore ? restoreOriginal : void 0
				}, `${renderedOwner}|${inkEpoch}`, false, {
					fileName: _jsxFileName$4,
					lineNumber: 356,
					columnNumber: 237
				}, this)]
			}, void 0, true, {
				fileName: _jsxFileName$4,
				lineNumber: 356,
				columnNumber: 24
			}, this),
			loupeOpen && !textOnly && /* @__PURE__ */ jsxDEV(PaperWritingLoupe, {
				ref: loupe,
				document: doc,
				page,
				media,
				ownershipKey: renderedOwner,
				generation: inkEpoch,
				currentOwner: loupeOwner,
				tool: tool === "text" ? "pen" : tool,
				style: {
					color,
					width,
					opacity,
					strokeStyle
				},
				fingerInk,
				disabled,
				initialZoom: aids.value.loupe.zoom,
				options: aids.value.loupe.options,
				onOptionsChange: (options) => {
					if (editable()) aids.change({ loupe: { options } });
				},
				onZoomChange: (zoom) => {
					if (editable()) aids.change({ loupe: { zoom } });
				},
				previewStroke: previewLoupe,
				renderOverlay: (context) => aids.value.guide.enabled ? /* @__PURE__ */ jsxDEV(PaperDrawingGuide, {
					guide: aids.value.guide,
					context,
					disabled,
					onChange: updateGuide
				}, void 0, false, {
					fileName: _jsxFileName$4,
					lineNumber: 357,
					columnNumber: 627
				}, this) : null,
				onInputCancel: () => {
					if (correctionSource.current === "loupe") {
						correction.current.cancel();
						correctionSource.current = null;
					}
				},
				onStroke: finishLoupe,
				onPreview: (stroke, style) => {
					if (editable()) inkPreview.current?.paint(stroke, style);
				},
				onRegionChange: (region, owner) => {
					if (owner.ownershipKey !== renderedOwner || exportScope.current !== renderedOwner || owner.generation !== inkEpoch) return;
					setLoupeRegion(region ? {
						region,
						owner
					} : null);
				},
				onUndo: () => {
					if (editable()) {
						cancelInputs();
						flushText();
						paper.travel("undo");
					}
				},
				onRedo: () => {
					if (editable()) {
						cancelInputs();
						flushText();
						paper.travel("redo");
					}
				},
				canUndo: paper.canUndo,
				canRedo: paper.canRedo,
				onClose: () => {
					if (editable()) {
						setLoupeOpen(false);
						setLoupeRegion(null);
					}
				}
			}, `${renderedOwner}|${inkEpoch}`, false, {
				fileName: _jsxFileName$4,
				lineNumber: 357,
				columnNumber: 25
			}, this),
			/* @__PURE__ */ jsxDEV("footer", {
				className: "paper-status",
				children: [/* @__PURE__ */ jsxDEV("span", {
					role: "status",
					children: paper.notice || aids.notice || toolPreferences.notice || (paper.saved ? "Enregistrée sur cet appareil" : "Enregistrement…")
				}, void 0, false, {
					fileName: _jsxFileName$4,
					lineNumber: 358,
					columnNumber: 35
				}, this), /* @__PURE__ */ jsxDEV("div", { children: [
					/* @__PURE__ */ jsxDEV("button", {
						"aria-label": "Réduire le zoom",
						disabled: zoom <= .4,
						onClick: () => {
							cancelInputs();
							manualZoom.current = true;
							setZoom((z) => Math.max(.3, z - .1));
						},
						children: /* @__PURE__ */ jsxDEV(ZoomOut, {}, void 0, false, {
							fileName: _jsxFileName$4,
							lineNumber: 358,
							columnNumber: 329
						}, this)
					}, void 0, false, {
						fileName: _jsxFileName$4,
						lineNumber: 358,
						columnNumber: 183
					}, this),
					/* @__PURE__ */ jsxDEV("button", {
						"aria-label": "Ajuster à la largeur",
						onClick: () => {
							cancelInputs();
							manualZoom.current = false;
							if (viewport.current) setZoom(Math.max(.3, Math.min(1.5, (viewport.current.clientWidth - (parseFloat(getComputedStyle(viewport.current).paddingLeft) || 0) - (parseFloat(getComputedStyle(viewport.current).paddingRight) || 0) - 1) / page.width)));
						},
						children: [
							" ",
							Math.round(zoom * 100),
							" % "
						]
					}, void 0, true, {
						fileName: _jsxFileName$4,
						lineNumber: 358,
						columnNumber: 348
					}, this),
					/* @__PURE__ */ jsxDEV("button", {
						"aria-label": "Augmenter le zoom",
						disabled: zoom >= 2,
						onClick: () => {
							cancelInputs();
							manualZoom.current = true;
							setZoom((z) => Math.min(2, z + .1));
						},
						children: /* @__PURE__ */ jsxDEV(ZoomIn, {}, void 0, false, {
							fileName: _jsxFileName$4,
							lineNumber: 358,
							columnNumber: 856
						}, this)
					}, void 0, false, {
						fileName: _jsxFileName$4,
						lineNumber: 358,
						columnNumber: 712
					}, this),
					/* @__PURE__ */ jsxDEV("span", { children: [
						"Page ",
						doc.pages.indexOf(page) + 1,
						" / ",
						doc.pages.length
					] }, void 0, true, {
						fileName: _jsxFileName$4,
						lineNumber: 358,
						columnNumber: 874
					}, this)
				] }, void 0, true, {
					fileName: _jsxFileName$4,
					lineNumber: 358,
					columnNumber: 178
				}, this)]
			}, void 0, true, {
				fileName: _jsxFileName$4,
				lineNumber: 358,
				columnNumber: 2
			}, this)
		]
	}, void 0, true, {
		fileName: _jsxFileName$4,
		lineNumber: 301,
		columnNumber: 9
	}, this);
}
//#endregion
//#region src/lib/paperPdfTextSelection.ts
var finiteBox = (box) => [
	box.left,
	box.top,
	box.width,
	box.height
].every(Number.isFinite) && box.width > 0 && box.height > 0;
function paperPdfGuidedRanges(items, anchor, focus) {
	for (const point of [anchor, focus]) if (!Number.isSafeInteger(point.itemIndex) || !Number.isSafeInteger(point.offset) || point.itemIndex < 0 || point.itemIndex >= items.length || point.offset < 0 || point.offset > items[point.itemIndex].str.length) throw Error("Choisissez un début et une fin dans le texte de cette page.");
	const [start, end] = anchor.itemIndex < focus.itemIndex || anchor.itemIndex === focus.itemIndex && anchor.offset <= focus.offset ? [anchor, focus] : [focus, anchor], ranges = [];
	for (let index = start.itemIndex; index <= end.itemIndex; index++) {
		const from = index === start.itemIndex ? start.offset : 0, to = index === end.itemIndex ? end.offset : items[index].str.length;
		if (to > from) {
			ranges.push({
				itemIndex: index,
				from,
				to
			});
			if (ranges.length > 1e3) throw Error("Sélectionnez ce passage en parties plus courtes.");
		}
	}
	return ranges;
}
/** A run keeps its own oriented glyph rectangle. Selection never bridges a
* line/column gap, and no pointer pressure/tilt/timestamp is manufactured. */
function paperPdfGlyphFragment(item, itemIndex, from, to, geometry, fullPageBox, fullGlyphBox, selectedGlyphBox, scaleX = 1, minFontSize = 1) {
	if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to) || from < 0 || to > item.str.length || to <= from || !finiteBox(fullPageBox) || !finiteBox(fullGlyphBox) || !finiteBox(selectedGlyphBox) || ![scaleX, minFontSize].every((value) => Number.isFinite(value) && value > 0) || geometry.transform.length !== 6 || item.transform.length !== 6 || !geometry.transform.every(Number.isFinite) || !item.transform.every(Number.isFinite)) return void 0;
	const [a, b, c, d] = geometry.transform, [x, y, nx, ny] = item.transform, basis = {
		x: a * x + c * y,
		y: b * x + d * y
	}, normal = {
		x: a * nx + c * ny,
		y: b * nx + d * ny
	}, basisLength = Math.hypot(basis.x, basis.y), normalLength = Math.hypot(normal.x, normal.y);
	if (!(basisLength > 0 && normalLength > 0) || Math.abs((basis.x * normal.x + basis.y * normal.y) / (basisLength * normalLength)) > 1e-4) return void 0;
	const angle = Math.atan2(basis.y, basis.x) + (geometry.styles[item.fontName]?.vertical ? Math.PI / 2 : 0), u = {
		x: Math.cos(angle),
		y: Math.sin(angle)
	}, n = {
		x: -u.y,
		y: u.x
	}, length = fullGlyphBox.width * scaleX / minFontSize, thickness = selectedGlyphBox.height / minFontSize, fullHeight = fullGlyphBox.height / minFontSize, centre = {
		x: fullPageBox.left + fullPageBox.width / 2,
		y: fullPageBox.top + fullPageBox.height / 2
	}, origin = {
		x: centre.x - u.x * length / 2 - n.x * fullHeight / 2,
		y: centre.y - u.y * length / 2 - n.y * fullHeight / 2
	}, advance = (selectedGlyphBox.left - fullGlyphBox.left) * scaleX / minFontSize, down = (selectedGlyphBox.top - fullGlyphBox.top) / minFontSize, width = selectedGlyphBox.width * scaleX / minFontSize;
	const point = (along, across) => ({
		x: origin.x + u.x * along + n.x * across,
		y: origin.y + u.y * along + n.y * across
	}), quad = [
		point(advance, down),
		point(advance + width, down),
		point(advance + width, down + thickness),
		point(advance, down + thickness)
	], epsilon = .75;
	if (!quad.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= -.75 && p.x <= geometry.width + epsilon && p.y >= -.75 && p.y <= geometry.height + epsilon) || !(width > 0 && thickness > 0)) return void 0;
	return {
		itemIndex,
		from,
		to,
		text: item.str.slice(from, to),
		quad,
		start: point(advance, down + thickness / 2),
		end: point(advance + width, down + thickness / 2),
		thickness
	};
}
/** Exact DOM positions, not text searches: repeated words stay distinct. */
function paperPdfSelectedRanges(selection, divs, items, limit = 1e3) {
	if (selection.isCollapsed || !selection.rangeCount) return [];
	if (divs.length !== items.length || divs.length > 2e4 || selection.rangeCount > 32) throw Error("Cette page contient trop de texte pour une sélection guidée immédiate.");
	const result = [];
	for (let index = 0; index < divs.length; index++) {
		const div = divs[index];
		if (!items[index].str || !div.isConnected || div.textContent !== items[index].str) continue;
		const text = div.firstChild;
		if (!text || text.nodeType !== 3 || div.childNodes.length !== 1) continue;
		for (let r = 0; r < selection.rangeCount; r++) {
			const selected = selection.getRangeAt(r);
			if (!selected.intersectsNode(div)) continue;
			const full = div.ownerDocument.createRange();
			full.selectNodeContents(div);
			const clipped = selected.cloneRange();
			if (clipped.compareBoundaryPoints(0, full) < 0) clipped.setStart(text, 0);
			if (clipped.compareBoundaryPoints(2, full) > 0) clipped.setEnd(text, items[index].str.length);
			const before = div.ownerDocument.createRange();
			before.setStart(text, 0);
			before.setEnd(clipped.startContainer, clipped.startOffset);
			const from = before.toString().length, to = from + clipped.toString().length;
			before.detach();
			full.detach();
			clipped.detach();
			if (to > from) {
				result.push({
					itemIndex: index,
					from,
					to
				});
				if (result.length > limit) throw Error("Sélectionnez ce passage en parties plus courtes.");
			}
		}
	}
	return result;
}
/** Detached typography only: no source TextLayer node, user selection or
* viewport is modified while measuring shaped/RTL/ligature character ranges. */
function measurePaperPdfGlyphRanges(frame, divs, items, ranges, geometry) {
	const frameBox = frame.getBoundingClientRect(), zoomX = frameBox.width / geometry.width, zoomY = frameBox.height / geometry.height;
	if (!(zoomX > 0 && zoomY > 0)) return [];
	const host = frame.ownerDocument.createElement("div");
	host.style.cssText = "position:fixed;left:-30000px;top:0;pointer-events:none;white-space:pre;";
	frame.ownerDocument.body.append(host);
	try {
		const fragments = [];
		for (const selection of ranges) {
			const span = divs[selection.itemIndex], item = items[selection.itemIndex];
			if (!span || !item || span.textContent !== item.str) throw Error("Le texte PDF a changé pendant la sélection.");
			const style = getComputedStyle(span), clone = frame.ownerDocument.createElement("span");
			clone.style.cssText = "display:inline-block;position:relative;white-space:pre;transform:none;";
			clone.style.font = style.font;
			clone.style.lineHeight = style.lineHeight;
			clone.style.letterSpacing = style.letterSpacing;
			clone.style.wordSpacing = style.wordSpacing;
			clone.style.fontKerning = style.fontKerning;
			clone.style.fontFeatureSettings = style.fontFeatureSettings;
			clone.dir = span.dir;
			clone.textContent = item.str;
			host.replaceChildren(clone);
			const original = frame.ownerDocument.createRange();
			original.selectNodeContents(span);
			const actual = original.getBoundingClientRect();
			original.detach();
			const full = frame.ownerDocument.createRange();
			full.selectNodeContents(clone);
			const fullGlyph = full.getBoundingClientRect();
			full.detach();
			const selected = frame.ownerDocument.createRange();
			selected.setStart(clone.firstChild, selection.from);
			selected.setEnd(clone.firstChild, selection.to);
			const boxes = [...selected.getClientRects()].filter(finiteBox);
			selected.detach();
			for (const box of boxes) {
				const fragment = paperPdfGlyphFragment(item, selection.itemIndex, selection.from, selection.to, geometry, {
					left: (actual.left - frameBox.left) / zoomX,
					top: (actual.top - frameBox.top) / zoomY,
					width: actual.width / zoomX,
					height: actual.height / zoomY
				}, fullGlyph, box, parseFloat(style.getPropertyValue("--scale-x")) || 1, parseFloat(style.getPropertyValue("--min-font-size")) || 1);
				if (!fragment) throw Error("L’orientation de ce passage PDF demande une sélection libre. Son original reste conservé.");
				fragments.push(fragment);
				if (fragments.length > 1e3) throw Error("Sélectionnez ce passage en parties plus courtes.");
			}
		}
		return fragments;
	} finally {
		host.remove();
	}
}
//#endregion
//#region src/components/PaperPdfTextLayer.tsx
var _jsxFileName$3 = "/home/louis/DowzeBuild/20260923/collections-060/src/components/PaperPdfTextLayer.tsx";
function PaperPdfTextLayer({ page, viewport, source, current, onSelectionChange, onHighlight, command, onStatus }) {
	const frame = useRef(null), container = useRef(null), beginControl = useRef(null), endControl = useRef(null), confirmControl = useRef(null), [rows, setRows] = useState([]), [notice, setNotice] = useState("Chargement du texte PDF…"), [guided, setGuided] = useState(false), [review, setReview] = useState(false), [status, setStatus] = useState("loading"), [preview, setPreview] = useState(null), [begin, setBegin] = useState({
		itemIndex: 0,
		offset: 0
	}), [end, setEnd] = useState({
		itemIndex: 0,
		offset: 0
	}), [controlsBounds, setControlsBounds] = useState({
		left: 8,
		top: 8,
		width: 320,
		maxHeight: 320
	}), runtime = useRef(null), handlers = useRef({
		onSelectionChange,
		onHighlight,
		onStatus
	});
	handlers.current = {
		onSelectionChange,
		onHighlight,
		onStatus
	};
	const latest = useRef({
		source: source.source,
		current
	});
	latest.current = {
		source: source.source,
		current
	};
	const expected = source.source;
	const publish = (ranges) => {
		const state = runtime.current, host = frame.current;
		if (!state?.current() || !host) return;
		try {
			const geometry = {
				width: source.pageWidth,
				height: source.pageHeight,
				transform: viewport.transform,
				styles: state.content.styles
			}, fragments = measurePaperPdfGlyphRanges(host, state.divs, state.items, ranges, geometry);
			if (!state.current()) return;
			const text = ranges.map((range, i) => state.items[range.itemIndex].str.slice(range.from, range.to) + (i < ranges.length - 1 && state.items[range.itemIndex].hasEOL ? "\n" : "")).join(""), selection = fragments.length ? {
				kind: "pdf",
				...source,
				text,
				fragments,
				isCurrent: state.current
			} : null;
			setPreview(selection);
			setReview(!!selection);
			setNotice(selection ? `${fragments.length} fragment${fragments.length > 1 ? "s" : ""} prêt${fragments.length > 1 ? "s" : ""} à surligner.` : "Choisissez un passage du texte PDF.");
			handlers.current.onSelectionChange?.(selection);
		} catch (error) {
			if (state.current()) {
				setNotice(String(error instanceof Error ? error.message : error));
				setPreview(null);
				handlers.current.onSelectionChange?.(null);
			}
		}
	};
	const cancel = () => {
		if (!current() || latest.current.source !== expected) return;
		setPreview(null);
		setReview(false);
		handlers.current.onSelectionChange?.(null);
		setNotice("Sélection annulée.");
		const selection = container.current?.ownerDocument.getSelection();
		if (selection?.anchorNode && container.current?.contains(selection.anchorNode)) selection.removeAllRanges();
	};
	const confirm = () => {
		if (!preview?.isCurrent()) return;
		if (handlers.current.onHighlight?.(preview) !== false) {
			cancel();
			setGuided(false);
		}
	};
	useEffect(() => {
		const body = container.current;
		if (!body) return;
		let stopped = false, layer;
		const live = () => !stopped && latest.current.source === expected && latest.current.current();
		runtime.current = null;
		setStatus("loading");
		setRows([]);
		setPreview(null);
		setNotice("Chargement du texte PDF…");
		handlers.current.onSelectionChange?.(null);
		handlers.current.onStatus?.({ state: "loading" });
		body.replaceChildren();
		const load = async () => {
			try {
				const content = await page.getTextContent({ includeMarkedContent: true });
				if (!live()) return;
				const items = content.items.filter((item) => "str" in item);
				if (items.length > 2e4 || items.reduce((sum, item) => sum + item.str.length, 0) > 2e5) throw Error("Cette page contient trop de texte pour la sélection guidée. Le surligneur libre reste disponible.");
				if (!items.some((item) => item.str.trim())) throw Error("Cette page PDF ne possède pas de texte sélectionnable. Le surligneur libre reste disponible.");
				layer = new TextLayer({
					textContentSource: content,
					container: body,
					viewport
				});
				await layer.render();
				await (body.ownerDocument.fonts?.ready ?? Promise.resolve());
				if (!live()) return;
				if (layer.textDivs.length !== items.length || layer.textContentItemsStr.some((text, i) => text !== items[i].str)) throw Error("Les positions du texte PDF ne correspondent plus à cette page.");
				runtime.current = {
					current: live,
					items,
					divs: layer.textDivs,
					content
				};
				setStatus("ready");
				setRows(items);
				setBegin({
					itemIndex: 0,
					offset: 0
				});
				setEnd({
					itemIndex: Math.min(items.length - 1, 2),
					offset: items[Math.min(items.length - 1, 2)].str.length
				});
				setNotice("Sélectionnez du texte ou choisissez un début et une fin au clavier.");
				handlers.current.onStatus?.({ state: "ready" });
			} catch (error) {
				if (live()) {
					const message = String(error instanceof Error ? error.message : error);
					setStatus("unavailable");
					setNotice(message);
					handlers.current.onStatus?.({
						state: "unavailable",
						message
					});
				}
			}
		};
		load();
		const changed = () => {
			const state = runtime.current, selection = body.ownerDocument.getSelection();
			if (!state?.current() || !selection?.anchorNode || !selection.focusNode || !body.contains(selection.anchorNode) || !body.contains(selection.focusNode)) return;
			try {
				publish(paperPdfSelectedRanges(selection, state.divs, state.items));
			} catch (error) {
				if (state.current()) setNotice(String(error instanceof Error ? error.message : error));
			}
		};
		body.ownerDocument.addEventListener("selectionchange", changed);
		return () => {
			stopped = true;
			runtime.current = null;
			layer?.cancel();
			body.ownerDocument.removeEventListener("selectionchange", changed);
			body.replaceChildren();
		};
	}, [
		expected,
		page,
		viewport
	]);
	useEffect(() => {
		if (!command || !current()) return;
		if (command.type === "cancel") {
			cancel();
			setGuided(false);
		} else if (command.type === "confirm") confirm();
		else if (command.type === "all") {
			const state = runtime.current;
			if (state) publish(paperPdfGuidedRanges(state.items, {
				itemIndex: 0,
				offset: 0
			}, {
				itemIndex: state.items.length - 1,
				offset: state.items.at(-1).str.length
			}));
		} else {
			setReview(false);
			setGuided(true);
			requestAnimationFrame(() => {
				if (current()) (command.type === "start" ? beginControl.current : endControl.current)?.focus();
			});
		}
	}, [command?.id]);
	useEffect(() => {
		const host = frame.current;
		if (!host) return;
		const position = () => {
			const box = (host.closest(".paper-viewport") ?? host).getBoundingClientRect(), width = host.ownerDocument.documentElement.clientWidth || innerWidth, height = host.ownerDocument.documentElement.clientHeight || innerHeight, left = Math.max(8, Math.min(box.left + 8, width - 60)), top = Math.max(8, Math.min(box.top + 8, height - 60)), next = {
				left,
				top,
				width: Math.max(44, Math.min(640, width - left - 8)),
				maxHeight: Math.max(44, Math.min(height - top - 8, height * .45))
			};
			setControlsBounds((old) => JSON.stringify(old) === JSON.stringify(next) ? old : next);
		};
		position();
		host.ownerDocument.addEventListener("scroll", position, true);
		window.addEventListener("resize", position);
		return () => {
			host.ownerDocument.removeEventListener("scroll", position, true);
			window.removeEventListener("resize", position);
		};
	}, [expected]);
	useEffect(() => {
		if (!guided || !rows.length) return;
		const frame = requestAnimationFrame(() => {
			if (current()) (review ? confirmControl.current : command?.type === "end" ? endControl.current : beginControl.current)?.focus();
		});
		return () => cancelAnimationFrame(frame);
	}, [
		guided,
		rows.length,
		command?.id,
		review
	]);
	return /* @__PURE__ */ jsxDEV("div", {
		ref: frame,
		className: "paper-pdf-text-frame",
		"data-pdf-text-source": expected,
		"data-pdf-text-state": status,
		style: {
			width: source.pageWidth,
			height: source.pageHeight
		},
		children: [
			/* @__PURE__ */ jsxDEV("div", {
				ref: container,
				className: "paper-pdf-text-layer",
				tabIndex: 0,
				"aria-label": "Texte sélectionnable de la page PDF",
				onPointerDown: (event) => event.stopPropagation(),
				style: {
					"--total-scale-factor": viewport.scale * viewport.userUnit,
					"--scale-round-x": "0.01px",
					"--scale-round-y": "0.01px"
				}
			}, void 0, false, {
				fileName: _jsxFileName$3,
				lineNumber: 25,
				columnNumber: 178
			}, this),
			preview && /* @__PURE__ */ jsxDEV("svg", {
				className: "paper-pdf-text-preview",
				viewBox: `0 0 ${source.pageWidth} ${source.pageHeight}`,
				"aria-hidden": "true",
				children: preview.fragments.map((fragment, index) => /* @__PURE__ */ jsxDEV("polygon", {
					points: fragment.quad.map((point) => `${point.x},${point.y}`).join(" "),
					fill: "#f5d742",
					opacity: ".38"
				}, index, false, {
					fileName: _jsxFileName$3,
					lineNumber: 25,
					columnNumber: 652
				}, this))
			}, void 0, false, {
				fileName: _jsxFileName$3,
				lineNumber: 25,
				columnNumber: 495
			}, this),
			!guided && status === "unavailable" && /* @__PURE__ */ jsxDEV("p", {
				className: "paper-pdf-text-status",
				role: "status",
				children: notice
			}, void 0, false, {
				fileName: _jsxFileName$3,
				lineNumber: 25,
				columnNumber: 815
			}, this),
			!guided && status === "ready" && frame.current && createPortal(/* @__PURE__ */ jsxDEV("button", {
				className: "paper-pdf-guided-launch",
				style: {
					position: "fixed",
					left: controlsBounds.left,
					top: controlsBounds.top,
					maxWidth: controlsBounds.width
				},
				onPointerDown: (event) => event.stopPropagation(),
				onClick: () => setGuided(true),
				children: "Choisir un passage PDF au clavier"
			}, void 0, false, {
				fileName: _jsxFileName$3,
				lineNumber: 25,
				columnNumber: 935
			}, this), frame.current.ownerDocument.body),
			guided && frame.current && createPortal(/* @__PURE__ */ jsxDEV("div", {
				className: "paper-pdf-guided-controls",
				style: {
					position: "fixed",
					left: controlsBounds.left,
					top: controlsBounds.top,
					right: "auto",
					width: controlsBounds.width,
					maxHeight: controlsBounds.maxHeight,
					...review ? { top: 8 } : null
				},
				"aria-label": "Sélection PDF au clavier",
				onPointerDown: (event) => event.stopPropagation(),
				onKeyDown: (event) => {
					if (event.key === "Escape") {
						event.preventDefault();
						cancel();
						setGuided(false);
					}
					event.stopPropagation();
				},
				children: [
					!review && /* @__PURE__ */ jsxDEV(Fragment, { children: [
						/* @__PURE__ */ jsxDEV("label", { children: ["Début", /* @__PURE__ */ jsxDEV("select", {
							ref: beginControl,
							"aria-label": "Fragment de début PDF",
							value: begin.itemIndex,
							disabled: !rows.length,
							onChange: (event) => setBegin({
								itemIndex: Number(event.target.value),
								offset: 0
							}),
							children: rows.map((item, i) => /* @__PURE__ */ jsxDEV("option", {
								value: i,
								children: [
									i + 1,
									". ",
									item.str.slice(0, 64) || "Ligne vide"
								]
							}, i, true, {
								fileName: _jsxFileName$3,
								lineNumber: 25,
								columnNumber: 1930
							}, this))
						}, void 0, false, {
							fileName: _jsxFileName$3,
							lineNumber: 25,
							columnNumber: 1724
						}, this)] }, void 0, true, {
							fileName: _jsxFileName$3,
							lineNumber: 25,
							columnNumber: 1712
						}, this),
						/* @__PURE__ */ jsxDEV("label", { children: ["Caractère", /* @__PURE__ */ jsxDEV("input", {
							type: "number",
							"aria-label": "Caractère de début PDF",
							min: 0,
							max: rows[begin.itemIndex]?.str.length ?? 0,
							value: begin.offset,
							onChange: (event) => setBegin({
								...begin,
								offset: Number(event.target.value)
							})
						}, void 0, false, {
							fileName: _jsxFileName$3,
							lineNumber: 25,
							columnNumber: 2043
						}, this)] }, void 0, true, {
							fileName: _jsxFileName$3,
							lineNumber: 25,
							columnNumber: 2027
						}, this),
						/* @__PURE__ */ jsxDEV("label", { children: ["Fin", /* @__PURE__ */ jsxDEV("select", {
							ref: endControl,
							"aria-label": "Fragment de fin PDF",
							value: end.itemIndex,
							disabled: !rows.length,
							onChange: (event) => setEnd({
								itemIndex: Number(event.target.value),
								offset: rows[Number(event.target.value)]?.str.length ?? 0
							}),
							children: rows.map((item, i) => /* @__PURE__ */ jsxDEV("option", {
								value: i,
								children: [
									i + 1,
									". ",
									item.str.slice(0, 64) || "Ligne vide"
								]
							}, i, true, {
								fileName: _jsxFileName$3,
								lineNumber: 25,
								columnNumber: 2508
							}, this))
						}, void 0, false, {
							fileName: _jsxFileName$3,
							lineNumber: 25,
							columnNumber: 2264
						}, this)] }, void 0, true, {
							fileName: _jsxFileName$3,
							lineNumber: 25,
							columnNumber: 2254
						}, this),
						/* @__PURE__ */ jsxDEV("label", { children: ["Caractère", /* @__PURE__ */ jsxDEV("input", {
							type: "number",
							"aria-label": "Caractère de fin PDF",
							min: 0,
							max: rows[end.itemIndex]?.str.length ?? 0,
							value: end.offset,
							onChange: (event) => setEnd({
								...end,
								offset: Number(event.target.value)
							})
						}, void 0, false, {
							fileName: _jsxFileName$3,
							lineNumber: 25,
							columnNumber: 2621
						}, this)] }, void 0, true, {
							fileName: _jsxFileName$3,
							lineNumber: 25,
							columnNumber: 2605
						}, this),
						/* @__PURE__ */ jsxDEV("button", {
							disabled: !rows.length,
							onClick: () => {
								try {
									publish(paperPdfGuidedRanges(rows, begin, end));
								} catch (error) {
									setNotice(String(error instanceof Error ? error.message : error));
								}
							},
							children: "Prévisualiser"
						}, void 0, false, {
							fileName: _jsxFileName$3,
							lineNumber: 25,
							columnNumber: 2822
						}, this)
					] }, void 0, true, {
						fileName: _jsxFileName$3,
						lineNumber: 25,
						columnNumber: 1710
					}, this),
					review && /* @__PURE__ */ jsxDEV("button", {
						onClick: () => setReview(false),
						children: "Modifier le passage"
					}, void 0, false, {
						fileName: _jsxFileName$3,
						lineNumber: 25,
						columnNumber: 3033
					}, this),
					/* @__PURE__ */ jsxDEV("button", {
						ref: confirmControl,
						disabled: !preview || !onHighlight,
						onClick: confirm,
						children: "Surligner"
					}, void 0, false, {
						fileName: _jsxFileName$3,
						lineNumber: 25,
						columnNumber: 3101
					}, this),
					/* @__PURE__ */ jsxDEV("button", {
						onClick: () => {
							cancel();
							setGuided(false);
						},
						children: "Annuler"
					}, void 0, false, {
						fileName: _jsxFileName$3,
						lineNumber: 25,
						columnNumber: 3200
					}, this),
					/* @__PURE__ */ jsxDEV("p", {
						role: "status",
						children: notice
					}, void 0, false, {
						fileName: _jsxFileName$3,
						lineNumber: 25,
						columnNumber: 3267
					}, this)
				]
			}, void 0, true, {
				fileName: _jsxFileName$3,
				lineNumber: 25,
				columnNumber: 1275
			}, this), frame.current.ownerDocument.body)
		]
	}, void 0, true, {
		fileName: _jsxFileName$3,
		lineNumber: 25,
		columnNumber: 9
	}, this);
}
//#endregion
//#region src/components/PaperPdfPage.tsx
var PaperPdfPage_exports = /* @__PURE__ */ __exportAll({ PaperPdfPage: () => PaperPdfPage });
var _jsxFileName$2 = "/home/louis/DowzeBuild/20260923/collections-060/src/components/PaperPdfPage.tsx";
function PaperPdfPage({ page, asset, media, document: paperDocument, current: viewCurrent, onReady, onError, onNavigate, linksEnabled = false, pixelWidth, textSelectionEnabled = false, onSelectionChange, onHighlight, textSelectionCommand, onTextSelectionStatus }) {
	const canvas = useRef(null), [failure, setFailure] = useState({
		key: "",
		epoch: -1,
		message: ""
	}), [session, setSession] = useState(null), [links, setLinks] = useState({
		source: "",
		items: []
	}), instance = useId(), active = viewCurrent?.() ?? true, key = JSON.stringify([
		media.accountId,
		media.spaceId,
		paperDocument?.noteId ?? null,
		paperDocument?.legacy.boardId ?? null,
		page.id,
		page.pdf?.assetId ?? null,
		page.pdf?.pageNumber ?? null,
		page.width,
		page.height,
		page.rotation,
		asset.id,
		asset.serverId ?? null,
		asset.mediaType,
		asset.size,
		asset.name,
		pixelWidth ?? null
	]);
	const latest = useRef({
		key,
		api: media.api,
		epoch: 0,
		active,
		paperDocument,
		viewCurrent,
		onReady,
		onError,
		onNavigate
	});
	if (latest.current.key !== key || latest.current.api !== media.api || latest.current.active !== active) latest.current.epoch++;
	latest.current = {
		...latest.current,
		key,
		api: media.api,
		active,
		paperDocument,
		viewCurrent,
		onReady,
		onError,
		onNavigate
	};
	useEffect(() => {
		let cancelled = false, pdf, render;
		const controller = new AbortController(), epoch = latest.current.epoch, current = () => !cancelled && latest.current.epoch === epoch && latest.current.key === key && latest.current.api === media.api && (latest.current.viewCurrent?.() ?? true) && (!latest.current.paperDocument || latest.current.paperDocument.pages.some((candidate) => candidate.id === page.id && candidate.pdf?.assetId === asset.id && candidate.pdf?.pageNumber === page.pdf?.pageNumber && candidate.width === page.width && candidate.height === page.height && candidate.rotation === page.rotation) && latest.current.paperDocument.assets.some((candidate) => candidate.id === asset.id && candidate.serverId === asset.serverId && candidate.mediaType === asset.mediaType && candidate.size === asset.size));
		setFailure({
			key,
			epoch,
			message: ""
		});
		setSession(null);
		setLinks({
			source: "",
			items: []
		});
		const load = async () => {
			try {
				if (!current()) return;
				if (!page.pdf || page.pdf.assetId !== asset.id || !Number.isSafeInteger(page.pdf.pageNumber) || page.pdf.pageNumber < 1) throw Error("La référence de cette page PDF doit être retrouvée. Son original reste conservé.");
				const blob = await readPaperAsset(asset, media, {
					document: paperDocument,
					current
				});
				if (!current()) return;
				const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer()), sha256 = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
				if (!current()) return;
				pdf = await openPaperPdf(blob, {
					current,
					signal: controller.signal
				});
				if (!current()) return;
				const p = await pdf.getPage(page.pdf.pageNumber);
				if (!current()) return;
				const target = canvas.current;
				if (!target) return;
				const base = p.getViewport({
					scale: 1,
					rotation: p.rotate + page.rotation
				}), logical = p.getViewport({
					scale: page.width / base.width,
					rotation: base.rotation
				}), ratio = Math.min(2, devicePixelRatio || 1, Math.sqrt(16e6 / (page.width * page.height)), 16e3 / Math.max(page.width, page.height), pixelWidth && Number.isFinite(pixelWidth) && pixelWidth > 0 ? pixelWidth / page.width : Infinity), viewport = p.getViewport({
					scale: logical.scale * ratio,
					rotation: base.rotation
				});
				target.width = Math.ceil(viewport.width);
				target.height = Math.ceil(viewport.height);
				render = p.render({
					canvas: target,
					viewport
				});
				await render.promise;
				if (!current()) return;
				const source = {
					pageId: page.id,
					assetId: asset.id,
					pdfPageNumber: page.pdf.pageNumber,
					source: JSON.stringify([
						instance,
						epoch,
						key,
						sha256
					]),
					pageWidth: page.width,
					pageHeight: page.height,
					rotation: base.rotation
				};
				setSession({
					key,
					epoch,
					page: p,
					pdf,
					viewport: logical,
					source,
					current
				});
				latest.current.onReady?.();
			} catch (e) {
				if (current()) {
					const message = String(e instanceof Error ? e.message : e);
					setFailure({
						key,
						epoch,
						message
					});
					latest.current.onError?.(message);
				}
			}
		};
		load();
		return () => {
			cancelled = true;
			controller.abort();
			render?.cancel();
			if (pdf) pdf.destroy().catch(() => {});
		};
	}, [
		key,
		media.api,
		active
	]);
	const visible = session?.key === key && session.epoch === latest.current.epoch && session.current() ? session : null, error = failure.key === key && failure.epoch === latest.current.epoch ? failure.message : "";
	useEffect(() => {
		if (!visible || !onNavigate) return;
		let stopped = false;
		const read = async () => {
			try {
				const annotations = await visible.page.getAnnotations({ intent: "display" }), items = [];
				for (const a of annotations.slice(0, 1e3)) {
					if (stopped || !visible.current()) return;
					if (a.subtype !== "Link") continue;
					const box = pdfLinkRectangle(visible.viewport, a.rect);
					if (!box) continue;
					const url = safePdfUrl(a.url);
					let destination;
					try {
						destination = await pdfDestinationPage(visible.pdf, a.dest);
					} catch {}
					if (url || destination) items.push({
						id: String(a.id),
						box,
						url,
						page: destination
					});
				}
				if (!stopped && visible.current()) setLinks({
					source: visible.source.source,
					items
				});
			} catch {}
		};
		read();
		return () => {
			stopped = true;
		};
	}, [visible, !!onNavigate]);
	return /* @__PURE__ */ jsxDEV(Fragment, { children: [
		/* @__PURE__ */ jsxDEV("div", {
			className: "paper-pdf-background",
			children: [/* @__PURE__ */ jsxDEV("canvas", {
				ref: canvas,
				style: { visibility: visible ? "visible" : "hidden" },
				"aria-label": "PDF, page " + page.pdf?.pageNumber
			}, void 0, false, {
				fileName: _jsxFileName$2,
				lineNumber: 25,
				columnNumber: 49
			}, this), error && /* @__PURE__ */ jsxDEV("p", {
				role: "status",
				children: error
			}, void 0, false, {
				fileName: _jsxFileName$2,
				lineNumber: 25,
				columnNumber: 174
			}, this)]
		}, void 0, true, {
			fileName: _jsxFileName$2,
			lineNumber: 25,
			columnNumber: 11
		}, this),
		linksEnabled && visible && links.source === visible.source.source && /* @__PURE__ */ jsxDEV("div", {
			className: "paper-pdf-links",
			children: links.items.map((link) => link.page ? /* @__PURE__ */ jsxDEV("button", {
				style: {
					position: "absolute",
					left: link.box.left + "%",
					top: link.box.top + "%",
					width: link.box.width + "%",
					height: link.box.height + "%"
				},
				className: "paper-pdf-link",
				"aria-label": "Aller à la page PDF " + link.page,
				onClick: () => {
					if (visible.current()) latest.current.onNavigate?.(link.page);
				}
			}, link.id, false, {
				fileName: _jsxFileName$2,
				lineNumber: 25,
				columnNumber: 337
			}, this) : /* @__PURE__ */ jsxDEV("a", {
				className: "paper-pdf-link",
				style: {
					position: "absolute",
					left: link.box.left + "%",
					top: link.box.top + "%",
					width: link.box.width + "%",
					height: link.box.height + "%"
				},
				href: link.url,
				target: "_blank",
				rel: "noopener noreferrer",
				"aria-label": "Ouvrir le lien PDF : " + link.url,
				onClick: (event) => {
					if (!visible.current()) event.preventDefault();
				}
			}, link.id, false, {
				fileName: _jsxFileName$2,
				lineNumber: 25,
				columnNumber: 638
			}, this))
		}, void 0, false, {
			fileName: _jsxFileName$2,
			lineNumber: 25,
			columnNumber: 271
		}, this),
		textSelectionEnabled && visible && /* @__PURE__ */ jsxDEV(PaperPdfTextLayer, {
			page: visible.page,
			viewport: visible.viewport,
			source: visible.source,
			current: visible.current,
			onSelectionChange,
			onHighlight,
			command: textSelectionCommand,
			onStatus: onTextSelectionStatus
		}, void 0, false, {
			fileName: _jsxFileName$2,
			lineNumber: 25,
			columnNumber: 1019
		}, this)
	] }, void 0, true, {
		fileName: _jsxFileName$2,
		lineNumber: 25,
		columnNumber: 9
	}, this);
}
//#endregion
//#region src/components/PaperExportPage.tsx
var _jsxFileName$1 = "/home/louis/DowzeBuild/20260923/collections-060/src/components/PaperExportPage.tsx";
/** The export uses the same readonly object renderer as the writing surface. */
var PaperExportPage = forwardRef(({ document, page, media, onReady, onError, annotationsOnly = false }, ref) => {
	const objects = paperObjectsOnPage(document, page.id), [pdfReady, setPdfReady] = useState(!page.pdf || annotationsOnly);
	useEffect(() => {
		if (pdfReady) onReady();
	}, [pdfReady]);
	return /* @__PURE__ */ jsxDEV("div", {
		ref,
		className: "paper-page paper-export-page",
		style: {
			width: page.width,
			height: page.height,
			backgroundColor: annotationsOnly ? "transparent" : page.color,
			transform: "none"
		},
		children: [
			!page.pdf && !annotationsOnly && /* @__PURE__ */ jsxDEV(PaperBackground, { page }, void 0, false, {
				fileName: _jsxFileName$1,
				lineNumber: 16,
				columnNumber: 32
			}, void 0),
			page.pdf && !annotationsOnly && document.assets.find((a) => a.id === page.pdf.assetId) && /* @__PURE__ */ jsxDEV(PaperPdfPage, {
				page,
				asset: document.assets.find((a) => a.id === page.pdf.assetId),
				media,
				onReady: () => setPdfReady(true),
				onError
			}, void 0, false, {
				fileName: _jsxFileName$1,
				lineNumber: 17,
				columnNumber: 82
			}, void 0),
			objects.map((o) => /* @__PURE__ */ jsxDEV("div", {
				"data-object": o.id,
				className: `paper-object paper-${o.kind}`,
				style: {
					left: o.x,
					top: o.y,
					width: o.width,
					minHeight: o.height,
					color: o.kind === "text" ? o.color : void 0,
					...o.kind === "image" || o.kind === "shape" || o.kind === "ink" ? { height: o.height } : {},
					zIndex: o.z + 1,
					transform: paperObjectCssTransform(o),
					transformOrigin: `${o.width / 2}px ${o.height / 2}px`,
					background: o.kind === "sticky" ? o.color : void 0
				},
				children: o.kind === "text" ? /* @__PURE__ */ jsxDEV(PaperTextFlowView, {
					object: o,
					document,
					media,
					pageId: page.id
				}, void 0, false, {
					fileName: _jsxFileName$1,
					lineNumber: 18,
					columnNumber: 436
				}, void 0) : /* @__PURE__ */ jsxDEV(PaperObjectVisual, {
					object: o,
					document,
					media,
					onError
				}, void 0, false, {
					fileName: _jsxFileName$1,
					lineNumber: 18,
					columnNumber: 519
				}, void 0)
			}, o.id, false, {
				fileName: _jsxFileName$1,
				lineNumber: 18,
				columnNumber: 18
			}, void 0))
		]
	}, void 0, true, {
		fileName: _jsxFileName$1,
		lineNumber: 15,
		columnNumber: 9
	}, void 0);
});
//#endregion
//#region tests/paper-smart-highlight-independent-entry.tsx
var _jsxFileName = "/home/louis/DowzeBuild/20260923/collections-060/tests/paper-smart-highlight-independent-entry.tsx";
function SmartHighlightRecipe(props) {
	const viewport = useRef(null), page = props.document.pages.find((p) => p.id === props.pageId);
	const api = usePaperSmartHighlight({
		...props,
		document: props.document,
		page,
		enabled: props.enabled ?? true,
		disabled: props.disabled ?? false,
		visible: props.visible ?? true,
		textOnly: props.textOnly ?? false,
		viewport,
		current: () => true
	});
	useLayoutEffect(() => props.report(api));
	return /* @__PURE__ */ jsxDEV("div", {
		ref: viewport,
		children: props.document.objects.filter((o) => (o.kind === "text" || o.kind === "sticky") && (o.pageId === props.pageId || o.textFlow?.pageIds.includes(props.pageId))).map((o) => /* @__PURE__ */ jsxDEV("div", {
			"data-object": o.id,
			children: o.kind === "text" ? /* @__PURE__ */ jsxDEV(PaperTextFlowView, {
				object: o,
				document: props.document,
				media: props.media,
				pageId: props.pageId
			}, void 0, false, {
				fileName: _jsxFileName,
				lineNumber: 11,
				columnNumber: 231
			}, this) : /* @__PURE__ */ jsxDEV("div", {
				className: "paper-selectable-text-source",
				children: /* @__PURE__ */ jsxDEV(PaperRichText, {
					markdown: o.markdown ?? "",
					document: props.document,
					media: props.media
				}, void 0, false, {
					fileName: _jsxFileName,
					lineNumber: 11,
					columnNumber: 377
				}, this)
			}, void 0, false, {
				fileName: _jsxFileName,
				lineNumber: 11,
				columnNumber: 331
			}, this)
		}, o.id, false, {
			fileName: _jsxFileName,
			lineNumber: 11,
			columnNumber: 179
		}, this))
	}, void 0, false, {
		fileName: _jsxFileName,
		lineNumber: 11,
		columnNumber: 9
	}, this);
}
//#endregion
export { measureTextFlow as C, paperCodeRanges as E, PaperExportPage, PaperInkVisual, PaperNotebook, PaperRichText, PaperTextFlowView as S, SmartHighlightRecipe, loadPaperCodeLanguage as T, requestMicrophoneAccess as _, isPaperArchiveMetadata as a, act, amendPaperCollaboration, applyPaperCommand, applyPaperToolPreferenceCommand, safePdfUrl as b, amendNotebookLibrary as c, capturePaperNotebookCommandTarget, commitPaperToolPreferences, copiedPageText, createElement, createRoot, isNotebookLibrary as d, duplicatePaperPage, updateNotebookLibrary as f, flushSync, getNativeCapabilities as g, getDraft, getSnapshot, savePaperExport as h, hasPendingNotebookWrites, verifyPaperArchiveBlob as i, isPaperDocument, LIBRARY_DOCUMENT_ID as l, listLocalBlobs, listSnapshots, loadPaperToolPreferences, originalAudioExportKind as m, measurePaperTextHighlight, migratePaper, MAX_PAPER_ARCHIVE_MEMBER_BYTES as n, notebookDocumentId, paperMarkdown as o, objectPoint, readOwnedLegacyNotebookBoard as p, paperArchiveMetadata, paperHighlightCommand, paperNotebookCommandTargetCurrent, paperTextHighlightModel, paperTextHighlightRange, putDraft, putSnapshot, appendPaperArchive as r, reflowPaperText, renderToStaticMarkup, resumeAllNotebookAccounts, isPersistedSubjectNotesStore as s, MAX_PAPER_ARCHIVE_BYTES as t, textFlowFingerprint, emptyNotebookLibrary as u, pdfDestinationPage as v, verifyPaperCollaboration, PaperAssetImage as w, registerNotebookWriter as x, pdfLinkRectangle as y };
