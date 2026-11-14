import "../planning-redesign.css";
import {useEffect,useRef,useState} from 'react';
import {AUTHORING_ROLES,buildAuthoringPrompt,createAuthoringDossier,parseAuthoringDossier,validateAuthoring,type AuthoringRole,type AuthoringBrief} from '../lib/curriculumAuthoring';
import {FORMATION_REQUIRED_FILES,type FormationPackageFiles} from '../lib/formations';

export function CurriculumWorkbench({accountId,annualInstanceId}:{accountId:string;annualInstanceId:string}) {
 const [files,setFiles]=useState<FormationPackageFiles>();
 const [draft,setDraft]=useState('');const [role,setRole]=useState<AuthoringRole>('researcher');
 const [task,setTask]=useState('Analyser les informations manquantes pour créer ou mettre à jour cette formation.');
 const [output,setOutput]=useState('');const [notice,setNotice]=useState('');const [busy,setBusy]=useState(false);const [failed,setFailed]=useState(false);
 const alive=useRef(true);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 const run=async(action:()=>Promise<void>)=>{if(busy)return;setBusy(true);setNotice('');setFailed(false);try{await action();}catch(e){if(alive.current){setFailed(true);setNotice(e instanceof Error?e.message:'Cette opération a échoué. Votre dossier reste disponible ; réessayez.');}}finally{if(alive.current)setBusy(false);}};
 const load=async(selected:FileList|null)=>{
  if(!selected)return;const input=Array.from(selected);if(input.length!==6||new Set(input.map(f=>f.name)).size!==6||input.some(f=>!FORMATION_REQUIRED_FILES.includes(f.name as typeof FORMATION_REQUIRED_FILES[number])||f.size>2*1024*1024)||input.reduce((n,f)=>n+f.size,0)>8*1024*1024)throw new Error('Choisir exactement les six JSON, sans dépasser 2 Mio par fichier et 8 Mio au total.');
  const next=Object.fromEntries(await Promise.all(input.map(async f=>[f.name,new TextDecoder('utf-8',{fatal:true}).decode(await f.arrayBuffer())]))) as unknown as FormationPackageFiles;
  const dossier=createAuthoringDossier(next);if(!alive.current)return;setFiles(next);setDraft(JSON.stringify(dossier,null,2));setOutput('');setNotice('Paquet chargé. Le dossier éditorial est un brouillon à compléter ; aucune formation installée n’a été modifiée.');
 };
 const dossier=()=>parseAuthoringDossier(JSON.parse(draft));
 const download=()=>{const d=dossier();const url=URL.createObjectURL(new Blob([JSON.stringify(d,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`${d.formationId}-editorial.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
 const prompt=()=>buildAuthoringPrompt(role,dossier(),task);
 const brief=(()=>{try{const b=JSON.parse(draft).brief;if(!b||!['jurisdiction','framework','goal','teachingLanguage'].every(k=>typeof b[k]==='string')||!['prerequisites','adaptations','exclusions'].every(k=>Array.isArray(b[k])&&b[k].every((x:unknown)=>typeof x==='string'))||typeof b.weeklyMinutes!=='number')return undefined;return b as AuthoringBrief;}catch{return undefined;}})();
 const changeBrief=(key:string,value:unknown)=>{const d=JSON.parse(draft);d.brief={...d.brief,[key]:value};setDraft(JSON.stringify(d,null,2));};
 return <section className="formation-editorial-workbench" aria-label="Atelier éditorial" aria-busy={busy}>
  <h2>Créer et réviser avec méthode</h2>
  <p>Chargez un paquet source pour préparer sa prochaine version. Le dossier conserve les besoins, références, compétences et décisions. L’année installée et sa progression restent intactes.</p>
  <div className="editorial-source-grid">
  <label>Six fichiers JSON du paquet<input type="file" accept=".json" multiple disabled={busy} onChange={e=>void run(()=>load(e.target.files))}/></label>
  <label>Reprendre un dossier éditorial<input type="file" accept=".json" disabled={busy} onChange={e=>{const f=e.target.files?.[0];if(f)void run(async()=>{if(f.size>8*1024*1024)throw new Error('Dossier supérieur à 8 Mio');const text=new TextDecoder('utf-8',{fatal:true}).decode(await f.arrayBuffer());parseAuthoringDossier(JSON.parse(text));if(alive.current)setDraft(text);});}}/></label>
  </div>
  {!draft && <p className="editorial-empty-guidance">Commence par charger les six fichiers de ta formation ou reprendre un dossier enregistré. Les outils de contrôle et les missions seront ensuite disponibles.</p>}
  <details open={!!draft}><summary>Dossier de préparation</summary>
   <p>Complétez les besoins et les sources réellement consultées. Les modèles de source et de compétence sont dans le kit. Enregistrez ou exportez le dossier avant de quitter.</p>
   {brief&&<fieldset disabled={busy}><legend>Besoins du parcours</legend>
    <label>Territoire ou contexte<input value={brief.jurisdiction} maxLength={2000} onChange={e=>changeBrief('jurisdiction',e.target.value)}/></label>
    <label>Référentiel visé<input value={brief.framework} maxLength={2000} onChange={e=>changeBrief('framework',e.target.value)}/></label>
    <label>Objectif personnel<textarea value={brief.goal} rows={3} maxLength={2000} onChange={e=>changeBrief('goal',e.target.value)}/></label>
    <label>Temps disponible par semaine, en minutes<input type="number" min={15} max={10080} value={brief.weeklyMinutes} onChange={e=>changeBrief('weeklyMinutes',Number(e.target.value))}/></label>
    <label>Prérequis, un par ligne<textarea value={brief.prerequisites.join('\n')} rows={2} onChange={e=>changeBrief('prerequisites',e.target.value.split('\n'))}/></label>
    <label>Adaptations souhaitées, une par ligne<textarea value={brief.adaptations.join('\n')} rows={2} onChange={e=>changeBrief('adaptations',e.target.value?e.target.value.split('\n'):[])}/></label>
   </fieldset>}
   <details><summary>Modifier le dossier JSON (avancé)</summary><label>Dossier éditorial JSON<textarea value={draft} maxLength={8*1024*1024} rows={12} spellCheck={false} disabled={busy} onChange={e=>setDraft(e.target.value)}/></label></details>
   <div className="formation-editorial-actions">
    <button type="button" className="secondary-button" disabled={!draft||!files||busy} onClick={()=>void run(async()=>{const result=validateAuthoring(files!,JSON.parse(draft));setOutput(JSON.stringify(result,null,2));setNotice(result.readyForReview?'Dossier prêt pour une revue pédagogique ; aucune publication autorisée.':'Dossier incomplet : les points à corriger sont listés ci-dessous.');})}>Contrôler le dossier</button>
    <button type="button" className="secondary-button" disabled={!draft||busy} onClick={()=>void run(async()=>download())}>Exporter le dossier</button>
   </div>
  </details>
  <details className="editorial-missions" open={!!draft}><summary>Préparer une mission pour un agent</summary>
  <label>Mission<select aria-label="Mission" value={role} disabled={busy} onChange={e=>setRole(e.target.value as AuthoringRole)}>{Object.entries(AUTHORING_ROLES).map(([key,s])=><option key={key} value={key}>{s.label}</option>)}</select></label>
  <p>{AUTHORING_ROLES[role].task}</p>
  <label>Travail demandé et extrait ciblé<textarea value={task} rows={4} maxLength={4000} disabled={busy} onChange={e=>setTask(e.target.value)}/></label>
  <div className="formation-editorial-actions">
   <button type="button" className="secondary-button" disabled={!draft||busy} onClick={()=>void run(async()=>{await navigator.clipboard.writeText(prompt());setNotice('Consigne copiée pour l’agent de votre choix.');})}>Copier la mission</button>
  </div>
  </details>
  {notice&&<p role={failed?"alert":"status"}>{notice}</p>}
  {output&&<pre aria-label="Résultat de l’atelier" style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{output}</pre>}
 </section>;
}
