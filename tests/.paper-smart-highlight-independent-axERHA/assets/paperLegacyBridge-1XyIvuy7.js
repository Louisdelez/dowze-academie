import { a as isPaperDocument, b as parsePhotoReference, g as notebookDocumentId, h as legacyNotebookDocumentId, n as blankPage, o as legacyPaperPhotoIdentities, p as scanLegacyPaperImages, s as migratePaper, t as applyPaperCommand, y as noteBoardId } from "./notebookDocument-yuVu6oXC.js";
import { T as readNotebookDeletionStatus, _ as localBlobDigest, c as commitNotebookTransfer, d as getDraft, f as getSnapshot, m as listLocalBlobs, v as notebookDeletionKey } from "./storage-Dsyjb46q.js";
import { t as amendPaperCollaboration } from "./paperCollaboration-Dln7Hroy.js";
import { o as paperMarkdown, p as readOwnedLegacyNotebookBoard } from "../smart-highlight-independent.mjs";
import { n as rewriteLegacyImageBindings, paperLegacyOwnerKey, t as prepareLegacyImageAssets } from "./paperLegacyMigration-6XwJL1KK.js";
import { fromMarkdown } from "mdast-util-from-markdown";
import { gfm } from "micromark-extension-gfm";
import { gfmFromMarkdown } from "mdast-util-gfm";
//#region src/lib/paperLegacyReconcile.ts
var record$1 = (value) => !!value && typeof value === "object" && !Array.isArray(value);
var canonical$1 = (value) => JSON.stringify(value, (_key, item) => record$1(item) ? Object.fromEntries(Object.keys(item).sort().map((key) => [key, item[key]])) : item);
var same = (a, b) => canonical$1(a) === canonical$1(b);
/** Parser semantics distinguish an actual image from a code example or escaped URI spelling. */
function legacyInlinePhotoIds(markdown, boardIds) {
	const tree = fromMarkdown(markdown, {
		extensions: [gfm()],
		mdastExtensions: [gfmFromMarkdown()]
	});
	const definitions = /* @__PURE__ */ new Map();
	const walk = (node, visit) => {
		visit(node);
		node.children?.forEach((child) => walk(child, visit));
	};
	walk(tree, (node) => {
		if (node.type === "definition" && node.identifier && node.url) definitions.set(node.identifier, node.url);
	});
	const result = /* @__PURE__ */ new Set();
	walk(tree, (node) => {
		const url = node.type === "image" ? node.url : node.type === "imageReference" && node.identifier ? definitions.get(node.identifier) : void 0;
		const ref = url ? parsePhotoReference(url) : null;
		if (ref && (!boardIds || boardIds.has(ref.documentId))) result.add(ref.id);
	});
	return result;
}
function singleEdit(before, after) {
	let from = 0, to = before.length, end = after.length;
	while (from < to && from < end && before[from] === after[from]) from++;
	if (from > 0 && /[\uD800-\uDBFF]/.test(before[from - 1]) && /[\uDC00-\uDFFF]/.test(before[from] ?? "")) from--;
	while (to > from && end > from && before[to - 1] === after[end - 1]) {
		to--;
		end--;
	}
	if (to < before.length && to > from && /[\uDC00-\uDFFF]/.test(before[to]) && /[\uD800-\uDBFF]/.test(before[to - 1])) {
		to++;
		end++;
	}
	return {
		from,
		to,
		insert: after.slice(from, end)
	};
}
/** Conservative three-way merge: distinct changes are combined; overlap remains explicit. */
function mergeLegacyMarkdown(base, current, incoming) {
	if (incoming === base || incoming === current) return current;
	if (current === base) return incoming;
	const local = singleEdit(base, current), remote = singleEdit(base, incoming);
	const before = (a, b) => a.to < b.from || a.to === b.from && !(a.from === a.to && b.from === b.to);
	if (!before(local, remote) && !before(remote, local)) return null;
	return [local, remote].sort((a, b) => b.from - a.from).reduce((text, edit) => text.slice(0, edit.from) + edit.insert + text.slice(edit.to), base);
}
function legacyInk(noteId, board, now) {
	const source = record$1(board) && record$1(board.board) ? board.board : {};
	const rows = migratePaper(noteId, "", board, now).objects.filter((object) => object.kind === "ink").map((object) => ({
		key: object.id,
		object
	}));
	const sourceIds = Array.isArray(source.strokes) ? source.strokes.map((stroke) => record$1(stroke) ? stroke.id : void 0) : [];
	return {
		rows,
		ambiguous: new Set(rows.map((row) => row.key)).size !== rows.length || Array.isArray(source.strokes) && (source.strokes.length !== rows.length || source.strokes.some((stroke) => !record$1(stroke) || typeof stroke.id !== "string" || !stroke.id) || new Set(sourceIds).size !== sourceIds.length)
	};
}
function inkValue(object) {
	return {
		points: object.points,
		color: object.color,
		strokeWidth: object.strokeWidth,
		pen: object.pen,
		x: object.x,
		y: object.y,
		width: object.width,
		height: object.height,
		z: object.z,
		rotation: object.rotation,
		locked: object.locked
	};
}
function photos(noteId, board) {
	if (!record$1(board) || !Array.isArray(board.photos)) return [];
	const result = /* @__PURE__ */ new Map();
	for (const identity of legacyPaperPhotoIdentities(noteId, board)) {
		const value = board.photos[identity.photoIndex];
		if (!record$1(value)) continue;
		const next = {
			id: identity.assetId,
			name: typeof value.name === "string" ? value.name : "Image",
			mediaType: typeof value.mediaType === "string" ? value.mediaType : "image/png",
			size: typeof value.size === "number" && Number.isFinite(value.size) && value.size >= 0 ? value.size : 0,
			...identity.serverId ? { serverId: identity.serverId } : {}
		};
		const old = result.get(next.id);
		if (old && old.serverId && next.serverId && old.serverId !== next.serverId) throw Error("Deux originaux utilisent la même identité de photo. Ils doivent être conservés séparément avant la réconciliation.");
		result.set(next.id, old ?? next);
	}
	return [...result.values()];
}
/**
* Plan only. The caller commits source checks, the collaboration update, immutable
* files and this exact observation receipt in one CAS transaction. Unmodified
* migration provenance and every existing attachment remain in the document.
*/
function planPaperLegacyReconcile(current, input) {
	if (!isPaperDocument(current)) throw Error("La note courante est incompatible. Son original est conservé.");
	const now = input.now ?? (/* @__PURE__ */ new Date()).toISOString(), allocate = input.newId ?? (() => crypto.randomUUID()), base = input.observed ?? input.baseline;
	const baselineKnown = !!input.observed || input.baselineKnown !== false;
	const usedIds = new Set([
		...current.pages,
		...current.objects,
		...current.assets,
		...current.audio
	].map((item) => item.id));
	const newId = () => {
		for (let attempt = 0; attempt < 10; attempt++) {
			const id = allocate();
			if (typeof id === "string" && id.length > 0 && id.length <= 200 && !usedIds.has(id)) {
				usedIds.add(id);
				return id;
			}
		}
		throw Error("La récupération nécessite une identité indépendante. La note courante est conservée.");
	};
	if (typeof input.markdown !== "string" || typeof base.markdown !== "string" || !Number.isFinite(Date.parse(now))) throw Error("L’observation de l’ancienne note est incompatible.");
	const receipt = {
		markdown: input.markdown,
		board: structuredClone(input.board)
	}, commands = [], notices = [];
	if (baselineKnown && input.markdown === base.markdown && same(input.board, base.board)) return {
		document: current,
		commands,
		changed: false,
		recovered: false,
		receipt,
		notices
	};
	const rootId = `text-${noteBoardId(current.noteId)}`, root = current.objects.find((object) => object.id === rootId && object.kind === "text"), legacyPageId = `page-${noteBoardId(current.noteId)}`, legacyPage = current.pages.find((page) => page.id === legacyPageId);
	let recoveryPageId, recovery, recovered = false;
	const recoveryPage = (height = 1123) => {
		if (!recoveryPageId) {
			recovery = blankPage(newId());
			recovery.height = Math.max(recovery.height, height);
			recoveryPageId = recovery.id;
			commands.push({
				type: "insert-page",
				page: recovery,
				afterId: current.pages.at(-1).id
			});
		} else if (recovery && height > recovery.height) {
			recovery = {
				...recovery,
				height
			};
			commands.push({
				type: "update-page",
				page: recovery
			});
		}
		recovered = true;
		return recoveryPageId;
	};
	if (!input.currentMarkdownEquivalent && (input.markdown !== base.markdown || !baselineKnown)) {
		const merged = baselineKnown && root && !root.textPartition && !root.locked ? mergeLegacyMarkdown(base.markdown, root.markdown ?? "", input.markdown) : null;
		if (merged !== null) {
			if (merged !== root.markdown) commands.push({
				type: "patch-object",
				id: root.id,
				patch: { markdown: merged }
			});
		} else {
			const pageId = recoveryPage();
			commands.push({
				type: "upsert-object",
				object: {
					id: newId(),
					pageId,
					kind: "text",
					x: 48,
					y: 48,
					width: 698,
					height: 1027,
					rotation: 0,
					z: 0,
					locked: false,
					markdown: input.markdown,
					createdAt: Date.parse(now)
				}
			});
			notices.push("Le texte modifié dans l’ancienne application est conservé sur une page de récupération ; votre texte actuel reste intact.");
		}
	}
	const before = legacyInk(current.noteId, base.board, now), after = legacyInk(current.noteId, input.board, now), baseRows = new Map(before.rows.map((row) => [row.key, row.object])), afterRows = new Map(after.rows.map((row) => [row.key, row.object]));
	let inkConflict = !baselineKnown && after.rows.length > 0 || before.ambiguous || after.ambiguous;
	const inkCommands = [];
	if (!inkConflict) for (const key of /* @__PURE__ */ new Set([...baseRows.keys(), ...afterRows.keys()])) {
		const old = baseRows.get(key), incoming = afterRows.get(key), present = current.objects.find((object) => object.id === key);
		if (old && incoming && same(inkValue(old), inkValue(incoming))) continue;
		if (!old && incoming) {
			if (present) {
				if (present.kind !== "ink" || !same(inkValue(present), inkValue(incoming))) inkConflict = true;
			} else if (legacyPage) inkCommands.push({
				type: "upsert-object",
				object: {
					...incoming,
					id: key,
					pageId: legacyPage.id,
					width: legacyPage.width,
					height: Math.max(legacyPage.height, incoming.height)
				}
			});
			else inkConflict = true;
		} else if (old) {
			if (present?.kind === "ink" && same(inkValue(present), inkValue(old))) {
				if (incoming) inkCommands.push({
					type: "upsert-object",
					object: {
						...present,
						...incoming,
						pageId: present.pageId,
						width: present.width,
						height: Math.max(present.height, incoming.height),
						createdAt: present.createdAt
					}
				});
				else inkCommands.push({
					type: "remove-objects",
					ids: [present.id]
				});
			} else if (present || incoming) inkConflict = true;
		}
	}
	if (inkConflict && (!baselineKnown || !same(input.board, base.board))) {
		const pageId = recoveryPage(after.rows.reduce((height, row) => Math.max(height, row.object.height), 1123));
		for (const row of after.rows) commands.push({
			type: "upsert-object",
			object: {
				...row.object,
				id: newId(),
				pageId
			}
		});
		notices.push("Le dessin de l’ancienne application est conservé séparément ; les traits actuels ne sont pas remplacés.");
	} else {
		if (legacyPage && inkCommands.length) {
			const height = after.rows.reduce((height, row) => Math.max(height, row.object.height), legacyPage.height);
			if (height > legacyPage.height) commands.push({
				type: "update-page",
				page: {
					...legacyPage,
					height
				}
			});
		}
		for (const command of inkCommands) commands.push(command);
	}
	const inline = legacyInlinePhotoIds(input.markdown, /* @__PURE__ */ new Set([noteBoardId(current.noteId), notebookDocumentId(current.noteId)]));
	const photoY = /* @__PURE__ */ new Map(), baselinePhotoIds = new Set(photos(current.noteId, base.board).map((asset) => asset.id));
	for (const asset of photos(current.noteId, input.board)) {
		const existing = current.assets.find((value) => value.id === asset.id);
		if (existing) {
			if (existing.serverId && asset.serverId && existing.serverId !== asset.serverId) throw Error("La photo reçue utilise l’identité d’un autre original. Préservez ses fichiers avant de continuer.");
			if (baselinePhotoIds.has(asset.id) || current.objects.some((object) => object.kind === "image" && object.assetId === asset.id)) continue;
		} else commands.push({
			type: "add-asset",
			asset
		});
		if (!inline.has(asset.id)) {
			const pageId = recoveryPageId ?? legacyPage?.id ?? recoveryPage(), y = photoY.get(pageId) ?? current.objects.reduce((bottom, object) => object.pageId === pageId && object.kind === "image" ? Math.max(bottom, object.y + object.height + 24) : bottom, 100);
			photoY.set(pageId, y + 264);
			const height = y + 288;
			if (height > 1e5) throw Error("Ces images nécessitent des pages supplémentaires avant la réconciliation. Leurs originaux sont conservés.");
			if (pageId === recoveryPageId) recoveryPage(height);
			else if (legacyPage && height > legacyPage.height) commands.push({
				type: "update-page",
				page: {
					...legacyPage,
					height
				}
			});
			commands.push({
				type: "upsert-object",
				object: {
					id: newId(),
					pageId,
					kind: "image",
					x: 48,
					y,
					width: 320,
					height: 240,
					rotation: 0,
					z: current.objects.length + commands.length,
					locked: false,
					assetId: asset.id,
					createdAt: Date.parse(now)
				}
			});
		}
	}
	return {
		document: commands.length ? applyPaperCommand(current, {
			type: "batch",
			commands
		}, now) : current,
		commands,
		changed: !!commands.length,
		recovered,
		receipt,
		notices
	};
}
//#endregion
//#region src/lib/paperLegacyBridge.ts
var record = (value) => !!value && typeof value === "object" && !Array.isArray(value);
var canonical = (value) => JSON.stringify(value, (_key, item) => record(item) ? Object.fromEntries(Object.keys(item).sort().map((key) => [key, item[key]])) : item) ?? "undefined";
var equal = (a, b) => canonical(a) === canonical(b);
var draftKey = (identity) => `${identity.accountId}|${identity.spaceId}|${identity.type ?? "notesMarkdown"}|${identity.documentId}`;
var check = (current) => {
	if (!current()) throw Error("Le compte, l’année ou la source de la note a changé. Les originaux restent conservés.");
};
var identity = (scope, noteId) => ({
	...scope,
	type: "whiteboard",
	documentId: notebookDocumentId(noteId)
});
var ownedScope = (scope) => ({
	accountId: scope.accountId,
	spaceId: scope.spaceId
});
var paperLegacyReceiptKey = (scope, noteId) => `paper-legacy-observation|${draftKey(identity(scope, noteId))}`;
var metadataMarkdown = (draft) => record(draft?.content) && typeof draft.content.markdown === "string" ? draft.content.markdown : void 0;
function validScope(scope, noteId) {
	if (!scope || !["accountId", "spaceId"].every((key) => typeof scope[key] === "string" && /^[A-Za-z0-9._-]{1,200}$/.test(scope[key])) || typeof noteId !== "string" || !noteId || noteId.length > 200) throw Error("L’identité du carnet est incompatible.");
}
function receiptValue(row, scope, noteId) {
	if (!row) return;
	const value = row.value;
	if (row.accountId !== scope.accountId || row.spaceId !== scope.spaceId || !record(value) || value.schema !== 1 || value.kind !== "paper-legacy-observation" || value.noteId !== noteId || value.documentId !== notebookDocumentId(noteId) || !record(value.observed) || typeof value.observed.markdown !== "string" || typeof value.baselineKnown !== "boolean" || !Number.isSafeInteger(value.paperRevision) || !Number.isFinite(Date.parse(String(value.observedAt)))) throw Error("Le reçu historique est incompatible. Son original reste conservé.");
	if (value.mirror !== void 0 && (!record(value.mirror) || typeof value.mirror.id !== "string" || !["staged", "published"].includes(String(value.mirror.status)) || typeof value.mirror.expectedMarkdown !== "string" || typeof value.mirror.desiredMarkdown !== "string" || !Number.isSafeInteger(value.mirror.paperRevision))) throw Error("La publication précédente doit être récupérée avant de continuer.");
	if (value.imageBindings !== void 0 && !Array.isArray(value.imageBindings) || value.imageReceiptKeys !== void 0 && (!Array.isArray(value.imageReceiptKeys) || value.imageReceiptKeys.some((key) => typeof key !== "string"))) throw Error("Le reçu des références d’images est incompatible.");
	return value;
}
async function readState(scope, noteId, current) {
	validScope(scope, noteId);
	check(current);
	const paper = await getDraft(identity(scope, noteId));
	check(current);
	if (!paper || !isPaperDocument(paper.content) || paper.content.noteId !== noteId || paper.staged || paper.syncState === "conflict" || paper.identityAlias) throw Error("La note doit être conservée et ses versions départagées avant la réconciliation.");
	const deletionRow = await getSnapshot(notebookDeletionKey(identity(scope, noteId)));
	check(current);
	if (await readNotebookDeletionStatus(noteId, scope, current)) throw Error("Cette note a été supprimée sur le serveur. Ses sources sont conservées sans publication ni recréation automatique.");
	check(current);
	const ownerRow = await getSnapshot(paperLegacyOwnerKey(noteId, scope));
	check(current);
	if (ownerRow && (ownerRow.accountId !== scope.accountId || ownerRow.spaceId !== scope.spaceId || !record(ownerRow.value) || ownerRow.value.schema !== 1 || ownerRow.value.noteId !== noteId || ownerRow.value.documentId !== paper.documentId || ownerRow.value.boardId !== noteBoardId(noteId))) throw Error("Cet ancien dessin est déjà lié à une autre identité. Les originaux restent conservés.");
	const boardIdentity = {
		...scope,
		type: "whiteboard",
		documentId: noteBoardId(noteId)
	}, rawBoard = await getDraft(boardIdentity);
	check(current);
	const board = await readOwnedLegacyNotebookBoard(noteId, scope, current);
	check(current);
	if (rawBoard && !board) throw Error("Cet ancien dessin ne possède pas une identité prouvée pour cette note. Ses originaux restent conservés.");
	const metadata = await getDraft({
		...scope,
		type: "notesMarkdown",
		documentId: noteId
	});
	check(current);
	if (metadata?.syncState === "conflict" || metadata && record(metadata.content) && typeof metadata.content.id === "string" && metadata.content.id !== noteId) throw Error("Les métadonnées reçues doivent être départagées avant de publier le texte de cette note.");
	const receiptRow = await getSnapshot(paperLegacyReceiptKey(scope, noteId));
	check(current);
	return {
		paper,
		board,
		metadata,
		ownerRow,
		receiptRow,
		deletionRow,
		receipt: receiptValue(receiptRow, scope, noteId)
	};
}
async function migrationBaseline(scope, noteId, current) {
	const keys = [.../* @__PURE__ */ new Set([notebookDocumentId(noteId), legacyNotebookDocumentId(noteId)])].map((documentId) => `paper-migration|${draftKey({
		...scope,
		type: "whiteboard",
		documentId
	})}`);
	const checks = [];
	for (const key of keys) {
		const row = await getSnapshot(key);
		check(current);
		checks.push({
			key,
			expected: row
		});
		if (!row) continue;
		const value = row.value;
		if (row.accountId !== scope.accountId || row.spaceId !== scope.spaceId || !record(value) || typeof value.markdown !== "string") continue;
		const images = {
			imageBindings: Array.isArray(value.imageBindings) ? value.imageBindings : [],
			imageReceiptKeys: Array.isArray(value.imageReceiptKeys) ? value.imageReceiptKeys : []
		};
		if (value.legacy === null) return {
			baseline: {
				markdown: value.markdown,
				board: null
			},
			known: true,
			checks,
			...images
		};
		if (record(value.legacy) && value.legacy.accountId === scope.accountId && value.legacy.spaceId === scope.spaceId && value.legacy.type === "whiteboard" && value.legacy.documentId === noteBoardId(noteId)) return {
			baseline: {
				markdown: value.markdown,
				board: value.legacy.content
			},
			known: true,
			checks,
			...images
		};
	}
	return {
		baseline: {
			markdown: "",
			board: null
		},
		known: false,
		checks,
		imageBindings: [],
		imageReceiptKeys: []
	};
}
var emptyCommit = (scope) => ({
	target: scope,
	sources: [scope],
	drafts: [],
	blobs: [],
	snapshots: [],
	draftChecks: [],
	blobChecks: [],
	snapshotChecks: []
});
function sourceChecks(commit, scope, noteId, state) {
	commit.draftChecks.push({
		identity: identity(scope, noteId),
		expected: state.paper
	}, {
		identity: {
			...scope,
			type: "whiteboard",
			documentId: noteBoardId(noteId)
		},
		expected: state.board
	}, {
		identity: {
			...scope,
			type: "notesMarkdown",
			documentId: noteId
		},
		expected: state.metadata
	});
	commit.snapshotChecks.push({
		key: paperLegacyReceiptKey(scope, noteId),
		expected: state.receiptRow
	});
	commit.snapshotChecks.push({
		key: paperLegacyOwnerKey(noteId, scope),
		expected: state.ownerRow
	});
	commit.snapshotChecks.push({
		key: notebookDeletionKey(identity(scope, noteId)),
		expected: state.deletionRow
	});
}
var bindingUnion = (...groups) => {
	const values = /* @__PURE__ */ new Map();
	for (const group of groups) for (const binding of group) values.set(binding.rawURL, binding);
	return [...values.values()];
};
async function readImageBindings(scope, noteId, keys, bindings, current) {
	const checks = [], proved = [];
	for (const key of new Set(keys)) {
		if (typeof key !== "string" || !key.startsWith(`paper-legacy-images|${draftKey(identity(scope, noteId))}|`)) throw Error("Le reçu d’image appartient à un autre carnet.");
		const row = await getSnapshot(key);
		check(current);
		const value = row?.value;
		if (!row || row.accountId !== scope.accountId || row.spaceId !== scope.spaceId || !record(value) || value.schema !== 1 || value.kind !== "paper-legacy-image-assets" || value.noteId !== noteId || value.documentId !== notebookDocumentId(noteId) || !Array.isArray(value.mappings)) throw Error("Le reçu de récupération des images est absent ou incompatible.");
		checks.push({
			key,
			expected: row
		});
		proved.push(...value.mappings);
	}
	for (const binding of bindings) {
		const ref = record(binding) && typeof binding.canonicalURL === "string" ? parsePhotoReference(binding.canonicalURL) : null;
		if (!ref || ref.documentId !== notebookDocumentId(noteId) || ref.id !== binding.assetId || typeof binding.rawURL !== "string" || typeof binding.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(binding.sha256) || !record(binding.source) || !["data", "local"].includes(String(binding.source.kind)) || !proved.some((value) => equal(value, binding))) throw Error("Une référence d’image ne possède pas son reçu prouvé.");
	}
	return {
		bindings: [...bindings],
		checks
	};
}
function planningBoard(board, noteId, bindings, assets) {
	if (!record(board) || !Array.isArray(board.photos)) return board;
	const ownTags = /* @__PURE__ */ new Set([
		noteId,
		noteBoardId(noteId),
		notebookDocumentId(noteId),
		legacyNotebookDocumentId(noteId),
		`paper-v3-${noteId}`
	]);
	return {
		...board,
		photos: board.photos.map((photo) => {
			if (!record(photo) || typeof photo.id !== "string") return photo;
			const binding = bindings.find((value) => value.source.kind === "local" && value.source.noteId === noteId && !!value.source.documentId && ownTags.has(value.source.documentId) && value.source.assetId === photo.id);
			if (!binding) return photo;
			const asset = assets.find((value) => value.id === binding.assetId), { serverId, ...raw } = photo;
			return {
				...raw,
				id: binding.assetId,
				...asset ? {
					name: asset.name,
					mediaType: asset.mediaType,
					size: asset.size,
					...asset.serverId ? { serverId: asset.serverId } : {}
				} : {}
			};
		})
	};
}
function mergeCommitChecks(commit, extra) {
	for (const field of [
		"draftChecks",
		"blobChecks",
		"snapshotChecks"
	]) for (const checkRow of extra[field]) {
		const key = field === "snapshotChecks" ? checkRow.key : field === "draftChecks" ? draftKey(checkRow.identity) : `${checkRow.identity.accountId}|${checkRow.identity.spaceId}|${checkRow.identity.id}`;
		const existing = commit[field].find((row) => field === "snapshotChecks" ? row.key === key : field === "draftChecks" ? draftKey(row.identity) === key : `${row.identity.accountId}|${row.identity.spaceId}|${row.identity.id}` === key);
		if (existing && !equal(existing.expected, checkRow.expected)) throw Error("Une source a changé pendant la préparation des images.");
		if (!existing) commit[field].push(checkRow);
	}
	for (const row of extra.blobs) {
		const existing = commit.blobs.find((value) => value.id === row.id);
		if (existing && !equal({
			...existing,
			blob: void 0
		}, {
			...row,
			blob: void 0
		})) throw Error("Deux préparations d’image utilisent la même identité.");
		if (!existing) commit.blobs.push(row);
	}
	for (const row of extra.snapshots) {
		const existing = commit.snapshots.find((value) => value.key === row.key);
		if (existing && !equal(existing, row)) throw Error("Deux reçus d’image utilisent la même identité.");
		if (!existing) commit.snapshots.push(row);
	}
}
/** No writes: optional private downloads stay in memory until the checked graph/file commit. */
async function preflightPaperLegacy(input) {
	const { noteId, current } = input, scope = ownedScope(input.scope);
	if (typeof input.incomingMarkdown !== "string") throw Error("Le texte reçu est incompatible.");
	const state = await readState(scope, noteId, current);
	check(current);
	if (input.metadataAuthority === "indexeddb" && state.metadata && metadataMarkdown(state.metadata) !== input.incomingMarkdown) throw Error("Le texte de la note a changé avant sa réconciliation.");
	const migration = await migrationBaseline(scope, noteId, current);
	check(current);
	const board = state.board?.content ?? state.receipt?.observed.board ?? migration.baseline.board;
	const echo = state.receipt?.mirror?.desiredMarkdown === input.incomingMarkdown;
	const observed = state.receipt ? {
		...state.receipt.observed,
		...echo ? { markdown: input.incomingMarkdown } : {}
	} : void 0;
	const now = input.now ?? (/* @__PURE__ */ new Date()).toISOString();
	const commit = emptyCommit(scope);
	sourceChecks(commit, scope, noteId, state);
	commit.snapshotChecks.push(...migration.checks);
	const receiptKeys = [.../* @__PURE__ */ new Set([...migration.imageReceiptKeys, ...state.receipt?.imageReceiptKeys ?? []])];
	const catalog = await readImageBindings(scope, noteId, receiptKeys, bindingUnion(migration.imageBindings, state.receipt?.imageBindings ?? []), current);
	commit.snapshotChecks.push(...catalog.checks);
	const imagePlan = scanLegacyPaperImages(input.incomingMarkdown).images.some((image) => image.kind === "photo" || image.kind === "data" || image.kind === "invalid-photo" || image.url.startsWith("data:")) ? await prepareLegacyImageAssets({
		noteId,
		markdown: input.incomingMarkdown,
		scope,
		current,
		targetDocument: state.paper.content,
		expectedTarget: state.paper,
		existingBindings: catalog.bindings,
		bindingReceiptKeys: receiptKeys,
		downloadOriginal: input.downloadOriginal,
		now,
		newId: input.newId
	}) : void 0;
	check(current);
	if (imagePlan) mergeCommitChecks(commit, imagePlan);
	const incomingBindings = bindingUnion(catalog.bindings, imagePlan?.mappings ?? []), historicalBindings = bindingUnion(imagePlan?.mappings ?? [], catalog.bindings);
	const rawCurrent = state.paper.content, assets = [...rawCurrent.assets];
	for (const asset of imagePlan?.assets ?? []) {
		const index = assets.findIndex((value) => value.id === asset.id);
		if (index < 0) assets.push(asset);
		else if (!equal(assets[index], asset)) assets[index] = asset;
	}
	const normalisedCurrent = {
		...rawCurrent,
		assets,
		objects: rawCurrent.objects.map((object) => object.markdown === void 0 ? object : {
			...object,
			markdown: rewriteLegacyImageBindings(object.markdown, historicalBindings)
		})
	};
	const normalise = (observation, bindings) => ({
		markdown: rewriteLegacyImageBindings(observation.markdown, bindings),
		board: planningBoard(observation.board, noteId, bindings, assets)
	});
	const incoming = {
		markdown: imagePlan?.markdown ?? rewriteLegacyImageBindings(input.incomingMarkdown, incomingBindings),
		board: planningBoard(board, noteId, incomingBindings, assets)
	}, baseline = normalise(migration.baseline, historicalBindings), normalisedObserved = observed ? normalise(observed, historicalBindings) : void 0;
	let equivalent = false;
	try {
		equivalent = paperMarkdown(normalisedCurrent) === incoming.markdown;
	} catch {}
	const plan = planPaperLegacyReconcile(normalisedCurrent, {
		...incoming,
		baseline,
		baselineKnown: migration.known,
		observed: normalisedObserved,
		currentMarkdownEquivalent: equivalent,
		now,
		newId: input.newId
	});
	let preparedDocument = plan.document;
	const changed = !equal({
		pages: rawCurrent.pages,
		objects: rawCurrent.objects,
		assets: rawCurrent.assets,
		audio: rawCurrent.audio,
		study: rawCurrent.study
	}, {
		pages: preparedDocument.pages,
		objects: preparedDocument.objects,
		assets: preparedDocument.assets,
		audio: preparedDocument.audio,
		study: preparedDocument.study
	});
	if (changed && preparedDocument.revision === rawCurrent.revision) preparedDocument = {
		...preparedDocument,
		revision: rawCurrent.revision + 1,
		updatedAt: now
	};
	const local = await listLocalBlobs(scope.accountId, scope.spaceId);
	check(current);
	const prepared = /* @__PURE__ */ new Map();
	for (const file of input.preparedFiles ?? []) {
		if (file.accountId !== scope.accountId || file.spaceId !== scope.spaceId) throw Error("Un fichier appartient à un autre compte ou à une autre année.");
		if (prepared.has(file.id)) throw Error("Deux fichiers préparés utilisent la même identité.");
		prepared.set(file.id, file);
	}
	for (const file of imagePlan?.blobs ?? []) {
		if (prepared.has(file.id)) throw Error("Une image reçue utilise déjà l’identité d’un autre original.");
		prepared.set(file.id, file);
	}
	const mappings = legacyPaperPhotoIdentities(noteId, board), checkedFiles = /* @__PURE__ */ new Set();
	const ownedFileDocuments = /* @__PURE__ */ new Set([
		noteId,
		noteBoardId(noteId),
		notebookDocumentId(noteId),
		legacyNotebookDocumentId(noteId),
		`paper-v3-${noteId}`
	]);
	const proveFile = (file, asset) => {
		const alreadyOwned = state.paper.content.assets.some((old) => old.id === asset.id);
		const explicit = mappings.some((mapping) => mapping.assetId === asset.id && (mapping.sourceId === file.id || mapping.assetId === file.id));
		if (!alreadyOwned && (file.documentId ? !ownedFileDocuments.has(file.documentId) : !explicit)) throw Error("Un fichier local ne possède pas une référence prouvée dans cette note. Son original reste conservé.");
		if (!alreadyOwned && !file.documentId && file.removedFromNote) throw Error("Un fichier conservé sans note propriétaire ne peut pas être réactivé automatiquement. Son original reste conservé.");
		if (asset.serverId && file.serverId !== asset.serverId) throw Error("Les octets locaux ne correspondent pas à la version serveur reçue. Son original doit être retrouvé avant de continuer.");
	};
	const checkFile = (id, file) => {
		if (!checkedFiles.has(id)) {
			checkedFiles.add(id);
			commit.blobChecks.push({
				identity: {
					...scope,
					id
				},
				expected: file
			});
		}
	};
	for (const asset of preparedDocument.assets) {
		const existing = local.find((file) => file.id === asset.id);
		let candidate = prepared.get(asset.id);
		checkFile(asset.id, existing);
		if (existing) proveFile(existing, asset);
		if (!existing && !candidate) {
			const mapping = mappings.find((row) => row.assetId === asset.id), original = mapping && local.find((file) => file.id === mapping.sourceId);
			if (mapping && original) {
				if (new Set(mappings.filter((row) => row.sourceId === mapping.sourceId).map((row) => row.assetId)).size > 1 && !original.serverId) throw Error("Un ancien fichier possède plusieurs versions impossibles à distinguer localement. Ses originaux restent conservés.");
				if (!asset.serverId || !original.serverId || asset.serverId === original.serverId) {
					checkFile(original.id, original);
					candidate = {
						...original,
						id: asset.id
					};
				}
			}
		}
		if (candidate) {
			const sha = await localBlobDigest(candidate.blob);
			check(current);
			if (existing) {
				const oldSha = existing.sha256 ?? await localBlobDigest(existing.blob);
				check(current);
				if (oldSha !== sha) throw Error(`Le fichier « ${asset.name} » possède déjà un autre original. Aucun fichier n’est remplacé.`);
			}
			proveFile(candidate, asset);
			if (asset.serverId && candidate.serverId && asset.serverId !== candidate.serverId) throw Error("Le fichier préparé ne correspond pas à la photo reçue.");
			if (!existing && !commit.blobs.some((file) => file.id === candidate.id)) commit.blobs.push({
				id: candidate.id,
				...scope,
				blob: candidate.blob,
				name: candidate.name,
				createdAt: candidate.createdAt,
				status: candidate.status,
				...candidate.serverId ? { serverId: candidate.serverId } : {},
				documentId: identity(scope, noteId).documentId,
				sha256: sha,
				revision: 1,
				removedFromNote: false
			});
		} else if (!existing && !asset.serverId) throw Error(`Le fichier « ${asset.name} » doit être retrouvé avant la réconciliation. La note reste conservée.`);
		const bytes = existing?.blob ?? candidate?.blob;
		if (bytes && !state.paper.content.assets.some((old) => old.id === asset.id)) preparedDocument = {
			...preparedDocument,
			assets: preparedDocument.assets.map((row) => row.id === asset.id ? {
				...row,
				size: bytes.size,
				mediaType: bytes.type || row.mediaType
			} : row)
		};
	}
	const content = changed ? amendPaperCollaboration(state.paper.content, preparedDocument) : state.paper.content;
	const draft = changed ? {
		...state.paper,
		content,
		updatedAt: Date.now(),
		syncState: "local"
	} : state.paper;
	const metadata = state.metadata && state.metadata.paperDependency !== draft.documentId ? {
		...state.metadata,
		paperDependency: draft.documentId,
		syncState: "local"
	} : state.metadata;
	if (metadata && metadata !== state.metadata) commit.drafts.push(metadata);
	const nextReceiptKeys = [.../* @__PURE__ */ new Set([...receiptKeys, ...imagePlan ? [imagePlan.receiptRow.key] : []])];
	const receipt = {
		schema: 1,
		kind: "paper-legacy-observation",
		noteId,
		documentId: identity(scope, noteId).documentId,
		observed: {
			markdown: input.incomingMarkdown,
			board: structuredClone(board)
		},
		baselineKnown: !!state.receipt || migration.known,
		paperRevision: content.revision,
		observedAt: now,
		sourceMetadata: metadata ?? null,
		sourceBoard: state.board ?? null,
		...state.receipt?.mirror ? { mirror: state.receipt.mirror } : {},
		...nextReceiptKeys.length ? {
			imageBindings: incomingBindings,
			imageReceiptKeys: nextReceiptKeys
		} : {}
	};
	const receiptRow = {
		key: paperLegacyReceiptKey(scope, noteId),
		...scope,
		value: receipt
	};
	commit.snapshots.push(receiptRow);
	if (state.board && !state.ownerRow && !commit.snapshots.some((row) => row.key === paperLegacyOwnerKey(noteId, scope))) commit.snapshots.push({
		key: paperLegacyOwnerKey(noteId, scope),
		...scope,
		value: {
			schema: 1,
			noteId,
			documentId: draft.documentId,
			boardId: noteBoardId(noteId),
			claimedAt: now
		}
	});
	if (changed) commit.drafts.push(draft);
	if (changed || !state.receipt || !equal(state.receipt.observed, receipt.observed)) {
		const recovery = {
			key: `paper-legacy-recovery|${draftKey(identity(scope, noteId))}|${crypto.randomUUID()}`,
			...scope,
			value: {
				schema: 1,
				noteId,
				at: now,
				beforePaper: state.paper,
				incoming: {
					markdown: input.incomingMarkdown,
					board: structuredClone(board)
				},
				sourceMetadata: state.metadata ?? null,
				sourceBoard: state.board ?? null,
				baseline: migration.known ? migration.baseline : null,
				previousReceipt: state.receiptRow ?? null,
				fileIds: content.assets.map((asset) => asset.id)
			}
		};
		commit.snapshots.push(recovery);
		commit.snapshotChecks.push({
			key: recovery.key,
			expected: void 0
		});
	}
	check(current);
	return {
		noteId,
		scope,
		expectedPaper: state.paper,
		draft,
		receipt,
		receiptRow,
		commit,
		changed,
		recovered: plan.recovered,
		notices: [...plan.notices, ...imagePlan?.notices ?? []]
	};
}
async function commitPaperLegacyPreflight(plan, current) {
	check(current);
	await commitNotebookTransfer(plan.commit, current);
	check(current);
	return {
		draft: plan.draft,
		receipt: plan.receipt,
		changed: plan.changed,
		recovered: plan.recovered,
		notices: plan.notices
	};
}
async function reconcilePaperLegacy(input) {
	const plan = await preflightPaperLegacy(input);
	check(input.current);
	return commitPaperLegacyPreflight(plan, input.current);
}
/** Persist intent before the native conditional metadata setter runs. */
async function stagePaperLegacyMirror(input) {
	const { noteId, current } = input, scope = ownedScope(input.scope), state = await readState(scope, noteId, current);
	check(current);
	if (!state.receipt || state.receipt.observed.markdown !== input.expectedMarkdown) throw Error("Les apports précédents doivent être conservés avant de publier le miroir.");
	if (!equal(state.board?.content ?? state.receipt.observed.board, state.receipt.observed.board)) throw Error("Un nouveau dessin doit être réconcilié avant de publier le texte.");
	if (input.metadataAuthority === "indexeddb" && state.metadata && metadataMarkdown(state.metadata) !== input.expectedMarkdown) throw Error("Les métadonnées ont changé avant la publication du miroir.");
	if (paperMarkdown(state.paper.content) !== input.desiredMarkdown) throw Error("Le texte à publier ne correspond plus aux pages conservées.");
	const previous = state.receipt.mirror, mirror = previous?.status === "staged" && previous.expectedMarkdown === input.expectedMarkdown && previous.desiredMarkdown === input.desiredMarkdown && previous.paperRevision === state.paper.content.revision ? previous : {
		id: crypto.randomUUID(),
		status: "staged",
		expectedMarkdown: input.expectedMarkdown,
		desiredMarkdown: input.desiredMarkdown,
		paperRevision: state.paper.content.revision,
		stagedAt: input.now ?? (/* @__PURE__ */ new Date()).toISOString()
	};
	const receipt = {
		...state.receipt,
		mirror
	}, receiptRow = {
		key: paperLegacyReceiptKey(scope, noteId),
		...scope,
		value: receipt
	}, commit = emptyCommit(scope);
	sourceChecks(commit, scope, noteId, state);
	commit.snapshots.push(receiptRow);
	await commitNotebookTransfer(commit, current);
	check(current);
	return {
		noteId,
		scope,
		paper: state.paper,
		metadata: state.metadata,
		board: state.board,
		receipt,
		receiptRow,
		expectedMarkdown: input.expectedMarkdown,
		desiredMarkdown: input.desiredMarkdown
	};
}
/** Complete only after the caller confirms its scoped durable conditional write. */
async function publishPaperLegacyMirror(ticket, input) {
	const { current } = input;
	check(current);
	if (input.confirmedMarkdown !== ticket.desiredMarkdown) throw Error("Le miroir n’est pas confirmé dans la source courante.");
	const state = await readState(ticket.scope, ticket.noteId, current);
	check(current);
	if (!state.receipt || !equal(state.receiptRow, ticket.receiptRow) || !equal(state.paper.content, ticket.paper.content) || !equal(state.board?.content, ticket.board?.content)) throw Error("Le graphe ou ses apports ont changé pendant la publication du miroir.");
	const mirror = state.receipt.mirror;
	if (!mirror || mirror.status !== "staged" || mirror.id !== ticket.receipt.mirror?.id) throw Error("Cette publication ne possède plus son reçu.");
	const now = input.now ?? (/* @__PURE__ */ new Date()).toISOString(), receipt = {
		...state.receipt,
		observed: {
			...state.receipt.observed,
			markdown: ticket.desiredMarkdown
		},
		mirror: {
			...mirror,
			status: "published",
			publishedAt: now
		},
		observedAt: now,
		sourceBoard: state.board ?? null
	}, receiptRow = {
		key: paperLegacyReceiptKey(ticket.scope, ticket.noteId),
		...ticket.scope,
		value: receipt
	}, commit = emptyCommit(ticket.scope);
	sourceChecks(commit, ticket.scope, ticket.noteId, state);
	if (input.metadataDraft) {
		const wanted = input.metadataDraft;
		if (wanted.accountId !== ticket.scope.accountId || wanted.spaceId !== ticket.scope.spaceId || wanted.type !== "notesMarkdown" || wanted.documentId !== ticket.noteId || metadataMarkdown(wanted) !== ticket.desiredMarkdown) throw Error("La publication des métadonnées sort du carnet courant.");
		if (!state.metadata || metadataMarkdown(state.metadata) !== ticket.expectedMarkdown && !equal(state.metadata, wanted)) throw Error("Le texte courant a été modifié avant son miroir.");
		const metadata = {
			...state.metadata,
			content: {
				...state.metadata.content,
				markdown: ticket.desiredMarkdown,
				updatedAt: now
			},
			updatedAt: Date.now(),
			syncState: "local",
			paperDependency: ticket.paper.documentId
		};
		commit.drafts.push(metadata);
		receipt.sourceMetadata = metadata;
	} else if (state.metadata && !equal(state.metadata, ticket.metadata)) {
		if (metadataMarkdown(state.metadata) !== ticket.desiredMarkdown && metadataMarkdown(state.metadata) !== ticket.expectedMarkdown) throw Error("Un nouveau texte a été reçu pendant la publication du miroir.");
		receipt.sourceMetadata = state.metadata;
	}
	if (state.metadata && !commit.drafts.length && state.metadata.paperDependency !== ticket.paper.documentId) {
		const metadata = {
			...state.metadata,
			paperDependency: ticket.paper.documentId,
			syncState: "local"
		};
		commit.drafts.push(metadata);
		receipt.sourceMetadata = metadata;
	}
	commit.snapshots.push(receiptRow);
	await commitNotebookTransfer(commit, current);
	check(current);
	return {
		receipt,
		receiptRow,
		draft: state.paper
	};
}
//#endregion
export { publishPaperLegacyMirror, reconcilePaperLegacy, stagePaperLegacyMirror };
