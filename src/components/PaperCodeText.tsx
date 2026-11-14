import {useEffect,useState} from 'react';
import {loadPaperCodeLanguage,paperCodeRanges,type PaperCodeRange} from '../lib/paperCodeHighlight';
export function PaperCodeText({code,language,sourceFrom,sourceTo}:{code:string;language:string;sourceFrom?:number;sourceTo?:number}){
 const [ranges,setRanges]=useState<PaperCodeRange[]>([]),[ready,setReady]=useState(false);
 useEffect(()=>{let stopped=false;setRanges([]);setReady(false);void loadPaperCodeLanguage(language).then(()=>{if(!stopped){setRanges(paperCodeRanges(code,language));setReady(true);}});return()=>{stopped=true;};},[code,language]);
 let offset=0;const output:React.ReactNode[]=[];
 for(const range of ranges){if(range.from>offset)output.push(code.slice(offset,range.from));output.push(<span key={range.from+'-'+range.to} className={range.className}>{code.slice(range.from,range.to)}</span>);offset=range.to;}
 if(offset<code.length)output.push(code.slice(offset));return <code data-md-from={Number.isSafeInteger(sourceFrom)?sourceFrom:undefined} data-md-to={Number.isSafeInteger(sourceTo)?sourceTo:undefined} data-md-mode="code" data-code-ready={String(ready)} className={'language-'+language}>{output}</code>;
}
