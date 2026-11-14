import type { CefrLevel, Subject } from '../types';

export const MODERN_LANGUAGES = {
  de: { name: 'Allemand', slug: 'allemand', pronunciation: 'voyelles longues et brèves, Umlaut, ich-Laut et ach-Laut', culture: 'Allemagne, Autriche et Suisse alémanique' },
  it: { name: 'Italien', slug: 'italien', pronunciation: 'consonnes doubles, accent tonique, gli et gn', culture: 'Italie et Suisse italienne' },
  es: { name: 'Espagnol', slug: 'espagnol', pronunciation: 'voyelles, accent tonique, r et rr, variations du seseo', culture: 'Espagne et Amérique hispanophone' }
} as const;
export type ModernLanguage = keyof typeof MODERN_LANGUAGES;

// Original teaching sequence. The CEFR describes abilities, not a compulsory
// grammar timetable. These progressions are editorial choices, not exam claims.
const STRUCTURES: Record<ModernLanguage, Record<CefrLevel, string[]>> = {
  de: {
    A1: [
      'Premiers sons et échanges|Alphabet et épellation|Voyelles longues et brèves|Umlaut ä, ö, ü|Ich-Laut et ach-Laut|Accent lexical et intonation',
      'Construire une phrase|Pronoms personnels sujets|Présent de sein et haben|Présent des verbes réguliers|Verbe en deuxième position|Questions avec mot interrogatif et questions fermées',
      'Nommer et préciser|Genres der, die, das|Articles définis et indéfinis au nominatif|Pluriels usuels|Négation avec nicht et kein|Possessifs au nominatif',
      'Agir au quotidien|Accusatif des articles|Complément direct et ordre simple|Verbes modaux können et möchten|Verbes à particule séparable|Impératif de consignes usuelles',
      'Situer les personnes et les choses|Prépositions locales fréquentes|Datif après mit, bei et zu|Heures et dates|Adverbes de fréquence|Coordination avec und, aber et oder',
      'Élargir un message simple|Présent des verbes à alternance vocalique|Pronoms personnels à l’accusatif|Es gibt et descriptions|Prétérit usuel de sein|Première découverte du Perfekt'
    ],
    A2: [
      'Raconter un événement|Perfekt avec haben|Perfekt avec sein|Participes réguliers et irréguliers|Präteritum de sein, haben et modaux|Repères temporels d’un récit',
      'Décrire et comparer|Adjectif attribut et épithète|Déclinaison après article défini|Déclinaison après article indéfini|Comparatif et superlatif|Comparaisons avec als et wie',
      'Préciser les relations|Datif des noms et pronoms|Double complément et ordre|Prépositions mixtes : position ou déplacement|Verbes de position et de déplacement|Possessifs aux trois cas usuels',
      'Relier ses idées|Subordonnée avec weil|Subordonnée avec dass|Interrogation indirecte avec ob|Condition avec wenn|Connecteurs deshalb, trotzdem et dann',
      'Organiser et demander|Futur avec werden et présent prospectif|Konjunktiv II de politesse|Verbes réfléchis du quotidien|Prépositions temporelles seit, vor et für|Conseils avec sollte',
      'Structurer un récit court|Infinitif avec zu|But avec um…zu|Relative au nominatif|Indéfinis et quantités|Révision de la place du verbe'
    ],
    B1: [
      'Récits et chronologie|Präteritum des verbes courants|Plusquamperfekt|Subordonnées als et wenn|Antériorité avec nachdem|Simultanéité avec während',
      'Développer le groupe nominal|Déclinaison de l’adjectif sans article|Génitif et compléments du nom|Déclinaison des noms faibles|Pronoms relatifs accusatif et datif|Relative avec préposition',
      'Hypothèses et projets|Konjunktiv II présent|Hypothèse irréelle avec wenn|Souhaits et regrets simples|Alternatives avec würde|But : damit ou um…zu',
      'Décrire un processus|Passif au présent|Passif au passé|Passif avec verbe modal|Man et formulations impersonnelles|Nominalisation simple',
      'Argumenter avec précision|Concession avec obwohl|Conséquence avec sodass|Cause : wegen et deshalb|Doubles connecteurs sowohl…als auch|Opposition einerseits…andererseits',
      'Affiner les relations verbales|Verbes à préposition|Adverbes pronominaux da- et wo-|Infinitives avec ohne et statt|Ordre des compléments dans le Mittelfeld|Particules modales en interaction'
    ],
    B2: [
      'Rapporter et nuancer|Konjunktiv I au présent|Discours indirect au passé|Substitution par Konjunktiv II|Verbes introducteurs et distance critique|Discours rapporté dans la presse',
      'Hypothèses complexes|Konjunktiv II passé|Condition irréelle au passé|Conditions implicites sans wenn|Concessives selbst wenn|Modalité épistémique avec müssen et können',
      'Compacter un texte|Groupes participiaux présents|Groupes participiaux passés|Nominalisation des subordonnées|Prépositions de style écrit|Composés nominaux et interprétation',
      'Varier les voix|Passif d’action et d’état|Passif impersonnel|Sein et haben avec zu|Sich lassen et adjectifs en -bar|Perspective et agent dans le passif',
      'Assurer la cohésion|Ordre thème-rhème|Reprises anaphoriques|Connecteurs concessifs et restrictifs|Ponctuation des propositions enchâssées|Variations de mise en relief',
      'Adapter le registre|Collocations et verbes supports|Préfixes séparables et inséparables|Modalpartikeln et intention|Registre administratif et courant|Allemand standard en Suisse'
    ],
    C1: [
      'Construire une argumentation dense|Enchâssement de propositions|Portée de la négation|Restrictions et exceptions|Gradation argumentative|Transitions implicites',
      'Maîtriser la modalité|Futur I de conjecture|Futur II de conjecture|Modalité subjective des verbes modaux|Discours indirect et ambiguïté|Prudence scientifique et degrés de certitude',
      'Lire les structures condensées|Attributs participiaux étendus|Appositions complexes|Ellipses syntaxiques|Nominalisations administratives|Dépliage en formulations accessibles',
      'Affiner le style|Collocations académiques|Verbes supports spécialisés|Métaphores conventionnelles|Placement des constituants longs|Rythme et ponctuation expressive',
      'Interpréter les voix|Polyphonie journalistique|Ironie et indices contextuels|Sous-entendus et présuppositions|Marques de subjectivité|Citation et reformulation critique',
      'Varier les usages|Standard suisse et standard allemand|Registres professionnels|Formules institutionnelles|Variation régionale et intelligibilité|Révision stylistique d’un texte long'
    ],
    C2: [
      'Nuances de sens|Synonymes et connotations fines|Ambiguïtés de portée|Expressions idiomatiques contextualisées|Polysémie et jeux de mots|Effets des choix aspectuels',
      'Architecture des textes|Périodes syntaxiques longues|Ruptures et reprises|Progression thématique complexe|Ellipses et économie expressive|Cohésion à longue distance',
      'Style et voix d’auteur|Imitation raisonnée de registres|Rhétorique littéraire|Satire et ironie|Discours libre indirect|Réécriture avec conservation de la voix',
      'Interaction exigeante|Reformulation diplomatique|Désaccord implicite|Réparation subtile d’un malentendu|Gestion de plusieurs interlocuteurs|Humour et limites interculturelles',
      'Précision experte|Terminologie et vulgarisation|Définitions opératoires|Réserves méthodologiques|Sources contradictoires|Synthèse sans perte de nuance',
      'Révision avancée|Diagnostic de calques français|Idiomaticité et naturel|Variantes normatives D-A-CH|Cohérence des temps et perspectives|Relecture critique intégrale'
    ]
  },
  it: {
    A1: [
      'Sons et premiers échanges|Alphabet et épellation|Voyelles et accent tonique|Consonnes doubles|Sons gli, gn, c et g|Intonation déclarative et interrogative',
      'Premières phrases|Pronoms sujets et sujet implicite|Présent de essere et avere|Présent des verbes en -are|Présent des verbes en -ere et -ire|Négation avec non',
      'Nommer et qualifier|Genre des noms|Pluriel des noms|Articles définis|Articles indéfinis|Accord de l’adjectif qualificatif',
      'Parler de sa vie|Verbes andare, fare et stare|Prépositions simples|C’è et ci sono|Possessifs usuels|Nombres, heures et dates',
      'Exprimer ses besoins|Potere, volere et dovere|Piacere au présent|Questions avec chi, che cosa et dove|Démonstratifs questo et quello|Quantités et achats',
      'Organiser une journée|Verbes réfléchis au présent|Adverbes de fréquence|Prépositions articulées fréquentes|Impératif familier régulier|Première approche du passato prossimo'
    ],
    A2: [
      'Raconter le passé|Passato prossimo avec avere|Passato prossimo avec essere|Participes irréguliers fréquents|Accord du participe avec essere|Repères temporels du passé',
      'Décrire une situation|Imperfetto régulier|Imperfetto irrégulier courant|Imperfetto et passato prossimo|Comparatif de supériorité et égalité|Superlatif relatif et absolu',
      'Éviter les répétitions|Pronoms compléments directs|Pronoms compléments indirects|Pronoms avec infinitif|Ci de lieu|Ne de quantité',
      'Projets et demandes|Futuro semplice|Présent à valeur future|Condizionale presente|Demandes avec vorrei et potrei|Obligation et conseil',
      'Relier ses phrases|Relatifs che et cui|Cause avec perché et siccome|Quand et pendant que|But avec per et infinitif|Coordination et ponctuation',
      'Vie pratique|Impératif avec pronoms|Formes de politesse avec Lei|Possessifs et noms de parenté|Indéfinis qualcuno et nessuno|Accord et place des adjectifs'
    ],
    B1: [
      'Temps du récit|Consolidation passato prossimo et imperfetto|Trapassato prossimo|Chronologie et connecteurs|Première reconnaissance du passato remoto|Récit d’une expérience marquante',
      'Exprimer son jugement|Congiuntivo presente régulier|Congiuntivo presente irrégulier|Opinion et doute|Indicatif ou subjonctif après les expressions courantes|Volonté et nécessité',
      'Combiner les pronoms|Pronoms directs et accord du participe|Pronoms doubles|Ci et ne avec verbes fréquents|Verbes pronominaux usuels|Placement à l’impératif et à l’infinitif',
      'Hypothèse et perspective|Période hypothétique réelle|Conditionnel passé|Futur antérieur|Futur de supposition|Discours rapporté simple',
      'Décrire et généraliser|Si impersonnel|Si passivant|Passif avec essere|Gérondif présent|Relatives avec préposition',
      'Argumenter et interagir|Concession avec anche se|Opposition et conséquence|Registre familier ou formel|Connecteurs d’organisation|Reformulation et autocorrection'
    ],
    B2: [
      'Maîtriser le subjonctif|Congiuntivo passato|Congiuntivo imperfetto|Congiuntivo trapassato|Concordance des temps|Subjonctif après conjonctions',
      'Hypothèses et irréel|Hypothèse possible avec se|Hypothèse irréelle au présent|Hypothèse irréelle au passé|Hypothèses mixtes|Souhaits et regrets',
      'Textes et temporalité|Passato remoto régulier|Passato remoto irrégulier|Choix des temps dans le récit|Futur dans le passé|Discours indirect et déictiques',
      'Variation syntaxique|Passif avec venire et andare|Gérondif passé|Participes en propositions réduites|Infinitives explicites et implicites|Phrases clivées',
      'Précision lexicale|Verbes pronominaux idiomatiques|Collocations et dérivation|Faux amis français-italien|Registre journalistique|Connecteurs argumentatifs complexes',
      'Cohérence du discours|Dislocation à gauche|Reprises pronominales|Ponctuation et paragraphes|Atténuation et modalité|Variétés d’italien et usages suisses'
    ],
    C1: [
      'Concordance et perspective|Systèmes temporels complexes|Discours indirect au passé|Subjonctif et distance énonciative|Conditionnel de réserve|Ambiguïtés temporelles',
      'Structures élaborées|Propositions concessives implicites|Gérondif et sujet logique|Incises et appositions|Nominalisation académique|Périodes longues et lisibilité',
      'Argumentation fine|Présuppositions|Restrictions et exceptions|Gradation et réfutation|Connecteurs savants|Mise en relief et focalisation',
      'Lexique et registres|Expressions idiomatiques|Collocations abstraites|Terminologie de spécialité|Registre bureaucratique et reformulation|Italiano neostandard et norme écrite',
      'Voix et interprétation|Ironie contextuelle|Discours libre indirect|Polyphonie dans la presse|Métaphores et connotations|Positionnement de l’auteur',
      'Révision et médiation|Éliminer les calques|Condenser un texte|Expliquer un implicite culturel|Adapter au public|Révision d’une dissertation'
    ],
    C2: [
      'Nuances lexicales|Synonymie et connotations|Polysémie contextuelle|Locutions rares et registre|Jeux de mots|Réseaux de métaphores',
      'Syntaxe expressive|Ordre marqué des constituants|Ellipses littéraires|Rythme de la période|Anacoluthe et intention stylistique|Cohésion de textes complexes',
      'Lecture exigeante|Voix narratives multiples|Allusions culturelles|Ironie et satire|Évolution historique de la langue|Dialecte représenté et italien standard',
      'Interaction experte|Désaccord diplomatique|Négociation complexe|Reformulation instantanée|Humour interculturel|Gestion de l’implicite',
      'Écriture de précision|Essai critique|Vulgarisation scientifique|Argumentation juridique non spécialisée|Synthèse de sources divergentes|Réécriture dans une voix donnée',
      'Autonomie stylistique|Choix normatifs et usages|Révision des faux amis subtils|Équilibre naturel et précision|Adaptation Italie et Suisse italienne|Relecture éditoriale complète'
    ]
  },
  es: {
    A1: [
      'Sons et premiers échanges|Alphabet et épellation|Voyelles et syllabes|Accent tonique et accents écrits|Consonnes r et rr|Intonation et ponctuation interrogative',
      'Premières phrases|Pronoms sujets|Ser et identification|Estar et localisation|Présent des verbes en -ar|Présent des verbes en -er et -ir',
      'Nommer et décrire|Genre et nombre des noms|Articles définis et indéfinis|Accord des adjectifs|Démonstratifs este et ese|Possessifs atones',
      'Vie quotidienne|Tener, ir et hacer|Verbes à diphtongue fréquents|Verbes réfléchis|Heures, dates et nombres|Négation et interrogation',
      'Besoins et préférences|Gustar et pronoms indirects|Hay et estar|Querer et poder|Prépositions a, de et en|Quantités et achats',
      'Commencer à raconter|Ir a et infinitif|Estar et gérondif|Connecteurs y, pero et porque|Introduction au pretérito perfecto|Usages de tú, usted et ustedes'
    ],
    A2: [
      'Parler du passé|Pretérito perfecto composé|Participes irréguliers|Pretérito indefinido régulier|Indefinido irrégulier fréquent|Repères et variation régionale des passés',
      'Décrire et comparer|Imperfecto régulier|Imperfecto de ser, ir et ver|Description et événement|Comparatifs|Superlatifs et intensité',
      'Éviter les répétitions|Compléments directs lo, la, los, las|Compléments indirects le et les|Pronoms doubles avec se|Place des pronoms avec infinitif|Place des pronoms avec gérondif',
      'Projets et conseils|Futur simple|Conditionnel simple|Obligation tener que et hay que|Impératif affirmatif tú|Impératif de politesse courant',
      'Décrire avec précision|Ser ou estar avec adjectif|Por et para : premiers contrastes|Relatif que|Indéfinis et négation double|Possessifs toniques',
      'Échanges du quotidien|Périphrases acabar de et volver a|Depuis et durée avec hace|Conjonctions temporelles simples|Accord et apocope des adjectifs|Demandes et formules de politesse'
    ],
    B1: [
      'Organiser un récit|Contraste indefinido et imperfecto|Pluscuamperfecto|Concordance narrative|Futur de supposition|Connecteurs chronologiques',
      'Exprimer volonté et doute|Subjonctif présent régulier|Subjonctif présent irrégulier|Volonté et sentiment|Doute et opinion négative|Impératif négatif',
      'Relier et expliquer|Subjonctif après para que|Cuando avec futur envisagé|Relatives et antécédent recherché|Cause et conséquence|Concession avec aunque',
      'Préciser le sens|Ser et estar : changement de sens|Por et para : valeurs contrastées|Se impersonnel|Passif réfléchi|Verbes de changement ponerse et hacerse',
      'Rapporter et envisager|Discours indirect au présent|Condition réelle avec si|Conditionnel de conseil|Périphrases seguir et llevar avec gérondif|Pronoms et références dans un texte',
      'Interaction et registre|Marqueurs conversationnels|Politesse et atténuation|Variations tú, vos et usted|Faux amis usuels|Révision d’un texte argumentatif court'
    ],
    B2: [
      'Subjonctif et antériorité|Pretérito perfecto du subjonctif|Imperfecto du subjonctif|Pluscuamperfecto du subjonctif|Concordance des temps|Indicatif ou subjonctif selon l’intention',
      'Hypothèses et regrets|Condition irréelle au présent|Condition irréelle au passé|Hypothèses mixtes|Souhait avec ojalá|Concession hypothétique',
      'Rapporter et nuancer|Discours indirect au passé|Futur et conditionnel de conjecture|Déictiques et transposition|Verbes introducteurs|Distance et source de l’information',
      'Syntaxe élaborée|Relatifs cuyo et el cual|Subordonnées consécutives|Subordonnées modales|Passif avec ser|Structures emphatiques',
      'Lexique et aspect|Périphrases aspectuelles|Verbes de changement : volverse, quedarse et llegar a ser|Idiomes et collocations|Dérivation et familles de mots|Registre journalistique',
      'Cohésion et variation|Connecteurs argumentatifs|Ordre des mots et focalisation|Leísmo et variations pronominales|Variantes Espagne et Amérique|Ponctuation et révision stylistique'
    ],
    C1: [
      'Modalité et prise de position|Alternances modales subtiles|Concession intensive|Restriction et exception|Condition sans si|Modalité et présuppositions',
      'Complexité syntaxique|Subordination enchâssée|Nominalisation académique|Incises et appositions|Infinitives et participiales|Gestion des périodes longues',
      'Aspect et temporalité|Valeurs discursives des temps|Imparfait de politesse et de fiction|Périphrases aspectuelles complexes|Discours libre indirect|Cohérence temporelle d’un essai',
      'Précision lexicale|Collocations abstraites|Locutions et niveau de langue|Métaphores conventionnelles|Connotations et euphémismes|Terminologie et paraphrase',
      'Pragmatique avancée|Implicite et ironie|Atténuation et désaccord|Polyphonie argumentative|Marqueurs de reformulation|Adaptation interculturelle',
      'Écriture et médiation|Synthèse de plusieurs sources|Réfutation structurée|Vulgarisation|Révision des calques français|Norme panhispanique et variation'
    ],
    C2: [
      'Nuances extrêmes|Polysémie et ambiguïté|Synonymes et effets de registre|Expressions figurées peu fréquentes|Humour et jeux de mots|Allusions culturelles',
      'Style et architecture|Ordre marqué et focalisation|Ellipses et ruptures stylistiques|Périodes complexes|Rythme et ponctuation expressive|Cohésion globale',
      'Voix et littérature|Narrateurs et focalisations|Discours libre indirect subtil|Satire et ironie|Intertextualité|Réécriture avec contraintes de style',
      'Interaction de haut niveau|Négociation diplomatique|Désaccord implicite|Réparation d’un malentendu complexe|Adaptation rapide au registre|Médiation entre perspectives opposées',
      'Précision intellectuelle|Définition de concepts abstraits|Synthèse critique contradictoire|Argumentation sans ambiguïté|Vulgarisation de textes spécialisés|Distinction fait, interprétation et jugement',
      'Autonomie éditoriale|Choix normatifs et variantes|Révision de l’idiomaticité|Espagnol pluricentrique|Traduction critique et reformulation|Relecture d’un dossier long'
    ]
  }
};

const PRACTICE: Record<CefrLevel, string[]> = {
  A1: [
    'Se présenter et rencontrer|Saluer et prendre congé|Donner son identité|Présenter sa famille|Décrire une personne|Demander de répéter',
    'Lire dans la vie quotidienne|Repérer une information sur une affiche|Lire un horaire|Comprendre un menu|Suivre une consigne courte|Identifier prix et quantités',
    'Écouter et comprendre|Reconnaître des nombres entendus|Comprendre une présentation lente|Repérer un lieu annoncé|Identifier une heure de rendez-vous|Comprendre une demande simple',
    'Parler et interagir|Commander une boisson|Acheter un billet|Demander son chemin|Fixer un rendez-vous|Exprimer ses goûts',
    'Écrire et transmettre|Remplir un formulaire|Écrire une présentation|Envoyer un message court|Décrire son logement|Transmettre une information pratique',
    'Projet et bilan|Préparer un séjour court|Construire un dialogue guidé|Enregistrer sa présentation|Rédiger une carte personnelle|Faire le bilan de ses acquis'
  ],
  A2: [
    'Expériences et projets|Raconter son week-end|Décrire une habitude passée|Présenter un projet|Comparer deux lieux|Expliquer une préférence',
    'Lire pour agir|Comprendre une annonce de logement|Lire une invitation|Comprendre une lettre personnelle|Repérer une règle pratique|Comparer des offres simples',
    'Écouter des situations courantes|Comprendre une annonce de transport|Suivre un échange commercial|Repérer les étapes d’un itinéraire|Comprendre un récit bref|Prendre des notes pratiques',
    'Interagir avec autonomie|Réserver un hébergement|Signaler un problème|Demander un service|Inviter et répondre|Participer à un échange sur ses loisirs',
    'Écrire et expliquer|Rédiger un courriel personnel|Raconter une sortie|Décrire un changement|Laisser des instructions simples|Reformuler un message pour un proche',
    'Projet et bilan|Organiser une excursion|Présenter un budget simple|Négocier un programme de groupe|Rédiger un carnet de voyage|Évaluer compréhension et expression'
  ],
  B1: [
    'Récits et opinions|Raconter une expérience structurée|Décrire une difficulté surmontée|Exprimer un avis motivé|Expliquer un projet d’études|Comparer des modes de vie',
    'Lire de façon autonome|Identifier le point de vue d’un article|Suivre un récit contemporain|Distinguer faits et opinions|Inférer un mot du contexte|Résumer les idées principales',
    'Écouter et prendre des notes|Suivre un entretien clair|Comprendre un reportage accessible|Identifier raisons et conséquences|Suivre les grandes lignes d’un exposé|Vérifier une information mal entendue',
    'Discuter et résoudre|Participer à un débat familier|Négocier une décision|Expliquer un incident|Réagir à une objection|Reformuler pour lever un malentendu',
    'Écrire et servir d’intermédiaire|Rédiger une lettre de motivation simple|Organiser un texte d’opinion|Résumer un article accessible|Transmettre des consignes détaillées|Expliquer une particularité culturelle',
    'Projet et bilan|Enquêter sur un sujet local|Préparer un exposé documenté|Répondre à des questions spontanées|Rédiger un compte rendu|Construire son plan de progression'
  ],
  B2: [
    'Débats et société|Défendre une thèse|Comparer des arguments|Discuter un enjeu environnemental|Analyser un problème de société|Nuancer une recommandation',
    'Lecture critique|Identifier la structure d’un éditorial|Comparer deux articles|Lire une nouvelle littéraire|Repérer un biais argumentatif|Synthétiser un dossier documentaire',
    'Écoute approfondie|Suivre une conférence accessible|Comprendre une interview spontanée|Repérer le ton et l’intention|Comparer deux points de vue entendus|Restituer les étapes d’un raisonnement',
    'Interaction élaborée|Conduire un entretien|Participer à une discussion contradictoire|Défendre un projet collectif|Répondre à une critique|Adapter son discours à son interlocuteur',
    'Écriture et médiation|Rédiger un essai argumenté|Écrire une réclamation formelle|Produire un rapport clair|Expliquer un graphique|Reformuler un texte pour un autre public',
    'Projet et bilan|Constituer un dossier thématique|Présenter une analyse de sources|Animer une table ronde|Rédiger une synthèse comparative|Évaluer séparément les compétences'
  ],
  C1: [
    'Pensée et argumentation|Construire une problématique|Hiérarchiser des arguments complexes|Anticiper une objection|Articuler plusieurs perspectives|Conclure sans simplification abusive',
    'Lecture exigeante|Lire un essai long|Interpréter un implicite|Analyser la voix d’un auteur|Comparer des cadres théoriques|Produire une lecture critique',
    'Écoute longue|Suivre un cours universitaire|Repérer digressions et reprises|Interpréter des allusions|Comprendre une discussion à plusieurs voix|Synthétiser des notes d’écoute',
    'Interaction souple|Conduire un débat complexe|Négocier un compromis|Reformuler une objection délicate|Adapter spontanément le registre|Présenter un sujet sans notes détaillées',
    'Écriture et médiation avancées|Rédiger une dissertation structurée|Synthétiser un corpus|Vulgariser une analyse|Rédiger un rapport professionnel|Faciliter une discussion interculturelle',
    'Projet et bilan|Mener une recherche documentaire|Préparer une conférence|Soutenir ses conclusions|Réviser un dossier long|Établir un portfolio de compétences'
  ],
  C2: [
    'Analyse et création|Formuler une thèse originale|Articuler des nuances contradictoires|Analyser une stratégie rhétorique|Construire une critique étayée|Transformer une contrainte en choix expressif',
    'Lecture experte|Interpréter un texte dense|Comparer des styles d’auteur|Analyser une satire|Distinguer plusieurs niveaux de lecture|Synthétiser sans perdre les nuances',
    'Écoute experte|Suivre un débat rapide|Interpréter humour et sous-entendus|Comprendre des variations d’accent|Reconstituer un raisonnement fragmenté|Comparer discours prononcé et transcription',
    'Interaction précise|Improviser une intervention longue|Négocier dans une situation sensible|Faciliter un échange conflictuel|Ajuster finement ton et registre|Répondre à une question imprévue complexe',
    'Écriture et médiation expertes|Rédiger une synthèse critique dense|Réécrire pour plusieurs publics|Produire un texte créatif contraint|Expliquer une controverse spécialisée|Restituer fidèlement plusieurs voix',
    'Projet et bilan|Concevoir un dossier éditorial|Présenter une conférence avec discussion|Réviser un texte pour publication|Justifier ses choix stylistiques|Évaluer son autonomie et ses limites'
  ]
};

export function createModernLanguageSubject(language: ModernLanguage, level: CefrLevel, subjectId?: string): Subject {
  const info = MODERN_LANGUAGES[language];
  const id = subjectId ?? `${info.slug}-${level.toLowerCase()}`;
  const rows = [...STRUCTURES[language][level], ...PRACTICE[level]];
  return {
    id, name: `${info.name} ${level}`, shortName: info.name, teacher: 'Tuteur IA', room: 'Espace langues',
    color: '#4b68bc', accent: '#edf1fb', icon: 'book', domain: 'Langues', period: 'Annuel', chapterCount: rows.length,
    languageCode: language, languageName: info.name, cefrLevel: level,
    objective: `Développer compréhension écrite et orale, expression, interaction et médiation en ${info.name.toLowerCase()} au niveau ${level}. Parcours original avec travail sur ${info.culture}.`,
    validation: 'Évaluer séparément lecture, écoute, expression écrite, expression orale et interaction ; un résultat écrit seul ne valide pas les compétences orales.',
    modules: [0, 1].map(semester => ({
      id: `${id}-s${semester + 1}`, period: `Semestre ${semester + 1}`, title: semester === 0 ? 'Structures et précision linguistique' : 'Communication, culture et projets', cefrLevel: level,
      items: rows.slice(semester * 6, semester * 6 + 6).map((row, index) => {
        const [title, ...notions] = row.split('|'); const chapterId = `${id}-ch${semester * 6 + index + 1}`;
        return { id: chapterId, title, completed: false,
          description: `Travail en ${info.name.toLowerCase()}, niveau ${level}. Alterner cours explicite, exemples commentés, entraînement autonome et bilan. Pour l’oral, utiliser un document sonore et une production réellement écoutée.`,
          lessons: notions.map((notion, n) => ({ id: `${chapterId}-l${n + 1}`, title: notion, completed: false,
            objective: `Travailler « ${notion} » en ${info.name.toLowerCase()} au niveau ${level} : comprendre le fonctionnement dans un contexte, analyser des exemples, produire une réponse personnelle et justifier ou corriger ses choix. Adapter les exemples à ${info.culture} sans confondre variantes régionales et erreurs.` })) };
      })
    }))
  };
}
