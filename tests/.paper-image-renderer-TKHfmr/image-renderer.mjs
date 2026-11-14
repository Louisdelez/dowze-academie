import { act, createElement, memo, useEffect, useRef, useState } from "react";
import { languages } from "@codemirror/language-data";
import { classHighlighter, highlightTree } from "@lezer/highlight";
import { jsx, jsxs } from "react/jsx-runtime";
import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { renderToStaticMarkup } from "react-dom/server";
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
		output.push(/* @__PURE__ */ jsx("span", {
			className: range.className,
			children: code.slice(range.from, range.to)
		}, range.from + "-" + range.to));
		offset = range.to;
	}
	if (offset < code.length) output.push(code.slice(offset));
	return /* @__PURE__ */ jsx("code", {
		"data-md-from": Number.isSafeInteger(sourceFrom) ? sourceFrom : void 0,
		"data-md-to": Number.isSafeInteger(sourceTo) ? sourceTo : void 0,
		"data-md-mode": "code",
		"data-code-ready": String(ready),
		className: "language-" + language,
		children: output
	});
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
var math = (node) => classes(node).some((c) => [
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
				if (range && (child.tagName === "pre" && child.children.some((n) => n.type === "element" && math(n)) || math(child))) return marker(child, child.tagName === "pre" ? "div" : "span", true);
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
function legacyEntityIds(noteId, prefix, values) {
	const reserved = new Set(values.map((value) => `${prefix}${value.sourceId}`).filter(id)), used = /* @__PURE__ */ new Set(), occurrences = /* @__PURE__ */ new Map();
	return values.map((value) => {
		const preferred = `${prefix}${value.sourceId}`, identity = value.identity ?? value.sourceId, occurrence = occurrences.get(identity) ?? 0;
		occurrences.set(identity, occurrence + 1);
		if (id(preferred) && !used.has(preferred)) {
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
	const entries = [...variants.entries()], allocated = legacyEntityIds(noteId, "", entries.map(([, value]) => value)), ids = new Map(entries.map(([identity], index) => [identity, allocated[index]]));
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
		let inline = false;
		try {
			const reference = photoReference(noteBoardId(noteId), identity.sourceId);
			inline = identity.assetId === identity.sourceId && !!parsePhotoReference(reference) && markdown.includes(reference);
		} catch {}
		if (!inline) objects.push({
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
var key = (v) => `${v.accountId}|${v.spaceId}|${v.type ?? "notesMarkdown"}|${v.documentId}`;
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
				if (value.key !== key(value)) {
					row.delete();
					drafts.put({
						...value,
						key: key(value)
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
		const tx = db.transaction("drafts", "readwrite"), store = tx.objectStore("drafts"), read = store.get(key(draft));
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
				key: key(draft),
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
	return run("drafts", "readonly", (s) => s.get(key(draftKey)));
}
async function getSnapshot(snapshotKey) {
	return run("snapshots", "readonly", (s) => s.get(snapshotKey));
}
var notebookDeletionKey = (identity) => `paper-canonical-deletion|${key({
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
	if (plan.drafts.some((row) => !plan.draftChecks.some((check) => key(check.identity) === key(row))) || plan.blobs.some((row) => !plan.blobChecks.some((check) => blobKey(check.identity) === blobKey(row))) || plan.snapshots.some((row) => !plan.snapshotChecks.some((check) => check.key === row.key))) throw Error("Le transfert doit vérifier chaque destination.");
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
				key: key(row)
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
			const request = tx.objectStore("drafts").get(key(check.identity));
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
		message: "Cette référence d’image doit être récupérée avant son affichage. Son texte original reste conservé."
	};
	const canonical = notebookDocumentId(document.noteId), board = noteBoardId(document.noteId), legacyProved = document.legacy.boardId === board;
	if (!(reference.documentId === canonical || legacyProved && (reference.documentId === board || reference.documentId === legacyNotebookDocumentId(document.noteId)))) return {
		kind: "unavailable",
		message: "Cette image fait référence à un autre carnet. Elle n’est pas remplacée par une image de cette note."
	};
	const asset = document.assets.find((row) => row.id === reference.id);
	return asset ? {
		kind: "asset",
		asset,
		reference
	} : {
		kind: "unavailable",
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
var check = (current) => {
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
	check(current);
	if (draft && (draft.accountId !== scope.accountId || draft.spaceId !== scope.spaceId || draft.documentId !== identity.documentId || !isPaperDocument(draft.content) || draft.content.noteId !== document.noteId)) throw Error("Ce carnet ne possède plus une identité prouvée. Ses fichiers restent conservés.");
	if (await readNotebookDeletionStatus(document.noteId, scope, current)) throw Error("Ce carnet a été supprimé. Ses fichiers conservés ne sont pas réassociés automatiquement.");
	check(current);
	const deletionKey = notebookDeletionKey(identity), deletion = await getSnapshot(deletionKey);
	check(current);
	if (deletion) throw Error("La suppression de ce carnet doit être départagée avant le chargement de ses fichiers.");
	const board = noteBoardId(document.noteId), ownerKey = `paper-legacy-owner|${scope.accountId}|${scope.spaceId}|whiteboard|${board}`, owner = await getSnapshot(ownerKey);
	check(current);
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
	check(current);
	validateManifest(asset, context.document, context.referenceDocumentId);
	let proof = await documentProof(context.document, scope, current);
	check(current);
	const files = await listLocalBlobs(scope.accountId, scope.spaceId);
	check(current);
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
		check(current);
		return local.blob;
	}
	if (!asset.serverId || !media.api) throw Error(`Le fichier « ${asset.name} » attend son téléchargement. Connectez cet appareil pour retrouver l’original.`);
	let downloaded;
	try {
		downloaded = await media.api.downloadBlob(scope.spaceId, asset.serverId);
	} catch (error) {
		check(current);
		throw new Error(`Le fichier « ${asset.name} » n’a pas pu être téléchargé. L’original reste conservé ; réessayez après la reconnexion.`, { cause: error });
	}
	check(current);
	const blob = new Blob([downloaded], { type: asset.mediaType });
	if (asset.size > 0 && blob.size !== asset.size) throw Error(`Le téléchargement de « ${asset.name} » ne correspond pas à la taille de l’original.`);
	const sha256 = await localBlobDigest(blob);
	check(current);
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
		check(current);
		return blob;
	} catch (error) {
		check(current);
		const latest = (await listLocalBlobs(scope.accountId, scope.spaceId)).find((file) => file.id === asset.id);
		check(current);
		validateLocal(latest);
		if (latest) {
			const latestSha = await localBlobDigest(latest.blob);
			check(current);
			if (latestSha === sha256) {
				await documentProof(context.document, scope, current);
				check(current);
				return latest.blob;
			}
		}
		if (!latest && context.document && attempt < 2) {
			proof = await documentProof(context.document, scope, current);
			check(current);
			continue;
		}
		throw new Error(`Le carnet ou le fichier « ${asset.name} » a changé pendant son chargement. Aucun original n’a été remplacé.`, { cause: error });
	}
	throw Error("Le fichier attend une nouvelle tentative de chargement.");
}
//#endregion
//#region src/components/PaperObjectVisual.tsx
function PaperImageUnavailable({ message, alt, title, onError }) {
	useEffect(() => {
		onError?.(message);
	}, [message, onError]);
	return /* @__PURE__ */ jsxs("span", {
		className: "paper-asset-missing",
		"data-image-error": "true",
		role: "status",
		title,
		children: [alt ? `${alt} — ` : "", message]
	});
}
function PaperAssetImage({ asset, media, document, referenceDocumentId, alt, title, onReady, onError }) {
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
		onReady,
		onError
	});
	latest.current = {
		stateKey,
		api: media.api,
		document,
		onReady,
		onError
	};
	useEffect(() => {
		let cancelled = false, objectUrl = "";
		const current = () => !cancelled && latest.current.stateKey === stateKey && latest.current.api === media.api && (!latest.current.document || latest.current.document.assets.some((row) => row.id === asset.id && row.serverId === asset.serverId && row.mediaType === asset.mediaType && row.size === asset.size));
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
	const visible = state.key === stateKey ? state : void 0;
	return visible?.url ? /* @__PURE__ */ jsx("img", {
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
	}) : visible?.error ? /* @__PURE__ */ jsxs("span", {
		className: "paper-asset-missing",
		"data-image-error": "true",
		role: "status",
		title,
		children: [alt ? `${alt} — ` : "", visible.error]
	}) : /* @__PURE__ */ jsx("span", {
		className: "paper-asset-missing",
		role: "status",
		children: "Image en cours de chargement…"
	});
}
function PaperExternalImage({ src, alt, title, onError }) {
	const [failed, setFailed] = useState("");
	if (!src || failed === src) return /* @__PURE__ */ jsx(PaperImageUnavailable, {
		message: "Cette image n’a pas pu être lue. Son texte original reste conservé.",
		alt,
		title,
		onError
	});
	return /* @__PURE__ */ jsx("img", {
		src,
		alt: alt ?? "Image dans la note",
		title,
		onError: () => setFailed(src)
	});
}
var PaperRichText = memo(function PaperRichText({ markdown, document, media, onError }) {
	return /* @__PURE__ */ jsx(ReactMarkdown, {
		remarkPlugins: [remarkGfm, remarkMath],
		rehypePlugins: [rehypePaperSourceMap, [rehypeKatex, { throwOnError: false }]],
		urlTransform: (src) => src.startsWith("dowze-photo:") || /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=\s]+$/.test(src) ? src : defaultUrlTransform(src),
		components: {
			code: ({ className, children, node, ...properties }) => {
				const language = /language-([^\s]+)/.exec(className ?? "")?.[1];
				return language ? /* @__PURE__ */ jsx(PaperCodeText, {
					code: String(children),
					language,
					sourceFrom: Number(properties["data-md-from"]),
					sourceTo: Number(properties["data-md-to"])
				}) : /* @__PURE__ */ jsx("code", {
					...properties,
					className,
					children
				});
			},
			img: ({ src, alt, title }) => {
				const url = typeof src === "string" ? src : "", resolved = resolvePaperPhotoReference(document, url);
				return resolved.kind === "asset" ? /* @__PURE__ */ jsx(PaperAssetImage, {
					asset: resolved.asset,
					document,
					referenceDocumentId: resolved.reference.documentId,
					media,
					alt,
					title,
					onError
				}) : resolved.kind === "unavailable" ? /* @__PURE__ */ jsx(PaperImageUnavailable, {
					message: resolved.message,
					alt,
					title,
					onError
				}) : /* @__PURE__ */ jsx(PaperExternalImage, {
					src: url,
					alt,
					title,
					onError
				});
			}
		},
		children: markdown
	});
}, (previous, next) => previous.markdown === next.markdown && previous.onError === next.onError && previous.media.accountId === next.media.accountId && previous.media.spaceId === next.media.spaceId && previous.media.api === next.media.api && previous.document.noteId === next.document.noteId && previous.document.legacy.boardId === next.document.legacy.boardId && previous.document.assets.length === next.document.assets.length && previous.document.assets.every((asset, i) => {
	const other = next.document.assets[i];
	return asset.id === other.id && asset.name === other.name && asset.mediaType === other.mediaType && asset.serverId === other.serverId && asset.size === other.size;
}));
//#endregion
export { PaperAssetImage, PaperRichText, act, createElement, createRoot, flushSync, listLocalBlobs, migratePaper, notebookDocumentId, putDraft, putLocalBlob, renderToStaticMarkup };
