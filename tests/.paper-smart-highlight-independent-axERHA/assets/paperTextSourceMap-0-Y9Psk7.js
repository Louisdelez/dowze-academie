import { decodeString } from "micromark-util-decode-string";
import { fromMarkdown } from "mdast-util-from-markdown";
import { gfm } from "micromark-extension-gfm";
import { gfmFromMarkdown } from "mdast-util-gfm";
import { math } from "micromark-extension-math";
import { mathFromMarkdown } from "mdast-util-math";
//#region src/lib/paperImageSizing.ts
var validPaperImageRatio = (value) => typeof value === "number" && Number.isFinite(value) && value > 0 && value <= 1e4;
var marker$1 = /^<!-- dowze-image-size:v1 ratio=(\d+(?:\.\d+)?) -->$/;
function paperImageRatioMarker(value) {
	const match = typeof value === "string" ? marker$1.exec(value) : null, ratio = match && match[0] === value ? Number(match[1]) : void 0;
	return validPaperImageRatio(ratio) ? ratio : void 0;
}
/** Only a semantic image and its immediately following exact marker belong
* together, inline or after a complete image block. Descriptions, ordinary HTML,
* code and maths do not provide size evidence. Markdown is never rewritten. */
function parsePaperImageRatios(markdown) {
	const tree = fromMarkdown(markdown, {
		extensions: [gfm(), math()],
		mdastExtensions: [gfmFromMarkdown(), mathFromMarkdown()]
	}), definitions = /* @__PURE__ */ new Map(), ratios = [];
	const visit = (node, fn) => {
		fn(node);
		node.children?.forEach((child) => visit(child, fn));
	};
	visit(tree, (node) => {
		if (node.type === "definition" && node.identifier && !definitions.has(node.identifier)) definitions.set(node.identifier, node);
	});
	const walk = (parent) => {
		const children = parent.children ?? [];
		for (let i = 0; i < children.length; i++) {
			const block = children[i], image = block.type === "paragraph" && block.children?.length === 1 ? block.children[0] : block, next = children[i + 1], html = next?.type === "paragraph" && next.children?.length === 1 ? next.children[0] : next;
			if (image && (image.type === "image" || image.type === "imageReference") && html?.type === "html") {
				const ratio = paperImageRatioMarker(html.value), definition = image.type === "imageReference" && image.identifier ? definitions.get(image.identifier) : void 0, url = image.type === "image" ? image.url : definition?.url, from = image.position?.start.offset, to = image.position?.end.offset, markerFrom = html.position?.start.offset, markerTo = html.position?.end.offset;
				if (validPaperImageRatio(ratio) && url !== void 0 && [
					from,
					to,
					markerFrom,
					markerTo
				].every(Number.isSafeInteger) && from < to && to <= markerFrom && markerTo <= markdown.length) ratios.push({
					from,
					to,
					url,
					alt: image.alt ?? "",
					title: (image.type === "image" ? image.title : definition?.title) ?? null,
					ratio,
					markerFrom,
					markerTo
				});
			}
			walk(block);
		}
	};
	walk(tree);
	return ratios;
}
function paperImageRatioAt(ratios, from, to, url, alt, title) {
	return ratios.find((row) => row.from === from && row.to === to && row.url === url && row.alt === (alt ?? "") && row.title === (title ?? null))?.ratio ?? 1;
}
/** A structural page boundary cannot detach hidden size metadata from the
* original image. Boundaries at the image start keep the whole pair following. */
function paperImagePageOffsets(ratios, offsets) {
	return offsets.map((offset) => ratios.reduce((value, row) => value > row.from && value < row.markerTo ? row.markerTo : value, offset));
}
/** Remove recognized sizing controls only from this reader's presentation AST.
* ReactMarkdown otherwise displays HTML comments as literal text. Every other
* HTML node and every canonical source offset remain intact. */
function remarkPaperImageRatioPresentation({ ratios }) {
	const approved = new Set(ratios.map((row) => `${row.markerFrom}:${row.markerTo}`));
	return (tree) => {
		const walk = (parent) => {
			if (!parent.children) return false;
			let removed = false;
			parent.children = parent.children.filter((child) => {
				if (child.type === "html" && approved.has(`${child.position?.start.offset}:${child.position?.end.offset}`)) {
					removed = true;
					return false;
				}
				if (walk(child) && child.type === "paragraph" && child.children?.length === 0) {
					removed = true;
					return false;
				}
				return true;
			});
			return removed;
		};
		walk(tree);
	};
}
/** The ratio is relative to the original at the available width. Sheet height
* is a presentation cap, never a different ratio origin. Both dimensions are
* capped together so wide originals keep their aspect ratio. */
function paperImageDimensions(naturalWidth, naturalHeight, availableWidth, ratio, maxHeight = Infinity) {
	if (![
		naturalWidth,
		naturalHeight,
		availableWidth
	].every((value) => Number.isFinite(value) && value > 0) || !(maxHeight > 0)) return void 0;
	const widthHeight = availableWidth * naturalHeight / naturalWidth, baseHeight = Math.min(naturalHeight, widthHeight), height = Math.min(baseHeight * (validPaperImageRatio(ratio) ? ratio : 1), widthHeight, maxHeight);
	return {
		baseHeight,
		width: height * naturalWidth / naturalHeight,
		height
	};
}
/** Logical CSS widths ignore notebook zoom and rotation. A table cell supplies
* its own inner width; image-block wrappers intentionally span that same area. */
function paperImageAvailableWidth(image) {
	let parent = image.parentElement;
	while (parent) {
		const style = getComputedStyle(parent), width = [
			"inline",
			"inline-block",
			"inline-flex",
			"inline-grid"
		].includes(style.display) ? 0 : parent.clientWidth || parseFloat(style.width);
		if (width > 0) return Math.max(1, width - (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0));
		parent = parent.parentElement;
	}
	return image.naturalWidth;
}
function paperImageFrameHeight(image) {
	const frame = parseFloat(getComputedStyle(image).getPropertyValue("--flow-height"));
	return Number.isFinite(frame) && frame > 0 ? Math.max(1, frame - 32) : Infinity;
}
/** Offset layout units stay stable under page zoom and object rotation. Place
* an image control overlay inside its paper column without adding document
* height or moving the image/selection itself. */
function paperImageOverlayPlacement(image, requestedWidth) {
	const frame = image.closest(".paper-flow-source"), anchor = image.closest(".note-photo-node,.milkdown-image-block");
	if (!frame || !anchor || !Number.isFinite(requestedWidth) || requestedWidth <= 0) return void 0;
	const offset = (element) => {
		let left = 0, current = element;
		while (current) {
			left += current.offsetLeft;
			current = current.offsetParent;
		}
		return left;
	}, width = Math.min(requestedWidth, Math.max(1, frame.clientWidth || parseFloat(getComputedStyle(frame).width) || requestedWidth)), local = offset(anchor) - offset(frame);
	return {
		left: Math.max(-local, Math.min(0, (frame.clientWidth || parseFloat(getComputedStyle(frame).width) || width) - local - width)),
		width
	};
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
	const offsets = paperImagePageOffsets(markdown.includes("<!-- dowze-image-size:v1 ratio=") ? parsePaperImageRatios(markdown) : [], [
		0,
		...cuts,
		markdown.length
	]);
	return offsets.every((n, i) => Number.isSafeInteger(n) && n >= 0 && (i === 0 || n >= offsets[i - 1])) ? offsets : void 0;
}
//#endregion
export { paperImageDimensions as a, paperImageRatioAt as c, remarkPaperImageRatioPresentation as d, validPaperImageRatio as f, paperImageAvailableWidth as i, paperImageRatioMarker as l, rehypePaperSourceMap as n, paperImageFrameHeight as o, renderedMarkdownOffsets as r, paperImageOverlayPlacement as s, measureMarkdownPageOffsets as t, parsePaperImageRatios as u };
