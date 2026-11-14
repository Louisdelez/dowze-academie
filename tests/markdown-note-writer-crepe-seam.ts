import {editorViewCtx,parserCtx} from '@milkdown/kit/core';

/** SYNTHETIC Crepe/PM seam. No real parser, PM transaction/plugin, IME or device proof. */
export interface CrepeSeamConfiguration {
 creationGate?:PromiseLike<unknown>;
 failCreation?:boolean;
 creationBegan?:(instance:Crepe)=>void;
}
interface SeamOptions {root:HTMLElement;defaultValue?:string;features?:unknown;featureConfigs?:unknown}
type SeamListener=(...args:any[])=>void;
interface SeamDocument {textContent:string;toJSON:()=>unknown;eq:(other:unknown)=>boolean}
interface SeamView {
 dom:HTMLElement|null;composing:boolean;editable:boolean;
 state:{doc:SeamDocument;selection:{head:number}};
 domObserver:{queue:unknown[];flushingSoon:number;flushCalls:number;flush:()=>void};
 hasFocus:()=>boolean;focus:()=>void;coordsAtPos:(position:number)=>{left:number;right:number;top:number;bottom:number};
 setProps:(props:{editable?:()=>boolean})=>void;dispatch:()=>never;
}
export const instances=new Set<Crepe>();
export const syntheticCrepeInstances:Crepe[]=[];
let configuration:CrepeSeamConfiguration={},nextConfigurations:CrepeSeamConfiguration[]=[];
/** Changes defaults for later instances only; existing source incarnations keep their config. */
export function configure(next:CrepeSeamConfiguration={}){configuration={...configuration,...next};}
/** One-shot per-instance override, useful for Strict replay and source A→B fixtures. */
export function configureNext(next:CrepeSeamConfiguration={}){nextConfigurations.push({...next});}
/** Runner-facing one-shot config: only the next constructed instance consumes it. */
export function configureSyntheticCrepe(next:CrepeSeamConfiguration={}){configureNext(next);}
export function listInstances(){return [...instances];}
/** Cleanup must first retire every instance through the actual component's save barrier. */
export function reset(){
 if([...instances].some(instance=>instance.creationStarted&&!instance.destroyed))throw Error('Retire synthetic Crepe instances before resetting the seam');
 instances.clear();syntheticCrepeInstances.length=0;configuration={};nextConfigurations=[];
}
export const resetSyntheticCrepe=reset;
const documentFor=(markdown:string):SeamDocument=>({textContent:markdown,
 toJSON:()=>({type:'doc',content:markdown?[{type:'paragraph',content:[{type:'text',text:markdown}]}]:[]}),
 eq:other=>!!other&&typeof other==='object'&&'textContent' in other&&other.textContent===markdown});

export class Crepe {
 static readonly Feature=Object.freeze({Cursor:'cursor',ListItem:'list-item',LinkTooltip:'link-tooltip',
  ImageBlock:'image-block',BlockEdit:'block-edit',Toolbar:'toolbar',Placeholder:'placeholder',
  CodeMirror:'code-mirror',Table:'table',Latex:'latex',TopBar:'top-bar',AI:'ai'});
 readonly options:SeamOptions;
 readonly root:HTMLElement;
 readonly configuration:Readonly<CrepeSeamConfiguration>;
 readonly view:SeamView;
 readonly editor:{config:(callback:unknown)=>Crepe['editor'];use:(plugin:unknown)=>Crepe['editor'];action:<T>(callback:(ctx:any)=>T)=>T;status:string};
 readonly listener:{selectionUpdated:(listener:SeamListener)=>Crepe['listener'];markdownUpdated:(listener:SeamListener)=>Crepe['listener'];
  blur:(listener:SeamListener)=>Crepe['listener'];focus:(listener:SeamListener)=>Crepe['listener'];destroy:(listener:SeamListener)=>Crepe['listener']};
 dom:HTMLDivElement|null=null;
 creationStarted=false;created=false;destroyed=false;createCalls=0;destroyCalls=0;readonly=false;
 configCalls=0;useCalls=0;
 private markdown:string;
 private lastReported:string;
 private creation:Promise<unknown>|null=null;
 private listeners={selectionUpdated:[] as SeamListener[],markdownUpdated:[] as SeamListener[],blur:[] as SeamListener[],focus:[] as SeamListener[],destroy:[] as SeamListener[]};
 private readonly context:{get:(key:unknown)=>unknown};
 constructor(options:SeamOptions){
  this.options=options;this.root=options.root;this.markdown=options.defaultValue??'';this.lastReported=this.markdown;
  this.configuration=Object.freeze({...configuration,...nextConfigurations.shift()});
  const observer={queue:[] as unknown[],flushingSoon:-1,flushCalls:0,flush:()=>{observer.flushCalls++;observer.queue=[];observer.flushingSoon=-1;}};
  this.view={dom:null,composing:false,editable:true,state:{doc:documentFor(this.markdown),selection:{head:0}},domObserver:observer,
   hasFocus:()=>!!this.dom&&this.root.ownerDocument.activeElement===this.dom,
   focus:()=>this.dom?.focus(),
   coordsAtPos:position=>({left:20+position,right:21+position,top:30,bottom:48}),
   setProps:props=>{if(props.editable)this.view.editable=props.editable();},
   dispatch:()=>{throw Error('Synthetic seam does not implement ProseMirror transactions');}};
  this.context={get:key=>{
   if(key===editorViewCtx)return this.view;
   if(key===parserCtx)return ()=>{throw Error('Synthetic seam does not implement Markdown parsing');};
   throw Error('Unsupported context in synthetic Crepe seam');
  }};
  this.editor={config:()=>{this.configCalls++;return this.editor;},use:()=>{this.useCalls++;return this.editor;},
   action:callback=>callback(this.context),status:'Idle'};
  const listen=(kind:keyof Crepe['listeners'],callback:SeamListener)=>{this.listeners[kind].push(callback);return this.listener;};
  this.listener={selectionUpdated:callback=>listen('selectionUpdated',callback),markdownUpdated:callback=>listen('markdownUpdated',callback),
   blur:callback=>listen('blur',callback),focus:callback=>listen('focus',callback),destroy:callback=>listen('destroy',callback)};
  instances.add(this);syntheticCrepeInstances.push(this);
 }
 private refreshState(){const markdown=this.getMarkdown();this.markdown=markdown;this.view.state={doc:documentFor(markdown),selection:{head:markdown.length}};}
 private event(type:string,data?:string){
  if(!this.dom)throw Error('Synthetic editor DOM is not available');
  const win=this.root.ownerDocument.defaultView;if(!win)throw Error('Synthetic editor has no window');
  const event=(type==='compositionstart'||type==='compositionend')&&typeof win.CompositionEvent==='function'
   ?new win.CompositionEvent(type,{bubbles:true,data:data??''})
   :(type==='beforeinput'||type==='input')&&typeof win.InputEvent==='function'
    ?new win.InputEvent(type,{bubbles:true,inputType:'insertText',data:data??''})
    :new win.Event(type,{bubbles:true});
  this.dom.dispatchEvent(event);
 }
 create():Promise<unknown>{
  if(this.creation)return this.creation;
  this.createCalls++;this.creationStarted=true;this.editor.status='Creating';
  let finish!:(value:unknown)=>void,reject!:(reason:unknown)=>void;
  const ticket=new Promise<unknown>((yes,no)=>{finish=yes;reject=no;});this.creation=ticket;
  const perform=async()=>{
   if(this.destroyed)throw Error('Synthetic editor was already destroyed');
   if(this.configuration.failCreation){this.configuration.creationBegan?.(this);throw Error('Synthetic Crepe creation failure');}
   const dom=this.root.ownerDocument.createElement('div');dom.className='ProseMirror';dom.dataset.syntheticCrepe='true';
   dom.setAttribute('contenteditable',String(!this.readonly));dom.tabIndex=0;dom.textContent=this.markdown;
   this.dom=dom;this.view.dom=dom;this.root.appendChild(dom);this.refreshState();
   dom.addEventListener('focus',()=>{for(const callback of this.listeners.focus)callback(this.context);});
   dom.addEventListener('blur',()=>{for(const callback of this.listeners.blur)callback(this.context);});
   this.configuration.creationBegan?.(this);
   if(this.configuration.creationGate)await this.configuration.creationGate;
   if(this.destroyed)throw Error('Synthetic editor was destroyed during creation');
   this.created=true;this.editor.status='Created';return undefined;
  };
  void perform().then(finish,reject);return ticket;
 }
 async destroy(){
  this.destroyCalls++;if(this.destroyed)return;
  this.destroyed=true;this.created=false;this.editor.status='Destroyed';
  for(const callback of this.listeners.destroy)callback(this.context);
  this.dom?.remove();this.view.dom=null;
 }
 getMarkdown(){return this.dom?.textContent??this.markdown;}
 setReadonly(value:boolean){this.readonly=value;this.view.editable=!value;if(this.dom)this.dom.setAttribute('contenteditable',String(!value));return this;}
 on(callback:(listener:Crepe['listener'])=>void){callback(this.listener);return this;}
 /** Real DOM events feed the actual component; no real PM plugin transaction is emitted. */
 input(markdown:string){
  if(this.destroyed)throw Error('Cannot input into a destroyed synthetic editor');
  this.event('beforeinput',markdown);this.dom!.textContent=markdown;this.refreshState();this.event('input',markdown);
  const previous=this.lastReported;this.lastReported=markdown;
  for(const callback of this.listeners.markdownUpdated)callback(this.context,markdown,previous);
 }
 startComposition(rawMarkdown=this.getMarkdown()){
  this.view.composing=true;this.event('compositionstart',rawMarkdown);this.input(rawMarkdown);
 }
 endComposition(markdown=this.getMarkdown()){
  this.view.composing=false;this.event('compositionend',markdown);this.input(markdown);
 }
 focus(){this.dom?.focus();}
 blur(){this.dom?.blur();}
 select(head=this.getMarkdown().length){
  this.view.state={...this.view.state,selection:{head}};
  for(const callback of this.listeners.selectionUpdated)callback(this.context,this.view.state.selection,null);
 }
}
export default Crepe;
