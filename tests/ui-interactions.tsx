import assert from 'node:assert/strict';
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Modal, TaskEditor, ConfirmDialog, EventEditor } from '../src/components/Modal';
import { isStoredFreeChatConfig } from '../src/components/FreeChatPanel';
import { AuthPage } from '../src/components/AuthPage';
import { appStorage } from '../src/lib/appStorage';
import { DowzyMascot } from '../src/components/DowzyMascot';
import { WorkspaceSearch } from '../src/components/WorkspaceSearch';
import { Sidebar } from '../src/components/Sidebar';
import { WorkspaceTabs } from '../src/components/WorkspaceTabs';
import { TasksPage } from '../src/components/TasksPage';
import type { TaskItem, SubjectNoteDocument } from '../src/types';
let passed = 0;
const noop = () => {};
async function test(name: string, run: () => Promise<void>) {await run();passed++;console.log(`PASS ${name}`);}
async function mount(element: React.ReactNode) {
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 await act(async()=>root.render(element));
 return {host,root,async close(){await act(async()=>root.unmount());host.remove();}};
}
async function click(element: Element | null) {assert.ok(element);await act(async()=>element.dispatchEvent(new MouseEvent('click',{bubbles:true})));}
async function key(element: Element, value: string, shiftKey=false) {await act(async()=>element.dispatchEvent(new KeyboardEvent('keydown',{key:value,shiftKey,bubbles:true,cancelable:true})));}
async function input(element: HTMLInputElement, value: string) {await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(element,value);element.dispatchEvent(new Event('input',{bubbles:true}));});}
const buttons=(host: Element)=>Array.from(host.querySelectorAll<HTMLButtonElement>('button'));
const label=(host:Element, text:string)=>host.querySelector(`[aria-label="${text}"]`);
const tasks:TaskItem[]=[{id:'a',title:'Préparer la physique',dueAt:'2001-01-01T12:00:00Z',priority:'high',completed:false},{id:'b',title:'Lire le chapitre',dueAt:'2099-01-01T12:00:00Z',priority:'low',completed:true}];

await test('Dowzy : îlot Coucou, couleurs internes, niveau conservé et clavier',async()=>{
 const oldGet=appStorage.getItem.bind(appStorage),oldSet=appStorage.setItem.bind(appStorage);const stored=new Map<string,string>();
 appStorage.getItem=(k:string)=>stored.get(k)??null;appStorage.setItem=(k:string,v:string)=>{stored.set(k,v);};
 Object.assign(globalThis,{matchMedia:()=>({matches:true,addEventListener:noop,removeEventListener:noop}),requestAnimationFrame:(fn:()=>void)=>setTimeout(fn,0),cancelAnimationFrame:clearTimeout});
 const m=await mount(<DowzyMascot accountId="island-test" progress={{schema:1,events:[]}}/>);
 assert.equal(m.host.querySelector('.dowzy-island')!.getAttribute('data-state'),'coucou');
 await key(m.host,'Escape');assert.equal(m.host.querySelector('.dowzy-island')!.getAttribute('data-state'),'petit');
 await click(m.host.querySelector('.dowzy-island-trigger'));assert.equal(m.host.querySelector('.dowzy-island')!.getAttribute('data-state'),'home');
 await click(label(m.host,'Personnaliser Dowzy'));assert.equal(m.host.querySelector('.dowzy-island')!.classList.contains('view-wardrobe'),true);
 assert.equal(m.host.querySelector('[role=dialog]'),null);await click(label(m.host,'Bleu'));assert.equal(label(m.host,'Bleu')!.getAttribute('aria-pressed'),'true');assert.equal(stored.get('dowze.mascot.island-test.color'),'blue');
 await click(label(m.host,'Rétracter Dowzy'));assert.equal(m.host.querySelector('.dowzy-island')!.getAttribute('data-state'),'petit');
 assert.equal(m.host.querySelector<HTMLElement>('.dowzy-island-content')!.hasAttribute('inert'),true);
 await click(m.host.querySelector('.dowzy-island-trigger'));await click(label(m.host,'Accueil de Dowzy'));assert.match(m.host.textContent!,/Niveau 0/);
 await m.close();appStorage.getItem=oldGet;appStorage.setItem=oldSet;
});

await test('Navigation : sections, notes, assistant absent et repli',async()=>{
 let section='',collapse=0;
 const m=await mount(<Sidebar section="home" pageActive profileName="Élève" onSectionChange={v=>section=v} compact onToggleNavigation={()=>collapse++}/>);
 await click(label(m.host,'Cours'));assert.equal(section,'courses');await click(label(m.host,'Mes notes'));assert.equal(section,'notes');
 assert.equal(label(m.host,'Afficher l’assistant IA'),null);assert.ok(!m.host.textContent!.includes('Assistant'));
 await click(label(m.host,'Développer la navigation'));assert.equal(collapse,1);await m.close();
});
await test('Recherche globale : notes, filtres sans accents, navigation et aucun résultat',async()=>{
 let opened='',closed=0;
 const m=await mount(<WorkspaceSearch subjects={[]} events={[]} notes={[{id:'n',title:'Révision mécanique',markdown:'Énergie potentielle',subjectIds:[],createdAt:'2026-10-08',updatedAt:'2026-10-08'}]} tasks={tasks} onSubject={noop} onNote={id=>opened=id} onEvent={noop} onNavigate={section=>opened=section} onClose={()=>closed++}/>);
 await input(m.host.querySelector('input[type=search]')!,'energie');
 assert.equal(m.host.querySelectorAll('.desk-search-results button').length,1);
 await key(m.host.querySelector('input')!,'Enter');assert.equal(opened,'n');assert.equal(closed,1);
 await input(m.host.querySelector('input[type=search]')!,'introuvable');assert.ok(m.host.textContent!.includes('Aucun résultat'));
 await input(m.host.querySelector('input[type=search]')!,'physique');await click(m.host.querySelector('.desk-search-results button'));assert.equal(opened,'tasks');
 await m.close();
});

await test('Tâches : recherche, filtres, retour à la liste',async()=>{
 const m=await mount(<TasksPage tasks={tasks} subjects={[]} onToggle={noop} onAdd={noop} onEdit={noop} onDelete={noop}/>);
 assert.ok(m.host.textContent!.includes('Préparer la physique'));assert.ok(!m.host.textContent!.includes('Lire le chapitre'));
 await input(m.host.querySelector('input[type=search]')!,'introuvable');assert.ok(m.host.textContent!.includes('Aucune tâche ne correspond'));
 await click(buttons(m.host).find(b=>b.textContent==='Voir toutes les tâches')!);assert.ok(m.host.textContent!.includes('Lire le chapitre'));
 await click(buttons(m.host).find(b=>b.textContent==='En retard')!);assert.ok(m.host.textContent!.includes('Préparer la physique'));assert.ok(!m.host.textContent!.includes('Lire le chapitre'));await m.close();
});
await test('Tâches : modification, suppression et case terminée ciblent la bonne tâche',async()=>{
 let edited='',deleted='',toggled='';const m=await mount(<TasksPage tasks={tasks} subjects={[]} onToggle={v=>toggled=v} onAdd={noop} onEdit={v=>edited=v.id} onDelete={v=>deleted=v.id}/>);
 await click(label(m.host,'Modifier « Préparer la physique »'));assert.equal(edited,'a');await click(label(m.host,'Supprimer « Préparer la physique »'));assert.equal(deleted,'a');await click(m.host.querySelector('input[type=checkbox]'));assert.equal(toggled,'a');await m.close();
});
const notes:SubjectNoteDocument[]=['one','two'].map(id=>({id,title:id,markdown:'',tags:[],subjectIds:[],createdAt:'2026-10-08T00:00:00Z',updatedAt:'2026-10-08T00:00:00Z'}));
await test('Onglets : flèches, Home, End, fermeture et note conservée',async()=>{
 let closed='',created=0;function Harness(){const [active,setActive]=useState<string|null>(null);return <WorkspaceTabs section="home" documents={notes} openDocumentIds={['one','two']} activeDocumentId={active} onActivatePage={()=>setActive(null)} onActivateNote={setActive} onCloseNote={v=>closed=v} onCreateNote={()=>created++}/>;}
 const m=await mount(<Harness/>);await click(label(m.host,'Nouvel onglet de note'));assert.equal(created,1);const tabs=()=>Array.from(m.host.querySelectorAll<HTMLButtonElement>('[role=tab]'));
 tabs()[0].focus();await key(tabs()[0],'ArrowRight');assert.equal(document.activeElement,tabs()[1]);assert.equal(tabs()[1].getAttribute('aria-selected'),'true');
 await key(tabs()[1],'End');assert.equal(document.activeElement,tabs()[2]);await key(tabs()[2],'Delete');assert.equal(closed,'two');assert.equal(notes[1].markdown,'');
 await key(tabs()[2],'Home');assert.equal(document.activeElement,tabs()[0]);await key(tabs()[0],'ArrowLeft');assert.equal(document.activeElement,tabs()[2]);await m.close();
});
await test('Dialogue : nom accessible, arrière-plan inerte, tabulation et restauration du focus',async()=>{
 const opener=document.createElement('button');document.body.append(opener);opener.focus();let closed=0;
 const m=await mount(<Modal title="Modifier" onClose={()=>closed++}><input aria-label="Nom"/><button>Enregistrer</button></Modal>);
 const dialog=m.host.querySelector<HTMLElement>('[role=dialog]')!;assert.equal(document.getElementById(dialog.getAttribute('aria-labelledby')!)!.textContent,'Modifier');assert.equal(opener.inert,true);
 const first=dialog.querySelector<HTMLButtonElement>('button')!;const last=buttons(dialog).at(-1)!;last.focus();await key(last,'Tab');assert.equal(document.activeElement,first);await key(first,'Tab',true);assert.equal(document.activeElement,last);
 await key(last,'Escape');assert.equal(closed,1);await m.close();assert.equal(document.activeElement,opener);assert.ok(!opener.inert);opener.remove();
});
await test('Dialogues empilés : Échap ferme uniquement le dernier et inert survit',async()=>{
 const background=document.createElement('button');document.body.append(background);let parent=0,child=0;
 const a=await mount(<Modal title="Parent" onClose={()=>parent++}><button>Parent</button></Modal>);
 const b=await mount(<Modal title="Enfant" onClose={()=>child++}><button>Enfant</button></Modal>);
 await key(b.host,'Escape');assert.equal(parent,0);assert.equal(child,1);await b.close();assert.equal(background.inert,true);
 await key(a.host,'Escape');assert.equal(parent,1);await a.close();assert.ok(!background.inert);background.remove();
});
await test('Formulaire tâche : titre vide refusé, édition conserve identité et achèvement',async()=>{
 let saved:TaskItem|undefined;const m=await mount(<TaskEditor task={tasks[1]} subjects={[]} onSave={v=>saved=v} onClose={noop}/>);
 const title=m.host.querySelector<HTMLInputElement>('input:not([type])')!;await input(title,'   ');await act(async()=>m.host.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));assert.equal(saved,undefined);assert.ok(m.host.querySelector('[role=alert]'));
 await input(title,'  Nouveau titre  ');await act(async()=>m.host.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));assert.equal(saved!.id,'b');assert.equal(saved!.title,'Nouveau titre');assert.equal(saved!.completed,true);await m.close();
});
await test('Confirmation : erreur annoncée, réessai possible et aucune fermeture mensongère',async()=>{
 let attempts=0;const m=await mount(<ConfirmDialog title="Supprimer" detail="Cette note" onClose={noop} onConfirm={async()=>{attempts++;throw new Error('Disque indisponible');}}/>);
 await click(buttons(m.host).find(b=>b.textContent!.includes('Supprimer'))!);assert.equal(attempts,1);assert.equal(m.host.querySelector('[role=alert]')!.textContent,'Disque indisponible');assert.equal(buttons(m.host).at(-1)!.disabled,false);await m.close();
});
await test('Confirmation en cours : aucune double exécution et fermeture bloquée',async()=>{
 let calls=0,closes=0,release!:()=>void;const pending=new Promise<void>(r=>release=r);
 const m=await mount(<ConfirmDialog title="Supprimer" detail="Note" onClose={()=>closes++} onConfirm={()=>{calls++;return pending;}}/>);
 const confirm=buttons(m.host).at(-1)!;await click(confirm);assert.equal(confirm.disabled,true);await click(confirm);await key(m.host,'Escape');assert.equal(calls,1);assert.equal(closes,0);await act(async()=>release());await m.close();
});
await test('Connexion : échec récupérable, essai local sans requête externe',async()=>{
 let calls=0;const m=await mount(<AuthPage hasAccounts onLogin={async()=>{calls++;throw new Error('Identifiants incorrects');}} onRegister={async()=>{}}/>);
 const username=m.host.querySelector<HTMLInputElement>('input[autocomplete=username]')!;
 await input(username,'test-only');await input(m.host.querySelector<HTMLInputElement>('input[type=password]')!,'not-a-real-password');
 await act(async()=>m.host.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 assert.equal(calls,1);assert.equal(m.host.querySelector('[role=alert]')!.textContent,'Identifiants incorrects');assert.equal(m.host.querySelector<HTMLButtonElement>('button[type=submit]')!.disabled,false);await m.close();
});
await test('Création de compte : divergence des mots de passe refuse la création et place le focus',async()=>{
 let registered=0;const m=await mount(<AuthPage hasAccounts={false} onLogin={async()=>{}} onRegister={async()=>{registered++;}}/>);
 const passwords=Array.from(m.host.querySelectorAll<HTMLInputElement>('input[type=password]'));
 await input(passwords[0],'test-password-one');await input(passwords[1],'test-password-two');
 await act(async()=>m.host.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 assert.equal(registered,0);assert.ok(m.host.querySelector('[role=alert]'));assert.equal(document.activeElement,passwords[1]);await m.close();
});
await test('Planning : intervalle inversé refusé, corrections permettent la sauvegarde',async()=>{
 let saved=0;const m=await mount(<EventEditor date={new Date('2026-10-08T09:00:00Z')} subjects={[]} onSave={()=>saved++} onClose={noop}/>);
 await input(m.host.querySelector<HTMLInputElement>('input:not([type])')!,'Révision');
 const dates=Array.from(m.host.querySelectorAll<HTMLInputElement>('input[type=datetime-local]'));
 await input(dates[0],'2026-10-08T15:00');await input(dates[1],'2026-10-08T14:00');
 await act(async()=>m.host.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));assert.equal(saved,0);assert.ok(m.host.querySelector('[role=alert]'));
 await input(dates[1],'2026-10-08T16:00');await act(async()=>m.host.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));assert.equal(saved,1);await m.close();
});
await test('Réglages chat : entrée historique conservée sans accepter une configuration inconnue',async()=>{
 assert.equal(isStoredFreeChatConfig({openai:{model:'configured-model'},deepseek:{model:'legacy-model'}}),true);
 assert.equal(isStoredFreeChatConfig({unknown:{model:'other'}}),false);
 assert.equal(isStoredFreeChatConfig({compatible:{model:'custom',endpoint:34}}),false);
});
console.log(`${passed} suites d’interactions DOM réussies. Aucun rendu natif ou moteur de layout n’est simulé comme une recette visuelle.`);
