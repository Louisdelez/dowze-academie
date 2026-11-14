import { decodeString } from "micromark-util-decode-string";
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
export { rehypePaperSourceMap as n, renderedMarkdownOffsets as r, measureMarkdownPageOffsets as t };
