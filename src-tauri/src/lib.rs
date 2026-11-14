mod asset_sync;
mod paper_export;
mod conversation_archive;
mod free_chat;
mod local_auth;
mod panel_capture;
mod server_link;
mod workspace_cache;
mod automatic_updates;
mod startup_window;

#[cfg(target_os = "macos")]
use block2::RcBlock;
use chrono::{DateTime, NaiveDate, Utc};
#[cfg(target_os = "macos")]
use objc2::{rc::Retained, runtime::Bool, MainThreadMarker};
#[cfg(target_os = "macos")]
use objc2_av_foundation::{AVAuthorizationStatus, AVCaptureDevice, AVMediaTypeAudio};
#[cfg(target_os = "macos")]
use objc2_foundation::NSArray;
#[cfg(target_os = "macos")]
use objc2_web_kit::{WKWebView, WKWebsiteDataRecord, WKWebsiteDataStore};
use serde::{Deserialize, Serialize};
use std::{
    fs::{self, File, OpenOptions},
    io::{self, Read, Seek, SeekFrom, Write},
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        Arc, Mutex,
    },
};
#[cfg(target_os = "macos")]
use std::{ptr::NonNull, sync::mpsc, time::Duration};
use tauri::{
    ipc::{InvokeResponseBody, IpcResponse},
    webview::{
        DownloadEvent, NewWindowFeatures, NewWindowResponse, PageLoadEvent, PageLoadPayload,
    },
    Emitter, LogicalPosition, LogicalSize, Manager, State, Url, Webview, WebviewBuilder,
    WebviewUrl, WebviewWindow, WebviewWindowBuilder,
};

const MAIN_WEBVIEW_LABEL: &str = "main";
const AI_PANEL_LABEL: &str = "ai-panel";
const GOOGLE_WEB_PROFILE_LABEL: &str = "google-web-profile";
const AUTH_POPUP_LABEL_PREFIX: &str = "auth-popup-";
const MAX_AUTH_POPUP_WINDOWS: usize = 3;
const GOOGLE_WEB_PROFILE_URL: &str = "https://myaccount.google.com/";
const GOOGLE_WEB_DATA_ROOTS: &[&str] = &[
    "google.com",
    "googleapis.com",
    "googleusercontent.com",
    "gstatic.com",
    "youtube.com",
    "youtu.be",
    "ytimg.com",
    "ggpht.com",
    "googlevideo.com",
    "youtube-nocookie.com",
];
const REQUIRED_AUXILIARY_FRAME_HOSTS: &[&str] = &[
    "www.recaptcha.net",
    "www.kasandbox.org",
    "www.youtube-nocookie.com",
];
#[cfg(target_os = "macos")]
const GOOGLE_WEB_DATA_OPERATION_TIMEOUT: Duration = Duration::from_secs(20);
#[cfg(target_os = "macos")]
const MICROPHONE_PERMISSION_OPERATION_TIMEOUT: Duration = Duration::from_secs(300);
const MAX_URL_LENGTH: usize = 8_192;
// A detailed lesson prompt can legitimately be fairly long. Keep a generous,
// explicit byte bound while never truncating the text sent to the provider.
const MAX_PROMPT_LENGTH: usize = 65_536;
const MAX_LESSON_ID_LENGTH: usize = 128;
const MAX_BOUND: f64 = 100_000.0;
const ASSESSMENT_DOCUMENTS_DIRECTORY: &str = "assessment-documents";
const ASSESSMENT_PROFILE_DOCUMENTS_DIRECTORY: &str = ".profiles-v1";
const MAX_ASSESSMENT_RECORD_ID_LENGTH: usize = 128;
const MAX_ASSESSMENT_RESET_RECORDS: usize = 5_000;
const MAX_ASSESSMENT_PDF_SIZE: u64 = 64 * 1024 * 1024;
const PDF_HEADER: &[u8] = b"%PDF-";
const PDF_EOF_MARKER: &[u8] = b"%%EOF";
const PDF_TAIL_SCAN_LENGTH: u64 = 1_024;
const CALENDAR_EXPORTS_DIRECTORY: &str = "calendar-exports";
const MAX_CALENDAR_EVENTS: usize = 5_000;
const MAX_CALENDAR_ICS_SIZE: usize = 4 * 1024 * 1024;
const MAX_TEXT_DOCUMENT_SIZE: usize = 32 * 1024 * 1024;
const MAX_FORMATION_FILE_SIZE: u64 = 2 * 1024 * 1024;
const MAX_FORMATION_PACKAGE_SIZE: u64 = 8 * 1024 * 1024;
const MAX_FORMATION_KIT_SIZE: usize = 8 * 1024 * 1024;
const FORMATION_PACKAGE_FILENAMES: [&str; 6] = [
    "formation.json",
    "matieres.json",
    "programme.json",
    "planning.json",
    "evaluations.json",
    "taches.json",
];
const GOOGLE_CALENDAR_IMPORT_URL: &str =
    "https://calendar.google.com/calendar/u/0/r/settings/export";
static ASSESSMENT_TEMP_COUNTER: AtomicU64 = AtomicU64::new(0);
static AUTH_POPUP_COUNTER: AtomicU64 = AtomicU64::new(0);

type CommandResult<T> = Result<T, String>;

#[cfg(not(target_os = "windows"))]
fn replace_file_atomically(staging: &Path, destination: &Path) -> io::Result<()> {
    fs::rename(staging, destination)
}

#[cfg(target_os = "windows")]
fn replace_file_atomically(staging: &Path, destination: &Path) -> io::Result<()> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Storage::FileSystem::{
        MoveFileExW, MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH,
    };

    fn wide_path(path: &Path) -> io::Result<Vec<u16>> {
        let mut wide = path.as_os_str().encode_wide().collect::<Vec<_>>();
        if wide.contains(&0) {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "le chemin contient un caractère nul",
            ));
        }
        wide.push(0);
        Ok(wide)
    }

    let staging = wide_path(staging)?;
    let destination = wide_path(destination)?;
    // SAFETY: both buffers are NUL-terminated and remain alive for the call.
    // The staging file is created beside the destination, so the move stays on
    // one volume and provides Windows' replace-existing rename semantics.
    let moved = unsafe {
        MoveFileExW(
            staging.as_ptr(),
            destination.as_ptr(),
            MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
        )
    };
    if moved == 0 {
        Err(io::Error::last_os_error())
    } else {
        Ok(())
    }
}

#[derive(Clone, Copy, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct GoogleWebProfileRemovalResult {
    removed_records: usize,
}

#[derive(Clone, Copy, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct NativeCapabilities {
    platform: &'static str,
    google_web_profile_removal: bool,
    microphone_access_request: bool,
}

#[derive(Clone, Copy, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
enum MicrophoneAccessStatus {
    Authorized,
    Denied,
    Restricted,
    Unsupported,
}

#[derive(Default)]
struct AssessmentDocumentsState {
    operation_lock: Arc<Mutex<()>>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CalendarIcsEvent {
    id: String,
    title: String,
    start: String,
    end: String,
    all_day: bool,
    start_date: Option<String>,
    end_date: Option<String>,
    location: Option<String>,
    description: Option<String>,
    category: String,
    subject: Option<String>,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
enum AiProvider {
    Chatgpt,
    Claude,
    Gemini,
    Mistral,
    Deepseek,
    Kimi,
    Freechat,
    Duolingo,
    Khanacademy,
    Youtube,
    Tiktok,
    Notebooklm,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
enum TextDocumentKind {
    Json,
    Markdown,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct FormationPackageFiles {
    directory_name: String,
    formation: String,
    subjects: String,
    curriculum: String,
    schedule: String,
    assessments: String,
    tasks: String,
}

impl TextDocumentKind {
    fn extension(self) -> &'static str {
        match self {
            Self::Json => "json",
            Self::Markdown => "md",
        }
    }
}

impl AiProvider {
    fn start_url(self) -> CommandResult<Url> {
        let raw = match self {
            Self::Chatgpt => "https://chatgpt.com/",
            Self::Claude => "https://claude.ai/new",
            Self::Gemini => "https://gemini.google.com/app",
            Self::Mistral => "https://chat.mistral.ai/chat",
            Self::Deepseek => "https://chat.deepseek.com/",
            Self::Kimi => "https://www.kimi.com/",
            Self::Freechat => {
                return Err(
                    "Le Chat libre est intégré à Dowze Academie et n'utilise pas de page web."
                        .into(),
                )
            }
            Self::Duolingo => "https://www.duolingo.com/learn",
            Self::Khanacademy => "https://fr.khanacademy.org/",
            Self::Youtube => "https://www.youtube.com/",
            Self::Tiktok => "https://www.tiktok.com/",
            Self::Notebooklm => "https://notebook.google.com/",
        };

        Url::parse(raw).map_err(|error| format!("URL fournisseur invalide: {error}"))
    }

    fn supports_lesson_injection(self) -> bool {
        matches!(
            self,
            Self::Chatgpt
                | Self::Claude
                | Self::Gemini
                | Self::Mistral
                | Self::Deepseek
                | Self::Kimi
        )
    }
}

#[derive(Clone, Copy, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PanelBounds {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

impl PanelBounds {
    fn validate(self) -> CommandResult<Self> {
        let values = [self.x, self.y, self.width, self.height];
        if values.iter().any(|value| !value.is_finite()) {
            return Err("Les dimensions du panneau doivent être des nombres finis.".into());
        }
        if self.x < 0.0 || self.y < 0.0 {
            return Err("La position du panneau ne peut pas être négative.".into());
        }
        if self.width <= 0.0 || self.height <= 0.0 {
            return Err("La largeur et la hauteur du panneau doivent être positives.".into());
        }
        if values.iter().any(|value| *value > MAX_BOUND) {
            return Err("Les dimensions du panneau dépassent la limite autorisée.".into());
        }

        Ok(self)
    }

    fn position(self) -> LogicalPosition<f64> {
        LogicalPosition::new(self.x, self.y)
    }

    fn size(self) -> LogicalSize<f64> {
        LogicalSize::new(self.width, self.height)
    }
}

#[derive(Clone, Debug, Serialize)]
struct AiNavigationPayload {
    url: String,
    provider: AiProvider,
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct PendingLesson {
    account_id: String,
    provider: AiProvider,
    prompt: String,
    lesson_id: String,
    navigation_started: bool,
}

impl PendingLesson {
    fn new(
        account_id: String,
        provider: AiProvider,
        prompt: String,
        lesson_id: String,
    ) -> CommandResult<Self> {
        local_auth::validate_account_id(&account_id)?;
        // AiProvider is a closed, serde-validated enum. Resolving its start URL also
        // keeps this validation coupled to the navigation target.
        provider.start_url()?;
        if !provider.supports_lesson_injection() {
            return Err(
                "L’injection automatique d’un cours n’est pas disponible pour ce service.".into(),
            );
        }

        if prompt.trim().is_empty() {
            return Err("Le contenu du cours IA ne peut pas être vide.".into());
        }
        if prompt.len() > MAX_PROMPT_LENGTH {
            return Err(format!(
                "Le contenu du cours IA dépasse la limite de {MAX_PROMPT_LENGTH} octets."
            ));
        }

        let lesson_id_is_valid = !lesson_id.is_empty()
            && lesson_id.len() <= MAX_LESSON_ID_LENGTH
            && lesson_id.trim() == lesson_id
            && lesson_id.bytes().all(|byte| {
                byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b':' | b'.')
            });
        if !lesson_id_is_valid {
            return Err(
                "L’identifiant du cours IA doit contenir 1 à 128 caractères ASCII parmi lettres, chiffres, -, _, : et ."
                    .into(),
            );
        }

        Ok(Self {
            account_id,
            provider,
            prompt,
            lesson_id,
            navigation_started: false,
        })
    }
}

#[derive(Default)]
struct PendingLessonState {
    pending: Mutex<Option<PendingLesson>>,
}

#[derive(Clone, Default)]
struct RemoteWebSessionState {
    account_transition_in_progress: Arc<AtomicBool>,
}

impl RemoteWebSessionState {
    fn is_account_transition_in_progress(&self) -> bool {
        self.account_transition_in_progress.load(Ordering::Acquire)
    }

    fn ensure_available(&self) -> CommandResult<()> {
        if self.is_account_transition_in_progress() {
            Err(
                "Les sessions web sont temporairement fermées pendant le changement de compte."
                    .into(),
            )
        } else {
            Ok(())
        }
    }

    fn begin_account_transition(&self) -> CommandResult<RemoteWebTransitionGuard> {
        self.account_transition_in_progress
            .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
            .map_err(|_| "Un changement de compte web est déjà en cours.".to_string())?;
        Ok(RemoteWebTransitionGuard {
            flag: Arc::clone(&self.account_transition_in_progress),
        })
    }
}

struct RemoteWebTransitionGuard {
    flag: Arc<AtomicBool>,
}

impl Drop for RemoteWebTransitionGuard {
    fn drop(&mut self) {
        self.flag.store(false, Ordering::Release);
    }
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
enum AssessmentPdfVariant {
    Blank,
    Completed,
}

impl AssessmentPdfVariant {
    fn file_name(self) -> &'static str {
        match self {
            Self::Blank => "sujet-vierge.pdf",
            Self::Completed => "copie-remplie.pdf",
        }
    }
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct AssessmentPdfMetadata {
    original_name: String,
    size_bytes: u64,
}

#[derive(Clone, Debug, Default, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct ImportedAssessmentPdfs {
    #[serde(skip_serializing_if = "Option::is_none")]
    blank: Option<AssessmentPdfMetadata>,
    #[serde(skip_serializing_if = "Option::is_none")]
    completed: Option<AssessmentPdfMetadata>,
}

impl ImportedAssessmentPdfs {
    fn insert(&mut self, variant: AssessmentPdfVariant, metadata: AssessmentPdfMetadata) {
        match variant {
            AssessmentPdfVariant::Blank => self.blank = Some(metadata),
            AssessmentPdfVariant::Completed => self.completed = Some(metadata),
        }
    }
}

fn validate_assessment_record_id(record_id: &str) -> CommandResult<()> {
    let is_valid = !record_id.is_empty()
        && record_id.len() <= MAX_ASSESSMENT_RECORD_ID_LENGTH
        && record_id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'));
    if !is_valid {
        return Err(
            "L’identifiant de l’évaluation doit contenir 1 à 128 caractères ASCII parmi lettres, chiffres, - et _."
                .into(),
        );
    }
    Ok(())
}

fn ensure_regular_directory(path: &Path, label: &str) -> CommandResult<()> {
    let metadata = fs::symlink_metadata(path)
        .map_err(|error| format!("Impossible de vérifier {label}: {error}"))?;
    if metadata.file_type().is_symlink() || !metadata.file_type().is_dir() {
        return Err(format!("{label} doit être un dossier local régulier."));
    }
    Ok(())
}

fn existing_assessment_documents_root(app_data_dir: &Path) -> CommandResult<Option<PathBuf>> {
    match fs::symlink_metadata(app_data_dir) {
        Ok(metadata) => {
            if metadata.file_type().is_symlink() || !metadata.file_type().is_dir() {
                return Err(
                    "Les données de l’application doivent être un dossier local régulier.".into(),
                );
            }
        }
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(None),
        Err(error) => {
            return Err(format!(
                "Impossible de vérifier les données de l’application: {error}"
            ))
        }
    }

    let canonical_app_data = fs::canonicalize(app_data_dir).map_err(|error| {
        format!("Impossible de sécuriser les données de l’application: {error}")
    })?;
    let root = app_data_dir.join(ASSESSMENT_DOCUMENTS_DIRECTORY);
    match fs::symlink_metadata(&root) {
        Ok(_) => ensure_regular_directory(&root, "Le dossier des évaluations")?,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(None),
        Err(error) => {
            return Err(format!(
                "Impossible de vérifier le dossier des évaluations: {error}"
            ))
        }
    }

    let canonical_root = fs::canonicalize(&root)
        .map_err(|error| format!("Impossible de sécuriser le dossier des évaluations: {error}"))?;
    if canonical_root.parent() != Some(canonical_app_data.as_path())
        || canonical_root.file_name().and_then(|value| value.to_str())
            != Some(ASSESSMENT_DOCUMENTS_DIRECTORY)
    {
        return Err("Le dossier des évaluations sort des données privées de l’application.".into());
    }
    Ok(Some(canonical_root))
}

fn ensure_assessment_documents_root(app_data_dir: &Path) -> CommandResult<PathBuf> {
    fs::create_dir_all(app_data_dir)
        .map_err(|error| format!("Impossible de préparer les données de l’application: {error}"))?;
    if let Some(root) = existing_assessment_documents_root(app_data_dir)? {
        return Ok(root);
    }

    let root = app_data_dir.join(ASSESSMENT_DOCUMENTS_DIRECTORY);
    fs::create_dir(&root)
        .map_err(|error| format!("Impossible de créer le dossier des évaluations: {error}"))?;
    existing_assessment_documents_root(app_data_dir)?
        .ok_or_else(|| "Le dossier des évaluations n’a pas pu être créé.".into())
}

fn existing_assessment_profile_documents_root(root: &Path) -> CommandResult<Option<PathBuf>> {
    let profiles_root = root.join(ASSESSMENT_PROFILE_DOCUMENTS_DIRECTORY);
    match fs::symlink_metadata(&profiles_root) {
        Ok(_) => ensure_regular_directory(&profiles_root, "Le dossier des profils d’évaluation")?,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(None),
        Err(error) => {
            return Err(format!(
                "Impossible de vérifier le dossier des profils d’évaluation: {error}"
            ))
        }
    }

    let canonical = fs::canonicalize(&profiles_root).map_err(|error| {
        format!("Impossible de sécuriser le dossier des profils d’évaluation: {error}")
    })?;
    if canonical.parent() != Some(root)
        || canonical.file_name().and_then(|value| value.to_str())
            != Some(ASSESSMENT_PROFILE_DOCUMENTS_DIRECTORY)
    {
        return Err("Le dossier des profils d’évaluation sort de la racine gérée.".into());
    }
    Ok(Some(canonical))
}

fn ensure_assessment_profile_documents_root(root: &Path) -> CommandResult<PathBuf> {
    if let Some(profiles_root) = existing_assessment_profile_documents_root(root)? {
        return Ok(profiles_root);
    }
    let profiles_root = root.join(ASSESSMENT_PROFILE_DOCUMENTS_DIRECTORY);
    fs::create_dir(&profiles_root).map_err(|error| {
        format!("Impossible de créer le dossier des profils d’évaluation: {error}")
    })?;
    existing_assessment_profile_documents_root(root)?
        .ok_or_else(|| "Le dossier des profils d’évaluation n’a pas pu être créé.".into())
}

fn existing_assessment_account_directory(
    profiles_root: &Path,
    account_id: &str,
) -> CommandResult<Option<PathBuf>> {
    local_auth::validate_account_id(account_id)?;
    let account_directory = profiles_root.join(account_id);
    match fs::symlink_metadata(&account_directory) {
        Ok(_) => ensure_regular_directory(&account_directory, "Le dossier PDF du compte")?,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(None),
        Err(error) => {
            return Err(format!(
                "Impossible de vérifier le dossier PDF du compte: {error}"
            ))
        }
    }

    let canonical = fs::canonicalize(&account_directory)
        .map_err(|error| format!("Impossible de sécuriser le dossier PDF du compte: {error}"))?;
    if canonical.parent() != Some(profiles_root)
        || canonical.file_name().and_then(|value| value.to_str()) != Some(account_id)
    {
        return Err("Le dossier PDF demandé ne correspond pas exactement à ce compte.".into());
    }
    Ok(Some(canonical))
}

fn ensure_assessment_account_directory(
    profiles_root: &Path,
    account_id: &str,
) -> CommandResult<PathBuf> {
    if let Some(account_directory) =
        existing_assessment_account_directory(profiles_root, account_id)?
    {
        return Ok(account_directory);
    }
    let account_directory = profiles_root.join(account_id);
    fs::create_dir(&account_directory)
        .map_err(|error| format!("Impossible de créer le dossier PDF du compte: {error}"))?;
    existing_assessment_account_directory(profiles_root, account_id)?
        .ok_or_else(|| "Le dossier PDF du compte n’a pas pu être créé.".into())
}

fn existing_assessment_record_directory(
    root: &Path,
    record_id: &str,
) -> CommandResult<Option<PathBuf>> {
    validate_assessment_record_id(record_id)?;
    let record_directory = root.join(record_id);
    match fs::symlink_metadata(&record_directory) {
        Ok(_) => ensure_regular_directory(&record_directory, "Le dossier de l’évaluation")?,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(None),
        Err(error) => {
            return Err(format!(
                "Impossible de vérifier le dossier de l’évaluation: {error}"
            ))
        }
    }
    let canonical = fs::canonicalize(&record_directory)
        .map_err(|error| format!("Impossible de sécuriser le dossier de l’évaluation: {error}"))?;
    if canonical.parent() != Some(root)
        || canonical.file_name().and_then(|value| value.to_str()) != Some(record_id)
    {
        return Err("Le dossier demandé ne correspond pas exactement à cette évaluation.".into());
    }
    Ok(Some(canonical))
}

fn ensure_assessment_record_directory(root: &Path, record_id: &str) -> CommandResult<PathBuf> {
    if let Some(directory) = existing_assessment_record_directory(root, record_id)? {
        return Ok(directory);
    }
    let record_directory = root.join(record_id);
    fs::create_dir(&record_directory)
        .map_err(|error| format!("Impossible de créer le dossier de l’évaluation: {error}"))?;
    existing_assessment_record_directory(root, record_id)?
        .ok_or_else(|| "Le dossier de l’évaluation n’a pas pu être créé.".into())
}

fn resolve_profile_assessment_record_directory(
    root: &Path,
    account_id: &str,
    record_id: &str,
) -> CommandResult<Option<PathBuf>> {
    local_auth::validate_account_id(account_id)?;
    validate_assessment_record_id(record_id)?;

    if let Some(profiles_root) = existing_assessment_profile_documents_root(root)? {
        if let Some(account_directory) =
            existing_assessment_account_directory(&profiles_root, account_id)?
        {
            if let Some(record_directory) =
                existing_assessment_record_directory(&account_directory, record_id)?
            {
                return Ok(Some(record_directory));
            }
        }
    }

    // Avant les comptes locaux, les PDF étaient stockés directement sous
    // `assessment-documents/<recordId>`. Le premier profil qui possède encore
    // cette fiche revendique atomiquement ce dossier dans son espace privé.
    let Some(legacy_directory) = existing_assessment_record_directory(root, record_id)? else {
        return Ok(None);
    };
    let profiles_root = ensure_assessment_profile_documents_root(root)?;
    let account_directory = ensure_assessment_account_directory(&profiles_root, account_id)?;
    if existing_assessment_record_directory(&account_directory, record_id)?.is_some() {
        return Err(
            "Une archive PDF existe à la fois dans l’ancien stockage et dans ce compte.".into(),
        );
    }
    let destination = account_directory.join(record_id);
    fs::rename(&legacy_directory, &destination)
        .map_err(|error| format!("Impossible de migrer les anciens PDF du compte: {error}"))?;
    existing_assessment_record_directory(&account_directory, record_id)?
        .map(Some)
        .ok_or_else(|| "Les anciens PDF du compte n’ont pas pu être migrés.".into())
}

fn validate_pdf_stream(file: &mut File, size: u64) -> CommandResult<()> {
    if size < PDF_HEADER.len() as u64 || size > MAX_ASSESSMENT_PDF_SIZE {
        return Err(format!(
            "Le PDF doit avoir une taille comprise entre {} octets et {} Mio.",
            PDF_HEADER.len(),
            MAX_ASSESSMENT_PDF_SIZE / (1024 * 1024)
        ));
    }

    let mut header = [0_u8; PDF_HEADER.len()];
    file.seek(SeekFrom::Start(0))
        .and_then(|_| file.read_exact(&mut header))
        .map_err(|error| format!("Impossible de lire la signature du PDF: {error}"))?;
    if header != PDF_HEADER {
        return Err("Le fichier ne possède pas une signature PDF valide (%PDF-).".into());
    }

    let tail_length = size.min(PDF_TAIL_SCAN_LENGTH);
    file.seek(SeekFrom::End(-(tail_length as i64)))
        .map_err(|error| format!("Impossible de vérifier la fin du PDF: {error}"))?;
    let mut tail = vec![0_u8; tail_length as usize];
    file.read_exact(&mut tail)
        .map_err(|error| format!("Impossible de vérifier la fin du PDF: {error}"))?;
    if !tail
        .windows(PDF_EOF_MARKER.len())
        .any(|window| window == PDF_EOF_MARKER)
    {
        return Err("Le fichier PDF est incomplet : marqueur %%EOF absent.".into());
    }

    file.seek(SeekFrom::Start(0))
        .map_err(|error| format!("Impossible de relire le PDF: {error}"))?;
    Ok(())
}

fn open_valid_pdf(path: &Path) -> CommandResult<(File, u64)> {
    if !path.is_absolute() {
        return Err("Le chemin du PDF sélectionné doit être absolu.".into());
    }
    let has_pdf_extension = path
        .extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("pdf"));
    if !has_pdf_extension {
        return Err("Seuls les fichiers portant l’extension .pdf sont acceptés.".into());
    }

    let path_metadata = fs::symlink_metadata(path)
        .map_err(|error| format!("Impossible de vérifier le PDF sélectionné: {error}"))?;
    if path_metadata.file_type().is_symlink() || !path_metadata.file_type().is_file() {
        return Err("Le PDF sélectionné doit être un fichier local régulier, pas un lien.".into());
    }

    let mut file = File::open(path)
        .map_err(|error| format!("Impossible d’ouvrir le PDF sélectionné: {error}"))?;
    let metadata = file
        .metadata()
        .map_err(|error| format!("Impossible de vérifier le PDF sélectionné: {error}"))?;
    if !metadata.file_type().is_file() {
        return Err("Le PDF sélectionné n’est pas un fichier régulier.".into());
    }
    validate_pdf_stream(&mut file, metadata.len())?;
    Ok((file, metadata.len()))
}

fn unique_transaction_path(record_directory: &Path, kind: &str) -> PathBuf {
    let sequence = ASSESSMENT_TEMP_COUNTER.fetch_add(1, Ordering::Relaxed);
    record_directory.join(format!(
        ".assessment-{kind}-{}-{sequence}.tmp",
        std::process::id()
    ))
}

struct ValidatedAssessmentPdf {
    variant: AssessmentPdfVariant,
    canonical_source: PathBuf,
    source: File,
    metadata: AssessmentPdfMetadata,
}

struct StagedAssessmentPdf {
    variant: AssessmentPdfVariant,
    staging_path: PathBuf,
    destination: PathBuf,
    destination_existed: bool,
    backup_path: Option<PathBuf>,
    installed: bool,
    metadata: AssessmentPdfMetadata,
}

fn validate_assessment_pdf_source(
    variant: AssessmentPdfVariant,
    source_path: &Path,
) -> CommandResult<ValidatedAssessmentPdf> {
    let original_name = source_path
        .file_name()
        .and_then(|value| value.to_str())
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "Le nom du PDF sélectionné est invalide.".to_string())?
        .to_owned();
    let canonical_source = fs::canonicalize(source_path)
        .map_err(|error| format!("Impossible de sécuriser le PDF sélectionné: {error}"))?;
    let (source, source_size) = open_valid_pdf(source_path)?;
    Ok(ValidatedAssessmentPdf {
        variant,
        canonical_source,
        source,
        metadata: AssessmentPdfMetadata {
            original_name,
            size_bytes: source_size,
        },
    })
}

fn inspect_managed_destination(
    destination: &Path,
    validated_sources: &[ValidatedAssessmentPdf],
) -> CommandResult<bool> {
    match fs::symlink_metadata(destination) {
        Ok(metadata) => {
            if metadata.file_type().is_symlink() || !metadata.file_type().is_file() {
                return Err(
                    "Le PDF existant dans l’évaluation n’est pas un fichier régulier.".into(),
                );
            }
            let canonical_destination = fs::canonicalize(destination)
                .map_err(|error| format!("Impossible de sécuriser le PDF existant: {error}"))?;
            if validated_sources
                .iter()
                .any(|source| source.canonical_source == canonical_destination)
            {
                return Err(
                    "Un PDF sélectionné est déjà un document géré par cette évaluation.".into(),
                );
            }
            Ok(true)
        }
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(false),
        Err(error) => Err(format!(
            "Impossible de vérifier le PDF existant dans l’évaluation: {error}"
        )),
    }
}

fn stage_assessment_pdfs(
    record_directory: &Path,
    mut validated_sources: Vec<ValidatedAssessmentPdf>,
) -> CommandResult<Vec<StagedAssessmentPdf>> {
    let destination_states = validated_sources
        .iter()
        .map(|source| {
            let destination = record_directory.join(source.variant.file_name());
            inspect_managed_destination(&destination, &validated_sources)
                .map(|existed| (destination, existed))
        })
        .collect::<CommandResult<Vec<_>>>()?;

    let mut staged: Vec<StagedAssessmentPdf> = Vec::with_capacity(validated_sources.len());
    for (mut source, (destination, destination_existed)) in
        validated_sources.drain(..).zip(destination_states)
    {
        let staging_path = unique_transaction_path(record_directory, "stage");
        let stage_result = (|| -> CommandResult<()> {
            let mut temporary = OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&staging_path)
                .map_err(|error| format!("Impossible de préparer la copie du PDF: {error}"))?;
            let copied = io::copy(&mut source.source, &mut temporary)
                .map_err(|error| format!("Impossible de copier le PDF: {error}"))?;
            if copied != source.metadata.size_bytes {
                return Err("La copie du PDF est incomplète.".into());
            }
            temporary
                .flush()
                .and_then(|_| temporary.sync_all())
                .map_err(|error| format!("Impossible de finaliser la copie du PDF: {error}"))?;
            drop(temporary);

            let mut staged_pdf = File::open(&staging_path)
                .map_err(|error| format!("Impossible de contrôler la copie du PDF: {error}"))?;
            let staged_size = staged_pdf
                .metadata()
                .map_err(|error| format!("Impossible de contrôler la copie du PDF: {error}"))?
                .len();
            if staged_size != source.metadata.size_bytes {
                return Err("La taille de la copie du PDF ne correspond pas à l’original.".into());
            }
            validate_pdf_stream(&mut staged_pdf, staged_size)
        })();

        if let Err(error) = stage_result {
            let _ = fs::remove_file(&staging_path);
            for previous in &staged {
                let _ = fs::remove_file(&previous.staging_path);
            }
            return Err(error);
        }

        staged.push(StagedAssessmentPdf {
            variant: source.variant,
            staging_path,
            destination,
            destination_existed,
            backup_path: None,
            installed: false,
            metadata: source.metadata,
        });
    }
    Ok(staged)
}

fn rollback_assessment_pdf_commit(staged: &mut [StagedAssessmentPdf]) -> CommandResult<()> {
    let mut failures = Vec::new();
    for item in staged.iter_mut().rev() {
        if item.installed {
            if let Err(error) = fs::remove_file(&item.destination) {
                if error.kind() != io::ErrorKind::NotFound {
                    failures.push(format!(
                        "suppression de {}: {error}",
                        item.destination.display()
                    ));
                }
            }
            item.installed = false;
        }

        if let Some(backup_path) = item.backup_path.take() {
            if let Err(error) = fs::rename(&backup_path, &item.destination) {
                failures.push(format!(
                    "restauration de {}: {error}",
                    item.destination.display()
                ));
            }
        }
        if let Err(error) = fs::remove_file(&item.staging_path) {
            if error.kind() != io::ErrorKind::NotFound {
                failures.push(format!(
                    "nettoyage de {}: {error}",
                    item.staging_path.display()
                ));
            }
        }
    }

    if failures.is_empty() {
        Ok(())
    } else {
        Err(format!(
            "La restauration des PDF a rencontré des erreurs : {}",
            failures.join("; ")
        ))
    }
}

fn commit_staged_assessment_pdfs(
    staged: &mut [StagedAssessmentPdf],
    simulated_failure_at: Option<usize>,
) -> CommandResult<()> {
    let commit_result = (|| -> CommandResult<()> {
        for (index, item) in staged.iter_mut().enumerate() {
            match fs::symlink_metadata(&item.destination) {
                Ok(metadata) => {
                    if !item.destination_existed {
                        return Err(
                            "Un PDF est apparu pendant l’import ; aucun document n’a été remplacé."
                                .into(),
                        );
                    }
                    if metadata.file_type().is_symlink() || !metadata.file_type().is_file() {
                        return Err(
                            "Le PDF à remplacer n’est plus un fichier local régulier.".into()
                        );
                    }
                    let backup_path = unique_transaction_path(
                        item.destination
                            .parent()
                            .ok_or_else(|| "Destination PDF invalide.".to_string())?,
                        "backup",
                    );
                    if fs::symlink_metadata(&backup_path).is_ok() {
                        return Err(
                            "Impossible de réserver la sauvegarde temporaire du PDF.".into()
                        );
                    }
                    fs::rename(&item.destination, &backup_path).map_err(|error| {
                        format!("Impossible de sauvegarder l’ancien PDF: {error}")
                    })?;
                    item.backup_path = Some(backup_path);
                }
                Err(error) if error.kind() == io::ErrorKind::NotFound => {
                    if item.destination_existed {
                        return Err(
                            "Le PDF à remplacer a disparu pendant l’import ; opération annulée."
                                .into(),
                        );
                    }
                }
                Err(error) => {
                    return Err(format!(
                        "Impossible de revérifier la destination du PDF: {error}"
                    ))
                }
            }

            if simulated_failure_at == Some(index) {
                return Err("Échec de commit simulé pour vérifier la restauration.".into());
            }

            fs::rename(&item.staging_path, &item.destination)
                .map_err(|error| format!("Impossible d’installer la copie du PDF: {error}"))?;
            item.installed = true;
        }
        Ok(())
    })();

    if let Err(commit_error) = commit_result {
        return match rollback_assessment_pdf_commit(staged) {
            Ok(()) => Err(commit_error),
            Err(rollback_error) => Err(format!("{commit_error} {rollback_error}")),
        };
    }

    // Une sauvegarde n’est retirée qu’après installation de toutes les variantes.
    // Si ce nettoyage non fonctionnel échoue, les destinations validées restent la
    // version de référence et l’import peut tout de même être enregistré côté UI.
    for item in staged {
        if let Some(backup_path) = item.backup_path.take() {
            let _ = fs::remove_file(backup_path);
        }
    }
    Ok(())
}

fn import_assessment_pdf_batch(
    app_data_dir: &Path,
    account_id: &str,
    record_id: &str,
    blank_source_path: Option<&Path>,
    completed_source_path: Option<&Path>,
    simulated_failure_at: Option<usize>,
) -> CommandResult<ImportedAssessmentPdfs> {
    local_auth::validate_account_id(account_id)?;
    validate_assessment_record_id(record_id)?;
    let requested_sources = [
        (AssessmentPdfVariant::Blank, blank_source_path),
        (AssessmentPdfVariant::Completed, completed_source_path),
    ];
    if requested_sources.iter().all(|(_, source)| source.is_none()) {
        return Err("Sélectionnez au moins un PDF à importer.".into());
    }

    // Toutes les sources sont ouvertes et validées avant la création du moindre
    // fichier temporaire ou le remplacement d’une destination existante.
    let validated_sources = requested_sources
        .into_iter()
        .filter_map(|(variant, source)| source.map(|source| (variant, source)))
        .map(|(variant, source)| validate_assessment_pdf_source(variant, source))
        .collect::<CommandResult<Vec<_>>>()?;

    let root = ensure_assessment_documents_root(app_data_dir)?;
    let record_directory =
        match resolve_profile_assessment_record_directory(&root, account_id, record_id)? {
            Some(record_directory) => record_directory,
            None => {
                let profiles_root = ensure_assessment_profile_documents_root(&root)?;
                let account_directory =
                    ensure_assessment_account_directory(&profiles_root, account_id)?;
                ensure_assessment_record_directory(&account_directory, record_id)?
            }
        };
    let mut staged = stage_assessment_pdfs(&record_directory, validated_sources)?;
    commit_staged_assessment_pdfs(&mut staged, simulated_failure_at)?;

    let mut imported = ImportedAssessmentPdfs::default();
    for item in staged {
        imported.insert(item.variant, item.metadata);
    }
    Ok(imported)
}

fn managed_assessment_pdf_path(
    app_data_dir: &Path,
    account_id: &str,
    record_id: &str,
    variant: AssessmentPdfVariant,
) -> CommandResult<PathBuf> {
    local_auth::validate_account_id(account_id)?;
    validate_assessment_record_id(record_id)?;
    let root = existing_assessment_documents_root(app_data_dir)?
        .ok_or_else(|| "Aucun document d’évaluation n’est enregistré.".to_string())?;
    let record_directory =
        resolve_profile_assessment_record_directory(&root, account_id, record_id)?
            .ok_or_else(|| "Aucun document n’est enregistré pour cette évaluation.".to_string())?;
    let file_name = variant.file_name();
    let expected = record_directory.join(file_name);
    let (file, _) = open_valid_pdf(&expected)?;
    drop(file);
    let canonical = fs::canonicalize(&expected)
        .map_err(|error| format!("Impossible de sécuriser le PDF enregistré: {error}"))?;
    if canonical.parent() != Some(record_directory.as_path())
        || canonical.file_name().and_then(|value| value.to_str()) != Some(file_name)
    {
        return Err("Le PDF demandé sort du dossier exact de cette évaluation.".into());
    }
    Ok(canonical)
}

fn remove_assessment_documents(
    app_data_dir: &Path,
    account_id: &str,
    record_id: &str,
) -> CommandResult<bool> {
    local_auth::validate_account_id(account_id)?;
    validate_assessment_record_id(record_id)?;
    let Some(root) = existing_assessment_documents_root(app_data_dir)? else {
        return Ok(false);
    };
    let Some(record_directory) =
        resolve_profile_assessment_record_directory(&root, account_id, record_id)?
    else {
        return Ok(false);
    };
    fs::remove_dir_all(&record_directory).map_err(|error| {
        format!("Impossible de supprimer les documents de l’évaluation: {error}")
    })?;
    Ok(true)
}

fn remove_account_assessment_documents(
    app_data_dir: &Path,
    account_id: &str,
    record_ids: &[String],
) -> CommandResult<bool> {
    local_auth::validate_account_id(account_id)?;
    if record_ids.len() > MAX_ASSESSMENT_RESET_RECORDS {
        return Err(format!(
            "Le reset ne peut pas traiter plus de {MAX_ASSESSMENT_RESET_RECORDS} évaluations."
        ));
    }
    for record_id in record_ids {
        validate_assessment_record_id(record_id)?;
    }
    let Some(root) = existing_assessment_documents_root(app_data_dir)? else {
        return Ok(false);
    };
    if let Some(profiles_root) = existing_assessment_profile_documents_root(&root)? {
        // Même un reset vide doit refuser un compte redirigé par lien symbolique,
        // sans créer de dossier et sans élargir la cible de suppression.
        existing_assessment_account_directory(&profiles_root, account_id)?;
    }

    // Le reset historique ne concerne que ses identifiants connus. Depuis que
    // plusieurs formations partagent un compte, supprimer tout le dossier du
    // compte effacerait aussi les PDF préfixés d’autres formations.
    let mut removed = false;
    for record_id in record_ids {
        if let Some(record_directory) =
            resolve_profile_assessment_record_directory(&root, account_id, record_id)?
        {
            fs::remove_dir_all(&record_directory).map_err(|error| {
                format!("Impossible de supprimer les PDF demandés de ce compte: {error}")
            })?;
            removed = true;
        }
        if let Some(legacy_directory) = existing_assessment_record_directory(&root, record_id)? {
            fs::remove_dir_all(&legacy_directory).map_err(|error| {
                format!("Impossible de supprimer les anciens PDF de ce compte: {error}")
            })?;
            removed = true;
        }
    }
    Ok(removed)
}

#[cfg(test)]
fn remove_all_assessment_documents(app_data_dir: &Path) -> CommandResult<bool> {
    let Some(root) = existing_assessment_documents_root(app_data_dir)? else {
        return Ok(false);
    };
    let canonical_app_data = fs::canonicalize(app_data_dir).map_err(|error| {
        format!("Impossible de sécuriser les données de l’application: {error}")
    })?;
    if root.parent() != Some(canonical_app_data.as_path())
        || root.file_name().and_then(|value| value.to_str()) != Some(ASSESSMENT_DOCUMENTS_DIRECTORY)
    {
        return Err("La racine des PDF d’évaluation n’est pas le dossier géré exact.".into());
    }
    fs::remove_dir_all(&root)
        .map_err(|error| format!("Impossible de supprimer les PDF d’évaluation: {error}"))?;
    Ok(true)
}

fn is_domain_or_subdomain(host: &str, root: &str) -> bool {
    host == root
        || host
            .strip_suffix(root)
            .is_some_and(|prefix| prefix.ends_with('.'))
}

fn is_google_web_data_record_name(display_name: &str) -> bool {
    let normalized = display_name
        .trim()
        .trim_end_matches('.')
        .to_ascii_lowercase();
    !normalized.is_empty()
        && GOOGLE_WEB_DATA_ROOTS
            .iter()
            .any(|root| is_domain_or_subdomain(&normalized, root))
}

fn is_authentication_host(host: &str) -> bool {
    [
        "accounts.google.com",
        "appleid.apple.com",
        "login.microsoftonline.com",
        // OpenAI can start its provider-owned sign-in flow in a separate
        // window before redirecting to the selected identity provider.
        "auth.openai.com",
        // Mistral currently serves its first-party login flow here, including
        // versioned hosts such as `v2.auth.mistral.ai`.
        "auth.mistral.ai",
    ]
    .iter()
    .any(|root| is_domain_or_subdomain(host, root))
}

fn provider_for_url(url: &Url) -> CommandResult<AiProvider> {
    if url.scheme() != "https" {
        return Err("Seules les URL HTTPS sont autorisées.".into());
    }
    if !url.username().is_empty() || url.password().is_some() {
        return Err("Les URL contenant des identifiants sont refusées.".into());
    }
    if url.port().is_some_and(|port| port != 443) {
        return Err("Seul le port HTTPS standard est autorisé.".into());
    }

    let host = url
        .domain()
        .ok_or_else(|| "L’URL doit utiliser un nom de domaine autorisé.".to_string())?;

    if is_domain_or_subdomain(host, "chatgpt.com") || is_domain_or_subdomain(host, "openai.com") {
        Ok(AiProvider::Chatgpt)
    } else if is_domain_or_subdomain(host, "claude.ai")
        || is_domain_or_subdomain(host, "anthropic.com")
    {
        Ok(AiProvider::Claude)
    } else if is_domain_or_subdomain(host, "gemini.google.com") {
        Ok(AiProvider::Gemini)
    } else if is_domain_or_subdomain(host, "chat.mistral.ai") {
        Ok(AiProvider::Mistral)
    } else if host == "chat.deepseek.com" {
        Ok(AiProvider::Deepseek)
    } else if matches!(host, "kimi.com" | "www.kimi.com") {
        Ok(AiProvider::Kimi)
    } else if matches!(host, "duolingo.com" | "www.duolingo.com") {
        Ok(AiProvider::Duolingo)
    } else if is_domain_or_subdomain(host, "khanacademy.org") {
        Ok(AiProvider::Khanacademy)
    } else if is_domain_or_subdomain(host, "youtube.com") || host == "youtu.be" {
        Ok(AiProvider::Youtube)
    } else if is_domain_or_subdomain(host, "tiktok.com") {
        Ok(AiProvider::Tiktok)
    } else if is_domain_or_subdomain(host, "notebook.google.com")
        || is_domain_or_subdomain(host, "notebooklm.google.com")
    {
        Ok(AiProvider::Notebooklm)
    } else {
        Err("Ce domaine n’est pas autorisé pour le panneau IA.".into())
    }
}

fn is_provider_new_chat_url(url: &Url, provider: AiProvider) -> bool {
    let Some(host) = url.domain() else {
        return false;
    };

    if url.scheme() != "https"
        || !url.username().is_empty()
        || url.password().is_some()
        || url.port().is_some_and(|port| port != 443)
    {
        return false;
    }

    match provider {
        // The official ChatGPT web entry point opens a fresh chat at `/`.
        AiProvider::Chatgpt => is_domain_or_subdomain(host, "chatgpt.com") && url.path() == "/",
        // Claude exposes `/new` as its explicit fresh-chat route.
        AiProvider::Claude => {
            is_domain_or_subdomain(host, "claude.ai")
                && matches!(url.path(), "/" | "/new" | "/new/")
        }
        // Gemini uses `/app` as its stable new-conversation entry point.
        AiProvider::Gemini => {
            is_domain_or_subdomain(host, "gemini.google.com")
                && matches!(url.path(), "/app" | "/app/")
        }
        // Mistral uses `/chat`; conversation routes append an identifier.
        AiProvider::Mistral => {
            is_domain_or_subdomain(host, "chat.mistral.ai")
                && matches!(url.path(), "/chat" | "/chat/")
        }
        // DeepSeek creates a fresh conversation from its official root; saved
        // sessions use `/a/chat/s/<id>`.
        AiProvider::Deepseek => host == "chat.deepseek.com" && url.path() == "/",
        // Kimi's current web app starts a new session at `/`; saved sessions
        // use `/chat/<id>` on the canonical `www.kimi.com` host.
        AiProvider::Kimi => matches!(host, "kimi.com" | "www.kimi.com") && url.path() == "/",
        // These services receive dedicated frontend context/search handling and
        // must never trigger the automatic chat-composer injection.
        AiProvider::Freechat
        | AiProvider::Duolingo
        | AiProvider::Khanacademy
        | AiProvider::Youtube
        | AiProvider::Tiktok
        | AiProvider::Notebooklm => false,
    }
}

fn validate_webview_navigation(url: &Url) -> CommandResult<()> {
    if provider_for_url(url).is_ok() {
        return Ok(());
    }

    // Duolingo's login embeds its challenge in an initially blank subframe.
    // Keep this exception exact: it is never a top-level navigate_ai target.
    if url.as_str() == "about:blank" {
        return Ok(());
    }

    if url.scheme() != "https" {
        return Err("Seules les URL HTTPS sont autorisées.".into());
    }
    if !url.username().is_empty() || url.password().is_some() {
        return Err("Les URL contenant des identifiants sont refusées.".into());
    }
    if url.port().is_some_and(|port| port != 443) {
        return Err("Seul le port HTTPS standard est autorisé.".into());
    }

    let host = url
        .domain()
        .ok_or_else(|| "L’URL doit utiliser un nom de domaine autorisé.".to_string())?;
    // These exact hosts are embedded by supported providers for authentication,
    // interactive Khan Academy exercises, or privacy-enhanced course videos.
    // They remain forbidden as direct navigate_ai/open_in_browser targets.
    let is_required_auxiliary_frame = REQUIRED_AUXILIARY_FRAME_HOSTS.contains(&host);

    if is_authentication_host(host) || is_required_auxiliary_frame {
        Ok(())
    } else {
        Err("Ce domaine n’est pas autorisé dans le panneau IA.".into())
    }
}

fn is_safe_external_target(url: &Url) -> bool {
    url.scheme() == "https"
        && url.username().is_empty()
        && url.password().is_none()
        && url.port().is_none_or(|port| port == 443)
        && url.domain().is_some()
}

fn is_embedded_authentication_target(url: &Url) -> bool {
    // Some OAuth clients first request an empty window and assign its URL
    // immediately afterwards. Its own navigation handler still enforces the
    // strict provider/authentication allowlist before displaying a document.
    if url.as_str() == "about:blank" {
        return true;
    }

    is_safe_external_target(url) && url.domain().is_some_and(is_authentication_host)
}

fn validate_google_web_profile_navigation(url: &Url) -> CommandResult<()> {
    // Google can create an initially empty child frame during sign-in. Its
    // subsequent navigation is evaluated again against the two exact hosts.
    if url.as_str() == "about:blank" {
        return Ok(());
    }

    if !is_safe_external_target(url) {
        return Err("La fenêtre Google exige une URL HTTPS sûre.".into());
    }

    match url.domain() {
        Some("accounts.google.com" | "myaccount.google.com") => Ok(()),
        _ => Err("Cette destination n’appartient pas au profil web Google.".into()),
    }
}

fn is_managed_remote_window_label(label: &str) -> bool {
    label == GOOGLE_WEB_PROFILE_LABEL || label.starts_with(AUTH_POPUP_LABEL_PREFIX)
}

fn has_auth_popup_capacity(current_count: usize) -> bool {
    current_count < MAX_AUTH_POPUP_WINDOWS
}

fn auth_popup_window_count(app: &tauri::AppHandle) -> usize {
    app.webview_windows()
        .keys()
        .filter(|label| label.starts_with(AUTH_POPUP_LABEL_PREFIX))
        .count()
}

fn is_safe_download_url(url: &Url) -> bool {
    if is_safe_external_target(url) {
        return true;
    }

    // WebKit represents in-page generated files as blob:<origin>/<id>.
    // Only accept those when their embedded origin is itself a safe HTTPS URL.
    url.scheme() == "blob"
        && url
            .as_str()
            .strip_prefix("blob:")
            .and_then(|raw| Url::parse(raw).ok())
            .is_some_and(|origin| is_safe_external_target(&origin))
}

fn parse_allowed_url(raw: &str) -> CommandResult<(Url, AiProvider)> {
    if raw.is_empty() || raw.len() > MAX_URL_LENGTH || raw.trim() != raw {
        return Err("L’URL fournie est vide, trop longue ou mal formée.".into());
    }

    let url = Url::parse(raw).map_err(|error| format!("URL invalide: {error}"))?;
    let provider = provider_for_url(&url)?;
    Ok((url, provider))
}

fn require_main_caller(caller: &Webview) -> CommandResult<()> {
    if caller.label() == MAIN_WEBVIEW_LABEL {
        Ok(())
    } else {
        Err("Cette commande est réservée à la webview locale principale.".into())
    }
}

fn validate_calendar_text(value: &str, label: &str, max_length: usize) -> CommandResult<()> {
    if value.is_empty() || value.len() > max_length || value.trim() != value {
        return Err(format!("{label} est vide, trop long ou mal formé."));
    }
    if value.chars().any(|character| {
        character == '\0' || (character.is_control() && !matches!(character, '\n' | '\r' | '\t'))
    }) {
        return Err(format!(
            "{label} contient un caractère de contrôle interdit."
        ));
    }
    Ok(())
}

fn parse_calendar_date_time(value: &str, label: &str) -> CommandResult<DateTime<Utc>> {
    if value.len() > 64 || value.trim() != value {
        return Err(format!("{label} est trop long ou mal formé."));
    }
    DateTime::parse_from_rfc3339(value)
        .map(|date| date.with_timezone(&Utc))
        .map_err(|error| format!("{label} n’est pas une date ISO valide: {error}"))
}

fn parse_calendar_day(value: &str, label: &str) -> CommandResult<NaiveDate> {
    if value.len() != 8 || !value.bytes().all(|byte| byte.is_ascii_digit()) {
        return Err(format!("{label} doit utiliser le format AAAAMMJJ."));
    }
    NaiveDate::parse_from_str(value, "%Y%m%d")
        .map_err(|error| format!("{label} n’est pas une date valide: {error}"))
}

fn validate_calendar_events(events: &[CalendarIcsEvent], calendar_name: &str) -> CommandResult<()> {
    validate_calendar_text(calendar_name, "Le nom du calendrier", 200)?;
    if events.is_empty() || events.len() > MAX_CALENDAR_EVENTS {
        return Err(format!(
            "Le calendrier doit contenir entre 1 et {MAX_CALENDAR_EVENTS} événements."
        ));
    }
    for event in events {
        validate_calendar_text(&event.id, "L’identifiant d’un événement", 160)?;
        validate_calendar_text(&event.title, "Le titre d’un événement", 500)?;
        validate_calendar_text(&event.category, "La catégorie d’un événement", 120)?;
        if let Some(location) = event.location.as_deref() {
            validate_calendar_text(location, "Le lieu d’un événement", 1_000)?;
        }
        if let Some(description) = event.description.as_deref() {
            validate_calendar_text(description, "La description d’un événement", 12_000)?;
        }
        if let Some(subject) = event.subject.as_deref() {
            validate_calendar_text(subject, "La matière d’un événement", 300)?;
        }
        let start = parse_calendar_date_time(&event.start, "Le début d’un événement")?;
        let end = parse_calendar_date_time(&event.end, "La fin d’un événement")?;
        if end <= start {
            return Err(format!(
                "La fin de l’événement {} doit suivre son début.",
                event.id
            ));
        }
        if event.all_day {
            let start_day = parse_calendar_day(
                event.start_date.as_deref().ok_or_else(|| {
                    "La date de début en journée entière est absente.".to_string()
                })?,
                "La date de début en journée entière",
            )?;
            let end_day = parse_calendar_day(
                event
                    .end_date
                    .as_deref()
                    .ok_or_else(|| "La date de fin en journée entière est absente.".to_string())?,
                "La date de fin en journée entière",
            )?;
            if end_day <= start_day {
                return Err(format!(
                    "La fin en journée entière de l’événement {} doit être exclusive et postérieure.",
                    event.id
                ));
            }
        } else if event.start_date.is_some() || event.end_date.is_some() {
            return Err(
                "Un événement horaire ne doit pas fournir de dates de journée entière.".into(),
            );
        }
    }
    Ok(())
}

fn escape_calendar_ics_text(value: &str) -> String {
    value
        .replace('\\', "\\\\")
        .replace("\r\n", "\\n")
        .replace(['\r', '\n'], "\\n")
        .replace(';', "\\;")
        .replace(',', "\\,")
}

fn fold_calendar_ics_line(line: &str) -> String {
    let mut result = String::new();
    let mut line_bytes = 0_usize;
    for character in line.chars() {
        let character_bytes = character.len_utf8();
        if line_bytes > 0 && line_bytes + character_bytes > 75 {
            result.push_str("\r\n ");
            line_bytes = 1;
        }
        result.push(character);
        line_bytes += character_bytes;
    }
    result
}

fn calendar_identity_hex(value: &str) -> String {
    value
        .as_bytes()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect::<String>()
}

fn calendar_event_uid(id: &str, uid_namespace: Option<&str>) -> String {
    let event_hexadecimal = calendar_identity_hex(id);
    match uid_namespace {
        Some(namespace) => format!(
            "etude-{}-{event_hexadecimal}@com.etude.desktop",
            calendar_identity_hex(namespace)
        ),
        None => format!("etude-{event_hexadecimal}@com.etude.desktop"),
    }
}

fn format_calendar_utc(date: DateTime<Utc>) -> String {
    date.format("%Y%m%dT%H%M%SZ").to_string()
}

fn build_calendar_ics_with_options(
    mut events: Vec<CalendarIcsEvent>,
    calendar_name: &str,
    generated_at: DateTime<Utc>,
    time_zone: &str,
    uid_namespace: Option<&str>,
) -> CommandResult<String> {
    validate_calendar_events(&events, calendar_name)?;
    validate_calendar_time_zone(time_zone)?;
    if let Some(namespace) = uid_namespace {
        validate_calendar_text(namespace, "L’espace UID du calendrier", 128)?;
        if namespace.chars().any(char::is_control) {
            return Err(
                "L’espace UID du calendrier contient un caractère de contrôle interdit.".into(),
            );
        }
    }
    events.sort_by(|left, right| {
        left.start
            .cmp(&right.start)
            .then_with(|| left.end.cmp(&right.end))
            .then_with(|| left.id.cmp(&right.id))
    });
    let timestamp = format_calendar_utc(generated_at);
    let mut lines = vec![
        "BEGIN:VCALENDAR".to_string(),
        "VERSION:2.0".to_string(),
        "PRODID:-//Dowze Academie//Planning scolaire//FR".to_string(),
        "CALSCALE:GREGORIAN".to_string(),
        "METHOD:PUBLISH".to_string(),
        format!("X-WR-CALNAME:{}", escape_calendar_ics_text(calendar_name)),
        format!("X-WR-TIMEZONE:{}", escape_calendar_ics_text(time_zone)),
    ];

    for event in events {
        lines.push("BEGIN:VEVENT".to_string());
        lines.push(format!(
            "UID:{}",
            calendar_event_uid(&event.id, uid_namespace)
        ));
        lines.push(format!("DTSTAMP:{timestamp}"));
        if event.all_day {
            lines.push(format!(
                "DTSTART;VALUE=DATE:{}",
                event.start_date.as_deref().unwrap_or_default()
            ));
            lines.push(format!(
                "DTEND;VALUE=DATE:{}",
                event.end_date.as_deref().unwrap_or_default()
            ));
        } else {
            let start = parse_calendar_date_time(&event.start, "Le début d’un événement")?;
            let end = parse_calendar_date_time(&event.end, "La fin d’un événement")?;
            lines.push(format!("DTSTART:{}", format_calendar_utc(start)));
            lines.push(format!("DTEND:{}", format_calendar_utc(end)));
        }
        lines.push(format!(
            "SUMMARY:{}",
            escape_calendar_ics_text(&event.title)
        ));
        if let Some(location) = event.location.as_deref() {
            lines.push(format!("LOCATION:{}", escape_calendar_ics_text(location)));
        }
        if let Some(description) = event.description.as_deref() {
            lines.push(format!(
                "DESCRIPTION:{}",
                escape_calendar_ics_text(description)
            ));
        }
        let mut categories = escape_calendar_ics_text(&event.category);
        if let Some(subject) = event.subject.as_deref() {
            categories.push(',');
            categories.push_str(&escape_calendar_ics_text(subject));
        }
        lines.push(format!("CATEGORIES:{categories}"));
        lines.push("STATUS:CONFIRMED".to_string());
        lines.push("TRANSP:OPAQUE".to_string());
        lines.push("END:VEVENT".to_string());
    }
    lines.push("END:VCALENDAR".to_string());
    let content = format!(
        "{}\r\n",
        lines
            .iter()
            .map(|line| fold_calendar_ics_line(line))
            .collect::<Vec<_>>()
            .join("\r\n")
    );
    if content.len() > MAX_CALENDAR_ICS_SIZE {
        return Err(format!(
            "Le calendrier dépasse la limite de {} Mio.",
            MAX_CALENDAR_ICS_SIZE / (1024 * 1024)
        ));
    }
    Ok(content)
}

fn validate_calendar_time_zone(time_zone: &str) -> CommandResult<()> {
    validate_calendar_text(time_zone, "Le fuseau du calendrier", 80)?;
    if !time_zone
        .bytes()
        .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'/' | b'_' | b'-' | b'+'))
        || time_zone
            .split('/')
            .any(|component| component.is_empty() || matches!(component, "." | ".."))
    {
        return Err("Le fuseau du calendrier contient des caractères interdits.".into());
    }
    Ok(())
}

#[cfg(test)]
fn build_calendar_ics(
    events: Vec<CalendarIcsEvent>,
    calendar_name: &str,
    generated_at: DateTime<Utc>,
) -> CommandResult<String> {
    build_calendar_ics_with_options(events, calendar_name, generated_at, "Europe/Zurich", None)
}

fn validate_calendar_destination(destination: &Path) -> CommandResult<PathBuf> {
    if !destination.is_absolute() {
        return Err("Le chemin du calendrier doit être absolu.".into());
    }
    if !destination
        .extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("ics"))
    {
        return Err("Le calendrier doit utiliser l’extension .ics.".into());
    }
    let filename = destination
        .file_name()
        .ok_or_else(|| "Le nom du fichier calendrier est absent.".to_string())?;
    let parent = destination
        .parent()
        .ok_or_else(|| "Le dossier du calendrier est absent.".to_string())?;
    let canonical_parent = fs::canonicalize(parent)
        .map_err(|error| format!("Impossible de sécuriser le dossier de destination: {error}"))?;
    let secured_destination = canonical_parent.join(filename);
    match fs::symlink_metadata(&secured_destination) {
        Ok(metadata) if metadata.file_type().is_symlink() || !metadata.file_type().is_file() => {
            return Err("La destination doit être un fichier régulier, pas un lien.".into())
        }
        Ok(_) => {}
        Err(error) if error.kind() == io::ErrorKind::NotFound => {}
        Err(error) => {
            return Err(format!(
                "Impossible de vérifier le fichier calendrier: {error}"
            ))
        }
    }
    Ok(secured_destination)
}

fn write_calendar_ics_file(destination: &Path, content: &str) -> CommandResult<PathBuf> {
    let destination = validate_calendar_destination(destination)?;
    let parent = destination
        .parent()
        .ok_or_else(|| "Le dossier du calendrier est absent.".to_string())?;
    let sequence = ASSESSMENT_TEMP_COUNTER.fetch_add(1, Ordering::Relaxed);
    let staging = parent.join(format!(
        ".etude-calendar-{}-{sequence}.tmp",
        std::process::id()
    ));
    let write_result = (|| -> CommandResult<()> {
        let mut file = OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(&staging)
            .map_err(|error| format!("Impossible de préparer le calendrier: {error}"))?;
        file.write_all(content.as_bytes())
            .and_then(|_| file.sync_all())
            .map_err(|error| format!("Impossible d’enregistrer le calendrier: {error}"))?;
        replace_file_atomically(&staging, &destination)
            .map_err(|error| format!("Impossible de finaliser le calendrier: {error}"))?;
        Ok(())
    })();
    if write_result.is_err() {
        let _ = fs::remove_file(&staging);
    }
    write_result?;
    Ok(destination)
}

fn write_text_document_file(
    destination: &Path,
    content: &str,
    kind: TextDocumentKind,
) -> CommandResult<PathBuf> {
    if content.len() > MAX_TEXT_DOCUMENT_SIZE {
        return Err(format!(
            "Le document dépasse la limite de {} Mio.",
            MAX_TEXT_DOCUMENT_SIZE / (1024 * 1024)
        ));
    }
    if kind == TextDocumentKind::Json {
        serde_json::from_str::<serde_json::Value>(content)
            .map_err(|error| format!("Le document JSON est invalide: {error}"))?;
    }
    if !destination.is_absolute() {
        return Err("Le chemin du document doit être absolu.".into());
    }
    if !destination
        .extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case(kind.extension()))
    {
        return Err(format!(
            "Le document doit utiliser l’extension .{}.",
            kind.extension()
        ));
    }
    let filename = destination
        .file_name()
        .ok_or_else(|| "Le nom du document est absent.".to_string())?;
    let parent = destination
        .parent()
        .ok_or_else(|| "Le dossier du document est absent.".to_string())?;
    let canonical_parent = fs::canonicalize(parent)
        .map_err(|error| format!("Impossible de sécuriser le dossier de destination: {error}"))?;
    let destination = canonical_parent.join(filename);
    match fs::symlink_metadata(&destination) {
        Ok(metadata) if metadata.file_type().is_symlink() || !metadata.file_type().is_file() => {
            return Err("La destination doit être un fichier régulier, pas un lien.".into())
        }
        Ok(_) => {}
        Err(error) if error.kind() == io::ErrorKind::NotFound => {}
        Err(error) => return Err(format!("Impossible de vérifier le document: {error}")),
    }

    let sequence = ASSESSMENT_TEMP_COUNTER.fetch_add(1, Ordering::Relaxed);
    let staging = canonical_parent.join(format!(
        ".etude-document-{}-{sequence}.tmp",
        std::process::id()
    ));
    let write_result = (|| -> CommandResult<()> {
        let mut file = OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(&staging)
            .map_err(|error| format!("Impossible de préparer le document: {error}"))?;
        file.write_all(content.as_bytes())
            .and_then(|_| file.sync_all())
            .map_err(|error| format!("Impossible d’enregistrer le document: {error}"))?;
        replace_file_atomically(&staging, &destination)
            .map_err(|error| format!("Impossible de finaliser le document: {error}"))?;
        Ok(())
    })();
    if write_result.is_err() {
        let _ = fs::remove_file(&staging);
    }
    write_result?;
    Ok(destination)
}

fn read_formation_json_file(path: &Path, total_size: &mut u64) -> CommandResult<String> {
    let metadata = fs::symlink_metadata(path)
        .map_err(|error| format!("Le fichier {} est introuvable: {error}", path.display()))?;
    if metadata.file_type().is_symlink() || !metadata.file_type().is_file() {
        return Err(format!(
            "{} doit être un fichier régulier, pas un lien symbolique.",
            path.file_name()
                .and_then(|name| name.to_str())
                .unwrap_or("Le fichier")
        ));
    }
    if metadata.len() > MAX_FORMATION_FILE_SIZE {
        return Err(format!(
            "{} dépasse la limite de {} Mio.",
            path.file_name()
                .and_then(|name| name.to_str())
                .unwrap_or("Le fichier"),
            MAX_FORMATION_FILE_SIZE / (1024 * 1024)
        ));
    }
    let file = File::open(path)
        .map_err(|error| format!("Impossible de lire {}: {error}", path.display()))?;
    let opened_metadata = file
        .metadata()
        .map_err(|error| format!("Impossible d’inspecter {}: {error}", path.display()))?;
    if !opened_metadata.file_type().is_file() || opened_metadata.len() > MAX_FORMATION_FILE_SIZE {
        return Err(format!(
            "{} dépasse la limite de {} Mio ou n’est pas un fichier régulier.",
            path.file_name()
                .and_then(|name| name.to_str())
                .unwrap_or("Le fichier"),
            MAX_FORMATION_FILE_SIZE / (1024 * 1024)
        ));
    }
    let mut bytes = Vec::with_capacity(opened_metadata.len() as usize);
    file.take(MAX_FORMATION_FILE_SIZE + 1)
        .read_to_end(&mut bytes)
        .map_err(|error| format!("Impossible de lire {}: {error}", path.display()))?;
    if bytes.len() as u64 > MAX_FORMATION_FILE_SIZE {
        return Err(format!(
            "{} dépasse la limite de {} Mio.",
            path.file_name()
                .and_then(|name| name.to_str())
                .unwrap_or("Le fichier"),
            MAX_FORMATION_FILE_SIZE / (1024 * 1024)
        ));
    }
    *total_size = total_size
        .checked_add(bytes.len() as u64)
        .ok_or_else(|| "La taille du dossier de formation est invalide.".to_string())?;
    if *total_size > MAX_FORMATION_PACKAGE_SIZE {
        return Err(format!(
            "Le dossier de formation dépasse la limite totale de {} Mio.",
            MAX_FORMATION_PACKAGE_SIZE / (1024 * 1024)
        ));
    }
    let content = String::from_utf8(bytes)
        .map_err(|_| format!("{} doit être encodé en UTF-8.", path.display()))?;
    serde_json::from_str::<serde_json::Value>(&content)
        .map_err(|error| format!("{} contient un JSON invalide: {error}", path.display()))?;
    Ok(content)
}

fn read_formation_package_directory(directory: &Path) -> CommandResult<FormationPackageFiles> {
    if !directory.is_absolute() {
        return Err("Le chemin du dossier de formation doit être absolu.".into());
    }
    let original_metadata = fs::symlink_metadata(directory)
        .map_err(|error| format!("Le dossier de formation est introuvable: {error}"))?;
    if original_metadata.file_type().is_symlink() || !original_metadata.file_type().is_dir() {
        return Err(
            "La formation doit être importée depuis un dossier réel, pas un lien symbolique."
                .into(),
        );
    }
    let directory = fs::canonicalize(directory)
        .map_err(|error| format!("Impossible de sécuriser le dossier de formation: {error}"))?;
    let directory_name = directory
        .file_name()
        .and_then(|name| name.to_str())
        .filter(|name| !name.is_empty())
        .ok_or_else(|| "Le nom du dossier de formation est invalide.".to_string())?
        .to_owned();

    for entry in fs::read_dir(&directory)
        .map_err(|error| format!("Impossible d’inspecter le dossier de formation: {error}"))?
    {
        let entry = entry.map_err(|error| format!("Entrée de dossier illisible: {error}"))?;
        let name = entry.file_name();
        let Some(name) = name.to_str() else {
            return Err("Le dossier contient un nom de fichier non UTF-8.".into());
        };
        if name.to_ascii_lowercase().ends_with(".json")
            && !FORMATION_PACKAGE_FILENAMES.contains(&name)
        {
            return Err(format!(
                "Le fichier JSON inattendu « {name} » est interdit à la racine du dossier."
            ));
        }
    }

    let mut total_size = 0_u64;
    let mut read =
        |filename: &str| read_formation_json_file(&directory.join(filename), &mut total_size);
    Ok(FormationPackageFiles {
        directory_name,
        formation: read("formation.json")?,
        subjects: read("matieres.json")?,
        curriculum: read("programme.json")?,
        schedule: read("planning.json")?,
        assessments: read("evaluations.json")?,
        tasks: read("taches.json")?,
    })
}

fn write_formation_kit_file(destination: &Path, content: &[u8]) -> CommandResult<PathBuf> {
    if content.len() > MAX_FORMATION_KIT_SIZE {
        return Err(format!(
            "Le kit dépasse la limite de {} Mio.",
            MAX_FORMATION_KIT_SIZE / (1024 * 1024)
        ));
    }
    if !content.starts_with(b"PK\x03\x04") {
        return Err("Le kit généré ne possède pas une signature ZIP reconnue.".into());
    }
    if !destination.is_absolute() {
        return Err("Le chemin du kit doit être absolu.".into());
    }
    if !destination
        .extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("zip"))
    {
        return Err("Le kit doit utiliser l’extension .zip.".into());
    }
    let filename = destination
        .file_name()
        .ok_or_else(|| "Le nom du kit est absent.".to_string())?;
    let parent = destination
        .parent()
        .ok_or_else(|| "Le dossier du kit est absent.".to_string())?;
    let canonical_parent = fs::canonicalize(parent)
        .map_err(|error| format!("Impossible de sécuriser le dossier de destination: {error}"))?;
    let destination = canonical_parent.join(filename);
    match fs::symlink_metadata(&destination) {
        Ok(metadata) if metadata.file_type().is_symlink() || !metadata.file_type().is_file() => {
            return Err("La destination doit être un fichier régulier, pas un lien.".into())
        }
        Ok(_) => {}
        Err(error) if error.kind() == io::ErrorKind::NotFound => {}
        Err(error) => return Err(format!("Impossible de vérifier le kit: {error}")),
    }

    let sequence = ASSESSMENT_TEMP_COUNTER.fetch_add(1, Ordering::Relaxed);
    let staging = canonical_parent.join(format!(
        ".dowze-formation-kit-{}-{sequence}.tmp",
        std::process::id()
    ));
    let write_result = (|| -> CommandResult<()> {
        let mut file = OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(&staging)
            .map_err(|error| format!("Impossible de préparer le kit: {error}"))?;
        file.write_all(content)
            .and_then(|_| file.sync_all())
            .map_err(|error| format!("Impossible d’enregistrer le kit: {error}"))?;
        replace_file_atomically(&staging, &destination)
            .map_err(|error| format!("Impossible de finaliser le kit: {error}"))?;
        Ok(())
    })();
    if write_result.is_err() {
        let _ = fs::remove_file(&staging);
    }
    write_result?;
    Ok(destination)
}

fn calendar_export_cache_directory(caller: &Webview) -> CommandResult<PathBuf> {
    let cache = caller
        .app_handle()
        .path()
        .app_cache_dir()
        .map_err(|error| format!("Impossible de localiser le cache de l’application: {error}"))?;
    fs::create_dir_all(&cache)
        .map_err(|error| format!("Impossible de préparer le cache de l’application: {error}"))?;
    let directory = cache.join(CALENDAR_EXPORTS_DIRECTORY);
    fs::create_dir_all(&directory)
        .map_err(|error| format!("Impossible de préparer les exports calendrier: {error}"))?;
    Ok(directory)
}

fn validate_calendar_filename(filename: &str) -> CommandResult<&str> {
    validate_calendar_text(filename, "Le nom du fichier calendrier", 240)?;
    if filename.chars().any(char::is_control) {
        return Err("Le nom du calendrier contient un caractère de contrôle interdit.".into());
    }
    let path = Path::new(filename);
    if path.file_name().and_then(|name| name.to_str()) != Some(filename)
        || !path
            .extension()
            .and_then(|extension| extension.to_str())
            .is_some_and(|extension| extension.eq_ignore_ascii_case("ics"))
    {
        return Err("Le nom du calendrier doit être un simple fichier .ics.".into());
    }
    Ok(filename)
}

fn ai_panel(caller: &Webview) -> Option<Webview> {
    caller
        .window()
        .webviews()
        .into_iter()
        .find(|webview| webview.label() == AI_PANEL_LABEL)
}

fn required_ai_panel(caller: &Webview) -> CommandResult<Webview> {
    ai_panel(caller).ok_or_else(|| "Le panneau IA n’est pas encore initialisé.".into())
}

fn authentication_popup_title(url: &Url) -> &'static str {
    match url.domain() {
        Some(host) if is_domain_or_subdomain(host, "accounts.google.com") => {
            "Connexion Google · Dowze Academie"
        }
        Some(host) if is_domain_or_subdomain(host, "appleid.apple.com") => {
            "Connexion Apple · Dowze Academie"
        }
        Some(host) if is_domain_or_subdomain(host, "login.microsoftonline.com") => {
            "Connexion Microsoft · Dowze Academie"
        }
        Some(host) if is_domain_or_subdomain(host, "auth.openai.com") => {
            "Connexion ChatGPT · Dowze Academie"
        }
        Some(host) if is_domain_or_subdomain(host, "auth.mistral.ai") => {
            "Connexion Mistral · Dowze Academie"
        }
        _ => "Connexion web · Dowze Academie",
    }
}

fn build_embedded_auth_popup(
    app: &tauri::AppHandle,
    requested_url: &Url,
    features: NewWindowFeatures,
) -> CommandResult<WebviewWindow> {
    let sequence = AUTH_POPUP_COUNTER.fetch_add(1, Ordering::Relaxed);
    let label = format!("{AUTH_POPUP_LABEL_PREFIX}{sequence}");
    let blank_url = Url::parse("about:blank").expect("about:blank is a valid static URL");

    WebviewWindowBuilder::new(app, label, WebviewUrl::External(blank_url))
        // `window_features` reuses the opener's WKWebViewConfiguration on
        // macOS. That is required by WebKit for window.open and retains the
        // same persistent default website data store without copying cookies.
        .window_features(features)
        // Apply trusted application geometry after the untrusted page's
        // window.open features so it cannot place or shrink the popup.
        .title(authentication_popup_title(requested_url))
        .inner_size(620.0, 760.0)
        .min_inner_size(420.0, 520.0)
        .center()
        .incognito(false)
        .devtools(false)
        .on_navigation(|url| validate_webview_navigation(url).is_ok())
        .on_new_window(|url, _features| {
            if is_safe_external_target(&url) {
                let _ = open::that_detached(url.as_str());
            }
            NewWindowResponse::Deny
        })
        .on_download(|_webview, _event| false)
        .build()
        .map_err(|error| format!("Impossible de créer la fenêtre d’authentification: {error}"))
}

fn managed_remote_windows(caller: &Webview) -> Vec<WebviewWindow> {
    caller
        .app_handle()
        .webview_windows()
        .into_iter()
        .filter_map(|(label, window)| is_managed_remote_window_label(&label).then_some(window))
        .collect()
}

#[cfg(target_os = "macos")]
fn matching_google_web_data_records(
    records: NonNull<NSArray<WKWebsiteDataRecord>>,
) -> Vec<Retained<WKWebsiteDataRecord>> {
    // SAFETY: WebKit owns this non-null NSArray for the duration of its
    // completion callback. `to_vec` retains each record before the callback
    // returns, so the resulting values remain valid for the removal request.
    let records = unsafe { records.as_ref() }.to_vec();
    records
        .into_iter()
        .filter(|record| {
            // SAFETY: `displayName` is a main-thread-only WebKit accessor and
            // this helper is called only from WebKit's main-thread callback.
            let display_name = unsafe { record.displayName() };
            is_google_web_data_record_name(&display_name.to_string())
        })
        .collect()
}

#[cfg(target_os = "macos")]
fn schedule_google_web_data_removal(
    platform_webview: tauri::webview::PlatformWebview,
    result_sender: mpsc::SyncSender<CommandResult<usize>>,
    operation_cancelled: Arc<AtomicBool>,
) {
    let Some(main_thread_marker) = MainThreadMarker::new() else {
        let _ = result_sender.send(Err(
            "La suppression des données Google doit être préparée sur le thread principal.".into(),
        ));
        return;
    };

    let webview_pointer = platform_webview.inner().cast::<WKWebView>();
    // SAFETY: Tauri provides the live platform WKWebView pointer to this
    // main-thread closure. A null handle is treated as an explicit error.
    let Some(webview) = (unsafe { webview_pointer.as_ref() }) else {
        let _ = result_sender.send(Err("La WebView principale est indisponible.".into()));
        return;
    };

    // SAFETY: All WebKit objects below are accessed on the main thread. The
    // retained store and type set are captured by copied Objective-C blocks.
    let (data_store, all_data_types) = unsafe {
        let configuration = webview.configuration();
        (
            configuration.websiteDataStore(),
            WKWebsiteDataStore::allWebsiteDataTypes(main_thread_marker),
        )
    };

    let fetch_store = data_store.clone();
    let fetch_types = all_data_types.clone();
    let fetch_sender = result_sender.clone();
    let fetch_handler = RcBlock::new(move |records: NonNull<NSArray<WKWebsiteDataRecord>>| {
        if operation_cancelled.load(Ordering::Acquire) {
            return;
        }
        let matching_records = matching_google_web_data_records(records);
        let removed_record_count = matching_records.len();
        if matching_records.is_empty() {
            let _ = fetch_sender.send(Ok(0));
            return;
        }

        let records_to_remove = NSArray::from_retained_slice(&matching_records);
        let removal_store = fetch_store.clone();
        let verify_store = fetch_store.clone();
        let removal_types = fetch_types.clone();
        let verify_types = fetch_types.clone();
        let removal_sender = fetch_sender.clone();
        let removal_cancelled = Arc::clone(&operation_cancelled);

        let removal_handler = RcBlock::new(move || {
            if removal_cancelled.load(Ordering::Acquire) {
                return;
            }
            let verification_sender = removal_sender.clone();
            let verification_handler = RcBlock::new(
                move |remaining_records: NonNull<NSArray<WKWebsiteDataRecord>>| {
                    let remaining = matching_google_web_data_records(remaining_records);
                    let result = if remaining.is_empty() {
                        Ok(removed_record_count)
                    } else {
                        Err(format!(
                                "WebKit conserve encore {} groupe(s) de données Google après la suppression.",
                                remaining.len()
                            ))
                    };
                    let _ = verification_sender.send(result);
                },
            );

            // SAFETY: WebKit invokes the removal completion on its main
            // thread. The store, data types and block are retained here.
            unsafe {
                verify_store.fetchDataRecordsOfTypes_completionHandler(
                    &verify_types,
                    &verification_handler,
                );
            }
        });

        // SAFETY: This callback is running on WebKit's main thread. The
        // NSArray retains the exact records selected from the same store.
        if operation_cancelled.load(Ordering::Acquire) {
            return;
        }
        unsafe {
            removal_store.removeDataOfTypes_forDataRecords_completionHandler(
                &removal_types,
                &records_to_remove,
                &removal_handler,
            );
        }
    });

    // SAFETY: The call is made on the main thread and WebKit copies the
    // completion block for its asynchronous record fetch.
    unsafe {
        data_store.fetchDataRecordsOfTypes_completionHandler(&all_data_types, &fetch_handler);
    }
}

#[cfg(target_os = "macos")]
async fn remove_google_website_data(caller: Webview) -> CommandResult<usize> {
    let (result_sender, result_receiver) = mpsc::sync_channel(1);
    let scheduling_sender = result_sender.clone();
    let operation_cancelled = Arc::new(AtomicBool::new(false));
    let scheduling_cancelled = Arc::clone(&operation_cancelled);
    caller
        .with_webview(move |platform_webview| {
            schedule_google_web_data_removal(
                platform_webview,
                scheduling_sender,
                scheduling_cancelled,
            );
        })
        .map_err(|error| {
            format!("Impossible d’accéder au stockage WebKit de l’application: {error}")
        })?;
    drop(result_sender);

    let timeout_cancelled = Arc::clone(&operation_cancelled);
    let callback_result = tauri::async_runtime::spawn_blocking(move || {
        result_receiver
            .recv_timeout(GOOGLE_WEB_DATA_OPERATION_TIMEOUT)
            .map_err(|error| {
                timeout_cancelled.store(true, Ordering::Release);
                match error {
                    mpsc::RecvTimeoutError::Timeout => {
                        "WebKit n’a pas terminé la suppression des données Google dans le délai prévu."
                            .to_string()
                    }
                    mpsc::RecvTimeoutError::Disconnected => {
                        "WebKit a interrompu la suppression des données Google.".to_string()
                    }
                }
            })
    })
    .await
    .map_err(|error| format!("La tâche de suppression Google s’est interrompue: {error}"))??;

    callback_result
}

#[cfg(target_os = "macos")]
async fn request_macos_microphone_access(
    app: tauri::AppHandle,
) -> CommandResult<MicrophoneAccessStatus> {
    let (result_sender, result_receiver) = mpsc::sync_channel(1);
    app.run_on_main_thread(move || {
        // SAFETY: `AVMediaTypeAudio` is an immutable AVFoundation framework
        // constant that is available on every supported macOS release.
        let Some(media_type) = (unsafe { AVMediaTypeAudio }) else {
            let _ = result_sender.send(MicrophoneAccessStatus::Unsupported);
            return;
        };

        // SAFETY: This class-level authorization query runs on the app's main
        // thread and uses AVFoundation's canonical audio media constant.
        let status = unsafe { AVCaptureDevice::authorizationStatusForMediaType(media_type) };
        match status {
            AVAuthorizationStatus::Authorized => {
                let _ = result_sender.send(MicrophoneAccessStatus::Authorized);
            }
            AVAuthorizationStatus::Denied => {
                let _ = result_sender.send(MicrophoneAccessStatus::Denied);
            }
            AVAuthorizationStatus::Restricted => {
                let _ = result_sender.send(MicrophoneAccessStatus::Restricted);
            }
            AVAuthorizationStatus::NotDetermined => {
                let completion_handler = RcBlock::new(move |granted: Bool| {
                    let status = if granted.as_bool() {
                        MicrophoneAccessStatus::Authorized
                    } else {
                        MicrophoneAccessStatus::Denied
                    };
                    let _ = result_sender.send(status);
                });

                // SAFETY: The media type is AVMediaTypeAudio and AVFoundation
                // copies the completion block for its asynchronous TCC request.
                // This asks for consent only; it does not start audio capture.
                unsafe {
                    AVCaptureDevice::requestAccessForMediaType_completionHandler(
                        media_type,
                        &completion_handler,
                    );
                }
            }
            _ => {
                let _ = result_sender.send(MicrophoneAccessStatus::Unsupported);
            }
        }
    })
    .map_err(|error| format!("Impossible de préparer la demande d’accès au microphone: {error}"))?;

    tauri::async_runtime::spawn_blocking(move || {
        result_receiver
            .recv_timeout(MICROPHONE_PERMISSION_OPERATION_TIMEOUT)
            .map_err(|error| match error {
                mpsc::RecvTimeoutError::Timeout => {
                    "La demande d’accès au microphone n’a pas reçu de réponse dans le délai prévu."
                        .to_string()
                }
                mpsc::RecvTimeoutError::Disconnected => {
                    "macOS a interrompu la demande d’accès au microphone.".to_string()
                }
            })
    })
    .await
    .map_err(|error| format!("La demande d’accès au microphone s’est interrompue: {error}"))?
}

fn account_transition_home(provider: AiProvider) -> CommandResult<Option<Url>> {
    if provider == AiProvider::Freechat {
        Ok(None)
    } else {
        provider.start_url().map(Some)
    }
}

fn emit_navigation(app: &tauri::AppHandle, url: &Url, provider: AiProvider) {
    let _ = app.emit_to(
        MAIN_WEBVIEW_LABEL,
        "ai-navigation",
        AiNavigationPayload {
            url: url.as_str().to_owned(),
            provider,
        },
    );
}

fn json_string_literal(value: &str) -> CommandResult<String> {
    // Tauri's IPC serializer delegates Serialize values to serde_json. Reusing it
    // here keeps untrusted text inside a JSON string literal before webview.eval.
    match value
        .to_owned()
        .body()
        .map_err(|error| format!("Impossible d’échapper le contenu du cours IA: {error}"))?
    {
        InvokeResponseBody::Json(json) => Ok(json),
        InvokeResponseBody::Raw(_) => Err("Sérialisation inattendue du cours IA.".into()),
    }
}

fn lesson_provider_script_config(provider: AiProvider) -> Option<&'static str> {
    match provider {
        AiProvider::Chatgpt => Some(
            r##"
const composerSelectors = [
  "#prompt-textarea",
  "textarea[data-testid=\"composer-text-input\"]",
  "[data-testid=\"composer-text-input\"][contenteditable=\"true\"]",
  "form div.ProseMirror[contenteditable=\"true\"]",
  "form [role=\"textbox\"][contenteditable=\"true\"]"
];
const isExpectedNewChatLocation = () =>
  window.location.protocol === "https:" &&
  (window.location.hostname === "chatgpt.com" ||
    window.location.hostname.endsWith(".chatgpt.com")) &&
  window.location.pathname === "/";
const scopeSelector = "form";
const sendSelectors = [
  "button[data-testid=\"send-button\"]",
  "button[data-testid=\"composer-submit-button\"]",
  "button[aria-label=\"Send prompt\"]",
  "button[aria-label=\"Send message\"]",
  "button[aria-label=\"Envoyer le prompt\"]",
  "button[aria-label=\"Envoyer le message\"]"
];
"##,
        ),
        AiProvider::Claude => Some(
            r#"
const composerSelectors = [
  "[data-testid=\"chat-input\"] textarea",
  "[data-testid=\"chat-input\"][contenteditable=\"true\"]",
  "[data-testid=\"chat-input\"] [contenteditable=\"true\"]",
  "fieldset div.ProseMirror[contenteditable=\"true\"]",
  "form div.ProseMirror[contenteditable=\"true\"]",
  "fieldset [role=\"textbox\"][contenteditable=\"true\"]"
];
const isExpectedNewChatLocation = () =>
  window.location.protocol === "https:" &&
  (window.location.hostname === "claude.ai" ||
    window.location.hostname.endsWith(".claude.ai")) &&
  ["/", "/new", "/new/"].includes(window.location.pathname);
const scopeSelector = "form, fieldset, [data-testid=\"chat-input-container\"]";
const sendSelectors = [
  "button[data-testid=\"send-button\"]",
  "button[aria-label=\"Send Message\"]",
  "button[aria-label=\"Send message\"]",
  "button[aria-label=\"Send\"]",
  "button[aria-label=\"Envoyer le message\"]",
  "button[aria-label=\"Envoyer\"]",
  "button[type=\"submit\"]"
];
"#,
        ),
        AiProvider::Gemini => Some(
            r#"
const composerSelectors = [
  "rich-textarea .ql-editor[contenteditable=\"true\"]",
  "div.ql-editor[contenteditable=\"true\"]",
  "[role=\"textbox\"][contenteditable=\"true\"]",
  "form textarea"
];
const isExpectedNewChatLocation = () =>
  window.location.protocol === "https:" &&
  (window.location.hostname === "gemini.google.com" ||
    window.location.hostname.endsWith(".gemini.google.com")) &&
  ["/app", "/app/"].includes(window.location.pathname);
const scopeSelector = "form, .input-area-container, main, [role=\"main\"]";
const sendSelectors = [
  "button.send-button",
  "button[data-test-id=\"send-button\"]",
  "button[aria-label=\"Send message\"]",
  "button[aria-label=\"Send prompt\"]",
  "button[aria-label=\"Envoyer le message\"]",
  "button[aria-label=\"Envoyer la requête\"]"
];
"#,
        ),
        AiProvider::Mistral => Some(
            r#"
const composerSelectors = [
  "form textarea",
  "form div.ProseMirror[contenteditable=\"true\"]",
  "form [role=\"textbox\"][contenteditable=\"true\"]",
  "[data-testid=\"chat-input\"] textarea",
  "[data-testid=\"chat-input\"] [contenteditable=\"true\"]"
];
const isExpectedNewChatLocation = () =>
  window.location.protocol === "https:" &&
  (window.location.hostname === "chat.mistral.ai" ||
    window.location.hostname.endsWith(".chat.mistral.ai")) &&
  ["/chat", "/chat/"].includes(window.location.pathname);
const scopeSelector = "form, [data-testid=\"chat-input-container\"]";
const sendSelectors = [
  "button[data-testid=\"send-button\"]",
  "button[aria-label=\"Send message\"]",
  "button[aria-label=\"Send\"]",
  "button[aria-label=\"Envoyer le message\"]",
  "button[aria-label=\"Envoyer\"]",
  "button[type=\"submit\"]"
];
"#,
        ),
        AiProvider::Deepseek => Some(
            r#"
const composerSelectors = [
  "textarea#chat-input",
  "textarea[data-testid=\"chat-input\"]",
  "form textarea",
  "main textarea",
  "form [role=\"textbox\"][contenteditable=\"true\"]",
  "main [role=\"textbox\"][contenteditable=\"true\"]"
];
const isExpectedNewChatLocation = () =>
  window.location.protocol === "https:" &&
  window.location.hostname === "chat.deepseek.com" &&
  window.location.pathname === "/";
const scopeSelector = "form, main, [role=\"main\"]";
const sendSelectors = [
  "button[data-testid=\"send-button\"]",
  "button[aria-label=\"Send message\"]",
  "button[aria-label=\"Send\"]",
  "button[aria-label=\"Envoyer le message\"]",
  "button[aria-label=\"Envoyer\"]",
  "button[type=\"submit\"]"
];
"#,
        ),
        AiProvider::Kimi => Some(
            r#"
const composerSelectors = [
  ".chat-input-editor[contenteditable=\"true\"]",
  ".chat-input-editor[role=\"textbox\"]",
  "[role=\"textbox\"][contenteditable=\"true\"]",
  "form textarea"
];
const isExpectedNewChatLocation = () =>
  window.location.protocol === "https:" &&
  ["kimi.com", "www.kimi.com"].includes(window.location.hostname) &&
  window.location.pathname === "/";
const scopeSelector = ".chat-editor, #chat-box, form, main";
const sendSelectors = [
  ".send-button-container:not(.disabled)",
  "button[data-testid=\"send-button\"]",
  "button[aria-label=\"Send message\"]",
  "button[aria-label=\"Send\"]",
  "button[aria-label=\"Envoyer le message\"]",
  "button[aria-label=\"Envoyer\"]",
  "button[type=\"submit\"]"
];
"#,
        ),
        AiProvider::Freechat
        | AiProvider::Duolingo
        | AiProvider::Khanacademy
        | AiProvider::Youtube
        | AiProvider::Tiktok
        | AiProvider::Notebooklm => None,
    }
}

const LESSON_INJECTION_SCRIPT_BODY: &str = r#"
if (!isExpectedNewChatLocation()) return;

const guardKey = "__ETUDE_AI_LESSON_GUARD__";
const existingGuard = window[guardKey];
if (existingGuard && existingGuard.lessonId === lessonId) return;

const guard = { lessonId, status: "polling" };
Object.defineProperty(window, guardKey, {
  value: guard,
  configurable: true,
  writable: true
});

const maxAttempts = 120;
let attempts = 0;
let filled = false;
let filledComposer = null;
let timer = null;

const stop = (status) => {
  guard.status = status;
  if (timer !== null) window.clearInterval(timer);
};

const findComposer = () => {
  for (const selector of composerSelectors) {
    const candidate = document.querySelector(selector);
    if (
      (candidate instanceof HTMLTextAreaElement ||
        (candidate instanceof HTMLElement && candidate.isContentEditable)) &&
      candidate.isConnected &&
      candidate.getClientRects().length > 0 &&
      candidate.getAttribute("aria-disabled") !== "true" &&
      !(candidate instanceof HTMLTextAreaElement &&
        (candidate.disabled || candidate.readOnly))
    ) {
      return candidate;
    }
  }
  return null;
};

const writePrompt = (composer) => {
  composer.focus();

  if (composer instanceof HTMLTextAreaElement) {
    const valueSetter = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value"
    )?.set;
    if (!valueSetter) return false;
    valueSetter.call(composer, prompt);
  } else if (composer instanceof HTMLElement && composer.isContentEditable) {
    const fragment = document.createDocumentFragment();
    for (const line of prompt.split("\n")) {
      const paragraph = document.createElement("p");
      if (line) paragraph.textContent = line;
      else paragraph.append(document.createElement("br"));
      fragment.append(paragraph);
    }
    composer.replaceChildren(fragment);

    const selection = window.getSelection();
    if (selection) {
      const range = document.createRange();
      range.selectNodeContents(composer);
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);
    }
  } else {
    return false;
  }

  try {
    composer.dispatchEvent(new InputEvent("input", {
      bubbles: true,
      inputType: "insertText",
      data: prompt
    }));
  } catch (_) {
    composer.dispatchEvent(new Event("input", { bubbles: true }));
  }
  composer.dispatchEvent(new Event("change", { bubbles: true }));
  return hasCompletePrompt(composer);
};

const hasCompletePrompt = (composer) => {
  if (composer instanceof HTMLTextAreaElement) {
    return composer.value === prompt;
  }
  if (!(composer instanceof HTMLElement) || !composer.isContentEditable) {
    return false;
  }

  const expectedLines = prompt.split("\n");
  const blocks = Array.from(composer.children);
  return blocks.length === expectedLines.length && blocks.every(
    (block, index) => (block.textContent ?? "") === expectedLines[index]
  );
};

const findSendButton = (scope) => {
  for (const selector of sendSelectors) {
    const candidate = scope.querySelector(selector);
    if (
      candidate instanceof HTMLElement &&
      candidate.isConnected &&
      !(candidate instanceof HTMLButtonElement && candidate.disabled) &&
      !candidate.matches("[disabled], .disabled") &&
      candidate.getAttribute("aria-disabled") !== "true" &&
      candidate.getClientRects().length > 0
    ) {
      return candidate;
    }
  }
  return null;
};

const tick = () => {
  attempts += 1;
  if (attempts > maxAttempts) {
    stop("expired");
    return;
  }
  if (!isExpectedNewChatLocation()) {
    stop("navigation-changed");
    return;
  }

  const composer = findComposer();
  if (!composer) return;
  const scope = composer.closest(scopeSelector);
  if (!scope) return;

  // Provider UIs may replace their editor node during hydration. Never click
  // Send for a new node before the complete prompt has been written to it.
  if (filledComposer !== null && filledComposer !== composer) {
    filled = false;
    filledComposer = null;
  }

  if (!filled) {
    filled = writePrompt(composer);
    if (filled) filledComposer = composer;
    return;
  }

  if (!hasCompletePrompt(composer)) {
    filled = false;
    filledComposer = null;
    return;
  }

  const sendButton = findSendButton(scope);
  if (!sendButton) return;

  stop("sent");
  sendButton.click();
};

timer = window.setInterval(tick, 250);
tick();
})();
"#;

fn lesson_injection_script(lesson: &PendingLesson) -> CommandResult<String> {
    let prompt_json = json_string_literal(&lesson.prompt)?;
    let lesson_id_json = json_string_literal(&lesson.lesson_id)?;
    let provider_config = lesson_provider_script_config(lesson.provider).ok_or_else(|| {
        "L’injection automatique d’un cours n’est pas disponible pour ce service.".to_string()
    })?;
    let mut script = String::with_capacity(
        prompt_json.len()
            + lesson_id_json.len()
            + provider_config.len()
            + LESSON_INJECTION_SCRIPT_BODY.len()
            + 96,
    );
    script.push_str("(() => {\n\"use strict\";\nconst prompt = ");
    script.push_str(&prompt_json);
    script.push_str(";\nconst lessonId = ");
    script.push_str(&lesson_id_json);
    script.push_str(";\n");
    script.push_str(provider_config);
    script.push_str(LESSON_INJECTION_SCRIPT_BODY);
    Ok(script)
}

fn restore_pending_lesson(
    state: &PendingLessonState,
    auth_state: &local_auth::LocalAuthState,
    lesson: PendingLesson,
) {
    if auth_state
        .require_active_account(&lesson.account_id)
        .is_err()
    {
        return;
    }
    if let Ok(mut pending) = state.pending.lock() {
        if pending.is_none() {
            *pending = Some(lesson);
        }
    }
}

fn handle_pending_lesson_page_load(webview: &Webview, payload: &PageLoadPayload<'_>) {
    if webview.label() != AI_PANEL_LABEL {
        return;
    }

    let Ok(provider) = provider_for_url(payload.url()) else {
        return;
    };
    if !is_provider_new_chat_url(payload.url(), provider) {
        return;
    }
    let state = webview.app_handle().state::<PendingLessonState>();
    let auth_state = webview.app_handle().state::<local_auth::LocalAuthState>();

    if payload.event() == PageLoadEvent::Started {
        if let Ok(mut pending) = state.pending.lock() {
            if let Some(lesson) = pending.as_mut() {
                if auth_state
                    .require_active_account(&lesson.account_id)
                    .is_err()
                {
                    *pending = None;
                } else if lesson.provider == provider {
                    lesson.navigation_started = true;
                }
            }
        }
        return;
    }

    if payload.event() != PageLoadEvent::Finished {
        return;
    }

    let lesson = state.pending.lock().ok().and_then(|mut pending| {
        let is_expected_page = pending
            .as_ref()
            .is_some_and(|lesson| lesson.provider == provider && lesson.navigation_started);
        is_expected_page.then(|| pending.take()).flatten()
    });
    let Some(lesson) = lesson else {
        return;
    };
    if auth_state
        .require_active_account(&lesson.account_id)
        .is_err()
    {
        return;
    }

    let evaluation = lesson_injection_script(&lesson).and_then(|script| {
        webview
            .eval(script)
            .map_err(|error| format!("Injection du cours IA impossible: {error}"))
    });
    if evaluation.is_err() {
        restore_pending_lesson(&state, &auth_state, lesson);
    }
}

// GTK's vertical box ignores child webview coordinates. Keep the main view
// filling the window and place the remote widget in an aligned GTK overlay.
#[cfg(target_os = "linux")]
fn position_linux_panel(webview: &Webview, bounds: PanelBounds) -> CommandResult<()> {
    webview.with_webview(move |platform| {
        use gtk::prelude::*;
        let panel = platform.inner();
        if let Some(container) = panel.parent().and_then(|p| p.downcast::<gtk::Box>().ok()) {
            container.remove(&panel);
            let overlay = container.children().into_iter()
                .find_map(|child| child.downcast::<gtk::Overlay>().ok())
                .unwrap_or_else(|| {
                    let overlay = gtk::Overlay::new();
                    overlay.set_hexpand(true);
                    overlay.set_vexpand(true);
                    if let Some(main) = container.children().first() {
                        container.remove(main);
                        main.set_size_request(1, 1);
                        main.set_hexpand(true);
                        main.set_vexpand(true);
                        overlay.add(main);
                    }
                    container.pack_start(&overlay, true, true, 0);
                    overlay.show_all();
                    overlay
                });
            overlay.add_overlay(&panel);
        }
        panel.set_halign(gtk::Align::Start);
        panel.set_valign(gtk::Align::Start);
        panel.set_margin_start(bounds.x.round() as i32);
        panel.set_margin_top(bounds.y.round() as i32);
        panel.set_size_request(bounds.width.round() as i32, bounds.height.round() as i32);
    }).map_err(|error| format!("Positionnement GTK impossible: {error}"))
}

fn update_existing_panel(
    webview: &Webview,
    visible: bool,
    bounds: PanelBounds,
) -> CommandResult<()> {
    #[cfg(target_os = "linux")]
    position_linux_panel(webview, bounds)?;
    #[cfg(not(target_os = "linux"))]
    webview
        .set_position(bounds.position())
        .map_err(|error| format!("Impossible de positionner le panneau IA: {error}"))?;
    #[cfg(not(target_os = "linux"))]
    webview
        .set_size(bounds.size())
        .map_err(|error| format!("Impossible de redimensionner le panneau IA: {error}"))?;

    if visible {
        webview
            .show()
            .map_err(|error| format!("Impossible d’afficher le panneau IA: {error}"))
    } else {
        webview
            .hide()
            .map_err(|error| format!("Impossible de masquer le panneau IA: {error}"))
    }
}

#[tauri::command]
fn open_google_web_profile(
    caller: Webview,
    remote_state: State<'_, RemoteWebSessionState>,
) -> CommandResult<()> {
    require_main_caller(&caller)?;
    remote_state.ensure_available()?;
    let app = caller.app_handle();

    if let Some(window) = app.get_webview_window(GOOGLE_WEB_PROFILE_LABEL) {
        window
            .show()
            .map_err(|error| format!("Impossible d’afficher la fenêtre Google: {error}"))?;
        return window
            .set_focus()
            .map_err(|error| format!("Impossible d’activer la fenêtre Google: {error}"));
    }

    let initial_url = Url::parse(GOOGLE_WEB_PROFILE_URL)
        .map_err(|error| format!("URL du profil Google invalide: {error}"))?;
    let window = WebviewWindowBuilder::new(
        app,
        GOOGLE_WEB_PROFILE_LABEL,
        WebviewUrl::External(initial_url),
    )
    .title("Compte Google · Dowze Academie")
    .inner_size(620.0, 760.0)
    .min_inner_size(460.0, 560.0)
    .center()
    // The same non-incognito default WKWebsiteDataStore is used by ai-panel.
    // We deliberately neither spoof the user agent nor read or copy cookies.
    .incognito(false)
    .devtools(false)
    .on_navigation(|url| validate_google_web_profile_navigation(url).is_ok())
    .on_new_window(|url, _features| {
        if is_safe_external_target(&url) {
            let _ = open::that_detached(url.as_str());
        }
        NewWindowResponse::Deny
    })
    .on_download(|_webview, _event| false)
    .build()
    .map_err(|error| format!("Impossible d’ouvrir la fenêtre Google: {error}"))?;

    // Cover a transition that began after the preflight check but before the
    // window finished registering with Tauri's manager.
    if remote_state.is_account_transition_in_progress() {
        let _ = window.hide();
        let _ = window.close();
        return Err(
            "La fenêtre Google a été refermée car un changement de compte est en cours.".into(),
        );
    }

    window
        .set_focus()
        .map_err(|error| format!("Impossible d’activer la fenêtre Google: {error}"))
}

#[tauri::command]
fn native_capabilities(caller: Webview) -> CommandResult<NativeCapabilities> {
    require_main_caller(&caller)?;

    #[cfg(target_os = "macos")]
    let platform = "macos";
    #[cfg(target_os = "windows")]
    let platform = "windows";
    #[cfg(target_os = "linux")]
    let platform = "linux";
    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    let platform = "other";

    Ok(NativeCapabilities {
        platform,
        google_web_profile_removal: cfg!(target_os = "macos"),
        microphone_access_request: cfg!(target_os = "macos"),
    })
}

#[tauri::command]
async fn request_microphone_access(caller: Webview) -> CommandResult<MicrophoneAccessStatus> {
    require_main_caller(&caller)?;

    #[cfg(target_os = "macos")]
    {
        request_macos_microphone_access(caller.app_handle().clone()).await
    }

    #[cfg(not(target_os = "macos"))]
    {
        Ok(MicrophoneAccessStatus::Unsupported)
    }
}

#[tauri::command]
async fn remove_google_web_profile(
    caller: Webview,
    pending_state: State<'_, PendingLessonState>,
    remote_state: State<'_, RemoteWebSessionState>,
    capture_state: State<'_, panel_capture::PanelCaptureState>,
) -> CommandResult<GoogleWebProfileRemovalResult> {
    require_main_caller(&caller)?;
    capture_state.invalidate("Capture arrêtée pendant la suppression de la session web Google.");

    #[cfg(not(target_os = "macos"))]
    {
        let _ = (&pending_state, &remote_state);
        return Err(
            "La suppression ciblée de la session Google est disponible uniquement sur macOS. Aucune autre session web n’a été effacée."
                .into(),
        );
    }

    #[cfg(target_os = "macos")]
    {
        // The guard prevents a late sync or window.open callback from creating
        // a remote WebView while the shared WebKit store is being changed. It
        // is released automatically on every return path, including timeout.
        let _transition_guard = remote_state.begin_account_transition()?;
        let panel = ai_panel(&caller);
        let remote_windows = managed_remote_windows(&caller);
        let mut failures = Vec::new();

        match pending_state.pending.lock() {
            Ok(mut pending) => *pending = None,
            Err(_) => failures.push("L’état du cours IA est indisponible.".to_string()),
        }

        if let Some(webview) = panel.as_ref() {
            if let Err(error) = webview.hide() {
                failures.push(format!("Impossible de masquer le panneau IA: {error}"));
            }
        }
        for window in &remote_windows {
            if let Err(error) = window.hide() {
                failures.push(format!(
                    "Impossible de masquer la fenêtre web {}: {error}",
                    window.label()
                ));
            }
        }

        // Destroy every remote document before touching the common data store
        // so a still-running Google page cannot recreate a cookie or cache.
        if let Some(webview) = panel {
            if let Err(error) = webview.close() {
                failures.push(format!("Impossible de fermer le panneau IA: {error}"));
            }
        }
        for window in remote_windows {
            if let Err(error) = window.close() {
                failures.push(format!(
                    "Impossible de fermer la fenêtre web {}: {error}",
                    window.label()
                ));
            }
        }

        if !failures.is_empty() {
            return Err(format!(
                "La suppression Google a été annulée avant de toucher aux données. {}",
                failures.join(" ")
            ));
        }

        let removed_records = remove_google_website_data(caller).await?;
        Ok(GoogleWebProfileRemovalResult { removed_records })
    }
}

#[tauri::command]
async fn sync_ai_panel(
    caller: Webview,
    remote_state: State<'_, RemoteWebSessionState>,
    visible: bool,
    provider: AiProvider,
    bounds: PanelBounds,
) -> CommandResult<()> {
    require_main_caller(&caller)?;
    remote_state.ensure_available()?;
    let bounds = bounds.validate()?;

    if provider == AiProvider::Freechat {
        if let Some(webview) = ai_panel(&caller) {
            update_existing_panel(&webview, false, bounds)?;
        }
        return Ok(());
    }

    if let Some(webview) = ai_panel(&caller) {
        return update_existing_panel(&webview, visible, bounds);
    }

    if !visible {
        return Ok(());
    }

    let initial_url = provider.start_url()?;
    let navigation_app = caller.app_handle().clone();
    let new_window_app = caller.app_handle().clone();
    let new_window_state = remote_state.inner().clone();
    let page_load_app = caller.app_handle().clone();

    let capture_script = caller
        .app_handle()
        .state::<panel_capture::PanelCaptureState>()
        .initialization_script(provider)?;
    let builder = WebviewBuilder::new(AI_PANEL_LABEL, WebviewUrl::External(initial_url))
        .initialization_script(capture_script)
        // The default persistent data store keeps the user's provider cookies.
        .incognito(false)
        .on_navigation(move |url| {
            let navigation_allowed = validate_webview_navigation(url).is_ok();
            if navigation_allowed {
                navigation_app
                    .state::<panel_capture::PanelCaptureState>()
                    .navigation_started();
                if let Ok(provider) = provider_for_url(url) {
                    emit_navigation(&navigation_app, url, provider);
                }
            }
            navigation_allowed
        })
        .on_new_window(move |url, features| {
            // Keep only known authentication popups inside Dowze Academie. Reusing the
            // opener configuration makes their Google session visible to the
            // provider callback while arbitrary target=_blank links still go
            // to the user's browser.
            if is_embedded_authentication_target(&url) {
                if new_window_state.is_account_transition_in_progress() {
                    return NewWindowResponse::Deny;
                }
                // Refuse bursts in place. Falling back to the system browser
                // here would merely turn a window.open flood into Safari tabs.
                if !has_auth_popup_capacity(auth_popup_window_count(&new_window_app)) {
                    return NewWindowResponse::Deny;
                }
                return match build_embedded_auth_popup(&new_window_app, &url, features) {
                    Ok(window) => {
                        if new_window_state.is_account_transition_in_progress() {
                            let _ = window.hide();
                            let _ = window.close();
                            NewWindowResponse::Deny
                        } else {
                            NewWindowResponse::Create { window }
                        }
                    }
                    Err(_) => {
                        if is_safe_external_target(&url) {
                            let _ = open::that_detached(url.as_str());
                        }
                        NewWindowResponse::Deny
                    }
                };
            }

            if is_safe_external_target(&url) {
                let _ = open::that_detached(url.as_str());
            }
            NewWindowResponse::Deny
        })
        .on_download(|_webview, event| match event {
            // Registering this handler is required for WKWebView downloads.
            // Wry chooses a collision-safe filename in the user's Downloads folder.
            DownloadEvent::Requested { url, .. } => is_safe_download_url(&url),
            DownloadEvent::Finished { .. } => true,
            _ => false,
        })
        .on_page_load(move |webview, payload| {
            if let Ok(provider) = provider_for_url(payload.url()) {
                emit_navigation(&page_load_app, payload.url(), provider);
            }
            handle_pending_lesson_page_load(&webview, &payload);
        });

    let webview = caller
        .window()
        .add_child(builder, bounds.position(), bounds.size())
        .map_err(|error| format!("Impossible de créer le panneau IA: {error}"))?;

    #[cfg(target_os = "linux")]
    position_linux_panel(&webview, bounds)?;

    // A transition can begin while WebKit is finishing the child creation.
    // Close that late child before it can reveal a provider page over the
    // local authentication screen.
    if remote_state.is_account_transition_in_progress() {
        let _ = webview.hide();
        let _ = webview.close();
        return Err("Le panneau IA a été refermé car un changement de compte est en cours.".into());
    }

    webview
        .show()
        .map_err(|error| format!("Impossible d’afficher le panneau IA: {error}"))
}

#[tauri::command]
async fn navigate_ai(
    caller: Webview,
    state: State<'_, PendingLessonState>,
    url: String,
) -> CommandResult<()> {
    require_main_caller(&caller)?;
    let (url, _) = parse_allowed_url(&url)?;
    let remote = caller.app_handle().state::<RemoteWebSessionState>();
    let _transition_guard = remote.begin_account_transition()?;
    let app = caller.app_handle().clone();
    tauri::async_runtime::spawn_blocking(move || panel_capture::drain_before_transition(&app))
        .await
        .map_err(|_| "Sauvegarde interrompue.")??;
    // Any explicit navigation (resources, archived sessions, provider home)
    // cancels a composer injection that may still be waiting on a page load.
    let mut pending = state
        .pending
        .lock()
        .map_err(|_| "L’état du cours IA est indisponible.".to_string())?;
    *pending = None;
    drop(pending);
    required_ai_panel(&caller)?
        .navigate(url)
        .map_err(|error| format!("Navigation IA impossible: {error}"))
}

#[tauri::command]
async fn secure_ai_panel_for_account_transition(
    caller: Webview,
    state: State<'_, PendingLessonState>,
    remote_state: State<'_, RemoteWebSessionState>,
    capture_state: State<'_, panel_capture::PanelCaptureState>,
    provider: AiProvider,
    resume_account_id: Option<String>,
) -> CommandResult<()> {
    require_main_caller(&caller)?;

    // Validate the requested next provider before touching the current panel.
    // The next sync_ai_panel call will recreate this child directly on that
    // provider's home page. Free Chat deliberately has no remote WebView.
    let _next_home = account_transition_home(provider)?;
    let _transition_guard = remote_state.begin_account_transition()?;
    // A main-WebView reload is not an account transition. Reuse only a panel
    // whose native capture owner matches the independently verified session.
    if let Some(account_id) = resume_account_id.as_deref() {
        caller.app_handle().state::<local_auth::LocalAuthState>().require_active_account(account_id)?;
        if capture_state.belongs_to(account_id, provider) && ai_panel(&caller).is_some() {
            return Ok(());
        }
    }

    let app = caller.app_handle().clone();
    tauri::async_runtime::spawn_blocking(move || panel_capture::drain_before_transition(&app))
        .await
        .map_err(|_| "Sauvegarde interrompue.")??;
    capture_state.invalidate("Capture sauvegardée avant le changement de compte ou de formation.");
    let panel = ai_panel(&caller);
    let mut failures = Vec::new();

    // Hiding first prevents a stale provider frame from covering the local
    // register/login UI while the child WebView is being torn down.
    if let Some(webview) = panel.as_ref() {
        if let Err(error) = webview.hide() {
            failures.push(format!("Impossible de masquer le panneau IA: {error}"));
        }
    }
    // A lesson prepared by the previous account must never be injected after
    // the next account recreates the provider panel.
    match state.pending.lock() {
        Ok(mut pending) => *pending = None,
        Err(_) => failures.push("L’état du cours IA est indisponible.".to_string()),
    }

    // Destroy instead of navigating asynchronously: sync_ai_panel already
    // recreates the child on provider.start_url(), while incognito(false)
    // preserves the provider's device-level cookies. Closing guarantees that
    // no document from the previous Dowze Academie profile can be shown again.
    if let Some(webview) = panel {
        if let Err(error) = webview.close() {
            failures.push(format!("Impossible de fermer le panneau IA: {error}"));
        }
    }

    // Re-list only after the popup-producing panel is closed. The transition
    // flag denies callbacks that were already queued, and the post-build check
    // closes a popup whose construction overlapped this teardown.
    let remote_windows = managed_remote_windows(&caller);
    for window in &remote_windows {
        if let Err(error) = window.hide() {
            failures.push(format!(
                "Impossible de masquer la fenêtre web {}: {error}",
                window.label()
            ));
        }
    }
    for window in remote_windows {
        if let Err(error) = window.close() {
            failures.push(format!(
                "Impossible de fermer la fenêtre web {}: {error}",
                window.label()
            ));
        }
    }

    if failures.is_empty() {
        Ok(())
    } else {
        Err(failures.join(" "))
    }
}

#[tauri::command]
fn start_ai_lesson(
    caller: Webview,
    state: State<'_, PendingLessonState>,
    auth_state: State<'_, local_auth::LocalAuthState>,
    account_id: String,
    provider: AiProvider,
    prompt: String,
    lesson_id: String,
) -> CommandResult<()> {
    require_main_caller(&caller)?;
    auth_state.require_active_account(&account_id)?;
    let lesson = PendingLesson::new(account_id, provider, prompt, lesson_id)?;
    let target = lesson.provider.start_url()?;
    let webview = required_ai_panel(&caller)?;

    {
        let mut pending = state
            .pending
            .lock()
            .map_err(|_| "L’état du cours IA est indisponible.".to_string())?;
        *pending = Some(lesson.clone());
    }

    if let Err(error) = webview.navigate(target) {
        if let Ok(mut pending) = state.pending.lock() {
            if pending.as_ref().is_some_and(|current| {
                current.account_id == lesson.account_id && current.lesson_id == lesson.lesson_id
            }) {
                *pending = None;
            }
        }
        return Err(format!("Ouverture du cours IA impossible: {error}"));
    }

    Ok(())
}

#[tauri::command]
fn current_ai_url(caller: Webview) -> CommandResult<Option<String>> {
    require_main_caller(&caller)?;
    let Some(webview) = ai_panel(&caller) else {
        return Ok(None);
    };

    let url = webview
        .url()
        .map_err(|error| format!("Impossible de lire l’URL du panneau IA: {error}"))?;
    provider_for_url(&url)?;
    Ok(Some(url.to_string()))
}

#[tauri::command]
async fn reload_ai(caller: Webview) -> CommandResult<()> {
    require_main_caller(&caller)?;
    let remote = caller.app_handle().state::<RemoteWebSessionState>();
    let _transition_guard = remote.begin_account_transition()?;
    let app = caller.app_handle().clone();
    tauri::async_runtime::spawn_blocking(move || panel_capture::drain_before_transition(&app))
        .await
        .map_err(|_| "Sauvegarde interrompue.")??;
    required_ai_panel(&caller)?
        .reload()
        .map_err(|error| format!("Impossible de recharger le panneau IA: {error}"))
}

#[tauri::command]
fn open_in_browser(caller: Webview, url: String) -> CommandResult<()> {
    require_main_caller(&caller)?;
    let (url, _) = parse_allowed_url(&url)?;
    open::that_detached(url.as_str())
        .map_err(|error| format!("Impossible d’ouvrir le navigateur système: {error}"))
}

#[tauri::command]
fn open_calendar_in_apple(
    caller: Webview,
    events: Vec<CalendarIcsEvent>,
    calendar_name: String,
    filename: String,
    time_zone: String,
    uid_namespace: Option<String>,
) -> CommandResult<String> {
    require_main_caller(&caller)?;
    let content = build_calendar_ics_with_options(
        events,
        &calendar_name,
        Utc::now(),
        &time_zone,
        uid_namespace.as_deref(),
    )?;
    let filename = validate_calendar_filename(&filename)?;
    let destination = calendar_export_cache_directory(&caller)?.join(filename);
    let destination = write_calendar_ics_file(&destination, &content)?;
    #[cfg(target_os = "macos")]
    let open_result = open::with_detached(&destination, "Calendar");
    #[cfg(not(target_os = "macos"))]
    let open_result = open::that_detached(&destination);
    open_result.map_err(|error| format!("Impossible d’ouvrir le calendrier système: {error}"))?;
    Ok(destination.to_string_lossy().into_owned())
}

#[tauri::command]
fn save_calendar_ics(
    caller: Webview,
    events: Vec<CalendarIcsEvent>,
    calendar_name: String,
    destination_path: String,
    time_zone: String,
    uid_namespace: Option<String>,
) -> CommandResult<String> {
    require_main_caller(&caller)?;
    if destination_path.is_empty()
        || destination_path.len() > 32_768
        || destination_path.trim() != destination_path
    {
        return Err("Le chemin du calendrier est vide, trop long ou mal formé.".into());
    }
    let content = build_calendar_ics_with_options(
        events,
        &calendar_name,
        Utc::now(),
        &time_zone,
        uid_namespace.as_deref(),
    )?;
    let destination = write_calendar_ics_file(Path::new(&destination_path), &content)?;
    Ok(destination.to_string_lossy().into_owned())
}

#[tauri::command]
async fn save_text_document(
    caller: Webview,
    content: String,
    destination_path: String,
    kind: TextDocumentKind,
) -> CommandResult<String> {
    require_main_caller(&caller)?;
    if destination_path.is_empty()
        || destination_path.len() > 32_768
        || destination_path.trim() != destination_path
    {
        return Err("Le chemin du document est vide, trop long ou mal formé.".into());
    }
    drop(caller);
    tauri::async_runtime::spawn_blocking(move || {
        write_text_document_file(Path::new(&destination_path), &content, kind)
            .map(|path| path.to_string_lossy().into_owned())
    })
    .await
    .map_err(|error| format!("La tâche d’export du document s’est interrompue: {error}"))?
}

#[tauri::command]
async fn read_formation_package(
    caller: Webview,
    auth_state: State<'_, local_auth::LocalAuthState>,
    account_id: String,
    directory_path: String,
) -> CommandResult<FormationPackageFiles> {
    require_main_caller(&caller)?;
    auth_state.require_active_account(&account_id)?;
    if directory_path.is_empty()
        || directory_path.len() > 32_768
        || directory_path.trim() != directory_path
    {
        return Err("Le chemin du dossier de formation est vide, trop long ou mal formé.".into());
    }
    drop(caller);
    tauri::async_runtime::spawn_blocking(move || {
        read_formation_package_directory(Path::new(&directory_path))
    })
    .await
    .map_err(|error| format!("La lecture du dossier de formation s’est interrompue: {error}"))?
}

#[tauri::command]
async fn save_formation_kit(
    caller: Webview,
    auth_state: State<'_, local_auth::LocalAuthState>,
    account_id: String,
    archive_bytes: Vec<u8>,
    destination_path: String,
) -> CommandResult<String> {
    require_main_caller(&caller)?;
    auth_state.require_active_account(&account_id)?;
    if destination_path.is_empty()
        || destination_path.len() > 32_768
        || destination_path.trim() != destination_path
    {
        return Err("Le chemin du kit est vide, trop long ou mal formé.".into());
    }
    drop(caller);
    tauri::async_runtime::spawn_blocking(move || {
        write_formation_kit_file(Path::new(&destination_path), &archive_bytes)
            .map(|path| path.to_string_lossy().into_owned())
    })
    .await
    .map_err(|error| format!("L’enregistrement du kit s’est interrompu: {error}"))?
}

#[tauri::command]
fn open_google_calendar_import(caller: Webview) -> CommandResult<()> {
    require_main_caller(&caller)?;
    open::that_detached(GOOGLE_CALENDAR_IMPORT_URL)
        .map_err(|error| format!("Impossible d’ouvrir l’import Google Calendar: {error}"))
}

fn assessment_app_data_dir(caller: &Webview) -> CommandResult<PathBuf> {
    caller
        .app_handle()
        .path()
        .app_data_dir()
        .map_err(|error| format!("Impossible de localiser les données de l’application: {error}"))
}

#[tauri::command]
async fn import_assessment_pdfs(
    caller: Webview,
    auth_state: State<'_, local_auth::LocalAuthState>,
    documents_state: State<'_, AssessmentDocumentsState>,
    account_id: String,
    record_id: String,
    blank_source_path: Option<String>,
    completed_source_path: Option<String>,
) -> CommandResult<ImportedAssessmentPdfs> {
    require_main_caller(&caller)?;
    auth_state.require_active_account(&account_id)?;
    for source_path in [
        blank_source_path.as_deref(),
        completed_source_path.as_deref(),
    ]
    .into_iter()
    .flatten()
    {
        if source_path.is_empty() || source_path.len() > 32_768 || source_path.trim() != source_path
        {
            return Err("Le chemin du PDF sélectionné est vide, trop long ou mal formé.".into());
        }
    }
    let app_data_dir = assessment_app_data_dir(&caller)?;
    let operation_lock = Arc::clone(&documents_state.operation_lock);
    drop(caller);
    tauri::async_runtime::spawn_blocking(move || {
        let _operation_guard = operation_lock
            .lock()
            .map_err(|_| "Le stockage des PDF est momentanément indisponible.".to_string())?;
        import_assessment_pdf_batch(
            &app_data_dir,
            &account_id,
            &record_id,
            blank_source_path.as_deref().map(Path::new),
            completed_source_path.as_deref().map(Path::new),
            None,
        )
    })
    .await
    .map_err(|error| format!("La tâche d’import des PDF s’est interrompue: {error}"))?
}

#[tauri::command]
fn open_assessment_pdf(
    caller: Webview,
    auth_state: State<'_, local_auth::LocalAuthState>,
    documents_state: State<'_, AssessmentDocumentsState>,
    account_id: String,
    record_id: String,
    variant: AssessmentPdfVariant,
) -> CommandResult<()> {
    require_main_caller(&caller)?;
    auth_state.require_active_account(&account_id)?;
    let _operation_guard = documents_state
        .operation_lock
        .lock()
        .map_err(|_| "Le stockage des PDF est momentanément indisponible.".to_string())?;
    let app_data_dir = assessment_app_data_dir(&caller)?;
    let managed_path =
        managed_assessment_pdf_path(&app_data_dir, &account_id, &record_id, variant)?;
    open::that_detached(&managed_path)
        .map_err(|error| format!("Impossible d’ouvrir le PDF de l’évaluation: {error}"))
}

#[tauri::command]
async fn delete_assessment_documents(
    caller: Webview,
    auth_state: State<'_, local_auth::LocalAuthState>,
    documents_state: State<'_, AssessmentDocumentsState>,
    account_id: String,
    record_id: String,
) -> CommandResult<bool> {
    require_main_caller(&caller)?;
    auth_state.require_active_account(&account_id)?;
    let app_data_dir = assessment_app_data_dir(&caller)?;
    let operation_lock = Arc::clone(&documents_state.operation_lock);
    drop(caller);
    tauri::async_runtime::spawn_blocking(move || {
        let _operation_guard = operation_lock
            .lock()
            .map_err(|_| "Le stockage des PDF est momentanément indisponible.".to_string())?;
        remove_assessment_documents(&app_data_dir, &account_id, &record_id)
    })
    .await
    .map_err(|error| format!("La tâche de suppression des PDF s’est interrompue: {error}"))?
}

#[tauri::command]
async fn delete_account_assessment_documents(
    caller: Webview,
    auth_state: State<'_, local_auth::LocalAuthState>,
    documents_state: State<'_, AssessmentDocumentsState>,
    account_id: String,
    record_ids: Vec<String>,
) -> CommandResult<bool> {
    require_main_caller(&caller)?;
    auth_state.require_active_account(&account_id)?;
    let app_data_dir = assessment_app_data_dir(&caller)?;
    let operation_lock = Arc::clone(&documents_state.operation_lock);
    drop(caller);
    tauri::async_runtime::spawn_blocking(move || {
        let _operation_guard = operation_lock
            .lock()
            .map_err(|_| "Le stockage des PDF est momentanément indisponible.".to_string())?;
        remove_account_assessment_documents(&app_data_dir, &account_id, &record_ids)
    })
    .await
    .map_err(|error| format!("La tâche de suppression des PDF s’est interrompue: {error}"))?
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let exit_saved = Arc::new(AtomicBool::new(false));
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .on_window_event(|window, event| {
            if window.label() != MAIN_WEBVIEW_LABEL {
                return;
            }
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let app = window.app_handle().clone();
                let Ok(guard) = app
                    .state::<RemoteWebSessionState>()
                    .begin_account_transition()
                else {
                    return;
                };
                let window = window.clone();
                std::thread::spawn(move || {
                    let _guard = guard;
                    match workspace_cache::flush_before_exit(&app).and_then(|_| panel_capture::drain_before_transition(&app)) {
                        Ok(()) => {
                            let _ = window.destroy();
                        }
                        Err(error) => {
                            let _ = window.emit("capture-save-error", error);
                            let _ = window.emit("workspace-close-cancelled", ());
                        }
                    }
                });
            }
        })
        .manage(PendingLessonState::default())
        .manage(server_link::ServerLinkState::default())
        .manage(server_link::managed::ManagedTransportState::default())
        .manage(workspace_cache::WorkspaceCacheState::default())
        .manage(automatic_updates::AutomaticUpdates::default())
        .manage(startup_window::StartupWindow::default())
        .manage(RemoteWebSessionState::default())
        .manage(panel_capture::PanelCaptureState::default())
        .manage(local_auth::LocalAuthState::default())
        .manage(AssessmentDocumentsState::default())
        .manage(conversation_archive::ConversationArchiveState::default())
        .manage(paper_export::NotebookExportState::default())
        .invoke_handler(tauri::generate_handler![
            local_auth::local_account_status,
            local_auth::register_local_account,
            local_auth::login_local_account,
            local_auth::logout_local_account,
            native_capabilities,
            workspace_cache::workspace_cache_flushed,
            automatic_updates::automatic_update_probe,
            automatic_updates::automatic_update_stage,
            automatic_updates::automatic_update_apply,
            automatic_updates::automatic_update_boot,
            startup_window::startup_workspace_ready,
            server_link::server_request,
            server_link::server_blob_request,
            server_link::managed::managed_native_capture,
            server_link::managed::managed_native_begin,
            server_link::managed::managed_native_append,
            server_link::managed::managed_native_execute,
            server_link::managed::managed_native_read,
            server_link::managed::managed_native_retire,
            local_auth::login_synchronized_account,
            asset_sync::native_archive_list,
            asset_sync::native_asset_read,
            asset_sync::native_asset_import,
            asset_sync::native_asset_delete,
            request_microphone_access,
            open_google_web_profile,
            remove_google_web_profile,
            panel_capture::configure_ai_capture,
            panel_capture::poll_ai_capture,
            panel_capture::push_ai_capture,
            sync_ai_panel,
            navigate_ai,
            secure_ai_panel_for_account_transition,
            start_ai_lesson,
            current_ai_url,
            reload_ai,
            open_in_browser,
            open_calendar_in_apple,
            save_calendar_ics,
            save_text_document,
            paper_export::save_notebook_export,
            paper_export::begin_notebook_export,
            paper_export::push_notebook_export,
            paper_export::finish_notebook_export,
            paper_export::abort_notebook_export,
            read_formation_package,
            save_formation_kit,
            open_google_calendar_import,
            free_chat::free_chat_key_status,
            free_chat::save_free_chat_api_key,
            free_chat::delete_free_chat_api_key,
            free_chat::send_free_chat_message,
            free_chat::list_ollama_models,
            conversation_archive::persist_conversation_capture,
            conversation_archive::read_conversation_archive,
            conversation_archive::delete_conversation_archive,
            import_assessment_pdfs,
            open_assessment_pdf,
            delete_assessment_documents,
            delete_account_assessment_documents
        ])
        .build(tauri::generate_context!())
        .expect("erreur pendant la construction de l’application Dowze Academie")
        .run(move |app, event| {
            if let tauri::RunEvent::ExitRequested { api, code, .. } = event {
                if exit_saved.load(Ordering::Acquire)
                    || app.get_webview(MAIN_WEBVIEW_LABEL).is_none()
                {
                    return;
                }
                api.prevent_exit();
                let Ok(guard) = app
                    .state::<RemoteWebSessionState>()
                    .begin_account_transition()
                else {
                    return;
                };
                let app = app.clone();
                let exit_saved = Arc::clone(&exit_saved);
                std::thread::spawn(move || {
                    let _guard = guard;
                    match workspace_cache::flush_before_exit(&app).and_then(|_| panel_capture::drain_before_transition(&app)) {
                        Ok(()) => {
                            exit_saved.store(true, Ordering::Release);
                            app.exit(code.unwrap_or(0));
                        }
                        Err(error) => {
                            let _ = app.emit("capture-save-error", error);
                            let _ = app.emit("workspace-close-cancelled", ());
                        }
                    }
                });
            }
        });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn google_web_data_scope_accepts_only_the_closed_google_family_allowlist() {
        for display_name in [
            "google.com",
            "accounts.google.com",
            "MYACCOUNT.GOOGLE.COM.",
            "googleapis.com",
            "lh3.googleusercontent.com",
            "gstatic.com",
            "youtube.com",
            "www.youtube.com",
            "youtu.be",
            "i.ytimg.com",
            "ggpht.com",
            "googlevideo.com",
            "youtube-nocookie.com",
            "www.youtube-nocookie.com",
        ] {
            assert!(
                is_google_web_data_record_name(display_name),
                "{display_name} should be included in the Google removal scope"
            );
        }
    }

    #[test]
    fn google_web_data_scope_rejects_lookalikes_and_unrelated_provider_records() {
        for display_name in [
            "",
            ".",
            "google.com.evil.example",
            "googleapis.com.evil.example",
            "notgoogle.com",
            "youtube.com.evil.example",
            "youtube-nocookie.com.evil.example",
            "fakeyoutube.com",
            "chatgpt.com",
            "openai.com",
            "claude.ai",
            "anthropic.com",
            "duolingo.com",
            "khanacademy.org",
            "recaptcha.net",
            "tiktok.com",
        ] {
            assert!(
                !is_google_web_data_record_name(display_name),
                "{display_name} must remain outside the Google removal scope"
            );
        }
    }

    #[test]
    fn accepts_provider_domains_and_subdomains() {
        for raw in [
            "https://chatgpt.com/",
            "https://auth.openai.com/login",
            "https://claude.ai/new",
            "https://console.anthropic.com/",
            "https://gemini.google.com/app/0123456789abcdef",
            "https://chat.mistral.ai/chat/01234567-89ab-cdef-0123-456789abcdef",
            "https://chat.deepseek.com/a/chat/s/01234567-89ab-cdef-0123-456789abcdef",
            "https://www.kimi.com/chat/01234567-89ab-cdef-0123-456789abcdef",
            "https://www.duolingo.com/learn",
            "https://fr.khanacademy.org/math",
            "https://www.youtube.com/results?search_query=thermodynamique",
            "https://m.youtube.com/watch?v=dQw4w9WgXcQ",
            "https://youtu.be/dQw4w9WgXcQ?si=tracking",
            "https://notebook.google.com/notebook/01234567-89ab-cdef-0123-456789abcdef",
            "https://notebooklm.google.com/notebook/01234567-89ab-cdef-0123-456789abcdef",
        ] {
            assert!(parse_allowed_url(raw).is_ok(), "{raw} should be allowed");
        }
    }

    #[test]
    fn accepts_only_safe_external_and_download_targets() {
        for raw in [
            "https://files.example.net/examen.pdf",
            "https://files.example.net:443/examen.pdf",
        ] {
            let url = Url::parse(raw).unwrap();
            assert!(is_safe_external_target(&url), "{raw}");
            assert!(is_safe_download_url(&url), "{raw}");
        }
        let blob = Url::parse("blob:https://chatgpt.com/01234567-89ab-cdef").unwrap();
        assert!(is_safe_download_url(&blob));
        assert!(!is_safe_external_target(&blob));

        for raw in [
            "http://files.example.net/examen.pdf",
            "https://user:secret@files.example.net/examen.pdf",
            "file:///tmp/examen.pdf",
            "data:application/pdf;base64,JVBERi0xLjQ=",
            "blob:http://chatgpt.com/01234567-89ab-cdef",
        ] {
            let url = Url::parse(raw).unwrap();
            assert!(!is_safe_download_url(&url), "{raw}");
        }
    }

    #[test]
    fn text_documents_are_validated_and_written_atomically() {
        let directory = TestDirectory::new("text-export");
        let json_path = directory.path().join("donnees.json");
        let markdown_path = directory.path().join("note.md");

        assert_eq!(
            write_text_document_file(&json_path, r#"{"version":4}"#, TextDocumentKind::Json)
                .unwrap(),
            fs::canonicalize(directory.path())
                .unwrap()
                .join("donnees.json")
        );
        assert_eq!(fs::read_to_string(&json_path).unwrap(), r#"{"version":4}"#);
        write_text_document_file(&json_path, r#"{"version":5}"#, TextDocumentKind::Json)
            .expect("replace an existing JSON export atomically");
        assert_eq!(fs::read_to_string(&json_path).unwrap(), r#"{"version":5}"#);
        write_text_document_file(&markdown_path, "# Énergie\n", TextDocumentKind::Markdown)
            .unwrap();
        assert_eq!(fs::read_to_string(&markdown_path).unwrap(), "# Énergie\n");
        write_text_document_file(&markdown_path, "# Physique\n", TextDocumentKind::Markdown)
            .expect("replace an existing Markdown export atomically");
        assert_eq!(fs::read_to_string(&markdown_path).unwrap(), "# Physique\n");

        assert!(write_text_document_file(
            &directory.path().join("invalide.json"),
            "{",
            TextDocumentKind::Json
        )
        .is_err());
        assert!(write_text_document_file(
            &directory.path().join("mauvaise-extension.txt"),
            "# Note",
            TextDocumentKind::Markdown
        )
        .is_err());
    }

    #[test]
    fn detects_provider_for_session_search_and_watch_urls() {
        for (raw, expected) in [
            (
                "https://gemini.google.com/app/0123456789abcdef",
                AiProvider::Gemini,
            ),
            (
                "https://chat.mistral.ai/chat/01234567-89ab-cdef-0123-456789abcdef",
                AiProvider::Mistral,
            ),
            (
                "https://chat.deepseek.com/a/chat/s/01234567-89ab-cdef-0123-456789abcdef",
                AiProvider::Deepseek,
            ),
            (
                "https://www.kimi.com/chat/01234567-89ab-cdef-0123-456789abcdef",
                AiProvider::Kimi,
            ),
            ("https://www.duolingo.com/learn", AiProvider::Duolingo),
            ("https://www.khanacademy.org/math", AiProvider::Khanacademy),
            (
                "https://fr.khanacademy.org/science",
                AiProvider::Khanacademy,
            ),
            (
                "https://www.youtube.com/results?search_query=thermodynamique",
                AiProvider::Youtube,
            ),
            (
                "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
                AiProvider::Youtube,
            ),
            ("https://youtu.be/dQw4w9WgXcQ", AiProvider::Youtube),
            (
                "https://notebook.google.com/notebook/01234567-89ab-cdef-0123-456789abcdef",
                AiProvider::Notebooklm,
            ),
        ] {
            let url = Url::parse(raw).unwrap();
            assert_eq!(provider_for_url(&url).unwrap(), expected, "{raw}");
            assert!(validate_webview_navigation(&url).is_ok(), "{raw}");
        }
    }

    #[test]
    fn allows_current_notebook_app_and_google_sign_in_redirect_chain() {
        // The legacy NotebookLM host now redirects to the renamed Gemini
        // Notebook app before and after Google authentication.
        for raw in [
            "https://notebooklm.google.com/",
            "https://notebook.google.com/",
            "https://notebook.google.com/login?continue=https://notebook.google.com/",
            "https://notebook.google.com/notebook/01234567-89ab-cdef-0123-456789abcdef",
        ] {
            let url = Url::parse(raw).unwrap();
            assert_eq!(
                provider_for_url(&url).unwrap(),
                AiProvider::Notebooklm,
                "{raw}"
            );
            assert!(validate_webview_navigation(&url).is_ok(), "{raw}");
        }

        let google_sign_in = Url::parse(
            "https://accounts.google.com/ServiceLogin?continue=https://notebook.google.com/login",
        )
        .unwrap();
        assert!(validate_webview_navigation(&google_sign_in).is_ok());
        assert!(provider_for_url(&google_sign_in).is_err());
    }

    #[test]
    fn rejects_unsafe_or_lookalike_urls() {
        for raw in [
            "http://chatgpt.com/",
            "https://chatgpt.com.evil.example/",
            "https://claude.ai@evil.example/",
            "https://evil.example/?next=https://openai.com/",
            "https://gemini.google.com.evil.example/app",
            "https://gemini.google.com@evil.example/app",
            "https://chat.mistral.ai.evil.example/chat",
            "https://chat.deepseek.com.evil.example/a/chat/s/test",
            "https://chat.deepseek.com@evil.example/a/chat/s/test",
            "https://www.kimi.com.evil.example/chat/test",
            "https://www.kimi.com@evil.example/chat/test",
            "http://www.duolingo.com/learn",
            "https://www.duolingo.com.evil.example/learn",
            "https://www.duolingo.com@evil.example/learn",
            "https://www.duolingo.com:8443/learn",
            "https://api.duolingo.com/learn",
            "https://fr.duolingo.com/learn",
            "http://www.khanacademy.org/math",
            "https://www.khanacademy.org.evil.example/math",
            "https://www.khanacademy.org@evil.example/math",
            "https://www.khanacademy.org:8443/math",
            "https://www.youtube.com.evil.example/watch?v=test",
            "https://www.youtube.com@evil.example/watch?v=test",
            "https://youtu.be.evil.example/dQw4w9WgXcQ",
            "https://m.youtu.be/dQw4w9WgXcQ",
            "https://youtu.be@evil.example/dQw4w9WgXcQ",
            "https://youtu.be:8443/dQw4w9WgXcQ",
            "https://notebooklm.google.com.evil.example/notebook/test",
            "https://notebook.google.com.evil.example/notebook/test",
            "https://notebook.google.com@evil.example/notebook/test",
            "https://notebook.google/",
            "https://notebooklm.google/",
            "https://drive.google.com/",
            "https://mistral.ai/",
            " https://chatgpt.com/",
        ] {
            assert!(parse_allowed_url(raw).is_err(), "{raw} should be rejected");
        }
    }

    #[test]
    fn allows_only_required_authentication_hosts_inside_the_webview() {
        for raw in [
            "about:blank",
            "https://accounts.google.com/o/oauth2/v2/auth",
            "https://appleid.apple.com/auth/authorize",
            "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
            "https://auth.mistral.ai/ui/login",
            "https://v2.auth.mistral.ai/ui/login",
            "https://www.recaptcha.net/recaptcha/enterprise/anchor",
            "https://www.kasandbox.org/programming-scratchpad-iframe.html",
            "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
        ] {
            let url = Url::parse(raw).unwrap();
            assert!(
                validate_webview_navigation(&url).is_ok(),
                "{raw} should be allowed inside the webview"
            );
            assert!(
                parse_allowed_url(raw).is_err(),
                "{raw} must stay forbidden to navigate_ai and open_in_browser"
            );
            assert!(
                provider_for_url(&url).is_err(),
                "auth pages must not be emitted as provider conversations"
            );
        }
    }

    #[test]
    fn embeds_only_known_authentication_popup_targets() {
        for raw in [
            "about:blank",
            "https://accounts.google.com/o/oauth2/v2/auth",
            "https://appleid.apple.com/auth/authorize",
            "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
            "https://auth.openai.com/login",
            "https://auth.mistral.ai/ui/login",
            "https://v2.auth.mistral.ai/ui/login",
        ] {
            let url = Url::parse(raw).unwrap();
            assert!(
                is_embedded_authentication_target(&url),
                "{raw} should use a shared in-app authentication popup"
            );
        }

        for raw in [
            "https://chatgpt.com/",
            "https://claude.ai/login",
            "https://myaccount.google.com/",
            "https://www.recaptcha.net/recaptcha/enterprise/anchor",
            "https://accounts.google.com.evil.example/",
            "https://accounts.google.com@evil.example/",
            "https://accounts.google.com:8443/",
            "http://accounts.google.com/",
            "file:///tmp/fake-login.html",
        ] {
            let url = Url::parse(raw).unwrap();
            assert!(
                !is_embedded_authentication_target(&url),
                "{raw} must stay outside the embedded authentication popup"
            );
        }
    }

    #[test]
    fn google_web_profile_accepts_only_blank_frames_and_its_two_exact_https_hosts() {
        let initial_url = Url::parse(GOOGLE_WEB_PROFILE_URL).unwrap();
        assert!(validate_google_web_profile_navigation(&initial_url).is_ok());

        for raw in [
            "about:blank",
            "https://myaccount.google.com/security",
            "https://accounts.google.com/ServiceLogin?continue=https://myaccount.google.com/",
            "https://accounts.google.com:443/",
        ] {
            assert!(
                validate_google_web_profile_navigation(&Url::parse(raw).unwrap()).is_ok(),
                "{raw} should remain inside the Google profile window"
            );
        }

        for raw in [
            "http://accounts.google.com/",
            "https://accounts.google.com.evil.example/",
            "https://accounts.google.com@evil.example/",
            "https://accounts.google.com:8443/",
            "https://mail.google.com/",
            "https://gemini.google.com/app",
            "https://google.com/",
            "about:srcdoc",
        ] {
            assert!(
                validate_google_web_profile_navigation(&Url::parse(raw).unwrap()).is_err(),
                "{raw} must be rejected by the Google profile window"
            );
        }
    }

    #[test]
    fn account_transitions_target_only_managed_remote_window_labels() {
        for label in [
            GOOGLE_WEB_PROFILE_LABEL,
            "auth-popup-0",
            "auth-popup-18446744073709551615",
        ] {
            assert!(is_managed_remote_window_label(label), "{label}");
        }

        for label in [
            MAIN_WEBVIEW_LABEL,
            AI_PANEL_LABEL,
            "google-web-profile-lookalike",
            "auth-popup",
            "provider-popup-0",
        ] {
            assert!(!is_managed_remote_window_label(label), "{label}");
        }
    }

    #[test]
    fn authentication_popup_capacity_is_strictly_bounded() {
        assert!(has_auth_popup_capacity(0));
        assert!(has_auth_popup_capacity(MAX_AUTH_POPUP_WINDOWS - 1));
        assert!(!has_auth_popup_capacity(MAX_AUTH_POPUP_WINDOWS));
        assert!(!has_auth_popup_capacity(MAX_AUTH_POPUP_WINDOWS + 1));
    }

    #[test]
    fn remote_web_transition_guard_blocks_creation_and_always_releases() {
        let state = RemoteWebSessionState::default();
        assert!(state.ensure_available().is_ok());
        {
            let _guard = state.begin_account_transition().unwrap();
            assert!(state.ensure_available().is_err());
            assert!(state.begin_account_transition().is_err());
        }
        assert!(state.ensure_available().is_ok());
    }

    #[test]
    fn rejects_unsafe_authentication_lookalikes() {
        for raw in [
            "http://accounts.google.com/",
            "https://accounts.google.com.evil.example/",
            "https://appleid.apple.com@evil.example/",
            "https://login.microsoftonline.com:8443/",
            "https://auth.mistral.ai.evil.example/ui/login",
            "https://auth.mistral.ai@evil.example/ui/login",
            "https://v2.auth.mistral.ai.evil.example/ui/login",
            "about:srcdoc",
            "http://www.recaptcha.net/recaptcha/enterprise/anchor",
            "https://www.recaptcha.net.evil.example/recaptcha/enterprise/anchor",
            "https://www.recaptcha.net@evil.example/recaptcha/enterprise/anchor",
            "https://www.recaptcha.net:8443/recaptcha/enterprise/anchor",
            "https://www.kasandbox.org.evil.example/programming-scratchpad-iframe.html",
            "https://www.kasandbox.org@evil.example/programming-scratchpad-iframe.html",
            "https://kasandbox.org/programming-scratchpad-iframe.html",
            "http://www.kasandbox.org/programming-scratchpad-iframe.html",
            "https://www.kasandbox.org:8443/programming-scratchpad-iframe.html",
            "https://www.youtube-nocookie.com.evil.example/embed/test",
            "https://www.youtube-nocookie.com@evil.example/embed/test",
            "https://youtube-nocookie.com/embed/test",
            "http://www.youtube-nocookie.com/embed/test",
            "https://www.youtube-nocookie.com:8443/embed/test",
            "http://notebook.google.com/",
            "https://notebook.google.com.evil.example/",
            "https://notebook.google.com@evil.example/",
            "https://notebook.google.com:8443/",
            "https://notebook.google/",
        ] {
            let url = Url::parse(raw).unwrap();
            assert!(
                validate_webview_navigation(&url).is_err(),
                "{raw} should be rejected inside the webview"
            );
        }
    }

    #[test]
    fn validates_pending_lesson_inputs() {
        assert!(PendingLesson::new(
            TEST_ACCOUNT_A.into(),
            AiProvider::Chatgpt,
            "Explique le premier principe.".into(),
            "thermodynamique:s1.01_cours-1".into(),
        )
        .is_ok());

        for prompt in ["", "  \n\t"] {
            assert!(PendingLesson::new(
                TEST_ACCOUNT_A.into(),
                AiProvider::Chatgpt,
                prompt.into(),
                "lesson-1".into(),
            )
            .is_err());
        }
        assert!(PendingLesson::new(
            TEST_ACCOUNT_A.into(),
            AiProvider::Claude,
            "x".repeat(MAX_PROMPT_LENGTH + 1),
            "lesson-1".into(),
        )
        .is_err());
        assert!(PendingLesson::new(
            TEST_ACCOUNT_A.into(),
            AiProvider::Claude,
            "x".repeat(MAX_PROMPT_LENGTH),
            "lesson-at-byte-limit".into(),
        )
        .is_ok());

        for lesson_id in ["", " lesson-1", "lesson/1", "cours<script>", "énergie-1"] {
            assert!(PendingLesson::new(
                TEST_ACCOUNT_A.into(),
                AiProvider::Claude,
                "Démarre le cours.".into(),
                lesson_id.into(),
            )
            .is_err());
        }
        assert!(PendingLesson::new(
            TEST_ACCOUNT_A.into(),
            AiProvider::Claude,
            "Démarre le cours.".into(),
            "x".repeat(MAX_LESSON_ID_LENGTH + 1),
        )
        .is_err());

        for provider in [
            AiProvider::Gemini,
            AiProvider::Mistral,
            AiProvider::Deepseek,
            AiProvider::Kimi,
        ] {
            assert!(PendingLesson::new(
                TEST_ACCOUNT_A.into(),
                provider,
                "Explique le chapitre.".into(),
                "lesson-supported".into(),
            )
            .is_ok());
        }

        for provider in [
            AiProvider::Freechat,
            AiProvider::Duolingo,
            AiProvider::Khanacademy,
            AiProvider::Youtube,
            AiProvider::Tiktok,
            AiProvider::Notebooklm,
        ] {
            assert!(PendingLesson::new(
                TEST_ACCOUNT_A.into(),
                provider,
                "Ce texte ne doit pas être injecté.".into(),
                "lesson-no-injection".into(),
            )
            .is_err());
            assert!(lesson_provider_script_config(provider).is_none());
        }

        assert!(PendingLesson::new(
            "not-an-account".into(),
            AiProvider::Chatgpt,
            "Ce cours ne doit appartenir à aucun compte invalide.".into(),
            "lesson-invalid-owner".into(),
        )
        .is_err());
    }

    #[test]
    fn deserializes_all_known_ai_providers_and_rejects_unknown_ones() {
        for (raw, expected) in [
            ("chatgpt", AiProvider::Chatgpt),
            ("claude", AiProvider::Claude),
            ("gemini", AiProvider::Gemini),
            ("mistral", AiProvider::Mistral),
            ("deepseek", AiProvider::Deepseek),
            ("kimi", AiProvider::Kimi),
            ("freechat", AiProvider::Freechat),
            ("duolingo", AiProvider::Duolingo),
            ("khanacademy", AiProvider::Khanacademy),
            ("youtube", AiProvider::Youtube),
            ("tiktok", AiProvider::Tiktok),
            ("notebooklm", AiProvider::Notebooklm),
        ] {
            let decoded = InvokeResponseBody::Json(format!("\"{raw}\""))
                .deserialize::<AiProvider>()
                .unwrap();
            assert_eq!(decoded, expected);
        }

        let decoded = InvokeResponseBody::Json("\"unknown\"".into()).deserialize::<AiProvider>();
        assert!(decoded.is_err());
    }

    #[test]
    fn injection_targets_only_fresh_chat_routes() {
        for (raw, provider, expected) in [
            ("https://chatgpt.com/", AiProvider::Chatgpt, true),
            (
                "https://chatgpt.com/?temporary-chat=true",
                AiProvider::Chatgpt,
                true,
            ),
            (
                "https://chatgpt.com/c/conversation",
                AiProvider::Chatgpt,
                false,
            ),
            ("https://chatgpt.com/auth/login", AiProvider::Chatgpt, false),
            ("https://auth.openai.com/login", AiProvider::Chatgpt, false),
            ("https://claude.ai/", AiProvider::Claude, true),
            ("https://claude.ai/new", AiProvider::Claude, true),
            ("https://claude.ai/new/", AiProvider::Claude, true),
            ("https://claude.ai/login", AiProvider::Claude, false),
            (
                "https://claude.ai/chat/conversation",
                AiProvider::Claude,
                false,
            ),
            ("https://console.anthropic.com/", AiProvider::Claude, false),
            ("https://gemini.google.com/app", AiProvider::Gemini, true),
            ("https://gemini.google.com/app/", AiProvider::Gemini, true),
            (
                "https://gemini.google.com/app?hl=fr",
                AiProvider::Gemini,
                true,
            ),
            (
                "https://gemini.google.com/app/conversation-id",
                AiProvider::Gemini,
                false,
            ),
            (
                "https://accounts.google.com/ServiceLogin",
                AiProvider::Gemini,
                false,
            ),
            ("https://chat.mistral.ai/chat", AiProvider::Mistral, true),
            ("https://chat.mistral.ai/chat/", AiProvider::Mistral, true),
            (
                "https://chat.mistral.ai/chat?mode=chat",
                AiProvider::Mistral,
                true,
            ),
            (
                "https://chat.mistral.ai/chat/conversation-id",
                AiProvider::Mistral,
                false,
            ),
            (
                "https://auth.mistral.ai/ui/login",
                AiProvider::Mistral,
                false,
            ),
            ("https://chat.deepseek.com/", AiProvider::Deepseek, true),
            (
                "https://chat.deepseek.com/?ref=official",
                AiProvider::Deepseek,
                true,
            ),
            (
                "https://chat.deepseek.com/a/chat/s/conversation-id",
                AiProvider::Deepseek,
                false,
            ),
            (
                "https://chat.deepseek.com/sign_in",
                AiProvider::Deepseek,
                false,
            ),
            ("https://www.kimi.com/", AiProvider::Kimi, true),
            ("https://kimi.com/", AiProvider::Kimi, true),
            (
                "https://www.kimi.com/chat/conversation-id",
                AiProvider::Kimi,
                false,
            ),
            ("https://www.kimi.com/login", AiProvider::Kimi, false),
            (
                "https://www.duolingo.com/learn",
                AiProvider::Duolingo,
                false,
            ),
            (
                "https://fr.khanacademy.org/",
                AiProvider::Khanacademy,
                false,
            ),
            ("https://www.youtube.com/", AiProvider::Youtube, false),
            (
                "https://notebook.google.com/",
                AiProvider::Notebooklm,
                false,
            ),
            (
                "https://notebooklm.google.com/",
                AiProvider::Notebooklm,
                false,
            ),
        ] {
            let url = Url::parse(raw).unwrap();
            assert_eq!(is_provider_new_chat_url(&url, provider), expected, "{raw}");
        }

        assert!(!is_provider_new_chat_url(
            &Url::parse("https://claude.ai/new").unwrap(),
            AiProvider::Chatgpt
        ));
        assert!(!is_provider_new_chat_url(
            &Url::parse("https://chatgpt.com/").unwrap(),
            AiProvider::Claude
        ));
        assert!(!is_provider_new_chat_url(
            &Url::parse("https://chat.mistral.ai/chat").unwrap(),
            AiProvider::Gemini
        ));
        assert!(!is_provider_new_chat_url(
            &Url::parse("https://gemini.google.com/app").unwrap(),
            AiProvider::Mistral
        ));
        assert!(!is_provider_new_chat_url(
            &Url::parse("https://www.kimi.com/").unwrap(),
            AiProvider::Deepseek
        ));
        assert!(!is_provider_new_chat_url(
            &Url::parse("https://chat.deepseek.com/").unwrap(),
            AiProvider::Kimi
        ));
        assert!(!is_provider_new_chat_url(
            &Url::parse("https://chatgpt.com/").unwrap(),
            AiProvider::Freechat
        ));
    }

    #[test]
    fn provider_start_urls_are_exact_and_fresh_only_for_chat_injection() {
        for (provider, expected) in [
            (AiProvider::Chatgpt, "https://chatgpt.com/"),
            (AiProvider::Claude, "https://claude.ai/new"),
            (AiProvider::Gemini, "https://gemini.google.com/app"),
            (AiProvider::Mistral, "https://chat.mistral.ai/chat"),
            (AiProvider::Deepseek, "https://chat.deepseek.com/"),
            (AiProvider::Kimi, "https://www.kimi.com/"),
            (AiProvider::Duolingo, "https://www.duolingo.com/learn"),
            (AiProvider::Khanacademy, "https://fr.khanacademy.org/"),
            (AiProvider::Youtube, "https://www.youtube.com/"),
            (AiProvider::Notebooklm, "https://notebook.google.com/"),
        ] {
            let url = provider.start_url().unwrap();
            assert_eq!(url.as_str(), expected);
            assert_eq!(provider_for_url(&url).unwrap(), provider);
            assert_eq!(
                is_provider_new_chat_url(&url, provider),
                provider.supports_lesson_injection()
            );
        }
        assert!(AiProvider::Freechat.start_url().is_err());
    }

    #[test]
    fn account_transition_resolves_only_canonical_provider_homes() {
        for provider in [
            AiProvider::Chatgpt,
            AiProvider::Claude,
            AiProvider::Gemini,
            AiProvider::Mistral,
            AiProvider::Deepseek,
            AiProvider::Kimi,
            AiProvider::Duolingo,
            AiProvider::Khanacademy,
            AiProvider::Youtube,
            AiProvider::Tiktok,
            AiProvider::Notebooklm,
        ] {
            assert_eq!(
                account_transition_home(provider).unwrap(),
                Some(provider.start_url().unwrap())
            );
        }
        assert_eq!(account_transition_home(AiProvider::Freechat).unwrap(), None);
    }

    #[test]
    fn pending_lesson_keeps_its_local_account_owner() {
        let lesson = PendingLesson::new(
            TEST_ACCOUNT_A.into(),
            AiProvider::Chatgpt,
            "Explique le cours sans changer de profil.".into(),
            "lesson-owned".into(),
        )
        .unwrap();

        assert_eq!(lesson.account_id, TEST_ACCOUNT_A);
    }

    #[test]
    fn json_encoding_round_trips_untrusted_prompt_text() {
        let dangerous = "Cours \"test\"\n</script>';globalThis.__PWNED__=true;//\\fin";
        let encoded = json_string_literal(dangerous).unwrap();
        let decoded = InvokeResponseBody::Json(encoded.clone())
            .deserialize::<String>()
            .unwrap();

        assert_eq!(decoded, dangerous);
        assert!(encoded.starts_with('"') && encoded.ends_with('"'));
        assert!(encoded.contains("\\\"test\\\""));
        assert!(encoded.contains("\\n"));
        assert!(!encoded.contains("\";globalThis.__PWNED__"));
    }

    #[test]
    fn lesson_script_preserves_the_complete_prompt_at_the_byte_limit() {
        let suffix = "\nFIN — énergie λ 🧪";
        let prompt = format!("{}{}", "a".repeat(MAX_PROMPT_LENGTH - suffix.len()), suffix);
        assert_eq!(prompt.len(), MAX_PROMPT_LENGTH);

        let lesson = PendingLesson::new(
            TEST_ACCOUNT_A.into(),
            AiProvider::Chatgpt,
            prompt.clone(),
            "lesson-complete-prompt".into(),
        )
        .unwrap();
        let script = lesson_injection_script(&lesson).unwrap();
        let encoded_prompt = script
            .strip_prefix("(() => {\n\"use strict\";\nconst prompt = ")
            .unwrap()
            .split_once(";\nconst lessonId = ")
            .unwrap()
            .0;
        let decoded = InvokeResponseBody::Json(encoded_prompt.into())
            .deserialize::<String>()
            .unwrap();

        assert_eq!(decoded, prompt);
        assert!(decoded.ends_with(suffix));
    }

    #[test]
    fn lesson_script_is_bounded_scoped_and_contains_no_data_scraping() {
        for provider in [
            AiProvider::Chatgpt,
            AiProvider::Claude,
            AiProvider::Gemini,
            AiProvider::Mistral,
            AiProvider::Deepseek,
            AiProvider::Kimi,
        ] {
            let lesson = PendingLesson::new(
                TEST_ACCOUNT_A.into(),
                provider,
                "Cours \";globalThis.__PWNED__=true;//\nDeuxième ligne".into(),
                "lesson-safe-42".into(),
            )
            .unwrap();
            let script = lesson_injection_script(&lesson).unwrap();

            assert!(script.starts_with("(() => {\n\"use strict\";"));
            assert!(script.contains("const maxAttempts = 120;"));
            assert!(script.contains("window.clearInterval(timer)"));
            assert!(script.contains("existingGuard.lessonId === lessonId"));
            assert!(script.contains("const scope = composer.closest(scopeSelector);"));
            assert!(script.contains("const candidate = scope.querySelector(selector);"));
            assert!(script.contains("if (!isExpectedNewChatLocation())"));
            assert!(script.contains("stop(\"navigation-changed\")"));
            assert!(script.contains("filledComposer !== composer"));
            assert!(script.contains("const hasCompletePrompt = (composer) =>"));
            assert!(script.contains("composer.value === prompt"));
            assert!(script.contains("blocks.length === expectedLines.length"));
            assert!(script.contains("candidate.getClientRects().length > 0"));
            assert!(!script.contains("const prompt = \"Cours \";globalThis.__PWNED__"));

            for forbidden in [
                "document.cookie",
                "localStorage",
                "sessionStorage",
                "indexedDB",
                "querySelectorAll",
                "data-message",
                "conversation-turn",
            ] {
                assert!(!script.contains(forbidden), "forbidden access: {forbidden}");
            }
        }
    }

    #[test]
    fn deepseek_and_kimi_injection_configs_target_their_current_web_editors() {
        let deepseek = lesson_provider_script_config(AiProvider::Deepseek).unwrap();
        assert!(deepseek.contains("chat.deepseek.com"));
        assert!(deepseek.contains("textarea#chat-input"));
        assert!(deepseek.contains("window.location.pathname === \"/\""));

        let kimi = lesson_provider_script_config(AiProvider::Kimi).unwrap();
        assert!(kimi.contains("www.kimi.com"));
        assert!(kimi.contains(".chat-input-editor[contenteditable=\\\"true\\\"]"));
        assert!(kimi.contains(".send-button-container:not(.disabled)"));
        assert!(kimi.contains("window.location.pathname === \"/\""));
    }

    struct TestDirectory(PathBuf);

    impl TestDirectory {
        fn new(label: &str) -> Self {
            let sequence = ASSESSMENT_TEMP_COUNTER.fetch_add(1, Ordering::Relaxed);
            let path = std::env::temp_dir()
                .join(format!("etude-{label}-{}-{sequence}", std::process::id()));
            let _ = fs::remove_dir_all(&path);
            fs::create_dir_all(&path).unwrap();
            Self(path)
        }

        fn path(&self) -> &Path {
            &self.0
        }
    }

    impl Drop for TestDirectory {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn calendar_test_event() -> CalendarIcsEvent {
        CalendarIcsEvent {
            id: "cours-42".into(),
            title: "Analyse : limites".into(),
            start: "2026-09-07T08:30:00+02:00".into(),
            end: "2026-09-07T10:00:00+02:00".into(),
            all_day: false,
            start_date: None,
            end_date: None,
            location: Some("Salle A".into()),
            description: Some("Cours introductif".into()),
            category: "Cours".into(),
            subject: Some("Analyse I & II".into()),
        }
    }

    fn calendar_generated_at() -> DateTime<Utc> {
        DateTime::parse_from_rfc3339("2026-08-30T12:34:56Z")
            .unwrap()
            .with_timezone(&Utc)
    }

    #[test]
    fn calendar_ics_serializes_timed_events_in_utc_and_escapes_text() {
        let mut event = calendar_test_event();
        event.title = "Résumé, A; B\\C\nD".into();
        event.location = Some("Salle 1, aile; nord".into());
        event.description = Some("Ligne 1\r\nLigne 2".into());

        let ics = build_calendar_ics(
            vec![event],
            "Dowze Academie, Année 1",
            calendar_generated_at(),
        )
        .unwrap();

        assert!(ics.starts_with("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n"));
        assert!(ics.ends_with("END:VCALENDAR\r\n"));
        assert!(ics.contains("DTSTAMP:20260830T123456Z\r\n"));
        assert!(ics.contains("DTSTART:20260907T063000Z\r\n"));
        assert!(ics.contains("DTEND:20260907T080000Z\r\n"));
        assert!(ics.contains("SUMMARY:Résumé\\, A\\; B\\\\C\\nD\r\n"));
        assert!(ics.contains("LOCATION:Salle 1\\, aile\\; nord\r\n"));
        assert!(ics.contains("DESCRIPTION:Ligne 1\\nLigne 2\r\n"));
        assert!(ics.contains("X-WR-CALNAME:Dowze Academie\\, Année 1\r\n"));
        assert!(!ics.replace("\r\n", "").contains('\n'));
    }

    #[test]
    fn calendar_ics_preserves_exclusive_all_day_dates() {
        let mut event = calendar_test_event();
        event.id = "examen-final".into();
        event.title = "Examen final".into();
        event.start = "2027-06-21T00:00:00+02:00".into();
        event.end = "2027-06-22T00:00:00+02:00".into();
        event.all_day = true;
        event.start_date = Some("20270621".into());
        event.end_date = Some("20270622".into());

        let ics = build_calendar_ics(
            vec![event],
            "Dowze Academie — examens",
            calendar_generated_at(),
        )
        .unwrap();

        assert!(ics.contains("DTSTART;VALUE=DATE:20270621\r\n"));
        assert!(ics.contains("DTEND;VALUE=DATE:20270622\r\n"));
        assert!(!ics.contains("DTSTART:20270620T220000Z"));
    }

    #[test]
    fn calendar_ics_uids_are_stable_and_long_utf8_lines_are_folded_safely() {
        assert_eq!(
            calendar_event_uid("cours-42", None),
            "etude-636f7572732d3432@com.etude.desktop"
        );
        assert_eq!(
            calendar_event_uid("cours-42", None),
            calendar_event_uid("cours-42", None)
        );
        assert_ne!(
            calendar_event_uid("cours-42", None),
            calendar_event_uid("cours-43", None)
        );

        let original = format!("DESCRIPTION:{}", "énergie ".repeat(24));
        let folded = fold_calendar_ics_line(&original);
        assert_eq!(folded.replace("\r\n ", ""), original);
        assert!(folded.contains("\r\n "));
        for physical_line in folded.split("\r\n") {
            assert!(
                physical_line.len() <= 75,
                "une ligne ICS dépasse 75 octets: {}",
                physical_line.len()
            );
        }

        let first = build_calendar_ics(
            vec![calendar_test_event()],
            "Dowze Academie",
            calendar_generated_at(),
        )
        .unwrap();
        let second = build_calendar_ics(
            vec![calendar_test_event()],
            "Dowze Academie",
            calendar_generated_at(),
        )
        .unwrap();
        assert_eq!(first, second);
    }

    #[test]
    fn calendar_ics_namespaces_formations_and_preserves_the_legacy_uid() {
        let legacy = build_calendar_ics(
            vec![calendar_test_event()],
            "Dowze Academie",
            calendar_generated_at(),
        )
        .unwrap();
        let custom = build_calendar_ics_with_options(
            vec![calendar_test_event()],
            "Lycée Seconde",
            calendar_generated_at(),
            "Asia/Tokyo",
            Some("formation-a"),
        )
        .unwrap();

        assert!(legacy.contains("UID:etude-636f7572732d3432@com.etude.desktop\r\n"));
        assert!(legacy.contains("X-WR-TIMEZONE:Europe/Zurich\r\n"));
        assert!(custom
            .contains("UID:etude-666f726d6174696f6e2d61-636f7572732d3432@com.etude.desktop\r\n"));
        assert!(custom.contains("X-WR-TIMEZONE:Asia/Tokyo\r\n"));
        assert_ne!(legacy, custom);
    }

    #[test]
    fn calendar_options_reject_unsafe_timezones_namespaces_and_filenames() {
        for time_zone in [
            "",
            " Europe/Zurich",
            "Europe//Zurich",
            "../Zurich",
            "Europe Zurich",
        ] {
            assert!(build_calendar_ics_with_options(
                vec![calendar_test_event()],
                "Dowze Academie",
                calendar_generated_at(),
                time_zone,
                None,
            )
            .is_err());
        }
        assert!(build_calendar_ics_with_options(
            vec![calendar_test_event()],
            "Dowze Academie",
            calendar_generated_at(),
            "UTC",
            Some("\n"),
        )
        .is_err());

        assert!(validate_calendar_filename("Planning.ics").is_ok());
        for filename in [
            "",
            "Planning.txt",
            "../Planning.ics",
            "dossier/Planning.ics",
            "Plan\nning.ics",
        ] {
            assert!(
                validate_calendar_filename(filename).is_err(),
                "{filename:?}"
            );
        }
    }

    #[test]
    fn calendar_ics_rejects_invalid_event_ranges_and_date_shapes() {
        assert!(build_calendar_ics(Vec::new(), "Dowze Academie", calendar_generated_at()).is_err());

        let mut reversed = calendar_test_event();
        reversed.end = reversed.start.clone();
        assert!(validate_calendar_events(&[reversed], "Dowze Academie").is_err());

        let mut timed_with_dates = calendar_test_event();
        timed_with_dates.start_date = Some("20260907".into());
        timed_with_dates.end_date = Some("20260908".into());
        assert!(validate_calendar_events(&[timed_with_dates], "Dowze Academie").is_err());

        let mut all_day = calendar_test_event();
        all_day.all_day = true;
        all_day.start_date = Some("20260907".into());
        all_day.end_date = Some("20260907".into());
        assert!(validate_calendar_events(&[all_day], "Dowze Academie").is_err());

        let mut malformed = calendar_test_event();
        malformed.start = "07/09/2026 08:30".into();
        assert!(validate_calendar_events(&[malformed], "Dowze Academie").is_err());
        assert!(validate_calendar_events(&[calendar_test_event()], " Dowze Academie").is_err());
    }

    #[test]
    fn calendar_ics_write_requires_a_safe_absolute_ics_destination() {
        let directory = TestDirectory::new("calendar-write");
        let destination = directory.path().join("planning.ics");
        let content = "BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n";

        let written = write_calendar_ics_file(&destination, content).unwrap();
        assert_eq!(
            written,
            fs::canonicalize(directory.path())
                .unwrap()
                .join("planning.ics")
        );
        assert_eq!(fs::read_to_string(&destination).unwrap(), content);
        let updated_content = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n";
        write_calendar_ics_file(&destination, updated_content)
            .expect("replace an existing calendar atomically");
        assert_eq!(fs::read_to_string(&destination).unwrap(), updated_content);
        assert!(write_calendar_ics_file(Path::new("planning.ics"), content).is_err());
        assert!(write_calendar_ics_file(&directory.path().join("planning.txt"), content).is_err());

        let directory_destination = directory.path().join("dossier.ics");
        fs::create_dir(&directory_destination).unwrap();
        assert!(write_calendar_ics_file(&directory_destination, content).is_err());

        for entry in fs::read_dir(directory.path()).unwrap() {
            let name = entry.unwrap().file_name();
            assert!(
                !name.to_string_lossy().starts_with(".etude-calendar-"),
                "fichier temporaire restant: {}",
                name.to_string_lossy()
            );
        }
    }

    #[cfg(unix)]
    #[test]
    fn calendar_ics_write_refuses_symlink_destinations() {
        use std::os::unix::fs::symlink;

        let directory = TestDirectory::new("calendar-symlink");
        let protected = directory.path().join("protected.txt");
        let destination = directory.path().join("planning.ics");
        fs::write(&protected, "ne pas remplacer").unwrap();
        symlink(&protected, &destination).unwrap();

        assert!(write_calendar_ics_file(&destination, "calendrier malveillant").is_err());
        assert_eq!(fs::read_to_string(&protected).unwrap(), "ne pas remplacer");
        assert!(fs::symlink_metadata(&destination)
            .unwrap()
            .file_type()
            .is_symlink());
    }

    fn minimal_pdf() -> &'static [u8] {
        b"%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\nstartxref\n0\n%%EOF\n"
    }

    const TEST_ACCOUNT_A: &str = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const TEST_ACCOUNT_B: &str = "01234567-89ab-4cde-8fab-0123456789ab";

    fn marked_pdf(marker: &str) -> Vec<u8> {
        format!(
            "%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n% {marker}\nstartxref\n0\n%%EOF\n"
        )
        .into_bytes()
    }

    fn expected_managed_pdf(
        app_data: &Path,
        account_id: &str,
        record_id: &str,
        variant: AssessmentPdfVariant,
    ) -> PathBuf {
        app_data
            .join(ASSESSMENT_DOCUMENTS_DIRECTORY)
            .join(ASSESSMENT_PROFILE_DOCUMENTS_DIRECTORY)
            .join(account_id)
            .join(record_id)
            .join(variant.file_name())
    }

    fn assert_no_transaction_artifacts(record_directory: &Path) {
        for entry in fs::read_dir(record_directory).unwrap() {
            let name = entry.unwrap().file_name();
            assert!(
                !name.to_string_lossy().starts_with(".assessment-"),
                "temporary transaction artifact remains: {}",
                name.to_string_lossy()
            );
        }
    }

    #[test]
    fn validates_assessment_record_ids_and_pdf_variants() {
        for record_id in ["assessment-42", "UUID_123", "a", "A9-b_c"] {
            assert!(
                validate_assessment_record_id(record_id).is_ok(),
                "{record_id}"
            );
        }
        for record_id in [
            "",
            ".",
            "..",
            "../assessment",
            "assessment/other",
            " assessment",
            "assessment ",
            "évaluation",
            "assessment:42",
        ] {
            assert!(
                validate_assessment_record_id(record_id).is_err(),
                "{record_id}"
            );
        }
        assert!(
            validate_assessment_record_id(&"a".repeat(MAX_ASSESSMENT_RECORD_ID_LENGTH + 1))
                .is_err()
        );
        assert_eq!(AssessmentPdfVariant::Blank.file_name(), "sujet-vierge.pdf");
        assert_eq!(
            AssessmentPdfVariant::Completed.file_name(),
            "copie-remplie.pdf"
        );
    }

    #[test]
    fn accepts_only_bounded_regular_pdf_files_with_complete_signatures() {
        let directory = TestDirectory::new("pdf-validation");
        let valid = directory.path().join("document.PDF");
        fs::write(&valid, minimal_pdf()).unwrap();
        let (mut file, size) = open_valid_pdf(&valid).unwrap();
        assert_eq!(size, minimal_pdf().len() as u64);
        let mut header = [0_u8; 5];
        file.read_exact(&mut header).unwrap();
        assert_eq!(&header, PDF_HEADER);

        let wrong_extension = directory.path().join("document.txt");
        fs::write(&wrong_extension, minimal_pdf()).unwrap();
        assert!(open_valid_pdf(&wrong_extension).is_err());

        let wrong_header = directory.path().join("wrong-header.pdf");
        fs::write(&wrong_header, b"not-a-pdf\n%%EOF\n").unwrap();
        assert!(open_valid_pdf(&wrong_header).is_err());

        let missing_eof = directory.path().join("missing-eof.pdf");
        fs::write(&missing_eof, b"%PDF-1.7\nincomplete").unwrap();
        assert!(open_valid_pdf(&missing_eof).is_err());

        let oversized = directory.path().join("oversized.pdf");
        let oversized_file = File::create(&oversized).unwrap();
        oversized_file.set_len(MAX_ASSESSMENT_PDF_SIZE + 1).unwrap();
        assert!(open_valid_pdf(&oversized).is_err());

        let fake_directory = directory.path().join("folder.pdf");
        fs::create_dir(&fake_directory).unwrap();
        assert!(open_valid_pdf(&fake_directory).is_err());
    }

    #[cfg(unix)]
    #[test]
    fn rejects_symbolic_links_for_sources_and_managed_directories() {
        use std::os::unix::fs::symlink;

        let directory = TestDirectory::new("pdf-symlinks");
        let source = directory.path().join("source.pdf");
        fs::write(&source, minimal_pdf()).unwrap();
        let source_link = directory.path().join("source-link.pdf");
        symlink(&source, &source_link).unwrap();
        assert!(open_valid_pdf(&source_link).is_err());

        let app_data = directory.path().join("app-data");
        fs::create_dir(&app_data).unwrap();
        let outside = directory.path().join("outside");
        fs::create_dir(&outside).unwrap();
        symlink(&outside, app_data.join(ASSESSMENT_DOCUMENTS_DIRECTORY)).unwrap();
        assert!(ensure_assessment_documents_root(&app_data).is_err());
    }

    #[cfg(unix)]
    #[test]
    fn rejects_symbolic_links_at_every_profile_directory_level() {
        use std::os::unix::fs::symlink;

        let source_directory = TestDirectory::new("pdf-profile-symlink-source");
        let source = source_directory.path().join("source.pdf");
        fs::write(&source, minimal_pdf()).unwrap();

        let profiles_case = TestDirectory::new("pdf-profile-root-symlink");
        let profiles_app_data = profiles_case.path().join("app-data");
        let profiles_root = ensure_assessment_documents_root(&profiles_app_data).unwrap();
        let outside_profiles = profiles_case.path().join("outside-profiles");
        fs::create_dir(&outside_profiles).unwrap();
        symlink(
            &outside_profiles,
            profiles_root.join(ASSESSMENT_PROFILE_DOCUMENTS_DIRECTORY),
        )
        .unwrap();
        assert!(import_assessment_pdf_batch(
            &profiles_app_data,
            TEST_ACCOUNT_A,
            "record",
            Some(&source),
            None,
            None,
        )
        .is_err());

        let account_case = TestDirectory::new("pdf-account-directory-symlink");
        let account_app_data = account_case.path().join("app-data");
        let account_root = ensure_assessment_documents_root(&account_app_data).unwrap();
        let account_profiles = ensure_assessment_profile_documents_root(&account_root).unwrap();
        let outside_account = account_case.path().join("outside-account");
        fs::create_dir(&outside_account).unwrap();
        symlink(&outside_account, account_profiles.join(TEST_ACCOUNT_A)).unwrap();
        assert!(
            remove_account_assessment_documents(&account_app_data, TEST_ACCOUNT_A, &[]).is_err()
        );
        assert!(import_assessment_pdf_batch(
            &account_app_data,
            TEST_ACCOUNT_A,
            "record",
            Some(&source),
            None,
            None,
        )
        .is_err());

        let record_case = TestDirectory::new("pdf-record-directory-symlink");
        let record_app_data = record_case.path().join("app-data");
        let record_root = ensure_assessment_documents_root(&record_app_data).unwrap();
        let record_profiles = ensure_assessment_profile_documents_root(&record_root).unwrap();
        let record_account =
            ensure_assessment_account_directory(&record_profiles, TEST_ACCOUNT_A).unwrap();
        let outside_record = record_case.path().join("outside-record");
        fs::create_dir(&outside_record).unwrap();
        symlink(&outside_record, record_account.join("record")).unwrap();
        assert!(import_assessment_pdf_batch(
            &record_app_data,
            TEST_ACCOUNT_A,
            "record",
            Some(&source),
            None,
            None,
        )
        .is_err());
    }

    #[test]
    fn imports_a_copy_without_ever_modifying_the_selected_original() {
        let directory = TestDirectory::new("pdf-import");
        let app_data = directory.path().join("app-data");
        let source = directory.path().join("downloaded-subject.pdf");
        let original = minimal_pdf().to_vec();
        fs::write(&source, &original).unwrap();

        let imported = import_assessment_pdf_batch(
            &app_data,
            TEST_ACCOUNT_A,
            "record-123",
            Some(&source),
            None,
            None,
        )
        .unwrap();
        assert_eq!(imported.completed, None);
        assert_eq!(
            imported.blank,
            Some(AssessmentPdfMetadata {
                original_name: "downloaded-subject.pdf".into(),
                size_bytes: original.len() as u64,
            })
        );
        assert_eq!(fs::read(&source).unwrap(), original);

        let stored_path = expected_managed_pdf(
            &app_data,
            TEST_ACCOUNT_A,
            "record-123",
            AssessmentPdfVariant::Blank,
        );
        assert_eq!(fs::read(&stored_path).unwrap(), original);
        assert_eq!(
            managed_assessment_pdf_path(
                &app_data,
                TEST_ACCOUNT_A,
                "record-123",
                AssessmentPdfVariant::Blank,
            )
            .unwrap(),
            fs::canonicalize(&stored_path).unwrap()
        );
        assert!(import_assessment_pdf_batch(
            &app_data,
            TEST_ACCOUNT_A,
            "record-123",
            Some(&stored_path),
            None,
            None,
        )
        .is_err());
    }

    #[test]
    fn validates_every_source_before_changing_an_existing_destination() {
        let directory = TestDirectory::new("pdf-batch-validation");
        let app_data = directory.path().join("app-data");
        let old_source = directory.path().join("old.pdf");
        let new_source = directory.path().join("new.pdf");
        let invalid_source = directory.path().join("invalid.pdf");
        let old = marked_pdf("old destination");
        let new = marked_pdf("new source");
        fs::write(&old_source, &old).unwrap();
        fs::write(&new_source, &new).unwrap();
        fs::write(&invalid_source, b"not a PDF\n%%EOF\n").unwrap();

        import_assessment_pdf_batch(
            &app_data,
            TEST_ACCOUNT_A,
            "record-safe",
            Some(&old_source),
            None,
            None,
        )
        .unwrap();
        let blank = expected_managed_pdf(
            &app_data,
            TEST_ACCOUNT_A,
            "record-safe",
            AssessmentPdfVariant::Blank,
        );

        assert!(import_assessment_pdf_batch(
            &app_data,
            TEST_ACCOUNT_A,
            "record-safe",
            Some(&new_source),
            Some(&invalid_source),
            None,
        )
        .is_err());
        assert_eq!(fs::read(&blank).unwrap(), old);
        assert!(!expected_managed_pdf(
            &app_data,
            TEST_ACCOUNT_A,
            "record-safe",
            AssessmentPdfVariant::Completed,
        )
        .exists());
        assert_no_transaction_artifacts(blank.parent().unwrap());
    }

    #[test]
    fn imports_two_pdfs_as_one_successful_batch_without_exposing_paths() {
        let directory = TestDirectory::new("pdf-batch-success");
        let app_data = directory.path().join("app-data");
        let blank_source = directory.path().join("controle-sujet.pdf");
        let completed_source = directory.path().join("ma-copie.pdf");
        let blank = marked_pdf("blank batch");
        let completed = marked_pdf("completed batch");
        fs::write(&blank_source, &blank).unwrap();
        fs::write(&completed_source, &completed).unwrap();

        let imported = import_assessment_pdf_batch(
            &app_data,
            TEST_ACCOUNT_A,
            "record-batch",
            Some(&blank_source),
            Some(&completed_source),
            None,
        )
        .unwrap();
        assert_eq!(
            imported.blank.unwrap(),
            AssessmentPdfMetadata {
                original_name: "controle-sujet.pdf".into(),
                size_bytes: blank.len() as u64,
            }
        );
        assert_eq!(
            imported.completed.unwrap(),
            AssessmentPdfMetadata {
                original_name: "ma-copie.pdf".into(),
                size_bytes: completed.len() as u64,
            }
        );
        assert_eq!(
            fs::read(expected_managed_pdf(
                &app_data,
                TEST_ACCOUNT_A,
                "record-batch",
                AssessmentPdfVariant::Blank,
            ))
            .unwrap(),
            blank
        );
        assert_eq!(
            fs::read(expected_managed_pdf(
                &app_data,
                TEST_ACCOUNT_A,
                "record-batch",
                AssessmentPdfVariant::Completed,
            ))
            .unwrap(),
            completed
        );
    }

    #[test]
    fn rolls_back_both_variants_when_the_second_commit_fails() {
        let directory = TestDirectory::new("pdf-batch-rollback");
        let app_data = directory.path().join("app-data");
        let old_blank_source = directory.path().join("old-blank.pdf");
        let old_completed_source = directory.path().join("old-completed.pdf");
        let new_blank_source = directory.path().join("new-blank.pdf");
        let new_completed_source = directory.path().join("new-completed.pdf");
        let old_blank = marked_pdf("old blank");
        let old_completed = marked_pdf("old completed");
        let new_blank = marked_pdf("new blank");
        let new_completed = marked_pdf("new completed");
        fs::write(&old_blank_source, &old_blank).unwrap();
        fs::write(&old_completed_source, &old_completed).unwrap();
        fs::write(&new_blank_source, &new_blank).unwrap();
        fs::write(&new_completed_source, &new_completed).unwrap();

        import_assessment_pdf_batch(
            &app_data,
            TEST_ACCOUNT_A,
            "record-rollback",
            Some(&old_blank_source),
            Some(&old_completed_source),
            None,
        )
        .unwrap();
        assert!(import_assessment_pdf_batch(
            &app_data,
            TEST_ACCOUNT_A,
            "record-rollback",
            Some(&new_blank_source),
            Some(&new_completed_source),
            Some(1),
        )
        .is_err());

        let blank_destination = expected_managed_pdf(
            &app_data,
            TEST_ACCOUNT_A,
            "record-rollback",
            AssessmentPdfVariant::Blank,
        );
        let completed_destination = expected_managed_pdf(
            &app_data,
            TEST_ACCOUNT_A,
            "record-rollback",
            AssessmentPdfVariant::Completed,
        );
        assert_eq!(fs::read(&blank_destination).unwrap(), old_blank);
        assert_eq!(fs::read(&completed_destination).unwrap(), old_completed);
        assert_eq!(fs::read(&new_blank_source).unwrap(), new_blank);
        assert_eq!(fs::read(&new_completed_source).unwrap(), new_completed);
        assert_no_transaction_artifacts(blank_destination.parent().unwrap());
    }

    #[test]
    fn opening_is_resolved_from_the_exact_record_and_variant_only() {
        let directory = TestDirectory::new("pdf-open-scope");
        let app_data = directory.path().join("app-data");
        let source = directory.path().join("source.pdf");
        fs::write(&source, minimal_pdf()).unwrap();
        import_assessment_pdf_batch(
            &app_data,
            TEST_ACCOUNT_A,
            "record-safe",
            None,
            Some(&source),
            None,
        )
        .unwrap();

        assert!(managed_assessment_pdf_path(
            &app_data,
            TEST_ACCOUNT_A,
            "record-safe",
            AssessmentPdfVariant::Completed
        )
        .is_ok());
        assert!(managed_assessment_pdf_path(
            &app_data,
            TEST_ACCOUNT_A,
            "record-safe",
            AssessmentPdfVariant::Blank,
        )
        .is_err());
        assert!(managed_assessment_pdf_path(
            &app_data,
            TEST_ACCOUNT_A,
            "../record-safe",
            AssessmentPdfVariant::Completed
        )
        .is_err());

        let unexpected = expected_managed_pdf(
            &app_data,
            TEST_ACCOUNT_A,
            "record-safe",
            AssessmentPdfVariant::Completed,
        )
        .parent()
        .unwrap()
        .join("autre.pdf");
        fs::write(&unexpected, minimal_pdf()).unwrap();
        assert!(managed_assessment_pdf_path(
            &app_data,
            TEST_ACCOUNT_A,
            "record-safe",
            AssessmentPdfVariant::Completed
        )
        .is_ok());
    }

    #[test]
    fn the_same_record_id_is_isolated_between_two_accounts() {
        let directory = TestDirectory::new("pdf-account-isolation");
        let app_data = directory.path().join("app-data");
        let source_a = directory.path().join("account-a.pdf");
        let source_b = directory.path().join("account-b.pdf");
        let pdf_a = marked_pdf("private account A");
        let pdf_b = marked_pdf("private account B");
        fs::write(&source_a, &pdf_a).unwrap();
        fs::write(&source_b, &pdf_b).unwrap();

        import_assessment_pdf_batch(
            &app_data,
            TEST_ACCOUNT_A,
            "shared-record-id",
            Some(&source_a),
            None,
            None,
        )
        .unwrap();
        import_assessment_pdf_batch(
            &app_data,
            TEST_ACCOUNT_B,
            "shared-record-id",
            Some(&source_b),
            None,
            None,
        )
        .unwrap();

        let stored_a = expected_managed_pdf(
            &app_data,
            TEST_ACCOUNT_A,
            "shared-record-id",
            AssessmentPdfVariant::Blank,
        );
        let stored_b = expected_managed_pdf(
            &app_data,
            TEST_ACCOUNT_B,
            "shared-record-id",
            AssessmentPdfVariant::Blank,
        );
        assert_ne!(stored_a, stored_b);
        assert_eq!(fs::read(stored_a).unwrap(), pdf_a);
        assert_eq!(fs::read(stored_b).unwrap(), pdf_b);
    }

    #[test]
    fn deleting_one_accounts_record_keeps_the_other_accounts_copy() {
        let directory = TestDirectory::new("pdf-account-delete");
        let app_data = directory.path().join("app-data");
        let source = directory.path().join("source.pdf");
        fs::write(&source, minimal_pdf()).unwrap();
        for account_id in [TEST_ACCOUNT_A, TEST_ACCOUNT_B] {
            import_assessment_pdf_batch(
                &app_data,
                account_id,
                "same-record",
                Some(&source),
                None,
                None,
            )
            .unwrap();
        }

        assert!(remove_assessment_documents(&app_data, TEST_ACCOUNT_A, "same-record").unwrap());
        assert!(!expected_managed_pdf(
            &app_data,
            TEST_ACCOUNT_A,
            "same-record",
            AssessmentPdfVariant::Blank,
        )
        .exists());
        assert!(managed_assessment_pdf_path(
            &app_data,
            TEST_ACCOUNT_B,
            "same-record",
            AssessmentPdfVariant::Blank,
        )
        .is_ok());
    }

    #[test]
    fn deleting_selected_account_pdfs_keeps_other_records_and_accounts() {
        let directory = TestDirectory::new("pdf-account-root-delete");
        let app_data = directory.path().join("app-data");
        let source = directory.path().join("source.pdf");
        fs::write(&source, minimal_pdf()).unwrap();
        for record_id in ["first-record", "orphaned-record"] {
            import_assessment_pdf_batch(
                &app_data,
                TEST_ACCOUNT_A,
                record_id,
                Some(&source),
                None,
                None,
            )
            .unwrap();
        }
        import_assessment_pdf_batch(
            &app_data,
            TEST_ACCOUNT_B,
            "first-record",
            Some(&source),
            None,
            None,
        )
        .unwrap();

        assert!(remove_account_assessment_documents(
            &app_data,
            TEST_ACCOUNT_A,
            &["first-record".to_string()],
        )
        .unwrap());
        assert!(!expected_managed_pdf(
            &app_data,
            TEST_ACCOUNT_A,
            "first-record",
            AssessmentPdfVariant::Blank,
        )
        .exists());
        assert!(expected_managed_pdf(
            &app_data,
            TEST_ACCOUNT_A,
            "orphaned-record",
            AssessmentPdfVariant::Blank,
        )
        .exists());
        assert!(!remove_account_assessment_documents(&app_data, TEST_ACCOUNT_A, &[]).unwrap());
        assert!(managed_assessment_pdf_path(
            &app_data,
            TEST_ACCOUNT_B,
            "first-record",
            AssessmentPdfVariant::Blank,
        )
        .is_ok());
    }

    #[test]
    fn account_reset_removes_unopened_legacy_pdfs_and_preserves_another_profile() {
        let directory = TestDirectory::new("pdf-account-reset-legacy");
        let app_data = directory.path().join("app-data");
        let root = ensure_assessment_documents_root(&app_data).unwrap();
        let legacy_record = ensure_assessment_record_directory(&root, "legacy-account-a").unwrap();
        fs::write(
            legacy_record.join(AssessmentPdfVariant::Blank.file_name()),
            minimal_pdf(),
        )
        .unwrap();

        let source_b = directory.path().join("account-b.pdf");
        fs::write(&source_b, minimal_pdf()).unwrap();
        import_assessment_pdf_batch(
            &app_data,
            TEST_ACCOUNT_B,
            "account-b-record",
            Some(&source_b),
            None,
            None,
        )
        .unwrap();

        assert!(remove_account_assessment_documents(
            &app_data,
            TEST_ACCOUNT_A,
            &["legacy-account-a".to_string()],
        )
        .unwrap());
        assert!(!legacy_record.exists());
        assert!(managed_assessment_pdf_path(
            &app_data,
            TEST_ACCOUNT_B,
            "account-b-record",
            AssessmentPdfVariant::Blank,
        )
        .is_ok());
    }

    #[test]
    fn legacy_global_record_is_migrated_into_only_one_profile() {
        let directory = TestDirectory::new("pdf-account-legacy");
        let app_data = directory.path().join("app-data");
        let root = ensure_assessment_documents_root(&app_data).unwrap();
        let legacy_record = ensure_assessment_record_directory(&root, "legacy-record").unwrap();
        fs::write(
            legacy_record.join(AssessmentPdfVariant::Blank.file_name()),
            minimal_pdf(),
        )
        .unwrap();

        let migrated = managed_assessment_pdf_path(
            &app_data,
            TEST_ACCOUNT_A,
            "legacy-record",
            AssessmentPdfVariant::Blank,
        )
        .unwrap();
        assert_eq!(
            migrated,
            fs::canonicalize(expected_managed_pdf(
                &app_data,
                TEST_ACCOUNT_A,
                "legacy-record",
                AssessmentPdfVariant::Blank,
            ))
            .unwrap()
        );
        assert!(!legacy_record.exists());
        assert!(managed_assessment_pdf_path(
            &app_data,
            TEST_ACCOUNT_B,
            "legacy-record",
            AssessmentPdfVariant::Blank,
        )
        .is_err());
    }

    #[test]
    fn deletion_removes_only_the_exact_validated_assessment_directory() {
        let directory = TestDirectory::new("pdf-delete");
        let app_data = directory.path().join("app-data");
        let source = directory.path().join("source.pdf");
        fs::write(&source, minimal_pdf()).unwrap();
        import_assessment_pdf_batch(
            &app_data,
            TEST_ACCOUNT_A,
            "record-first",
            Some(&source),
            None,
            None,
        )
        .unwrap();
        import_assessment_pdf_batch(
            &app_data,
            TEST_ACCOUNT_A,
            "record-second",
            None,
            Some(&source),
            None,
        )
        .unwrap();

        let first = expected_managed_pdf(
            &app_data,
            TEST_ACCOUNT_A,
            "record-first",
            AssessmentPdfVariant::Blank,
        );
        let second = expected_managed_pdf(
            &app_data,
            TEST_ACCOUNT_A,
            "record-second",
            AssessmentPdfVariant::Completed,
        );

        assert!(
            remove_assessment_documents(&app_data, TEST_ACCOUNT_A, "../record-second").is_err()
        );
        assert!(first.exists());
        assert!(second.exists());
        assert!(remove_assessment_documents(&app_data, TEST_ACCOUNT_A, "record-first").unwrap());
        assert!(!first.exists());
        assert!(second.exists());
        assert!(!remove_assessment_documents(&app_data, TEST_ACCOUNT_A, "record-first").unwrap());
    }

    #[test]
    fn global_deletion_removes_only_the_exact_managed_root() {
        let directory = TestDirectory::new("pdf-delete-all");
        let app_data = directory.path().join("app-data");
        let source = directory.path().join("original.pdf");
        let original = marked_pdf("original outside managed root");
        fs::write(&source, &original).unwrap();
        import_assessment_pdf_batch(
            &app_data,
            TEST_ACCOUNT_A,
            "record-first",
            Some(&source),
            None,
            None,
        )
        .unwrap();
        import_assessment_pdf_batch(
            &app_data,
            TEST_ACCOUNT_B,
            "record-second",
            None,
            Some(&source),
            None,
        )
        .unwrap();

        let managed_root = app_data.join(ASSESSMENT_DOCUMENTS_DIRECTORY);
        assert!(managed_root.exists());
        assert!(remove_all_assessment_documents(&app_data).unwrap());
        assert!(!managed_root.exists());
        assert_eq!(fs::read(&source).unwrap(), original);
        assert!(app_data.exists());
        assert!(!remove_all_assessment_documents(&app_data).unwrap());
    }

    #[test]
    fn duolingo_routes_are_allowed_without_history_or_prompt_injection() {
        for raw in [
            "https://www.duolingo.com/learn",
            "https://duolingo.com/learn",
            "https://www.duolingo.com/course/en/fr/Learn-English",
        ] {
            let url = Url::parse(raw).unwrap();
            assert_eq!(
                provider_for_url(&url).unwrap(),
                AiProvider::Duolingo,
                "{raw}"
            );
            assert!(validate_webview_navigation(&url).is_ok(), "{raw}");
        }

        let start = AiProvider::Duolingo.start_url().unwrap();
        assert_eq!(start.as_str(), "https://www.duolingo.com/learn");
        assert!(!AiProvider::Duolingo.supports_lesson_injection());
        assert!(lesson_provider_script_config(AiProvider::Duolingo).is_none());
        assert!(!is_provider_new_chat_url(&start, AiProvider::Duolingo));
    }

    #[test]
    fn khan_academy_routes_are_allowed_without_history_or_prompt_injection() {
        for raw in [
            "https://www.khanacademy.org/",
            "https://fr.khanacademy.org/",
            "https://www.khanacademy.org/math/algebra",
        ] {
            let url = Url::parse(raw).unwrap();
            assert_eq!(
                provider_for_url(&url).unwrap(),
                AiProvider::Khanacademy,
                "{raw}"
            );
            assert!(validate_webview_navigation(&url).is_ok(), "{raw}");
        }

        let start = AiProvider::Khanacademy.start_url().unwrap();
        assert_eq!(start.as_str(), "https://fr.khanacademy.org/");
        assert!(!AiProvider::Khanacademy.supports_lesson_injection());
        assert!(lesson_provider_script_config(AiProvider::Khanacademy).is_none());
        assert!(!is_provider_new_chat_url(&start, AiProvider::Khanacademy));
    }

    #[test]
    fn tiktok_search_and_video_routes_are_allowed_without_prompt_injection() {
        for raw in [
            "https://www.tiktok.com/",
            "https://www.tiktok.com/search?q=premier%20principe%20thermodynamique",
            "https://www.tiktok.com/@science/video/1234567890123456789",
            "https://vm.tiktok.com/ZMexample/",
        ] {
            let url = Url::parse(raw).unwrap();
            assert_eq!(provider_for_url(&url).unwrap(), AiProvider::Tiktok, "{raw}");
            assert!(validate_webview_navigation(&url).is_ok(), "{raw}");
        }

        assert_eq!(
            AiProvider::Tiktok.start_url().unwrap().as_str(),
            "https://www.tiktok.com/"
        );
        assert!(!AiProvider::Tiktok.supports_lesson_injection());
        assert!(lesson_provider_script_config(AiProvider::Tiktok).is_none());
        assert!(!is_provider_new_chat_url(
            &AiProvider::Tiktok.start_url().unwrap(),
            AiProvider::Tiktok
        ));
    }

    #[test]
    fn rejects_tiktok_lookalikes_and_unsafe_ports() {
        for raw in [
            "http://www.tiktok.com/search?q=thermodynamique",
            "https://www.tiktok.com.evil.example/search?q=thermodynamique",
            "https://www.tiktok.com@evil.example/search?q=thermodynamique",
            "https://www.tiktok.com:8443/search?q=thermodynamique",
        ] {
            assert!(parse_allowed_url(raw).is_err(), "{raw} should be rejected");
        }
    }

    #[test]
    fn formation_package_reader_requires_the_six_exact_json_files() {
        let directory = TestDirectory::new("formation-package-valid");
        let package = directory
            .path()
            .join("dowze-formation-lycee-seconde-2026-2027");
        fs::create_dir_all(&package).unwrap();
        for filename in FORMATION_PACKAGE_FILENAMES {
            fs::write(
                package.join(filename),
                br#"{"schemaVersion":"dowze-formation@1"}"#,
            )
            .unwrap();
        }

        let read = read_formation_package_directory(&package).unwrap();
        assert_eq!(
            read.directory_name,
            "dowze-formation-lycee-seconde-2026-2027"
        );
        assert!(read.formation.contains("schemaVersion"));
        assert!(read.subjects.contains("schemaVersion"));

        fs::write(package.join("bonus.json"), b"{}").unwrap();
        assert!(read_formation_package_directory(&package)
            .unwrap_err()
            .contains("inattendu"));
    }

    #[test]
    fn formation_package_reader_rejects_missing_invalid_and_oversized_files() {
        let directory = TestDirectory::new("formation-package-invalid");
        let package = directory.path().join("dowze-formation-test");
        fs::create_dir_all(&package).unwrap();
        for filename in FORMATION_PACKAGE_FILENAMES {
            fs::write(package.join(filename), b"{}").unwrap();
        }
        fs::remove_file(package.join("planning.json")).unwrap();
        assert!(read_formation_package_directory(&package)
            .unwrap_err()
            .contains("planning.json"));

        fs::write(package.join("planning.json"), b"not-json").unwrap();
        assert!(read_formation_package_directory(&package)
            .unwrap_err()
            .contains("JSON invalide"));

        fs::write(package.join("planning.json"), b"\xef\xbb\xbf{}").unwrap();
        assert!(read_formation_package_directory(&package)
            .unwrap_err()
            .contains("JSON invalide"));

        fs::write(
            package.join("planning.json"),
            vec![b' '; MAX_FORMATION_FILE_SIZE as usize + 1],
        )
        .unwrap();
        assert!(read_formation_package_directory(&package)
            .unwrap_err()
            .contains("dépasse"));
    }

    #[test]
    fn formation_package_reader_applies_the_total_size_limit() {
        let directory = TestDirectory::new("formation-package-total-size");
        let package = directory.path().join("dowze-formation-test");
        fs::create_dir_all(&package).unwrap();
        let large_json = format!(r#"{{"padding":"{}"}}"#, "x".repeat(1_400_000));
        for filename in FORMATION_PACKAGE_FILENAMES {
            fs::write(package.join(filename), large_json.as_bytes()).unwrap();
        }

        assert!(read_formation_package_directory(&package)
            .unwrap_err()
            .contains("limite totale"));
    }

    #[cfg(unix)]
    #[test]
    fn formation_package_reader_rejects_symbolic_files() {
        use std::os::unix::fs::symlink;

        let directory = TestDirectory::new("formation-package-symlink");
        let package = directory.path().join("dowze-formation-test");
        fs::create_dir_all(&package).unwrap();
        let outside = directory.path().join("outside.json");
        fs::write(&outside, b"{}").unwrap();
        for filename in FORMATION_PACKAGE_FILENAMES {
            fs::write(package.join(filename), b"{}").unwrap();
        }
        fs::remove_file(package.join("taches.json")).unwrap();
        symlink(&outside, package.join("taches.json")).unwrap();

        assert!(read_formation_package_directory(&package)
            .unwrap_err()
            .contains("lien symbolique"));
    }

    #[test]
    fn formation_kit_writer_is_atomic_and_zip_only() {
        let directory = TestDirectory::new("formation-kit");
        let destination = directory.path().join("kit.zip");
        let first = b"PK\x03\x04first";
        let second = b"PK\x03\x04second";

        write_formation_kit_file(&destination, first).unwrap();
        assert_eq!(fs::read(&destination).unwrap(), first);
        write_formation_kit_file(&destination, second).unwrap();
        assert_eq!(fs::read(&destination).unwrap(), second);
        assert!(write_formation_kit_file(&destination, b"not-a-zip").is_err());
        assert_eq!(fs::read(&destination).unwrap(), second);
        assert!(write_formation_kit_file(&directory.path().join("kit.txt"), second).is_err());

        #[cfg(unix)]
        {
            use std::os::unix::fs::symlink;
            let link = directory.path().join("kit-link.zip");
            symlink(&destination, &link).unwrap();
            assert!(write_formation_kit_file(&link, second).is_err());
        }
    }
}
