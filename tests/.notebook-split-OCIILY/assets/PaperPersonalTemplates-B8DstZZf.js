import { N as registerNotebookWriter } from "../split.mjs";
import { createPaperPersonalTemplate, exportPaperPersonalTemplate, importPaperPersonalTemplate, inspectPaperPersonalTemplateImport, loadPaperPersonalTemplates, updatePaperPersonalTemplate } from "./paperPersonalTemplates-nQaV66Lg.js";
import { useEffect, useMemo, useRef, useState } from "react";
import { Download, FilePlus2, Library, Pencil, Plus, Trash2, Upload, X } from "lucide-react";
import { jsxDEV } from "react/jsx-dev-runtime";
//#region src/components/PaperPersonalTemplates.tsx
var _jsxFileName = "/home/louis/DowzeBuild/20260923/collections-060/src/components/PaperPersonalTemplates.tsx";
var modeLabels = {
	paper: "Papier seul",
	background: "Papier et fond PDF",
	content: "Papier et contenu"
};
/** The same local library and portable file work in desktop and PWA. The owner
* explicitly chooses which content and recordings enter a reusable model. */
function PaperPersonalTemplates({ document, pageId, media, disabled, onUse, onNotice, onExport }) {
	const key = JSON.stringify([
		media.accountId,
		media.spaceId,
		document.noteId
	]), latest = useRef(key);
	latest.current = key;
	const documentRef = useRef(document);
	documentRef.current = document;
	const session = useMemo(() => ({
		key,
		alive: true,
		writable: true,
		pending: 0,
		opening: Promise.resolve(),
		tail: Promise.resolve()
	}), [key]);
	const [state, setState] = useState({
		key,
		library: null,
		saving: false,
		notice: ""
	}), [name, setName] = useState(""), [author, setAuthor] = useState(""), [mode, setMode] = useState("paper"), [pages, setPages] = useState("page"), [includeAudio, setIncludeAudio] = useState(false), [search, setSearch] = useState(""), [rename, setRename] = useState(null);
	const [pendingImport, setPendingImport] = useState(null);
	const details = useRef(null), input = useRef(null), current = () => session.alive && session.writable && latest.current === key;
	const read = async () => {
		const library = await loadPaperPersonalTemplates(media, current);
		if (current()) setState((old) => ({
			...old,
			key,
			library,
			saving: session.pending > 0,
			notice: ""
		}));
		return library;
	};
	useEffect(() => {
		session.alive = true;
		setName("");
		setAuthor("");
		setMode("paper");
		setPages("page");
		setIncludeAudio(false);
		setSearch("");
		setRename(null);
		setPendingImport(null);
		setState({
			key,
			library: null,
			saving: false,
			notice: ""
		});
		session.opening = read().then(() => {}).catch((error) => {
			if (current()) setState({
				key,
				library: null,
				saving: false,
				notice: String(error instanceof Error ? error.message : error)
			});
		});
		const unregister = registerNotebookWriter(media.accountId, {
			flush: () => {},
			settled: async () => {
				await session.opening;
				await session.tail;
			},
			pending: () => session.pending > 0,
			suspend: () => {
				session.writable = false;
			},
			resume: () => {
				session.writable = true;
			}
		});
		return () => {
			session.alive = false;
			unregister();
		};
	}, [session]);
	const queue = (work) => {
		if (disabled || !current()) return Promise.resolve(false);
		session.pending++;
		setState((old) => old.key === key ? {
			...old,
			saving: true,
			notice: ""
		} : old);
		const pending = session.tail.catch(() => {}).then(async () => {
			await session.opening;
			if (!current()) return false;
			try {
				const message = await work();
				if (!current()) return false;
				await read();
				if (!current()) return false;
				if (message) {
					setState((old) => ({
						...old,
						notice: message
					}));
					onNotice(message);
				}
				return true;
			} catch (error) {
				if (current()) {
					const message = String(error instanceof Error ? error.message : error);
					try {
						await read();
					} catch {}
					if (current()) {
						setState((old) => ({
							...old,
							notice: message
						}));
						onNotice(message);
					}
				}
				return false;
			}
		}).finally(() => {
			session.pending--;
			if (session.alive && latest.current === key) setState((old) => old.key === key ? {
				...old,
				saving: session.pending > 0
			} : old);
		});
		session.tail = pending.then(() => {});
		return pending;
	};
	const library = state.key === key ? state.library : null, busy = disabled || !library || state.key === key && state.saving, templates = (library?.templates ?? []).filter((template) => [template.name, template.author ?? ""].join(" ").toLocaleLowerCase().includes(search.toLocaleLowerCase()));
	const create = () => {
		const source = documentRef.current, capturedName = name, capturedAuthor = author, selected = pages === "page" ? [pageId] : void 0;
		queue(async () => {
			await createPaperPersonalTemplate({
				document: source,
				media,
				name: capturedName,
				author: capturedAuthor.trim() || void 0,
				pageIds: selected,
				mode,
				includeAudio: mode === "content" && includeAudio,
				current
			});
			return "Modèle enregistré sur cet appareil. Ses pages et ses originaux sont conservés.";
		});
	};
	const importFile = (file) => {
		queue(async () => {
			const preview = await inspectPaperPersonalTemplateImport(file, current);
			if (current()) setPendingImport({
				file,
				preview,
				name: preview.name,
				author: preview.author ?? "",
				mode: preview.mode,
				includeAudio: preview.includeAudio,
				pageId: ""
			});
		});
	};
	const confirmImport = () => {
		if (!pendingImport) return;
		const captured = pendingImport;
		queue(async () => {
			await importPaperPersonalTemplate({
				file: captured.file,
				media,
				name: captured.name,
				author: captured.author.trim(),
				pageIds: captured.pageId ? [captured.pageId] : void 0,
				mode: captured.mode,
				includeAudio: captured.mode === "content" && captured.includeAudio,
				current
			});
			if (current()) setPendingImport(null);
			return "Modèle importé et vérifié. Le fichier source est conservé ; aucune note existante n’a été remplacée.";
		});
	};
	const download = (template) => {
		queue(async () => {
			const blob = await exportPaperPersonalTemplate(template, media, current);
			if (!current()) return;
			const filename = template.name.replace(/[\\/:*?"<>|]/g, "-") + ".dowzetemplate";
			if (onExport) {
				if (await onExport(blob, filename) === false) return;
			} else {
				const url = URL.createObjectURL(blob), anchor = window.document.createElement("a");
				anchor.href = url;
				anchor.download = filename;
				anchor.click();
				setTimeout(() => URL.revokeObjectURL(url), 6e4);
			}
			return "Modèle portable prêt. Importez ce fichier sur un autre appareil pour le retrouver.";
		});
	};
	const use = (template) => {
		queue(async () => {
			if (!await onUse(template)) throw Error("Le modèle attend l’enregistrement de la note courante. Aucun original n’est remplacé.");
			return "Pages du modèle ajoutées avec des identités indépendantes. La note et le modèle sources restent intacts.";
		});
	};
	const submitRename = () => {
		if (!rename) return;
		const captured = rename;
		setRename(null);
		queue(async () => {
			await updatePaperPersonalTemplate({
				template: captured.template,
				scope: media,
				name: captured.value,
				current
			});
			return "Nom du modèle enregistré. Sa version précédente reste conservée.";
		});
	};
	return /* @__PURE__ */ jsxDEV("details", {
		ref: details,
		className: "paper-personal-templates",
		children: [/* @__PURE__ */ jsxDEV("summary", { children: [/* @__PURE__ */ jsxDEV(Library, {}, void 0, false, {
			fileName: _jsxFileName,
			lineNumber: 30,
			columnNumber: 78
		}, this), "Mes modèles personnels"] }, void 0, true, {
			fileName: _jsxFileName,
			lineNumber: 30,
			columnNumber: 69
		}, this), /* @__PURE__ */ jsxDEV("div", {
			className: "paper-personal-template-content",
			children: [
				/* @__PURE__ */ jsxDEV("header", {
					className: "paper-personal-template-header",
					children: [/* @__PURE__ */ jsxDEV("strong", { children: "Mes modèles personnels" }, void 0, false, {
						fileName: _jsxFileName,
						lineNumber: 30,
						columnNumber: 220
					}, this), /* @__PURE__ */ jsxDEV("button", {
						type: "button",
						"aria-label": "Fermer les modèles personnels",
						onClick: () => {
							if (details.current) {
								details.current.open = false;
								details.current.querySelector("summary")?.focus();
							}
						},
						children: /* @__PURE__ */ jsxDEV(X, {}, void 0, false, {
							fileName: _jsxFileName,
							lineNumber: 30,
							columnNumber: 452
						}, this)
					}, void 0, false, {
						fileName: _jsxFileName,
						lineNumber: 30,
						columnNumber: 259
					}, this)]
				}, void 0, true, {
					fileName: _jsxFileName,
					lineNumber: 30,
					columnNumber: 169
				}, this),
				/* @__PURE__ */ jsxDEV("p", { children: "Une bibliothèque locale à cet espace. Les fichiers portables permettent de transférer vos modèles entre appareils." }, void 0, false, {
					fileName: _jsxFileName,
					lineNumber: 31,
					columnNumber: 2
				}, this),
				/* @__PURE__ */ jsxDEV("form", {
					onSubmit: (event) => {
						event.preventDefault();
						create();
					},
					children: [
						/* @__PURE__ */ jsxDEV("h4", { children: "Créer depuis la note" }, void 0, false, {
							fileName: _jsxFileName,
							lineNumber: 32,
							columnNumber: 61
						}, this),
						/* @__PURE__ */ jsxDEV("label", { children: ["Nom", /* @__PURE__ */ jsxDEV("input", {
							"aria-label": "Nom du modèle personnel",
							value: name,
							maxLength: 120,
							disabled: busy,
							onChange: (event) => setName(event.target.value)
						}, void 0, false, {
							fileName: _jsxFileName,
							lineNumber: 32,
							columnNumber: 100
						}, this)] }, void 0, true, {
							fileName: _jsxFileName,
							lineNumber: 32,
							columnNumber: 90
						}, this),
						/* @__PURE__ */ jsxDEV("label", { children: ["Auteur facultatif", /* @__PURE__ */ jsxDEV("input", {
							"aria-label": "Auteur du modèle personnel",
							value: author,
							maxLength: 120,
							disabled: busy,
							onChange: (event) => setAuthor(event.target.value)
						}, void 0, false, {
							fileName: _jsxFileName,
							lineNumber: 32,
							columnNumber: 268
						}, this)] }, void 0, true, {
							fileName: _jsxFileName,
							lineNumber: 32,
							columnNumber: 244
						}, this),
						/* @__PURE__ */ jsxDEV("label", { children: ["Pages", /* @__PURE__ */ jsxDEV("select", {
							"aria-label": "Pages du modèle personnel",
							value: pages,
							disabled: busy,
							onChange: (event) => setPages(event.target.value),
							children: [/* @__PURE__ */ jsxDEV("option", {
								value: "page",
								children: "La page affichée"
							}, void 0, false, {
								fileName: _jsxFileName,
								lineNumber: 32,
								columnNumber: 571
							}, this), /* @__PURE__ */ jsxDEV("option", {
								value: "all",
								children: "Toutes les pages de cette note"
							}, void 0, false, {
								fileName: _jsxFileName,
								lineNumber: 32,
								columnNumber: 617
							}, this)]
						}, void 0, true, {
							fileName: _jsxFileName,
							lineNumber: 32,
							columnNumber: 431
						}, this)] }, void 0, true, {
							fileName: _jsxFileName,
							lineNumber: 32,
							columnNumber: 419
						}, this),
						/* @__PURE__ */ jsxDEV("label", { children: ["Contenu", /* @__PURE__ */ jsxDEV("select", {
							"aria-label": "Contenu du modèle personnel",
							value: mode,
							disabled: busy,
							onChange: (event) => {
								setMode(event.target.value);
								setIncludeAudio(false);
							},
							children: [
								/* @__PURE__ */ jsxDEV("option", {
									value: "paper",
									children: "Papier seul, sans PDF ni contenu"
								}, void 0, false, {
									fileName: _jsxFileName,
									lineNumber: 32,
									columnNumber: 886
								}, this),
								/* @__PURE__ */ jsxDEV("option", {
									value: "background",
									children: "Papier et fond PDF, fichier original complet"
								}, void 0, false, {
									fileName: _jsxFileName,
									lineNumber: 32,
									columnNumber: 949
								}, this),
								/* @__PURE__ */ jsxDEV("option", {
									value: "content",
									children: "Texte, dessins, images et fond PDF"
								}, void 0, false, {
									fileName: _jsxFileName,
									lineNumber: 32,
									columnNumber: 1029
								}, this)
							]
						}, void 0, true, {
							fileName: _jsxFileName,
							lineNumber: 32,
							columnNumber: 707
						}, this)] }, void 0, true, {
							fileName: _jsxFileName,
							lineNumber: 32,
							columnNumber: 693
						}, this),
						mode === "content" && /* @__PURE__ */ jsxDEV("label", { children: [/* @__PURE__ */ jsxDEV("input", {
							type: "checkbox",
							"aria-label": "Inclure les enregistrements audio dans le modèle",
							checked: includeAudio,
							disabled: busy,
							onChange: (event) => setIncludeAudio(event.target.checked)
						}, void 0, false, {
							fileName: _jsxFileName,
							lineNumber: 33,
							columnNumber: 28
						}, this), "Inclure les enregistrements de la note entière et leurs repères."] }, void 0, true, {
							fileName: _jsxFileName,
							lineNumber: 33,
							columnNumber: 21
						}, this),
						/* @__PURE__ */ jsxDEV("small", { children: mode === "content" && !includeAudio ? "Les repères audio sont retirés de la copie. Vos enregistrements et repères sources restent dans la note." : "Les informations de cours, le classement, les connexions et les collaborateurs ne sont pas importés avec le modèle." }, void 0, false, {
							fileName: _jsxFileName,
							lineNumber: 34,
							columnNumber: 2
						}, this),
						/* @__PURE__ */ jsxDEV("button", {
							type: "submit",
							"aria-label": "Créer le modèle personnel",
							disabled: busy || !name.trim(),
							children: [/* @__PURE__ */ jsxDEV(FilePlus2, {}, void 0, false, {
								fileName: _jsxFileName,
								lineNumber: 34,
								columnNumber: 366
							}, this), "Créer le modèle"]
						}, void 0, true, {
							fileName: _jsxFileName,
							lineNumber: 34,
							columnNumber: 275
						}, this)
					]
				}, void 0, true, {
					fileName: _jsxFileName,
					lineNumber: 32,
					columnNumber: 2
				}, this),
				/* @__PURE__ */ jsxDEV("div", {
					className: "paper-personal-template-import",
					children: [/* @__PURE__ */ jsxDEV("button", {
						"aria-label": "Importer un modèle personnel",
						disabled: busy,
						onClick: () => input.current?.click(),
						children: [/* @__PURE__ */ jsxDEV(Upload, {}, void 0, false, {
							fileName: _jsxFileName,
							lineNumber: 35,
							columnNumber: 153
						}, this), "Importer un modèle ou une note .dowze"]
					}, void 0, true, {
						fileName: _jsxFileName,
						lineNumber: 35,
						columnNumber: 50
					}, this), /* @__PURE__ */ jsxDEV("input", {
						ref: input,
						hidden: true,
						type: "file",
						"aria-label": "Fichier de modèle personnel",
						accept: ".dowzetemplate,.dowze,.zip,application/zip,application/vnd.dowze.page-template",
						onChange: (event) => {
							const file = event.target.files?.[0];
							event.target.value = "";
							if (file) importFile(file);
						}
					}, void 0, false, {
						fileName: _jsxFileName,
						lineNumber: 35,
						columnNumber: 208
					}, this)]
				}, void 0, true, {
					fileName: _jsxFileName,
					lineNumber: 35,
					columnNumber: 2
				}, this),
				pendingImport && /* @__PURE__ */ jsxDEV("form", {
					"aria-label": "Configurer l’import du modèle personnel",
					onSubmit: (event) => {
						event.preventDefault();
						confirmImport();
					},
					children: [
						/* @__PURE__ */ jsxDEV("h4", { children: ["Importer ", pendingImport.file.name ?? "le fichier"] }, void 0, true, {
							fileName: _jsxFileName,
							lineNumber: 36,
							columnNumber: 137
						}, this),
						/* @__PURE__ */ jsxDEV("small", { children: pendingImport.preview.kind === "template" ? "Les réglages du modèle portable sont repris. Vous pouvez les adapter ci-dessous." : "Choisissez les pages et le contenu à rendre réutilisables. Le fichier original sera conservé intégralement." }, void 0, false, {
							fileName: _jsxFileName,
							lineNumber: 36,
							columnNumber: 194
						}, this),
						/* @__PURE__ */ jsxDEV("label", { children: ["Nom", /* @__PURE__ */ jsxDEV("input", {
							"aria-label": "Nom du modèle importé",
							value: pendingImport.name,
							maxLength: 120,
							disabled: busy,
							onChange: (event) => setPendingImport({
								...pendingImport,
								name: event.target.value
							})
						}, void 0, false, {
							fileName: _jsxFileName,
							lineNumber: 36,
							columnNumber: 453
						}, this)] }, void 0, true, {
							fileName: _jsxFileName,
							lineNumber: 36,
							columnNumber: 443
						}, this),
						/* @__PURE__ */ jsxDEV("label", { children: ["Auteur facultatif", /* @__PURE__ */ jsxDEV("input", {
							"aria-label": "Auteur du modèle importé",
							value: pendingImport.author,
							maxLength: 120,
							disabled: busy,
							onChange: (event) => setPendingImport({
								...pendingImport,
								author: event.target.value
							})
						}, void 0, false, {
							fileName: _jsxFileName,
							lineNumber: 36,
							columnNumber: 666
						}, this)] }, void 0, true, {
							fileName: _jsxFileName,
							lineNumber: 36,
							columnNumber: 642
						}, this),
						/* @__PURE__ */ jsxDEV("label", { children: ["Pages", /* @__PURE__ */ jsxDEV("select", {
							"aria-label": "Pages du modèle importé",
							value: pendingImport.pageId,
							disabled: busy,
							onChange: (event) => setPendingImport({
								...pendingImport,
								pageId: event.target.value
							}),
							children: [/* @__PURE__ */ jsxDEV("option", {
								value: "",
								children: "Toutes les pages du fichier"
							}, void 0, false, {
								fileName: _jsxFileName,
								lineNumber: 36,
								columnNumber: 1045
							}, this), pendingImport.preview.pages.map((page) => /* @__PURE__ */ jsxDEV("option", {
								value: page.id,
								children: ["Page ", page.number]
							}, page.id, true, {
								fileName: _jsxFileName,
								lineNumber: 36,
								columnNumber: 1137
							}, this))]
						}, void 0, true, {
							fileName: _jsxFileName,
							lineNumber: 36,
							columnNumber: 874
						}, this)] }, void 0, true, {
							fileName: _jsxFileName,
							lineNumber: 36,
							columnNumber: 862
						}, this),
						/* @__PURE__ */ jsxDEV("label", { children: ["Contenu", /* @__PURE__ */ jsxDEV("select", {
							"aria-label": "Contenu du modèle importé",
							value: pendingImport.mode,
							disabled: busy,
							onChange: (event) => setPendingImport({
								...pendingImport,
								mode: event.target.value,
								includeAudio: false
							}),
							children: [
								/* @__PURE__ */ jsxDEV("option", {
									value: "paper",
									children: "Papier seul, sans PDF ni contenu"
								}, void 0, false, {
									fileName: _jsxFileName,
									lineNumber: 36,
									columnNumber: 1452
								}, this),
								/* @__PURE__ */ jsxDEV("option", {
									value: "background",
									children: "Papier et fond PDF, fichier original complet"
								}, void 0, false, {
									fileName: _jsxFileName,
									lineNumber: 36,
									columnNumber: 1515
								}, this),
								/* @__PURE__ */ jsxDEV("option", {
									value: "content",
									children: "Texte, dessins, images et fond PDF"
								}, void 0, false, {
									fileName: _jsxFileName,
									lineNumber: 36,
									columnNumber: 1595
								}, this)
							]
						}, void 0, true, {
							fileName: _jsxFileName,
							lineNumber: 36,
							columnNumber: 1235
						}, this)] }, void 0, true, {
							fileName: _jsxFileName,
							lineNumber: 36,
							columnNumber: 1221
						}, this),
						pendingImport.mode === "content" && pendingImport.preview.audioCount > 0 && /* @__PURE__ */ jsxDEV("label", { children: [
							/* @__PURE__ */ jsxDEV("input", {
								type: "checkbox",
								"aria-label": "Inclure les enregistrements audio importés",
								checked: pendingImport.includeAudio,
								disabled: busy,
								onChange: (event) => setPendingImport({
									...pendingImport,
									includeAudio: event.target.checked
								})
							}, void 0, false, {
								fileName: _jsxFileName,
								lineNumber: 36,
								columnNumber: 1755
							}, this),
							"Inclure les ",
							pendingImport.preview.audioCount,
							" enregistrement",
							pendingImport.preview.audioCount > 1 ? "s" : "",
							" du fichier entier et leurs repères."
						] }, void 0, true, {
							fileName: _jsxFileName,
							lineNumber: 36,
							columnNumber: 1748
						}, this),
						/* @__PURE__ */ jsxDEV("small", { children: pendingImport.mode === "content" && !pendingImport.includeAudio ? "Les enregistrements et repères sont exclus de la copie réutilisable. Ils restent dans le fichier source conservé." : "Le classement, les connexions et les collaborateurs ne sont pas importés." }, void 0, false, {
							fileName: _jsxFileName,
							lineNumber: 36,
							columnNumber: 2126
						}, this),
						/* @__PURE__ */ jsxDEV("button", {
							type: "submit",
							"aria-label": "Confirmer l’import du modèle personnel",
							disabled: busy || !pendingImport.name.trim(),
							children: "Importer ces pages"
						}, void 0, false, {
							fileName: _jsxFileName,
							lineNumber: 36,
							columnNumber: 2394
						}, this),
						/* @__PURE__ */ jsxDEV("button", {
							type: "button",
							disabled: busy,
							onClick: () => setPendingImport(null),
							children: "Annuler l’import"
						}, void 0, false, {
							fileName: _jsxFileName,
							lineNumber: 36,
							columnNumber: 2539
						}, this)
					]
				}, void 0, true, {
					fileName: _jsxFileName,
					lineNumber: 36,
					columnNumber: 18
				}, this),
				/* @__PURE__ */ jsxDEV("label", { children: ["Rechercher", /* @__PURE__ */ jsxDEV("input", {
					type: "search",
					"aria-label": "Rechercher un modèle personnel",
					value: search,
					onChange: (event) => setSearch(event.target.value)
				}, void 0, false, {
					fileName: _jsxFileName,
					lineNumber: 37,
					columnNumber: 19
				}, this)] }, void 0, true, {
					fileName: _jsxFileName,
					lineNumber: 37,
					columnNumber: 2
				}, this),
				rename && /* @__PURE__ */ jsxDEV("form", {
					onSubmit: (event) => {
						event.preventDefault();
						submitRename();
					},
					children: [
						/* @__PURE__ */ jsxDEV("label", { children: ["Nouveau nom", /* @__PURE__ */ jsxDEV("input", {
							"aria-label": "Nouveau nom du modèle personnel",
							value: rename.value,
							maxLength: 120,
							autoFocus: true,
							onChange: (event) => setRename({
								...rename,
								value: event.target.value
							})
						}, void 0, false, {
							fileName: _jsxFileName,
							lineNumber: 38,
							columnNumber: 94
						}, this)] }, void 0, true, {
							fileName: _jsxFileName,
							lineNumber: 38,
							columnNumber: 76
						}, this),
						/* @__PURE__ */ jsxDEV("button", {
							type: "submit",
							disabled: busy || !rename.value.trim(),
							children: "Enregistrer le nom"
						}, void 0, false, {
							fileName: _jsxFileName,
							lineNumber: 38,
							columnNumber: 268
						}, this),
						/* @__PURE__ */ jsxDEV("button", {
							type: "button",
							onClick: () => setRename(null),
							children: "Annuler"
						}, void 0, false, {
							fileName: _jsxFileName,
							lineNumber: 38,
							columnNumber: 355
						}, this)
					]
				}, void 0, true, {
					fileName: _jsxFileName,
					lineNumber: 38,
					columnNumber: 11
				}, this),
				!templates.length && library && /* @__PURE__ */ jsxDEV("p", { children: search ? "Aucun modèle ne correspond à cette recherche." : "Créez un modèle depuis une page ou importez une note pour commencer." }, void 0, false, {
					fileName: _jsxFileName,
					lineNumber: 39,
					columnNumber: 31
				}, this),
				/* @__PURE__ */ jsxDEV("ul", {
					className: "paper-personal-template-list",
					children: templates.map((template) => /* @__PURE__ */ jsxDEV("li", {
						"data-personal-template": template.id,
						children: [/* @__PURE__ */ jsxDEV("div", { children: [
							/* @__PURE__ */ jsxDEV("strong", { children: template.name }, void 0, false, {
								fileName: _jsxFileName,
								lineNumber: 40,
								columnNumber: 136
							}, this),
							template.author && /* @__PURE__ */ jsxDEV("span", { children: template.author }, void 0, false, {
								fileName: _jsxFileName,
								lineNumber: 40,
								columnNumber: 186
							}, this),
							/* @__PURE__ */ jsxDEV("small", { children: [
								modeLabels[template.mode],
								" · ",
								template.pageCount,
								" page",
								template.pageCount > 1 ? "s" : "",
								" · ",
								template.objectCount,
								" élément",
								template.objectCount > 1 ? "s" : "",
								" · version ",
								template.version,
								template.includeAudio ? " · audio inclus" : ""
							] }, void 0, true, {
								fileName: _jsxFileName,
								lineNumber: 40,
								columnNumber: 217
							}, this)
						] }, void 0, true, {
							fileName: _jsxFileName,
							lineNumber: 40,
							columnNumber: 131
						}, this), /* @__PURE__ */ jsxDEV("div", { children: [
							/* @__PURE__ */ jsxDEV("button", {
								"aria-label": `Utiliser le modèle ${template.name}`,
								disabled: busy,
								onClick: () => use(template),
								children: [/* @__PURE__ */ jsxDEV(Plus, {}, void 0, false, {
									fileName: _jsxFileName,
									lineNumber: 40,
									columnNumber: 567
								}, this), "Utiliser"]
							}, void 0, true, {
								fileName: _jsxFileName,
								lineNumber: 40,
								columnNumber: 464
							}, this),
							/* @__PURE__ */ jsxDEV("button", {
								"aria-label": `Exporter le modèle ${template.name}`,
								disabled: busy,
								onClick: () => download(template),
								children: [/* @__PURE__ */ jsxDEV(Download, {}, void 0, false, {
									fileName: _jsxFileName,
									lineNumber: 40,
									columnNumber: 699
								}, this), "Exporter"]
							}, void 0, true, {
								fileName: _jsxFileName,
								lineNumber: 40,
								columnNumber: 591
							}, this),
							/* @__PURE__ */ jsxDEV("button", {
								"aria-label": `Renommer le modèle ${template.name}`,
								disabled: busy,
								onClick: () => setRename({
									template,
									value: template.name
								}),
								children: /* @__PURE__ */ jsxDEV(Pencil, {}, void 0, false, {
									fileName: _jsxFileName,
									lineNumber: 40,
									columnNumber: 858
								}, this)
							}, void 0, false, {
								fileName: _jsxFileName,
								lineNumber: 40,
								columnNumber: 727
							}, this),
							/* @__PURE__ */ jsxDEV("button", {
								"aria-label": `Retirer le modèle ${template.name}`,
								disabled: busy,
								onClick: () => void queue(async () => {
									await updatePaperPersonalTemplate({
										template,
										scope: media,
										remove: true,
										current
									});
									return "Modèle retiré de la bibliothèque. Ses versions et ses sources restent conservées.";
								}),
								children: /* @__PURE__ */ jsxDEV(Trash2, {}, void 0, false, {
									fileName: _jsxFileName,
									lineNumber: 40,
									columnNumber: 1157
								}, this)
							}, void 0, false, {
								fileName: _jsxFileName,
								lineNumber: 40,
								columnNumber: 876
							}, this)
						] }, void 0, true, {
							fileName: _jsxFileName,
							lineNumber: 40,
							columnNumber: 459
						}, this)]
					}, template.id, true, {
						fileName: _jsxFileName,
						lineNumber: 40,
						columnNumber: 72
					}, this))
				}, void 0, false, {
					fileName: _jsxFileName,
					lineNumber: 40,
					columnNumber: 2
				}, this),
				/* @__PURE__ */ jsxDEV("span", {
					role: "status",
					children: state.key === key && (state.notice || (state.saving ? "Enregistrement du modèle…" : !library ? "Ouverture des modèles…" : ""))
				}, void 0, false, {
					fileName: _jsxFileName,
					lineNumber: 41,
					columnNumber: 2
				}, this)
			]
		}, void 0, true, {
			fileName: _jsxFileName,
			lineNumber: 30,
			columnNumber: 120
		}, this)]
	}, void 0, true, {
		fileName: _jsxFileName,
		lineNumber: 30,
		columnNumber: 9
	}, this);
}
//#endregion
export { PaperPersonalTemplates };
