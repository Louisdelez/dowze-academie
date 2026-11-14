import { t as applyPaperCommand } from "./notebookDocument-yuVu6oXC.js";
import { i as textFlowFingerprint, n as reflowPaperText } from "./paperTextFlow-T0_iEUZW.js";
import { C as measureTextFlow, S as PaperTextFlowView } from "../smart-highlight-independent.mjs";
import { jsxDEV } from "react/jsx-dev-runtime";
import { createRoot } from "react-dom/client";
//#region src/lib/paperFlowExport.tsx
var _jsxFileName = "/home/louis/DowzeBuild/20260923/collections-060/src/lib/paperFlowExport.tsx";
/** Detached reader measurement is shared by export and structural page operations. It never changes the source document. */
async function measurePaperFlowObject(object, original, media) {
	if (object.height < 40) throw Error("Agrandissez la zone de texte avant de la préparer.");
	const host = document.createElement("div");
	host.className = "paper-object has-text-flow";
	host.style.cssText = `position:fixed;left:-30000px;top:0;width:${object.width}px;pointer-events:none;`;
	host.style.fontFamily = getComputedStyle(document.querySelector(".paper-page") ?? document.body).fontFamily;
	document.body.appendChild(host);
	const root = createRoot(host);
	let observer, timer, stopped = false;
	try {
		root.render(/* @__PURE__ */ jsxDEV(PaperTextFlowView, {
			object,
			document: original,
			media,
			pageId: object.pageId
		}, void 0, false, {
			fileName: _jsxFileName,
			lineNumber: 12,
			columnNumber: 15
		}, this));
		await new Promise((resolve, reject) => {
			const check = () => {
				const body = host.querySelector(".paper-flow-source"), failure = body?.dataset.flowLayoutError ?? host.querySelector(".paper-asset-missing[data-image-error=\"true\"]")?.textContent;
				if (failure) {
					reject(Error(failure));
					return;
				}
				if (!body || body.dataset.flowReady !== "true" || host.querySelector(".paper-asset-missing,[data-code-ready=\"false\"]")) return;
				if ([...host.querySelectorAll("img")].some((i) => !i.complete || !i.naturalWidth)) return;
				resolve();
			};
			observer = new MutationObserver(check);
			observer.observe(host, {
				subtree: true,
				attributes: true,
				childList: true
			});
			host.addEventListener("load", check, true);
			host.addEventListener("error", () => reject(Error("Une image du texte ne peut pas être préparée.")), true);
			const inspect = () => {
				if (stopped) return;
				check();
				if (!host.querySelector(".paper-flow-source")) requestAnimationFrame(inspect);
			};
			requestAnimationFrame(inspect);
			timer = setTimeout(() => reject(Error("Le texte et ses images ne sont pas encore prêts.")), 3e4);
		});
		await (document.fonts?.ready ?? Promise.resolve());
		const measured = measureTextFlow(host.querySelector(".paper-flow-source"), object.width, object.height, object.markdown);
		if (!measured) throw Error("La disposition du texte ne peut pas être mesurée.");
		return measured;
	} finally {
		stopped = true;
		if (timer) clearTimeout(timer);
		observer?.disconnect();
		root.unmount();
		host.remove();
	}
}
/** Export lays out the complete canonical text, even before the editor's delayed layout has settled. */
async function preparePaperFlowExport(original, media) {
	let prepared = original;
	for (const object of original.objects.filter((o) => o.kind === "text")) {
		const measurement = await measurePaperFlowObject(object, original, media), command = reflowPaperText(prepared, object.id, textFlowFingerprint(object.markdown ?? "", object.width, object.height), measurement.breaks, measurement.sourceOffsets);
		if (command) prepared = applyPaperCommand(prepared, command);
	}
	return prepared;
}
//#endregion
export { measurePaperFlowObject, preparePaperFlowExport };
