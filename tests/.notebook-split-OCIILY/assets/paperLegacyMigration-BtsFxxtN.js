import { E as readNotebookDeletionStatus, _ as localBlobDigest, c as commitNotebookTransfer, d as getDraft, f as getSnapshot, m as listLocalBlobs, p as listDrafts, v as notebookDeletionKey } from "./storage-BJWvsK9s.js";
import { C as notebookIdentityDigest, D as parsePhotoReference, E as noteBoardId, O as photoReference, S as notebookDocumentId, _ as decodeLegacyRasterDataUrl, a as isPaperDocument, b as validateLegacyRasterBytes, o as legacyPaperPhotoIdentities, s as migratePaper, v as planLegacyPaperImageRewrite, x as legacyNotebookDocumentId, y as scanLegacyPaperImages } from "./notebookDocument-C3DZiTlV.js";
import { h as readOwnedLegacyNotebookBoard } from "../split.mjs";
//#region src/lib/paperLegacyImageAssets.ts
var LegacyImageRecoveryError = class extends Error {
	needs;
	constructor(message, needs = []) {
		super(message);
		this.name = "LegacyImageRecoveryError";
		this.needs = needs;
	}
};
var record$1 = (value) => !!value && typeof value === "object" && !Array.isArray(value);
var check$1 = (current) => {
	if (!current()) throw Error("Le compte, l’année ou la source de l’image a changé. Les originaux restent conservés.");
};
var pair = (scope) => ({
	accountId: scope.accountId,
	spaceId: scope.spaceId
});
var draftKey = (value) => `${value.accountId}|${value.spaceId}|${value.type ?? "notesMarkdown"}|${value.documentId}`;
var equalDraft = (a, b) => JSON.stringify(a && {
	...a,
	key: void 0
}) === JSON.stringify(b && {
	...b,
	key: void 0
});
var ownerKey = (scope, noteId) => `paper-legacy-owner|${scope.accountId}|${scope.spaceId}|whiteboard|${noteBoardId(noteId)}`;
var tags = (noteId) => /* @__PURE__ */ new Set([
	noteId,
	noteBoardId(noteId),
	notebookDocumentId(noteId),
	legacyNotebookDocumentId(noteId),
	`paper-v3-${noteId}`
]);
var fullNoteId = (value) => record$1(value) && typeof value.id === "string" ? value.id : void 0;
var validId = (id) => typeof id === "string" && id.length > 0 && id.length <= 200 && !/[\u0000-\u001f\u007f]/.test(id);
var safeServerId = (id) => typeof id === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{0,126}$/.test(id) && !id.includes("..");
var rasterType = (value) => value.toLowerCase() === "image/jpg" ? "image/jpeg" : value.toLowerCase();
var mediaType = (file, declared) => file.blob.type.startsWith("image/") ? file.blob.type : typeof declared === "string" && declared.startsWith("image/") ? declared : "image/png";
var originalSource = (source) => ({
	...source,
	serverId: void 0
});
/** Normalises old observations with committed bindings, without reading files or contacting a service. */
function rewriteLegacyImageBindings(markdown, mappings) {
	const byURL = /* @__PURE__ */ new Map();
	for (const mapping of mappings) {
		const ref = parsePhotoReference(mapping.canonicalURL);
		if (!ref || ref.id !== mapping.assetId || !/^[a-f0-9]{64}$/.test(mapping.sha256)) throw Error("Une référence d’image récupérée est incompatible.");
		const previous = byURL.get(mapping.rawURL);
		if (previous && previous !== mapping.canonicalURL) throw Error("Deux originaux utilisent la même référence d’image. Leur choix reste à départager.");
		byURL.set(mapping.rawURL, mapping.canonicalURL);
	}
	const scan = scanLegacyPaperImages(markdown), replacements = /* @__PURE__ */ new Map();
	for (const image of scan.images) {
		const url = byURL.get(image.url);
		if (url && url !== image.url && ["photo", "data"].includes(image.kind)) replacements.set(image.id, url);
	}
	return planLegacyPaperImageRewrite(scan, replacements).markdown;
}
/** Local, read-only preflight. A caller commits graph, copies, checks and receipt together. */
async function prepareLegacyImageAssets(input) {
	const { noteId, markdown, current } = input, scope = pair(input.scope), canonicalId = notebookDocumentId(noteId);
	if (!validId(noteId) || typeof markdown !== "string" || !["accountId", "spaceId"].every((field) => typeof scope[field] === "string" && /^[A-Za-z0-9._-]{1,200}$/.test(scope[field]))) throw Error("L’identité de récupération de l’image est incompatible.");
	const now = input.now ?? (/* @__PURE__ */ new Date()).toISOString();
	if (!Number.isFinite(Date.parse(now))) throw Error("La date de récupération est incompatible.");
	check$1(current);
	const plan = {
		assets: [],
		blobs: [],
		snapshots: [],
		draftChecks: [],
		blobChecks: [],
		snapshotChecks: [],
		mappings: [],
		notices: []
	};
	const drafts = /* @__PURE__ */ new Map(), snapshots = /* @__PURE__ */ new Map(), files = /* @__PURE__ */ new Map(), checkedFiles = /* @__PURE__ */ new Set();
	const readDraft = async (documentId, type = "whiteboard") => {
		const identity = {
			...scope,
			documentId,
			type
		}, key = draftKey(identity);
		if (!drafts.has(key)) {
			const row = await getDraft(identity);
			check$1(current);
			drafts.set(key, row);
			plan.draftChecks.push({
				identity,
				expected: row
			});
		}
		return drafts.get(key);
	};
	const readSnapshot = async (key) => {
		if (!snapshots.has(key)) {
			const row = await getSnapshot(key);
			check$1(current);
			if (row && (row.accountId !== scope.accountId || row.spaceId !== scope.spaceId)) throw Error("Un reçu d’image appartient à un autre compte ou à une autre année.");
			snapshots.set(key, row);
			plan.snapshotChecks.push({
				key,
				expected: row
			});
		}
		return snapshots.get(key);
	};
	const checkFile = (id) => {
		if (!checkedFiles.has(id)) {
			checkedFiles.add(id);
			plan.blobChecks.push({
				identity: {
					...scope,
					id
				},
				expected: files.get(id)
			});
		}
	};
	const deletion = async (owner) => {
		const identity = {
			...scope,
			type: "whiteboard",
			documentId: notebookDocumentId(owner)
		};
		await readSnapshot(notebookDeletionKey(identity));
		const marker = await readNotebookDeletionStatus(owner, scope, current);
		check$1(current);
		if (marker) throw Error("Cette image appartient à une note supprimée sur le serveur. Ses originaux sont conservés sans réactivation automatique.");
	};
	await deletion(noteId);
	const target = await readDraft(canonicalId);
	if (Object.hasOwn(input, "expectedTarget") && !equalDraft(target, input.expectedTarget)) throw Error("Le carnet a changé avant la récupération de ses images.");
	if (target && (!isPaperDocument(target.content) || target.content.noteId !== noteId || target.identityAlias || target.staged || target.syncState === "conflict")) throw Error("Le carnet doit être départagé avant de récupérer ses images.");
	if (input.targetDocument && (!isPaperDocument(input.targetDocument) || input.targetDocument.noteId !== noteId)) throw Error("Le graphe préparé appartient à une autre note.");
	const graph = input.targetDocument ?? target?.content, metadata = await readDraft(noteId, "notesMarkdown");
	if (metadata && (fullNoteId(metadata.content) !== noteId || metadata.staged || metadata.syncState === "conflict")) throw Error("Les métadonnées ne prouvent pas l’identité complète de la note.");
	const rows = await listDrafts(scope.accountId, scope.spaceId);
	check$1(current);
	const known = /* @__PURE__ */ new Set([noteId, ...input.knownNoteIds ?? []]);
	for (const row of rows) {
		if (row.type === "notesMarkdown" && fullNoteId(row.content) === row.documentId) known.add(row.documentId);
		if (row.type === "whiteboard" && isPaperDocument(row.content)) known.add(row.content.noteId);
	}
	for (const file of await listLocalBlobs(scope.accountId, scope.spaceId)) if (file.accountId === scope.accountId && file.spaceId === scope.spaceId) files.set(file.id, file);
	check$1(current);
	const provenBindings = [], bindingReceipts = [];
	for (const key of new Set(input.bindingReceiptKeys ?? [])) {
		const value = (await readSnapshot(key))?.value;
		if (!key.startsWith(`paper-legacy-images|${scope.accountId}|${scope.spaceId}|whiteboard|${canonicalId}|`) || !record$1(value) || value.schema !== 1 || value.kind !== "paper-legacy-image-assets" || value.noteId !== noteId || value.documentId !== canonicalId || typeof value.fingerprint !== "string" || !/^[a-f0-9]{64}$/.test(value.fingerprint) || key !== `paper-legacy-images|${scope.accountId}|${scope.spaceId}|whiteboard|${canonicalId}|${value.fingerprint}` || !Array.isArray(value.mappings)) throw Error("Un reçu de référence d’image est absent ou incompatible.");
		bindingReceipts.push({
			key,
			fingerprint: value.fingerprint,
			noteId,
			documentId: canonicalId
		});
		for (const mapping of value.mappings) {
			if (!record$1(mapping) || typeof mapping.rawURL !== "string" || typeof mapping.canonicalURL !== "string" || typeof mapping.assetId !== "string" || typeof mapping.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(mapping.sha256) || !record$1(mapping.source) || !["local", "data"].includes(String(mapping.source.kind))) throw Error("Une référence d’image conservée est incompatible.");
			const ref = parsePhotoReference(mapping.canonicalURL);
			if (!ref || ref.documentId !== canonicalId || ref.id !== mapping.assetId) throw Error("Cette référence d’image appartient à un autre carnet.");
			provenBindings.push(mapping);
		}
	}
	for (const binding of input.existingBindings ?? []) if (!provenBindings.some((value) => JSON.stringify(value) === JSON.stringify(binding))) throw Error("Une référence existante ne possède pas de reçu prouvé pour ce carnet.");
	const allocated = /* @__PURE__ */ new Set([...files.keys(), ...graph?.assets.map((asset) => asset.id) ?? []]);
	const allocate = () => {
		for (let n = 0; n < 16; n++) {
			const id = input.newId?.() ?? crypto.randomUUID();
			if (parsePhotoReference(photoReference(canonicalId, id)) && !allocated.has(id)) {
				allocated.add(id);
				return id;
			}
		}
		throw Error("La récupération nécessite une identité de fichier indépendante.");
	};
	const claim = async (owner, required) => {
		const key = ownerKey(scope, owner), row = await readSnapshot(key), boardId = noteBoardId(owner);
		if (row) {
			const value = row.value;
			if (!record$1(value) || value.schema !== 1 || !validId(value.noteId) || value.boardId !== boardId || value.documentId !== notebookDocumentId(value.noteId) || !Number.isFinite(Date.parse(String(value.claimedAt)))) throw Error("Le propriétaire historique de cette image est incompatible.");
			if (value.noteId !== owner) {
				if (required) throw Error("Ce dessin appartient à une autre identité de note. Aucun fichier n’est emprunté.");
				return false;
			}
			return true;
		}
		if (required && !plan.snapshots.some((snapshot) => snapshot.key === key)) plan.snapshots.push({
			key,
			...scope,
			value: {
				schema: 1,
				noteId: owner,
				documentId: notebookDocumentId(owner),
				boardId,
				claimedAt: now
			}
		});
		return true;
	};
	const proof = async (documentId) => {
		const raw = await readDraft(documentId), candidates = [...known].filter((owner) => tags(owner).has(documentId));
		let owner;
		if (raw && record$1(raw.content) && raw.content.notebookSchema === 3 && !isPaperDocument(raw.content)) throw Error("Le carnet source de cette image est incomplet ou incompatible. Aucun fichier n’est emprunté.");
		if (raw && isPaperDocument(raw.content)) {
			owner = raw.content.noteId;
			if (!tags(owner).has(documentId) || raw.staged || raw.syncState === "conflict") throw Error("La version de l’image ne possède pas un propriétaire utilisable.");
			if (candidates.length > 1 && owner !== noteId) throw Error("Cette ancienne référence d’image possède plusieurs propriétaires possibles.");
			if (raw.identityAlias) {
				if (raw.identityAlias !== notebookDocumentId(owner)) throw Error("L’alias de cette image ne correspond pas à sa note.");
				const value = (await readSnapshot(`paper-identity|${scope.accountId}|${scope.spaceId}|whiteboard|${documentId}`))?.value;
				if (!record$1(value) || value.schema !== 1 || !["paper-identity-promotion", "paper-identity-quarantine"].includes(String(value.kind)) || value.noteId !== owner || !record$1(value.source) || value.source.accountId !== scope.accountId || value.source.spaceId !== scope.spaceId || value.source.type !== "whiteboard" || value.source.documentId !== documentId || !isPaperDocument(value.source.content) || value.source.content.noteId !== owner) throw Error("L’alias de cette image ne possède pas son reçu de récupération.");
			}
		} else {
			const boardCandidates = candidates.filter((id) => noteBoardId(id) === documentId), claimRows = await Promise.all(boardCandidates.map(async (id) => ({
				id,
				row: await readSnapshot(ownerKey(scope, id))
			})));
			check$1(current);
			const ownedClaims = claimRows.filter(({ row }) => row && record$1(row.value) && typeof row.value.noteId === "string");
			if (ownedClaims.length) {
				const values = new Set(ownedClaims.map(({ row }) => row.value.noteId));
				if (values.size !== 1) throw Error("Cette image possède plusieurs propriétaires historiques.");
				owner = [...values][0];
				if (!candidates.includes(owner)) throw Error("Le reçu d’image désigne une autre note.");
				await claim(owner, true);
			} else if (candidates.length === 1) owner = candidates[0];
			else throw Error("Le propriétaire complet de cette image est absent ou ambigu. Aucun fichier n’est emprunté.");
			if (raw && (raw.staged || raw.identityAlias || raw.syncState === "conflict" || !record$1(raw.content))) throw Error("L’ancien dessin doit être départagé avant de récupérer son image.");
		}
		if (documentId === noteBoardId(noteId) && owner !== noteId) throw Error("La référence historique de cette note est déjà attribuée à une autre identité. Aucun fichier n’est emprunté.");
		const sourceMetadata = await readDraft(owner, "notesMarkdown");
		if (sourceMetadata && (fullNoteId(sourceMetadata.content) !== owner || sourceMetadata.staged || sourceMetadata.syncState === "conflict")) throw Error("Les métadonnées de l’image appartiennent à une autre note.");
		const sourcePaper = await readDraft(notebookDocumentId(owner));
		if (sourcePaper && (!isPaperDocument(sourcePaper.content) || sourcePaper.content.noteId !== owner || sourcePaper.staged || sourcePaper.syncState === "conflict" || sourcePaper.identityAlias)) throw Error("Le carnet propriétaire de l’image est incompatible.");
		await deletion(owner);
		const ownsBoard = await claim(owner, documentId === noteBoardId(owner));
		const allowed = tags(owner);
		if (!ownsBoard) allowed.delete(noteBoardId(owner));
		const content = raw?.content ?? sourcePaper?.content;
		return {
			owner,
			raw,
			sourcePaper,
			content,
			allowed
		};
	};
	const downloaded = /* @__PURE__ */ new Map();
	const prepared = [], byURL = /* @__PURE__ */ new Map(), scan = scanLegacyPaperImages(markdown);
	const photoSources = /* @__PURE__ */ new Map();
	async function inspectPhoto(image) {
		const ref = image.photo, source = await proof(ref.documentId);
		check$1(current);
		const manifest = isPaperDocument(source.content) ? source.content.assets.filter((asset) => asset.id === ref.id) : record$1(source.content) && Array.isArray(source.content.photos) ? source.content.photos.filter((photo) => record$1(photo) && photo.id === ref.id) : [];
		if (new Set(manifest.map((asset) => typeof asset.serverId === "string" ? asset.serverId : "")).size > 1) throw Error("La même référence d’image désigne plusieurs originaux serveur. Aucun fichier n’est emprunté.");
		const asset = manifest[0], file = files.get(ref.id);
		checkFile(ref.id);
		if (file && (file.documentId ? !source.allowed.has(file.documentId) : !asset || file.removedFromNote)) throw Error("Le fichier local ne possède pas une association prouvée avec cette image. Aucun original n’est emprunté.");
		if (file?.documentId) {
			const tagged = await readDraft(file.documentId);
			if (tagged && record$1(tagged.content) && tagged.content.notebookSchema === 3 && !isPaperDocument(tagged.content)) throw Error("Le carnet associé au fichier est incomplet ou incompatible.");
			if (tagged && isPaperDocument(tagged.content) && tagged.content.noteId !== source.owner) throw Error("L’association du fichier désigne le carnet d’une autre note.");
		} else if (file) for (const row of rows) {
			if (row.type !== "whiteboard") continue;
			if (!(isPaperDocument(row.content) ? row.content.assets : record$1(row.content) && Array.isArray(row.content.photos) ? row.content.photos : []).some((value) => record$1(value) && value.id === ref.id)) continue;
			const owners = isPaperDocument(row.content) ? [row.content.noteId] : row.documentId === source.raw?.documentId ? [source.owner] : [...known].filter((id) => tags(id).has(row.documentId));
			if (owners.length !== 1 || owners[0] !== source.owner) throw Error("Un fichier sans association est référencé par plusieurs notes. Aucun original n’est emprunté.");
			await readDraft(row.documentId);
		}
		if (file?.documentId === noteBoardId(source.owner)) await claim(source.owner, true);
		const fileSHA = file ? await localBlobDigest(file.blob) : void 0;
		check$1(current);
		if (file?.sha256 && file.sha256 !== fileSHA) throw Error("L’empreinte des octets de cette image ne correspond plus à son reçu local.");
		const fields = asset, declared = typeof fields?.mediaType === "string" ? rasterType(fields.mediaType) : "image/png";
		if (fields?.serverId !== void 0 && !safeServerId(fields.serverId)) throw Error("L’identité serveur de cet original est incompatible. Aucun téléchargement n’est demandé.");
		const missing = !file?.blob.size, mismatch = asset?.serverId !== void 0 && file?.serverId !== asset.serverId;
		const size = typeof fields?.size === "number" && fields.size > 0 ? fields.size : void 0, manifestSHA = typeof fields?.sha256 === "string" ? fields.sha256 : void 0;
		const need = {
			...scope,
			noteId: source.owner,
			documentId: ref.documentId,
			assetId: ref.id,
			...typeof asset?.serverId === "string" ? { serverId: asset.serverId } : {},
			name: typeof asset?.name === "string" ? asset.name : file?.name ?? "Image",
			mediaType: declared,
			...size === void 0 ? {} : { size },
			...manifestSHA ? { sha256: manifestSHA } : {}
		};
		if (missing || mismatch) {
			if (!asset || !need.serverId) throw new LegacyImageRecoveryError(mismatch ? "Les octets locaux ne correspondent pas à l’original serveur de cette image." : "Un original privé doit être retrouvé avant de récupérer cette image. Le texte et les fichiers déjà présents restent conservés.", [need]);
			if (!/^image\/(png|jpeg|gif|webp)$/.test(declared) || fields?.mediaType !== void 0 && typeof fields.mediaType !== "string" || fields?.size !== void 0 && (!Number.isSafeInteger(fields.size) || Number(fields.size) < 0 || Number(fields.size) > 16777216) || fields?.sha256 !== void 0 && (typeof fields.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(fields.sha256))) throw Error("Le manifeste raster de cet original est incompatible. Aucun téléchargement n’est demandé.");
			if (new Set(manifest.map((row) => {
				const fields = row;
				return JSON.stringify([
					typeof fields.mediaType === "string" ? rasterType(fields.mediaType) : "image/png",
					typeof fields.size === "number" && fields.size > 0 ? fields.size : null,
					fields.sha256 ?? null
				]);
			})).size > 1) throw Error("Les descriptions de cet original sont contradictoires. Aucun téléchargement n’est demandé.");
		}
		return {
			ref,
			source,
			manifest,
			asset,
			file,
			fileSHA,
			missing,
			mismatch,
			declared,
			size,
			manifestSHA,
			need
		};
	}
	for (const image of scan.images) {
		if (image.kind === "invalid-photo") throw Error("Une ancienne référence privée d’image est incompatible. Son original reste conservé.");
		if (image.kind === "data") decodeLegacyRasterDataUrl(image.url);
		if (image.kind === "photo" && !photoSources.has(image.url)) photoSources.set(image.url, await inspectPhoto(image));
		check$1(current);
	}
	for (const image of scan.images) {
		if (byURL.has(image.url)) continue;
		if (image.kind === "invalid-photo") throw Error("Une ancienne référence privée d’image est incompatible. Son original reste conservé.");
		if (image.kind === "other") {
			if (image.url.startsWith("data:")) plan.notices.push("Une image intégrée dans un format non pris en charge reste conservée dans son texte original.");
			continue;
		}
		if (image.kind === "data") {
			const decoded = decodeLegacyRasterDataUrl(image.url), blob = new Blob([new Uint8Array(decoded.bytes)], { type: decoded.mediaType }), sha256 = await localBlobDigest(blob);
			check$1(current);
			const item = {
				rawURL: image.url,
				source: { kind: "data" },
				blob,
				name: `Image intégrée.${decoded.mediaType === "image/jpeg" ? "jpg" : decoded.mediaType.slice(6)}`,
				type: decoded.mediaType,
				sha256
			};
			prepared.push(item);
			byURL.set(image.url, item);
			continue;
		}
		const { ref, source, asset, file, fileSHA, missing, mismatch, declared, size, manifestSHA, need } = photoSources.get(image.url);
		let blob = file?.blob, type = file ? mediaType(file, asset?.mediaType) : "image/png", sha256 = fileSHA, reuse = ref.documentId === canonicalId && source.owner === noteId ? graph?.assets.find((value) => value.id === ref.id) : void 0, reservedId, remote;
		if (missing || mismatch) {
			for (const binding of provenBindings.filter((binding) => binding.rawURL === image.url)) checkFile(binding.assetId);
			const cachedBinding = provenBindings.find((binding) => binding.rawURL === image.url && binding.source.kind === "local" && binding.source.noteId === source.owner && binding.source.documentId === ref.documentId && binding.source.assetId === ref.id && binding.source.serverId === need.serverId), cached = cachedBinding && files.get(cachedBinding.assetId);
			let received;
			if (cached && cachedBinding) {
				checkFile(cached.id);
				const cachedAsset = graph?.assets.find((row) => row.id === cached.id);
				if (cached.documentId !== canonicalId || cached.removedFromNote || !cachedAsset || cachedAsset.size !== cached.blob.size || cachedAsset.serverId && cachedAsset.serverId !== cached.serverId) throw Error("La copie reçue de cet original ne possède plus son association prouvée.");
				const cachedSHA = await localBlobDigest(cached.blob);
				check$1(current);
				if (cachedSHA !== cachedBinding.sha256 || cached.sha256 && cached.sha256 !== cachedSHA) throw Error("La copie reçue de cet original ne possède plus ses octets exacts.");
				received = cached.blob;
				reservedId = cached.id;
				reuse = void 0;
			} else if (file || !reuse) {
				reuse = void 0;
				reservedId = allocate();
				checkFile(reservedId);
			}
			const downloadKey = JSON.stringify([
				source.owner,
				ref.id,
				need.serverId
			]);
			received ??= downloaded.get(downloadKey);
			if (!received) {
				if (!input.downloadOriginal) throw new LegacyImageRecoveryError("Un original privé doit être retrouvé avant de récupérer cette image. Le texte et les fichiers déjà présents restent conservés.", [need]);
				check$1(current);
				received = await input.downloadOriginal(Object.freeze({ ...need }));
				check$1(current);
				if (!(received instanceof Blob) || !received.size || received.size > 16777216) throw Error("L’original téléchargé est vide ou trop volumineux. Aucun fichier n’est modifié.");
				downloaded.set(downloadKey, received);
			}
			if (size !== void 0 && received.size !== size) throw Error("La taille téléchargée ne correspond pas au manifeste de cet original.");
			const servedType = rasterType(received.type.split(";")[0].trim());
			if (servedType && servedType !== "application/octet-stream" && servedType !== declared) throw Error("Le type téléchargé ne correspond pas au manifeste de cet original.");
			const bytes = new Uint8Array(await received.arrayBuffer());
			check$1(current);
			const validated = validateLegacyRasterBytes(bytes, declared);
			blob = new Blob([new Uint8Array(validated.bytes)], { type: validated.mediaType });
			type = validated.mediaType;
			sha256 = await localBlobDigest(blob);
			check$1(current);
			if (manifestSHA && manifestSHA !== sha256) throw Error("L’empreinte téléchargée ne correspond pas au manifeste de cet original.");
			if (reuse && provenBindings.some((binding) => binding.rawURL === image.url && binding.sha256 !== sha256)) {
				reuse = void 0;
				reservedId = allocate();
				checkFile(reservedId);
			}
			if (reuse) {
				if (reuse.serverId !== need.serverId || reuse.size > 0 && reuse.size !== blob.size || rasterType(reuse.mediaType) !== type) throw Error("L’original téléchargé ne correspond plus à l’image de ce carnet.");
				reuse = {
					...reuse,
					size: blob.size,
					mediaType: type
				};
			}
			remote = {
				...need,
				mediaType: type,
				size: blob.size,
				sha256
			};
		}
		if (!blob || !sha256) throw Error("Les octets de cet original doivent être retrouvés avant de continuer.");
		if (reuse && (reuse.size !== blob.size || reuse.serverId && reuse.serverId !== file?.serverId && !remote)) throw Error("L’image du carnet courant possède un autre original.");
		const sourceServer = remote?.serverId ?? file?.serverId;
		const item = {
			rawURL: image.url,
			source: {
				kind: "local",
				noteId: source.owner,
				documentId: ref.documentId,
				assetId: ref.id,
				...sourceServer ? { serverId: sourceServer } : {}
			},
			blob,
			name: typeof asset?.name === "string" ? asset.name : file?.name ?? "Image",
			type,
			sha256,
			reuse,
			original: file,
			originalSHA256: fileSHA,
			reservedId,
			remote
		};
		prepared.push(item);
		byURL.set(image.url, item);
	}
	const modernValidation = !!target && prepared.length > 0 && prepared.every((item) => item.reuse && item.rawURL === photoReference(canonicalId, item.reuse.id));
	if (modernValidation) prepared.sort((a, b) => a.rawURL.localeCompare(b.rawURL));
	const fingerprint = notebookIdentityDigest(JSON.stringify(modernValidation ? [
		"owned-canonical-validation",
		noteId,
		prepared.map((item) => ({
			rawURL: item.rawURL,
			source: originalSource(item.source),
			sha256: item.sha256
		}))
	] : [
		noteId,
		markdown,
		prepared.map((item) => ({
			rawURL: item.rawURL,
			source: item.remote ? item.source : originalSource(item.source),
			sha256: item.sha256
		}))
	]));
	const receiptKey = `paper-legacy-images|${scope.accountId}|${scope.spaceId}|whiteboard|${canonicalId}|${fingerprint}`, old = await readSnapshot(receiptKey), oldValue = old?.value;
	if (old && (!record$1(oldValue) || oldValue.schema !== 1 || oldValue.kind !== "paper-legacy-image-assets" || oldValue.noteId !== noteId || oldValue.documentId !== canonicalId || typeof oldValue.originalMarkdown !== "string" || typeof oldValue.rewrittenMarkdown !== "string" || !modernValidation && oldValue.originalMarkdown !== markdown || modernValidation && (oldValue.mode !== "owned-canonical-validation" || oldValue.originalMarkdown !== oldValue.rewrittenMarkdown) || oldValue.fingerprint !== fingerprint || !Array.isArray(oldValue.mappings))) throw Error("Le reçu de récupération d’image appartient à un autre original.");
	const previous = oldValue;
	for (const item of prepared) {
		const prior = previous?.mappings.find((mapping) => mapping.rawURL === item.rawURL) ?? input.existingBindings?.find((mapping) => mapping.rawURL === item.rawURL && mapping.sha256 === item.sha256 && JSON.stringify(originalSource(mapping.source)) === JSON.stringify(originalSource(item.source))), id = item.reuse?.id ?? prior?.assetId ?? item.reservedId ?? allocate();
		if (prior && (prior.sha256 !== item.sha256 || JSON.stringify(originalSource(prior.source)) !== JSON.stringify(originalSource(item.source)) || prior.canonicalURL !== photoReference(canonicalId, id))) throw Error("La référence récupérée ne correspond plus à son original.");
		const existing = files.get(id);
		checkFile(id);
		if (existing && id !== item.reuse?.id) {
			if (existing.documentId !== canonicalId || existing.removedFromNote || await localBlobDigest(existing.blob) !== item.sha256) throw Error("La copie de récupération possède déjà un autre original.");
			check$1(current);
		}
		const declared = graph?.assets.find((asset) => asset.id === id);
		if (declared && (declared.size !== item.blob.size && !(item.reuse && item.remote && declared.size === 0) || declared.mediaType !== item.type || !item.reuse && declared.serverId && declared.serverId !== existing?.serverId)) throw Error("Cette identité d’image appartient déjà à un autre fichier du carnet.");
		const asset = item.reuse ?? {
			id,
			name: item.name,
			mediaType: item.type,
			size: item.blob.size,
			...existing?.serverId ? { serverId: existing.serverId } : {}
		};
		plan.assets.push(asset);
		if (!existing) plan.blobs.push({
			...scope,
			id,
			documentId: canonicalId,
			blob: item.blob.type === item.type ? item.blob : new Blob([item.blob], { type: item.type }),
			name: item.name,
			createdAt: Date.parse(now),
			status: item.reuse && item.remote ? "uploaded" : "pending",
			...item.reuse && item.remote?.serverId ? { serverId: item.remote.serverId } : {},
			sha256: item.sha256,
			revision: 1,
			removedFromNote: false
		});
		plan.mappings.push({
			rawURL: item.rawURL,
			canonicalURL: photoReference(canonicalId, id),
			assetId: id,
			sha256: item.sha256,
			source: item.remote && !modernValidation ? item.source : prior?.source ?? item.source
		});
	}
	const rewritten = rewriteLegacyImageBindings(markdown, plan.mappings);
	if (previous && (JSON.stringify(previous.mappings) !== JSON.stringify(plan.mappings) || !modernValidation && previous.rewrittenMarkdown !== rewritten)) throw Error("Le reçu ne permet pas de reproduire les références d’image.");
	const originalFiles = prepared.flatMap((item) => {
		if (!item.original) return [];
		const { blob, ...file } = item.original;
		return [{
			...file,
			sha256: item.originalSHA256 ?? item.sha256
		}];
	});
	const sourceClaims = [...snapshots.values()].flatMap((snapshot) => {
		if (!snapshot || !snapshot.key.startsWith(`paper-legacy-owner|${scope.accountId}|${scope.spaceId}|whiteboard|`) || !record$1(snapshot.value) || snapshot.value.schema !== 1 || typeof snapshot.value.noteId !== "string" || snapshot.key !== ownerKey(scope, snapshot.value.noteId) || snapshot.value.boardId !== noteBoardId(snapshot.value.noteId) || snapshot.value.documentId !== notebookDocumentId(snapshot.value.noteId) || typeof snapshot.value.claimedAt !== "string" || !Number.isFinite(Date.parse(snapshot.value.claimedAt))) return [];
		return [{
			key: snapshot.key,
			...scope,
			value: {
				schema: 1,
				noteId: snapshot.value.noteId,
				documentId: snapshot.value.documentId,
				boardId: snapshot.value.boardId,
				claimedAt: snapshot.value.claimedAt
			}
		}];
	});
	const remoteOriginals = prepared.flatMap((item) => item.remote ? [item.remote] : []);
	const receiptRow = old ?? {
		key: receiptKey,
		...scope,
		value: {
			schema: 1,
			kind: "paper-legacy-image-assets",
			noteId,
			documentId: canonicalId,
			...modernValidation ? { mode: "owned-canonical-validation" } : {},
			originalMarkdown: markdown,
			rewrittenMarkdown: rewritten,
			fingerprint,
			mappings: plan.mappings,
			sourceDrafts: [...drafts.values()].filter((draft) => !!draft),
			sourceClaims,
			bindingReceipts,
			originalFiles,
			...remoteOriginals.length ? { remoteOriginals } : {},
			recoveredAt: now
		}
	};
	if (!old) plan.snapshots.push(receiptRow);
	check$1(current);
	return {
		...plan,
		markdown: rewritten,
		receiptRow
	};
}
//#endregion
//#region src/lib/paperLegacyMigration.ts
var record = (value) => !!value && typeof value === "object" && !Array.isArray(value);
var check = (current) => {
	if (!current()) throw Error("Le compte, l’année ou le texte de la note a changé. Les originaux restent conservés.");
};
var identity = (noteId, scope) => ({
	...scope,
	type: "whiteboard",
	documentId: notebookDocumentId(noteId)
});
var paperInitialMigrationKey = (noteId, scope) => `paper-migration|${scope.accountId}|${scope.spaceId}|whiteboard|${notebookDocumentId(noteId)}`;
var paperLegacyOwnerKey = (noteId, scope) => `paper-legacy-owner|${scope.accountId}|${scope.spaceId}|whiteboard|${noteBoardId(noteId)}`;
var serverId = (value) => typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{0,126}$/.test(value) && !value.includes("..");
var same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function validateScope(noteId, scope, markdown) {
	if (typeof markdown !== "string" || typeof noteId !== "string" || !noteId || noteId.length > 200 || !scope || !["accountId", "spaceId"].every((key) => typeof scope[key] === "string" && /^[A-Za-z0-9._-]{1,200}$/.test(scope[key]))) throw Error("L’identité ou le texte du carnet est incompatible.");
}
function validateSource(draft, expected, noteId) {
	if (!draft) return;
	if (draft.accountId !== expected.accountId || draft.spaceId !== expected.spaceId || draft.type !== expected.type || draft.documentId !== expected.documentId || draft.syncState === "conflict" || draft.staged || draft.identityAlias) throw Error("Cette source doit être départagée avant de créer le carnet.");
	if (expected.type === "notesMarkdown" && (!record(draft.content) || draft.content.id !== noteId)) throw Error("Les métadonnées ne prouvent pas l’identité complète de cette note. Aucun contenu n’est remplacé.");
}
var draftState = (value) => JSON.stringify(value && {
	...value,
	key: void 0
});
var blobState = (value) => JSON.stringify(value && {
	...value,
	blob: void 0,
	key: void 0,
	size: value.blob.size,
	mediaType: value.blob.type
});
/** Two independent reads of the same source must agree before their CAS plans can be joined. */
function mergeImageChecks(commit, plan) {
	for (const incoming of plan.draftChecks) {
		const previous = commit.draftChecks.find((row) => row.identity.accountId === incoming.identity.accountId && row.identity.spaceId === incoming.identity.spaceId && row.identity.type === incoming.identity.type && row.identity.documentId === incoming.identity.documentId);
		if (previous) {
			if (draftState(previous.expected) !== draftState(incoming.expected)) throw Error("La source de la note a changé pendant la récupération de ses images.");
		} else commit.draftChecks.push(incoming);
	}
	for (const incoming of plan.blobChecks) {
		const previous = commit.blobChecks.find((row) => row.identity.accountId === incoming.identity.accountId && row.identity.spaceId === incoming.identity.spaceId && row.identity.id === incoming.identity.id);
		if (previous) {
			if (blobState(previous.expected) !== blobState(incoming.expected)) throw Error("Un original d’image a changé pendant sa récupération.");
		} else commit.blobChecks.push(incoming);
	}
	for (const incoming of plan.snapshotChecks) {
		const previous = commit.snapshotChecks.find((row) => row.key === incoming.key);
		if (previous) {
			if (!same(previous.expected, incoming.expected)) throw Error("Le reçu de propriété d’une image a changé pendant sa récupération.");
		} else commit.snapshotChecks.push(incoming);
	}
	for (const incoming of plan.snapshots) {
		const previous = commit.snapshots.find((row) => row.key === incoming.key);
		if (previous) {
			if (!same(previous, incoming)) throw Error("Deux reçus différents désignent la même source. Aucun original n’est remplacé.");
		} else commit.snapshots.push(incoming);
	}
	for (const incoming of plan.blobs) {
		if (commit.blobs.some((row) => row.id === incoming.id)) throw Error("Deux copies différentes demandent la même identité d’image. Aucun original n’est remplacé.");
		commit.blobs.push(incoming);
	}
}
/** Reuse this migration's proved manifest copy instead of creating a second copy of identical inline bytes. A committed image receipt is immutable. */
async function reuseOwnManifestImages(plan, document, mappings, commit, files, current) {
	if (!plan.snapshotChecks.some((row) => row.key === plan.receiptRow.key && row.expected === void 0)) return;
	const removedIds = /* @__PURE__ */ new Set();
	let changed = false;
	for (const binding of plan.mappings) {
		if (binding.source.kind !== "local" || binding.source.noteId !== document.noteId) continue;
		const matches = mappings.filter((row) => row.sourceId === binding.source.assetId);
		if (new Set(matches.map((row) => row.assetId)).size !== 1) continue;
		const asset = document.assets.find((row) => row.id === matches[0].assetId);
		if (!asset || asset.serverId !== binding.source.serverId || !parsePhotoReference(photoReference(notebookDocumentId(document.noteId), asset.id))) continue;
		const bytes = commit.blobs.find((file) => file.id === asset.id) ?? files.find((file) => file.id === asset.id && (!asset.serverId || file.serverId === asset.serverId));
		if (!bytes) {
			const copy = plan.blobs.find((file) => file.id === binding.assetId), recovered = plan.assets.find((row) => row.id === binding.assetId);
			if (!copy || !recovered || !binding.source.serverId || binding.source.serverId !== asset.serverId) continue;
			const sha256 = await localBlobDigest(copy.blob);
			check(current);
			if (sha256 !== binding.sha256) throw Error("La copie de l’image distante ne correspond plus à ses octets prouvés.");
			const oldId = asset.id;
			matches[0].assetId = binding.assetId;
			document.assets = document.assets.filter((row) => row.id !== oldId);
			document.objects = document.objects.filter((row) => row.kind !== "image" || row.assetId !== oldId);
			continue;
		}
		const sha256 = await localBlobDigest(bytes.blob);
		check(current);
		if (sha256 !== binding.sha256) throw Error("Les octets de l’image inline diffèrent de son original migré. Aucun fichier n’est remplacé.");
		if (binding.assetId !== asset.id) {
			removedIds.add(binding.assetId);
			binding.assetId = asset.id;
			binding.canonicalURL = photoReference(notebookDocumentId(document.noteId), asset.id);
			changed = true;
		}
	}
	if (!changed) return;
	const referenced = new Set(plan.mappings.map((binding) => binding.assetId));
	plan.assets = plan.assets.filter((asset) => !removedIds.has(asset.id) || referenced.has(asset.id));
	for (const id of referenced) {
		const asset = document.assets.find((row) => row.id === id);
		if (asset && !plan.assets.some((row) => row.id === id)) plan.assets.push(asset);
	}
	plan.blobs = plan.blobs.filter((file) => !removedIds.has(file.id) || referenced.has(file.id));
	plan.markdown = rewriteLegacyImageBindings(document.legacy.markdown, plan.mappings);
	plan.receiptRow = {
		...plan.receiptRow,
		value: {
			...plan.receiptRow.value,
			mappings: plan.mappings,
			rewrittenMarkdown: plan.markdown
		}
	};
	plan.snapshots = plan.snapshots.map((row) => row.key === plan.receiptRow.key ? plan.receiptRow : row);
}
/** Prepare owned graph, immutable file associations and recovery receipt without writing anything. */
async function prepareOwnedPaperNotebookMigration(noteId, markdown, scope, current, options = {}) {
	validateScope(noteId, scope, markdown);
	scope = {
		accountId: scope.accountId,
		spaceId: scope.spaceId
	};
	check(current);
	const canonical = identity(noteId, scope), deletion = await readNotebookDeletionStatus(noteId, scope, current);
	check(current);
	if (deletion) throw Error("Ce carnet a été supprimé sur le serveur. Ses sources restent conservées, sans recréation automatique.");
	const target = await getDraft(canonical);
	check(current);
	if (target) throw Error("Un carnet existe déjà pour cette note. Sa version actuelle reste conservée.");
	const historicIdentity = {
		...canonical,
		documentId: legacyNotebookDocumentId(noteId)
	}, historic = historicIdentity.documentId === canonical.documentId ? void 0 : await getDraft(historicIdentity);
	check(current);
	if (historic && (!isPaperDocument(historic.content) || historic.content.noteId === noteId)) throw Error("La version historique de ce carnet doit être reprise avant toute migration initiale.");
	const boardIdentity = {
		...scope,
		type: "whiteboard",
		documentId: noteBoardId(noteId)
	}, rawBoard = await getDraft(boardIdentity);
	check(current);
	const ownedBoard = await readOwnedLegacyNotebookBoard(noteId, scope, current);
	check(current);
	if (rawBoard && !ownedBoard || !same(rawBoard, ownedBoard)) throw Error("L’ancien dessin ne possède plus une identité prouvée pour cette note. Ses originaux restent conservés.");
	validateSource(ownedBoard, boardIdentity, noteId);
	const metadataIdentity = {
		...scope,
		type: "notesMarkdown",
		documentId: noteId
	}, metadata = await getDraft(metadataIdentity);
	check(current);
	validateSource(metadata, metadataIdentity, noteId);
	const migrationKey = paperInitialMigrationKey(noteId, scope), previousMigration = await getSnapshot(migrationKey);
	check(current);
	if (previousMigration) throw Error("Un reçu de migration existe déjà sans carnet courant. Il doit être récupéré avant de continuer.");
	const ownerKey = paperLegacyOwnerKey(noteId, scope), owner = ownedBoard ? await getSnapshot(ownerKey) : void 0;
	check(current);
	if (owner && (owner.accountId !== scope.accountId || owner.spaceId !== scope.spaceId || !record(owner.value) || owner.value.schema !== 1 || owner.value.noteId !== noteId || owner.value.documentId !== canonical.documentId || owner.value.boardId !== boardIdentity.documentId || !Number.isFinite(Date.parse(String(owner.value.claimedAt))))) throw Error("Cet ancien dessin est déjà associé à une autre note. Aucun contenu n’est emprunté.");
	const now = (/* @__PURE__ */ new Date()).toISOString(), document = migratePaper(noteId, markdown, ownedBoard?.content, now);
	if (!isPaperDocument(document)) throw Error("L’ancienne note ne peut pas encore être migrée. Son original reste conservé.");
	const mappings = legacyPaperPhotoIdentities(noteId, ownedBoard?.content), files = await listLocalBlobs(scope.accountId, scope.spaceId);
	check(current);
	const commit = {
		target: scope,
		sources: [scope],
		drafts: [],
		blobs: [],
		snapshots: [],
		draftChecks: [
			{
				identity: canonical,
				expected: void 0
			},
			{
				identity: boardIdentity,
				expected: rawBoard
			},
			{
				identity: metadataIdentity,
				expected: metadata
			}
		],
		blobChecks: [],
		snapshotChecks: [{
			key: migrationKey,
			expected: void 0
		}, {
			key: notebookDeletionKey(canonical),
			expected: void 0
		}]
	};
	if (historicIdentity.documentId !== canonical.documentId) commit.draftChecks.push({
		identity: historicIdentity,
		expected: historic
	});
	if (ownedBoard) commit.snapshotChecks.push({
		key: ownerKey,
		expected: owner
	});
	const scanned = scanLegacyPaperImages(markdown), needsImages = scanned.images.some((image) => image.kind !== "other");
	const ownInlineIds = new Set(scanned.images.flatMap((image) => image.kind === "photo" && image.photo && [
		boardIdentity.documentId,
		noteId,
		historicIdentity.documentId,
		`paper-v3-${noteId}`
	].includes(image.photo.documentId) ? [image.photo.id] : []));
	const checkedFiles = /* @__PURE__ */ new Set(), sourceFiles = /* @__PURE__ */ new Map(), allowedTags = /* @__PURE__ */ new Set([
		boardIdentity.documentId,
		canonical.documentId,
		historicIdentity.documentId,
		`paper-v3-${noteId}`,
		noteId
	]);
	const taggedSources = /* @__PURE__ */ new Map([
		[canonical.documentId, target],
		[boardIdentity.documentId, rawBoard],
		[historicIdentity.documentId, historic]
	]);
	const fileCheck = (id, file) => {
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
	const ownedFile = async (file, mapping) => {
		if (file.accountId !== scope.accountId || file.spaceId !== scope.spaceId || file.documentId && !allowedTags.has(file.documentId)) throw Error("Un fichier est associé à un autre carnet. Son original reste conservé.");
		if (file.documentId) {
			if (!taggedSources.has(file.documentId)) {
				const tagIdentity = {
					...scope,
					type: "whiteboard",
					documentId: file.documentId
				}, tagged = await getDraft(tagIdentity);
				check(current);
				taggedSources.set(file.documentId, tagged);
				commit.draftChecks.push({
					identity: tagIdentity,
					expected: tagged
				});
			}
			const tagged = taggedSources.get(file.documentId);
			if (tagged && (tagged.staged || tagged.syncState === "conflict" || record(tagged.content) && tagged.content.notebookSchema === 3 && (!isPaperDocument(tagged.content) || tagged.content.noteId !== noteId))) throw Error("Le carnet associé à cet original ne possède pas le même propriétaire complet. Aucun fichier n’est emprunté.");
		}
		const variants = new Set(mappings.filter((row) => row.sourceId === mapping.sourceId).map((row) => row.assetId));
		if (!file.documentId && (variants.size !== 1 || file.removedFromNote)) throw Error("L’identité de cet ancien fichier est ambiguë. Ses originaux restent conservés.");
	};
	for (const asset of document.assets) {
		const mapping = mappings.find((row) => row.assetId === asset.id);
		const original = files.find((file) => file.id === mapping.sourceId), destination = files.find((file) => file.id === asset.id);
		fileCheck(mapping.sourceId, original);
		fileCheck(asset.id, destination);
		if (asset.serverId && !serverId(asset.serverId)) throw Error("L’identité serveur d’une photo est incompatible. Son original reste conservé.");
		const canRecoverVersion = (file) => !!options.downloadOriginal && ownInlineIds.has(mapping.sourceId) && !!asset.serverId && file.documentId === boardIdentity.documentId;
		let usableDestination = destination;
		if (destination) {
			await ownedFile(destination, mapping);
			check(current);
			sourceFiles.set(destination.id, destination);
			if (asset.serverId && destination.serverId !== asset.serverId) {
				if (!canRecoverVersion(destination)) throw Error("Le fichier local ne correspond pas à l’original serveur de cette photo. Aucun fichier n’est remplacé.");
				usableDestination = void 0;
			}
		}
		let source = original;
		if (source) {
			await ownedFile(source, mapping);
			check(current);
			sourceFiles.set(source.id, source);
			if (new Set(mappings.filter((row) => row.sourceId === mapping.sourceId).map((row) => row.assetId)).size > 1 && !source.serverId) throw Error("Plusieurs originaux utilisent la même identité locale. Ils doivent être départagés avant la migration.");
			if (asset.serverId && source.serverId !== asset.serverId) {
				if ((mapping.sourceId === asset.id || !source.serverId) && !canRecoverVersion(source)) throw Error("Les octets locaux ne prouvent pas l’identité de la photo serveur.");
				source = void 0;
			}
		}
		if (usableDestination && source && usableDestination.id !== source.id) {
			const originalSha = await localBlobDigest(source.blob);
			check(current);
			const targetSha = await localBlobDigest(usableDestination.blob);
			check(current);
			if (originalSha !== targetSha) throw Error("Une identité remappée possède déjà un autre fichier. Aucun original n’est remplacé.");
		}
		const bytes = usableDestination ?? source;
		if (!bytes) {
			if (!asset.serverId) throw Error(`Le fichier « ${asset.name} » doit être retrouvé avant d’activer cette note. Les sources restent conservées.`);
			continue;
		}
		if (source) sourceFiles.set(source.id, source);
		if (destination) sourceFiles.set(destination.id, destination);
		if (bytes.serverId && !serverId(bytes.serverId)) throw Error("L’identité serveur du fichier local est incompatible.");
		const sha256 = await localBlobDigest(bytes.blob);
		check(current);
		sourceFiles.set(bytes.id, bytes);
		const knownServer = asset.serverId ?? bytes.serverId;
		asset.size = bytes.blob.size;
		asset.mediaType = bytes.blob.type || asset.mediaType;
		if (knownServer) asset.serverId = knownServer;
		if (!usableDestination || usableDestination.documentId !== canonical.documentId || usableDestination.removedFromNote) commit.blobs.push({
			...bytes,
			id: asset.id,
			documentId: canonical.documentId,
			removedFromNote: false,
			sha256,
			revision: (usableDestination?.revision ?? 0) + 1,
			status: knownServer ? "uploaded" : "pending",
			...knownServer ? { serverId: knownServer } : { serverId: void 0 }
		});
	}
	const imagePlan = needsImages ? await prepareLegacyImageAssets({
		noteId,
		markdown,
		scope,
		current,
		targetDocument: document,
		expectedTarget: void 0,
		downloadOriginal: options.downloadOriginal,
		now
	}) : void 0;
	check(current);
	if (imagePlan) {
		await reuseOwnManifestImages(imagePlan, document, mappings, commit, files, current);
		check(current);
		mergeImageChecks(commit, imagePlan);
		for (const asset of imagePlan.assets) {
			const previous = document.assets.find((row) => row.id === asset.id);
			if (previous) {
				if (!same(previous, asset)) throw Error("Cette identité d’image désigne deux originaux différents.");
			} else document.assets.push(asset);
		}
		const linkedAssets = new Set(imagePlan.mappings.flatMap((binding) => binding.source.kind === "local" && binding.source.noteId === noteId ? mappings.filter((row) => row.sourceId === binding.source.assetId && (row.serverId === void 0 || row.serverId === binding.source.serverId)).map((row) => row.assetId) : []));
		document.objects = document.objects.filter((object) => object.kind !== "image" || !linkedAssets.has(object.assetId));
		const root = document.objects.find((object) => object.kind === "text" && object.id === `text-${boardIdentity.documentId}`);
		if (!root) throw Error("Le texte d’origine de la note doit être retrouvé avant sa migration.");
		root.markdown = imagePlan.markdown;
	}
	if (!isPaperDocument(document)) throw Error("Les fichiers ne permettent pas encore une migration valide. Les sources restent conservées.");
	const draft = {
		...canonical,
		title: metadata?.title || "Carnet",
		content: document,
		baseVersion: 0,
		updatedAt: Date.now(),
		syncState: "local"
	};
	commit.drafts.push(draft);
	if (metadata) commit.drafts.push({
		...metadata,
		paperDependency: canonical.documentId,
		syncState: "local",
		updatedAt: Date.now()
	});
	const imageBindings = imagePlan?.mappings ?? [], imageReceiptKeys = imagePlan ? [imagePlan.receiptRow.key] : [];
	const receipt = {
		key: migrationKey,
		...scope,
		value: {
			schema: 1,
			kind: "paper-legacy-initial-migration",
			noteId,
			documentId: canonical.documentId,
			markdown,
			legacy: ownedBoard ?? null,
			sourceMetadata: metadata ?? null,
			migratedAt: now,
			photoIdentities: mappings,
			imageBindings,
			imageReceiptKeys,
			files: [...sourceFiles.values()].map(({ blob, ...file }) => ({
				...file,
				size: blob.size,
				mediaType: blob.type
			})),
			canonical: document
		}
	};
	commit.snapshots.push(receipt);
	if (ownedBoard && !owner && !commit.snapshots.some((row) => row.key === ownerKey)) commit.snapshots.push({
		key: ownerKey,
		...scope,
		value: {
			schema: 1,
			noteId,
			documentId: canonical.documentId,
			boardId: boardIdentity.documentId,
			claimedAt: now
		}
	});
	check(current);
	return {
		draft,
		commit,
		photoIdentities: mappings,
		imageBindings,
		imageReceiptKeys
	};
}
async function ownPreviousMigration(noteId, markdown, scope, current) {
	const deletion = await readNotebookDeletionStatus(noteId, scope, current);
	check(current);
	if (deletion) throw Error("Ce carnet a été supprimé sur le serveur. Ses sources restent conservées, sans recréation automatique.");
	const stored = await getDraft(identity(noteId, scope));
	check(current);
	if (!stored) return;
	const receipt = await getSnapshot(paperInitialMigrationKey(noteId, scope));
	check(current);
	const value = receipt?.value;
	if (!isPaperDocument(stored.content) || stored.content.noteId !== noteId || stored.identityAlias || !receipt || receipt.accountId !== scope.accountId || receipt.spaceId !== scope.spaceId || !record(value) || value.schema !== 1 || value.kind !== "paper-legacy-initial-migration" || value.noteId !== noteId || value.documentId !== stored.documentId || value.markdown !== markdown || !isPaperDocument(value.canonical) || value.canonical.noteId !== noteId) throw Error("Un carnet existe déjà pour cette note. Sa version actuelle n’est pas remplacée.");
	return stored;
}
/** Idempotent for this proved migration, never a replacement for an existing unrelated graph. */
async function migrateOwnedPaperNotebook(noteId, markdown, scope, current, options = {}) {
	validateScope(noteId, scope, markdown);
	scope = {
		accountId: scope.accountId,
		spaceId: scope.spaceId
	};
	check(current);
	const prior = await ownPreviousMigration(noteId, markdown, scope, current);
	if (prior) return prior;
	let plan;
	try {
		plan = await prepareOwnedPaperNotebookMigration(noteId, markdown, scope, current, options);
		check(current);
		await commitNotebookTransfer(plan.commit, current);
	} catch (error) {
		check(current);
		const concurrent = await ownPreviousMigration(noteId, markdown, scope, current);
		if (concurrent) return concurrent;
		throw error;
	}
	check(current);
	const saved = await ownPreviousMigration(noteId, markdown, scope, current);
	if (!saved) throw Error("La migration doit être reprise ; ses sources restent conservées.");
	return saved;
}
//#endregion
export { migrateOwnedPaperNotebook, rewriteLegacyImageBindings as n, paperLegacyOwnerKey, prepareLegacyImageAssets as t };
