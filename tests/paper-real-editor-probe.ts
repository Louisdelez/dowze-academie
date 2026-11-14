import {Crepe} from '@milkdown/crepe';
import {editorViewCtx,rootCtx} from '@milkdown/kit/core';
import type {EditorView} from '@milkdown/kit/prose/view';

export interface RealPaperEditorRecord {
 readonly crepe:Crepe;
 view:EditorView|null;root:HTMLElement|null;
 created:boolean;destroyed:boolean;destroyCalls:number;
 inspectionError?:string;
}
export interface RealPaperEditorProbe {
 readonly records:RealPaperEditorRecord[];
 clear:()=>void;restore:()=>void;
}
let installedProbe:RealPaperEditorProbe|null=null;

/** Observe actual Crepe/Milkdown/PM methods. No editor, transaction, persistence,
 * composition or view is replaced. Crepe 7.22 defines create/destroy as own
 * arrow fields, so prototype method wrappers would silently miss every call.
 * Its actual editor getter is read in the Crepe constructor and before create;
 * use that getter solely to wrap each instance's original lifecycle methods. */
export function installRealPaperEditorProbe():RealPaperEditorProbe {
 if(installedProbe)throw Error('The real editor probe is already installed.');
 const target=Crepe.prototype,ownGetter=Object.getOwnPropertyDescriptor(target,'editor');
 let ancestor:object|null=target,getter:PropertyDescriptor|undefined;
 while(ancestor&&!getter){getter=Object.getOwnPropertyDescriptor(ancestor,'editor');ancestor=Object.getPrototypeOf(ancestor);}
 if(typeof getter?.get!=='function')throw Error('The installed Crepe must expose its actual editor getter.');
 const readEditor=getter.get,records:RealPaperEditorRecord[]=[],originals=new Map<Crepe,{record:RealPaperEditorRecord;create:PropertyDescriptor;destroy:PropertyDescriptor;wrappedCreate:Function;wrappedDestroy:Function}>();
 let restored=false;
 const drained=()=>{if(records.some(record=>!record.destroyed))throw Error('The real editor probe cannot retire while an editor is still retained.');};
 const observe=(crepe:Crepe)=>{
  const create=Object.getOwnPropertyDescriptor(crepe,'create'),destroy=Object.getOwnPropertyDescriptor(crepe,'destroy');
  if(typeof create?.value!=='function'||typeof destroy?.value!=='function')throw Error('The actual Crepe instance lifecycle methods must be present.');
  const previous=originals.get(crepe);
  if(previous&&create.value===previous.wrappedCreate&&destroy.value===previous.wrappedDestroy)return;
  const record:RealPaperEditorRecord=previous?.record??{crepe,view:null,root:null,created:false,destroyed:false,destroyCalls:0};
  if(!previous)records.push(record);
  // A derived class or a real feature may replace own lifecycle fields after
  // an earlier getter read. Wrap its final methods on the next getter read,
  // without forwarding through our own prior wrappers a second time.
  const originalCreate=previous&&create.value===previous.wrappedCreate?previous.create:create;
  const originalDestroy=previous&&destroy.value===previous.wrappedDestroy?previous.destroy:destroy;
  const wrappedCreate=async(...args:Parameters<Crepe['create']>)=>{
   let result:Awaited<ReturnType<Crepe['create']>>;
   try{result=await originalCreate.value.apply(crepe,args);}catch(error){record.inspectionError='Actual create failed: '+String(error instanceof Error?error.message:error).slice(0,240);throw error;}
   record.created=true;record.destroyed=false;
   try{
    const editor=readEditor.call(crepe) as Crepe['editor'];
    record.view=editor.action(ctx=>ctx.get(editorViewCtx));
    const value=editor.action(ctx=>ctx.get(rootCtx)),root=typeof value==='string'?globalThis.document.querySelector(value):value;
    if(!(root instanceof HTMLElement))throw Error('The actual editor root must be an HTMLElement.');
    record.root=root;delete record.inspectionError;
   }catch(error){record.inspectionError=String(error instanceof Error?error.message:error).slice(0,300);}
   return result;
  };
  const wrappedDestroy=async(...args:Parameters<Crepe['destroy']>)=>{
   record.destroyCalls++;const result=await originalDestroy.value.apply(crepe,args);record.destroyed=true;return result;
  };
  originals.set(crepe,{record,create:originalCreate,destroy:originalDestroy,wrappedCreate,wrappedDestroy});
  Object.defineProperty(crepe,'create',{...create,value:wrappedCreate});
  Object.defineProperty(crepe,'destroy',{...destroy,value:wrappedDestroy});
 };
 Object.defineProperty(target,'editor',{configurable:true,enumerable:getter.enumerable??false,get:function(this:Crepe){const editor=readEditor.call(this);observe(this);return editor;}});
 const probe:RealPaperEditorProbe={records,
  clear:()=>{
   drained();for(const [crepe,methods] of originals){Object.defineProperty(crepe,'create',methods.create);Object.defineProperty(crepe,'destroy',methods.destroy);}
   originals.clear();records.splice(0);
  },
  restore:()=>{
   if(restored)return;drained();
   for(const [crepe,methods] of originals){Object.defineProperty(crepe,'create',methods.create);Object.defineProperty(crepe,'destroy',methods.destroy);}
   if(ownGetter)Object.defineProperty(target,'editor',ownGetter);else Reflect.deleteProperty(target,'editor');
   originals.clear();restored=true;if(installedProbe===probe)installedProbe=null;
  }
 };installedProbe=probe;return probe;
}
