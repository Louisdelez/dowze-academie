import type { CurriculumBranch } from './swissCurriculumCore';

export const FRENCH_MATH_SPECIFIC: CurriculumBranch = {id:'maths-specifiques',name:'Mathématiques spécifiques — sans spécialité maths',domain:'Sciences',objective:'Suivre les mathématiques intégrées à l’enseignement scientifique de première pour les élèves sans spécialité mathématiques, programme2026.',years:[[
 'Information chiffrée|Lire taux et proportions|Calculer évolutions successives|Comparer indices et variations|Analyser un graphique|Critiquer un indicateur',
 'Données et hasard|Organiser des données|Étudier fréquences conditionnelles|Lire un arbre de probabilités|Analyser une association|Distinguer corrélation et causalité',
 'Évolutions|Modéliser par une fonction affine|Étudier suites arithmétiques et géométriques|Comparer croissance linéaire et exponentielle|Interpréter un taux de variation|Analyser un modèle',
 'Automatismes et épreuve anticipée|Calculer sans calculatrice|Transformer une formule|Lire fonction et dérivée dans un contexte|Justifier un raisonnement|Composer une épreuve d’entraînement'
 ]]};

export const TERMINALE_OPTIONS: CurriculumBranch[] = [
 {id:'maths-expertes',name:'Option — Mathématiques expertes',domain:'Sciences',objective:'Approfondir les mathématiques en complément de la spécialité conservée en terminale.',years:[[
  'Nombres complexes|Calculer en forme algébrique|Utiliser module et argument|Passer en forme exponentielle|Résoudre une équation|Interpréter géométriquement',
  'Arithmétique|Utiliser divisibilité et congruences|Appliquer Bézout et Gauss|Résoudre une équation diophantienne|Étudier les nombres premiers|Analyser un codage pédagogique',
  'Matrices et graphes|Calculer avec matrices|Représenter un graphe|Étudier chaînes et parcours|Modéliser une évolution|Comparer calcul exact et numérique',
  'Démonstration et synthèse|Construire une preuve|Relier plusieurs domaines|Programmer une exploration|Vérifier une conjecture|Présenter une solution rigoureuse'
 ]]},
 {id:'maths-complementaires',name:'Option — Mathématiques complémentaires',domain:'Sciences',objective:'Poursuivre une formation mathématique en terminale sans spécialité mathématiques ; programme applicable en2026-2027.',years:[[
  'Analyse|Étudier fonctions et limites|Utiliser dérivation et convexité|Analyser logarithme et exponentielle|Résoudre une optimisation|Interpréter un résultat',
  'Modèles d’évolution|Étudier suites|Comparer modèles discrets et continus|Résoudre une équation différentielle simple|Déterminer un seuil|Discuter les limites',
  'Intégration|Calculer une primitive|Interpréter une intégrale|Calculer une valeur moyenne|Utiliser une approximation numérique|Analyser une aire',
  'Probabilités et statistiques|Étudier loi binomiale et lois à densité|Calculer espérance et dispersion|Analyser des données bivariées|Comprendre corrélation et ajustement|Comparer modèle et données'
 ]]},
 {id:'dgemc',name:'Option — Droit et grands enjeux du monde contemporain',domain:'Droit et société',objective:'Comprendre le raisonnement juridique à partir de situations pédagogiques et de textes vérifiés dans leur version actuelle.',years:[[
  'Sources et institutions|Distinguer règle de droit et norme sociale|Comprendre la hiérarchie des normes|Comparer juridictions et compétences|Lire une décision|Identifier un recours',
  'Personnes et libertés|Analyser personnalité et capacité|Étudier égalité et discrimination|Comprendre protection de la vie privée|Discuter liberté d’expression|Résoudre un cas fictif',
  'Contrats et responsabilité|Qualifier une situation|Identifier obligations et consentement|Distinguer responsabilités|Analyser preuve et réparation|Construire un raisonnement juridique',
  'Enjeux contemporains|Étudier données numériques|Analyser droit et environnement|Comparer enjeux de santé et libertés|Vérifier les textes applicables|Présenter une controverse argumentée'
 ]]}
];

export const SECONDE_TECH_OPTIONS: CurriculumBranch[] = [
 ['management','Management et gestion','organisation et décision','Identifier une organisation|Analyser ses ressources|Comprendre les parties prenantes|Comparer des décisions|Évaluer un projet'],
 ['sante-social','Santé et social','santé et solidarité','Comparer besoins et indicateurs|Identifier les acteurs|Analyser une action de prévention|Comprendre les solidarités|Présenter une enquête fictive'],
 ['biotechnologies','Biotechnologies','laboratoire et vivant','Lire un protocole|Identifier les règles de sécurité|Comprendre une mesure biologique|Analyser des résultats fournis|Découvrir les métiers'],
 ['sciences-labo','Sciences et laboratoire','investigation expérimentale','Poser une question|Choisir les variables|Mesurer sous encadrement|Traiter des données|Discuter les limites'],
 ['si','Sciences de l’ingénieur','systèmes et conception','Analyser un besoin|Lire une architecture|Modéliser un système|Comparer simulation et essai|Justifier une amélioration'],
 ['cit','Création et innovation technologiques','innovation et projet','Identifier un besoin nouveau|Comparer des solutions|Produire un croquis|Tester un prototype encadré|Présenter une démarche'],
 ['design','Création et culture-design','design et usages','Analyser un objet|Relier forme fonction et matière|Explorer des références|Proposer plusieurs pistes|Présenter un projet visuel'],
 ['culture-spectacle','Culture et pratique de la danse, musique ou théâtre','spectacle vivant','Choisir une pratique avec un encadrant|Observer une œuvre|Expérimenter les langages|Répéter collectivement|Analyser une prestation'],
].map(([id,name,theme,skills])=>({id:`option-tech-${id}`,name:`Option — ${name}`,domain:'Découverte technologique',objective:`Découvrir ${theme} pour éclairer l’orientation en seconde ; cette option ne constitue pas un cursus technologique.`,years:[[
 `Découvrir ${theme}|${skills}`,
 'Enquête et méthodes|Formuler une question|Rechercher des sources fiables|Comparer des observations|Construire une synthèse|Identifier les formations associées',
 'Projet de découverte|Définir un objectif|Planifier les étapes|Produire une réalisation adaptée|Présenter ses choix|Évaluer le résultat'
 ]]}));

export interface FrenchWork { id:string; title:string; author:string; focus:string; angles:string[] }
export const FRENCH_WORKS: Record<string,FrenchWork[]> = {
 roman:[
  {id:'charette',title:'Le Chevalier de la charrette',author:'Chrétien de Troyes',focus:'Amour et invention romanesque',angles:['Étudier quête et épreuves','Analyser les valeurs chevaleresques','Interroger amour et transgression']},
  {id:'pot-bouille',title:'Pot-Bouille',author:'Émile Zola',focus:'Mécanismes sociaux et apparences',angles:['Analyser l’immeuble comme espace social','Étudier satire et hypocrisie','Relier narration et enquête naturaliste']},
  {id:'telumee',title:'Pluie et vent sur Télumée Miracle',author:'Simone Schwarz-Bart',focus:'Mémoire et habitation du monde',angles:['Étudier la transmission des récits','Analyser oralité et voix narrative','Relier histoire collective et destin personnel']}
 ],
 idees:[
  {id:'boetie',title:'Discours de la servitude volontaire',author:'Étienne de La Boétie',focus:'Liberté et consentement à la domination',angles:['Analyser le paradoxe initial','Étudier habitudes et dépendances','Interpréter les appels au lecteur']},
  {id:'fontenelle',title:'Entretiens sur la pluralité des mondes',author:'Fontenelle',focus:'Goût de la science et dialogue',angles:['Analyser le dialogue pédagogique','Relier imagination et raisonnement','Étudier la diffusion des savoirs']},
  {id:'graffigny',title:'Lettres d’une Péruvienne',author:'Françoise de Graffigny',focus:'Regard étranger et découverte',angles:['Analyser le dispositif épistolaire','Étudier la critique sociale','Interroger autonomie et éducation']}
 ],
 theatre:[
  {id:'menteur',title:'Le Menteur',author:'Pierre Corneille',focus:'Mensonge et construction comique',angles:['Analyser la parole inventive','Étudier quiproquos et doubles','Comparer connaissance du public et des personnages']},
  {id:'badine',title:'On ne badine pas avec l’amour',author:'Alfred de Musset',focus:'Sentiments et jeux de parole',angles:['Étudier orgueil et manipulation','Analyser le mélange des registres','Interpréter la portée du dénouement']},
  {id:'sarraute',title:'Pour un oui ou pour un non',author:'Nathalie Sarraute',focus:'Dispute et effets du langage',angles:['Analyser les sous-entendus','Étudier intonation et silence','Interroger la naissance du conflit']}
 ],
 poesie:[
  {id:'rimbaud',title:'Cahier de Douai',author:'Arthur Rimbaud',focus:'Création et émancipation',angles:['Étudier mouvement et fugue','Analyser les réécritures poétiques','Interroger les ruptures avec les normes']},
  {id:'ponge',title:'La rage de l’expression',author:'Francis Ponge',focus:'Fabrication du poème',angles:['Étudier les étapes du travail verbal','Analyser description et reprise','Interroger rapport entre mots et choses']},
  {id:'dorion',title:'Mes forêts',author:'Hélène Dorion',focus:'Nature et expérience intime',angles:['Étudier le motif de la forêt','Analyser voix rythme et images','Relier intime et monde contemporain']}
 ]
};
