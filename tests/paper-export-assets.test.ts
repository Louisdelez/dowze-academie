import test from 'node:test';
import assert from 'node:assert/strict';
import {paperExportPageAssetIds} from '../src/lib/paperExportAssetManifest.ts';
import {migratePaper,blankPage} from '../src/lib/notebookDocument.ts';

const fixture=(markdown:string)=>{const document=migratePaper('export-images',markdown,null);document.assets.push({id:'private-image',name:'Photo',mediaType:'image/png',size:3,serverId:'server-image'},{id:'unused-private',name:'Unused',mediaType:'image/png',size:3});return document;};
test('Export reads actual inline and referenced Markdown images once, preserving image title semantics',()=>{
 const document=fixture('![Alt](dowze-photo:paper-v3-note-export-images/private-image "Original title")\n\n![Reference][picture]\n\n[picture]: <dowze-photo:note-export-images/private-image> \'Reference title\'');assert.deepEqual([...paperExportPageAssetIds(document,document.pages[0])],['private-image']);
});
test('Code, ordinary links, escaped image examples and an unused asset name do not fetch private images',()=>{
 const document=fixture('unused-private\n\n[Open](dowze-photo:paper-v3-note-export-images/private-image)\n\n`![Code](dowze-photo:paper-v3-note-foreign/private-image)`\n\n\\![Escaped](dowze-photo:paper-v3-note-export-images/private-image)\n\n```md\n![Example](dowze-photo:paper-v3-note-foreign/private-image)\n```');assert.deepEqual([...paperExportPageAssetIds(document,document.pages[0])],[]);
});
test('A foreign image reference cannot export a same-ID image from this note',()=>{
 const document=fixture('![Foreign](dowze-photo:paper-v3-note-foreign/private-image)');assert.throws(()=>paperExportPageAssetIds(document,document.pages[0]),/autre carnet/);document.objects[0].markdown='![Malformed](dowze-photo:broken/path/extra)';assert.throws(()=>paperExportPageAssetIds(document,document.pages[0]),/référence/);
});
test('Floating images and original PDF pages request their own assets, while annotation-only exports skip the PDF body',()=>{
 const document=fixture(''),page=document.pages[0];document.assets.push({id:'pdf-original',name:'PDF',mediaType:'application/pdf',size:10});page.pdf={assetId:'pdf-original',pageNumber:1};document.objects.push({...document.objects[0],id:'picture-object',kind:'image',assetId:'private-image'});assert.deepEqual([...paperExportPageAssetIds(document,page)],['private-image','pdf-original']);assert.deepEqual([...paperExportPageAssetIds(document,page,true)],['private-image']);
});
test('An unrelated page and public/data images do not enlarge this page private asset request set',()=>{
 const document=fixture('![Data](data:image/png;base64,AAAA)\n\n![Public](https://example.test/image.png)'),other=blankPage('other');document.pages.push(other);document.objects.push({...document.objects[0],id:'other-text',pageId:other.id,markdown:'![Other page](dowze-photo:paper-v3-note-export-images/private-image)'});assert.deepEqual([...paperExportPageAssetIds(document,document.pages[0])],[]);assert.deepEqual([...paperExportPageAssetIds(document,other)],['private-image']);
});
