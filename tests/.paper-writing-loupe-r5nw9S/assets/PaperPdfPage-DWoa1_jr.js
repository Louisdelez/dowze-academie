import { t as readPaperAsset } from "../writing-loupe.mjs";
import { useEffect, useRef, useState } from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { GlobalWorkerOptions, getDocument } from "pdfjs-dist";
//#region src/lib/paperPdfNavigation.ts
function safePdfUrl(value) {
	if (typeof value !== "string" || value.length > 8192) return;
	try {
		const url = new URL(value);
		if ([
			"http:",
			"https:",
			"mailto:"
		].includes(url.protocol)) return url.href;
	} catch {}
}
/** PDF destinations are page references or zero-based indexes, never executable actions. */
async function pdfDestinationPage(pdf, dest) {
	const value = typeof dest === "string" ? await pdf.getDestination(dest) : dest;
	if (!Array.isArray(value) || !value.length) return;
	const reference = value[0];
	let index;
	if (Number.isInteger(reference)) index = reference;
	else if (reference && typeof reference === "object" && Number.isSafeInteger(reference.num) && Number.isSafeInteger(reference.gen)) index = await pdf.getPageIndex(reference);
	else return;
	return Number.isInteger(index) && index >= 0 && index < pdf.numPages ? index + 1 : void 0;
}
function pdfLinkRectangle(viewport, rect) {
	if (!Array.isArray(rect) || rect.length !== 4 || !rect.every(Number.isFinite)) return;
	const a = viewport.convertToViewportPoint(rect[0], rect[1]), b = viewport.convertToViewportPoint(rect[2], rect[3]), box = [...a, ...b], x = Math.max(0, Math.min(box[0], box[2])), y = Math.max(0, Math.min(box[1], box[3])), right = Math.min(viewport.width, Math.max(box[0], box[2])), bottom = Math.min(viewport.height, Math.max(box[1], box[3]));
	if (right <= x || bottom <= y) return;
	return {
		left: x / viewport.width * 100,
		top: y / viewport.height * 100,
		width: (right - x) / viewport.width * 100,
		height: (bottom - y) / viewport.height * 100
	};
}
//#endregion
//#region src/lib/paperPdf.ts
GlobalWorkerOptions.workerSrc = "/assets/pdf.worker.min-CjEcRF4W.mjs";
async function openPaperPdf(blob) {
	const task = getDocument({
		data: new Uint8Array(await blob.arrayBuffer()),
		useSystemFonts: true,
		maxImageSize: 16e6
	});
	try {
		const pdf = await task.promise;
		return Object.assign(pdf, { destroy: () => task.destroy() });
	} catch (e) {
		await task.destroy();
		throw e;
	}
}
//#endregion
//#region src/components/PaperPdfPage.tsx
function PaperPdfPage({ page, asset, media, onReady, onError, onNavigate, linksEnabled = false, pixelWidth }) {
	const canvas = useRef(null), [error, setError] = useState("");
	const [links, setLinks] = useState([]);
	useEffect(() => {
		let cancelled = false, dispose;
		setError("");
		setLinks([]);
		readPaperAsset(asset, media).then(openPaperPdf).then(async (pdf) => {
			if (cancelled) {
				await pdf.destroy();
				return;
			}
			dispose = () => {
				pdf.destroy();
			};
			const p = await pdf.getPage(page.pdf.pageNumber);
			const target = canvas.current;
			if (!target || cancelled) return;
			const base = p.getViewport({
				scale: 1,
				rotation: p.rotate + page.rotation
			}), ratio = Math.min(2, devicePixelRatio || 1, Math.sqrt(16e6 / (page.width * page.height)), 16e3 / Math.max(page.width, page.height), pixelWidth && Number.isFinite(pixelWidth) && pixelWidth > 0 ? pixelWidth / page.width : Infinity), viewport = p.getViewport({
				scale: page.width / base.width * ratio,
				rotation: base.rotation
			});
			target.width = Math.ceil(viewport.width);
			target.height = Math.ceil(viewport.height);
			await p.render({
				canvas: target,
				viewport
			}).promise;
			if (!cancelled) onReady?.();
			if (onNavigate) {
				const annotations = await p.getAnnotations({ intent: "display" }), items = [];
				for (const a of annotations.slice(0, 1e3)) {
					if (a.subtype !== "Link") continue;
					const box = pdfLinkRectangle(base, a.rect);
					if (!box) continue;
					const url = safePdfUrl(a.url);
					let destination;
					try {
						destination = await pdfDestinationPage(pdf, a.dest);
					} catch {}
					if (url || destination) items.push({
						id: String(a.id),
						box,
						url,
						page: destination
					});
				}
				if (!cancelled) setLinks(items);
			}
		}).catch((e) => {
			if (!cancelled) {
				const message = String(e instanceof Error ? e.message : e);
				setError(message);
				onError?.(message);
			}
		});
		return () => {
			cancelled = true;
			dispose?.();
		};
	}, [
		page.id,
		page.width,
		page.height,
		page.rotation,
		asset.id,
		asset.serverId,
		media.accountId,
		media.spaceId,
		media.api,
		pixelWidth
	]);
	return /* @__PURE__ */ jsxs(Fragment, { children: [/* @__PURE__ */ jsx("div", {
		className: "paper-pdf-background",
		children: error ? /* @__PURE__ */ jsx("p", {
			role: "status",
			children: error
		}) : /* @__PURE__ */ jsx("canvas", {
			ref: canvas,
			"aria-label": `PDF, page ${page.pdf?.pageNumber}`
		})
	}), linksEnabled && /* @__PURE__ */ jsx("div", {
		className: "paper-pdf-links",
		children: links.map((link) => link.page ? /* @__PURE__ */ jsx("button", {
			style: {
				position: "absolute",
				left: link.box.left + "%",
				top: link.box.top + "%",
				width: link.box.width + "%",
				height: link.box.height + "%"
			},
			className: "paper-pdf-link",
			"aria-label": `Aller à la page PDF ${link.page}`,
			onClick: () => onNavigate?.(link.page)
		}, link.id) : /* @__PURE__ */ jsx("a", {
			className: "paper-pdf-link",
			style: {
				position: "absolute",
				left: link.box.left + "%",
				top: link.box.top + "%",
				width: link.box.width + "%",
				height: link.box.height + "%"
			},
			href: link.url,
			target: "_blank",
			rel: "noopener noreferrer",
			"aria-label": `Ouvrir le lien PDF : ${link.url}`
		}, link.id))
	})] });
}
//#endregion
export { PaperPdfPage };
