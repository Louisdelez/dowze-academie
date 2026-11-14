import { C as importStudyRows, D as studySource, E as sourceIsCurrent, O as suggestClozeCards, S as emptyStudy, k as summaryExcerpts, w as initialSchedule } from "./notebookDocument-yuVu6oXC.js";
import { PaperRichText } from "../smart-highlight-independent.mjs";
import { useMemo, useRef, useState } from "react";
import { Fragment, jsxDEV } from "react/jsx-dev-runtime";
import { BookOpenCheck, Check, ChevronRight, FileText, Plus, RotateCcw, Trash2, Upload } from "lucide-react";
//#region src/components/PaperStudyPanel.tsx
var _jsxFileName = "/home/louis/DowzeBuild/20260923/collections-060/src/components/PaperStudyPanel.tsx";
function PaperStudyPanel({ document, media, disabled, onCommit, onPage, onClose, onNotice }) {
	const study = document.study ?? emptyStudy();
	const [view, setView] = useState("cards"), [creating, setCreating] = useState(false), [question, setQuestion] = useState(""), [answer, setAnswer] = useState(""), [sourceId, setSourceId] = useState(""), [suggestions, setSuggestions] = useState([]), [queue, setQueue] = useState([]), [revealed, setRevealed] = useState(false), [typed, setTyped] = useState(""), [rated, setRated] = useState(0), [sessionTotal, setSessionTotal] = useState(0);
	const input = useRef(null);
	const excerpts = useMemo(() => summaryExcerpts(document), [document]);
	const active = study.cards.find((c) => c.id === queue[0]);
	const due = study.cards.filter((c) => Date.parse(c.schedule.dueAt) <= Date.now());
	const create = (e) => {
		e.preventDefault();
		if (!question.trim() || !answer.trim()) {
			onNotice("Renseignez la question et la réponse de la fiche.");
			return;
		}
		const object = document.objects.find((o) => o.id === sourceId);
		if (onCommit({
			type: "study-card",
			card: {
				id: crypto.randomUUID(),
				kind: "basic",
				question: question.trim(),
				answer: answer.trim(),
				schedule: initialSchedule(),
				reviews: [],
				createdAt: (/* @__PURE__ */ new Date()).toISOString(),
				...object ? { source: studySource(document, object, object.markdown ?? "") } : {}
			}
		})) {
			setQuestion("");
			setAnswer("");
			setCreating(false);
		}
	};
	const startReview = (all = false) => {
		setQueue((all ? study.cards : due).map((c) => c.id));
		setSessionTotal((all ? study.cards : due).length);
		setRated(0);
		setRevealed(false);
		setTyped("");
		setView("review");
	};
	const rate = (quality) => {
		if (!active) return;
		if (!onCommit({
			type: "review-card",
			id: active.id,
			quality,
			reviewId: crypto.randomUUID()
		})) return;
		setQueue((ids) => quality < 4 ? [...ids.slice(1), ids[0]] : ids.slice(1));
		if (quality >= 4) setRated((n) => n + 1);
		setRevealed(false);
		setTyped("");
	};
	const importFile = async (file) => {
		try {
			const result = importStudyRows(await file.text());
			onCommit({
				type: "batch",
				commands: result.cards.map((card) => ({
					type: "study-card",
					card
				}))
			});
			onNotice(`${result.cards.length} cartes importées · ${result.rejected} lignes ignorées car incomplètes.`);
		} catch (e) {
			onNotice(String(e instanceof Error ? e.message : e));
		}
	};
	return /* @__PURE__ */ jsxDEV("aside", {
		className: "paper-study-panel",
		"aria-label": "Révision de la note",
		children: [
			/* @__PURE__ */ jsxDEV("header", { children: [
				/* @__PURE__ */ jsxDEV(BookOpenCheck, {}, void 0, false, {
					fileName: _jsxFileName,
					lineNumber: 14,
					columnNumber: 87
				}, this),
				/* @__PURE__ */ jsxDEV("strong", { children: "Réviser" }, void 0, false, {
					fileName: _jsxFileName,
					lineNumber: 14,
					columnNumber: 103
				}, this),
				/* @__PURE__ */ jsxDEV("button", {
					onClick: onClose,
					"aria-label": "Fermer les révisions",
					children: "×"
				}, void 0, false, {
					fileName: _jsxFileName,
					lineNumber: 14,
					columnNumber: 127
				}, this)
			] }, void 0, true, {
				fileName: _jsxFileName,
				lineNumber: 14,
				columnNumber: 79
			}, this),
			/* @__PURE__ */ jsxDEV("nav", {
				"aria-label": "Outils de révision",
				children: [
					["cards", "Fiches"],
					["review", "Révision"],
					["summary", "Extraits"]
				].map(([id, label]) => /* @__PURE__ */ jsxDEV("button", {
					"aria-pressed": view === id,
					onClick: () => {
						if (id === "review") startReview();
						else setView(id);
					},
					children: label
				}, id, false, {
					fileName: _jsxFileName,
					lineNumber: 14,
					columnNumber: 339
				}, this))
			}, void 0, false, {
				fileName: _jsxFileName,
				lineNumber: 14,
				columnNumber: 206
			}, this),
			/* @__PURE__ */ jsxDEV("label", {
				className: "paper-study-language",
				children: ["Langue", /* @__PURE__ */ jsxDEV("select", {
					"aria-label": "Langue de la note",
					disabled,
					value: study.language,
					onChange: (e) => onCommit({
						type: "study-language",
						language: e.target.value
					}),
					children: [
						/* @__PURE__ */ jsxDEV("option", {
							value: "fr",
							children: "Français"
						}, void 0, false, {
							fileName: _jsxFileName,
							lineNumber: 15,
							columnNumber: 202
						}, this),
						/* @__PURE__ */ jsxDEV("option", {
							value: "en",
							children: "English"
						}, void 0, false, {
							fileName: _jsxFileName,
							lineNumber: 15,
							columnNumber: 238
						}, this),
						/* @__PURE__ */ jsxDEV("option", {
							value: "de",
							children: "Deutsch"
						}, void 0, false, {
							fileName: _jsxFileName,
							lineNumber: 15,
							columnNumber: 273
						}, this),
						/* @__PURE__ */ jsxDEV("option", {
							value: "it",
							children: "Italiano"
						}, void 0, false, {
							fileName: _jsxFileName,
							lineNumber: 15,
							columnNumber: 308
						}, this),
						/* @__PURE__ */ jsxDEV("option", {
							value: "es",
							children: "Español"
						}, void 0, false, {
							fileName: _jsxFileName,
							lineNumber: 15,
							columnNumber: 344
						}, this)
					]
				}, void 0, true, {
					fileName: _jsxFileName,
					lineNumber: 15,
					columnNumber: 48
				}, this)]
			}, void 0, true, {
				fileName: _jsxFileName,
				lineNumber: 15,
				columnNumber: 2
			}, this),
			view === "cards" && /* @__PURE__ */ jsxDEV(Fragment, { children: [
				/* @__PURE__ */ jsxDEV("div", {
					className: "paper-study-actions",
					children: [
						/* @__PURE__ */ jsxDEV("button", {
							disabled,
							onClick: () => setCreating((v) => !v),
							children: [/* @__PURE__ */ jsxDEV(Plus, {}, void 0, false, {
								fileName: _jsxFileName,
								lineNumber: 16,
								columnNumber: 119
							}, this), "Créer une fiche"]
						}, void 0, true, {
							fileName: _jsxFileName,
							lineNumber: 16,
							columnNumber: 58
						}, this),
						/* @__PURE__ */ jsxDEV("button", {
							disabled,
							onClick: () => {
								setSuggestions(suggestClozeCards(document).filter((c) => !study.cards.some((old) => old.id === c.id)));
							},
							children: "Proposer des textes à compléter"
						}, void 0, false, {
							fileName: _jsxFileName,
							lineNumber: 16,
							columnNumber: 150
						}, this),
						/* @__PURE__ */ jsxDEV("button", {
							disabled,
							onClick: () => input.current?.click(),
							children: [/* @__PURE__ */ jsxDEV(Upload, {}, void 0, false, {
								fileName: _jsxFileName,
								lineNumber: 16,
								columnNumber: 393
							}, this), "Importer CSV / TXT"]
						}, void 0, true, {
							fileName: _jsxFileName,
							lineNumber: 16,
							columnNumber: 328
						}, this),
						/* @__PURE__ */ jsxDEV("input", {
							ref: input,
							hidden: true,
							type: "file",
							accept: ".csv,.tsv,.txt,text/csv,text/plain",
							onChange: (e) => {
								const file = e.target.files?.[0];
								e.target.value = "";
								if (file) importFile(file);
							}
						}, void 0, false, {
							fileName: _jsxFileName,
							lineNumber: 16,
							columnNumber: 429
						}, this)
					]
				}, void 0, true, {
					fileName: _jsxFileName,
					lineNumber: 16,
					columnNumber: 21
				}, this),
				creating && /* @__PURE__ */ jsxDEV("form", {
					className: "paper-card-form",
					onSubmit: create,
					children: [
						/* @__PURE__ */ jsxDEV("label", { children: ["Question", /* @__PURE__ */ jsxDEV("textarea", {
							"aria-label": "Question de la fiche",
							value: question,
							required: true,
							maxLength: 1e4,
							onChange: (e) => setQuestion(e.target.value)
						}, void 0, false, {
							fileName: _jsxFileName,
							lineNumber: 17,
							columnNumber: 80
						}, this)] }, void 0, true, {
							fileName: _jsxFileName,
							lineNumber: 17,
							columnNumber: 65
						}, this),
						/* @__PURE__ */ jsxDEV("label", { children: ["Réponse", /* @__PURE__ */ jsxDEV("textarea", {
							"aria-label": "Réponse de la fiche",
							value: answer,
							required: true,
							maxLength: 1e4,
							onChange: (e) => setAnswer(e.target.value)
						}, void 0, false, {
							fileName: _jsxFileName,
							lineNumber: 17,
							columnNumber: 233
						}, this)] }, void 0, true, {
							fileName: _jsxFileName,
							lineNumber: 17,
							columnNumber: 219
						}, this),
						/* @__PURE__ */ jsxDEV("label", { children: ["Source", /* @__PURE__ */ jsxDEV("select", {
							"aria-label": "Source de la fiche",
							value: sourceId,
							onChange: (e) => setSourceId(e.target.value),
							children: [/* @__PURE__ */ jsxDEV("option", {
								value: "",
								children: "Fiche personnelle"
							}, void 0, false, {
								fileName: _jsxFileName,
								lineNumber: 17,
								columnNumber: 479
							}, this), document.objects.filter((o) => o.markdown).map((o) => /* @__PURE__ */ jsxDEV("option", {
								value: o.id,
								children: [
									"Page ",
									document.pages.findIndex((p) => p.id === o.pageId) + 1,
									" · ",
									o.markdown.slice(0, 40)
								]
							}, o.id, true, {
								fileName: _jsxFileName,
								lineNumber: 17,
								columnNumber: 569
							}, this))]
						}, void 0, true, {
							fileName: _jsxFileName,
							lineNumber: 17,
							columnNumber: 380
						}, this)] }, void 0, true, {
							fileName: _jsxFileName,
							lineNumber: 17,
							columnNumber: 367
						}, this),
						/* @__PURE__ */ jsxDEV("button", {
							disabled,
							type: "submit",
							children: [/* @__PURE__ */ jsxDEV(Check, {}, void 0, false, {
								fileName: _jsxFileName,
								lineNumber: 17,
								columnNumber: 752
							}, this), "Enregistrer la fiche"]
						}, void 0, true, {
							fileName: _jsxFileName,
							lineNumber: 17,
							columnNumber: 710
						}, this)
					]
				}, void 0, true, {
					fileName: _jsxFileName,
					lineNumber: 17,
					columnNumber: 13
				}, this),
				suggestions.length > 0 && /* @__PURE__ */ jsxDEV("section", {
					className: "paper-card-suggestions",
					children: [
						/* @__PURE__ */ jsxDEV("h3", { children: "Propositions à relire" }, void 0, false, {
							fileName: _jsxFileName,
							lineNumber: 18,
							columnNumber: 69
						}, this),
						/* @__PURE__ */ jsxDEV("p", { children: "Ces textes à compléter reprennent vos phrases. Choisissez les fiches utiles." }, void 0, false, {
							fileName: _jsxFileName,
							lineNumber: 18,
							columnNumber: 99
						}, this),
						suggestions.map((c) => /* @__PURE__ */ jsxDEV("article", { children: [
							/* @__PURE__ */ jsxDEV(PaperRichText, {
								markdown: c.question,
								document,
								media
							}, void 0, false, {
								fileName: _jsxFileName,
								lineNumber: 18,
								columnNumber: 222
							}, this),
							/* @__PURE__ */ jsxDEV("small", { children: ["Réponse : ", c.answer] }, void 0, true, {
								fileName: _jsxFileName,
								lineNumber: 18,
								columnNumber: 294
							}, this),
							/* @__PURE__ */ jsxDEV("button", {
								disabled,
								onClick: () => {
									onCommit({
										type: "study-card",
										card: c
									});
									setSuggestions((old) => old.filter((s) => s.id !== c.id));
								},
								children: [/* @__PURE__ */ jsxDEV(Plus, {}, void 0, false, {
									fileName: _jsxFileName,
									lineNumber: 18,
									columnNumber: 459
								}, this), "Garder cette fiche"]
							}, void 0, true, {
								fileName: _jsxFileName,
								lineNumber: 18,
								columnNumber: 329
							}, this)
						] }, c.id, true, {
							fileName: _jsxFileName,
							lineNumber: 18,
							columnNumber: 202
						}, this))
					]
				}, void 0, true, {
					fileName: _jsxFileName,
					lineNumber: 18,
					columnNumber: 25
				}, this),
				/* @__PURE__ */ jsxDEV("div", {
					className: "paper-study-count",
					children: [
						/* @__PURE__ */ jsxDEV("strong", { children: [study.cards.length, " fiches"] }, void 0, true, {
							fileName: _jsxFileName,
							lineNumber: 19,
							columnNumber: 37
						}, this),
						/* @__PURE__ */ jsxDEV("span", { children: [due.length, " à réviser"] }, void 0, true, {
							fileName: _jsxFileName,
							lineNumber: 19,
							columnNumber: 81
						}, this),
						/* @__PURE__ */ jsxDEV("button", {
							disabled: !study.cards.length,
							onClick: () => startReview(true),
							children: "Toutes les revoir"
						}, void 0, false, {
							fileName: _jsxFileName,
							lineNumber: 19,
							columnNumber: 116
						}, this)
					]
				}, void 0, true, {
					fileName: _jsxFileName,
					lineNumber: 19,
					columnNumber: 2
				}, this),
				!study.cards.length && /* @__PURE__ */ jsxDEV("p", { children: "Créez une fiche ou proposez un texte à compléter à partir de votre note." }, void 0, false, {
					fileName: _jsxFileName,
					lineNumber: 20,
					columnNumber: 24
				}, this),
				study.cards.map((c) => /* @__PURE__ */ jsxDEV("article", {
					className: "paper-study-card",
					children: [
						/* @__PURE__ */ jsxDEV(PaperRichText, {
							markdown: c.question,
							document,
							media
						}, void 0, false, {
							fileName: _jsxFileName,
							lineNumber: 20,
							columnNumber: 173
						}, this),
						/* @__PURE__ */ jsxDEV("details", { children: [/* @__PURE__ */ jsxDEV("summary", { children: "Réponse" }, void 0, false, {
							fileName: _jsxFileName,
							lineNumber: 20,
							columnNumber: 254
						}, this), /* @__PURE__ */ jsxDEV(PaperRichText, {
							markdown: c.answer,
							document,
							media
						}, void 0, false, {
							fileName: _jsxFileName,
							lineNumber: 20,
							columnNumber: 280
						}, this)] }, void 0, true, {
							fileName: _jsxFileName,
							lineNumber: 20,
							columnNumber: 245
						}, this),
						c.source ? /* @__PURE__ */ jsxDEV("details", {
							className: "paper-card-source",
							children: [
								/* @__PURE__ */ jsxDEV("summary", { children: [document.pages.some((p) => p.id === c.source.pageId) ? `Source · page ${document.pages.findIndex((p) => p.id === c.source.pageId) + 1}` : "Source originale conservée", !sourceIsCurrent(document, c.source) && " · modifiée"] }, void 0, true, {
									fileName: _jsxFileName,
									lineNumber: 20,
									columnNumber: 409
								}, this),
								/* @__PURE__ */ jsxDEV(PaperRichText, {
									markdown: c.source.quote,
									document,
									media
								}, void 0, false, {
									fileName: _jsxFileName,
									lineNumber: 20,
									columnNumber: 632
								}, this),
								document.pages.some((p) => p.id === c.source.pageId) && /* @__PURE__ */ jsxDEV("button", {
									onClick: () => onPage(c.source.pageId),
									children: "Ouvrir la page"
								}, void 0, false, {
									fileName: _jsxFileName,
									lineNumber: 20,
									columnNumber: 758
								}, this)
							]
						}, void 0, true, {
							fileName: _jsxFileName,
							lineNumber: 20,
							columnNumber: 370
						}, this) : /* @__PURE__ */ jsxDEV("small", { children: "Fiche personnelle" }, void 0, false, {
							fileName: _jsxFileName,
							lineNumber: 20,
							columnNumber: 840
						}, this),
						/* @__PURE__ */ jsxDEV("footer", { children: [/* @__PURE__ */ jsxDEV("span", { children: ["À revoir le ", new Intl.DateTimeFormat("fr-CH", { dateStyle: "short" }).format(new Date(c.schedule.dueAt))] }, void 0, true, {
							fileName: _jsxFileName,
							lineNumber: 20,
							columnNumber: 881
						}, this), /* @__PURE__ */ jsxDEV("button", {
							"aria-label": `Supprimer la fiche ${c.question.slice(0, 40)}`,
							disabled,
							onClick: () => onCommit({
								type: "remove-study-card",
								id: c.id
							}),
							children: /* @__PURE__ */ jsxDEV(Trash2, {}, void 0, false, {
								fileName: _jsxFileName,
								lineNumber: 20,
								columnNumber: 1142
							}, this)
						}, void 0, false, {
							fileName: _jsxFileName,
							lineNumber: 20,
							columnNumber: 995
						}, this)] }, void 0, true, {
							fileName: _jsxFileName,
							lineNumber: 20,
							columnNumber: 873
						}, this)
					]
				}, c.id, true, {
					fileName: _jsxFileName,
					lineNumber: 20,
					columnNumber: 124
				}, this))
			] }, void 0, true, {
				fileName: _jsxFileName,
				lineNumber: 16,
				columnNumber: 19
			}, this),
			view === "review" && /* @__PURE__ */ jsxDEV("section", {
				className: "paper-review-session",
				children: [
					/* @__PURE__ */ jsxDEV("progress", {
						value: rated,
						max: Math.max(1, sessionTotal),
						"aria-label": "Progression de la session"
					}, void 0, false, {
						fileName: _jsxFileName,
						lineNumber: 22,
						columnNumber: 62
					}, this),
					/* @__PURE__ */ jsxDEV("p", { children: [
						rated,
						" / ",
						sessionTotal,
						" mémorisées"
					] }, void 0, true, {
						fileName: _jsxFileName,
						lineNumber: 22,
						columnNumber: 157
					}, this),
					active ? /* @__PURE__ */ jsxDEV(Fragment, { children: [
						/* @__PURE__ */ jsxDEV(PaperRichText, {
							markdown: active.question,
							document,
							media
						}, void 0, false, {
							fileName: _jsxFileName,
							lineNumber: 22,
							columnNumber: 209
						}, this),
						active.kind === "cloze" && !revealed && /* @__PURE__ */ jsxDEV("input", {
							"aria-label": "Votre réponse",
							value: typed,
							onChange: (e) => setTyped(e.target.value)
						}, void 0, false, {
							fileName: _jsxFileName,
							lineNumber: 22,
							columnNumber: 321
						}, this),
						/* @__PURE__ */ jsxDEV("button", {
							onClick: () => setRevealed(true),
							children: revealed ? "Réponse affichée" : "Afficher la réponse"
						}, void 0, false, {
							fileName: _jsxFileName,
							lineNumber: 22,
							columnNumber: 410
						}, this),
						revealed && /* @__PURE__ */ jsxDEV(Fragment, { children: [
							/* @__PURE__ */ jsxDEV("div", {
								className: "paper-review-answer",
								children: /* @__PURE__ */ jsxDEV(PaperRichText, {
									markdown: active.answer,
									document,
									media
								}, void 0, false, {
									fileName: _jsxFileName,
									lineNumber: 22,
									columnNumber: 560
								}, this)
							}, void 0, false, {
								fileName: _jsxFileName,
								lineNumber: 22,
								columnNumber: 523
							}, this),
							active.kind === "cloze" && typed && /* @__PURE__ */ jsxDEV("p", { children: typed.trim().normalize("NFKC").toLocaleLowerCase(study.language) === active.answer.trim().normalize("NFKC").toLocaleLowerCase(study.language) ? "Votre réponse correspond." : "Comparez votre réponse avec l’extrait." }, void 0, false, {
								fileName: _jsxFileName,
								lineNumber: 22,
								columnNumber: 672
							}, this),
							/* @__PURE__ */ jsxDEV("div", {
								className: "paper-review-rating",
								children: [
									[1, "À reprendre"],
									[3, "Difficile"],
									[4, "Bien"],
									[5, "Facile"]
								].map(([quality, label]) => /* @__PURE__ */ jsxDEV("button", {
									disabled,
									onClick: () => rate(quality),
									children: label
								}, quality, false, {
									fileName: _jsxFileName,
									lineNumber: 22,
									columnNumber: 1022
								}, this))
							}, void 0, false, {
								fileName: _jsxFileName,
								lineNumber: 22,
								columnNumber: 890
							}, this)
						] }, void 0, true, {
							fileName: _jsxFileName,
							lineNumber: 22,
							columnNumber: 521
						}, this),
						active.source && /* @__PURE__ */ jsxDEV("button", {
							onClick: () => onPage(active.source.pageId),
							children: "Voir la source"
						}, void 0, false, {
							fileName: _jsxFileName,
							lineNumber: 22,
							columnNumber: 1136
						}, this)
					] }, void 0, true, {
						fileName: _jsxFileName,
						lineNumber: 22,
						columnNumber: 207
					}, this) : /* @__PURE__ */ jsxDEV(Fragment, { children: [
						/* @__PURE__ */ jsxDEV(Check, {}, void 0, false, {
							fileName: _jsxFileName,
							lineNumber: 22,
							columnNumber: 1218
						}, this),
						/* @__PURE__ */ jsxDEV("h3", { children: sessionTotal ? "Session terminée" : "Aucune fiche à réviser maintenant" }, void 0, false, {
							fileName: _jsxFileName,
							lineNumber: 22,
							columnNumber: 1226
						}, this),
						/* @__PURE__ */ jsxDEV("p", { children: "Vos prochaines échéances sont conservées avec la note." }, void 0, false, {
							fileName: _jsxFileName,
							lineNumber: 22,
							columnNumber: 1304
						}, this),
						/* @__PURE__ */ jsxDEV("button", {
							onClick: () => startReview(true),
							children: [/* @__PURE__ */ jsxDEV(RotateCcw, {}, void 0, false, {
								fileName: _jsxFileName,
								lineNumber: 22,
								columnNumber: 1405
							}, this), "Revoir toutes les fiches"]
						}, void 0, true, {
							fileName: _jsxFileName,
							lineNumber: 22,
							columnNumber: 1365
						}, this)
					] }, void 0, true, {
						fileName: _jsxFileName,
						lineNumber: 22,
						columnNumber: 1216
					}, this)
				]
			}, void 0, true, {
				fileName: _jsxFileName,
				lineNumber: 22,
				columnNumber: 20
			}, this),
			view === "summary" && /* @__PURE__ */ jsxDEV("section", { children: [
				/* @__PURE__ */ jsxDEV("h3", { children: "Extraits essentiels" }, void 0, false, {
					fileName: _jsxFileName,
					lineNumber: 23,
					columnNumber: 30
				}, this),
				/* @__PURE__ */ jsxDEV("p", { children: "Ces passages sont repris de votre note avec leur source." }, void 0, false, {
					fileName: _jsxFileName,
					lineNumber: 23,
					columnNumber: 58
				}, this),
				excerpts.map((e, i) => /* @__PURE__ */ jsxDEV("article", {
					className: "paper-study-excerpt",
					children: [/* @__PURE__ */ jsxDEV(PaperRichText, {
						markdown: e.text,
						document,
						media
					}, void 0, false, {
						fileName: _jsxFileName,
						lineNumber: 23,
						columnNumber: 217
					}, this), /* @__PURE__ */ jsxDEV("button", {
						onClick: () => onPage(e.source.pageId),
						children: [
							/* @__PURE__ */ jsxDEV(FileText, {}, void 0, false, {
								fileName: _jsxFileName,
								lineNumber: 23,
								columnNumber: 331
							}, this),
							"Page ",
							document.pages.findIndex((p) => p.id === e.source.pageId) + 1,
							/* @__PURE__ */ jsxDEV(ChevronRight, {}, void 0, false, {
								fileName: _jsxFileName,
								lineNumber: 23,
								columnNumber: 402
							}, this)
						]
					}, void 0, true, {
						fileName: _jsxFileName,
						lineNumber: 23,
						columnNumber: 285
					}, this)]
				}, `${e.source.objectId}-${i}`, true, {
					fileName: _jsxFileName,
					lineNumber: 23,
					columnNumber: 142
				}, this)),
				!excerpts.length && /* @__PURE__ */ jsxDEV("p", { children: "Écrivez du texte dans votre note pour retrouver des extraits ici." }, void 0, false, {
					fileName: _jsxFileName,
					lineNumber: 23,
					columnNumber: 457
				}, this)
			] }, void 0, true, {
				fileName: _jsxFileName,
				lineNumber: 23,
				columnNumber: 21
			}, this)
		]
	}, void 0, true, {
		fileName: _jsxFileName,
		lineNumber: 14,
		columnNumber: 9
	}, this);
}
//#endregion
export { PaperStudyPanel };
