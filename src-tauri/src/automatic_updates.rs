//! Durable signed downloads. Applying is reserved for startup or explicit restart.
use std::{fs, io::Write, path::{Path,PathBuf}, sync::atomic::{AtomicBool,Ordering},time::Duration};
use base64::{Engine,engine::general_purpose::STANDARD};
use minisign_verify::{PublicKey,Signature};
use serde::{Deserialize,Serialize};
use sha2::{Digest,Sha256};
use tauri::{AppHandle,Manager,State,Webview,Emitter};
use tauri_plugin_updater::UpdaterExt;
use super::{CommandResult,require_main_caller};
#[derive(Default)] pub struct AutomaticUpdates { busy:AtomicBool }
struct Guard<'a>(&'a AtomicBool);
impl Drop for Guard<'_>{fn drop(&mut self){self.0.store(false,Ordering::Release);}}
fn lock(state:&AutomaticUpdates)->CommandResult<Guard<'_>>{state.busy.compare_exchange(false,true,Ordering::AcqRel,Ordering::Acquire).map_err(|_|"Mise à jour déjà en cours.")?;Ok(Guard(&state.busy))}
#[derive(Clone,Serialize,Deserialize)]
pub struct Pending { pub version:String,pub body:Option<String>,signature:String,sha256:String,bytes:u64 }
fn folder(app:&AppHandle)->CommandResult<PathBuf>{let p=app.path().app_cache_dir().map_err(|e|e.to_string())?.join("signed-updates");fs::create_dir_all(&p).map_err(|e|e.to_string())?;Ok(p)}
fn newer(version:&str,current:&str)->bool{match(semver::Version::parse(version),semver::Version::parse(current)){(Ok(v),Ok(c))=>v>c,_=>false}}
fn hash(bytes:&[u8])->String{format!("{:x}",Sha256::digest(bytes))}
fn atomic_write(path:&Path,bytes:&[u8])->CommandResult<()>{let tmp=path.with_extension("part");let mut file=fs::File::create(&tmp).map_err(|e|e.to_string())?;file.write_all(bytes).and_then(|_|file.sync_all()).map_err(|e|e.to_string())?;fs::rename(&tmp,path).map_err(|e|e.to_string())?;#[cfg(unix)]{fs::File::open(path.parent().unwrap()).and_then(|f|f.sync_all()).map_err(|e|e.to_string())?;}Ok(())}
fn pubkey()->String{serde_json::from_str::<serde_json::Value>(include_str!("../tauri.conf.json")).unwrap()["plugins"]["updater"]["pubkey"].as_str().unwrap().to_owned()}
fn verify(p:&Pending,bytes:&[u8],key:&str)->CommandResult<()>{
 if bytes.len() as u64!=p.bytes || hash(bytes)!=p.sha256{return Err("Téléchargement incomplet ou modifié.".into());}
 let decode=|s:&str|->CommandResult<String>{String::from_utf8(STANDARD.decode(s).map_err(|_|"Signature invalide.")?).map_err(|_|"Signature invalide.".into())};
 let key=PublicKey::decode(&decode(key)?).map_err(|_|"Clé publique invalide.")?;let signature=Signature::decode(&decode(&p.signature)?).map_err(|_|"Signature invalide.")?;
 key.verify(bytes,&signature,true).map_err(|_|"Signature refusée.")?;
 let signed=signature.trusted_comment().split('\t').find_map(|f|f.strip_prefix("version:"));
 if signed!=Some(p.version.as_str()){return Err("La signature ne correspond pas à la version annoncée.".into());}Ok(())
}
fn pending(app:&AppHandle)->CommandResult<Option<Pending>>{let dir=folder(app)?;let path=dir.join("pending.json");if !path.exists(){return Ok(None);}let p:Pending=serde_json::from_slice(&fs::read(path).map_err(|e|e.to_string())?).map_err(|_|"Journal de mise à jour invalide.")?;
 if p.sha256.len()!=64 || !p.sha256.bytes().all(|b|b.is_ascii_hexdigit()) || semver::Version::parse(&p.version).is_err(){return Err("Journal de mise à jour invalide.".into());}
 if !newer(&p.version,&app.package_info().version.to_string()){let _=fs::remove_file(dir.join("pending.json"));let _=fs::remove_file(dir.join(format!("{}.bin",p.sha256)));return Ok(None);}Ok(Some(p))}
fn cached(app:&AppHandle,p:&Pending)->CommandResult<Vec<u8>>{let b=fs::read(folder(app)?.join(format!("{}.bin",p.sha256))).map_err(|_|"Téléchargement à reprendre.")?;verify(p,&b,&pubkey())?;Ok(b)}
async fn check(app:&AppHandle,timeout:u64)->CommandResult<Option<tauri_plugin_updater::Update>>{app.updater_builder().timeout(Duration::from_secs(timeout)).build().map_err(|e|e.to_string())?.check().await.map_err(|_|"Serveur de mise à jour indisponible. La version actuelle est conservée.".into())}
#[tauri::command]
pub async fn automatic_update_probe(caller:Webview,app:AppHandle)->CommandResult<Option<Pending>>{require_main_caller(&caller)?;
 if let Some(p)=pending(&app)?{if cached(&app,&p).is_ok(){return Ok(Some(p));}}
 Ok(check(&app,10).await?.map(|u|Pending{version:u.version,body:u.body,signature:u.signature,sha256:String::new(),bytes:0}))}
#[tauri::command]
pub async fn automatic_update_stage(caller:Webview,app:AppHandle,state:State<'_,AutomaticUpdates>,version:String)->CommandResult<u64>{require_main_caller(&caller)?;let _guard=lock(&state)?;
 if let Some(p)=pending(&app)?{if p.version==version && cached(&app,&p).is_ok(){return Ok(p.bytes);}}
 let u=check(&app,20).await?.ok_or("Aucune nouvelle version disponible.")?;if u.version!=version{return Err("Une version plus récente est disponible ; nouvelle vérification nécessaire.".into());}
 let mut started=false;
 let bytes=u.download(|chunk,total|{
  if !started { let _=caller.emit("automatic-update-download",serde_json::json!({"event":"Started","data":{"contentLength":total}}));started=true; }
  let _=caller.emit("automatic-update-download",serde_json::json!({"event":"Progress","data":{"chunkLength":chunk}}));
 },||{}).await.map_err(|_|"Téléchargement ou signature refusé ; nouvelle tentative automatique ultérieure.".to_string())?;
 let p=Pending{version:u.version,body:u.body,signature:u.signature,sha256:hash(&bytes),bytes:bytes.len() as u64};verify(&p,&bytes,&pubkey())?;
 let dir=folder(&app)?;atomic_write(&dir.join(format!("{}.bin",p.sha256)),&bytes)?;atomic_write(&dir.join("pending.json"),&serde_json::to_vec(&p).map_err(|e|e.to_string())?)?;Ok(p.bytes)
}
async fn apply(app:&AppHandle)->CommandResult<bool>{let Some(p)=pending(app)? else{return Ok(false)};let bytes=cached(app,&p)?;
 #[cfg(target_os="linux")]
 {if let Some(image)=std::env::var_os("APPIMAGE"){
  use std::os::unix::fs::PermissionsExt;
  let dest=PathBuf::from(image);let new=dest.with_extension("update-part");let backup=dest.with_extension("previous.AppImage");
  // This target is a raw AppImage, not a package-manager archive.
  if bytes.get(0..4)!=Some(b"\x7fELF") || bytes.get(8..11)!=Some(b"AI\x02"){return Err("Format AppImage invalide.".into());}
  atomic_write(&new,&bytes)?;fs::set_permissions(&new,fs::Permissions::from_mode(0o755)).map_err(|e|e.to_string())?;
  fs::copy(&dest,&backup).map_err(|e|e.to_string())?;fs::rename(&new,&dest).map_err(|e|e.to_string())?;fs::File::open(dest.parent().unwrap()).and_then(|f|f.sync_all()).map_err(|e|e.to_string())?;
  let _=fs::remove_file(folder(app)?.join("pending.json"));return Ok(true);
 } else {return Err("Cette installation Linux doit être lancée depuis son AppImage pour appliquer la mise à jour.".into());}}
 #[cfg(not(target_os="linux"))]
 {let u=check(app,5).await?.ok_or("Mise à jour retirée ou version déjà installée.")?;if u.version!=p.version || u.signature!=p.signature{return Err("La version publiée a changé. Nouvelle vérification nécessaire.".into());}u.install(&bytes).map_err(|e|e.to_string())?;let _=fs::remove_file(folder(app)?.join("pending.json"));Ok(true)}
}
#[tauri::command]
pub async fn automatic_update_apply(caller:Webview,app:AppHandle,state:State<'_,AutomaticUpdates>)->CommandResult<bool>{require_main_caller(&caller)?;let _guard=lock(&state)?;apply(&app).await}
#[tauri::command]
pub async fn automatic_update_boot(caller:Webview,app:AppHandle,state:State<'_,AutomaticUpdates>)->CommandResult<bool>{require_main_caller(&caller)?;let _guard=lock(&state)?;
 if pending(&app)?.is_some(){let _=caller.emit("automatic-update-installing",());}
 match apply(&app).await {Ok(true)=>{app.restart();},Ok(false)=>Ok(false),Err(e)=>{atomic_write(&folder(&app)?.join("last-error.txt"),e.as_bytes())?;Ok(false)}}
}
#[cfg(test)] mod tests {use super::*;
 #[test] fn signed_cache_survives_restart_and_rejects_version_substitution(){let raw:serde_json::Value=serde_json::from_str(include_str!("../tests/fixtures/signed-update.json")).unwrap();let mut p:Pending=serde_json::from_value(raw.clone()).unwrap();let b=include_bytes!("../tests/fixtures/signed-update.bin");let key=raw["pubkey"].as_str().unwrap();assert!(verify(&p,b,key).is_ok());p.version="0.6.3".into();assert!(verify(&p,b,key).is_err());assert!(verify(&p,b,&pubkey()).is_err());}
 #[test] fn versions_never_downgrade(){assert!(newer("0.6.2","0.6.1"));assert!(!newer("0.6.1","0.6.1"));assert!(!newer("0.6.0","0.6.1"));assert!(!newer("../../bad","0.6.1"));}
 #[test] fn tampered_cache_is_rejected(){let p=Pending{version:"0.6.2".into(),body:None,signature:String::new(),sha256:hash(b"original"),bytes:8};assert!(verify(&p,b"modified",&pubkey()).is_err());}
}
