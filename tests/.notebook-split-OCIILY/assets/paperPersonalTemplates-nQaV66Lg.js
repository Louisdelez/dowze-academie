import { E as readNotebookDeletionStatus, _ as localBlobDigest, c as commitNotebookTransfer, d as getDraft, f as getSnapshot, m as listLocalBlobs, v as notebookDeletionKey } from "./storage-BJWvsK9s.js";
import { C as notebookIdentityDigest, E as noteBoardId, O as photoReference, S as notebookDocumentId, _ as decodeLegacyRasterDataUrl, a as isPaperDocument, t as applyPaperCommand, v as planLegacyPaperImageRewrite, x as legacyNotebookDocumentId, y as scanLegacyPaperImages } from "./notebookDocument-C3DZiTlV.js";
import { t as paperObjectsOnPage } from "./paperTextFlow-T0_iEUZW.js";
import { t as amendPaperCollaboration } from "./paperCollaboration-Bn5VQMUP.js";
import { c as copiedPageText, i as verifyPaperArchiveBlob, k as readPaperAsset, r as appendPaperArchive } from "../split.mjs";
import { Zip, ZipDeflate, ZipPassThrough } from "fflate";
//#region src/lib/paperPersonalTemplates.ts
var MAGIC = "DOWZE-PERSONAL-TEMPLATE/1\n";
var HEADER_LENGTH = 100;
var MAX_DESCRIPTOR = 65536;
var record = (value) => !!value && typeof value === "object" && !Array.isArray(value);
var safeId = (value) => typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{0,126}$/.test(value) && !value.includes("..");
var date = (value) => typeof value === "string" && Number.isFinite(Date.parse(value));
var digest = (value) => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
var modes = [
	"paper",
	"background",
	"content"
];
var same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
var pick = (value, keys) => Object.fromEntries(keys.filter((key) => Object.hasOwn(value, key)).map((key) => [key, structuredClone(value[key])]));
var check = (current) => {
	if (!current()) throw Error("Le carnet ou le compte a changé. Les modèles et leurs sources restent conservés.");
};
var scopeOf = (scope) => {
	if (typeof scope.accountId !== "string" || !scope.accountId || typeof scope.spaceId !== "string" || !scope.spaceId) throw Error("Choisissez un compte et un espace pour les modèles.");
	return {
		accountId: scope.accountId,
		spaceId: scope.spaceId
	};
};
var text = (value, label, optional = false) => {
	if (optional && value === void 0) return void 0;
	if (typeof value !== "string" || !value.trim() || value.trim().length > 120) throw Error(`${label} doit contenir entre 1 et 120 caractères.`);
	return value.trim();
};
var keyBase = (scope) => `paper-personal-templates|v1|${notebookIdentityDigest(JSON.stringify([scope.accountId, scope.spaceId]))}`;
var personalPaperTemplateLibraryKey = (scope) => `${keyBase(scopeOf(scope))}|library`;
var personalPaperTemplateKey = (scope, id, version) => {
	if (!safeId(id) || !Number.isSafeInteger(version) || version < 1) throw Error("Identité de modèle incompatible.");
	return `${keyBase(scopeOf(scope))}|${id}|${version}`;
};
var ownerId = (id, version) => `paper-template-${id}-v${version}`;
var validFile = (value) => record(value) && safeId(value.assetId) && Number.isSafeInteger(value.size) && Number(value.size) > 0 && Number(value.size) <= 268435456 && digest(value.sha256);
function isPersonalPaperTemplate(value) {
	if (!record(value) || Object.keys(value).some((key) => ![
		"schema",
		"kind",
		"id",
		"version",
		"name",
		"author",
		"mode",
		"includeAudio",
		"createdAt",
		"updatedAt",
		"pageCount",
		"objectCount",
		"assetCount",
		"archive",
		"source"
	].includes(key)) || !record(value.source)) return false;
	const source = value.source;
	if (!isPaperDocument(source.document)) return false;
	const document = source.document;
	return value.schema === 1 && value.kind === "paper-personal-template" && safeId(value.id) && Number.isSafeInteger(value.version) && Number(value.version) > 0 && typeof value.name === "string" && value.name.trim() === value.name && value.name.length > 0 && value.name.length <= 120 && (value.author === void 0 || typeof value.author === "string" && value.author.trim() === value.author && value.author.length > 0 && value.author.length <= 120) && modes.includes(value.mode) && typeof value.includeAudio === "boolean" && (!value.includeAudio || value.mode === "content") && date(value.createdAt) && date(value.updatedAt) && Number.isSafeInteger(value.pageCount) && Number(value.pageCount) > 0 && Number(value.pageCount) <= 2e3 && Number.isSafeInteger(value.objectCount) && Number(value.objectCount) >= 0 && Number.isSafeInteger(value.assetCount) && Number(value.assetCount) >= 0 && validFile(value.archive) && Object.keys(source).every((key) => [
		"kind",
		"noteId",
		"revision",
		"document",
		"pageIds",
		"documentSha256",
		"sourceName",
		"originalArchive",
		"templateId",
		"templateVersion"
	].includes(key)) && ["document", "archive"].includes(String(source.kind)) && document.noteId === source.noteId && Number.isSafeInteger(source.revision) && source.revision === document.revision && Array.isArray(source.pageIds) && source.pageIds.length === value.pageCount && new Set(source.pageIds).size === source.pageIds.length && source.pageIds.every((id) => document.pages.some((page) => page.id === id)) && digest(source.documentSha256) && (source.sourceName === void 0 || typeof source.sourceName === "string" && source.sourceName.length <= 500) && (source.originalArchive === void 0 || validFile(source.originalArchive)) && (source.templateId === void 0 || safeId(source.templateId)) && (source.templateVersion === void 0 || Number.isSafeInteger(source.templateVersion) && Number(source.templateVersion) > 0);
}
function validIndex(value, scope) {
	return record(value) && Object.keys(value).every((key) => [
		"schema",
		"kind",
		"accountId",
		"spaceId",
		"revision",
		"updatedAt",
		"entries"
	].includes(key)) && value.schema === 1 && value.kind === "paper-personal-template-library" && value.accountId === scope.accountId && value.spaceId === scope.spaceId && Number.isSafeInteger(value.revision) && Number(value.revision) >= 0 && date(value.updatedAt) && Array.isArray(value.entries) && value.entries.length <= 1e3 && value.entries.every((entry) => record(entry) && safeId(entry.id) && Number.isSafeInteger(entry.version) && Number(entry.version) > 0 && (entry.removedAt === void 0 || date(entry.removedAt))) && new Set(value.entries.map((entry) => entry.id)).size === value.entries.length;
}
var ownedRow = (row, scope, key) => {
	if (row && (row.key !== key || row.accountId !== scope.accountId || row.spaceId !== scope.spaceId)) throw Error("Ce modèle appartient à un autre compte ou à un autre espace. Aucun original n’est remplacé.");
};
async function loadPaperPersonalTemplates(scope, current = () => true) {
	const clean = scopeOf(scope);
	check(current);
	const key = personalPaperTemplateLibraryKey(clean), indexRow = await getSnapshot(key);
	check(current);
	ownedRow(indexRow, clean, key);
	if (indexRow && !validIndex(indexRow.value, clean)) throw Error("La bibliothèque de modèles doit être récupérée. Son original reste conservé.");
	const index = indexRow?.value ?? {
		schema: 1,
		kind: "paper-personal-template-library",
		...clean,
		revision: 0,
		updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
		entries: []
	};
	const entries = index.entries.filter((entry) => !entry.removedAt), rows = await Promise.all(entries.map((entry) => getSnapshot(personalPaperTemplateKey(clean, entry.id, entry.version))));
	check(current);
	const templates = rows.map((row, i) => {
		const entry = entries[i], expected = personalPaperTemplateKey(clean, entry.id, entry.version);
		ownedRow(row, clean, expected);
		if (!row || !isPersonalPaperTemplate(row.value) || row.value.id !== entry.id || row.value.version !== entry.version) throw Error("Une version de modèle manque dans sa bibliothèque. Les sources restent conservées.");
		return row.value;
	});
	return {
		scope: clean,
		index: structuredClone(index),
		...indexRow ? { indexRow } : {},
		templates: templates.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
	};
}
function selectedPayload(source, pageIds, mode, includeAudio, now) {
	if (!isPaperDocument(source) || !modes.includes(mode) || includeAudio && mode !== "content") throw Error("Le contenu ou le mode du modèle est incompatible.");
	const selected = new Set(pageIds ?? source.pages.map((page) => page.id));
	if (!selected.size || selected.size !== (pageIds?.length ?? selected.size) || [...selected].some((id) => !source.pages.some((page) => page.id === id))) throw Error("Choisissez des pages distinctes de cette note.");
	const pages = source.pages.filter((page) => selected.has(page.id)).map((page) => {
		const { flowRootId, pdf, ...paper } = pick(page, [
			"id",
			"width",
			"height",
			"pattern",
			"color",
			"bookmark",
			"rotation",
			"template",
			"spacing",
			"pdf"
		]);
		return {
			...paper,
			bookmark: false,
			...mode !== "paper" && pdf ? { pdf: pick(pdf, [
				"assetId",
				"pageNumber",
				"text"
			]) } : {}
		};
	});
	const objects = [];
	const copiedObject = (object) => {
		if ([object.color, object.markdown].some((value) => value !== void 0 && typeof value !== "string") || object.strokeWidth !== void 0 && (typeof object.strokeWidth !== "number" || !Number.isFinite(object.strokeWidth)) || object.pen !== void 0 && ![
			"pen",
			"pencil",
			"highlighter",
			"calligraphy"
		].includes(object.pen) || object.shape !== void 0 && ![
			"rectangle",
			"ellipse",
			"line",
			"arrow"
		].includes(object.shape) || object.audioAnchor !== void 0 && !record(object.audioAnchor) || object.points !== void 0 && (!Array.isArray(object.points) || object.points.some((point) => !record(point) || [
			point.x,
			point.y,
			point.time
		].some((value) => typeof value !== "number" || !Number.isFinite(value)) || [
			point.pressure,
			point.tiltX,
			point.tiltY,
			point.twist,
			point.nibAngle
		].some((value) => value !== void 0 && (typeof value !== "number" || !Number.isFinite(value))) || point.pressure !== void 0 && (point.pressure < 0 || point.pressure > 1)))) throw Error("Un élément comporte des réglages incompatibles. Son original reste conservé dans la note.");
		return {
			...pick(object, [
				"id",
				"pageId",
				"kind",
				"x",
				"y",
				"width",
				"height",
				"rotation",
				"z",
				"locked",
				"textPartition",
				"groupId",
				"markdown",
				"color",
				"strokeWidth",
				"opacity",
				"pen",
				"strokeStyle",
				"mirrorX",
				"mirrorY",
				"nibAngle",
				"shape",
				"assetId",
				"createdAt"
			]),
			...object.textFlow ? { textFlow: pick(object.textFlow, [
				"schema",
				"pageIds",
				"breaks",
				"source",
				"sourceOffsets"
			]) } : {},
			...object.points ? { points: object.points.map((point) => pick(point, [
				"x",
				"y",
				"time",
				"pressure",
				"tiltX",
				"tiltY",
				"twist",
				"nibAngle"
			])) } : {},
			...object.audioAnchor ? { audioAnchor: pick(object.audioAnchor, ["sessionId", "time"]) } : {}
		};
	};
	if (mode === "content") for (const page of pages) for (const original of paperObjectsOnPage(source, page.id)) {
		if (original.textFlow?.pageIds.every((id) => selected.has(id))) {
			if (objects.some((object) => object.id === original.id)) continue;
			objects.push(copiedObject(original));
			continue;
		}
		const { audioAnchor, textFlow, ...copy } = copiedObject(original);
		objects.push({
			...copy,
			pageId: page.id,
			...textFlow ? {
				id: `template-part-${notebookIdentityDigest(JSON.stringify([original.id, page.id]))}`,
				markdown: copiedPageText(original, page.id),
				height: Math.max(100, page.height - original.y)
			} : {},
			...includeAudio && audioAnchor ? { audioAnchor } : {}
		});
	}
	if (!includeAudio) for (const object of objects) delete object.audioAnchor;
	for (const page of pages) {
		const root = objects.find((object) => object.textFlow?.pageIds.includes(page.id));
		if (root) page.flowRootId = root.id;
	}
	const audioSource = (value) => ({
		...pick(value, [
			"schema",
			"mediaType",
			"size",
			"originalName"
		]),
		chunks: value.chunks.map((chunk) => pick(chunk, [
			"assetId",
			"size",
			"sha256"
		]))
	});
	const audio = includeAudio ? source.audio.map((track) => ({
		...pick(track, [
			"id",
			"assetId",
			"name",
			"duration",
			"startedAt",
			"inProgress"
		]),
		...track.source ? { source: audioSource(track.source) } : {},
		...track.segments ? { segments: track.segments.map((part) => ({
			...pick(part, [
				"assetId",
				"offset",
				"duration"
			]),
			...part.source ? { source: audioSource(part.source) } : {}
		})) } : {}
	})) : [];
	if (audio.some((track) => track.inProgress)) throw Error("Terminez l’enregistrement avant de l’inclure dans un modèle.");
	const assets = new Set(pages.flatMap((page) => page.pdf ? [page.pdf.assetId] : []));
	for (const object of objects) {
		if (object.assetId) assets.add(object.assetId);
		if (object.markdown) {
			const scan = scanLegacyPaperImages(object.markdown);
			for (const image of scan.images) {
				if (image.kind === "invalid-photo") throw Error("Une image de cette page doit être récupérée avant la création du modèle.");
				if (image.kind === "photo") {
					if (!(/* @__PURE__ */ new Set([
						notebookDocumentId(source.noteId),
						legacyNotebookDocumentId(source.noteId),
						...source.legacy.boardId === noteBoardId(source.noteId) ? [source.legacy.boardId] : []
					])).has(image.photo.documentId) || !source.assets.some((asset) => asset.id === image.photo.id)) throw Error("Une image appartient à une autre note. Associez son original à cette note avant de créer le modèle.");
					assets.add(image.photo.id);
				}
				if (image.kind === "data") decodeLegacyRasterDataUrl(image.url);
			}
		}
	}
	for (const track of audio) {
		assets.add(track.assetId);
		for (const part of track.segments ?? []) {
			assets.add(part.assetId);
			for (const chunk of part.source?.chunks ?? []) assets.add(chunk.assetId);
		}
		for (const chunk of track.source?.chunks ?? []) assets.add(chunk.assetId);
	}
	const document = {
		notebookSchema: 3,
		noteId: source.noteId,
		revision: 0,
		updatedAt: now,
		pages,
		objects,
		assets: source.assets.filter((asset) => assets.has(asset.id)).map((asset) => pick(asset, [
			"id",
			"name",
			"mediaType",
			"size"
		])),
		audio,
		legacy: {
			markdown: "",
			boardId: source.legacy.boardId,
			migratedAt: now
		}
	};
	if (!isPaperDocument(document)) throw Error("Les pages sélectionnées nécessitent une disposition supplémentaire. Leur original reste conservé.");
	return document;
}
async function zipFiles(files, current) {
	let produced = 0, finished = false;
	const pieces = [], zip = new Zip((error, bytes, final) => {
		check(current);
		if (error) throw error;
		produced += bytes.length;
		if (produced > 268435456) throw Error("Le modèle portable dépasse 256 Mo.");
		if (bytes.length) pieces.push(new Blob([bytes]));
		if (final) finished = true;
	});
	try {
		for (const [name, blob] of Object.entries(files)) {
			check(current);
			const stream = name.startsWith("assets/") ? new ZipPassThrough(name) : new ZipDeflate(name, { level: 3 });
			zip.add(stream);
			if (!blob.size) stream.push(/* @__PURE__ */ new Uint8Array(), true);
			for (let offset = 0; offset < blob.size; offset += 65536) {
				check(current);
				const end = Math.min(blob.size, offset + 65536);
				stream.push(new Uint8Array(await blob.slice(offset, end).arrayBuffer()), end === blob.size);
				if (offset % 1048576 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
			}
		}
		zip.end();
		if (!finished) throw Error("Le modèle portable n’a pas pu être finalisé.");
		return new Blob(pieces, { type: "application/zip" });
	} finally {
		zip.terminate();
	}
}
async function payloadArchive(document, files, current) {
	const members = Object.create(null), assetPaths = Object.create(null);
	members["document.json"] = new Blob([JSON.stringify(document)]);
	let total = members["document.json"].size;
	for (const asset of document.assets) {
		const file = files[asset.id];
		if (!file || asset.size !== file.size) throw Error(`L’original « ${asset.name} » manque ou a changé.`);
		const path = `assets/${notebookIdentityDigest(asset.id)}`;
		assetPaths[asset.id] = path;
		members[path] = file;
		total += file.size;
	}
	const integrity = {
		schema: 1,
		assetPaths,
		files: Object.create(null)
	};
	for (const [name, file] of Object.entries(members)) {
		check(current);
		if (file.size > 16777216 || total > 268435456) throw Error("Un élément du modèle dépasse la taille prise en charge.");
		integrity.files[name] = {
			size: file.size,
			sha256: await localBlobDigest(file)
		};
		check(current);
	}
	members["integrity.json"] = new Blob([JSON.stringify(integrity)]);
	if (total + members["integrity.json"].size > 268435456) throw Error("Le modèle dépasse 256 Mo.");
	return zipFiles(members, current);
}
async function sourceProof(document, scope, current) {
	check(current);
	if (!isPaperDocument(document)) throw Error("Le document de cette note est incompatible.");
	const identity = {
		...scope,
		type: "whiteboard",
		documentId: notebookDocumentId(document.noteId)
	}, draft = await getDraft(identity);
	check(current);
	if (!draft || draft.accountId !== scope.accountId || draft.spaceId !== scope.spaceId || draft.type !== "whiteboard" || draft.documentId !== identity.documentId || draft.identityAlias || draft.staged || draft.syncState === "conflict" || !isPaperDocument(draft.content) || draft.content.noteId !== document.noteId || !same(draft.content, document)) throw Error("La note a changé ou attend son enregistrement. Reprenez le modèle depuis sa version conservée.");
	if (await readNotebookDeletionStatus(document.noteId, scope, current)) throw Error("Cette note a été supprimée. Son original n’est pas réutilisé automatiquement.");
	const key = notebookDeletionKey(identity), deletion = await getSnapshot(key);
	check(current);
	if (deletion) throw Error("La suppression de cette note doit être réexaminée.");
	return {
		draft,
		identity,
		deletionKey: key
	};
}
async function persistTemplate(input) {
	const { current } = input, scope = scopeOf(input.media);
	check(current);
	const library = await loadPaperPersonalTemplates(scope, current);
	if (library.index.entries.filter((entry) => !entry.removedAt).length >= 1e3) throw Error("La bibliothèque peut contenir au maximum 1000 modèles actifs.");
	const allocate = input.newId ?? (() => crypto.randomUUID()), id = allocate(), assetId = allocate(), sourceAssetId = input.originalArchive ? allocate() : void 0;
	if (![
		id,
		assetId,
		...sourceAssetId ? [sourceAssetId] : []
	].every(safeId) || new Set([
		id,
		assetId,
		sourceAssetId
	].filter(Boolean)).size !== (sourceAssetId ? 3 : 2) || library.index.entries.some((entry) => entry.id === id)) throw Error("Le modèle nécessite des identités nouvelles et distinctes.");
	const files = await listLocalBlobs(scope.accountId, scope.spaceId);
	check(current);
	if (files.some((file) => file.id === assetId || file.id === sourceAssetId)) throw Error("Une pièce jointe utilise déjà cette identité. Aucun original n’est remplacé.");
	const sha256 = await localBlobDigest(input.archive), originalSha = input.originalArchive ? await localBlobDigest(input.originalArchive) : void 0;
	check(current);
	const archive = {
		assetId,
		size: input.archive.size,
		sha256
	}, originalArchive = input.originalArchive && sourceAssetId ? {
		assetId: sourceAssetId,
		size: input.originalArchive.size,
		sha256: originalSha
	} : void 0;
	const template = {
		schema: 1,
		kind: "paper-personal-template",
		id,
		version: 1,
		name: text(input.name, "Le nom du modèle"),
		...input.author ? { author: text(input.author, "L’auteur", true) } : {},
		mode: input.mode,
		includeAudio: input.includeAudio,
		createdAt: input.now,
		updatedAt: input.now,
		pageCount: input.payload.pages.length,
		objectCount: input.payload.objects.length,
		assetCount: input.payload.assets.length,
		archive,
		source: {
			...input.source,
			...originalArchive ? { originalArchive } : {}
		}
	};
	if (!isPersonalPaperTemplate(template)) throw Error("Le modèle ou sa provenance est incompatible.");
	const rowKey = personalPaperTemplateKey(scope, id, 1), existing = await getSnapshot(rowKey);
	check(current);
	if (existing) throw Error("Cette identité de modèle existe déjà.");
	const index = {
		...library.index,
		revision: library.index.revision + 1,
		updatedAt: input.now,
		entries: [...library.index.entries.filter((entry) => !entry.removedAt), {
			id,
			version: 1
		}]
	}, indexRow = {
		key: personalPaperTemplateLibraryKey(scope),
		...scope,
		value: index
	}, row = {
		key: rowKey,
		...scope,
		value: template
	};
	if (!validIndex(index, scope)) throw Error("La révision de la bibliothèque doit être récupérée.");
	const blobs = [{
		...scope,
		id: assetId,
		documentId: ownerId(id, 1),
		blob: input.archive,
		name: template.name + ".dowze",
		createdAt: Date.parse(input.now),
		status: "pending",
		removedFromNote: true,
		revision: 1,
		sha256
	}, ...originalArchive ? [{
		...scope,
		id: sourceAssetId,
		documentId: ownerId(id, 1),
		blob: input.originalArchive,
		name: input.source.sourceName ?? "Source du modèle",
		createdAt: Date.parse(input.now),
		status: "pending",
		removedFromNote: true,
		revision: 1,
		sha256: originalSha
	}] : []];
	const commit = {
		target: scope,
		sources: [scope],
		drafts: [],
		blobs,
		snapshots: [indexRow, row],
		draftChecks: [...input.sourceChecks?.draftChecks ?? []],
		blobChecks: [...input.sourceChecks?.blobChecks ?? [], ...blobs.map((file) => ({
			identity: file,
			expected: void 0
		}))],
		snapshotChecks: [
			...input.sourceChecks?.snapshotChecks ?? [],
			{
				key: indexRow.key,
				expected: library.indexRow
			},
			{
				key: row.key,
				expected: void 0
			}
		]
	};
	if (library.indexRow) {
		const historyKey = `${indexRow.key}|history|${notebookIdentityDigest(JSON.stringify(library.indexRow.value))}`, history = await getSnapshot(historyKey);
		check(current);
		ownedRow(history, scope, historyKey);
		if (history && !same(history.value, library.indexRow.value)) throw Error("Une version de la bibliothèque doit être récupérée.");
		commit.snapshotChecks.push({
			key: historyKey,
			expected: history
		});
		if (!history) commit.snapshots.push({
			key: historyKey,
			...scope,
			value: library.indexRow.value
		});
	}
	await commitNotebookTransfer(commit, current);
	check(current);
	return template;
}
async function createPaperPersonalTemplate(input) {
	const scope = scopeOf(input.media), now = input.now ?? (/* @__PURE__ */ new Date()).toISOString(), includeAudio = input.includeAudio === true, document = structuredClone(input.document);
	check(input.current);
	if (!date(now)) throw Error("Date du modèle incompatible.");
	text(input.name, "Le nom du modèle");
	const proof = await sourceProof(document, scope, input.current), payload = selectedPayload(document, input.pageIds, input.mode, includeAudio, now), files = Object.create(null);
	for (const asset of payload.assets) {
		const original = document.assets.find((value) => value.id === asset.id);
		files[asset.id] = await readPaperAsset(original, input.media, {
			document,
			current: input.current
		});
		check(input.current);
		asset.size = files[asset.id].size;
	}
	await verifyAudioHashes(payload, files, input.current);
	const sourceFiles = await listLocalBlobs(scope.accountId, scope.spaceId);
	check(input.current);
	const blobChecks = [];
	for (const asset of payload.assets) {
		const file = sourceFiles.find((value) => value.id === asset.id);
		if (!file) throw Error("Un original manque pendant la création du modèle.");
		const actual = await localBlobDigest(file.blob);
		if (file.sha256 && file.sha256 !== actual || actual !== await localBlobDigest(files[asset.id])) throw Error("Un original a changé ou ne correspond plus à son empreinte conservée.");
		check(input.current);
		blobChecks.push({
			identity: file,
			expected: file
		});
	}
	const archive = await payloadArchive(payload, files, input.current), documentSha256 = await localBlobDigest(new Blob([JSON.stringify(document)]));
	check(input.current);
	return persistTemplate({
		payload,
		archive,
		source: {
			kind: "document",
			noteId: document.noteId,
			revision: document.revision,
			document,
			pageIds: payload.pages.map((page) => page.id),
			documentSha256
		},
		media: input.media,
		name: input.name,
		author: input.author,
		mode: input.mode,
		includeAudio,
		current: input.current,
		newId: input.newId,
		now,
		sourceChecks: {
			draftChecks: [{
				identity: proof.identity,
				expected: proof.draft
			}],
			blobChecks,
			snapshotChecks: [{
				key: proof.deletionKey,
				expected: void 0
			}]
		}
	});
}
async function verifyAudioHashes(document, files, current) {
	for (const track of document.audio) for (const source of [track.source, ...(track.segments ?? []).map((part) => part.source)].filter(Boolean)) for (const chunk of source.chunks) {
		check(current);
		if (!files[chunk.assetId] || files[chunk.assetId].size !== chunk.size || await localBlobDigest(files[chunk.assetId]) !== chunk.sha256) throw Error("Une portion audio ne correspond pas à son original vérifié.");
		check(current);
	}
}
function validPortable(value) {
	return record(value) && value.schema === 1 && value.kind === "paper-personal-template-portable" && safeId(value.id) && Number.isSafeInteger(value.version) && Number(value.version) > 0 && typeof value.name === "string" && value.name.trim() === value.name && value.name.length > 0 && value.name.length <= 120 && (value.author === void 0 || typeof value.author === "string" && value.author.trim() === value.author && value.author.length > 0 && value.author.length <= 120) && modes.includes(value.mode) && typeof value.includeAudio === "boolean" && (!value.includeAudio || value.mode === "content") && date(value.createdAt) && Number.isSafeInteger(value.pageCount) && Number(value.pageCount) > 0 && Number(value.pageCount) <= 2e3 && Number.isSafeInteger(value.objectCount) && Number(value.objectCount) >= 0 && Number.isSafeInteger(value.assetCount) && Number(value.assetCount) >= 0 && record(value.payload) && Number.isSafeInteger(value.payload.size) && Number(value.payload.size) > 0 && Number(value.payload.size) <= 268435456 && digest(value.payload.sha256);
}
async function decodeTemplateInput(file, current) {
	check(current);
	if (file.size > 268435456) throw Error("Le fichier de modèle dépasse 256 Mo.");
	const prefix = await file.slice(0, 26).text();
	check(current);
	if (prefix !== MAGIC) return {
		archive: await verifyPaperArchiveBlob(file, current),
		payload: file
	};
	const header = await file.slice(0, HEADER_LENGTH).text();
	check(current);
	const rest = header.slice(26), match = /^([a-f0-9]{8})\n([a-f0-9]{64})\n$/.exec(rest);
	if (!match) throw Error("L’enveloppe du modèle est incomplète ou incompatible.");
	const length = parseInt(match[1], 16);
	if (length <= 0 || length > MAX_DESCRIPTOR || HEADER_LENGTH + length >= file.size) throw Error("Le descriptif du modèle est incompatible.");
	const descriptorBlob = file.slice(HEADER_LENGTH, HEADER_LENGTH + length);
	if (await localBlobDigest(descriptorBlob) !== match[2]) throw Error("Le descriptif du modèle est endommagé.");
	check(current);
	const descriptor = JSON.parse(await descriptorBlob.text());
	if (!validPortable(descriptor)) throw Error("Le descriptif du modèle est incompatible.");
	const payload = file.slice(HEADER_LENGTH + length);
	if (payload.size !== descriptor.payload.size || await localBlobDigest(payload) !== descriptor.payload.sha256) throw Error("Le contenu du modèle est endommagé.");
	check(current);
	const archive = await verifyPaperArchiveBlob(payload, current);
	if (archive.document.pages.length !== descriptor.pageCount || archive.document.objects.length !== descriptor.objectCount || archive.document.assets.length !== descriptor.assetCount) throw Error("Le descriptif ne correspond pas aux pages conservées.");
	if (descriptor.mode !== "content" && (archive.document.objects.length || archive.document.audio.length) || descriptor.mode === "paper" && archive.document.pages.some((page) => page.pdf) || !descriptor.includeAudio && archive.document.audio.length || archive.metadata || archive.document.study) throw Error("Le contenu ne correspond pas au mode déclaré du modèle.");
	return {
		archive,
		payload,
		descriptor
	};
}
async function importPaperPersonalTemplate(input) {
	const now = input.now ?? (/* @__PURE__ */ new Date()).toISOString();
	check(input.current);
	if (!date(now)) throw Error("Date du modèle incompatible.");
	const decoded = await decodeTemplateInput(input.file, input.current), mode = input.mode ?? decoded.descriptor?.mode ?? "content", includeAudio = input.includeAudio ?? decoded.descriptor?.includeAudio ?? false, payload = selectedPayload(decoded.archive.document, input.pageIds, mode, includeAudio, now), files = Object.create(null);
	for (const asset of payload.assets) {
		const blob = decoded.archive.files[`assets/${asset.id}`];
		if (!blob) throw Error(`L’original « ${asset.name} » manque dans le modèle.`);
		files[asset.id] = blob.slice(0, void 0, asset.mediaType);
		asset.size = blob.size;
	}
	await verifyAudioHashes(payload, files, input.current);
	const archive = await payloadArchive(payload, files, input.current), documentSha256 = await localBlobDigest(new Blob([JSON.stringify(decoded.archive.document)]));
	check(input.current);
	const name = input.name ?? decoded.descriptor?.name ?? (input.file.name?.replace(/\.(dowzetemplate|dowze|zip)$/i, "").trim() || "Modèle importé");
	return persistTemplate({
		payload,
		archive,
		originalArchive: input.file,
		source: {
			kind: "archive",
			noteId: decoded.archive.document.noteId,
			revision: decoded.archive.document.revision,
			document: decoded.archive.document,
			pageIds: payload.pages.map((page) => page.id),
			documentSha256,
			...input.file.name ? { sourceName: input.file.name.slice(0, 500) } : {},
			...decoded.descriptor ? {
				templateId: decoded.descriptor.id,
				templateVersion: decoded.descriptor.version
			} : {}
		},
		media: input.media,
		name,
		author: input.author ?? decoded.descriptor?.author,
		mode,
		includeAudio,
		current: input.current,
		newId: input.newId,
		now
	});
}
/** Verification is read-only. The owner confirms pages, content and recordings
* before import, whose own verification and scoped atomic commit still run. */
async function inspectPaperPersonalTemplateImport(file, current) {
	const { archive, descriptor } = await decodeTemplateInput(file, current);
	check(current);
	return {
		kind: descriptor ? "template" : "archive",
		name: descriptor?.name ?? (file.name?.replace(/\.(dowzetemplate|dowze|zip)$/i, "").trim() || "Modèle importé"),
		...descriptor?.author ? { author: descriptor.author } : {},
		mode: descriptor?.mode ?? "content",
		includeAudio: descriptor?.includeAudio ?? false,
		audioCount: archive.document.audio.length,
		pages: archive.document.pages.map((page, index) => ({
			id: page.id,
			number: index + 1
		}))
	};
}
async function readOwnedTemplate(template, scope, current) {
	check(current);
	if (!isPersonalPaperTemplate(template)) throw Error("Le modèle est incompatible.");
	const library = await loadPaperPersonalTemplates(scope, current), entry = library.index.entries.find((value) => value.id === template.id && !value.removedAt);
	if (!entry || entry.version !== template.version) throw Error("Ce modèle a changé ou a été retiré. Rechargez sa bibliothèque.");
	const key = personalPaperTemplateKey(scope, template.id, template.version), row = await getSnapshot(key);
	check(current);
	ownedRow(row, scope, key);
	if (!row || !same(row.value, template)) throw Error("La version de ce modèle a changé. Ses sources restent conservées.");
	const file = (await listLocalBlobs(scope.accountId, scope.spaceId)).find((value) => value.id === template.archive.assetId);
	check(current);
	const fileVersion = file?.documentId?.slice(`paper-template-${template.id}-v`.length), version = Number(fileVersion);
	if (!file || file.documentId !== ownerId(template.id, version) || !Number.isSafeInteger(version) || version < 1 || version > template.version || file.blob.size !== template.archive.size || file.sha256 !== template.archive.sha256 || await localBlobDigest(file.blob) !== template.archive.sha256) throw Error("L’archive de ce modèle manque ou a changé. Son original est conservé.");
	check(current);
	const ownerKey = personalPaperTemplateKey(scope, template.id, version), ownerRow = ownerKey === row.key ? row : await getSnapshot(ownerKey);
	check(current);
	ownedRow(ownerRow, scope, ownerKey);
	if (!ownerRow || !isPersonalPaperTemplate(ownerRow.value) || ownerRow.value.id !== template.id || ownerRow.value.version !== version || !same(ownerRow.value.archive, template.archive)) throw Error("La version propriétaire de cette archive doit être récupérée. Ses originaux restent conservés.");
	if (await localBlobDigest(new Blob([JSON.stringify(template.source.document)])) !== template.source.documentSha256) throw Error("La source conservée de ce modèle a changé. Aucun original n’est remplacé.");
	check(current);
	return {
		library,
		row,
		file,
		provenanceRows: ownerRow === row ? [row] : [row, ownerRow]
	};
}
async function exportPaperPersonalTemplate(template, scope, current = () => true) {
	const proof = await readOwnedTemplate(template, scopeOf(scope), current);
	await verifyPaperArchiveBlob(proof.file.blob, current);
	const descriptor = {
		schema: 1,
		kind: "paper-personal-template-portable",
		id: template.id,
		version: template.version,
		name: template.name,
		...template.author ? { author: template.author } : {},
		mode: template.mode,
		includeAudio: template.includeAudio,
		createdAt: template.createdAt,
		pageCount: template.pageCount,
		objectCount: template.objectCount,
		assetCount: template.assetCount,
		payload: {
			size: template.archive.size,
			sha256: template.archive.sha256
		}
	}, metadata = new Blob([JSON.stringify(descriptor)]);
	if (metadata.size > MAX_DESCRIPTOR) throw Error("Le descriptif du modèle dépasse la taille prise en charge.");
	const header = MAGIC + metadata.size.toString(16).padStart(8, "0") + "\n" + await localBlobDigest(metadata) + "\n";
	check(current);
	const output = new Blob([
		header,
		metadata,
		proof.file.blob
	], { type: "application/vnd.dowze.page-template" });
	if (output.size > 268435456) throw Error("Le modèle portable dépasse 256 Mo.");
	return output;
}
async function preparePaperPersonalTemplateUse(input) {
	const { current, template, document } = input, scope = scopeOf(input.media), now = input.now ?? (/* @__PURE__ */ new Date()).toISOString();
	check(current);
	if (!date(now) || input.afterId && !document.pages.some((page) => page.id === input.afterId)) throw Error("La destination du modèle a changé.");
	const target = await sourceProof(document, scope, current), source = await readOwnedTemplate(template, scope, current), archive = await verifyPaperArchiveBlob(source.file.blob, current), mapped = appendPaperArchive(archive.document, document.noteId);
	check(current);
	if (archive.document.pages.length !== template.pageCount || archive.document.objects.length !== template.objectCount || archive.document.assets.length !== template.assetCount) throw Error("Le contenu ne correspond plus au descriptif du modèle.");
	const inserts = mapped.commands.filter((command) => command.type === "insert-page"), upserts = mapped.commands.filter((command) => command.type === "upsert-object"), tracks = mapped.commands.filter((command) => command.type === "add-audio");
	if (new Set(inserts.map((command) => command.page.id)).size !== inserts.length || inserts.some((command) => document.pages.some((page) => page.id === command.page.id)) || new Set(upserts.map((command) => command.object.id)).size !== upserts.length || upserts.some((command) => document.objects.some((object) => object.id === command.object.id) || command.object.groupId && document.objects.some((object) => object.groupId === command.object.groupId)) || (/* @__PURE__ */ new Set([...mapped.assets.values()])).size !== mapped.assets.size || [...mapped.assets.values()].some((id) => document.assets.some((asset) => asset.id === id)) || new Set(tracks.map((command) => command.audio.id)).size !== tracks.length || tracks.some((command) => document.audio.some((track) => track.id === command.audio.id))) throw Error("Les éléments du modèle nécessitent des identités indépendantes. Aucun original n’est remplacé.");
	let afterId = input.afterId ?? document.pages.at(-1).id, objectIndex = 0;
	const commands = mapped.commands.map((command) => {
		if (command.type === "insert-page") {
			const next = {
				...command,
				afterId
			};
			afterId = command.page.id;
			return next;
		}
		if (command.type === "upsert-object") {
			const original = archive.document.objects[objectIndex++];
			if (original.markdown !== void 0) {
				const scan = scanLegacyPaperImages(original.markdown), replacements = /* @__PURE__ */ new Map();
				for (const image of scan.images) if (image.kind === "photo" && mapped.assets.has(image.photo.id)) replacements.set(image.id, photoReference(notebookDocumentId(document.noteId), mapped.assets.get(image.photo.id)));
				return {
					...command,
					object: {
						...command.object,
						markdown: planLegacyPaperImageRewrite(scan, replacements).markdown
					}
				};
			}
		}
		return command;
	});
	const next = amendPaperCollaboration(document, applyPaperCommand(document, {
		type: "batch",
		commands
	}, now), JSON.stringify([
		scope.accountId,
		scope.spaceId,
		document.noteId
	])), draft = {
		...target.draft,
		content: next,
		updatedAt: Date.parse(now),
		syncState: "local"
	}, files = await listLocalBlobs(scope.accountId, scope.spaceId);
	check(current);
	const blobs = [];
	for (const asset of archive.document.assets) {
		const id = mapped.assets.get(asset.id), blob = archive.files[`assets/${asset.id}`].slice(0, void 0, asset.mediaType);
		if (files.some((file) => file.id === id)) throw Error("Une pièce jointe utilise déjà une nouvelle identité du modèle.");
		blobs.push({
			...scope,
			id,
			documentId: target.identity.documentId,
			blob,
			name: asset.name,
			createdAt: Date.parse(now),
			status: "pending",
			removedFromNote: false,
			revision: 1,
			sha256: await localBlobDigest(blob)
		});
		check(current);
	}
	const receiptKey = `${keyBase(scope)}|use|${crypto.randomUUID()}`, historyKey = `paper-history|${scope.accountId}|${scope.spaceId}|whiteboard|${target.identity.documentId}|${String(document.revision).padStart(12, "0")}`, history = await getSnapshot(historyKey);
	check(current);
	ownedRow(history, scope, historyKey);
	const exactHistoryKey = history && !same(history.value, document) ? `${historyKey}|template-${crypto.randomUUID()}` : historyKey, alternate = exactHistoryKey === historyKey ? history : await getSnapshot(exactHistoryKey);
	check(current);
	if (exactHistoryKey !== historyKey && alternate) throw Error("La version de récupération du carnet possède une identité incompatible.");
	const receipt = {
		key: receiptKey,
		...scope,
		value: {
			schema: 1,
			kind: "paper-personal-template-use",
			templateId: template.id,
			templateVersion: template.version,
			noteId: document.noteId,
			appliedAt: now,
			archiveSha256: template.archive.sha256,
			mode: template.mode,
			includeAudio: template.includeAudio,
			pageIds: inserts.map((command) => command.page.id),
			assetIds: blobs.map((file) => file.id),
			beforeHistoryKey: exactHistoryKey
		}
	}, receiptBefore = await getSnapshot(receiptKey);
	check(current);
	if (receiptBefore) throw Error("Une application de modèle utilise déjà cette identité.");
	const commit = {
		target: scope,
		sources: [scope],
		drafts: [draft],
		blobs,
		snapshots: [receipt, ...alternate && same(alternate.value, document) ? [] : [{
			key: exactHistoryKey,
			...scope,
			value: document
		}]],
		draftChecks: [{
			identity: target.identity,
			expected: target.draft
		}],
		blobChecks: [{
			identity: source.file,
			expected: source.file
		}, ...blobs.map((file) => ({
			identity: file,
			expected: void 0
		}))],
		snapshotChecks: [
			...source.provenanceRows.map((row) => ({
				key: row.key,
				expected: row
			})),
			{
				key: personalPaperTemplateLibraryKey(scope),
				expected: source.library.indexRow
			},
			{
				key: target.deletionKey,
				expected: void 0
			},
			{
				key: receiptKey,
				expected: void 0
			},
			{
				key: historyKey,
				expected: history
			},
			...exactHistoryKey !== historyKey ? [{
				key: exactHistoryKey,
				expected: void 0
			}] : []
		]
	};
	return {
		template,
		draft,
		firstPageId: mapped.firstPageId,
		commit
	};
}
/** Rename writes a new immutable version; removal only hides the entry. Sources,
* archives and former names remain available for recovery. */
async function updatePaperPersonalTemplate(input) {
	const scope = scopeOf(input.scope), now = input.now ?? (/* @__PURE__ */ new Date()).toISOString();
	if (!date(now)) throw Error("Date du modèle incompatible.");
	const source = await readOwnedTemplate(input.template, scope, input.current), version = input.template.version + 1, next = {
		...input.template,
		version,
		name: input.name === void 0 ? input.template.name : text(input.name, "Le nom du modèle"),
		...input.author === void 0 ? {} : { author: text(input.author, "L’auteur", true) },
		updatedAt: now
	}, key = personalPaperTemplateKey(scope, input.template.id, version), existing = input.remove ? void 0 : await getSnapshot(key);
	check(input.current);
	if (existing) throw Error("Cette version du modèle existe déjà.");
	const index = {
		...source.library.index,
		revision: source.library.index.revision + 1,
		updatedAt: now,
		entries: source.library.index.entries.map((entry) => entry.id === input.template.id ? {
			id: entry.id,
			version: input.remove ? entry.version : version,
			...input.remove ? { removedAt: now } : {}
		} : entry)
	}, row = {
		key: personalPaperTemplateLibraryKey(scope),
		...scope,
		value: index
	}, historyKey = `${row.key}|history|${notebookIdentityDigest(JSON.stringify(source.library.index))}`, history = await getSnapshot(historyKey);
	check(input.current);
	ownedRow(history, scope, historyKey);
	if (history && !same(history.value, source.library.index)) throw Error("Une version antérieure de la bibliothèque doit être récupérée.");
	await commitNotebookTransfer({
		target: scope,
		sources: [scope],
		drafts: [],
		blobs: [],
		snapshots: [
			row,
			...!input.remove ? [{
				key,
				...scope,
				value: next
			}] : [],
			...history ? [] : [{
				key: historyKey,
				...scope,
				value: source.library.index
			}]
		],
		draftChecks: [],
		blobChecks: [{
			identity: source.file,
			expected: source.file
		}],
		snapshotChecks: [
			{
				key: row.key,
				expected: source.library.indexRow
			},
			...source.provenanceRows.map((row) => ({
				key: row.key,
				expected: row
			})),
			{
				key: historyKey,
				expected: history
			},
			...!input.remove ? [{
				key,
				expected: void 0
			}] : []
		]
	}, input.current);
	check(input.current);
}
//#endregion
export { createPaperPersonalTemplate, exportPaperPersonalTemplate, importPaperPersonalTemplate, inspectPaperPersonalTemplateImport, loadPaperPersonalTemplates, preparePaperPersonalTemplateUse, updatePaperPersonalTemplate };
