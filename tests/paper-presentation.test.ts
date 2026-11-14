import test from 'node:test';
import assert from 'node:assert/strict';
import {paperPresentationFit} from '../src/lib/paperPresentation.ts';

const near=(actual:number,expected:number)=>assert.ok(Math.abs(actual-expected)<=Math.max(1,Math.abs(expected))*1e-12,`Expected ${actual} to be near ${expected}`);

test('A complete large page fits a phone without imposing a minimum editor zoom',()=>{
 const result=paperPresentationFit({width:120000,height:180000},{width:360,height:600});
 near(result.scale,.003);near(result.width,360);near(result.height,540);
 assert.ok(result.scale<.3);
});

test('Both viewport dimensions constrain the projection and preserve the page aspect ratio',()=>{
 const page={width:800,height:1100};
 const phone=paperPresentationFit(page,{width:360,height:520});
 near(phone.scale,.45);near(phone.width,360);near(phone.height,495);
 const shortView=paperPresentationFit(page,{width:1000,height:400});
 near(shortView.height,400);near(shortView.width,3200/11);
 near(shortView.width/shortView.height,page.width/page.height);
 const narrowView=paperPresentationFit(page,{width:240,height:160});
 near(narrowView.scale,8/55);near(narrowView.height,160);
 assert.ok(narrowView.width<=240+1e-10&&narrowView.height<=160+1e-10);
});

test('Small pages can fill a larger display and already rotated dimensions fit once',()=>{
 assert.deepEqual(paperPresentationFit({width:80,height:110},{width:800,height:1100}),{scale:10,width:800,height:1100});
 const rotated=paperPresentationFit({width:1100,height:800},{width:880,height:640});
 near(rotated.scale,.8);near(rotated.width,880);near(rotated.height,640);
});

test('Invalid page or viewport dimensions are refused rather than silently clamped',()=>{
 for(const value of [0,-0,-1,NaN,Infinity,-Infinity]){
  for(const field of ['width','height'] as const){
   assert.throws(()=>paperPresentationFit({...{width:800,height:1100},[field]:value},{width:360,height:520}),RangeError);
   assert.throws(()=>paperPresentationFit({width:800,height:1100},{...{width:360,height:520},[field]:value}),RangeError);
  }
 }
 assert.throws(()=>paperPresentationFit({width:Number.MIN_VALUE,height:Number.MIN_VALUE},{width:Number.MAX_VALUE,height:Number.MAX_VALUE}),RangeError);
 assert.throws(()=>paperPresentationFit({width:Number.MAX_VALUE,height:Number.MAX_VALUE},{width:Number.MIN_VALUE,height:Number.MIN_VALUE}),RangeError);
});

test('Resizing projections leaves the supplied canonical page and viewport untouched',()=>{
 const page=Object.freeze({id:'source-page',width:1100,height:800,rotation:90,pdf:Object.freeze({assetId:'original',pageNumber:2})});
 const viewport=Object.freeze({width:360,height:520});
 const before=structuredClone(page),viewportBefore=structuredClone(viewport);
 const first=paperPresentationFit(page,viewport);
 const other=paperPresentationFit(page,{width:1920,height:1080});
 assert.notEqual(first,other);
 assert.deepEqual(page,before);assert.deepEqual(viewport,viewportBefore);
 assert.equal(page.pdf.assetId,'original');assert.equal(page.rotation,90);
});
