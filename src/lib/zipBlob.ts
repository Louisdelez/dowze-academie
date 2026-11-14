import {Inflate,strFromU8} from 'fflate';

/** ZIP32 ranges are taken from the central directory, never inferred from PK
 * signatures in stored payloads (which are themselves complete .dowze ZIPs). */
interface BlobZipEntry {accepted:boolean;name:string;flags:number;method:number;crc:number;compressed:number;size:number;offset:number}
const zipCrcTable=Uint32Array.from({length:256},(_,index)=>{let value=index;for(let bit=0;bit<8;bit++)value=value&1?0xedb88320^(value>>>1):value>>>1;return value>>>0;});
const zipStructureError=()=>Error('La structure ZIP est incompatible ou endommagée. Les originaux sont conservés.');
export interface BoundedZipBlobOptions {
 maxBytes:number;maxEntries:number;maxMemberBytes:number;maxExpandedBytes:number;maxDirectoryBytes:number;
 minEntries?:number;maxNameBytes?:number;
 /** Every name is counted/deduplicated. false entries stay opaque and are not
  * inflated, copied or included in the expanded quota, matching archive filters. */
 acceptEntry:(name:string)=>boolean;
 rejectUnknown?:boolean;
 memberLimit?:(name:string)=>number;
 current?:()=>boolean;
 onProgress?:(completed:number,total:number)=>void;
}
export async function readBoundedZipBlob(blob:Blob,options:BoundedZipBlobOptions):Promise<Map<string,Blob>>{
 const {maxBytes,maxEntries,maxMemberBytes,maxExpandedBytes,maxDirectoryBytes,minEntries=0,maxNameBytes=65535,acceptEntry,rejectUnknown=false,memberLimit,current=()=>true,onProgress}=options;
 if(![maxBytes,maxEntries,maxMemberBytes,maxExpandedBytes,maxDirectoryBytes,maxNameBytes,minEntries].every(value=>Number.isSafeInteger(value)&&value>=0)||!blob.size||blob.size>maxBytes)throw zipStructureError();
 const check=()=>{if(!current())throw Error('La source a changé pendant la lecture ZIP. Les originaux sont conservés.');};check();
 const read=async(start:number,length:number)=>{check();if(!Number.isSafeInteger(start)||!Number.isSafeInteger(length)||start<0||length<0||start+length>blob.size)throw zipStructureError();const bytes=new Uint8Array(await blob.slice(start,start+length).arrayBuffer());check();if(bytes.length!==length)throw zipStructureError();return bytes;};
 const tailOffset=Math.max(0,blob.size-65557),tail=await read(tailOffset,blob.size-tailOffset),footer=new DataView(tail.buffer);let directory:{count:number;offset:number;size:number}|undefined;
 for(let i=tail.length-22;i>=0;i--)if(footer.getUint32(i,true)===0x06054b50&&i+22+footer.getUint16(i+20,true)===tail.length){
  const count=footer.getUint16(i+10,true),offset=footer.getUint32(i+16,true),size=footer.getUint32(i+12,true);
  if(footer.getUint16(i+4,true)||footer.getUint16(i+6,true)||footer.getUint16(i+8,true)!==count||count<minEntries||count>maxEntries||size>maxDirectoryBytes||offset+size!==tailOffset+i)throw zipStructureError();directory={count,offset,size};break;
 }
 if(!directory)throw zipStructureError();
 const central=await read(directory.offset,directory.size),index=new DataView(central.buffer),entries:BlobZipEntry[]=[],names=new Set<string>(),decoder=new TextDecoder('utf-8',{fatal:true});let cursor=0,expanded=0;
 for(let n=0;n<directory.count;n++){
  if(cursor+46>central.length||index.getUint32(cursor,true)!==0x02014b50)throw zipStructureError();
  const flags=index.getUint16(cursor+8,true),method=index.getUint16(cursor+10,true),crc=index.getUint32(cursor+16,true),compressed=index.getUint32(cursor+20,true),size=index.getUint32(cursor+24,true),nameLength=index.getUint16(cursor+28,true),extraLength=index.getUint16(cursor+30,true),commentLength=index.getUint16(cursor+32,true),attributes=index.getUint32(cursor+38,true),offset=index.getUint32(cursor+42,true),end=cursor+46+nameLength+extraLength+commentLength;
  if(end>central.length||!nameLength||nameLength>maxNameBytes||index.getUint16(cursor+34,true)!==0||compressed===0xffffffff||size===0xffffffff||offset===0xffffffff||offset>=directory.offset)throw zipStructureError();
  const rawName=central.subarray(cursor+46,cursor+46+nameLength),name=flags&0x0800?decoder.decode(rawName):strFromU8(rawName,true),accepted=acceptEntry(name);
  if(names.has(name)||rejectUnknown&&!accepted)throw Error('Cette archive contient un élément incompatible ou répété.');names.add(name);
  if(accepted){
   if(flags&~0x080e||![0,8].includes(method)||method===0&&flags&6||attributes&0x10||((attributes>>>16)&0xf000)!==0&&((attributes>>>16)&0xf000)!==0x8000)throw zipStructureError();
   const limit=Math.min(maxMemberBytes,memberLimit?.(name)??maxMemberBytes);if(!Number.isSafeInteger(limit)||limit<0||size>limit||method===0&&compressed!==size)throw Error('Un élément ZIP dépasse la taille prise en charge ou possède une taille incompatible.');
   expanded+=size;if(expanded>maxExpandedBytes)throw Error('Le contenu ZIP décompressé dépasse la taille prise en charge.');
  }
  entries.push({accepted,name,flags,method,crc,compressed,size,offset});cursor=end;
 }
 if(cursor!==central.length)throw zipStructureError();
 const files=new Map<string,Blob>();let nextOffset=0;
 for(const [entryIndex,entry] of entries.sort((a,b)=>a.offset-b.offset).entries()){
  // Exact contiguous ranges also reject unindexed local members, overlap and
  // duplicate central records pointing at the same physical file.
  if(entry.offset!==nextOffset)throw zipStructureError();
  const header=await read(entry.offset,30),local=new DataView(header.buffer),nameLength=local.getUint16(26,true),extraLength=local.getUint16(28,true);
  if(local.getUint32(0,true)!==0x04034b50||local.getUint16(6,true)!==entry.flags||local.getUint16(8,true)!==entry.method||nameLength>maxNameBytes)throw zipStructureError();
  const rawName=await read(entry.offset+30,nameLength),name=entry.flags&0x0800?decoder.decode(rawName):strFromU8(rawName,true);if(name!==entry.name)throw zipStructureError();
  const dataOffset=entry.offset+30+nameLength+extraLength,dataEnd=dataOffset+entry.compressed;
  const physicalEnd=entries[entryIndex+1]?.offset??directory.offset;if(dataEnd>physicalEnd)throw zipStructureError();
  const localCrc=local.getUint32(14,true),localCompressed=local.getUint32(18,true),localSize=local.getUint32(22,true);
  if(entry.flags&8){
   if(localCrc!==0&&localCrc!==entry.crc||localCompressed!==0&&localCompressed!==entry.compressed||localSize!==0&&localSize!==entry.size)throw zipStructureError();
   const descriptorLength=physicalEnd-dataEnd;if(descriptorLength!==12&&descriptorLength!==16)throw zipStructureError();const descriptor=new DataView((await read(dataEnd,descriptorLength)).buffer),base=descriptorLength===16?4:0;
   if(base&&descriptor.getUint32(0,true)!==0x08074b50||descriptor.getUint32(base,true)!==entry.crc||descriptor.getUint32(base+4,true)!==entry.compressed||descriptor.getUint32(base+8,true)!==entry.size)throw zipStructureError();nextOffset=dataEnd+descriptorLength;
  }else{if(dataEnd!==physicalEnd||localCrc!==entry.crc||localCompressed!==entry.compressed||localSize!==entry.size)throw zipStructureError();nextOffset=dataEnd;}
  if(!entry.accepted){onProgress?.(nextOffset,blob.size);check();continue;}
  const pieces:Blob[]=[];let size=0,crc=0xffffffff,finished=entry.method===0;
  const receive=(bytes:Uint8Array,final:boolean)=>{check();size+=bytes.length;if(size>entry.size||size>maxMemberBytes)throw Error('Le contenu ZIP décompressé dépasse sa taille prouvée.');for(const byte of bytes)crc=zipCrcTable[(crc^byte)&255]^(crc>>>8);if(entry.method===8&&bytes.length)pieces.push(new Blob([bytes as Uint8Array<ArrayBuffer>]));if(final)finished=true;};
  const inflater=entry.method===8?new Inflate(receive):undefined;
  if(!entry.compressed){if(inflater)inflater.push(new Uint8Array(),true);}
  for(let offset=0;offset<entry.compressed;offset+=16384){const end=Math.min(entry.compressed,offset+16384),bytes=await read(dataOffset+offset,end-offset);if(inflater)inflater.push(bytes,end===entry.compressed);else receive(bytes,end===entry.compressed);if(offset>0&&offset%(1024*1024)===0){await new Promise<void>(resolve=>setTimeout(resolve,0));check();}}
  if(!finished||size!==entry.size||((~crc)>>>0)!==entry.crc)throw zipStructureError();
  files.set(entry.name,entry.method===0?blob.slice(dataOffset,dataEnd):new Blob(pieces));onProgress?.(nextOffset,blob.size);check();
 }
 if(nextOffset!==directory.offset)throw zipStructureError();onProgress?.(blob.size,blob.size);check();return files;
}

