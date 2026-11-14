import { N as __exportAll } from "./storage-BJWvsK9s.js";
import { S as openPaperPdf, b as pdfLinkRectangle, k as readPaperAsset, x as safePdfUrl, y as pdfDestinationPage } from "../split.mjs";
import { useEffect, useRef, useState } from "react";
import { Fragment, jsxDEV } from "react/jsx-dev-runtime";
//#region src/components/PaperPdfPage.tsx
var PaperPdfPage_exports = /* @__PURE__ */ __exportAll({ PaperPdfPage: () => PaperPdfPage });
var _jsxFileName = "/home/louis/DowzeBuild/20260923/collections-060/src/components/PaperPdfPage.tsx";
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
	return /* @__PURE__ */ jsxDEV(Fragment, { children: [/* @__PURE__ */ jsxDEV("div", {
		className: "paper-pdf-background",
		children: error ? /* @__PURE__ */ jsxDEV("p", {
			role: "status",
			children: error
		}, void 0, false, {
			fileName: _jsxFileName,
			lineNumber: 18,
			columnNumber: 56
		}, this) : /* @__PURE__ */ jsxDEV("canvas", {
			ref: canvas,
			"aria-label": `PDF, page ${page.pdf?.pageNumber}`
		}, void 0, false, {
			fileName: _jsxFileName,
			lineNumber: 18,
			columnNumber: 85
		}, this)
	}, void 0, false, {
		fileName: _jsxFileName,
		lineNumber: 18,
		columnNumber: 11
	}, this), linksEnabled && /* @__PURE__ */ jsxDEV("div", {
		className: "paper-pdf-links",
		children: links.map((link) => link.page ? /* @__PURE__ */ jsxDEV("button", {
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
		}, link.id, false, {
			fileName: _jsxFileName,
			lineNumber: 18,
			columnNumber: 238
		}, this) : /* @__PURE__ */ jsxDEV("a", {
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
		}, link.id, false, {
			fileName: _jsxFileName,
			lineNumber: 18,
			columnNumber: 502
		}, this))
	}, void 0, false, {
		fileName: _jsxFileName,
		lineNumber: 18,
		columnNumber: 178
	}, this)] }, void 0, true, {
		fileName: _jsxFileName,
		lineNumber: 18,
		columnNumber: 9
	}, this);
}
//#endregion
export { PaperPdfPage_exports as n, PaperPdfPage as t };
