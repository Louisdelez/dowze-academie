import test from 'node:test';
import assert from 'node:assert/strict';
import {pdfDestinationPage,safePdfUrl,pdfLinkRectangle} from '../src/lib/paperPdfNavigation.ts';
test('PDF links accept ordinary URLs without allowing JavaScript, file or data schemes',()=>{
 assert.equal(safePdfUrl('https://academie.dowze.ch/app/'),'https://academie.dowze.ch/app/');assert.equal(safePdfUrl('mailto:hello@example.com'),'mailto:hello@example.com');for(const input of ['javascript:alert(1)','file:///etc/passwd','data:text/html,x','/relative',null,'ftp://example.com'])assert.equal(safePdfUrl(input),undefined);
});
test('Internal destinations resolve references, named targets and indexes with page bounds',async()=>{
 const pdf={numPages:3,getDestination:async(name:string)=>name==='named'?[{num:7,gen:0}]:null,getPageIndex:async(ref:{num:number})=>ref.num===7?2:-1};assert.equal(await pdfDestinationPage(pdf,'named'),3);assert.equal(await pdfDestinationPage(pdf,[1]),2);for(const d of [[3],[-1],['script'],null,'unknown'])assert.equal(await pdfDestinationPage(pdf,d),undefined);
});
test('Link rectangles normalize rotated coordinates and clip only to the paper viewport',()=>{
 const viewport={width:600,height:800,convertToViewportPoint:(x:number,y:number)=>[x,y]};assert.deepEqual(pdfLinkRectangle(viewport,[120,100,60,200]),{left:10,top:12.5,width:10,height:12.5});assert.deepEqual(pdfLinkRectangle(viewport,[-20,700,40,900]),{left:0,top:87.5,width:40/600*100,height:12.5});assert.equal(pdfLinkRectangle(viewport,[0,0,0,0]),undefined);assert.equal(pdfLinkRectangle(viewport,[NaN,0,10,10]),undefined);
});
