import type {
  CefrLevel,
  LessonUnit,
  ProgramItem,
  ProgramModule,
  Subject
} from "../types";

export type { CefrLevel } from "../types";

export const CEFR_LEVELS = [
  "A1",
  "A2",
  "B1",
  "B2",
  "C1",
  "C2"
] as const satisfies readonly CefrLevel[];

export const CEFR_LEVEL_ORDER: readonly CefrLevel[] = CEFR_LEVELS;

export interface EnglishLevelOption {
  value: CefrLevel;
  label: string;
  description: string;
}

export const ENGLISH_LEVEL_OPTIONS: readonly EnglishLevelOption[] = [
  {
    value: "A1",
    label: "A1 · Premiers échanges",
    description: "Débuter et participer à des échanges très simples du quotidien."
  },
  {
    value: "A2",
    label: "A2 · Autonomie quotidienne",
    description: "Gérer les situations courantes et décrire son environnement."
  },
  {
    value: "B1",
    label: "B1 · Communication indépendante",
    description: "Communiquer avec autonomie et relier ses idées sur des sujets familiers."
  },
  {
    value: "B2",
    label: "B2 · Communication élaborée",
    description: "Échanger avec aisance, expliquer et défendre un point de vue."
  },
  {
    value: "C1",
    label: "C1 · Usage avancé",
    description: "S’exprimer avec souplesse dans des situations longues et complexes."
  },
  {
    value: "C2",
    label: "C2 · Maîtrise et nuance",
    description: "Comprendre, synthétiser et nuancer avec une très grande précision."
  }
] as const;

type NotionDefinition = readonly [title: string, objective: string];

interface ChapterDefinition {
  title: string;
  notions: readonly NotionDefinition[];
}

interface LevelDefinition {
  objective: string;
  semesterTitles: readonly [string, string];
  semesters: readonly [
    readonly ChapterDefinition[],
    readonly ChapterDefinition[]
  ];
}

const chapter = (
  title: string,
  notions: readonly NotionDefinition[]
): ChapterDefinition => ({ title, notions });

const CURRICULUM: Readonly<Record<CefrLevel, LevelDefinition>> = {
  A1: {
    objective:
      "Construire les premiers échanges en anglais pour répondre à des besoins concrets et familiers.",
    semesterTitles: ["Fondations du quotidien", "Premières situations autonomes"],
    semesters: [
      [
        chapter("Entrer en contact", [
          [
            "Saluer et prendre congé",
            "Choisir une salutation, une formule de politesse et une prise de congé adaptées à une rencontre simple."
          ],
          [
            "Pronoms sujets et verbe be",
            "Construire des phrases affirmatives élémentaires avec les pronoms sujets et le verbe be."
          ],
          [
            "Questions et négation avec be",
            "Poser une question personnelle simple et y répondre positivement ou négativement avec be."
          ],
          [
            "Alphabet et épellation",
            "Épeler un nom, reconnaître les lettres entendues et vérifier une information lettre par lettre."
          ],
          [
            "Noms, pays et sons essentiels",
            "Donner son nom et son pays avec une articulation suffisamment claire pour être compris."
          ]
        ]),
        chapter("Moi et mon entourage", [
          [
            "Famille et relations proches",
            "Nommer les membres de son entourage et expliquer une relation avec des phrases très simples."
          ],
          [
            "Adjectifs possessifs et génitif",
            "Indiquer à qui appartient une personne ou une chose avec les possessifs et le génitif en s."
          ],
          [
            "Avoir et posséder",
            "Décrire ce que soi-même ou une autre personne possède avec have, has et have got."
          ],
          [
            "Articles, pluriels et démonstratifs",
            "Identifier un objet proche ou éloigné en choisissant article, singulier, pluriel et démonstratif."
          ],
          [
            "Portrait personnel très simple",
            "Présenter une personne à partir de quelques informations et adjectifs physiques ou personnels."
          ]
        ]),
        chapter("Une journée ordinaire", [
          [
            "Verbes des activités quotidiennes",
            "Comprendre et employer les verbes fréquents qui décrivent une routine journalière."
          ],
          [
            "Présent simple affirmatif",
            "Décrire ses habitudes et celles d’une autre personne en formant correctement le présent simple."
          ],
          [
            "Questions avec do et does",
            "Interroger quelqu’un sur ses habitudes et former des réponses courtes au présent simple."
          ],
          [
            "Heures, jours et prépositions",
            "Indiquer précisément un horaire ou un jour avec les prépositions temporelles usuelles."
          ],
          [
            "Fréquence et rythme de phrase",
            "Placer un adverbe de fréquence et accentuer les mots importants d’une phrase de routine."
          ]
        ]),
        chapter("Chez moi et autour", [
          [
            "Pièces, objets et lieux de la ville",
            "Nommer les espaces courants d’un logement et les principaux lieux d’un quartier."
          ],
          [
            "There is et there are",
            "Signaler la présence ou l’absence d’une chose dans un lieu avec there is et there are."
          ],
          [
            "Prépositions de lieu",
            "Situer un objet ou un endroit par rapport à un autre avec les prépositions de base."
          ],
          [
            "Impératifs et directions",
            "Comprendre et donner une suite courte d’instructions pour se déplacer."
          ],
          [
            "Lire un plan et relayer un trajet",
            "Extraire un itinéraire simple d’un plan puis l’expliquer à une autre personne."
          ]
        ]),
        chapter("Manger et choisir", [
          [
            "Aliments, boissons et goûts",
            "Nommer des aliments courants et exprimer simplement ses goûts et préférences."
          ],
          [
            "Noms dénombrables et indénombrables",
            "Distinguer ce qui se compte de ce qui se mesure dans un contexte alimentaire."
          ],
          [
            "Some, any, much et many",
            "Demander ou préciser une quantité en choisissant le déterminant quantitatif adapté."
          ],
          [
            "Commander avec would like",
            "Formuler une commande courte et polie puis répondre à une question de service."
          ],
          [
            "Nombres, prix et achat",
            "Comprendre un prix, vérifier une quantité et mener un échange très simple en magasin."
          ]
        ]),
        chapter("Dates et projets proches", [
          [
            "Calendrier et rendez-vous",
            "Comprendre et donner une date, une heure et un lieu de rendez-vous."
          ],
          [
            "Présent continu en cours",
            "Décrire une action visible qui se déroule au moment où l’on parle."
          ],
          [
            "Présent continu pour un arrangement",
            "Annoncer un arrangement personnel déjà fixé dans un avenir proche."
          ],
          [
            "Intentions avec going to",
            "Exprimer une intention simple et demander à quelqu’un ce qu’il prévoit de faire."
          ],
          [
            "Inviter, accepter et refuser",
            "Proposer une activité et répondre poliment en utilisant une intonation compréhensible."
          ]
        ])
      ],
      [
        chapter("Décrire ce qui se passe", [
          [
            "Actions, vêtements et météo",
            "Mobiliser le vocabulaire nécessaire pour commenter une scène quotidienne visible."
          ],
          [
            "Présent simple ou présent continu",
            "Choisir entre une habitude et une action temporaire selon la situation décrite."
          ],
          [
            "Pronoms compléments",
            "Remplacer une personne ou une chose déjà nommée par le pronom complément approprié."
          ],
          [
            "Adjectifs et intensifieurs simples",
            "Enrichir une description courte avec un adjectif et un degré élémentaire d’intensité."
          ],
          [
            "Décrire une image en ligne",
            "Publier ou transmettre quelques phrases ordonnées à propos d’une image familière."
          ]
        ]),
        chapter("Parler d’hier", [
          [
            "Passé du verbe be",
            "Situer une personne ou une situation passée avec was, were et leurs formes négatives."
          ],
          [
            "Passé régulier et terminaison ed",
            "Former des verbes réguliers au passé et rendre leurs terminaisons intelligibles."
          ],
          [
            "Verbes irréguliers fréquents",
            "Employer les formes passées des verbes indispensables pour raconter une activité."
          ],
          [
            "Questions et négation avec did",
            "Demander ce qui s’est passé et répondre avec une forme passée affirmative ou négative."
          ],
          [
            "Récit chronologique court",
            "Relier trois ou quatre événements passés avec des marqueurs chronologiques simples."
          ]
        ]),
        chapter("Se déplacer", [
          [
            "Transports et billets",
            "Identifier les transports, destinations, horaires et informations essentielles d’un billet."
          ],
          [
            "Capacité avec can et can’t",
            "Dire ce qu’une personne peut ou ne peut pas faire dans une situation pratique."
          ],
          [
            "Demandes avec can et could",
            "Demander une information ou un service avec une formulation simple et polie."
          ],
          [
            "Mouvement et destination",
            "Décrire un déplacement avec les prépositions et verbes de mouvement les plus courants."
          ],
          [
            "Annonces et clarification",
            "Repérer heure, quai ou destination dans une annonce et demander de répéter si nécessaire."
          ]
        ]),
        chapter("Besoins et petits problèmes", [
          [
            "Corps, états et besoins",
            "Nommer un état physique courant et indiquer clairement ce dont on a besoin."
          ],
          [
            "Problèmes courants avec have got",
            "Signaler un problème personnel ou matériel avec une structure courte et naturelle."
          ],
          [
            "Consignes et avertissements",
            "Comprendre puis produire une consigne positive ou négative liée à la sécurité."
          ],
          [
            "Demander aide ou répétition",
            "Signaler une incompréhension et solliciter une aide, une répétition ou une épellation."
          ],
          [
            "Expliquer un problème simple",
            "Présenter les informations essentielles d’un problème à une personne chargée d’aider."
          ]
        ]),
        chapter("Comparer et préférer", [
          [
            "Adjectifs descriptifs et contraires",
            "Choisir des adjectifs usuels pour caractériser deux personnes, objets ou lieux."
          ],
          [
            "Formes comparatives",
            "Comparer deux éléments avec une forme régulière ou irrégulière fréquente."
          ],
          [
            "Formes superlatives",
            "Identifier un élément remarquable dans un petit groupe avec le superlatif."
          ],
          [
            "Préférences avec verbe en ing",
            "Exprimer ce que l’on aime ou déteste faire avec like, love et hate."
          ],
          [
            "Justifier avec and, but et because",
            "Relier des idées très simples afin d’expliquer un choix ou une préférence."
          ]
        ]),
        chapter("Ma vie en anglais", [
          [
            "Remplir un formulaire personnel",
            "Lire des rubriques usuelles et fournir correctement ses informations essentielles."
          ],
          [
            "Écrire un message personnel",
            "Rédiger un court message donnant une nouvelle, une date ou une invitation."
          ],
          [
            "Présenter son quotidien à l’oral",
            "Préparer puis livrer une présentation très courte sur sa vie et ses habitudes."
          ],
          [
            "Articulation, accentuation et intonation",
            "Mobiliser les acquis phonologiques du niveau pour rester intelligible dans un court discours."
          ],
          [
            "Présenter quelqu’un à un tiers",
            "Sélectionner puis relayer les informations utiles d’un profil personnel simple."
          ]
        ])
      ]
    ]
  },
  A2: {
    objective:
      "Gérer les échanges routiniers, décrire son environnement et relier des informations simples.",
    semesterTitles: ["Situations familières", "Expériences et projets"],
    semesters: [
      [
        chapter("Reprendre contact avec précision", [
          [
            "Questions personnelles développées",
            "Former des questions variées pour obtenir des détails sur une personne et ses activités."
          ],
          [
            "Consolider les temps du présent",
            "Choisir le présent simple ou continu pour décrire habitudes, états et actions temporaires."
          ],
          [
            "Parler du travail et des loisirs",
            "Échanger des informations simples sur une activité professionnelle, scolaire ou de loisir."
          ],
          [
            "Entretenir une petite conversation",
            "Commencer, poursuivre brièvement et terminer poliment une conversation familière."
          ],
          [
            "Contractions et enchaînements",
            "Reconnaître et produire les contractions fréquentes dans un débit lent mais naturel."
          ]
        ]),
        chapter("Habiter et se repérer", [
          [
            "Logement et quartier",
            "Décrire les caractéristiques principales d’un logement et de son environnement proche."
          ],
          [
            "Choisir les articles",
            "Employer a, an, the ou l’absence d’article dans des descriptions quotidiennes."
          ],
          [
            "Quantités et contenants",
            "Préciser une quantité avec les noms, déterminants et contenants adaptés."
          ],
          [
            "Comparer des lieux",
            "Comparer plusieurs logements ou quartiers et exprimer une préférence motivée."
          ],
          [
            "Produire un guide local",
            "Organiser des informations pratiques pour guider un visiteur dans un quartier familier."
          ]
        ]),
        chapter("Raconter un incident", [
          [
            "Passé simple et passé continu",
            "Distinguer l’action principale du contexte en cours dans un récit passé."
          ],
          [
            "When et while",
            "Relier deux événements passés en montrant leur succession ou leur simultanéité."
          ],
          [
            "Étapes d’un récit",
            "Ordonner un récit bref avec des connecteurs chronologiques clairs."
          ],
          [
            "Émotions et réactions",
            "Décrire simplement ce qu’une personne a ressenti face à un événement."
          ],
          [
            "Écouter puis reformuler",
            "Repérer les faits essentiels d’une anecdote claire et les transmettre dans l’ordre."
          ]
        ]),
        chapter("Voyager sans stress", [
          [
            "Voyage et services",
            "Mobiliser le vocabulaire utile dans une gare, un hôtel ou un lieu touristique."
          ],
          [
            "Prépositions de mouvement",
            "Expliquer un trajet en combinant correctement direction, origine et destination."
          ],
          [
            "Instructions en plusieurs étapes",
            "Comprendre puis donner une procédure courte dans un ordre logique."
          ],
          [
            "Demandes polies en voyage",
            "Obtenir une information ou une aide avec can, could et les formules de service."
          ],
          [
            "Annonces et changements",
            "Extraire d’une annonce claire les modifications utiles puis les relayer à un compagnon."
          ]
        ]),
        chapter("Étudier et travailler", [
          [
            "Études, métiers et compétences",
            "Décrire simplement une formation, un poste et les compétences qu’ils demandent."
          ],
          [
            "Obligation avec have to",
            "Exprimer une obligation ou son absence dans une routine scolaire ou professionnelle."
          ],
          [
            "Capacités avec can et could",
            "Présenter ses capacités actuelles et passées dans un contexte concret."
          ],
          [
            "Gérondif ou infinitif fréquent",
            "Employer les constructions usuelles après like, want et would like."
          ],
          [
            "Profil scolaire ou professionnel",
            "Compléter puis expliquer les rubriques essentielles d’un profil de candidature simple."
          ]
        ]),
        chapter("Habitudes et santé", [
          [
            "Alimentation et activité physique",
            "Décrire ses habitudes de santé avec un vocabulaire quotidien précis."
          ],
          [
            "Quantifieurs alimentaires",
            "Comparer des habitudes en utilisant correctement quantité, fréquence et mesure."
          ],
          [
            "Conseils avec should",
            "Donner et recevoir un conseil simple avec should et shouldn’t."
          ],
          [
            "Conditionnel zéro",
            "Exprimer une conséquence générale ou prévisible liée à une habitude."
          ],
          [
            "Rendez-vous et conseil pratique",
            "Expliquer un besoin courant et comprendre les principales recommandations reçues."
          ]
        ])
      ],
      [
        chapter("Expériences vécues", [
          [
            "Present perfect avec ever et never",
            "Demander et dire si une expérience a déjà eu lieu sans préciser de date."
          ],
          [
            "Been et gone",
            "Distinguer une expérience terminée d’un déplacement dont la personne n’est pas revenue."
          ],
          [
            "Just, already et yet",
            "Situer une action récente ou attendue par rapport au moment présent."
          ],
          [
            "Present perfect ou passé simple",
            "Choisir le temps adapté selon que le moment passé est précisé ou non."
          ],
          [
            "Interroger sur une expérience",
            "Mener un bref entretien puis restituer les expériences les plus importantes."
          ]
        ]),
        chapter("Organiser l’avenir", [
          [
            "Will pour décision et prédiction",
            "Exprimer une décision immédiate ou une prédiction simple avec will."
          ],
          [
            "Going to pour une intention",
            "Présenter un projet décidé et les indices qui annoncent un événement."
          ],
          [
            "Présent continu pour un arrangement",
            "Décrire un engagement futur dont l’heure ou le lieu est déjà convenu."
          ],
          [
            "Repères temporels du futur",
            "Ordonner plusieurs actions futures avec des expressions de temps claires."
          ],
          [
            "Construire un calendrier commun",
            "Comparer des disponibilités et parvenir à un arrangement dans un échange simple."
          ]
        ]),
        chapter("Acheter et résoudre", [
          [
            "Commerces, produits et services",
            "Identifier les informations utiles pour choisir un produit ou un service courant."
          ],
          [
            "Quantité, prix et comparaison",
            "Comparer prix, tailles et quantités afin de justifier un achat."
          ],
          [
            "Réclamation polie",
            "Signaler un défaut, demander une solution et répondre avec des formes polies."
          ],
          [
            "Phrasal verbs fréquents",
            "Comprendre et employer quelques verbes à particule liés aux services quotidiens."
          ],
          [
            "Relayer une facture ou une consigne",
            "Sélectionner les données importantes d’un reçu ou d’une instruction pour les expliquer."
          ]
        ]),
        chapter("Si les choses changent", [
          [
            "Conditionnel zéro consolidé",
            "Présenter un résultat habituel lorsque la même condition se reproduit."
          ],
          [
            "Premier conditionnel",
            "Décrire une conséquence future probable à partir d’une condition réaliste."
          ],
          [
            "Exprimer une possibilité",
            "Nuancer un projet avec les marqueurs simples de possibilité et de probabilité."
          ],
          [
            "Cause et résultat avec because et so",
            "Relier clairement la cause d’un problème à son résultat."
          ],
          [
            "Comparer deux solutions",
            "Discuter les conséquences de deux options et convenir d’un plan réalisable."
          ]
        ]),
        chapter("Personnes et relations", [
          [
            "Apparence et personnalité",
            "Décrire une personne avec des adjectifs physiques et comportementaux appropriés."
          ],
          [
            "Adjectifs de sentiments",
            "Distinguer la cause d’une émotion de l’état ressenti dans une situation familière."
          ],
          [
            "Possessifs et réfléchis",
            "Choisir entre adjectif possessif, pronom possessif et pronom réfléchi."
          ],
          [
            "Invitations et excuses",
            "Inviter, modifier un projet ou présenter une excuse de manière socialement adaptée."
          ],
          [
            "Montrer son intérêt à l’oral",
            "Utiliser questions de suivi et intonation pour encourager un interlocuteur à poursuivre."
          ]
        ]),
        chapter("Mon guide pratique", [
          [
            "Notes et messages utiles",
            "Rédiger une note brève qui transmet sans ambiguïté les informations essentielles."
          ],
          [
            "Courriel personnel organisé",
            "Structurer un courriel court avec ouverture, nouvelles, demande et conclusion."
          ],
          [
            "Expliquer une procédure",
            "Présenter une procédure quotidienne avec des verbes précis et des étapes ordonnées."
          ],
          [
            "Interaction en ligne simple",
            "Participer à un échange en ligne familier en réagissant et en demandant une précision."
          ],
          [
            "Présentation pratique intégrée",
            "Combiner informations lues et entendues pour présenter une solution concrète."
          ]
        ])
      ]
    ]
  },
  B1: {
    objective:
      "Communiquer de façon indépendante sur les sujets familiers, raconter et expliquer ses choix.",
    semesterTitles: ["Récits et vie active", "Opinion et autonomie"],
    semesters: [
      [
        chapter("Récits en perspective", [
          [
            "Passé simple, continu et parfait",
            "Organiser arrière-plan, événements et antériorité dans un récit compréhensible."
          ],
          [
            "Connecteurs narratifs",
            "Relier les étapes d’une histoire en marquant succession, rupture et conséquence."
          ],
          [
            "Prononciation des formes passées",
            "Produire terminaisons, formes faibles et groupes rythmiques sans gêner la compréhension."
          ],
          [
            "Raconter puis reformuler",
            "Adapter un récit personnel après une demande de précision ou un malentendu."
          ],
          [
            "Réagir à un récit créatif",
            "Résumer une histoire accessible et expliquer sa réaction personnelle."
          ]
        ]),
        chapter("Temps, expérience et évolution", [
          [
            "Present perfect ou passé",
            "Relier correctement une expérience passée à la situation présente."
          ],
          [
            "Present perfect continu",
            "Mettre l’accent sur la durée ou l’activité d’une situation commencée auparavant."
          ],
          [
            "Depuis avec since et for",
            "Mesurer une durée ou indiquer son point de départ sans confondre les deux marqueurs."
          ],
          [
            "Habitudes passées avec used to",
            "Comparer une ancienne habitude ou situation à la réalité actuelle."
          ],
          [
            "Expliquer une chronologie",
            "Transformer dates et événements en une présentation cohérente d’une évolution."
          ]
        ]),
        chapter("Voyager et s’adapter", [
          [
            "Services et imprévus de voyage",
            "Gérer un changement, une erreur ou un besoin inhabituel pendant un déplacement."
          ],
          [
            "Obligation, interdiction et conseil",
            "Distinguer règle, nécessité, absence d’obligation et recommandation."
          ],
          [
            "Questions indirectes",
            "Demander une information détaillée avec une formulation polie et syntaxiquement correcte."
          ],
          [
            "Propositions relatives",
            "Ajouter une précision utile sur une personne, un lieu ou un objet sans répéter."
          ],
          [
            "Médiation d’un malentendu culturel",
            "Expliquer simplement deux habitudes différentes et proposer une solution respectueuse."
          ]
        ]),
        chapter("Actualité en clair", [
          [
            "Lexique et collocations des médias",
            "Comprendre et employer les associations de mots fréquentes d’une actualité accessible."
          ],
          [
            "Passif simple",
            "Mettre l’information ou le résultat au premier plan lorsque l’auteur est secondaire."
          ],
          [
            "Discours rapporté",
            "Rapporter une déclaration en adaptant pronoms, repères et temps essentiels."
          ],
          [
            "Distinguer fait et opinion",
            "Repérer dans un article clair ce qui est vérifiable et ce qui relève d’un jugement."
          ],
          [
            "Résumer une actualité",
            "Transmettre le sujet, les faits principaux et la source sans ajouter d’information."
          ]
        ]),
        chapter("Études, travail et projets", [
          [
            "Lexique scolaire et professionnel",
            "Décrire responsabilités, compétences, objectifs et étapes d’un projet familier."
          ],
          [
            "Choisir une forme du futur",
            "Distinguer arrangement, intention, décision et prédiction dans un projet."
          ],
          [
            "Futur continu",
            "Décrire une activité qui sera en cours à un moment futur déterminé."
          ],
          [
            "Demande formelle d’information",
            "Rédiger un message courtois pour obtenir des informations scolaires ou professionnelles."
          ],
          [
            "Réunion et téléphone",
            "Suivre un échange professionnel clair, prendre la parole et confirmer les décisions."
          ]
        ]),
        chapter("Choix et conséquences", [
          [
            "Deuxième conditionnel",
            "Explorer une hypothèse peu probable et ses conséquences présentes ou futures."
          ],
          [
            "Troisième conditionnel",
            "Imaginer comment un résultat passé aurait changé dans une autre situation."
          ],
          [
            "Probabilité et déduction",
            "Formuler une conclusion prudente à partir d’indices avec les modaux adaptés."
          ],
          [
            "Cause, effet et contraste",
            "Structurer une explication en distinguant cause, conséquence et opposition."
          ],
          [
            "Négocier une décision",
            "Comparer des options, exprimer des réserves et parvenir à un accord pratique."
          ]
        ])
      ],
      [
        chapter("Relations et paroles rapportées", [
          [
            "Questions et ordres rapportés",
            "Transmettre une question ou une consigne en modifiant correctement sa structure."
          ],
          [
            "Question tags",
            "Chercher confirmation ou accord avec la forme et l’intonation appropriées."
          ],
          [
            "Décrire émotions et réactions",
            "Exprimer avec précision raisonnable l’évolution d’une émotion dans une relation."
          ],
          [
            "Désaccord et réparation",
            "Manifester un désaccord poli, vérifier la compréhension et reformuler si nécessaire."
          ],
          [
            "Relayer une conversation",
            "Résumer avec neutralité les positions et décisions d’un échange familier."
          ]
        ]),
        chapter("Santé, habitudes et décisions", [
          [
            "Conseils passés avec should have",
            "Évaluer après coup une décision et proposer ce qui aurait été préférable."
          ],
          [
            "Possibilités passées avec might have",
            "Émettre une hypothèse prudente sur la cause d’un événement passé."
          ],
          [
            "Obligation et nécessité",
            "Nuancer obligation personnelle, règle externe et absence de nécessité."
          ],
          [
            "Collocations de santé",
            "Employer les associations lexicales courantes pour parler d’habitudes et de soins."
          ],
          [
            "Texte problème–solution",
            "Présenter un problème de santé courant et organiser plusieurs recommandations."
          ]
        ]),
        chapter("Technologie en pratique", [
          [
            "Phrasal verbs technologiques",
            "Employer les verbes à particule courants pour installer, démarrer ou dépanner."
          ],
          [
            "Passif des procédures",
            "Décrire les étapes d’un processus lorsque l’action importe plus que son auteur."
          ],
          [
            "Relatives pour préciser",
            "Définir une fonction, un appareil ou un utilisateur avec une proposition relative."
          ],
          [
            "Comprendre une assistance technique",
            "Repérer problème, vérifications et solution dans des instructions orales claires."
          ],
          [
            "Expliquer un processus à un novice",
            "Simplifier une procédure et vérifier que l’interlocuteur peut la suivre."
          ]
        ]),
        chapter("Culture à commenter", [
          [
            "Livres, films et arts",
            "Mobiliser un lexique varié pour décrire une œuvre et son expérience."
          ],
          [
            "Adjectifs, adverbes et intensité",
            "Nuancer une appréciation avec des modifieurs adaptés plutôt qu’un jugement vague."
          ],
          [
            "Structure d’une critique",
            "Organiser résumé, appréciation, justification et recommandation dans une critique."
          ],
          [
            "Ton et attitude",
            "Identifier l’attitude générale d’un auteur ou d’un intervenant à partir d’indices clairs."
          ],
          [
            "Réponse personnelle à une œuvre",
            "Relier certains éléments d’une œuvre à sa propre interprétation et la justifier."
          ]
        ]),
        chapter("Construire son opinion", [
          [
            "Affirmation, raison et exemple",
            "Développer une opinion en articulant clairement thèse, justification et illustration."
          ],
          [
            "Rapporter une opinion",
            "Présenter fidèlement le point de vue d’une source avant de le commenter."
          ],
          [
            "Nuancer par l’hypothèse",
            "Utiliser conditions et modaux pour éviter une affirmation excessivement catégorique."
          ],
          [
            "Prise de parole et désaccord",
            "Entrer dans une discussion, conserver son tour et contester une idée avec courtoisie."
          ],
          [
            "Argument bref structuré",
            "Produire un texte ou discours connecté qui défend une position compréhensible."
          ]
        ]),
        chapter("Mission autonome", [
          [
            "Planifier et contrôler son discours",
            "Préparer les idées utiles puis repérer et corriger une erreur qui gêne le message."
          ],
          [
            "Rapprocher deux sources",
            "Identifier les convergences et différences principales entre deux documents accessibles."
          ],
          [
            "Présentation orale autonome",
            "Présenter un sujet familier de façon suivie et répondre à des questions prévisibles."
          ],
          [
            "Texte connecté autonome",
            "Rédiger un texte organisé sur une expérience, un projet ou une question familière."
          ],
          [
            "Profil réflexif des compétences",
            "Évaluer séparément réception, production, interaction et médiation à partir de preuves."
          ]
        ])
      ]
    ]
  },
  B2: {
    objective:
      "Comprendre des contenus complexes, interagir avec aisance et construire une argumentation détaillée.",
    semesterTitles: ["Sources, récits et collaboration", "Débats et communication publique"],
    semesters: [
      [
        chapter("Faits, sources et angles", [
          [
            "Verbes introducteurs et passifs",
            "Choisir une structure de compte rendu selon la source et l’importance de son auteur."
          ],
          [
            "Marques de position",
            "Repérer puis employer les indices qui signalent certitude, réserve ou évaluation."
          ],
          [
            "Collocations médiatiques",
            "Employer avec précision les associations lexicales fréquentes de l’information."
          ],
          [
            "Comparer la fiabilité de sources",
            "Évaluer auteur, preuve, cadrage et cohérence de plusieurs documents."
          ],
          [
            "Synthétiser des points de vue",
            "Regrouper accords et désaccords sans déformer la position des sources."
          ]
        ]),
        chapter("Argumenter avec équilibre", [
          [
            "Cause, contraste et concession",
            "Organiser un raisonnement complexe avec des relations logiques explicites."
          ],
          [
            "Atténuer une affirmation",
            "Ajuster son degré d’engagement pour présenter une position de façon crédible."
          ],
          [
            "Modalité et prise de position",
            "Exprimer nécessité, possibilité et probabilité avec une nuance adaptée."
          ],
          [
            "Répondre aux contre-arguments",
            "Reconnaître une objection pertinente puis défendre ou réviser sa position."
          ],
          [
            "Essai et débat structurés",
            "Développer une argumentation détaillée à l’écrit puis la soutenir en interaction."
          ]
        ]),
        chapter("Raconter par le point de vue", [
          [
            "Temps narratifs avancés",
            "Combiner les temps du passé pour contrôler ordre, durée et perspective."
          ],
          [
            "Past perfect continu",
            "Mettre en évidence la durée d’une cause ou d’un contexte antérieur."
          ],
          [
            "Discours rapporté élaboré",
            "Rapporter paroles et pensées en conservant leur intention et leur chronologie."
          ],
          [
            "Focalisation narrative",
            "Raconter le même événement depuis plusieurs perspectives cohérentes."
          ],
          [
            "Prosodie du récit",
            "Employer pauses, accentuation et intonation pour guider l’attention de l’auditeur."
          ]
        ]),
        chapter("Collaborer au travail", [
          [
            "Fonctions d’une réunion",
            "Proposer, clarifier, distribuer la parole et résumer une décision en réunion."
          ],
          [
            "Propositions relatives complexes",
            "Ajouter ou condenser une précision sans rendre la phrase ambiguë."
          ],
          [
            "Registre professionnel",
            "Adapter vocabulaire et formulation au degré de formalité d’un échange de travail."
          ],
          [
            "Questions de suivi",
            "Faire préciser un point implicite et vérifier l’interprétation d’une proposition."
          ],
          [
            "Compte rendu de réunion",
            "Transformer une discussion en décisions, responsabilités et échéances clairement attribuées."
          ]
        ]),
        chapter("Science et incertitude", [
          [
            "Déduction et spéculation",
            "Évaluer plusieurs explications à partir d’indices avec les modaux appropriés."
          ],
          [
            "Conditionnels mixtes",
            "Relier une cause passée à un résultat présent ou l’inverse."
          ],
          [
            "Collocations scientifiques",
            "Employer les combinaisons lexicales utiles pour hypothèse, méthode, résultat et limite."
          ],
          [
            "Expliquer des données",
            "Décrire tendances, écarts et incertitudes sans surinterpréter un graphique."
          ],
          [
            "Rendre une idée accessible",
            "Reformuler une explication technique pour un public non spécialiste."
          ]
        ]),
        chapter("Médias et influence", [
          [
            "Passifs et structures de compte rendu",
            "Varier la mise en avant d’une information et signaler son degré de preuve."
          ],
          [
            "Cadrage et persuasion",
            "Identifier comment sélection, ordre et lexique orientent la perception d’un sujet."
          ],
          [
            "Langue familière et idiomatique",
            "Comprendre des expressions courantes sans les employer hors du registre approprié."
          ],
          [
            "Comprendre une émission",
            "Suivre arguments, attitudes et changements de thème dans un contenu médiatique."
          ],
          [
            "Produire une critique médiatique",
            "Évaluer la construction d’un message en distinguant contenu, forme et effet."
          ]
        ])
      ],
      [
        chapter("Imaginer l’avenir", [
          [
            "Futur continu",
            "Situer une activité en cours à une étape déterminée d’un scénario futur."
          ],
          [
            "Futur parfait",
            "Présenter une action comme achevée avant une échéance future."
          ],
          [
            "Futur parfait continu",
            "Insister sur la durée atteinte par une activité à un moment futur."
          ],
          [
            "Degrés de probabilité",
            "Hiérarchiser plusieurs prévisions selon leur degré de vraisemblance."
          ],
          [
            "Recommandation entre scénarios",
            "Comparer conséquences et incertitudes pour défendre une option future."
          ]
        ]),
        chapter("Vie numérique et éthique", [
          [
            "Interaction en ligne développée",
            "Relier sa contribution aux messages précédents et répondre à plusieurs positions."
          ],
          [
            "Phrasal verbs étendus",
            "Employer avec contrôle des verbes à particule liés aux usages numériques."
          ],
          [
            "Registre des espaces numériques",
            "Adapter longueur, ton et degré de formalité au canal et à son public."
          ],
          [
            "Lexique des droits numériques",
            "Discuter confidentialité, consentement, accès et responsabilité avec précision."
          ],
          [
            "Modérer puis synthétiser un débat",
            "Maintenir un échange constructif et restituer les arguments principaux."
          ]
        ]),
        chapter("Culture et identité", [
          [
            "Wish et if only",
            "Exprimer souhait, regret ou insatisfaction en situant correctement leur temporalité."
          ],
          [
            "Would et used to au passé",
            "Distinguer habitude répétée et état ancien dans une évocation culturelle."
          ],
          [
            "Lexique de l’identité",
            "Parler d’appartenance et de représentation sans généralisation simpliste."
          ],
          [
            "Variétés et accents familiers",
            "Reconnaître des différences usuelles de prononciation et maintenir la compréhension."
          ],
          [
            "Médiation d’une perspective culturelle",
            "Expliquer une pratique selon son contexte et prévenir une interprétation réductrice."
          ]
        ]),
        chapter("Systèmes et changement", [
          [
            "Chaînes de cause et d’effet",
            "Construire une explication reliant plusieurs facteurs et conséquences."
          ],
          [
            "Propositions participiales",
            "Condenser des informations liées tout en maintenant un rapport logique clair."
          ],
          [
            "Langage des données",
            "Comparer proportions, évolutions et exceptions avec une précision appropriée."
          ],
          [
            "Passif de processus",
            "Présenter les étapes et transformations d’un système complexe."
          ],
          [
            "Rédiger une proposition",
            "Définir problème, solution, bénéfices, risques et mise en œuvre."
          ]
        ]),
        chapter("Idiomes et registres", [
          [
            "Collocations avancées",
            "Choisir des associations lexicales naturelles dans plusieurs sujets généraux."
          ],
          [
            "Phrasal verbs séparables",
            "Placer correctement compléments nominaux et pronominaux dans des verbes à particule."
          ],
          [
            "Transformer le registre",
            "Reformuler le même message pour une conversation, un courriel ou un texte formel."
          ],
          [
            "Langage approximatif contrôlé",
            "Exprimer une estimation ou une catégorie floue sans perdre l’information essentielle."
          ],
          [
            "Reformulation et prosodie",
            "Employer accentuation et intonation pour préciser, corriger ou contraster une idée."
          ]
        ]),
        chapter("Plaidoyer public", [
          [
            "Architecture d’une présentation",
            "Organiser une intervention avec ouverture, progression, points forts et conclusion."
          ],
          [
            "Balisage pour l’auditoire",
            "Annoncer transitions, exemples et synthèses afin d’aider le public à suivre."
          ],
          [
            "Répondre spontanément aux questions",
            "Clarifier une question et développer une réponse sans abandonner sa position."
          ],
          [
            "Écrit persuasif",
            "Adapter arguments, preuves et appel à l’action à un destinataire défini."
          ],
          [
            "Synthèse publique finale",
            "Croiser plusieurs sources puis défendre une recommandation cohérente devant un public."
          ]
        ])
      ]
    ]
  },
  C1: {
    objective:
      "Employer l’anglais avec souplesse et précision dans des contextes sociaux, académiques et professionnels complexes.",
    semesterTitles: ["Interprétation et influence", "Médiation et expertise"],
    semesters: [
      [
        chapter("Sous le sens explicite", [
          [
            "Inférence et attitude implicite",
            "Reconstruire une intention ou une attitude lorsque les liens ne sont pas directement formulés."
          ],
          [
            "Atténuation et renforcement",
            "Ajuster la force d’une affirmation selon la preuve, le risque et l’interlocuteur."
          ],
          [
            "Ellipse et substitution",
            "Comprendre et employer des formes condensées qui évitent la répétition."
          ],
          [
            "Ton et registre implicites",
            "Identifier les indices lexicaux et pragmatiques d’un positionnement complexe."
          ],
          [
            "Interpréter puis paraphraser",
            "Rendre explicite un sens sous-entendu sans appauvrir ni exagérer le message."
          ]
        ]),
        chapter("Architectures de l’argument", [
          [
            "Nominalisation",
            "Transformer une action ou une qualité en notion abstraite dans un texte formel."
          ],
          [
            "Cohésion avancée",
            "Construire des renvois et transitions qui relient une argumentation longue."
          ],
          [
            "Groupes nominaux complexes",
            "Condenser plusieurs précisions autour d’un nom sans créer d’ambiguïté."
          ],
          [
            "Évaluer les preuves",
            "Hiérarchiser méthode, pertinence et solidité des éléments avancés."
          ],
          [
            "Essai académique",
            "Développer une réponse structurée qui intègre sources, objections et conclusion."
          ]
        ]),
        chapter("Influencer avec tact", [
          [
            "Nuances modales",
            "Exprimer avec finesse obligation, permission, probabilité et distance critique."
          ],
          [
            "Diplomatie verbale",
            "Reformuler demande, refus ou critique pour préserver la coopération."
          ],
          [
            "Politesse stratégique",
            "Adapter le degré de directivité au statut, à la relation et à l’enjeu."
          ],
          [
            "Intonation de positionnement",
            "Utiliser accentuation et courbe mélodique pour signaler réserve, contraste ou ouverture."
          ],
          [
            "Médiation d’une négociation",
            "Clarifier intérêts et points de blocage afin de rapprocher plusieurs parties."
          ]
        ]),
        chapter("Des données aux idées", [
          [
            "Tendances et incertitude",
            "Décrire évolution, dispersion et limites avec le degré de prudence requis."
          ],
          [
            "Passifs et attribution",
            "Distribuer responsabilité et source d’une affirmation de manière transparente."
          ],
          [
            "Propositions participiales avancées",
            "Combiner des relations temporelles ou causales dans une syntaxe concise."
          ],
          [
            "Synthèse graphique–texte",
            "Croiser données visuelles et explications écrites pour faire ressortir les conclusions utiles."
          ],
          [
            "Briefing professionnel",
            "Transformer une analyse détaillée en présentation claire pour une décision."
          ]
        ]),
        chapter("Critique et création", [
          [
            "Langage figuré",
            "Interpréter et employer métaphore, comparaison et image selon leur effet."
          ],
          [
            "Collocations de la critique",
            "Mobiliser un lexique évaluatif précis sans répétition ni jugement vague."
          ],
          [
            "Genres critiques",
            "Adapter structure et ton d’une critique au média, à l’œuvre et au lectorat."
          ],
          [
            "Voix narrative",
            "Contrôler distance, perspective et rythme dans une production créative."
          ],
          [
            "Réponse littéraire argumentée",
            "Relier interprétation, procédés textuels et appréciation personnelle."
          ]
        ]),
        chapter("Langue, identité et pouvoir", [
          [
            "Changements de registre",
            "Passer avec cohérence d’un registre à un autre lorsque la situation l’exige."
          ],
          [
            "Lexique sociolinguistique",
            "Analyser la relation entre choix linguistiques, groupe, statut et contexte."
          ],
          [
            "Phrases clivées et mise en relief",
            "Mettre précisément en valeur une information sans modifier le sens factuel."
          ],
          [
            "Accents et variétés",
            "Suivre des discours étendus dans plusieurs variétés et identifier leurs effets sociaux."
          ],
          [
            "Faciliter un espace pluriculturel",
            "Prévenir un malentendu en explicitant des conventions et perspectives différentes."
          ]
        ])
      ],
      [
        chapter("Problèmes complexes, solutions partagées", [
          [
            "Conditionnels mixtes avancés",
            "Modéliser des liens hypothétiques entre causes et effets de temporalités différentes."
          ],
          [
            "Concession élaborée",
            "Intégrer une limite ou un contre-exemple sans désorganiser son raisonnement."
          ],
          [
            "Lexique de résolution",
            "Décrire contraintes, compromis, critères et conséquences avec précision."
          ],
          [
            "Co-construire le sens",
            "Faire émerger une compréhension commune en reliant et reformulant les contributions."
          ],
          [
            "Proposition argumentée",
            "Présenter une solution complexe, ses conditions, ses risques et son évaluation."
          ]
        ]),
        chapter("Éthique, droit et controverse", [
          [
            "Inversion après adverbiaux négatifs",
            "Employer l’inversion pour renforcer un contraste dans un registre formel."
          ],
          [
            "Lexique juridique et éthique",
            "Distinguer droits, devoirs, responsabilité, légitimité et conséquences."
          ],
          [
            "Qualification précise",
            "Limiter la portée d’une affirmation afin d’éviter généralisation et ambiguïté."
          ],
          [
            "Débat contradictoire",
            "Soutenir un raisonnement complexe tout en répondant aux objections pertinentes."
          ],
          [
            "Médiation neutre",
            "Restituer des positions sensibles sans parti pris et dégager un terrain commun."
          ]
        ]),
        chapter("Parler pour être suivi", [
          [
            "Organisation d’un long discours",
            "Construire une progression claire malgré la complexité et les développements secondaires."
          ],
          [
            "Procédés rhétoriques",
            "Employer répétition, contraste et question rhétorique au service d’un objectif explicite."
          ],
          [
            "Prosodie avancée",
            "Varier débit, pauses, rythme et accentuation pour structurer et nuancer."
          ],
          [
            "Adaptation au public",
            "Réviser vocabulaire, exemples et degré de détail en fonction de l’auditoire."
          ],
          [
            "Gérer les questions",
            "Répondre spontanément, demander une clarification et conserver la cohérence générale."
          ]
        ]),
        chapter("Anglais mondiaux", [
          [
            "Variétés moins familières",
            "Suivre les idées essentielles d’un discours complexe malgré une variété nouvelle."
          ],
          [
            "Idiomes en contexte",
            "Interpréter une expression idiomatique et évaluer si elle convient à la situation."
          ],
          [
            "Accommodation et reformulation",
            "Adapter son anglais afin de faciliter la compréhension entre interlocuteurs divers."
          ],
          [
            "Pragmatique internationale",
            "Anticiper les écarts de conventions dans demande, refus, humour et désaccord."
          ],
          [
            "Comparer des conventions discursives",
            "Expliquer comment plusieurs cultures organisent différemment une interaction ou un texte."
          ]
        ]),
        chapter("Synthèse multisource", [
          [
            "Attribution des idées",
            "Intégrer une source en distinguant nettement information, interprétation et commentaire."
          ],
          [
            "Paraphrase avancée",
            "Reformuler structure et lexique tout en conservant fidèlement le sens."
          ],
          [
            "Cartographie d’arguments",
            "Identifier thèses, présupposés, preuves, objections et relations entre sources."
          ],
          [
            "Résumé évaluatif",
            "Condenser plusieurs documents et apprécier leur contribution respective."
          ],
          [
            "Intégrité académique",
            "Citer, référencer et signaler les limites d’une source dans une production originale."
          ]
        ]),
        chapter("Portfolio expert", [
          [
            "Transformer un genre",
            "Adapter une même information en rapport, courriel, synthèse ou présentation."
          ],
          [
            "Autoédition ciblée",
            "Diagnostiquer puis améliorer précision, cohésion, registre et lisibilité d’un texte."
          ],
          [
            "Soutenance orale",
            "Présenter un travail complexe et défendre ses choix face à des questions."
          ],
          [
            "Mission académique ou professionnelle",
            "Mener une tâche complète en combinant réception, production, interaction et médiation."
          ],
          [
            "Profil réflexif avancé",
            "Évaluer ses performances par compétence et définir des priorités étayées par des preuves."
          ]
        ])
      ]
    ]
  },
  C2: {
    objective:
      "Comprendre presque toute forme de discours, synthétiser des sources et exprimer les nuances avec précision.",
    semesterTitles: ["Précision, voix et interprétation", "Synthèse, négociation et maîtrise"],
    semesters: [
      [
        chapter("La précision sans lourdeur", [
          [
            "Connotation et collocation",
            "Choisir un terme pour son sens, ses associations naturelles et sa charge connotative."
          ],
          [
            "Nuance modale et évidentielle",
            "Indiquer finement degré de certitude, source de connaissance et responsabilité."
          ],
          [
            "Éliminer une ambiguïté",
            "Repérer plusieurs lectures possibles et reformuler pour imposer celle qui est voulue."
          ],
          [
            "Concision et densité",
            "Réduire un passage complexe sans perdre sa logique, ses réserves ni ses distinctions."
          ],
          [
            "Prosodie de précision",
            "Exploiter rythme, intonation et accentuation pour différencier de fines nuances."
          ]
        ]),
        chapter("Lire ce qui est implicite", [
          [
            "Implicature",
            "Reconstruire un sens non formulé à partir du contexte et des attentes partagées."
          ],
          [
            "Ironie et sarcasme",
            "Distinguer sens littéral, intention ironique et effet relationnel."
          ],
          [
            "Ambiguïté intentionnelle",
            "Analyser comment un texte entretient plusieurs interprétations simultanées."
          ],
          [
            "Allusion et connaissance culturelle",
            "Identifier une référence indirecte et expliquer son rôle sans supposer un savoir universel."
          ],
          [
            "Position implicite entre sources",
            "Comparer présupposés et attitudes d’auteurs qui n’énoncent pas directement leur thèse."
          ]
        ]),
        chapter("Une idée, plusieurs voix", [
          [
            "Transformation de genre",
            "Recomposer le même contenu selon les conventions de plusieurs genres exigeants."
          ],
          [
            "Ordre syntaxique marqué",
            "Déplacer ou mettre en relief un élément pour produire un effet discursif contrôlé."
          ],
          [
            "Voix et posture",
            "Construire une présence d’auteur cohérente avec le but et le contexte."
          ],
          [
            "Adaptation fine à l’auditoire",
            "Ajuster implicite, technicité, humour et distance à un public précisément défini."
          ],
          [
            "Réécritures parallèles",
            "Comparer plusieurs formulations valides et justifier leurs effets pragmatiques."
          ]
        ]),
        chapter("Débattre sous pression", [
          [
            "Réfutation rapide",
            "Identifier le cœur d’une objection et répondre sans détourner l’argument adverse."
          ],
          [
            "Concession stratégique",
            "Accorder un point limité tout en préservant la cohérence de sa position."
          ],
          [
            "Questions difficiles",
            "Traiter des questions complexes ou hostiles avec calme, précision et transparence."
          ],
          [
            "Gestion souple des tours",
            "Intervenir, céder la parole et relancer un échange dense sans rupture."
          ],
          [
            "Médiation du conflit",
            "Faire apparaître besoins et malentendus afin de rétablir une discussion constructive."
          ]
        ]),
        chapter("Littérature, humour et allusion", [
          [
            "Intertextualité",
            "Repérer comment un texte transforme ou détourne des références antérieures."
          ],
          [
            "Jeux de mots",
            "Analyser puis produire un effet fondé sur sonorité, polysémie ou structure."
          ],
          [
            "Métaphore et symbole",
            "Développer une interprétation en reliant choix formels et significations possibles."
          ],
          [
            "Rythme et effet stylistique",
            "Expliquer comment syntaxe, ponctuation et prosodie modifient l’expérience du texte."
          ],
          [
            "Réponse critique approfondie",
            "Articuler analyse, évaluation et contexte sans réduire l’œuvre à une seule lecture."
          ]
        ]),
        chapter("Rendre l’expert accessible", [
          [
            "Terminologie spécialisée",
            "Définir un terme avec exactitude et déterminer quand il doit être conservé."
          ],
          [
            "Définition et analogie",
            "Construire une analogie éclairante tout en explicitant les limites de la comparaison."
          ],
          [
            "Condenser ou déployer un texte dense",
            "Changer le niveau de détail sans altérer relations, réserves et conclusions."
          ],
          [
            "Expliquer des données visuelles",
            "Transformer un ensemble complexe de données en récit exact et intelligible."
          ],
          [
            "Briefing grand public",
            "Présenter un enjeu spécialisé et répondre spontanément aux préoccupations d’un public."
          ]
        ])
      ],
      [
        chapter("Négocier sans rompre", [
          [
            "Préserver la relation",
            "Formuler positions et limites fermes tout en maintenant la possibilité d’un accord."
          ],
          [
            "Désaccord délicat",
            "Contester une prémisse sensible avec tact, précision et preuves."
          ],
          [
            "Nuance professionnelle et juridique",
            "Distinguer engagement, recommandation, condition et réserve dans un échange formel."
          ],
          [
            "Conventions interculturelles",
            "Anticiper l’effet de styles de négociation différents et adapter l’interaction."
          ],
          [
            "Synthèse d’un accord",
            "Reformuler les engagements obtenus de façon complète, concise et non ambiguë."
          ]
        ]),
        chapter("Synthétiser à grande échelle", [
          [
            "Prise de notes multisource",
            "Organiser en temps réel faits, arguments, sources et liens au sein d’un corpus dense."
          ],
          [
            "Réconcilier des contradictions",
            "Distinguer désaccord réel, différence de définition et divergence de méthode."
          ],
          [
            "Attribution et évaluation",
            "Intégrer une information en indiquant clairement provenance, solidité et limite."
          ],
          [
            "Synthèse écrite cohérente",
            "Reconstruire une argumentation lisible à partir de documents nombreux et hétérogènes."
          ],
          [
            "Résumé décisionnel oral",
            "Présenter conclusions, incertitudes et options d’action à un décideur."
          ]
        ]),
        chapter("Rhétorique et cadrage", [
          [
            "Choisir un cadre interprétatif",
            "Analyser comment la formulation d’un problème rend certaines réponses plus probables."
          ],
          [
            "Architecture rhétorique",
            "Construire une progression persuasive tout en rendant ses prémisses vérifiables."
          ],
          [
            "Euphémisme et dysphémisme",
            "Mesurer l’effet d’une reformulation atténuante ou dépréciative."
          ],
          [
            "Persuasion ou manipulation",
            "Distinguer argument loyal, omission stratégique et procédé manipulateur."
          ],
          [
            "Reformulation neutre",
            "Retirer le cadrage chargé d’un message en conservant ses informations vérifiables."
          ]
        ]),
        chapter("Variétés et sens social", [
          [
            "Variétés régionales et sociales",
            "Comprendre des usages variés et interpréter leur portée sans les hiérarchiser."
          ],
          [
            "Changement de style",
            "Modifier spontanément son style selon relation, lieu, média et objectif."
          ],
          [
            "Registres familier et spécialisé",
            "Naviguer entre langue colloquiale et terminologie experte sans effet involontaire."
          ],
          [
            "Compréhension d’accents variés",
            "Suivre un débit naturel dans de nombreuses variétés, y compris peu familières."
          ],
          [
            "Médiation culturelle sensible",
            "Interpréter nuances et sous-entendus pour prévenir un conflit entre communautés."
          ]
        ]),
        chapter("Écrire, réécrire et éditer", [
          [
            "Voix créative",
            "Maintenir une voix distinctive et cohérente sur un texte développé."
          ],
          [
            "Syntaxe et rythme",
            "Varier longueur, structure et cadence des phrases pour produire un effet précis."
          ],
          [
            "Ambiguïté volontaire",
            "Créer puis contrôler plusieurs niveaux de lecture sans confusion accidentelle."
          ],
          [
            "Ponctuation et édition fine",
            "Employer ponctuation, typographie et segmentation pour clarifier ou nuancer."
          ],
          [
            "Critique puis révision",
            "Justifier des choix éditoriaux et transformer un brouillon selon des critères explicites."
          ]
        ]),
        chapter("Démonstration de maîtrise", [
          [
            "Synthèse spontanée",
            "Combiner immédiatement plusieurs informations complexes en une réponse structurée."
          ],
          [
            "Présentation complexe",
            "Adapter librement structure et détail au public tout en maintenant une grande précision."
          ],
          [
            "Portfolio multigenre",
            "Construire un ensemble cohérent de productions orales, écrites et multimodales."
          ],
          [
            "Défense face aux objections",
            "Répondre à des contestations imprévues et reformuler les enjeux avec souplesse."
          ],
          [
            "Audit personnel final",
            "Analyser ses preuves de réception, production, interaction et médiation sans revendiquer une certification."
          ]
        ])
      ]
    ]
  }
};

const BASE_ENGLISH_SUBJECT = {
  id: "anglais",
  shortName: "Anglais",
  teacher: "Tuteur IA",
  room: "Espace Langues",
  color: "#3f83d4",
  accent: "#eaf4ff",
  icon: "languages" as const,
  nextClass: "Lun. 08:30",
  domain: "Langues · CECRL",
  period: "Annuel" as const,
  validation:
    "Parcours interne aligné sur le CECRL · évaluations non certifiantes."
};

/** Sujet affichable tant que le niveau d’anglais du profil n’a pas été choisi. */
export const ENGLISH_SUBJECT_PLACEHOLDER: Subject = {
  ...BASE_ENGLISH_SUBJECT,
  name: "Anglais",
  chapterCount: 0,
  objective:
    "Choisir une fois le niveau CECRL à étudier pour ouvrir le programme annuel correspondant.",
  modules: []
};

export const englishSubjectPlaceholder = ENGLISH_SUBJECT_PLACEHOLDER;

export type EnglishSubject = Subject & { cefrLevel: CefrLevel };

function createLesson(
  chapterId: string,
  notionIndex: number,
  definition: NotionDefinition
): LessonUnit {
  return {
    id: `${chapterId}-n${String(notionIndex + 1).padStart(2, "0")}`,
    title: definition[0],
    objective: definition[1],
    completed: false
  };
}

function createChapter(
  level: CefrLevel,
  semesterIndex: number,
  chapterIndex: number,
  definition: ChapterDefinition
): ProgramItem {
  const levelId = level.toLowerCase();
  const semesterNumber = semesterIndex + 1;
  const chapterNumber = chapterIndex + 1;
  const annualChapterNumber = semesterIndex * 6 + chapterNumber;
  const id = `anglais-${levelId}-s${semesterNumber}-ch${String(chapterNumber).padStart(2, "0")}`;

  return {
    id,
    title: definition.title,
    description: `Niveau CECRL ${level} · Chapitre ${annualChapterNumber}/12 · 5 notions atomiques`,
    completed: false,
    lessons: definition.notions.map((notion, notionIndex) =>
      createLesson(id, notionIndex, notion)
    )
  };
}

function createModule(
  level: CefrLevel,
  semesterIndex: number,
  definition: LevelDefinition
): ProgramModule {
  const semesterNumber = semesterIndex + 1;
  return {
    id: `anglais-${level.toLowerCase()}-s${semesterNumber}`,
    period: `Semestre ${semesterNumber}`,
    title: `${level} · ${definition.semesterTitles[semesterIndex]}`,
    cefrLevel: level,
    items: definition.semesters[semesterIndex].map((item, chapterIndex) =>
      createChapter(level, semesterIndex, chapterIndex, item)
    )
  };
}

/** Construit une copie neuve du programme annuel pour le niveau choisi. */
export function createEnglishSubject(level: CefrLevel): EnglishSubject {
  const definition = CURRICULUM[level];
  return {
    ...BASE_ENGLISH_SUBJECT,
    id: "anglais",
    name: `Anglais · ${level}`,
    cefrLevel: level,
    chapterCount: 12,
    objective: `${definition.objective} Parcours annuel ${level} aligné sur les modes de réception, production, interaction et médiation du CECRL.`,
    modules: [
      createModule(level, 0, definition),
      createModule(level, 1, definition)
    ]
  };
}

/**
 * Corpus persistant complet. Les six niveaux restent enregistrés afin qu'un
 * changement volontaire de niveau n'efface jamais la progression précédente.
 * Les écrans doivent utiliser `projectEnglishSubject` pour n'afficher qu'une
 * seule année à la fois.
 */
export function createEnglishCatalogSubject(selectedLevel?: CefrLevel): Subject {
  return {
    ...ENGLISH_SUBJECT_PLACEHOLDER,
    cefrLevel: selectedLevel,
    modules: CEFR_LEVELS.flatMap((level) => createEnglishSubject(level).modules)
  };
}

export const DEFAULT_ENGLISH_SUBJECT = createEnglishCatalogSubject();

function completedLessonsById(subject: Subject | undefined): Map<string, boolean> {
  return new Map((subject?.modules ?? [])
    .flatMap((courseModule) => courseModule.items)
    .flatMap((item) => item.lessons ?? [])
    .map((lesson) => [lesson.id, lesson.completed] as const));
}

/**
 * Reconstruit le référentiel canonique tout en conservant le niveau choisi et
 * chaque case de progression qui possède encore le même identifiant stable.
 */
export function hydrateEnglishSubject(subject?: Subject): Subject {
  const completed = completedLessonsById(subject);
  const catalog = createEnglishCatalogSubject(subject?.cefrLevel);
  return {
    ...catalog,
    modules: catalog.modules.map((courseModule) => ({
      ...courseModule,
      items: courseModule.items.map((item) => {
        const lessons = item.lessons?.map((lesson) => ({
          ...lesson,
          completed: completed.get(lesson.id) ?? lesson.completed
        }));
        return {
          ...item,
          lessons,
          completed: lessons?.length
            ? lessons.every((lesson) => lesson.completed)
            : item.completed
        };
      })
    }))
  };
}

/** Une matière anglais limitée au seul niveau actif pour les écrans et prompts. */
export function projectEnglishSubject(subject: Subject, forcedLevel?: CefrLevel): Subject {
  if (subject.id !== ENGLISH_SUBJECT_PLACEHOLDER.id) return subject;
  const level = forcedLevel ?? subject.cefrLevel;
  if (!level) return { ...ENGLISH_SUBJECT_PLACEHOLDER, modules: [] };
  const metadata = createEnglishSubject(level);
  return {
    ...metadata,
    modules: subject.modules.filter((courseModule) => courseModule.cefrLevel === level)
  };
}

export function projectSubjectsForActiveCurricula(subjects: readonly Subject[]): Subject[] {
  return subjects.map((subject) => projectEnglishSubject(subject));
}
