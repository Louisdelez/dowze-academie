/** Real fflate ZIP writers and real bounded central-directory reader.
 * No fake product result, storage adapter, browser or native-file claim. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {Zip,ZipPassThrough,zipSync,strToU8} from 'fflate';
import {readBoundedZipBlob,type BoundedZipBlobOptions} from '../src/lib/zipBlob.ts';
const options=(extra:Partial<BoundedZipBlobOptions>={}):BoundedZipBlobOptions=>({maxBytes:2*1024*1024,maxEntries:8,maxMemberBytes:1024*1024,maxExpandedBytes:1024*1024,maxDirectoryBytes:65536,acceptEntry:()=>true,...extra});
function streamed(entries:[string,Uint8Array][]):Uint8Array{
 const pieces:Uint8Array[]= [];let finished=false;
 const zip=new Zip((error,chunk,final)=>{if(error)throw error;pieces.push(chunk);if(final)finished=true;});
 try{for(const [name,data] of entries){const member=new ZipPassThrough(name);zip.add(member);member.push(data,true);}zip.end();assert.equal(finished,true);const result=new Uint8Array(pieces.reduce((sum,part)=>sum+part.length,0));let offset=0;for(const part of pieces){result.set(part,offset);offset+=part.length;}return result;}finally{zip.terminate();}
}
function central(bytes:Uint8Array){
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),footer=bytes.length-22,offset=view.getUint32(footer+16,true),count=view.getUint16(footer+10,true),entries:{name:string;position:number;local:number;compressed:number}[]=[];
 let position=offset;for(let n=0;n<count;n++){const nameLength=view.getUint16(position+28,true);entries.push({name:new TextDecoder().decode(bytes.subarray(position+46,position+46+nameLength)),position,local:view.getUint32(position+42,true),compressed:view.getUint32(position+20,true)});position+=46+nameLength+view.getUint16(position+30,true)+view.getUint16(position+32,true);}return {view,footer,offset,entries};
}
test('Stored streaming and ordinary stored/deflated ZIPs preserve complete ZIP signatures as opaque original bytes',async()=>{
 const payload=zipSync({'real-inner.txt':strToU8('Original inner ZIP bytes')},{level:0}),entries:[string,Uint8Array][]=[['document.json',strToU8('{"schema":1}')],['assets/original',payload]];
 for(const bytes of [streamed(entries),zipSync(Object.fromEntries(entries),{level:0}),zipSync(Object.fromEntries(entries),{level:6})]){
  const source=new Blob([bytes]);source.arrayBuffer=async()=>{throw Error('Whole ZIP read is forbidden');};const files=await readBoundedZipBlob(source,options());assert.deepEqual(new Uint8Array(await files.get('assets/original')!.arrayBuffer()),payload);assert.equal(await files.get('document.json')!.text(),'{"schema":1}');
 }
});
test('Valid 12-byte unsigned data descriptors are bounded by actual next local offsets',async()=>{
 const original=streamed([['document.json',strToU8('original document')],['assets/original',strToU8('PK\x03\x04 original payload')]]),info=central(original),signatures=info.entries.map(entry=>entry.local+30+info.view.getUint16(entry.local+26,true)+info.view.getUint16(entry.local+28,true)+entry.compressed).sort((a,b)=>a-b);
 for(const offset of signatures)assert.equal(info.view.getUint32(offset,true),0x08074b50);
 const bytes=new Uint8Array(original.length-4*signatures.length);let from=0,to=0;for(const offset of signatures){bytes.set(original.subarray(from,offset),to);to+=offset-from;from=offset+4;}bytes.set(original.subarray(from),to);
 const view=new DataView(bytes.buffer),removedBefore=(position:number)=>signatures.filter(offset=>offset<position).length*4;
 for(const entry of info.entries)view.setUint32(entry.position-removedBefore(entry.position)+42,entry.local-removedBefore(entry.local),true);
 view.setUint32(info.footer-removedBefore(info.footer)+16,info.offset-removedBefore(info.offset),true);
 const files=await readBoundedZipBlob(new Blob([bytes]),options());assert.equal(await files.get('document.json')!.text(),'original document');assert.equal(await files.get('assets/original')!.text(),'PK\x03\x04 original payload');
});
test('Legacy filter counts and deduplicates ignored names without inflating or applying accepted-member quotas to them',async()=>{
 const bytes=zipSync({'document.json':strToU8('accepted'),'ignored.bin':strToU8('opaque ignored bytes')},{level:0}),info=central(bytes),unknown=info.entries.find(entry=>entry.name==='ignored.bin')!;
 // A valid opaque payload of an unsupported method is still ignored by the
 // legacy filter; accepted content is never granted this bypass.
 info.view.setUint16(unknown.position+10,99,true);info.view.setUint16(unknown.local+8,99,true);info.view.setUint32(unknown.position+24,32*1024*1024,true);info.view.setUint32(unknown.local+22,32*1024*1024,true);
 const files=await readBoundedZipBlob(new Blob([bytes]),options({maxMemberBytes:100,maxExpandedBytes:100,acceptEntry:name=>name==='document.json'}));assert.deepEqual([...files.keys()],['document.json']);assert.equal(await files.get('document.json')!.text(),'accepted');
 await assert.rejects(readBoundedZipBlob(new Blob([bytes]),options({maxEntries:1,acceptEntry:name=>name==='document.json'})),/ZIP/);
 const duplicated=streamed([['document.json',strToU8('accepted')],['ignored.bin',strToU8('one')],['ignored.bin',strToU8('two')]]);await assert.rejects(readBoundedZipBlob(new Blob([duplicated]),options({acceptEntry:name=>name==='document.json'})),/répété/);
 await assert.rejects(readBoundedZipBlob(new Blob([bytes]),options({acceptEntry:()=>true})),/ZIP/);
});
test('Directory expansion quotas and exact local/central identity reject before exposing any files',async()=>{
 const original=zipSync({'document.json':strToU8('accepted'),'assets/original':strToU8('original bytes')},{level:0});
 await assert.rejects(readBoundedZipBlob(new Blob([original]),options({maxDirectoryBytes:1})),/ZIP/);
 await assert.rejects(readBoundedZipBlob(new Blob([original]),options({maxExpandedBytes:1})),/taille/);
 for(const mode of ['local-name','crc','encrypted','overlap']){const bytes=original.slice(),info=central(bytes),entry=info.entries[0];if(mode==='local-name')bytes[entry.local+30]^=1;if(mode==='crc'){const crc=info.view.getUint32(entry.position+16,true)^1;info.view.setUint32(entry.position+16,crc,true);info.view.setUint32(entry.local+14,crc,true);}if(mode==='encrypted'){info.view.setUint16(entry.position+8,1,true);info.view.setUint16(entry.local+6,1,true);}if(mode==='overlap'){info.view.setUint32(entry.position+20,entry.compressed+1,true);info.view.setUint32(entry.position+24,entry.compressed+1,true);info.view.setUint32(entry.local+18,entry.compressed+1,true);info.view.setUint32(entry.local+22,entry.compressed+1,true);}await assert.rejects(readBoundedZipBlob(new Blob([bytes]),options()),/ZIP/);}
});
test('Current authority is rechecked after actual asynchronous Blob reads',async()=>{
 const bytes=zipSync({'document.json':strToU8('accepted')},{level:0}),source=new Blob([bytes]),slice=source.slice.bind(source);let current=true,reads=0;
 source.slice=(start,end,type)=>{const part=slice(start,end,type),read=part.arrayBuffer.bind(part);part.arrayBuffer=async()=>{const result=await read();reads++;current=false;return result;};return part;};
 await assert.rejects(readBoundedZipBlob(source,options({current:()=>current})),/source a changé/);assert.equal(reads,1);assert.equal(source.size,bytes.length);
});
