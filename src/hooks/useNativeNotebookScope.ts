import {useCallback,useEffect,useRef,useState} from 'react';
import {appStorage} from '../lib/appStorage';
import {transferNotebookScope} from '../lib/notebookScopeTransfer';
import {registerNotebookWriter,settleNotebookAccount,resumeNotebookAccount} from '../lib/notebookSession';
import {serverAccountTransition} from '../lib/server';
import {isPersistedSubjectNotesStore,normalizeSubjectNotesStore,EMPTY_SUBJECT_NOTES_STORE} from '../lib/subjectNotes';
import {listDrafts} from '../../pwa/src/storage';
import {synchronizeSpace} from '../../pwa/src/sync';
import {ApiError} from '../../pwa/src/api';
import type {NotebookMediaScope} from '../components/NotebookEditor';

interface Identity {accountId:string;spaceId:string;legacyMetadata?:boolean}
const valid=(value:unknown):value is Identity=>!!value&&typeof value==='object'&&['accountId','spaceId'].every(key=>/^[A-Za-z0-9._-]{1,200}$/.test(String((value as Record<string,unknown>)[key]??'')));
const json=(key:string)=>{const raw=appStorage.getItem(key);try{return raw?JSON.parse(raw):null;}catch{throw Error('Une référence locale du carnet doit être récupérée. Son original est conservé.');}};
const storedOwner=(profileId:string)=>json(`dowze.server.owner.${profileId}`)??json(`dowze.server.link.${profileId}`);
const notesStore=(key:string)=>{const raw=json(key);if(raw!==null&&!isPersistedSubjectNotesStore(raw))throw Error('Vos notes doivent être récupérées avant de changer de carnet. Leur original reste conservé.');return raw?normalizeSubjectNotesStore(raw):EMPTY_SUBJECT_NOTES_STORE;};
function storedIdentity(profileId:string,localSpace:string,recordKey:string):Identity|undefined{
 let record,owner,linked;try{record=json(recordKey);owner=storedOwner(profileId);linked=json(`dowze.server.link.${profileId}`);}catch{return undefined;}
 if(record?.schema===1&&record.localSpace===localSpace&&valid(record.identity)&&record.identity.accountId===owner?.id)return record.identity;
 const legacySpace=linked?.id?appStorage.getItem(`dowze.server.space.${profileId}.${linked.id}.${localSpace}`):null;
 if(linked?.id&&legacySpace&&valid({accountId:linked.id,spaceId:legacySpace}))return {accountId:linked.id,spaceId:legacySpace,legacyMetadata:true};
 return undefined;
}

/** Transport logout keeps the same owned cache; changing year changes its metadata namespace. */
export function useNativeNotebookScope(profileId:string,localSpace:string,baseNotesKey:string){
 const recordKey=`dowze.notebook.scope.${profileId}.${localSpace}`,local={accountId:`local-${profileId}`,spaceId:localSpace};
 const [identity,setIdentity]=useState<Identity>(()=>storedIdentity(profileId,localSpace,recordKey)??local);
 const [ready,setReady]=useState(()=>!!storedIdentity(profileId,localSpace,recordKey)),[error,setError]=useState('');
 const latest=useRef(identity);latest.current=identity;const alive=useRef(true),normalization=useRef<Promise<void>|null>(null),serial=useRef(Promise.resolve());
 const wasLinked=useRef(identity.accountId!==local.accountId);if(identity.accountId!==local.accountId&&!identity.legacyMetadata&&!normalization.current)normalization.current=Promise.resolve();const inputKey=`${profileId}|${localSpace}|${baseNotesKey}`,scopeKey=useRef(inputKey);
 if(scopeKey.current!==inputKey){scopeKey.current=inputKey;normalization.current=null;serial.current=Promise.resolve();const stored=storedIdentity(profileId,localSpace,recordKey);wasLinked.current=!!stored&&stored.accountId!==local.accountId;setIdentity(stored??local);setReady(!!stored);setError('');}
 const ownsView=()=>alive.current&&scopeKey.current===inputKey;
 const keyFor=(scope:Identity)=>scope.accountId===local.accountId||scope.legacyMetadata?baseNotesKey:`${baseNotesKey}.cloud.${encodeURIComponent(scope.accountId)}.${encodeURIComponent(scope.spaceId)}`;
 const scopedNotesKey=keyFor(identity);
 const legacyDocuments=()=>{if(wasLinked.current)return [];const raw=json(baseNotesKey+'.shared-documents.v1');if(raw!==null&&!Array.isArray(raw))throw Error('Les dessins existants doivent être récupérés avant le transfert.');return ((raw??[]) as unknown[]).filter((row:unknown):row is Record<string,unknown>=>!!row&&typeof row==='object'&&(row as Record<string,unknown>).type==='whiteboard'&&typeof (row as Record<string,unknown>).id==='string').map(row=>({id:String(row.id),content:row.content}));};
 const ensureLocal=()=>{
  if(!normalization.current)normalization.current=(async()=>{
   await settleNotebookAccount(profileId);await appStorage.flush();
   try{const original=appStorage.getItem(baseNotesKey),current=()=>ownsView()&&appStorage.getItem(baseNotesKey)===original;
    await transferNotebookScope({profileId,localSpaceId:localSpace,target:local,notes:notesStore(baseNotesKey).documents,mode:'local-alias',seedPlainNotes:!wasLinked.current,legacyDocuments:legacyDocuments(),current});
    if(ownsView()){setReady(true);setError('');}
   }finally{resumeNotebookAccount(profileId);}
  })().catch(reason=>{if(ownsView())normalization.current=null;if(ownsView())setError(String(reason instanceof Error?reason.message:reason));throw reason;});
  const pending=normalization.current;const unregister=registerNotebookWriter(`notebook-transfer:${profileId}`,{flush:()=>{},settled:()=>pending.then(()=>undefined,()=>undefined),suspend:()=>{},resume:()=>{},pending:()=>true});void pending.finally(unregister).catch(()=>undefined);return pending;
 };
 useEffect(()=>{alive.current=true;void ensureLocal().catch(()=>undefined);return()=>{alive.current=false;};},[profileId,localSpace,baseNotesKey]);
 const prepareTarget=useCallback((target:NotebookMediaScope,current:()=>boolean)=>{
  const work=serial.current.catch(()=>undefined).then(async()=>{
   await ensureLocal();if(!current()||!ownsView()||storedOwner(profileId)?.id!==target.accountId)throw Error('Le compte connecté ne correspond plus à ce carnet.');
   const active=latest.current,accounts=[...new Set([active.accountId,local.accountId,target.accountId])];
   try{
    for(const account of accounts)await settleNotebookAccount(account);
    await appStorage.flush();
    const original=appStorage.getItem(baseNotesKey),targetKey=keyFor({accountId:target.accountId,spaceId:target.spaceId}),targetOriginal=appStorage.getItem(targetKey);
    const stable=()=>ownsView()&&current()&&!serverAccountTransition(profileId)&&storedOwner(profileId)?.id===target.accountId&&appStorage.getItem(baseNotesKey)===original&&appStorage.getItem(targetKey)===targetOriginal;
    if(target.api&&navigator.onLine){try{await synchronizeSpace(target.api,target.accountId,target.spaceId,stable);}catch(reason){if(!(reason instanceof TypeError)&&!(reason instanceof ApiError&&(reason.status>=500||reason.status===404)))throw reason;}}
    const origin=json(recordKey+'.origin'),originMatches=!origin||origin.accountId===target.accountId&&origin.spaceId===target.spaceId;
    const result=originMatches?await transferNotebookScope({profileId,localSpaceId:localSpace,target,recoverOnly:active.accountId!==local.accountId,notes:notesStore(baseNotesKey).documents,seedPlainNotes:!wasLinked.current,legacyDocuments:legacyDocuments(),current:stable}):{copied:0,conflicts:0,sourceMaySeedMetadata:false};
    if(!stable())throw Error('L’espace a changé pendant la préparation du carnet.');
    let preparedMetadata=targetOriginal;if(targetOriginal!==null)notesStore(targetKey);
    if(targetOriginal===null){
     const source=result.sourceMaySeedMetadata?notesStore(baseNotesKey):EMPTY_SUBJECT_NOTES_STORE,documents=new Map(source.documents.map(note=>[note.id,note]));
     for(const draft of await listDrafts(target.accountId,target.spaceId))if(draft.type==='notesMarkdown'){
      const value=draft.content as typeof source.documents[number];const candidate={...EMPTY_SUBJECT_NOTES_STORE,documents:[value]};if(!isPersistedSubjectNotesStore(candidate))throw Error('Une note reçue utilise un format incompatible. Son original reste conservé.');if(!documents.has(value.id))documents.set(value.id,value);
     }
     const metadata={...source,documents:[...documents.values()]};if(!isPersistedSubjectNotesStore(metadata))throw Error('Le classement des notes doit être récupéré.');
     if(!stable())throw Error('Le carnet a changé pendant la préparation de ses onglets.');preparedMetadata=JSON.stringify(metadata);appStorage.setItem(targetKey,preparedMetadata);await appStorage.flush();
    }
    if(!ownsView()||!current()||serverAccountTransition(profileId)||storedOwner(profileId)?.id!==target.accountId)throw Error('Le compte a changé avant l’ouverture du carnet.');
    if(appStorage.getItem(baseNotesKey)!==original||appStorage.getItem(targetKey)!==preparedMetadata)throw Error('Les notes ont changé pendant la préparation. Elles restent conservées ; réessayez l’ouverture du carnet.');
    const next={accountId:target.accountId,spaceId:target.spaceId};if(!origin)appStorage.setItem(recordKey+'.origin',JSON.stringify(next));appStorage.setItem(recordKey,JSON.stringify({schema:1,localSpace,identity:next}));await appStorage.flush();
    if(!ownsView()||!current())throw Error('L’ouverture du carnet a été interrompue.');latest.current=next;setIdentity(next);setReady(true);setError('');return result;
   }finally{for(const account of accounts)resumeNotebookAccount(account);}
  });
  serial.current=work.then(()=>undefined,()=>undefined);
  const unregister=registerNotebookWriter(`notebook-transfer:${profileId}`,{flush:()=>{},settled:()=>work.then(()=>undefined,()=>undefined),suspend:()=>{},resume:()=>{},pending:()=>true});void work.finally(unregister).catch(()=>undefined);return work;
 },[profileId,localSpace,baseNotesKey,recordKey]);
 return {identity,notesKey:scopedNotesKey,ready,error,prepareTarget,retry:()=>void ensureLocal().catch(()=>undefined)};
}
