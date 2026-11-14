import {languages} from '@codemirror/language-data';
import type {Parser} from '@lezer/common';
import {classHighlighter,highlightTree} from '@lezer/highlight';
export interface PaperCodeRange {from:number;to:number;className:string}
const parsers=new Map<string,Parser>(),pending=new Map<string,Promise<void>>();
const normalize=(language:string)=>language.trim().toLowerCase();
export function loadPaperCodeLanguage(language:string):Promise<void>{
 const name=normalize(language);if(parsers.has(name))return Promise.resolve();
 const current=pending.get(name);if(current)return current;
 const description=languages.find(d=>normalize(d.name)===name||d.alias.some(alias=>normalize(alias)===name));
 if(!description)return Promise.resolve();
 const loading=description.load().then(support=>{parsers.set(name,support.language.parser);}).catch(()=>undefined);
 pending.set(name,loading);return loading;
}
/** Parsing changes colours only; the complete code remains editable/exportable as text. */
export function paperCodeRanges(code:string,language:string):PaperCodeRange[]{
 const parser=parsers.get(normalize(language));if(!parser||code.length>200000)return [];
 const ranges:PaperCodeRange[]=[];
 highlightTree(parser.parse(code),classHighlighter,(from,to,className)=>{ranges.push({from,to,className});});return ranges;
}
