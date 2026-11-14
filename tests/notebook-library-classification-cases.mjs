export const notebookLibraryClassificationGroupNames=[
 'Actual single and bulk moves preserve UUID, multiple course links and attachments while direct parent/child counts remain distinct after remount',
 'Actual cover controls survive grid/list, remount, trash and restoration without changing canonical pages, objects, media or metadata',
 'An externally committed classification refresh updates direct counts and covers in the exact mounted scope without changing foreign notes or sources'
];
export async function runNotebookLibraryClassificationCases(ctx){
 const {group,m,mount,dispose,click,choose,wait,ready,accept,external,exactSources,assert}=ctx;
 const card=(f,id)=>f.container.querySelector(`[data-library-note-id="${id}"]`);
 const cards=f=>[...f.container.querySelectorAll('[data-library-note-id]')].map(row=>row.dataset.libraryNoteId).sort();
 const button=(f,text,within=f.container)=>[...within.querySelectorAll('button')].find(row=>row.textContent===text);
 const side=(f,text)=>[...f.container.querySelectorAll('.note-library-sidebar>button')].find(row=>row.textContent.startsWith(text));
 const checkbox=(f,id)=>{const input=card(f,id)?.querySelector('input[type="checkbox"]');assert.ok(input,'Actual note checkbox '+id);return input;};
 const counts=f=>Object.fromEntries(['Parent','Enfant','Destination'].map(title=>{const target=[...f.container.querySelectorAll('.note-folder-row>button[aria-pressed]')].find(row=>row.querySelector('span')?.textContent===title);assert.ok(target,'Actual folder row '+title);return [title,Number(target.querySelector('small').textContent)];}));
 const expand=async f=>{const target=f.container.querySelector('[aria-label="Déplier Parent"]');if(target)await click(target);assert.ok(f.container.querySelector('[aria-label="Replier Parent"]'));};
 const renderCover=(f,id,color,pattern)=>{const preview=card(f,id)?.querySelector('.note-card-preview');assert.ok(preview,'Actual card cover '+id);assert.equal(preview.style.backgroundColor,color);assert.equal(preview.classList.contains('cover-'+pattern),true);};
 const settleEdit=async(f,action,edits)=>{const old=(await ready(f)).content,started=Date.now();await action();const next=await accept(f,old,edits,started);await exactSources();return next;};
 await group(notebookLibraryClassificationGroupNames[0],async()=>{
  let f=await mount({strict:true});await expand(f);assert.deepEqual(counts(f),{Parent:1,Enfant:2,Destination:0});assert.deepEqual(cards(f),['n-a','n-b','n-c','n-unfiled']);
  await settleEdit(f,()=>choose(card(f,'n-a').querySelector('.note-card-footer select'),'child'),{ 'n-a':{folderId:'child'} });assert.deepEqual(counts(f),{Parent:0,Enfant:3,Destination:0});
  await click(checkbox(f,'n-b'));await click(checkbox(f,'n-c'));assert.equal(f.container.querySelectorAll('[data-library-note-id] input[type="checkbox"]:checked').length,2);
  await settleEdit(f,()=>choose(f.container.querySelector('[aria-label="Déplacer la sélection"]'),'destination'),{'n-b':{folderId:'destination'},'n-c':{folderId:'destination'}});assert.deepEqual(counts(f),{Parent:0,Enfant:1,Destination:2});assert.equal(f.container.querySelectorAll('[data-library-note-id] input[type="checkbox"]:checked').length,0);assert.equal(f.container.querySelector('.note-bulk-actions'),null);
  const original=f;await dispose(original);f=await mount({dataset:original.dataset,strict:true});await expand(f);assert.deepEqual(counts(f),{Parent:0,Enfant:1,Destination:2});await click([...f.container.querySelectorAll('.note-folder-row>button[aria-pressed]')].find(row=>row.querySelector('span')?.textContent==='Enfant'));assert.deepEqual(cards(f),['n-a']);
  await click([...f.container.querySelectorAll('.note-folder-row>button[aria-pressed]')].find(row=>row.querySelector('span')?.textContent==='Destination'));assert.deepEqual(cards(f),['n-b','n-c']);await exactSources();
 });
 await group(notebookLibraryClassificationGroupNames[1],async()=>{
  let f=await mount();await expand(f);await click(card(f,'n-a').querySelector('summary'));assert.equal(card(f,'n-a').querySelector('details').open,true,'Real cover summary opens before choosing a swatch');
  await settleEdit(f,()=>click(card(f,'n-a').querySelector('[aria-label="Couverture #fde9ea de Note n-a"]')),{'n-a':{cover:{color:'#fde9ea',pattern:'plain'}}});
  await settleEdit(f,()=>choose(card(f,'n-a').querySelector('[aria-label="Papier de couverture de Note n-a"]'),'dots'),{'n-a':{cover:{color:'#fde9ea',pattern:'dots'}}});renderCover(f,'n-a','rgb(253, 233, 234)','dots');
  await click(f.container.querySelector('[aria-label="Vue liste"]'));assert.equal(f.container.querySelector('.note-library-cards').classList.contains('is-list'),true);renderCover(f,'n-a','rgb(253, 233, 234)','dots');await click(f.container.querySelector('[aria-label="Vue grille"]'));renderCover(f,'n-a','rgb(253, 233, 234)','dots');
  const old=f;await dispose(old);f=await mount({dataset:old.dataset});await expand(f);renderCover(f,'n-a','rgb(253, 233, 234)','dots');assert.deepEqual(counts(f),{Parent:1,Enfant:2,Destination:0});
  await click(checkbox(f,'n-a'));await settleEdit(f,()=>click(button(f,'Mettre à la corbeille',f.container.querySelector('.note-bulk-actions'))),{'n-a':{deletedAt:'finite-current-stamp'}});assert.equal(card(f,'n-a'),null);assert.deepEqual(counts(f),{Parent:0,Enfant:2,Destination:0});assert.equal(side(f,'Corbeille').querySelector('small').textContent,'2');
  await click(side(f,'Corbeille'));assert.deepEqual(cards(f),['n-a','n-trash']);assert.equal(card(f,'n-a').querySelector('.note-card-open').disabled,true);renderCover(f,'n-a','rgb(253, 233, 234)','dots');
  await settleEdit(f,()=>click(button(f,'Restaurer',card(f,'n-a').querySelector('.note-card-footer'))),{'n-a':{deletedAt:null}});assert.deepEqual(cards(f),['n-trash']);assert.equal(side(f,'Corbeille').querySelector('small').textContent,'1');await click(side(f,'Toutes les notes'));renderCover(f,'n-a','rgb(253, 233, 234)','dots');assert.deepEqual(counts(f),{Parent:1,Enfant:2,Destination:0});
  await click(card(f,'n-a').querySelector('summary'));await settleEdit(f,()=>click(button(f,'Réinitialiser',card(f,'n-a').querySelector('details'))),{'n-a':{cover:undefined}});renderCover(f,'n-a','','plain');assert.equal((await ready(f)).content.notes['n-a'].cover,undefined,'Reset removes only this cover');await exactSources();
 });
 await group(notebookLibraryClassificationGroupNames[2],async()=>{
  const f=await mount();await expand(f);const foreign=await mount({scope:{accountId:f.scope.accountId+'-foreign',spaceId:f.scope.spaceId}}),otherYear=await mount({scope:{accountId:f.scope.accountId,spaceId:'other-year'}});await expand(foreign);await expand(otherYear);const before=(await ready(f)).content,foreignBefore=(await ready(foreign)).content,yearBefore=(await ready(otherYear)).content;
  await external(f,before,{'n-a':{deletedAt:'2026-10-15T12:00:00.000Z'},'n-b':{folderId:'parent'},'n-c':{cover:{color:'#e9f4ff',pattern:'grid'}}});
  await wait(async()=>{const state=m.readLibrary(f.root)?.state;return !!state?.library&&state.library.revision===before.revision+1;},'Exact mounted scope receives the actual persisted external change');await ready(f);assert.deepEqual(counts(f),{Parent:1,Enfant:1,Destination:0});assert.equal(card(f,'n-a'),null);renderCover(f,'n-c','rgb(233, 244, 255)','grid');assert.equal(side(f,'Corbeille').querySelector('small').textContent,'2');
  assert.deepEqual((await ready(foreign)).content,foreignBefore,'The other account receives no classification mutation');assert.deepEqual((await ready(otherYear)).content,yearBefore,'The other space receives no classification mutation');assert.deepEqual(counts(foreign),{Parent:1,Enfant:2,Destination:0});assert.deepEqual(counts(otherYear),{Parent:1,Enfant:2,Destination:0});renderCover(foreign,'n-c','','plain');renderCover(otherYear,'n-c','','plain');await exactSources();
 });
}
