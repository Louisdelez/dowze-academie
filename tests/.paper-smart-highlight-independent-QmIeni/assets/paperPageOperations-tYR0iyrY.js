import { i as textFlowFingerprint } from "./paperTextFlow-T0_iEUZW.js";
import { t as copiedPageText } from "./paperPageCopy-B4Nz_cZe.js";
//#region src/lib/paperPageOperations.ts
/** Only a changed flow needs independent editable page passages. Moving a complete block keeps its source intact. */
function pageOperationFlows(document, operation) {
	if (operation.type === "remove-page") {
		if (!document.pages.some((p) => p.id === operation.id)) throw Error("Cette page n’existe plus.");
		if (document.pages.length === 1) throw Error("Gardez au moins une page.");
	} else if (operation.ids.length !== document.pages.length || new Set(operation.ids).size !== document.pages.length || operation.ids.some((id) => !document.pages.some((p) => p.id === id))) throw Error("Ordre des pages invalide.");
	return document.objects.filter((object) => {
		const flow = object.textFlow;
		if (object.kind !== "text" || !flow || flow.pageIds.length < 2) return false;
		if (operation.type === "remove-page") return flow.pageIds.includes(operation.id);
		const first = operation.ids.indexOf(object.pageId);
		return flow.pageIds.some((id, index) => operation.ids.indexOf(id) !== first + index);
	});
}
/** One batch owns the rich text partition and the page operation; Undo restores the original continuous source. */
function planPaperPageOperation(document, operation, newId = () => crypto.randomUUID()) {
	const flows = pageOperationFlows(document, operation), commands = [], partitions = [];
	for (const source of flows) {
		const flow = source.textFlow, markdown = source.markdown ?? "";
		if (!flow.sourceOffsets || flow.sourceOffsets.at(-1) !== markdown.length || flow.source !== textFlowFingerprint(markdown, source.width, source.height)) throw Error("La disposition du texte doit être actualisée avant de modifier ses pages.");
		const partition = newId();
		const objects = flow.pageIds.filter((id) => operation.type !== "remove-page" || id !== operation.id).map((pageId, index) => ({
			...structuredClone(source),
			id: index === 0 ? source.id : newId(),
			pageId,
			markdown: copiedPageText(source, pageId),
			textFlow: void 0,
			textPartition: partition
		}));
		commands.push({
			type: "partition-text-flow",
			id: source.id,
			expected: structuredClone(source),
			objects
		});
		partitions.push({
			source,
			objects
		});
	}
	commands.push(operation);
	const selectedIndex = operation.type === "remove-page" ? document.pages.findIndex((p) => p.id === operation.id) : -1;
	const remainingPages = operation.type === "remove-page" ? document.pages.filter((page) => page.id !== operation.id) : document.pages;
	const nextPageId = operation.type === "remove-page" ? remainingPages[Math.min(selectedIndex, remainingPages.length - 1)].id : void 0;
	return {
		command: {
			type: "batch",
			commands
		},
		partitions,
		nextPageId
	};
}
//#endregion
export { pageOperationFlows, planPaperPageOperation };
