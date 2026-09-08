import type { CalendarEvent, Subject, TaskItem } from "../types";
import { addCalendarDays, dateAtTimeZone, weekdayFromDateKey } from "../lib/zonedDate";
import {
  buildLessonUnits,
  hydrateSubjectLessonUnits
} from "./lessonUnits";
import {
  DEFAULT_ENGLISH_SUBJECT,
  hydrateEnglishSubject
} from "./englishCurriculum";

const fundamentalValidation =
  "Validation séparée · matière fondamentale non compensable (contrôles, partiel et examen).";

const module = (
  id: string,
  period: string,
  title: string,
  items: string[]
) => ({
  id,
  period,
  title,
  items: items.map((itemTitle, index) => {
    const itemId = id + "-" + (index + 1);
    return {
      id: itemId,
      title: itemTitle,
      completed: false,
      lessons: buildLessonUnits(itemId, itemTitle)
    };
  })
});

export const defaultSubjects: Subject[] = [
  {
    id: "analyse",
    name: "Analyse I & II",
    shortName: "Analyse",
    teacher: "Tuteur IA",
    room: "Espace Maths",
    color: "#5c6ce5",
    accent: "#eef0ff",
    icon: "function",
    nextClass: "Lun. 09:00",
    domain: "Mathématiques",
    period: "Annuel",
    validation: fundamentalValidation,
    chapterCount: 18,
    objective:
      "Maîtriser le calcul différentiel et intégral afin de modéliser quantitativement des systèmes physiques.",
    modules: [
      module(
        "analyse-s1",
        "Semestre 1",
        "Fondations, fonctions et calcul différentiel",
        [
          "Langage mathématique : ensembles, intervalles, valeur absolue, logique, quantificateurs",
          "Fonctions réelles : domaine, image, composition, inverse, symétries, transformations",
          "Fonctions usuelles : polynômes, rationnelles, exponentielle, logarithme, trigonométrie",
          "Suites : monotonie, bornes, convergence, limites",
          "Limites de fonctions, continuité, théorèmes fondamentaux",
          "Dérivation : définition, règles, fonctions usuelles",
          "Approximation linéaire, différentielles, Taylor simple",
          "Optimisation à une variable : extrema, convexité, problèmes physiques"
        ]
      ),
      module(
        "analyse-s2",
        "Semestre 2",
        "Intégration, équations différentielles et plusieurs variables",
        [
          "Primitive et intégrale de Riemann",
          "Techniques d’intégration : substitution, parties, fractions simples",
          "Applications : travail, énergie, centre de masse, valeurs moyennes",
          "Équations différentielles du 1er ordre",
          "Équations différentielles linéaires du 2e ordre : oscillations",
          "Séries numériques et séries de Taylor",
          "Fonctions de plusieurs variables, dérivées partielles, gradient",
          "Optimisation multivariable et contraintes simples",
          "Intégrales doubles",
          "Synthèse : modélisation mathématique d’un système physique"
        ]
      )
    ]
  },
  {
    id: "algebre-lineaire",
    name: "Algèbre linéaire I & II",
    shortName: "Algèbre",
    teacher: "Tuteur IA",
    room: "Espace Maths",
    color: "#7d64c5",
    accent: "#f2edff",
    icon: "matrix",
    nextClass: "Lun. 10:45",
    domain: "Mathématiques",
    period: "Annuel",
    validation: fundamentalValidation,
    chapterCount: 16,
    objective:
      "Construire les outils vectoriels et matriciels nécessaires à la mécanique, aux données et aux systèmes dynamiques.",
    modules: [
      module(
        "algebre-s1",
        "Semestre 1",
        "Structures et calcul matriciel",
        [
          "Vecteurs dans R² et R³, produit scalaire et produit vectoriel",
          "Systèmes linéaires et élimination de Gauss",
          "Matrices : opérations, inverses, matrices élémentaires",
          "Déterminants et interprétation géométrique",
          "Espaces vectoriels et sous-espaces",
          "Indépendance linéaire, bases et dimension",
          "Applications linéaires : noyau, image, matrice associée"
        ]
      ),
      module(
        "algebre-s2",
        "Semestre 2",
        "Géométrie, valeurs propres et systèmes",
        [
          "Changements de base et coordonnées",
          "Orthogonalité, projections, Gram-Schmidt",
          "Moindres carrés et ajustement de données",
          "Valeurs propres et vecteurs propres",
          "Diagonalisation",
          "Matrices symétriques et formes quadratiques",
          "Systèmes dynamiques linéaires",
          "Applications mécaniques : rotations et modes propres",
          "Applications numériques avec Python/NumPy"
        ]
      )
    ]
  },
  {
    id: "mecanique",
    name: "Physique générale I — Mécanique",
    shortName: "Mécanique",
    teacher: "Tuteur IA",
    room: "Laboratoire",
    color: "#169c83",
    accent: "#e8f8f4",
    icon: "atom",
    nextClass: "Mar. 09:00",
    domain: "Physique",
    period: "Semestre 1",
    validation: fundamentalValidation,
    chapterCount: 16,
    objective:
      "Décrire, modéliser et prévoir le mouvement de systèmes mécaniques à partir des lois fondamentales.",
    modules: [
      module("mecanique-s1", "Semestre 1", "Programme du semestre", [
        "Mesures, unités SI, dimensions, incertitudes, ordres de grandeur",
        "Cinématique 1D : position, vitesse, accélération",
        "Cinématique 2D/3D : vecteurs, projectile, coordonnées",
        "Lois de Newton et diagrammes de forces",
        "Frottements, forces de rappel, traînée simple",
        "Travail et énergie cinétique",
        "Énergie potentielle et conservation de l’énergie",
        "Quantité de mouvement, impulsion, collisions",
        "Centre de masse et systèmes de particules",
        "Rotation du solide et moment d’inertie",
        "Couple et dynamique de rotation",
        "Moment cinétique et conservation",
        "Gravitation et mouvements orbitaux",
        "Oscillations, amortissement, résonance",
        "Référentiels non inertiels — introduction",
        "Modélisation complète d’un système mécanique"
      ])
    ]
  },
  {
    id: "thermodynamique",
    name: "Physique générale II — Thermodynamique & transferts",
    shortName: "Thermo",
    teacher: "Tuteur IA",
    room: "Laboratoire thermique",
    color: "#e0783d",
    accent: "#fff0e7",
    icon: "zap",
    nextClass: "Mar. 09:00",
    domain: "Physique / Énergie",
    period: "Semestre 2",
    validation: fundamentalValidation,
    chapterCount: 18,
    objective:
      "Analyser les transformations de l’énergie, les cycles thermiques et les principaux modes de transfert de chaleur.",
    modules: [
      module("thermodynamique-s2", "Semestre 2", "Programme du semestre", [
        "Systèmes thermodynamiques, état, équilibre, équations d’état",
        "Température, pression, travail et chaleur",
        "Gaz parfait et théorie cinétique",
        "Premier principe",
        "Transformations isochore, isobare, isotherme, adiabatique",
        "Capacités thermiques, enthalpie, bilans énergétiques",
        "Deuxième principe et irréversibilité",
        "Entropie et bilans d’entropie",
        "Machines thermiques et réfrigérateurs",
        "Cycles Carnot, Otto, Diesel, Brayton — introduction",
        "Changements de phase et diagrammes",
        "Gaz réels et van der Waals — introduction",
        "Conduction et loi de Fourier",
        "Convection — principes",
        "Rayonnement thermique et Stefan-Boltzmann",
        "Diffusion et équation de la chaleur 1D",
        "Rendement et première intuition de l’exergie",
        "Étude énergétique complète d’un système thermique"
      ])
    ]
  },
  {
    id: "programmation-scientifique",
    name: "Programmation scientifique & calcul numérique",
    shortName: "Programmation",
    teacher: "Tuteur IA",
    room: "Poste de calcul",
    color: "#2d8fa3",
    accent: "#e8f7fa",
    icon: "code",
    nextClass: "Mar. 16:15",
    domain: "Informatique scientifique",
    period: "Annuel",
    validation: "Contrôles, mini-projets notés et examens de session.",
    chapterCount: 18,
    objective:
      "Utiliser Python et les méthodes numériques comme instruments de calcul, d’analyse et de simulation scientifique.",
    modules: [
      module(
        "programmation-s1",
        "Semestre 1",
        "Programmer pour calculer",
        [
          "Python, notebooks, reproductibilité",
          "Types, variables, expressions, entrées/sorties",
          "Conditions, boucles, fonctions",
          "Structures de données",
          "NumPy : tableaux, calcul vectorisé, matrices",
          "Matplotlib : visualisation scientifique",
          "Lecture et écriture de données",
          "Qualité du code, tests, documentation, Git — bases"
        ]
      ),
      module(
        "programmation-s2",
        "Semestre 2",
        "Méthodes numériques et simulation",
        [
          "Erreurs numériques, flottants, stabilité",
          "Recherche de racines : dichotomie, Newton",
          "Interpolation et approximation",
          "Dérivation et intégration numériques",
          "Résolution numérique de systèmes linéaires",
          "EDO : Euler et Runge-Kutta — introduction",
          "Monte-Carlo et incertitudes — introduction",
          "Analyse et ajustement de données expérimentales",
          "Simulation d’un système mécanique ou thermique",
          "Mini-projet : modèle numérique énergétique"
        ]
      )
    ]
  },
  {
    id: "chimie-materiaux",
    name: "Chimie & science des matériaux",
    shortName: "Matériaux",
    teacher: "Tuteur IA",
    room: "Laboratoire matériaux",
    color: "#c65a74",
    accent: "#fff0f4",
    icon: "flask",
    nextClass: "Lun. 14:00",
    domain: "Sciences de l’ingénieur",
    period: "Annuel",
    validation: "Contrôles, études de cas et examens de session.",
    chapterCount: 18,
    objective:
      "Relier structure, propriétés et transformations de la matière aux choix de matériaux en ingénierie énergétique.",
    modules: [
      module(
        "chimie-materiaux-s1",
        "Semestre 1",
        "Chimie utile à l’ingénieur",
        [
          "Structure atomique et tableau périodique",
          "Liaisons chimiques et structures moléculaires",
          "Stœchiométrie et bilans",
          "Gaz, solutions et concentrations",
          "Thermochimie et énergie des réactions",
          "Équilibre chimique — bases",
          "Acides, bases et pH",
          "Oxydoréduction et électrochimie : piles/batteries — introduction"
        ]
      ),
      module(
        "chimie-materiaux-s2",
        "Semestre 2",
        "Matériaux d’ingénierie",
        [
          "Structure cristalline et défauts",
          "Métaux et alliages",
          "Polymères, céramiques, composites",
          "Propriétés mécaniques : élasticité, plasticité, rupture",
          "Propriétés thermiques et électriques",
          "Diagrammes de phases — bases",
          "Corrosion et vieillissement",
          "Choix des matériaux : performance, coût, masse, température",
          "Matériaux pour batteries, photovoltaïque et hautes températures",
          "Sélection de matériau pour un prototype"
        ]
      )
    ]
  },
  {
    id: "conception-cao",
    name: "Conception d’ingénierie & CAO",
    shortName: "Conception",
    teacher: "Tuteur IA",
    room: "Atelier CAO",
    color: "#d98932",
    accent: "#fff3e4",
    icon: "drafting",
    nextClass: "Mar. 14:00",
    domain: "Ingénierie",
    period: "Annuel",
    validation: "Revues régulières, revues S1/S2 et intégration au projet annuel.",
    chapterCount: 18,
    objective:
      "Transformer un besoin en système dimensionné, modélisé en CAO, fabriqué, testé et documenté.",
    modules: [
      module(
        "conception-cao-s1",
        "Semestre 1",
        "Penser et représenter un système",
        [
          "Démarche de conception : besoin, fonction, exigences, contraintes",
          "Cahier des charges quantifié",
          "Croquis technique, vues, coupes",
          "Cotation, tolérances et ajustements — bases",
          "CAO 3D : esquisses, fonctions, assemblages",
          "Transmission d’efforts et architecture mécanique",
          "Éléments de machines : vis, roulements, axes, engrenages — introduction",
          "Matériaux et procédés de fabrication"
        ]
      ),
      module(
        "conception-cao-s2",
        "Semestre 2",
        "Concevoir, dimensionner et prototyper",
        [
          "Dimensionnement simple et coefficients de sécurité",
          "Prototypage rapide et impression 3D",
          "Usinage, découpe, assemblage — panorama",
          "Design for Manufacturing / Assembly — bases",
          "Analyse de défaillance et itération",
          "Instrumentation d’un prototype",
          "Validation par essais et comparaison au modèle",
          "Plans, nomenclature, dossier de conception",
          "Revue de conception",
          "Projet CAO final d’un sous-système énergétique"
        ]
      )
    ]
  },
  {
    id: "tp-metrologie",
    name: "Travaux pratiques de physique & métrologie",
    shortName: "TP & métrologie",
    teacher: "Tuteur IA",
    room: "Laboratoire",
    color: "#3b9472",
    accent: "#eaf7f1",
    icon: "ruler",
    nextClass: "Mer. 14:00",
    domain: "Laboratoire",
    period: "Annuel",
    validation: "Rapports de TP, épreuves pratiques intermédiaires et finale.",
    chapterCount: 18,
    objective:
      "Concevoir des expériences fiables, quantifier les incertitudes et confronter les mesures aux modèles.",
    modules: [
      module("tp-metrologie-annuel", "Annuel", "Programme annuel", [
        "Sécurité, carnet de laboratoire, démarche expérimentale",
        "Mesure, résolution, précision, exactitude, étalonnage",
        "Incertitudes type A/type B et propagation",
        "Régression linéaire et comparaison modèle-expérience",
        "TP cinématique",
        "TP dynamique : vérification de F = ma",
        "TP énergie mécanique et pertes",
        "TP oscillateur et résonance",
        "TP rotation et moment d’inertie",
        "TP calorimétrie",
        "TP gaz parfait et transformations",
        "TP conduction thermique",
        "TP rendement d’une chaîne de conversion",
        "Capteurs : température, force, pression, courant",
        "Acquisition de données",
        "Analyse numérique des mesures",
        "Rapport scientifique complet",
        "Épreuve pratique finale"
      ])
    ]
  },
  {
    id: "systemes-energetiques",
    name: "Introduction aux systèmes énergétiques",
    shortName: "Énergie",
    teacher: "Tuteur IA",
    room: "Salle systèmes",
    color: "#b99120",
    accent: "#fff8dc",
    icon: "zap",
    nextClass: "Jeu. 14:00",
    domain: "Énergie",
    period: "Annuel",
    validation: "Contrôles, études de cas et examens de session.",
    chapterCount: 22,
    objective:
      "Comprendre et comparer les chaînes de production, conversion, stockage et distribution de l’énergie.",
    modules: [
      module(
        "systemes-energetiques-s1",
        "Semestre 1",
        "Comprendre l’énergie comme grandeur et comme système",
        [
          "Formes d’énergie, puissance, travail, unités, ordres de grandeur",
          "Conservation de l’énergie et chaînes de conversion",
          "Rendement, pertes et bilans",
          "Énergie primaire, finale et utile",
          "Densité énergétique et densité de puissance",
          "Combustibles fossiles : principes et limites",
          "Production électrique : générateurs, turbines, centrales",
          "Réseaux électriques — introduction"
        ]
      ),
      module(
        "systemes-energetiques-s2",
        "Semestre 2",
        "Technologies et transition énergétique",
        [
          "Solaire photovoltaïque",
          "Solaire thermique",
          "Éolien et limite de Betz — introduction",
          "Hydroélectricité et pompage-turbinage",
          "Fission nucléaire : principes et sûreté — introduction",
          "Fusion nucléaire : confinement et bilan — introduction",
          "Batteries : capacité, puissance, rendement, vieillissement",
          "Hydrogène : production, stockage, conversion",
          "Stockage thermique, mécanique et électrique",
          "Intermittence, flexibilité et réseaux",
          "Empreinte carbone et analyse de cycle de vie — bases",
          "Comparaison technologique : rendement, coût, matériaux, risques, maturité",
          "Étude de cas : bâtiment, véhicule ou micro-réseau",
          "Défi final : proposer et défendre une architecture énergétique"
        ]
      )
    ]
  },
  {
    id: "projet-ingenierie",
    name: "Projet d’ingénierie annuel",
    shortName: "Projet",
    teacher: "Tuteur IA",
    room: "Atelier projet",
    color: "#9a63d8",
    accent: "#f5edff",
    icon: "wrench",
    nextClass: "Mer. 16:15",
    domain: "Projet transversal",
    period: "Annuel",
    validation: "Jalons mensuels, revues S1/S2 et soutenance finale.",
    chapterCount: 20,
    objective:
      "Mener un problème énergétique réel de l’état de l’art jusqu’à un prototype mesuré, itéré et soutenu.",
    modules: [
      module("projet-phase-1", "Phase 1", "Définir", [
        "Choisir un problème réel lié à l’énergie",
        "État de l’art et compréhension physique",
        "Cahier des charges et critères de réussite",
        "Analyse des risques et plan de projet"
      ]),
      module("projet-phase-2", "Phase 2", "Modéliser", [
        "Modèle physique et hypothèses",
        "Dimensionnement analytique",
        "Simulation numérique",
        "Choix des matériaux et composants"
      ]),
      module("projet-phase-3", "Phase 3", "Concevoir et fabriquer", [
        "Architecture et CAO",
        "Prototype V1",
        "Instrumentation et protocole d’essai",
        "Campagne de mesures"
      ]),
      module("projet-phase-4", "Phase 4", "Itérer", [
        "Analyse des écarts modèle-réalité",
        "Optimisation et prototype V2",
        "Analyse énergétique et rendement",
        "Robustesse, sécurité et limites"
      ]),
      module("projet-phase-5", "Phase 5", "Soutenir", [
        "Rapport technique final",
        "Dossier de conception reproductible",
        "Présentation orale et démonstration",
        "Soutenance technique transversale"
      ])
    ]
  },
  DEFAULT_ENGLISH_SUBJECT
];

/**
 * Migration à appliquer aux matières relues depuis un stockage persistant.
 * Les ids de blocs et leurs états existants sont conservés; les séances
 * canoniques manquantes et les horaires de rentrée devenus obsolètes sont
 * réinjectés sans toucher à la progression.
 */
export function hydratePersistedSubjects(subjects: Subject[]): Subject[] {
  const migratedNextClasses = new Map([
    ["analyse", "Lun. 09:00"],
    ["mecanique", "Mar. 09:00"],
    ["thermodynamique", "Mar. 09:00"]
  ]);

  const english = subjects.find((subject) => subject.id === DEFAULT_ENGLISH_SUBJECT.id);
  const hydratedSubjects = hydrateSubjectLessonUnits(
    subjects.filter((subject) => subject.id !== DEFAULT_ENGLISH_SUBJECT.id)
  ).map((subject) => {
    const nextClass = migratedNextClasses.get(subject.id);
    return nextClass && subject.nextClass?.endsWith("08:30")
      ? { ...subject, nextClass }
      : subject;
  });

  return [...hydratedSubjects, hydrateEnglishSubject(english)];
}

interface WeeklySlot {
  key: string;
  day: number;
  hour: number;
  minute: number;
  durationMinutes: number;
  title: string;
  description: string;
  subjectId?: string;
  type?: CalendarEvent["type"];
  color?: string;
  location?: string;
}

const slot = (
  key: string,
  day: number,
  hour: number,
  minute: number,
  durationMinutes: number,
  title: string,
  description: string,
  subjectId?: string,
  type: CalendarEvent["type"] = "course"
): WeeklySlot => ({
  key,
  day,
  hour,
  minute,
  durationMinutes,
  title,
  description,
  subjectId,
  type
});

const englishMorning = (key: string, day: number): WeeklySlot => ({
  key,
  day,
  hour: 8,
  minute: 30,
  durationMinutes: 30,
  title: "Anglais",
  description: "Cours d’anglais · parcours annuel CECRL — 30 min",
  subjectId: "anglais",
  type: "course",
  color: "#2f86cf",
  location: "Espace Langues"
});

function timetable(semester: "S1" | "S2"): WeeklySlot[] {
  const physicsId = semester === "S1" ? "mecanique" : "thermodynamique";
  const physicsTitle =
    semester === "S1"
      ? "Physique générale I — Mécanique"
      : "Physique générale II — Thermodynamique & transferts";

  return [
    englishMorning("lun-anglais", 0),
    slot("lun-analyse-cours", 0, 9, 0, 90, "Analyse I & II", "Cours", "analyse"),
    slot("lun-algebre-cours-ex", 0, 10, 45, 60, "Algèbre linéaire I & II", "Cours / exercices", "algebre-lineaire"),
    slot("lun-algebre-ex", 0, 11, 45, 60, "Algèbre linéaire I & II", "Exercices", "algebre-lineaire"),
    slot("lun-chimie-fondamentaux", 0, 14, 0, 60, "Chimie & science des matériaux", "Fondamentaux", "chimie-materiaux"),
    slot("lun-chimie-applications", 0, 15, 0, 60, "Chimie & science des matériaux", "Exercices / applications", "chimie-materiaux"),
    slot("lun-travail-dirige", 0, 16, 15, 60, "Travail dirigé — Mathématiques", "Maths / rattrapage", "analyse", "study"),
    slot("lun-revision", 0, 17, 15, 30, "Révision active", "Révision active — 30 min", "analyse", "study"),

    englishMorning("mar-anglais", 1),
    slot("mar-physique-cours", 1, 9, 0, 90, physicsTitle, "Cours", physicsId),
    slot("mar-analyse-ex", 1, 10, 45, 120, "Analyse I & II", "Exercices", "analyse"),
    slot("mar-conception-cao", 1, 14, 0, 60, "Conception d’ingénierie & CAO", "CAO / design", "conception-cao"),
    slot("mar-conception-projet", 1, 15, 0, 60, "Conception d’ingénierie & CAO", "Projet", "conception-cao"),
    slot("mar-programmation", 1, 16, 15, 60, "Programmation scientifique", "Algorithmes / simulation", "programmation-scientifique"),
    slot("mar-revision", 1, 17, 15, 30, "Révision active", "Révision active — 30 min", "programmation-scientifique", "study"),

    englishMorning("mer-anglais", 2),
    slot("mer-analyse-cours", 2, 9, 0, 45, "Analyse I & II", "Cours", "analyse"),
    slot("mer-analyse-ex", 2, 9, 45, 45, "Analyse I & II", "Exercices", "analyse"),
    slot("mer-programmation-cours", 2, 10, 45, 60, "Programmation scientifique", "Python / calcul numérique", "programmation-scientifique"),
    slot("mer-programmation-tp", 2, 11, 45, 60, "Programmation scientifique", "TP", "programmation-scientifique"),
    slot("mer-tp-mesure", 2, 14, 0, 60, "TP de physique & métrologie", "Mesure & expérimentation", "tp-metrologie"),
    slot("mer-tp-analyse", 2, 15, 0, 60, "TP de physique & métrologie", "Analyse des données", "tp-metrologie"),
    slot("mer-projet", 2, 16, 15, 60, "Projet d’ingénierie annuel", "Conception / fabrication", "projet-ingenierie"),
    slot("mer-journal", 2, 17, 15, 30, "Journal de laboratoire", "Journal de labo — 30 min", "tp-metrologie", "study"),

    englishMorning("jeu-anglais", 3),
    slot("jeu-algebre-cours", 3, 9, 0, 90, "Algèbre linéaire I & II", "Cours", "algebre-lineaire"),
    slot("jeu-physique-ex", 3, 10, 45, 120, physicsTitle, "Exercices", physicsId),
    slot("jeu-energie-conversion", 3, 14, 0, 60, "Introduction aux systèmes énergétiques", "Conversion / rendement", "systemes-energetiques"),
    slot("jeu-energie-cas", 3, 15, 0, 60, "Introduction aux systèmes énergétiques", "Études de cas", "systemes-energetiques"),
    slot("jeu-travail-dirige", 3, 16, 15, 60, "Travail dirigé — Physique", "Physique / problèmes", physicsId, "study"),
    slot("jeu-revision", 3, 17, 15, 30, "Révision active", "Révision active — 30 min", physicsId, "study"),

    englishMorning("ven-anglais", 4),
    slot("ven-physique-cours", 4, 9, 0, 45, physicsTitle, "Cours", physicsId),
    slot("ven-physique-ex", 4, 9, 45, 45, physicsTitle, "Exercices", physicsId),
    slot("ven-analyse-problemes", 4, 10, 45, 60, "Analyse I & II", "Problèmes", "analyse"),
    slot("ven-algebre-problemes", 4, 11, 45, 60, "Algèbre linéaire I & II", "Problèmes", "algebre-lineaire"),
    slot("ven-projet", 4, 14, 0, 120, "Projet d’ingénierie annuel", "Prototype annuel", "projet-ingenierie"),
    slot("ven-synthese", 4, 16, 15, 60, "Synthèse & évaluation", "Quiz / oral / bilan", undefined, "study"),
    slot("ven-planification", 4, 17, 15, 30, "Planification", "Semaine suivante — 30 min", undefined, "personal")
  ];
}

const subjectById = new Map(defaultSubjects.map((subject) => [subject.id, subject]));

const nonTeachingRanges: Array<[string, string]> = [
  ["2026-10-17", "2026-10-25"],
  ["2027-03-26", "2027-04-04"]
];

const isolatedDaysOff = new Set(["2026-09-21"]);

function isNonTeachingDay(key: string): boolean {
  if (isolatedDaysOff.has(key)) return true;
  return nonTeachingRanges.some(([from, to]) => key >= from && key <= to);
}

function weeklyEvents(
  semester: "S1" | "S2",
  from: string,
  to: string
): CalendarEvent[] {
  const slots = timetable(semester);
  const events: CalendarEvent[] = [];

  for (let cursor = from; cursor <= to; cursor = addCalendarDays(cursor, 1)) {
    const mondayBasedDay = (weekdayFromDateKey(cursor) + 6) % 7;
    if (mondayBasedDay > 4 || isNonTeachingDay(cursor)) continue;

    for (const item of slots.filter((entry) => entry.day === mondayBasedDay)) {
      const startAt = dateAtTimeZone(cursor, item.hour, item.minute);
      const subject = item.subjectId ? subjectById.get(item.subjectId) : undefined;

      events.push({
        id: "course-" + semester.toLowerCase() + "-" + cursor + "-" + item.key,
        title: item.title,
        subjectId: item.subjectId,
        start: startAt.toISOString(),
        end: new Date(startAt.getTime() + item.durationMinutes * 60_000).toISOString(),
        color: item.color ?? subject?.color ?? "#677383",
        location: item.location ?? subject?.room ?? "Espace d’étude",
        type: item.type ?? "course",
        description: item.description
      });
    }
  }

  return events;
}

function academicEvent(
  id: string,
  title: string,
  from: string,
  to: string | undefined,
  type: CalendarEvent["type"],
  description: string,
  subjectId?: string
): CalendarEvent {
  const start = dateAtTimeZone(from);
  const exclusiveEnd = dateAtTimeZone(addCalendarDays(to ?? from, 1));
  const subject = subjectId ? subjectById.get(subjectId) : undefined;
  const fallbackColor =
    type === "break"
      ? "#8b95a3"
      : type === "milestone"
        ? "#526b7a"
        : type === "study"
          ? "#5c6ce5"
          : "#d05252";

  return {
    id,
    title,
    subjectId,
    start: start.toISOString(),
    end: exclusiveEnd.toISOString(),
    color: subject?.color ?? fallbackColor,
    location: "Calendrier académique",
    type,
    allDay: true,
    description
  };
}

const academicEvents: CalendarEvent[] = [
  academicEvent(
    "academic-2026-09-07-rentree",
    "Rentrée — début des cours S1",
    "2026-09-07",
    undefined,
    "milestone",
    "Cours — ouverture du semestre 1."
  ),
  academicEvent(
    "academic-2026-09-21-jeune-federal",
    "Jeûne fédéral — pas de cours",
    "2026-09-21",
    undefined,
    "break",
    "Congé académique."
  ),
  academicEvent(
    "academic-2026-10-02-controle-maths",
    "Contrôle 1 — Analyse + Algèbre linéaire",
    "2026-10-02",
    undefined,
    "exam",
    "Premier contrôle continu de mathématiques."
  ),
  academicEvent(
    "academic-2026-10-09-controle-mecanique",
    "Contrôle 1 — Mécanique",
    "2026-10-09",
    undefined,
    "exam",
    "Premier contrôle continu de mécanique.",
    "mecanique"
  ),
  academicEvent(
    "academic-2026-10-16-fin-sequence-1",
    "Fin de la première séquence de cours",
    "2026-10-16",
    undefined,
    "milestone",
    "Premier jalon pédagogique du semestre 1."
  ),
  academicEvent(
    "academic-2026-10-17-interruption-automne",
    "Interruption d’automne — repos + révision légère",
    "2026-10-17",
    "2026-10-25",
    "break",
    "Vacances d’automne."
  ),
  academicEvent(
    "academic-2026-10-26-reprise",
    "Reprise des cours",
    "2026-10-26",
    undefined,
    "milestone",
    "Reprise des enseignements après l’interruption d’automne."
  ),
  academicEvent(
    "academic-2026-11-06-controle-programmation",
    "Contrôle 1 — Programmation scientifique",
    "2026-11-06",
    undefined,
    "exam",
    "Premier contrôle continu de programmation scientifique.",
    "programmation-scientifique"
  ),
  academicEvent(
    "academic-2026-11-13-controle-materiaux",
    "Contrôle 1 — Chimie & matériaux",
    "2026-11-13",
    undefined,
    "exam",
    "Premier contrôle continu de chimie et science des matériaux.",
    "chimie-materiaux"
  ),
  academicEvent(
    "academic-2026-11-20-controle-energie",
    "Contrôle 1 — Systèmes énergétiques",
    "2026-11-20",
    undefined,
    "exam",
    "Premier contrôle continu sur les systèmes énergétiques.",
    "systemes-energetiques"
  ),
  academicEvent(
    "academic-2026-11-27-revue-conception",
    "Revue de conception — projet / CAO",
    "2026-11-27",
    undefined,
    "milestone",
    "Revue formelle du projet et de la conception CAO.",
    "projet-ingenierie"
  ),
  academicEvent(
    "academic-2026-12-04-epreuve-tp",
    "Épreuve pratique intermédiaire — TP & métrologie",
    "2026-12-04",
    undefined,
    "exam",
    "Évaluation pratique intermédiaire en laboratoire.",
    "tp-metrologie"
  ),
  academicEvent(
    "academic-2026-12-11-partiels-s1",
    "Partiels S1 — Analyse, Algèbre, Mécanique",
    "2026-12-11",
    undefined,
    "exam",
    "Partiels du semestre 1."
  ),
  academicEvent(
    "academic-2026-12-18-fin-s1",
    "Fin des enseignements S1 + remise projet intermédiaire",
    "2026-12-18",
    undefined,
    "milestone",
    "Clôture des cours du semestre 1 et remise intermédiaire du projet.",
    "projet-ingenierie"
  ),
  academicEvent(
    "academic-2026-12-21-revisions-hiver",
    "Période de révision d’hiver",
    "2026-12-21",
    "2027-01-10",
    "study",
    "Révisions structurées et examens blancs."
  ),
  academicEvent(
    "academic-2027-01-11-examens-s1-maths-mecanique",
    "Examens S1 — maths + mécanique",
    "2027-01-11",
    "2027-01-15",
    "exam",
    "Examens écrits d’Analyse I, Algèbre linéaire I et mécanique."
  ),
  academicEvent(
    "academic-2027-01-18-examens-s1-sciences",
    "Examens S1 — programmation + chimie/matériaux + énergie",
    "2027-01-18",
    "2027-01-22",
    "exam",
    "Deuxième semaine de la session d’examens du semestre 1."
  ),
  academicEvent(
    "academic-2027-01-25-epreuve-oral-s1",
    "Épreuve pratique + oral projet S1 / réserve",
    "2027-01-25",
    "2027-01-29",
    "exam",
    "Épreuve pratique, oral du projet et jours de réserve."
  ),
  academicEvent(
    "academic-2027-01-31-intersemestre",
    "Intersemestre — repos, lecture libre, rattrapage ciblé si nécessaire",
    "2027-01-31",
    "2027-02-21",
    "break",
    "Intersemestre entre les deux périodes d’enseignement."
  ),
  academicEvent(
    "academic-2027-02-22-debut-s2",
    "Début des cours S2",
    "2027-02-22",
    undefined,
    "milestone",
    "Ouverture du semestre 2."
  ),
  academicEvent(
    "academic-2027-03-12-controle-maths",
    "Contrôle 2 — Analyse + Algèbre linéaire",
    "2027-03-12",
    undefined,
    "exam",
    "Deuxième contrôle continu de mathématiques."
  ),
  academicEvent(
    "academic-2027-03-19-controle-thermo",
    "Contrôle 1 — Thermodynamique",
    "2027-03-19",
    undefined,
    "exam",
    "Premier contrôle continu de thermodynamique.",
    "thermodynamique"
  ),
  academicEvent(
    "academic-2027-03-26-interruption-printemps",
    "Interruption de printemps",
    "2027-03-26",
    "2027-04-04",
    "break",
    "Vacances de printemps."
  ),
  academicEvent(
    "academic-2027-04-05-reprise",
    "Reprise des cours",
    "2027-04-05",
    undefined,
    "milestone",
    "Reprise des enseignements après l’interruption de printemps."
  ),
  academicEvent(
    "academic-2027-04-16-controle-programmation",
    "Contrôle 2 — Programmation scientifique",
    "2027-04-16",
    undefined,
    "exam",
    "Deuxième contrôle continu de programmation scientifique.",
    "programmation-scientifique"
  ),
  academicEvent(
    "academic-2027-04-23-controle-materiaux",
    "Contrôle 2 — Chimie & matériaux",
    "2027-04-23",
    undefined,
    "exam",
    "Deuxième contrôle continu de chimie et science des matériaux.",
    "chimie-materiaux"
  ),
  academicEvent(
    "academic-2027-04-30-controle-energie",
    "Contrôle 2 — Systèmes énergétiques",
    "2027-04-30",
    undefined,
    "exam",
    "Deuxième contrôle continu sur les systèmes énergétiques.",
    "systemes-energetiques"
  ),
  academicEvent(
    "academic-2027-05-14-revue-conception-finale",
    "Revue de conception finale — CAO / prototype V1",
    "2027-05-14",
    undefined,
    "milestone",
    "Revue finale de conception et présentation du prototype V1.",
    "projet-ingenierie"
  ),
  academicEvent(
    "academic-2027-05-21-epreuve-pratique",
    "Épreuve pratique — thermo / métrologie",
    "2027-05-21",
    undefined,
    "exam",
    "Épreuve pratique de thermodynamique et métrologie.",
    "tp-metrologie"
  ),
  academicEvent(
    "academic-2027-05-28-partiels-s2",
    "Partiels S2 — Analyse, Algèbre, Thermodynamique",
    "2027-05-28",
    undefined,
    "exam",
    "Partiels du semestre 2."
  ),
  academicEvent(
    "academic-2027-06-04-fin-cours",
    "Fin des enseignements + prototype final figé",
    "2027-06-04",
    undefined,
    "milestone",
    "Clôture des cours et gel de la version finale du prototype.",
    "projet-ingenierie"
  ),
  academicEvent(
    "academic-2027-06-07-revisions-ete",
    "Révisions d’été + examens blancs",
    "2027-06-07",
    "2027-06-20",
    "study",
    "Période de révisions structurées avant la session finale."
  ),
  academicEvent(
    "academic-2027-06-21-examens-maths-thermo",
    "Examens finaux — Analyse II + Algèbre II + Thermodynamique",
    "2027-06-21",
    "2027-06-25",
    "exam",
    "Première semaine de la session finale."
  ),
  academicEvent(
    "academic-2027-06-28-examens-sciences",
    "Examens finaux — programmation + matériaux + systèmes énergétiques",
    "2027-06-28",
    "2027-07-02",
    "exam",
    "Deuxième semaine de la session finale."
  ),
  academicEvent(
    "academic-2027-07-05-pratique-soutenance",
    "Épreuve pratique finale + soutenance du projet annuel",
    "2027-07-05",
    "2027-07-09",
    "exam",
    "Épreuve pratique finale, présentation, démonstration et soutenance.",
    "projet-ingenierie"
  ),
  academicEvent(
    "academic-2027-07-10-cloture-session",
    "Clôture de la session principale",
    "2027-07-10",
    undefined,
    "milestone",
    "Fin de la session principale d’examens."
  ),
  academicEvent(
    "academic-2027-07-12-corrections-validation",
    "Correction, bilan annuel et décision de validation",
    "2027-07-12",
    "2027-07-16",
    "milestone",
    "Corrections, bilan des compétences et décision annuelle."
  ),
  academicEvent(
    "academic-2027-07-19-rattrapages",
    "Rattrapages ciblés, uniquement si nécessaires",
    "2027-07-19",
    "2027-07-23",
    "exam",
    "Rattrapages réservés aux modules non validés."
  ),
  academicEvent(
    "academic-2027-07-24-validation-definitive",
    "Validation définitive de l’Année 1",
    "2027-07-24",
    undefined,
    "milestone",
    "Décision définitive de validation de l’année académique."
  )
];

export const defaultEvents: CalendarEvent[] = [
  ...weeklyEvents("S1", "2026-09-07", "2026-12-18"),
  ...weeklyEvents("S2", "2027-02-22", "2027-06-04"),
  ...academicEvents
];

export const ACADEMIC_SCHEDULE_REVISION = 2;

const legacyMorningOffsets = new Map<string, { start: number; end: number }>([
  ["lun-analyse-cours", { start: -30, end: 0 }],
  ["mar-physique-cours", { start: -30, end: 0 }],
  ["mer-analyse-cours", { start: -30, end: -15 }],
  ["mer-analyse-ex", { start: -15, end: 0 }],
  ["jeu-algebre-cours", { start: -30, end: 0 }],
  ["ven-physique-cours", { start: -30, end: -15 }],
  ["ven-physique-ex", { start: -15, end: 0 }]
]);

const recurringEventById = new Map(
  defaultEvents
    .filter((event) => event.id.startsWith("course-"))
    .map((event) => [event.id, event])
);
const englishMorningEvents = defaultEvents.filter((event) =>
  /^course-s[12]-\d{4}-\d{2}-\d{2}-(?:lun|mar|mer|jeu|ven)-anglais$/.test(event.id)
);

function recurringSlotKey(eventId: string): string | undefined {
  return /^course-s[12]-\d{4}-\d{2}-\d{2}-(.+)$/.exec(eventId)?.[1];
}

function shiftIsoMinutes(value: string, minutes: number): string {
  return new Date(Date.parse(value) + minutes * 60_000).toISOString();
}

/**
 * Met à niveau une ancienne copie persistée du planning sans remplacer les
 * événements personnels ni les créneaux canoniques que l’utilisateur a édités.
 * Le numéro de révision profilé dans App garantit que les suppressions faites
 * après cette migration ne seront pas recréées au prochain lancement.
 */
export function hydratePersistedEvents(events: CalendarEvent[]): CalendarEvent[] {
  if (!events.some((event) => recurringEventById.has(event.id))) return events;

  let changed = false;
  const migrated = events.map((event) => {
    const canonical = recurringEventById.get(event.id);
    const offsets = legacyMorningOffsets.get(recurringSlotKey(event.id) ?? "");
    if (!canonical) return event;

    const legacyEnglish = englishMorningEvents.some((candidate) => candidate.id === event.id) &&
      event.title === "Anglais" &&
      event.subjectId === undefined &&
      event.type === "study" &&
      event.description === "Langue étrangère · pratique quotidienne — 30 min" &&
      event.color === "#2f86cf" &&
      event.location === "Espace Langues" &&
      event.start === canonical.start &&
      event.end === canonical.end;
    if (legacyEnglish) {
      changed = true;
      return { ...canonical };
    }

    if (!offsets) return event;

    const legacyStart = shiftIsoMinutes(canonical.start, offsets.start);
    const legacyEnd = shiftIsoMinutes(canonical.end, offsets.end);
    if (event.start !== legacyStart || event.end !== legacyEnd) return event;

    changed = true;
    return { ...event, start: canonical.start, end: canonical.end };
  });

  const existingIds = new Set(events.map((event) => event.id));
  const missingEnglish = englishMorningEvents.filter((event) => !existingIds.has(event.id));
  if (!changed && missingEnglish.length === 0) return events;

  return [...migrated, ...missingEnglish.map((event) => ({ ...event }))];
}

function taskDate(date: string, hour: number, minute = 0): string {
  return dateAtTimeZone(date, hour, minute).toISOString();
}

export const defaultTasks: TaskItem[] = [
  {
    id: "task-preparer-rentree",
    title: "Préparer l’espace de travail et le carnet d’ingénierie",
    subjectId: "projet-ingenierie",
    dueAt: taskDate("2026-09-07", 18),
    completed: false,
    priority: "high"
  },
  {
    id: "task-controle-maths-1",
    title: "Réviser le contrôle 1 — Analyse + Algèbre linéaire",
    subjectId: "analyse",
    dueAt: taskDate("2026-10-01", 18),
    completed: false,
    priority: "high"
  },
  {
    id: "task-controle-mecanique-1",
    title: "Préparer le contrôle 1 — Mécanique",
    subjectId: "mecanique",
    dueAt: taskDate("2026-10-08", 18),
    completed: false,
    priority: "high"
  },
  {
    id: "task-revue-conception-s1",
    title: "Finaliser le dossier pour la revue de conception",
    subjectId: "projet-ingenierie",
    dueAt: taskDate("2026-11-26", 18),
    completed: false,
    priority: "medium"
  }
];
