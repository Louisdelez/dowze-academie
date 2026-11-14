//! Authenticated HTTPS bridge. Provider webviews cannot access this command or its vault.
pub(crate) mod managed;
use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use reqwest::{redirect::Policy, Client, Method};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{sync::Arc, time::Duration};
use tauri::{State, Webview};
use zeroize::Zeroize;
const ORIGIN: &str = "https://academie.dowze.ch";
const MAX_BODY: usize = 9 * 1024 * 1024;
const MAX_BLOB: usize = 16 * 1024 * 1024;
#[derive(Default)]
pub struct ServerLinkState(Arc<tokio::sync::Mutex<()>>);
#[derive(Serialize, Deserialize)]
pub(crate) struct Session {
    token: String,
    csrf: String,
}
impl Drop for Session {
    fn drop(&mut self) {
        self.token.zeroize();
        self.csrf.zeroize();
    }
}

static MANAGED_SESSION_EPOCHS: std::sync::OnceLock<std::sync::Mutex<std::collections::HashMap<String, u64>>> = std::sync::OnceLock::new();
fn managed_session_epoch(account: &str) -> Result<u64, String> {
    let mut epochs = MANAGED_SESSION_EPOCHS.get_or_init(Default::default).lock().map_err(|_| "Génération serveur indisponible.")?;
    Ok(*epochs.entry(account.to_owned()).or_insert(1))
}
fn advance_managed_session_epoch(account: &str) -> Result<(), String> {
    let mut epochs = MANAGED_SESSION_EPOCHS.get_or_init(Default::default).lock().map_err(|_| "Génération serveur indisponible.")?;
    let epoch = epochs.entry(account.to_owned()).or_insert(1);
    *epoch = epoch.saturating_add(1);
    Ok(())
}
fn vault(account: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new("com.etude.desktop.nas-session.v1", account)
        .map_err(|_| "Coffre système indisponible.".into())
}
pub(crate) fn store_session(account: &str, session: &Session) -> Result<(), String> {
    let mut encoded = serde_json::to_string(session).map_err(|_| "Session invalide.")?;
    advance_managed_session_epoch(account)?;
    let result = vault(account)?
        .set_password(&encoded)
        .map_err(|_| "Enregistrement de session impossible.".into());
    encoded.zeroize();
    result
}
pub(crate) async fn authenticate_remote(
    email: &str,
    password: &str,
    register: bool,
) -> Result<(Value, Session), String> {
    authenticate_at(ORIGIN, email, password, register).await
}
async fn authenticate_at(
    origin: &str,
    email: &str,
    password: &str,
    register: bool,
) -> Result<(Value, Session), String> {
    let credentials = json!({"email": email, "password": password});
    if register {
        let (status, value, _) = exchange(
            origin,
            "POST",
            "/v1/accounts",
            Some(credentials.clone()),
            None,
            None,
        )
        .await?;
        if status != 201 {
            return Err(value["message"]
                .as_str()
                .unwrap_or("Création du compte refusée.")
                .into());
        }
    }
    let (status, value, session) = exchange(
        origin,
        "POST",
        "/v1/sessions",
        Some(credentials),
        None,
        None,
    )
    .await?;
    if status != 201 {
        return Err(value["message"]
            .as_str()
            .unwrap_or("Connexion refusée.")
            .into());
    }
    let session = session.ok_or("Session serveur manquante.")?;
    let (status, account, _) =
        exchange(origin, "GET", "/v1/me", None, Some(&session), None).await?;
    if status != 200 {
        return Err("Identité du compte non confirmée.".into());
    }
    Ok((account, session))
}
fn segment(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 128
        && value
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"_-.".contains(&b))
        && !value.contains("..")
}
fn allowed(method: &str, path: &str) -> bool {
    if path.len() > 2048 || path.contains('#') || path.contains('%') || path.contains('\\') {
        return false;
    }
    let (base, query) = path.split_once('?').unwrap_or((path, ""));
    if !query
        .bytes()
        .all(|b| b.is_ascii_alphanumeric() || b"_-=.&".contains(&b))
    {
        return false;
    }
    if !query.is_empty() && method != "GET" && method != "DELETE" {
        return false;
    }
    let parts: Vec<_> = base.trim_start_matches('/').split('/').collect();
    if !path.starts_with("/v1/") || parts.iter().any(|p| !segment(p)) {
        return false;
    }
    match (method, parts.as_slice()) {
        ("POST", ["v1", "accounts" | "sessions"])
        | ("DELETE", ["v1", "sessions"])
        | ("GET", ["v1", "me" | "spaces" | "catalog"]) => true,
        ("GET", ["v1", "catalog", _, _, "content" | "manifest"]) => true,
        ("PUT", ["v1", "spaces", _]) | ("GET", ["v1", "spaces", _, "changes"]) => true,
        ("PUT" | "DELETE", ["v1", "spaces", _, "documents", kind, _]) => [
            "notesMarkdown",
            "whiteboard",
            "planning",
            "progression",
            "examens",
            "conversations",
            "tasks",
            "formation",
            "preferences",
        ]
        .contains(kind),
        _ => false,
    }
}
// Pool sockets only. Session/account/CSRF/idempotency headers remain on each
// request below; no cookie store, default credentials or default auth headers.
static LEGACY_JSON_HTTP_CLIENT: std::sync::OnceLock<Client> = std::sync::OnceLock::new();
fn legacy_json_http_client() -> Result<&'static Client, String> {
    if let Some(client) = LEGACY_JSON_HTTP_CLIENT.get() {
        return Ok(client);
    }
    let client = Client::builder()
        .redirect(Policy::none())
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(45))
        .pool_max_idle_per_host(1)
        .pool_idle_timeout(Duration::from_secs(30))
        .build()
        .map_err(|_| "Client HTTPS indisponible.".to_owned())?;
    // A build failure never enters the cell. Concurrent successful builders
    // keep one client; losing builders are dropped without replacing it.
    let _ = LEGACY_JSON_HTTP_CLIENT.set(client);
    LEGACY_JSON_HTTP_CLIENT
        .get()
        .ok_or_else(|| "Client HTTPS indisponible.".to_owned())
}

async fn exchange(
    origin: &str,
    method: &str,
    path: &str,
    body: Option<Value>,
    session: Option<&Session>,
    idempotency: Option<&str>,
) -> Result<(u16, Value, Option<Session>), String> {
    exchange_scoped(origin, method, path, body, session, idempotency, None).await
}
async fn exchange_scoped(
    origin: &str,
    method: &str,
    path: &str,
    body: Option<Value>,
    session: Option<&Session>,
    idempotency: Option<&str>,
    expected_account: Option<&str>,
) -> Result<(u16, Value, Option<Session>), String> {
    exchange_scoped_codec(origin, method, path, body, session, idempotency, expected_account, None).await
}
// Explicit declaration only, restricted to the existing private paper PUT routes.
fn private_document_codec(method: &str, path: &str, codec: Option<&str>) -> Result<Option<&'static str>, String> {
    let Some(codec) = codec else { return Ok(None); };
    let parts: Vec<_> = path.trim_start_matches('/').split('/').collect();
    if codec == "paper-text-style:v1" && allowed(method, path) && method == "PUT"
        && matches!(parts.as_slice(), ["v1", "spaces", _, "documents", "whiteboard" | "notesMarkdown", _]) {
        Ok(Some("paper-text-style:v1"))
    } else {
        Err("Déclaration de compatibilité du document refusée.".into())
    }
}
async fn exchange_scoped_codec(
    origin: &str,
    method: &str,
    path: &str,
    body: Option<Value>,
    session: Option<&Session>,
    idempotency: Option<&str>,
    expected_account: Option<&str>,
    document_codec: Option<&str>,
) -> Result<(u16, Value, Option<Session>), String> {
    if !allowed(method, path) {
        return Err("Route serveur refusée.".into());
    }
    let codec = private_document_codec(method, path, document_codec)?;
    let client = legacy_json_http_client()?;
    let mut request = client
        .request(
            Method::from_bytes(method.as_bytes()).map_err(|_| "Méthode invalide.")?,
            format!("{origin}{path}"),
        )
        .header("Origin", origin);
    if let Some(codec) = codec {
        request = request.header("X-Dowze-Document-Codec", codec);
    }
    if let Some(account) = expected_account {
        if !segment(account) {
            return Err("Compte serveur attendu invalide.".into());
        }
        request = request.header("X-Dowze-Account", account);
    }
    if let Some(session) = session {
        request = request.header("Cookie", format!("dowze_session={}", session.token));
        if method != "GET" {
            request = request.header("X-CSRF-Token", &session.csrf);
        }
    }
    if let Some(id) = idempotency {
        if !segment(id) {
            return Err("Identifiant de mutation invalide.".into());
        }
        request = request.header("X-Idempotency-Key", id);
    }
    if let Some(value) = body {
        let mut encoded = serde_json::to_vec(&value).map_err(|_| "Document invalide.")?;
        if encoded.len() > MAX_BODY {
            encoded.zeroize();
            return Err("Document trop volumineux.".into());
        }
        request = request
            .header("Content-Type", "application/json")
            .body(encoded);
    }
    let mut response = request
        .send()
        .await
        .map_err(|_| "Serveur indisponible. Vos données locales sont conservées.".to_string())?;
    let code = response.status().as_u16();
    let token = if method == "POST" && path == "/v1/sessions" && code == 201 {
        response
            .headers()
            .get_all(reqwest::header::SET_COOKIE)
            .iter()
            .filter_map(|h| h.to_str().ok())
            .filter_map(|h| h.split(';').next()?.strip_prefix("dowze_session="))
            .next()
            .map(str::to_owned)
    } else {
        None
    };
    if response
        .content_length()
        .is_some_and(|size| size > MAX_BODY as u64)
    {
        return Err("Réponse serveur trop volumineuse.".into());
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| "Lecture serveur interrompue.")?
    {
        if bytes.len() + chunk.len() > MAX_BODY {
            return Err("Réponse serveur trop volumineuse.".into());
        }
        bytes.extend_from_slice(&chunk);
    }
    let mut value: Value = if code == 204 {
        Value::Null
    } else {
        serde_json::from_slice(&bytes).map_err(|_| "Réponse serveur invalide.")?
    };
    bytes.zeroize();
    let new_session = if let Some(token) = token {
        let csrf = value
            .get("csrf_token")
            .and_then(Value::as_str)
            .ok_or("Session serveur incomplète.")?
            .to_owned();
        if ![&token, &csrf].iter().all(|s| {
            s.len() >= 16
                && s.len() <= 512
                && s.bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b"_-".contains(&b))
        }) {
            return Err("Session serveur invalide.".into());
        }
        value.as_object_mut().unwrap().remove("csrf_token");
        Some(Session { token, csrf })
    } else {
        None
    };
    Ok((code, value, new_session))
}
#[tauri::command]
#[allow(clippy::too_many_arguments)] // Named IPC fields are the frontend command contract.
pub async fn server_request(
    caller: Webview,
    auth: State<'_, super::local_auth::LocalAuthState>,
    state: State<'_, ServerLinkState>,
    account_id: String,
    method: String,
    path: String,
    body: Option<Value>,
    idempotency_key: Option<String>,
    expected_account_id: Option<String>,
    document_codec: Option<String>,
) -> Result<Value, String> {
    super::require_main_caller(&caller)?;
    auth.require_active_account(&account_id)?;
    if !allowed(&method, &path) {
        return Err("Route serveur refusée.".into());
    }
    private_document_codec(&method, &path, document_codec.as_deref())?;
    let _guard = state.0.lock().await;
    auth.require_active_account(&account_id)?;
    if method == "GET"
        && (path == "/v1/catalog"
            || path.starts_with("/v1/catalog/")
            || path.starts_with("/v1/catalog?"))
    {
        let (code, value, _) = exchange(ORIGIN, &method, &path, None, None, None).await?;
        auth.require_active_account(&account_id)?;
        return Ok(json!({"status":code,"data":value}));
    }
    let entry = vault(&account_id)?;
    let session = match entry.get_password() {
        Ok(mut text) => {
            let value = serde_json::from_str::<Session>(&text)
                .map_err(|_| "Session enregistrée illisible.");
            text.zeroize();
            Some(value?)
        }
        Err(keyring::Error::NoEntry) => None,
        Err(_) => return Err("Lecture du coffre système impossible.".into()),
    };
    let (code, value, new_session) = exchange_scoped_codec(
        ORIGIN,
        &method,
        &path,
        body,
        session.as_ref(),
        idempotency_key.as_deref(),
        expected_account_id.as_deref(),
        document_codec.as_deref(),
    )
    .await?;
    auth.require_active_account(&account_id)?;
    if let Some(new_session) = new_session {
        let mut encoded = serde_json::to_string(&new_session).map_err(|_| "Session invalide.")?;
        advance_managed_session_epoch(&account_id)?;
        let saved = entry.set_password(&encoded);
        encoded.zeroize();
        saved.map_err(|_| "Enregistrement de la session dans le coffre impossible.")?;
    }
    if (method == "DELETE" && path == "/v1/sessions" && code == 204) || code == 401 {
        advance_managed_session_epoch(&account_id)?;
        let _ = entry.delete_credential();
    }
    Ok(json!({"status":code,"data":value}))
}

fn blob_route(method: &str, space: &str, blob: Option<&str>) -> Result<String, String> {
    if !segment(space) {
        return Err("Année serveur invalide.".into());
    }
    match (method, blob) {
        ("POST", None) => Ok(format!("/v1/spaces/{space}/blobs")),
        ("GET", Some(id)) if segment(id) => Ok(format!("/v1/spaces/{space}/blobs/{id}")),
        _ => Err("Opération de fichier refusée.".into()),
    }
}

// Same closed original-media contract as Stage12's TS/Python policy. This only
// qualifies an existing owner-scoped blob route; no command or ACL is added.
fn private_blob_media_type(value: &str) -> bool {
    if value.len() > 128 || !value.is_ascii() { return false; }
    if ["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf", "application/octet-stream",
        "audio/wav", "audio/webm", "audio/mp4", "audio/ogg", "audio/mpeg", "audio/aac", "audio/flac", "audio/aiff",
        "audio/x-wav", "audio/x-m4a", "audio/x-aiff", "audio/x-flac"].contains(&value) { return true; }
    let Some((base, parameters)) = value.split_once(';') else { return false; };
    let parameters = parameters.strip_prefix(' ').unwrap_or(parameters);
    let Some(codec) = parameters.strip_prefix("codecs=") else { return false; };
    let codec = if let Some(quoted) = codec.strip_prefix('"') {
        let Some(inner) = quoted.strip_suffix('"') else { return false; }; inner
    } else { codec };
    match base {
        "audio/webm" | "audio/ogg" => ["opus", "vorbis"].contains(&codec),
        "audio/mp4" => ["mp4a.40.2", "mp4a.40.5", "mp4a.40.29"].contains(&codec),
        _ => false,
    }
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn server_blob_request(
    caller: Webview,
    auth: State<'_, super::local_auth::LocalAuthState>,
    state: State<'_, ServerLinkState>,
    account_id: String,
    expected_account_id: String,
    space_id: String,
    method: String,
    blob_id: Option<String>,
    data_base64: Option<String>,
    media_type: Option<String>,
    idempotency_key: Option<String>,
) -> Result<Value, String> {
    super::require_main_caller(&caller)?;
    auth.require_active_account(&account_id)?;
    if !segment(&expected_account_id) {
        return Err("Compte serveur invalide.".into());
    }
    let path = blob_route(&method, &space_id, blob_id.as_deref())?;
    let _guard = state.0.lock().await;
    auth.require_active_account(&account_id)?;
    let entry = vault(&account_id)?;
    let mut secret = entry
        .get_password()
        .map_err(|_| "Reconnectez le compte serveur.")?;
    let parsed =
        serde_json::from_str::<Session>(&secret).map_err(|_| "Session enregistrée invalide.");
    secret.zeroize();
    let session = parsed?;
    let client = Client::builder()
        .redirect(Policy::none())
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(60))
        .build()
        .map_err(|_| "Client HTTPS indisponible.")?;
    let mut request = client
        .request(
            Method::from_bytes(method.as_bytes()).map_err(|_| "Méthode invalide.")?,
            format!("{ORIGIN}{path}"),
        )
        .header("Origin", ORIGIN)
        .header("Cookie", format!("dowze_session={}", session.token))
        .header("X-Dowze-Account", expected_account_id);
    if method == "POST" {
        let encoded = data_base64.ok_or("Fichier absent.")?;
        if encoded.len() > MAX_BLOB.div_ceil(3) * 4 {
            return Err("Fichier trop volumineux.".into());
        }
        let bytes = BASE64.decode(encoded).map_err(|_| "Fichier invalide.")?;
        if bytes.is_empty() || bytes.len() > MAX_BLOB {
            return Err("Taille de fichier refusée.".into());
        }
        let media = media_type.ok_or("Type de fichier absent.")?;
        if !private_blob_media_type(&media) {
            return Err("Type de fichier refusé.".into());
        }
        let key = idempotency_key.ok_or("Identifiant d’envoi absent.")?;
        if !segment(&key) {
            return Err("Identifiant d’envoi invalide.".into());
        }
        request = request
            .header("Content-Type", media)
            .header("X-CSRF-Token", &session.csrf)
            .header("X-Idempotency-Key", key)
            .header("X-Content-SHA256", format!("{:x}", Sha256::digest(&bytes)))
            .body(bytes);
    }
    let mut response = request
        .send()
        .await
        .map_err(|_| "Transfert indisponible ; la copie locale est conservée.")?;
    let status = response.status().as_u16();
    let media = response
        .headers()
        .get("content-type")
        .and_then(|value| value.to_str().ok())
        .unwrap_or("application/octet-stream")
        .to_owned();
    let expected_hash = response
        .headers()
        .get("x-content-sha256")
        .and_then(|value| value.to_str().ok())
        .map(str::to_owned);
    if response
        .content_length()
        .is_some_and(|size| size > MAX_BLOB as u64)
    {
        return Err("Fichier reçu trop volumineux.".into());
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| "Réception interrompue.")?
    {
        if bytes.len() + chunk.len() > MAX_BLOB {
            return Err("Fichier reçu trop volumineux.".into());
        }
        bytes.extend_from_slice(&chunk);
    }
    auth.require_active_account(&account_id)?;
    if method == "GET" && status == 200 {
        if expected_hash.as_deref() != Some(format!("{:x}", Sha256::digest(&bytes)).as_str()) {
            return Err("Intégrité du fichier reçu invalide.".into());
        }
        Ok(json!({"status":status,"data":{"dataBase64":BASE64.encode(bytes),"mediaType":media}}))
    } else {
        let data: Value =
            serde_json::from_slice(&bytes).map_err(|_| "Réponse de transfert invalide.")?;
        Ok(json!({"status":status,"data":data}))
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn private_original_mime_contract_preserves_closed_codecs_and_existing_cap() {
        for value in ["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf", "application/octet-stream",
            "audio/wav", "audio/webm", "audio/mp4", "audio/ogg", "audio/mpeg", "audio/aac", "audio/flac", "audio/aiff",
            "audio/x-wav", "audio/x-m4a", "audio/x-aiff", "audio/x-flac"] { assert!(private_blob_media_type(value), "{value}"); }
        for base in ["audio/webm", "audio/ogg", "audio/mp4"] {
            let codecs: &[&str] = if base == "audio/mp4" { &["mp4a.40.2", "mp4a.40.5", "mp4a.40.29"] } else { &["opus", "vorbis"] };
            for codec in codecs { for separator in [";", "; "] { for quoted in [false, true] {
                let parameter = if quoted { format!("\"{codec}\"") } else { codec.to_string() };
                assert!(private_blob_media_type(&format!("{base}{separator}codecs={parameter}")));
            } } }
        }
        for value in ["audio/x-dowze-unsupported", "image/x-dowze-unsupported", "text/html", "audio/webm;codecs=unknown",
            "audio/mp4;codecs=avc1", "audio/wav;codecs=opus", "audio/webm;codecs=opus;extra=1", "audio/webm;  codecs=opus",
            "audio/webm;codecs=\"opus", "audio/webm;codecs=opus\"", "audio/webm;codecs=opus\n", "audio/webm\r\nX-Escape:1"] {
            assert!(!private_blob_media_type(value), "{value}");
        }
        assert_eq!(MAX_BLOB, 16 * 1024 * 1024);
    }
    #[test]
    fn blob_routes_reject_traversal_and_unintended_methods() {
        assert!(blob_route("POST", "annual-a", None).is_ok());
        assert!(blob_route("GET", "annual-a", Some("photo-a")).is_ok());
        for (method, space, blob) in [
            ("DELETE", "annual-a", Some("photo-a")),
            ("GET", "annual-a", None),
            ("POST", "annual-a", Some("photo-a")),
            ("GET", "../other", Some("photo-a")),
            ("GET", "annual-a", Some("../photo")),
            ("GET", "annual-a", Some("photo?account=other")),
        ] {
            assert!(blob_route(method, space, blob).is_err());
        }
    }
    #[test]
    #[ignore = "Requires an explicitly started disposable loopback API"]
    fn real_server_accounts_sessions_and_version_conflicts() {
        let origin = std::env::var("DOWZE_TEST_API_ORIGIN").expect("isolated test server");
        let url = reqwest::Url::parse(&origin).unwrap();
        assert_eq!(url.scheme(), "http");
        assert_eq!(url.host_str(), Some("127.0.0.1"));
        tauri::async_runtime::block_on(async {
            let unified_email = format!("unified-{}@example.com", rand::random::<u64>());
            let (account, _) =
                authenticate_at(&origin, &unified_email, "Synthetic-unified-2026!", true)
                    .await
                    .unwrap();
            let (again, _) =
                authenticate_at(&origin, &unified_email, "Synthetic-unified-2026!", false)
                    .await
                    .unwrap();
            assert_eq!(account["id"], again["id"]);
            assert!(
                authenticate_at(&origin, &unified_email, "Incorrect-password!", false)
                    .await
                    .is_err()
            );
            let credentials = json!({"email":format!("desktop-{}@example.com", rand::random::<u64>()),"password":"Synthetic-only-2026!"});
            assert_eq!(
                exchange(
                    &origin,
                    "POST",
                    "/v1/accounts",
                    Some(credentials.clone()),
                    None,
                    None
                )
                .await
                .unwrap()
                .0,
                201
            );
            let (code, public, session) = exchange(
                &origin,
                "POST",
                "/v1/sessions",
                Some(credentials),
                None,
                None,
            )
            .await
            .unwrap();
            assert_eq!(code, 201);
            assert!(public.get("csrf_token").is_none());
            let session = session.unwrap();
            assert_eq!(
                exchange(&origin, "GET", "/v1/me", None, Some(&session), None)
                    .await
                    .unwrap()
                    .0,
                200
            );
            let space = json!({"formation_id":"synthetic-course","academic_year":"2026-2027","title":"Synthetic desktop qualification"});
            assert_eq!(
                exchange(
                    &origin,
                    "PUT",
                    "/v1/spaces/synthetic",
                    Some(space),
                    Some(&session),
                    None
                )
                .await
                .unwrap()
                .0,
                201
            );
            let path = "/v1/spaces/synthetic/documents/notesMarkdown/note";
            let note = json!({"base_version":0,"content":{"title":"Note","markdown":"Synthetic"}});
            assert_eq!(
                exchange(
                    &origin,
                    "PUT",
                    path,
                    Some(note.clone()),
                    Some(&session),
                    Some("mutation-1")
                )
                .await
                .unwrap()
                .0,
                200
            );
            assert_eq!(
                exchange(
                    &origin,
                    "PUT",
                    path,
                    Some(note),
                    Some(&session),
                    Some("mutation-2")
                )
                .await
                .unwrap()
                .0,
                409
            );
            assert_eq!(
                exchange(
                    &origin,
                    "DELETE",
                    "/v1/spaces/synthetic/documents/notesMarkdown/note?base_version=1",
                    None,
                    Some(&session),
                    Some("delete-1")
                )
                .await
                .unwrap()
                .0,
                200
            );
            assert_eq!(
                exchange(
                    &origin,
                    "DELETE",
                    "/v1/sessions",
                    None,
                    Some(&session),
                    None
                )
                .await
                .unwrap()
                .0,
                204
            );
            assert_eq!(
                exchange(&origin, "GET", "/v1/me", None, Some(&session), None)
                    .await
                    .unwrap()
                    .0,
                401
            );
        });
    }
    #[test]
    fn routes_confine_credentials_to_the_academie_api() {
        for path in [
            "https://evil.example/v1/me",
            "//evil.example/v1/me",
            "/v1/../secret",
            "/v1/spaces/%2e%2e",
            "/v1/me#x",
            "/v1/me?redirect=https://evil.example",
        ] {
            assert!(!allowed("GET", path));
        }
        assert!(allowed("GET", "/v1/catalog/course/1.0.0/content"));
        assert!(allowed(
            "GET",
            "/v1/spaces/annual/changes?cursor=abc_123-xyz&limit=500"
        ));
        assert!(allowed(
            "PUT",
            "/v1/spaces/annual/documents/notesMarkdown/note"
        ));
        assert!(!allowed("PUT", "/v1/spaces/annual/documents/shell/note"));
        assert!(!allowed("DELETE", "/v1/accounts"));
    }
}

#[cfg(test)]
#[path = "server_link_http_pool_tests.rs"]
mod pooled_http_tests;
