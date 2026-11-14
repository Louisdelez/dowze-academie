import { A as savePaperDraft, d as getDraft, o as activateStagedDraft } from "./storage-BJWvsK9s.js";
import { S as notebookDocumentId } from "./notebookDocument-C3DZiTlV.js";
import "./paperCollaboration-Bn5VQMUP.js";
import { d as LIBRARY_DOCUMENT_ID, f as emptyNotebookLibrary, m as updateNotebookLibrary, p as isNotebookLibrary, u as amendNotebookLibrary } from "../split.mjs";
//#region src/lib/duplicateNotebook.ts
async function activateNotebookDuplicate(noteId, media) {
	const key = {
		accountId: media.accountId,
		spaceId: media.spaceId,
		type: "whiteboard",
		documentId: notebookDocumentId(noteId)
	}, sourceId = (await getDraft(key))?.duplicateSourceId;
	if (sourceId) {
		const libraryKey = {
			...key,
			type: "preferences",
			documentId: LIBRARY_DOCUMENT_ID
		};
		let complete = false;
		for (let attempt = 0; attempt < 3; attempt++) {
			const stored = await getDraft(libraryKey);
			const library = stored?.content ?? emptyNotebookLibrary();
			if (!isNotebookLibrary(library)) throw Error("Le classement de la copie doit être repris. La note et ses fichiers restent conservés.");
			const source = library.notes[sourceId];
			if (!source) {
				complete = true;
				break;
			}
			const next = amendNotebookLibrary(library, updateNotebookLibrary(library, { note: {
				id: noteId,
				patch: {
					...source,
					deletedAt: null
				}
			} }), `${media.accountId}|${media.spaceId}`);
			try {
				await savePaperDraft({
					...libraryKey,
					title: "Bibliothèque de notes",
					content: next,
					baseVersion: stored?.baseVersion ?? 0,
					updatedAt: Date.now(),
					syncState: "local"
				}, stored ? library.revision : null);
				complete = true;
				break;
			} catch {}
		}
		if (!complete) throw Error("Le classement a changé pendant la copie. Ouvrez la note pour finaliser sa conservation.");
	}
	await activateStagedDraft(key);
	dispatchEvent(new CustomEvent("dowze:notebook-library-changed", { detail: {
		accountId: media.accountId,
		spaceId: media.spaceId
	} }));
}
//#endregion
export { activateNotebookDuplicate };
