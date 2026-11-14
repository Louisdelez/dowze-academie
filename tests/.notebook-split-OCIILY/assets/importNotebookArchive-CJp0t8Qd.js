import { A as savePaperDraft, a as activateNotebookArchiveFiles, d as getDraft, g as listSnapshots, p as listDrafts } from "./storage-BJWvsK9s.js";
import { S as notebookDocumentId, a as isPaperDocument } from "./notebookDocument-C3DZiTlV.js";
import "./paperCollaboration-Bn5VQMUP.js";
import { a as isPaperArchiveMetadata, d as LIBRARY_DOCUMENT_ID, f as emptyNotebookLibrary, l as isPersistedSubjectNotesStore, m as updateNotebookLibrary, p as isNotebookLibrary, u as amendNotebookLibrary } from "../split.mjs";
//#region src/lib/importNotebookArchive.ts
var receiptKey = (media, noteId) => `paper-import|${media.accountId}|${media.spaceId}|${noteId}`;
function validReceipt(value, noteId) {
	const r = value;
	return !!r && r.schema === 1 && r.kind === "notebook-archive-import" && r.noteId === noteId && r.note?.id === noteId && isPaperDocument(r.sourceDocument) && (!r.sourceMetadata || isPaperArchiveMetadata(r.sourceMetadata) && r.sourceMetadata.note.id === r.sourceDocument.noteId) && isPersistedSubjectNotesStore({
		schemaVersion: 2,
		documents: [r.note],
		openDocumentIds: [],
		activeDocumentId: null
	});
}
async function readNotebookArchiveImport(noteId, media) {
	const receipt = (await listSnapshots(media.accountId, media.spaceId)).find((row) => row.key === receiptKey(media, noteId));
	if (!validReceipt(receipt?.value, noteId)) throw Error("Les informations de cette importation doivent être récupérées. Ses fichiers restent conservés.");
	return receipt.value;
}
/** Reuse matching folder ancestors, add missing ones, and never alter an unrelated note. */
async function activateNotebookArchive(noteId, media, current = () => true) {
	const check = () => {
		if (!current()) throw Error("Le carnet a changé avant la finalisation de l’importation.");
	};
	check();
	const receipt = await readNotebookArchiveImport(noteId, media), identity = {
		accountId: media.accountId,
		spaceId: media.spaceId,
		type: "whiteboard",
		documentId: notebookDocumentId(noteId)
	}, staged = await getDraft(identity);
	check();
	if (!staged || !isPaperDocument(staged.content) || staged.content.noteId !== noteId) throw Error("Le document de cette importation doit être récupéré.");
	if (!staged.staged) return receipt.note;
	if (!receipt.metadataCommitted) throw Error("Cette importation attend l’enregistrement de ses informations. Reprenez-la depuis la bibliothèque.");
	const key = {
		...identity,
		type: "preferences",
		documentId: LIBRARY_DOCUMENT_ID
	};
	let classified = false;
	for (let attempt = 0; attempt < 3; attempt++) {
		check();
		const stored = await getDraft(key), original = stored?.content ?? emptyNotebookLibrary();
		if (!isNotebookLibrary(original)) throw Error("Le classement existant doit être récupéré. Les fichiers importés restent conservés.");
		let next = original, parentId = null;
		for (const folder of receipt.sourceMetadata?.folderPath ?? []) {
			const found = next.folders.find((f) => f.parentId === parentId && f.title === folder.title && f.color === folder.color);
			if (found) {
				parentId = found.id;
				continue;
			}
			const id = crypto.randomUUID();
			next = updateNotebookLibrary(next, { folder: {
				id,
				parentId,
				title: folder.title,
				color: folder.color,
				order: next.folders.filter((f) => f.parentId === parentId).length
			} });
			parentId = id;
		}
		const classification = receipt.sourceMetadata?.classification;
		next = amendNotebookLibrary(original, updateNotebookLibrary(next, { note: {
			id: noteId,
			patch: {
				folderId: parentId,
				favorite: classification?.favorite ?? false,
				cover: classification?.cover ?? null,
				deletedAt: null
			}
		} }), `${media.accountId}|${media.spaceId}`);
		check();
		try {
			await savePaperDraft({
				...key,
				title: "Bibliothèque de notes",
				content: next,
				baseVersion: stored?.baseVersion ?? 0,
				updatedAt: Date.now(),
				syncState: "local"
			}, stored ? original.revision : null);
			classified = true;
			break;
		} catch (e) {
			if (attempt === 2) throw e;
		}
	}
	if (!classified) throw Error("Le classement de l’importation attend sa finalisation.");
	check();
	await activateNotebookArchiveFiles(identity, current);
	dispatchEvent(new CustomEvent("dowze:paper-import-ready", { detail: {
		accountId: media.accountId,
		spaceId: media.spaceId,
		noteId
	} }));
	dispatchEvent(new CustomEvent("dowze:notebook-library-changed", { detail: {
		accountId: media.accountId,
		spaceId: media.spaceId
	} }));
	return receipt.note;
}
async function pendingNotebookArchives(media) {
	return (await listDrafts(media.accountId, media.spaceId)).filter((d) => d.type === "whiteboard" && d.staged && d.archiveImport && isPaperDocument(d.content)).map((d) => d.content.noteId);
}
//#endregion
export { activateNotebookArchive, pendingNotebookArchives };
