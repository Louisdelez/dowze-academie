import { _ as localBlobDigest, d as getDraft } from "./storage-BJWvsK9s.js";
import { d as LIBRARY_DOCUMENT_ID, k as readPaperAsset, o as paperArchiveMetadata, p as isNotebookLibrary } from "../split.mjs";
import { Zip, ZipDeflate, ZipPassThrough } from "fflate";
//#region src/lib/paperArchiveExport.ts
/** Portable snapshot. ZIP/media stay in Blob pieces, not a second complete JS byte array. */
async function buildPaperArchive(document, media, note, current = () => true, onProgress) {
	const check = () => {
		if (!current()) throw Error("Le carnet a changé pendant l’export.");
	};
	check();
	const stored = await getDraft({
		...media,
		type: "preferences",
		documentId: LIBRARY_DOCUMENT_ID
	});
	check();
	if (stored && !isNotebookLibrary(stored.content)) throw Error("Le classement doit être récupéré avant l’export.");
	const metadata = paperArchiveMetadata(document, note, stored?.content);
	const files = Object.create(null);
	files["document.json"] = new Blob([JSON.stringify(document)]);
	files["metadata.json"] = new Blob([JSON.stringify(metadata)]);
	const assetPaths = Object.create(null);
	let total = Object.values(files).reduce((sum, file) => sum + file.size, 0);
	for (const asset of document.assets) {
		check();
		const blob = await readPaperAsset(asset, media, {
			document,
			current
		});
		check();
		if (blob.size > 16777216) throw Error(`La pièce jointe « ${asset.name} » dépasse 16 Mo.`);
		total += blob.size;
		if (total > 268435456) throw Error("Cette note dépasse 256 Mo. Vos fichiers restent intacts.");
		const path = `assets/${await localBlobDigest(new Blob([asset.id]))}`;
		if (Object.values(assetPaths).includes(path)) throw Error("Deux pièces jointes possèdent une référence incompatible. Leurs originaux sont conservés.");
		assetPaths[asset.id] = path;
		files[path] = blob;
	}
	const integrity = {
		schema: 1,
		files: Object.create(null),
		assetPaths
	};
	for (const [name, blob] of Object.entries(files)) {
		check();
		if (blob.size > 16777216) throw Error("Un élément de la note dépasse 16 Mo.");
		integrity.files[name] = {
			size: blob.size,
			sha256: await localBlobDigest(blob)
		};
		check();
	}
	files["integrity.json"] = new Blob([JSON.stringify(integrity)]);
	if (total + files["integrity.json"].size > 268435456) throw Error("L’archive complète dépasse 256 Mo.");
	total += files["integrity.json"].size;
	const pieces = [];
	let produced = 0, processed = 0, finished = false;
	const zip = new Zip((error, chunk, final) => {
		check();
		if (error) throw error;
		produced += chunk.length;
		if (produced > 268435456) throw Error("L’archive complète dépasse 256 Mo.");
		if (chunk.length) pieces.push(new Blob([chunk]));
		if (final) finished = true;
	});
	try {
		for (const [name, blob] of Object.entries(files)) {
			check();
			const stream = name.startsWith("assets/") ? new ZipPassThrough(name) : new ZipDeflate(name, { level: 3 });
			zip.add(stream);
			if (!blob.size) stream.push(/* @__PURE__ */ new Uint8Array(), true);
			for (let offset = 0; offset < blob.size; offset += 65536) {
				check();
				const end = Math.min(blob.size, offset + 65536);
				stream.push(new Uint8Array(await blob.slice(offset, end).arrayBuffer()), end === blob.size);
				processed += end - offset;
				onProgress?.(processed, total);
				if (offset % 1048576 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
			}
		}
		check();
		zip.end();
		if (!finished) throw Error("L’archive n’a pas pu être finalisée.");
		return new Blob(pieces, { type: "application/zip" });
	} finally {
		zip.terminate();
	}
}
//#endregion
export { buildPaperArchive };
