import { t as __exportAll } from "./rolldown-runtime-D7D4PA-g.js";
import { a as isPaperDocument, b as parsePhotoReference, g as notebookDocumentId, h as legacyNotebookDocumentId, y as noteBoardId } from "./notebookDocument-yuVu6oXC.js";
import { T as readNotebookDeletionStatus, _ as localBlobDigest, c as commitNotebookTransfer, d as getDraft, f as getSnapshot, m as listLocalBlobs, v as notebookDeletionKey } from "./storage-Dsyjb46q.js";
//#region src/lib/paperAssets.ts
var paperAssets_exports = /* @__PURE__ */ __exportAll({
	readPaperAsset: () => readPaperAsset,
	resolvePaperPhotoReference: () => resolvePaperPhotoReference
});
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
export { readPaperAsset as n, resolvePaperPhotoReference as r, paperAssets_exports as t };
