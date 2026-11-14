import type { Subject } from '../types';

export interface CurriculumBranch {
  id: string;
  name: string;
  domain: string;
  objective: string;
  years: string[][];
}

/** Each row contains a chapter followed by genuinely distinct atomic lessons. */
export function branchSubject(branch: CurriculumBranch, year: number, prefix: string): Subject {
  const rows = branch.years[year - 1];
  if (!rows?.length) throw new Error(`Année absente : ${branch.id}/${year}`);
  const id = `${prefix}-${branch.id}`;
  const midpoint = Math.ceil(rows.length / 2);
  return {
    id, name: branch.name, shortName: branch.name.slice(0, 35), domain: branch.domain,
    teacher: 'Tuteur IA', room: 'Espace de travail', period: 'Annuel',
    color: '#476eac', accent: '#eef3fb', icon: 'book', chapterCount: rows.length,
    objective: branch.objective,
    validation: 'Cours, exercices et mini-tests de chapitre ; bilan semestriel et annuel. Les productions pratiques et orales exigent une observation réelle distincte de l’écrit.',
    modules: [rows.slice(0, midpoint), rows.slice(midpoint)].filter(part => part.length).map((part, semester) => ({
      id: `${id}-s${semester + 1}`, period: `Semestre ${semester + 1}`, title: semester === 0 ? 'Fondations et construction des méthodes' : 'Approfondissement, applications et synthèse',
      items: part.map((row, index) => {
        const [title, ...lessons] = row.split('|');
        if (lessons.length < 3) throw new Error(`Chapitre insuffisamment détaillé : ${title}`);
        const chapterId = `${id}-ch${semester * midpoint + index + 1}`;
        return { id: chapterId, title, completed: false,
          description: `${branch.objective} Prérequis : notions précédentes de cette progression. Distinguer cours explicite, exemples guidés, exercices autonomes et bilan des erreurs.`,
          lessons: lessons.map((lesson, l) => ({ id: `${chapterId}-l${l + 1}`, title: lesson, completed: false,
            objective: `À l’issue de « ${lesson} », expliquer les concepts et le vocabulaire nécessaires, mettre en œuvre la démarche sur une situation adaptée à l’année ${year}, justifier sa réponse et vérifier ses limites. Réaliser d’abord un exemple commenté, puis un entraînement distinct avec correction argumentée.` })) };
      })
    }))
  };
}

export const CO_BRANCHES: CurriculumBranch[] = [
  { id: 'francais', name: 'Français', domain: 'Langues', objective: 'Comprendre, interpréter et produire des textes oraux et écrits ; maîtriser progressivement le fonctionnement de la langue.', years: [
    [
      'Lire un récit|Situation initiale et événements|Narrateur et personnages|Ordre chronologique|Inférences simples|Justifier une interprétation par le texte',
      'Construire les phrases|Classes grammaticales|Groupes et fonctions|Sujet et prédicat|Compléments de phrase|Types et formes de phrases',
      'Écrire correctement|Accord sujet-verbe|Accord dans le groupe nominal|Présent et futur|Imparfait et passé composé|Homophones grammaticaux',
      'Raconter et décrire|Plan d’un récit|Description d’un lieu|Portrait d’un personnage|Dialogue et ponctuation|Révision d’un brouillon',
      'Lire pour apprendre|Repérer les informations essentielles|Organisation d’un texte explicatif|Titres et paragraphes|Reformuler sans copier|Résumer un document court',
      'Poésie et théâtre|Vers et strophes|Rimes et sonorités|Comparaison et métaphore|Répliques et didascalies|Lecture expressive',
      'Parler et écouter|Écoute et prise de notes|Exposé préparé|Articulation et débit|Questions et reformulation|Échange respectueux',
      'Vocabulaire et bilan|Familles de mots|Préfixes et suffixes|Synonymes et antonymes|Sens propre et figuré|Lecture intégrale et carnet de lecteur'
    ],
    [
      'Interpréter la narration|Points de vue narratifs|Retour en arrière et anticipation|Rythme du récit|Implicite et indices|Nouvelle réaliste et fantastique',
      'Phrase complexe|Coordination et juxtaposition|Subordination|Propositions relatives|Complétives|Circonstancielles de cause et de temps',
      'Système verbal|Passé simple et imparfait|Plus-que-parfait|Conditionnel présent|Subjonctif présent fréquent|Concordance dans le récit',
      'Orthographe raisonnée|Accord du participe avec être|Accord du participe avec avoir|Pronoms et accords|Adverbes et adjectifs|Relecture méthodique',
      'Expliquer et argumenter|Thèse et arguments|Exemples probants|Connecteurs logiques|Lettre argumentée|Débat avec contre-argument',
      'Textes et médias|Article d’information|Sources et fiabilité|Image et légende|Publicité et persuasion|Résumé comparatif',
      'Culture littéraire|Poésie lyrique|Comédie et conflit|Figures de style|Contexte d’une œuvre|Comparer deux interprétations',
      'Produire et présenter|Plan d’exposé documenté|Prise de notes structurée|Citation et bibliographie simple|Écriture d’une nouvelle|Bilan critique du portfolio'
    ],
    [
      'Lecture approfondie|Interprétation étayée|Narrateur non fiable|Symboles et réseaux lexicaux|Relations entre textes|Analyse d’un extrait littéraire',
      'Maîtrise de la syntaxe|Relations entre propositions|Subordonnées concessives et conditionnelles|Discours direct et indirect|Voix active et passive|Cohésion et reprises',
      'Temps et modes|Valeurs du conditionnel|Valeurs du subjonctif|Antériorité et concordance|Accords complexes du participe|Choix des temps selon le genre',
      'Argumentation développée|Problématique|Plan argumentatif|Réfutation|Concession et nuance|Conclusion et ouverture pertinente',
      'Écriture fonctionnelle|Lettre de motivation|Courriel formel|Compte rendu|Synthèse de documents|Révision stylistique',
      'Littérature et société|Œuvre intégrale et contexte|Théâtre et mise en scène|Poésie engagée|Presse et opinion|Discussion des valeurs d’un texte',
      'Oral autonome|Exposé sans lecture intégrale|Débat contradictoire|Analyse d’une intervention|Soutenance d’un projet|Évaluation de sa prise de parole',
      'Préparation de la transition|Compréhension en temps limité|Analyse grammaticale contextualisée|Production écrite longue|Correction argumentée de ses erreurs|Dossier final de lecture'
    ]
  ] },
  { id: 'mathematiques', name: 'Mathématiques', domain: 'Mathématiques', objective: 'Raisonner, calculer, représenter, modéliser et contrôler les résultats en nombres, algèbre, géométrie et mesures.', years: [
    [
      'Nombres entiers et décimaux|Numération et comparaison|Priorités opératoires|Divisibilité|Décomposition en facteurs premiers|Calcul mental et estimation',
      'Fractions et relatifs|Fractions équivalentes|Comparer des fractions|Additionner et soustraire des fractions|Repérer des nombres négatifs|Additionner et soustraire des relatifs',
      'Proportionnalité|Tableau de proportionnalité|Passage à l’unité|Pourcentages|Échelles|Vitesses et unités simples',
      'Premiers outils algébriques|Expression littérale|Substitution numérique|Réduction de termes semblables|Distributivité simple|Équation à une inconnue',
      'Figures et constructions|Angles et droites|Triangles et propriétés|Quadrilatères|Constructions au compas|Symétrie axiale',
      'Grandeurs et mesures|Conversions de longueurs|Périmètres|Aires des figures usuelles|Volumes du pavé et du prisme|Précision et arrondi',
      'Données et représentations|Lire tableaux et graphiques|Effectifs et fréquences|Moyenne arithmétique|Diagrammes|Repérage dans le plan',
      'Recherche de problèmes|Comprendre les données|Dessiner un modèle|Essais organisés|Expliquer une méthode|Contrôler la vraisemblance'
    ],
    [
      'Calcul numérique|Opérations sur les fractions|Produit et quotient de relatifs|Puissances entières positives|Écriture scientifique|Racine carrée et encadrement',
      'Calcul littéral|Double distributivité|Factorisation par facteur commun|Identités remarquables simples|Expressions fractionnaires simples|Transformer une formule',
      'Équations et problèmes|Équations avec parenthèses|Équations avec fractions|Mise en équation|Inéquations simples|Interpréter une solution',
      'Fonctions et variations|Variables et dépendance|Tableau et graphique|Fonction linéaire|Fonction affine|Proportionnalité inverse',
      'Géométrie plane|Théorème de Pythagore|Réciproque de Pythagore|Cercle et angles|Translation et rotation|Similitude et agrandissement',
      'Mesures et espace|Aire du disque|Volume du cylindre|Patrons de solides|Grandeurs composées|Effet d’un changement d’échelle',
      'Statistique et hasard|Médiane et étendue|Fréquences cumulées|Expérience aléatoire|Probabilité simple|Simulation et comparaison de fréquences',
      'Raisonnement|Distinguer exemple et preuve|Contre-exemple|Démonstration géométrique guidée|Modèle numérique ou graphique|Rédiger une résolution complète'
    ],
    [
      'Nombres et calcul|Puissances entières négatives|Calcul avec racines carrées|Ordres de grandeur scientifiques|Précision et chiffres significatifs|Calcul exact ou approché',
      'Algèbre approfondie|Produits remarquables|Factorisation|Équations produit nul|Systèmes linéaires à deux inconnues|Problèmes de synthèse algébrique',
      'Fonctions|Lecture et comparaison de fonctions|Modèles affines|Intersections de graphes|Fonction quadratique : découverte|Modélisation et domaine de validité',
      'Géométrie et trigonométrie|Théorème de Thalès|Triangles semblables|Sinus, cosinus et tangente|Résoudre un triangle rectangle|Problèmes de distances inaccessibles',
      'Espace et mesures|Pyramide et cône|Sphère et boule|Sections simples de solides|Volumes composés|Unités et contrôle dimensionnel',
      'Statistique critique|Choix d’indicateurs|Échantillon et population|Graphiques trompeurs|Comparer des distributions|Interpréter des données réelles',
      'Probabilités|Arbres simples|Événements contraires|Expériences successives|Dénombrement organisé|Probabilité théorique et expérience',
      'Transition vers le secondaire II|Justifier une conjecture|Choisir une représentation|Résoudre un problème ouvert|Épreuve de synthèse|Analyser et corriger ses erreurs'
    ]
  ] },
  { id: 'sciences', name: 'Sciences de la nature', domain: 'Sciences', objective: 'Mener une démarche expérimentale et expliquer les phénomènes du vivant, de la matière et de l’énergie.', years: [
    [
      'Enquêter scientifiquement|Observation et question|Hypothèse testable|Variable et témoin|Mesure et incertitude simple|Compte rendu et sécurité au laboratoire',
      'Matière et mélanges|États de la matière|Changements d’état|Masse et volume|Masse volumique|Séparer un mélange',
      'Le vivant|Caractéristiques du vivant|Cellule et microscope|Organismes unicellulaires et pluricellulaires|Classification fondée sur des caractères|Biodiversité locale',
      'Écosystèmes|Milieu et facteurs physiques|Chaînes alimentaires|Réseaux trophiques|Relations entre espèces|Perturbation d’un milieu',
      'Le corps et ses besoins|Appareil digestif|Nutriments et digestion|Respiration|Circulation sanguine|Relations entre organes',
      'Forces et mouvement|Décrire un mouvement|Vitesse moyenne|Forces et effets|Masse et poids|Équilibre simple',
      'Énergie|Formes d’énergie|Transferts et transformations|Conservation dans un système simple|Sources renouvelables et non renouvelables|Consommation et économies',
      'Terre et environnement|Cycle de l’eau|Roches et sols|Érosion|Ressource en eau|Enquête expérimentale annuelle'
    ],
    [
      'Modèle particulaire|Atomes et molécules|Corps purs et mélanges|Diffusion et agitation|Symboles chimiques usuels|Conservation de la masse',
      'Transformations chimiques|Réactifs et produits|Combustion|Acidité et pH|Réactions et énergie|Risques et pictogrammes',
      'Électricité|Circuit fermé|Courant et tension|Montages série et parallèle|Résistance et loi d’Ohm|Puissance et sécurité électrique',
      'Lumière et son|Propagation de la lumière|Réflexion|Réfraction et lentilles|Vibrations et ondes sonores|Audition et protection',
      'Reproduction et développement|Reproduction sexuée et asexuée|Appareils reproducteurs|Puberté et développement|Fécondation et grossesse|Prévention et santé sexuelle',
      'Régulation du corps|Système nerveux|Organes des sens|Réflexes et messages nerveux|Hormones et régulation|Sommeil et vigilance',
      'Terre dynamique|Structure interne de la Terre|Tectonique des plaques|Séismes|Volcanisme|Risques naturels et prévention',
      'Expérimentation|Construire un protocole|Représenter des résultats|Distinguer corrélation et causalité|Répéter et comparer des mesures|Présenter une conclusion argumentée'
    ],
    [
      'Hérédité|Noyau et chromosomes|ADN et information génétique|Gènes et caractères|Transmission simple|Diversité génétique et limites des modèles',
      'Évolution|Variations individuelles|Sélection naturelle|Fossiles et temps géologiques|Parentés entre espèces|Évolution et biodiversité',
      'Santé et défense|Microorganismes|Transmission des infections|Défenses immunitaires|Vaccination : principe|Antibiotiques et résistances',
      'Mécanique et énergie|Force et accélération qualitatives|Travail mécanique|Énergie potentielle et cinétique|Machines simples|Rendement énergétique',
      'Chimie de l’environnement|Équations chimiques simples|Cycle du carbone|Gaz atmosphériques|Polluants et concentrations|Traitement de l’eau',
      'Climat et systèmes|Météo et climat|Effet de serre|Bilan énergétique terrestre|Données climatiques|Atténuation et adaptation',
      'Astronomie|Système solaire|Rotation et révolution|Saisons|Phases de la Lune|Échelles de distance et observation',
      'Projet scientifique|Problématique et recherche|Protocole contrôlé|Analyse de données|Limites et reproductibilité|Soutenance du projet'
    ]
  ] },
  { id: 'histoire', name: 'Histoire', domain: 'Sciences humaines', objective: 'Situer les sociétés dans le temps, confronter les sources et expliquer changements et continuités sans réduire l’histoire à une chronologie.', years: [
    [
      'Méthodes de l’histoire|Sources matérielles et écrites|Auteur et contexte|Chronologie et périodisation|Fait et interprétation|Construire une frise',
      'Héritages antiques|Cité grecque|Démocratie antique et exclusions|République et empire romains|Christianisation|Héritages politiques et culturels',
      'Sociétés médiévales|Seigneurs et paysans|Villes et échanges|Pouvoirs religieux|Monde byzantin et mondes musulmans|Contacts et conflits',
      'La Confédération ancienne|Communautés alpines|Alliances et intérêts|Sources et mythes fondateurs|Expansion et conflits|Vie quotidienne dans les territoires',
      'Renaissance et humanisme|Imprimerie|Arts et savoirs|Humanisme|Explorations maritimes|Conquête et colonisation',
      'Réformes religieuses|Réforme protestante|Réformes catholiques|Genève et la Suisse|Conflits confessionnels|Liberté de conscience',
      'Pouvoirs et sociétés|Monarchie et autorité|Société d’ordres|Commerce et empires|Traite et esclavage|Résistances et témoignages',
      'Enquête historique|Comparer deux sources|Lire une image ancienne|Étudier un lieu patrimonial|Rédiger un récit documenté|Présenter les limites de son enquête'
    ],
    [
      'Lumières|Raison et critique|Circulation des idées|Encyclopédie|Droits et inégalités|Débat sur le pouvoir',
      'Révolutions|Révolution américaine|Révolution française|Droits et citoyenneté|Révolution haïtienne|Napoléon et recompositions',
      'Industrialisation|Innovations et énergie|Usine et travail|Urbanisation|Condition ouvrière|Transformations sociales',
      'Suisse moderne|République helvétique|Médiation et Restauration|Sonderbund|État fédéral de 1848|Démocratie et révisions constitutionnelles',
      'Nations et empires|Nationalismes|Unifications européennes|Colonisation du XIXe siècle|Résistances coloniales|Racisme et justification des dominations',
      'Sociétés en mutation|Migrations|Mouvements ouvriers|Droits des femmes|École et alphabétisation|Culture de masse',
      'Première Guerre mondiale|Système des alliances|Guerre totale|Expérience des combattants et civils|Révolutions russes|Paix et nouveaux équilibres',
      'Travail sur les sources|Statistiques historiques|Caricature politique|Témoignage et mémoire|Comparer des explications|Dossier thématique'
    ],
    [
      'Entre-deux-guerres|Crises économiques|Démocraties fragilisées|Fascisme|Nazisme|Stalinisme',
      'Seconde Guerre mondiale|Expansion et guerre|Occupation et résistances|Shoah et génocides|Suisse pendant la guerre|Sorties de guerre',
      'Guerre froide|Blocs et idéologies|Crises et dissuasion|Guerres périphériques|Vie quotidienne et propagande|Fin de l’URSS',
      'Décolonisations|Indépendances et mouvements nationaux|Inde|Afrique|Héritages coloniaux|Non-alignement',
      'Transformations sociales|Croissance et consommation|Mouvements de 1968|Droits civiques|Émancipation des femmes|Mutations du travail',
      'Suisse contemporaine|État social|Immigration et intégration|Suffrage féminin|Relations européennes|Neutralité et débats contemporains',
      'Monde contemporain|Mondialisation|Construction européenne|Conflits et institutions internationales|Enjeux environnementaux|Numérique et sociétés',
      'Histoire et mémoire|Commémoration|Négationnisme et critique des sources|Mémoire familiale et histoire|Enquête sur une controverse|Synthèse chronologique argumentée'
    ]
  ] },
  { id: 'geographie', name: 'Géographie', domain: 'Sciences humaines', objective: 'Analyser les territoires, leurs acteurs, leurs ressources et leurs transformations à plusieurs échelles.', years: [
    [
      'Outils du géographe|Orientation et coordonnées|Échelles cartographiques|Lire une légende|Cartes topographiques|Croquis de paysage',
      'Habiter les territoires|Densité et répartition|Ville et campagne|Fonctions urbaines|Mobilités quotidiennes|Acteurs de l’aménagement',
      'Suisse et régions|Relief suisse|Plateau, Jura et Alpes|Régions linguistiques|Réseaux de transport|Relations entre espaces',
      'Climats et milieux|Température et précipitations|Diagramme climatique|Zones climatiques|Contraintes du milieu|Adaptation des sociétés',
      'Eau et sociétés|Bassin versant|Usages de l’eau|Accès à l’eau potable|Conflits d’usage|Gestion locale de l’eau',
      'Risques naturels|Aléas et vulnérabilité|Inondations|Glissements de terrain|Aménagement et prévention|Lire une carte de risque',
      'Produire et consommer|Agriculture|Origine des aliments|Chaînes de production|Transport et commerce|Impacts des choix de consommation',
      'Enquête de terrain|Question géographique|Observation et relevé|Entretien avec un acteur|Carte de synthèse|Restitution d’une enquête'
    ],
    [
      'Population et mobilités|Transition démographique|Pyramide des âges|Migration volontaire et forcée|Réseaux migratoires|Villes d’accueil',
      'Urbanisation|Métropolisation|Périurbanisation|Ségrégations spatiales|Logement|Mobilité durable',
      'Énergie et ressources|Répartition des ressources|Production d’électricité|Hydrocarbures et dépendances|Énergies renouvelables|Conflits d’aménagement',
      'Économie mondiale|Localisation des activités|Chaînes de valeur|Ports et flux|Acteurs économiques|Conditions de travail',
      'Inégalités|Indicateurs de développement|Santé et éducation|Inégalités entre et dans les pays|Commerce et interdépendances|Limites des classements',
      'Tourisme|Mise en tourisme|Acteurs du tourisme alpin|Saisonnalité|Impacts sociaux et environnementaux|Alternatives touristiques',
      'Agriculture et alimentation|Systèmes agricoles|Sécurité alimentaire|Eau et irrigation|Commerce agricole|Gaspillage alimentaire',
      'Analyser un territoire|Comparer deux cartes|Lire des statistiques|Croiser les échelles|Identifier un conflit d’acteurs|Proposer un scénario argumenté'
    ],
    [
      'Changement climatique|Sources des émissions|Vulnérabilités territoriales|Justice climatique|Politiques d’adaptation|Comparer des scénarios',
      'Mondialisation|Flux de marchandises|Flux d’informations|Firmes et territoires|Dépendances économiques|Relocalisation et résilience',
      'Aménagement suisse|Fédéralisme et territoire|Protection des sols|Densification|Transports et urbanisme|Participation à un projet local',
      'Ressources et conflits|Matières premières|Ressources minières|Frontières et contrôle|Eau transfrontalière|Gouvernance des ressources',
      'Biodiversité et usages|Fragmentation des habitats|Forêts|Littoraux|Protection et activités humaines|Services écosystémiques',
      'Consommation responsable|Cycle de vie d’un objet|Empreinte matérielle|Économie circulaire|Étiquettes et arguments commerciaux|Comparer des solutions',
      'Géopolitique accessible|Territoire et souveraineté|Organisations internationales|Migrations et frontières|Conflit et coopération|Lire une actualité géographique',
      'Projet de territoire|Définir une problématique|Collecter des données fiables|Cartographier|Comparer intérêts et contraintes|Soutenir une proposition'
    ]
  ] }
];

export const CO_GENERAL_BRANCHES: CurriculumBranch[] = [
  { id: 'citoyennete', name: 'Citoyenneté et institutions', domain: 'Sciences humaines', objective: 'Comprendre les institutions suisses, les droits, les responsabilités et les moyens de participation démocratique.', years: [
    ['Vivre ensemble|Règle et loi|Droits et devoirs|Égalité et discrimination|Résolution d’un conflit', 'Institutions proches|Commune|Canton|Confédération|Répartition des compétences', 'Démocratie|Vote et représentation|Majorité et minorité|Délibération|Conseil de classe', 'Information citoyenne|Fait et opinion|Source fiable|Argument et exemple|Projet collectif'],
    ['État de droit|Séparation des pouvoirs|Constitution|Justice et procédures|Libertés fondamentales', 'Démocratie suisse|Élections|Initiative populaire|Référendum|Partis et associations', 'Économie et société|Biens publics|Impôts et services|Assurances sociales|Budget collectif', 'Citoyenneté numérique|Vie privée|Expression en ligne|Harcèlement et recours|Débat documenté'],
    ['Décisions publiques|Processus législatif|Fédéralisme en pratique|Groupes d’intérêt|Analyse d’une votation', 'Droits humains|Universalité et histoire|Protection des minorités|Droits de l’enfant|Institutions de protection', 'Suisse et monde|ONU|Conseil de l’Europe|Relations Suisse-UE|Coopération internationale', 'Participation|Construire une proposition|Examiner les objections|Défendre un projet|Évaluer son effet collectif']
  ] },
  { id: 'numerique', name: 'Éducation numérique et médias', domain: 'Numérique', objective: 'Comprendre les médias et les systèmes informatiques, créer avec le numérique et protéger ses données.', years: [
    ['Systèmes numériques|Matériel et logiciel|Fichiers et dossiers|Formats et stockage|Sauvegarde et restauration', 'Information|Moteur de recherche|Mots-clés et filtres|Auteur et source|Droit d’auteur et citation', 'Algorithmique|Instruction et séquence|Condition|Boucle|Débogage visuel', 'Identité numérique|Données personnelles|Mot de passe et authentification|Traces numériques|Communication respectueuse'],
    ['Données|Tableur et cellules|Formules|Tri et filtre|Graphiques et interprétation', 'Programmation|Variables|Conditions imbriquées|Boucles et compteurs|Fonctions simples', 'Réseaux|Internet et Web|Adresses et protocoles : principes|Trajet d’une requête|Confidentialité des échanges', 'Médias|Publicité ciblée|Recommandation algorithmique|Images manipulées|Vérification croisée'],
    ['Pensée informatique|Décomposition d’un problème|Structures de données simples|Tests et cas limites|Documentation d’un programme', 'Création numérique|Page Web structurée|Accessibilité|Production audio ou vidéo|Publication et licences', 'IA et société|Données d’entraînement|Classification et prédiction|Biais et erreurs|Vérifier une réponse générée', 'Projet responsable|Cahier des charges|Prototype|Sécurité et minimisation des données|Démonstration et bilan']
  ] },
  { id: 'arts-visuels', name: 'Arts visuels', domain: 'Arts', objective: 'Observer, expérimenter les moyens plastiques, créer et analyser des images dans leur contexte.', years: [
    ['Observer et dessiner|Contour|Proportions|Valeurs de gris|Croquis d’observation', 'Couleur|Cercle chromatique|Contrastes|Mélanges|Couleur et intention', 'Composer|Cadrage|Plans|Équilibre|Relation texte-image', 'Culture visuelle|Décrire une œuvre|Technique et support|Contexte|Carnet de recherche'],
    ['Espace|Perspective frontale|Perspective oblique|Ombre et lumière|Représentation du volume', 'Techniques|Peinture|Collage|Gravure simple|Photographie', 'Image et message|Affiche|Narration visuelle|Stéréotypes|Analyse publicitaire', 'Projet artistique|Recherche de références|Esquisses|Expérimentation|Présentation critique'],
    ['Langages visuels|Abstraction et figuration|Composition expressive|Matière et texture|Série d’images', 'Images contemporaines|Photomontage|Image numérique|Appropriation et droit d’auteur|Intention et réception', 'Histoire des arts|Comparer des mouvements|Œuvre et société|Architecture|Analyse argumentée', 'Création autonome|Problématique plastique|Choix techniques|Réalisation|Exposition et retour réflexif']
  ] },
  { id: 'musique', name: 'Musique', domain: 'Arts', objective: 'Écouter, interpréter, créer et situer les musiques ; construire une pratique réelle adaptée aux moyens disponibles.', years: [
    ['Écouter|Pulsation|Tempo|Timbres|Nuances', 'Lire et produire|Notes et portée|Rythmes simples|Mesures binaires|Chant et respiration', 'Créer ensemble|Ostinato|Question-réponse|Percussion corporelle|Écoute du groupe', 'Cultures musicales|Familles instrumentales|Musique et fonction sociale|Traditions suisses|Carnet d’écoute'],
    ['Langage musical|Gammes|Intervalles|Accords simples|Formes répétitives', 'Pratique|Justesse vocale|Polyrythmie|Accompagnement|Interprétation collective', 'Écoute comparée|Thème et variation|Musique de film|Musiques du monde|Argumenter une perception', 'Création|Motif mélodique|Arrangement|Enregistrement|Révision d’une production'],
    ['Analyse|Structure d’une œuvre|Harmonie élémentaire|Texture|Lien texte-musique', 'Interprétation|Préparer une pièce|Phrasé|Expressivité|Autoévaluation d’un enregistrement', 'Musiques et société|Industries musicales|Droits des créateurs|Évolutions stylistiques|Écoute critique', 'Projet musical|Intention|Composition ou arrangement|Répétition|Présentation publique adaptée']
  ] },
  { id: 'activites-creatrices', name: 'Activités créatrices et techniques', domain: 'Arts et techniques', objective: 'Concevoir et réaliser un objet en articulant usages, matériaux, gestes techniques et sécurité.', years: [
    ['Concevoir|Besoin et usage|Croquis|Dimensions|Cahier des charges simple', 'Matériaux|Papier et carton|Bois|Textile|Propriétés et réemploi', 'Réaliser|Mesurer et tracer|Découper avec un outil adapté|Assembler|Contrôler la solidité', 'Projet|Prototype|Décoration fonctionnelle|Évaluation de l’objet|Présentation de la démarche'],
    ['Design|Analyse d’un objet|Fonction et forme|Plan coté|Choix de matériaux', 'Techniques|Assemblages bois|Couture et liaison textile|Modelage|Finitions', 'Mécanismes|Levier|Transmission de mouvement|Structure porteuse|Essai et amélioration', 'Réalisation|Organisation des étapes|Gestion des ressources|Contrôle qualité|Bilan des erreurs'],
    ['Conception responsable|Durabilité|Réparabilité|Cycle de vie|Accessibilité de l’usage', 'Fabrication|Tolérances simples|Gabarits|Assemblages démontables|Documentation technique', 'Prototype fonctionnel|Solutions alternatives|Choix argumenté|Tests d’usage|Itérations', 'Projet autonome|Planification|Réalisation encadrée|Présentation de l’objet|Dossier de conception']
  ] },
  { id: 'education-physique', name: 'Éducation physique', domain: 'Corps et mouvement', objective: 'Développer motricité, coopération et connaissance de l’effort par une pratique réelle adaptée et encadrée lorsque nécessaire.', years: [
    ['Condition physique|Échauffement|Endurance progressive|Mobilité|Récupération', 'Coordination|Équilibre|Rythme|Orientation|Réaction', 'Jeux collectifs|Règles|Placement|Coopération|Fair-play', 'Expression et suivi|Enchaînement corporel|Danse|Observation d’un geste|Journal de pratique'],
    ['Entraînement|Dosage de l’effort|Force avec technique adaptée|Vitesse|Suivi de sa progression', 'Habiletés|Courir et franchir|Lancer|Sauter|Combiner des actions', 'Stratégie collective|Attaque|Défense|Communication|Arbitrage', 'Milieux variés|Orientation en extérieur|Sécurité aquatique encadrée|Techniques de nage encadrées|Projet chorégraphique'],
    ['Autonomie physique|Planifier une pratique|Adapter la charge|Reconnaître la fatigue|Récupération et continuité', 'Maîtrise motrice|Technique et efficacité|Enchaînements complexes|Analyse vidéo consentie|Correction d’un geste', 'Coopération|Choix tactiques|Organisation d’un tournoi|Inclusion|Gestion des désaccords', 'Projet personnel|Objectif réaliste|Séances et suivi|Présentation des progrès|Bilan durable']
  ] },
  { id: 'economie-familiale', name: 'Alimentation et économie familiale', domain: 'Vie quotidienne', objective: 'Comprendre alimentation, consommation et budget ; pratiquer des gestes culinaires adaptés dans un cadre sûr.', years: [
    ['Alimentation|Groupes d’aliments|Nutriments|Variété des repas|Hydratation', 'Cuisine|Hygiène des mains et surfaces|Conservation|Mesures culinaires|Techniques de cuisson simples', 'Consommation|Besoin et envie|Prix unitaire|Étiquetage|Gaspillage', 'Projet repas|Planifier un menu|Liste d’achats|Préparer un repas encadré|Bilan sensoriel'],
    ['Choix alimentaires|Besoins variables|Composition d’un produit|Allergènes|Publicité alimentaire', 'Organisation|Plan de travail|Conservation au froid|Restes et réemploi|Temps et énergie', 'Budget|Recettes et dépenses|Budget alimentaire|Comparer des offres|Coût d’un repas', 'Cultures|Traditions culinaires|Saisonnalité|Origine des produits|Repas partagé'],
    ['Consommation responsable|Cycle de vie alimentaire|Labels et limites|Transport et stockage|Réduction des déchets', 'Autonomie|Menu équilibré sur plusieurs jours|Budget contraint|Organisation des achats|Préparation et conservation', 'Économie personnelle|Contrat simple|Abonnement et coût total|Endettement : comprendre le risque|Droits du consommateur', 'Projet|Enquête sur une filière|Comparaison argumentée|Réalisation culinaire|Présentation du bilan']
  ] },
  { id: 'ethique', name: 'Éthique et cultures religieuses', domain: 'Culture générale', objective: 'Développer une réflexion éthique et une connaissance non confessionnelle des traditions et convictions, dans le respect des personnes.', years: [
    ['Réfléchir|Question de fait et question de valeur|Règle et principe|Dilemme simple|Justifier une position', 'Diversité|Convictions et croyances|Rites|Symboles|Respect et dialogue', 'Récits et traditions|Récit fondateur|Traditions monothéistes|Traditions asiatiques|Humanismes non religieux', 'Vivre ensemble|Stéréotypes|Discrimination|Liberté de conscience|Coopération'],
    ['Éthique appliquée|Intention et conséquence|Responsabilité|Justice|Solidarité', 'Cultures religieuses|Textes et interprétations|Lieux et pratiques|Diversité interne|Calendriers et fêtes', 'Société|Religion et pouvoir|Sécularisation|Laïcité et modèles suisses|Libertés et limites', 'Discussion|Reformuler un point de vue|Examiner un argument|Désaccord respectueux|Écrire un avis nuancé'],
    ['Dilemmes contemporains|Éthique environnementale|Éthique du numérique|Consommation et responsabilité|Justice entre générations', 'Histoire et actualité|Traditions en transformation|Pluralisme suisse|Convictions et identité|Analyse d’un fait médiatique', 'Autonomie du jugement|Principes concurrents|Critique des préjugés|Universalité et diversité|Décision argumentée', 'Projet|Choisir une question|Comparer des sources|Conduire un dialogue|Synthèse personnelle réflexive']
  ] },
  { id: 'orientation', name: 'Méthodes, santé et orientation', domain: 'Formation générale', objective: 'Apprendre à apprendre, coopérer, préserver son bien-être et construire progressivement son projet scolaire ou professionnel.', years: [
    ['Apprendre|Planifier la semaine|Rappel actif|Espacement des révisions|Analyser une erreur', 'Se connaître|Centres d’intérêt|Forces et difficultés|Émotions|Demander de l’aide', 'Santé et relations|Sommeil|Gestion du stress|Consentement et respect|Ressources de soutien', 'Découvrir les métiers|Familles professionnelles|Formation générale et professionnelle|Observer une activité|Portfolio de découverte'],
    ['Méthodes|Prise de notes|Carte conceptuelle|Préparer une évaluation|Travail de groupe', 'Projet personnel|Explorer des formations|Comparer des exigences|Préparer une visite|Conduire un entretien d’information', 'Bien-être|Pression du groupe|Usage des écrans|Prévention des dépendances|Repérer une situation de harcèlement', 'Orientation|Stage d’observation|Compte rendu de stage|Valeurs et environnement de travail|Mettre à jour son portfolio'],
    ['Choisir une suite|Gymnase et collège|CFC et AFP|Maturités et passerelles|Comparer plusieurs projets', 'Candidater|CV|Lettre de motivation|Entretien|Suivi des démarches', 'Autonomie|Objectifs et échéances|Budget de temps|Révisions de synthèse|Stratégies face à une difficulté', 'Projet de transition|Plan principal et alternatives|Vérifier les conditions officielles|Présenter son parcours|Bilan des acquis et besoins']
  ] }
];
