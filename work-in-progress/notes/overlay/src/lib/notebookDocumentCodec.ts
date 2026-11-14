/** Explicit compatibility declaration by this editor build, never authority.
 * Default generic clients send none. Keep IDs/grammar aligned with paperTextStyle.
 * Server AST still decides whether current/proposed active passages use it. */
export const PAPER_TEXT_STYLE_DOCUMENT_CODEC='paper-text-style:v1' as const;
export type NotebookDocumentCodec=typeof PAPER_TEXT_STYLE_DOCUMENT_CODEC;
export function checkedNotebookDocumentCodec(value:unknown):NotebookDocumentCodec|undefined{
 if(value===undefined)return undefined;
 if(value!==PAPER_TEXT_STYLE_DOCUMENT_CODEC)throw new TypeError('Déclaration de compatibilité du document invalide.');
 return value;
}
export function isPrivatePaperWrite(method:string,path:string):boolean{
 return method==='PUT'&&/^\/v1\/spaces\/[A-Za-z0-9._-]+\/documents\/(?:whiteboard|notesMarkdown)\/[A-Za-z0-9._-]+$/.test(path);
}
