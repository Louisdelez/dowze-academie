//#region src/lib/paperTextFlow.ts
/** Layout fingerprint only. It is never an authorization or a file-integrity check. */
function textFlowFingerprint(markdown, width, height) {
	let a = 2166136261, b = 5381;
	for (let i = 0; i < markdown.length; i++) {
		const n = markdown.charCodeAt(i);
		a = Math.imul(a ^ n, 16777619);
		b = Math.imul(b, 33) ^ n;
	}
	return `rich2:${width}:${height}:${markdown.length}:${a >>> 0}:${b >>> 0}`;
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
		if (end < height && lines.every((b) => b.bottom <= end + .1)) end = height;
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
/** Deterministic continuation IDs let two views request the same empty pages without duplicating them. */
var flowPageId = (noteId, objectId, index) => `flow-${textFlowFingerprint(noteId + "|" + objectId, 0, 0).split(":").slice(-2).join("-")}-${index}`;
function reflowPaperText(doc, objectId, source, breaks, sourceOffsets) {
	const root = doc.objects.find((o) => o.id === objectId);
	if (!root || root.kind !== "text") return null;
	if (source !== textFlowFingerprint(root.markdown ?? "", root.width, root.height)) return null;
	if (breaks.length < 2 || breaks.length > 2001 || breaks[0] !== 0 || breaks.some((v, i) => !Number.isFinite(v) || v < 0 || i > 0 && v <= breaks[i - 1])) throw Error("Découpage du texte invalide.");
	const page = doc.pages.find((p) => p.id === root.pageId);
	if (!page) return null;
	if (sourceOffsets && (sourceOffsets.length !== breaks.length || sourceOffsets[0] !== 0 || sourceOffsets.at(-1) !== (root.markdown ?? "").length || sourceOffsets.some((n, i) => !Number.isSafeInteger(n) || n < 0 || i > 0 && n < sourceOffsets[i - 1]))) throw Error("Positions du texte invalides.");
	const count = breaks.length - 1, previous = root.textFlow, pageIds = [root.pageId];
	const commands = [];
	for (let i = 1; i < count; i++) {
		const id = previous?.pageIds[i] ?? flowPageId(doc.noteId, root.id, i);
		pageIds.push(id);
		if (!doc.pages.some((p) => p.id === id)) {
			const next = {
				...page,
				id,
				bookmark: false,
				pdf: void 0,
				flowRootId: root.id
			};
			commands.push({
				type: "insert-page",
				page: next,
				afterId: pageIds[i - 1]
			});
		}
	}
	for (const id of previous?.pageIds.slice(count) ?? []) {
		const p = doc.pages.find((p) => p.id === id);
		if (p?.flowRootId === root.id && !p.bookmark && !doc.objects.some((o) => o.pageId === id)) commands.push({
			type: "remove-page",
			id
		});
	}
	const textFlow = {
		schema: 1,
		pageIds,
		breaks,
		source,
		...sourceOffsets ? { sourceOffsets } : previous?.source === source && JSON.stringify(previous.breaks) === JSON.stringify(breaks) && previous.sourceOffsets ? { sourceOffsets: previous.sourceOffsets } : {}
	};
	if (JSON.stringify(previous) === JSON.stringify(textFlow) && !commands.length) return null;
	commands.unshift({
		type: "patch-object",
		id: root.id,
		patch: { textFlow }
	});
	return {
		type: "batch",
		commands
	};
}
function textFlowPageIndex(object, pageId) {
	return object.textFlow?.pageIds.indexOf(pageId) ?? 0;
}
//#endregion
export { textFlowPageIndex as a, textFlowFingerprint as i, reflowPaperText as n, textFlowBreaks as r, paperObjectsOnPage as t };
