/** Stable attachment identity shared by desktop and PWA. Existing IDs are never rewritten. */
export const LEGACY_NOTE_ID = 'legacy-whiteboard-main';
export function noteBoardId(noteId: string): string {
  if (noteId === LEGACY_NOTE_ID) return 'whiteboard-main';
  if (/^[A-Za-z0-9][A-Za-z0-9._-]{0,117}$/.test(noteId)) return `note-${noteId}`;
  // Long historical local IDs need a bounded server key; four independent hash lanes.
  const lanes = [2166136261, 3335557771, 1234567891, 987654319];
  for (let i = 0; i < noteId.length; i++) for (let n = 0; n < lanes.length; n++) lanes[n] = Math.imul(lanes[n] ^ noteId.charCodeAt(i), 16777619 + n * 2) >>> 0;
  return `note-${lanes.map(lane => lane.toString(16).padStart(8, '0')).join('')}`;
}
export function hasLegacyDrawing(drafts: readonly {type: string; documentId: string; content: unknown}[]): boolean {
  return drafts.some(d => d.type === 'whiteboard' && d.documentId === 'whiteboard-main' && hasNoteMedia(d.content));
}
export function hasNoteMedia(content: unknown): boolean {
  if (!content || typeof content !== 'object') return false;
  const value = content as { board?: {strokes?: unknown[]}; photos?: unknown[] };
  return Boolean(value.board?.strokes?.length || value.photos?.length);
}

export const photoReference=(documentId:string,id:string)=>`dowze-photo:${encodeURIComponent(documentId)}/${encodeURIComponent(id)}`;
export function parsePhotoReference(src:string) {
 const match=/^dowze-photo:([^/]+)\/([^/]+)$/.exec(src);
 if(!match)return null;
 try {const documentId=decodeURIComponent(match[1]),id=decodeURIComponent(match[2]);return /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,126}$/.test(documentId)&&/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,126}$/.test(id)?{documentId,id}:null;}catch{return null;}
}
