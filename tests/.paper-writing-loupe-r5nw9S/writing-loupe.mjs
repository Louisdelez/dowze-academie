import { Suspense, act, createElement, createRef, forwardRef, lazy, memo, useEffect, useId, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { languages } from "@codemirror/language-data";
import { classHighlighter, highlightTree } from "@lezer/highlight";
import { decodeString } from "micromark-util-decode-string";
import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { fromMarkdown } from "mdast-util-from-markdown";
import { parse, postprocess, preprocess } from "micromark";
import { gfm } from "micromark-extension-gfm";
import { gfmFromMarkdown } from "mdast-util-gfm";
import { math } from "micromark-extension-math";
import { mathFromMarkdown } from "mdast-util-math";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
//#region src/components/PaperBackground.tsx
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
	return /* @__PURE__ */ jsx("svg", {
		className: "paper-background",
		viewBox: `0 0 ${visualPage.width} ${visualPage.height}`,
		preserveAspectRatio: "none",
		"aria-hidden": "true",
		children: /* @__PURE__ */ jsxs("g", {
			transform: turn,
			children: [
				/* @__PURE__ */ jsx("defs", { children: /* @__PURE__ */ jsx("pattern", {
					id,
					width: spacing,
					height: spacing,
					patternUnits: "userSpaceOnUse",
					children: page.pattern === "dots" ? /* @__PURE__ */ jsx("circle", {
						cx: spacing / 2,
						cy: spacing / 2,
						r: ".9",
						fill: line,
						opacity: ".6"
					}) : page.pattern === "grid" ? /* @__PURE__ */ jsx("path", {
						d: `M ${spacing} 0 H 0 V ${spacing}`,
						fill: "none",
						stroke: line,
						strokeWidth: ".65",
						opacity: ".4"
					}) : page.pattern === "ruled" ? /* @__PURE__ */ jsx("path", {
						d: `M 0 ${spacing - .5} H ${spacing}`,
						stroke: line,
						strokeWidth: ".7",
						opacity: ".4"
					}) : null
				}) }),
				template === "standard" && page.pattern !== "plain" && /* @__PURE__ */ jsx("rect", {
					width: page.width,
					height: page.height,
					fill: `url(#${id})`
				}),
				template === "cornell" && /* @__PURE__ */ jsxs(Fragment, { children: [
					/* @__PURE__ */ jsx("rect", {
						x: margin,
						y: 88,
						width: Math.max(0, page.width - 96),
						height: Math.max(0, page.height - 96 - 160),
						fill: `url(#${id})`
					}),
					/* @__PURE__ */ jsx("path", {
						d: `M ${margin} 88 H ${page.width - margin} M ${page.width * .27} 88 V ${page.height - margin - 120} M ${margin} ${page.height - margin - 120} H ${page.width - margin}`,
						fill: "none",
						stroke: line,
						strokeWidth: "1"
					}),
					/* @__PURE__ */ jsxs("g", {
						fill: line,
						fontSize: "12",
						children: [
							/* @__PURE__ */ jsx("text", {
								x: margin,
								y: 66,
								children: "Sujet · Date"
							}),
							/* @__PURE__ */ jsx("text", {
								x: 56,
								y: 113,
								children: "Repères"
							}),
							/* @__PURE__ */ jsx("text", {
								x: page.width * .27 + 12,
								y: 113,
								children: "Notes"
							}),
							/* @__PURE__ */ jsx("text", {
								x: 56,
								y: page.height - margin - 100,
								children: "Synthèse"
							})
						]
					})
				] }),
				template === "music" && Array.from({ length: Math.max(0, Math.min(40, Math.floor((page.height - 96) / (spacing * 8)))) }, (_, staff) => /* @__PURE__ */ jsx("g", { children: Array.from({ length: 5 }, (_, i) => /* @__PURE__ */ jsx("path", {
					d: `M ${margin} ${margin + staff * spacing * 8 + i * spacing / 2} H ${page.width - margin}`,
					stroke: line,
					strokeWidth: ".9"
				}, i)) }, staff)),
				template === "weekly" && /* @__PURE__ */ jsxs(Fragment, { children: [/* @__PURE__ */ jsx("g", {
					fill: line,
					fontSize: "16",
					children: /* @__PURE__ */ jsx("text", {
						x: margin,
						y: margin,
						children: "Ma semaine"
					})
				}), [
					"Lundi",
					"Mardi",
					"Mercredi",
					"Jeudi",
					"Vendredi",
					"Samedi",
					"Dimanche"
				].map((day, i) => {
					const top = 78 + i * (page.height - 96 - 30) / 7;
					return /* @__PURE__ */ jsxs("g", { children: [/* @__PURE__ */ jsx("rect", {
						x: margin,
						y: top,
						width: page.width - 96,
						height: (page.height - 96 - 30) / 7,
						fill: "none",
						stroke: line,
						strokeWidth: ".7"
					}), /* @__PURE__ */ jsx("text", {
						x: 60,
						y: top + 20,
						fontSize: "12",
						fill: line,
						children: day
					})] }, day);
				})] })
			]
		})
	});
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
/** UTF-16 source positions, matching Y.Text and DOM Range offsets. Escapes/entities remain one source token. */
function renderedMarkdownOffsets(raw, rendered, mode = "text") {
	let from = 0, to = raw.length, inline = false;
	if (mode === "code") {
		const fence = /^ {0,3}(`{3,}|~{3,})[^\r\n]*(?:\r\n|\n|\r)/.exec(raw);
		if (fence) {
			from = fence[0].length;
			const closing = /(?:\r\n|\n|\r)[ \t]*(`{3,}|~{3,})[ \t]*$/.exec(raw);
			if (closing) to = closing.index;
		} else if (raw.startsWith("`")) {
			inline = true;
			const edge = /^`+/.exec(raw)[0].length;
			from = edge;
			to = Math.max(from, raw.length - edge);
			if (raw[from] === " " && raw[to - 1] === " " && raw.slice(from, to).trim()) {
				from++;
				to--;
			}
		}
	}
	const offsets = [];
	let decoded = "", i = from;
	while (i < to) {
		let token = raw[i], length = 1;
		if (raw[i] === "\r") {
			length = raw[i + 1] === "\n" ? 2 : 1;
			token = inline ? " " : "\n";
		} else if (inline && raw[i] === "\n") token = " ";
		else if (mode !== "code") {
			const candidate = /^(?:\\[!-/:-@\[-`{-~]|&(?:#(?:\d{1,7}|x[\da-f]{1,6})|[\da-z]{1,31});)/i.exec(raw.slice(i, to));
			if (candidate) {
				token = decodeString(candidate[0]);
				length = candidate[0].length;
			}
		}
		for (let unit = 0; unit < token.length; unit++) offsets.push(i);
		decoded += token;
		i += length;
	}
	if (mode === "code" && rendered === decoded + "\n") {
		offsets.push(to);
		decoded += "\n";
	}
	if (mode === "code" && decoded !== rendered) {
		let value = "", indices = [];
		let cursor = from;
		for (const line of raw.slice(from, to).match(/[^\r\n]*(?:\r\n|\r|\n|$)/g).filter((line) => line.length)) {
			const prefix = /^(?: {4}|\t)/.exec(line)?.[0].length ?? 0;
			for (let j = prefix; j < line.length; j++) {
				indices.push(cursor + j);
				if (line[j] === "\r") {
					value += "\n";
					if (line[j + 1] === "\n") j++;
				} else value += line[j];
			}
			cursor += line.length;
		}
		if (rendered === value + "\n") {
			indices.push(to);
			value += "\n";
		}
		if (value !== rendered) return null;
		indices.push(to);
		return indices;
	}
	if (decoded !== rendered) return null;
	offsets.push(to);
	return offsets;
}
var bounds$1 = (node) => {
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
	const range = bounds$1(child);
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
				if (child.type === "text" && bounds$1(child)) return marker(child, "span");
				if (child.type !== "element") return child;
				const range = bounds$1(child);
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
/** Locate each painted page boundary in the canonical source. Only crossing text nodes need character-level binary search. */
function measureMarkdownPageOffsets(source, markdown, breaks, scale) {
	const root = source.getBoundingClientRect(), cuts = breaks.slice(1, -1).map(() => markdown.length);
	let mapped = false;
	const consider = (from, top) => {
		for (let i = 0; i < cuts.length; i++) if (top >= breaks[i + 1] - .1) cuts[i] = Math.min(cuts[i], from);
	};
	for (const element of source.querySelectorAll("[data-md-atomic]")) {
		const from = Number(element.dataset.mdFrom), rect = element.getBoundingClientRect();
		if (Number.isSafeInteger(from) && rect.height > 0) {
			consider(from, (rect.top - root.top) / scale);
			mapped = true;
		}
	}
	const walker = document.createTreeWalker(source, NodeFilter.SHOW_TEXT), cache = /* @__PURE__ */ new Map();
	let count = 0;
	while (walker.nextNode()) {
		if (++count > 1e5) throw Error("Le texte est trop complexe pour une opération de page immédiate.");
		const node = walker.currentNode;
		const owner = node.parentElement?.closest("[data-md-from]");
		if (!owner || owner.closest("[data-md-atomic]") || !node.textContent?.length) continue;
		const from = Number(owner.dataset.mdFrom), to = Number(owner.dataset.mdTo);
		if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to) || from < 0 || to > markdown.length || to < from) continue;
		if (!cache.has(owner)) cache.set(owner, renderedMarkdownOffsets(markdown.slice(from, to), owner.textContent ?? "", owner.dataset.mdMode));
		const mapping = cache.get(owner);
		if (!mapping) continue;
		const prefix = document.createRange();
		prefix.setStart(owner, 0);
		prefix.setEnd(node, 0);
		const local = prefix.toString().length;
		prefix.detach();
		const range = document.createRange();
		range.selectNodeContents(node);
		const rects = [...range.getClientRects()].filter((r) => r.height > 0 && r.width > 0);
		if (!rects.length) {
			range.detach();
			continue;
		}
		mapped = true;
		const top = Math.min(...rects.map((r) => (r.top - root.top) / scale)), bottom = Math.max(...rects.map((r) => (r.bottom - root.top) / scale));
		for (let i = 0; i < cuts.length; i++) {
			const boundary = breaks[i + 1];
			if (bottom <= boundary + .1) continue;
			if (top >= boundary - .1) {
				cuts[i] = Math.min(cuts[i], from + mapping[local]);
				continue;
			}
			let low = 0, high = node.length;
			while (low < high) {
				const middle = Math.floor((low + high) / 2);
				range.setStart(node, middle);
				range.setEnd(node, middle + 1);
				if ((range.getBoundingClientRect().top - root.top) / scale >= boundary - .1) high = middle;
				else low = middle + 1;
			}
			if (low < node.length) cuts[i] = Math.min(cuts[i], from + mapping[local + low]);
		}
		range.detach();
	}
	if (!mapped && markdown.length) return void 0;
	const offsets = [
		0,
		...cuts,
		markdown.length
	];
	return offsets.every((n, i) => Number.isSafeInteger(n) && n >= 0 && (i === 0 || n >= offsets[i - 1])) ? offsets : void 0;
}
//#endregion
//#region src/lib/paperStudy.ts
var emptyStudy = () => ({
	schema: 1,
	language: "fr",
	cards: []
});
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
/** SM-2 intervals and ease update; same-day retry is handled by the review session queue. */
function reviewStudyCard(card, quality, reviewId, now = (/* @__PURE__ */ new Date()).toISOString()) {
	if (card.reviews.some((r) => r.id === reviewId)) return card;
	if (!Number.isInteger(quality) || quality < 0 || quality > 5 || !date(now)) throw Error("Évaluation de la carte invalide.");
	const old = card.schedule;
	const intervalDays = quality < 3 ? 1 : old.repetitions === 0 ? 1 : old.repetitions === 1 ? 6 : Math.ceil(old.intervalDays * old.ease);
	const ease = Math.max(1.3, Math.min(10, old.ease + .1 - (5 - quality) * (.08 + (5 - quality) * .02)));
	const next = {
		...card,
		schedule: {
			repetitions: quality < 3 ? 0 : old.repetitions + 1,
			intervalDays,
			ease,
			dueAt: new Date(Date.parse(now) + intervalDays * 864e5).toISOString()
		},
		reviews: [...card.reviews.slice(-999), {
			id: reviewId,
			at: now,
			quality
		}]
	};
	if (!isPaperStudy({
		schema: 1,
		language: "fr",
		cards: [next]
	})) throw Error("Progression de révision invalide.");
	return next;
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
var bounds = (node) => {
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
		const { from, to } = bounds(node), token = tokens.get(`definition:${from}:${to}`);
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
		const { from, to } = bounds(node), token = tokens.get(`image:${from}:${to}`), definition = node.type === "imageReference" && node.identifier ? firstDefinition.get(node.identifier) : void 0;
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
//#region src/lib/paperGeometry.ts
function inkOutline(points, width, constant = false) {
	if (!points.length) return "";
	const left = [], right = [];
	for (let i = 0; i < points.length; i++) {
		const p = points[i], before = points[Math.max(0, i - 1)], after = points[Math.min(points.length - 1, i + 1)], dx = after.x - before.x, dy = after.y - before.y, len = Math.hypot(dx, dy) || 1, r = width * (constant ? .5 : Math.max(.15, p.pressure ?? .5));
		left.push(`${p.x - dy / len * r},${p.y + dx / len * r}`);
		right.push(`${p.x + dy / len * r},${p.y - dx / len * r}`);
	}
	if (points.length === 1) {
		const p = points[0], r = width / 2;
		return `M${p.x - r} ${p.y}a${r} ${r} 0 1 0 ${r * 2} 0a${r} ${r} 0 1 0 ${-r * 2} 0`;
	}
	return `M${left.join("L")}L${right.reverse().join("L")}Z`;
}
function objectPoint(object, point) {
	const a = object.rotation * Math.PI / 180, cx = object.width / 2, cy = object.height / 2, dx = (point.x - cx) * (object.mirrorX ? -1 : 1), dy = (point.y - cy) * (object.mirrorY ? -1 : 1);
	return {
		x: object.x + cx + dx * Math.cos(a) - dy * Math.sin(a),
		y: object.y + cy + dx * Math.sin(a) + dy * Math.cos(a)
	};
}
/** Transform a visual nib direction; this is geometry, not device telemetry. */
function paperDirectionOnPage(object, angle) {
	const local = angle * Math.PI / 180, x = Math.cos(local) * (object.mirrorX ? -1 : 1), y = Math.sin(local) * (object.mirrorY ? -1 : 1), rotation = object.rotation * Math.PI / 180;
	return (Math.atan2(x * Math.sin(rotation) + y * Math.cos(rotation), x * Math.cos(rotation) - y * Math.sin(rotation)) * 180 / Math.PI + 360) % 360;
}
/** Derived page orientation is kept separate from the original sensor values. */
function paperInkOrientationOnPage(object, point) {
	const next = {};
	if (Number.isFinite(point.nibAngle ?? point.twist)) next.nibAngle = paperDirectionOnPage(object, point.nibAngle ?? point.twist);
	if (Number.isFinite(point.tiltX) && Number.isFinite(point.tiltY)) {
		const x = Math.tan(point.tiltX * Math.PI / 180) * (object.mirrorX ? -1 : 1), y = Math.tan(point.tiltY * Math.PI / 180) * (object.mirrorY ? -1 : 1), angle = object.rotation * Math.PI / 180;
		next.tiltX = Math.atan(x * Math.cos(angle) - y * Math.sin(angle)) * 180 / Math.PI;
		next.tiltY = Math.atan(x * Math.sin(angle) + y * Math.cos(angle)) * 180 / Math.PI;
	}
	return next;
}
/** Baking a geometric transform retains the original pressure, tilt, twist and
* time. The visual nib orientation has its own field and is never telemetry. */
function paperInkPointOnPage(object, point) {
	const next = {
		...point,
		...objectPoint(object, point)
	};
	if (!object.mirrorX && !object.mirrorY && object.rotation % 360 === 0) return next;
	const nib = paperInkOrientationOnPage(object, point).nibAngle;
	if (nib !== void 0) next.nibAngle = nib;
	return next;
}
/** Broad nib: thickness depends on stroke direction, pressure and the pen's reported twist. */
function calligraphyOutline(points, width, nibAngle = 45) {
	return inkOutline(points.map((p, i) => {
		const before = points[Math.max(0, i - 1)], after = points[Math.min(points.length - 1, i + 1)], dx = after.x - before.x, dy = after.y - before.y, len = Math.hypot(dx, dy) || 1;
		const angle = (p.nibAngle ?? p.twist ?? nibAngle) * Math.PI / 180, projection = Math.abs(-dy / len * Math.cos(angle) + dx / len * Math.sin(angle));
		return {
			...p,
			pressure: Math.max(.15, (p.pressure ?? .5) * (.2 + .8 * projection))
		};
	}), width * 2);
}
//#endregion
//#region src/lib/notebookDocument.ts
var finite$2 = (n) => typeof n === "number" && Number.isFinite(n);
var record$1 = (v) => !!v && typeof v === "object" && !Array.isArray(v);
var id = (v) => typeof v === "string" && v.length > 0 && v.length <= 200;
var unique = (items) => new Set(items.map((item) => item.id)).size === items.length;
function validAudioSegments(value, root, duration, assets, metadata) {
	if (!Array.isArray(value) || !value.length || value.length > 1e4) return false;
	let offset = 0;
	for (const [index, part] of value.entries()) {
		if (!record$1(part) || !assets.has(part.assetId) || index === 0 && part.assetId !== root || !finite$2(part.offset) || !finite$2(part.duration) || part.duration <= 0 || Math.abs(part.offset - offset) >= .001 || part.source !== void 0 && !validAudioSource(part.source, part.assetId, metadata)) return false;
		offset += part.duration;
	}
	return Math.abs(duration - offset) < .001;
}
function validAudioSource(value, root, assets) {
	if (!record$1(value) || value.schema !== 1 || value.originalName !== void 0 && (typeof value.originalName !== "string" || value.originalName.length > 500) || typeof value.mediaType !== "string" || !/^audio\//.test(value.mediaType) || !Number.isSafeInteger(value.size) || Number(value.size) <= 0 || !Array.isArray(value.chunks) || !value.chunks.length || value.chunks.length > 1e4) return false;
	const ids = /* @__PURE__ */ new Set();
	let size = 0;
	for (const [index, chunk] of value.chunks.entries()) {
		if (!record$1(chunk) || !id(chunk.assetId) || ids.has(chunk.assetId) || index === 0 && chunk.assetId !== root || !Number.isSafeInteger(chunk.size) || !finite$2(chunk.size) || chunk.size <= 0 || chunk.size > 16777216 || typeof chunk.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(chunk.sha256) || !assets.some((a) => record$1(a) && a.id === chunk.assetId && a.size === chunk.size)) return false;
		ids.add(chunk.assetId);
		size += chunk.size;
	}
	return size === value.size;
}
function isPaperDocument(value) {
	if (!record$1(value) || value.notebookSchema !== 3 || !id(value.noteId) || !Number.isSafeInteger(value.revision) || Number(value.revision) < 0 || typeof value.updatedAt !== "string" || !Number.isFinite(Date.parse(value.updatedAt))) return false;
	if (value.collaboration !== void 0 && (!record$1(value.collaboration) || value.collaboration.schema !== 1 || !id(value.collaboration.lineage) || typeof value.collaboration.state !== "string" || value.collaboration.state.length > 33554432 / 3 + 8)) return false;
	if (!Array.isArray(value.pages) || !value.pages.length || value.pages.length > 2e3 || !Array.isArray(value.objects) || value.objects.length > 1e5 || !Array.isArray(value.assets) || !Array.isArray(value.audio) || !record$1(value.legacy) || typeof value.legacy.markdown !== "string" || !id(value.legacy.boardId) || typeof value.legacy.migratedAt !== "string") return false;
	if (!value.pages.every((p) => record$1(p) && id(p.id) && (p.flowRootId === void 0 || id(p.flowRootId)) && finite$2(p.width) && p.width >= 100 && p.width <= 2e4 && finite$2(p.height) && p.height >= 100 && p.height <= 1e5 && [
		"plain",
		"ruled",
		"grid",
		"dots"
	].includes(String(p.pattern)) && typeof p.color === "string" && typeof p.bookmark === "boolean" && finite$2(p.rotation) && (p.template === void 0 || [
		"standard",
		"cornell",
		"music",
		"weekly"
	].includes(String(p.template))) && (p.spacing === void 0 || finite$2(p.spacing) && p.spacing >= 8 && p.spacing <= 100) && (!p.pdf || record$1(p.pdf) && id(p.pdf.assetId) && Number.isInteger(p.pdf.pageNumber) && Number(p.pdf.pageNumber) >= 1 && (p.pdf.text === void 0 || typeof p.pdf.text === "string")))) return false;
	const pages = new Set(value.pages.map((p) => p.id));
	if (!value.assets.every((a) => record$1(a) && id(a.id) && typeof a.name === "string" && typeof a.mediaType === "string" && finite$2(a.size) && a.size >= 0 && (a.serverId === void 0 || id(a.serverId)))) return false;
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
	].every(finite$2) && Number(o.width) >= 0 && Number(o.height) >= 0 && typeof o.locked === "boolean" && (o.opacity === void 0 || finite$2(o.opacity) && o.opacity >= 0 && o.opacity <= 1) && (o.strokeStyle === void 0 || [
		"solid",
		"dashed",
		"dotted"
	].includes(String(o.strokeStyle))) && (o.mirrorX === void 0 || typeof o.mirrorX === "boolean") && (o.mirrorY === void 0 || typeof o.mirrorY === "boolean") && (o.nibAngle === void 0 || finite$2(o.nibAngle)) && (o.textPartition === void 0 || id(o.textPartition)) && (o.groupId === void 0 || id(o.groupId)) && (o.kind === "text" || o.kind === "sticky" ? typeof o.markdown === "string" : true) && (o.kind === "image" ? assets.has(o.assetId) : true) && (o.kind === "ink" ? Array.isArray(o.points) && o.points.length > 0 && o.points.every((p) => record$1(p) && finite$2(p.x) && finite$2(p.y) && finite$2(p.time) && (p.pressure === void 0 || finite$2(p.pressure) && p.pressure >= 0 && p.pressure <= 1) && [
		p.tiltX,
		p.tiltY,
		p.twist,
		p.nibAngle
	].every((n) => n === void 0 || finite$2(n))) : true))) return false;
	if (!value.audio.every((a) => record$1(a) && id(a.id) && assets.has(a.assetId) && typeof a.name === "string" && finite$2(a.duration) && a.duration >= 0 && finite$2(a.startedAt) && (a.inProgress === void 0 || typeof a.inProgress === "boolean") && (a.segments === void 0 || validAudioSegments(a.segments, a.assetId, a.duration, assets, value.assets)) && (a.source === void 0 || a.segments === void 0 && validAudioSource(a.source, a.assetId, value.assets)))) return false;
	if (value.study !== void 0 && !isPaperStudy(value.study)) return false;
	const audio = new Set(value.audio.map((a) => a.id));
	if (!value.objects.every((o) => o.textFlow === void 0 || o.kind === "text" && record$1(o.textFlow) && o.textFlow.schema === 1 && typeof o.textFlow.source === "string" && o.textFlow.source.length <= 200 && Array.isArray(o.textFlow.pageIds) && o.textFlow.pageIds.length > 0 && o.textFlow.pageIds.length <= 2e3 && o.textFlow.pageIds[0] === o.pageId && o.textFlow.pageIds.every((p) => pages.has(p)) && new Set(o.textFlow.pageIds).size === o.textFlow.pageIds.length && Array.isArray(o.textFlow.breaks) && o.textFlow.breaks.length === o.textFlow.pageIds.length + 1 && o.textFlow.breaks[0] === 0 && (o.textFlow.sourceOffsets === void 0 || Array.isArray(o.textFlow.sourceOffsets) && o.textFlow.sourceOffsets.length === o.textFlow.breaks.length && o.textFlow.sourceOffsets[0] === 0 && o.textFlow.sourceOffsets.every((n, i) => Number.isSafeInteger(n) && Number(n) >= 0 && (i === 0 || Number(n) >= Number(o.textFlow.sourceOffsets[i - 1])))) && o.textFlow.breaks.every((n, i) => finite$2(n) && n >= 0 && (i === 0 || n > Number(o.textFlow.breaks[i - 1]))))) return false;
	return unique(value.pages) && unique(value.objects) && unique(value.assets) && unique(value.audio) && value.pages.every((p) => !p.pdf || assets.has(p.pdf.assetId)) && value.objects.every((o) => !o.audioAnchor || record$1(o.audioAnchor) && audio.has(o.audioAnchor.sessionId) && finite$2(o.audioAnchor.time) && o.audioAnchor.time >= 0);
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
		const points = stroke.points.filter((p) => record$1(p) && finite$2(p.x) && finite$2(p.y)).map((p) => ({
			x: Number(p.x),
			y: Number(p.y),
			time: 0,
			...finite$2(p.pressure) ? { pressure: Math.max(0, Math.min(1, p.pressure)) } : {}
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
			strokeWidth: finite$2(stroke.width) ? stroke.width : 3,
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
/** Entire command is validated before a revision is committed, including multi-object edits. */
function applyPaperCommand(document, command, now = (/* @__PURE__ */ new Date()).toISOString()) {
	const apply = (d, c) => {
		switch (c.type) {
			case "batch": return c.commands.reduce(apply, d);
			case "study-card": {
				const study = d.study ?? emptyStudy();
				return {
					...d,
					study: {
						...study,
						cards: [...study.cards.filter((card) => card.id !== c.card.id), c.card]
					}
				};
			}
			case "remove-study-card": {
				const study = d.study ?? emptyStudy();
				return {
					...d,
					study: {
						...study,
						cards: study.cards.filter((card) => card.id !== c.id)
					}
				};
			}
			case "study-language": return {
				...d,
				study: {
					...d.study ?? emptyStudy(),
					language: c.language
				}
			};
			case "review-card": {
				const study = d.study ?? emptyStudy();
				return {
					...d,
					study: {
						...study,
						cards: study.cards.map((card) => card.id === c.id ? reviewStudyCard(card, c.quality, c.reviewId, now) : card)
					}
				};
			}
			case "restore":
				if (c.document.noteId !== d.noteId || !isPaperDocument(c.document)) throw Error("Cette version appartient à une autre note.");
				return {
					...d,
					pages: c.document.pages,
					objects: c.document.objects,
					assets: c.document.assets,
					audio: c.document.audio,
					...c.document.study ? { study: c.document.study } : { study: void 0 }
				};
			case "upsert-object": return {
				...d,
				objects: [...d.objects.filter((o) => o.id !== c.object.id), c.object]
			};
			case "patch-object": return {
				...d,
				objects: d.objects.map((o) => o.id === c.id ? {
					...o,
					...c.patch
				} : o)
			};
			case "remove-objects": return {
				...d,
				objects: d.objects.filter((o) => o.locked || !c.ids.includes(o.id))
			};
			case "insert-page": {
				const pages = [...d.pages];
				const i = c.afterId ? pages.findIndex((p) => p.id === c.afterId) : -1;
				pages.splice(i < 0 ? pages.length : i + 1, 0, c.page);
				return {
					...d,
					pages
				};
			}
			case "update-page": return {
				...d,
				pages: d.pages.map((p) => p.id === c.page.id ? c.page : p)
			};
			case "remove-page":
				if (d.objects.some((o) => o.textFlow && o.textFlow.pageIds.length > 1 && o.textFlow.pageIds.includes(c.id))) throw Error("Cette page appartient à un texte continu. Retirez le passage dans le texte ; ses autres pages et annotations restent conservées.");
				if (d.pages.length === 1) throw Error("Gardez au moins une page.");
				return {
					...d,
					pages: d.pages.filter((p) => p.id !== c.id),
					objects: d.objects.filter((o) => o.pageId !== c.id)
				};
			case "partition-text-flow": {
				const root = d.objects.find((o) => o.id === c.id), flow = root?.textFlow;
				if (!root || root.kind !== "text" || !flow || flow.pageIds.length < 2 || JSON.stringify(root) !== JSON.stringify(c.expected)) throw Error("Le texte a changé pendant la préparation des pages. Sa version actuelle est conservée.");
				if (!c.objects.length || !c.objects.some((o) => o.id === root.id) || c.objects.some((o) => o.kind !== "text" || !flow.pageIds.includes(o.pageId) || o.textFlow !== void 0 || !id(o.textPartition)) || new Set(c.objects.map((o) => o.pageId)).size !== c.objects.length || c.objects.some((o) => o.id !== root.id && d.objects.some((n) => n.id === o.id))) throw Error("Le découpage des pages est invalide.");
				const cards = d.study?.cards.map((card) => {
					if (card.source?.objectId !== root.id) return card;
					const candidates = c.objects.filter((o) => o.markdown?.includes(card.source.quote));
					const target = candidates.find((o) => o.pageId === card.source.pageId) ?? (candidates.length === 1 ? candidates[0] : void 0);
					return target ? {
						...card,
						source: {
							...card.source,
							objectId: target.id,
							pageId: target.pageId,
							revision: d.revision + 1
						}
					} : card;
				});
				return {
					...d,
					objects: [...d.objects.filter((o) => o.id !== root.id), ...c.objects],
					pages: d.pages.map((p) => p.flowRootId === root.id ? {
						...p,
						flowRootId: void 0
					} : p),
					...d.study && cards ? { study: {
						...d.study,
						cards
					} } : {}
				};
			}
			case "reorder-pages":
				if (c.ids.length !== d.pages.length || new Set(c.ids).size !== d.pages.length || c.ids.some((id) => !d.pages.some((p) => p.id === id))) throw Error("Ordre des pages invalide.");
				if (d.objects.some((o) => o.textFlow && o.textFlow.pageIds.length > 1 && o.textFlow.pageIds.some((p, i) => c.ids.indexOf(p) !== c.ids.indexOf(o.pageId) + i))) throw Error("Préparez le texte continu avant de déplacer ses pages.");
				return {
					...d,
					pages: c.ids.map((id) => d.pages.find((p) => p.id === id))
				};
			case "add-asset": return {
				...d,
				assets: [...d.assets.filter((a) => a.id !== c.asset.id), c.asset]
			};
			case "add-audio": return {
				...d,
				audio: [...d.audio.filter((a) => a.id !== c.audio.id), c.audio]
			};
		}
	};
	const next = {
		...apply(document, command),
		revision: document.revision + 1,
		updatedAt: now
	};
	if (!isPaperDocument(next)) throw Error("Cette modification produirait une note invalide.");
	return next;
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
//#region src/lib/paperInkStyles.ts
function paperStrokeDashArray(style, width) {
	const unit = Number.isFinite(width) && width > 0 ? width : 3;
	return style === "dashed" ? `${unit * 4} ${unit * 2.5}` : style === "dotted" ? `0 ${unit * 2.5}` : void 0;
}
/** Parents apply this transform exactly once, for ink and non-vector content.
* Local reflection happens before the existing rotation, like objectPoint(). */
function paperObjectCssTransform(object) {
	return `rotate(${object.rotation}deg)` + (object.mirrorX || object.mirrorY ? ` scale(${object.mirrorX ? -1 : 1}, ${object.mirrorY ? -1 : 1})` : "");
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
	return /* @__PURE__ */ jsxs(Fragment, { children: [
		pencil && /* @__PURE__ */ jsx("defs", { children: /* @__PURE__ */ jsxs("filter", {
			id,
			x: "-10%",
			y: "-10%",
			width: "120%",
			height: "120%",
			children: [
				/* @__PURE__ */ jsx("feTurbulence", {
					type: "fractalNoise",
					baseFrequency: "0.55",
					numOctaves: "2",
					seed: "7",
					result: "grain"
				}),
				/* @__PURE__ */ jsx("feColorMatrix", {
					in: "grain",
					type: "matrix",
					values: "0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.33 0.33 0.33 0 0",
					result: "alpha"
				}),
				/* @__PURE__ */ jsx("feComponentTransfer", {
					in: "alpha",
					result: "texture",
					children: /* @__PURE__ */ jsx("feFuncA", {
						type: "linear",
						slope: "2",
						intercept: "-0.1"
					})
				}),
				/* @__PURE__ */ jsx("feComposite", {
					in: "SourceGraphic",
					in2: "texture",
					operator: "in"
				})
			]
		}) }),
		masked && /* @__PURE__ */ jsx("defs", { children: /* @__PURE__ */ jsx("mask", {
			id: patternId,
			maskUnits: "userSpaceOnUse",
			x: bounds.left - pad,
			y: bounds.top - pad,
			width: bounds.right - bounds.left + pad * 2,
			height: bounds.bottom - bounds.top + pad * 2,
			children: /* @__PURE__ */ jsx("path", {
				d: `M${points.map((p) => `${p.x} ${p.y}`).join("L")}`,
				fill: "none",
				stroke: "white",
				strokeWidth: object.strokeStyle === "dotted" ? width : width * 4,
				strokeDasharray: dash,
				strokeLinecap: object.strokeStyle === "dotted" ? "round" : "butt"
			})
		}) }),
		/* @__PURE__ */ jsx("path", {
			"data-stroke-style": object.strokeStyle ?? "solid",
			d: object.pen === "calligraphy" ? calligraphyOutline(points, width, object.nibAngle ?? 45) : inkOutline(points, width, object.pen === "highlighter"),
			fill: object.color ?? "#20343b",
			opacity: object.opacity ?? (object.pen === "highlighter" ? .32 : 1),
			filter: pencil ? `url(#${id})` : void 0,
			mask: masked ? `url(#${patternId})` : void 0
		})
	] });
}
function PaperObjectVisual({ object, document, media, onReady, onError }) {
	if (object.kind === "text" || object.kind === "sticky") return /* @__PURE__ */ jsx(PaperRichText, {
		markdown: object.markdown ?? "",
		document,
		media,
		onError
	});
	if (object.kind === "image") {
		const asset = document.assets.find((a) => a.id === object.assetId);
		return asset ? /* @__PURE__ */ jsx(PaperAssetImage, {
			asset,
			document,
			media,
			onReady,
			onError
		}) : /* @__PURE__ */ jsx(PaperImageUnavailable, {
			message: "Le fichier de cette image n’est pas encore associé à la note. Son original reste conservé.",
			onError
		});
	}
	const w = object.width, h = object.height, stroke = object.strokeWidth ?? 3, dash = paperStrokeDashArray(object.strokeStyle, stroke), linecap = object.strokeStyle === "dotted" ? "round" : void 0;
	return /* @__PURE__ */ jsx("svg", {
		className: "paper-object-svg",
		viewBox: `0 0 ${w || 1} ${h || 1}`,
		width: w,
		height: h,
		style: { overflow: "visible" },
		opacity: object.kind === "shape" ? object.opacity : void 0,
		"aria-hidden": "true",
		children: object.kind === "ink" ? /* @__PURE__ */ jsx(PaperInkVisual, { object }) : object.shape === "ellipse" ? /* @__PURE__ */ jsx("ellipse", {
			cx: w / 2,
			cy: h / 2,
			rx: w / 2,
			ry: h / 2,
			fill: "none",
			stroke: object.color,
			strokeWidth: stroke,
			strokeDasharray: dash,
			strokeLinecap: linecap
		}) : object.shape === "line" || object.shape === "arrow" ? /* @__PURE__ */ jsxs(Fragment, { children: [/* @__PURE__ */ jsx("path", {
			d: `M0 0 L${w} ${h}`,
			fill: "none",
			stroke: object.color,
			strokeWidth: stroke,
			strokeDasharray: dash,
			strokeLinecap: linecap
		}), object.shape === "arrow" && /* @__PURE__ */ jsx("path", {
			d: `M${w - 20} ${h - 4} L${w} ${h} L${w - 4} ${h - 20}`,
			fill: "none",
			stroke: object.color,
			strokeWidth: stroke
		})] }) : /* @__PURE__ */ jsx("rect", {
			width: w,
			height: h,
			fill: "none",
			stroke: object.color,
			strokeWidth: stroke,
			strokeDasharray: dash,
			strokeLinecap: linecap
		})
	});
}
//#endregion
//#region src/lib/paperTextFlow.ts
/** Layout fingerprint only. It is never an authorization or a file-integrity check. */
function textFlowFingerprint(markdown, width, height) {
	let a = 2166136261, b = 5381;
	for (let i = 0; i < markdown.length; i++) {
		const n = markdown.charCodeAt(i);
		a = Math.imul(a ^ n, 16777619);
		b = Math.imul(b, 33) ^ n;
	}
	return `${width}:${height}:${markdown.length}:${a >>> 0}:${b >>> 0}`;
}
/** Crop at painted line boundaries; do not split or rewrite the canonical Markdown. */
function textFlowBreaks(height, frameHeight, bands) {
	if (!Number.isFinite(height) || !Number.isFinite(frameHeight) || height < 0 || frameHeight < 40) throw Error("Le cadre de texte est trop petit pour être paginé.");
	if (bands.some((b) => b.unbreakable && Number.isFinite(b.top) && Number.isFinite(b.bottom) && b.bottom - b.top > frameHeight + .1)) throw Error("Un élément du texte dépasse la hauteur de sa feuille. Agrandissez la zone ; son original reste conservé.");
	const lines = bands.filter((b) => Number.isFinite(b.top) && Number.isFinite(b.bottom) && b.bottom > b.top).sort((a, b) => a.top - b.top);
	const breaks = [0];
	let from = 0;
	while (from < height - .1) {
		if (breaks.length > 2e3) throw Error("Le texte dépasse 2000 pages. Il reste conservé dans la note.");
		let end = Math.min(height, from + frameHeight);
		if (end < height) {
			let changed = true;
			for (let pass = 0; changed && pass < lines.length + 1; pass++) {
				changed = false;
				for (const band of lines) {
					if (band.top >= end) break;
					if (band.top < end - .1 && band.bottom > end + .1 && band.top > from + 1) {
						end = band.top;
						changed = true;
						break;
					}
				}
			}
		}
		if (end <= from + 1) end = Math.min(height, from + frameHeight);
		if (lines.some((b) => b.unbreakable && b.top < end - .1 && b.bottom > end + .1)) throw Error("Les éléments superposés du texte ne peuvent pas être coupés sans perdre leur disposition. Leur original reste conservé.");
		breaks.push(end);
		from = end;
	}
	if (breaks.length === 1) breaks.push(Math.max(1, height));
	return breaks;
}
function paperObjectsOnPage(doc, pageId) {
	return doc.objects.filter((o) => o.pageId === pageId || o.textFlow?.pageIds.includes(pageId)).sort((a, b) => a.z - b.z);
}
function textFlowPageIndex(object, pageId) {
	return object.textFlow?.pageIds.indexOf(pageId) ?? 0;
}
//#endregion
//#region src/lib/paperRichFlowLayout.ts
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
/** KaTeX dimensions are expressed in em, so font sizing reserves its real scaled layout box. */
function fitPaperFlowMath(source, width, height) {
	const fits = [];
	for (const element of source.querySelectorAll(".katex")) {
		const painted = element.querySelector(".katex-html") ?? element, cell = element.closest("td,th"), cellStyle = cell ? getComputedStyle(cell) : void 0;
		const availableWidth = Math.max(1, cell ? cell.getBoundingClientRect().width - parseFloat(cellStyle?.paddingLeft ?? "0") - parseFloat(cellStyle?.paddingRight ?? "0") : width), availableHeight = Math.max(1, height - 40), naturalFont = parseFloat(getComputedStyle(element).fontSize);
		const rect = painted.getBoundingClientRect();
		if (!(rect.width > 0 && rect.height > 0 && naturalFont > 0)) continue;
		let font = naturalFont * Math.min(1, (availableWidth - .5) / rect.width, (availableHeight - .5) / rect.height);
		if (font >= naturalFont - .01) continue;
		for (let attempt = 0; attempt < 4; attempt++) {
			element.style.fontSize = `${font}px`;
			const box = painted.getBoundingClientRect(), factor = Math.min(1, (availableWidth - .5) / box.width, (availableHeight - .5) / box.height);
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
//#region src/lib/paperTextMeasurement.ts
/** Browser layout measurements in paper units, independent of the current zoom. */
function measureUnrotated(source, width, height, markdown) {
	const root = source.getBoundingClientRect(), scale = root.width / width;
	if (!Number.isFinite(scale) || scale <= 0) return null;
	const bands = [];
	const walker = document.createTreeWalker(source, NodeFilter.SHOW_TEXT);
	let count = 0;
	while (walker.nextNode()) {
		if (++count > 1e5) throw Error("Le texte est trop complexe pour une mise en page immédiate.");
		const node = walker.currentNode;
		if (!node.textContent?.trim() || node.parentElement?.closest(".katex,.cm-gutters,.milkdown-top-bar,.studio-editor-help,.markdown-editor-loading")) continue;
		const range = document.createRange();
		range.selectNodeContents(node);
		for (const rect of range.getClientRects()) if (rect.height > 0 && rect.width > 0) bands.push({
			top: (rect.top - root.top) / scale,
			bottom: (rect.bottom - root.top) / scale,
			unbreakable: true
		});
		range.detach();
	}
	for (const element of source.querySelectorAll("img,.katex-display,.katex:not(.katex-display .katex)")) {
		const r = element.getBoundingClientRect();
		if (r.height > 0) bands.push({
			top: (r.top - root.top) / scale,
			bottom: (r.bottom - root.top) / scale,
			unbreakable: true
		});
	}
	const splitRows = [];
	for (const row of source.querySelectorAll("table tr")) {
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
			if (stopped || node.querySelector(".markdown-editor-loading,.paper-asset-missing,[data-code-ready=\"false\"]") || children && !node.querySelector(".ProseMirror") || [...node.querySelectorAll("img")].some((image) => !image.complete || !image.naturalWidth)) return;
			try {
				const result = measureTextFlow(node, object.width, object.height, object.markdown);
				if (!result) return;
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
	return /* @__PURE__ */ jsxs("div", {
		className: `paper-flow-clip ${continuous ? "is-continuous" : ""}`,
		"data-flow-index": index,
		style: {
			height: continuous ? "auto" : segmentHeight,
			width: continuous ? "100%" : object.width,
			"--flow-height": object.height + "px"
		},
		children: [math.expected === expected && math.css && /* @__PURE__ */ jsx("style", {
			"data-paper-flow-math": true,
			children: math.css
		}), /* @__PURE__ */ jsx("div", {
			id: sourceId,
			className: "paper-flow-source",
			ref: source,
			"data-flow-ready": continuous || math.expected === expected ? "true" : "false",
			style: {
				width: continuous ? "100%" : object.width,
				transform: continuous ? "none" : `translateY(${-offset}px)`
			},
			children: children ?? /* @__PURE__ */ jsx(PaperRichText, {
				markdown: object.markdown ?? "",
				document,
				media,
				onError: onNotice
			})
		})]
	});
}
var documentFontsReady = () => globalThis.document.fonts?.ready ?? Promise.resolve();
//#endregion
//#region src/components/PaperInkPreview.tsx
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
		return /* @__PURE__ */ jsx("circle", {
			cx: last.x,
			cy: last.y,
			r: 8,
			fill: "#ef476f",
			opacity: .7
		});
	}
	if (stroke.intent === "lasso" || stroke.intent === "eraser") return /* @__PURE__ */ jsx("path", {
		d: `M${stroke.points.map((p) => `${p.x} ${p.y}`).join("L")}`,
		fill: "none",
		stroke: stroke.intent === "eraser" ? "#b6bdcc" : "#4461dc",
		strokeWidth: stroke.intent === "eraser" ? style.width * 6 : 1.5,
		opacity: .5,
		strokeDasharray: stroke.intent === "lasso" ? "5 4" : void 0
	});
	if (![
		"pen",
		"pencil",
		"calligraphy",
		"highlighter"
	].includes(stroke.intent)) return null;
	return /* @__PURE__ */ jsx(PaperInkVisual, { object: {
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
	} });
});
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
var finite$1 = (value) => typeof value === "number" && Number.isFinite(value);
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
	if (!context || typeof context.ownershipKey !== "string" || !context.ownershipKey || typeof context.pageId !== "string" || !context.pageId || !(typeof context.generation === "string" || finite$1(context.generation)) || !intents.has(context.intent) || ![context.pageWidth, context.pageHeight].every((n) => finite$1(n) && n > 0) || context.pageRotation !== void 0 && !finite$1(context.pageRotation)) return false;
	const rect = context.clientRect;
	if (!rect || ![
		rect.left,
		rect.top,
		rect.width,
		rect.height
	].every(finite$1) || rect.width <= 0 || rect.height <= 0) return false;
	const matrix = context.clientToPage;
	return !matrix || matrixKeys.every((key) => finite$1(matrix[key])) && Math.abs(matrix.a * matrix.d - matrix.b * matrix.c) > 1e-12;
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
	return event.pointerType === "pen" && (event.button === 5 || finite$1(event.buttons) && (event.buttons & 32) !== 0);
}
function point(event, stroke) {
	if (!finite$1(event.clientX) || !finite$1(event.clientY) || !finite$1(event.timeStamp) || event.timeStamp < 0 || event.pointerId !== stroke.pointerId || event.pointerType !== stroke.pointerType) return;
	const { clientRect: rect, clientToPage: matrix, pageWidth, pageHeight } = stroke.context;
	const x = matrix ? matrix.a * event.clientX + matrix.c * event.clientY + matrix.e : (event.clientX - rect.left) / rect.width * pageWidth;
	const y = matrix ? matrix.b * event.clientX + matrix.d * event.clientY + matrix.f : (event.clientY - rect.top) / rect.height * pageHeight;
	if (!finite$1(x) || !finite$1(y)) return;
	const p = {
		x,
		y,
		time: event.timeStamp
	};
	if (stroke.pointerType === "pen") {
		if (finite$1(event.pressure)) p.pressure = clamp$1(event.pressure, 0, 1);
		if (finite$1(event.tiltX)) p.tiltX = clamp$1(event.tiltX, -90, 90);
		if (finite$1(event.tiltY)) p.tiltY = clamp$1(event.tiltY, -90, 90);
		if (finite$1(event.twist)) p.twist = clamp$1(event.twist, 0, 359);
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
		if (event.pointerType === "pen" && finite$1(event.timeStamp) && event.timeStamp >= 0) lastPenTime = Math.max(lastPenTime, event.timeStamp);
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
		if (event.pointerType === "pen" && finite$1(event.buttons) && event.buttons !== 0 && eraser(event) !== stroke.eraserButton) return cancel("buttons-changed");
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
				const delay = finite$1(policy.penTouchDelay) ? clamp$1(policy.penTouchDelay, 0, 1e4) : 800, palm = finite$1(policy.palmSize) ? clamp$1(policy.palmSize, 1, 200) : 28;
				if (event.timeStamp - lastPenTime < delay || finite$1(event.width) && event.width > palm || finite$1(event.height) && event.height > palm) return ignored("palm");
			}
			const eraserButton = eraser(event);
			if (!eraserButton && (event.button !== void 0 && event.button !== 0 || finite$1(event.buttons) && event.buttons !== 1)) return ignored("buttons-changed");
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
			maxPoints = finite$1(policy.maxPoints) ? Math.floor(clamp$1(policy.maxPoints, 1, 25e4)) : 25e4;
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
//#region src/lib/paperWritingLoupe.ts
var finite = (value) => typeof value === "number" && Number.isFinite(value);
var clamp = (value, low, high) => Math.max(low, Math.min(high, value));
var number = (value, fallback, low, high) => clamp(finite(value) ? value : fallback, low, high);
function assertPage(page) {
	if (!finite(page.width) || !finite(page.height) || page.width <= 0 || page.height <= 0) throw Error("La page de la loupe est invalide.");
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
		x: region.x + (finite(dx) ? dx : 0),
		y: region.y + (finite(dy) ? dy : 0)
	});
}
function samePaperWritingLoupeOwner(captured, current) {
	return !!current && !current.tombstoned && !captured.tombstoned && current.ownershipKey === captured.ownershipKey && current.generation === captured.generation && current.pageId === captured.pageId && current.pageWidth === captured.pageWidth && current.pageHeight === captured.pageHeight && (current.pageRotation ?? 0) === (captured.pageRotation ?? 0);
}
function paperWritingLoupeContext(owner, region, clientRect, intent) {
	if (owner.tombstoned || !owner.ownershipKey || !owner.pageId || !finite(owner.pageWidth) || !finite(owner.pageHeight) || owner.pageWidth <= 0 || owner.pageHeight <= 0 || ![
		clientRect.left,
		clientRect.top,
		clientRect.width,
		clientRect.height,
		region.x,
		region.y,
		region.width,
		region.height
	].every(finite) || clientRect.width <= 0 || clientRect.height <= 0 || region.width <= 0 || region.height <= 0) return null;
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
	const right = points.reduce((max, p) => finite(p.x) ? Math.max(max, p.x) : max, -Infinity), edge = Math.max(configuration.leftMargin, page.width - configuration.rightMargin);
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
var PaperPdfPage = lazy(() => import("./assets/PaperPdfPage-DWoa1_jr.js").then((module) => ({ default: module.PaperPdfPage })));
/** Place inside the original page SVG. It identifies the same canonical page coordinates. */
function PaperWritingLoupeTarget({ region }) {
	return /* @__PURE__ */ jsxs("g", {
		className: "paper-writing-loupe-target",
		pointerEvents: "none",
		"aria-hidden": "true",
		children: [/* @__PURE__ */ jsx("rect", {
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
		}), /* @__PURE__ */ jsx("path", {
			d: `M${region.x} ${region.y + region.height * .72}h${region.width}`,
			stroke: "#4461dc",
			strokeOpacity: .35,
			strokeDasharray: "4 4",
			vectorEffect: "non-scaling-stroke"
		})]
	});
}
function PageProjection({ document, page, media, region, width, height }) {
	const objects = useMemo(() => paperObjectsOnPage(document, page.id), [document, page.id]), pdf = page.pdf ? document.assets.find((asset) => asset.id === page.pdf.assetId) : void 0;
	const scaleX = width / region.width, scaleY = height / region.height;
	return /* @__PURE__ */ jsxs("div", {
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
			/* @__PURE__ */ jsx(PaperBackground, { page }),
			pdf && /* @__PURE__ */ jsx(Suspense, {
				fallback: null,
				children: /* @__PURE__ */ jsx(PaperPdfPage, {
					page,
					asset: pdf,
					media,
					pixelWidth: Math.min(1200, page.width * scaleX)
				})
			}),
			objects.map((object) => /* @__PURE__ */ jsx("div", {
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
				children: object.kind === "text" ? /* @__PURE__ */ jsx(PaperTextFlowView, {
					object,
					document,
					media,
					pageId: page.id
				}) : /* @__PURE__ */ jsx(PaperObjectVisual, {
					object,
					document,
					media
				})
			}, object.id))
		]
	});
}
var inkTools = /* @__PURE__ */ new Set([
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
	const mounted = useRef(true), panel = useRef(null), stage = useRef(null), surface = useRef(null), preview = useRef(null), engine = useRef(createPaperWritingLoupeInput()), raf = useRef(0);
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
	const clear = () => {
		cancelAnimationFrame(raf.current);
		raf.current = 0;
		const held = capture.current;
		capture.current = null;
		engine.current.cancel();
		setWriting(false);
		notifyPreview(null, held?.style);
	};
	const live = (owner = renderedOwner) => mounted.current && !latest.current.disabled && samePaperWritingLoupeOwner(owner, latest.current.currentOwner());
	const replaceRegion = (next) => {
		if (engine.current.snapshot()) return;
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
		cancel: clear,
		focus: () => surface.current?.focus()
	}));
	useLayoutEffect(() => {
		clear();
		queuedAdvance.current = null;
		const next = createPaperWritingLoupeRegion(page, viewport, props.initialZoom);
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
			const old = regionRef.current, next = createPaperWritingLoupeRegion(page, size, old.zoom, {
				x: old.x + old.width / 2,
				y: old.y + old.height / 2
			});
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
	const down = (event) => {
		if (!inkTools.has(tool) || !live()) return;
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
			scope
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
		notifyPreview(result.stroke, capture.current.style);
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
		if (!raf.current) raf.current = requestAnimationFrame(() => {
			raf.current = 0;
			const held = capture.current;
			if (held && live(held.owner)) notifyPreview(engine.current.snapshot(), held.style);
		});
	};
	const finish = (event, cancelled = false) => {
		const held = capture.current;
		if (!held) return;
		const result = engine.current.finish(event.nativeEvent, owner(), regionRef.current, rect(), tool, cancelled);
		if (result.status === "ignored") return;
		clear();
		event.preventDefault();
		event.stopPropagation();
		try {
			if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
		} catch {}
		if (!result.accepted || !result.stroke || !live(held.owner)) return;
		const stroke = result.stroke;
		const accepted = (success) => {
			if (!success || !live(held.owner) || held.scope !== scope) return;
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
		const old = regionRef.current;
		replaceRegion(createPaperWritingLoupeRegion(page, viewport, old.zoom + amount, {
			x: old.x + old.width / 2,
			y: old.y + old.height / 2
		}));
	};
	const line = () => {
		if (!live() || writing) return;
		const next = nextPaperWritingLoupeLine(page, regionRef.current, configurationRef.current);
		if (next.moved) replaceRegion(next.region);
		if (next.pageEnd) setNotice("Fin de page. Choisissez une autre zone ou une autre page pour poursuivre.");
	};
	const controlsDisabled = disabled || writing, overviewWidth = 64, overviewHeight = overviewWidth * page.height / page.width;
	const keydown = (event) => {
		if (event.key === "Escape") {
			event.preventDefault();
			clear();
			props.onClose();
			return;
		}
		if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z" && event.target === surface.current) {
			event.preventDefault();
			if (!controlsDisabled) {
				if (event.shiftKey) props.onRedo?.();
				else props.onUndo?.();
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
	return /* @__PURE__ */ jsxs("section", {
		ref: panel,
		className: "paper-writing-loupe",
		"aria-label": "Loupe d’écriture",
		onKeyDown: keydown,
		"data-loupe-owner": ownershipKey,
		"data-loupe-page": page.id,
		children: [
			/* @__PURE__ */ jsxs("div", {
				className: "paper-writing-loupe-toolbar",
				children: [
					/* @__PURE__ */ jsx("strong", { children: "Loupe d’écriture" }),
					/* @__PURE__ */ jsx("button", {
						type: "button",
						"aria-label": "Annuler dans la loupe",
						disabled: controlsDisabled || !props.canUndo,
						onClick: () => {
							if (live()) props.onUndo?.();
						},
						children: "↶"
					}),
					/* @__PURE__ */ jsx("button", {
						type: "button",
						"aria-label": "Rétablir dans la loupe",
						disabled: controlsDisabled || !props.canRedo,
						onClick: () => {
							if (live()) props.onRedo?.();
						},
						children: "↷"
					}),
					/* @__PURE__ */ jsx("button", {
						type: "button",
						"aria-label": "Réduire le zoom de la loupe",
						disabled: controlsDisabled || region.zoom <= 1,
						onClick: () => zoom(-.5),
						children: "−"
					}),
					/* @__PURE__ */ jsxs("output", {
						"aria-label": "Zoom de la loupe",
						children: [region.zoom.toFixed(1), "×"]
					}),
					/* @__PURE__ */ jsx("button", {
						type: "button",
						"aria-label": "Augmenter le zoom de la loupe",
						disabled: controlsDisabled || region.zoom >= 6,
						onClick: () => zoom(.5),
						children: "+"
					}),
					/* @__PURE__ */ jsx("button", {
						type: "button",
						"aria-label": "Fermer la loupe",
						onClick: () => {
							clear();
							props.onClose();
						},
						children: "×"
					})
				]
			}),
			/* @__PURE__ */ jsxs("div", {
				className: "paper-writing-loupe-body",
				children: [/* @__PURE__ */ jsxs("div", {
					className: "paper-writing-loupe-overview",
					style: {
						width: overviewWidth,
						height: overviewHeight
					},
					children: [/* @__PURE__ */ jsx(PageProjection, {
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
					}), /* @__PURE__ */ jsx("svg", {
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
						children: /* @__PURE__ */ jsx(PaperWritingLoupeTarget, { region })
					})]
				}), /* @__PURE__ */ jsxs("div", {
					className: "paper-writing-loupe-stage",
					ref: stage,
					children: [/* @__PURE__ */ jsx(PageProjection, {
						document,
						page,
						media,
						region,
						width: viewport.width,
						height: viewport.height
					}), /* @__PURE__ */ jsxs("svg", {
						ref: surface,
						className: "paper-writing-loupe-input",
						viewBox: `${region.x} ${region.y} ${region.width} ${region.height}`,
						preserveAspectRatio: "none",
						tabIndex: 0,
						"aria-label": "Écrire dans la loupe",
						"aria-describedby": "paper-writing-loupe-help",
						style: { touchAction: "none" },
						onPointerDown: down,
						onPointerMove: move,
						onPointerUp: (event) => finish(event),
						onPointerCancel: (event) => finish(event, true),
						onLostPointerCapture: (event) => {
							if (capture.current && engine.current.snapshot()?.pointerId === event.pointerId) finish(event, true);
						},
						children: [/* @__PURE__ */ jsx("path", {
							d: `M${region.x + region.width * configuration.advanceAt} ${region.y}v${region.height}`,
							stroke: "#4461dc",
							strokeOpacity: .2,
							strokeDasharray: "3 4",
							pointerEvents: "none"
						}), /* @__PURE__ */ jsx(PaperInkPreview, { ref: preview })]
					})]
				})]
			}),
			/* @__PURE__ */ jsxs("div", {
				className: "paper-writing-loupe-controls",
				children: [
					/* @__PURE__ */ jsx("button", {
						type: "button",
						"aria-label": "Déplacer la loupe vers la gauche",
						disabled: controlsDisabled || region.x <= 0,
						onClick: () => shift(-region.width * .6, 0),
						children: "←"
					}),
					/* @__PURE__ */ jsx("button", {
						type: "button",
						"aria-label": "Déplacer la loupe vers la droite",
						disabled: controlsDisabled || region.x + region.width >= page.width,
						onClick: () => shift(region.width * .6, 0),
						children: "→"
					}),
					/* @__PURE__ */ jsx("button", {
						type: "button",
						"aria-label": "Déplacer la loupe vers le haut",
						disabled: controlsDisabled || region.y <= 0,
						onClick: () => shift(0, -configuration.lineHeight),
						children: "↑"
					}),
					/* @__PURE__ */ jsx("button", {
						type: "button",
						"aria-label": "Déplacer la loupe vers le bas",
						disabled: controlsDisabled || region.y + region.height >= page.height,
						onClick: () => shift(0, configuration.lineHeight),
						children: "↓"
					}),
					/* @__PURE__ */ jsx("button", {
						type: "button",
						"aria-label": "Ligne suivante dans la loupe",
						disabled: controlsDisabled,
						onClick: line,
						children: "↵"
					}),
					/* @__PURE__ */ jsxs("label", { children: [/* @__PURE__ */ jsx("input", {
						type: "checkbox",
						"aria-label": "Avancement automatique de la loupe",
						checked: configuration.autoAdvance,
						disabled: controlsDisabled,
						onChange: (event) => setConfiguration((old) => ({
							...old,
							autoAdvance: event.target.checked
						}))
					}), "Avancer"] }),
					/* @__PURE__ */ jsxs("label", { children: [/* @__PURE__ */ jsx("input", {
						type: "checkbox",
						"aria-label": "Retour automatique à la ligne",
						checked: configuration.autoReturn,
						disabled: controlsDisabled,
						onChange: (event) => setConfiguration((old) => ({
							...old,
							autoReturn: event.target.checked
						}))
					}), "Retour à la ligne"] }),
					/* @__PURE__ */ jsxs("label", { children: ["Interligne", /* @__PURE__ */ jsx("input", {
						type: "number",
						"aria-label": "Interligne de la loupe",
						min: 8,
						max: 100,
						step: 1,
						value: configuration.lineHeight,
						disabled: controlsDisabled,
						onChange: (event) => {
							const value = event.target.valueAsNumber;
							if (Number.isFinite(value) && value >= 8 && value <= 100) setConfiguration((old) => ({
								...old,
								lineHeight: value
							}));
						}
					})] })
				]
			}),
			/* @__PURE__ */ jsxs("p", {
				id: "paper-writing-loupe-help",
				className: "paper-writing-loupe-help",
				children: ["Flèches : déplacer · Entrée : ligne suivante · Échap : fermer", !fingerInk ? " · Le doigt repositionne la zone dans l’aperçu." : ""]
			}),
			/* @__PURE__ */ jsx("p", {
				className: "paper-writing-loupe-notice",
				role: "status",
				children: notice || (!inkTools.has(tool) ? "Choisissez un outil d’encre pour écrire dans la loupe." : disabled ? "La note ne peut pas être modifiée actuellement." : "Les traits restent à leur position exacte sur la page.")
			})
		]
	});
});
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
//#endregion
export { PaperWritingLoupe, PaperWritingLoupeTarget, act, applyPaperCommand, compactInk, createElement, createRef, createRoot, flushSync, migratePaper, readPaperAsset as t };
