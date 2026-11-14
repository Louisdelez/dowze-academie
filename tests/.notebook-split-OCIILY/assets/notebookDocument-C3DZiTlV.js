import { decodeString } from "micromark-util-decode-string";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { fromMarkdown } from "mdast-util-from-markdown";
import { parse, postprocess, preprocess } from "micromark";
import { gfm } from "micromark-extension-gfm";
import { gfmFromMarkdown } from "mdast-util-gfm";
import { math } from "micromark-extension-math";
import { mathFromMarkdown } from "mdast-util-math";
//#region src/lib/paperStudy.ts
var emptyStudy = () => ({
	schema: 1,
	language: "fr",
	cards: []
});
var record$1 = (v) => !!v && typeof v === "object" && !Array.isArray(v);
var date = (v) => typeof v === "string" && Number.isFinite(Date.parse(v));
function isPaperStudy(value) {
	if (!record$1(value) || value.schema !== 1 || typeof value.language !== "string" || !value.language.length || value.language.length > 40 || !Array.isArray(value.cards) || value.cards.length > 1e4) return false;
	try {
		new Intl.Locale(value.language);
	} catch {
		return false;
	}
	const ids = /* @__PURE__ */ new Set();
	return value.cards.every((c) => {
		if (!record$1(c) || typeof c.id !== "string" || !c.id.length || c.id.length > 200 || ids.has(c.id) || !["basic", "cloze"].includes(String(c.kind)) || typeof c.question !== "string" || !c.question.trim() || c.question.length > 1e4 || typeof c.answer !== "string" || !c.answer.trim() || c.answer.length > 1e4 || !date(c.createdAt) || !record$1(c.schedule) || !Array.isArray(c.reviews)) return false;
		ids.add(c.id);
		const s = c.schedule;
		const reviewIds = /* @__PURE__ */ new Set();
		return Number.isInteger(s.repetitions) && Number(s.repetitions) >= 0 && Number.isInteger(s.intervalDays) && Number(s.intervalDays) >= 0 && typeof s.ease === "number" && Number.isFinite(s.ease) && s.ease >= 1.3 && s.ease <= 10 && date(s.dueAt) && c.reviews.length <= 1e3 && c.reviews.every((r) => record$1(r) && typeof r.id === "string" && !!r.id && !reviewIds.has(r.id) && (reviewIds.add(r.id), true) && date(r.at) && Number.isInteger(r.quality) && Number(r.quality) >= 0 && Number(r.quality) <= 5) && (!c.source || record$1(c.source) && [
			"noteId",
			"pageId",
			"objectId",
			"quote"
		].every((k) => typeof c.source[k] === "string") && Number.isInteger(c.source.revision) && Number(c.source.revision) >= 0 && typeof c.source.quote === "string" && c.source.quote.length <= 1e4);
	});
}
function initialSchedule(now = (/* @__PURE__ */ new Date()).toISOString()) {
	return {
		repetitions: 0,
		intervalDays: 0,
		ease: 2.5,
		dueAt: now
	};
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
function stableId(value) {
	let hash = 14695981039346656037n;
	for (const char of value) {
		hash ^= BigInt(char.codePointAt(0));
		hash = BigInt.asUintN(64, hash * 1099511628211n);
	}
	return `card-${hash.toString(16)}`;
}
function studySource(document, object, quote) {
	return {
		noteId: document.noteId,
		pageId: object.pageId,
		objectId: object.id,
		revision: document.revision,
		quote: quote.slice(0, 1e4)
	};
}
function suggestClozeCards(document, objectIds) {
	const cards = [];
	for (const object of document.objects.filter((o) => (!objectIds || objectIds.includes(o.id)) && o.markdown)) {
		const paragraphs = object.markdown.split(/\n\s*\n/).filter((p) => p.trim().length > 30 && p.length < 1e3 && !p.includes("```") && !p.includes("$") && !p.includes("|") && !p.startsWith("#"));
		for (const quote of paragraphs) {
			const answer = [...quote.match(/[\p{L}]{7,}/gu) ?? []].sort((a, b) => b.length - a.length)[0];
			if (!answer) continue;
			const id = stableId(`${document.noteId}|${object.id}|${quote}|${answer}`), question = quote.replace(answer, "_____");
			if (cards.some((c) => c.id === id)) continue;
			cards.push({
				id,
				kind: "cloze",
				question,
				answer,
				source: studySource(document, object, quote),
				schedule: initialSchedule(),
				reviews: [],
				createdAt: (/* @__PURE__ */ new Date()).toISOString()
			});
			if (cards.length >= 30) return cards;
		}
	}
	return cards;
}
function summaryExcerpts(document) {
	return document.pages.flatMap((page) => document.objects.filter((o) => o.pageId === page.id && o.markdown).flatMap((object) => object.markdown.split(/\n\s*\n/).filter((p) => p.trim() && !p.startsWith("#")).slice(0, 2).map((quote) => ({
		text: quote.slice(0, 700),
		source: studySource(document, object, quote)
	})))).slice(0, 20);
}
function sourceIsCurrent(document, source) {
	const object = document.objects.find((o) => o.id === source.objectId && o.pageId === source.pageId);
	return document.noteId === source.noteId && !!object?.markdown?.includes(source.quote);
}
/** RFC-style quoted rows; report invalid entries instead of inventing answers. */
function importStudyRows(text) {
	if (text.length > 1048576) throw Error("Le fichier de cartes dépasse 1 Mo.");
	let inQuote = false;
	const counts = /* @__PURE__ */ new Map([
		["	", 0],
		[";", 0],
		[",", 0]
	]);
	for (let i = 0; i < text.length; i++) if (text[i] === "\"") {
		if (inQuote && text[i + 1] === "\"") i++;
		else inQuote = !inQuote;
	} else if (!inQuote && text[i] === "\n") break;
	else if (!inQuote && counts.has(text[i])) counts.set(text[i], counts.get(text[i]) + 1);
	const separator = [...counts].sort((a, b) => b[1] - a[1])[0][0];
	const rows = [];
	let row = [], field = "", quoted = false;
	for (let i = 0; i < text.length; i++) {
		const c = text[i];
		if (c === "\"") {
			if (quoted && text[i + 1] === "\"") {
				field += "\"";
				i++;
			} else quoted = !quoted;
		} else if (c === separator && !quoted) {
			row.push(field);
			field = "";
		} else if (c === "\n" && !quoted) {
			row.push(field.replace(/\r$/, ""));
			rows.push(row);
			row = [];
			field = "";
		} else field += c;
	}
	if (quoted) throw Error("Une citation du fichier CSV n’est pas fermée.");
	if (field || row.length) {
		row.push(field.replace(/\r$/, ""));
		rows.push(row);
	}
	const header = rows[0]?.map((s) => s.trim().toLowerCase());
	if (header && [
		"question",
		"recto",
		"front"
	].includes(header[0]) && [
		"answer",
		"réponse",
		"reponse",
		"verso",
		"back"
	].includes(header[1])) rows.shift();
	let rejected = 0;
	const cards = [];
	for (const fields of rows) {
		if (fields.every((f) => !f.trim())) continue;
		const [question, answer] = fields.map((s) => s.trim());
		if (fields.length !== 2 || !question || !answer || question.length > 1e4 || answer.length > 1e4) {
			rejected++;
			continue;
		}
		cards.push({
			id: crypto.randomUUID(),
			kind: "basic",
			question,
			answer,
			schedule: initialSchedule(),
			reviews: [],
			createdAt: (/* @__PURE__ */ new Date()).toISOString()
		});
		if (cards.length > 1e4) throw Error("Le fichier contient plus de 10000 cartes.");
	}
	return {
		cards,
		rejected,
		format: separator === "	" ? "TSV" : "CSV"
	};
}
//#endregion
//#region src/lib/notebook.ts
/** Stable attachment identity shared by desktop and PWA. Existing IDs are never rewritten. */
var LEGACY_NOTE_ID = "legacy-whiteboard-main";
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
function hasLegacyDrawing(drafts) {
	return drafts.some((d) => d.type === "whiteboard" && d.documentId === "whiteboard-main" && hasNoteMedia(d.content));
}
function hasNoteMedia(content) {
	if (!content || typeof content !== "object") return false;
	const value = content;
	return Boolean(value.board?.strokes?.length || value.photos?.length);
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
var definitionNode = (tree, label) => {
	let found;
	visit(tree, (node) => {
		if (node.type === "definition" && node.identifier === label) found = node;
	});
	return found;
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
function applyEdits(markdown, edits) {
	const ordered = [...edits].sort((a, b) => a.from - b.from || a.to - b.to);
	let cursor = 0, result = "";
	for (const edit of ordered) {
		if (!Number.isSafeInteger(edit.from) || !Number.isSafeInteger(edit.to) || edit.from < cursor || edit.to < edit.from || edit.to > markdown.length) throw Error("Deux conversions d’image se chevauchent. Le texte original reste conservé.");
		result += markdown.slice(cursor, edit.from) + edit.text;
		cursor = edit.to;
	}
	return result + markdown.slice(cursor);
}
/** Rewrites only destinations or image reference labels; all other original characters survive exactly. */
function planLegacyPaperImageRewrite(scan, replacements) {
	const fresh = scanLegacyPaperImages(scan.markdown);
	if (JSON.stringify(fresh) !== JSON.stringify(scan)) throw Error("Le recensement d’images ne correspond plus au texte original.");
	const byId = new Map(scan.images.map((image) => [image.id, image])), edits = [], append = [], aliases = /* @__PURE__ */ new Map(), decodedLower = decodeString(scan.markdown).toLowerCase();
	let nextLabel = 0;
	for (const [id, url] of replacements) {
		const image = byId.get(id);
		if (!image || !["photo", "data"].includes(image.kind) || !parsePhotoReference(url)) throw Error("Cette image ou sa nouvelle référence est incompatible. Le texte original reste conservé.");
	}
	const definitions = new Map(scan.definitions.map((definition) => [definition.id, definition])), handledDefinitions = /* @__PURE__ */ new Set();
	const makeAlias = (definition, url) => {
		const key = `${definition.id}\u0000${url}`, known = aliases.get(key);
		if (known) return known;
		let label;
		do
			label = `dowze-note-image-${++nextLabel}`;
		while (decodedLower.includes(label) || scan.definitions.some((item) => item.identifier === label));
		const copy = applyEdits(scan.markdown.slice(definition.from, definition.to), [{
			from: definition.labelRange.from - definition.from,
			to: definition.labelRange.to - definition.from,
			text: label
		}, {
			from: definition.destination.from - definition.from,
			to: definition.destination.to - definition.from,
			text: url
		}]);
		let cloned = copy;
		const matching = definitionNode(fromMarkdown(copy, mdastOptions()), label);
		if (!matching || matching.url !== url || matching.title !== definition.title) {
			const title = definition.title === null ? "" : ` "${definition.title.replace(/\\/g, "\\\\").replace(/"/g, "\\\"")}"`;
			cloned = `[${label}]: <${url}>${title}`;
		}
		const checked = definitionNode(fromMarkdown(cloned, mdastOptions()), label);
		if (!checked || checked.url !== url || (checked.title ?? null) !== definition.title) throw Error("Le titre de cette image ne peut pas être conservé exactement. Son original reste visible.");
		aliases.set(key, label);
		append.push(cloned);
		return label;
	};
	for (const image of scan.images) {
		const url = replacements.get(image.id);
		if (url === void 0) continue;
		if (image.destination) {
			edits.push({
				from: image.destination.from,
				to: image.destination.to,
				text: url
			});
			continue;
		}
		const ref = image.reference, definition = ref ? definitions.get(ref.definitionId) : void 0;
		if (!ref || !definition) throw Error("La destination de l’image ne peut pas être retrouvée.");
		const usages = scan.images.filter((other) => other.reference?.definitionId === definition.id);
		if (!definition.sharedWithLinks && usages.every((other) => replacements.get(other.id) === url)) {
			if (!handledDefinitions.has(definition.id)) {
				edits.push({
					from: definition.destination.from,
					to: definition.destination.to,
					text: url
				});
				handledDefinitions.add(definition.id);
			}
			continue;
		}
		const label = makeAlias(definition, url);
		edits.push(ref.range ? {
			from: ref.range.from,
			to: ref.range.to,
			text: `[${label}]`
		} : {
			from: image.to,
			to: image.to,
			text: `[${label}]`
		});
	}
	if (append.length) {
		const eol = scan.markdown.includes("\r\n") ? "\r\n" : scan.markdown.includes("\r") && !scan.markdown.includes("\n") ? "\r" : "\n", separator = scan.markdown.length === 0 ? "" : /(?:\r\n|\r|\n){2}$/.test(scan.markdown) ? "" : /[\r\n]$/.test(scan.markdown) ? eol : eol + eol;
		edits.push({
			from: scan.markdown.length,
			to: scan.markdown.length,
			text: separator + append.join(eol) + eol
		});
	}
	return {
		markdown: applyEdits(scan.markdown, edits),
		edits: edits.sort((a, b) => a.from - b.from || a.to - b.to)
	};
}
var ascii = (bytes, from, to) => String.fromCharCode(...bytes.subarray(from, to));
var pngCrcTable = /* @__PURE__ */ new Uint32Array(256);
for (let value = 0; value < 256; value++) {
	let next = value;
	for (let bit = 0; bit < 8; bit++) next = next & 1 ? next >>> 1 ^ 3988292384 : next >>> 1;
	pngCrcTable[value] = next;
}
function pngCrc(bytes, from, to) {
	let value = 4294967295;
	for (let index = from; index < to; index++) value = value >>> 8 ^ pngCrcTable[(value ^ bytes[index]) & 255];
	return (value ^ 4294967295) >>> 0;
}
function percentBytes(payload, limit) {
	if (payload.length > limit * 3) throw Error("Cette image intégrée dépasse la capacité de récupération.");
	const bytes = new Uint8Array(Math.min(payload.length, limit));
	let written = 0;
	for (let index = 0; index < payload.length; index++) {
		let byte = payload.charCodeAt(index);
		if (byte === 37) {
			const hex = payload.slice(index + 1, index + 3);
			if (!/^[a-fA-F0-9]{2}$/.test(hex)) throw Error("L’image intégrée possède un encodage URI invalide.");
			byte = parseInt(hex, 16);
			index += 2;
		} else if (byte > 127 || byte <= 32 || byte === 35) throw Error("Les octets de cette image doivent être encodés explicitement dans son URI.");
		if (written >= limit) throw Error("Cette image intégrée dépasse la capacité de récupération.");
		bytes[written++] = byte;
	}
	return bytes.slice(0, written);
}
/** Decode a bounded raster data URI without contacting any service or changing its bytes. */
function decodeLegacyRasterDataUrl(url, options = {}) {
	const maxBytes = options.maxBytes ?? 16777216, maxPixels = options.maxPixels ?? 4e7;
	if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 16777216 || !Number.isSafeInteger(maxPixels) || maxPixels < 1) throw Error("La capacité de récupération d’image est incompatible.");
	const match = /^data:(image\/(?:png|jpeg|jpg|gif|webp))((?:;[^,\r\n]*)?),([^\r\n]*)$/i.exec(url);
	if (!match) throw Error("Cette image intégrée ne possède pas un encodage raster pris en charge. Son original reste conservé.");
	const parameters = match[2] ? match[2].slice(1).split(";") : [], base64 = parameters.at(-1)?.toLowerCase() === "base64";
	if (base64) parameters.pop();
	if (parameters.some((parameter) => !/^[-A-Za-z0-9!#$&^_.+]+=[^;\r\n]*$/.test(parameter))) throw Error("Les paramètres de cette image intégrée sont incompatibles.");
	let bytes;
	if (base64) {
		let payload = match[3];
		if (payload.includes("%")) {
			const decoded = percentBytes(payload, Math.ceil(maxBytes / 3) * 4), parts = [];
			for (let offset = 0; offset < decoded.length; offset += 32768) parts.push(String.fromCharCode(...decoded.subarray(offset, offset + 32768)));
			payload = parts.join("");
		}
		if (!/^[A-Za-z0-9+/]+={0,2}$/.test(payload) || payload.length % 4 !== 0 || payload.length > Math.ceil(maxBytes / 3) * 4) throw Error("Cette image intégrée dépasse la capacité ou possède un encodage incomplet.");
		let binary;
		try {
			binary = atob(payload);
		} catch {
			throw Error("L’image intégrée possède un encodage base64 invalide.");
		}
		if (binary.length > maxBytes || btoa(binary) !== payload) throw Error("L’image intégrée possède un encodage base64 non canonique ou trop volumineux.");
		bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
	} else bytes = percentBytes(match[3], maxBytes);
	return validateLegacyRasterBytes(bytes, match[1], options);
}
/** Validate exact upload bytes without a base64 round trip or contacting any service. */
function validateLegacyRasterBytes(bytes, declaredType, options = {}) {
	const maxBytes = options.maxBytes ?? 16777216, maxPixels = options.maxPixels ?? 4e7;
	if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 16777216 || !Number.isSafeInteger(maxPixels) || maxPixels < 1) throw Error("La capacité de récupération d’image est incompatible.");
	if (!(bytes instanceof Uint8Array) || !bytes.byteLength || bytes.byteLength > maxBytes || typeof declaredType !== "string" || !/^image\/(?:png|jpeg|jpg|gif|webp)$/i.test(declaredType)) throw Error("Cet original ne possède pas des octets raster pris en charge dans la limite de récupération.");
	const normalizedType = declaredType.toLowerCase(), mediaType = normalizedType === "image/jpg" ? "image/jpeg" : normalizedType;
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	let width = 0, height = 0;
	if (mediaType === "image/png") {
		if (bytes.length < 33 || !bytes.subarray(0, 8).every((byte, index) => byte === [
			137,
			80,
			78,
			71,
			13,
			10,
			26,
			10
		][index]) || view.getUint32(8) !== 13 || ascii(bytes, 12, 16) !== "IHDR") throw Error("La signature PNG de cet original est invalide.");
		width = view.getUint32(16);
		height = view.getUint32(20);
		let offset = 8, ended = false, hasPixels = false;
		while (offset + 12 <= bytes.length) {
			const size = view.getUint32(offset), end = offset + 12 + size;
			if (end > bytes.length || pngCrc(bytes, offset + 4, end - 4) !== view.getUint32(end - 4)) throw Error("Une portion PNG est incomplète ou son contrôle d’intégrité est invalide.");
			const kind = ascii(bytes, offset + 4, offset + 8);
			if (kind === "IDAT") hasPixels = true;
			if (kind === "IEND") {
				if (size !== 0 || end !== bytes.length) throw Error("La fin PNG est incompatible.");
				ended = true;
			}
			offset = end;
		}
		if (offset !== bytes.length || !ended || !hasPixels) throw Error("Cet original PNG est incomplet.");
	} else if (mediaType === "image/gif") {
		if (bytes.length < 14 || !["GIF87a", "GIF89a"].includes(ascii(bytes, 0, 6)) || bytes.at(-1) !== 59) throw Error("La signature GIF de cet original est invalide.");
		width = view.getUint16(6, true);
		height = view.getUint16(8, true);
		let offset = 13 + (bytes[10] & 128 ? 3 * (1 << (bytes[10] & 7) + 1) : 0), hasPixels = false;
		const subBlocks = () => {
			while (offset < bytes.length) {
				const size = bytes[offset++];
				if (size === 0) return;
				if (offset + size > bytes.length) throw Error("Une portion GIF est incomplète.");
				offset += size;
			}
			throw Error("La fin GIF est incomplète.");
		};
		while (offset < bytes.length) {
			const marker = bytes[offset++];
			if (marker === 59) {
				if (offset !== bytes.length) throw Error("La fin GIF est incompatible.");
				break;
			}
			if (marker === 33) {
				if (offset >= bytes.length) throw Error("Une extension GIF est incomplète.");
				offset++;
				subBlocks();
			} else if (marker === 44) {
				if (offset + 9 > bytes.length) throw Error("La taille GIF est incomplète.");
				const packed = bytes[offset + 8];
				offset += 9 + (packed & 128 ? 3 * (1 << (packed & 7) + 1) : 0);
				if (offset >= bytes.length || bytes[offset] < 2 || bytes[offset] > 8) throw Error("Les pixels GIF sont incompatibles.");
				offset++;
				subBlocks();
				hasPixels = true;
			} else throw Error("La structure GIF est incompatible.");
		}
		if (!hasPixels) throw Error("Cet original GIF ne contient pas d’image.");
	} else if (mediaType === "image/jpeg") {
		if (bytes.length < 4 || bytes[0] !== 255 || bytes[1] !== 216 || bytes.at(-2) !== 255 || bytes.at(-1) !== 217) throw Error("La signature JPEG de cet original est invalide.");
		let offset = 2, hasPixels = false;
		while (offset + 3 < bytes.length) {
			if (bytes[offset++] !== 255) throw Error("L’en-tête JPEG est incompatible.");
			while (bytes[offset] === 255) offset++;
			const marker = bytes[offset++];
			if (marker === 217) break;
			if (marker === 1 || marker >= 208 && marker <= 215) continue;
			if (offset + 2 > bytes.length) throw Error("Un segment JPEG est incomplet.");
			const size = view.getUint16(offset);
			if (size < 2 || offset + size > bytes.length) throw Error("Un segment JPEG est incomplet.");
			if (marker === 218) {
				if (size < 6) throw Error("Les pixels JPEG sont incomplets.");
				hasPixels = true;
				break;
			}
			if ([
				192,
				193,
				194,
				195,
				197,
				198,
				199,
				201,
				202,
				203,
				205,
				206,
				207
			].includes(marker)) {
				if (size < 11 || size !== 8 + 3 * bytes[offset + 7]) throw Error("La taille JPEG est incompatible.");
				height = view.getUint16(offset + 3);
				width = view.getUint16(offset + 5);
			}
			offset += size;
		}
		if (!hasPixels) throw Error("Cet original JPEG est incomplet.");
	} else {
		if (bytes.length < 25 || ascii(bytes, 0, 4) !== "RIFF" || ascii(bytes, 8, 12) !== "WEBP" || view.getUint32(4, true) + 8 !== bytes.length) throw Error("La signature WebP de cet original est invalide.");
		let offset = 12, hasImage = false;
		while (offset + 8 <= bytes.length) {
			const kind = ascii(bytes, offset, offset + 4), size = view.getUint32(offset + 4, true), start = offset + 8;
			if (start + size > bytes.length) throw Error("Une portion WebP est incomplète.");
			if (kind === "VP8 ") {
				hasImage = true;
				if (size < 10 || bytes[start + 3] !== 157 || bytes[start + 4] !== 1 || bytes[start + 5] !== 42) throw Error("La taille WebP est incompatible.");
				if (!width) {
					width = view.getUint16(start + 6, true) & 16383;
					height = view.getUint16(start + 8, true) & 16383;
				}
			} else if (kind === "VP8L") {
				hasImage = true;
				if (size < 5 || bytes[start] !== 47) throw Error("La taille WebP sans perte est incompatible.");
				const bits = view.getUint32(start + 1, true);
				if (!width) {
					width = (bits & 16383) + 1;
					height = (bits >>> 14 & 16383) + 1;
				}
			} else if (kind === "VP8X") {
				if (size < 10) throw Error("La taille WebP étendue est incompatible.");
				width = bytes[start + 4] + (bytes[start + 5] << 8) + (bytes[start + 6] << 16) + 1;
				height = bytes[start + 7] + (bytes[start + 8] << 8) + (bytes[start + 9] << 16) + 1;
			} else if (kind === "ANMF") hasImage = true;
			offset = start + size + (size & 1);
		}
		if (offset !== bytes.length || !hasImage) throw Error("Cet original WebP ne contient pas une image complète.");
	}
	if (!width || !height || width * height > maxPixels) throw Error("Les dimensions de cet original dépassent la capacité de récupération. Ses octets restent conservés.");
	return {
		bytes,
		mediaType
	};
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
function pointInPolygon(point, polygon) {
	let inside = false;
	for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
		const a = polygon[i], b = polygon[j];
		if (a.y > point.y !== b.y > point.y && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
	}
	return inside;
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
function lassoContains(object, polygon) {
	if (object.kind === "ink") return (object.points ?? []).some((p) => pointInPolygon(objectPoint(object, p), polygon));
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
	].every((p) => pointInPolygon(objectPoint(object, p), polygon));
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
var ownsPaperDocument = (type, id) => type === "whiteboard" && id.startsWith("paper-v3-") || type === "preferences" && id === "paper-library-v1";
var finite = (n) => typeof n === "number" && Number.isFinite(n);
var record = (v) => !!v && typeof v === "object" && !Array.isArray(v);
var id = (v) => typeof v === "string" && v.length > 0 && v.length <= 200;
var unique = (items) => new Set(items.map((item) => item.id)).size === items.length;
function validAudioSegments(value, root, duration, assets, metadata) {
	if (!Array.isArray(value) || !value.length || value.length > 1e4) return false;
	let offset = 0;
	for (const [index, part] of value.entries()) {
		if (!record(part) || !assets.has(part.assetId) || index === 0 && part.assetId !== root || !finite(part.offset) || !finite(part.duration) || part.duration <= 0 || Math.abs(part.offset - offset) >= .001 || part.source !== void 0 && !validAudioSource(part.source, part.assetId, metadata)) return false;
		offset += part.duration;
	}
	return Math.abs(duration - offset) < .001;
}
function validAudioSource(value, root, assets) {
	if (!record(value) || value.schema !== 1 || value.originalName !== void 0 && (typeof value.originalName !== "string" || value.originalName.length > 500) || typeof value.mediaType !== "string" || !/^audio\//.test(value.mediaType) || !Number.isSafeInteger(value.size) || Number(value.size) <= 0 || !Array.isArray(value.chunks) || !value.chunks.length || value.chunks.length > 1e4) return false;
	const ids = /* @__PURE__ */ new Set();
	let size = 0;
	for (const [index, chunk] of value.chunks.entries()) {
		if (!record(chunk) || !id(chunk.assetId) || ids.has(chunk.assetId) || index === 0 && chunk.assetId !== root || !Number.isSafeInteger(chunk.size) || !finite(chunk.size) || chunk.size <= 0 || chunk.size > 16777216 || typeof chunk.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(chunk.sha256) || !assets.some((a) => record(a) && a.id === chunk.assetId && a.size === chunk.size)) return false;
		ids.add(chunk.assetId);
		size += chunk.size;
	}
	return size === value.size;
}
function isPaperDocument(value) {
	if (!record(value) || value.notebookSchema !== 3 || !id(value.noteId) || !Number.isSafeInteger(value.revision) || Number(value.revision) < 0 || typeof value.updatedAt !== "string" || !Number.isFinite(Date.parse(value.updatedAt))) return false;
	if (value.collaboration !== void 0 && (!record(value.collaboration) || value.collaboration.schema !== 1 || !id(value.collaboration.lineage) || typeof value.collaboration.state !== "string" || value.collaboration.state.length > 33554432 / 3 + 8)) return false;
	if (!Array.isArray(value.pages) || !value.pages.length || value.pages.length > 2e3 || !Array.isArray(value.objects) || value.objects.length > 1e5 || !Array.isArray(value.assets) || !Array.isArray(value.audio) || !record(value.legacy) || typeof value.legacy.markdown !== "string" || !id(value.legacy.boardId) || typeof value.legacy.migratedAt !== "string") return false;
	if (!value.pages.every((p) => record(p) && id(p.id) && (p.flowRootId === void 0 || id(p.flowRootId)) && finite(p.width) && p.width >= 100 && p.width <= 2e4 && finite(p.height) && p.height >= 100 && p.height <= 1e5 && [
		"plain",
		"ruled",
		"grid",
		"dots"
	].includes(String(p.pattern)) && typeof p.color === "string" && typeof p.bookmark === "boolean" && finite(p.rotation) && (p.template === void 0 || [
		"standard",
		"cornell",
		"music",
		"weekly"
	].includes(String(p.template))) && (p.spacing === void 0 || finite(p.spacing) && p.spacing >= 8 && p.spacing <= 100) && (!p.pdf || record(p.pdf) && id(p.pdf.assetId) && Number.isInteger(p.pdf.pageNumber) && Number(p.pdf.pageNumber) >= 1 && (p.pdf.text === void 0 || typeof p.pdf.text === "string")))) return false;
	const pages = new Set(value.pages.map((p) => p.id));
	if (!value.assets.every((a) => record(a) && id(a.id) && typeof a.name === "string" && typeof a.mediaType === "string" && finite(a.size) && a.size >= 0 && (a.serverId === void 0 || id(a.serverId)))) return false;
	const assets = new Set(value.assets.map((a) => a.id));
	if (!value.objects.every((o) => record(o) && id(o.id) && pages.has(o.pageId) && [
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
	].every(finite) && Number(o.width) >= 0 && Number(o.height) >= 0 && typeof o.locked === "boolean" && (o.opacity === void 0 || finite(o.opacity) && o.opacity >= 0 && o.opacity <= 1) && (o.strokeStyle === void 0 || [
		"solid",
		"dashed",
		"dotted"
	].includes(String(o.strokeStyle))) && (o.mirrorX === void 0 || typeof o.mirrorX === "boolean") && (o.mirrorY === void 0 || typeof o.mirrorY === "boolean") && (o.nibAngle === void 0 || finite(o.nibAngle)) && (o.textPartition === void 0 || id(o.textPartition)) && (o.groupId === void 0 || id(o.groupId)) && (o.kind === "text" || o.kind === "sticky" ? typeof o.markdown === "string" : true) && (o.kind === "image" ? assets.has(o.assetId) : true) && (o.kind === "ink" ? Array.isArray(o.points) && o.points.length > 0 && o.points.every((p) => record(p) && finite(p.x) && finite(p.y) && finite(p.time) && (p.pressure === void 0 || finite(p.pressure) && p.pressure >= 0 && p.pressure <= 1) && [
		p.tiltX,
		p.tiltY,
		p.twist,
		p.nibAngle
	].every((n) => n === void 0 || finite(n))) : true))) return false;
	if (!value.audio.every((a) => record(a) && id(a.id) && assets.has(a.assetId) && typeof a.name === "string" && finite(a.duration) && a.duration >= 0 && finite(a.startedAt) && (a.inProgress === void 0 || typeof a.inProgress === "boolean") && (a.segments === void 0 || validAudioSegments(a.segments, a.assetId, a.duration, assets, value.assets)) && (a.source === void 0 || a.segments === void 0 && validAudioSource(a.source, a.assetId, value.assets)))) return false;
	if (value.study !== void 0 && !isPaperStudy(value.study)) return false;
	const audio = new Set(value.audio.map((a) => a.id));
	if (!value.objects.every((o) => o.textFlow === void 0 || o.kind === "text" && record(o.textFlow) && o.textFlow.schema === 1 && typeof o.textFlow.source === "string" && o.textFlow.source.length <= 200 && Array.isArray(o.textFlow.pageIds) && o.textFlow.pageIds.length > 0 && o.textFlow.pageIds.length <= 2e3 && o.textFlow.pageIds[0] === o.pageId && o.textFlow.pageIds.every((p) => pages.has(p)) && new Set(o.textFlow.pageIds).size === o.textFlow.pageIds.length && Array.isArray(o.textFlow.breaks) && o.textFlow.breaks.length === o.textFlow.pageIds.length + 1 && o.textFlow.breaks[0] === 0 && (o.textFlow.sourceOffsets === void 0 || Array.isArray(o.textFlow.sourceOffsets) && o.textFlow.sourceOffsets.length === o.textFlow.breaks.length && o.textFlow.sourceOffsets[0] === 0 && o.textFlow.sourceOffsets.every((n, i) => Number.isSafeInteger(n) && Number(n) >= 0 && (i === 0 || Number(n) >= Number(o.textFlow.sourceOffsets[i - 1])))) && o.textFlow.breaks.every((n, i) => finite(n) && n >= 0 && (i === 0 || n > Number(o.textFlow.breaks[i - 1]))))) return false;
	return unique(value.pages) && unique(value.objects) && unique(value.assets) && unique(value.audio) && value.pages.every((p) => !p.pdf || assets.has(p.pdf.assetId)) && value.objects.every((o) => !o.audioAnchor || record(o.audioAnchor) && audio.has(o.audioAnchor.sessionId) && finite(o.audioAnchor.time) && o.audioAnchor.time >= 0);
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
	if (!record(legacyBoard) || !Array.isArray(legacyBoard.photos)) return [];
	const photos = legacyBoard.photos.flatMap((photo, photoIndex) => record(photo) && typeof photo.id === "string" && photo.id ? [{
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
	const old = record(legacyBoard) ? legacyBoard : {};
	const board = record(old.board) ? old.board : {};
	const strokes = [];
	if (Array.isArray(board.strokes)) for (const stroke of board.strokes) {
		if (!record(stroke) || !Array.isArray(stroke.points)) continue;
		const points = stroke.points.filter((p) => record(p) && finite(p.x) && finite(p.y)).map((p) => ({
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
function distanceToSegment(p, a, b) {
	const dx = b.x - a.x, dy = b.y - a.y;
	const t = dx || dy ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy))) : 0;
	return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}
/** Split at the eraser's swept path, including sparse strokes crossing between samples. */
function eraseInk(object, from, to, radius, whole) {
	const pts = object.points ?? [];
	if (object.kind !== "ink" || object.locked || !pts.length) return [object];
	const hits = (p) => distanceToSegment(objectPoint(object, p), from, to) <= radius + (object.strokeWidth ?? 3) / 2;
	const expanded = [];
	for (let i = 0; i < pts.length; i++) {
		const a = pts[i - 1], b = pts[i];
		if (a) {
			const n = Math.min(1e4, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / Math.max(1, radius / 2)));
			for (let j = 1; j < n; j++) {
				const t = j / n;
				expanded.push({
					...b,
					x: a.x + (b.x - a.x) * t,
					y: a.y + (b.y - a.y) * t,
					time: a.time + (b.time - a.time) * t
				});
			}
		}
		expanded.push(b);
	}
	if (!expanded.some(hits)) return [object];
	if (whole) return [];
	const runs = [];
	let run = [];
	for (const p of expanded) if (hits(p)) {
		if (run.length) runs.push(run);
		run = [];
	} else run.push(p);
	if (run.length) runs.push(run);
	return runs.map((points, i) => ({
		...object,
		id: `${object.id.split("~")[0]}~${crypto.randomUUID()}-${i}`,
		points
	}));
}
var emptyPaperHistory = () => ({
	past: [],
	future: []
});
function recordPaperHistory(history, before) {
	return {
		past: [...history.past.slice(-49), before],
		future: []
	};
}
function travelPaperHistory(history, current, direction) {
	const selected = (direction === "undo" ? history.past : history.future).at(-1);
	if (!selected) return null;
	return {
		document: {
			...selected,
			revision: current.revision + 1,
			updatedAt: (/* @__PURE__ */ new Date()).toISOString()
		},
		history: direction === "undo" ? {
			past: history.past.slice(0, -1),
			future: [...history.future, current]
		} : {
			past: [...history.past, current],
			future: history.future.slice(0, -1)
		}
	};
}
//#endregion
export { importStudyRows as A, notebookIdentityDigest as C, parsePhotoReference as D, noteBoardId as E, suggestClozeCards as F, summaryExcerpts as I, reviewStudyCard as M, sourceIsCurrent as N, photoReference as O, studySource as P, notebookDocumentId as S, hasLegacyDrawing as T, decodeLegacyRasterDataUrl as _, isPaperDocument as a, validateLegacyRasterBytes as b, ownsPaperDocument as c, calligraphyOutline as d, inkOutline as f, paperInkPointOnPage as g, paperDirectionOnPage as h, eraseInk as i, initialSchedule as j, emptyStudy as k, recordPaperHistory as l, objectPoint as m, blankPage as n, legacyPaperPhotoIdentities as o, lassoContains as p, emptyPaperHistory as r, migratePaper as s, applyPaperCommand as t, travelPaperHistory as u, planLegacyPaperImageRewrite as v, LEGACY_NOTE_ID as w, legacyNotebookDocumentId as x, scanLegacyPaperImages as y };
