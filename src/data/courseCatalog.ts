import type { CefrLevel, Subject } from '../types';
import type { FormationPackageFiles } from '../lib/formations';
import type { FormationChoiceGroup, FormationChoiceOption } from '../lib/formationChoices';
import { buildFormationTemplateFiles } from '../lib/formationPrompts';
import { CEFR_LEVELS, createEnglishSubject } from './englishCurriculum';
import { createModernLanguageSubject, MODERN_LANGUAGES, type ModernLanguage } from './modernLanguageCurriculum';
import { branchSubject, CO_BRANCHES, CO_GENERAL_BRANCHES, type CurriculumBranch } from './swissCurriculumCore';
import { MATURITY_BRANCHES } from './swissMaturityCurriculum';
import { CO_OPTIONS, MATURITY_OPTIONS, MATURITY_COMPLEMENTS } from './swissOptionsCurriculum';
import { MATURITY_LATIN, MATURITY_GREEK, MATURITY_RUSSIAN, MATURITY_ART_SPECIALISATION, MATURITY_MUSIC_SPECIALISATION } from './swissClassicalCurriculum';

const json = (value: unknown) => JSON.stringify(value, null, 2) + '\n';
const LANGUAGE_NAMES = { de: 'Allemand', it: 'Italien', en: 'Anglais', es: 'Espagnol' } as const;
type Language = keyof typeof LANGUAGE_NAMES;
type MaturityLanguage = Language | 'la' | 'grc' | 'ru';
const maturityLanguageName = (language: MaturityLanguage) => language === 'la' ? 'Latin' : language === 'grc' ? 'Grec ancien' : language === 'ru' ? 'Russe' : LANGUAGE_NAMES[language];
function maturityLanguageSubject(language: MaturityLanguage, level: CefrLevel, year: number, id: string): Subject {
  const branch = language === 'la' ? MATURITY_LATIN : language === 'grc' ? MATURITY_GREEK : language === 'ru' ? MATURITY_RUSSIAN : undefined;
  if (branch) return { ...reidentify(branchSubject(branch, year, 'matu'), id), languageCode: language, languageName: maturityLanguageName(language) };
  const complete = languageSubject(language as Language, level, id);
  return year >= 3 ? languageHalf(complete, year === 3 ? 0 : 1) : complete;
}
export function reidentify(subject: Subject, id: string): Subject {
  return { ...subject, id, modules: subject.modules.map((module, m) => ({ ...module, id: `${id}-s${m + 1}`, items: module.items.map((chapter, c) => ({ ...chapter, id: `${id}-s${m + 1}-c${c + 1}`, lessons: chapter.lessons?.map((lesson, l) => ({ ...lesson, id: `${id}-s${m + 1}-c${c + 1}-l${l + 1}` })) })) })) };
}
export function languageSubject(language: Language, level: CefrLevel, id: string): Subject {
  return reidentify(language === 'en' ? createEnglishSubject(level) : createModernLanguageSubject(language, level), id);
}
export function languageHalf(subject: Subject, half: 0 | 1): Subject {
  const modules = subject.modules.map(module => ({ ...module, items: module.items.slice(half * 3, half * 3 + 3) }));
  return { ...subject, modules, chapterCount: modules.reduce((n, m) => n + m.items.length, 0), name: `${subject.name} — progression ${half + 1}/2` };
}
const option = (id: string, label: string, subjectIds: string[], description: string, excludes: string[] = []): FormationChoiceOption => ({ id, label, subjectIds, description, excludes });

export function packageFiles(id: string, name: string, yearLabel: string, subjects: Subject[], groups: FormationChoiceGroup[] = [], pathway?: { id: string; name: string; yearIndex: number; yearCount: number }, compactAlternatives = false): FormationPackageFiles {
  const files = buildFormationTemplateFiles({ name, startDate: '2026-09-01', endDate: '2027-06-30' });
  const manifest = JSON.parse(files['formation.json']);
  Object.assign(manifest, { id, name, shortName: name.slice(0, 70), yearLabel, packageVersion: '1.0.0', author: 'Louis Délez', license: 'MIT',
    description: `${name}. Programme annuel détaillé pour le tuteur : cours et exercices séparés, mini-tests de chapitre, bilans semestriels et progression. Le planning est une proposition de travail personnel modifiable, pas une grille cantonale officielle.`,
    level: { label: yearLabel, framework: pathway?.id === 'maturite-suisse' ? 'Examen suisse de maturité — SEFRI' : pathway ? 'Secondaire I général — référence PER et comparaison régionale' : 'CECRL', targetAudience: 'Apprenants ayant acquis les prérequis du niveau précédent ; parcours personnel autonome.' },
    grading: { scaleMax: 6, passMark: 4 },
    pedagogy: { teachingLanguage: 'fr', instructionLevel: yearLabel, approach: 'Enseignement explicite par notions atomiques, exemples commentés, exercices autonomes, pratique orale ou expérimentale réelle et évaluations formatives. Les objectifs et activités pratiques sont évalués séparément.' },
    objectives: ['Suivre l’ensemble des matières et notions du programme annuel choisi.', 'Justifier ses démarches et corriger ses erreurs.', 'Préparer progressivement la suite du cursus.'],
    ...(pathway ? { pathway } : {}), ...(groups.length ? { choices: { groups } } : {})
  });
  const metadata = subjects.map(({ modules, curriculumKind, nextClass, ...subject }) => subject);
  const programs = subjects.map(subject => ({ subjectId: subject.id, modules: subject.modules.map(({ items, ...module }) => ({ ...module, items: items.map(({ id, title, description, lessons }) => ({ id, title, ...(description ? { description } : {}), lessons: lessons?.map(({ id, title, objective }) => ({ id, title, objective })) })) })) }));
  // Each alternative has a distinct slot before selection so the complete source
  // package itself is auditable without ambiguous overlapping events.
  const perDay = compactAlternatives ? 18 : 9;
  const slots = subjects.map((subject, index) => ({ id: `cours-${index + 1}`, periodIds: ['semestre-1', 'semestre-2'], weekdays: [Math.floor(index / perDay) + 1], startTime: compactAlternatives ? `${String(8 + Math.floor(index % perDay / 2)).padStart(2, '0')}:${index % 2 ? '30' : '00'}` : `${String(8 + index % 9).padStart(2, '0')}:00`, durationMinutes: compactAlternatives ? 25 : 50, title: subject.name, subjectId: subject.id, type: 'course', location: 'Travail personnel' }));
  if (subjects.length > perDay * 7) throw new Error('Trop de matières pour la proposition horaire.');
  const dateAfter = (start: string, days: number) => { const d = new Date(`${start}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };
  const assessments = subjects.flatMap((subject, index) => [0, 1].map(semester => ({
    id: `bilan-${subject.id}-s${semester + 1}`, title: `${semester ? 'Bilan annuel' : 'Bilan semestriel'} — ${subject.name}`,
    subjectId: subject.id, kind: semester ? 'final-exam' : 'midterm', scheduledAt: `${dateAfter(semester ? '2027-05-10' : '2027-01-05', Math.floor(index / 2))}T${index % 2 ? '19' : '18'}:00`, durationMinutes: 50,
    chapterIds: subject.modules.slice(0, semester ? subject.modules.length : 1).flatMap(m => m.items.map(c => c.id)), allowedMaterials: 'Consignes du sujet ; distinguer entraînement interne et matériel autorisé à un examen officiel.',
    instructions: 'Évaluation interne formative. Produire sujet et corrigé séparés. Pour une compétence orale, artistique, motrice ou expérimentale, compléter par une observation réelle : le seul écrit ne suffit pas.'
  })));
  files['formation.json'] = json(manifest);
  files['matieres.json'] = json({ schemaVersion: 'dowze-subjects@1', subjects: metadata });
  files['programme.json'] = json({ schemaVersion: 'dowze-curriculum@1', programs });
  files['planning.json'] = json({ schemaVersion: 'dowze-schedule@1', periods: [{ id: 'semestre-1', title: 'Semestre 1', startDate: '2026-09-01', endDate: '2027-01-31' }, { id: 'semestre-2', title: 'Semestre 2', startDate: '2027-02-01', endDate: '2027-06-30' }], closures: [{ id: 'pause-hiver', title: 'Pause de travail proposée — modifiable', startDate: '2026-12-21', endDate: '2027-01-03' }], weeklySlots: slots, events: [] });
  files['evaluations.json'] = json({ schemaVersion: 'dowze-assessments@1', assessments });
  files['taches.json'] = json({ schemaVersion: 'dowze-tasks@1', tasks: [
    { id: 'preparer-annee', title: 'Vérifier les prérequis, organiser le matériel et adapter le planning à sa disponibilité.', dueAt: '2026-09-07T17:00', priority: 'high' },
    { id: 'bilan-methodes', title: 'Faire le bilan des méthodes de travail et ajuster les révisions.', dueAt: '2027-02-01T17:00', priority: 'medium' },
    { id: 'preparer-suite', title: 'Faire le bilan annuel et vérifier les prérequis de la suite du cursus.', dueAt: '2027-06-28T17:00', priority: 'high' }
  ] });
  return files;
}

export function createCoPackage(year: 1 | 2 | 3): FormationPackageFiles {
  const prefix = `co-${year + 8}h`;
  const subjects = [...CO_BRANCHES, ...CO_GENERAL_BRANCHES, ...CO_OPTIONS].map(branch => branchSubject(branch, year, prefix));
  const groups: FormationChoiceGroup[] = [1, 2].map(slot => ({ id: `langue-${slot}`, label: `Langue étrangère ${slot === 1 ? 'I' : 'II'}`, description: 'Choix du parcours général personnel. Dans une scolarité cantonale officielle, les langues et leur ordre peuvent être imposés ; le PER romand prévoit allemand puis anglais.', options: (['de', 'en', 'it', 'es'] as Language[]).map(language => {
    const level: CefrLevel = year === 1 ? 'A2' : year === 2 ? 'A2' : 'B1';
    const complete = languageSubject(language, level, `${prefix}-l${slot}-${language}`);
    const subject = year < 3 ? languageHalf(complete, year === 1 ? 0 : 1) : complete; subjects.push(subject);
    return option(`l${slot}-${language}`, LANGUAGE_NAMES[language], [subject.id], `Parcours ${level} de ${LANGUAGE_NAMES[language].toLowerCase()} ; les niveaux A1–C2 séparés du store permettent de renforcer les prérequis.`, [`l${slot === 1 ? 2 : 1}-${language}`]);
  }) }));
  groups.push({ id: 'option', label: 'Option d’approfondissement', description: 'Choisir une orientation pour cette année. La continuité est recommandée ; un changement implique de vérifier les prérequis. Cette offre générale ne reproduit pas les conditions d’admission propres à chaque canton.', options: CO_OPTIONS.map(branch => option(branch.id, branch.name, [`${prefix}-${branch.id}`], branch.objective)) });
  return packageFiles(`dowze-co-${year + 8}h-2026`, `Cycle d’orientation — ${year + 8}H`, `${year + 8}H · Année ${year}`, subjects, groups, { id: 'cycle-orientation-general', name: 'Cycle d’orientation général', yearIndex: year, yearCount: 3 });
}

function literatureSubject(language: MaturityLanguage, year: number, id: string): Subject {
  const name = maturityLanguageName(language);
  const branch: CurriculumBranch = { id, name: `${name} — littérature et approfondissement`, domain: 'Langues', objective: `Lire, analyser, écrire et argumenter en ${name.toLowerCase()} ; préparer des œuvres intégrales et les compétences orales au niveau de maturité.`, years: [
    ['Lecture|Récit et narrateur|Personnages|Contexte culturel|Résumé|Avis motivé', 'Expression|Présentation structurée|Description précise|Lettre argumentée|Écoute active|Discussion'],
    ['Littérature|Genres|Point de vue|Images|Contexte historique|Analyse de passage', 'Argumentation|Thèse|Arguments|Exemples|Objections|Essai structuré'],
    ['Œuvres|Lecture intégrale|Thèmes|Voix narrative|Style|Comparaison', 'Expression avancée|Synthèse|Analyse critique|Exposé|Débat|Révision stylistique'],
    ['Corpus d’examen|Liste officielle des œuvres|Choix conformes au niveau|Lecture intégrale|Fiches d’extraits|Liens culturels', 'Épreuves|Compréhension écrite|Essai|Analyse orale|Questions spontanées|Bilan et révisions']
  ] };
  const subject = branchSubject(branch, year, 'matu');
  return { ...subject, languageCode: language, languageName: name };
}

export function createMaturityPackage(year: 1 | 2 | 3 | 4): FormationPackageFiles {
  const prefix = `matu-a${year}`;
  const subjects = MATURITY_BRANCHES.map(branch => branchSubject(branch, year, prefix));
  const byId = (id: string) => `${prefix}-${id}`;
  const level: CefrLevel = year === 1 ? 'B1' : year === 2 ? 'B2' : 'C1';
  const groups: FormationChoiceGroup[] = [];
  for (const slot of [2, 3]) {
    const languages: MaturityLanguage[] = slot === 2 ? ['de', 'it'] : ['de', 'it', 'en', 'la', 'grc'];
    groups.push({ id: `langue-${slot}`, label: slot === 2 ? 'Deuxième langue nationale' : 'Troisième langue', description: slot === 2 ? 'Session en français : allemand ou italien. Une langue commencée au secondaire I se poursuit ici.' : 'Choisir une langue différente des autres langues fondamentales. Langues modernes, latin et grec ancien proposés.', options: languages.map(language => {
      const sid = `${prefix}-l${slot}-${language}`;
      const subject = maturityLanguageSubject(language, level, year, sid);
      const literature = literatureSubject(language, year, `${prefix}-lit-l${slot}-${language}`);
      subjects.push(subject, literature);
      const exclusions = [`os-${language}`];
      if (language === 'de' || language === 'it') exclusions.push(`l${slot === 2 ? 3 : 2}-${language}`);
      return option(`l${slot}-${language}`, maturityLanguageName(language), [sid, literature.id], 'Langue, littérature, expression écrite et préparation orale. Vérifier les prérequis avant tout changement annuel.', exclusions);
    }) });
  }
  groups.push({ id: 'art', label: 'Discipline artistique fondamentale', description: 'Une des deux disciplines fait partie du socle de maturité.', options: [option('art-visuel', 'Arts visuels', [byId('arts')], 'Pratique plastique et analyse d’œuvres.', ['oc-arts']), option('art-musique', 'Musique', [byId('musique')], 'Interprétation réelle et connaissances musicales.', ['oc-musique'])] });
  const maths = branchSubject(MATURITY_OPTIONS[0], year, prefix); subjects.push(maths);
  // Both language alternatives use their own selected language subject plus a
  // common methodological supplement, avoiding a second unrelated language.
  const upper: CurriculumBranch = { id: 'langue-superieure', name: 'Langue au niveau supérieur — méthode', domain: 'Langues', objective: 'Approfondir la langue fondamentale choisie au niveau supérieur : corpus, essai, écoute, oral et analyse littéraire ; appliquer le travail à cette langue uniquement.', years: [
    ['Approfondir|Diagnostic linguistique|Lecture longue|Expression argumentée|Écoute suivie|Oral préparé'],
    ['Précision|Lexique abstrait|Syntaxe complexe|Analyse de texte|Essai|Interaction'],
    ['Littérature|Corpus plus exigeant|Interprétation|Style|Comparaison|Exposé critique'],
    ['Niveau supérieur|Vérifier les exigences du corpus|Lecture intégrale|Écrit blanc|Oral blanc|Remédiation']
  ] };
  const upperOptions = [option('sup-maths', 'Mathématiques', [maths.id], maths.objective ?? 'Mathématiques supérieures')];
  for (const slot of [2, 3]) {
    const languages: MaturityLanguage[] = slot === 2 ? ['de', 'it'] : ['de', 'it', 'en', 'la', 'grc'];
    for (const language of languages) {
      const name = maturityLanguageName(language);
      const supplement = reidentify(branchSubject(upper, year, prefix), `${prefix}-sup-l${slot}-${language}`);
      supplement.name = `${name} — niveau supérieur (langue ${slot})`;
      supplement.languageCode = language; supplement.languageName = name;
      supplement.objective = `Approfondir exclusivement ${name.toLowerCase()} au niveau supérieur : littérature, précision linguistique, écrit et oral.`;
      subjects.push(supplement);
      upperOptions.push(option(`sup-l${slot}-${language}`, `${name} — langue ${slot}`, [supplement.id], supplement.objective,
        ['os-pam', 'oc-applications', ...languages.filter(other => other !== language).map(other => `l${slot}-${other}`)]));
    }
  }
  groups.push({ id: 'niveau-superieur', label: 'Discipline fondamentale au niveau supérieur', description: 'Choisir les mathématiques ou une langue fondamentale effectivement sélectionnée. PAM et applications des mathématiques demandent ici le parcours mathématique supérieur.', options: upperOptions });
  const specifics = MATURITY_OPTIONS.slice(1).map(branch => {
    const subject = branchSubject(branch, year, prefix); subjects.push(subject);
    const blocked: Record<string, string[]> = { pam: ['oc-physique', 'oc-applications'], biochimie: ['oc-biologie', 'oc-chimie'], 'economie-droit': ['oc-economie'], 'philosophie-psycho': ['oc-philosophie', 'oc-psychologie'] };
    return option(`os-${branch.id}`, branch.name, [subject.id], branch.objective, blocked[branch.id] ?? []);
  });
  for (const language of ['de', 'it', 'en', 'es', 'la', 'grc', 'ru'] as const) {
    const sid = `${prefix}-os-${language}`;
    const subject = maturityLanguageSubject(language, level, year, sid);
    const literature = literatureSubject(language, year, `${prefix}-lit-os-${language}`); subjects.push(subject, literature);
    const blocked = language === 'de' || language === 'it' ? [`l2-${language}`, `l3-${language}`] : language === 'en' || language === 'la' || language === 'grc' ? [`l3-${language}`] : [];
    specifics.push(option(`os-${language}`, `${maturityLanguageName(language)} — OS`, [sid, literature.id], 'Langue au niveau supérieur, littérature et préparation écrite et orale.', blocked));
  }
  for (const [branch, baseId, choiceId] of [[MATURITY_ART_SPECIALISATION, 'arts', 'arts'], [MATURITY_MUSIC_SPECIALISATION, 'musique', 'musique']] as const) {
    const subject = branchSubject(branch, year, prefix); subjects.push(subject);
    specifics.push(option(`os-${choiceId}`, branch.name, [byId(baseId), subject.id], branch.objective, ['oc-arts', 'oc-musique']));
  }
  groups.push({ id: 'option-specifique', label: 'Option spécifique', description: 'Choix structurant à poursuivre sur le cursus. Les combinaisons incompatibles avec les langues et l’option complémentaire seront refusées. Les langues anciennes et le russe disposent de progressions propres.', options: specifics });
  const complements = MATURITY_COMPLEMENTS.map(branch => { const subject = branchSubject(branch, year, prefix); subjects.push(subject); return option(branch.id, branch.name, [subject.id], `${branch.objective} Les deux premières années construisent les prérequis ; approfondissement en années 3 et 4.`); });
  for (const [branchId, choiceId] of [['arts', 'oc-arts'], ['musique', 'oc-musique']] as const) {
    const base = MATURITY_BRANCHES.find(branch => branch.id === branchId)!;
    const subject = reidentify(branchSubject(base, year, prefix), `${prefix}-${choiceId}`); subjects.push(subject);
    complements.push(option(choiceId, `${branchId === 'arts' ? 'Arts visuels' : 'Musique'} — OC`, [subject.id], base.objective));
  }
  groups.push({ id: 'option-complementaire', label: 'Option complémentaire', description: 'Complète le profil. Les exclusions concernent aussi les composantes des options groupées. L’offre suit les disciplines décrites dans les directives consultées ; sport et informatique ne sont pas présentés comme épreuves fédérales disponibles.', options: complements });
  return packageFiles(`dowze-maturite-a${year}-2026`, `Maturité fédérale — Année ${year}`, `Maturité · Année ${year}/4`, subjects, groups, { id: 'maturite-suisse', name: 'Préparation à l’examen suisse de maturité', yearIndex: year, yearCount: 4 });
}

export function createLanguagePackage(language: ModernLanguage, level: CefrLevel): FormationPackageFiles {
  const info = MODERN_LANGUAGES[language];
  return packageFiles(`dowze-${info.slug}-${level.toLowerCase()}-2026`, `${info.name} ${level}`, level, [createModernLanguageSubject(language, level)]);
}
export function createNewCourseCatalog(): FormationPackageFiles[] {
  return [
    ...(['de', 'it', 'es'] as const).flatMap(language => CEFR_LEVELS.map(level => createLanguagePackage(language, level))),
    ...([1, 2, 3] as const).map(createCoPackage),
    ...([1, 2, 3, 4] as const).map(createMaturityPackage)
  ];
}
