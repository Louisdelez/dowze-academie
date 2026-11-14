use ipnet::IpNet;
use keyring::{Entry, Error as KeyringError};
use reqwest::{redirect::Policy, Client, ClientBuilder, RequestBuilder, Url};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    net::{IpAddr, Ipv4Addr, Ipv6Addr, SocketAddr},
    sync::OnceLock,
    time::Duration,
};
use tauri::Webview;

const KEYCHAIN_SERVICE: &str = "com.etude.free-chat.api-key";
// Windows Credential Manager stores password blobs as UTF-16 and caps them at
// 2,560 bytes. Keeping the UTF-8 input at 1,024 bytes stays portable even when
// every scalar needs two UTF-16 code units, while remaining well above normal
// API-key sizes.
const MAX_API_KEY_BYTES: usize = 1_024;
const MAX_MODEL_BYTES: usize = 160;
const MAX_MESSAGES: usize = 200;
const MAX_MESSAGE_BYTES: usize = 200_000;
const MAX_TOTAL_MESSAGE_BYTES: usize = 2_000_000;
const MAX_ENDPOINT_BYTES: usize = 2_048;
const MAX_ERROR_BYTES: usize = 600;
const MAX_RESPONSE_BYTES: usize = 16 * 1024 * 1024;

// Addresses that must never be reached through a user-configurable remote
// endpoint. This includes private/local ranges and special ranges that can
// embed or relay an IPv4 address (NAT64, Teredo and 6to4).
const FORBIDDEN_REMOTE_IP_RANGES: &[IpNet] = &[
    IpNet::new_assert(IpAddr::V4(Ipv4Addr::new(0, 0, 0, 0)), 8),
    IpNet::new_assert(IpAddr::V4(Ipv4Addr::new(10, 0, 0, 0)), 8),
    IpNet::new_assert(IpAddr::V4(Ipv4Addr::new(100, 64, 0, 0)), 10),
    IpNet::new_assert(IpAddr::V4(Ipv4Addr::new(127, 0, 0, 0)), 8),
    IpNet::new_assert(IpAddr::V4(Ipv4Addr::new(169, 254, 0, 0)), 16),
    IpNet::new_assert(IpAddr::V4(Ipv4Addr::new(172, 16, 0, 0)), 12),
    IpNet::new_assert(IpAddr::V4(Ipv4Addr::new(192, 0, 0, 0)), 24),
    IpNet::new_assert(IpAddr::V4(Ipv4Addr::new(192, 0, 2, 0)), 24),
    IpNet::new_assert(IpAddr::V4(Ipv4Addr::new(192, 88, 99, 0)), 24),
    IpNet::new_assert(IpAddr::V4(Ipv4Addr::new(192, 168, 0, 0)), 16),
    IpNet::new_assert(IpAddr::V4(Ipv4Addr::new(198, 18, 0, 0)), 15),
    IpNet::new_assert(IpAddr::V4(Ipv4Addr::new(198, 51, 100, 0)), 24),
    IpNet::new_assert(IpAddr::V4(Ipv4Addr::new(203, 0, 113, 0)), 24),
    IpNet::new_assert(IpAddr::V4(Ipv4Addr::new(224, 0, 0, 0)), 4),
    IpNet::new_assert(IpAddr::V4(Ipv4Addr::new(240, 0, 0, 0)), 4),
    IpNet::new_assert(IpAddr::V6(Ipv6Addr::UNSPECIFIED), 96),
    IpNet::new_assert(IpAddr::V6(Ipv6Addr::new(0, 0, 0, 0, 0, 0xffff, 0, 0)), 96),
    IpNet::new_assert(
        IpAddr::V6(Ipv6Addr::new(0x64, 0xff9b, 0, 0, 0, 0, 0, 0)),
        96,
    ),
    IpNet::new_assert(
        IpAddr::V6(Ipv6Addr::new(0x64, 0xff9b, 1, 0, 0, 0, 0, 0)),
        48,
    ),
    IpNet::new_assert(IpAddr::V6(Ipv6Addr::new(0x100, 0, 0, 0, 0, 0, 0, 0)), 64),
    IpNet::new_assert(IpAddr::V6(Ipv6Addr::new(0x2001, 0, 0, 0, 0, 0, 0, 0)), 32),
    IpNet::new_assert(IpAddr::V6(Ipv6Addr::new(0x2001, 0x2, 0, 0, 0, 0, 0, 0)), 48),
    IpNet::new_assert(
        IpAddr::V6(Ipv6Addr::new(0x2001, 0x10, 0, 0, 0, 0, 0, 0)),
        28,
    ),
    IpNet::new_assert(
        IpAddr::V6(Ipv6Addr::new(0x2001, 0x20, 0, 0, 0, 0, 0, 0)),
        28,
    ),
    IpNet::new_assert(
        IpAddr::V6(Ipv6Addr::new(0x2001, 0xdb8, 0, 0, 0, 0, 0, 0)),
        32,
    ),
    IpNet::new_assert(IpAddr::V6(Ipv6Addr::new(0x2002, 0, 0, 0, 0, 0, 0, 0)), 16),
    IpNet::new_assert(IpAddr::V6(Ipv6Addr::new(0xfc00, 0, 0, 0, 0, 0, 0, 0)), 7),
    IpNet::new_assert(IpAddr::V6(Ipv6Addr::new(0xfe80, 0, 0, 0, 0, 0, 0, 0)), 10),
    IpNet::new_assert(IpAddr::V6(Ipv6Addr::new(0xfec0, 0, 0, 0, 0, 0, 0, 0)), 10),
    IpNet::new_assert(IpAddr::V6(Ipv6Addr::new(0xff00, 0, 0, 0, 0, 0, 0, 0)), 8),
];

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum FreeChatBackend {
    Openai,
    Mistral,
    Deepseek,
    Kimi,
    Compatible,
    Ollama,
}

impl FreeChatBackend {
    fn account(self) -> &'static str {
        match self {
            Self::Openai => "openai",
            Self::Mistral => "mistral",
            Self::Deepseek => "deepseek",
            Self::Kimi => "kimi",
            Self::Compatible => "compatible",
            Self::Ollama => "ollama",
        }
    }

    fn needs_api_key(self) -> bool {
        !matches!(self, Self::Ollama)
    }
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum FreeChatRole {
    System,
    User,
    Assistant,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FreeChatMessage {
    pub role: FreeChatRole,
    pub content: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reasoning_content: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FreeChatRequest {
    pub backend: FreeChatBackend,
    pub model: String,
    pub messages: Vec<FreeChatMessage>,
    pub endpoint: Option<String>,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FreeChatReply {
    pub content: String,
    pub model: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reasoning_content: Option<String>,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FreeChatKeyStatus {
    pub backend: FreeChatBackend,
    pub configured: bool,
}

fn parse_backend(raw: &str) -> Result<FreeChatBackend, String> {
    match raw {
        "openai" => Ok(FreeChatBackend::Openai),
        "mistral" => Ok(FreeChatBackend::Mistral),
        "deepseek" => Err("Ce fournisseur a été retiré de cette application.".into()),
        "kimi" => Ok(FreeChatBackend::Kimi),
        "compatible" => Ok(FreeChatBackend::Compatible),
        "ollama" => Ok(FreeChatBackend::Ollama),
        _ => Err("Fournisseur de chat libre inconnu.".into()),
    }
}

fn compatible_keychain_account(endpoint: &Url) -> Result<String, String> {
    if endpoint.domain().is_none() {
        return Err("L'endpoint compatible doit utiliser un nom de domaine.".into());
    }
    Ok(format!(
        "compatible@{}",
        endpoint.origin().ascii_serialization()
    ))
}

fn keychain_account(backend: FreeChatBackend, endpoint: Option<&Url>) -> Result<String, String> {
    match backend {
        FreeChatBackend::Compatible => {
            compatible_keychain_account(endpoint.ok_or_else(|| {
                "Indique l'endpoint compatible associé à cette clé API.".to_string()
            })?)
        }
        _ => Ok(backend.account().to_owned()),
    }
}

fn keychain_entry(backend: FreeChatBackend, endpoint: Option<&Url>) -> Result<Entry, String> {
    if !backend.needs_api_key() {
        return Err("Ollama local n'utilise pas de clé API.".into());
    }
    let account = keychain_account(backend, endpoint)?;
    Entry::new(KEYCHAIN_SERVICE, &account)
        .map_err(|error| format!("Impossible d'accéder au coffre sécurisé du système: {error}"))
}

fn normalize_api_key(raw: &str) -> Result<String, String> {
    let api_key = raw.trim();
    if api_key.len() < 8 || api_key.len() > MAX_API_KEY_BYTES {
        return Err(format!(
            "La clé API doit contenir entre 8 et {MAX_API_KEY_BYTES} octets."
        ));
    }
    if api_key.chars().any(char::is_control) {
        return Err("La clé API contient un caractère interdit.".into());
    }
    Ok(api_key.to_owned())
}

pub(crate) fn read_api_key(
    backend: FreeChatBackend,
    endpoint: Option<&Url>,
) -> Result<String, String> {
    keychain_entry(backend, endpoint)?
        .get_password()
        .map_err(|error| match error {
            KeyringError::NoEntry => format!(
                "Aucune clé API n'est enregistrée pour {}.",
                backend.account()
            ),
            other => {
                format!("Impossible de lire la clé dans le coffre sécurisé du système: {other}")
            }
        })
}

fn has_api_key(backend: FreeChatBackend, endpoint: Option<&Url>) -> Result<bool, String> {
    match keychain_entry(backend, endpoint)?.get_password() {
        Ok(value) => Ok(!value.trim().is_empty()),
        Err(KeyringError::NoEntry) => Ok(false),
        Err(error) => Err(format!(
            "Impossible de consulter le coffre sécurisé du système: {error}"
        )),
    }
}

#[tauri::command]
pub async fn free_chat_key_status(
    caller: Webview,
    endpoint: Option<String>,
) -> Result<Vec<FreeChatKeyStatus>, String> {
    super::require_main_caller(&caller)?;
    let compatible_endpoint = endpoint
        .as_deref()
        .map(|raw| remote_chat_endpoint(FreeChatBackend::Compatible, Some(raw)))
        .transpose()?;
    tauri::async_runtime::spawn_blocking(move || {
        [
            FreeChatBackend::Openai,
            FreeChatBackend::Mistral,
            FreeChatBackend::Deepseek,
            FreeChatBackend::Kimi,
            FreeChatBackend::Compatible,
        ]
        .into_iter()
        .map(|backend| {
            let configured = if backend == FreeChatBackend::Compatible {
                compatible_endpoint
                    .as_ref()
                    .map(|endpoint| has_api_key(backend, Some(endpoint)))
                    .transpose()?
                    .unwrap_or(false)
            } else {
                has_api_key(backend, None)?
            };
            Ok(FreeChatKeyStatus {
                backend,
                configured,
            })
        })
        .collect()
    })
    .await
    .map_err(|error| format!("La consultation du coffre sécurisé a échoué: {error}"))?
}

#[tauri::command]
pub async fn save_free_chat_api_key(
    caller: Webview,
    backend: String,
    api_key: String,
    endpoint: Option<String>,
) -> Result<(), String> {
    super::require_main_caller(&caller)?;
    let backend = parse_backend(&backend)?;
    if !backend.needs_api_key() {
        return Err("Ollama local n'utilise pas de clé API.".into());
    }
    let api_key = normalize_api_key(&api_key)?;
    let compatible_endpoint = if backend == FreeChatBackend::Compatible {
        Some(remote_chat_endpoint(backend, endpoint.as_deref())?)
    } else {
        None
    };
    tauri::async_runtime::spawn_blocking(move || {
        keychain_entry(backend, compatible_endpoint.as_ref())?
            .set_password(&api_key)
            .map_err(|error| {
                format!(
                    "Impossible d'enregistrer la clé dans le coffre sécurisé du système: {error}"
                )
            })
    })
    .await
    .map_err(|error| format!("L'enregistrement dans le coffre sécurisé a échoué: {error}"))?
}

#[tauri::command]
pub async fn delete_free_chat_api_key(
    caller: Webview,
    backend: String,
    endpoint: Option<String>,
) -> Result<bool, String> {
    super::require_main_caller(&caller)?;
    let backend = parse_backend(&backend)?;
    if !backend.needs_api_key() {
        return Ok(false);
    }
    let compatible_endpoint = if backend == FreeChatBackend::Compatible {
        Some(remote_chat_endpoint(backend, endpoint.as_deref())?)
    } else {
        None
    };
    tauri::async_runtime::spawn_blocking(move || {
        match keychain_entry(backend, compatible_endpoint.as_ref())?.delete_credential() {
            Ok(()) => Ok(true),
            Err(KeyringError::NoEntry) => Ok(false),
            Err(error) => Err(format!(
                "Impossible de supprimer la clé du coffre sécurisé du système: {error}"
            )),
        }
    })
    .await
    .map_err(|error| format!("La suppression dans le coffre sécurisé a échoué: {error}"))?
}

fn validate_model(model: &str) -> Result<String, String> {
    let model = model.trim();
    if model.is_empty() || model.len() > MAX_MODEL_BYTES {
        return Err("Le nom du modèle est vide ou trop long.".into());
    }
    if !model.bytes().all(|byte| {
        byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.' | b':' | b'/')
    }) {
        return Err("Le nom du modèle contient un caractère interdit.".into());
    }
    Ok(model.to_owned())
}

fn validate_messages(messages: &[FreeChatMessage]) -> Result<(), String> {
    if messages.is_empty() || messages.len() > MAX_MESSAGES {
        return Err("La conversation doit contenir entre 1 et 200 messages.".into());
    }
    let mut total = 0usize;
    for message in messages {
        if message.content.trim().is_empty() || message.content.len() > MAX_MESSAGE_BYTES {
            return Err("Un message est vide ou dépasse la taille autorisée.".into());
        }
        total = total.saturating_add(message.content.len());
        if let Some(reasoning_content) = message.reasoning_content.as_deref() {
            if !matches!(message.role, FreeChatRole::Assistant)
                || reasoning_content.trim().is_empty()
                || reasoning_content.len() > MAX_MESSAGE_BYTES
            {
                return Err(
                    "Le raisonnement IA doit être non vide, de taille autorisée et associé à un message assistant."
                        .into(),
                );
            }
            total = total.saturating_add(reasoning_content.len());
        }
    }
    if total > MAX_TOTAL_MESSAGE_BYTES {
        return Err("La conversation est trop volumineuse pour un seul envoi.".into());
    }
    Ok(())
}

fn remote_chat_endpoint(backend: FreeChatBackend, custom: Option<&str>) -> Result<Url, String> {
    let fixed = match backend {
        FreeChatBackend::Openai => "https://api.openai.com/v1/responses",
        FreeChatBackend::Mistral => "https://api.mistral.ai/v1/chat/completions",
        FreeChatBackend::Deepseek => "https://api.deepseek.com/chat/completions",
        FreeChatBackend::Kimi => "https://api.moonshot.ai/v1/chat/completions",
        FreeChatBackend::Compatible => custom.ok_or_else(|| {
            "Indique l'URL HTTPS complète de l'API compatible OpenAI.".to_string()
        })?,
        FreeChatBackend::Ollama => return Err("Ollama utilise son endpoint local dédié.".into()),
    };
    if fixed.len() > MAX_ENDPOINT_BYTES {
        return Err("L'URL de l'API est trop longue.".into());
    }
    let url = Url::parse(fixed).map_err(|_| "L'URL de l'API est invalide.".to_string())?;
    if url.scheme() != "https"
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
        || !matches!(url.port(), None | Some(443))
    {
        return Err(
            "L'API distante doit utiliser une URL HTTPS sans identifiants, paramètres ni fragment."
                .into(),
        );
    }
    // `domain()` deliberately returns None for both IPv4 and IPv6 literals.
    // Using host_str() here is unsafe because IPv6 literals retain brackets.
    let domain = url
        .domain()
        .ok_or_else(|| "L'API distante doit utiliser un nom de domaine public.".to_string())?;
    if domain.ends_with('.')
        || domain.eq_ignore_ascii_case("localhost")
        || domain.ends_with(".localhost")
        || domain.ends_with(".local")
    {
        return Err("Une API distante ne peut pas cibler une adresse locale ou privée.".into());
    }
    if backend == FreeChatBackend::Compatible && !url.path().ends_with("/chat/completions") {
        return Err("L'URL compatible doit se terminer par /chat/completions.".into());
    }
    Ok(url)
}

fn ollama_base_url(raw: Option<&str>) -> Result<Url, String> {
    let raw = raw.unwrap_or("http://127.0.0.1:11434");
    if raw.len() > MAX_ENDPOINT_BYTES {
        return Err("L'adresse Ollama est trop longue.".into());
    }
    let mut url = Url::parse(raw).map_err(|_| "L'adresse Ollama est invalide.".to_string())?;
    let host = url
        .host_str()
        .ok_or_else(|| "L'adresse Ollama ne contient pas d'hôte.".to_string())?;
    if url.scheme() != "http"
        || !matches!(host, "127.0.0.1" | "::1" | "[::1]")
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
        || !matches!(url.path(), "" | "/")
    {
        return Err(
            "Ollama doit utiliser une adresse locale de la forme http://127.0.0.1:11434.".into(),
        );
    }
    let port = url
        .port()
        .ok_or_else(|| "L'adresse Ollama doit contenir un port explicite.".to_string())?;
    if port == 0 {
        return Err("Le port Ollama est invalide.".into());
    }
    url.set_path("/");
    Ok(url)
}

fn client_builder() -> ClientBuilder {
    Client::builder()
        .redirect(Policy::none())
        .connect_timeout(Duration::from_secs(8))
        .timeout(Duration::from_secs(180))
        .user_agent("DowzeAcademie/0.1 free-chat")
}

fn remote_client() -> Result<Client, String> {
    static CLIENT: OnceLock<Result<Client, String>> = OnceLock::new();
    CLIENT
        .get_or_init(|| {
            client_builder()
                .https_only(true)
                .build()
                .map_err(|error| format!("Impossible de préparer le client IA: {error}"))
        })
        .clone()
}

fn ollama_client() -> Result<Client, String> {
    static CLIENT: OnceLock<Result<Client, String>> = OnceLock::new();
    CLIENT
        .get_or_init(|| {
            client_builder()
                // Ollama is explicitly restricted to a loopback address. Never allow a
                // system HTTP proxy to observe or relay these local conversations.
                .no_proxy()
                .build()
                .map_err(|error| format!("Impossible de préparer le client Ollama: {error}"))
        })
        .clone()
}

fn is_forbidden_remote_ip(ip: IpAddr) -> bool {
    FORBIDDEN_REMOTE_IP_RANGES
        .iter()
        .any(|network| network.contains(&ip))
}

fn validate_resolved_remote_addresses(addresses: &[SocketAddr]) -> Result<(), String> {
    if addresses.is_empty() {
        return Err("Le domaine de l'API compatible ne renvoie aucune adresse.".into());
    }
    if addresses
        .iter()
        .any(|address| address.port() != 443 || is_forbidden_remote_ip(address.ip()))
    {
        return Err(
            "Le domaine de l'API compatible renvoie une adresse locale, privée ou réservée.".into(),
        );
    }
    Ok(())
}

fn pinned_compatible_client(endpoint: &Url, addresses: &[SocketAddr]) -> Result<Client, String> {
    validate_resolved_remote_addresses(addresses)?;
    let domain = endpoint
        .domain()
        .ok_or_else(|| "L'endpoint compatible doit utiliser un nom de domaine.".to_string())?;
    client_builder()
        // Disabling proxies is required for the DNS override to remain the
        // actual destination and prevents a proxy from resolving the host again.
        .no_proxy()
        .https_only(true)
        .resolve_to_addrs(domain, addresses)
        .build()
        .map_err(|error| format!("Impossible de préparer le client IA compatible: {error}"))
}

async fn compatible_client(endpoint: &Url) -> Result<Client, String> {
    let domain = endpoint
        .domain()
        .ok_or_else(|| "L'endpoint compatible doit utiliser un nom de domaine.".to_string())?;
    let mut addresses = tokio::time::timeout(
        Duration::from_secs(10),
        tokio::net::lookup_host((domain, 443)),
    )
    .await
    .map_err(|_| "La résolution DNS du domaine compatible a expiré.".to_string())?
    .map_err(|error| format!("Impossible de résoudre le domaine de l'API compatible: {error}"))?
    .collect::<Vec<_>>();
    addresses.sort_unstable();
    addresses.dedup();
    pinned_compatible_client(endpoint, &addresses)
}

fn messages_json(messages: &[FreeChatMessage], backend: FreeChatBackend) -> Vec<Value> {
    messages
        .iter()
        .map(|message| {
            let role = match message.role {
                FreeChatRole::System => "system",
                FreeChatRole::User => "user",
                FreeChatRole::Assistant => "assistant",
            };
            let mut value = json!({ "role": role, "content": message.content });
            if backend == FreeChatBackend::Kimi && matches!(message.role, FreeChatRole::Assistant) {
                if let Some(reasoning_content) = message.reasoning_content.as_deref() {
                    value["reasoning_content"] = Value::String(reasoning_content.to_owned());
                }
            }
            value
        })
        .collect()
}

fn bounded_error(value: &str) -> String {
    value
        .chars()
        .filter(|character| !character.is_control() || *character == '\n' || *character == '\t')
        .take(MAX_ERROR_BYTES)
        .collect::<String>()
        .trim()
        .to_string()
}

fn api_error_message(value: &Value) -> Option<String> {
    value
        .pointer("/error/message")
        .and_then(Value::as_str)
        .or_else(|| value.get("message").and_then(Value::as_str))
        .map(bounded_error)
        .filter(|message| !message.is_empty())
}

async fn parse_json_response(mut response: reqwest::Response) -> Result<Value, String> {
    let status = response.status();
    if response
        .content_length()
        .is_some_and(|length| length > MAX_RESPONSE_BYTES as u64)
    {
        return Err("La réponse IA dépasse la taille maximale autorisée.".into());
    }
    let mut body = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|error| format!("Réponse IA illisible: {error}"))?
    {
        if body.len().saturating_add(chunk.len()) > MAX_RESPONSE_BYTES {
            return Err("La réponse IA dépasse la taille maximale autorisée.".into());
        }
        body.extend_from_slice(&chunk);
    }
    let text = String::from_utf8(body)
        .map_err(|_| "Le service IA a renvoyé un texte non UTF-8.".to_string())?;
    let value: Value = serde_json::from_str(&text).map_err(|_| {
        if status.is_success() {
            "Le service IA a renvoyé une réponse JSON invalide.".to_string()
        } else {
            format!("Le service IA a refusé la requête (HTTP {status}).")
        }
    })?;
    if !status.is_success() {
        let detail = api_error_message(&value).unwrap_or_else(|| format!("Erreur HTTP {status}"));
        return Err(format!("Le service IA a refusé la requête: {detail}"));
    }
    Ok(value)
}

fn openai_response_status_error(value: &Value) -> Option<String> {
    if let Some(message) = api_error_message(value) {
        return Some(format!("OpenAI a renvoyé une erreur: {message}"));
    }
    match value.get("status").and_then(Value::as_str) {
        None | Some("completed") => None,
        Some("incomplete") => {
            let reason = value
                .pointer("/incomplete_details/reason")
                .and_then(Value::as_str)
                .map(bounded_error)
                .filter(|reason| !reason.is_empty())
                .unwrap_or_else(|| "raison non précisée".to_string());
            Some(format!("La réponse OpenAI est incomplète: {reason}."))
        }
        Some("failed") => Some("La génération OpenAI a échoué.".into()),
        Some("cancelled") => Some("La génération OpenAI a été annulée.".into()),
        Some("queued") | Some("in_progress") => {
            Some("OpenAI n'a pas terminé la génération de la réponse.".into())
        }
        Some(status) => Some(format!(
            "OpenAI a renvoyé un statut de réponse inconnu: {}.",
            bounded_error(status)
        )),
    }
}

fn extract_openai_response(value: &Value) -> Result<String, String> {
    if let Some(error) = openai_response_status_error(value) {
        return Err(error);
    }
    if let Some(text) = value
        .get("output_text")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|text| !text.is_empty())
    {
        return Ok(text.to_owned());
    }
    let text = value
        .get("output")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|item| item.get("content").and_then(Value::as_array))
        .flatten()
        .filter(|part| part.get("type").and_then(Value::as_str) == Some("output_text"))
        .filter_map(|part| part.get("text").and_then(Value::as_str))
        .collect::<Vec<_>>()
        .join("\n")
        .trim()
        .to_owned();
    if text.is_empty() {
        Err("OpenAI n'a renvoyé aucun texte exploitable.".into())
    } else {
        Ok(text)
    }
}

fn extract_chat_completion(value: &Value) -> Option<String> {
    let content = value.pointer("/choices/0/message/content")?;
    if let Some(text) = content.as_str() {
        return Some(text.trim().to_owned()).filter(|text| !text.is_empty());
    }
    let text = content
        .as_array()?
        .iter()
        .filter_map(|part| part.get("text").and_then(Value::as_str))
        .collect::<Vec<_>>()
        .join("\n")
        .trim()
        .to_owned();
    Some(text).filter(|text| !text.is_empty())
}

fn extract_chat_reasoning_content(value: &Value) -> Option<String> {
    value
        .pointer("/choices/0/message/reasoning_content")
        .and_then(Value::as_str)
        .filter(|text| !text.trim().is_empty())
        .map(str::to_owned)
}

fn response_model(value: &Value, requested_model: &str) -> String {
    value
        .get("model")
        .and_then(Value::as_str)
        .and_then(|model| validate_model(model).ok())
        .unwrap_or_else(|| requested_model.to_owned())
}

fn validate_reply_size(
    request_messages: &[FreeChatMessage],
    content: &str,
    reasoning_content: Option<&str>,
) -> Result<(), String> {
    if content.is_empty() || content.len() > MAX_MESSAGE_BYTES {
        return Err(
            "La réponse du modèle dépasse la taille maximale d'un message. Demande une réponse plus courte."
                .into(),
        );
    }
    if reasoning_content.is_some_and(|reasoning| reasoning.len() > MAX_MESSAGE_BYTES) {
        return Err(
            "Le raisonnement interne du modèle dépasse la taille maximale autorisée. Réduis la longueur de réponse demandée."
                .into(),
        );
    }
    let previous_bytes = request_messages.iter().fold(0usize, |total, message| {
        total
            .saturating_add(message.content.len())
            .saturating_add(message.reasoning_content.as_deref().map_or(0, str::len))
    });
    let reply_bytes = content
        .len()
        .saturating_add(reasoning_content.map_or(0, str::len));
    if previous_bytes.saturating_add(reply_bytes) > MAX_TOTAL_MESSAGE_BYTES {
        return Err(
            "Cette conversation atteint sa limite de taille. Démarre une nouvelle conversation pour continuer."
                .into(),
        );
    }
    Ok(())
}

async fn send_request(builder: RequestBuilder) -> Result<Value, String> {
    let response = builder
        .send()
        .await
        .map_err(|error| format!("Impossible de joindre le service IA: {error}"))?;
    parse_json_response(response).await
}

#[tauri::command]
pub async fn send_free_chat_message(
    caller: Webview,
    request: FreeChatRequest,
) -> Result<FreeChatReply, String> {
    super::require_main_caller(&caller)?;
    let model = validate_model(&request.model)?;
    validate_messages(&request.messages)?;

    let (content, actual_model, reasoning_content) = if request.backend == FreeChatBackend::Ollama {
        let http = ollama_client()?;
        let base = ollama_base_url(request.endpoint.as_deref())?;
        let endpoint = base
            .join("api/chat")
            .map_err(|_| "Impossible de construire l'adresse locale Ollama.".to_string())?;
        let value = send_request(http.post(endpoint).json(&json!({
            "model": model,
            "messages": messages_json(&request.messages, request.backend),
            "stream": false
        })))
        .await
        .map_err(|error| {
            format!(
                "Ollama ne répond pas sur cette adresse. Lance Ollama puis réessaie. Détail: {error}"
            )
        })?;
        let content = value
            .pointer("/message/content")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|text| !text.is_empty())
            .map(str::to_owned)
            .ok_or_else(|| "Ollama n'a renvoyé aucun texte exploitable.".to_string())?;
        let actual_model = response_model(&value, &model);
        (content, actual_model, None)
    } else {
        let endpoint = remote_chat_endpoint(request.backend, request.endpoint.as_deref())?;
        let http = if request.backend == FreeChatBackend::Compatible {
            compatible_client(&endpoint).await?
        } else {
            remote_client()?
        };
        let backend = request.backend;
        let key_endpoint = (backend == FreeChatBackend::Compatible).then_some(endpoint.clone());
        let api_key = tauri::async_runtime::spawn_blocking(move || {
            read_api_key(backend, key_endpoint.as_ref())
        })
        .await
        .map_err(|error| format!("La lecture du coffre sécurisé a échoué: {error}"))??;
        let mut builder = http.post(endpoint).bearer_auth(api_key);
        let body = if request.backend == FreeChatBackend::Openai {
            json!({
                "model": model,
                "input": messages_json(&request.messages, request.backend),
                "store": false
            })
        } else {
            json!({
                "model": model,
                "messages": messages_json(&request.messages, request.backend),
                "stream": false
            })
        };
        builder = builder.json(&body);
        let value = send_request(builder).await?;
        let actual_model = response_model(&value, &model);
        if request.backend == FreeChatBackend::Openai {
            (extract_openai_response(&value)?, actual_model, None)
        } else {
            let content = extract_chat_completion(&value)
                .ok_or_else(|| "Le service IA n'a renvoyé aucun texte exploitable.".to_string())?;
            let reasoning_content = (request.backend == FreeChatBackend::Kimi)
                .then(|| extract_chat_reasoning_content(&value))
                .flatten();
            (content, actual_model, reasoning_content)
        }
    };

    validate_reply_size(&request.messages, &content, reasoning_content.as_deref())?;

    Ok(FreeChatReply {
        content,
        model: actual_model,
        reasoning_content,
    })
}

#[tauri::command]
pub async fn list_ollama_models(
    caller: Webview,
    endpoint: Option<String>,
) -> Result<Vec<String>, String> {
    super::require_main_caller(&caller)?;
    let base = ollama_base_url(endpoint.as_deref())?;
    let url = base
        .join("api/tags")
        .map_err(|_| "Impossible de construire l'adresse locale Ollama.".to_string())?;
    let value = send_request(ollama_client()?.get(url))
        .await
        .map_err(|error| {
            format!(
            "Ollama ne répond pas sur cette adresse. Lance Ollama puis réessaie. Détail: {error}"
        )
        })?;
    let mut models = value
        .get("models")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|item| item.get("name").and_then(Value::as_str))
        .filter_map(|name| validate_model(name).ok())
        .collect::<Vec<_>>();
    models.sort();
    models.dedup();
    Ok(models)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn api_keys_fit_every_native_secure_store() {
        assert_eq!(normalize_api_key("  abcdefgh  ").unwrap(), "abcdefgh");
        assert!(normalize_api_key("1234567").is_err());
        assert!(normalize_api_key(&"a".repeat(MAX_API_KEY_BYTES)).is_ok());
        assert!(normalize_api_key(&"a".repeat(MAX_API_KEY_BYTES + 1)).is_err());
        assert!(normalize_api_key(&"é".repeat((MAX_API_KEY_BYTES / 2) + 1)).is_err());
        assert!(normalize_api_key("clé-api\ninterdite").is_err());
    }

    #[test]
    fn validates_models_and_message_limits() {
        assert_eq!(validate_model("qwen3:8b").unwrap(), "qwen3:8b");
        assert_eq!(validate_model("openai/gpt-5.4").unwrap(), "openai/gpt-5.4");
        assert!(validate_model("../../secret?key=x").is_err());
        assert!(validate_model("").is_err());

        assert!(validate_messages(&[FreeChatMessage {
            role: FreeChatRole::User,
            content: "Bonjour".into(),
            reasoning_content: None,
        }])
        .is_ok());
        assert!(validate_messages(&[FreeChatMessage {
            role: FreeChatRole::Assistant,
            content: "Réponse".into(),
            reasoning_content: Some("Raisonnement Kimi".into()),
        }])
        .is_ok());
        assert!(validate_messages(&[FreeChatMessage {
            role: FreeChatRole::User,
            content: "Question".into(),
            reasoning_content: Some("Interdit pour un utilisateur".into()),
        }])
        .is_err());
        assert!(validate_messages(&[]).is_err());
    }

    #[test]
    fn reply_limits_match_the_next_turn_and_total_context_limits() {
        let request = vec![FreeChatMessage {
            role: FreeChatRole::User,
            content: "Question courte".into(),
            reasoning_content: None,
        }];
        assert!(validate_reply_size(&request, "Réponse courte", None).is_ok());
        assert!(validate_reply_size(&request, &"a".repeat(MAX_MESSAGE_BYTES + 1), None).is_err());
        assert!(validate_reply_size(
            &request,
            "Réponse",
            Some(&"r".repeat(MAX_MESSAGE_BYTES + 1))
        )
        .is_err());

        let nearly_full = (0..10)
            .map(|_| FreeChatMessage {
                role: FreeChatRole::User,
                content: "q".repeat(190_000),
                reasoning_content: None,
            })
            .collect::<Vec<_>>();
        assert!(validate_messages(&nearly_full).is_ok());
        assert!(validate_reply_size(&nearly_full, &"a".repeat(150_000), None).is_err());
    }

    #[test]
    fn remote_endpoints_reject_local_targets_and_credential_leaks() {
        assert!(remote_chat_endpoint(FreeChatBackend::Openai, None).is_ok());
        assert!(remote_chat_endpoint(
            FreeChatBackend::Compatible,
            Some("https://example.com/v1/chat/completions")
        )
        .is_ok());
        for unsafe_url in [
            "http://example.com/v1/chat/completions",
            "https://127.0.0.1/v1/chat/completions",
            "https://[::1]/v1/chat/completions",
            "https://[fd00::1]/v1/chat/completions",
            "https://localhost/v1/chat/completions",
            "https://example.local./v1/chat/completions",
            "https://example.com./v1/chat/completions",
            "https://key@example.com/v1/chat/completions",
            "https://example.com/v1/models",
            "https://example.com:8443/v1/chat/completions",
        ] {
            assert!(
                remote_chat_endpoint(FreeChatBackend::Compatible, Some(unsafe_url)).is_err(),
                "{unsafe_url}"
            );
        }
    }

    #[test]
    fn compatible_keys_are_bound_to_the_canonical_origin() {
        let first = remote_chat_endpoint(
            FreeChatBackend::Compatible,
            Some("https://EXAMPLE.com:443/v1/chat/completions"),
        )
        .unwrap();
        let same_origin = remote_chat_endpoint(
            FreeChatBackend::Compatible,
            Some("https://example.com/api/chat/completions"),
        )
        .unwrap();
        let other = remote_chat_endpoint(
            FreeChatBackend::Compatible,
            Some("https://api.example.com/v1/chat/completions"),
        )
        .unwrap();

        assert_eq!(
            compatible_keychain_account(&first).unwrap(),
            "compatible@https://example.com"
        );
        assert_eq!(
            compatible_keychain_account(&first).unwrap(),
            compatible_keychain_account(&same_origin).unwrap()
        );
        assert_ne!(
            compatible_keychain_account(&first).unwrap(),
            compatible_keychain_account(&other).unwrap()
        );
        assert_eq!(
            keychain_account(FreeChatBackend::Openai, None).unwrap(),
            "openai"
        );
        assert!(keychain_account(FreeChatBackend::Compatible, None).is_err());
    }

    #[test]
    fn compatible_dns_addresses_must_all_be_public_https_targets() {
        let public_v4 = SocketAddr::new(IpAddr::V4(Ipv4Addr::new(1, 1, 1, 1)), 443);
        let public_v6 = SocketAddr::new(IpAddr::V6("2606:4700:4700::1111".parse().unwrap()), 443);
        assert!(validate_resolved_remote_addresses(&[public_v4, public_v6]).is_ok());

        for forbidden in [
            SocketAddr::new(IpAddr::V4(Ipv4Addr::LOCALHOST), 443),
            SocketAddr::new(IpAddr::V4(Ipv4Addr::new(10, 0, 0, 1)), 443),
            SocketAddr::new(IpAddr::V4(Ipv4Addr::new(100, 64, 0, 1)), 443),
            SocketAddr::new(IpAddr::V4(Ipv4Addr::new(169, 254, 169, 254)), 443),
            SocketAddr::new(IpAddr::V6(Ipv6Addr::LOCALHOST), 443),
            SocketAddr::new(IpAddr::V6("fd00::1".parse().unwrap()), 443),
            SocketAddr::new(IpAddr::V6("::ffff:127.0.0.1".parse().unwrap()), 443),
            SocketAddr::new(public_v4.ip(), 8443),
        ] {
            assert!(
                validate_resolved_remote_addresses(&[forbidden]).is_err(),
                "{forbidden}"
            );
            assert!(
                validate_resolved_remote_addresses(&[public_v4, forbidden]).is_err(),
                "mixed result containing {forbidden}"
            );
        }
        assert!(validate_resolved_remote_addresses(&[]).is_err());

        let endpoint = remote_chat_endpoint(
            FreeChatBackend::Compatible,
            Some("https://example.com/v1/chat/completions"),
        )
        .unwrap();
        assert!(pinned_compatible_client(&endpoint, &[public_v4]).is_ok());
    }

    #[test]
    fn ollama_accepts_only_explicit_loopback_http_origins() {
        for safe in [
            "http://127.0.0.1:11434",
            "http://[::1]:11434",
            "http://127.0.0.1:23456/",
        ] {
            assert!(ollama_base_url(Some(safe)).is_ok(), "{safe}");
        }
        for unsafe_url in [
            "http://localhost:11434",
            "https://127.0.0.1:11434",
            "http://192.168.1.5:11434",
            "http://127.0.0.1:11434/api/chat",
            "http://127.0.0.1",
        ] {
            assert!(ollama_base_url(Some(unsafe_url)).is_err(), "{unsafe_url}");
        }
    }

    #[test]
    fn extracts_text_without_assuming_a_fixed_output_index() {
        let response = json!({
            "status": "completed",
            "model": "gpt-5.4-2026-08-01",
            "output": [
                { "type": "reasoning", "content": [] },
                { "type": "message", "content": [
                    { "type": "output_text", "text": "Bonjour" },
                    { "type": "output_text", "text": "Louis" }
                ] }
            ]
        });
        assert_eq!(
            extract_openai_response(&response).unwrap(),
            "Bonjour\nLouis"
        );
        assert_eq!(response_model(&response, "gpt-5.4"), "gpt-5.4-2026-08-01");

        let direct = json!({
            "status": "completed",
            "output_text": "Réponse directe",
            "output": []
        });
        assert_eq!(extract_openai_response(&direct).unwrap(), "Réponse directe");

        let failed = json!({
            "status": "failed",
            "error": { "message": "Quota épuisé" },
            "output": []
        });
        assert!(extract_openai_response(&failed)
            .unwrap_err()
            .contains("Quota épuisé"));

        let incomplete = json!({
            "status": "incomplete",
            "incomplete_details": { "reason": "max_output_tokens" },
            "output": []
        });
        assert!(extract_openai_response(&incomplete)
            .unwrap_err()
            .contains("max_output_tokens"));

        let completion = json!({
            "model": "kimi-k3-2026-07-15",
            "choices": [{ "message": {
                "content": "Réponse",
                "reasoning_content": "Raisonnement interne complet"
            }}]
        });
        assert_eq!(
            extract_chat_completion(&completion).as_deref(),
            Some("Réponse")
        );
        assert_eq!(
            extract_chat_reasoning_content(&completion).as_deref(),
            Some("Raisonnement interne complet")
        );
        assert_eq!(response_model(&completion, "kimi-k3"), "kimi-k3-2026-07-15");
        assert_eq!(
            response_model(&json!({ "model": "modèle invalide" }), "fallback"),
            "fallback"
        );
    }

    #[test]
    fn kimi_reasoning_is_forwarded_only_to_kimi() {
        let messages = [FreeChatMessage {
            role: FreeChatRole::Assistant,
            content: "Réponse".into(),
            reasoning_content: Some("Raisonnement complet".into()),
        }];
        assert_eq!(
            messages_json(&messages, FreeChatBackend::Kimi)[0]
                .get("reasoning_content")
                .and_then(Value::as_str),
            Some("Raisonnement complet")
        );
        assert!(messages_json(&messages, FreeChatBackend::Openai)[0]
            .get("reasoning_content")
            .is_none());
    }
}
