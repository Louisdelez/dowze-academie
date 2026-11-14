import { t as __exportAll } from "./rolldown-runtime-D7D4PA-g.js";
import { r as renderedMarkdownOffsets, u as parsePaperImageRatios } from "./paperTextSourceMap-0-Y9Psk7.js";
import { i as textFlowFingerprint, t as paperObjectsOnPage } from "./paperTextFlow-T0_iEUZW.js";
import { fromMarkdown } from "mdast-util-from-markdown";
import { gfm } from "micromark-extension-gfm";
import { gfmFromMarkdown, gfmToMarkdown } from "mdast-util-gfm";
import { math } from "micromark-extension-math";
import { mathFromMarkdown, mathToMarkdown } from "mdast-util-math";
import { toMarkdown } from "mdast-util-to-markdown";
//#region src/lib/paperPageCopy.ts
var paperPageCopy_exports = /* @__PURE__ */ __exportAll({
	alignCopiedPageText: () => alignCopiedPageText,
	copiedPageText: () => copiedPageText,
	copyMarkdownRange: () => copyMarkdownRange,
	duplicatePaperPage: () => duplicatePaperPage
});
/** Slice the parsed rich structure rather than cutting syntax delimiters, code fences or links in half. */
function copyMarkdownRange(markdown, from, to) {
	if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to) || from < 0 || to > markdown.length || to < from) throw Error("Le passage de cette page n’est pas prêt.");
	if (from === 0 && to === markdown.length) return markdown;
	if (from === to) return "";
	const tree = fromMarkdown(markdown, {
		extensions: [gfm(), math()],
		mdastExtensions: [gfmFromMarkdown(), mathFromMarkdown()]
	});
	const ratios = markdown.includes("<!-- dowze-image-size:v1 ratio=") ? parsePaperImageRatios(markdown) : [], includedRatios = ratios.filter((row) => row.to > from && row.from < to);
	const clip = (node) => {
		const start = node.position?.start.offset, end = node.position?.end.offset, metadata = ratios.find((row) => node.type === "html" && row.markerFrom === start && row.markerTo === end);
		if (metadata) return includedRatios.includes(metadata) ? structuredClone(node) : null;
		const containsMetadata = typeof start === "number" && typeof end === "number" && includedRatios.some((row) => start <= row.markerFrom && end >= row.markerTo);
		if (typeof start === "number" && typeof end === "number" && (end <= from || start >= to) && !containsMetadata) return null;
		if (node.type === "definition") return null;
		if (node.type === "table") {
			const rows = node.children ?? [], included = rows.slice(1).filter((row) => clip(row));
			if (!included.length) return clip(rows[0]) ? structuredClone(node) : null;
			return {
				...node,
				children: [structuredClone(rows[0]), ...included.map((row) => structuredClone(row))]
			};
		}
		if (node.children) {
			const included = node.children.map(clip).filter((child) => !!child);
			if (!included.length) return null;
			const copy = {
				...node,
				children: included
			};
			if (node.type === "list" && node.ordered) copy.start = (node.start ?? 1) + node.children.findIndex((child) => clip(child) !== null);
			return copy;
		}
		if ([
			"text",
			"code",
			"inlineCode"
		].includes(node.type) && node.value !== void 0 && typeof start === "number" && typeof end === "number") {
			const map = renderedMarkdownOffsets(markdown.slice(start, end), node.value, node.type === "text" ? "text" : "code");
			if (!map) throw Error("Ce passage nécessite une mise en page supplémentaire. Son original est conservé.");
			let first = 0, last = 0;
			while (first < node.value.length && start + map[first] < from) first++;
			last = first;
			while (last < node.value.length && start + map[last] < to) last++;
			if (last === first) return null;
			return {
				...node,
				value: node.value.slice(first, last)
			};
		}
		return structuredClone(node);
	};
	const result = clip(tree);
	if (!result) return "";
	const referenced = /* @__PURE__ */ new Set();
	const visit = (node) => {
		if ((node.type === "linkReference" || node.type === "imageReference" || node.type === "footnoteReference") && node.identifier) referenced.add(node.identifier);
		node.children?.forEach(visit);
	};
	visit(result);
	const definitions = tree.children.filter((node) => (node.type === "definition" || node.type === "footnoteDefinition") && node.identifier && referenced.has(node.identifier));
	result.children?.push(...definitions.map((node) => structuredClone(node)));
	return toMarkdown(result, { extensions: [gfmToMarkdown(), mathToMarkdown()] });
}
function copiedPageText(object, pageId) {
	const flow = object.textFlow;
	if (!flow || flow.pageIds.length === 1) return object.markdown ?? "";
	const index = flow.pageIds.indexOf(pageId), offsets = flow.sourceOffsets;
	if (index < 0 || !offsets || flow.source !== textFlowFingerprint(object.markdown ?? "", object.width, object.height)) throw Error("La disposition de cette page doit être actualisée avant sa copie.");
	return copyMarkdownRange(object.markdown ?? "", offsets[index], offsets[index + 1]);
}
/** A copy has independent page/object/group identities; immutable files stay referenced within the same note. */
function duplicatePaperPage(document, pageId, newId = () => crypto.randomUUID()) {
	const page = document.pages.find((p) => p.id === pageId);
	if (!page) throw Error("Cette page n’existe plus.");
	const target = newId(), objects = paperObjectsOnPage(document, pageId), groups = new Map(objects.filter((o) => o.groupId).map((o) => [o.groupId, newId()]));
	const commands = [{
		type: "insert-page",
		page: {
			...page,
			id: target,
			flowRootId: void 0
		},
		afterId: page.id
	}];
	for (const object of objects) commands.push({
		type: "upsert-object",
		object: {
			...structuredClone(object),
			id: newId(),
			pageId: target,
			textFlow: void 0,
			...object.kind === "text" ? { markdown: copiedPageText(object, pageId) } : {},
			...object.groupId ? { groupId: groups.get(object.groupId) } : {}
		}
	});
	return {
		command: {
			type: "batch",
			commands
		},
		pageId: target
	};
}
/** Keep the first painted line at its original page ordinate; paragraph margins are not copied as extra pages. */
function alignCopiedPageText(copy, source, pageId, originalBands, copyLayout) {
	const flow = source.textFlow;
	if (!flow || flow.pageIds.length <= 1) return copy;
	const index = flow.pageIds.indexOf(pageId), from = flow.breaks[index], to = flow.breaks[index + 1];
	if (index < 0) throw Error("Passage de page introuvable.");
	const visible = originalBands.filter((b) => b.bottom > from + .1 && b.top < to - .1), first = visible.length ? Math.min(...visible.map((b) => Math.max(from, b.top))) - from : 0, shift = copyLayout.paintTop - first;
	if (![
		shift,
		copyLayout.paintBottom,
		copyLayout.height
	].every(Number.isFinite) || copyLayout.paintBottom - shift > to - from + 1) throw Error("Ce passage demande une copie avec sa disposition particulière. Son original est conservé.");
	return {
		...copy,
		y: source.y - shift,
		height: Math.max(to - from + shift, copyLayout.height),
		textFlow: void 0
	};
}
//#endregion
export { paperPageCopy_exports as i, copyMarkdownRange as n, duplicatePaperPage as r, copiedPageText as t };
