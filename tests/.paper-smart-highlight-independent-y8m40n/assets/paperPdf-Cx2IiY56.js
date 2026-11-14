import { t as __exportAll } from "./rolldown-runtime-D7D4PA-g.js";
import { GlobalWorkerOptions, getDocument } from "pdfjs-dist";
//#region node_modules/pdfjs-dist/build/pdf.worker.min.mjs?url
var pdf_worker_min_default = "/assets/pdf.worker.min-CjEcRF4W.mjs";
//#endregion
//#region src/lib/paperPdf.ts
var paperPdf_exports = /* @__PURE__ */ __exportAll({
	extractPaperPdfPageText: () => extractPaperPdfPageText,
	importPaperPdf: () => importPaperPdf,
	openPaperPdf: () => openPaperPdf
});
GlobalWorkerOptions.workerSrc = pdf_worker_min_default;
async function openPaperPdf(blob, options = {}) {
	const current = () => !options.signal?.aborted && (options.current?.() ?? true);
	if (!current()) throw Error("Le carnet PDF a changé avant son ouverture.");
	const bytes = new Uint8Array(await blob.arrayBuffer());
	if (!current()) throw Error("Le carnet PDF a changé pendant sa lecture.");
	const task = getDocument({
		data: bytes,
		useSystemFonts: true,
		maxImageSize: 16e6
	}), abort = () => {
		task.destroy().catch(() => {});
	};
	options.signal?.addEventListener("abort", abort, { once: true });
	try {
		const pdf = await task.promise;
		if (!current()) {
			await task.destroy();
			throw Error("Le carnet PDF a changé pendant son ouverture.");
		}
		return Object.assign(pdf, { destroy: () => {
			options.signal?.removeEventListener("abort", abort);
			return task.destroy();
		} });
	} catch (e) {
		options.signal?.removeEventListener("abort", abort);
		await task.destroy();
		throw e;
	}
}
async function importPaperPdf(file, assetId) {
	const pdf = await openPaperPdf(file);
	try {
		if (pdf.numPages > 500) throw Error("Importez ce document en parties de 500 pages maximum.");
		const pages = [];
		let indexedCharacters = 0;
		for (let i = 1; i <= pdf.numPages; i++) {
			const p = await pdf.getPage(i), v = p.getViewport({ scale: 4 / 3 });
			if (v.width < 100 || v.width > 2e4 || v.height < 100 || v.height > 1e5) throw Error("Le format d’une page PDF dépasse les dimensions prises en charge.");
			let text = "";
			if (indexedCharacters < 2e6) {
				text = (await p.getTextContent()).items.map((item) => "str" in item ? item.str + ("hasEOL" in item && item.hasEOL ? "\n" : " ") : "").join("").slice(0, Math.max(0, 2e6 - indexedCharacters));
				indexedCharacters += text.length;
			}
			pages.push({
				id: crypto.randomUUID(),
				width: v.width,
				height: v.height,
				pattern: "plain",
				color: "#ffffff",
				bookmark: false,
				rotation: 0,
				pdf: {
					assetId,
					pageNumber: i,
					text
				}
			});
			p.cleanup();
		}
		return pages;
	} finally {
		await pdf.destroy();
	}
}
async function extractPaperPdfPageText(blob, pageNumber) {
	const pdf = await openPaperPdf(blob);
	try {
		return (await (await pdf.getPage(pageNumber)).getTextContent()).items.map((item) => "str" in item ? item.str + ("hasEOL" in item && item.hasEOL ? "\n" : " ") : "").join("").slice(0, 12e4);
	} finally {
		await pdf.destroy();
	}
}
//#endregion
export { paperPdf_exports as n, openPaperPdf as t };
