use chrono::DateTime;
use serde::{Deserialize, Serialize};
use std::{
    fs::{self, OpenOptions},
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
};
use tauri::{AppHandle, Manager, State, Url, Webview};

const ARCHIVE_SCHEMA_VERSION: u32 = 1;
const ARCHIVE_DIRECTORY: &str = "conversation-archives-v1";
const MAX_MESSAGES_PER_CAPTURE: usize = 10_000;
const MAX_MESSAGE_CONTENT_BYTES: usize = 2 * 1024 * 1024;
const MAX_CAPTURE_CONTENT_BYTES: usize = 16 * 1024 * 1024;
const MAX_ARCHIVE_FILE_BYTES: u64 = 32 * 1024 * 1024;
const MAX_ATTACHMENT_NAMES: usize = 100;
const MAX_ATTACHMENT_NAME_BYTES: usize = 512;
const UNVERIFIED_COMPLETE_DETAIL: &str =
    "Capture rétrogradée : aucune preuve native de couverture intégrale n’accompagne cette écriture.";
static ARCHIVE_OPERATION_LOCK: Mutex<()> = Mutex::new(());

pub(crate) type ArchiveResult<T> = Result<T, String>;

#[derive(Default)]
pub(crate) struct ConversationArchiveState {
    operation_lock: Arc<Mutex<()>>,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "lowercase")]
pub(crate) enum CaptureProvider {
    Chatgpt,
    Claude,
    Gemini,
    Mistral,
    Deepseek,
    Kimi,
}

impl CaptureProvider {
    fn directory_name(self) -> &'static str {
        match self {
            Self::Chatgpt => "chatgpt",
            Self::Claude => "claude",
            Self::Gemini => "gemini",
            Self::Mistral => "mistral",
            Self::Deepseek => "deepseek",
            Self::Kimi => "kimi",
        }
    }
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub(crate) enum CaptureStatus {
    Complete,
    Partial,
    Unavailable,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub(crate) enum MessageRole {
    User,
    Assistant,
    System,
    Tool,
}

#[derive(Clone, Copy, Debug, Default, Deserialize, Serialize, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "lowercase")]
pub(crate) enum CaptureMessageState {
    Partial,
    #[default]
    Final,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CaptureMessage {
    pub(crate) message_id: String,
    pub(crate) version: u32,
    pub(crate) position: u32,
    pub(crate) role: MessageRole,
    pub(crate) content: String,
    #[serde(default)]
    pub(crate) state: CaptureMessageState,
    pub(crate) captured_at: String,
    pub(crate) branch_id: Option<String>,
    pub(crate) attachment_names: Vec<String>,
}

impl CaptureMessage {
    fn same_observed_content(&self, other: &Self) -> bool {
        self.message_id == other.message_id
            && self.version == other.version
            && self.position == other.position
            && self.role == other.role
            && self.content == other.content
            && self.state == other.state
            && self.branch_id == other.branch_id
            && self.attachment_names == other.attachment_names
    }
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ConversationScope {
    pub(crate) account_id: String,
    pub(crate) formation_id: String,
    pub(crate) provider: CaptureProvider,
    pub(crate) conversation_id: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ConversationCaptureInput {
    pub(crate) account_id: String,
    pub(crate) formation_id: String,
    pub(crate) provider: CaptureProvider,
    pub(crate) conversation_id: String,
    pub(crate) source_url: String,
    pub(crate) status: CaptureStatus,
    pub(crate) status_detail: Option<String>,
    pub(crate) messages: Vec<CaptureMessage>,
}

impl ConversationCaptureInput {
    fn scope(&self) -> ArchiveResult<ConversationScope> {
        let scope = ConversationScope {
            account_id: self.account_id.clone(),
            formation_id: self.formation_id.clone(),
            provider: self.provider,
            conversation_id: self.conversation_id.clone(),
        };
        validate_scope(&scope)?;
        Ok(scope)
    }
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ConversationArchive {
    pub(crate) schema_version: u32,
    pub(crate) scope: ConversationScope,
    pub(crate) source_url: String,
    pub(crate) status: CaptureStatus,
    pub(crate) status_detail: Option<String>,
    pub(crate) messages: Vec<CaptureMessage>,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PersistCaptureResult {
    pub(crate) scope: ConversationScope,
    pub(crate) inserted_messages: usize,
    pub(crate) duplicate_messages: usize,
    pub(crate) total_messages: usize,
    pub(crate) status: CaptureStatus,
}

fn validate_identifier(value: &str, label: &str) -> ArchiveResult<()> {
    let valid = !value.is_empty()
        && value.len() <= 128
        && value.trim() == value
        && value.bytes().all(|byte| {
            byte.is_ascii_lowercase() || byte.is_ascii_digit() || matches!(byte, b'-' | b'_')
        });
    if valid {
        Ok(())
    } else {
        Err(format!(
            "{label} doit contenir 1 à 128 caractères ASCII minuscules parmi lettres, chiffres, - et _."
        ))
    }
}

fn validate_scope(scope: &ConversationScope) -> ArchiveResult<()> {
    super::local_auth::validate_account_id(&scope.account_id)?;
    validate_identifier(&scope.formation_id, "L’identifiant de formation")?;
    validate_identifier(&scope.conversation_id, "L’identifiant de conversation")
}

fn normalize_source_url(input: &ConversationCaptureInput) -> ArchiveResult<String> {
    let mut source = Url::parse(&input.source_url)
        .map_err(|error| format!("L’URL source de la conversation est invalide: {error}"))?;
    if source.scheme() != "https"
        || !source.username().is_empty()
        || source.password().is_some()
        || source.port().is_some_and(|port| port != 443)
    {
        return Err(
            "L’URL source doit être une URL HTTPS sans identifiants ni port non standard.".into(),
        );
    }
    let host = source
        .domain()
        .ok_or_else(|| "L’URL source doit contenir un domaine.".to_string())?;
    let expected_path = match input.provider {
        CaptureProvider::Chatgpt if host == "chatgpt.com" => {
            format!("/c/{}", input.conversation_id)
        }
        CaptureProvider::Claude if host == "claude.ai" => {
            format!("/chat/{}", input.conversation_id)
        }
        CaptureProvider::Gemini if host == "gemini.google.com" => {
            format!("/app/{}", input.conversation_id)
        }
        CaptureProvider::Mistral if host == "chat.mistral.ai" => {
            format!("/chat/{}", input.conversation_id)
        }
        CaptureProvider::Deepseek if host == "chat.deepseek.com" => {
            format!("/a/chat/s/{}", input.conversation_id)
        }
        CaptureProvider::Kimi if matches!(host, "kimi.com" | "www.kimi.com") => {
            source
                .set_host(Some("www.kimi.com"))
                .map_err(|_| "Impossible de normaliser le domaine Kimi.".to_string())?;
            format!("/chat/{}", input.conversation_id)
        }
        _ => {
            return Err("L’URL source ne correspond pas au fournisseur de la conversation.".into())
        }
    };
    if source.path().trim_end_matches('/') != expected_path {
        return Err("L’URL source ne correspond pas à l’identifiant de conversation.".into());
    }
    source.set_path(&expected_path);
    source.set_query(None);
    source.set_fragment(None);
    Ok(source.to_string().trim_end_matches('/').to_string())
}

pub(crate) fn validate_runtime_capture(input: &ConversationCaptureInput) -> ArchiveResult<()> {
    validate_capture(input).map(|_| ())
}

fn validate_capture(input: &ConversationCaptureInput) -> ArchiveResult<ConversationScope> {
    let scope = input.scope()?;
    if input.messages.len() > MAX_MESSAGES_PER_CAPTURE {
        return Err(format!(
            "Une capture ne peut pas contenir plus de {MAX_MESSAGES_PER_CAPTURE} messages."
        ));
    }
    let source = Url::parse(&input.source_url)
        .map_err(|error| format!("L’URL source de la conversation est invalide: {error}"))?;
    if source.scheme() != "https"
        || !source.username().is_empty()
        || source.password().is_some()
        || source.port().is_some_and(|port| port != 443)
        || source.domain().is_none()
    {
        return Err(
            "L’URL source doit être une URL HTTPS sans identifiants ni port non standard.".into(),
        );
    }
    match input.status {
        CaptureStatus::Complete if input.messages.is_empty() => {
            return Err("Une capture complète doit contenir au moins un message.".into())
        }
        CaptureStatus::Partial | CaptureStatus::Unavailable
            if input.status_detail.as_deref().is_none_or(str::is_empty) =>
        {
            return Err(
                "Une capture partielle ou indisponible doit expliquer précisément la limite."
                    .into(),
            )
        }
        _ => {}
    }
    if input.status_detail.as_ref().is_some_and(|detail| {
        detail.len() > 2_000 || detail.trim() != detail || detail.chars().any(char::is_control)
    }) {
        return Err(
            "Le détail de statut est vide, trop long ou contient un caractère interdit.".into(),
        );
    }
    let mut cumulative_content_bytes = 0usize;
    for message in &input.messages {
        validate_identifier(&message.message_id, "L’identifiant de message")?;
        if message.version == 0 {
            return Err("La version d’un message commence à 1.".into());
        }
        if message.content.len() > MAX_MESSAGE_CONTENT_BYTES {
            return Err(format!(
                "Le message {} dépasse la limite de 2 Mio.",
                message.message_id
            ));
        }
        cumulative_content_bytes = cumulative_content_bytes
            .checked_add(message.content.len())
            .ok_or_else(|| "Le quota cumulé de contenu de la capture est dépassé.".to_string())?;
        if cumulative_content_bytes > MAX_CAPTURE_CONTENT_BYTES {
            return Err(format!(
                "Le quota cumulé de contenu de la capture dépasse {} Mio.",
                MAX_CAPTURE_CONTENT_BYTES / (1024 * 1024)
            ));
        }
        DateTime::parse_from_rfc3339(&message.captured_at).map_err(|error| {
            format!(
                "L’horodatage du message {} n’est pas RFC 3339: {error}",
                message.message_id
            )
        })?;
        if let Some(branch_id) = message.branch_id.as_deref() {
            validate_identifier(branch_id, "L’identifiant de branche")?;
        }
        if message.attachment_names.len() > MAX_ATTACHMENT_NAMES {
            return Err(format!(
                "Le message {} référence trop de pièces jointes.",
                message.message_id
            ));
        }
        for name in &message.attachment_names {
            if name.is_empty()
                || name.len() > MAX_ATTACHMENT_NAME_BYTES
                || name.trim() != name
                || name
                    .chars()
                    .any(|character| character == '\0' || character.is_control())
            {
                return Err("Un nom de pièce jointe est vide, trop long ou mal formé.".into());
            }
        }
    }
    Ok(scope)
}

fn archive_path(root: &Path, scope: &ConversationScope) -> ArchiveResult<PathBuf> {
    validate_scope(scope)?;
    Ok(root
        .join(ARCHIVE_DIRECTORY)
        .join("accounts")
        .join(&scope.account_id)
        .join("formations")
        .join(&scope.formation_id)
        .join(scope.provider.directory_name())
        .join(format!("{}.json", scope.conversation_id)))
}
pub(crate) fn sync_archive_scopes(
    root: &Path,
    account_id: &str,
    formation_id: &str,
) -> ArchiveResult<Vec<ConversationScope>> {
    let mut scopes = Vec::new();
    for provider in [
        CaptureProvider::Chatgpt,
        CaptureProvider::Claude,
        CaptureProvider::Gemini,
        CaptureProvider::Mistral,
        CaptureProvider::Deepseek,
        CaptureProvider::Kimi,
    ] {
        let probe = ConversationScope {
            account_id: account_id.into(),
            formation_id: formation_id.into(),
            provider,
            conversation_id: "probe".into(),
        };
        let path = archive_path(root, &probe)?;
        ensure_archive_path(root, &path, false)?;
        let parent = path.parent().ok_or("Dossier invalide.")?;
        if !parent.exists() {
            continue;
        }
        for entry in fs::read_dir(parent).map_err(|_| "Archives illisibles.")? {
            let entry = entry.map_err(|_| "Archive illisible.")?;
            if entry.path().extension().and_then(|s| s.to_str()) != Some("json") {
                continue;
            }
            let name = entry
                .path()
                .file_stem()
                .and_then(|s| s.to_str())
                .ok_or("Identifiant archive invalide.")?
                .to_owned();
            let scope = ConversationScope {
                conversation_id: name,
                ..probe.clone()
            };
            validate_scope(&scope)?;
            ensure_archive_path(root, &archive_path(root, &scope)?, false)?;
            scopes.push(scope);
            if scopes.len() > 10000 {
                return Err("Trop d'archives dans cette année.".into());
            }
        }
    }
    Ok(scopes)
}
pub(crate) fn sync_archive_bytes(root: &Path, scope: &ConversationScope) -> ArchiveResult<Vec<u8>> {
    serde_json::to_vec(&read_archive(root, scope)?).map_err(|_| "Archive invalide.".into())
}
pub(crate) fn sync_archive_exists(root: &Path, scope: &ConversationScope) -> ArchiveResult<bool> {
    let path = archive_path(root, scope)?;
    ensure_archive_path(root, &path, false)?;
    Ok(checked_metadata(&path)?.is_some())
}
pub(crate) fn sync_delete_archive(
    root: &Path,
    scope: &ConversationScope,
    expected: &str,
) -> ArchiveResult<()> {
    use sha2::{Digest, Sha256};
    let _guard = transaction_lock(root)?;
    if format!("{:x}", Sha256::digest(sync_archive_bytes(root, scope)?)) != expected {
        return Err("L'archive a changé ; suppression suspendue.".into());
    }
    fs::remove_file(archive_path(root, scope)?)
        .map_err(|_| "Suppression archive impossible.".into())
}
pub(crate) fn sync_import_archive(
    root: &Path,
    scope: &ConversationScope,
    bytes: &[u8],
) -> ArchiveResult<()> {
    if bytes.len() as u64 > MAX_ARCHIVE_FILE_BYTES {
        return Err("Archive trop volumineuse.".into());
    }
    let archive: ConversationArchive =
        serde_json::from_slice(bytes).map_err(|_| "Archive invalide.")?;
    if archive.schema_version != ARCHIVE_SCHEMA_VERSION
        || archive.scope.provider != scope.provider
        || archive.scope.conversation_id != scope.conversation_id
    {
        return Err("Identité de l'archive incompatible.".into());
    }
    let mut batch = Vec::new();
    let mut size = 0;
    let save = |messages| {
        persist_capture(
            root,
            ConversationCaptureInput {
                account_id: scope.account_id.clone(),
                formation_id: scope.formation_id.clone(),
                provider: scope.provider,
                conversation_id: scope.conversation_id.clone(),
                source_url: archive.source_url.clone(),
                status: archive.status,
                status_detail: archive.status_detail.clone(),
                messages,
            },
        )
        .map(|_| ())
    };
    for message in archive.messages {
        if !batch.is_empty()
            && (size + message.content.len() > MAX_CAPTURE_CONTENT_BYTES
                || batch.len() >= MAX_MESSAGES_PER_CAPTURE)
        {
            save(std::mem::take(&mut batch))?;
            size = 0;
        }
        size += message.content.len();
        batch.push(message);
    }
    save(batch)
}

// Every component below the application-owned root must be a real local path.
fn checked_metadata(path: &Path) -> ArchiveResult<Option<fs::Metadata>> {
    match fs::symlink_metadata(path) {
        Ok(metadata) => {
            #[cfg(windows)]
            let reparse = {
                use std::os::windows::fs::MetadataExt;
                metadata.file_attributes() & 0x400 != 0
            };
            #[cfg(not(windows))]
            let reparse = false;
            if metadata.file_type().is_symlink() || reparse {
                return Err("Un lien ou reparse point est interdit dans les archives.".into());
            }
            Ok(Some(metadata))
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(format!("Vérification du stockage impossible: {error}")),
    }
}

fn ensure_archive_path(root: &Path, path: &Path, create: bool) -> ArchiveResult<()> {
    let relative = path
        .strip_prefix(root)
        .map_err(|_| "Chemin hors du stockage de l'application.")?;
    if checked_metadata(root)?.is_none() && create {
        fs::create_dir_all(root).map_err(|error| error.to_string())?;
    }
    if checked_metadata(root)?.is_some_and(|metadata| !metadata.is_dir()) {
        return Err("La racine du stockage n'est pas un répertoire.".into());
    }
    let components: Vec<_> = relative.components().collect();
    let mut current = root.to_path_buf();
    for (index, component) in components.iter().enumerate() {
        if !matches!(component, std::path::Component::Normal(_)) {
            return Err("Composant de chemin interdit.".into());
        }
        current.push(component.as_os_str());
        let is_parent = index + 1 < components.len();
        if checked_metadata(&current)?.is_none() && create && is_parent {
            let builder = fs::DirBuilder::new();
            #[cfg(unix)]
            let mut builder = builder;
            #[cfg(unix)]
            {
                use std::os::unix::fs::DirBuilderExt;
                builder.mode(0o700);
            }
            if let Err(error) = builder.create(&current) {
                if error.kind() != std::io::ErrorKind::AlreadyExists {
                    return Err(error.to_string());
                }
            }
        }
        if let Some(metadata) = checked_metadata(&current)? {
            if (is_parent && !metadata.is_dir()) || (!is_parent && !metadata.is_file()) {
                return Err("Le stockage contient un type de fichier inattendu.".into());
            }
        }
    }
    Ok(())
}

fn transaction_lock(root: &Path) -> ArchiveResult<fs::File> {
    let path = root.join(ARCHIVE_DIRECTORY).join(".transaction.lock");
    ensure_archive_path(root, &path, true)?;
    let mut options = OpenOptions::new();
    options.read(true).write(true).create(true).truncate(false);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let lock = options
        .open(path)
        .map_err(|error| format!("Verrou archive: {error}"))?;
    lock.lock()
        .map_err(|error| format!("Verrou interprocessus: {error}"))?;
    Ok(lock)
}

fn read_archive(root: &Path, scope: &ConversationScope) -> ArchiveResult<ConversationArchive> {
    let path = archive_path(root, scope)?;
    ensure_archive_path(root, &path, false)?;
    let size = fs::metadata(&path)
        .map_err(|error| format!("Impossible de vérifier l’archive de conversation: {error}"))?
        .len();
    if size > MAX_ARCHIVE_FILE_BYTES {
        return Err(format!(
            "L’archive dépasse le quota de lecture de {} Mio.",
            MAX_ARCHIVE_FILE_BYTES / (1024 * 1024)
        ));
    }
    let file = fs::File::open(&path)
        .map_err(|error| format!("Impossible de lire l’archive de conversation: {error}"))?;
    let mut bytes = Vec::new();
    file.take(MAX_ARCHIVE_FILE_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|error| format!("Lecture archive: {error}"))?;
    if bytes.len() as u64 > MAX_ARCHIVE_FILE_BYTES {
        return Err("Quota de lecture dépassé.".into());
    }
    let mut archive: ConversationArchive = serde_json::from_slice(&bytes)
        .map_err(|error| format!("L’archive de conversation est invalide: {error}"))?;
    if archive.schema_version != ARCHIVE_SCHEMA_VERSION || archive.scope != *scope {
        return Err(
            "L’archive de conversation ne correspond pas au schéma ou à l’espace demandé.".into(),
        );
    }
    if archive.status == CaptureStatus::Complete {
        archive.status = CaptureStatus::Partial;
        archive.status_detail = Some(UNVERIFIED_COMPLETE_DETAIL.into());
    }
    Ok(archive)
}

fn write_archive(root: &Path, archive: &ConversationArchive) -> ArchiveResult<()> {
    let destination = archive_path(root, &archive.scope)?;
    let _parent = destination
        .parent()
        .ok_or_else(|| "Le dossier de l’archive est invalide.".to_string())?;
    ensure_archive_path(root, &destination, true)?;
    let staging = destination.with_extension(format!(
        "json.{}.{}.tmp",
        std::process::id(),
        rand::random::<u64>()
    ));
    let content = serde_json::to_vec_pretty(archive)
        .map_err(|error| format!("Impossible de sérialiser l’archive: {error}"))?;
    if content.len() as u64 > MAX_ARCHIVE_FILE_BYTES {
        return Err(format!(
            "L’archive dépasse le quota d’écriture de {} Mio.",
            MAX_ARCHIVE_FILE_BYTES / (1024 * 1024)
        ));
    }
    let write_result = (|| -> ArchiveResult<()> {
        let mut options = OpenOptions::new();
        options.create_new(true).write(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let mut file = options
            .open(&staging)
            .map_err(|error| format!("Impossible de préparer la transaction d’archive: {error}"))?;
        file.write_all(&content)
            .and_then(|_| file.sync_all())
            .map_err(|error| {
                format!("Impossible de finaliser la transaction d’archive: {error}")
            })?;
        drop(file);
        ensure_archive_path(root, &destination, false)?;
        super::replace_file_atomically(&staging, &destination).map_err(|error| {
            format!("Impossible d’installer l’archive de conversation: {error}")
        })?;
        #[cfg(unix)]
        fs::File::open(_parent)
            .and_then(|file| file.sync_all())
            .map_err(|error| error.to_string())?;
        Ok(())
    })();
    if write_result.is_err() {
        let _ = fs::remove_file(&staging);
    }
    write_result
}

fn persist_capture_unlocked(
    root: &Path,
    mut input: ConversationCaptureInput,
    normalize_versions: bool,
) -> ArchiveResult<PersistCaptureResult> {
    input.source_url = normalize_source_url(&input)?;
    if input.status == CaptureStatus::Complete {
        input.status = CaptureStatus::Partial;
        input.status_detail = Some(UNVERIFIED_COMPLETE_DETAIL.into());
    }
    let scope = validate_capture(&input)?;
    let path = archive_path(root, &scope)?;
    ensure_archive_path(root, &path, true)?;
    let mut archive = if path.exists() {
        read_archive(root, &scope)?
    } else {
        ConversationArchive {
            schema_version: ARCHIVE_SCHEMA_VERSION,
            scope: scope.clone(),
            source_url: input.source_url.clone(),
            status: input.status,
            status_detail: input.status_detail.clone(),
            messages: Vec::new(),
        }
    };
    if archive.source_url != input.source_url {
        return Err("La même conversation ne peut pas changer d’URL source normalisée.".into());
    }

    let mut inserted_messages = 0;
    let mut duplicate_messages = 0;
    for mut incoming in input.messages {
        if normalize_versions {
            let existing = archive.messages.iter().find(|message| {
                message.message_id == incoming.message_id
                    && message.role == incoming.role
                    && message.content == incoming.content
                    && message.state == incoming.state
                    && message.branch_id == incoming.branch_id
                    && message.attachment_names == incoming.attachment_names
            });
            if existing.is_some() {
                duplicate_messages += 1;
                continue;
            }
            incoming.version = archive
                .messages
                .iter()
                .filter(|message| message.message_id == incoming.message_id)
                .map(|message| message.version)
                .max()
                .unwrap_or(0)
                .checked_add(1)
                .ok_or_else(|| "Limite des versions atteinte.".to_string())?;
        }
        let same_version = |message: &&CaptureMessage| {
            message.message_id == incoming.message_id && message.version == incoming.version
        };
        if archive
            .messages
            .iter()
            .filter(same_version)
            .any(|existing| existing.same_observed_content(&incoming))
        {
            duplicate_messages += 1;
            continue;
        }
        if incoming.state == CaptureMessageState::Final
            && archive
                .messages
                .iter()
                .filter(same_version)
                .any(|existing| existing.state == CaptureMessageState::Final)
        {
            return Err(format!(
                "Le message {} version {} existe déjà avec un contenu différent.",
                incoming.message_id, incoming.version
            ));
        }
        archive.messages.push(incoming);
        inserted_messages += 1;
    }
    archive.messages.sort_by(|left, right| {
        left.position
            .cmp(&right.position)
            .then_with(|| left.message_id.cmp(&right.message_id))
            .then_with(|| left.version.cmp(&right.version))
            .then_with(|| left.state.cmp(&right.state))
    });
    archive.status = input.status;
    archive.status_detail = input.status_detail;
    write_archive(root, &archive)?;

    Ok(PersistCaptureResult {
        scope,
        inserted_messages,
        duplicate_messages,
        total_messages: archive.messages.len(),
        status: archive.status,
    })
}

fn persist_capture(
    root: &Path,
    input: ConversationCaptureInput,
) -> ArchiveResult<PersistCaptureResult> {
    let _guard = ARCHIVE_OPERATION_LOCK
        .lock()
        .map_err(|_| "Le stockage des conversations est momentanément indisponible.".to_string())?;
    let _process_guard = transaction_lock(root)?;
    persist_capture_unlocked(root, input, false)
}

fn delete_archive(root: &Path, scope: &ConversationScope) -> ArchiveResult<bool> {
    let _process_guard = transaction_lock(root)?;
    let path = archive_path(root, scope)?;
    ensure_archive_path(root, &path, false)?;
    match fs::symlink_metadata(&path) {
        Ok(metadata) => {
            if metadata.file_type().is_symlink() || !metadata.file_type().is_file() {
                return Err("L’archive demandée n’est pas un fichier local régulier.".into());
            }
            fs::remove_file(path)
                .map_err(|error| format!("Impossible de supprimer l’archive: {error}"))?;
            Ok(true)
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(false),
        Err(error) => Err(format!("Impossible de vérifier l’archive: {error}")),
    }
}

fn app_data_dir(caller: &Webview) -> ArchiveResult<PathBuf> {
    caller
        .app_handle()
        .path()
        .app_data_dir()
        .map_err(|error| format!("Impossible de localiser les données de l’application: {error}"))
}

pub(crate) fn persist_runtime_capture(
    app: &AppHandle,
    input: ConversationCaptureInput,
) -> ArchiveResult<PersistCaptureResult> {
    let auth_state = app.state::<super::local_auth::LocalAuthState>();
    auth_state.require_active_account(&input.account_id)?;
    let root = app.path().app_data_dir().map_err(|error| {
        format!("Impossible de localiser les données de l’application: {error}")
    })?;
    let archive_state = app.state::<ConversationArchiveState>();
    let _guard = archive_state
        .operation_lock
        .lock()
        .map_err(|_| "Le stockage des conversations est momentanément indisponible.".to_string())?;
    // The account may have changed while this worker waited for the archive lock.
    auth_state.require_active_account(&input.account_id)?;
    let _global_guard = ARCHIVE_OPERATION_LOCK
        .lock()
        .map_err(|_| "Archive indisponible.".to_string())?;
    let _process_guard = transaction_lock(&root)?;
    auth_state.require_active_account(&input.account_id)?;
    let saved = persist_capture_unlocked(&root, input.clone(), true)?;
    
    Ok(saved)
}

#[tauri::command]
pub(crate) fn persist_conversation_capture(
    caller: Webview,
    auth_state: State<'_, super::local_auth::LocalAuthState>,
    archive_state: State<'_, ConversationArchiveState>,
    input: ConversationCaptureInput,
) -> ArchiveResult<PersistCaptureResult> {
    super::require_main_caller(&caller)?;
    auth_state.require_active_account(&input.account_id)?;
    let root = app_data_dir(&caller)?;
    let _guard = archive_state
        .operation_lock
        .lock()
        .map_err(|_| "Le stockage des conversations est momentanément indisponible.".to_string())?;
    persist_capture(&root, input)
}

#[tauri::command]
pub(crate) fn read_conversation_archive(
    caller: Webview,
    auth_state: State<'_, super::local_auth::LocalAuthState>,
    archive_state: State<'_, ConversationArchiveState>,
    scope: ConversationScope,
) -> ArchiveResult<ConversationArchive> {
    super::require_main_caller(&caller)?;
    auth_state.require_active_account(&scope.account_id)?;
    let root = app_data_dir(&caller)?;
    let _guard = archive_state
        .operation_lock
        .lock()
        .map_err(|_| "Le stockage des conversations est momentanément indisponible.".to_string())?;
    read_archive(&root, &scope)
}

#[tauri::command]
pub(crate) fn delete_conversation_archive(
    caller: Webview,
    auth_state: State<'_, super::local_auth::LocalAuthState>,
    archive_state: State<'_, ConversationArchiveState>,
    scope: ConversationScope,
) -> ArchiveResult<bool> {
    super::require_main_caller(&caller)?;
    auth_state.require_active_account(&scope.account_id)?;
    let root = app_data_dir(&caller)?;
    let _guard = archive_state
        .operation_lock
        .lock()
        .map_err(|_| "Le stockage des conversations est momentanément indisponible.".to_string())?;
    delete_archive(&root, &scope)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        fs,
        path::PathBuf,
        sync::{
            atomic::{AtomicU64, Ordering},
            Arc, Barrier,
        },
        thread,
    };

    static TEMP_COUNTER: AtomicU64 = AtomicU64::new(0);

    fn temp_root(label: &str) -> PathBuf {
        let sequence = TEMP_COUNTER.fetch_add(1, Ordering::Relaxed);
        let root = std::env::temp_dir().join(format!(
            "dowze-conversation-archive-{label}-{}-{sequence}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).expect("create temp archive root");
        root
    }

    fn message(message_id: &str, version: u32, position: u32, content: &str) -> CaptureMessage {
        CaptureMessage {
            message_id: message_id.into(),
            version,
            position,
            role: MessageRole::Assistant,
            content: content.into(),
            state: CaptureMessageState::Final,
            captured_at: "2026-09-21T12:00:00Z".into(),
            branch_id: None,
            attachment_names: Vec::new(),
        }
    }

    fn input(messages: Vec<CaptureMessage>, status: CaptureStatus) -> ConversationCaptureInput {
        ConversationCaptureInput {
            account_id: "0123456789abcdef0123456789abcdef".into(),
            formation_id: "annee-1-2026-2027".into(),
            provider: CaptureProvider::Chatgpt,
            conversation_id: "synthetic-long-chat".into(),
            source_url: "https://chatgpt.com/c/synthetic-long-chat".into(),
            status,
            status_detail: None,
            messages,
        }
    }

    #[test]
    fn runtime_versions_survive_document_reload_and_replayed_history() {
        let root = temp_root("runtime-versions");
        let first = input(
            vec![message("m-1", 1, 1, "initial")],
            CaptureStatus::Complete,
        );
        let scope = persist_capture_unlocked(&root, first.clone(), true)
            .unwrap()
            .scope;
        let replay = persist_capture_unlocked(&root, first, true).unwrap();
        assert_eq!(replay.duplicate_messages, 1);
        let changed = input(
            vec![message("m-1", 1, 1, "revised after reload")],
            CaptureStatus::Complete,
        );
        persist_capture_unlocked(&root, changed, true).unwrap();
        let stored = read_archive(&root, &scope).unwrap();
        assert_eq!(stored.messages.len(), 2);
        assert_eq!(stored.messages[0].version, 1);
        assert_eq!(stored.messages[1].version, 2);
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn synchronized_archive_restores_all_versions_in_another_local_scope() {
        let root = temp_root("synchronized-archive");
        let mut original = input(
            vec![
                message("m-1", 1, 0, "première version"),
                message("m-1", 2, 0, "version finale"),
            ],
            CaptureStatus::Partial,
        );
        original.status_detail = Some("Données synthétiques de qualification.".into());
        let source = original.scope().unwrap();
        persist_capture(&root, original).unwrap();
        let data = sync_archive_bytes(&root, &source).unwrap();
        let target = ConversationScope {
            account_id: "fedcba9876543210fedcba9876543210".into(),
            formation_id: "another-local-year".into(),
            ..source.clone()
        };
        sync_import_archive(&root, &target, &data).unwrap();
        sync_import_archive(&root, &target, &data).unwrap();
        assert_eq!(read_archive(&root, &target).unwrap().messages.len(), 2);
        assert_eq!(read_archive(&root, &source).unwrap().messages.len(), 2);
        assert_eq!(
            sync_archive_scopes(&root, &target.account_id, &target.formation_id).unwrap(),
            vec![target]
        );
        let invalid = ConversationScope {
            conversation_id: "another-chat".into(),
            ..source
        };
        assert!(sync_import_archive(&root, &invalid, &data).is_err());
        fs::remove_dir_all(root).unwrap();
    }

    #[cfg(unix)]
    fn create_directory_link(target: &Path, link: &Path) -> std::io::Result<()> {
        std::os::unix::fs::symlink(target, link)
    }

    #[cfg(target_os = "windows")]
    fn create_directory_link(target: &Path, link: &Path) -> std::io::Result<()> {
        let output = std::process::Command::new("cmd")
            .args(["/c", "mklink", "/J"])
            .arg(link)
            .arg(target)
            .output()?;
        if output.status.success() {
            Ok(())
        } else {
            Err(std::io::Error::other(
                String::from_utf8_lossy(&output.stderr).into_owned(),
            ))
        }
    }

    #[test]
    fn repeated_capture_is_idempotent() {
        let root = temp_root("idempotent");
        let first = persist_capture(
            &root,
            input(
                vec![message("m-1", 1, 0, "bonjour")],
                CaptureStatus::Complete,
            ),
        )
        .expect("first capture");
        let mut observed_later = message("m-1", 1, 0, "bonjour");
        observed_later.captured_at = "2026-09-21T13:00:00Z".into();
        let second = persist_capture(&root, input(vec![observed_later], CaptureStatus::Complete))
            .expect("repeated capture at a later observation time");

        assert_eq!(first.inserted_messages, 1);
        assert_eq!(second.inserted_messages, 0);
        assert_eq!(second.duplicate_messages, 1);
        let archive = read_archive(&root, &second.scope).expect("read archive");
        assert_eq!(archive.messages.len(), 1);
        assert_eq!(archive.messages[0].captured_at, "2026-09-21T12:00:00Z");
        fs::remove_dir_all(root).expect("cleanup");
    }

    #[test]
    fn caller_complete_without_native_coverage_is_downgraded() {
        let root = temp_root("unproved-complete");
        let result = persist_capture(
            &root,
            input(
                vec![message("m-1", 1, 0, "réponse")],
                CaptureStatus::Complete,
            ),
        )
        .expect("persist unproved complete capture");
        let archive = read_archive(&root, &result.scope).expect("read downgraded archive");

        assert_eq!(result.status, CaptureStatus::Partial);
        assert_eq!(archive.status, CaptureStatus::Partial);
        assert!(archive
            .status_detail
            .as_deref()
            .is_some_and(|detail| detail.contains("preuve native")));
        fs::remove_dir_all(root).expect("cleanup");
    }

    #[test]
    fn partial_stream_snapshots_are_kept_when_the_final_version_arrives() {
        let root = temp_root("partial-final");
        let mut partial_message = message("m-1", 1, 0, "Bon");
        partial_message.state = CaptureMessageState::Partial;
        let mut partial_input = input(vec![partial_message], CaptureStatus::Partial);
        partial_input.status_detail = Some("Flux encore ouvert.".into());
        persist_capture(&root, partial_input).expect("persist partial snapshot");

        let final_result = persist_capture(
            &root,
            input(
                vec![message("m-1", 1, 0, "Bonjour")],
                CaptureStatus::Complete,
            ),
        )
        .expect("persist final version");
        let archive = read_archive(&root, &final_result.scope).expect("read stream archive");

        assert_eq!(archive.messages.len(), 2);
        assert_eq!(archive.messages[0].state, CaptureMessageState::Partial);
        assert_eq!(archive.messages[0].content, "Bon");
        assert_eq!(archive.messages[1].state, CaptureMessageState::Final);
        assert_eq!(archive.messages[1].content, "Bonjour");
        fs::remove_dir_all(root).expect("cleanup");
    }

    #[test]
    fn concurrent_writers_merge_without_lost_messages_or_staging_collisions() {
        let root = temp_root("concurrent");
        let barrier = Arc::new(Barrier::new(12));
        let handles = (0..12)
            .map(|index| {
                let root = root.clone();
                let barrier = Arc::clone(&barrier);
                thread::spawn(move || {
                    barrier.wait();
                    persist_capture(
                        &root,
                        input(
                            vec![message(
                                &format!("m-{index}"),
                                1,
                                index,
                                &format!("contenu {index}"),
                            )],
                            CaptureStatus::Complete,
                        ),
                    )
                })
            })
            .collect::<Vec<_>>();

        for handle in handles {
            handle
                .join()
                .expect("writer thread")
                .expect("concurrent capture");
        }
        let scope = input(Vec::new(), CaptureStatus::Unavailable)
            .scope()
            .expect("scope");
        let archive = read_archive(&root, &scope).expect("read merged archive");
        assert_eq!(archive.messages.len(), 12);
        fs::remove_dir_all(root).expect("cleanup");
    }

    #[test]
    fn capture_rejects_cumulative_content_above_the_write_quota() {
        let root = temp_root("write-quota");
        let content = "x".repeat(MAX_MESSAGE_CONTENT_BYTES);
        let messages = (0..9)
            .map(|index| message(&format!("m-{index}"), 1, index, &content))
            .collect();

        let error = persist_capture(&root, input(messages, CaptureStatus::Complete))
            .expect_err("cumulative quota must reject the capture");

        assert!(error.contains("quota cumulé"));
        fs::remove_dir_all(root).expect("cleanup");
    }

    #[test]
    fn oversized_archive_is_rejected_before_reading_its_payload() {
        let root = temp_root("read-quota");
        let result = persist_capture(
            &root,
            input(vec![message("m-1", 1, 0, "petit")], CaptureStatus::Complete),
        )
        .expect("seed archive");
        let path = archive_path(&root, &result.scope).expect("archive path");
        OpenOptions::new()
            .write(true)
            .truncate(true)
            .open(&path)
            .expect("open oversized fixture")
            .set_len(MAX_ARCHIVE_FILE_BYTES + 1)
            .expect("size oversized fixture");

        let error = read_archive(&root, &result.scope).expect_err("read quota must reject file");

        assert!(error.contains("quota de lecture"));
        fs::remove_dir_all(root).expect("cleanup");
    }

    #[test]
    fn archive_directory_links_and_windows_reparse_points_are_rejected() {
        let root = temp_root("directory-link");
        let outside = root.with_extension("outside-dir");
        fs::create_dir_all(&outside).expect("create outside directory");
        let archive_root = root.join(ARCHIVE_DIRECTORY);
        fs::create_dir_all(&archive_root).expect("create archive root");
        let accounts = archive_root.join("accounts");
        create_directory_link(&outside, &accounts).expect("create archive directory link fixture");

        let error = persist_capture(
            &root,
            input(vec![message("m-1", 1, 0, "privé")], CaptureStatus::Complete),
        )
        .expect_err("linked archive directory must be rejected");

        assert!(error.contains("lien") || error.contains("reparse"));
        #[cfg(windows)]
        fs::remove_dir(&accounts).expect("remove directory link");
        #[cfg(unix)]
        fs::remove_file(&accounts).expect("remove directory link");
        fs::remove_dir_all(outside).expect("remove outside directory");
        fs::remove_dir_all(root).expect("cleanup");
    }

    #[test]
    fn same_message_version_with_different_content_is_rejected() {
        let root = temp_root("conflict");
        let stored = input(
            vec![message("m-1", 1, 0, "version initiale")],
            CaptureStatus::Complete,
        );
        let scope = stored.scope().expect("scope");
        persist_capture(&root, stored).expect("first capture");

        let error = persist_capture(
            &root,
            input(
                vec![message("m-1", 1, 0, "contenu remplacé")],
                CaptureStatus::Complete,
            ),
        )
        .expect_err("conflicting capture must fail");

        assert!(error.contains("existe déjà avec un contenu différent"));
        assert_eq!(
            read_archive(&root, &scope).expect("read archive").messages[0].content,
            "version initiale"
        );
        fs::remove_dir_all(root).expect("cleanup");
    }

    #[test]
    fn account_and_formation_scopes_are_physically_isolated() {
        let root = temp_root("isolation");
        let first = input(vec![message("m-1", 1, 0, "A")], CaptureStatus::Complete);
        let mut second = input(vec![message("m-1", 1, 0, "B")], CaptureStatus::Complete);
        second.formation_id = "annee-2-2027-2028".into();
        let first_scope = first.scope().expect("first scope");
        let second_scope = second.scope().expect("second scope");

        persist_capture(&root, first).expect("first capture");
        persist_capture(&root, second).expect("second capture");

        assert_ne!(
            archive_path(&root, &first_scope).expect("first path"),
            archive_path(&root, &second_scope).expect("second path")
        );
        assert_eq!(
            read_archive(&root, &first_scope)
                .expect("first archive")
                .messages[0]
                .content,
            "A"
        );
        assert_eq!(
            read_archive(&root, &second_scope)
                .expect("second archive")
                .messages[0]
                .content,
            "B"
        );
        fs::remove_dir_all(root).expect("cleanup");
    }

    #[test]
    fn long_virtualized_history_preserves_positions_branches_and_versions() {
        let root = temp_root("long");
        let mut messages = (0..250)
            .map(|position| {
                message(
                    &format!("m-{position:03}"),
                    1,
                    position,
                    &format!("contenu {position}"),
                )
            })
            .collect::<Vec<_>>();
        messages[120].branch_id = Some("branche-b".into());
        messages.push(message("m-120", 2, 120, "réponse régénérée"));

        let result =
            persist_capture(&root, input(messages, CaptureStatus::Complete)).expect("long capture");
        let archive = read_archive(&root, &result.scope).expect("read long archive");

        assert_eq!(archive.messages.len(), 251);
        assert_eq!(
            archive.messages[120].branch_id.as_deref(),
            Some("branche-b")
        );
        assert_eq!(
            archive
                .messages
                .iter()
                .filter(|item| item.message_id == "m-120")
                .count(),
            2
        );
        assert_eq!(archive.status, CaptureStatus::Partial);
        fs::remove_dir_all(root).expect("cleanup");
    }

    #[test]
    fn stale_transaction_file_does_not_replace_last_complete_archive() {
        let root = temp_root("recovery");
        let result = persist_capture(
            &root,
            input(
                vec![message("m-1", 1, 0, "durable")],
                CaptureStatus::Complete,
            ),
        )
        .expect("first capture");
        let path = archive_path(&root, &result.scope).expect("archive path");
        let staging = path.with_extension("json.tmp");
        fs::write(&staging, b"{broken").expect("write simulated interrupted transaction");

        let archive = read_archive(&root, &result.scope).expect("read durable archive");

        assert_eq!(archive.messages[0].content, "durable");
        assert!(staging.exists());
        fs::remove_dir_all(root).expect("cleanup");
    }

    #[test]
    fn deleting_one_scope_preserves_other_formations() {
        let root = temp_root("delete-one");
        let first = input(vec![message("m-1", 1, 0, "A")], CaptureStatus::Complete);
        let first_scope = first.scope().expect("first scope");
        let mut second = input(vec![message("m-1", 1, 0, "B")], CaptureStatus::Complete);
        second.formation_id = "annee-2-2027-2028".into();
        let second_scope = second.scope().expect("second scope");
        persist_capture(&root, first).expect("first capture");
        persist_capture(&root, second).expect("second capture");

        assert!(delete_archive(&root, &first_scope).expect("delete first"));
        assert!(read_archive(&root, &first_scope).is_err());
        assert_eq!(
            read_archive(&root, &second_scope)
                .expect("second archive")
                .messages[0]
                .content,
            "B"
        );
        assert!(!delete_archive(&root, &first_scope).expect("repeat delete"));
        fs::remove_dir_all(root).expect("cleanup");
    }

    #[test]
    fn source_url_is_normalized_and_must_match_the_provider() {
        let root = temp_root("source-url");
        let mut capture = input(
            vec![message("m-1", 1, 0, "réponse")],
            CaptureStatus::Complete,
        );
        capture.source_url =
            "https://chatgpt.com/c/synthetic-long-chat?utm_source=test#answer".into();
        let result = persist_capture(&root, capture).expect("normalized capture");
        assert_eq!(
            read_archive(&root, &result.scope)
                .expect("archive")
                .source_url,
            "https://chatgpt.com/c/synthetic-long-chat"
        );

        let mut mismatch = input(
            vec![message("m-2", 1, 1, "mauvais fournisseur")],
            CaptureStatus::Complete,
        );
        mismatch.conversation_id = "autre-chat".into();
        mismatch.source_url = "https://claude.ai/chat/autre-chat".into();
        assert!(persist_capture(&root, mismatch)
            .expect_err("provider mismatch")
            .contains("ne correspond pas au fournisseur"));
        fs::remove_dir_all(root).expect("cleanup");
    }
    #[test]
    fn legacy_message_state_is_read_without_rewriting_original_file() {
        let root = temp_root("legacy-read");
        let result = persist_capture(
            &root,
            input(
                vec![message("m-1", 1, 0, "legacy")],
                CaptureStatus::Complete,
            ),
        )
        .unwrap();
        let path = archive_path(&root, &result.scope).unwrap();
        let mut value: serde_json::Value =
            serde_json::from_slice(&fs::read(&path).unwrap()).unwrap();
        value["messages"][0]
            .as_object_mut()
            .unwrap()
            .remove("state");
        value["status"] = serde_json::json!("complete");
        let original = serde_json::to_vec(&value).unwrap();
        fs::write(&path, &original).unwrap();
        let archive = read_archive(&root, &result.scope).unwrap();
        assert_eq!(archive.messages[0].state, CaptureMessageState::Final);
        assert_eq!(archive.status, CaptureStatus::Partial);
        assert_eq!(fs::read(path).unwrap(), original);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn subprocess_archive_writer_helper() {
        let Some(root) = std::env::var_os("DOWZE_ARCHIVE_TEST_CHILD_ROOT") else {
            return;
        };
        let index = std::env::var("DOWZE_ARCHIVE_TEST_CHILD_INDEX").unwrap();
        for iteration in 0..4 {
            persist_capture(
                Path::new(&root),
                input(
                    vec![message(
                        &format!("process-{index}-{iteration}"),
                        1,
                        iteration,
                        "synthetic",
                    )],
                    CaptureStatus::Complete,
                ),
            )
            .unwrap();
        }
    }

    #[test]
    fn independent_processes_preserve_every_committed_message() {
        let root = temp_root("processes");
        let exe = std::env::current_exe().unwrap();
        let mut children = Vec::new();
        for index in 0..4 {
            children.push(
                std::process::Command::new(&exe)
                    .args([
                        "--exact",
                        "conversation_archive::tests::subprocess_archive_writer_helper",
                    ])
                    .env("DOWZE_ARCHIVE_TEST_CHILD_ROOT", &root)
                    .env("DOWZE_ARCHIVE_TEST_CHILD_INDEX", index.to_string())
                    .stdout(std::process::Stdio::null())
                    .spawn()
                    .unwrap(),
            );
        }
        for mut child in children {
            assert!(child.wait().unwrap().success());
        }
        let scope = input(vec![], CaptureStatus::Complete).scope().unwrap();
        assert_eq!(read_archive(&root, &scope).unwrap().messages.len(), 16);
        fs::remove_dir_all(root).unwrap();
    }
}
