import { act, createElement, memo, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createRoot, createRoot as createRoot$1 } from "react-dom/client";
import { $node, $prose, $remark, $view, insert } from "@milkdown/kit/utils";
import { Plugin, PluginKey, TextSelection } from "@milkdown/kit/prose/state";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { fromMarkdown } from "mdast-util-from-markdown";
import { parse, postprocess, preprocess } from "micromark";
import { gfm } from "micromark-extension-gfm";
import { gfmFromMarkdown } from "mdast-util-gfm";
import { math } from "micromark-extension-math";
import { mathFromMarkdown } from "mdast-util-math";
import { languages } from "@codemirror/language-data";
import { classHighlighter, highlightTree } from "@lezer/highlight";
import { Fragment, jsxDEV } from "react/jsx-dev-runtime";
import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { createTimer } from "@milkdown/kit/ctx";
import { Editor, defaultValueCtx, editorViewCtx, editorViewCtx as editorViewCtx$1, editorViewTimerCtx, nodeViewCtx, parserCtx, parserCtx as parserCtx$1, rootCtx, serializerCtx } from "@milkdown/kit/core";
import { Decoration, DecorationSet } from "@milkdown/kit/prose/view";
import { AlertCircle, Eraser, Highlighter, ImagePlus, LoaderCircle, MoreHorizontal, Pencil, Redo2, Type, Undo2 } from "lucide-react";
import { Crepe } from "@milkdown/crepe";
import { commonmark } from "@milkdown/kit/preset/commonmark";
import { flushSync } from "react-dom";
//#region src/lib/paperStudy.ts
var record$2 = (v) => !!v && typeof v === "object" && !Array.isArray(v);
var date = (v) => typeof v === "string" && Number.isFinite(Date.parse(v));
function isPaperStudy(value) {
	if (!record$2(value) || value.schema !== 1 || typeof value.language !== "string" || !value.language.length || value.language.length > 40 || !Array.isArray(value.cards) || value.cards.length > 1e4) return false;
	try {
		new Intl.Locale(value.language);
	} catch {
		return false;
	}
	const ids = /* @__PURE__ */ new Set();
	return value.cards.every((c) => {
		if (!record$2(c) || typeof c.id !== "string" || !c.id.length || c.id.length > 200 || ids.has(c.id) || !["basic", "cloze"].includes(String(c.kind)) || typeof c.question !== "string" || !c.question.trim() || c.question.length > 1e4 || typeof c.answer !== "string" || !c.answer.trim() || c.answer.length > 1e4 || !date(c.createdAt) || !record$2(c.schedule) || !Array.isArray(c.reviews)) return false;
		ids.add(c.id);
		const s = c.schedule;
		const reviewIds = /* @__PURE__ */ new Set();
		return Number.isInteger(s.repetitions) && Number(s.repetitions) >= 0 && Number.isInteger(s.intervalDays) && Number(s.intervalDays) >= 0 && typeof s.ease === "number" && Number.isFinite(s.ease) && s.ease >= 1.3 && s.ease <= 10 && date(s.dueAt) && c.reviews.length <= 1e3 && c.reviews.every((r) => record$2(r) && typeof r.id === "string" && !!r.id && !reviewIds.has(r.id) && (reviewIds.add(r.id), true) && date(r.at) && Number.isInteger(r.quality) && Number(r.quality) >= 0 && Number(r.quality) <= 5) && (!c.source || record$2(c.source) && [
			"noteId",
			"pageId",
			"objectId",
			"quote"
		].every((k) => typeof c.source[k] === "string") && Number.isInteger(c.source.revision) && Number(c.source.revision) >= 0 && typeof c.source.quote === "string" && c.source.quote.length <= 1e4);
	});
}
function noteBoardId(noteId) {
	if (noteId === "legacy-whiteboard-main") return "whiteboard-main";
	if (/^[A-Za-z0-9][A-Za-z0-9._-]{0,117}$/.test(noteId)) return `note-${noteId}`;
	const lanes = [
		2166136261,
		3335557771,
		1234567891,
		987654319
	];
	for (let i = 0; i < noteId.length; i++) for (let n = 0; n < lanes.length; n++) lanes[n] = Math.imul(lanes[n] ^ noteId.charCodeAt(i), 16777619 + n * 2) >>> 0;
	return `note-${lanes.map((lane) => lane.toString(16).padStart(8, "0")).join("")}`;
}
var photoReference = (documentId, id) => `dowze-photo:${encodeURIComponent(documentId)}/${encodeURIComponent(id)}`;
function parsePhotoReference(src) {
	const match = /^dowze-photo:([^/]+)\/([^/]+)$/.exec(src);
	if (!match) return null;
	try {
		const documentId = decodeURIComponent(match[1]), id = decodeURIComponent(match[2]);
		return /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,126}$/.test(documentId) && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,126}$/.test(id) ? {
			documentId,
			id
		} : null;
	} catch {
		return null;
	}
}
//#endregion
//#region src/lib/notebookIdentity.ts
/** Historical lookup only. A stored paper's complete noteId must prove ownership. */
var legacyNotebookDocumentId = (noteId) => `paper-v3-${noteBoardId(noteId).slice(0, 110)}`;
/** Hash the exact UTF-16 identity: UTF-8 would replace distinct lone surrogates. */
function notebookIdentityDigest(noteId) {
	const domain = new TextEncoder().encode("Dowze/notebook-document/id2\0"), bytes = new Uint8Array(domain.length + noteId.length * 2);
	bytes.set(domain);
	for (let i = 0; i < noteId.length; i++) {
		const unit = noteId.charCodeAt(i);
		bytes[domain.length + i * 2] = unit >>> 8;
		bytes[domain.length + i * 2 + 1] = unit & 255;
	}
	return bytesToHex(sha256(bytes));
}
/** Short safe historical IDs remain stable. Ambiguous/truncated/path-unsafe IDs get a separate namespace. */
function notebookDocumentId(noteId) {
	if (noteId === "legacy-whiteboard-main" || /^[A-Za-z0-9][A-Za-z0-9._-]{0,104}$/.test(noteId) && !noteId.includes("..") && !/^[a-f0-9]{32}$/.test(noteId)) return legacyNotebookDocumentId(noteId);
	return `paper-v3-id2-${notebookIdentityDigest(noteId)}`;
}
//#endregion
//#region src/lib/paperLegacyImages.ts
var range = (markdown, from, to) => ({
	from,
	to,
	raw: markdown.slice(from, to)
});
var visit = (node, fn) => {
	fn(node);
	node.children?.forEach((child) => visit(child, fn));
};
var bounds$1 = (node) => {
	const from = node.position?.start.offset, to = node.position?.end.offset;
	if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to)) throw Error("Les positions de cette image doivent être retrouvées avant sa conversion.");
	return {
		from,
		to
	};
};
var parserOptions = () => ({ extensions: [gfm(), math()] });
var mdastOptions = () => ({
	...parserOptions(),
	mdastExtensions: [gfmFromMarkdown(), mathFromMarkdown()]
});
/** Historical recovery only. This does not relax the application or server transport parser. */
function parseLegacyPhotoImageUrl(url) {
	const match = /^dowze-photo:([^/]+)\/([^/]+)$/.exec(url);
	if (!match) return null;
	try {
		const documentId = decodeURIComponent(match[1]), id = decodeURIComponent(match[2]);
		return [documentId, id].every((value) => value.length > 0 && value.length <= 200 && !/[\u0000-\u001f\u007f]/.test(value)) ? {
			documentId,
			id
		} : null;
	} catch {
		return null;
	}
}
function tokenPositions(markdown) {
	const result = /* @__PURE__ */ new Map(), stack = [];
	for (const [event, token] of postprocess(parse(parserOptions()).document().write(preprocess()(markdown, void 0, true)))) {
		const from = token.start.offset, to = token.end.offset;
		if (typeof from !== "number" || typeof to !== "number") continue;
		if ([
			"image",
			"link",
			"definition"
		].includes(token.type)) {
			if (event === "enter") stack.push({
				type: token.type,
				from,
				to
			});
			else {
				const owner = stack.pop();
				if (!owner || owner.type !== token.type || owner.from !== from) throw Error("Les positions de l’image ne correspondent plus au document.");
				result.set(`${owner.type}:${owner.from}:${owner.to}`, owner);
			}
			continue;
		}
		if (event !== "enter") continue;
		const owner = stack.at(-1);
		if (!owner) continue;
		if (["resourceDestinationString", "definitionDestinationString"].includes(token.type)) owner.destination = range(markdown, from, to);
		else if (token.type === "definitionLabelString") owner.label = range(markdown, from, to);
		else if (token.type === "reference") owner.reference = range(markdown, from, to);
	}
	return result;
}
/** Only semantic Markdown images are indexed. Code, ordinary links, HTML and maths stay untouched. */
function scanLegacyPaperImages(markdown) {
	if (typeof markdown !== "string") throw Error("Le texte de la note est incompatible.");
	const tree = fromMarkdown(markdown, mdastOptions()), tokens = tokenPositions(markdown), definitions = [], images = [], linked = /* @__PURE__ */ new Set();
	visit(tree, (node) => {
		if (node.type === "linkReference" && node.identifier) linked.add(node.identifier);
	});
	const firstDefinition = /* @__PURE__ */ new Map();
	visit(tree, (node) => {
		if (node.type !== "definition" || !node.identifier || node.url === void 0) return;
		const { from, to } = bounds$1(node), token = tokens.get(`definition:${from}:${to}`);
		if (!token?.destination || !token.label) throw Error("La destination de cette image référencée doit être retrouvée.");
		const definition = {
			id: `definition-${from}-${to}`,
			identifier: node.identifier,
			label: node.label ?? node.identifier,
			from,
			to,
			url: node.url,
			title: node.title ?? null,
			destination: token.destination,
			labelRange: token.label,
			sharedWithLinks: linked.has(node.identifier)
		};
		definitions.push(definition);
		if (!firstDefinition.has(node.identifier)) firstDefinition.set(node.identifier, definition);
	});
	visit(tree, (node) => {
		if (node.type !== "image" && node.type !== "imageReference") return;
		const { from, to } = bounds$1(node), token = tokens.get(`image:${from}:${to}`), definition = node.type === "imageReference" && node.identifier ? firstDefinition.get(node.identifier) : void 0;
		const url = node.type === "image" ? node.url : definition?.url;
		if (url === void 0) return;
		const photo = parseLegacyPhotoImageUrl(url), data = /^data:(image\/(?:png|jpeg|jpg|gif|webp))(?:;[^\r\n,]*)?,/i.exec(url), kind = photo ? "photo" : url.startsWith("dowze-photo:") ? "invalid-photo" : data ? "data" : "other", mediaType = data?.[1].toLowerCase();
		images.push({
			id: `image-${from}-${to}`,
			from,
			to,
			url,
			title: node.type === "image" ? node.title ?? null : definition?.title ?? null,
			alt: node.alt ?? "",
			kind,
			...photo ? { photo } : {},
			...data ? { data: { mediaType: mediaType === "image/jpg" ? "image/jpeg" : mediaType } } : {},
			...node.type === "image" && token?.destination ? { destination: token.destination } : {},
			...definition ? { reference: {
				identifier: definition.identifier,
				type: node.referenceType ?? "shortcut",
				definitionId: definition.id,
				sharedWithLinks: definition.sharedWithLinks,
				...token?.reference ? { range: token.reference } : {}
			} } : {}
		});
	});
	return {
		markdown,
		images,
		definitions
	};
}
var pngCrcTable = /* @__PURE__ */ new Uint32Array(256);
for (let value = 0; value < 256; value++) {
	let next = value;
	for (let bit = 0; bit < 8; bit++) next = next & 1 ? next >>> 1 ^ 3988292384 : next >>> 1;
	pngCrcTable[value] = next;
}
//#endregion
//#region src/lib/notebookDocument.ts
var finite = (n) => typeof n === "number" && Number.isFinite(n);
var record$1 = (v) => !!v && typeof v === "object" && !Array.isArray(v);
var id = (v) => typeof v === "string" && v.length > 0 && v.length <= 200;
var unique = (items) => new Set(items.map((item) => item.id)).size === items.length;
function validAudioSegments(value, root, duration, assets, metadata) {
	if (!Array.isArray(value) || !value.length || value.length > 1e4) return false;
	let offset = 0;
	for (const [index, part] of value.entries()) {
		if (!record$1(part) || !assets.has(part.assetId) || index === 0 && part.assetId !== root || !finite(part.offset) || !finite(part.duration) || part.duration <= 0 || Math.abs(part.offset - offset) >= .001 || part.source !== void 0 && !validAudioSource(part.source, part.assetId, metadata)) return false;
		offset += part.duration;
	}
	return Math.abs(duration - offset) < .001;
}
function validAudioSource(value, root, assets) {
	if (!record$1(value) || value.schema !== 1 || value.originalName !== void 0 && (typeof value.originalName !== "string" || value.originalName.length > 500) || typeof value.mediaType !== "string" || !/^audio\//.test(value.mediaType) || !Number.isSafeInteger(value.size) || Number(value.size) <= 0 || !Array.isArray(value.chunks) || !value.chunks.length || value.chunks.length > 1e4) return false;
	const ids = /* @__PURE__ */ new Set();
	let size = 0;
	for (const [index, chunk] of value.chunks.entries()) {
		if (!record$1(chunk) || !id(chunk.assetId) || ids.has(chunk.assetId) || index === 0 && chunk.assetId !== root || !Number.isSafeInteger(chunk.size) || !finite(chunk.size) || chunk.size <= 0 || chunk.size > 16777216 || typeof chunk.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(chunk.sha256) || !assets.some((a) => record$1(a) && a.id === chunk.assetId && a.size === chunk.size)) return false;
		ids.add(chunk.assetId);
		size += chunk.size;
	}
	return size === value.size;
}
function isPaperDocument(value) {
	if (!record$1(value) || value.notebookSchema !== 3 || !id(value.noteId) || !Number.isSafeInteger(value.revision) || Number(value.revision) < 0 || typeof value.updatedAt !== "string" || !Number.isFinite(Date.parse(value.updatedAt))) return false;
	if (value.collaboration !== void 0 && (!record$1(value.collaboration) || value.collaboration.schema !== 1 || !id(value.collaboration.lineage) || typeof value.collaboration.state !== "string" || value.collaboration.state.length > 33554432 / 3 + 8)) return false;
	if (!Array.isArray(value.pages) || !value.pages.length || value.pages.length > 2e3 || !Array.isArray(value.objects) || value.objects.length > 1e5 || !Array.isArray(value.assets) || !Array.isArray(value.audio) || !record$1(value.legacy) || typeof value.legacy.markdown !== "string" || !id(value.legacy.boardId) || typeof value.legacy.migratedAt !== "string") return false;
	if (!value.pages.every((p) => record$1(p) && id(p.id) && (p.flowRootId === void 0 || id(p.flowRootId)) && finite(p.width) && p.width >= 100 && p.width <= 2e4 && finite(p.height) && p.height >= 100 && p.height <= 1e5 && [
		"plain",
		"ruled",
		"grid",
		"dots"
	].includes(String(p.pattern)) && typeof p.color === "string" && typeof p.bookmark === "boolean" && finite(p.rotation) && (p.template === void 0 || [
		"standard",
		"cornell",
		"music",
		"weekly"
	].includes(String(p.template))) && (p.spacing === void 0 || finite(p.spacing) && p.spacing >= 8 && p.spacing <= 100) && (!p.pdf || record$1(p.pdf) && id(p.pdf.assetId) && Number.isInteger(p.pdf.pageNumber) && Number(p.pdf.pageNumber) >= 1 && (p.pdf.text === void 0 || typeof p.pdf.text === "string")))) return false;
	const pages = new Set(value.pages.map((p) => p.id));
	if (!value.assets.every((a) => record$1(a) && id(a.id) && typeof a.name === "string" && typeof a.mediaType === "string" && finite(a.size) && a.size >= 0 && (a.serverId === void 0 || id(a.serverId)))) return false;
	const assets = new Set(value.assets.map((a) => a.id));
	if (!value.objects.every((o) => record$1(o) && id(o.id) && pages.has(o.pageId) && [
		"text",
		"ink",
		"image",
		"shape",
		"sticky"
	].includes(String(o.kind)) && [
		o.x,
		o.y,
		o.width,
		o.height,
		o.rotation,
		o.z,
		o.createdAt
	].every(finite) && Number(o.width) >= 0 && Number(o.height) >= 0 && typeof o.locked === "boolean" && (o.textPartition === void 0 || id(o.textPartition)) && (o.groupId === void 0 || id(o.groupId)) && (o.kind === "text" || o.kind === "sticky" ? typeof o.markdown === "string" : true) && (o.kind === "image" ? assets.has(o.assetId) : true) && (o.kind === "ink" ? Array.isArray(o.points) && o.points.length > 0 && o.points.every((p) => record$1(p) && finite(p.x) && finite(p.y) && finite(p.time) && (p.pressure === void 0 || finite(p.pressure) && p.pressure >= 0 && p.pressure <= 1) && [
		p.tiltX,
		p.tiltY,
		p.twist
	].every((n) => n === void 0 || finite(n))) : true))) return false;
	if (!value.audio.every((a) => record$1(a) && id(a.id) && assets.has(a.assetId) && typeof a.name === "string" && finite(a.duration) && a.duration >= 0 && finite(a.startedAt) && (a.inProgress === void 0 || typeof a.inProgress === "boolean") && (a.segments === void 0 || validAudioSegments(a.segments, a.assetId, a.duration, assets, value.assets)) && (a.source === void 0 || a.segments === void 0 && validAudioSource(a.source, a.assetId, value.assets)))) return false;
	if (value.study !== void 0 && !isPaperStudy(value.study)) return false;
	const audio = new Set(value.audio.map((a) => a.id));
	if (!value.objects.every((o) => o.textFlow === void 0 || o.kind === "text" && record$1(o.textFlow) && o.textFlow.schema === 1 && typeof o.textFlow.source === "string" && o.textFlow.source.length <= 200 && Array.isArray(o.textFlow.pageIds) && o.textFlow.pageIds.length > 0 && o.textFlow.pageIds.length <= 2e3 && o.textFlow.pageIds[0] === o.pageId && o.textFlow.pageIds.every((p) => pages.has(p)) && new Set(o.textFlow.pageIds).size === o.textFlow.pageIds.length && Array.isArray(o.textFlow.breaks) && o.textFlow.breaks.length === o.textFlow.pageIds.length + 1 && o.textFlow.breaks[0] === 0 && (o.textFlow.sourceOffsets === void 0 || Array.isArray(o.textFlow.sourceOffsets) && o.textFlow.sourceOffsets.length === o.textFlow.breaks.length && o.textFlow.sourceOffsets[0] === 0 && o.textFlow.sourceOffsets.every((n, i) => Number.isSafeInteger(n) && Number(n) >= 0 && (i === 0 || Number(n) >= Number(o.textFlow.sourceOffsets[i - 1])))) && o.textFlow.breaks.every((n, i) => finite(n) && n >= 0 && (i === 0 || n > Number(o.textFlow.breaks[i - 1]))))) return false;
	return unique(value.pages) && unique(value.objects) && unique(value.assets) && unique(value.audio) && value.pages.every((p) => !p.pdf || assets.has(p.pdf.assetId)) && value.objects.every((o) => !o.audioAnchor || record$1(o.audioAnchor) && audio.has(o.audioAnchor.sessionId) && finite(o.audioAnchor.time) && o.audioAnchor.time >= 0);
}
function blankPage(pageId = crypto.randomUUID()) {
	return {
		id: pageId,
		width: 794,
		height: 1123,
		pattern: "plain",
		color: "#ffffff",
		bookmark: false,
		rotation: 0
	};
}
/** Reserve existing short identities before allocating replacements: a generated ID must not steal one. */
function legacyEntityIds(noteId, prefix, values, addressable = id) {
	const reserved = new Set(values.map((value) => `${prefix}${value.sourceId}`).filter(addressable)), used = /* @__PURE__ */ new Set(), occurrences = /* @__PURE__ */ new Map();
	return values.map((value) => {
		const preferred = `${prefix}${value.sourceId}`, identity = value.identity ?? value.sourceId, occurrence = occurrences.get(identity) ?? 0;
		occurrences.set(identity, occurrence + 1);
		if (addressable(preferred) && !used.has(preferred)) {
			used.add(preferred);
			return preferred;
		}
		const base = `${prefix}id2-${notebookIdentityDigest(JSON.stringify([
			"paper-legacy-entity",
			noteId,
			prefix,
			identity,
			occurrence
		]))}`;
		let replacement = base, collision = 0;
		while (used.has(replacement) || reserved.has(replacement)) replacement = `${base}-${++collision}`;
		used.add(replacement);
		return replacement;
	});
}
/** Pure plan for the caller to associate original files atomically; no bytes are copied by the model. */
function legacyPaperPhotoIdentities(noteId, legacyBoard) {
	if (!record$1(legacyBoard) || !Array.isArray(legacyBoard.photos)) return [];
	const photos = legacyBoard.photos.flatMap((photo, photoIndex) => record$1(photo) && typeof photo.id === "string" && photo.id ? [{
		photoIndex,
		sourceId: photo.id,
		...id(photo.serverId) ? { serverId: photo.serverId } : {}
	}] : []);
	const variants = /* @__PURE__ */ new Map();
	for (const photo of photos) {
		const identity = JSON.stringify([photo.sourceId, photo.serverId ?? null]);
		if (!variants.has(identity)) variants.set(identity, {
			sourceId: photo.sourceId,
			identity
		});
	}
	const addressable = (value) => {
		try {
			return !!parsePhotoReference(photoReference(notebookDocumentId(noteId), value));
		} catch {
			return false;
		}
	};
	const entries = [...variants.entries()], allocated = legacyEntityIds(noteId, "", entries.map(([, value]) => value), addressable), ids = new Map(entries.map(([identity], index) => [identity, allocated[index]]));
	return photos.map((photo) => ({
		...photo,
		assetId: ids.get(JSON.stringify([photo.sourceId, photo.serverId ?? null]))
	}));
}
function migratePaper(noteId, markdown, legacyBoard, now = (/* @__PURE__ */ new Date()).toISOString()) {
	const page = blankPage(`page-${noteBoardId(noteId)}`);
	const objects = [];
	const assets = [];
	const old = record$1(legacyBoard) ? legacyBoard : {};
	const board = record$1(old.board) ? old.board : {};
	const strokes = [];
	if (Array.isArray(board.strokes)) for (const stroke of board.strokes) {
		if (!record$1(stroke) || !Array.isArray(stroke.points)) continue;
		const points = stroke.points.filter((p) => record$1(p) && finite(p.x) && finite(p.y)).map((p) => ({
			x: Number(p.x),
			y: Number(p.y),
			time: 0,
			...finite(p.pressure) ? { pressure: Math.max(0, Math.min(1, p.pressure)) } : {}
		}));
		if (!points.length) continue;
		strokes.push({
			stroke,
			points,
			sourceId: String(stroke.id ?? strokes.length)
		});
	}
	const strokeIds = legacyEntityIds(noteId, "legacy-ink-", strokes);
	for (const [index, { stroke, points }] of strokes.entries()) {
		page.height = Math.max(page.height, Math.min(1e5, points.reduce((max, p) => Math.max(max, p.y), 0) + 100));
		objects.push({
			id: strokeIds[index],
			pageId: page.id,
			kind: "ink",
			x: 0,
			y: 0,
			width: page.width,
			height: page.height,
			rotation: 0,
			z: objects.length + 1,
			locked: false,
			points,
			color: typeof stroke.color === "string" ? stroke.color : "#20343b",
			strokeWidth: finite(stroke.width) ? stroke.width : 3,
			pen: "pen",
			createdAt: Date.parse(now)
		});
	}
	objects.unshift({
		id: `text-${noteBoardId(noteId)}`,
		pageId: page.id,
		kind: "text",
		x: 48,
		y: 48,
		width: page.width - 96,
		height: page.height - 96,
		rotation: 0,
		z: 0,
		locked: false,
		markdown,
		createdAt: Date.parse(now)
	});
	const photoIdentities = legacyPaperPhotoIdentities(noteId, old), imageIds = legacyEntityIds(noteId, "legacy-image-", photoIdentities), assetIds = /* @__PURE__ */ new Set();
	const ownDocuments = /* @__PURE__ */ new Set([
		noteBoardId(noteId),
		notebookDocumentId(noteId),
		legacyNotebookDocumentId(noteId)
	]);
	const inlinePhotos = new Set(scanLegacyPaperImages(markdown).images.flatMap((image) => image.kind === "photo" && image.photo && ownDocuments.has(image.photo.documentId) && parsePhotoReference(image.url) ? [image.photo.id] : []));
	for (const [index, identity] of photoIdentities.entries()) {
		const photo = old.photos[identity.photoIndex];
		if (!assetIds.has(identity.assetId)) {
			assetIds.add(identity.assetId);
			assets.push({
				id: identity.assetId,
				name: typeof photo.name === "string" ? photo.name : "Image",
				mediaType: "image/png",
				size: 0,
				...identity.serverId ? { serverId: identity.serverId } : {}
			});
		}
		if (!(identity.assetId === identity.sourceId && inlinePhotos.has(identity.sourceId))) objects.push({
			id: imageIds[index],
			pageId: page.id,
			kind: "image",
			x: 48,
			y: Math.min(page.height - 280, 100 + (index + 1) * 260),
			width: 320,
			height: 240,
			rotation: 0,
			z: objects.length,
			locked: false,
			assetId: identity.assetId,
			createdAt: Date.parse(now)
		});
	}
	return {
		notebookSchema: 3,
		noteId,
		revision: 0,
		pages: [page],
		objects,
		assets,
		audio: [],
		updatedAt: now,
		legacy: {
			markdown,
			boardId: noteBoardId(noteId),
			migratedAt: now
		}
	};
}
//#endregion
//#region pwa/src/storage.ts
var DB = "dowze-academie-pwa";
var VERSION = 3;
var BLOBS = "scopedBlobs";
var blobKey = (blob) => `${blob.accountId}|${blob.spaceId}|${blob.id}`;
var key$1 = (v) => `${v.accountId}|${v.spaceId}|${v.type ?? "notesMarkdown"}|${v.documentId}`;
function openDb() {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open(DB, VERSION);
		request.onupgradeneeded = () => {
			const db = request.result;
			if (!db.objectStoreNames.contains("drafts")) db.createObjectStore("drafts", { keyPath: "key" });
			if (!db.objectStoreNames.contains("mutations")) db.createObjectStore("mutations", { keyPath: "id" });
			if (!db.objectStoreNames.contains("snapshots")) db.createObjectStore("snapshots", { keyPath: "key" });
			if (!db.objectStoreNames.contains("blobs")) db.createObjectStore("blobs", { keyPath: "id" });
			if (!db.objectStoreNames.contains(BLOBS)) {
				db.createObjectStore(BLOBS, { keyPath: "key" });
				const original = request.transaction.objectStore("blobs"), scoped = request.transaction.objectStore(BLOBS), read = original.openCursor();
				read.onsuccess = () => {
					const cursor = read.result;
					if (!cursor) return;
					const row = cursor.value;
					if (typeof row.id === "string" && typeof row.accountId === "string" && typeof row.spaceId === "string") scoped.put({
						...row,
						key: blobKey(row)
					});
					cursor.continue();
				};
			}
			const drafts = request.transaction.objectStore("drafts");
			const cursor = drafts.openCursor();
			cursor.onsuccess = () => {
				const row = cursor.result;
				if (!row) return;
				const value = row.value;
				if (value.key !== key$1(value)) {
					row.delete();
					drafts.put({
						...value,
						key: key$1(value)
					});
				}
				row.continue();
			};
		};
		request.onsuccess = () => {
			const db = request.result;
			db.onversionchange = () => db.close();
			resolve(db);
		};
		request.onerror = () => reject(request.error);
	});
}
async function run(store, mode, action) {
	const db = await openDb();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(store, mode);
		const request = action(tx.objectStore(store));
		let result;
		request.onsuccess = () => {
			result = request.result;
		};
		tx.oncomplete = () => {
			db.close();
			resolve(result);
		};
		tx.onabort = tx.onerror = () => {
			db.close();
			reject(tx.error ?? request.error ?? /* @__PURE__ */ new Error("Stockage interrompu"));
		};
	});
}
/** A delayed seed/response may update retained provenance, but never reactivate it. */
async function putDraft(draft) {
	const db = await openDb();
	return new Promise((resolve, reject) => {
		const tx = db.transaction("drafts", "readwrite"), store = tx.objectStore("drafts"), read = store.get(key$1(draft));
		let reason = "Enregistrement interrompu.";
		read.onsuccess = () => {
			const current = read.result;
			if (current?.identityAlias && !samePaperOwner(current.content, draft.content)) {
				reason = "Cette ancienne identité appartient à une autre note. Son original reste conservé.";
				tx.abort();
				return;
			}
			store.put({
				...draft,
				key: key$1(draft),
				...current?.identityAlias ? {
					identityAlias: current.identityAlias,
					baseVersion: Math.max(draft.baseVersion, current.baseVersion)
				} : {}
			});
		};
		tx.oncomplete = () => {
			db.close();
			resolve();
		};
		tx.onabort = tx.onerror = () => {
			db.close();
			reject(tx.error ?? new Error(reason));
		};
	});
}
async function getDraft(draftKey) {
	return run("drafts", "readonly", (s) => s.get(key$1(draftKey)));
}
async function putSnapshot(snapshot) {
	await run("snapshots", "readwrite", (s) => s.put(snapshot));
}
async function getSnapshot(snapshotKey) {
	return run("snapshots", "readonly", (s) => s.get(snapshotKey));
}
var notebookDeletionKey = (identity) => `paper-canonical-deletion|${key$1({
	...identity,
	type: "whiteboard"
})}`;
var validNotebookDeletion = (value, identity) => {
	const marker = value;
	return !!marker && marker.schema === 1 && marker.kind === "paper-canonical-deletion" && marker.accountId === identity.accountId && marker.spaceId === identity.spaceId && marker.documentId === identity.documentId && (marker.noteId === void 0 || typeof marker.noteId === "string") && Number.isSafeInteger(marker.version) && marker.version > 0 && Number.isFinite(marker.deletedAt);
};
/** Only an explicit scoped server tombstone proves deletion. A cached version
* number or a missing draft alone never means that a notebook was removed. */
async function readNotebookDeletionStatus(noteId, scope, current = () => true) {
	if (!current()) throw new DraftChangedError("Le compte a changé avant la lecture de la suppression.");
	const identity = {
		...scope,
		type: "whiteboard",
		documentId: notebookDocumentId(noteId)
	}, row = await getSnapshot(notebookDeletionKey(identity));
	if (!current()) throw new DraftChangedError("Le compte a changé pendant la lecture de la suppression.");
	if (!row) return;
	if (row.accountId !== scope.accountId || row.spaceId !== scope.spaceId || !validNotebookDeletion(row.value, identity) || row.value.noteId !== void 0 && row.value.noteId !== noteId) throw Error("Le reçu de suppression ne correspond pas à cette note. Aucun original n’est remplacé.");
	return row.value;
}
async function localBlobDigest(blob) {
	const bytes = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
	return [...new Uint8Array(bytes)].map((n) => n.toString(16).padStart(2, "0")).join("");
}
/** A transfer can detect both byte changes and uploader acknowledgements. */
async function putLocalBlob(blob) {
	const sha256 = await localBlobDigest(blob.blob), db = await openDb();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(BLOBS, "readwrite"), store = tx.objectStore(BLOBS), read = store.get(blobKey(blob));
		read.onsuccess = () => {
			const old = read.result;
			store.put({
				...blob,
				sha256,
				revision: (old?.revision ?? 0) + 1,
				key: blobKey(blob)
			});
		};
		tx.oncomplete = () => {
			db.close();
			resolve();
		};
		tx.onabort = tx.onerror = () => {
			db.close();
			reject(tx.error ?? /* @__PURE__ */ new Error("Le fichier n’a pas pu être enregistré."));
		};
	});
}
async function listLocalBlobs(accountId, spaceId) {
	return (await run(BLOBS, "readonly", (s) => s.getAll())).filter((x) => x.accountId === accountId && x.spaceId === spaceId);
}
/** Save the visible revision and its outbox entry in one durable transaction. */
var DraftChangedError = class extends Error {};
var blobState = (value) => value && JSON.stringify({
	...value,
	blob: void 0,
	key: void 0,
	size: value.blob.size,
	mediaType: value.blob.type
});
var draftState = (value) => value && JSON.stringify({
	...value,
	key: void 0
});
var samePaperOwner = (first, second) => isPaperDocument(first) && isPaperDocument(second) && first.noteId === second.noteId;
/** Originals, target revisions and the migration receipt change atomically or not at all. */
async function commitNotebookTransfer(plan, current) {
	const inTarget = (row) => row.accountId === plan.target.accountId && row.spaceId === plan.target.spaceId;
	const inSource = (row) => plan.sources.some((source) => source.accountId === row.accountId && source.spaceId === row.spaceId);
	if (!plan.drafts.every(inTarget) || !plan.blobs.every(inTarget) || !plan.snapshots.every((row) => inTarget(row) || inSource(row))) throw Error("Transfert hors du compte ou de l’année refusé.");
	if (plan.drafts.some((row) => !plan.draftChecks.some((check) => key$1(check.identity) === key$1(row))) || plan.blobs.some((row) => !plan.blobChecks.some((check) => blobKey(check.identity) === blobKey(row))) || plan.snapshots.some((row) => !plan.snapshotChecks.some((check) => check.key === row.key))) throw Error("Le transfert doit vérifier chaque destination.");
	if (!current()) throw Error("La connexion a changé avant le transfert.");
	const db = await openDb();
	return new Promise((resolve, reject) => {
		const tx = db.transaction([
			"drafts",
			BLOBS,
			"snapshots"
		], "readwrite");
		let reason = "La note ou ses fichiers ont changé pendant le transfert. Les originaux restent conservés.", aborted = false;
		const abort = () => {
			if (!aborted) {
				aborted = true;
				tx.abort();
			}
		};
		let left = plan.draftChecks.length + plan.blobChecks.length + plan.snapshotChecks.length;
		const write = () => {
			if (aborted) return;
			if (!current()) {
				reason = "La connexion a changé pendant le transfert.";
				abort();
				return;
			}
			for (const row of plan.drafts) tx.objectStore("drafts").put({
				...row,
				key: key$1(row)
			});
			for (const row of plan.blobs) tx.objectStore(BLOBS).put({
				...row,
				key: blobKey(row)
			});
			for (const row of plan.snapshots) tx.objectStore("snapshots").put(row);
		};
		const checked = (valid) => {
			if (aborted) return;
			if (!valid || !current()) {
				abort();
				return;
			}
			if (--left === 0) write();
		};
		for (const check of plan.draftChecks) {
			const request = tx.objectStore("drafts").get(key$1(check.identity));
			request.onsuccess = () => checked(draftState(request.result) === draftState(check.expected));
		}
		for (const check of plan.blobChecks) {
			const request = tx.objectStore(BLOBS).get(blobKey(check.identity));
			request.onsuccess = () => checked(blobState(request.result) === blobState(check.expected));
		}
		for (const check of plan.snapshotChecks) {
			const request = tx.objectStore("snapshots").get(check.key);
			request.onsuccess = () => checked(JSON.stringify(request.result) === JSON.stringify(check.expected));
		}
		if (!left) write();
		tx.oncomplete = () => {
			db.close();
			resolve();
		};
		tx.onabort = tx.onerror = () => {
			db.close();
			reject(tx.error ?? new Error(reason));
		};
	});
}
//#endregion
//#region src/lib/paperAssets.ts
/** A matching attachment ID in a different note is never a reference to this note's image. */
function resolvePaperPhotoReference(document, src) {
	if (!src.startsWith("dowze-photo:")) return { kind: "external" };
	const reference = parsePhotoReference(src);
	if (!reference) return {
		kind: "unavailable",
		reason: "malformed",
		message: "Cette référence d’image doit être récupérée avant son affichage. Son texte original reste conservé."
	};
	const canonical = notebookDocumentId(document.noteId), board = noteBoardId(document.noteId), legacyProved = document.legacy.boardId === board;
	if (!(reference.documentId === canonical || legacyProved && (reference.documentId === board || reference.documentId === legacyNotebookDocumentId(document.noteId)))) return {
		kind: "unavailable",
		reason: "foreign-note",
		message: "Cette image fait référence à un autre carnet. Elle n’est pas remplacée par une image de cette note."
	};
	const asset = document.assets.find((row) => row.id === reference.id);
	return asset ? {
		kind: "asset",
		asset,
		reference
	} : {
		kind: "unavailable",
		reason: "missing-file",
		message: "Le fichier de cette image n’est pas encore associé à la note. Son texte original reste conservé."
	};
}
var record = (value) => !!value && typeof value === "object" && !Array.isArray(value);
var descriptor = (asset) => JSON.stringify([
	asset.id,
	asset.serverId ?? null,
	asset.mediaType,
	asset.size
]);
var check$1 = (current) => {
	if (!current()) throw Error("Le carnet ou le compte a changé pendant le chargement du fichier.");
};
function validateManifest(asset, document, referenceDocumentId) {
	if (!document) return;
	if (!document.assets.some((row) => descriptor(row) === descriptor(asset))) throw Error("Cette pièce jointe ne correspond plus au carnet affiché.");
	if (referenceDocumentId) {
		const result = resolvePaperPhotoReference(document, `dowze-photo:${encodeURIComponent(referenceDocumentId)}/${encodeURIComponent(asset.id)}`);
		if (result.kind !== "asset") throw Error(result.kind === "unavailable" ? result.message : "La référence de cette image est incompatible.");
	}
}
async function documentProof(document, scope, current) {
	if (!document) return {
		draft: void 0,
		snapshots: []
	};
	const identity = {
		...scope,
		type: "whiteboard",
		documentId: notebookDocumentId(document.noteId)
	}, draft = await getDraft(identity);
	check$1(current);
	if (draft && (draft.accountId !== scope.accountId || draft.spaceId !== scope.spaceId || draft.documentId !== identity.documentId || !isPaperDocument(draft.content) || draft.content.noteId !== document.noteId)) throw Error("Ce carnet ne possède plus une identité prouvée. Ses fichiers restent conservés.");
	if (await readNotebookDeletionStatus(document.noteId, scope, current)) throw Error("Ce carnet a été supprimé. Ses fichiers conservés ne sont pas réassociés automatiquement.");
	check$1(current);
	const deletionKey = notebookDeletionKey(identity), deletion = await getSnapshot(deletionKey);
	check$1(current);
	if (deletion) throw Error("La suppression de ce carnet doit être départagée avant le chargement de ses fichiers.");
	const board = noteBoardId(document.noteId), ownerKey = `paper-legacy-owner|${scope.accountId}|${scope.spaceId}|whiteboard|${board}`, owner = await getSnapshot(ownerKey);
	check$1(current);
	if (owner && (owner.accountId !== scope.accountId || owner.spaceId !== scope.spaceId || !record(owner.value) || owner.value.schema !== 1 || owner.value.noteId !== document.noteId || owner.value.documentId !== identity.documentId || owner.value.boardId !== board || !Number.isFinite(Date.parse(String(owner.value.claimedAt))))) throw Error("L’ancien carnet de cette image appartient à une autre note ou doit être départagé. Aucun fichier n’est emprunté.");
	return {
		draft,
		snapshots: [{
			key: deletionKey,
			expected: void 0
		}, {
			key: ownerKey,
			expected: owner
		}]
	};
}
/** Files stay scoped to the captured owner/year. A late download cannot overwrite another original. */
async function readPaperAsset(asset, media, context = {}) {
	const scope = {
		accountId: media.accountId,
		spaceId: media.spaceId
	}, current = context.current ?? (() => true);
	check$1(current);
	validateManifest(asset, context.document, context.referenceDocumentId);
	let proof = await documentProof(context.document, scope, current);
	check$1(current);
	const files = await listLocalBlobs(scope.accountId, scope.spaceId);
	check$1(current);
	const local = files.find((file) => file.id === asset.id);
	const validateLocal = (file) => {
		if (!file) return;
		if (file.accountId !== scope.accountId || file.spaceId !== scope.spaceId || asset.serverId && file.serverId !== asset.serverId) throw Error(`Le fichier « ${asset.name} » ne correspond pas à l’original attendu. Aucun fichier n’est remplacé.`);
		if (asset.size > 0 && file.blob.size !== asset.size) throw Error(`Le fichier « ${asset.name} » possède une autre taille que l’original conservé.`);
		if (context.document && file.documentId) {
			const noteId = context.document.noteId, board = noteBoardId(noteId);
			if (!(/* @__PURE__ */ new Set([notebookDocumentId(noteId), ...context.document.legacy.boardId === board ? [
				board,
				legacyNotebookDocumentId(noteId),
				`paper-v3-${noteId}`,
				noteId
			] : []])).has(file.documentId)) throw Error("Ce fichier est associé à un autre carnet. Il n’est pas utilisé à la place de votre image.");
		}
	};
	validateLocal(local);
	if (local) {
		check$1(current);
		return local.blob;
	}
	if (!asset.serverId || !media.api) throw Error(`Le fichier « ${asset.name} » attend son téléchargement. Connectez cet appareil pour retrouver l’original.`);
	let downloaded;
	try {
		downloaded = await media.api.downloadBlob(scope.spaceId, asset.serverId);
	} catch (error) {
		check$1(current);
		throw new Error(`Le fichier « ${asset.name} » n’a pas pu être téléchargé. L’original reste conservé ; réessayez après la reconnexion.`, { cause: error });
	}
	check$1(current);
	const blob = new Blob([downloaded], { type: asset.mediaType });
	if (asset.size > 0 && blob.size !== asset.size) throw Error(`Le téléchargement de « ${asset.name} » ne correspond pas à la taille de l’original.`);
	const sha256 = await localBlobDigest(blob);
	check$1(current);
	const identity = context.document ? {
		...scope,
		type: "whiteboard",
		documentId: notebookDocumentId(context.document.noteId)
	} : void 0;
	const cached = {
		...scope,
		id: asset.id,
		blob,
		name: asset.name,
		createdAt: Date.now(),
		status: "uploaded",
		serverId: asset.serverId,
		sha256,
		revision: 1,
		...identity ? { documentId: identity.documentId } : {}
	};
	for (let attempt = 0; attempt < 3; attempt++) try {
		await commitNotebookTransfer({
			target: scope,
			sources: [scope],
			drafts: [],
			blobs: [cached],
			snapshots: [],
			draftChecks: identity ? [{
				identity,
				expected: proof.draft
			}] : [],
			blobChecks: [{
				identity: {
					...scope,
					id: asset.id
				},
				expected: void 0
			}],
			snapshotChecks: proof.snapshots
		}, current);
		check$1(current);
		return blob;
	} catch (error) {
		check$1(current);
		const latest = (await listLocalBlobs(scope.accountId, scope.spaceId)).find((file) => file.id === asset.id);
		check$1(current);
		validateLocal(latest);
		if (latest) {
			const latestSha = await localBlobDigest(latest.blob);
			check$1(current);
			if (latestSha === sha256) {
				await documentProof(context.document, scope, current);
				check$1(current);
				return latest.blob;
			}
		}
		if (!latest && context.document && attempt < 2) {
			proof = await documentProof(context.document, scope, current);
			check$1(current);
			continue;
		}
		throw new Error(`Le carnet ou le fichier « ${asset.name} » a changé pendant son chargement. Aucun original n’a été remplacé.`, { cause: error });
	}
	throw Error("Le fichier attend une nouvelle tentative de chargement.");
}
//#endregion
//#region src/lib/paperCodeHighlight.ts
var parsers = /* @__PURE__ */ new Map();
var pending = /* @__PURE__ */ new Map();
var normalize = (language) => language.trim().toLowerCase();
function loadPaperCodeLanguage(language) {
	const name = normalize(language);
	if (parsers.has(name)) return Promise.resolve();
	const current = pending.get(name);
	if (current) return current;
	const description = languages.find((d) => normalize(d.name) === name || d.alias.some((alias) => normalize(alias) === name));
	if (!description) return Promise.resolve();
	const loading = description.load().then((support) => {
		parsers.set(name, support.language.parser);
	}).catch(() => void 0);
	pending.set(name, loading);
	return loading;
}
/** Parsing changes colours only; the complete code remains editable/exportable as text. */
function paperCodeRanges(code, language) {
	const parser = parsers.get(normalize(language));
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
var _jsxFileName$4 = "/home/louis/DowzeBuild/20260923/collections-060/src/components/PaperCodeText.tsx";
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
			fileName: _jsxFileName$4,
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
		fileName: _jsxFileName$4,
		lineNumber: 8,
		columnNumber: 63
	}, this);
}
//#endregion
//#region src/lib/paperTextSourceMap.ts
var bounds = (node) => {
	const from = node.position?.start.offset, to = node.position?.end.offset;
	return typeof from === "number" && typeof to === "number" ? {
		from,
		to
	} : null;
};
var classes = (node) => Array.isArray(node.properties.className) ? node.properties.className : [];
var math$1 = (node) => classes(node).some((c) => [
	"language-math",
	"math-inline",
	"math-display"
].includes(String(c)));
var marker = (child, tag, atomic = false) => {
	const range = bounds(child);
	return {
		type: "element",
		tagName: tag,
		properties: {
			"data-md-from": range.from,
			"data-md-to": range.to,
			...atomic ? { "data-md-atomic": "true" } : {}
		},
		children: [child]
	};
};
/** Positions are derived from the parser, never from searching repeated words in the note. */
function rehypePaperSourceMap() {
	return (tree) => {
		const walk = (parent) => {
			parent.children = parent.children.map((child) => {
				if (child.type === "text" && bounds(child)) return marker(child, "span");
				if (child.type !== "element") return child;
				const range = bounds(child);
				if (range && (child.tagName === "pre" && child.children.some((n) => n.type === "element" && math$1(n)) || math$1(child))) return marker(child, child.tagName === "pre" ? "div" : "span", true);
				if (range && child.tagName === "img") return marker(child, "span", true);
				if (range && child.tagName === "code") {
					Object.assign(child.properties, {
						"data-md-from": range.from,
						"data-md-to": range.to,
						"data-md-mode": "code"
					});
					return child;
				}
				walk(child);
				return child;
			});
		};
		walk(tree);
	};
}
//#endregion
//#region src/components/PaperObjectVisual.tsx
var _jsxFileName$3 = "/home/louis/DowzeBuild/20260923/collections-060/src/components/PaperObjectVisual.tsx";
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
		fileName: _jsxFileName$3,
		lineNumber: 14,
		columnNumber: 64
	}, this);
}
function PaperAssetImage({ asset, media, document, referenceDocumentId, alt, title, current: viewCurrent, onReady, onError }) {
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
	return visible?.url ? /* @__PURE__ */ jsxDEV("img", {
		src: visible.url,
		alt: alt ?? asset.name,
		title,
		draggable: false,
		onLoad: () => {
			if (latest.current.stateKey === stateKey) latest.current.onReady?.();
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
		fileName: _jsxFileName$3,
		lineNumber: 23,
		columnNumber: 22
	}, this) : visible?.error ? /* @__PURE__ */ jsxDEV("span", {
		className: "paper-asset-missing",
		"data-image-error": "true",
		role: "status",
		title,
		children: [alt ? `${alt} — ` : "", visible.error]
	}, void 0, true, {
		fileName: _jsxFileName$3,
		lineNumber: 23,
		columnNumber: 436
	}, this) : /* @__PURE__ */ jsxDEV("span", {
		className: "paper-asset-missing",
		role: "status",
		children: "Image en cours de chargement…"
	}, void 0, false, {
		fileName: _jsxFileName$3,
		lineNumber: 23,
		columnNumber: 569
	}, this);
}
function PaperExternalImage({ src, alt, title, onError }) {
	const [failed, setFailed] = useState("");
	if (!src || failed === src) return /* @__PURE__ */ jsxDEV(PaperImageUnavailable, {
		message: "Cette image n’a pas pu être lue. Son texte original reste conservé.",
		alt,
		title,
		onError
	}, void 0, false, {
		fileName: _jsxFileName$3,
		lineNumber: 26,
		columnNumber: 69
	}, this);
	return /* @__PURE__ */ jsxDEV("img", {
		src,
		alt: alt ?? "Image dans la note",
		title,
		onError: () => setFailed(src)
	}, void 0, false, {
		fileName: _jsxFileName$3,
		lineNumber: 27,
		columnNumber: 9
	}, this);
}
memo(function PaperRichText({ markdown, document, media, onError }) {
	return /* @__PURE__ */ jsxDEV(ReactMarkdown, {
		remarkPlugins: [remarkGfm, remarkMath],
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
					fileName: _jsxFileName$3,
					lineNumber: 30,
					columnNumber: 427
				}, this) : /* @__PURE__ */ jsxDEV("code", {
					...properties,
					className,
					children
				}, void 0, false, {
					fileName: _jsxFileName$3,
					lineNumber: 30,
					columnNumber: 634
				}, this);
			},
			img: ({ src, alt, title }) => {
				const url = typeof src === "string" ? src : "", resolved = resolvePaperPhotoReference(document, url);
				return resolved.kind === "asset" ? /* @__PURE__ */ jsxDEV(PaperAssetImage, {
					asset: resolved.asset,
					document,
					referenceDocumentId: resolved.reference.documentId,
					media,
					alt,
					title,
					onError
				}, void 0, false, {
					fileName: _jsxFileName$3,
					lineNumber: 30,
					columnNumber: 842
				}, this) : resolved.kind === "unavailable" ? /* @__PURE__ */ jsxDEV(PaperImageUnavailable, {
					message: resolved.message,
					alt,
					title,
					onError
				}, void 0, false, {
					fileName: _jsxFileName$3,
					lineNumber: 30,
					columnNumber: 1042
				}, this) : /* @__PURE__ */ jsxDEV(PaperExternalImage, {
					src: url,
					alt,
					title,
					onError
				}, void 0, false, {
					fileName: _jsxFileName$3,
					lineNumber: 30,
					columnNumber: 1136
				}, this);
			}
		},
		children: markdown
	}, void 0, false, {
		fileName: _jsxFileName$3,
		lineNumber: 30,
		columnNumber: 9
	}, this);
}, (previous, next) => previous.markdown === next.markdown && previous.onError === next.onError && previous.media.accountId === next.media.accountId && previous.media.spaceId === next.media.spaceId && previous.media.api === next.media.api && previous.document.noteId === next.document.noteId && previous.document.legacy.boardId === next.document.legacy.boardId && previous.document.assets.length === next.document.assets.length && previous.document.assets.every((asset, i) => {
	const other = next.document.assets[i];
	return asset.id === other.id && asset.name === other.name && asset.mediaType === other.mediaType && asset.serverId === other.serverId && asset.size === other.size;
}));
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
		const root = createRoot$1(dom);
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
//#endregion
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
		noteId
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
			lineNumber: 91,
			columnNumber: 76
		}, this));
	}, [paperTools, readOnly]);
	useEffect(() => {
		if (!isReady || externalMarkdown === void 0 || externalMarkdown === lastExternalRef.current) return;
		const crepe = crepeRef.current;
		if (!crepe || !createdRef.current) return;
		const current = crepe.getMarkdown();
		const view = crepe.editor.action((ctx) => ctx.get(editorViewCtx$1));
		if (pendingMarkdownRef.current !== null || view.composing || current !== lastPersistedRef.current) return;
		if (current !== externalMarkdown) {
			const viewport = view.dom.closest(".paper-viewport"), top = viewport?.scrollTop, left = viewport?.scrollLeft;
			try {
				crepe.editor.action((ctx) => {
					const parsed = ctx.get(parserCtx$1)(externalMarkdown);
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
					const view = ctx.get(editorViewCtx$1), body = root.closest(".paper-flow-source");
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
					toolsRoot.current = createRoot$1(slot);
					imageInsertRef.current = async (file) => {
						try {
							const src = await uploadEmbeddedImage(file);
							if (disposed || !crepe) return;
							crepe.editor.action(insert(`![${file.name.replace(/[\[\]\\]/g, "")}](${src})\n\n`));
							crepe.editor.action((ctx) => ctx.get(editorViewCtx$1).focus());
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
						lineNumber: 326,
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
		media?.api
	]);
	return /* @__PURE__ */ jsxDEV("div", {
		className: "markdown-editor-shell studio-tools",
		children: [
			/* @__PURE__ */ jsxDEV("div", {
				className: "studio-editor-help",
				children: [/* @__PURE__ */ jsxDEV("span", { children: "Écrivez et structurez vos idées" }, void 0, false, {
					fileName: _jsxFileName,
					lineNumber: 355,
					columnNumber: 93
				}, this), /* @__PURE__ */ jsxDEV("small", { children: "Sélectionnez du texte pour le mettre en forme · / pour insérer un bloc" }, void 0, false, {
					fileName: _jsxFileName,
					lineNumber: 355,
					columnNumber: 137
				}, this)]
			}, void 0, true, {
				fileName: _jsxFileName,
				lineNumber: 355,
				columnNumber: 57
			}, this),
			!isReady && !error && /* @__PURE__ */ jsxDEV("div", {
				className: "markdown-editor-loading",
				role: "status",
				children: [/* @__PURE__ */ jsxDEV(LoaderCircle, {}, void 0, false, {
					fileName: _jsxFileName,
					lineNumber: 358,
					columnNumber: 11
				}, this), " Chargement de l’éditeur…"]
			}, void 0, true, {
				fileName: _jsxFileName,
				lineNumber: 357,
				columnNumber: 9
			}, this),
			error && /* @__PURE__ */ jsxDEV("div", {
				className: "markdown-editor-error",
				role: "alert",
				children: [
					/* @__PURE__ */ jsxDEV(AlertCircle, {}, void 0, false, {
						fileName: _jsxFileName,
						lineNumber: 363,
						columnNumber: 11
					}, this),
					" ",
					/* @__PURE__ */ jsxDEV("span", { children: error }, void 0, false, {
						fileName: _jsxFileName,
						lineNumber: 363,
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
						lineNumber: 364,
						columnNumber: 11
					}, this)
				]
			}, void 0, true, {
				fileName: _jsxFileName,
				lineNumber: 362,
				columnNumber: 9
			}, this),
			creationFailed && /* @__PURE__ */ jsxDEV("label", {
				className: "form-field",
				children: [
					/* @__PURE__ */ jsxDEV("span", { children: "Édition en texte Markdown" }, void 0, false, {
						fileName: _jsxFileName,
						lineNumber: 377,
						columnNumber: 9
					}, this),
					/* @__PURE__ */ jsxDEV("small", { children: "Vous pouvez continuer à écrire ici et enregistrer votre note pendant que l’éditeur est indisponible." }, void 0, false, {
						fileName: _jsxFileName,
						lineNumber: 378,
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
						lineNumber: 379,
						columnNumber: 9
					}, this)
				]
			}, void 0, true, {
				fileName: _jsxFileName,
				lineNumber: 376,
				columnNumber: 26
			}, this),
			/* @__PURE__ */ jsxDEV("div", {
				className: "markdown-editor-root",
				ref: rootRef,
				"data-note-id": noteId
			}, void 0, false, {
				fileName: _jsxFileName,
				lineNumber: 385,
				columnNumber: 7
			}, this)
		]
	}, void 0, true, {
		fileName: _jsxFileName,
		lineNumber: 355,
		columnNumber: 5
	}, this);
}
//#endregion
export { Editor, MarkdownNoteEditor, act, commonmark, createElement, createRoot, defaultValueCtx, editorViewCtx, flushSync, getDraft, listLocalBlobs, migratePaper, notePhotoPlugins, notebookDocumentId, parserCtx, putDraft, putLocalBlob, resolveEditorPaperPhoto, rootCtx, serializerCtx };
