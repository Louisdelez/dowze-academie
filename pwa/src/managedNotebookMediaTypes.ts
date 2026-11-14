/** Closed transport types for existing original note assets. This checks MIME
 * metadata only; it never decodes, converts or substitutes original bytes. */
export const MANAGED_NOTEBOOK_MEDIA_TYPES=Object.freeze([
 'image/jpeg','image/png','image/webp','image/gif','application/pdf','application/octet-stream',
 'audio/wav','audio/webm','audio/mp4','audio/ogg','audio/mpeg','audio/aac','audio/flac','audio/aiff',
 'audio/x-wav','audio/x-m4a','audio/x-aiff','audio/x-flac',
] as const);
const base=new Set<string>(MANAGED_NOTEBOOK_MEDIA_TYPES);
const opus=/^audio\/(?:webm|ogg); ?codecs=(?:"(?:opus|vorbis)"|(?:opus|vorbis))$/;
const mp4=/^audio\/mp4; ?codecs=(?:"mp4a\.40\.(?:2|5|29)"|mp4a\.40\.(?:2|5|29))$/;
export function managedNotebookMediaType(value:unknown):value is string{
 return typeof value==='string'&&value.length<=128&&!/[^\x20-\x7e]/.test(value)&&(base.has(value)||opus.test(value)||mp4.test(value));
}
