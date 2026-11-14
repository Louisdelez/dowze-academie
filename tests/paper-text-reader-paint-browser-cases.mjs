import assert from 'node:assert/strict';

/** Observe the actual existing reader and PM. Never changes styles or source. */
export async function assertExclusivePaperTextPaint(page,noteId,bounded){
 const proof=await bounded(page.evaluate(id=>{
  const panel=document.getElementById('workspace-panel-'+id),objectId=id+'-main-text';
  const hosts=[...panel?.querySelectorAll('[data-canonical-text-object]')??[]].filter(node=>node.dataset.canonicalTextObject===objectId&&node.dataset.textHostRevoked==='false'&&node.dataset.textHostParked==='false');
  const host=hosts[0],pageId=host?.dataset.canonicalTextPage,pm=host?.querySelector('.ProseMirror');
  const frame=[...panel?.querySelectorAll('[data-editable-page]')??[]].find(node=>node.dataset.editablePage===pageId);
  const reader=[...frame?.querySelectorAll('.paper-editable-page-reader [data-object]')??[]].find(node=>node.dataset.object===objectId);
  const text=reader?.querySelector('.paper-flow-clip')??reader;
  const paintable=node=>{if(!node?.isConnected)return false;for(let current=node;current;current=current.parentElement){const style=getComputedStyle(current);if(style.display==='none'||style.visibility==='hidden'||style.visibility==='collapse'||Number(style.opacity)===0||current.hidden)return false;}return true;};
  const rect=pm?.getBoundingClientRect();
  return {hostCount:hosts.length,pageId:pageId??null,readerConnected:reader?.isConnected??false,readerTextPaintVisible:paintable(text),PMConnected:pm?.isConnected??false,PMPaintVisible:paintable(pm),PMSize:rect?{width:rect.width,height:rect.height}:null,readerSize:reader?{width:reader.getBoundingClientRect().width,height:reader.getBoundingClientRect().height}:null};
 },noteId),'Observe exclusive actual reader and PM paint',2000);
 assert.equal(proof.hostCount,1,'One exact current unparked canonical source must own this page projection');
 assert.equal(proof.PMConnected,true,'Exclusive paint requires a real connected PM, never an empty/loading host');
 assert.equal(proof.PMPaintVisible,true,'The actual writer must remain visibly painted');
 assert.ok(proof.PMSize?.width>0&&proof.PMSize?.height>0,'The actual writer must have nonzero native dimensions');
 assert.equal(proof.readerConnected,true,'Masking must retain the source reader DOM');
 assert.ok(proof.readerSize?.width>0&&proof.readerSize?.height>0,'Masking must preserve reader geometry');
 assert.equal(proof.readerTextPaintVisible,false,'The exact object/page reader must not paint a second copy under its ready writer');
 return proof;
}
