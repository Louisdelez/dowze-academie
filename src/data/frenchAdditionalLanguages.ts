import type { Subject, CefrLevel } from '../types';
import { branchSubject } from './swissCurriculumCore';

export const ADDITIONAL_FRENCH_LANGUAGES = {
 pt:['Portugais','Portugal, Brésil et pays africains lusophones','nasalisation, conjugaison et place des pronoms'],
 eu:['Basque','Pays basque de part et d’autre des Pyrénées','déclinaison, ergativité et auxiliaires'],
 br:['Breton','Bretagne et diasporas bretonnes','mutations consonantiques, conjugaison et ordre verbal'],
 ca:['Catalan','Catalogne, Roussillon, Baléares et autres espaces catalanophones','pronoms faibles, accents et conjugaison'],
 co:['Corse','Corse et circulations méditerranéennes','variation dialectale, consonantisme et conjugaison'],
 gcf:['Créole guadeloupéen','Guadeloupe, avec comparaisons explicites des aires créoles','marqueurs de temps-aspect-mode, détermination et graphie'],
 oc:['Occitan','espaces occitans et leurs variétés','variation dialectale, accentuation et conjugaison'],
 ty:['Tahitien','Polynésie française et monde océanien','longueur vocalique, occlusive glottale et particules verbales']
} as const;
export type AdditionalLanguage=keyof typeof ADDITIONAL_FRENCH_LANGUAGES;

// Original CEFR learning sequences, not relabelled English content.
export function additionalSchoolLanguage(code:AdditionalLanguage,level:CefrLevel,id:string,half?:0|1):Subject {
 const [name,area,grammar]=ADDITIONAL_FRENCH_LANGUAGES[code];
 const beginner=level==='A1'||level==='A2';
 const themes=beginner?[
  ['Sons et écriture','Reconnaître les sons sur un enregistrement','Lire une graphie avec un modèle audio','Distinguer les mots par leur prononciation','Écrire sous dictée guidée','Se corriger avec une référence'],
  ['Se présenter','Saluer selon la situation','Donner son identité','Poser une question personnelle simple','Comprendre une présentation','Échanger un bref dialogue'],
  ['Personnes et relations','Décrire une personne','Présenter ses proches','Exprimer une possession','Comprendre un portrait','Écrire une présentation liée'],
  ['Vie quotidienne','Nommer des activités','Situer une heure','Décrire une habitude','Comprendre une consigne','Raconter une journée'],
  ['Lieux et déplacements','Décrire un lieu','Demander une direction','Lire un plan contextualisé','Comprendre un itinéraire oral','Expliquer un trajet'],
  ['Besoins et services','Exprimer un besoin','Comprendre quantité et prix','Demander une information','Réagir à un imprévu simple','Jouer une interaction de service'],
  ['Raconter au passé','Repérer les indices temporels','Distinguer états et actions','Relier deux événements','Comprendre un récit court','Raconter une expérience'],
  ['Projets et préférences','Exprimer un goût','Comparer deux possibilités','Proposer une activité','Accepter ou refuser poliment','Présenter un projet'],
  ['Culture et documents','Situer un document dans son aire','Comprendre son idée principale','Relever des indices culturels','Éviter une généralisation abusive','Présenter une découverte'],
  ['Langue en contexte',`Observer ${grammar}`,'Construire une phrase correcte','Transformer une phrase en question','Employer la négation','Réviser une production courte'],
  ['Écoute et médiation','Repérer les mots clés','Demander de répéter','Reformuler une information','Transmettre un message pratique','Vérifier la compréhension mutuelle'],
  ['Projet de niveau','Préparer une rencontre','Mobiliser un lexique adapté','Produire un document personnel','Présenter oralement','Évaluer ses acquis et besoins']
 ]:[
  ['Comprendre des documents','Identifier genre et destinataire','Repérer les arguments','Distinguer fait et opinion','Interpréter un implicite adapté au niveau','Confronter deux points de vue'],
  ['Récits et temporalité','Organiser les temps du récit','Exprimer antériorité et durée','Décrire une évolution','Restituer une expérience','Réviser la cohésion'],
  ['Identité et société','Décrire une appartenance complexe','Interpréter un témoignage','Analyser une représentation sociale','Comparer des parcours','Présenter un portrait nuancé'],
  ['Territoires et mémoire','Lire une source historique contextualisée','Expliquer un lieu de mémoire','Comparer deux récits du passé','Analyser une continuité','Rédiger une synthèse'],
  ['Argumenter','Formuler une thèse','Construire un exemple probant','Exprimer cause et conséquence','Introduire une concession','Conclure sans répéter'],
  ['Langue et précision',`Approfondir ${grammar}`,'Nuancer la modalité','Employer une subordination adaptée','Contrôler les reprises pronominales','Réviser registre et idiomaticité'],
  ['Médias et citoyenneté','Comparer deux sources authentiques','Identifier le cadrage éditorial','Vérifier une affirmation','Préparer une revue de presse','Débattre avec preuves'],
  ['Arts et littératures','Situer une œuvre','Analyser voix et point de vue','Interpréter une image','Comparer une adaptation','Soutenir une lecture personnelle'],
  ['Environnement et transformations','Comprendre un enjeu territorial','Interpréter des données','Comparer des solutions','Nuancer une prévision','Présenter un projet argumenté'],
  ['Interaction orale','Écouter pour répondre','Reformuler une objection','Demander une précision','Défendre un point de vue','Évaluer intelligibilité et spontanéité'],
  ['Médiation','Sélectionner une information utile','Adapter au destinataire','Expliquer une référence culturelle','Comparer sans calquer les langues','Vérifier la fidélité du message'],
  ['Projet et bilan','Définir une question','Construire un dossier sourcé','Rédiger une production suivie','Présenter et répondre','Établir son bilan de compétences']
 ];
 const rows=themes.map(t=>t.join('|'));const selected=half===undefined?rows:rows.slice(half*6,half*6+6);
 const subject=branchSubject({id:'langue',name:`${name} — ${level}`,domain:'Langues',objective:`Travailler exclusivement en ${name} avec des supports authentiques de ${area}. Objectif ${level} ; différencier selon le diagnostic. Étudier ${grammar}. La variété et la norme graphique sont identifiées dans chaque source, sans mélanger les langues créoles.`,years:[selected]},1,id);
 subject.id=id; // reidentify every reference rather than exposing a generated suffix.
 subject.languageCode=code;subject.languageName=name;subject.cefrLevel=level;
 for(const m of subject.modules)m.cefrLevel=level;
 return subject;
}

export const ADDITIONAL_LLCER_THEMES = [
 ['pt','Portugais',['Circulations humaines et idées','Mémoire et représentations lusophones'],['Imaginaires et réalités lusophones','Domination et contestation','Aires lusophones et création']],
 ['eu','Basque',['Histoire littéraire basque','Création entre tradition et modernité'],['Exprimer l’amour et l’attachement','Engagement et développement durable','Villes et espaces ruraux']],
 ['br','Breton',['Imaginaires bretons','Formes du collectif'],['Pouvoirs et contre-pouvoirs','Mémoire et représentations','Circulations humaines et culturelles']],
 ['ca','Catalan',['Confluences catalanes','Partages et échanges'],['Débats et défis','Permanence et modernité','Imaginaires catalans']],
 ['co','Corse',['Mondes rêvés et réel','Rencontres corses'],['Pouvoirs et contestations','Vie économique et sociale','Nature et humanité']],
 ['gcf','Créole guadeloupéen',['Imaginaires créoles','Rencontres et héritages'],['Engagement','Créolisation et métissages','Expression des sentiments']],
 ['oc','Occitan',['Imaginaires occitans','Circulations des langues et cultures'],['Amour et expressions','Lieux du pouvoir','Adaptations au monde']],
 ['ty','Tahitien',['Mer et terres','Tahiti et ses mythes'],['Parole et fonctions sociales','Corps et relation au monde','Identité et altérité']]
] as const;
