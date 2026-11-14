import type { Subject } from '../types';
import { branchSubject } from './swissCurriculumCore';

export const FRENCH_ANNUAL_SOURCES = {
 first:'https://www.education.gouv.fr/bo/2025/Hebdo25/MENE2504606N',
 terminal:'https://www.education.gouv.fr/bo/2026/Hebdo21/MENE2611474N',
 arts:'https://www.education.gouv.fr/bo/2026/Hebdo4/MENE2536492N',
 antiquity:'https://www.education.gouv.fr/bo/2026/Hebdo11/MENE2605298N',
 dance:'https://eduscol.education.gouv.fr/5778/programmes-et-ressources-en-danse-voie-gt'
};
// Pedagogical selection from the official lists, not a claim that every listed
// alternative must be studied. Two literary works in première; three works in
// terminale, including a film for foreign languages. No copyrighted text/media.
export const LLCER_ANNUAL_WORKS:Record<string,[string[],string[]]>={
 de:[['Zweig — Schachnovelle|Enfermement et imagination','Kunze — Die wunderbaren Jahre|Mémoire et société est-allemande'],['Dürrenmatt — Die Physiker|Responsabilité et liens sociaux','Stanisic — Herkunft|Départ et appartenance','Wenders — Pina (film)|Corps et imaginaires']],
 en:[['Bradbury — Fahrenheit 451|Dystopie et liberté de lire','Lee — To Kill a Mockingbird|Rencontre et préjugés'],['Atwood — The Handmaid’s Tale|Art et contestation','Austen — Pride and Prejudice|Identité et normes sociales','Campion — The Piano (film)|Déplacement et voix']],
 es:[['Mendoza — Sin noticias de Gurb|Regard extérieur et circulation','Skármeta — No pasó nada|Exil et diversité'],['Neruda — Odas elementales|Poésie du quotidien','Mesa — La familia|Autorité et résistances','Bollaín — También la lluvia (film)|Histoire et mondialisation']],
 it:[['Calvino — Il barone rampante|Imaginaire et distance critique','Aleramo — Una donna|Autonomie et pouvoir'],['Mazzucco — Vita|Migration et voyage','Ginzburg — Lessico famigliare|Mémoire et identité','Cortellesi — C’è ancora domani (film)|Société et transformations']],
 pt:[['Ondjaki — Os da minha rua|Mémoire de l’enfance angolaise','Agualusa — Um estranho em Goa|Voyage et circulation'],['Ramos — Vidas Secas|Domination et précarité','Agualusa — A Rainha Ginga|Représentations historiques','Muylaert — Que horas ela volta (film)|Société brésilienne et changements']],
 eu:[['Etxepare — Linguae Vasconum Primitiae|Histoire littéraire basque','Atxaga — Behi euskaldun baten memoriak|Tradition narrative et invention'],['Aire Xalbador — Odolaren mintzoa|Attachement et poésie','Atxaga — Bi anai|Communauté et espaces ruraux','Txoperena — Ene baitan bizi da|Engagement et trajectoire personnelle']],
 br:[['Kervella — Mojennoù ar marv|Imaginaire et récits de mort','Hélias — Théâtre social|Collectif et scène'],['Riou — Geotenn ar Werc’hez|Pouvoir et société','Prigent — Kañv|Mémoire et deuil','Al Lay — Bilzig|Déplacements et changements']],
 ca:[['Llull — Llibre de les bèsties|Confluences de la fable','Rodoreda — La plaça del Diamant|Partage et voix narrative'],['Montellà — La Maternitat d’Elna|Engagement et conflits','Rusiñol — L’auca del senyor Esteve|Tradition et modernité','Sánchez Piñol — La pell freda|Imaginaire et altérité']],
 co:[['Dalzeto — Pesciu Anguilla|Réel et construction romanesque','Bonavita — U pane azimu|Rencontres et société'],['Poli — U cimiteriu di l’elefanti|Pouvoirs et mise à distance','Dalzeto — Filidatu è Filimonda|Vie sociale et liens','Appinzapallu — Raconti è fole di l’isula persa|Nature et imaginaire']],
 gcf:[['Telchid — Throvia de la Dominique|Imaginaire antillais','Jernidier — Vin vann!|Rencontres et oralité'],['Césaire — Discours sur le colonialisme|Engagement et argumentation en français','Jernidier — Joyeux anniversaire, Marta|Relations et sentiments en créole','Schwarz-Bart — L’Ancêtre en solitude|Mémoire et créolisation en français']],
 oc:[['Arbaud — La bèstio dóu Vacarés|Imaginaire et paysage','Pecout — Portulan I|Circulation et découverte'],['Mistral — Mirèio|Amour et expression poétique','Leclair — Dans la nef des fous, Peire Cardenal|Pouvoir et satire','Ganhaire — Lo pacient espanhòu|Adaptation et monde contemporain']],
 ty:[['Henry — Tahiti aux temps anciens|Terre et transmission','Porcher — Hina, Maui et compagnie|Mythes revisités'],['Hiro — Pehepehe i taù nūnaa|Parole et transmission','Devatine — Tergiversations et rêveries de l’écriture orale|Corps et oralité','Peu — Mutismes|Identité et rapports sociaux']]
};

const workRows=(title:string,angle:string)=>[
 `${title} — lecture|Situer l’auteur et le contexte de ${angle.toLowerCase()}|Lire ou visionner intégralement dans une édition autorisée|Construire une carte des voix et de la structure|Repérer les passages utiles à ${angle.toLowerCase()}|Tenir un carnet d’observations référencées`,
 `${title} — interprétation|Analyser le point de vue et ses effets|Relier les procédés à ${angle.toLowerCase()}|Étayer une interprétation par des indices précis|Comparer avec un document de la même thématique|Produire une synthèse puis défendre sa lecture`
];
const ARTS_TERMINAL:Record<string,string[]>={
 plastiques:[
  'Maman de Louise Bourgeois|Analyser échelle et déplacement du spectateur|Relier matériaux et portée symbolique|Comparer exposition et espace public|Étudier le rapport entre corps et architecture|Concevoir une réponse plastique argumentée',
  'Le Colosse de l’Apennin de Giambologna|Situer la commande et le jardin|Analyser roche eau et intervention humaine|Comparer espace intérieur et forme extérieure|Étudier paysage et réception|Mettre en regard le Colosse et Maman'],
 cinema:[
  'René Clair — Entr’acte et Paris qui dort|Situer l’avant-garde et le burlesque|Analyser rythme et montage|Comparer mouvement et immobilité|Étudier trucages et invention narrative|Écrire une analyse de séquence',
  'Tourneur — La Féline|Situer le studio et le genre|Analyser ombre et hors-champ|Étudier le rôle du son|Comparer explication rationnelle et fantastique|Défendre une interprétation filmique',
  'Assayas — Irma Vep, épisodes 1 à 3|Repérer l’arc des trois épisodes|Analyser le cinéma dans le cinéma|Étudier mise en scène et production|Comparer série et héritages filmiques|Construire une analyse croisée'],
 danse:[
  'Post-modern dance — programme terminale 2026|Situer le contexte américain|Analyser gestes ordinaires et composition|Comparer espace scénique et espaces quotidiens|Documenter une expérimentation adaptée|Argumenter sur une rupture esthétique',
  'Maguy Marin — démarche artistique|Situer la trajectoire de la chorégraphe|Analyser corps collectif et temporalité|Comparer deux œuvres de la démarche|Relier choix scéniques et portée politique|Présenter une réponse chorégraphique encadrée'],
 'histoire-arts':[
  'Viollet-le-Duc|Situer l’architecte dans le XIXe siècle|Étudier restauration et invention|Comparer projet dessin et réalisation|Discuter authenticité et patrimoine|Présenter un édifice étudié',
  'Paris capitale des arts, première moitié du XXe siècle|Cartographier foyers et circulations|Comparer deux avant-gardes|Analyser galeries et marché|Étudier échanges internationaux|Construire une synthèse transversale',
  'Femmes, féminité et féminisme|Distinguer représentation et création|Étudier obstacles institutionnels|Comparer deux trajectoires d’artistes|Analyser une réhabilitation critique|Construire un corpus argumenté'],
 musique:[
  'Armstrong et Fitzgerald — Porgy and Bess, 1958|Étudier l’Ouverture|Analyser Summertime|Comparer I Got Plenty O’ Nuttin’ et It Ain’t Necessarily So|Étudier Oh Lawd, I’m on My Way!|Comparer arrangement voix et version scénique',
  'C. P. E. Bach — Allegro assai du concerto Wq 172|Situer l’esthétique|Repérer forme et contrastes|Analyser dialogue soliste et ensemble|Comparer deux interprétations|Présenter une analyse auditive',
  'Machaut et Ciconia — écritures musicales|Analyser Ma fin est mon commencement|Étudier Le Ray au soleyl|Comparer canon et organisation temporelle|Relier partition et écoute|Expérimenter un procédé de composition',
  'Senleches et Cordier — graphismes|Étudier La Harpe de Mélodie|Analyser Tout par Compas suy composés|Comparer graphisme et réalisation sonore|Représenter une structure musicale|Présenter une création commentée'],
 theatre:[
  'Labiche et Marc-Michel — Un Chapeau de paille d’Italie|Lire la pièce entière|Analyser mécanique et rythme comiques|Étudier la mise en scène Corsetti de 2012|Comparer texte et captation|Expérimenter puis justifier un choix de jeu',
  'Voyages romanesques — Lazar et La Rêveuse|Lire le texte adapté de Cyrano|Analyser L’Autre Monde|Relier musique et récit scénique|Étudier adresse et imaginaire|Présenter une proposition dramaturgique',
  'Voyages romanesques — Gulliver|Situer l’adaptation de Swift|Analyser le travail de Lesort et Hecq|Étudier manipulation échelle et corps|Comparer avec L’Autre Monde|Soutenir un projet à partir du corpus'],
 cirque:[
  'Jonglages|Comparer familles et techniques observées|Analyser objet corps espace et rythme|Étudier composition et présence|Documenter une recherche encadrée|Justifier une proposition artistique',
  'Rasposo — Hourvari|Situer le spectacle de 2024|Analyser dramaturgie et scénographie|Étudier rapport au public|Comparer risque perçu et composition|Construire une lecture critique sourcée']
};

export function appendAnnualWorks(subjects:Subject[],year:1|2|3,prefix:string):void {
 if(year===1)return;
 for(const s of subjects){
  let rows:string[]=[];let source='';
  const llcer=s.id.match(/-spe-llcer-(.+)$/)?.[1];
  if(llcer&&LLCER_ANNUAL_WORKS[llcer]){
   rows=LLCER_ANNUAL_WORKS[llcer][year-2].flatMap(w=>{const[t,a]=w.split('|');return workRows(t,a);});source=year===2?FRENCH_ANNUAL_SOURCES.first:FRENCH_ANNUAL_SOURCES.terminal;
  }
  const art=s.id.match(/-spe-art-(.+)$/)?.[1];const isOption=s.id.includes('-option-');
  if(art&&!isOption){source=FRENCH_ANNUAL_SOURCES.arts;
   if(year===3)rows=ARTS_TERMINAL[art]??[];
   else if(art==='danse')rows=[
    'De Keersmaeker — Rosas danst Rosas|Situer la création|Analyser répétition et variation|Étudier gestes et rythme|Comparer groupe et individualité|Composer une étude encadrée',
    'Angelin Preljocaj|Situer sa démarche|Comparer deux pièces|Analyser corps et narration|Relier musique espace et mouvement|Justifier une recherche chorégraphique',
    'Danses urbaines de la rue à la scène|Situer des pratiques urbaines|Comparer contextes de représentation|Analyser transformation des codes|Étudier une compagnie choisie|Présenter une recherche sourcée'];
   if(year===3&&art==='danse')source=FRENCH_ANNUAL_SOURCES.dance;
  }
  if(year===3&&s.id.endsWith('-spe-llca-latin')){source=FRENCH_ANNUAL_SOURCES.antiquity;rows=[...workRows('Ovide — Tristes, livre III','Exil et écriture du destin'),...workRows('Blixen — La ferme africaine','Perte et mémoire'), 'Confrontation Ovide et Blixen|Comparer les situations d’éloignement|Étudier la construction du narrateur|Traduire et commenter un extrait latin|Analyser les rapports au lieu|Rédiger un essai comparatif'];}
  if(year===3&&s.id.endsWith('-spe-llca-grec')){source=FRENCH_ANNUAL_SOURCES.antiquity;rows=[...workRows('Lucien — Histoires vraies','Vérité et fiction'),...workRows('Calvino — Le baron perché','Distance critique et liberté'), 'Confrontation Lucien et Calvino|Comparer les voyages imaginaires|Analyser la distance au monde|Traduire et commenter un extrait grec|Comparer satire et réflexion|Rédiger un essai comparatif'];}
  if(isOption&&art==='musique'){source=FRENCH_ANNUAL_SOURCES.arts;rows=[
   'Ti Milo — Mona et Admiral T|Situer les deux versions|Comparer timbres et rythmes|Étudier transmission et transformation|Analyser identité et mondialisation|Créer une médiation musicale',
   'Chants polynésiens|Écouter Himéné tarava|Étudier Haka Enana|Comparer fonctions collectives et rituelles|Identifier les contextes sans les confondre|Présenter une écoute documentée',
   'Maloya — Waro et Wati Watia Zorey Band|Écouter Laviyon|Étudier Rest’ là Maloya|Comparer mémoire et création|Analyser voix rythme et instrumentation|Réaliser un projet musical commenté'];}
  if(isOption&&art==='theatre'&&year===3){source=FRENCH_ANNUAL_SOURCES.arts;rows=['Rêve et merveille|Constituer un corpus dramaturgique|Comparer procédés du merveilleux|Expérimenter espace et lumière|Créer une scène collective|Analyser la réception du projet'];}
  if(isOption&&art==='histoire-arts'&&year===2){source=FRENCH_ANNUAL_SOURCES.arts;rows=['Siècle d’or hollandais|Situer économie société et commandes|Étudier une œuvre de Rembrandt|Analyser L’Art de la peinture de Vermeer|Comparer peinture architecture et arts décoratifs|Discuter représentations et circulations coloniales'];}
  if(!rows.length)continue;
  const extra=branchSubject({id:'corpus-annuel',name:'Corpus 2026–2027',domain:s.domain??'Culture',objective:`Étude des références retenues pour 2026–2027. Source officielle : ${source}. Utiliser une édition ou une captation légalement accessible ; les œuvres ne sont pas reproduites.`,years:[rows]},1,s.id);
  s.modules.push(...extra.modules);s.chapterCount=s.modules.reduce((n,m)=>n+m.items.length,0);
 }
}
