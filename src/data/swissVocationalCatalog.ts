import type { Subject, CefrLevel } from '../types';
import type { FormationPackageFiles } from '../lib/formations';
import type { FormationChoiceGroup, FormationChoiceOption } from '../lib/formationChoices';
import { packageFiles, languageSubject, languageHalf, reidentify } from './courseCatalog';
import { branchSubject, type CurriculumBranch } from './swissCurriculumCore';
import { ECG_CORE, ECG_ARTS } from './swissEcgCurriculum';
import { ECG_DOMAINS, type EcgDomain } from './swissEcgDomains';
import { COMMERCE_CORE, COMMERCE_MP, COMMERCE_OPTIONS, COMMERCE_STAGE, COMMERCE_COMPLEMENTS, COMMERCE_INTEGRATED_PRACTICE } from './swissCommerceCurriculum';

const languageNames = { de: 'Allemand', it: 'Italien', en: 'Anglais', es: 'Espagnol' };
type Language = keyof typeof languageNames;
const json = (v: unknown) => JSON.stringify(v, null, 2) + '\n';
const option = (id: string, label: string, subjectIds: string[], description: string, excludes: string[] = []): FormationChoiceOption => ({ id, label, subjectIds, description, excludes });
const findCore = (id: string) => ECG_CORE.find(branch => branch.id === id)!;

function annualLanguages(prefix: string, year: number, subjects: Subject[], vocational = false, mp = false): FormationChoiceGroup[] {
  const level: CefrLevel = vocational && !mp ? year === 1 ? 'A2' : 'B1' : year === 1 ? 'B1' : 'B2';
  return [1, 2].map(slot => ({
    id: `langue-${slot}`, label: `Langue étrangère ${slot === 1 ? 'I' : 'II'}`,
    description: slot === 1 ? 'Autre langue nationale : allemand ou italien. Le canton fixe les langues et leur ordre dans une formation reconnue ; ce choix organise le parcours personnel.' : 'Troisième langue nationale ou anglais, distincte de la langue I. L’espagnol est disponible en complément, pas comme substitution universelle à une langue réglementaire.',
    options: (slot === 1 ? ['de', 'it'] as const : ['de', 'it', 'en'] as const).map(language => {
      const id = `${prefix}-l${slot}-${language}`;
      const complete = languageSubject(language, level, id);
      const subject = year > 1 ? languageHalf(complete, year === 2 ? 0 : 1) : complete;
      if (vocational) {
        subject.objective = `${subject.objective ?? ''} Appliquer chaque notion à des situations commerciales : accueil, demande, offre, commande, correspondance et entretien.`;
        for (const module of subject.modules) for (const chapter of module.items) for (const lesson of chapter.lessons ?? []) lesson.objective = `${lesson.objective} Transférer la compétence à un échange professionnel adapté au niveau dans cette langue.`;
      }
      subjects.push(subject);
      return option(`l${slot}-${language}`, languageNames[language], [id], `Progression ${level}${year > 1 ? `, partie ${year - 1}/2` : ''}. Diagnostic des prérequis et oral observé. Les niveaux du store permettent une remise à niveau.`, language === 'en' ? [] : [`l${slot === 1 ? 2 : 1}-${language}`]);
    })
  }));
}

function supplementLanguages(prefix: string, subjects: Subject[], year: number): FormationChoiceGroup {
  const options: FormationChoiceOption[] = [option('complement-sans', 'Sans langue supplémentaire', [], 'Conserver les deux langues du parcours.')];
  for (const language of ['es', 'it'] as const) {
    const level: CefrLevel = year === 1 ? 'A1' : year === 2 ? 'A2' : 'B1';
    const subject = languageSubject(language, level, `${prefix}-langue-plus-${language}`); subjects.push(subject);
    options.push(option(`complement-${language}`, `${languageNames[language]} supplémentaire`, [subject.id], `Parcours complémentaire ${level}, sans équivalence automatique à une option cantonale.`, language === 'it' ? ['l1-it', 'l2-it'] : []));
  }
  return { id: 'complement-langue', label: 'Langue supplémentaire facultative', description: 'Choix personnel en plus des langues de base ; vérifier les possibilités de reconnaissance auprès de son école.', options };
}

function annotate(files: FormationPackageFiles, framework: string, description: string, practical = false): FormationPackageFiles {
  const metadata = JSON.parse(files['matieres.json']);
  for (const subject of metadata.subjects) subject.shortName = subject.shortName.trim();
  files['matieres.json'] = json(metadata);
  const manifest = JSON.parse(files['formation.json']);
  manifest.level.framework = framework;
  manifest.level.targetAudience = 'Apprenants ayant acquis les prérequis du secondaire I ou de l’année précédente. Admission et certification relèvent des établissements reconnus.';
  manifest.description = description + ' Parcours original détaillé pour le tuteur, pas un diplôme délivré par Dowze. Le planning proposé est modifiable et ne vaut pas grille cantonale.';
  manifest.objectives = ['Maîtriser les notions et compétences de l’année choisie.', 'Réaliser cours, exercices, mini-tests et productions argumentées.', 'Documenter les activités pratiques réellement effectuées et les faire évaluer par les personnes habilitées.'];
  if (practical) {
    manifest.academicYear = { startDate: '2026-08-01', endDate: '2027-07-31' };
    const schedule = JSON.parse(files['planning.json']);
    schedule.periods = [{id:'semestre-1',title:'Première période de suivi',startDate:'2026-08-01',endDate:'2027-01-31'},{id:'semestre-2',title:'Seconde période de suivi',startDate:'2027-02-01',endDate:'2027-07-31'}];
    // Follow-up slots are personal preparation only: never manufacture a stage
    // attendance record or displace the placement's own working timetable.
    schedule.weeklySlots = schedule.weeklySlots.map((slot: Record<string, unknown>) => ({...slot, title:`Suivi personnel — ${slot.title}`,durationMinutes:30,location:'Préparation personnelle, hors horaires de stage'}));
    schedule.closures=[]; files['planning.json']=json(schedule);
  }
  files['formation.json']=json(manifest);
  const tasks=JSON.parse(files['taches.json']);
  tasks.tasks.unshift({id:'verifier-referentiel',title:'Vérifier avec l’école les conditions, langues, options, stages et épreuves de la rentrée ; noter les exigences applicables.',dueAt:practical?'2026-08-03T17:00':'2026-09-02T17:00',priority:'high'});
  if(practical)tasks.tasks.push({id:'attestations-pratique',title:'Faire vérifier les prestations réelles et les attestations par le référent habilité. Une case cochée dans Dowze ne valide pas un stage.',dueAt:'2027-07-20T17:00',priority:'high'});
  files['taches.json']=json(tasks);
  return files;
}

export function createEcgPackage(year: 1|2|3): FormationPackageFiles {
  const prefix=`ecg-a${year}`;
  const subjects=[...ECG_CORE,...ECG_ARTS,...ECG_DOMAINS].map(branch=>branchSubject(branch,year,prefix));
  const groups=annualLanguages(prefix,year,subjects);
  groups.push({id:'discipline-artistique',label:'Pratique artistique',description:'Une pratique réelle à choisir pour le parcours général ; les grilles et regroupements diffèrent selon les cantons.',options:ECG_ARTS.map(b=>option(`art-${b.id}`,b.name,[`${prefix}-${b.id}`],b.objective))});
  groups.push({id:'domaine-professionnel',label:year===1?'Domaine à explorer':'Domaine professionnel',description:year===1?'Préorientation personnelle. Dans plusieurs cantons, dont Genève, le choix officiel intervient pour la deuxième année. Musique et théâtre sont deux parcours du même domaine CDIP.':'Poursuivre le domaine préparé ; une réorientation demande de vérifier les prérequis avec l’école. Les offres combinées varient selon le canton.',options:ECG_DOMAINS.map(b=>{
    const art=b.id==='arts-design'?'arts-visuels':b.id==='musique-specialite'?'musique':b.id==='theatre-specialite'?'theatre':null;
    return option(`domaine-${b.id}`,b.name,[`${prefix}-${b.id}`],b.objective,art?ECG_ARTS.filter(a=>a.id!==art).map(a=>`art-${a.id}`):[]);
  })});
  groups.push(supplementLanguages(prefix,subjects,year));
  return annotate(packageFiles(`dowze-ecg-a${year}-2026`,`École de culture générale — Année ${year}`,`ECG · Année ${year}/3`,subjects,groups,{id:'ecole-culture-generale',name:'École de culture générale et maturité spécialisée',yearIndex:year,yearCount:4}), 'CDIP — PEC ECG 2018, mise en œuvre cantonale',`Année ${year} du certificat ECG : culture générale, domaine professionnel, travail personnel et préparation des stages. Les trois années de certificat peuvent être suivies d’une maturité spécialisée distincte.`);
}

const MS_METHOD: CurriculumBranch={id:'tms',name:'Travail de maturité spécialisée et portfolio',domain:'Projet',objective:'Conduire une recherche personnelle liée aux prestations complémentaires, produire un écrit documenté et soutenir le résultat.',years:[[
 'Cadrer le travail|Vérifier les consignes de l’école|Définir une problématique liée à la pratique|Délimiter le terrain|Choisir un référent|Construire un échéancier',
 'Rechercher|Identifier des sources primaires|Comparer les approches|Évaluer la fiabilité|Citer correctement|Construire une bibliographie',
 'Méthode et éthique|Choisir une méthode adaptée|Recueillir les autorisations|Éviter les données identifiantes|Définir les limites|Documenter les aides utilisées',
 'Analyser|Organiser les observations|Distinguer fait et interprétation|Croiser théorie et pratique|Discuter les résultats|Identifier les biais',
 'Rédiger|Structurer le rapport|Présenter la méthode|Argumenter la discussion|Vérifier les références|Réviser la version finale',
 'Soutenir|Choisir les résultats essentiels|Préparer un support accessible|Répéter l’oral|Répondre aux objections|Rassembler les évaluations et attestations réelles'
 ]]};
export function createSpecializedMaturityPackage(domain: EcgDomain): FormationPackageFiles {
  const prefix=`ms-${domain.id}`;
  const practice:CurriculumBranch={...domain,id:'prestations',name:`Maturité spécialisée — ${domain.name}`,years:[domain.specialized]};
  const subjects=[branchSubject(practice,1,prefix),branchSubject(MS_METHOD,1,prefix)];
  const groups:FormationChoiceGroup[]=[];
  if(domain.id==='pedagogie') {
    for(const id of ['francais','mathematiques','biologie','chimie','physique','histoire','geographie']) {
      const subject=branchSubject(findCore(id),3,prefix);subject.name=`Consolidation MS — ${subject.name}`;subjects.push(subject);
    }
  }
  if(domain.id==='pedagogie'||domain.id==='communication') {
    groups.push({id:'langue-ms',label:'Langue de préparation',description:'Choisir selon les exigences de l’établissement et de la filière visée. Le niveau B2 proposé est un objectif pédagogique ; le certificat ou séjour éventuellement exigé doit être obtenu réellement.',options:(['de','it','en'] as const).map(language=>{
      const subject=languageSubject(language,'B2',`${prefix}-${language}`);subjects.push(subject);
      return option(`ms-${language}`,languageNames[language],[subject.id],'Compréhension, écrit, oral et médiation ; évaluation réelle des compétences orales.');
    })});
  }
  return annotate(packageFiles(`dowze-ms-${domain.id}-2026`,`Maturité spécialisée — ${domain.name.replace(' — domaine professionnel','')}`,`Après ECG · Année de maturité spécialisée`,subjects,groups,{id:'ecole-culture-generale',name:'École de culture générale et maturité spécialisée',yearIndex:4,yearCount:4}), 'CDIP — maturité spécialisée et prestations cantonales',`Après un certificat ECG approprié : préparation à la maturité spécialisée ${domain.name}. Stages, ateliers, cours ou séjours reconnus et travail de maturité sont à réaliser selon les règles du domaine. Cette année de suivi ne remplace aucune prestation réelle.`,true);
}

function professionalOptionGroup(prefix:string,subjects:Subject[],year:number,languageIds:Language[]):FormationChoiceGroup {
  const options:FormationChoiceOption[]=[];
  for(const branch of COMMERCE_OPTIONS) {
    if(branch.id==='option-communication-le') {
      for(const language of languageIds) {
        const subject=reidentify(branchSubject(branch,1,prefix),`${prefix}-${branch.id}-${language}`);
        subject.name=`Option CFC — Communication en ${languageNames[language].toLowerCase()}`;subject.languageCode=language;subject.languageName=languageNames[language];subject.objective=`${branch.objective} Langue appliquée : ${languageNames[language]}.`;
        subjects.push(subject);options.push(option(`option-le-${language}`,subject.name,[subject.id],subject.objective,languageIds.filter(other=>other!==language).map(other=>`l1-${other}`)));
      }
    } else {const subject=branchSubject(branch,1,prefix);subjects.push(subject);options.push(option(branch.id,branch.name,[subject.id],branch.objective));}
  }
  return {id:'option-professionnelle',label:'Option professionnelle CFC',description:year===4?'Confirmer avec l’entreprise l’option réellement travaillée et évaluée.':'Approfondissement de fin de formation à convenir avec l’entreprise. En voie 3+1, ce choix prépare le stage long ; le calendrier officiel dépend de l’école.',options};
}

export function createCommercePackage(year:1|2|3|4,withMp:boolean):FormationPackageFiles {
  if(!withMp&&year===4)throw new Error('Le parcours CFC en école comporte trois années.');
  const prefix=`ec-${withMp?'mp':'cfc'}-a${year}`;
  const subjects:Subject[]=year===4?COMMERCE_STAGE.map(b=>branchSubject(b,1,prefix)):COMMERCE_CORE.map(b=>branchSubject(b,year,prefix));
  const groups:FormationChoiceGroup[]=[];
  if(year<4) {
    subjects.push(branchSubject(findCore('sport'),year,prefix));
    if(withMp)subjects.push(branchSubject(findCore('francais'),year,prefix),...COMMERCE_MP.map(b=>branchSubject(b,year,prefix)));
    groups.push(...annualLanguages(prefix,Math.min(year,3),subjects,true,withMp));
    if(!withMp) {
      subjects.push(branchSubject(COMMERCE_INTEGRATED_PRACTICE,year,prefix));
      const project=branchSubject(COMMERCE_COMPLEMENTS[0],year,prefix);subjects.push(project);
      // Both DAO paths retain the second language. DAO B changes its learning
      // objectives to intercultural oral work; it is not “no second language”.
      const languageSubjects=subjects.filter(s=>s.id.startsWith(`${prefix}-l2-`));
      const oralIds:string[]=[];
      for(const subject of languageSubjects) {
        const oral=reidentify(structuredClone(subject),`${subject.id}-oral`);
        oral.name=`${languageNames[subject.languageCode as Language]} — oral et interculturalité`;
        for(const module of oral.modules)for(const chapter of module.items)for(const lesson of chapter.lessons??[])lesson.objective=`Dans la deuxième langue choisie, comprendre et employer « ${lesson.title} » dans une interaction orale professionnelle adaptée ; préparer une médiation interculturelle et faire observer l’oral. L’écrit sert d’appui, pas de certification écrite approfondie.`;
        subjects.push(oral);oralIds.push(oral.id);
        const choice=groups[1].options.find(o=>o.subjectIds.includes(subject.id))!;choice.subjectIds.push(oral.id);
      }
      groups.push({id:'domaine-option-obligatoire',label:'Domaine obligatoire à option',description:'Le projet individuel conserve le travail oral et interculturel en deuxième langue. La voie MP exige les deux langues approfondies et n’offre donc pas cette alternative.',options:[option('dao-langues','Deuxième langue étrangère approfondie',languageSubjects.map(s=>s.id),'Compétences orales et écrites dans les deux langues.',[]),option('dao-projet','Projet individuel et interculturalité',[project.id,...oralIds],'Projet personnel avec pratique orale et interculturelle de la deuxième langue.')]});
      // Choice filtering uses a union of references. Language identity and DAO
      // intersect via exclusion-constrained paired options, handled below.
      for(const o of groups[1].options)o.subjectIds=[];
      const paired:FormationChoiceOption[]=[];
      for(const languageChoice of groups[1].options)for(const dao of groups.at(-1)!.options){
        const language=languageChoice.id.slice(3) as Language;
        paired.push(option(`${dao.id}-${language}`,`${dao.label} — ${languageNames[language]}`,dao.id==='dao-langues'?[`${prefix}-l2-${language}`]:[project.id,`${prefix}-l2-${language}-oral`],dao.description,[...groups[1].options.filter(o=>o.id!==languageChoice.id).map(o=>o.id)]));
      }
      groups.at(-1)!.options=paired;
      // Original full and oral variants are all referenced by paired options;
      // exactly the variant compatible with the chosen language is included.
    }
    groups.push(supplementLanguages(prefix,subjects,year));
    if(withMp) {
      const chain=branchSubject(COMMERCE_COMPLEMENTS[1],year,prefix);subjects.push(chain);
      const management=reidentify(branchSubject(COMMERCE_MP.find(b=>b.id==='mp-tip')!,year,prefix),`${prefix}-gestion-projet`);management.name='Complément — Gestion de projet';subjects.push(management);
      // Optional extensions follow the 2026 Vaud themes without imposing that
      // canton's timetable or confusing them with the four national CFC options.
      groups.push({id:'specialisation-complementaire',label:'Complément commercial',description:'Offre personnelle : chaîne d’approvisionnement ou gestion de projet. Les langues supplémentaires ci-dessus constituent une autre possibilité d’approfondissement. Ces compléments ne remplacent pas l’option CFC.',options:[option('commercial-sans','Sans complément commercial',[],'Suivre le socle CFC et MP.'),option('commercial-logistique','Stratégie et chaîne d’approvisionnement',[chain.id],chain.objective!),option('commercial-projet','Gestion de projet',[management.id],management.objective!)]});
    }
  } else {
    // The placement follows an already chosen language; preserve explicit
    // identity without adding an unrelated full school timetable to the stage.
    groups.push({id:'langue-1',label:'Langue étrangère I du parcours',description:'Reprendre la langue préparée avant le stage ; ce choix contextualise l’option de communication.',options:(['de','it'] as const).map(l=>option(`l1-${l}`,languageNames[l],[],`Langue de travail préparée : ${languageNames[l]}.`))});
  }
  if(year>=3)groups.push(professionalOptionGroup(prefix,subjects,year,['de','it']));
  const name=withMp?`École de commerce CFC + MP — ${year===4?'Année 4 · Stage long':`Année ${year}`}`:`École de commerce CFC — Année ${year}`;
  return annotate(packageFiles(`dowze-commerce-${withMp?'mp':'cfc'}-a${year}-2026`,name,`${withMp?'CFC + MP 3+1':'CFC en école'} · Année ${year}/${withMp?4:3}`,subjects,groups,{id:withMp?'ecole-commerce-mp':'ecole-commerce-cfc',name:withMp?'École de commerce — CFC et maturité professionnelle':'École de commerce — CFC en école',yearIndex:year,yearCount:withMp?4:3}),withMp?'CFC employé de commerce 2023 + PEC MP 2026, économie et services, type économie':'CFC employé de commerce 2023 — formation initiale en école',withMp?`Voie 3+1 : trois années scolaires de compétences commerciales et de maturité professionnelle, puis un stage long reconnu. Le CFC et la MP dépendent aussi des prestations pratiques et des évaluations officielles.`:`Voie CFC en école sur trois ans, avec pratique professionnelle intégrée et cours interentreprises à accomplir réellement. Les modèles et langues autorisés varient selon les cantons ; ce parcours n’est pas la voie 3+1 avec MP.`,year===4);
}

export function createVocationalCourseCatalog():FormationPackageFiles[] {
  return [
    ...([1,2,3] as const).map(createEcgPackage),
    ...ECG_DOMAINS.map(createSpecializedMaturityPackage),
    ...([1,2,3] as const).map(y=>createCommercePackage(y,false)),
    ...([1,2,3,4] as const).map(y=>createCommercePackage(y,true))
  ];
}
