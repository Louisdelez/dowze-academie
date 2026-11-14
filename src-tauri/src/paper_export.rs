//! Export selected by the owner in the native Save dialog, never by a remote webview.
use base64::{engine::general_purpose::STANDARD, Engine};
use std::{fs,fs::OpenOptions,io::Write,path::{Path,PathBuf},sync::atomic::{AtomicU64,Ordering}};
use tauri::Webview;
static SEQUENCE:AtomicU64=AtomicU64::new(0);
const MAX_BYTES:usize=64*1024*1024;
fn write_export(destination:&Path,bytes:&[u8],kind:&str)->Result<PathBuf,String>{
 if(bytes.is_empty()||bytes.len()>MAX_BYTES){return Err("L’export doit contenir entre 1 octet et 64 Mo.".into());}
 let extension=export_extension(kind)?;if !valid_signature(bytes,kind){return Err("Le contenu ne correspond pas au type d’export.".into());}
 if !destination.is_absolute()||!destination.extension().and_then(|s|s.to_str()).is_some_and(|s|s.eq_ignore_ascii_case(extension)){return Err("Chemin ou extension d’export invalide.".into());}
 let parent=fs::canonicalize(destination.parent().ok_or("Dossier d’export absent.")?).map_err(|e|format!("Dossier d’export inaccessible : {e}"))?;
 let destination=parent.join(destination.file_name().ok_or("Nom de fichier absent.")?);
 match fs::symlink_metadata(&destination){Ok(meta) if meta.file_type().is_symlink()||!meta.file_type().is_file()=>return Err("L’export doit remplacer un fichier régulier, jamais un lien.".into()),Ok(_)=>{},Err(e) if e.kind()==std::io::ErrorKind::NotFound=>{},Err(e)=>return Err(e.to_string())};
 let staging=parent.join(format!(".dowze-export-{}-{}.tmp",std::process::id(),SEQUENCE.fetch_add(1,Ordering::Relaxed)));
 let result=(||{let mut file=OpenOptions::new().create_new(true).write(true).open(&staging).map_err(|e|e.to_string())?;file.write_all(bytes).and_then(|_|file.sync_all()).map_err(|e|e.to_string())?;crate::replace_file_atomically(&staging,&destination).map_err(|e|e.to_string())?;Ok(destination)})();if result.is_err(){let _=fs::remove_file(&staging);}result
}
#[tauri::command]
pub async fn save_notebook_export(caller:Webview,data_base64:String,destination_path:String,kind:String)->Result<String,String>{
 crate::require_main_caller(&caller)?;
 if destination_path.is_empty()||destination_path.len()>32768||data_base64.len()>MAX_BYTES*4/3+8{return Err("Export trop volumineux ou chemin invalide.".into());}
 drop(caller);tauri::async_runtime::spawn_blocking(move||{let bytes=STANDARD.decode(data_base64).map_err(|_|"Données d’export invalides.".to_string())?;write_export(Path::new(&destination_path),&bytes,&kind).map(|p|p.to_string_lossy().into_owned())}).await.map_err(|e|format!("Export interrompu : {e}"))?
}
/// A partial export lives beside its destination and never replaces it until every byte is committed.
use std::{collections::HashMap,fs::File,sync::Mutex,time::{Duration,Instant}};
#[derive(Default)]
pub struct NotebookExportState(Mutex<HashMap<String,PendingExport>>);
struct PendingExport {file:Option<File>,staging:PathBuf,destination:PathBuf,kind:String,total:u64,written:u64,head:Vec<u8>,last:Instant}
impl Drop for PendingExport {fn drop(&mut self){drop(self.file.take());let _=fs::remove_file(&self.staging);}}
const STREAM_MAX_BYTES:u64=256*1024*1024;
const CHUNK_MAX_BYTES:usize=64*1024;
fn export_extension(kind:&str)->Result<&'static str,String>{match kind{"bundle"=>Ok("zip"),"archive"=>Ok("dowze"),"template"=>Ok("dowzetemplate"),"pdf"=>Ok("pdf"),"png"=>Ok("png"),"jpeg"=>Ok("jpg"),"wav"=>Ok("wav"),"mp3"=>Ok("mp3"),"m4a"=>Ok("m4a"),"mp4"=>Ok("mp4"),"ogg"=>Ok("ogg"),"flac"=>Ok("flac"),"aac"=>Ok("aac"),"webm"=>Ok("webm"),"aiff"=>Ok("aiff"),_=>Err("Type d’export non pris en charge.".into())}}
fn valid_signature(head:&[u8],kind:&str)->bool{match kind{"bundle"|"archive"=>head.starts_with(b"PK\x03\x04"),"template"=>head.starts_with(b"DOWZE-PERSONAL-TEMPLATE/1\n"),"pdf"=>head.starts_with(b"%PDF-"),"png"=>head.starts_with(b"\x89PNG\r\n\x1a\n"),"jpeg"=>head.starts_with(b"\xff\xd8"),"wav"=>head.starts_with(b"RIFF")&&head.get(8..12)==Some(b"WAVE"),"mp3"=>head.starts_with(b"ID3")||(head.first()==Some(&0xff)&&head.get(1).is_some_and(|value|value&0xe0==0xe0)),"m4a"|"mp4"=>head.get(4..8)==Some(b"ftyp"),"ogg"=>head.starts_with(b"OggS"),"flac"=>head.starts_with(b"fLaC"),"aac"=>head.first()==Some(&0xff)&&head.get(1).is_some_and(|value|value&0xf6==0xf0),"webm"=>head.starts_with(b"\x1a\x45\xdf\xa3"),"aiff"=>head.starts_with(b"FORM")&&(head.get(8..12)==Some(b"AIFF")||head.get(8..12)==Some(b"AIFC")),_=>false}}
impl PendingExport {
 fn begin(destination:&Path,kind:&str,total:u64)->Result<Self,String>{
  let extension=export_extension(kind)?;if total==0||total>STREAM_MAX_BYTES{return Err("L’export doit contenir entre 1 octet et 256 Mo.".into());}
  if !destination.is_absolute()||!destination.extension().and_then(|s|s.to_str()).is_some_and(|s|s.eq_ignore_ascii_case(extension)){return Err("Chemin ou extension d’export invalide.".into());}
  let parent=fs::canonicalize(destination.parent().ok_or("Dossier d’export absent.")?).map_err(|e|format!("Dossier d’export inaccessible : {e}"))?;
  let destination=parent.join(destination.file_name().ok_or("Nom de fichier absent.")?);
  match fs::symlink_metadata(&destination){Ok(meta) if meta.file_type().is_symlink()||!meta.file_type().is_file()=>return Err("L’export doit remplacer un fichier régulier, jamais un lien.".into()),Ok(_)=>{},Err(e) if e.kind()==std::io::ErrorKind::NotFound=>{},Err(e)=>return Err(e.to_string())};
  let staging=parent.join(format!(".dowze-export-{}-{}.tmp",std::process::id(),SEQUENCE.fetch_add(1,Ordering::Relaxed)));
  let file=OpenOptions::new().create_new(true).write(true).open(&staging).map_err(|e|e.to_string())?;
  Ok(Self{file:Some(file),staging,destination,kind:kind.into(),total,written:0,head:Vec::with_capacity(64),last:Instant::now()})
 }
 fn push(&mut self,offset:u64,bytes:&[u8])->Result<(),String>{
  if offset!=self.written||bytes.is_empty()||bytes.len()>CHUNK_MAX_BYTES||self.written+bytes.len() as u64>self.total{return Err("Séquence d’export interrompue. Le fichier original est conservé.".into());}
  let head_size=(64-self.head.len()).min(bytes.len());self.head.extend_from_slice(&bytes[..head_size]);
  self.file.as_mut().ok_or("Export déjà terminé.")?.write_all(bytes).map_err(|e|e.to_string())?;self.written+=bytes.len() as u64;self.last=Instant::now();Ok(())
 }
 fn finish(mut self)->Result<String,String>{
  if self.written!=self.total||!valid_signature(&self.head,&self.kind){return Err("L’export est incomplet ou son format est invalide. Le fichier original est conservé.".into());}
  self.file.as_mut().ok_or("Export déjà terminé.")?.sync_all().map_err(|e|e.to_string())?;drop(self.file.take());
  crate::replace_file_atomically(&self.staging,&self.destination).map_err(|e|e.to_string())?;Ok(self.destination.to_string_lossy().into_owned())
 }
}
fn export_sessions(state:&NotebookExportState)->Result<std::sync::MutexGuard<'_,HashMap<String,PendingExport>>,String>{
 let mut sessions=state.0.lock().map_err(|_|"L’export doit être réinitialisé.".to_string())?;sessions.retain(|_,session|session.last.elapsed()<Duration::from_secs(600));Ok(sessions)
}
#[tauri::command]
pub fn begin_notebook_export(caller:Webview,state:tauri::State<'_,NotebookExportState>,destination_path:String,kind:String,total_bytes:u64)->Result<String,String>{
 crate::require_main_caller(&caller)?;if destination_path.len()>32768{return Err("Chemin d’export invalide.".into());}let mut sessions=export_sessions(&state)?;
 if sessions.len()>=2{return Err("Deux exports sont déjà en cours. Attendez leur fin.".into());}
 let pending=PendingExport::begin(Path::new(&destination_path),&kind,total_bytes)?;let id=format!("{:032x}",rand::random::<u128>());sessions.insert(id.clone(),pending);Ok(id)
}
#[tauri::command]
pub fn push_notebook_export(caller:Webview,state:tauri::State<'_,NotebookExportState>,export_id:String,offset:u64,data_base64:String)->Result<(),String>{
 crate::require_main_caller(&caller)?;let mut sessions=export_sessions(&state)?;
 // Invalid/duplicate chunks abort the session rather than leaving a plausible partial file.
 let result=(||{if data_base64.len()>CHUNK_MAX_BYTES*4/3+8{return Err("Morceau d’export trop volumineux.".into());}let bytes=STANDARD.decode(data_base64).map_err(|_|"Morceau d’export invalide.".to_string())?;sessions.get_mut(&export_id).ok_or("Cet export n’est plus disponible.")?.push(offset,&bytes)})();if result.is_err(){sessions.remove(&export_id);}result
}
#[tauri::command]
pub fn finish_notebook_export(caller:Webview,state:tauri::State<'_,NotebookExportState>,export_id:String)->Result<String,String>{
 crate::require_main_caller(&caller)?;export_sessions(&state)?.remove(&export_id).ok_or("Cet export n’est plus disponible.")?.finish()
}
#[tauri::command]
pub fn abort_notebook_export(caller:Webview,state:tauri::State<'_,NotebookExportState>,export_id:String)->Result<(),String>{
 crate::require_main_caller(&caller)?;export_sessions(&state)?.remove(&export_id);Ok(())
}
#[cfg(test)]
mod tests{
 use super::*;
 #[test]fn notebook_collection_uses_zip_without_impersonating_a_single_dowze_note(){
  let dir=std::env::temp_dir().join(format!("dowze-notebook-bundle-export-{}",std::process::id()));fs::create_dir_all(&dir).unwrap();let path=dir.join("notes.zip");fs::write(&path,b"original collection").unwrap();
  let bytes=b"PK\x03\x04collection-container";let mut export=PendingExport::begin(&path,"bundle",bytes.len() as u64).unwrap();export.push(0,bytes).unwrap();assert_eq!(fs::read(&path).unwrap(),b"original collection");export.finish().unwrap();assert_eq!(fs::read(&path).unwrap(),bytes);
  assert!(PendingExport::begin(&dir.join("notes.dowze"),"bundle",bytes.len() as u64).is_err());assert!(PendingExport::begin(&path,"archive",bytes.len() as u64).is_err());assert!(!valid_signature(b"not a ZIP","bundle"));assert!(write_export(&path,b"invalid","bundle").is_err());assert_eq!(fs::read(&path).unwrap(),bytes);fs::remove_dir_all(dir).unwrap();
 }
 #[test]fn personal_template_export_uses_distinct_extension_and_exact_version_header(){
  let dir=std::env::temp_dir().join(format!("dowze-personal-template-export-{}",std::process::id()));fs::create_dir_all(&dir).unwrap();let path=dir.join("page.dowzetemplate");let bytes=b"DOWZE-PERSONAL-TEMPLATE/1\n00000002\nsha256-descriptor-and-archive";
  fs::write(&path,b"previous model").unwrap();let mut export=PendingExport::begin(&path,"template",bytes.len() as u64).unwrap();export.push(0,&bytes[..12]).unwrap();assert_eq!(fs::read(&path).unwrap(),b"previous model");export.push(12,&bytes[12..]).unwrap();export.finish().unwrap();assert_eq!(fs::read(&path).unwrap(),bytes);
  assert!(write_export(&path,b"DOWZE-PERSONAL-TEMPLATE/2\ninvalid","template").is_err());assert_eq!(fs::read(&path).unwrap(),bytes);assert!(write_export(&dir.join("page.dowze"),bytes,"template").is_err());assert!(!valid_signature(b"DOWZE-PERSONAL-TEMPLATE/1bad","template"));assert!(!valid_signature(bytes,"archive"));fs::remove_dir_all(dir).unwrap();
 }
 #[test]fn binary_export_is_atomic_and_validates_file_type(){let dir=std::env::temp_dir().join(format!("dowze-paper-export-{}",std::process::id()));fs::create_dir_all(&dir).unwrap();let path=dir.join("note.dowze");write_export(&path,b"PK\x03\x04original","archive").unwrap();assert!(write_export(&path,b"invalid","archive").is_err());assert_eq!(fs::read(&path).unwrap(),b"PK\x03\x04original");write_export(&path,b"PK\x03\x04new","archive").unwrap();assert_eq!(fs::read(&path).unwrap(),b"PK\x03\x04new");assert!(write_export(&dir.join("note.txt"),b"PK\x03\x04new","archive").is_err());let wav=dir.join("son.wav");write_export(&wav,b"RIFF1234WAVEfmt sample","wav").unwrap();assert!(write_export(&wav,b"RIFF1234BAD!sample","wav").is_err());assert_eq!(fs::read(&wav).unwrap(),b"RIFF1234WAVEfmt sample");fs::remove_dir_all(dir).unwrap();}
 #[test]fn source_audio_exports_validate_extension_signature_and_preserve_encoded_bytes(){
  let dir=std::env::temp_dir().join(format!("dowze-source-audio-{}",std::process::id()));fs::create_dir_all(&dir).unwrap();
  let cases:[(&str,&[u8]);8]=[("mp3",b"ID3original encoded bytes"),("mp4",b"\x00\x00\x00\x18ftypmp42original"),("m4a",b"\x00\x00\x00\x18ftypM4A original"),("ogg",b"OggSoriginal encoded bytes"),("flac",b"fLaCoriginal encoded bytes"),("aac",b"\xff\xf1original encoded bytes"),("webm",b"\x1a\x45\xdf\xa3original encoded bytes"),("aiff",b"FORM1234AIFForiginal encoded bytes")];
  for (kind,bytes) in cases{let path=dir.join(format!("original.{kind}"));fs::write(&path,b"previous").unwrap();let mut export=PendingExport::begin(&path,kind,bytes.len() as u64).unwrap();export.push(0,bytes).unwrap();assert_eq!(fs::read(&path).unwrap(),b"previous");export.finish().unwrap();assert_eq!(fs::read(&path).unwrap(),bytes);assert!(write_export(&path,b"invalid",kind).is_err());assert_eq!(fs::read(&path).unwrap(),bytes);assert!(PendingExport::begin(&dir.join("wrong.txt"),kind,bytes.len() as u64).is_err());}
  fs::remove_dir_all(dir).unwrap();
 }
 #[test]fn streamed_export_keeps_original_until_complete_and_rejects_wrong_offset(){
  let dir=std::env::temp_dir().join(format!("dowze-stream-offset-{}",std::process::id()));fs::create_dir_all(&dir).unwrap();let path=dir.join("note.dowze");fs::write(&path,b"original").unwrap();
  let mut export=PendingExport::begin(&path,"archive",12).unwrap();let staged=export.staging.clone();export.push(0,b"PK\x03\x04abcd").unwrap();assert_eq!(fs::read(&path).unwrap(),b"original");assert!(export.push(0,b"efgh").is_err());drop(export);assert!(!staged.exists());assert_eq!(fs::read(&path).unwrap(),b"original");
  let mut export=PendingExport::begin(&path,"archive",12).unwrap();export.push(0,b"PK\x03\x04abcd").unwrap();assert!(export.finish().is_err());assert_eq!(fs::read(&path).unwrap(),b"original");
  let mut export=PendingExport::begin(&path,"archive",12).unwrap();export.push(0,b"not a zip!!!").unwrap();assert!(export.finish().is_err());assert_eq!(fs::read(&path).unwrap(),b"original");fs::remove_dir_all(dir).unwrap();
 }
 #[test]fn streamed_export_writes_above_old_64mb_limit_without_whole_file_buffer(){
  let dir=std::env::temp_dir().join(format!("dowze-stream-large-{}",std::process::id()));fs::create_dir_all(&dir).unwrap();let path=dir.join("note.dowze");let total=65*1024*1024;
  let mut export=PendingExport::begin(&path,"archive",total).unwrap();let mut chunk=vec![42u8;CHUNK_MAX_BYTES];chunk[..4].copy_from_slice(b"PK\x03\x04");export.push(0,&chunk).unwrap();chunk[..4].fill(42);
  while export.written<total{let offset=export.written;export.push(offset,&chunk).unwrap();}export.finish().unwrap();assert_eq!(fs::metadata(&path).unwrap().len(),total);assert_eq!(fs::read_dir(&dir).unwrap().count(),1);fs::remove_dir_all(dir).unwrap();
 }
 #[test]fn expired_export_is_removed_and_extension_or_oversized_chunk_refused(){
  let dir=std::env::temp_dir().join(format!("dowze-stream-expiry-{}",std::process::id()));fs::create_dir_all(&dir).unwrap();let path=dir.join("note.dowze");assert!(PendingExport::begin(&dir.join("note.txt"),"archive",8).is_err());assert!(PendingExport::begin(&path,"archive",STREAM_MAX_BYTES+1).is_err());
  let mut pending=PendingExport::begin(&path,"archive",100000).unwrap();assert!(pending.push(0,&vec![0;CHUNK_MAX_BYTES+1]).is_err());pending.last=Instant::now()-Duration::from_secs(601);let staged=pending.staging.clone();let state=NotebookExportState::default();state.0.lock().unwrap().insert("expired".into(),pending);assert_eq!(export_sessions(&state).unwrap().len(),0);assert!(!staged.exists());assert!(!path.exists());fs::remove_dir_all(dir).unwrap();
 }

}
