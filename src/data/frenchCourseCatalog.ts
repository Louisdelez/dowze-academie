import type { Subject, CefrLevel } from '../types';
import type { FormationPackageFiles } from '../lib/formations';
import type { FormationChoiceGroup, FormationChoiceOption } from '../lib/formationChoices';
import { packageFiles, languageSubject, languageHalf, reidentify } from './courseCatalog';
import { branchSubject, type CurriculumBranch } from './swissCurriculumCore';
import { FRENCH_COLLEGE } from './frenchCollegeCurriculum';
import { COLLEGE_COMMON } from './frenchCommonCurriculum';
import { LYCEE_CORE, SECONDE_SCIENCES } from './frenchLyceeCore';
import { FRENCH_SPECIALTIES, type FrenchSpecialty } from './frenchSpecialties';
import { FRENCH_ART_SPECIALTIES, FRENCH_LLCER, FRENCH_LLCA, LATIN_GREEK_OPTIONS } from './frenchArtsLanguages';
import { FRENCH_MATH_SPECIFIC, TERMINALE_OPTIONS, SECONDE_TECH_OPTIONS, FRENCH_WORKS } from './frenchOptions';

import { appendAnnualWorks } from './frenchAnnualWorks';
import { ADDITIONAL_FRENCH_LANGUAGES, additionalSchoolLanguage, type AdditionalLanguage } from './frenchAdditionalLanguages';

const json=(v:unknown)=>JSON.stringify(v,null,2)+'\n';
export const FRENCH_LANGUAGES={en:'Anglais',de:'Allemand',es:'Espagnol',it:'Italien'};
type Language=keyof typeof FRENCH_LANGUAGES;
const lyceeLanguageNames:Record<string,string>={...FRENCH_LANGUAGES,...Object.fromEntries(Object.entries(ADDITIONAL_FRENCH_LANGUAGES).map(([code,entry])=>[code,entry[0]]))};
const lyceeLanguageCodes=Object.keys(lyceeLanguageNames);
const foreignLanguage=(code:string)=>code in FRENCH_LANGUAGES||code==='pt';
const languages=Object.keys(FRENCH_LANGUAGES) as Language[];
const option=(id:string,label:string,subjectIds:string[],description:string,excludes:string[]=[]):FormationChoiceOption=>({id,label,subjectIds,description,excludes});
export const ALL_FRENCH_SPECIALTIES:FrenchSpecialty[]=[...FRENCH_SPECIALTIES,...FRENCH_ART_SPECIALTIES,...FRENCH_LLCER,...FRENCH_LLCA];

function frenchPackage(id:string,name:string,label:string,subjects:Subject[],groups:FormationChoiceGroup[],pathway:{id:string;name:string;yearIndex:number;yearCount:number},framework:string):FormationPackageFiles {
 for(const s of subjects){
  s.shortName=s.shortName?.trim();
  for(const m of s.modules)for(const c of m.items)for(const l of c.lessons??[])l.objective=l.objective?.replace(/adaptée à l’année \d+/g,`adaptée à la classe de ${label.toLowerCase()}`);
 }
 const files=packageFiles(id,name,label,subjects,groups,pathway,true);
 const manifest=JSON.parse(files['formation.json']);
 Object.assign(manifest,{locale:'fr-FR',timeZone:'Europe/Paris',grading:{scaleMax:20,passMark:10},
  level:{label,framework,targetAudience:'Élèves ayant acquis les prérequis de la classe précédente ; progression personnelle à adapter avec les enseignants.'},
  description:`${name} : progression originale détaillée, année scolaire2026-2027. Matières, notions, entraînements et bilans pour le tuteur IA. Choisir selon les enseignements réellement suivis. Les créneaux de25minutes organisent un travail personnel et se réaménagent après sélection ; ils ne reproduisent ni l’horaire officiel ni les vacances d’une académie. Dowze ne délivre pas le brevet ou le baccalauréat.`,
  objectives:['Acquérir les connaissances et méthodes de chaque matière de la classe.','Pratiquer les langues, arts, activités physiques et expériences dans des conditions réelles adaptées.','Préparer les évaluations avec des sujets et corrections distincts, sans confondre bilan formatif et résultat officiel.']});
 files['formation.json']=json(manifest);
 const tasks=JSON.parse(files['taches.json']);
 tasks.tasks.unshift({id:'referentiel-france',title:'Vérifier avec l’établissement les programmes2026-2027, langues, options, œuvres et modalités d’examen ; adapter le planning à son académie.',dueAt:'2026-09-02T17:00',priority:'high'});
 if(label==='Première générale'||label==='Terminale générale')tasks.tasks.push({id:'oeuvres-limitatives',title:'Fixer avec l’enseignant les œuvres et objets du programme limitatif des spécialités choisies ; conserver les références et lire les œuvres intégrales légalement accessibles.',dueAt:'2026-09-10T17:00',priority:'high'});
 if(label==='Terminale générale')tasks.tasks.push({id:'continuite-specialites',title:'Confirmer que les deux spécialités conservées sont celles étudiées en première ; tout changement exceptionnel exige un examen des prérequis avec le lycée.',dueAt:'2026-09-03T17:00',priority:'high'});
 files['taches.json']=json(tasks);
 // Compact serialization keeps alternative subjects within the installed import contract.
 const program=JSON.parse(files['programme.json']);
 for(const p of program.programs)for(const m of p.modules)for(const c of m.items)for(const l of c.lessons??[])l.objective=`${label} : ${l.title}. Comprendre la notion, analyser un exemple guidé, réaliser un exercice autonome et justifier la correction.`;
 files['programme.json']=JSON.stringify(program)+'\n';
 for(const name of Object.keys(files) as (keyof FormationPackageFiles)[]){const value=files[name];if(value!==undefined)files[name]=JSON.stringify(JSON.parse(value))+'\n';}
 return files;
}

function schoolLanguage(language:string,level:CefrLevel,id:string,half?:0|1):Subject {
 const full=language in ADDITIONAL_FRENCH_LANGUAGES?additionalSchoolLanguage(language as AdditionalLanguage,level,id):languageSubject(language as Language,level,id);const subject=half===undefined?full:languageHalf(full,half);
 subject.languageName=lyceeLanguageNames[language];subject.name=`${lyceeLanguageNames[language]} — ${level}${half===undefined?'':` · partie${half+1}/2`}`;
 subject.objective=`${subject.objective??''} Pratiquer compréhension, expression, interaction et médiation dans la langue choisie ; le niveau est un objectif de progression, pas une certification.`;
 return subject;
}

function cultureLanguage(subject:Subject,year:number,lycee:boolean):void {
 const areas:Record<Language,string>={en:'mondes britannique, irlandais, nord-américain et autres espaces anglophones',de:'Allemagne, Autriche et Suisse germanophone',es:'Espagne et Amérique hispanophone',it:'régions italiennes et communautés italophones'};
 const area=areas[subject.languageCode as Language]??ADDITIONAL_FRENCH_LANGUAGES[subject.languageCode as AdditionalLanguage]?.[1];
 const themes=lycee?[
  ['Identités et relations','Vivre entre générations','Passés et présents','Défis et transitions','Création et représentation','Aire culturelle choisie'],
  ['Identités et échanges','Diversité et inclusion','Art et pouvoir','Innovations et responsabilité','Espaces publics et privés','Mémoire et territoires'],
  ['Citoyenneté numérique','Fiction et réalité','Diversité et engagement','Territoire et mémoire','Responsabilité scientifique','Identités en mouvement']
 ][year-1]:[
  ['Personnes et personnages','Quotidien et lieux de vie','Paysages et environnement','Récits et imaginaire','Arts et culture','Pays et régions'],
  ['Portraits et relations','Quotidien et diversité','Culture et créations','Sport et société','Nature et territoires','Voyager et rencontrer'],
  ['Langages et médias','École et société','Voyages et rencontres','Héritages et imaginaires'],
  ['Cultures et échanges','Engagement et médias','Histoire et mémoire','Projet et avenir']
 ][year-1];
 const branch:CurriculumBranch={id:'culture',name:'Culture dans la langue',domain:'Langues',objective:`Explorer ${area} à partir de supports authentiques adaptés au niveau ; ces séquences originales accompagnent le programme linguistique de la classe.`,years:[themes.map(theme=>`${theme}|Comprendre un document contextualisé dans la langue|Comparer deux situations culturelles sans stéréotype|Employer le lexique dans une tâche guidée|Interagir ou pratiquer une médiation|Présenter une production personnelle sourcée`)]};
 const cultural=branchSubject(branch,1,subject.id);subject.modules.push(...cultural.modules);subject.chapterCount=subject.modules.reduce((n,m)=>n+m.items.length,0);
}

function collegeLanguageGroups(year:number,prefix:string,subjects:Subject[]):FormationChoiceGroup[] {
 return [1,2].map(slot=>({id:`lv${slot}`,label:slot===1?'Langue vivante I':year===1?'Deuxième langue — bilangue facultative':'Langue vivante II',description:slot===1?'Continuer la langue étudiée à l’école primaire ; vérifier l’offre de l’établissement.':year===1?'Une seconde langue peut être proposée en sixième bilangue. Elle devient obligatoire dans le parcours ordinaire à partir de la cinquième.':'Choisir une langue distincte et conserver une progression cohérente avec les années précédentes.',options:[
  ...(year===1&&slot===2?[option('lv2-sans','Sans bilangue',[],'Suivre une langue en sixième.')]:[]),
  ...languages.map(l=>{
   const level:CefrLevel=slot===1?(year===1?'A1':year===4?'B1':'A2'):(year<=2?'A1':'A2');
   const half:0|1|undefined=slot===1?(year===2?0:year===3?1:year===4?0:undefined):(year===3?0:year===4?1:undefined);
   const s=schoolLanguage(l,level,`${prefix}-lv${slot}-${l}`,half);cultureLanguage(s,year,false);subjects.push(s);
   return option(`lv${slot}-${l}`,FRENCH_LANGUAGES[l],[s.id],`Progression ${level}, à ajuster par un diagnostic initial.`,[`lv${slot===1?2:1}-${l}`]);
  })
 ]}));
}

function antiquityOptions(prefix:string,subjects:Subject[],groups:FormationChoiceGroup[],year:number,college:boolean):void {
 for(const [index,b] of LATIN_GREEK_OPTIONS.entries()) {
  if(college&&(year===1||(index===1&&year<4)))continue;
  const s=branchSubject(b,college?(index===1?1:Math.min(year-1,3)):year,prefix);s.languageCode=index===0?'la':'grc';s.languageName=index===0?'Latin':'Grec ancien';subjects.push(s);
  groups.push({id:b.id,label:b.name,description:'Enseignement facultatif ; confirmer l’offre et les prérequis avec l’établissement.',options:[option(`${b.id}-sans`,'Sans cette option',[],'Ne pas ajouter cette matière.'),option(`${b.id}-oui`,s.languageName,[s.id],b.objective)]});
 }
}

export function createFrenchCollegePackage(year:1|2|3|4):FormationPackageFiles {
 const label=['Sixième','Cinquième','Quatrième','Troisième'][year-1];const prefix=`fr-college-a${year}`;
 const subjects=[...FRENCH_COLLEGE,...COLLEGE_COMMON].filter(b=>b.years[year-1]?.length).map(b=>branchSubject(b,year,prefix));
 const groups=collegeLanguageGroups(year,prefix,subjects);antiquityOptions(prefix,subjects,groups,year,true);
 return frenchPackage(`dowze-fr-college-a${year}-2026`,`Collège France — ${label}`,label,subjects,groups,{id:'college-france',name:'Collège français',yearIndex:year,yearCount:4},year===1?'France — cycle3, programmes applicables en2026-2027':year===2?'France — cycle4, nouveaux français/mathématiques/langues2026':'France — cycle4, programmes applicables en2026-2027 ; français/mathématiques2020, EMC2024, technologie2024');
}

function lyceeLanguages(year:number,prefix:string,subjects:Subject[]):FormationChoiceGroup[] {
 return ['a','b'].map(slot=>({id:`lv${slot}`,label:`Langue vivante ${slot.toUpperCase()}`,description:'Langues distinctes, poursuivies selon le parcours et les possibilités du lycée. LVA vise B2 en fin de lycée et LVB B1 ; une remise à niveau peut être nécessaire.',options:lyceeLanguageCodes.filter(l=>slot!=='a'||foreignLanguage(l)).map(l=>{
  const level:CefrLevel=slot==='a'?(year===1?'B1':'B2'):(year===1?'A2':'B1');
  const s=schoolLanguage(l,level,`${prefix}-lv${slot}-${l}`,year===1?undefined:year===2?0:1);cultureLanguage(s,year,true);subjects.push(s);
  return option(`lv${slot}-${l}`,lyceeLanguageNames[l],[s.id],`Progression ${level} en compréhension, expression, interaction et médiation.`,[...(slot==='a'||foreignLanguage(l)?[`lv${slot==='a'?'b':'a'}-${l}`]:[]),`option-lvc-${l}`]);
 })}));
}

function generalOption(year:number,prefix:string,subjects:Subject[]):FormationChoiceGroup {
 const options=[option('option-generale-sans','Sans option générale',[],'Conserver le tronc commun et les spécialités.')];
 for(const l of lyceeLanguageCodes){const s=schoolLanguage(l,year===1?'A1':year===2?'A2':'B1',`${prefix}-lvc-${l}`);subjects.push(s);options.push(option(`option-lvc-${l}`,`Langue C — ${lyceeLanguageNames[l]}`,[s.id],'Troisième langue distincte des langues A et B.',[...(foreignLanguage(l)?[`lva-${l}`]:[]),`lvb-${l}`]));}
 for(const b of FRENCH_ART_SPECIALTIES.filter(b=>year===1||b.id!=='spe-art-cirque')){
  const s=reidentify(branchSubject(b,year===3?2:1,prefix),`${prefix}-option-${b.id}`);s.name=b.name.replace('Spécialité Arts','Option Arts');s.objective=`Pratique artistique optionnelle et culture en ${s.name}. Adapter l’exigence à l’option, distincte de la spécialité.`;subjects.push(s);options.push(option(`option-${b.id}`,s.name,[s.id],s.objective));
 }
 const eps=reidentify(branchSubject(LYCEE_CORE.find(b=>b.id==='eps')!,year,prefix),`${prefix}-option-eps`);eps.name='Option — Éducation physique et sportive';subjects.push(eps);options.push(option('option-eps',eps.name,[eps.id],'Pratique supplémentaire réelle et encadrée ; incompatible avec la spécialité EPPCS.'));
 return {id:'option-generale',label:'Enseignement optionnel général',description:'Au plus une option parmi celles proposées ici ; latin et grec peuvent s’ajouter séparément. Vérifier l’offre réelle du lycée.',options};
}

function specialtyGroups(year:2|3,prefix:string,subjects:Subject[],general:FormationChoiceGroup):FormationChoiceGroup[] {
 const specs=ALL_FRENCH_SPECIALTIES;
 for(const b of specs){const s=branchSubject(b,year-1,prefix);if(b.language){s.languageCode=b.language;s.languageName=b.name.split(' — ').at(-1)!;}subjects.push(s);}
 const count=year===2?3:2;
 const ordinary=specs.filter(b=>b.family!=='llcer');
 const lists=Array.from({length:count},(_,index)=>[
  ...ordinary.map(b=>({...option(`s${index+1}-${b.id}`,b.name,[`${prefix}-${b.id}`],b.objective,b.family==='eppcs'?['option-eps']:[]),family:b.family})),
  {...option(`s${index+1}-spe-llcer`,'Spécialité LLCER — langue à préciser',[],'Préciser ensuite la langue et son rattachement à LVA, LVB ou LVC.'),family:'llcer'}
 ]);
 for(const [i,list]of lists.entries())for(const o of list)o.excludes.push(...lists.flatMap((others,j)=>i===j?[]:others.filter(x=>x.family===o.family).map(x=>x.id)));
 const groups:FormationChoiceGroup[]=lists.map((list,i)=>({id:`specialite-${i+1}`,label:`Spécialité ${i+1}${year===3?' conservée de première':''}`,description:year===2?'Trois familles distinctes ; choisir ensuite la variante de LLCER si retenue.':'Deux spécialités conservées depuis la première ; confirmer les prérequis.',options:list.map(({family,...o})=>o)}));
 groups.push({id:'llcer-position',label:'Place de la spécialité LLCER',description:'Indiquer son emplacement ou son absence pour activer uniquement le programme linguistique choisi.',options:[
  option('llcer-position-sans','Sans spécialité LLCER',[],'Aucun programme LLCER ajouté.',lists.map((_,i)=>`s${i+1}-spe-llcer`)),
  ...lists.map((list,i)=>option(`llcer-position-${i+1}`,`LLCER en spécialité ${i+1}`,[],'La langue est précisée dans le choix suivant.',list.filter(o=>o.family!=='llcer').map(o=>o.id)))
 ]});
 groups.push({id:'llcer-langue',label:'Langue de la spécialité LLCER',description:'La langue doit être effectivement suivie en A, B ou C. AMC est une variante de la famille LLCER.',options:[
  option('llcer-langue-sans','Sans spécialité LLCER',[],'Conserver les autres spécialités.',lists.map((_,i)=>`llcer-position-${i+1}`)),
  ...specs.filter(b=>b.family==='llcer').flatMap(b=>(['a','b','c'] as const).filter(slot=>slot!=='a'||foreignLanguage(b.language!)).map(slot=>option(`llcer-${b.language==='en'&&b.id.endsWith('amc')?'en-amc':b.language}-lv${slot}`,`${b.name} · langue ${slot.toUpperCase()}`,[`${prefix}-${b.id}`],b.objective,['llcer-position-sans',...(slot==='c'?general.options.filter(o=>o.id!==`option-lvc-${b.language}`).map(o=>o.id):lyceeLanguageCodes.filter(l=>l!==b.language&&(slot!=='a'||foreignLanguage(l))).map(l=>`lv${slot}-${l}`))])))
 ]});
 return groups;
}

function mathsChoice(year:2|3,prefix:string,subjects:Subject[],specGroups:FormationChoiceGroup[]):FormationChoiceGroup {
 const mathsIds=specGroups.map((g,index)=>`s${index+1}-spe-maths`);
 if(year===2){
  const s=branchSubject(FRENCH_MATH_SPECIFIC,1,prefix);subjects.push(s);
  return {id:'parcours-maths',label:'Parcours de mathématiques en première',description:'Sans spécialité mathématiques, l’enseignement spécifique est obligatoire. Avec la spécialité, indiquer le choix où elle figure ; tous préparent l’épreuve anticipée.',options:[option('maths-sans-spe','Sans spécialité — mathématiques spécifiques',[s.id],FRENCH_MATH_SPECIFIC.objective,mathsIds),...specGroups.map((g,index)=>option(`maths-spe-${index+1}`,`Spécialité mathématiques retenue en choix ${index+1}`,[],'La spécialité prépare le sujet qui lui correspond.',g.options.filter(o=>o.id!==mathsIds[index]).map(o=>o.id)))]};
 }
 const options=[option('term-option-sans','Sans option supplémentaire de terminale',[],'Conserver le programme retenu.')];
 for(const b of TERMINALE_OPTIONS){const s=branchSubject(b,1,prefix);subjects.push(s);
  if(b.id==='maths-expertes')for(const[gIndex,g]of specGroups.entries())options.push(option(`expertes-${gIndex+1}`,`Mathématiques expertes — spécialité en choix ${gIndex+1}`,[s.id],b.objective,g.options.filter(o=>o.id!==mathsIds[gIndex]).map(o=>o.id)));
  else options.push(option(b.id,b.name,[s.id],b.objective,b.id==='maths-complementaires'?mathsIds:[]));
 }
 return {id:'option-terminale',label:'Option supplémentaire de terminale',description:'Mathématiques expertes avec spécialité mathématiques, complémentaires sans elle, ou DGEMC. Une seule de ces options.',options};
}

function worksGroups(prefix:string,subjects:Subject[]):FormationChoiceGroup[]{
 return Object.entries(FRENCH_WORKS).map(([genre,works])=>({id:`oeuvre-${genre}`,label:`Œuvre de français — ${genre==='idees'?'littérature d’idées':genre==='poesie'?'poésie':genre==='theatre'?'théâtre':'roman et récit'}`,description:'Une des trois œuvres nationales2026-2027 et son parcours ; sélectionner celle retenue par le professeur. Le texte intégral reste à lire dans une édition autorisée.',options:works.map(w=>{
  const b:CurriculumBranch={id:`oeuvre-${w.id}`,name:`${w.author} — ${w.title}`,domain:'Français',objective:`Étudier ${w.title} de ${w.author}, en lien avec ${w.focus.toLowerCase()}. Ne pas reproduire une édition protégée.`,years:[[
   `Lecture intégrale|Situer l’œuvre et son auteur|Construire un calendrier de lecture|Repérer structure voix et étapes|Tenir un carnet de citations brèves|Formuler une première interprétation`,
   `Analyse de l’œuvre|${w.angles.join('|')}|Comparer deux passages|Relier forme et portée`,
   'Parcours et épreuves|Confronter une œuvre du parcours associé|Construire une question de dissertation|Rédiger un paragraphe argumenté|Préparer une explication linéaire|Présenter une lecture personnelle'
  ]]};
  const s=branchSubject(b,1,prefix);subjects.push(s);return option(`lecture-${w.id}`,s.name,[s.id],b.objective);
 })}));
}

export function createFrenchLyceePackage(year:1|2|3):FormationPackageFiles {
 const label=['Seconde générale et technologique','Première générale','Terminale générale'][year-1];const prefix=`fr-lycee-a${year}`;
 const subjects=LYCEE_CORE.filter(b=>b.years[year-1]?.length).map(b=>branchSubject(b,year,prefix));
 if(year===1)subjects.push(...SECONDE_SCIENCES.map(b=>branchSubject(b,1,prefix)));
 const groups=lyceeLanguages(year,prefix,subjects);const general=generalOption(year,prefix,subjects);groups.push(general);
 antiquityOptions(prefix,subjects,groups,year,false);
 if(year===1){
  const options=[option('option-tech-sans','Sans option technologique',[],'Conserver le programme de seconde.')];
  for(const b of SECONDE_TECH_OPTIONS){const s=branchSubject(b,1,prefix);subjects.push(s);options.push(option(b.id,b.name,[s.id],b.objective));}
  groups.push({id:'option-technologique',label:'Enseignement optionnel technologique',description:'Une découverte au choix en seconde, en plus de l’éventuelle option générale ; vérifier les possibilités et conditions du lycée.',options});
 } else {
  const specs=specialtyGroups(year,prefix,subjects,general);groups.push(...specs,mathsChoice(year,prefix,subjects,specs.filter(g=>g.id.startsWith('specialite-'))));
  if(year===2)groups.push(...worksGroups(prefix,subjects));
 }
 appendAnnualWorks(subjects,year,prefix);
 return frenchPackage(`dowze-fr-lycee-a${year}-2026`,`Lycée France — ${label}`,label,subjects,groups,{id:'lycee-general-france',name:'Lycée général français',yearIndex:year,yearCount:3},year===3?'France — lycée général, programmes applicables2026-2027 ; mathématiques de terminale2019':'France — lycée général, programmes applicables2026-2027, mathématiques2026');
}

export function createFrenchCourseCatalog():FormationPackageFiles[]{
 return [...([1,2,3,4] as const).map(createFrenchCollegePackage),...([1,2,3] as const).map(createFrenchLyceePackage)];
}
