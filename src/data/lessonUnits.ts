import type { LessonUnit, ProgramItem, Subject } from "../types";

/**
 * Décomposition pédagogique des 182 blocs du référentiel annuel.
 *
 * Un ProgramItem reste le bloc stable issu du PDF (et conserve donc son id,
 * son état et ses conversations). Les titres ci-dessous sont les séances
 * atomiques qu'un professeur peut raisonnablement enseigner en une fois.
 */
const LESSON_BLUEPRINTS: Readonly<Record<string, string>> = {
  // 1. Analyse I & II
  "analyse-s1-1":
    "Ensembles, appartenance et opérations|Intervalles de la droite réelle|Valeur absolue, distance et inéquations|Logique propositionnelle et tables de vérité|Quantificateurs et négation d’énoncés|Implication, équivalence et méthodes de preuve",
  "analyse-s1-2":
    "Définition d’une fonction, domaine et image|Opérations et composition de fonctions|Injectivité, surjectivité et bijectivité|Fonction réciproque|Parité, symétries et périodicité|Transformations et lecture de graphes",
  "analyse-s1-3":
    "Polynômes et factorisation|Fonctions rationnelles et asymptotes|Exponentielle et croissance|Logarithme et échelles logarithmiques|Fonctions trigonométriques et cercle unité|Comparaison et modélisation avec les fonctions usuelles",
  "analyse-s1-4":
    "Définition et représentations d’une suite|Monotonie d’une suite|Suites bornées et encadrement|Convergence et divergence|Calcul de limites de suites|Suites récurrentes et points fixes",
  "analyse-s1-5":
    "Limite d’une fonction et interprétation graphique|Règles de calcul des limites et formes indéterminées|Continuité en un point et sur un intervalle|Théorème des valeurs intermédiaires|Théorème des extrema et applications",
  "analyse-s1-6":
    "Taux de variation et définition de la dérivée|Tangente et interprétations physique et géométrique|Règles de dérivation|Dérivation des fonctions composées et réciproques|Dérivées des fonctions usuelles",
  "analyse-s1-7":
    "Approximation linéaire locale|Différentielle et propagation d’une petite variation|Formule de Taylor au premier et au second ordre|Estimation de l’erreur d’approximation|Applications numériques et physiques de Taylor",
  "analyse-s1-8":
    "Points critiques et extrema locaux|Tableaux de variations et extrema globaux|Convexité, concavité et points d’inflexion|Optimisation sur un domaine contraint|Mise en équations d’un problème physique d’optimisation",
  "analyse-s2-1":
    "Primitive et familles de primitives|Sommes de Riemann et aire signée|Définition de l’intégrale de Riemann|Propriétés de l’intégrale définie|Théorème fondamental de l’analyse",
  "analyse-s2-2":
    "Intégration par changement de variable|Intégration par parties|Décomposition en fractions simples|Intégrales trigonométriques|Choisir et combiner une technique d’intégration",
  "analyse-s2-3":
    "Travail d’une force variable|Calculs d’énergie par intégration|Centre de masse d’une distribution continue|Valeur moyenne d’une grandeur|Construction d’un bilan physique intégral",
  "analyse-s2-4":
    "Modéliser avec une équation différentielle du premier ordre|Variables séparables|Équations différentielles linéaires du premier ordre|Problèmes à condition initiale|Croissance, décroissance et constante de temps|Portrait qualitatif et validation d’une solution",
  "analyse-s2-5":
    "Équations linéaires homogènes du second ordre|Équation caractéristique et familles de solutions|Oscillateur harmonique libre|Oscillateur amorti|Forçage, résonance et conditions initiales",
  "analyse-s2-6":
    "Séries et sommes partielles|Critères de convergence des séries positives|Convergence absolue et séries alternées|Séries entières et rayon de convergence|Série de Taylor et approximation|Erreur et domaine de validité d’un développement",
  "analyse-s2-7":
    "Fonctions de plusieurs variables et surfaces de niveau|Limites et continuité à plusieurs variables|Dérivées partielles|Différentielle totale et plan tangent|Gradient et dérivée directionnelle|Règle de la chaîne multivariable",
  "analyse-s2-8":
    "Points critiques à plusieurs variables|Matrice hessienne et classification des extrema|Optimisation sur un domaine fermé|Contraintes et multiplicateurs de Lagrange|Optimisation d’un système d’ingénierie",
  "analyse-s2-9":
    "Domaines d’intégration dans le plan|Intégrales itérées et théorème de Fubini|Inversion de l’ordre d’intégration|Changement de variables et coordonnées polaires|Aires, volumes, masses et centres de masse",
  "analyse-s2-10":
    "Choisir les variables et hypothèses d’un modèle physique|Traduire les lois physiques en équations|Résoudre analytiquement le modèle|Vérifier dimensions, limites et ordres de grandeur|Interpréter, valider et communiquer les résultats",

  // 2. Algèbre linéaire I & II
  "algebre-s1-1":
    "Vecteurs, composantes et bases de R² et R³|Norme, distance et angle|Produit scalaire et orthogonalité|Produit vectoriel et orientation|Applications géométriques des produits de vecteurs",
  "algebre-s1-2":
    "Modéliser un problème par un système linéaire|Opérations élémentaires sur les lignes|Élimination de Gauss et forme échelonnée|Existence et unicité des solutions|Paramétrisation de l’ensemble des solutions",
  "algebre-s1-3":
    "Matrices et représentation de données linéaires|Addition, multiplication et transposition|Matrice inverse et résolution de systèmes|Matrices élémentaires|Propriétés algébriques des opérations matricielles",
  "algebre-s1-4":
    "Déterminant en dimensions deux et trois|Calcul d’un déterminant par réduction|Propriétés du déterminant|Interprétation en aire, volume et orientation|Déterminant, inversibilité et solutions",
  "algebre-s1-5":
    "Axiomes et exemples d’espaces vectoriels|Combinaisons linéaires et sous-espace engendré|Critère de sous-espace vectoriel|Somme et intersection de sous-espaces|Espaces de polynômes, matrices et fonctions",
  "algebre-s1-6":
    "Dépendance et indépendance linéaires|Familles génératrices|Bases et coordonnées|Dimension d’un espace et d’un sous-espace|Rang d’une matrice",
  "algebre-s1-7":
    "Définition et exemples d’applications linéaires|Noyau et injectivité|Image, surjectivité et rang|Théorème du rang|Matrice associée à une application|Composition et application réciproque",
  "algebre-s2-1":
    "Coordonnées d’un vecteur dans une base|Matrice de changement de base|Transformer des coordonnées entre deux bases|Changer la matrice d’une application linéaire|Choisir une base adaptée au problème",
  "algebre-s2-2":
    "Compléments orthogonaux|Projection orthogonale sur une droite ou un plan|Bases orthonormées|Procédé de Gram-Schmidt|Projection dans une base orthonormée",
  "algebre-s2-3":
    "Formuler un problème surdéterminé|Projection et principe des moindres carrés|Équations normales|Ajustement d’une droite aux données|Résidus, erreur et qualité d’ajustement",
  "algebre-s2-4":
    "Définition d’une valeur et d’un vecteur propres|Polynôme caractéristique|Calcul des espaces propres|Multiplicités algébrique et géométrique|Interprétations géométrique et physique",
  "algebre-s2-5":
    "Principe de la diagonalisation|Critères de diagonalisabilité|Construire une base propre|Calculer des puissances d’une matrice|Applications aux récurrences et systèmes",
  "algebre-s2-6":
    "Matrices symétriques et théorème spectral|Diagonalisation orthogonale|Formes quadratiques|Définie positivité et critères|Axes principaux d’une forme quadratique",
  "algebre-s2-7":
    "Suites vectorielles et récurrences linéaires|Systèmes différentiels linéaires|Résolution par valeurs propres|Stabilité des points d’équilibre|Portraits de phase de systèmes 2D",
  "algebre-s2-8":
    "Matrices de rotation en 2D et 3D|Composition des rotations|Tenseur d’inertie et axes principaux|Valeurs propres et modes propres|Superposition et interprétation des modes",
  "algebre-s2-9":
    "Tableaux et opérations matricielles avec NumPy|Résoudre un système avec NumPy|Calcul numérique des valeurs propres|Moindres carrés numériques|Conditionnement et contrôle des résultats",

  // 3. Physique générale I — Mécanique
  "mecanique-s1-1":
    "Grandeurs physiques et unités du SI|Analyse dimensionnelle et homogénéité|Mesure et chiffres significatifs|Incertitude d’une mesure|Ordres de grandeur et estimations de Fermi",
  "mecanique-s1-2":
    "Référentiel, position et déplacement en 1D|Vitesse moyenne et vitesse instantanée|Accélération moyenne et instantanée|Mouvements uniformes et uniformément accélérés|Lecture et intégration des graphes cinématiques",
  "mecanique-s1-3":
    "Vecteurs position, vitesse et accélération|Mouvement dans un repère cartésien|Mouvement de projectile|Mouvement circulaire et composantes normale-tangentielle|Coordonnées polaires — introduction",
  "mecanique-s1-4":
    "Principe d’inertie et référentiels galiléens|Deuxième loi de Newton|Action-réaction et interactions|Forces usuelles|Construire un diagramme de corps libre|Résoudre un problème de dynamique du point",
  "mecanique-s1-5":
    "Frottement statique et adhérence|Frottement cinétique|Force de rappel d’un ressort|Traînée linéaire et quadratique|Vitesse limite et modèles de résistance",
  "mecanique-s1-6":
    "Travail d’une force constante|Travail d’une force variable|Énergie cinétique|Théorème de l’énergie cinétique|Puissance mécanique",
  "mecanique-s1-7":
    "Forces conservatives et énergie potentielle|Énergies potentielles gravitationnelle et élastique|Conservation de l’énergie mécanique|Forces non conservatives et dissipation|Diagrammes d’énergie et équilibres",
  "mecanique-s1-8":
    "Quantité de mouvement d’un point et d’un système|Impulsion d’une force|Conservation de la quantité de mouvement|Collisions élastiques et inélastiques en 1D|Collisions et explosions en plusieurs dimensions",
  "mecanique-s1-9":
    "Définition du centre de masse|Calcul du centre de masse discret et continu|Mouvement du centre de masse|Forces internes et externes|Systèmes de particules et conservation",
  "mecanique-s1-10":
    "Cinématique angulaire du solide|Moment d’inertie d’un système discret|Moment d’inertie d’un solide continu|Théorèmes des axes parallèles et perpendiculaires|Énergie cinétique de rotation",
  "mecanique-s1-11":
    "Moment d’une force et couple|Deuxième loi de Newton en rotation|Équilibre statique du solide|Rotation autour d’un axe fixe|Roulement sans glissement",
  "mecanique-s1-12":
    "Moment cinétique d’un point|Moment cinétique d’un solide|Lien entre couple et moment cinétique|Conservation du moment cinétique|Applications gyroscopiques — introduction",
  "mecanique-s1-13":
    "Loi de gravitation universelle|Champ et potentiel gravitationnels|Énergie et vitesse de libération|Mouvement orbital circulaire et elliptique|Lois de Kepler et paramètres orbitaux",
  "mecanique-s1-14":
    "Oscillateur harmonique simple|Énergie de l’oscillateur|Oscillations amorties|Oscillations forcées|Résonance, phase et facteur de qualité",
  "mecanique-s1-15":
    "Changement de référentiel en translation|Référentiel en rotation|Force centrifuge|Force de Coriolis|Applications terrestres des forces d’inertie",
  "mecanique-s1-16":
    "Définir le système et les hypothèses|Construire le modèle cinématique et dynamique|Choisir une méthode de résolution|Calculer ou simuler la réponse|Valider le modèle et analyser ses limites",

  // 4. Physique générale II — Thermodynamique & transferts
  "thermodynamique-s2-1":
    "Système, frontière et milieu extérieur|Systèmes ouverts, fermés et isolés|Variables et fonctions d’état|Équilibre thermodynamique et transformations|Équations d’état",
  "thermodynamique-s2-2":
    "Température et principe zéro|Pression et forces de surface|Travail thermodynamique|Transfert d’énergie par chaleur|Conventions de signe et diagrammes P-V",
  "thermodynamique-s2-3":
    "Loi du gaz parfait et domaine de validité|Description microscopique d’un gaz|Pression issue des collisions moléculaires|Température et énergie cinétique moyenne|Équipartition et énergie interne — introduction",
  "thermodynamique-s2-4":
    "Énergie interne et conservation de l’énergie|Premier principe pour un système fermé|Bilans sur une transformation|Premier principe sur un cycle|Introduction au volume de contrôle",
  "thermodynamique-s2-5":
    "Transformation isochore|Transformation isobare|Transformation isotherme d’un gaz parfait|Transformation adiabatique réversible|Comparaison des transformations dans le diagramme P-V",
  "thermodynamique-s2-6":
    "Capacités thermiques massique et molaire|Relations entre Cp et Cv|Enthalpie et travail d’écoulement|Bilan énergétique d’un système fermé|Bilan stationnaire d’un système ouvert",
  "thermodynamique-s2-7":
    "Limites du premier principe|Énoncé de Kelvin-Planck|Énoncé de Clausius|Processus réversibles et irréversibles|Introduction au deuxième principe",
  "thermodynamique-s2-8":
    "Définition et interprétation de l’entropie|Variation d’entropie d’un gaz parfait|Bilan d’entropie d’un système fermé|Bilan d’entropie d’un volume de contrôle|Production d’entropie et irréversibilités",
  "thermodynamique-s2-9":
    "Architecture et bilan d’une machine thermique|Rendement thermique|Réfrigérateur et coefficient de performance|Pompe à chaleur|Limites imposées par le deuxième principe",
  "thermodynamique-s2-10":
    "Cycle de Carnot|Cycle Otto idéal|Cycle Diesel idéal|Cycle Brayton idéal|Comparer les cycles et leurs rendements",
  "thermodynamique-s2-11":
    "Phases et changement d’état|Chaleur latente|Diagrammes P-T et P-v|Point triple et point critique|Lecture de tables thermodynamiques — introduction",
  "thermodynamique-s2-12":
    "Écarts au modèle du gaz parfait|Facteur de compressibilité|Équation de van der Waals|Isothermes et point critique|Choisir un modèle de gaz réel",
  "thermodynamique-s2-13":
    "Flux conductif et loi de Fourier|Conduction stationnaire dans une paroi plane|Résistance thermique et parois composites|Conduction cylindrique et sphérique|Ailettes et conduction multidimensionnelle — introduction",
  "thermodynamique-s2-14":
    "Mécanisme physique de la convection|Coefficient convectif et loi de Newton|Convection forcée et convection naturelle|Nombres sans dimension de la convection|Utiliser une corrélation convective — introduction",
  "thermodynamique-s2-15":
    "Corps noir et spectre thermique|Lois de Planck et de Wien — introduction|Loi de Stefan-Boltzmann|Émissivité et surfaces réelles|Échange radiatif entre surfaces",
  "thermodynamique-s2-16":
    "Bilan local et dérivation de l’équation de la chaleur|Conduction 1D stationnaire|Conduction 1D transitoire|Conditions initiales et conditions aux limites|Résolution analytique ou numérique simple",
  "thermodynamique-s2-17":
    "Rendements énergétiques de composants et de chaînes|Qualité de l’énergie et travail maximal|Exergie d’un flux de chaleur|Destruction d’exergie et irréversibilité|Comparer bilans d’énergie et d’exergie",
  "thermodynamique-s2-18":
    "Définir le système thermique et les performances|Choisir les propriétés et modèles de matière|Établir les bilans d’énergie et d’entropie|Intégrer les transferts de chaleur|Calculer les performances et valider les résultats|Identifier pertes, incertitudes et pistes d’amélioration",

  // 5. Programmation scientifique & calcul numérique
  "programmation-s1-1":
    "Installer et organiser un environnement Python scientifique|Exécuter un programme Python|Comprendre le fonctionnement d’un notebook|Structurer une expérience dans un notebook|Rendre un calcul reproductible",
  "programmation-s1-2":
    "Variables, affectation et expressions|Types numériques et opérateurs|Chaînes de caractères et formatage|Booléens et comparaisons|Entrées, sorties et conversions de types",
  "programmation-s1-3":
    "Conditions et branchements|Boucles for et parcours d’une collection|Boucles while et critères d’arrêt|Définir et appeler une fonction|Paramètres, valeurs de retour et portée|Décomposer un algorithme en fonctions",
  "programmation-s1-4":
    "Listes et compréhensions de listes|Tuples et données immuables|Dictionnaires et associations clé-valeur|Ensembles et opérations ensemblistes|Choisir une structure de données adaptée",
  "programmation-s1-5":
    "Créer des tableaux NumPy et comprendre les dtypes|Indexation, slicing et masques booléens|Calcul vectorisé|Broadcasting|Matrices et algèbre linéaire avec NumPy|Vectorisation et performance",
  "programmation-s1-6":
    "Figure, axes et premier tracé|Tracer et comparer plusieurs courbes|Titres, axes, unités, légendes et styles|Nuages de points et barres d’erreur|Sous-figures et échelles logarithmiques|Exporter une figure scientifique lisible",
  "programmation-s1-7":
    "Chemins, fichiers et encodage|Lire et écrire un fichier texte|Lire et écrire des données CSV|Charger des données avec NumPy|Valider, nettoyer et sauvegarder un jeu de données",
  "programmation-s1-8":
    "Lisibilité, nommage et style du code|Documentation et docstrings|Gestion des erreurs et assertions|Écrire des tests unitaires|Principes du contrôle de version|Git : commits, historique et branches de base",
  "programmation-s2-1":
    "Représentation binaire des nombres|Nombres flottants et arrondis|Propagation et accumulation des erreurs|Annulation catastrophique|Conditionnement d’un problème|Stabilité d’un algorithme",
  "programmation-s2-2":
    "Formuler un problème de recherche de racine|Méthode de dichotomie|Convergence et critères d’arrêt|Méthode de Newton|Choix de l’initialisation et cas d’échec|Comparer dichotomie et Newton",
  "programmation-s2-3":
    "Interpolation linéaire|Interpolation polynomiale|Phénomène de Runge et choix des nœuds|Interpolation par splines — introduction|Approximation et erreur d’interpolation",
  "programmation-s2-4":
    "Différences finies pour la dérivation|Erreur de troncature d’une dérivée numérique|Sommes de rectangles|Règle du trapèze|Règle de Simpson|Convergence d’une quadrature numérique",
  "programmation-s2-5":
    "Élimination de Gauss numérique|Pivotage et stabilité|Factorisation LU|Résoudre plusieurs seconds membres|Conditionnement et résidu|Utiliser un solveur NumPy de façon critique",
  "programmation-s2-6":
    "Discrétiser une EDO avec la méthode d’Euler|Erreur locale et erreur globale|Stabilité de la méthode d’Euler|Méthodes de Runge-Kutta|Choix du pas de temps|Comparer une solution numérique à une référence",
  "programmation-s2-7":
    "Générer des variables pseudo-aléatoires|Échantillonnage et loi des grands nombres|Intégration Monte-Carlo|Propagation Monte-Carlo d’incertitudes|Convergence statistique et intervalle de confiance",
  "programmation-s2-8":
    "Importer et nettoyer des mesures|Statistiques descriptives et incertitudes|Ajuster un modèle aux données|Analyser les résidus|Comparer modèle et expérience|Communiquer les résultats et leurs limites",
  "programmation-s2-9":
    "Spécifier un système mécanique ou thermique|Traduire le modèle physique en algorithme|Implémenter et vérifier le solveur|Étudier les paramètres du modèle|Visualiser et interpréter la dynamique|Valider la simulation",
  "programmation-s2-10":
    "Définir la question et les critères de réussite du mini-projet|Construire le modèle numérique énergétique|Implémenter une version reproductible|Vérifier le code et quantifier l’erreur|Analyser les performances énergétiques|Documenter et présenter le mini-projet",

  // 6. Chimie & science des matériaux
  "chimie-materiaux-s1-1":
    "Constitution de l’atome et isotopes|Modèle quantique, orbitales et nombres quantiques|Configurations électroniques|Organisation du tableau périodique|Tendances périodiques et réactivité",
  "chimie-materiaux-s1-2":
    "Liaison ionique|Liaison covalente et structures de Lewis|Géométrie moléculaire et polarité|Liaison métallique|Forces intermoléculaires|Relier liaison, structure et propriétés",
  "chimie-materiaux-s1-3":
    "Mole, masse molaire et quantité de matière|Équilibrer une équation chimique|Relations stœchiométriques|Réactif limitant|Rendement et pureté|Établir un bilan de matière",
  "chimie-materiaux-s1-4":
    "Variables et lois des gaz|Mélanges gazeux et pressions partielles|Solutions et dissolution|Concentrations molaire et massique|Dilutions et préparations de solutions",
  "chimie-materiaux-s1-5":
    "Énergie, chaleur et enthalpie de réaction|Calorimétrie chimique|Loi de Hess|Enthalpies standard de formation|Énergie de combustion et pouvoir calorifique|Comparer des réactions par leur bilan énergétique",
  "chimie-materiaux-s1-6":
    "Équilibre dynamique et quotient de réaction|Constante d’équilibre|Calculer une composition à l’équilibre|Principe de Le Chatelier|Effets de la température, pression et composition",
  "chimie-materiaux-s1-7":
    "Définitions de Brønsted des acides et bases|Autoprotolyse de l’eau et pH|Acides et bases forts|Acides et bases faibles|Solutions tampons|Titrages acido-basiques — introduction",
  "chimie-materiaux-s1-8":
    "Oxydation, réduction et nombres d’oxydation|Équilibrer une réaction d’oxydoréduction|Pile galvanique et circulation des charges|Potentiels d’électrode et tension de cellule|Équation de Nernst — introduction|Architecture et bilan d’une batterie",
  "chimie-materiaux-s2-1":
    "Réseaux cristallins et maille élémentaire|Structures cubiques et compacité|Plans et directions cristallographiques — introduction|Défauts ponctuels|Dislocations, joints de grains et effets sur les propriétés",
  "chimie-materiaux-s2-2":
    "Structure et propriétés des métaux|Solutions solides et alliages|Mécanismes de durcissement|Transformations et traitements thermiques|Choisir un alliage pour une fonction d’ingénierie",
  "chimie-materiaux-s2-3":
    "Structure et comportement des polymères|Thermoplastiques, thermodurcissables et élastomères|Structure et propriétés des céramiques|Architecture et anisotropie des composites|Comparer polymères, céramiques et composites",
  "chimie-materiaux-s2-4":
    "Contrainte et déformation|Élasticité et loi de Hooke|Plasticité et limite d’élasticité|Rupture ductile et fragile|Essai de traction et lecture de courbe|Fatigue et fluage — introduction",
  "chimie-materiaux-s2-5":
    "Capacité thermique et stockage sensible|Conductivité et diffusivité thermiques|Dilatation thermique|Conducteurs, isolants et semi-conducteurs|Relier microstructure et propriétés de transport",
  "chimie-materiaux-s2-6":
    "Phases, constituants et domaines|Règle des phases — introduction|Lire un diagramme binaire|Règle du levier|Diagramme fer-carbone — introduction|Relier refroidissement, microstructure et propriétés",
  "chimie-materiaux-s2-7":
    "Mécanismes électrochimiques de corrosion|Corrosion uniforme et galvanique|Corrosion localisée|Protection contre la corrosion|Vieillissement thermique, chimique et mécanique",
  "chimie-materiaux-s2-8":
    "Traduire une fonction en exigences matériaux|Comparer les performances avec des indices de mérite|Compromis masse, rigidité et résistance|Compromis température, durabilité et coût|Intégrer fabrication et disponibilité|Justifier une sélection multicritère",
  "chimie-materiaux-s2-9":
    "Matériaux d’électrodes et d’électrolytes pour batteries|Semi-conducteurs et matériaux photovoltaïques|Matériaux pour hautes températures|Matériaux critiques, recyclage et durabilité|Comparer les contraintes matériaux des technologies énergétiques",
  "chimie-materiaux-s2-10":
    "Analyser les sollicitations du prototype|Établir le cahier des charges matériau|Présélectionner des familles de matériaux|Classer des candidats avec des critères quantifiés|Vérifier procédé, coût et impact|Documenter et défendre la sélection finale",

  // 7. Conception d’ingénierie & CAO
  "conception-cao-s1-1":
    "Identifier un besoin et les parties prenantes|Formuler le problème sans imposer de solution|Analyser les fonctions du système|Définir des exigences vérifiables|Identifier les contraintes|Tracer exigences, fonctions et solutions",
  "conception-cao-s1-2":
    "Structure d’un cahier des charges|Transformer un besoin en critères mesurables|Fixer niveaux, flexibilités et tolérances|Prioriser les exigences|Construire une matrice de vérification|Valider un cahier des charges",
  "conception-cao-s1-3":
    "Croquis à main levée et intention de conception|Projection orthogonale et vues normalisées|Choix des vues utiles|Coupes et sections|Lire et produire un dessin technique simple",
  "conception-cao-s1-4":
    "Cotation fonctionnelle|Chaînes de cotes — introduction|Tolérances dimensionnelles|Ajustements arbre-alésage|Tolérances géométriques — introduction|Contrôler la fabricabilité d’une cotation",
  "conception-cao-s1-5":
    "Interface, repères et paramètres d’un logiciel de CAO|Esquisses contraintes|Fonctions volumiques de base|Construction paramétrique robuste|Assemblages et liaisons|Mises en plan depuis la CAO",
  "conception-cao-s1-6":
    "Chemins de charge et transmission des efforts|Architecture fonctionnelle d’un mécanisme|Liaisons et degrés de liberté|Isostatisme et hyperstatisme — introduction|Construire et comparer des architectures mécaniques",
  "conception-cao-s1-7":
    "Assemblages vissés|Axes et arbres|Roulements et guidage en rotation|Engrenages et rapport de transmission|Choisir et intégrer un élément standard",
  "conception-cao-s1-8":
    "Relier matériau et procédé|Moulage et formage|Usinage|Fabrication additive|Assemblage et finition|Choisir un couple matériau-procédé",
  "conception-cao-s2-1":
    "Identifier les charges et cas de fonctionnement|Calculer contraintes et déformations simples|Définir un coefficient de sécurité|Dimensionner une section simple|Vérifier rigidité, résistance et stabilité",
  "conception-cao-s2-2":
    "Rôles et niveaux de fidélité d’un prototype|Choisir un procédé de prototypage rapide|Principes de l’impression 3D|Concevoir une pièce imprimable|Préparer, fabriquer et contrôler une impression",
  "conception-cao-s2-3":
    "Principes de l’usinage|Découpe mécanique, laser et jet d’eau|Assemblages démontables|Assemblages permanents|Sélectionner une gamme de fabrication simple",
  "conception-cao-s2-4":
    "Principes du Design for Manufacturing|Réduire la complexité de fabrication|Principes du Design for Assembly|Réduire le nombre de pièces et d’opérations|Reconcevoir une pièce pour fabriquer et assembler",
  "conception-cao-s2-5":
    "Identifier les modes de défaillance|Analyser causes, effets et criticité|Observer une défaillance de prototype|Proposer des corrections fondées sur les preuves|Planifier et documenter une itération",
  "conception-cao-s2-6":
    "Définir les grandeurs à mesurer|Choisir capteurs et chaîne d’acquisition|Intégrer les capteurs au prototype|Étalonner la chaîne de mesure|Concevoir un protocole d’instrumentation",
  "conception-cao-s2-7":
    "Transformer une exigence en essai|Construire un plan de validation|Mesurer les performances du prototype|Comparer essais, calculs et simulation|Analyser les écarts et décider de la conformité",
  "conception-cao-s2-8":
    "Produire des plans de définition|Construire une nomenclature|Documenter composants et fournisseurs|Rédiger les procédures de fabrication et d’assemblage|Assembler un dossier de conception traçable",
  "conception-cao-s2-9":
    "Préparer les preuves d’une revue de conception|Présenter architecture et choix techniques|Démontrer la conformité aux exigences|Conduire une critique technique|Transformer les décisions en plan d’action",
  "conception-cao-s2-10":
    "Cadrer le sous-système énergétique|Générer et comparer des concepts|Dimensionner les composants principaux|Réaliser la CAO et les plans|Prototyper ou simuler le sous-système|Valider et soutenir la conception finale",

  // 8. Travaux pratiques de physique & métrologie
  "tp-metrologie-annuel-1":
    "Sécurité et analyse des risques au laboratoire|Tenir un carnet de laboratoire traçable|Passer d’une question à une hypothèse testable|Variables, témoins et protocole expérimental|Préparer et clore une expérience",
  "tp-metrologie-annuel-2":
    "Mesurande, indication et résultat de mesure|Résolution et sensibilité d’un instrument|Précision, fidélité et exactitude|Erreurs systématiques et aléatoires|Étalonnage et traçabilité métrologique",
  "tp-metrologie-annuel-3":
    "Distribution d’une série de mesures|Incertitude-type de type A|Incertitude-type de type B|Propagation des incertitudes|Incertitude élargie et présentation d’un résultat",
  "tp-metrologie-annuel-4":
    "Construire et visualiser un nuage de mesures|Régression linéaire par moindres carrés|Incertitude des paramètres ajustés|Résidus et qualité d’ajustement|Comparer quantitativement modèle et expérience",
  "tp-metrologie-annuel-5":
    "Concevoir le protocole d’un TP de cinématique|Étalonner la mesure de position et de temps|Acquérir position, vitesse et accélération|Traiter les données cinématiques|Confronter les trajectoires au modèle",
  "tp-metrologie-annuel-6":
    "Concevoir le montage de vérification de F = ma|Mesurer force, masse et accélération|Quantifier frottements et biais|Tester la relation de Newton|Conclure avec les incertitudes",
  "tp-metrologie-annuel-7":
    "Définir le bilan d’énergie du montage|Mesurer énergies cinétique et potentielle|Quantifier les pertes mécaniques|Tester la conservation de l’énergie|Identifier les mécanismes dissipatifs",
  "tp-metrologie-annuel-8":
    "Caractériser un oscillateur libre|Mesurer période et pulsation propre|Mesurer l’amortissement|Tracer la réponse fréquentielle|Identifier la résonance et le facteur de qualité",
  "tp-metrologie-annuel-9":
    "Concevoir une mesure de moment d’inertie|Étalonner le montage en rotation|Mesurer l’accélération angulaire|Calculer le moment d’inertie expérimental|Comparer géométrie, modèle et mesure",
  "tp-metrologie-annuel-10":
    "Principe et bilan d’un calorimètre|Étalonner un calorimètre|Mesurer une capacité thermique|Mesurer une chaleur latente — selon le montage|Évaluer pertes et incertitudes thermiques",
  "tp-metrologie-annuel-11":
    "Installer et sécuriser une expérience sur un gaz|Mesurer pression, volume et température|Tester la loi du gaz parfait|Réaliser une transformation quasi statique|Comparer transformation réelle et idéale",
  "tp-metrologie-annuel-12":
    "Concevoir une expérience de conduction|Mesurer un profil de température|Estimer un flux thermique|Déterminer une conductivité|Quantifier pertes latérales et résistances de contact",
  "tp-metrologie-annuel-13":
    "Définir les frontières d’une chaîne de conversion|Mesurer puissance d’entrée et puissance utile|Étalonner les mesures de puissance|Calculer rendement et incertitude|Localiser et interpréter les pertes",
  "tp-metrologie-annuel-14":
    "Caractériser un capteur de température|Caractériser un capteur de force|Caractériser un capteur de pression|Mesurer courant et tension en sécurité|Comparer plage, sensibilité, linéarité et dynamique",
  "tp-metrologie-annuel-15":
    "Architecture d’une chaîne d’acquisition|Échantillonnage et repliement spectral — introduction|Conversion analogique-numérique|Filtrage et bruit de mesure|Synchroniser, enregistrer et documenter les données",
  "tp-metrologie-annuel-16":
    "Importer et contrôler les données brutes|Nettoyer sans masquer l’information|Calculer statistiques et incertitudes|Ajuster un modèle numérique|Produire figures et tableaux reproductibles|Archiver code, données et résultats",
  "tp-metrologie-annuel-17":
    "Structure et argumentation d’un rapport scientifique|Rédiger méthode et protocole reproductibles|Présenter résultats, figures et incertitudes|Discuter modèle, écarts et limites|Formuler une conclusion fondée sur les preuves|Relire avec une grille d’évaluation",
  "tp-metrologie-annuel-18":
    "Analyser la consigne et planifier l’épreuve|Monter et sécuriser l’expérience|Étalonner et acquérir les mesures|Analyser les données sous contrainte de temps|Défendre oralement méthode, résultat et incertitude",

  // 9. Introduction aux systèmes énergétiques
  "systemes-energetiques-s1-1":
    "Formes et transformations de l’énergie|Travail et transfert d’énergie|Puissance et profils de charge|Unités de l’énergie et de la puissance|Ordres de grandeur des usages énergétiques|Convertir et contrôler les unités",
  "systemes-energetiques-s1-2":
    "Principe de conservation de l’énergie|Définir les frontières d’un système|Représenter une chaîne de conversion|Identifier convertisseurs, vecteurs et usages|Construire le bilan global d’une chaîne",
  "systemes-energetiques-s1-3":
    "Rendement d’un composant|Rendement global de composants en série|Pertes utiles, dissipées et évitables|Bilans en régime stationnaire|Bilans en régime variable|Diagrammes de Sankey",
  "systemes-energetiques-s1-4":
    "Énergie primaire et ressources|Conversion en énergie secondaire|Énergie finale livrée|Énergie utile et service rendu|Facteurs de conversion et conventions comptables|Tracer un flux primaire-vers-service",
  "systemes-energetiques-s1-5":
    "Densité énergétique massique|Densité énergétique volumique|Densité de puissance|Compromis énergie-puissance|Comparer carburants, batteries et stockage thermique",
  "systemes-energetiques-s1-6":
    "Formation et familles de combustibles fossiles|Extraction, traitement et transport|Conversion par combustion|Émissions et polluants|Ressources, dépendances et limites physiques|Place des fossiles dans les systèmes actuels",
  "systemes-energetiques-s1-7":
    "Induction et principe d’un générateur|Alternateur et conversion électromécanique|Turbines hydrauliques, à vapeur et à gaz|Architecture d’une centrale thermique|Bilans et rendements d’une centrale|Production centralisée et décentralisée",
  "systemes-energetiques-s1-8":
    "Production, transport et distribution de l’électricité|Tension, courant, puissance active et réactive — intuition|Transformateurs et niveaux de tension|Équilibre instantané offre-demande|Fréquence et stabilité — introduction|Pertes, protections et qualité de fourniture — introduction",
  "systemes-energetiques-s2-1":
    "Rayonnement solaire et ressource|Jonction semi-conductrice et effet photovoltaïque|Cellule, module et champ photovoltaïque|Courbe courant-tension et point de puissance maximale|Onduleur et raccordement|Production, pertes et dimensionnement simple d’une installation",
  "systemes-energetiques-s2-2":
    "Capteurs solaires thermiques|Bilan thermique d’un capteur|Circuits, échangeurs et stockage|Eau chaude sanitaire et chauffage solaire|Solaire thermique à concentration — introduction|Dimensionnement et limites saisonnières",
  "systemes-energetiques-s2-3":
    "Ressource éolienne et distribution des vitesses|Puissance cinétique du vent|Extraction d’énergie et limite de Betz|Rotor, génératrice et commande|Courbe de puissance d’une éolienne|Sillage, implantation et facteur de charge",
  "systemes-energetiques-s2-4":
    "Énergie potentielle et puissance hydraulique|Turbines hydrauliques et domaines d’emploi|Architecture d’un aménagement hydroélectrique|Rendement, débit et hauteur de chute|Pompage-turbinage et bilan de cycle|Contraintes hydrologiques et environnementales",
  "systemes-energetiques-s2-5":
    "Noyau, isotopes et énergie de liaison|Réaction de fission et réaction en chaîne|Modération et contrôle du réacteur|Architecture d’une centrale nucléaire|Barrières, défense en profondeur et sûrete|Combustible usé, déchets et cycle du combustible",
  "systemes-energetiques-s2-6":
    "Réactions de fusion et critère de Lawson|Plasma et températures de fusion|Confinement magnétique|Confinement inertiel|Bilan de puissance et gain de fusion|Matériaux, tritium et verrous technologiques",
  "systemes-energetiques-s2-7":
    "Cellule électrochimique et tension|Capacité et état de charge|Puissance, courant et régime de décharge|Rendement coulombique et énergétique|Mécanismes de vieillissement|Pack, gestion thermique et système BMS — introduction",
  "systemes-energetiques-s2-8":
    "Propriétés de l’hydrogène comme vecteur|Production par reformage|Électrolyse de l’eau|Compression, liquéfaction et stockage matériau|Transport et sécurité|Pile à combustible et rendement de la chaîne",
  "systemes-energetiques-s2-9":
    "Stockage thermique sensible|Stockage thermique latent et thermochimique|Stockage gravitaire et pompage-turbinage|Volants d’inertie et air comprimé|Stockage électrochimique et électrique|Comparer durée, puissance, rendement et coût",
  "systemes-energetiques-s2-10":
    "Variabilité et incertitude de la production|Profils de charge et résiduel|Flexibilité de la demande|Stockage et complémentarité des sources|Interconnexions et flexibilité du réseau|Scénario simple d’équilibrage horaire",
  "systemes-energetiques-s2-11":
    "Périmètres des émissions de gaz à effet de serre|Facteur d’émission et contenu carbone|Étapes d’une analyse de cycle de vie|Unité fonctionnelle et frontières du système|Énergie grise, durée de vie et recyclage|Interpréter une comparaison environnementale avec prudence",
  "systemes-energetiques-s2-12":
    "Comparer les rendements sur un périmètre commun|Comparer coûts d’investissement et d’exploitation|Comparer besoins en matériaux et espace|Comparer risques et impacts|Comparer maturité, disponibilité et déploiement|Construire une matrice multicritère transparente",
  "systemes-energetiques-s2-13":
    "Définir la demande du cas d’étude|Établir les profils temporels de consommation|Inventorier ressources et contraintes|Concevoir une architecture pour un bâtiment, véhicule ou micro-réseau|Simuler un bilan énergétique simplifié|Comparer variantes et sensibilités",
  "systemes-energetiques-s2-14":
    "Formuler le besoin énergétique et les critères|Générer plusieurs architectures|Dimensionner les flux et composants principaux|Quantifier rendement, coût, impacts et risques|Tester des scénarios et incertitudes|Argumenter et défendre l’architecture retenue",

  // 10. Projet d’ingénierie annuel
  "projet-phase-1-1":
    "Observer un besoin réel lié à l’énergie|Formuler une problématique précise|Identifier utilisateurs et parties prenantes|Vérifier utilité, faisabilité et périmètre|Formaliser le choix du problème",
  "projet-phase-1-2":
    "Planifier une recherche documentaire|Évaluer la fiabilité des sources|Cartographier les solutions existantes|Identifier les principes physiques dominants|Synthétiser limites, lacunes et opportunités|Constituer une bibliographie traçable",
  "projet-phase-1-3":
    "Analyser les fonctions du futur système|Définir des exigences mesurables|Fixer contraintes et interfaces|Choisir des critères de réussite|Établir la méthode de vérification|Faire valider le cahier des charges",
  "projet-phase-1-4":
    "Identifier risques techniques, humains et environnementaux|Évaluer probabilité, gravité et criticité|Définir mesures de prévention et réduction|Décomposer le projet en livrables|Planifier jalons, ressources et dépendances|Mettre en place le suivi des risques et du planning",
  "projet-phase-2-1":
    "Définir système, frontières et variables|Sélectionner les lois physiques pertinentes|Énoncer et justifier les hypothèses|Construire les équations du modèle|Vérifier dimensions et cas limites|Documenter domaine de validité et limites",
  "projet-phase-2-2":
    "Identifier les paramètres de dimensionnement|Établir les bilans analytiques|Calculer les valeurs nominales|Dimensionner avec marges et coefficients de sécurité|Étudier les sensibilités|Vérifier les ordres de grandeur",
  "projet-phase-2-3":
    "Définir le but et les sorties de la simulation|Discrétiser ou coder le modèle|Vérifier l’implémentation|Calibrer les paramètres justifiés|Exécuter scénarios et sensibilités|Valider et archiver la simulation",
  "projet-phase-2-4":
    "Transformer les exigences en critères de sélection|Présélectionner matériaux|Rechercher et comparer les composants|Vérifier compatibilité et interfaces|Intégrer coût, disponibilité et durabilité|Justifier et documenter les choix",
  "projet-phase-3-1":
    "Générer plusieurs architectures|Comparer les concepts aux exigences|Choisir et figer une architecture|Construire la CAO paramétrique|Vérifier interfaces, encombrement et assemblage|Produire plans et nomenclature V1",
  "projet-phase-3-2":
    "Définir les objectifs d’apprentissage du prototype V1|Planifier achats et fabrication|Fabriquer les composants|Assembler en sécurité|Contrôler conformité et fonctionnement|Documenter les écarts de fabrication",
  "projet-phase-3-3":
    "Définir les grandeurs et performances à mesurer|Choisir et dimensionner les capteurs|Intégrer la chaîne d’acquisition|Étalonner les mesures|Rédiger un protocole reproductible|Analyser risques et critères d’arrêt des essais",
  "projet-phase-3-4":
    "Construire la matrice d’essais|Préparer le montage et les données brutes|Réaliser les essais nominaux|Explorer variations et cas limites|Répéter pour estimer la variabilité|Contrôler et archiver la campagne de mesures",
  "projet-phase-4-1":
    "Préparer des données comparables|Quantifier les écarts modèle-expérience|Analyser biais, bruit et incertitudes|Identifier hypothèses ou paramètres responsables|Mettre à jour le modèle ou expliquer ses limites|Formuler les enseignements de la V1",
  "projet-phase-4-2":
    "Prioriser les améliorations de la V2|Définir variables et objectif d’optimisation|Explorer les compromis|Reconcevoir les éléments critiques|Fabriquer et assembler le prototype V2|Comparer objectivement V1 et V2",
  "projet-phase-4-3":
    "Définir les frontières du bilan énergétique|Mesurer ou estimer chaque flux|Calculer les rendements des composants|Calculer le rendement global|Localiser et hiérarchiser les pertes|Proposer des gains techniquement justifiés",
  "projet-phase-4-4":
    "Définir des scénarios hors nominal|Tester la robustesse aux variations|Vérifier fonctions et marges de sécurité|Identifier les limites de fonctionnement|Analyser les modes de défaillance résiduels|Documenter consignes, protections et limites d’usage",
  "projet-phase-5-1":
    "Construire l’argument du rapport final|Rédiger contexte, exigences et état de l’art|Rédiger modèles, conception et méthodes|Présenter résultats, incertitudes et discussion|Conclure sur les critères de réussite|Réviser, référencer et finaliser le rapport",
  "projet-phase-5-2":
    "Organiser l’arborescence documentaire|Nettoyer CAO, plans et nomenclature|Archiver code, données et environnements|Rédiger fabrication, assemblage et étalonnage|Tester la reproductibilité par une tierce personne|Versionner et publier le dossier final",
  "projet-phase-5-3":
    "Construire le récit de la présentation|Sélectionner les preuves et figures essentielles|Concevoir des diapositives lisibles|Préparer une démonstration fiable et sûre|Répéter avec contrainte de temps|Répondre aux questions avec précision et honnêteté",
  "projet-phase-5-4":
    "Préparer les preuves par exigence|Défendre les hypothèses et le modèle|Justifier architecture, matériaux et dimensionnement|Interpréter les mesures et incertitudes|Discuter rendement, sécurité et impacts|Analyser limites, échecs et suite du projet"
};

function objectiveForLesson(title: string, parentTitle: string): string {
  const lowerTitle = title.charAt(0).toLocaleLowerCase("fr") + title.slice(1);
  return (
    "À l’issue de cette séance, savoir expliquer, mettre en œuvre et vérifier " +
    lowerTitle +
    " dans le cadre du bloc « " +
    parentTitle +
    " »."
  );
}

function parsedBlueprint(itemId: string): string[] | undefined {
  const blueprint = LESSON_BLUEPRINTS[itemId];
  if (!blueprint) return undefined;
  return blueprint
    .split("|")
    .map((title) => title.trim())
    .filter(Boolean);
}

/**
 * Construit les séances canoniques d’un bloc. Les ids ne dépendent pas du
 * titre, afin qu’une correction typographique ne perde jamais la progression.
 */
export function buildLessonUnits(
  itemId: string,
  itemTitle: string
): LessonUnit[] {
  const titles = parsedBlueprint(itemId) ?? [
    "Fondements de « " + itemTitle + " »",
    "Mise en pratique et validation de « " + itemTitle + " »"
  ];

  return titles.map((title, index) => ({
    id: itemId + "-lesson-" + (index + 1),
    title,
    objective: objectiveForLesson(title, itemTitle),
    completed: false
  }));
}

/**
 * Retourne la décomposition canonique tout en réinjectant la progression
 * enregistrée. Cette fonction constitue la migration des anciennes données.
 */
export function getLessonUnits(item: ProgramItem): LessonUnit[] {
  const canonical = buildLessonUnits(item.id, item.title);
  // Les anciennes données ne connaissaient que l'état du bloc parent. Un bloc
  // déjà terminé doit donc conserver sa progression quand il est découpé pour
  // la première fois en séances atomiques.
  const completedLegacyItem =
    item.completed && (!item.lessons || item.lessons.length === 0);
  const completedById = new Map(
    (item.lessons ?? []).map((lesson) => [lesson.id, lesson.completed])
  );

  return canonical.map((lesson) => ({
    ...lesson,
    completed: completedById.get(lesson.id) ?? completedLegacyItem
  }));
}

/**
 * Hydrate un référentiel chargé depuis localStorage sans modifier les objets
 * d’origine ni les identifiants des matières, modules et blocs.
 */
export function hydrateSubjectLessonUnits(subjects: Subject[]): Subject[] {
  return subjects.map((subject) => ({
    ...subject,
    modules: subject.modules.map((courseModule) => ({
      ...courseModule,
      items: courseModule.items.map((item) => ({
        ...item,
        lessons: getLessonUnits(item)
      }))
    }))
  }));
}

export function hasCuratedLessonBlueprint(itemId: string): boolean {
  return Object.hasOwn(LESSON_BLUEPRINTS, itemId);
}

export const curatedProgramItemCount = Object.keys(LESSON_BLUEPRINTS).length;
