import type { FrenchSpecialty } from './frenchSpecialties';
import type { CurriculumBranch } from './swissCurriculumCore';
import { ADDITIONAL_LLCER_THEMES } from './frenchAdditionalLanguages';

const arts = [
 ['plastiques','Arts plastiques','dessin, peinture, photographie, volume et installation',
  'Représentation|Choisir un point de vue|Expérimenter figuration et abstraction|Composer avec couleur et matière|Relier image et référent|Comparer des démarches',
  'Matérialité et présentation|Choisir support et processus|Construire un espace|Anticiper la relation au spectateur|Analyser exposition et diffusion|Justifier une installation'],
 ['cinema','Cinéma-audiovisuel','plans, montage, son, narration et mise en scène',
  'Écriture filmique|Analyser un plan|Construire un découpage|Étudier montage et durée|Relier son et image|Interpréter un point de vue',
  'Réalisation et réception|Définir une intention|Écrire un scénario|Organiser un tournage encadré|Monter une séquence|Analyser la réception'],
 ['danse','Danse','corps, espace, temps, énergie et composition chorégraphique',
  'Mouvement et composition|Explorer des qualités de mouvement|Organiser espace et temps|Transformer un motif|Composer en groupe|Analyser une chorégraphie',
  'Interprétation et création|Définir une intention chorégraphique|Affiner énergie et relation|Documenter les répétitions|Présenter une prestation encadrée|Comparer des interprétations'],
 ['histoire-arts','Histoire des arts','formes, contextes, circulations, institutions et patrimoines',
  'Lire les œuvres|Décrire les formes|Identifier techniques et matériaux|Contextualiser une commande|Comparer les réceptions|Construire une notice critique',
  'Arts et sociétés|Étudier circulation et emprunts|Analyser pouvoirs et institutions|Comparer conservation et transformation|Construire un corpus|Présenter une recherche argumentée'],
 ['musique','Musique','écoute, interprétation, écriture, arrangement et culture musicale',
  'Écouter et interpréter|Analyser forme et texture|Relier rythme et expression|Comparer timbres et orchestration|Interpréter vocalement ou instrumentalement|Situer une pratique musicale',
  'Projet musical|Définir une intention|Composer ou arranger|Répéter et ajuster|Enregistrer avec consentement|Commenter une réalisation'],
 ['theatre','Théâtre','jeu, dramaturgie, espace, voix et rencontre avec les spectacles',
  'Du texte au plateau|Analyser une situation dramatique|Travailler voix et corps|Construire une adresse|Explorer l’espace scénique|Comparer deux mises en scène',
  'Création théâtrale|Définir un projet dramaturgique|Expérimenter plusieurs propositions|Répéter collectivement|Tenir un carnet de bord|Présenter une scène et l’analyser'],
 ['cirque','Arts du cirque','composition, interprétation, histoire du cirque et pratique sécurisée',
  'Langages du cirque|Étudier les disciplines circassiennes|Analyser corps agrès et espace|Comprendre les règles de sécurité|Comparer les esthétiques|Observer une création',
  'Projet circassien|Définir une intention artistique|Composer une séquence adaptée|Répéter avec un encadrant habilité|Documenter la démarche|Analyser une prestation réelle']
] as const;

export const FRENCH_ART_SPECIALTIES: FrenchSpecialty[] = arts.map(([id,name,practice,row1,row2])=>({
 id:`spe-art-${id}`,family:'arts',name:`Spécialité Arts — ${name}`,domain:'Arts',
 objective:`Articuler pratique, culture et analyse en ${name.toLowerCase()} : ${practice}. Les œuvres du programme limitatif de l’année sont à fixer avec l’enseignant ; la pratique nécessite des conditions réelles adaptées.`,
 years:[[row1,row2,
  'Culture et références|Constituer un corpus diversifié|Situer les contextes de création|Comparer techniques et intentions|Rencontrer une œuvre ou un spectacle|Rédiger une analyse personnelle',
  'Démarche de projet|Formuler une question artistique|Expérimenter plusieurs réponses|Tenir un carnet de recherche|Présenter une production|Évaluer et réviser la démarche'],
 [row2,
  `Approfondir les langages|Analyser les choix de ${practice.split(',')[0]}|Comparer deux démarches de création|Construire une réponse personnelle au programme limitatif|Justifier un parti pris|Confronter intention et réception`,
  'Recherche et culture critique|Étudier les œuvres annuelles retenues|Croiser sources et observations|Analyser les conditions de production|Construire une problématique|Rédiger une synthèse critique',
  'Production et soutenance|Finaliser une réalisation|Documenter ses étapes|Préparer dossier et présentation|Répondre à des questions précises|Évaluer la pratique avec un référent']]
}));

const llcer = [
 ['de','Allemand',['Imaginaires et traditions','Mémoire et représentations'],['Voyages et circulation des idées','Fondements des liens sociaux germanophones','Mythologies de l’espace germanophone']],
 ['en','Anglais',['Imaginaires anglophones','Rencontres et altérité'],['Arts et débats','Expression et construction de soi','Voyages et migrations']],
 ['es','Espagnol',['Circulations des personnes et des idées','Diversité hispanophone'],['Imaginaires et réalités','Dominations et résistances','Espagne et Amérique latine dans le monde']],
 ['it','Italien',['Imaginaires italiens','Pouvoirs et contre-pouvoirs'],['Voyages','Contrastes et identités','Italie comme laboratoire culturel']],
 ...ADDITIONAL_LLCER_THEMES,
 ['en-amc','Anglais, monde contemporain',['Savoirs et créations','Représentations du monde'],['Faire société','Environnements en mutation','Relations au monde']]
] as const;

export const FRENCH_LLCER: FrenchSpecialty[] = llcer.map(([id,name,first,last])=>({
 id:`spe-llcer-${id}`,family:'llcer',language:id==='en-amc'?'en':id,name:`Spécialité LLCER — ${name}`,domain:'Langues et cultures',
 objective:`Analyser des documents authentiques et produire dans la langue ${name}. Objectif B2 en première, C1 en terminale, avec progression adaptée. Choisir les œuvres prescrites dans le programme limitatif applicable ; AMC travaille les dossiers contemporains.`,
 years:[first,last].map((themes,year)=>[
  ...themes.map(theme=>`${theme}|Situer les contextes historiques et culturels|Lire et interpréter un document authentique|Comparer un texte et une œuvre visuelle|Construire une argumentation dans la langue|Présenter un dossier sur une problématique précise`),
  year===0?'Lecture longue et langue|Lire les œuvres intégrales retenues|Analyser voix et structure|Enrichir lexique et syntaxe|Pratiquer la médiation|Écrire une synthèse comparative':'Approfondissement linguistique|Nuancer une interprétation|Structurer une synthèse de documents|Traduire ou transposer avec justification|Maîtriser les registres|Réviser précision et correction',
  year===0?'Interaction et culture|Présenter une lecture personnelle|Écouter et reformuler|Débattre d’un enjeu culturel|Citer et vérifier ses sources|Évaluer une prestation orale':'Dossier et épreuves|Constituer un dossier personnel|Relier documents et question|Soutenir une analyse dans la langue|Répondre spontanément|Composer une synthèse en temps limité'
 ])
}));

export const FRENCH_LLCA: FrenchSpecialty[] = (['latin','grec'] as const).map(language=>({
 id:`spe-llca-${language}`,family:'llca',language:language==='latin'?'la':'grc',name:`Spécialité LLCA — ${language==='latin'?'Latin':'Grec ancien'}`,domain:'Langues et cultures antiques',
 objective:`Lire et traduire en ${language}, confronter monde antique et monde contemporain, interpréter les œuvres intégrales du programme limitatif applicable.`,
 years:[[
  'Langue et traduction|Consolider morphologie nominale|Analyser le système verbal|Identifier subordination et participes|Construire une traduction raisonnée|Comparer des traductions',
  'Cité et individu|Étudier citoyenneté et exclusion|Comparer liberté et autorité|Lire un discours antique|Analyser un conflit politique|Relier texte et contexte',
  'Divin et humain|Interpréter mythe et rite|Comparer croyances et récits|Étudier héros et destin|Analyser la représentation du divin|Construire un dossier comparatif',
  'Méditerranée et échanges|Étudier les contacts culturels|Lire un récit de voyage|Analyser influences et circulations|Comparer passé et présent|Créer un portfolio argumenté'],
 [
  'Traduction approfondie|Analyser une syntaxe complexe|Justifier une interprétation grammaticale|Traduire un passage suivi|Commenter les choix lexicaux|Évaluer une traduction existante',
  'Expérience et condition humaine|Étudier émotions et passions|Interroger vie mort et bonheur|Lire un texte philosophique|Comparer les conceptions antiques|Rédiger une interprétation',
  'Monde et connaissance|Comparer explication mythique et rationnelle|Étudier savoirs et techniques|Lire une réflexion sur la nature|Analyser les limites de la connaissance|Construire une comparaison',
  'Œuvres et portfolio|Étudier le programme limitatif de l’année|Mettre en relation textes et arts|Construire un essai|Présenter une recherche personnelle|Préparer traduction et oral']
 ]
}));

export const LATIN_GREEK_OPTIONS: CurriculumBranch[] = (['latin','grec'] as const).map(language=>({
 id:`option-${language}`,name:`Option — ${language==='latin'?'Latin':'Grec ancien'}`,domain:'Langues antiques',objective:`Construire progressivement la lecture du ${language}, la traduction et une culture antique critique.`,
 years:[
  ['Entrer dans la langue|Lire alphabet et prononciation|Comprendre flexion et fonction|Reconnaître formes nominales|Identifier le verbe|Traduire une phrase simple',
   'Cultures antiques|Situer lieux et périodes|Lire un récit mythologique|Comparer vie quotidienne et citoyenneté|Relier étymologie et français|Constituer un carnet culturel'],
  ['Lire et traduire|Consolider les déclinaisons|Étudier les temps verbaux|Analyser les expansions|Traduire un passage guidé|Justifier ses choix',
   'Textes et sociétés|Étudier pouvoir et citoyenneté|Comparer figures héroïques|Lire un texte adapté|Relier monument et contexte|Présenter une recherche'],
  ['Approfondir la lecture|Analyser subordination et participes|Comparer des traductions|Lire un texte plus long|Enrichir le lexique|Commenter une difficulté',
   'Héritages et débats|Étudier les contacts méditerranéens|Comparer pensée antique et question actuelle|Analyser la réception d’une œuvre|Construire un portfolio|Soutenir une interprétation']]
}));
