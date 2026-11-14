import { t as __exportAll } from "./rolldown-runtime-D7D4PA-g.js";
import { _ as notebookIdentityDigest, a as isPaperDocument, g as notebookDocumentId, v as LEGACY_NOTE_ID } from "./notebookDocument-yuVu6oXC.js";
//#region pwa/src/storage.ts
var storage_exports = /* @__PURE__ */ __exportAll({
	DraftChangedError: () => DraftChangedError,
	acknowledgeLocalBlob: () => acknowledgeLocalBlob,
	acknowledgeMutation: () => acknowledgeMutation,
	activateNotebookAppendFiles: () => activateNotebookAppendFiles,
	activateNotebookArchiveFiles: () => activateNotebookArchiveFiles,
	activateStagedDraft: () => activateStagedDraft,
	applyChangePage: () => applyChangePage,
	commitNotebookTransfer: () => commitNotebookTransfer,
	commitPaperIdentityPromotion: () => commitPaperIdentityPromotion,
	getAudioRecordingJournal: () => getAudioRecordingJournal,
	getDraft: () => getDraft,
	getSnapshot: () => getSnapshot,
	listDrafts: () => listDrafts,
	listLocalBlobs: () => listLocalBlobs,
	listMutations: () => listMutations,
	listSnapshots: () => listSnapshots,
	localBlobDigest: () => localBlobDigest,
	notebookDeletionKey: () => notebookDeletionKey,
	paperIdentityMutationDigest: () => paperIdentityMutationDigest,
	putDraft: () => putDraft,
	putLocalBlob: () => putLocalBlob,
	putSnapshot: () => putSnapshot,
	queueLocalDrafts: () => queueLocalDrafts,
	queueMutation: () => queueMutation,
	readNotebookDeletionStatus: () => readNotebookDeletionStatus,
	resolvePaperDraft: () => resolvePaperDraft,
	saveAudioChunk: () => saveAudioChunk,
	saveDraftAndQueue: () => saveDraftAndQueue,
	savePaperDraft: () => savePaperDraft,
	updateAudioRecordingLease: () => updateAudioRecordingLease
});
var DB = "dowze-academie-pwa";
var VERSION = 3;
var BLOBS = "scopedBlobs";
var blobKey = (blob) => `${blob.accountId}|${blob.spaceId}|${blob.id}`;
var key = (v) => `${v.accountId}|${v.spaceId}|${v.type ?? "notesMarkdown"}|${v.documentId}`;
function openDb() {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open(DB, VERSION);
		request.onupgradeneeded = () => {
			const db = request.result;
			if (!db.objectStoreNames.contains("drafts")) db.createObjectStore("drafts", { keyPath: "key" });
			if (!db.objectStoreNames.contains("mutations")) db.createObjectStore("mutations", { keyPath: "id" });
			if (!db.objectStoreNames.contains("snapshots")) db.createObjectStore("snapshots", { keyPath: "key" });
			if (!db.objectStoreNames.contains("blobs")) db.createObjectStore("blobs", { keyPath: "id" });
			if (!db.objectStoreNames.contains(BLOBS)) {
				db.createObjectStore(BLOBS, { keyPath: "key" });
				const original = request.transaction.objectStore("blobs"), scoped = request.transaction.objectStore(BLOBS), read = original.openCursor();
				read.onsuccess = () => {
					const cursor = read.result;
					if (!cursor) return;
					const row = cursor.value;
					if (typeof row.id === "string" && typeof row.accountId === "string" && typeof row.spaceId === "string") scoped.put({
						...row,
						key: blobKey(row)
					});
					cursor.continue();
				};
			}
			const drafts = request.transaction.objectStore("drafts");
			const cursor = drafts.openCursor();
			cursor.onsuccess = () => {
				const row = cursor.result;
				if (!row) return;
				const value = row.value;
				if (value.key !== key(value)) {
					row.delete();
					drafts.put({
						...value,
						key: key(value)
					});
				}
				row.continue();
			};
		};
		request.onsuccess = () => {
			const db = request.result;
			db.onversionchange = () => db.close();
			resolve(db);
		};
		request.onerror = () => reject(request.error);
	});
}
async function run(store, mode, action) {
	const db = await openDb();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(store, mode);
		const request = action(tx.objectStore(store));
		let result;
		request.onsuccess = () => {
			result = request.result;
		};
		tx.oncomplete = () => {
			db.close();
			resolve(result);
		};
		tx.onabort = tx.onerror = () => {
			db.close();
			reject(tx.error ?? request.error ?? /* @__PURE__ */ new Error("Stockage interrompu"));
		};
	});
}
/** A delayed seed/response may update retained provenance, but never reactivate it. */
async function putDraft(draft) {
	const db = await openDb();
	return new Promise((resolve, reject) => {
		const tx = db.transaction("drafts", "readwrite"), store = tx.objectStore("drafts"), read = store.get(key(draft));
		let reason = "Enregistrement interrompu.";
		read.onsuccess = () => {
			const current = read.result;
			if (current?.identityAlias && !samePaperOwner(current.content, draft.content)) {
				reason = "Cette ancienne identité appartient à une autre note. Son original reste conservé.";
				tx.abort();
				return;
			}
			store.put({
				...draft,
				key: key(draft),
				...current?.identityAlias ? {
					identityAlias: current.identityAlias,
					baseVersion: Math.max(draft.baseVersion, current.baseVersion)
				} : {}
			});
		};
		tx.oncomplete = () => {
			db.close();
			resolve();
		};
		tx.onabort = tx.onerror = () => {
			db.close();
			reject(tx.error ?? new Error(reason));
		};
	});
}
async function getDraft(draftKey) {
	return run("drafts", "readonly", (s) => s.get(key(draftKey)));
}
async function listDrafts(accountId, spaceId) {
	return (await run("drafts", "readonly", (s) => s.getAll())).filter((x) => x.accountId === accountId && x.spaceId === spaceId);
}
async function queueMutation(mutation) {
	await run("mutations", "readwrite", (s) => s.put(mutation));
}
async function listMutations(accountId, spaceId) {
	return (await run("mutations", "readonly", (s) => s.getAll())).filter((x) => x.accountId === accountId && x.spaceId === spaceId).sort((a, b) => key(a).localeCompare(key(b)) || a.baseVersion - b.baseVersion || a.createdAt - b.createdAt);
}
async function putSnapshot(snapshot) {
	await run("snapshots", "readwrite", (s) => s.put(snapshot));
}
async function getSnapshot(snapshotKey) {
	return run("snapshots", "readonly", (s) => s.get(snapshotKey));
}
var notebookDeletionKey = (identity) => `paper-canonical-deletion|${key({
	...identity,
	type: "whiteboard"
})}`;
var validNotebookDeletion = (value, identity) => {
	const marker = value;
	return !!marker && marker.schema === 1 && marker.kind === "paper-canonical-deletion" && marker.accountId === identity.accountId && marker.spaceId === identity.spaceId && marker.documentId === identity.documentId && (marker.noteId === void 0 || typeof marker.noteId === "string") && Number.isSafeInteger(marker.version) && marker.version > 0 && Number.isFinite(marker.deletedAt);
};
function canonicalNotebookKey(documentId) {
	if (documentId === notebookDocumentId("legacy-whiteboard-main")) return {
		canonical: true,
		noteId: LEGACY_NOTE_ID
	};
	if (/^paper-v3-id2-[a-f0-9]{64}$/.test(documentId)) return { canonical: true };
	if (documentId.startsWith("paper-v3-note-")) {
		const noteId = documentId.slice(14);
		if (notebookDocumentId(noteId) === documentId) return {
			canonical: true,
			noteId
		};
	}
	return { canonical: false };
}
/** Only an explicit scoped server tombstone proves deletion. A cached version
* number or a missing draft alone never means that a notebook was removed. */
async function readNotebookDeletionStatus(noteId, scope, current = () => true) {
	if (!current()) throw new DraftChangedError("Le compte a changé avant la lecture de la suppression.");
	const identity = {
		...scope,
		type: "whiteboard",
		documentId: notebookDocumentId(noteId)
	}, row = await getSnapshot(notebookDeletionKey(identity));
	if (!current()) throw new DraftChangedError("Le compte a changé pendant la lecture de la suppression.");
	if (!row) return;
	if (row.accountId !== scope.accountId || row.spaceId !== scope.spaceId || !validNotebookDeletion(row.value, identity) || row.value.noteId !== void 0 && row.value.noteId !== noteId) throw Error("Le reçu de suppression ne correspond pas à cette note. Aucun original n’est remplacé.");
	return row.value;
}
async function listSnapshots(accountId, spaceId) {
	return (await run("snapshots", "readonly", (s) => s.getAll())).filter((x) => x.accountId === accountId && x.spaceId === spaceId);
}
async function localBlobDigest(blob) {
	const bytes = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
	return [...new Uint8Array(bytes)].map((n) => n.toString(16).padStart(2, "0")).join("");
}
/** A transfer can detect both byte changes and uploader acknowledgements. */
async function putLocalBlob(blob) {
	const sha256 = await localBlobDigest(blob.blob), db = await openDb();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(BLOBS, "readwrite"), store = tx.objectStore(BLOBS), read = store.get(blobKey(blob));
		read.onsuccess = () => {
			const old = read.result;
			store.put({
				...blob,
				sha256,
				revision: (old?.revision ?? 0) + 1,
				key: blobKey(blob)
			});
		};
		tx.oncomplete = () => {
			db.close();
			resolve();
		};
		tx.onabort = tx.onerror = () => {
			db.close();
			reject(tx.error ?? /* @__PURE__ */ new Error("Le fichier n’a pas pu être enregistré."));
		};
	});
}
async function listLocalBlobs(accountId, spaceId) {
	return (await run(BLOBS, "readonly", (s) => s.getAll())).filter((x) => x.accountId === accountId && x.spaceId === spaceId);
}
/** A late upload receipt must never restore old bytes over a newer local file. */
async function acknowledgeLocalBlob(expected, serverId, current = () => true) {
	const db = await openDb();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(BLOBS, "readwrite"), store = tx.objectStore(BLOBS), read = store.get(blobKey(expected));
		let acknowledged = false;
		read.onsuccess = () => {
			const latest = read.result;
			if (!current() || blobState(latest) !== blobState(expected)) return;
			store.put({
				...latest,
				status: "uploaded",
				serverId,
				revision: (latest.revision ?? 0) + 1,
				key: blobKey(expected)
			});
			acknowledged = true;
		};
		tx.oncomplete = () => {
			db.close();
			resolve(acknowledged);
		};
		tx.onabort = tx.onerror = () => {
			db.close();
			reject(tx.error ?? /* @__PURE__ */ new Error("Confirmation du fichier interrompue."));
		};
	});
}
/** Save the visible revision and its outbox entry in one durable transaction. */
var DraftChangedError = class extends Error {};
async function saveDraftAndQueue(draft, mutation, expectedContent) {
	const db = await openDb();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(["drafts", "mutations"], "readwrite");
		const outbox = tx.objectStore("mutations");
		const request = outbox.getAll();
		let queued = mutation;
		let changed = false;
		request.onsuccess = () => {
			const previous = request.result.filter((m) => key(m) === key(draft));
			const drafts = tx.objectStore("drafts");
			const latest = drafts.get(key(draft));
			latest.onsuccess = () => {
				const current = latest.result;
				if (expectedContent !== void 0 && (current?.syncState !== "synced" || JSON.stringify(current.content) !== JSON.stringify(expectedContent))) {
					changed = true;
					tx.abort();
					return;
				}
				if (current?.identityAlias && (!samePaperOwner(current.content, draft.content) || !samePaperOwner(current.content, mutation.content))) {
					changed = true;
					tx.abort();
					return;
				}
				if (current?.syncState === "conflict" || previous.some((m) => m.status === "conflict")) {
					tx.abort();
					return;
				}
				const acknowledged = Math.max(draft.baseVersion, current?.baseVersion ?? 0);
				const baseVersion = Math.max(acknowledged, ...previous.map((m) => m.baseVersion + 1));
				queued = {
					...mutation,
					baseVersion,
					...current?.identityAlias ? { identityAlias: current.identityAlias } : {}
				};
				drafts.put({
					...draft,
					baseVersion: acknowledged,
					key: key(draft),
					syncState: "queued",
					...current?.identityAlias ? { identityAlias: current.identityAlias } : {}
				});
				outbox.put(queued);
			};
		};
		tx.oncomplete = () => {
			db.close();
			resolve(queued);
		};
		tx.onabort = tx.onerror = () => {
			db.close();
			reject(changed ? new DraftChangedError("Le document a changé avant la mise à jour des références.") : tx.error ?? /* @__PURE__ */ new Error("Enregistrement interrompu"));
		};
	});
}
/** An old acknowledgement must never mark a more recent edit as uploaded. */
async function acknowledgeMutation(mutation, version, acknowledgedContent, current = () => true) {
	const db = await openDb();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(["drafts", "mutations"], "readwrite");
		const drafts = tx.objectStore("drafts");
		const request = drafts.get(key(mutation));
		request.onsuccess = () => {
			if (!current()) {
				tx.abort();
				return;
			}
			const draft = request.result;
			if (draft) {
				const same = JSON.stringify(draft.content) === JSON.stringify(mutation.content);
				drafts.put({
					...draft,
					key: key(draft),
					baseVersion: Math.max(draft.baseVersion, version),
					content: same && acknowledgedContent !== void 0 ? acknowledgedContent : draft.content,
					syncState: same ? "synced" : draft.syncState
				});
			}
			tx.objectStore("mutations").delete(mutation.id);
		};
		tx.oncomplete = () => {
			db.close();
			resolve();
		};
		tx.onabort = tx.onerror = () => {
			db.close();
			reject(tx.error ?? /* @__PURE__ */ new Error("Confirmation interrompue"));
		};
	});
}
/** Read and update in one transaction: a remote response cannot overwrite a new local edit. */
async function applyChangePage(accountId, spaceId, page, current = () => true) {
	if (page.items.some((change) => change.space_id !== spaceId)) throw Error("La réponse reçue appartient à une autre année. Les notes locales restent conservées.");
	const db = await openDb();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(["drafts", "snapshots"], "readwrite");
		const drafts = tx.objectStore("drafts");
		if (!current()) {
			tx.abort();
			return;
		}
		const changes = new Map(page.items.map((change) => [`${change.document_type}|${change.document_id}`, change]));
		for (const change of changes.values()) {
			const identity = {
				accountId,
				spaceId,
				type: change.document_type,
				documentId: change.document_id
			};
			const versionKey = `sync-version|${key(identity)}`;
			const version = tx.objectStore("snapshots").get(versionKey);
			version.onsuccess = () => {
				if (typeof version.result?.value === "number" && version.result.value >= change.version) return;
				const request = drafts.get(key(identity));
				request.onsuccess = () => {
					if (!current()) {
						tx.abort();
						return;
					}
					const existing = request.result;
					if (existing?.identityAlias) {
						const snapshots = tx.objectStore("snapshots");
						const incomingNote = paperNoteId(change.content), owner = paperNoteId(existing.content);
						const collision = !change.deleted && (!owner || incomingNote !== owner || !isPaperDocument(change.content));
						snapshots.put({
							key: `paper-identity-source|${key(identity)}|${change.version}`,
							accountId,
							spaceId,
							value: {
								schema: 1,
								kind: collision ? "paper-identity-collision" : "paper-identity-source",
								alias: existing.identityAlias,
								source: existing,
								incoming: change,
								receivedAt: Date.now()
							}
						});
						snapshots.put({
							key: versionKey,
							accountId,
							spaceId,
							value: change.version
						});
						if (!collision && change.version > existing.baseVersion) {
							const content = change.deleted ? existing.content : change.content;
							const title = content?.title;
							drafts.put({
								...existing,
								key: key(existing),
								content,
								title: typeof title === "string" ? title : existing.title,
								baseVersion: change.version,
								updatedAt: Date.parse(change.changed_at) || Date.now(),
								syncState: "synced"
							});
						}
						return;
					}
					if (existing && existing.baseVersion >= change.version) return;
					const snapshots = tx.objectStore("snapshots");
					const accept = () => {
						if (existing && existing.syncState !== "synced") return;
						snapshots.put({
							key: versionKey,
							accountId,
							spaceId,
							value: change.version
						});
						if (change.deleted) {
							drafts.delete(key(identity));
							return;
						}
						const content = change.content;
						drafts.put({
							...identity,
							key: key(identity),
							title: content?.title ?? (change.document_type === "notesMarkdown" ? "Note synchronisée" : change.document_type),
							content,
							baseVersion: change.version,
							updatedAt: Date.parse(change.changed_at) || Date.now(),
							syncState: "synced"
						});
					};
					if (change.document_type !== "whiteboard" || !change.document_id.startsWith("paper-v3-")) {
						accept();
						return;
					}
					const deletionKey = notebookDeletionKey(identity), readDeletion = snapshots.get(deletionKey);
					readDeletion.onsuccess = () => {
						if (!current()) {
							tx.abort();
							return;
						}
						const markerRow = readDeletion.result, marker = markerRow?.accountId === accountId && markerRow.spaceId === spaceId && validNotebookDeletion(markerRow.value, identity) ? markerRow.value : void 0;
						if (markerRow && !marker) {
							snapshots.put({
								key: `paper-canonical-invalid|${key(identity)}|${change.version}`,
								accountId,
								spaceId,
								value: {
									reason: "invalid-deletion-scope",
									incoming: change
								}
							});
							snapshots.put({
								key: versionKey,
								accountId,
								spaceId,
								value: change.version
							});
							return;
						}
						const canonicalKey = canonicalNotebookKey(change.document_id), existingOwned = isPaperDocument(existing?.content) && notebookDocumentId(existing.content.noteId) === change.document_id;
						if (change.deleted && (canonicalKey.canonical || existingOwned || marker)) {
							const noteId = existingOwned ? existing.content.noteId : marker?.noteId ?? canonicalKey.noteId;
							const status = {
								schema: 1,
								kind: "paper-canonical-deletion",
								accountId,
								spaceId,
								documentId: change.document_id,
								...noteId !== void 0 ? { noteId } : {},
								version: change.version,
								deletedAt: Date.parse(change.changed_at) || Date.now(),
								...existing ? { source: existing } : {}
							};
							if (markerRow) snapshots.put({
								...markerRow,
								key: `${deletionKey}|history-${crypto.randomUUID()}`
							});
							snapshots.put({
								key: deletionKey,
								accountId,
								spaceId,
								value: status
							});
							snapshots.put({
								key: versionKey,
								accountId,
								spaceId,
								value: change.version
							});
							if (existing && existing.syncState !== "synced") {
								snapshots.put({
									key: `paper-resolution|${key(identity)}|canonical-deletion-${crypto.randomUUID()}`,
									accountId,
									spaceId,
									value: {
										durable: existing,
										visibleContent: existing.content,
										server: null,
										deletion: status
									}
								});
								drafts.put({
									...existing,
									key: key(existing),
									syncState: "conflict",
									conflict: {
										...existing.conflict && typeof existing.conflict === "object" ? existing.conflict : {},
										serverVersion: change.version,
										canonicalDeletion: deletionKey
									}
								});
							} else drafts.delete(key(identity));
							return;
						}
						if (markerRow) {
							const validOwner = marker && isPaperDocument(change.content) && notebookDocumentId(change.content.noteId) === change.document_id && (marker.noteId === void 0 || marker.noteId === change.content.noteId);
							if (!change.deleted && validOwner && change.version > marker.version) {
								snapshots.put({
									...markerRow,
									key: `${deletionKey}|history-${crypto.randomUUID()}`
								});
								snapshots.delete(deletionKey);
							} else {
								snapshots.put({
									key: `paper-canonical-invalid|${key(identity)}|${change.version}`,
									accountId,
									spaceId,
									value: {
										deletion: markerRow.value,
										incoming: change,
										source: existing
									}
								});
								snapshots.put({
									key: versionKey,
									accountId,
									spaceId,
									value: change.version
								});
								return;
							}
						}
						accept();
					};
				};
			};
		}
		tx.objectStore("snapshots").put({
			key: `sync-cursor|${accountId}|${spaceId}`,
			accountId,
			spaceId,
			value: page.next_cursor
		});
		tx.oncomplete = () => {
			db.close();
			resolve();
		};
		tx.onabort = tx.onerror = () => {
			db.close();
			reject(tx.error ?? /* @__PURE__ */ new Error("Réception interrompue"));
		};
	});
}
/** Queue the latest durable edits, coalescing keystrokes before network transfer. */
async function queueLocalDrafts(accountId, spaceId, accept = () => true) {
	const db = await openDb();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(["drafts", "mutations"], "readwrite");
		const drafts = tx.objectStore("drafts"), outbox = tx.objectStore("mutations");
		const request = outbox.getAll();
		request.onsuccess = () => {
			const mutations = request.result;
			const rows = drafts.getAll();
			rows.onsuccess = () => {
				for (const draft of rows.result) {
					if (draft.accountId !== accountId || draft.spaceId !== spaceId || draft.syncState !== "local" || draft.staged || draft.identityAlias || !accept(draft.type, draft.documentId)) continue;
					const pending = mutations.filter((m) => key(m) === key(draft));
					if (pending.some((m) => m.status === "conflict")) continue;
					const baseVersion = Math.max(draft.baseVersion, ...pending.map((m) => m.baseVersion + 1));
					outbox.put({
						accountId,
						spaceId,
						type: draft.type,
						documentId: draft.documentId,
						content: draft.content,
						id: crypto.randomUUID(),
						baseVersion,
						createdAt: Date.now(),
						status: "pending"
					});
					drafts.put({
						...draft,
						key: key(draft),
						syncState: "queued"
					});
				}
			};
		};
		tx.oncomplete = () => {
			db.close();
			resolve();
		};
		tx.onabort = tx.onerror = () => {
			db.close();
			reject(tx.error ?? /* @__PURE__ */ new Error("Mise en attente interrompue"));
		};
	});
}
/** Notebook revisions, outbox precursor and recovery snapshot are committed together. */
async function savePaperDraft(draft, expectedRevision, recovery) {
	const db = await openDb();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(["drafts", "snapshots"], "readwrite");
		const drafts = tx.objectStore("drafts"), snapshots = tx.objectStore("snapshots");
		const read = drafts.get(key(draft));
		let reason = "Enregistrement de la note interrompu.";
		read.onsuccess = () => {
			const current = read.result;
			const revision = (current?.content)?.revision;
			if (current?.syncState === "conflict" || current?.identityAlias && !samePaperOwner(current.content, draft.content) || (expectedRevision === null ? !!current : revision !== expectedRevision)) {
				reason = "Cette note a été modifiée ailleurs. Rechargez avant de continuer.";
				tx.abort();
				return;
			}
			if (current) snapshots.put({
				key: `paper-history|${key(draft)}|${String(revision).padStart(12, "0")}`,
				accountId: draft.accountId,
				spaceId: draft.spaceId,
				value: current.content
			});
			if (recovery !== void 0) snapshots.put({
				key: `paper-migration|${key(draft)}`,
				accountId: draft.accountId,
				spaceId: draft.spaceId,
				value: recovery
			});
			drafts.put({
				...draft,
				key: key(draft),
				baseVersion: Math.max(draft.baseVersion, current?.baseVersion ?? 0),
				syncState: "local",
				...current?.identityAlias ? { identityAlias: current.identityAlias } : {}
			});
			const histories = snapshots.getAll();
			histories.onsuccess = () => {
				const rows = histories.result.filter((s) => s.key.startsWith(`paper-history|${key(draft)}|`)).sort((a, b) => a.key.localeCompare(b.key));
				for (const row of rows.slice(0, -20)) snapshots.delete(row.key);
			};
		};
		tx.oncomplete = () => {
			db.close();
			resolve();
		};
		tx.onabort = tx.onerror = () => {
			db.close();
			reject(tx.error ?? new Error(reason));
		};
	});
}
var audioLeaseKey = (scope) => `audio-lease|${JSON.stringify([
	scope.accountId,
	scope.spaceId,
	scope.noteId
])}`;
var audioJournalKey = (scope, id) => `audio-recording|${scope.accountId}|${scope.spaceId}|${scope.noteId}|${id}`;
function validLease(value) {
	const lease = value;
	return !!lease && typeof lease === "object" && [
		"accountId",
		"spaceId",
		"noteId",
		"owner"
	].every((key) => typeof lease[key] === "string") && Number.isFinite(lease.expiresAt);
}
/** The read and ownership change share an IndexedDB transaction across every tab. */
async function updateAudioRecordingLease(scope, owner, mode, now = Date.now(), ttl = 12e4) {
	if (!owner || !Number.isFinite(now) || !Number.isSafeInteger(ttl) || ttl < 1e3 || ttl > 3e5) throw Error("Bail audio incompatible.");
	const db = await openDb();
	return new Promise((resolve, reject) => {
		const tx = db.transaction("snapshots", "readwrite"), store = tx.objectStore("snapshots"), key = audioLeaseKey(scope), read = store.get(key);
		let result = null;
		read.onsuccess = () => {
			const existing = read.result?.value, current = validLease(existing) ? existing : null;
			if (mode === "release") {
				if (current?.owner === owner) store.delete(key);
				return;
			}
			if (mode === "renew" && (!current || current.owner !== owner || current.expiresAt <= now)) return;
			if (mode === "claim" && current && current.expiresAt > now && current.owner !== owner) return;
			result = {
				...scope,
				owner,
				expiresAt: now + ttl
			};
			store.put({
				key,
				accountId: scope.accountId,
				spaceId: scope.spaceId,
				value: result
			});
		};
		tx.oncomplete = () => {
			db.close();
			resolve(result);
		};
		tx.onabort = tx.onerror = () => {
			db.close();
			reject(tx.error ?? Error("Le bail audio ne peut pas être conservé."));
		};
	});
}
async function getAudioRecordingJournal(scope, id) {
	const value = (await run("snapshots", "readonly", (store) => store.get(audioJournalKey(scope, id))))?.value;
	return value?.noteId === scope.noteId && value.id === id ? value : void 0;
}
/** Chunk, CAS journal and live ownership are committed together, or none is changed. */
async function saveAudioChunk(accountId, spaceId, journal, blob, options = {}) {
	const scope = {
		accountId,
		spaceId,
		noteId: journal.noteId
	}, lease = options.lease;
	if (lease && (lease.accountId !== accountId || lease.spaceId !== spaceId || lease.noteId !== journal.noteId)) throw Error("Écriture audio hors du compte, de l’année ou de la note.");
	const sha256 = blob ? await localBlobDigest(blob) : void 0;
	const db = await openDb();
	return new Promise((resolve, reject) => {
		const tx = db.transaction([BLOBS, "snapshots"], "readwrite"), snapshots = tx.objectStore("snapshots"), journalKey = audioJournalKey(scope, journal.id);
		let reason = "L’enregistrement audio n’a pas pu être conservé.", saved;
		const abort = (message) => {
			reason = message;
			tx.abort();
		};
		const leaseRead = snapshots.get(audioLeaseKey(scope));
		leaseRead.onsuccess = () => {
			const currentLease = leaseRead.result?.value;
			if (lease ? !validLease(currentLease) || currentLease.owner !== lease.owner || currentLease.expiresAt <= Date.now() : validLease(currentLease) && currentLease.expiresAt > Date.now()) {
				abort("Cet enregistrement est conservé par un autre onglet. Les portions déjà enregistrées restent intactes.");
				return;
			}
			const read = snapshots.get(journalKey);
			read.onsuccess = () => {
				const existing = read.result?.value;
				if (options.expectedRevision === null ? existing !== void 0 : options.expectedRevision !== void 0 && (existing?.writeRevision ?? 0) !== options.expectedRevision) {
					abort("Le journal audio a changé. Relisez sa version conservée avant de reprendre.");
					return;
				}
				if (blob) {
					const id = journal.chunkIds.at(-1);
					if (!id) {
						abort("Cette portion audio n’a pas de référence.");
						return;
					}
					const store = tx.objectStore(BLOBS), readBlob = store.get(blobKey({
						id,
						accountId,
						spaceId
					}));
					readBlob.onsuccess = () => {
						const old = readBlob.result;
						if (old && old.sha256 !== sha256) {
							abort("Cette portion audio possède déjà une autre source. Aucune n’est remplacée.");
							return;
						}
						store.put({
							key: blobKey({
								id,
								accountId,
								spaceId
							}),
							id,
							documentId: `audio-${journal.id}`,
							accountId,
							spaceId,
							blob,
							sha256,
							revision: (old?.revision ?? 0) + 1,
							name: journal.name,
							createdAt: Date.now(),
							status: "pending",
							removedFromNote: true
						});
					};
				}
				saved = {
					...journal,
					writeRevision: (existing?.writeRevision ?? 0) + 1
				};
				snapshots.put({
					key: journalKey,
					accountId,
					spaceId,
					value: saved
				});
			};
		};
		tx.oncomplete = () => {
			db.close();
			resolve(saved);
		};
		tx.onabort = tx.onerror = () => {
			db.close();
			reject(tx.error ?? new Error(reason));
		};
	});
}
/** Keep both originals and any unsaved visible edits before changing the conflict winner. */
async function resolvePaperDraft(durable, visibleContent, server, serverVersion, selectedContent, resolutionId) {
	if (server && key(server) !== key(durable)) throw new Error("Résolution hors du compte ou de l’année refusée.");
	const db = await openDb();
	const selected = {
		...durable,
		content: selectedContent,
		baseVersion: serverVersion,
		syncState: "local",
		conflict: void 0,
		updatedAt: Date.now()
	};
	return new Promise((resolve, reject) => {
		const tx = db.transaction([
			"drafts",
			"mutations",
			"snapshots"
		], "readwrite"), drafts = tx.objectStore("drafts"), outbox = tx.objectStore("mutations");
		const read = drafts.get(key(durable));
		read.onsuccess = () => {
			const latest = read.result;
			if (!latest || latest.baseVersion !== durable.baseVersion || JSON.stringify(latest.content) !== JSON.stringify(durable.content)) {
				tx.abort();
				return;
			}
			const all = outbox.getAll();
			all.onsuccess = () => {
				for (const mutation of all.result) if (key(mutation) === key(durable)) outbox.delete(mutation.id);
				tx.objectStore("snapshots").put({
					key: `paper-resolution|${key(durable)}|${resolutionId}`,
					accountId: durable.accountId,
					spaceId: durable.spaceId,
					value: {
						durable,
						visibleContent,
						server,
						selectedRevision: selectedContent?.revision
					}
				});
				drafts.put({
					...selected,
					key: key(durable)
				});
				tx.objectStore("snapshots").put({
					key: `sync-version|${key(durable)}`,
					accountId: durable.accountId,
					spaceId: durable.spaceId,
					value: serverVersion
				});
			};
		};
		tx.oncomplete = () => {
			db.close();
			resolve(selected);
		};
		tx.onabort = tx.onerror = () => {
			db.close();
			reject(tx.error ?? /* @__PURE__ */ new Error("La note a changé pendant la résolution. Rechargez ses versions."));
		};
	});
}
/** A copy/import is not advertised until its metadata exists; activation preserves any newer edit. */
async function activateStagedDraft(identity) {
	const db = await openDb();
	return new Promise((resolve, reject) => {
		const tx = db.transaction("drafts", "readwrite"), store = tx.objectStore("drafts"), read = store.get(key(identity));
		read.onsuccess = () => {
			const draft = read.result;
			if (!draft) {
				tx.abort();
				return;
			}
			store.put({
				...draft,
				key: key(identity),
				staged: void 0
			});
		};
		tx.oncomplete = () => {
			db.close();
			resolve();
		};
		tx.onabort = tx.onerror = () => {
			db.close();
			reject(tx.error ?? /* @__PURE__ */ new Error("L’import attend sa finalisation ; les données restent conservées."));
		};
	});
}
/** Imported paper and media become publishable together, after note metadata is committed. */
async function activateNotebookArchiveFiles(identity, current) {
	const db = await openDb();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(["drafts", BLOBS], "readwrite"), drafts = tx.objectStore("drafts"), files = tx.objectStore(BLOBS), read = drafts.get(key(identity));
		read.onsuccess = () => {
			const draft = read.result;
			if (!draft || !draft.archiveImport || !current()) {
				tx.abort();
				return;
			}
			const rows = files.getAll();
			rows.onsuccess = () => {
				if (!current()) {
					tx.abort();
					return;
				}
				for (const blob of rows.result) if (blob.accountId === identity.accountId && blob.spaceId === identity.spaceId && blob.documentId === identity.documentId) files.put({
					...blob,
					removedFromNote: void 0,
					revision: (blob.revision ?? 0) + 1
				});
				drafts.put({
					...draft,
					staged: void 0
				});
			};
		};
		tx.oncomplete = () => {
			db.close();
			resolve();
		};
		tx.onabort = tx.onerror = () => {
			db.close();
			reject(tx.error ?? /* @__PURE__ */ new Error("L’importation reste conservée, en attente de finalisation."));
		};
	});
}
/** An append publishes its files only when the durable note contains every imported asset. */
async function activateNotebookAppendFiles(identity, ids, current) {
	const db = await openDb();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(["drafts", BLOBS], "readwrite"), drafts = tx.objectStore("drafts"), files = tx.objectStore(BLOBS), read = drafts.get(key(identity));
		let aborted = false;
		const abort = () => {
			if (!aborted) {
				aborted = true;
				tx.abort();
			}
		};
		read.onsuccess = () => {
			const assets = (read.result?.content)?.assets;
			if (!current() || !Array.isArray(assets) || ids.some((id) => !assets.some((asset) => asset.id === id))) {
				abort();
				return;
			}
			let left = ids.length;
			if (!left) return;
			for (const id of ids) {
				const request = files.get(blobKey({
					accountId: identity.accountId,
					spaceId: identity.spaceId,
					id
				}));
				request.onsuccess = () => {
					if (aborted) return;
					const blob = request.result;
					if (!blob || blob.documentId !== identity.documentId || !current()) {
						abort();
						return;
					}
					files.put({
						...blob,
						removedFromNote: void 0,
						revision: (blob.revision ?? 0) + 1
					});
					left--;
				};
			}
		};
		tx.oncomplete = () => {
			db.close();
			resolve();
		};
		tx.onabort = tx.onerror = () => {
			db.close();
			reject(tx.error ?? /* @__PURE__ */ new Error("Les pages ou fichiers attendent leur enregistrement. Les originaux restent conservés."));
		};
	});
}
var blobState = (value) => value && JSON.stringify({
	...value,
	blob: void 0,
	key: void 0,
	size: value.blob.size,
	mediaType: value.blob.type
});
var draftState = (value) => value && JSON.stringify({
	...value,
	key: void 0
});
function paperNoteId(value) {
	if (!value || typeof value !== "object") return;
	const document = value;
	return document.notebookSchema === 3 && typeof document.noteId === "string" ? document.noteId : void 0;
}
var samePaperOwner = (first, second) => isPaperDocument(first) && isPaperDocument(second) && first.noteId === second.noteId;
/** Derived queue status/alias flags do not turn the same original contribution
* into a new edit. Exact bodies and their source version remain significant. */
function paperIdentityMutationDigest(mutation) {
	const { identityAlias, status, error, ...original } = mutation;
	return notebookIdentityDigest(JSON.stringify({
		...original,
		key: void 0
	}));
}
/** A renamed key starts a distinct server version stream. The old key and every
* recovery record remain available; only the canonical key enters the outbox. */
async function commitPaperIdentityPromotion(plan, current) {
	const { source, target, canonical, receiptKey } = plan, noteId = paperNoteId(source.content);
	const sameScope = (row) => row.accountId === source.accountId && row.spaceId === source.spaceId;
	if (!noteId || !isPaperDocument(source.content) || !isPaperDocument(canonical.content) || target && !isPaperDocument(target.content) || source.type !== "whiteboard" || canonical.type !== "whiteboard" || !sameScope(canonical) || target && (!sameScope(target) || key(target) !== key(canonical))) throw Error("Changement d’identité hors du compte ou de l’année refusé.");
	if (paperNoteId(canonical.content) !== noteId || target && paperNoteId(target.content) !== noteId || key(source) === key(canonical) || source.identityAlias && source.identityAlias !== canonical.documentId || canonical.identityAlias || target?.identityAlias) throw Error("Deux notes utilisent une identité incompatible. Leurs originaux restent conservés.");
	if (plan.contributions?.some((row) => key(row.mutation) !== key(source) || row.kind !== "collision" && !samePaperOwner(source.content, row.mutation.content))) throw Error("Une contribution appartient à une autre note ou à un autre périmètre. Les originaux restent conservés.");
	if (plan.deletion && (!validNotebookDeletion(plan.deletion, canonical) || plan.deletion.noteId !== void 0 && plan.deletion.noteId !== noteId || canonical.documentId !== notebookDocumentId(noteId))) throw Error("Le reçu de suppression ne correspond pas à cette note.");
	if (!receiptKey || typeof receiptKey !== "string") throw Error("Le changement d’identité nécessite un reçu de récupération.");
	const sourceAssets = [...source.content.assets, ...(plan.contributions ?? []).flatMap((row) => row.kind !== "collision" && isPaperDocument(row.mutation.content) ? row.mutation.content.assets : [])];
	if (!Array.isArray(sourceAssets) || !plan.assetIds.every((id) => sourceAssets.some((asset) => asset.id === id))) throw Error("Les fichiers à reclasser doivent appartenir à cette note.");
	if (!current()) throw Error("Le carnet a changé avant le reclassement de la note.");
	const db = await openDb();
	return new Promise((resolve, reject) => {
		const tx = db.transaction([
			"drafts",
			"mutations",
			"snapshots",
			BLOBS
		], "readwrite"), drafts = tx.objectStore("drafts"), snapshots = tx.objectStore("snapshots");
		let reason = "La note a changé pendant son reclassement. Les originaux restent conservés.", aborted = false, pending = 6;
		let storedSource, storedTarget;
		const rows = {
			drafts: [],
			mutations: [],
			snapshots: [],
			files: []
		};
		const abort = () => {
			if (!aborted) {
				aborted = true;
				tx.abort();
			}
		};
		const checked = () => {
			if (aborted || --pending) return;
			if (!current()) {
				reason = "La connexion a changé pendant le reclassement de la note.";
				abort();
				return;
			}
			if (draftState(storedSource) !== draftState(source) || draftState(storedTarget) !== draftState(target)) {
				abort();
				return;
			}
			if (plan.deletion) {
				const status = rows.snapshots.find((row) => row.key === notebookDeletionKey(canonical));
				if (!status || !sameScope(status) || JSON.stringify(status.value) !== JSON.stringify(plan.deletion)) {
					reason = "La suppression de la note a changé pendant sa récupération.";
					abort();
					return;
				}
			}
			if (plan.contributions?.some((row) => {
				const mutation = rows.mutations.find((candidate) => candidate.id === row.mutation.id);
				return !mutation || JSON.stringify({
					...mutation,
					key: void 0
				}) !== JSON.stringify({
					...row.mutation,
					key: void 0
				});
			})) {
				reason = "Une contribution a changé pendant sa récupération. Aucun original n’est remplacé.";
				abort();
				return;
			}
			const now = Date.now(), next = {
				...canonical,
				identityAlias: void 0,
				baseVersion: target?.baseVersion ?? 0
			};
			const mutations = rows.mutations.filter((row) => key(row) === key(source));
			const assetIds = new Set(plan.assetIds), directTag = `paper-v3-${noteId}`;
			const files = rows.files.filter((row) => sameScope(row) && assetIds.has(row.id) && (row.documentId === source.documentId || row.documentId === directTag));
			const metadata = rows.drafts.filter((row) => sameScope(row) && row.type === "notesMarkdown" && row.documentId === noteId && row.content?.id === noteId && row.paperDependency === source.documentId);
			const recovery = rows.snapshots.filter((row) => sameScope(row) && [
				"paper-history",
				"paper-migration",
				"paper-resolution"
			].some((prefix) => row.key.startsWith(`${prefix}|${key(source)}`) && (row.key === `${prefix}|${key(source)}` || row.key.startsWith(`${prefix}|${key(source)}|`))));
			const clones = [];
			for (const row of recovery) {
				const cloneKey = row.key.replace(`|${key(source)}`, `|${key(canonical)}`), existing = rows.snapshots.find((candidate) => candidate.key === cloneKey);
				if (existing && JSON.stringify(existing.value) === JSON.stringify(row.value)) continue;
				let destination = cloneKey;
				if (existing) {
					const suffix = `|identity-${source.documentId}-${now}`;
					destination = cloneKey + suffix;
					let count = 0;
					while (rows.snapshots.some((candidate) => candidate.key === destination) || clones.some((candidate) => candidate.key === destination)) destination = cloneKey + suffix + `-${++count}`;
				}
				clones.push({
					...row,
					key: destination
				});
			}
			const previous = rows.snapshots.find((row) => row.key === receiptKey);
			if (previous && !sameScope(previous)) {
				reason = "Ce reçu appartient à un autre compte. Aucun original n’est déplacé.";
				abort();
				return;
			}
			let previousReceiptKey;
			if (previous) do
				previousReceiptKey = `${receiptKey}|previous-${crypto.randomUUID()}`;
			while (rows.snapshots.some((row) => row.key === previousReceiptKey) || clones.some((row) => row.key === previousReceiptKey));
			const processedMutationStates = {
				...(previous?.value)?.processedMutationStates ?? {},
				...Object.fromEntries((plan.contributions ?? []).map((row) => [row.mutation.id, paperIdentityMutationDigest(row.mutation)]))
			};
			const incomingConflicts = (plan.contributions ?? []).filter((row) => row.kind === "conflict").map((row) => ({
				mutationId: row.mutation.id,
				content: row.mutation.content,
				baseVersion: row.mutation.baseVersion
			}));
			const conflictBodies = new Map(incomingConflicts.map((row) => [notebookIdentityDigest(JSON.stringify(row.content)), row]));
			const receipt = {
				schema: 1,
				kind: plan.deletion ? "paper-identity-quarantine" : "paper-identity-promotion",
				noteId,
				at: now,
				source,
				target,
				canonical: plan.deletion ? target : next,
				...plan.deletion ? {
					deletion: plan.deletion,
					quarantinedCanonical: next
				} : {},
				mutations,
				files: files.map(({ blob, ...file }) => ({
					...file,
					size: blob.size,
					mediaType: blob.type
				})),
				metadata,
				snapshots: recovery.map((row) => ({
					key: row.key,
					value: row.value
				})),
				clonedSnapshotKeys: clones.map((row) => row.key),
				contributions: plan.contributions ?? [],
				processedMutationStates,
				incomingConflicts,
				...conflictBodies.size === 1 ? { chosenIncomingConflict: [...conflictBodies.values()][0] } : {},
				...previousReceiptKey ? { previousReceiptKey } : {}
			};
			if (!current()) {
				reason = "La connexion a changé avant la conservation du reçu.";
				abort();
				return;
			}
			if (previous && previousReceiptKey) snapshots.put({
				...previous,
				key: previousReceiptKey
			});
			snapshots.put({
				key: receiptKey,
				accountId: source.accountId,
				spaceId: source.spaceId,
				value: receipt
			});
			for (const row of plan.contributions ?? []) if (row.kind === "conflict" || row.kind === "collision" || plan.deletion) snapshots.put({
				key: `${row.kind === "collision" ? "paper-identity-collision" : "paper-resolution"}|${key(canonical)}|identity-outbox-${row.mutation.id}-${crypto.randomUUID()}`,
				accountId: source.accountId,
				spaceId: source.spaceId,
				value: {
					schema: 1,
					kind: plan.deletion ? "paper-identity-deleted-outbox" : "paper-identity-outbox-" + row.kind,
					durable: target,
					visibleContent: row.mutation.content,
					sourceMutation: row.mutation,
					sourceIdentity: source.documentId,
					identityReceipt: receiptKey,
					...plan.deletion ? { deletion: plan.deletion } : {}
				}
			});
			for (const row of clones) snapshots.put(row);
			for (const row of mutations) tx.objectStore("mutations").put({
				...row,
				identityAlias: canonical.documentId
			});
			if (!plan.deletion) {
				for (const row of files) tx.objectStore(BLOBS).put({
					...row,
					documentId: canonical.documentId,
					revision: (row.revision ?? 0) + 1,
					key: blobKey(row)
				});
				for (const row of metadata) drafts.put({
					...row,
					key: key(row),
					paperDependency: canonical.documentId,
					syncState: row.syncState === "conflict" ? "conflict" : "local"
				});
			}
			drafts.put({
				...source,
				key: key(source),
				identityAlias: canonical.documentId
			});
			if (!plan.deletion) drafts.put({
				...next,
				key: key(next)
			});
		};
		const readSource = drafts.get(key(source));
		readSource.onsuccess = () => {
			storedSource = readSource.result;
			checked();
		};
		const readTarget = drafts.get(key(canonical));
		readTarget.onsuccess = () => {
			storedTarget = readTarget.result;
			checked();
		};
		for (const [name, field] of [
			["drafts", "drafts"],
			["mutations", "mutations"],
			["snapshots", "snapshots"],
			[BLOBS, "files"]
		]) {
			const request = tx.objectStore(name).getAll();
			request.onsuccess = () => {
				rows[field] = request.result;
				checked();
			};
		}
		tx.oncomplete = () => {
			db.close();
			resolve();
		};
		tx.onabort = tx.onerror = () => {
			db.close();
			reject(tx.error ?? new Error(reason));
		};
	});
}
/** Originals, target revisions and the migration receipt change atomically or not at all. */
async function commitNotebookTransfer(plan, current) {
	const inTarget = (row) => row.accountId === plan.target.accountId && row.spaceId === plan.target.spaceId;
	const inSource = (row) => plan.sources.some((source) => source.accountId === row.accountId && source.spaceId === row.spaceId);
	if (!plan.drafts.every(inTarget) || !plan.blobs.every(inTarget) || !plan.snapshots.every((row) => inTarget(row) || inSource(row))) throw Error("Transfert hors du compte ou de l’année refusé.");
	if (plan.drafts.some((row) => !plan.draftChecks.some((check) => key(check.identity) === key(row))) || plan.blobs.some((row) => !plan.blobChecks.some((check) => blobKey(check.identity) === blobKey(row))) || plan.snapshots.some((row) => !plan.snapshotChecks.some((check) => check.key === row.key))) throw Error("Le transfert doit vérifier chaque destination.");
	if (!current()) throw Error("La connexion a changé avant le transfert.");
	const db = await openDb();
	return new Promise((resolve, reject) => {
		const tx = db.transaction([
			"drafts",
			BLOBS,
			"snapshots"
		], "readwrite");
		let reason = "La note ou ses fichiers ont changé pendant le transfert. Les originaux restent conservés.", aborted = false;
		const abort = () => {
			if (!aborted) {
				aborted = true;
				tx.abort();
			}
		};
		let left = plan.draftChecks.length + plan.blobChecks.length + plan.snapshotChecks.length;
		const write = () => {
			if (aborted) return;
			if (!current()) {
				reason = "La connexion a changé pendant le transfert.";
				abort();
				return;
			}
			for (const row of plan.drafts) tx.objectStore("drafts").put({
				...row,
				key: key(row)
			});
			for (const row of plan.blobs) tx.objectStore(BLOBS).put({
				...row,
				key: blobKey(row)
			});
			for (const row of plan.snapshots) tx.objectStore("snapshots").put(row);
		};
		const checked = (valid) => {
			if (aborted) return;
			if (!valid || !current()) {
				abort();
				return;
			}
			if (--left === 0) write();
		};
		for (const check of plan.draftChecks) {
			const request = tx.objectStore("drafts").get(key(check.identity));
			request.onsuccess = () => checked(draftState(request.result) === draftState(check.expected));
		}
		for (const check of plan.blobChecks) {
			const request = tx.objectStore(BLOBS).get(blobKey(check.identity));
			request.onsuccess = () => checked(blobState(request.result) === blobState(check.expected));
		}
		for (const check of plan.snapshotChecks) {
			const request = tx.objectStore("snapshots").get(check.key);
			request.onsuccess = () => checked(JSON.stringify(request.result) === JSON.stringify(check.expected));
		}
		if (!left) write();
		tx.oncomplete = () => {
			db.close();
			resolve();
		};
		tx.onabort = tx.onerror = () => {
			db.close();
			reject(tx.error ?? new Error(reason));
		};
	});
}
//#endregion
export { storage_exports as A, queueLocalDrafts as C, saveAudioChunk as D, resolvePaperDraft as E, saveDraftAndQueue as O, putSnapshot as S, readNotebookDeletionStatus as T, localBlobDigest as _, activateNotebookArchiveFiles as a, putDraft as b, commitNotebookTransfer as c, getDraft as d, getSnapshot as f, listSnapshots as g, listMutations as h, activateNotebookAppendFiles as i, updateAudioRecordingLease as j, savePaperDraft as k, commitPaperIdentityPromotion as l, listLocalBlobs as m, acknowledgeLocalBlob as n, activateStagedDraft as o, listDrafts as p, acknowledgeMutation as r, applyChangePage as s, DraftChangedError as t, getAudioRecordingJournal as u, notebookDeletionKey as v, queueMutation as w, putLocalBlob as x, paperIdentityMutationDigest as y };
