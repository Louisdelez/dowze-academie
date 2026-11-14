import {paperObjectsOnPage} from './paperTextFlow.ts';
import {resolvePaperPhotoReference} from './paperAssets.ts';
import {scanLegacyPaperImages} from './paperLegacyImages.ts';
import type {PaperDocument,PaperPage} from './notebookDocument.ts';

/** Semantic image references only: code examples and coincidental asset names never request private files. */
export function paperExportPageAssetIds(document:PaperDocument,page:PaperPage,annotationsOnly=false):Set<string>{
 const objects=paperObjectsOnPage(document,page.id),required=new Set(objects.filter(object=>object.assetId).map(object=>object.assetId!));if(page.pdf&&!annotationsOnly)required.add(page.pdf.assetId);
 for(const object of objects.filter(object=>object.markdown))for(const image of scanLegacyPaperImages(object.markdown!).images){if(image.kind!=='photo'&&image.kind!=='invalid-photo')continue;const resolved=resolvePaperPhotoReference(document,image.url);if(resolved.kind==='unavailable')throw Error(resolved.message);if(resolved.kind==='asset')required.add(resolved.asset.id);}
 for(const id of required)if(!document.assets.some(asset=>asset.id===id))throw Error('Une pièce jointe manque dans la note.');return required;
}
