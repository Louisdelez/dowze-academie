import { a as isPaperDocument, g as notebookDocumentId, m as validateLegacyRasterBytes, t as applyPaperCommand, x as photoReference } from "./notebookDocument-yuVu6oXC.js";
import { T as readNotebookDeletionStatus, _ as localBlobDigest, c as commitNotebookTransfer, d as getDraft, f as getSnapshot, m as listLocalBlobs, v as notebookDeletionKey } from "./storage-Dsyjb46q.js";
import { t as amendPaperCollaboration } from "./paperCollaboration-Dln7Hroy.js";
//#region src/lib/paperImageInsertion.ts
var check = (current) => {
	if (!current()) throw Error("La note ou le compte a changé pendant l’ajout. Réessayez depuis la note courante.");
};
var equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
var validId = (id) => /^[A-Za-z0-9][A-Za-z0-9._-]{0,126}$/.test(id) && !id.includes("..");
/** Prepare immutable image bytes and their owned graph together, without a prewrite. */
async function preparePaperImageInsertion(input) {
	const { document, blob, current } = input, scope = {
		accountId: input.scope.accountId,
		spaceId: input.scope.spaceId
	};
	check(current);
	if (!isPaperDocument(document) || !Object.values(scope).every((value) => typeof value === "string" && /^[A-Za-z0-9._-]{1,200}$/.test(value))) throw Error("La note doit être retrouvée avant d’ajouter une image.");
	if (![
		"image/png",
		"image/jpeg",
		"image/gif",
		"image/webp"
	].includes(blob.type) || !blob.size || blob.size > 16777216) throw Error("Choisissez une image PNG, JPEG, GIF ou WebP de 16 Mo maximum.");
	const bytes = new Uint8Array(await blob.arrayBuffer());
	check(current);
	validateLegacyRasterBytes(bytes, blob.type);
	check(current);
	const identity = {
		...scope,
		type: "whiteboard",
		documentId: notebookDocumentId(document.noteId)
	};
	const deleted = await readNotebookDeletionStatus(document.noteId, scope, current);
	check(current);
	if (deleted) throw Error("Ce carnet a été supprimé. Aucune image n’est ajoutée à sa place.");
	const stored = await getDraft(identity);
	check(current);
	if (!stored || stored.staged || stored.identityAlias || stored.syncState === "conflict" || !isPaperDocument(stored.content) || stored.content.noteId !== document.noteId || !equal(stored.content, document)) throw Error("La note a reçu une autre modification. Laissez-la se mettre à jour puis réessayez l’image.");
	const id = (input.newId ?? (() => crypto.randomUUID()))();
	if (!validId(id) || document.assets.some((asset) => asset.id === id)) throw Error("Cette image possède déjà une identité utilisée. Aucun fichier n’est remplacé.");
	const files = await listLocalBlobs(scope.accountId, scope.spaceId);
	check(current);
	if (files.some((file) => file.id === id)) throw Error("Un fichier existe déjà pour cette identité. Aucun original n’est remplacé.");
	const now = input.now ?? (/* @__PURE__ */ new Date()).toISOString();
	if (!Number.isFinite(Date.parse(now))) throw Error("La date de l’image est incompatible.");
	const sha256 = await localBlobDigest(blob);
	check(current);
	const name = input.name.trim().slice(0, 300) || "Image", asset = {
		id,
		name,
		mediaType: blob.type,
		size: blob.size
	};
	const commands = [{
		type: "add-asset",
		asset
	}];
	if (input.object) {
		if (input.object.kind !== "image" || document.objects.some((object) => object.id === input.object.id) || !document.pages.some((page) => page.id === input.object.pageId)) throw Error("La page a changé avant l’ajout de l’image.");
		commands.push({
			type: "upsert-object",
			object: {
				...structuredClone(input.object),
				assetId: id
			}
		});
	}
	const next = amendPaperCollaboration(document, applyPaperCommand(document, {
		type: "batch",
		commands
	}, now), `${scope.accountId}|${scope.spaceId}|${document.noteId}`);
	if (!isPaperDocument(next)) throw Error("L’image n’a pas pu être associée à cette note. Son fichier d’origine est inchangé.");
	const draft = {
		...stored,
		content: next,
		updatedAt: Date.parse(now),
		syncState: "local"
	};
	const receiptKey = `paper-image-insertion|${scope.accountId}|${scope.spaceId}|${identity.documentId}|${id}`, historyKey = `paper-history|${scope.accountId}|${scope.spaceId}|whiteboard|${identity.documentId}|${String(document.revision).padStart(12, "0")}`;
	const [receipt, history] = await Promise.all([getSnapshot(receiptKey), getSnapshot(historyKey)]);
	check(current);
	if (receipt) throw Error("Une autre image utilise ce reçu. Aucun original n’est remplacé.");
	const historyMatches = history && history.accountId === scope.accountId && history.spaceId === scope.spaceId && equal(history.value, document);
	const beforeHistoryKey = history && !historyMatches ? `${historyKey}|image-${id}` : historyKey;
	const alternateHistory = beforeHistoryKey !== historyKey ? await getSnapshot(beforeHistoryKey) : void 0;
	check(current);
	if (alternateHistory) throw Error("Une version historique utilise déjà cette identité. Aucun original n’est remplacé.");
	const snapshot = {
		key: receiptKey,
		...scope,
		value: {
			schema: 1,
			kind: "paper-image-insertion",
			noteId: document.noteId,
			documentId: identity.documentId,
			assetId: id,
			name,
			mediaType: blob.type,
			size: blob.size,
			sha256,
			mode: input.object ? "floating" : "inline",
			paperRevision: next.revision,
			beforeHistoryKey,
			insertedAt: now
		}
	};
	const commit = {
		target: scope,
		sources: [scope],
		drafts: [draft],
		blobs: [{
			...scope,
			id,
			documentId: identity.documentId,
			blob,
			name,
			createdAt: Date.parse(now),
			status: "pending",
			removedFromNote: false,
			revision: 1,
			sha256
		}],
		snapshots: [snapshot, ...!historyMatches ? [{
			key: beforeHistoryKey,
			...scope,
			value: document
		}] : []],
		draftChecks: [{
			identity,
			expected: stored
		}],
		blobChecks: [{
			identity: {
				...scope,
				id
			},
			expected: void 0
		}],
		snapshotChecks: [
			{
				key: receiptKey,
				expected: void 0
			},
			{
				key: historyKey,
				expected: history
			},
			...beforeHistoryKey !== historyKey ? [{
				key: beforeHistoryKey,
				expected: void 0
			}] : [],
			{
				key: notebookDeletionKey(identity),
				expected: void 0
			}
		]
	};
	return {
		draft,
		asset,
		url: photoReference(identity.documentId, id),
		commit
	};
}
async function insertPaperImage(input) {
	const prepared = await preparePaperImageInsertion(input);
	check(input.current);
	await commitNotebookTransfer(prepared.commit, input.current);
	return prepared;
}
//#endregion
export { insertPaperImage };
