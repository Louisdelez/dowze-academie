//! Closed managed raw bridge, separate from the existing private JSON bridge.
//! Only opaque leases and bounded byte chunks cross IPC; credentials stay here.
use super::{managed_session_epoch, vault, Session, ServerLinkState, ORIGIN, BASE64};
use base64::Engine;
use rand::{rngs::OsRng, RngCore};
use reqwest::{redirect::Policy, Client, Method, Url};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{collections::HashMap, sync::{Arc, Mutex, atomic::{AtomicBool, AtomicU64, Ordering}}, time::Duration};
use tauri::{State, Webview};
use zeroize::Zeroize;

const PROTOCOL: &str = "dowze-native-managed-raw@1";
const CHUNK: usize = 64 * 1024;
const SOURCE: usize = 16 * 1024 * 1024;
const PACKET: usize = 4 * SOURCE + 65_536;
const REPLY: usize = PACKET + 1000 * 512;
const BLOB: usize = 32 * 1024 * 1024;
const LIFECYCLE_BODY: usize = 4096;
const LEASES: usize = 16;
type Result<T> = std::result::Result<T, String>;
fn refused() -> String { "Le transport brut a refusé une identité, une séquence ou un plafond invalide.".into() }
fn changed() -> String { "La source ou la session native du carnet partagé a changé.".into() }
fn response_media_type(raw:&str)->String {
    let value=raw.trim().to_lowercase();
    if value.starts_with("audio/"){value}else{value.split(';').next().unwrap_or("").trim().to_owned()}
}
fn uuid(value: &str) -> bool { value.len() == 36 && value.bytes().enumerate().all(|(i,b)| if [8,13,18,23].contains(&i) { b == b'-' } else { b.is_ascii_digit() || (b'a'..=b'f').contains(&b) }) }
fn sha(value: &str) -> bool { value.len() == 64 && value.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b)) }
fn key(value: &str) -> bool { !value.is_empty() && value.len() <= 128 && value.bytes().all(|b| (0x21..=0x7e).contains(&b)) }
fn version(value: u64) -> bool { value > 0 && value <= 9_007_199_254_740_991 }
fn sync_id(value: &str) -> bool { !value.is_empty() && value.len() <= 128 && value.bytes().all(|b| b.is_ascii_alphanumeric() || b"._-".contains(&b)) }
fn identity(value: &str) -> bool { !value.is_empty() && value.chars().count() <= 200 && value.len() <= 800 && !value.chars().any(char::is_control) }
fn opaque(sequence:&AtomicU64) -> Result<String> { let serial=sequence.fetch_update(Ordering::SeqCst,Ordering::SeqCst,|n|n.checked_add(1)).map_err(|_|refused())?;let mut raw=[0u8;16];OsRng.fill_bytes(&mut raw);let mut value:String=raw.iter().map(|b|format!("{b:02x}")).collect();value.push_str(&format!("{serial:016x}"));Ok(value) }

#[derive(Deserialize, Clone)]
#[serde(tag="kind", rename_all="camelCase", rename_all_fields="camelCase", deny_unknown_fields)]
pub enum Route {
    Capabilities {},
    Collection { view:String,space_id:String,owner_account_id:Option<String>,cursor:String,limit:u8 },
    Proofs { space_id:String,note_id:String,canonical_document_id:String,metadata_document_id:String,lineage:String },
    Admission { resource_id:String,key:String },
    State { resource_id:String,incarnation:String,resource_version:u64,access_version:u64 },
    Write { resource_id:String,key:String },
    // Explicit opt-in; old Write remains headerless.
    WriteTextStyleV1 { resource_id:String,key:String },
    Lifecycle { resource_id:String,incarnation:String },
    Trash { resource_id:String,key:String },
    Restore { resource_id:String,key:String },
    Upload { resource_id:String,incarnation:String,resource_version:u64,writer_version:u64,key:String,media_type:String,sha256:String },
    ResourceBlob { resource_id:String,incarnation:String,resource_version:u64,access_version:u64,canonical_version:u64,metadata_version:u64,blob_id:String,size:usize,sha256:String },
}
struct Target { method:Method,url:Url,body_limit:usize,reply_limit:usize,key:Option<String>,media:Option<String>,content_sha:Option<String>,document_codec:Option<&'static str> }
impl Route {
    fn target(&self) -> Result<Target> {
        let mut path="/v1/notebooks/capabilities".to_owned(); let mut params:Vec<(&str,String)>=vec![];
        let mut t=Target {method:Method::GET,url:Url::parse(ORIGIN).map_err(|_| refused())?,body_limit:0,reply_limit:REPLY,key:None,media:None,content_sha:None,document_codec:None};
        match self {
            Self::Capabilities {} => t.reply_limit=65_536,
            Self::Collection{view,space_id,owner_account_id,cursor,limit} => {
                let valid_cursor=cursor.is_empty()||cursor.split_once('.').map(|(a,b)|!a.is_empty()&&a.len()<=768&&a.bytes().all(|c|c.is_ascii_alphanumeric()||b"_-".contains(&c))&&sha(b)).unwrap_or(false);
                if !["owned","outgoing","incoming"].contains(&view.as_str())||!sync_id(space_id)||owner_account_id.as_ref().is_some_and(|owner|!uuid(owner))||!valid_cursor||!(1..=20).contains(limit){return Err(refused());}
                path="/v1/notebooks/collection".into();t.reply_limit=131_072;
                params=vec![("view",view.clone()),("space_id",space_id.clone()),("limit",limit.to_string())];
                if let Some(owner)=owner_account_id{params.push(("owner_account_id",owner.clone()));}
                if !cursor.is_empty(){params.push(("cursor",cursor.clone()));}
            }
            Self::Proofs{space_id,note_id,canonical_document_id,metadata_document_id,lineage} => {
                if !sync_id(space_id)||!sync_id(canonical_document_id)||!sync_id(metadata_document_id)||!identity(note_id)||!identity(lineage) {return Err(refused());}
                path="/v1/notebook-admission-proofs".into();params=vec![("space_id",space_id.clone()),("note_id",note_id.clone()),("canonical_document_id",canonical_document_id.clone()),("metadata_document_id",metadata_document_id.clone()),("lineage",lineage.clone())];
            }
            Self::Admission{resource_id,key:k}|Self::Write{resource_id,key:k}|Self::WriteTextStyleV1{resource_id,key:k} => {
                if !uuid(resource_id)||!key(k){return Err(refused());}t.method=Method::PUT;t.key=Some(k.clone());t.media=Some("application/json".into());t.reply_limit=65_536;
                if matches!(self,Self::Admission{..}) { path=format!("/v1/notebooks/{resource_id}/admission");t.body_limit=65_536; } else {path=format!("/v1/notebooks/{resource_id}/state-v2");t.body_limit=PACKET;}
            }
            Self::State{resource_id,incarnation,resource_version,access_version} => {
                if !uuid(resource_id)||!uuid(incarnation)||!version(*resource_version)||!version(*access_version){return Err(refused());}path=format!("/v1/notebooks/{resource_id}/state");params=vec![("incarnation",incarnation.clone()),("resource_version",resource_version.to_string()),("access_version",access_version.to_string())];
            }
            Self::Lifecycle{resource_id,incarnation} => {
                if !uuid(resource_id)||!uuid(incarnation){return Err(refused());}
                path=format!("/v1/notebooks/{resource_id}/lifecycle");
                params=vec![("incarnation",incarnation.clone())];t.reply_limit=65_536;
            }
            Self::Trash{resource_id,key:k}|Self::Restore{resource_id,key:k} => {
                if !uuid(resource_id)||!key(k){return Err(refused());}
                let action=if matches!(self,Self::Trash{..}){"trash"}else{"restore"};
                path=format!("/v1/notebooks/{resource_id}/{action}");
                t.method=Method::POST;t.body_limit=LIFECYCLE_BODY;t.reply_limit=65_536;
                t.key=Some(k.clone());t.media=Some("application/json".into());
            }
            Self::Upload{resource_id,incarnation,resource_version,writer_version,key:k,media_type,sha256} => {
                if !uuid(resource_id)||!uuid(incarnation)||!version(*resource_version)||!version(*writer_version)||!key(k)||!sha(sha256)||media_type.is_empty()||media_type.len()>128||!media_type.bytes().all(|b| (0x20..=0x7e).contains(&b)){return Err(refused());}
                t.method=Method::POST;t.body_limit=BLOB;t.reply_limit=65_536;t.key=Some(k.clone());t.media=Some(media_type.clone());t.content_sha=Some(sha256.clone());path=format!("/v1/notebooks/{resource_id}/blobs");params=vec![("incarnation",incarnation.clone()),("resource_version",resource_version.to_string()),("writer_version",writer_version.to_string())];
            }
            Self::ResourceBlob{resource_id,incarnation,resource_version,access_version,canonical_version,metadata_version,blob_id,size,sha256} => {
                if !uuid(resource_id)||!uuid(incarnation)||!uuid(blob_id)||![*resource_version,*access_version,*canonical_version,*metadata_version].iter().all(|v|version(*v))||*size>BLOB||!sha(sha256){return Err(refused());}
                t.reply_limit=*size;path=format!("/v1/notebooks/{resource_id}/blobs/{blob_id}");params=vec![("incarnation",incarnation.clone()),("resource_version",resource_version.to_string()),("access_version",access_version.to_string()),("canonical_version",canonical_version.to_string()),("metadata_version",metadata_version.to_string())];
            }
        }
        if matches!(self,Self::WriteTextStyleV1{..}){t.document_codec=Some("paper-text-style:v1");}
        t.url.set_path(&path);if !params.is_empty(){let mut q=t.url.query_pairs_mut();for(k,v)in params{q.append_pair(k,&v);}}
        Ok(t)
    }
    fn json_body(&self) -> bool {
        matches!(self,Self::Admission{..}|Self::Write{..}|Self::WriteTextStyleV1{..}|Self::Trash{..}|Self::Restore{..})
    }
}
struct Lease { id:String,profile:String,actor:String,local:crate::local_auth::ManagedAccountLease,server_epoch:u64,revoked:AtomicBool }
impl Lease { fn check(&self)->Result<()> {if self.revoked.load(Ordering::SeqCst)||!self.local.current()||self.server_epoch==u64::MAX||managed_session_epoch(&self.profile)?!=self.server_epoch {self.revoked.store(true,Ordering::SeqCst);return Err(changed());}Ok(())} }
enum Phase { Input, Executing, Ready }
struct ResponseBytes { bytes:Vec<u8>,cursor:usize }
impl ResponseBytes {
    fn read(&mut self,offset:usize)->Result<Chunk>{
        if self.cursor!=offset||offset>self.bytes.len(){return Err(refused());}
        let end=offset.saturating_add(CHUNK).min(self.bytes.len());let data_base64=BASE64.encode(&self.bytes[offset..end]);self.cursor=end;
        Ok(Chunk{offset,next_offset:end,data_base64,done:end==self.bytes.len()})
    }
}
impl Drop for ResponseBytes {fn drop(&mut self){self.bytes.zeroize();}}
struct InputBytes { expected:usize,sha256:String,bytes:Vec<u8> }
impl InputBytes {
    fn append(&mut self,offset:usize,encoded:&str)->Result<usize>{
        if encoded.is_empty()||encoded.len()>CHUNK.div_ceil(3)*4{return Err(refused());}
        let bytes=BASE64.decode(encoded).map_err(|_|refused())?;
        if bytes.is_empty()||bytes.len()>CHUNK||BASE64.encode(&bytes)!=encoded||self.bytes.len()!=offset||bytes.len()>self.expected.saturating_sub(offset){return Err(refused());}
        self.bytes.extend_from_slice(&bytes);Ok(self.bytes.len())
    }
    fn take(&mut self,json:bool)->Result<Vec<u8>>{
        if self.bytes.len()!=self.expected||format!("{:x}",Sha256::digest(&self.bytes))!=self.sha256||json&&std::str::from_utf8(&self.bytes).is_err(){return Err(refused());}
        Ok(std::mem::take(&mut self.bytes))
    }
}
impl Drop for InputBytes {fn drop(&mut self){self.bytes.zeroize();}}
struct Transfer {id:String,lease:Arc<Lease>,route:Route,maximum:usize,input:InputBytes,phase:Phase,response:Option<ResponseBytes>}
#[derive(Default)]
pub struct ManagedTransportState {leases:Mutex<HashMap<String,Arc<Lease>>>,transfer:Mutex<Option<Transfer>>,network_busy:AtomicBool,sequence:AtomicU64}
fn get_lease(state:&ManagedTransportState,id:&str)->Result<Arc<Lease>> {let lease=state.leases.lock().map_err(|_|changed())?.get(id).cloned().ok_or_else(changed)?;lease.check()?;Ok(lease)}
fn clear_transfer(state:&ManagedTransportState,lease_id:&str,id:&str){if let Ok(mut slot)=state.transfer.lock(){if slot.as_ref().is_some_and(|s|s.id==id&&s.lease.id==lease_id){slot.take();}}}
fn session(profile:&str)->Result<Session>{let mut raw=vault(profile)?.get_password().map_err(|_|"Reconnectez le compte serveur.".to_string())?;let value=serde_json::from_str::<Session>(&raw).map_err(|_|"Session serveur illisible.".to_string());raw.zeroize();let s=value?;if ![&s.token,&s.csrf].iter().all(|v|v.len()>=16&&v.len()<=512&&v.bytes().all(|b|b.is_ascii_alphanumeric()||b"_-".contains(&b))){return Err(changed());}Ok(s)}

// This identity probe uses the EXISTING private allow-list. It never carries a
// document body or substitutes a private route for a managed operation.
async fn verify_session_actor(secrets:&Session,lease:&Lease)->Result<()> {
    if !super::allowed("GET","/v1/me"){return Err(refused());}lease.check()?;
    let client=Client::builder().redirect(Policy::none()).connect_timeout(Duration::from_secs(10)).timeout(Duration::from_secs(60)).build().map_err(|_|refused())?;
    let mut response=client.get(format!("{ORIGIN}/v1/me")).header("Origin",ORIGIN).header("Cookie",format!("dowze_session={}",secrets.token)).header("X-Dowze-Account",&lease.actor).send().await.map_err(|_|"Le compte serveur ne peut pas être vérifié.".to_owned())?;
    lease.check()?;if response.status().as_u16()!=200||response.content_length().is_some_and(|n|n>65_536){return Err(changed());}
    let mut bytes=Vec::new();let result=async {
        loop{lease.check()?;let next=response.chunk().await.map_err(|_|changed())?;lease.check()?;let Some(chunk)=next else{break};if chunk.len()>65_536usize.saturating_sub(bytes.len()){return Err(refused());}bytes.extend_from_slice(&chunk);}
        lease.check()?;let value:serde_json::Value=serde_json::from_slice(&bytes).map_err(|_|refused())?;
        if value.get("id").and_then(serde_json::Value::as_str)!=Some(lease.actor.as_str()){return Err(changed());}Ok(())
    }.await;bytes.zeroize();result
}

#[derive(Serialize)]
#[serde(rename_all="camelCase")]
pub struct Capture {protocol:&'static str,lease_id:String,actor_account_id:String,origin:&'static str,chunk_bytes:usize,max_body_bytes:usize,max_reply_bytes:usize}
#[derive(Serialize)]
#[serde(rename_all="camelCase")]
pub struct Reply {protocol:&'static str,transfer_id:String,status:u16,media_type:String,byte_length:usize,sha256:String}
#[derive(Serialize)]
#[serde(rename_all="camelCase")]
pub struct Chunk {offset:usize,next_offset:usize,data_base64:String,done:bool}

#[tauri::command]
pub async fn managed_native_capture(caller:Webview,auth:State<'_,crate::local_auth::LocalAuthState>,server:State<'_,ServerLinkState>,state:State<'_,ManagedTransportState>,account_id:String,expected_account_id:String)->Result<Capture>{
    crate::require_main_caller(&caller)?;if !uuid(&expected_account_id){return Err(refused());}
    let local=auth.capture_managed_server_link(&caller,&account_id,&expected_account_id)?;
    let _guard=server.0.lock().await;if !local.current(){return Err(changed());}let epoch=managed_session_epoch(&account_id)?;let secrets=session(&account_id)?;if !local.current()||epoch!=managed_session_epoch(&account_id)?||epoch==u64::MAX{return Err(changed());}
    let id=opaque(&state.sequence)?;let lease=Arc::new(Lease{id:id.clone(),profile:account_id,actor:expected_account_id.clone(),local,server_epoch:epoch,revoked:AtomicBool::new(false)});verify_session_actor(&secrets,&lease).await?;lease.check()?;
    if let Ok(mut slot)=state.transfer.lock(){if slot.as_ref().is_some_and(|old|old.lease.check().is_err()){slot.take();}}
    let mut leases=state.leases.lock().map_err(|_|changed())?;leases.retain(|_,lease|lease.check().is_ok());if leases.len()>=LEASES{return Err("Les lectures natives doivent être libérées avant une nouvelle admission.".into());}
    leases.insert(id.clone(),lease);
    Ok(Capture{protocol:PROTOCOL,lease_id:id,actor_account_id:expected_account_id,origin:ORIGIN,chunk_bytes:CHUNK,max_body_bytes:PACKET,max_reply_bytes:REPLY})
}
#[tauri::command]
pub fn managed_native_begin(caller:Webview,state:State<'_,ManagedTransportState>,lease_id:String,route:Route,input_bytes:usize,input_sha256:String,maximum_reply:usize)->Result<String>{
    crate::require_main_caller(&caller)?;let lease=get_lease(&state,&lease_id)?;let target=route.target()?;if !sha(&input_sha256)||input_bytes>target.body_limit||maximum_reply>target.reply_limit||maximum_reply>REPLY||(target.body_limit==0&&input_bytes!=0)||(target.body_limit>0&&input_bytes==0){return Err(refused());}
    if let Some(ref expected)=target.content_sha{if expected!=&input_sha256{return Err(refused());}}
    let mut slot=state.transfer.lock().map_err(|_|changed())?;if slot.is_some()||state.network_busy.load(Ordering::SeqCst){return Err("Un transfert natif attend sa libération.".into());}lease.check()?;let id=opaque(&state.sequence)?;*slot=Some(Transfer{id:id.clone(),lease,route,maximum:maximum_reply,input:InputBytes{expected:input_bytes,sha256:input_sha256,bytes:Vec::new()},phase:Phase::Input,response:None});Ok(id)
}
#[tauri::command]
pub fn managed_native_append(caller:Webview,state:State<'_,ManagedTransportState>,lease_id:String,transfer_id:String,offset:usize,data_base64:String)->Result<usize>{
    crate::require_main_caller(&caller)?;let lease=get_lease(&state,&lease_id)?;let mut slot=state.transfer.lock().map_err(|_|changed())?;let s=slot.as_mut().ok_or_else(changed)?;if s.id!=transfer_id||s.lease.id!=lease.id||!matches!(s.phase,Phase::Input){return Err(refused());}lease.check()?;s.input.append(offset,&data_base64)
}
struct Busy<'a>(&'a AtomicBool);impl Drop for Busy<'_>{fn drop(&mut self){self.0.store(false,Ordering::SeqCst);}}
#[tauri::command]
pub async fn managed_native_execute(caller:Webview,state:State<'_,ManagedTransportState>,server:State<'_,ServerLinkState>,lease_id:String,transfer_id:String)->Result<Reply>{
    crate::require_main_caller(&caller)?;let lease=get_lease(&state,&lease_id)?;
    if state.network_busy.compare_exchange(false,true,Ordering::SeqCst,Ordering::SeqCst).is_err(){return Err("Un transfert réseau natif est encore actif.".into());}let _busy=Busy(&state.network_busy);
    let result=async {
        let (route,maximum,bytes)={let mut slot=state.transfer.lock().map_err(|_|changed())?;let s=slot.as_mut().ok_or_else(changed)?;if s.id!=transfer_id||s.lease.id!=lease.id||!matches!(s.phase,Phase::Input){return Err(refused());}let json=s.route.json_body();let bytes=s.input.take(json)?;s.phase=Phase::Executing;(s.route.clone(),s.maximum,bytes)};
        lease.check()?;let _network=server.0.lock().await;lease.check()?;let secrets=session(&lease.profile)?;lease.check()?;let target=route.target()?;
        let client=Client::builder().redirect(Policy::none()).connect_timeout(Duration::from_secs(10)).timeout(Duration::from_secs(60)).build().map_err(|_|"Client HTTPS natif indisponible.")?;
        let mut request=client.request(target.method.clone(),target.url).header("Origin",ORIGIN).header("Cookie",format!("dowze_session={}",secrets.token)).header("X-Dowze-Account",&lease.actor);
        if target.method!=Method::GET{request=request.header("X-CSRF-Token",&secrets.csrf).header("Content-Type",target.media.ok_or_else(refused)?).header("X-Idempotency-Key",target.key.ok_or_else(refused)?).body(bytes);}
        if let Some(codec)=target.document_codec{request=request.header("X-Dowze-Document-Codec",codec);}
        if let Some(hash)=target.content_sha{request=request.header("X-Content-SHA256",hash);}
        lease.check()?;let mut response=request.send().await.map_err(|_|"Transfert natif interrompu ; la source durable reste conservée.")?;lease.check()?;
        let status=response.status().as_u16();let media=response_media_type(response.headers().get("content-type").and_then(|v|v.to_str().ok()).unwrap_or(""));let cap=if response.status().is_success(){maximum}else{maximum.min(65_536)};
        if response.content_length().is_some_and(|n|n>cap as u64){return Err(refused());}let mut out=Vec::new();
        loop{lease.check()?;let next=response.chunk().await.map_err(|_|"Réception native interrompue.")?;lease.check()?;let Some(chunk)=next else{break};if chunk.len()>cap.saturating_sub(out.len()){return Err(refused());}out.extend_from_slice(&chunk);}
        lease.check()?;let hash=format!("{:x}",Sha256::digest(&out));if let Route::ResourceBlob{size,sha256,..}=&route{if status==200&&(out.len()!=*size||hash!=*sha256){return Err(refused());}}
        let length=out.len();let mut slot=state.transfer.lock().map_err(|_|changed())?;let s=slot.as_mut().ok_or_else(changed)?;if s.id!=transfer_id||s.lease.id!=lease.id||!matches!(s.phase,Phase::Executing){return Err(changed());}lease.check()?;s.response=Some(ResponseBytes{bytes:out,cursor:0});s.phase=Phase::Ready;
        Ok(Reply{protocol:PROTOCOL,transfer_id:transfer_id.clone(),status,media_type:media,byte_length:length,sha256:hash})
    }.await;
    if result.is_err(){clear_transfer(&state,&lease.id,&transfer_id);}result
}
#[tauri::command]
pub fn managed_native_read(caller:Webview,state:State<'_,ManagedTransportState>,lease_id:String,transfer_id:String,offset:usize)->Result<Chunk>{
    crate::require_main_caller(&caller)?;let lease=get_lease(&state,&lease_id)?;let mut slot=state.transfer.lock().map_err(|_|changed())?;let s=slot.as_mut().ok_or_else(changed)?;if s.id!=transfer_id||s.lease.id!=lease.id||!matches!(s.phase,Phase::Ready){return Err(changed());}let response=s.response.as_mut().ok_or_else(changed)?;lease.check()?;let answer=response.read(offset)?;if answer.done{slot.take();}Ok(answer)
}
#[tauri::command]
pub fn managed_native_retire(caller:Webview,state:State<'_,ManagedTransportState>,lease_id:String)->Result<()>{
    crate::require_main_caller(&caller)?;if let Some(lease)=state.leases.lock().map_err(|_|changed())?.remove(&lease_id){lease.revoked.store(true,Ordering::SeqCst);}let mut slot=state.transfer.lock().map_err(|_|changed())?;if slot.as_ref().is_some_and(|s|s.lease.id==lease_id){slot.take();}Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn collection_is_a_closed_bounded_read_without_private_owner_switch(){
        let owner="10000000-0000-4000-8000-000000000001".to_owned();
        let cursor=format!("YWJj.{}","a".repeat(64));
        let route=Route::Collection{view:"incoming".into(),space_id:"annual-2026".into(),owner_account_id:Some(owner.clone()),cursor:cursor.clone(),limit:20};
        let target=route.target().unwrap();assert_eq!(target.method,Method::GET);assert_eq!(target.url.origin().ascii_serialization(),ORIGIN);assert_eq!(target.url.path(),"/v1/notebooks/collection");assert_eq!(target.body_limit,0);assert_eq!(target.reply_limit,131_072);assert!(target.key.is_none());assert!(!route.json_body());
        assert_eq!(target.url.query_pairs().into_owned().collect::<Vec<_>>(),vec![("view".into(),"incoming".into()),("space_id".into(),"annual-2026".into()),("limit".into(),"20".into()),("owner_account_id".into(),owner),("cursor".into(),cursor)]);
        for (view,space,owner,cursor,limit) in [("all","year",None,"",20),("owned","../spaces",None,"",20),("incoming","year",Some("bad".to_owned()),"",20),("incoming","year",None,"not-a-signed-cursor",20),("incoming","year",None,"",21)]{
            assert!(Route::Collection{view:view.into(),space_id:space.into(),owner_account_id:owner,cursor:cursor.into(),limit}.target().is_err());
        }
        assert!(serde_json::from_value::<Route>(serde_json::json!({"kind":"collection","view":"incoming","spaceId":"year","cursor":"","limit":20,"ownerAccountId":null,"path":"/v1/spaces"})).is_err());
    }
    #[test] fn lifecycle_targets_are_exact_owner_routes_without_active_ticket_or_free_query(){
        let id="10000000-0000-4000-8000-000000000001".to_owned();
        let incarnation="20000000-0000-4000-8000-000000000001".to_owned();
        let route=Route::Lifecycle{resource_id:id.clone(),incarnation:incarnation.clone()};
        let target=route.target().unwrap();
        assert_eq!(target.method,Method::GET);assert_eq!(target.url.origin().ascii_serialization(),ORIGIN);
        assert_eq!(target.url.path(),format!("/v1/notebooks/{id}/lifecycle"));
        assert_eq!(target.url.query_pairs().into_owned().collect::<Vec<_>>(),vec![("incarnation".to_owned(),incarnation.clone())]);
        assert_eq!(target.body_limit,0);assert_eq!(target.reply_limit,65_536);assert!(target.key.is_none());assert!(!route.json_body());
        for (route,action) in [(Route::Trash{resource_id:id.clone(),key:"stable-trash".into()},"trash"),(Route::Restore{resource_id:id.clone(),key:"stable-restore".into()},"restore")]{
            let target=route.target().unwrap();assert_eq!(target.method,Method::POST);
            assert_eq!(target.url.as_str(),format!("{ORIGIN}/v1/notebooks/{id}/{action}"));assert!(target.url.query().is_none());
            assert_eq!(target.body_limit,4096);assert_eq!(target.reply_limit,65_536);assert_eq!(target.media.as_deref(),Some("application/json"));assert!(target.key.is_some());assert!(route.json_body());
        }
        assert!(Route::Lifecycle{resource_id:"../spaces".into(),incarnation:incarnation.clone()}.target().is_err());
        assert!(Route::Lifecycle{resource_id:id.clone(),incarnation:"wrong".into()}.target().is_err());
        assert!(Route::Trash{resource_id:id.clone(),key:"".into()}.target().is_err());
        assert!(Route::Restore{resource_id:id.clone(),key:"bad\nheader".into()}.target().is_err());
        assert!(serde_json::from_value::<Route>(serde_json::json!({"kind":"lifecycle","resourceId":id,"incarnation":incarnation,"query":"incarnation=other"})).is_err());
        assert!(serde_json::from_value::<Route>(serde_json::json!({"kind":"trash","resourceId":id,"key":"same","method":"DELETE"})).is_err());
    }
    #[test] fn lifecycle_mutations_use_real_utf8_accumulator_without_normalizing_json(){
        let bytes=b" {\"protocol\":\"dowze-managed-notebook-lifecycle\\u00401\"}\r\n".to_vec();
        for route in [Route::Trash{resource_id:"10000000-0000-4000-8000-000000000001".into(),key:"trash".into()},Route::Restore{resource_id:"10000000-0000-4000-8000-000000000001".into(),key:"restore".into()}]{
            let mut input=InputBytes{expected:bytes.len(),sha256:format!("{:x}",Sha256::digest(&bytes)),bytes:Vec::new()};
            assert_eq!(input.append(0,&BASE64.encode(&bytes)).unwrap(),bytes.len());
            assert_eq!(input.take(route.json_body()).unwrap(),bytes);
            let mut invalid=InputBytes{expected:2,sha256:format!("{:x}",Sha256::digest([0xc3,0x28])),bytes:vec![0xc3,0x28]};
            assert!(invalid.take(route.json_body()).is_err());
        }
    }
    #[test] fn only_closed_routes_and_exact_query_names_are_constructed(){
        let id="10000000-0000-4000-8000-000000000001".to_owned();let t=Route::Write{resource_id:id.clone(),key:"raw-key".into()}.target().unwrap();assert_eq!(t.url.as_str(),format!("{ORIGIN}/v1/notebooks/{id}/state-v2"));assert_eq!(t.body_limit,PACKET);
        assert!(Route::Write{resource_id:"../spaces".into(),key:"raw".into()}.target().is_err());
        let t=Route::Proofs{space_id:"year".into(),note_id:"école & same".into(),canonical_document_id:"paper-note".into(),metadata_document_id:"note".into(),lineage:"lineage/opaque".into()}.target().unwrap();assert_eq!(t.url.origin().ascii_serialization(),ORIGIN);assert_eq!(t.url.query_pairs().count(),5);
        assert!(serde_json::from_value::<Route>(serde_json::json!({"kind":"capabilities","path":"/v1/spaces"})).is_err());
    }
    #[test] fn exact_utf8_and_blob_chunk_budget_never_normalizes_payload(){let bytes=" {\"text\":\"É📝\",\"escape\":\"\\u0061\"}\\r\\n".as_bytes();let mut joined=Vec::new();for chunk in bytes.chunks(7){let restored=BASE64.decode(BASE64.encode(chunk)).unwrap();joined.extend_from_slice(&restored);}assert_eq!(joined,bytes);assert_eq!(Sha256::digest(&joined),Sha256::digest(bytes));assert!(std::str::from_utf8(&[0xc3,0x28]).is_err());assert!(sha(&format!("{:x}",Sha256::digest([]))));}
    #[test] fn real_input_accumulator_requires_exact_order_size_hash_and_utf8(){
        let bytes=vec![0x61;CHUNK+17];let hash=format!("{:x}",Sha256::digest(&bytes));
        let mut input=InputBytes{expected:bytes.len(),sha256:hash,bytes:Vec::new()};
        assert!(input.append(1,&BASE64.encode(&bytes[..CHUNK])).is_err());assert!(input.bytes.is_empty());
        assert_eq!(input.append(0,&BASE64.encode(&bytes[..CHUNK])).unwrap(),CHUNK);
        assert!(input.take(false).is_err());assert!(input.append(0,&BASE64.encode(&bytes[CHUNK..])).is_err());
        assert_eq!(input.append(CHUNK,&BASE64.encode(&bytes[CHUNK..])).unwrap(),bytes.len());
        assert_eq!(input.take(true).unwrap(),bytes);assert!(input.bytes.is_empty());
        let mut invalid=InputBytes{expected:2,sha256:format!("{:x}",Sha256::digest([0xc3,0x28])),bytes:vec![0xc3,0x28]};assert!(invalid.take(true).is_err());assert_eq!(invalid.take(false).unwrap(),[0xc3,0x28]);
        let mut bad_hash=InputBytes{expected:1,sha256:"0".repeat(64),bytes:vec![1]};assert!(bad_hash.take(false).is_err());
        let mut extra=InputBytes{expected:1,sha256:"0".repeat(64),bytes:Vec::new()};assert!(extra.append(0,&BASE64.encode([1,2])).is_err());assert!(extra.bytes.is_empty());
        assert!(extra.append(0,&BASE64.encode(vec![1;CHUNK+1])).is_err());
    }

    #[test] fn opaque_handle_sequences_never_wrap_or_reuse_even_across_retirement(){
        let sequence=AtomicU64::new(0);let first=opaque(&sequence).unwrap();let second=opaque(&sequence).unwrap();assert_eq!(first.len(),48);assert_eq!(&first[32..],"0000000000000000");assert_eq!(&second[32..],"0000000000000001");assert_ne!(first,second);
        sequence.store(u64::MAX,Ordering::SeqCst);assert!(opaque(&sequence).is_err());assert_eq!(sequence.load(Ordering::SeqCst),u64::MAX);
    }

    #[test] fn original_audio_codec_parameters_survive_reply_while_json_behavior_is_unchanged(){
        for value in ["audio/wav","audio/webm;codecs=opus","audio/mp4; codecs=\"mp4a.40.2\"","audio/ogg; codecs=opus"]{
            assert_eq!(response_media_type(value),value);
            let target=Route::Upload{resource_id:"10000000-0000-4000-8000-000000000001".into(),incarnation:"20000000-0000-4000-8000-000000000002".into(),resource_version:1,writer_version:1,key:"original-audio".into(),media_type:value.into(),sha256:"0".repeat(64)}.target().unwrap();
            assert_eq!(target.media,Some(value.to_owned()));assert_eq!(target.body_limit,BLOB);assert_eq!(target.reply_limit,65_536);
        }
        assert_eq!(response_media_type("application/json; charset=utf-8"),"application/json");
        assert_eq!(response_media_type("image/gif"),"image/gif");
    }
    #[test] fn real_response_cursor_is_exact_bounded_and_zero_length_is_terminal(){
        let bytes=vec![0xff;CHUNK+17];let mut response=ResponseBytes{bytes:bytes.clone(),cursor:0};
        assert!(response.read(1).is_err());assert_eq!(response.cursor,0);let first=response.read(0).unwrap();assert_eq!(first.next_offset,CHUNK);assert!(!first.done);assert_eq!(BASE64.decode(&first.data_base64).unwrap(),bytes[..CHUNK]);
        assert!(response.read(0).is_err());let last=response.read(CHUNK).unwrap();assert_eq!(last.next_offset,bytes.len());assert!(last.done);assert_eq!(BASE64.decode(&last.data_base64).unwrap(),bytes[CHUNK..]);
        let empty=ResponseBytes{bytes:vec![],cursor:0}.read(0).unwrap();assert!(empty.done);assert_eq!(empty.data_base64,"");assert_eq!(empty.next_offset,0);
    }

    #[test] fn text_style_write_is_a_new_closed_declaration_without_changing_old_routes(){
        let id="10000000-0000-4000-8000-000000000001".to_owned();
        let old=Route::Write{resource_id:id.clone(),key:"exact-old".into()}.target().unwrap();
        let route:Route=serde_json::from_value(serde_json::json!({"kind":"writeTextStyleV1","resourceId":id,"key":"exact-old"})).unwrap();
        let new=route.target().unwrap();
        assert!(old.document_codec.is_none());assert_eq!(new.document_codec,Some("paper-text-style:v1"));
        assert_eq!(old.method,new.method);assert_eq!(old.url,new.url);assert_eq!(old.body_limit,new.body_limit);assert_eq!(old.reply_limit,new.reply_limit);assert_eq!(old.key,new.key);assert_eq!(old.media,new.media);assert!(route.json_body());
        assert!(Route::Admission{resource_id:id.clone(),key:"admit".into()}.target().unwrap().document_codec.is_none());
        assert!(Route::Capabilities{}.target().unwrap().document_codec.is_none());
        assert!(serde_json::from_value::<Route>(serde_json::json!({"kind":"writeTextStyleV2","resourceId":id,"key":"x"})).is_err());
        assert!(serde_json::from_value::<Route>(serde_json::json!({"kind":"writeTextStyleV1","resourceId":id,"key":"x","headers":{"Authorization":"forbidden"}})).is_err());
        assert!(serde_json::from_value::<Route>(serde_json::json!({"kind":"writeTextStyleV1","resourceId":"../spaces","key":"x"})).unwrap().target().is_err());
    }

}
