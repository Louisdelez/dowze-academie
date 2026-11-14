import { g as notebookDocumentId, s as migratePaper, t as applyPaperCommand } from "./notebookDocument-yuVu6oXC.js";
import { D as saveAudioChunk, _ as localBlobDigest, c as commitNotebookTransfer, g as listSnapshots, i as activateNotebookAppendFiles, j as updateAudioRecordingLease, m as listLocalBlobs, u as getAudioRecordingJournal, x as putLocalBlob } from "./storage-Dsyjb46q.js";
import { n as readPaperAsset } from "./paperAssets-CggUOk-G.js";
import { _ as requestMicrophoneAccess, g as getNativeCapabilities, h as savePaperExport, m as originalAudioExportKind, x as registerNotebookWriter } from "../smart-highlight-independent.mjs";
import { useEffect, useRef, useState } from "react";
import { Fragment, jsxDEV } from "react/jsx-dev-runtime";
import { Download, Merge, Mic, Pause, Play, Scissors, Square, Undo2, Upload, Volume2 } from "lucide-react";
//#region src/lib/paperRecordingLease.ts
async function acquireRecordingLease(scope, onLost) {
	const token = await updateAudioRecordingLease(scope, crypto.randomUUID(), "claim");
	if (!token) return null;
	let valid = true, released = false, tail = Promise.resolve();
	const lost = () => {
		if (!valid) return;
		valid = false;
		clearInterval(timer);
		onLost();
	};
	const timer = setInterval(() => {
		tail = tail.then(async () => {
			if (released) return;
			const next = await updateAudioRecordingLease(scope, token.owner, "renew");
			if (!next) {
				lost();
				return;
			}
			token.expiresAt = next.expiresAt;
		}).catch(lost);
	}, 1e4);
	return {
		token,
		current: () => valid && !released && token.expiresAt > Date.now(),
		release: async () => {
			if (released) return;
			released = true;
			valid = false;
			clearInterval(timer);
			await tail;
			await updateAudioRecordingLease(scope, token.owner, "release");
		}
	};
}
//#endregion
//#region src/lib/paperPcm.ts
/** Small RIFF/PCM utilities shared by capture, recovery, playback exports and deterministic tests. */
var PCM_SECTION_BYTES = 8388608;
function pcmWavHeader(size, sampleRate, channels) {
	if (!Number.isSafeInteger(size) || size <= 0 || size + 36 > 4294967295 || !Number.isInteger(sampleRate) || sampleRate < 8e3 || sampleRate > 192e3 || ![1, 2].includes(channels) || size % (channels * 2)) throw Error("Format PCM incompatible.");
	const bytes = /* @__PURE__ */ new ArrayBuffer(44), v = new DataView(bytes), text = (i, s) => {
		for (let j = 0; j < s.length; j++) v.setUint8(i + j, s.charCodeAt(j));
	};
	text(0, "RIFF");
	v.setUint32(4, 36 + size, true);
	text(8, "WAVE");
	text(12, "fmt ");
	v.setUint32(16, 16, true);
	v.setUint16(20, 1, true);
	v.setUint16(22, channels, true);
	v.setUint32(24, sampleRate, true);
	v.setUint32(28, sampleRate * channels * 2, true);
	v.setUint16(32, channels * 2, true);
	v.setUint16(34, 16, true);
	text(36, "data");
	v.setUint32(40, size, true);
	return bytes;
}
function pcmChunksWav(chunks, sampleRate, channels) {
	const size = chunks.reduce((sum, blob) => sum + blob.size, 0);
	return new Blob([pcmWavHeader(size, sampleRate, channels), ...chunks], { type: "audio/wav" });
}
//#endregion
//#region src/lib/paperRecording.ts
var guard = (current) => {
	if (!current()) throw Error("Le carnet a changé pendant la conservation du son.");
};
var record = (value) => !!value && typeof value === "object" && !Array.isArray(value);
var finite = (value) => typeof value === "number" && Number.isFinite(value);
var validId = (value) => typeof value === "string" && value.length > 0 && value.length <= 200;
function isPcmRecording(value) {
	if (!record(value) || !validId(value.id) || !validId(value.noteId) || typeof value.name !== "string" || value.mimeType !== "audio/wav" || !finite(value.startedAt) || ![
		"recording",
		"recoverable",
		"completed"
	].includes(String(value.status)) || !Number.isSafeInteger(value.size) || Number(value.size) < 0 || !finite(value.duration)) return false;
	const pcm = value.pcm;
	if (!record(pcm) || pcm.schema !== 1 || !Number.isInteger(pcm.sampleRate) || !finite(pcm.sampleRate) || pcm.sampleRate < 8e3 || pcm.sampleRate > 192e3 || !finite(pcm.channels) || ![1, 2].includes(pcm.channels) || !Number.isSafeInteger(pcm.frames) || !finite(pcm.frames) || pcm.frames < 0 || value.size !== pcm.frames * pcm.channels * 2 || !Array.isArray(value.chunkIds) || value.chunkIds.length > 1e5 || !value.chunkIds.every(validId) || new Set(value.chunkIds).size !== value.chunkIds.length) return false;
	if (value.parts !== void 0 && (!Array.isArray(value.parts) || value.parts.length > 1e4)) return false;
	const chunkIds = value.chunkIds;
	let frames = 0;
	const sealed = [], assets = /* @__PURE__ */ new Set();
	for (const part of value.parts ?? []) {
		if (!record(part) || !validId(part.assetId) || assets.has(part.assetId) || !Number.isSafeInteger(part.frames) || !finite(part.frames) || part.frames <= 0 || !Array.isArray(part.chunkIds) || !part.chunkIds.length || !part.chunkIds.every(validId) || !finite(part.offset) || !finite(part.duration) || Math.abs(part.offset - frames / pcm.sampleRate) > .001 || Math.abs(part.duration - part.frames / pcm.sampleRate) > .001) return false;
		assets.add(part.assetId);
		frames += part.frames;
		sealed.push(...part.chunkIds);
	}
	if (frames > pcm.frames || !sealed.every((id, index) => id === chunkIds[index]) || new Set(sealed).size !== sealed.length || Math.abs(value.duration - pcm.frames / pcm.sampleRate) > .001) return false;
	if (!Array.isArray(value.spans) || value.spans.length > 1e5) return false;
	let offset = 0, end = -Infinity;
	for (const span of value.spans) {
		if (!record(span) || !finite(span.start) || !finite(span.end) || !finite(span.offset) || span.end <= span.start || span.start < end - .5 || Math.abs(span.offset - offset) > .002) return false;
		offset += (span.end - span.start) / 1e3;
		end = span.end;
	}
	if (Math.abs(offset - value.duration) > .002) return false;
	if (value.objectMarks !== void 0 && (!record(value.objectMarks) || !Object.entries(value.objectMarks).every(([id, at]) => validId(id) && finite(at)))) return false;
	return true;
}
/** Every raw sample block and its journal become durable in one transaction. */
async function appendRecordingPcm(journal, blob, frames, span, media, current = () => true, lease) {
	guard(current);
	if (!isPcmRecording(journal) || !Number.isSafeInteger(frames) || frames <= 0 || blob.size !== frames * journal.pcm.channels * 2 || blob.size > 16777216 || !Number.isFinite(span.start) || !Number.isFinite(span.end) || span.end <= span.start || Math.abs((span.end - span.start) / 1e3 - frames / journal.pcm.sampleRate) > .002 || span.start < (journal.spans?.at(-1)?.end ?? -Infinity) - .5) throw Error("Une portion audio ne correspond pas au format annoncé.");
	const pcm = journal.pcm, nextSpan = {
		...span,
		offset: pcm.frames / pcm.sampleRate
	}, spans = [...journal.spans ?? []], last = spans.at(-1);
	if (last && Math.abs(last.end - nextSpan.start) < .5 && Math.abs(last.offset + (last.end - last.start) / 1e3 - nextSpan.offset) < .002) spans[spans.length - 1] = {
		...last,
		end: nextSpan.end
	};
	else spans.push(nextSpan);
	const next = {
		...journal,
		pcm: {
			...pcm,
			frames: pcm.frames + frames
		},
		chunkIds: [...journal.chunkIds, `${journal.id}-${String(journal.chunkIds.length).padStart(6, "0")}`],
		size: journal.size + blob.size,
		duration: (pcm.frames + frames) / pcm.sampleRate,
		spans
	};
	const saved = await saveAudioChunk(media.accountId, media.spaceId, next, blob, {
		lease,
		...lease ? { expectedRevision: journal.writeRevision ?? 0 } : {}
	});
	guard(current);
	return saved;
}
/** Sections are valid WAV files. Raw sample blocks remain untouched as the recovery source. */
async function sealRecordingPcm(journal, media, final = false, current = () => true, sectionBytes = PCM_SECTION_BYTES, lease) {
	guard(current);
	if (!isPcmRecording(journal)) throw Error("Le journal audio doit être récupéré avant de préparer ses sections.");
	const pcm = journal.pcm, parts = journal.parts ?? [], used = parts.reduce((sum, part) => sum + part.chunkIds.length, 0), ids = journal.chunkIds.slice(used);
	if (!ids.length) return journal;
	const files = await listLocalBlobs(media.accountId, media.spaceId);
	guard(current);
	const chunks = ids.map((id) => {
		const file = files.find((f) => f.id === id);
		if (!file) throw Error("Une portion audio reste à récupérer. Les autres sont conservées.");
		return file.blob;
	}), bytes = chunks.reduce((sum, blob) => sum + blob.size, 0);
	if (parts.length && !final && bytes < sectionBytes) return journal;
	if (bytes + 44 > 16777216) throw Error("Une section audio dépasse sa capacité. Ses morceaux bruts restent conservés.");
	const frames = bytes / (pcm.channels * 2), offset = parts.reduce((sum, part) => sum + part.frames, 0) / pcm.sampleRate, blob = pcmChunksWav(chunks, pcm.sampleRate, pcm.channels), assetId = `${journal.id}-section-${String(parts.length).padStart(5, "0")}`, sha256 = await localBlobDigest(blob);
	guard(current);
	const existing = files.find((f) => f.id === assetId);
	if (existing && (existing.sha256 ?? await localBlobDigest(existing.blob)) !== sha256) throw Error("Cette section utilise déjà une autre référence. Les deux sources sont conservées.");
	if (!existing) await putLocalBlob({
		accountId: media.accountId,
		spaceId: media.spaceId,
		documentId: notebookDocumentId(journal.noteId),
		id: assetId,
		name: `${journal.name} — section ${parts.length + 1}`,
		blob,
		sha256,
		createdAt: Date.now(),
		status: "pending",
		removedFromNote: true
	});
	guard(current);
	const part = {
		assetId,
		chunkIds: ids,
		frames,
		offset,
		duration: frames / pcm.sampleRate
	}, next = {
		...journal,
		parts: [...parts, part]
	};
	const saved = await saveAudioChunk(media.accountId, media.spaceId, next, void 0, {
		lease,
		...lease ? { expectedRevision: journal.writeRevision ?? 0 } : {}
	});
	guard(current);
	return saved;
}
async function recordingPcmCommands(journal, document, media, current = () => true) {
	guard(current);
	if (document.noteId !== journal.noteId || !isPcmRecording(journal) || !journal.parts?.length) throw Error("Les sections de cet enregistrement attendent leur récupération.");
	const files = await listLocalBlobs(media.accountId, media.spaceId);
	guard(current);
	const commands = [], parts = journal.parts;
	for (const part of parts) {
		const file = files.find((f) => f.id === part.assetId);
		if (!file || file.blob.size !== part.frames * journal.pcm.channels * 2 + 44) throw Error("Une section audio doit être retrouvée avant sa publication.");
		const existing = document.assets.find((a) => a.id === part.assetId);
		commands.push({
			type: "add-asset",
			asset: {
				...existing,
				id: part.assetId,
				name: file.name,
				mediaType: "audio/wav",
				size: file.blob.size
			}
		});
	}
	const last = parts.at(-1), duration = last.offset + last.duration, track = {
		id: journal.id,
		assetId: parts[0].assetId,
		name: journal.name,
		duration,
		startedAt: journal.startedAt,
		inProgress: journal.status === "recording",
		segments: parts.map((p) => ({
			assetId: p.assetId,
			offset: p.offset,
			duration: p.duration
		}))
	};
	commands.push({
		type: "add-audio",
		audio: track
	});
	for (const object of document.objects) {
		if (object.audioAnchor?.sessionId === journal.id) continue;
		const writtenAt = journal.objectMarks && Object.hasOwn(journal.objectMarks, object.id) ? journal.objectMarks[object.id] : object.createdAt;
		const span = journal.spans?.find((s) => writtenAt >= s.start && writtenAt <= s.end);
		if (span) {
			const time = Math.min(duration, span.offset + (writtenAt - span.start) / 1e3);
			commands.push({
				type: "patch-object",
				id: object.id,
				patch: { audioAnchor: {
					sessionId: journal.id,
					time
				} }
			});
		}
	}
	return {
		commands,
		assetIds: parts.map((p) => p.assetId),
		track
	};
}
//#endregion
//#region src/lib/paperAudioEditing.ts
async function probePaperAudio(blob) {
	return new Promise((resolve, reject) => {
		const url = URL.createObjectURL(blob), audio = document.createElement("audio");
		let seeking = false, finished = false;
		const timer = setTimeout(() => finish(Error("La durée de ce son ne peut pas être déterminée.")), 1e4);
		const finish = (value) => {
			if (finished) return;
			finished = true;
			audio.onloadedmetadata = null;
			audio.ondurationchange = null;
			audio.onseeked = null;
			audio.onerror = null;
			clearTimeout(timer);
			audio.pause();
			audio.removeAttribute("src");
			audio.load();
			URL.revokeObjectURL(url);
			value instanceof Error ? reject(value) : resolve(value);
		};
		const inspect = () => {
			if (Number.isFinite(audio.duration) && audio.duration > 0) finish(audio.duration);
			else if (!seeking && audio.readyState >= 1) {
				seeking = true;
				try {
					audio.currentTime = 0xe8d4a51000;
				} catch {
					finish(Error("Le fichier ne contient pas une durée audio lisible."));
				}
			}
		};
		audio.preload = "metadata";
		audio.onloadedmetadata = inspect;
		audio.ondurationchange = inspect;
		audio.onseeked = inspect;
		audio.onerror = () => finish(Error("Ce fichier audio ne peut pas être lu ici."));
		audio.src = url;
	});
}
var AUDIO_SOURCE_CHUNK_BYTES = 8388608;
var receiptKey = (media, noteId, id) => `audio-source-import|${JSON.stringify([
	media.accountId,
	media.spaceId,
	noteId,
	id
])}`;
var check = (current) => {
	if (!current()) throw Error("Le carnet a changé pendant la préparation du son.");
};
function sameAudioSource(a, b) {
	return a === b || !!a && !!b && a.schema === b.schema && a.mediaType === b.mediaType && a.size === b.size && a.originalName === b.originalName && a.chunks.length === b.chunks.length && a.chunks.every((chunk, index) => chunk.assetId === b.chunks[index].assetId && chunk.size === b.chunks[index].size && chunk.sha256 === b.chunks[index].sha256);
}
function audioSourceCommands(track) {
	if (!track.source) throw Error("La source de ce son doit être récupérée.");
	return [...track.source.chunks.map((chunk, index) => ({
		type: "add-asset",
		asset: {
			id: chunk.assetId,
			name: `${track.name} — original ${index + 1}/${track.source.chunks.length}`,
			mediaType: "application/octet-stream",
			size: chunk.size
		}
	})), {
		type: "add-audio",
		audio: track
	}];
}
function validReceipt(value, noteId) {
	const receipt = value;
	if (!receipt || receipt.schema !== 1 || receipt.kind !== "paper-audio-source" || receipt.noteId !== noteId || ![
		"staged",
		"published",
		"attached"
	].includes(receipt.status)) return false;
	try {
		applyPaperCommand(migratePaper(noteId, "", null), {
			type: "batch",
			commands: audioSourceCommands(receipt.track)
		});
		return true;
	} catch {
		return false;
	}
}
function audioSourceMime(file) {
	const named = {
		mp3: "audio/mpeg",
		m4a: "audio/mp4",
		mp4: "audio/mp4",
		wav: "audio/wav",
		ogg: "audio/ogg",
		flac: "audio/flac",
		aac: "audio/aac",
		webm: "audio/webm",
		aiff: "audio/aiff",
		aif: "audio/aiff"
	};
	const extension = file.name?.split(".").at(-1)?.toLowerCase();
	if (extension && named[extension]) return named[extension];
	if (/^audio\//.test(file.type)) return file.type;
	throw Error("Choisissez un fichier audio, par exemple MP3, M4A, MP4 ou WAV.");
}
/** Preserve encoded bytes; only the browser's actual decoder decides whether this source is playable. */
async function importAudioSource(file, noteId, media, current = () => true, onProgress) {
	check(current);
	if (!file.size || file.size > 268435456) throw Error("Le fichier audio doit contenir entre 1 octet et 256 Mo. Son original reste disponible.");
	const mediaType = audioSourceMime(file), duration = await probePaperAudio(file.slice(0, void 0, mediaType));
	check(current);
	return stageAudioSource(file, file.name ?? "Son importé", mediaType, duration, noteId, media, current, onProgress);
}
/** No bytes become uploadable before the note references the complete ordered source. */
async function stageAudioSource(file, name, mediaType, duration, noteId, media, current = () => true, onProgress) {
	check(current);
	if (!file.size || file.size > 268435456 || !Number.isFinite(duration) || duration <= 0) throw Error("La source audio doit être lisible et posséder une durée.");
	const id = crypto.randomUUID(), blobs = [], chunks = [];
	for (let offset = 0; offset < file.size; offset += AUDIO_SOURCE_CHUNK_BYTES) {
		check(current);
		const blob = file.slice(offset, offset + AUDIO_SOURCE_CHUNK_BYTES, "application/octet-stream"), assetId = crypto.randomUUID(), sha256 = await localBlobDigest(blob);
		check(current);
		chunks.push({
			assetId,
			size: blob.size,
			sha256
		});
		blobs.push({
			accountId: media.accountId,
			spaceId: media.spaceId,
			id: assetId,
			documentId: notebookDocumentId(noteId),
			name: `${name} — original`,
			blob,
			sha256,
			revision: 1,
			createdAt: Date.now(),
			status: "pending",
			removedFromNote: true
		});
		onProgress?.(Math.min(offset + AUDIO_SOURCE_CHUNK_BYTES, file.size), file.size);
	}
	const receipt = {
		schema: 1,
		kind: "paper-audio-source",
		noteId,
		track: {
			id,
			assetId: chunks[0].assetId,
			name,
			duration,
			startedAt: Date.now(),
			source: {
				schema: 1,
				originalName: name,
				mediaType,
				size: file.size,
				chunks
			}
		},
		status: "staged"
	};
	if (!validReceipt(receipt, noteId)) throw Error("Les informations de cette source audio sont incompatibles.");
	const snapshot = {
		key: receiptKey(media, noteId, id),
		accountId: media.accountId,
		spaceId: media.spaceId,
		value: receipt
	};
	await commitNotebookTransfer({
		target: media,
		sources: [],
		drafts: [],
		blobs,
		snapshots: [snapshot],
		draftChecks: [],
		blobChecks: blobs.map((row) => ({
			identity: row,
			expected: void 0
		})),
		snapshotChecks: [{
			key: snapshot.key,
			expected: void 0
		}]
	}, current);
	return receipt;
}
async function readPaperAudioSource(track, document, media, current = () => true, onProgress) {
	const source = track.source;
	if (!source) {
		const asset = document.assets.find((a) => a.id === track.assetId);
		if (!asset) throw Error("La source audio doit être récupérée.");
		return readPaperAsset(asset, media);
	}
	const pieces = [];
	let total = 0;
	for (const chunk of source.chunks) {
		check(current);
		const asset = document.assets.find((a) => a.id === chunk.assetId);
		if (!asset) throw Error("Une portion de l’original audio doit être retrouvée.");
		const blob = await readPaperAsset(asset, media);
		check(current);
		if (blob.size !== chunk.size || await localBlobDigest(blob) !== chunk.sha256) throw Error("Une portion de l’original audio est incomplète. Les autres restent conservées.");
		pieces.push(blob);
		total += blob.size;
		onProgress?.(total, source.size);
	}
	check(current);
	if (total !== source.size) throw Error("L’original audio attend sa récupération.");
	return new Blob(pieces, { type: source.mediaType });
}
async function pendingAudioSources(noteId, media) {
	return (await listSnapshots(media.accountId, media.spaceId)).filter((snapshot) => snapshot.key.startsWith("audio-source-import|") && validReceipt(snapshot.value, noteId) && ["staged", "published"].includes(snapshot.value.status)).map((snapshot) => snapshot.value);
}
async function markAudioSourcePublished(receipt, media, current) {
	return setAudioSourceStatus(receipt, media, current, "published");
}
async function finishAudioSource(receipt, media, current) {
	return setAudioSourceStatus(receipt, media, current, "attached");
}
async function setAudioSourceStatus(receipt, media, current, status) {
	const key = receiptKey(media, receipt.noteId, receipt.track.id), previous = (await listSnapshots(media.accountId, media.spaceId)).find((s) => s.key === key);
	if (!validReceipt(previous?.value, receipt.noteId)) throw Error("Le reçu de la source audio doit être retrouvé.");
	await commitNotebookTransfer({
		target: media,
		sources: [],
		drafts: [],
		blobs: [],
		snapshots: [{
			...previous,
			value: {
				...previous.value,
				status: previous.value.status === "attached" ? "attached" : status
			}
		}],
		draftChecks: [],
		blobChecks: [],
		snapshotChecks: [{
			key,
			expected: previous
		}]
	}, current);
}
//#endregion
//#region src/lib/paperAudioTimeline.ts
var audioSegments = (track) => track.segments ?? [{
	assetId: track.assetId,
	offset: 0,
	duration: track.duration
}];
function audioPosition(track, time) {
	const parts = audioSegments(track), global = Math.max(0, Math.min(Number.isFinite(time) ? time : 0, track.duration));
	let index = parts.findIndex((part, i) => global < part.offset + part.duration || i === parts.length - 1);
	if (index < 0) index = 0;
	return {
		index,
		local: Math.max(0, global - parts[index].offset),
		global
	};
}
//#endregion
//#region src/components/PaperAudioTrack.tsx
var _jsxFileName$2 = "/home/louis/DowzeBuild/20260923/collections-060/src/components/PaperAudioTrack.tsx";
var clock$1 = (seconds) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
/** One visible timeline, including old single-file tracks and long multi-section recordings. */
function PaperAudioTrack({ track, document, media, onNotice, pendingSeek }) {
	const element = useRef(null), parts = audioSegments(track), [index, setIndex] = useState(0), [url, setUrl] = useState(""), [rate, setRate] = useState("1"), [position, setPosition] = useState(0), [playing, setPlaying] = useState(false), [loading, setLoading] = useState(false), request = useRef(null), desired = useRef(false), positionRef = useRef(0);
	positionRef.current = position;
	const part = parts[index] ?? parts[0], sourceKey = (part.source ?? track.source)?.chunks.map((chunk) => `${chunk.assetId}:${chunk.sha256}`).join("|") ?? "", asset = document.assets.find((a) => a.id === part.assetId), scope = useRef("");
	scope.current = `${media.accountId}|${media.spaceId}|${document.noteId}|${track.id}|${sourceKey}`;
	const cache = useRef({
		scope: scope.current,
		alive: true,
		keep: /* @__PURE__ */ new Set(),
		urls: /* @__PURE__ */ new Map(),
		tasks: /* @__PURE__ */ new Map()
	});
	if (cache.current.scope !== scope.current) cache.current = {
		scope: scope.current,
		alive: true,
		keep: /* @__PURE__ */ new Set(),
		urls: /* @__PURE__ */ new Map(),
		tasks: /* @__PURE__ */ new Map()
	};
	useEffect(() => {
		const owner = cache.current;
		owner.alive = true;
		return () => {
			owner.alive = false;
			for (const url of owner.urls.values()) URL.revokeObjectURL(url);
			owner.urls.clear();
		};
	}, [
		media.accountId,
		media.spaceId,
		document.noteId,
		track.id,
		sourceKey
	]);
	useEffect(() => {
		let cancelled = false;
		const owner = cache.current;
		owner.keep = new Set([part.assetId, parts[index + 1]?.assetId].filter((id) => !!id));
		const load = async (id) => {
			const existing = owner.urls.get(id);
			if (existing) return existing;
			const pending = owner.tasks.get(id);
			if (pending) return pending;
			const source = document.assets.find((a) => a.id === id);
			if (!source) throw Error("Une section audio attend sa récupération.");
			const descriptor = parts.find((p) => p.assetId === id)?.source ?? (id === track.assetId ? track.source : void 0);
			const task = (descriptor ? readPaperAudioSource({
				...track,
				assetId: id,
				segments: void 0,
				source: descriptor
			}, document, media, () => owner.alive && cache.current === owner && owner.keep.has(id)) : readPaperAsset(source, media)).then((blob) => {
				if (cache.current !== owner || !owner.alive || !owner.keep.has(id)) throw Error("Le carnet a changé pendant le chargement du son.");
				const url = URL.createObjectURL(blob);
				owner.urls.set(id, url);
				return url;
			}).finally(() => owner.tasks.delete(id));
			owner.tasks.set(id, task);
			return task;
		};
		if (!owner.urls.has(part.assetId)) {
			setLoading(true);
			setUrl("");
		}
		load(part.assetId).then((value) => {
			if (!cancelled) {
				setUrl(value);
				setLoading(false);
			}
		}).catch((e) => {
			if (!cancelled) {
				setLoading(false);
				onNotice(String(e instanceof Error ? e.message : e));
			}
		});
		const next = parts[index + 1];
		if (next) load(next.assetId).catch(() => {});
		const keep = /* @__PURE__ */ new Set([part.assetId, next?.assetId]);
		for (const [id, url] of owner.urls) if (!keep.has(id)) {
			URL.revokeObjectURL(url);
			owner.urls.delete(id);
		}
		return () => {
			cancelled = true;
		};
	}, [
		index,
		asset?.id,
		asset?.serverId,
		media.accountId,
		media.spaceId,
		track.segments?.length,
		sourceKey
	]);
	const seek = (time, play = desired.current) => {
		const next = audioPosition(track, time);
		request.current = {
			time: next.local,
			play
		};
		setPosition(next.global);
		if (next.index !== index) {
			setIndex(next.index);
			return;
		}
		if (element.current && element.current.readyState >= 1) {
			element.current.currentTime = next.local;
			request.current = null;
			if (play) element.current.play().catch(() => {
				desired.current = false;
				setPlaying(false);
			});
		}
	};
	useEffect(() => {
		if (pendingSeek?.sessionId === track.id) seek(pendingSeek.time, true);
	}, [pendingSeek?.key]);
	const ready = () => {
		const audio = element.current;
		if (!audio) return;
		audio.playbackRate = Number(rate);
		const next = request.current;
		request.current = null;
		if (next) audio.currentTime = Math.min(next.time, Number.isFinite(audio.duration) ? audio.duration : next.time);
		if (next?.play || desired.current) audio.play().catch(() => {
			desired.current = false;
			setPlaying(false);
		});
	};
	const toggle = () => {
		const audio = element.current;
		if (!audio) return;
		desired.current = !desired.current;
		if (desired.current) {
			if (position >= track.duration && !track.inProgress) seek(0, true);
			else audio.play().catch((e) => onNotice(String(e)));
		} else audio.pause();
	};
	return /* @__PURE__ */ jsxDEV("div", {
		className: "paper-audio-track",
		children: [
			/* @__PURE__ */ jsxDEV(Volume2, {}, void 0, false, {
				fileName: _jsxFileName$2,
				lineNumber: 24,
				columnNumber: 44
			}, this),
			/* @__PURE__ */ jsxDEV("strong", { children: track.name }, void 0, false, {
				fileName: _jsxFileName$2,
				lineNumber: 24,
				columnNumber: 54
			}, this),
			/* @__PURE__ */ jsxDEV("button", {
				"aria-label": playing ? `Mettre en pause ${track.name}` : `Écouter ${track.name}`,
				disabled: !url || loading,
				onClick: toggle,
				children: playing ? /* @__PURE__ */ jsxDEV(Pause, {}, void 0, false, {
					fileName: _jsxFileName$2,
					lineNumber: 24,
					columnNumber: 219
				}, this) : /* @__PURE__ */ jsxDEV(Play, {}, void 0, false, {
					fileName: _jsxFileName$2,
					lineNumber: 24,
					columnNumber: 228
				}, this)
			}, void 0, false, {
				fileName: _jsxFileName$2,
				lineNumber: 24,
				columnNumber: 83
			}, this),
			/* @__PURE__ */ jsxDEV("audio", {
				hidden: true,
				ref: element,
				preload: "metadata",
				src: url || void 0,
				"aria-label": track.name,
				onLoadedMetadata: ready,
				onPlay: () => {
					desired.current = true;
					setPlaying(true);
				},
				onPause: () => setPlaying(false),
				onTimeUpdate: () => {
					if (element.current) setPosition(Math.min(track.duration, part.offset + element.current.currentTime));
				},
				onEnded: () => {
					if (index + 1 < parts.length) {
						request.current = {
							time: 0,
							play: true
						};
						setIndex(index + 1);
					} else {
						desired.current = false;
						setPlaying(false);
						setPosition(track.duration);
					}
				},
				onError: () => {
					if (!url || loading) return;
					desired.current = false;
					setPlaying(false);
					onNotice("Cette section audio attend sa récupération. Son original est conservé.");
				}
			}, void 0, false, {
				fileName: _jsxFileName$2,
				lineNumber: 24,
				columnNumber: 245
			}, this),
			/* @__PURE__ */ jsxDEV("input", {
				type: "range",
				min: "0",
				max: Math.max(.001, track.duration),
				step: "0.01",
				value: Math.min(position, track.duration),
				"aria-label": `Position dans ${track.name}`,
				onChange: (e) => seek(Number(e.target.value))
			}, void 0, false, {
				fileName: _jsxFileName$2,
				lineNumber: 25,
				columnNumber: 2
			}, this),
			/* @__PURE__ */ jsxDEV("span", {
				className: "paper-audio-time",
				children: [
					clock$1(position),
					" / ",
					clock$1(track.duration)
				]
			}, void 0, true, {
				fileName: _jsxFileName$2,
				lineNumber: 25,
				columnNumber: 207
			}, this),
			/* @__PURE__ */ jsxDEV("select", {
				"aria-label": `Vitesse de ${track.name}`,
				value: rate,
				onChange: (e) => {
					setRate(e.target.value);
					if (element.current) element.current.playbackRate = Number(e.target.value);
				},
				children: [
					"0.5",
					"0.75",
					"1",
					"1.25",
					"1.5",
					"2"
				].map((v) => /* @__PURE__ */ jsxDEV("option", {
					value: v,
					children: [v, "×"]
				}, v, true, {
					fileName: _jsxFileName$2,
					lineNumber: 25,
					columnNumber: 509
				}, this))
			}, void 0, false, {
				fileName: _jsxFileName$2,
				lineNumber: 25,
				columnNumber: 292
			}, this),
			loading && /* @__PURE__ */ jsxDEV("span", {
				role: "status",
				children: "Chargement du son…"
			}, void 0, false, {
				fileName: _jsxFileName$2,
				lineNumber: 25,
				columnNumber: 569
			}, this),
			track.inProgress && /* @__PURE__ */ jsxDEV("span", { children: "En cours" }, void 0, false, {
				fileName: _jsxFileName$2,
				lineNumber: 25,
				columnNumber: 634
			}, this)
		]
	}, void 0, true, {
		fileName: _jsxFileName$2,
		lineNumber: 24,
		columnNumber: 9
	}, this);
}
//#endregion
//#region src/lib/paperAudioCapture.worklet.js?url
var paperAudioCapture_worklet_default = "data:text/javascript;base64,LyogV29ya2xldCBzdGF5cyBvbiB0aGUgYXVkaW8gdGhyZWFkLiBOb3RoaW5nIGlzIHNlbnQgdW50aWwgdGhlIG93bmVyIHN0YXJ0cyBhIHJlY29yZGluZy4gKi8KY2xhc3MgRG93emVQY21DYXB0dXJlIGV4dGVuZHMgQXVkaW9Xb3JrbGV0UHJvY2Vzc29yIHsKIGNvbnN0cnVjdG9yKCl7c3VwZXIoKTt0aGlzLnJ1bm5pbmc9ZmFsc2U7dGhpcy5wYXVzZWQ9ZmFsc2U7dGhpcy5zYW1wbGVzPW5ldyBJbnQxNkFycmF5KE1hdGgubWF4KDEyOCxNYXRoLnJvdW5kKHNhbXBsZVJhdGUpKSk7dGhpcy51c2VkPTA7dGhpcy5zdGFydEZyYW1lPTA7dGhpcy5lbmRGcmFtZT0wOwogIHRoaXMucG9ydC5vbm1lc3NhZ2U9ZXZlbnQ9Pntjb25zdCBjb21tYW5kPWV2ZW50LmRhdGE/LmNvbW1hbmQ7aWYoY29tbWFuZD09PSdzdGFydCcpe3RoaXMucnVubmluZz10cnVlO3RoaXMucGF1c2VkPWZhbHNlO31lbHNlIGlmKGNvbW1hbmQ9PT0ncGF1c2UnKXt0aGlzLmZsdXNoKCk7dGhpcy5wYXVzZWQ9dHJ1ZTt0aGlzLnBvcnQucG9zdE1lc3NhZ2Uoe3R5cGU6J3BhdXNlZCd9KTt9ZWxzZSBpZihjb21tYW5kPT09J3Jlc3VtZScpe3RoaXMucGF1c2VkPWZhbHNlO3RoaXMucG9ydC5wb3N0TWVzc2FnZSh7dHlwZToncmVzdW1lZCd9KTt9ZWxzZSBpZihjb21tYW5kPT09J3N0b3AnKXt0aGlzLmZsdXNoKCk7dGhpcy5ydW5uaW5nPWZhbHNlO3RoaXMucG9ydC5wb3N0TWVzc2FnZSh7dHlwZTonc3RvcHBlZCd9KTt9fTsKIH0KIGZsdXNoKCl7aWYoIXRoaXMudXNlZClyZXR1cm47Y29uc3QgYnl0ZXM9dGhpcy5zYW1wbGVzLmJ1ZmZlci5zbGljZSgwLHRoaXMudXNlZCoyKTt0aGlzLnBvcnQucG9zdE1lc3NhZ2Uoe3R5cGU6J3BjbScsYnVmZmVyOmJ5dGVzLGZyYW1lczp0aGlzLnVzZWQsc3RhcnRGcmFtZTp0aGlzLnN0YXJ0RnJhbWUsZW5kRnJhbWU6dGhpcy5lbmRGcmFtZX0sW2J5dGVzXSk7dGhpcy51c2VkPTA7fQogcHJvY2VzcyhpbnB1dHMsb3V0cHV0cyl7Zm9yKGNvbnN0IG91dHB1dCBvZiBvdXRwdXRzKWZvcihjb25zdCBjaGFubmVsIG9mIG91dHB1dCljaGFubmVsLmZpbGwoMCk7aWYoIXRoaXMucnVubmluZ3x8dGhpcy5wYXVzZWQpcmV0dXJuIHRydWU7Y29uc3QgaW5wdXQ9aW5wdXRzWzBdPy5bMF07aWYoIWlucHV0KXJldHVybiB0cnVlOwogIGZvcihsZXQgaT0wO2k8aW5wdXQubGVuZ3RoO2krKyl7aWYoIXRoaXMudXNlZCl0aGlzLnN0YXJ0RnJhbWU9Y3VycmVudEZyYW1lK2k7Y29uc3QgdmFsdWU9TWF0aC5tYXgoLTEsTWF0aC5taW4oMSxpbnB1dFtpXXx8MCkpO3RoaXMuc2FtcGxlc1t0aGlzLnVzZWQrK109TWF0aC5yb3VuZCh2YWx1ZSoodmFsdWU8MD8zMjc2ODozMjc2NykpO3RoaXMuZW5kRnJhbWU9Y3VycmVudEZyYW1lK2krMTtpZih0aGlzLnVzZWQ9PT10aGlzLnNhbXBsZXMubGVuZ3RoKXRoaXMuZmx1c2goKTt9cmV0dXJuIHRydWU7CiB9Cn0KcmVnaXN0ZXJQcm9jZXNzb3IoJ2Rvd3plLXBjbS1jYXB0dXJlJyxEb3d6ZVBjbUNhcHR1cmUpOwo=";
//#endregion
//#region src/lib/paperPcmCapture.ts
/** One microphone stream and one audio graph for the whole recording, including pause/resume. */
var PaperPcmCapture = class PaperPcmCapture {
	context;
	source;
	node;
	state = "inactive";
	mimeType = "audio/wav";
	channels = 1;
	frames = 0;
	ondataavailable = null;
	onstop = null;
	onerror = null;
	origin;
	stopping = false;
	timer;
	constructor(context, source, node) {
		this.context = context;
		this.source = source;
		this.node = node;
		this.origin = Date.now() - context.currentTime * 1e3;
		node.port.onmessage = (event) => {
			const value = event.data;
			if (value?.type === "pcm") {
				if (!(value.buffer instanceof ArrayBuffer) || !Number.isInteger(value.frames) || value.frames <= 0 || value.buffer.byteLength !== value.frames * 2) return;
				this.frames += value.frames;
				this.ondataavailable?.({
					data: new Blob([value.buffer], { type: "application/octet-stream" }),
					frames: value.frames,
					start: this.origin + value.startFrame / this.sampleRate * 1e3,
					end: this.origin + value.endFrame / this.sampleRate * 1e3
				});
			} else if (value?.type === "stopped") this.finish();
		};
		node.onprocessorerror = () => {
			this.onerror?.(Error("La capture audio a été interrompue. Les parties déjà conservées restent récupérables."));
			this.stop();
		};
	}
	get sampleRate() {
		return this.context.sampleRate;
	}
	static async create(stream) {
		if (typeof AudioContext === "undefined" || typeof AudioWorkletNode === "undefined") throw Error("La capture audio continue n’est pas disponible ici.");
		const context = new AudioContext();
		try {
			await context.audioWorklet.addModule(paperAudioCapture_worklet_default);
			const source = context.createMediaStreamSource(stream), node = new AudioWorkletNode(context, "dowze-pcm-capture", {
				numberOfInputs: 1,
				numberOfOutputs: 1,
				channelCount: 1,
				channelCountMode: "explicit",
				outputChannelCount: [1]
			});
			source.connect(node);
			node.connect(context.destination);
			await context.resume();
			if (context.state !== "running") throw Error("L’audio doit être activé avant l’enregistrement.");
			return new PaperPcmCapture(context, source, node);
		} catch (error) {
			await context.close();
			throw error;
		}
	}
	start() {
		if (this.state !== "inactive") return;
		this.state = "recording";
		this.node.port.postMessage({ command: "start" });
	}
	pause() {
		if (this.state !== "recording") return;
		this.state = "paused";
		this.node.port.postMessage({ command: "pause" });
	}
	resume() {
		if (this.state !== "paused") return;
		this.state = "recording";
		this.node.port.postMessage({ command: "resume" });
	}
	stop() {
		if (this.stopping) return;
		this.stopping = true;
		this.state = "inactive";
		this.node.port.postMessage({ command: "stop" });
		this.timer = setTimeout(() => {
			this.onerror?.(Error("La dernière portion audio n’a pas été confirmée. Les parties conservées restent récupérables."));
			this.finish();
		}, 2e3);
	}
	finish() {
		if (!this.stopping) this.stopping = true;
		if (this.timer) clearTimeout(this.timer);
		this.node.port.onmessage = null;
		this.source.disconnect();
		this.node.disconnect();
		this.state = "inactive";
		this.context.close();
		const stopped = this.onstop;
		this.onstop = null;
		stopped?.();
	}
};
//#endregion
//#region src/lib/paperTrackAudio.ts
async function wavPcmSource(blob) {
	if (blob.size < 44) return null;
	const buffer = await blob.slice(0, 44).arrayBuffer(), v = new DataView(buffer), text = (offset, n) => new TextDecoder().decode(new Uint8Array(buffer, offset, n));
	if (text(0, 4) !== "RIFF" || text(8, 4) !== "WAVE" || text(12, 4) !== "fmt " || text(36, 4) !== "data" || v.getUint32(16, true) !== 16 || v.getUint16(20, true) !== 1 || v.getUint16(34, true) !== 16) return null;
	const channels = v.getUint16(22, true), sampleRate = v.getUint32(24, true), size = v.getUint32(40, true);
	if (![1, 2].includes(channels) || sampleRate < 8e3 || sampleRate > 192e3 || size + 44 !== blob.size || !size || size % (channels * 2)) return null;
	return {
		sampleRate,
		channels,
		raw: blob.slice(44),
		frames: size / (channels * 2)
	};
}
/** A trim loads only the intersected sections; valid PCM sections can be sliced without decoding the course. */
async function readPaperAudioRange(track, document, media, start = 0, end = track.duration, current = () => true, options = {}) {
	if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end > track.duration + .001 || end <= start) throw Error("Choisissez un début et une fin dans la durée du son.");
	const result = [];
	for (const part of audioSegments(track)) {
		if (!current()) throw Error("Le carnet a changé pendant la préparation du son.");
		const from = Math.max(start, part.offset), to = Math.min(end, part.offset + part.duration);
		if (to <= from) continue;
		const asset = document.assets.find((a) => a.id === part.assetId);
		if (!asset) throw Error("Une section du son doit être récupérée.");
		const descriptor = part.source ?? track.source, blob = descriptor ? await readPaperAudioSource({
			...track,
			assetId: part.assetId,
			segments: void 0,
			source: descriptor
		}, document, media, current) : await readPaperAsset(asset, media);
		if (!current()) throw Error("Le carnet a changé pendant la préparation du son.");
		if (from === part.offset && to === part.offset + part.duration) {
			result.push({
				blob,
				duration: part.duration,
				...descriptor ? { source: descriptor } : {}
			});
			continue;
		}
		const source = await wavPcmSource(blob);
		if (source) {
			const first = Math.floor((from - part.offset) * source.sampleRate), last = Math.min(source.frames, Math.ceil((to - part.offset) * source.sampleRate)), raw = source.raw.slice(first * source.channels * 2, last * source.channels * 2);
			const limit = Math.floor(PCM_SECTION_BYTES / (source.channels * 2)) * (source.channels * 2);
			for (let offset = 0; offset < raw.size; offset += limit) {
				const section = raw.slice(offset, offset + limit);
				result.push({
					blob: pcmChunksWav([section], source.sampleRate, source.channels),
					duration: section.size / (source.channels * 2) / source.sampleRate
				});
			}
		} else {
			const { convertPaperAudio } = await import("./paperAudioConvert-CsorXSVy.js");
			result.push(...await convertPaperAudio(blob, from - part.offset, to - part.offset, {
				...options,
				current: () => current() && options.current?.() !== false
			}));
		}
	}
	return result;
}
/** The WAV header describes all sample sections; original audio containers are never blindly concatenated. */
async function buildPaperTrackWav(track, document, media, current = () => true, options = {}) {
	const pieces = await readPaperAudioRange(track, document, media, 0, track.duration, current, options), sources = await Promise.all(pieces.map((piece) => wavPcmSource(piece.blob)));
	const uniform = sources.every((source) => source && source.sampleRate === sources[0]?.sampleRate && source.channels === sources[0]?.channels);
	let raw = [], sampleRate = 48e3, channels = 2, size = 0;
	if (!uniform && Math.ceil(track.duration * 48e3) * 4 + 44 > 268435456) throw Error("Cet export WAV dépasse 256 Mo. Choisissez un extrait ; l’original est conservé.");
	const append = (blob) => {
		size += blob.size;
		if (size + 44 > 268435456) throw Error("Cet export WAV dépasse 256 Mo. Le son original et son archive sont conservés.");
		raw.push(blob);
	};
	if (uniform) {
		sampleRate = sources[0].sampleRate;
		channels = sources[0].channels;
		for (const source of sources) {
			if (!current()) throw Error("Le carnet a changé pendant l’export.");
			append(source.raw);
		}
	} else {
		const { convertPaperAudio } = await import("./paperAudioConvert-CsorXSVy.js");
		for (const piece of pieces) {
			if (!current()) throw Error("Le carnet a changé pendant l’export.");
			for (const converted of await convertPaperAudio(piece.blob, 0, piece.duration, {
				...options,
				current: () => current() && options.current?.() !== false
			})) {
				const source = await wavPcmSource(converted.blob);
				if (!source) throw Error("Le résultat audio est invalide.");
				append(source.raw);
			}
		}
	}
	return pcmChunksWav(raw, sampleRate, channels);
}
//#endregion
//#region src/components/PaperAudioEditor.tsx
var _jsxFileName$1 = "/home/louis/DowzeBuild/20260923/collections-060/src/components/PaperAudioEditor.tsx";
function PaperAudioEditor({ document, media, disabled, onCommit, whenSaved, onNotice }) {
	const latest = useRef({
		document,
		media,
		onCommit,
		whenSaved,
		disabled,
		onNotice,
		epoch: 0
	});
	const scopeKey = `${media.accountId}|${media.spaceId}|${document.noteId}`, owner = useRef({
		scope: scopeKey,
		generation: 0
	});
	if (owner.current.scope !== scopeKey) owner.current = {
		scope: scopeKey,
		generation: owner.current.generation + 1
	};
	latest.current = {
		document,
		media,
		onCommit,
		whenSaved,
		disabled,
		onNotice,
		epoch: owner.current.generation
	};
	const [busy, setBusy] = useState(false), [first, setFirst] = useState(""), [second, setSecond] = useState(""), [start, setStart] = useState("0"), [end, setEnd] = useState(""), [exportUrl, setExportUrl] = useState(""), [exportName, setExportName] = useState("son.wav"), [pendingSources, setPendingSources] = useState([]), [progress, setProgress] = useState("");
	const input = useRef(null), actions = useRef(/* @__PURE__ */ new Set()), mounted = useRef(true), writable = useRef(true), conversion = useRef(null);
	const sameScope = (original) => {
		const now = latest.current;
		return mounted.current && now.epoch === original.epoch && now.document.noteId === original.document.noteId && now.media.accountId === original.media.accountId && now.media.spaceId === original.media.spaceId;
	};
	useEffect(() => {
		mounted.current = true;
		return () => {
			mounted.current = false;
			conversion.current?.abort();
		};
	}, [scopeKey]);
	useEffect(() => registerNotebookWriter(media.accountId, {
		flush: () => {
			conversion.current?.abort();
		},
		settled: async () => {
			await Promise.all([...actions.current].map((task) => task.catch((error) => {
				if (error?.name !== "AbortError") throw error;
			})));
		},
		suspend: () => {
			writable.current = false;
		},
		resume: () => {
			writable.current = true;
		}
	}), [
		document.noteId,
		media.accountId,
		media.spaceId
	]);
	const action = async (work) => {
		if (!writable.current || busy || actions.current.size) return;
		setBusy(true);
		setProgress("");
		const controller = new AbortController();
		conversion.current = controller;
		const promise = Promise.resolve().then(work);
		actions.current.add(promise);
		try {
			await promise;
		} catch (error) {
			onNotice(String(error instanceof Error ? error.message : error));
		} finally {
			actions.current.delete(promise);
			if (conversion.current === controller) conversion.current = null;
			setBusy(false);
		}
	};
	useEffect(() => () => {
		if (exportUrl) URL.revokeObjectURL(exportUrl);
	}, [exportUrl]);
	const addPieces = async (pieces, name, original) => {
		const current = () => sameScope(original) && writable.current && !conversion.current?.signal.aborted;
		if (!current()) return;
		const commands = [], assetIds = [], segments = [];
		let offset = 0;
		for (const piece of pieces) {
			if (!current()) return;
			if (piece.source) {
				for (const chunk of piece.source.chunks) {
					const asset = original.document.assets.find((a) => a.id === chunk.assetId);
					if (!asset) throw Error("Une portion de l’original reste à retrouver.");
					commands.push({
						type: "add-asset",
						asset
					});
				}
				segments.push({
					assetId: piece.source.chunks[0].assetId,
					offset,
					duration: piece.duration,
					source: piece.source
				});
				offset += piece.duration;
				continue;
			}
			if (piece.blob.size > 16777216) throw Error("Cette section audio dépasse 16 Mo. Ses originaux restent disponibles.");
			const id = crypto.randomUUID();
			await putLocalBlob({
				id,
				accountId: original.media.accountId,
				spaceId: original.media.spaceId,
				documentId: notebookDocumentId(original.document.noteId),
				blob: piece.blob,
				name,
				createdAt: Date.now(),
				status: "pending",
				removedFromNote: true
			});
			assetIds.push(id);
			segments.push({
				assetId: id,
				offset,
				duration: piece.duration
			});
			offset += piece.duration;
			commands.push({
				type: "add-asset",
				asset: {
					id,
					name,
					mediaType: piece.blob.type || "application/octet-stream",
					size: piece.blob.size
				}
			});
		}
		if (!current() || !segments.length) return;
		commands.push({
			type: "add-audio",
			audio: {
				id: crypto.randomUUID(),
				assetId: segments[0].assetId,
				name,
				duration: offset,
				startedAt: Date.now(),
				segments
			}
		});
		if (!latest.current.onCommit({
			type: "batch",
			commands
		})) throw Error("Les fichiers sont conservés ; leur ajout à la note attend sa récupération.");
		await latest.current.whenSaved();
		await activateNotebookAppendFiles({
			...original.media,
			type: "whiteboard",
			documentId: notebookDocumentId(original.document.noteId)
		}, assetIds, current);
		if (current()) onNotice("Son ajouté à la note. Les enregistrements d’origine sont conservés.");
	};
	const sourceProgress = (done, total) => setProgress(`Original : ${Math.round(done / total * 100)} %`);
	const attachSource = async (receipt, original) => {
		const current = () => sameScope(original) && writable.current && !latest.current.disabled;
		if (!current()) return;
		const blank = migratePaper(original.document.noteId, "", null), sourceDocument = applyPaperCommand(blank, {
			type: "batch",
			commands: audioSourceCommands(receipt.track)
		});
		await readPaperAudioSource(receipt.track, sourceDocument, original.media, current, sourceProgress);
		if (!current()) return;
		const existing = latest.current.document.audio.find((a) => a.id === receipt.track.id);
		if (receipt.status === "published" && !existing) return;
		if (existing && !sameAudioSource(existing.source, receipt.track.source)) throw Error("Une autre piste possède cette référence. Ses originaux restent conservés.");
		if (!existing && !latest.current.onCommit({
			type: "batch",
			commands: audioSourceCommands(receipt.track)
		})) throw Error("L’original audio est conservé. Son ajout attend la récupération de la note.");
		await latest.current.whenSaved();
		await markAudioSourcePublished(receipt, original.media, current);
		if (!latest.current.document.audio.some((a) => a.id === receipt.track.id)) return;
		await activateNotebookAppendFiles({
			...original.media,
			type: "whiteboard",
			documentId: notebookDocumentId(original.document.noteId)
		}, receipt.track.source.chunks.map((c) => c.assetId), current);
		await finishAudioSource(receipt, original.media, current);
		if (current()) {
			setPendingSources(await pendingAudioSources(original.document.noteId, original.media));
			onNotice("Son importé. Son fichier original est conservé intégralement.");
		}
	};
	const importFile = async (file) => {
		const original = latest.current, current = () => sameScope(original) && writable.current && !latest.current.disabled, receipt = await importAudioSource(file, original.document.noteId, original.media, current, sourceProgress);
		if (current()) setPendingSources(await pendingAudioSources(original.document.noteId, original.media));
		await attachSource(receipt, original);
	};
	useEffect(() => {
		const original = latest.current;
		if (actions.current.size) return;
		let disposed = false;
		const task = (async () => {
			const receipts = await pendingAudioSources(original.document.noteId, original.media);
			if (disposed || !sameScope(original)) return;
			setPendingSources(receipts);
			if (!receipts.length || original.disabled || !writable.current) return;
			setBusy(true);
			try {
				for (const receipt of receipts) {
					if (disposed || !sameScope(original)) return;
					await attachSource(receipt, original);
				}
			} catch (error) {
				if (!disposed && sameScope(original)) onNotice(String(error instanceof Error ? error.message : error));
			} finally {
				if (sameScope(original)) setBusy(false);
			}
		})();
		actions.current.add(task);
		task.finally(() => actions.current.delete(task)).catch(() => {});
		return () => {
			disposed = true;
		};
	}, [
		scopeKey,
		disabled,
		document.audio.map((track) => track.id).join("|")
	]);
	const conversionOptions = () => ({
		signal: conversion.current?.signal,
		onProgress: (done, total) => setProgress(`Conversion locale : ${Math.round(done / total * 100)} %`)
	});
	const chosen = document.audio.find((a) => a.id === first), other = document.audio.find((a) => a.id === second);
	return /* @__PURE__ */ jsxDEV("details", {
		className: "paper-audio-editor",
		children: [/* @__PURE__ */ jsxDEV("summary", { children: "Importer, couper ou assembler un son" }, void 0, false, {
			fileName: _jsxFileName$1,
			lineNumber: 35,
			columnNumber: 49
		}, this), /* @__PURE__ */ jsxDEV("div", {
			className: "paper-audio-edit-actions",
			children: [
				/* @__PURE__ */ jsxDEV("button", {
					disabled: disabled || busy,
					onClick: () => input.current?.click(),
					children: [/* @__PURE__ */ jsxDEV(Upload, {}, void 0, false, {
						fileName: _jsxFileName$1,
						lineNumber: 35,
						columnNumber: 217
					}, this), "Importer un son"]
				}, void 0, true, {
					fileName: _jsxFileName$1,
					lineNumber: 35,
					columnNumber: 146
				}, this),
				/* @__PURE__ */ jsxDEV("input", {
					hidden: true,
					ref: input,
					type: "file",
					accept: "audio/*,.mp3,.m4a,.mp4,.wav,.ogg,.flac,.aac,.webm,.aiff",
					"aria-label": "Son à importer",
					onChange: (e) => {
						const f = e.target.files?.[0];
						e.target.value = "";
						if (f) action(() => importFile(f));
					}
				}, void 0, false, {
					fileName: _jsxFileName$1,
					lineNumber: 35,
					columnNumber: 250
				}, this),
				pendingSources.filter((receipt) => receipt.status === "staged" || document.audio.some((track) => track.id === receipt.track.id)).map((receipt) => /* @__PURE__ */ jsxDEV("button", {
					disabled: disabled || busy,
					onClick: () => void action(() => attachSource(receipt, latest.current)),
					children: ["Terminer l’import de ", receipt.track.name]
				}, receipt.track.id, true, {
					fileName: _jsxFileName$1,
					lineNumber: 35,
					columnNumber: 610
				}, this)),
				document.audio.length > 0 && /* @__PURE__ */ jsxDEV(Fragment, { children: [/* @__PURE__ */ jsxDEV("label", { children: ["Son", /* @__PURE__ */ jsxDEV("select", {
					"aria-label": "Son à éditer",
					value: first,
					onChange: (e) => {
						setFirst(e.target.value);
						setStart("0");
						setEnd(String(document.audio.find((a) => a.id === e.target.value)?.duration ?? ""));
					},
					children: [/* @__PURE__ */ jsxDEV("option", {
						value: "",
						children: "Choisir…"
					}, void 0, false, {
						fileName: _jsxFileName$1,
						lineNumber: 35,
						columnNumber: 1005
					}, this), document.audio.map((a) => /* @__PURE__ */ jsxDEV("option", {
						value: a.id,
						children: a.name
					}, a.id, false, {
						fileName: _jsxFileName$1,
						lineNumber: 35,
						columnNumber: 1062
					}, this))]
				}, void 0, true, {
					fileName: _jsxFileName$1,
					lineNumber: 35,
					columnNumber: 825
				}, this)] }, void 0, true, {
					fileName: _jsxFileName$1,
					lineNumber: 35,
					columnNumber: 815
				}, this), chosen && /* @__PURE__ */ jsxDEV(Fragment, { children: [
					/* @__PURE__ */ jsxDEV("label", { children: ["Nom", /* @__PURE__ */ jsxDEV("input", {
						"aria-label": "Nom du son sélectionné",
						defaultValue: chosen.name,
						maxLength: 200,
						disabled: disabled || busy,
						onBlur: (e) => {
							const name = e.target.value.trim();
							if (name && name !== chosen.name) onCommit({
								type: "add-audio",
								audio: {
									...chosen,
									name
								}
							});
						}
					}, chosen.id + chosen.name, false, {
						fileName: _jsxFileName$1,
						lineNumber: 35,
						columnNumber: 1151
					}, this)] }, void 0, true, {
						fileName: _jsxFileName$1,
						lineNumber: 35,
						columnNumber: 1141
					}, this),
					/* @__PURE__ */ jsxDEV("label", { children: ["Début (s)", /* @__PURE__ */ jsxDEV("input", {
						"aria-label": "Début de l’extrait audio",
						type: "number",
						min: "0",
						max: chosen.duration,
						step: "0.1",
						value: start,
						onChange: (e) => setStart(e.target.value)
					}, void 0, false, {
						fileName: _jsxFileName$1,
						lineNumber: 35,
						columnNumber: 1444
					}, this)] }, void 0, true, {
						fileName: _jsxFileName$1,
						lineNumber: 35,
						columnNumber: 1428
					}, this),
					/* @__PURE__ */ jsxDEV("label", { children: ["Fin (s)", /* @__PURE__ */ jsxDEV("input", {
						"aria-label": "Fin de l’extrait audio",
						type: "number",
						min: "0",
						max: chosen.duration,
						step: "0.1",
						value: end,
						onChange: (e) => setEnd(e.target.value)
					}, void 0, false, {
						fileName: _jsxFileName$1,
						lineNumber: 35,
						columnNumber: 1620
					}, this)] }, void 0, true, {
						fileName: _jsxFileName$1,
						lineNumber: 35,
						columnNumber: 1606
					}, this),
					/* @__PURE__ */ jsxDEV("button", {
						disabled: disabled || busy,
						onClick: () => void action(async () => {
							const original = latest.current, pieces = await readPaperAudioRange(chosen, original.document, original.media, Number(start), Number(end), () => sameScope(original), conversionOptions());
							await addPieces(pieces, `${chosen.name} — extrait`, original);
						}),
						children: [/* @__PURE__ */ jsxDEV(Scissors, {}, void 0, false, {
							fileName: _jsxFileName$1,
							lineNumber: 35,
							columnNumber: 2083
						}, this), "Créer l’extrait"]
					}, void 0, true, {
						fileName: _jsxFileName$1,
						lineNumber: 35,
						columnNumber: 1776
					}, this),
					/* @__PURE__ */ jsxDEV("button", {
						disabled: busy,
						onClick: () => void action(async () => {
							const original = latest.current, blob = await buildPaperTrackWav(chosen, original.document, original.media, () => sameScope(original), conversionOptions());
							if (!sameScope(original)) return;
							await savePaperExport(blob, "son.wav", "wav");
							if (!sameScope(original)) return;
							setExportName("son.wav");
							setExportUrl(URL.createObjectURL(blob));
							onNotice("Export WAV préparé.");
						}),
						children: [/* @__PURE__ */ jsxDEV(Download, {}, void 0, false, {
							fileName: _jsxFileName$1,
							lineNumber: 35,
							columnNumber: 2529
						}, this), "Exporter en WAV"]
					}, void 0, true, {
						fileName: _jsxFileName$1,
						lineNumber: 35,
						columnNumber: 2118
					}, this),
					chosen.source && /* @__PURE__ */ jsxDEV("button", {
						disabled: busy,
						onClick: () => void action(async () => {
							const original = latest.current, blob = await readPaperAudioSource(chosen, original.document, original.media, () => sameScope(original), sourceProgress);
							if (!sameScope(original)) return;
							const kind = originalAudioExportKind(chosen.source.mediaType, chosen.source.originalName), name = (chosen.source.originalName ?? chosen.name).replace(/[\\/\u0000-\u001f]/g, "_");
							await savePaperExport(blob, name, kind);
							if (sameScope(original)) {
								setExportName(name);
								setExportUrl(URL.createObjectURL(blob));
								onNotice("Original audio exporté sans modification.");
							}
						}),
						children: [/* @__PURE__ */ jsxDEV(Download, {}, void 0, false, {
							fileName: _jsxFileName$1,
							lineNumber: 35,
							columnNumber: 3165
						}, this), "Exporter l’original"]
					}, void 0, true, {
						fileName: _jsxFileName$1,
						lineNumber: 35,
						columnNumber: 2580
					}, this),
					/* @__PURE__ */ jsxDEV("label", { children: ["Ajouter ensuite", /* @__PURE__ */ jsxDEV("select", {
						"aria-label": "Second son à assembler",
						value: second,
						onChange: (e) => setSecond(e.target.value),
						children: [/* @__PURE__ */ jsxDEV("option", {
							value: "",
							children: "Choisir…"
						}, void 0, false, {
							fileName: _jsxFileName$1,
							lineNumber: 35,
							columnNumber: 3326
						}, this), document.audio.filter((a) => a.id !== first).map((a) => /* @__PURE__ */ jsxDEV("option", {
							value: a.id,
							children: a.name
						}, a.id, false, {
							fileName: _jsxFileName$1,
							lineNumber: 35,
							columnNumber: 3407
						}, this))]
					}, void 0, true, {
						fileName: _jsxFileName$1,
						lineNumber: 35,
						columnNumber: 3227
					}, this)] }, void 0, true, {
						fileName: _jsxFileName$1,
						lineNumber: 35,
						columnNumber: 3205
					}, this),
					/* @__PURE__ */ jsxDEV("button", {
						disabled: disabled || busy || !other,
						onClick: () => void action(async () => {
							const original = latest.current, pieces = [...await readPaperAudioRange(chosen, original.document, original.media, 0, chosen.duration, () => sameScope(original)), ...await readPaperAudioRange(other, original.document, original.media, 0, other.duration, () => sameScope(original))];
							await addPieces(pieces, `${chosen.name} + ${other.name}`, original);
						}),
						children: [/* @__PURE__ */ jsxDEV(Merge, {}, void 0, false, {
							fileName: _jsxFileName$1,
							lineNumber: 35,
							columnNumber: 3886
						}, this), "Assembler les sons"]
					}, void 0, true, {
						fileName: _jsxFileName$1,
						lineNumber: 35,
						columnNumber: 3475
					}, this)
				] }, void 0, true, {
					fileName: _jsxFileName$1,
					lineNumber: 35,
					columnNumber: 1139
				}, this)] }, void 0, true, {
					fileName: _jsxFileName$1,
					lineNumber: 35,
					columnNumber: 813
				}, this),
				exportUrl && /* @__PURE__ */ jsxDEV("a", {
					href: exportUrl,
					download: exportName,
					children: ["Télécharger ", exportName]
				}, void 0, true, {
					fileName: _jsxFileName$1,
					lineNumber: 35,
					columnNumber: 3941
				}, this),
				busy && /* @__PURE__ */ jsxDEV(Fragment, { children: [/* @__PURE__ */ jsxDEV("span", {
					role: "status",
					children: progress || "Préparation du son…"
				}, void 0, false, {
					fileName: _jsxFileName$1,
					lineNumber: 35,
					columnNumber: 4021
				}, this), progress.startsWith("Conversion") && /* @__PURE__ */ jsxDEV("button", {
					onClick: () => conversion.current?.abort(),
					children: "Annuler la conversion"
				}, void 0, false, {
					fileName: _jsxFileName$1,
					lineNumber: 35,
					columnNumber: 4117
				}, this)] }, void 0, true, {
					fileName: _jsxFileName$1,
					lineNumber: 35,
					columnNumber: 4019
				}, this)
			]
		}, void 0, true, {
			fileName: _jsxFileName$1,
			lineNumber: 35,
			columnNumber: 104
		}, this)]
	}, void 0, true, {
		fileName: _jsxFileName$1,
		lineNumber: 35,
		columnNumber: 9
	}, this);
}
function chooseRecordingMime() {
	if (typeof MediaRecorder === "undefined") return void 0;
	return [
		"audio/webm;codecs=opus",
		"audio/mp4",
		"audio/ogg;codecs=opus",
		"audio/webm"
	].find((type) => MediaRecorder.isTypeSupported(type));
}
async function recordingBlob(journal, media) {
	const blobs = await listLocalBlobs(media.accountId, media.spaceId);
	const chunks = [];
	for (const id of journal.chunkIds) {
		const chunk = blobs.find((b) => b.id === id);
		if (!chunk) throw Error("Une partie de l’enregistrement n’est pas disponible. Les autres parties sont conservées.");
		chunks.push(chunk.blob);
	}
	if (!chunks.length) throw Error("Cet enregistrement ne contient pas encore de son.");
	const blob = new Blob(chunks, { type: journal.mimeType });
	if (blob.size > 16777216) throw Error("L’enregistrement dépasse 16 Mo.");
	return blob;
}
async function recoverableRecordings(noteId, media) {
	const prefix = `audio-recording|${media.accountId}|${media.spaceId}|${noteId}|`;
	return (await listSnapshots(media.accountId, media.spaceId)).filter((s) => s.key.startsWith(prefix)).map((s) => s.value).filter((j) => j && typeof j.id === "string" && j.noteId === noteId && ["recording", "recoverable"].includes(j.status) && Array.isArray(j.chunkIds) && j.chunkIds.length > 0);
}
//#endregion
//#region src/components/PaperAudioControls.tsx
var _jsxFileName = "/home/louis/DowzeBuild/20260923/collections-060/src/components/PaperAudioControls.tsx";
var clock = (seconds) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
function PaperAudioControls({ document, media, disabled, onCommit, onRecordingCommit, whenSaved, onNotice, requestedSeek }) {
	const latest = useRef({
		document,
		disabled,
		onCommit,
		onRecordingCommit,
		whenSaved,
		onNotice,
		accountId: media.accountId,
		spaceId: media.spaceId
	});
	latest.current = {
		document,
		disabled,
		onCommit,
		onRecordingCommit,
		whenSaved,
		onNotice,
		accountId: media.accountId,
		spaceId: media.spaceId
	};
	const active = useRef(null), mounted = useRef(true), writable = useRef(true), finalizations = useRef(/* @__PURE__ */ new Set()), starting = useRef(false), recovering = useRef(false);
	const scopeKey = `${media.accountId}|${media.spaceId}|${document.noteId}`, owner = useRef({
		scope: scopeKey,
		generation: 0
	});
	if (owner.current.scope !== scopeKey) owner.current = {
		scope: scopeKey,
		generation: owner.current.generation + 1
	};
	const epoch = owner.current.generation, currentView = () => mounted.current && owner.current.generation === epoch && owner.current.scope === scopeKey;
	const [recording, setRecording] = useState(false), [paused, setPaused] = useState(false), [seconds, setSeconds] = useState(0), [busy, setBusy] = useState(false), [recoveries, setRecoveries] = useState([]), [expanded, setExpanded] = useState(false), [pendingSeek, setPendingSeek] = useState(null);
	useEffect(() => {
		const seek = (event) => {
			const target = event.detail;
			if (target?.noteId !== document.noteId || !document.audio.some((a) => a.id === target.sessionId) || !Number.isFinite(target.time)) return;
			setExpanded(true);
			setPendingSeek({
				key: crypto.randomUUID(),
				sessionId: target.sessionId,
				time: target.time
			});
		};
		addEventListener("dowze:audio-seek", seek);
		return () => removeEventListener("dowze:audio-seek", seek);
	}, [document.noteId, document.audio]);
	useEffect(() => {
		if (requestedSeek && document.audio.some((a) => a.id === requestedSeek.sessionId)) {
			setExpanded(true);
			setPendingSeek(requestedSeek);
		}
	}, [requestedSeek?.key]);
	const duration = (r) => r.recorder instanceof PaperPcmCapture ? r.recorder.frames / r.recorder.sampleRate : r.elapsed + (r.recorder.state === "recording" ? (performance.now() - r.resumedAt) / 1e3 : 0);
	const updateRecoveries = () => recoverableRecordings(document.noteId, media).then((records) => {
		if (currentView()) setRecoveries(records);
	});
	useEffect(() => {
		mounted.current = true;
		setRecording(false);
		setPaused(false);
		setBusy(false);
		setRecoveries([]);
		setPendingSeek(null);
		updateRecoveries().catch(() => {});
		return () => {
			mounted.current = false;
			const current = active.current;
			if (current && current.recorder.state !== "inactive") current.recorder.stop();
		};
	}, [
		document.noteId,
		media.accountId,
		media.spaceId
	]);
	useEffect(() => registerNotebookWriter(media.accountId, {
		flush: async () => {
			const r = active.current;
			if (r) {
				stop();
				await r.finished;
			}
		},
		settled: async () => {
			await Promise.all([...finalizations.current]);
		},
		suspend: () => {
			writable.current = false;
		},
		resume: () => {
			writable.current = true;
		}
	}), [
		document.noteId,
		media.accountId,
		media.spaceId
	]);
	useEffect(() => {
		const authored = (event) => {
			const detail = event.detail, r = active.current;
			if (!r || r.recorder.state !== "recording" || !r.journal.pcm || detail?.accountId !== media.accountId || detail.spaceId !== media.spaceId || detail.noteId !== r.journal.noteId || !Array.isArray(detail.ids) || !Number.isFinite(detail.at)) return;
			const marks = { ...r.journal.objectMarks };
			for (const id of detail.ids) if (typeof id === "string" && !Object.hasOwn(marks, id)) Object.defineProperty(marks, id, {
				value: detail.at,
				writable: true,
				enumerable: true,
				configurable: true
			});
			r.journal = {
				...r.journal,
				objectMarks: marks
			};
		};
		addEventListener("dowze:paper-authored", authored);
		return () => removeEventListener("dowze:paper-authored", authored);
	}, [
		document.noteId,
		media.accountId,
		media.spaceId
	]);
	useEffect(() => {
		if (!recording) return;
		const interval = setInterval(() => {
			if (active.current) setSeconds(duration(active.current));
		}, 1e3);
		return () => clearInterval(interval);
	}, [recording]);
	const publish = async (journal, lease, segments) => {
		if (!lease.current() || !currentView() || latest.current.document.noteId !== journal.noteId || latest.current.accountId !== media.accountId || latest.current.spaceId !== media.spaceId) return;
		if (journal.pcm) {
			const originalScope = `${media.accountId}|${media.spaceId}|${journal.noteId}`, current = () => lease.current() && currentView() && `${latest.current.accountId}|${latest.current.spaceId}|${latest.current.document.noteId}` === originalScope;
			const { commands, assetIds } = await recordingPcmCommands(journal, latest.current.document, media, current);
			if (!current()) return;
			if (!latest.current.onRecordingCommit({
				type: "batch",
				commands
			})) throw Error("Le son attend la récupération de la note. Ses morceaux restent conservés.");
			await latest.current.whenSaved();
			await activateNotebookAppendFiles({
				...media,
				type: "whiteboard",
				documentId: notebookDocumentId(journal.noteId)
			}, assetIds, current);
			if (journal.status !== "recording") await saveAudioChunk(media.accountId, media.spaceId, {
				...journal,
				status: "completed"
			}, void 0, {
				lease: lease.token,
				expectedRevision: journal.writeRevision ?? 0
			});
			if (currentView()) {
				setExpanded(true);
				updateRecoveries();
			}
			return;
		}
		const blob = await recordingBlob(journal, media), assetId = journal.id, sha256 = await localBlobDigest(blob), current = latest.current.document, old = (await listLocalBlobs(media.accountId, media.spaceId)).find((file) => file.id === assetId);
		if (old && (old.sha256 ?? await localBlobDigest(old.blob)) !== sha256) throw Error("Une autre source porte déjà cette référence. Les deux sont conservées.");
		if (!lease.current() || !currentView()) return;
		if (!old) await putLocalBlob({
			id: assetId,
			documentId: notebookDocumentId(journal.noteId),
			accountId: media.accountId,
			spaceId: media.spaceId,
			blob,
			sha256,
			name: journal.name,
			createdAt: Date.now(),
			status: "pending",
			removedFromNote: true
		});
		const existing = current.audio.find((a) => a.id === journal.id), commands = [{
			type: "add-asset",
			asset: {
				...current.assets.find((a) => a.id === assetId),
				id: assetId,
				name: journal.name,
				mediaType: journal.mimeType,
				size: blob.size
			}
		}, {
			type: "add-audio",
			audio: {
				...existing,
				id: journal.id,
				assetId,
				name: existing?.name ?? journal.name,
				duration: journal.duration,
				startedAt: journal.startedAt,
				inProgress: false
			}
		}];
		if (segments) for (const object of current.objects) {
			const span = segments.find((s) => object.createdAt >= s.start && object.createdAt <= s.end);
			if (span) commands.push({
				type: "patch-object",
				id: object.id,
				patch: { audioAnchor: {
					sessionId: journal.id,
					time: Math.min(journal.duration, span.offset + (object.createdAt - span.start) / 1e3)
				} }
			});
		}
		const stillCurrent = () => lease.current() && currentView() && latest.current.document.noteId === journal.noteId;
		if (!stillCurrent()) return;
		if (!latest.current.onRecordingCommit({
			type: "batch",
			commands
		})) throw Error("Le son est récupérable, mais la note ne peut pas encore être modifiée.");
		await latest.current.whenSaved();
		await activateNotebookAppendFiles({
			...media,
			type: "whiteboard",
			documentId: notebookDocumentId(journal.noteId)
		}, [assetId], stillCurrent);
		await saveAudioChunk(media.accountId, media.spaceId, {
			...journal,
			status: "completed"
		}, void 0, {
			lease: lease.token,
			expectedRevision: journal.writeRevision ?? 0
		});
		if (currentView()) {
			latest.current.onNotice("Son conservé avec la note.");
			setExpanded(true);
			updateRecoveries();
		}
	};
	const start = async () => {
		if (disabled || !writable.current || active.current || busy || starting.current || recovering.current) return;
		starting.current = true;
		const sourceScope = `${media.accountId}|${media.spaceId}|${document.noteId}`, currentStart = () => currentView() && writable.current && `${latest.current.accountId}|${latest.current.spaceId}|${latest.current.document.noteId}` === sourceScope;
		setBusy(true);
		let stream, prepared, lease = null, attached = false;
		try {
			lease = await acquireRecordingLease({
				accountId: media.accountId,
				spaceId: media.spaceId,
				noteId: document.noteId
			}, () => {
				const r = active.current;
				if (r && r.lease === lease && r.recorder.state !== "inactive") r.recorder.stop();
				if (currentView()) latest.current.onNotice("L’enregistrement est arrêté pour conserver sa source. La reprise du son se fera automatiquement.");
			});
			if (!lease) {
				if (currentView()) latest.current.onNotice("Un autre onglet enregistre ou récupère déjà le son de cette note.");
				return;
			}
			if (!currentStart()) return;
			if (!navigator.mediaDevices?.getUserMedia) throw Error("L’enregistrement au microphone n’est pas disponible dans ce navigateur.");
			if ((await getNativeCapabilities()).microphoneAccessRequest) {
				const allowed = await requestMicrophoneAccess();
				if (allowed === "denied" || allowed === "restricted") throw Error("L’accès au microphone doit être autorisé dans les réglages du système.");
			}
			stream = await navigator.mediaDevices.getUserMedia({ audio: true });
			if (!currentStart()) {
				stream.getTracks().forEach((t) => t.stop());
				return;
			}
			const mime = chooseRecordingMime();
			const recorder = typeof AudioWorkletNode !== "undefined" && typeof AudioContext !== "undefined" ? await PaperPcmCapture.create(stream) : new MediaRecorder(stream, mime ? { mimeType: mime } : {}), id = crypto.randomUUID(), now = Date.now();
			prepared = recorder;
			if (!currentStart()) {
				if (recorder instanceof PaperPcmCapture) recorder.stop();
				stream.getTracks().forEach((t) => t.stop());
				return;
			}
			let finish, fail;
			const finished = new Promise((resolve, reject) => {
				finish = resolve;
				fail = reject;
			});
			finished.catch(() => {});
			const r = {
				lease,
				finished,
				finish,
				fail,
				recorder,
				stream,
				journal: {
					id,
					noteId: document.noteId,
					mimeType: recorder.mimeType,
					name: `Enregistrement ${new Intl.DateTimeFormat("fr-CH", {
						dateStyle: "short",
						timeStyle: "short"
					}).format(now)}`,
					startedAt: now,
					chunkIds: [],
					size: 0,
					duration: 0,
					status: "recording",
					...recorder instanceof PaperPcmCapture ? {
						pcm: {
							schema: 1,
							sampleRate: recorder.sampleRate,
							channels: recorder.channels,
							frames: 0
						},
						parts: [],
						spans: []
					} : {}
				},
				tail: Promise.resolve(),
				elapsed: 0,
				resumedAt: performance.now(),
				wallStart: now,
				segments: [],
				stopped: false,
				paused: false
			};
			r.journal = await saveAudioChunk(media.accountId, media.spaceId, r.journal, void 0, {
				lease: lease.token,
				expectedRevision: null
			});
			if (!currentStart()) {
				if (recorder instanceof PaperPcmCapture) recorder.stop();
				stream.getTracks().forEach((t) => t.stop());
				r.finish();
				return;
			}
			active.current = r;
			attached = true;
			const receive = (event) => {
				if (!event.data.size) return;
				if (r.recorder instanceof PaperPcmCapture) {
					r.tail = r.tail.then(async () => {
						const appended = await appendRecordingPcm(r.journal, event.data, event.frames, {
							start: event.start,
							end: event.end
						}, media, r.lease.current, r.lease.token);
						r.journal = {
							...appended,
							objectMarks: {
								...appended.objectMarks,
								...r.journal.objectMarks
							}
						};
						const previous = r.journal.parts?.length ?? 0;
						r.journal = await sealRecordingPcm(r.journal, media, false, r.lease.current, void 0, r.lease.token);
						if ((r.journal.parts?.length ?? 0) !== previous) await publish(r.journal, r.lease);
					});
					r.tail.catch((e) => {
						if (currentView()) latest.current.onNotice(`La capture audio est interrompue : ${String(e instanceof Error ? e.message : e)}. Les parties conservées restent récupérables.`);
						if (r.recorder.state !== "inactive") r.recorder.stop();
					});
					return;
				}
				const chunkId = `${id}-${String(r.journal.chunkIds.length).padStart(6, "0")}`;
				r.journal = {
					...r.journal,
					chunkIds: [...r.journal.chunkIds, chunkId],
					size: r.journal.size + event.data.size,
					duration: r.stopped ? r.elapsed : duration(r)
				};
				const journal = r.journal;
				r.tail = r.tail.then(async () => {
					const saved = await saveAudioChunk(media.accountId, media.spaceId, journal, event.data, {
						lease: r.lease.token,
						expectedRevision: r.journal.writeRevision ?? 0
					});
					r.journal = {
						...r.journal,
						writeRevision: saved.writeRevision
					};
				});
				r.tail.catch((e) => {
					if (currentView()) latest.current.onNotice(`Audio conservé partiellement : ${String(e)}. Arrêtez l’enregistrement et vérifiez sa récupération.`);
					if (recorder.state !== "inactive") recorder.stop();
				});
				if (journal.size > 12582912 && recorder.state !== "inactive") {
					if (currentView()) latest.current.onNotice("Une section audio atteint 12 Mo. Elle est arrêtée et conservée ; vous pouvez poursuivre dans une nouvelle section.");
					stop();
				}
			};
			if (recorder instanceof PaperPcmCapture) recorder.ondataavailable = receive;
			else recorder.ondataavailable = receive;
			recorder.onerror = () => {
				if (currentView()) latest.current.onNotice("L’enregistrement a été interrompu. Les morceaux déjà enregistrés restent récupérables.");
			};
			recorder.onstop = () => {
				if (!r.stopped) {
					if (!r.paused && !(r.recorder instanceof PaperPcmCapture)) {
						r.segments.push({
							start: r.wallStart,
							end: Date.now(),
							offset: r.elapsed
						});
						r.elapsed += (performance.now() - r.resumedAt) / 1e3;
					}
					r.stopped = true;
				}
				r.stream.getTracks().forEach((t) => t.stop());
				if (active.current === r) active.current = null;
				const finishing = r.tail.then(async () => {
					if (r.journal.pcm) {
						r.journal = await sealRecordingPcm({
							...r.journal,
							status: "recoverable"
						}, media, true, r.lease.current, void 0, r.lease.token);
						r.journal = await saveAudioChunk(media.accountId, media.spaceId, r.journal, void 0, {
							lease: r.lease.token,
							expectedRevision: r.journal.writeRevision ?? 0
						});
						await publish(r.journal, r.lease);
					} else {
						r.journal = {
							...r.journal,
							duration: r.elapsed,
							status: "recoverable"
						};
						r.journal = await saveAudioChunk(media.accountId, media.spaceId, r.journal, void 0, {
							lease: r.lease.token,
							expectedRevision: r.journal.writeRevision ?? 0
						});
						await publish(r.journal, r.lease, r.segments);
					}
				}).finally(() => r.lease.release());
				finalizations.current.add(finishing);
				finishing.then(() => {
					finalizations.current.delete(finishing);
					r.finish();
				}, (e) => {
					finalizations.current.delete(finishing);
					r.fail(e);
					if (currentView()) latest.current.onNotice(`Le son attend sa récupération : ${String(e instanceof Error ? e.message : e)}`);
				});
				if (currentView()) {
					setRecording(false);
					setPaused(false);
				}
			};
			if (recorder instanceof PaperPcmCapture) recorder.start();
			else recorder.start(1e3);
			setRecording(true);
			setPaused(false);
			setSeconds(0);
			setExpanded(true);
		} catch (e) {
			const failed = active.current;
			if (failed?.recorder.state === "inactive") {
				active.current = null;
				failed.fail(e);
			}
			if (prepared instanceof PaperPcmCapture) prepared.stop();
			stream?.getTracks().forEach((t) => t.stop());
			if (currentStart()) latest.current.onNotice(String(e instanceof Error ? e.message : e));
		} finally {
			starting.current = false;
			if (!attached) await lease?.release();
			if (currentView()) setBusy(false);
		}
	};
	const recoverOne = async (id, automatic = false) => {
		if (!currentView() || disabled || !writable.current || active.current || starting.current || recovering.current) return;
		recovering.current = true;
		let lease = null;
		setBusy(true);
		try {
			lease = await acquireRecordingLease({
				accountId: media.accountId,
				spaceId: media.spaceId,
				noteId: document.noteId
			}, () => {});
			if (!lease) return;
			const journal = await getAudioRecordingJournal({
				...media,
				noteId: document.noteId
			}, id);
			if (!journal || journal.status === "completed" || !journal.chunkIds?.length || !currentView() || !writable.current) return;
			if (journal.pcm && !isPcmRecording(journal)) throw Error("Le journal audio nécessite une vérification ; sa source reste conservée.");
			const current = () => lease.current() && currentView() && writable.current;
			const sealed = journal.pcm ? await sealRecordingPcm({
				...journal,
				status: "recoverable"
			}, media, true, current, void 0, lease.token) : {
				...journal,
				status: "recoverable"
			};
			await publish(sealed, lease);
			if (currentView()) latest.current.onNotice("Enregistrement interrompu récupéré. Le son conservé est de nouveau disponible.");
		} catch (error) {
			if (currentView() && !automatic) latest.current.onNotice(String(error instanceof Error ? error.message : error));
		} finally {
			await lease?.release();
			recovering.current = false;
			if (currentView()) {
				setBusy(false);
				updateRecoveries();
			}
		}
	};
	useEffect(() => {
		let disposed = false;
		const attempt = () => {
			if (disposed || !currentView() || latest.current.disabled || !writable.current || active.current || starting.current || recovering.current) return;
			const task = (async () => {
				const records = await recoverableRecordings(document.noteId, media);
				if (disposed || !currentView()) return;
				for (const journal of records) {
					if (disposed || !currentView() || active.current || starting.current) return;
					await recoverOne(journal.id, true);
				}
			})();
			finalizations.current.add(task);
			task.finally(() => finalizations.current.delete(task)).catch(() => {});
		};
		attempt();
		const timer = setInterval(attempt, 5e3);
		return () => {
			disposed = true;
			clearInterval(timer);
		};
	}, [
		document.noteId,
		media.accountId,
		media.spaceId,
		disabled
	]);
	const stop = () => {
		const r = active.current;
		if (!r || r.recorder.state === "inactive") return;
		dispatchEvent(new CustomEvent("dowze:paper-flush", { detail: { prefix: `${r.journal.noteId}-` } }));
		if (r.recorder.state === "recording" && !(r.recorder instanceof PaperPcmCapture)) {
			const span = (performance.now() - r.resumedAt) / 1e3;
			r.segments.push({
				start: r.wallStart,
				end: Date.now(),
				offset: r.elapsed
			});
			r.elapsed += span;
		}
		r.stopped = true;
		r.recorder.stop();
	};
	const pause = () => {
		const r = active.current;
		if (!r) return;
		if (r.recorder.state === "recording") {
			if (!(r.recorder instanceof PaperPcmCapture)) {
				r.segments.push({
					start: r.wallStart,
					end: Date.now(),
					offset: r.elapsed
				});
				r.elapsed += (performance.now() - r.resumedAt) / 1e3;
			}
			r.paused = true;
			r.recorder.pause();
			setPaused(true);
		} else if (r.recorder.state === "paused") {
			r.resumedAt = performance.now();
			r.wallStart = Date.now();
			r.paused = false;
			r.recorder.resume();
			setPaused(false);
		}
	};
	return /* @__PURE__ */ jsxDEV("section", {
		className: "paper-audio",
		"aria-label": "Audio de la note",
		children: [
			/* @__PURE__ */ jsxDEV("div", {
				className: "paper-audio-actions",
				children: [
					/* @__PURE__ */ jsxDEV("button", {
						disabled: disabled || busy || recording,
						"aria-label": "Enregistrer au microphone",
						onClick: () => void start(),
						children: [/* @__PURE__ */ jsxDEV(Mic, {}, void 0, false, {
							fileName: _jsxFileName,
							lineNumber: 86,
							columnNumber: 220
						}, this), busy ? "Ouverture…" : "Enregistrer"]
					}, void 0, true, {
						fileName: _jsxFileName,
						lineNumber: 86,
						columnNumber: 109
					}, this),
					recording && /* @__PURE__ */ jsxDEV(Fragment, { children: [
						/* @__PURE__ */ jsxDEV("span", {
							className: "paper-recording-indicator",
							children: [
								paused ? "En pause" : "Enregistrement",
								" · ",
								clock(seconds)
							]
						}, void 0, true, {
							fileName: _jsxFileName,
							lineNumber: 86,
							columnNumber: 282
						}, this),
						/* @__PURE__ */ jsxDEV("button", {
							"aria-label": paused ? "Reprendre l’enregistrement" : "Mettre l’enregistrement en pause",
							onClick: pause,
							children: paused ? /* @__PURE__ */ jsxDEV(Play, {}, void 0, false, {
								fileName: _jsxFileName,
								lineNumber: 86,
								columnNumber: 504
							}, this) : /* @__PURE__ */ jsxDEV(Pause, {}, void 0, false, {
								fileName: _jsxFileName,
								lineNumber: 86,
								columnNumber: 512
							}, this)
						}, void 0, false, {
							fileName: _jsxFileName,
							lineNumber: 86,
							columnNumber: 388
						}, this),
						/* @__PURE__ */ jsxDEV("button", {
							"aria-label": "Arrêter et conserver l’enregistrement",
							onClick: stop,
							children: /* @__PURE__ */ jsxDEV(Square, {}, void 0, false, {
								fileName: _jsxFileName,
								lineNumber: 86,
								columnNumber: 604
							}, this)
						}, void 0, false, {
							fileName: _jsxFileName,
							lineNumber: 86,
							columnNumber: 530
						}, this)
					] }, void 0, true, {
						fileName: _jsxFileName,
						lineNumber: 86,
						columnNumber: 280
					}, this),
					/* @__PURE__ */ jsxDEV("button", {
						"aria-label": "Afficher les enregistrements",
						"aria-expanded": expanded,
						onClick: () => setExpanded((v) => !v),
						children: [
							/* @__PURE__ */ jsxDEV(Volume2, {}, void 0, false, {
								fileName: _jsxFileName,
								lineNumber: 86,
								columnNumber: 734
							}, this),
							document.audio.length,
							" son",
							document.audio.length > 1 ? "s" : ""
						]
					}, void 0, true, {
						fileName: _jsxFileName,
						lineNumber: 86,
						columnNumber: 626
					}, this)
				]
			}, void 0, true, {
				fileName: _jsxFileName,
				lineNumber: 86,
				columnNumber: 72
			}, this),
			/* @__PURE__ */ jsxDEV(PaperAudioEditor, {
				document,
				media,
				disabled: disabled || recording,
				onCommit,
				whenSaved,
				onNotice
			}, void 0, false, {
				fileName: _jsxFileName,
				lineNumber: 86,
				columnNumber: 818
			}, this),
			expanded && /* @__PURE__ */ jsxDEV("div", {
				className: "paper-audio-tracks",
				children: [document.audio.map((track) => /* @__PURE__ */ jsxDEV(PaperAudioTrack, {
					track,
					document,
					media,
					onNotice,
					pendingSeek
				}, track.id, false, {
					fileName: _jsxFileName,
					lineNumber: 86,
					columnNumber: 1038
				}, this)), recoveries.filter((r) => r.id !== active.current?.journal.id && !document.audio.some((a) => a.id === r.id && !a.inProgress)).map((journal) => /* @__PURE__ */ jsxDEV("button", {
					disabled: disabled || busy || recording,
					onClick: () => {
						const task = recoverOne(journal.id);
						finalizations.current.add(task);
						task.finally(() => finalizations.current.delete(task)).catch(() => {});
					},
					children: [
						/* @__PURE__ */ jsxDEV(Undo2, {}, void 0, false, {
							fileName: _jsxFileName,
							lineNumber: 86,
							columnNumber: 1502
						}, this),
						"Récupérer ",
						journal.name
					]
				}, journal.id, true, {
					fileName: _jsxFileName,
					lineNumber: 86,
					columnNumber: 1285
				}, this))]
			}, void 0, true, {
				fileName: _jsxFileName,
				lineNumber: 86,
				columnNumber: 975
			}, this)
		]
	}, void 0, true, {
		fileName: _jsxFileName,
		lineNumber: 86,
		columnNumber: 9
	}, this);
}
//#endregion
export { PaperAudioControls, pcmChunksWav as t };
