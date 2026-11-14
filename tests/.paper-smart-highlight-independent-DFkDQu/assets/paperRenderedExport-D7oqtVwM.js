import { p as scanLegacyPaperImages } from "./notebookDocument-yuVu6oXC.js";
import { n as readPaperAsset, r as resolvePaperPhotoReference } from "./paperAssets-CggUOk-G.js";
import { t as paperObjectsOnPage } from "./paperTextFlow-T0_iEUZW.js";
import { t as openPaperPdf } from "./paperPdf-Cx2IiY56.js";
import { PaperExportPage, b as safePdfUrl, v as pdfDestinationPage, y as pdfLinkRectangle } from "../smart-highlight-independent.mjs";
import { preparePaperFlowExport } from "./paperFlowExport-CjKPKSYo.js";
import { createRef } from "react";
import { jsxDEV } from "react/jsx-dev-runtime";
import { createRoot } from "react-dom/client";
import { PDFDocument, PDFHexString, PDFName, degrees } from "pdf-lib";
import { getFontEmbedCSS, toCanvas } from "html-to-image";
//#region src/lib/paperPdfLinkExport.ts
/** Export only ordinary hyperlinks and internal page destinations, not PDF executable actions. */
function addPaperPdfLink(pdf, page, box, targetIndex, url) {
	const target = targetIndex === void 0 ? void 0 : pdf.getPage(targetIndex);
	const safe = safePdfUrl(url);
	if (!target && !safe) return;
	const x = box.left / 100 * page.getWidth(), y = (1 - (box.top + box.height) / 100) * page.getHeight(), w = box.width / 100 * page.getWidth(), h = box.height / 100 * page.getHeight();
	const annotation = pdf.context.obj({
		Type: "Annot",
		Subtype: "Link",
		Rect: [
			x,
			y,
			x + w,
			y + h
		],
		Border: [
			0,
			0,
			0
		],
		...target ? { Dest: [target.ref, PDFName.of("Fit")] } : { A: {
			S: "URI",
			URI: PDFHexString.fromText(safe)
		} }
	});
	page.node.addAnnot(pdf.context.register(annotation));
}
function addPaperPdfOutlines(pdf, items) {
	if (!items.length) return;
	const root = pdf.context.obj({ Type: "Outlines" }), rootRef = pdf.context.register(root);
	let nodes = 0;
	const attach = (parent, children, depth = 0) => {
		if (depth > 20 || nodes >= 2e3) return 0;
		const entries = [];
		let count = 0;
		for (const item of children) {
			if (nodes++ >= 2e3) break;
			const target = item.targetIndex === void 0 ? void 0 : pdf.getPage(item.targetIndex), url = safePdfUrl(item.url), dict = pdf.context.obj({
				Title: PDFHexString.fromText(item.title.slice(0, 500)),
				Parent: parent,
				...target ? { Dest: [target.ref, PDFName.of("Fit")] } : url ? { A: {
					S: "URI",
					URI: PDFHexString.fromText(url)
				} } : {}
			}), ref = pdf.context.register(dict);
			const descendants = attach(ref, item.items, depth + 1);
			count += 1 + descendants;
			if (descendants) dict.set(PDFName.of("Count"), pdf.context.obj(descendants));
			entries.push({
				dict,
				ref
			});
		}
		const owner = pdf.context.lookup(parent);
		if (entries.length) {
			owner.set(PDFName.of("First"), entries[0].ref);
			owner.set(PDFName.of("Last"), entries.at(-1).ref);
			for (let i = 0; i < entries.length; i++) {
				if (i) entries[i].dict.set(PDFName.of("Prev"), entries[i - 1].ref);
				if (i + 1 < entries.length) entries[i].dict.set(PDFName.of("Next"), entries[i + 1].ref);
			}
		}
		return count;
	};
	const count = attach(rootRef, items);
	root.set(PDFName.of("Count"), pdf.context.obj(count));
	pdf.catalog.set(PDFName.of("Outlines"), rootRef);
}
async function preparePdfOutline(pdf, items, targetIndex, depth = 0, budget = { remaining: 2e3 }) {
	const result = [];
	if (depth > 20) return result;
	for (const item of items ?? []) {
		if (budget.remaining-- <= 0) break;
		let page;
		try {
			page = await pdfDestinationPage(pdf, item.dest);
		} catch {}
		const children = await preparePdfOutline(pdf, item.items, targetIndex, depth + 1, budget), target = page === void 0 ? void 0 : targetIndex(page), url = safePdfUrl(item.url);
		if (target !== void 0 || url || children.length) result.push({
			title: String(item.title ?? "Section"),
			targetIndex: target,
			url,
			items: children
		});
	}
	return result;
}
//#endregion
//#region src/lib/paperPdfExportNavigation.ts
/** Rebuild links against the exported page references after insertions, copies and reordering. */
async function exportPaperPdfNavigation(output, document, media, current = () => true) {
	const outlines = [];
	for (const asset of document.assets.filter((a) => document.pages.some((p) => p.pdf?.assetId === a.id))) {
		if (!current()) throw Error("Le carnet a changé pendant l’export de ses liens.");
		const source = await openPaperPdf(await readPaperAsset(asset, media, {
			document,
			current
		}));
		try {
			const target = (page) => {
				const i = document.pages.findIndex((p) => p.pdf && p.pdf.assetId === asset.id && p.pdf.pageNumber === page);
				return i < 0 ? void 0 : i;
			};
			for (let i = 0; i < document.pages.length; i++) {
				if (!current()) throw Error("Le carnet a changé pendant l’export de ses liens.");
				const page = document.pages[i];
				if (page.pdf?.assetId !== asset.id) continue;
				const original = await source.getPage(page.pdf.pageNumber), viewport = original.getViewport({
					scale: 1,
					rotation: original.rotate + page.rotation
				});
				for (const a of (await original.getAnnotations({ intent: "display" })).slice(0, 1e3)) {
					if (a.subtype !== "Link") continue;
					const box = pdfLinkRectangle(viewport, a.rect);
					if (!box) continue;
					let number;
					try {
						number = await pdfDestinationPage(source, a.dest);
					} catch {}
					addPaperPdfLink(output, output.getPage(i), box, number === void 0 ? void 0 : target(number), a.url);
				}
				original.cleanup();
			}
			const items = await preparePdfOutline(source, await source.getOutline(), target);
			if (items.length) outlines.push({
				title: asset.name,
				items
			});
		} finally {
			await source.destroy();
		}
	}
	if (!current()) throw Error("Le carnet a changé pendant l’export de ses liens.");
	addPaperPdfOutlines(output, outlines);
}
//#endregion
//#region src/lib/paperPdfExport.ts
/** Paper units correspond to CSS pixels at 96 dpi; PDF coordinates are 72 dpi. */
var paperPdfSize = (page) => ({
	width: page.width * .75,
	height: page.height * .75
});
/** Embed the original vector resources instead of turning the imported document into a photograph. */
async function addOriginalPdfPage(output, original, index, size, extraRotation = 0) {
	const source = original.getPage(index);
	if (!source) throw Error("Cette page manque dans le PDF original.");
	if (!source.node.Contents()) return output.addPage([size.width, size.height]);
	const crop = source.getCropBox(), rotation = ((source.getRotation().angle + extraRotation) % 360 + 360) % 360;
	if (![
		0,
		90,
		180,
		270
	].includes(rotation)) throw Error("L’orientation du PDF n’est pas prise en charge.");
	const embedded = await output.embedPage(source, {
		left: crop.x,
		bottom: crop.y,
		right: crop.x + crop.width,
		top: crop.y + crop.height
	});
	const page = output.addPage([size.width, size.height]);
	const turned = rotation === 90 || rotation === 270, w = turned ? size.height : size.width, h = turned ? size.width : size.height;
	page.drawPage(embedded, {
		x: rotation === 180 || rotation === 270 ? size.width : 0,
		y: rotation === 90 || rotation === 180 ? size.height : 0,
		width: w,
		height: h,
		rotate: degrees(-rotation)
	});
	return page;
}
//#endregion
//#region src/lib/paperExportAssetManifest.ts
/** Semantic image references only: code examples and coincidental asset names never request private files. */
function paperExportPageAssetIds(document, page, annotationsOnly = false) {
	const objects = paperObjectsOnPage(document, page.id), required = new Set(objects.filter((object) => object.assetId).map((object) => object.assetId));
	if (page.pdf && !annotationsOnly) required.add(page.pdf.assetId);
	for (const object of objects.filter((object) => object.markdown)) for (const image of scanLegacyPaperImages(object.markdown).images) {
		if (image.kind !== "photo" && image.kind !== "invalid-photo") continue;
		const resolved = resolvePaperPhotoReference(document, image.url);
		if (resolved.kind === "unavailable") throw Error(resolved.message);
		if (resolved.kind === "asset") required.add(resolved.asset.id);
	}
	for (const id of required) if (!document.assets.some((asset) => asset.id === id)) throw Error("Une pièce jointe manque dans la note.");
	return required;
}
//#endregion
//#region src/lib/paperRenderedExport.tsx
var _jsxFileName = "/home/louis/DowzeBuild/20260923/collections-060/src/lib/paperRenderedExport.tsx";
var PIXEL_LIMIT = 16e6;
function exportPixelRatio(page) {
	if (page.width * page.height > PIXEL_LIMIT || page.width > 16e3 || page.height > 16e3) throw Error("Cette page est trop grande pour un export image. Répartissez son contenu sur plusieurs pages.");
	return Math.min(2, Math.sqrt(PIXEL_LIMIT / (page.width * page.height)), 16e3 / page.width, 16e3 / page.height);
}
var canvasBlob = (canvas, type) => new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(Error("L’image n’a pas pu être produite.")), type, .95));
async function renderPage(documentValue, page, media, annotationsOnly = false, current = () => true) {
	const check = () => {
		if (!current()) throw Error("Le carnet a changé pendant la préparation de son export.");
	};
	check();
	for (const id of paperExportPageAssetIds(documentValue, page, annotationsOnly)) {
		const asset = documentValue.assets.find((a) => a.id === id);
		await readPaperAsset(asset, media, {
			document: documentValue,
			current
		});
		check();
	}
	const host = document.createElement("div");
	host.style.cssText = `position:fixed;left:-30000px;top:0;width:${page.width}px;height:${page.height}px;pointer-events:none;background:transparent;`;
	host.setAttribute("aria-hidden", "true");
	host.style.fontFamily = getComputedStyle(document.querySelector(".paper-page") ?? document.body).fontFamily;
	document.body.appendChild(host);
	const root = createRoot(host), ref = createRef();
	let disposed = false;
	let pageReady = false;
	let failure;
	let observer;
	let timer;
	try {
		root.render(/* @__PURE__ */ jsxDEV(PaperExportPage, {
			ref,
			document: documentValue,
			page,
			media,
			annotationsOnly,
			onReady: () => {
				pageReady = true;
			},
			onError: (message) => {
				failure = message;
			}
		}, void 0, false, {
			fileName: _jsxFileName,
			lineNumber: 26,
			columnNumber: 14
		}, this));
		await new Promise((resolve, reject) => {
			const inspect = () => {
				if (!current()) {
					reject(Error("Le carnet a changé pendant la préparation de son export."));
					return;
				}
				if (failure) {
					reject(Error(failure));
					return;
				}
				const node = ref.current, missing = node?.querySelector("[data-image-error=\"true\"]");
				if (missing) {
					reject(Error(missing.textContent || "Une image ne peut pas être incluse dans cet export."));
					return;
				}
				if (!pageReady || !node || node.querySelector(".paper-asset-missing,[data-code-ready=\"false\"]")) return;
				if ([...node.querySelectorAll("img")].some((image) => !image.complete || image.naturalWidth === 0)) return;
				resolve();
			};
			observer = new MutationObserver(inspect);
			observer.observe(host, {
				subtree: true,
				attributes: true,
				childList: true
			});
			host.addEventListener("load", inspect, true);
			host.addEventListener("error", () => reject(Error("Une image ne peut pas être incluse dans cet export.")), true);
			const check = () => {
				if (disposed) return;
				inspect();
				if (!pageReady) requestAnimationFrame(check);
			};
			requestAnimationFrame(check);
			timer = setTimeout(() => reject(Error("Une pièce de la note n’est pas encore prête pour l’export.")), 3e4);
		});
		if (timer) clearTimeout(timer);
		observer?.disconnect();
		await document.fonts.ready;
		check();
		const node = ref.current;
		const fonts = await getFontEmbedCSS(node, { preferredFontFormat: "woff2" });
		check();
		const canvas = await toCanvas(node, {
			width: page.width,
			height: page.height,
			pixelRatio: exportPixelRatio(page),
			fontEmbedCSS: fonts,
			backgroundColor: annotationsOnly ? void 0 : page.color,
			style: {
				transform: "none",
				boxShadow: "none",
				margin: "0"
			},
			filter: (node) => !(node instanceof HTMLElement && node.classList.contains("paper-asset-missing"))
		});
		if (!current()) {
			canvas.width = 0;
			canvas.height = 0;
			check();
		}
		return canvas;
	} finally {
		disposed = true;
		if (timer) clearTimeout(timer);
		observer?.disconnect();
		root.unmount();
		host.remove();
	}
}
/** Sequential pages bound peak memory; originals and document revisions are never modified. */
async function renderPaperPdf(document, media, onProgress, current = () => true) {
	const check = () => {
		if (!current()) throw Error("Le carnet a changé pendant son export.");
	};
	check();
	document = await preparePaperFlowExport(document, media);
	check();
	const pdf = await PDFDocument.create();
	pdf.setCreator("Dowze Académie");
	pdf.setSubject("Carnet exporté avec ses pages et annotations");
	const originals = /* @__PURE__ */ new Map();
	for (let i = 0; i < document.pages.length; i++) {
		check();
		const source = document.pages[i];
		onProgress?.(i, document.pages.length);
		const size = paperPdfSize(source);
		let p;
		if (source.pdf) {
			const asset = document.assets.find((a) => a.id === source.pdf.assetId);
			if (!asset) throw Error("Le PDF original est introuvable.");
			let original = originals.get(asset.id);
			if (!original) {
				original = await PDFDocument.load(await (await readPaperAsset(asset, media, {
					document,
					current
				})).arrayBuffer());
				check();
				originals.set(asset.id, original);
			}
			p = await addOriginalPdfPage(pdf, original, source.pdf.pageNumber - 1, size, source.rotation);
		} else p = pdf.addPage([size.width, size.height]);
		const canvas = await renderPage(document, source, media, !!source.pdf, current);
		try {
			check();
			const image = await pdf.embedPng(new Uint8Array(await (await canvasBlob(canvas, "image/png")).arrayBuffer()));
			check();
			p.drawImage(image, {
				x: 0,
				y: 0,
				width: size.width,
				height: size.height
			});
		} finally {
			canvas.width = 0;
			canvas.height = 0;
		}
	}
	await exportPaperPdfNavigation(pdf, document, media, current);
	check();
	onProgress?.(document.pages.length, document.pages.length);
	const bytes = await pdf.save();
	check();
	return new Blob([bytes], { type: "application/pdf" });
}
async function renderPaperImage(document, pageId, media, format, current = () => true) {
	const check = () => {
		if (!current()) throw Error("Le carnet a changé pendant son export.");
	};
	check();
	document = await preparePaperFlowExport(document, media);
	check();
	const page = document.pages.find((p) => p.id === pageId);
	if (!page) throw Error("Page introuvable.");
	const canvas = await renderPage(document, page, media, false, current);
	try {
		check();
		const blob = await canvasBlob(canvas, `image/${format}`);
		check();
		return blob;
	} finally {
		canvas.width = 0;
		canvas.height = 0;
	}
}
//#endregion
export { renderPaperImage, renderPaperPdf };
