use argon2::{
    password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Algorithm, Argon2, Params, Version,
};
use chrono::{DateTime, SecondsFormat, Utc};
use keyring::{Entry, Error as KeyringError};
use rand::{rngs::OsRng, RngCore};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashSet,
    fs::{self, File, OpenOptions},
    io::{self, Read, Write},
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc, Mutex,
    },
};
use tauri::{Manager, State, Webview};
use zeroize::Zeroize;

const ACCOUNTS_FILE_NAME: &str = "local-accounts.v1.json";
const ACCOUNTS_SCHEMA_VERSION: u8 = 1;
const REMEMBERED_CREDENTIALS_SCHEMA_VERSION: u8 = 1;
const REMEMBERED_CREDENTIALS_KEYCHAIN_SERVICE: &str =
    "com.etude.desktop.local-auth.remembered-credentials";
const REMEMBERED_CREDENTIALS_KEYCHAIN_ACCOUNT: &str = "active-local-account";
const MAX_REMEMBERED_CREDENTIALS_SIZE: usize = 4 * 1024;
const MAX_ACCOUNTS: usize = 16;
const MAX_ACCOUNTS_FILE_SIZE: u64 = 1024 * 1024;
const MAX_DISPLAY_NAME_CHARS: usize = 80;
const MAX_DISPLAY_NAME_BYTES: usize = 320;
const MIN_USERNAME_CHARS: usize = 3;
const MAX_USERNAME_CHARS: usize = 64;
const MIN_PASSWORD_CHARS: usize = 10;
const MAX_PASSWORD_CHARS: usize = 256;
const MAX_PASSWORD_BYTES: usize = 1024;
const MAX_PASSWORD_HASH_BYTES: usize = 1024;
const MAX_ARGON_MEMORY_KIB: u32 = 128 * 1024;
const MAX_ARGON_ITERATIONS: u32 = 10;
const MAX_ARGON_PARALLELISM: u32 = 8;
static ACCOUNT_TEMP_COUNTER: AtomicU64 = AtomicU64::new(0);

type AuthResult<T> = Result<T, String>;

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct LocalAccountRecord {
    id: String,
    display_name: String,
    username: String,
    password_hash: String,
    created_at: String,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct LocalAccountsFile {
    schema_version: u8,
    accounts: Vec<LocalAccountRecord>,
}

impl Default for LocalAccountsFile {
    fn default() -> Self {
        Self {
            schema_version: ACCOUNTS_SCHEMA_VERSION,
            accounts: Vec::new(),
        }
    }
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LocalAccountSummary {
    id: String,
    display_name: String,
    username: String,
    created_at: String,
}

impl From<&LocalAccountRecord> for LocalAccountSummary {
    fn from(account: &LocalAccountRecord) -> Self {
        Self {
            id: account.id.clone(),
            display_name: account.display_name.clone(),
            username: account.username.clone(),
            created_at: account.created_at.clone(),
        }
    }
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LocalAccountStatus {
    accounts: Vec<LocalAccountSummary>,
    #[serde(skip_serializing_if = "Option::is_none")]
    active_account: Option<LocalAccountSummary>,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct RememberedLocalCredentials {
    schema_version: u8,
    account_id: String,
    username: String,
    password: String,
}

impl Drop for RememberedLocalCredentials {
    fn drop(&mut self) {
        self.password.zeroize();
    }
}

trait RememberedCredentialsStore: Send + Sync {
    fn load_secret(&self) -> AuthResult<Option<Vec<u8>>>;
    fn save_secret(&self, secret: &[u8]) -> AuthResult<()>;
    fn delete_secret(&self) -> AuthResult<()>;
}

struct KeychainRememberedCredentialsStore;

impl KeychainRememberedCredentialsStore {
    fn entry() -> AuthResult<Entry> {
        Entry::new(
            REMEMBERED_CREDENTIALS_KEYCHAIN_SERVICE,
            REMEMBERED_CREDENTIALS_KEYCHAIN_ACCOUNT,
        )
        .map_err(|error| format!("Impossible d’accéder au coffre sécurisé du système : {error}"))
    }
}

impl RememberedCredentialsStore for KeychainRememberedCredentialsStore {
    fn load_secret(&self) -> AuthResult<Option<Vec<u8>>> {
        match Self::entry()?.get_secret() {
            Ok(secret) => Ok(Some(secret)),
            Err(KeyringError::NoEntry) => Ok(None),
            Err(error) => Err(format!(
                "Impossible de lire la connexion mémorisée dans le coffre sécurisé du système : {error}"
            )),
        }
    }

    fn save_secret(&self, secret: &[u8]) -> AuthResult<()> {
        Self::entry()?.set_secret(secret).map_err(|error| {
            format!(
                "Impossible de mémoriser la connexion dans le coffre sécurisé du système : {error}"
            )
        })
    }

    fn delete_secret(&self) -> AuthResult<()> {
        match Self::entry()?.delete_credential() {
            Ok(()) | Err(KeyringError::NoEntry) => Ok(()),
            Err(error) => Err(format!(
                "Impossible de supprimer la connexion mémorisée du coffre sécurisé du système : {error}"
            )),
        }
    }
}

pub struct LocalAuthState {
    active_account_id: Arc<Mutex<Option<String>>>,
    store_lock: Arc<Mutex<()>>,
    remembered_credentials: Arc<dyn RememberedCredentialsStore>,
}

impl Default for LocalAuthState {
    fn default() -> Self {
        Self {
            active_account_id: Arc::new(Mutex::new(None)),
            store_lock: Arc::new(Mutex::new(())),
            remembered_credentials: Arc::new(KeychainRememberedCredentialsStore),
        }
    }
}

impl LocalAuthState {
    pub(crate) fn require_active_account(&self, account_id: &str) -> AuthResult<()> {
        validate_account_id(account_id)?;
        let active_account_id = self
            .active_account_id
            .lock()
            .map_err(|_| "La session locale est indisponible.".to_string())?;
        if active_account_id.as_deref() != Some(account_id) {
            return Err("Ce compte local n’est pas la session active.".into());
        }
        Ok(())
    }
}

fn local_argon2() -> Argon2<'static> {
    // The explicit algorithm/version prevents a future crate default from
    // silently changing the format used by existing local accounts.
    Argon2::new(Algorithm::Argon2id, Version::V0x13, Params::default())
}

fn normalize_display_name(raw: &str) -> AuthResult<String> {
    let display_name = raw.trim();
    let character_count = display_name.chars().count();
    if character_count == 0
        || character_count > MAX_DISPLAY_NAME_CHARS
        || display_name.len() > MAX_DISPLAY_NAME_BYTES
    {
        return Err(format!(
            "Le nom doit contenir entre 1 et {MAX_DISPLAY_NAME_CHARS} caractères."
        ));
    }
    if display_name.chars().any(char::is_control) {
        return Err("Le nom contient un caractère de contrôle interdit.".into());
    }
    Ok(display_name.to_owned())
}

fn normalize_username(raw: &str) -> AuthResult<String> {
    let username = raw.trim().to_ascii_lowercase();
    let character_count = username.len();
    if !(MIN_USERNAME_CHARS..=MAX_USERNAME_CHARS).contains(&character_count) {
        return Err(format!(
            "Le nom d’utilisateur doit contenir entre {MIN_USERNAME_CHARS} et {MAX_USERNAME_CHARS} caractères."
        ));
    }
    if !username.bytes().all(|byte| {
        byte.is_ascii_lowercase() || byte.is_ascii_digit() || matches!(byte, b'.' | b'_' | b'-')
    }) || !username
        .as_bytes()
        .first()
        .is_some_and(u8::is_ascii_alphanumeric)
        || !username
            .as_bytes()
            .last()
            .is_some_and(u8::is_ascii_alphanumeric)
    {
        return Err(
            "Le nom d’utilisateur accepte uniquement lettres, chiffres, point, tiret et underscore, et doit commencer et finir par une lettre ou un chiffre."
                .into(),
        );
    }
    Ok(username)
}

fn validate_password(password: &str) -> AuthResult<()> {
    let character_count = password.chars().count();
    if !(MIN_PASSWORD_CHARS..=MAX_PASSWORD_CHARS).contains(&character_count)
        || password.len() > MAX_PASSWORD_BYTES
    {
        return Err(format!(
            "Le mot de passe doit contenir entre {MIN_PASSWORD_CHARS} et {MAX_PASSWORD_CHARS} caractères."
        ));
    }
    if password.chars().any(char::is_control) {
        return Err("Le mot de passe contient un caractère de contrôle interdit.".into());
    }
    if password.chars().all(char::is_whitespace) {
        return Err("Le mot de passe ne peut pas être uniquement composé d’espaces.".into());
    }
    Ok(())
}

pub(crate) fn validate_account_id(id: &str) -> AuthResult<()> {
    let bytes = id.as_bytes();
    let is_hex = |byte: u8| byte.is_ascii_digit() || matches!(byte, b'a'..=b'f');
    let is_native_id = bytes.len() == 32 && bytes.iter().copied().all(is_hex);
    let is_browser_uuid_v4 = bytes.len() == 36
        && [8, 13, 18, 23]
            .into_iter()
            .all(|index| bytes[index] == b'-')
        && bytes[14] == b'4'
        && matches!(bytes[19].to_ascii_lowercase(), b'8' | b'9' | b'a' | b'b')
        && bytes
            .iter()
            .enumerate()
            .all(|(index, byte)| [8, 13, 18, 23].contains(&index) || is_hex(*byte));
    if !is_native_id && !is_browser_uuid_v4 {
        return Err("L’identifiant d’un compte local est invalide.".into());
    }
    Ok(())
}

fn validate_accounts_file(accounts_file: &LocalAccountsFile) -> AuthResult<()> {
    if accounts_file.schema_version != ACCOUNTS_SCHEMA_VERSION {
        return Err("La version des comptes locaux n’est pas prise en charge.".into());
    }
    if accounts_file.accounts.len() > MAX_ACCOUNTS {
        return Err(format!(
            "Le fichier contient plus de {MAX_ACCOUNTS} comptes locaux."
        ));
    }

    let mut account_ids = HashSet::new();
    let mut usernames = HashSet::new();
    for account in &accounts_file.accounts {
        validate_account_id(&account.id)?;
        if !account_ids.insert(account.id.as_str()) {
            return Err("Deux comptes locaux utilisent le même identifiant.".into());
        }
        if normalize_display_name(&account.display_name)? != account.display_name {
            return Err("Le nom enregistré d’un compte local n’est pas normalisé.".into());
        }
        if normalize_username(&account.username)? != account.username {
            return Err("Le nom d’utilisateur enregistré n’est pas normalisé.".into());
        }
        if !usernames.insert(account.username.as_str()) {
            return Err("Deux comptes locaux utilisent le même nom d’utilisateur.".into());
        }
        if account.password_hash.is_empty() || account.password_hash.len() > MAX_PASSWORD_HASH_BYTES
        {
            return Err("Le vérificateur d’un compte local est invalide.".into());
        }
        let parsed_hash = PasswordHash::new(&account.password_hash)
            .map_err(|_| "Le vérificateur d’un compte local est illisible.".to_string())?;
        if parsed_hash.algorithm.as_str() != "argon2id" {
            return Err("Le vérificateur d’un compte local n’utilise pas Argon2id.".into());
        }
        let memory = parsed_hash.params.get_decimal("m");
        let iterations = parsed_hash.params.get_decimal("t");
        let parallelism = parsed_hash.params.get_decimal("p");
        if parsed_hash.version != Some(19)
            || !memory.is_some_and(|value| {
                (Params::DEFAULT_M_COST..=MAX_ARGON_MEMORY_KIB).contains(&value)
            })
            || !iterations.is_some_and(|value| {
                (Params::DEFAULT_T_COST..=MAX_ARGON_ITERATIONS).contains(&value)
            })
            || !parallelism.is_some_and(|value| {
                (Params::DEFAULT_P_COST..=MAX_ARGON_PARALLELISM).contains(&value)
            })
            || parsed_hash.salt.is_none()
            || parsed_hash
                .hash
                .as_ref()
                .is_none_or(|output| output.as_bytes().len() != 32)
        {
            return Err("Les paramètres Argon2id d’un compte local sont invalides.".into());
        }
        DateTime::parse_from_rfc3339(&account.created_at)
            .map_err(|_| "La date de création d’un compte local est invalide.".to_string())?;
    }
    Ok(())
}

fn secure_accounts_path(app_data_dir: &Path) -> AuthResult<PathBuf> {
    fs::create_dir_all(app_data_dir)
        .map_err(|error| format!("Impossible de préparer les comptes locaux : {error}"))?;
    let metadata = fs::symlink_metadata(app_data_dir)
        .map_err(|error| format!("Impossible de vérifier le dossier des comptes : {error}"))?;
    if metadata.file_type().is_symlink() || !metadata.file_type().is_dir() {
        return Err("Le dossier des comptes locaux doit être un dossier régulier.".into());
    }
    let canonical_directory = fs::canonicalize(app_data_dir)
        .map_err(|error| format!("Impossible de sécuriser le dossier des comptes : {error}"))?;
    Ok(canonical_directory.join(ACCOUNTS_FILE_NAME))
}

fn read_accounts_file(app_data_dir: &Path) -> AuthResult<LocalAccountsFile> {
    let path = secure_accounts_path(app_data_dir)?;
    let metadata = match fs::symlink_metadata(&path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == io::ErrorKind::NotFound => {
            return Ok(LocalAccountsFile::default())
        }
        Err(error) => {
            return Err(format!(
                "Impossible de vérifier les comptes locaux : {error}"
            ))
        }
    };
    if metadata.file_type().is_symlink() || !metadata.file_type().is_file() {
        return Err("Le fichier des comptes locaux doit être un fichier régulier.".into());
    }
    if metadata.len() == 0 || metadata.len() > MAX_ACCOUNTS_FILE_SIZE {
        return Err("Le fichier des comptes locaux est vide ou trop volumineux.".into());
    }

    let mut file = File::open(&path)
        .map_err(|error| format!("Impossible d’ouvrir les comptes locaux : {error}"))?;
    let mut bytes = Vec::with_capacity(metadata.len() as usize);
    Read::by_ref(&mut file)
        .take(MAX_ACCOUNTS_FILE_SIZE + 1)
        .read_to_end(&mut bytes)
        .map_err(|error| format!("Impossible de lire les comptes locaux : {error}"))?;
    if bytes.len() as u64 > MAX_ACCOUNTS_FILE_SIZE {
        return Err("Le fichier des comptes locaux est trop volumineux.".into());
    }
    let accounts_file: LocalAccountsFile = serde_json::from_slice(&bytes)
        .map_err(|error| format!("Le fichier des comptes locaux est illisible : {error}"))?;
    validate_accounts_file(&accounts_file)?;
    Ok(accounts_file)
}

fn create_private_staging_file(parent: &Path) -> AuthResult<(PathBuf, File)> {
    for _ in 0..16 {
        let sequence = ACCOUNT_TEMP_COUNTER.fetch_add(1, Ordering::Relaxed);
        let staging_path = parent.join(format!(
            ".local-accounts-{}-{sequence}.tmp",
            std::process::id()
        ));
        let mut options = OpenOptions::new();
        options.create_new(true).write(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        match options.open(&staging_path) {
            Ok(file) => return Ok((staging_path, file)),
            Err(error) if error.kind() == io::ErrorKind::AlreadyExists => continue,
            Err(error) => {
                return Err(format!(
                    "Impossible de préparer l’enregistrement des comptes : {error}"
                ))
            }
        }
    }
    Err("Impossible de réserver un fichier temporaire pour les comptes locaux.".into())
}

fn write_accounts_file(app_data_dir: &Path, accounts_file: &LocalAccountsFile) -> AuthResult<()> {
    validate_accounts_file(accounts_file)?;
    let content = serde_json::to_vec_pretty(accounts_file)
        .map_err(|error| format!("Impossible d’encoder les comptes locaux : {error}"))?;
    if content.is_empty() || content.len() as u64 > MAX_ACCOUNTS_FILE_SIZE {
        return Err("Le fichier des comptes locaux serait trop volumineux.".into());
    }

    let destination = secure_accounts_path(app_data_dir)?;
    match fs::symlink_metadata(&destination) {
        Ok(metadata) => {
            if metadata.file_type().is_symlink() || !metadata.file_type().is_file() {
                return Err("Le fichier des comptes locaux doit être un fichier régulier.".into());
            }
        }
        Err(error) if error.kind() == io::ErrorKind::NotFound => {}
        Err(error) => {
            return Err(format!(
                "Impossible de vérifier les comptes locaux : {error}"
            ))
        }
    }
    let parent = destination
        .parent()
        .ok_or_else(|| "Le dossier des comptes locaux est absent.".to_string())?;
    let (staging_path, mut staging_file) = create_private_staging_file(parent)?;
    let write_result = (|| -> AuthResult<()> {
        staging_file
            .write_all(&content)
            .and_then(|_| staging_file.sync_all())
            .map_err(|error| format!("Impossible d’enregistrer les comptes locaux : {error}"))?;
        drop(staging_file);
        super::replace_file_atomically(&staging_path, &destination)
            .map_err(|error| format!("Impossible de finaliser les comptes locaux : {error}"))?;
        #[cfg(unix)]
        {
            // Une fois rename réussi, le compte est déjà publiquement visible.
            // Un échec de fsync du dossier ne doit pas transformer ce commit en
            // erreur ambiguë et pousser l'utilisateur à recréer le même compte.
            let _ = File::open(parent).and_then(|directory| directory.sync_all());
        }
        Ok(())
    })();
    if write_result.is_err() {
        let _ = fs::remove_file(&staging_path);
    }
    write_result
}

fn random_account_id() -> AuthResult<String> {
    let mut bytes = [0_u8; 16];
    OsRng
        .try_fill_bytes(&mut bytes)
        .map_err(|_| "Impossible de générer un identifiant de compte sûr.".to_string())?;
    Ok(bytes.iter().map(|byte| format!("{byte:02x}")).collect())
}

fn register_account(
    app_data_dir: &Path,
    display_name: &str,
    username: &str,
    password: &str,
) -> AuthResult<LocalAccountSummary> {
    let display_name = normalize_display_name(display_name)?;
    let username = normalize_username(username)?;
    validate_password(password)?;

    let mut accounts_file = read_accounts_file(app_data_dir)?;
    if accounts_file.accounts.len() >= MAX_ACCOUNTS {
        return Err(format!(
            "Cet appareil contient déjà le maximum de {MAX_ACCOUNTS} comptes locaux."
        ));
    }
    if accounts_file
        .accounts
        .iter()
        .any(|account| account.username == username)
    {
        return Err("Ce nom d’utilisateur existe déjà sur cet appareil.".into());
    }

    let salt = SaltString::generate(&mut OsRng);
    let password_hash = local_argon2()
        .hash_password(password.as_bytes(), &salt)
        .map_err(|_| "Impossible de protéger le mot de passe local.".to_string())?
        .to_string();
    let account = LocalAccountRecord {
        id: random_account_id()?,
        display_name,
        username,
        password_hash,
        created_at: Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true),
    };
    let summary = LocalAccountSummary::from(&account);
    accounts_file.accounts.push(account);
    write_accounts_file(app_data_dir, &accounts_file)?;
    Ok(summary)
}

fn authenticate_account(
    accounts_file: &LocalAccountsFile,
    username: &str,
    password: &str,
) -> AuthResult<LocalAccountSummary> {
    let invalid_credentials = || "Nom d’utilisateur ou mot de passe incorrect.".to_string();
    let username = normalize_username(username).map_err(|_| invalid_credentials())?;
    validate_password(password).map_err(|_| invalid_credentials())?;
    let account = accounts_file
        .accounts
        .iter()
        .find(|account| account.username == username)
        .ok_or_else(invalid_credentials)?;
    let parsed_hash = PasswordHash::new(&account.password_hash)
        .map_err(|_| "Le compte local ne peut pas être vérifié.".to_string())?;
    local_argon2()
        .verify_password(password.as_bytes(), &parsed_hash)
        .map_err(|_| invalid_credentials())?;
    Ok(LocalAccountSummary::from(account))
}

fn login_account(
    app_data_dir: &Path,
    username: &str,
    password: &str,
) -> AuthResult<LocalAccountSummary> {
    let accounts_file = read_accounts_file(app_data_dir)?;
    authenticate_account(&accounts_file, username, password)
}

fn encode_remembered_credentials(
    account: &LocalAccountSummary,
    password: &str,
) -> AuthResult<Vec<u8>> {
    validate_account_id(&account.id)?;
    if normalize_username(&account.username)? != account.username {
        return Err("L’identifiant mémorisé n’est pas normalisé.".into());
    }
    validate_password(password)?;
    let credentials = RememberedLocalCredentials {
        schema_version: REMEMBERED_CREDENTIALS_SCHEMA_VERSION,
        account_id: account.id.clone(),
        username: account.username.clone(),
        password: password.to_owned(),
    };
    let secret = serde_json::to_vec(&credentials)
        .map_err(|_| "La connexion mémorisée ne peut pas être encodée.".to_string())?;
    if secret.is_empty() || secret.len() > MAX_REMEMBERED_CREDENTIALS_SIZE {
        return Err("La connexion mémorisée dépasse la taille autorisée.".into());
    }
    Ok(secret)
}

fn decode_remembered_credentials(mut secret: Vec<u8>) -> AuthResult<RememberedLocalCredentials> {
    let result = (|| {
        if secret.is_empty() || secret.len() > MAX_REMEMBERED_CREDENTIALS_SIZE {
            return Err("La connexion mémorisée est vide ou trop volumineuse.".into());
        }
        let credentials: RememberedLocalCredentials = serde_json::from_slice(&secret)
            .map_err(|_| "La connexion mémorisée est illisible.".to_string())?;
        if credentials.schema_version != REMEMBERED_CREDENTIALS_SCHEMA_VERSION {
            return Err("La version de la connexion mémorisée n’est pas prise en charge.".into());
        }
        validate_account_id(&credentials.account_id)?;
        if normalize_username(&credentials.username)? != credentials.username {
            return Err("L’identifiant de la connexion mémorisée n’est pas normalisé.".into());
        }
        validate_password(&credentials.password)?;
        Ok(credentials)
    })();
    secret.zeroize();
    result
}

fn clear_remembered_credentials(store: &dyn RememberedCredentialsStore) -> AuthResult<()> {
    store.delete_secret()?;
    match store.load_secret()? {
        None => Ok(()),
        Some(mut residual_secret) => {
            residual_secret.zeroize();
            Err("La suppression de la connexion mémorisée n’a pas pu être vérifiée.".into())
        }
    }
}

fn save_remembered_credentials(
    store: &dyn RememberedCredentialsStore,
    account: &LocalAccountSummary,
    password: &str,
) -> AuthResult<()> {
    let mut secret = encode_remembered_credentials(account, password)?;
    let result = (|| {
        store.save_secret(&secret)?;
        let mut persisted_secret = store.load_secret()?.ok_or_else(|| {
            "La connexion mémorisée est absente après son enregistrement.".to_string()
        })?;
        let matches = persisted_secret == secret;
        persisted_secret.zeroize();
        if !matches {
            return Err("La connexion mémorisée n’a pas pu être vérifiée.".into());
        }
        Ok(())
    })();
    secret.zeroize();
    if let Err(error) = result {
        return match clear_remembered_credentials(store) {
            Ok(()) => Err(error),
            Err(cleanup_error) => Err(format!(
                "La connexion n’a pas pu être mémorisée ni annulée en sécurité. {cleanup_error}"
            )),
        };
    }
    Ok(())
}

fn load_remembered_credentials(
    store: &dyn RememberedCredentialsStore,
) -> AuthResult<Option<RememberedLocalCredentials>> {
    let Some(secret) = store.load_secret()? else {
        return Ok(None);
    };
    match decode_remembered_credentials(secret) {
        Ok(credentials) => Ok(Some(credentials)),
        Err(_) => {
            clear_remembered_credentials(store)?;
            Ok(None)
        }
    }
}

fn restore_remembered_account(
    accounts_file: &LocalAccountsFile,
    store: &dyn RememberedCredentialsStore,
) -> AuthResult<Option<LocalAccountSummary>> {
    let Some(credentials) = load_remembered_credentials(store)? else {
        return Ok(None);
    };
    let restored =
        authenticate_account(accounts_file, &credentials.username, &credentials.password);
    match restored {
        Ok(account) if account.id == credentials.account_id => Ok(Some(account)),
        Ok(_) | Err(_) => {
            clear_remembered_credentials(store)?;
            Ok(None)
        }
    }
}

fn local_account_status_inner(
    app_data_dir: &Path,
    active_account_id: &Mutex<Option<String>>,
    remembered_credentials: &dyn RememberedCredentialsStore,
) -> AuthResult<LocalAccountStatus> {
    let accounts_file = read_accounts_file(app_data_dir)?;
    let accounts = accounts_file
        .accounts
        .iter()
        .map(LocalAccountSummary::from)
        .collect::<Vec<_>>();
    let mut active_id = active_account_id
        .lock()
        .map_err(|_| "La session locale est indisponible.".to_string())?;
    if active_id.is_none() {
        *active_id = restore_remembered_account(&accounts_file, remembered_credentials)?
            .map(|account| account.id);
    }
    let active_account = active_id
        .as_deref()
        .and_then(|id| accounts.iter().find(|account| account.id == id))
        .cloned();
    if active_id.is_some() && active_account.is_none() {
        clear_remembered_credentials(remembered_credentials)?;
        *active_id = None;
    }
    Ok(LocalAccountStatus {
        accounts,
        active_account,
    })
}

fn register_local_account_inner(
    app_data_dir: &Path,
    active_account_id: &Mutex<Option<String>>,
    remembered_credentials: &dyn RememberedCredentialsStore,
    display_name: &str,
    username: &str,
    password: &str,
) -> AuthResult<LocalAccountSummary> {
    let mut active_id = active_account_id
        .lock()
        .map_err(|_| "La session locale est indisponible.".to_string())?;
    clear_remembered_credentials(remembered_credentials)?;
    let summary = register_account(app_data_dir, display_name, username, password)?;
    *active_id = Some(summary.id.clone());
    Ok(summary)
}

fn login_local_account_inner(
    app_data_dir: &Path,
    active_account_id: &Mutex<Option<String>>,
    remembered_credentials: &dyn RememberedCredentialsStore,
    username: &str,
    password: &str,
    remember_me: bool,
) -> AuthResult<LocalAccountSummary> {
    let summary = login_account(app_data_dir, username, password)?;
    let mut active_id = active_account_id
        .lock()
        .map_err(|_| "La session locale est indisponible.".to_string())?;
    if remember_me {
        save_remembered_credentials(remembered_credentials, &summary, password)?;
    } else {
        clear_remembered_credentials(remembered_credentials)?;
    }
    *active_id = Some(summary.id.clone());
    Ok(summary)
}

fn logout_local_account_inner(
    active_account_id: &Mutex<Option<String>>,
    remembered_credentials: &dyn RememberedCredentialsStore,
) -> AuthResult<()> {
    let mut active_id = active_account_id
        .lock()
        .map_err(|_| "La session locale est indisponible.".to_string())?;
    clear_remembered_credentials(remembered_credentials)?;
    *active_id = None;
    Ok(())
}

fn app_data_directory(caller: &Webview) -> AuthResult<PathBuf> {
    caller
        .app_handle()
        .path()
        .app_data_dir()
        .map_err(|error| format!("Impossible de localiser les données de l’application : {error}"))
}

#[tauri::command]
pub async fn local_account_status(
    caller: Webview,
    state: State<'_, LocalAuthState>,
) -> AuthResult<LocalAccountStatus> {
    super::require_main_caller(&caller)?;
    let app_data_dir = app_data_directory(&caller)?;
    let active_account_id = Arc::clone(&state.active_account_id);
    let store_lock = Arc::clone(&state.store_lock);
    let remembered_credentials = Arc::clone(&state.remembered_credentials);
    drop(caller);

    tauri::async_runtime::spawn_blocking(move || {
        let _store_guard = store_lock
            .lock()
            .map_err(|_| "Le stockage des comptes locaux est indisponible.".to_string())?;
        local_account_status_inner(
            &app_data_dir,
            &active_account_id,
            remembered_credentials.as_ref(),
        )
    })
    .await
    .map_err(|error| format!("La consultation des comptes s’est interrompue : {error}"))?
}

#[tauri::command]
pub async fn register_local_account(
    caller: Webview,
    state: State<'_, LocalAuthState>,
    display_name: String,
    username: String,
    mut password: String,
) -> AuthResult<LocalAccountSummary> {
    super::require_main_caller(&caller)?;
    let app_data_dir = app_data_directory(&caller)?;
    let active_account_id = Arc::clone(&state.active_account_id);
    let store_lock = Arc::clone(&state.store_lock);
    let remembered_credentials = Arc::clone(&state.remembered_credentials);
    drop(caller);

    tauri::async_runtime::spawn_blocking(move || {
        let result = (|| {
            let _store_guard = store_lock
                .lock()
                .map_err(|_| "Le stockage des comptes locaux est indisponible.".to_string())?;
            register_local_account_inner(
                &app_data_dir,
                &active_account_id,
                remembered_credentials.as_ref(),
                &display_name,
                &username,
                &password,
            )
        })();
        password.zeroize();
        result
    })
    .await
    .map_err(|error| format!("La création du compte s’est interrompue : {error}"))?
}

#[tauri::command]
pub async fn login_local_account(
    caller: Webview,
    state: State<'_, LocalAuthState>,
    username: String,
    mut password: String,
    remember_me: bool,
) -> AuthResult<LocalAccountSummary> {
    super::require_main_caller(&caller)?;
    let app_data_dir = app_data_directory(&caller)?;
    let active_account_id = Arc::clone(&state.active_account_id);
    let store_lock = Arc::clone(&state.store_lock);
    let remembered_credentials = Arc::clone(&state.remembered_credentials);
    drop(caller);

    tauri::async_runtime::spawn_blocking(move || {
        let result = (|| {
            let _store_guard = store_lock
                .lock()
                .map_err(|_| "Le stockage des comptes locaux est indisponible.".to_string())?;
            login_local_account_inner(
                &app_data_dir,
                &active_account_id,
                remembered_credentials.as_ref(),
                &username,
                &password,
                remember_me,
            )
        })();
        password.zeroize();
        result
    })
    .await
    .map_err(|error| format!("La connexion s’est interrompue : {error}"))?
}

#[tauri::command]
pub async fn logout_local_account(
    caller: Webview,
    state: State<'_, LocalAuthState>,
) -> AuthResult<()> {
    super::require_main_caller(&caller)?;
    let active_account_id = Arc::clone(&state.active_account_id);
    let store_lock = Arc::clone(&state.store_lock);
    let remembered_credentials = Arc::clone(&state.remembered_credentials);
    drop(caller);

    tauri::async_runtime::spawn_blocking(move || {
        let _store_guard = store_lock
            .lock()
            .map_err(|_| "Le stockage des comptes locaux est indisponible.".to_string())?;
        logout_local_account_inner(&active_account_id, remembered_credentials.as_ref())
    })
    .await
    .map_err(|error| format!("La déconnexion s’est interrompue : {error}"))?
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};

    static TEST_DIRECTORY_COUNTER: AtomicU64 = AtomicU64::new(0);

    struct TestDirectory(PathBuf);

    impl TestDirectory {
        fn new(label: &str) -> Self {
            let sequence = TEST_DIRECTORY_COUNTER.fetch_add(1, Ordering::Relaxed);
            let path = std::env::temp_dir().join(format!(
                "etude-local-auth-{label}-{}-{sequence}",
                std::process::id()
            ));
            fs::create_dir(&path).expect("create isolated local auth test directory");
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

    #[derive(Default)]
    struct FakeRememberedCredentialsState {
        secret: Option<Vec<u8>>,
        fail_save: bool,
        fail_delete: bool,
        corrupt_saved_secret: bool,
        save_calls: usize,
        delete_calls: usize,
    }

    #[derive(Default)]
    struct FakeRememberedCredentialsStore {
        state: Mutex<FakeRememberedCredentialsState>,
    }

    impl FakeRememberedCredentialsStore {
        fn with_secret(secret: Vec<u8>) -> Self {
            Self {
                state: Mutex::new(FakeRememberedCredentialsState {
                    secret: Some(secret),
                    ..FakeRememberedCredentialsState::default()
                }),
            }
        }

        fn fail_save(&self) {
            self.state.lock().unwrap().fail_save = true;
        }

        fn fail_delete(&self) {
            self.state.lock().unwrap().fail_delete = true;
        }

        fn corrupt_saved_secret(&self) {
            self.state.lock().unwrap().corrupt_saved_secret = true;
        }

        fn secret(&self) -> Option<Vec<u8>> {
            self.state.lock().unwrap().secret.clone()
        }

        fn save_calls(&self) -> usize {
            self.state.lock().unwrap().save_calls
        }

        fn delete_calls(&self) -> usize {
            self.state.lock().unwrap().delete_calls
        }
    }

    impl RememberedCredentialsStore for FakeRememberedCredentialsStore {
        fn load_secret(&self) -> AuthResult<Option<Vec<u8>>> {
            Ok(self.state.lock().unwrap().secret.clone())
        }

        fn save_secret(&self, secret: &[u8]) -> AuthResult<()> {
            let mut state = self.state.lock().unwrap();
            state.save_calls += 1;
            if state.fail_save {
                return Err("Échec simulé de l’enregistrement du secret.".into());
            }
            state.secret = Some(if state.corrupt_saved_secret {
                br#"{"corrompu":true}"#.to_vec()
            } else {
                secret.to_vec()
            });
            Ok(())
        }

        fn delete_secret(&self) -> AuthResult<()> {
            let mut state = self.state.lock().unwrap();
            state.delete_calls += 1;
            if state.fail_delete {
                return Err("Échec simulé de la suppression du secret.".into());
            }
            state.secret = None;
            Ok(())
        }
    }

    fn test_account_summary(id: char, username: &str) -> LocalAccountSummary {
        LocalAccountSummary {
            id: id.to_string().repeat(32),
            display_name: "Compte de test".into(),
            username: username.into(),
            created_at: "2026-09-08T00:00:00.000Z".into(),
        }
    }

    #[test]
    fn validates_and_normalizes_public_account_fields() {
        assert_eq!(
            normalize_display_name("  Louis Martin  ").unwrap(),
            "Louis Martin"
        );
        assert_eq!(normalize_username("  Louis_2026  ").unwrap(), "louis_2026");
        assert!(normalize_username("ab").is_err());
        assert!(normalize_username("-louis").is_err());
        assert!(normalize_username("louis@example.com").is_err());
        assert!(normalize_display_name("Louis\nMartin").is_err());
        assert!(validate_password("tropcourt").is_err());
        assert!(validate_password("mot de passe solide").is_ok());
        assert!(validate_password("          ").is_err());
        assert!(validate_password("mot-de-passe\ninterdit").is_err());
        assert!(validate_account_id("0123456789abcdef0123456789abcdef").is_ok());
        assert!(validate_account_id("01234567-89ab-4cde-8fab-0123456789ab").is_ok());
        assert!(validate_account_id("ABCDEF0123456789abcdef0123456789").is_err());
        assert!(validate_account_id("01234567-89ab-3cde-8fab-0123456789ab").is_err());
        assert!(validate_account_id("01234567-89ab-4cde-7fab-0123456789ab").is_err());
    }

    #[test]
    fn registers_with_argon2id_and_never_serializes_the_password() {
        let directory = TestDirectory::new("register");
        let password = "Une phrase secrète locale 2026";
        let summary = register_account(directory.path(), "Louis", "Louis_2026", password)
            .expect("register local account");

        assert_eq!(summary.display_name, "Louis");
        assert_eq!(summary.username, "louis_2026");
        assert_eq!(summary.id.len(), 32);
        let frontend_summary = serde_json::to_value(&summary).unwrap();
        assert!(frontend_summary.get("password").is_none());
        assert!(frontend_summary.get("passwordHash").is_none());
        let raw = fs::read_to_string(directory.path().join(ACCOUNTS_FILE_NAME))
            .expect("read persisted account file");
        assert!(!raw.contains(password));
        assert!(raw.contains("$argon2id$"));
        assert!(!raw.contains("\"password\""));

        let stored = read_accounts_file(directory.path()).expect("reload persisted accounts");
        assert_eq!(stored.accounts.len(), 1);
        assert_eq!(
            login_account(directory.path(), "LOUIS_2026", password)
                .expect("login with normalized username"),
            summary
        );
        let invalid_credentials = "Nom d’utilisateur ou mot de passe incorrect.";
        assert_eq!(
            login_account(directory.path(), "louis_2026", "mauvais mot de passe").unwrap_err(),
            invalid_credentials
        );
        assert_eq!(
            login_account(directory.path(), "@@", "court").unwrap_err(),
            invalid_credentials
        );

        let second_password = "Une autre phrase secrète locale 2026";
        let second = register_account(
            directory.path(),
            "Deuxième profil",
            "deuxieme_2026",
            second_password,
        )
        .expect("register a second account by replacing the registry atomically");
        let updated = read_accounts_file(directory.path()).expect("reload both persisted accounts");
        assert_eq!(updated.accounts.len(), 2);
        assert!(updated
            .accounts
            .iter()
            .any(|account| account.id == summary.id));
        assert!(updated
            .accounts
            .iter()
            .any(|account| account.id == second.id));
        assert_eq!(
            login_account(directory.path(), "deuxieme_2026", second_password)
                .expect("login to the second account"),
            second
        );

        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mode = fs::metadata(directory.path().join(ACCOUNTS_FILE_NAME))
                .expect("account file metadata")
                .permissions()
                .mode()
                & 0o777;
            assert_eq!(mode, 0o600);
        }
    }

    #[test]
    fn remembered_login_restores_the_account_after_argon2id_verification() {
        let directory = TestDirectory::new("remembered-restore");
        let password = "Une phrase secrète locale 2026";
        let account = register_account(directory.path(), "Louis", "Louis_2026", password)
            .expect("register remembered account");
        let store = FakeRememberedCredentialsStore::default();
        let current_process_session = Mutex::new(None);

        let logged_in = login_local_account_inner(
            directory.path(),
            &current_process_session,
            &store,
            "LOUIS_2026",
            password,
            true,
        )
        .expect("remember login");
        assert_eq!(logged_in, account);
        assert_eq!(
            current_process_session.lock().unwrap().as_deref(),
            Some(account.id.as_str())
        );
        assert_eq!(store.save_calls(), 1);

        let remembered = decode_remembered_credentials(
            store.secret().expect("credentials saved in fake keychain"),
        )
        .expect("decode credentials saved in fake keychain");
        assert_eq!(remembered.account_id, account.id);
        assert_eq!(remembered.username, account.username);
        assert_eq!(remembered.password, password);
        drop(remembered);

        let restarted_process_session = Mutex::new(None);
        let status =
            local_account_status_inner(directory.path(), &restarted_process_session, &store)
                .expect("restore remembered session");
        assert_eq!(status.active_account, Some(account.clone()));
        assert_eq!(
            restarted_process_session.lock().unwrap().as_deref(),
            Some(account.id.as_str())
        );
        assert!(store.secret().is_some());
        assert_eq!(store.delete_calls(), 0);
    }

    #[test]
    fn temporary_login_and_registration_do_not_survive_a_restart() {
        let login_directory = TestDirectory::new("temporary-login");
        let password = "Une phrase secrète locale 2026";
        let account = register_account(login_directory.path(), "Louis", "louis", password)
            .expect("register account used by temporary login");
        let previous_secret =
            encode_remembered_credentials(&account, password).expect("encode previous secret");
        let login_store = FakeRememberedCredentialsStore::with_secret(previous_secret);
        let temporary_session = Mutex::new(None);

        login_local_account_inner(
            login_directory.path(),
            &temporary_session,
            &login_store,
            "louis",
            password,
            false,
        )
        .expect("temporary login");
        assert_eq!(
            temporary_session.lock().unwrap().as_deref(),
            Some(account.id.as_str())
        );
        assert!(login_store.secret().is_none());
        assert_eq!(login_store.delete_calls(), 1);

        let restarted_temporary_session = Mutex::new(None);
        let status = local_account_status_inner(
            login_directory.path(),
            &restarted_temporary_session,
            &login_store,
        )
        .expect("load status after temporary login restart");
        assert!(status.active_account.is_none());

        let register_directory = TestDirectory::new("temporary-register");
        let stale_account = test_account_summary('a', "ancien-compte");
        let stale_secret = encode_remembered_credentials(&stale_account, password)
            .expect("encode stale remembered credentials");
        let register_store = FakeRememberedCredentialsStore::with_secret(stale_secret);
        let registration_session = Mutex::new(None);
        let registered = register_local_account_inner(
            register_directory.path(),
            &registration_session,
            &register_store,
            "Nouveau compte",
            "nouveau-compte",
            password,
        )
        .expect("register temporary account");
        assert_eq!(
            registration_session.lock().unwrap().as_deref(),
            Some(registered.id.as_str())
        );
        assert!(register_store.secret().is_none());
        assert_eq!(register_store.delete_calls(), 1);

        let restarted_registration_session = Mutex::new(None);
        let status = local_account_status_inner(
            register_directory.path(),
            &restarted_registration_session,
            &register_store,
        )
        .expect("load status after registration restart");
        assert_eq!(status.accounts, vec![registered]);
        assert!(status.active_account.is_none());
    }

    #[test]
    fn logout_deletes_remembered_credentials_and_ends_the_session() {
        let account = test_account_summary('a', "louis");
        let store = FakeRememberedCredentialsStore::with_secret(
            encode_remembered_credentials(&account, "Une phrase secrète locale 2026")
                .expect("encode remembered credentials"),
        );
        let active_session = Mutex::new(Some(account.id));

        logout_local_account_inner(&active_session, &store).expect("logout remembered account");

        assert!(active_session.lock().unwrap().is_none());
        assert!(store.secret().is_none());
        assert_eq!(store.delete_calls(), 1);
    }

    #[test]
    fn malformed_wrong_password_and_mismatched_secrets_are_rejected_and_deleted() {
        let directory = TestDirectory::new("invalid-remembered-secrets");
        let password = "Une phrase secrète locale 2026";
        let account = register_account(directory.path(), "Louis", "louis", password)
            .expect("register account for invalid remembered secrets");
        let mismatched_account = LocalAccountSummary {
            id: "b".repeat(32),
            ..account.clone()
        };
        let cases = [
            b"not-json".to_vec(),
            encode_remembered_credentials(&account, "Un autre mot de passe valide")
                .expect("encode credentials with the wrong password"),
            encode_remembered_credentials(&mismatched_account, password)
                .expect("encode credentials with a mismatched account id"),
        ];

        for secret in cases {
            let store = FakeRememberedCredentialsStore::with_secret(secret);
            let restarted_session = Mutex::new(None);
            let status = local_account_status_inner(directory.path(), &restarted_session, &store)
                .expect("invalid remembered credentials are handled fail-closed");

            assert_eq!(status.accounts, vec![account.clone()]);
            assert!(status.active_account.is_none());
            assert!(restarted_session.lock().unwrap().is_none());
            assert!(store.secret().is_none());
            assert_eq!(store.delete_calls(), 1);
        }
    }

    #[test]
    fn save_failures_never_activate_a_session_and_remove_partial_credentials() {
        let directory = TestDirectory::new("remembered-save-failure");
        let password = "Une phrase secrète locale 2026";
        register_account(directory.path(), "Louis", "louis", password)
            .expect("register account for save failure");

        let failed_store = FakeRememberedCredentialsStore::default();
        failed_store.fail_save();
        let failed_session = Mutex::new(None);
        let error = login_local_account_inner(
            directory.path(),
            &failed_session,
            &failed_store,
            "louis",
            password,
            true,
        )
        .expect_err("a keychain save error must fail the remembered login");
        assert!(error.contains("Échec simulé de l’enregistrement"));
        assert!(failed_session.lock().unwrap().is_none());
        assert!(failed_store.secret().is_none());
        assert_eq!(failed_store.save_calls(), 1);
        assert_eq!(failed_store.delete_calls(), 1);

        let corrupting_store = FakeRememberedCredentialsStore::default();
        corrupting_store.corrupt_saved_secret();
        let corrupting_session = Mutex::new(None);
        let error = login_local_account_inner(
            directory.path(),
            &corrupting_session,
            &corrupting_store,
            "louis",
            password,
            true,
        )
        .expect_err("an unverifiable keychain save must fail the remembered login");
        assert!(error.contains("n’a pas pu être vérifiée"));
        assert!(corrupting_session.lock().unwrap().is_none());
        assert!(corrupting_store.secret().is_none());
        assert_eq!(corrupting_store.save_calls(), 1);
        assert_eq!(corrupting_store.delete_calls(), 1);
    }

    #[test]
    fn delete_failures_preserve_the_current_session_and_block_session_changes() {
        let directory = TestDirectory::new("remembered-delete-failure");
        let password = "Une phrase secrète locale 2026";
        let account = register_account(directory.path(), "Louis", "louis", password)
            .expect("register account for delete failure");
        let remembered_secret =
            encode_remembered_credentials(&account, password).expect("encode remembered secret");

        let logout_store = FakeRememberedCredentialsStore::with_secret(remembered_secret.clone());
        logout_store.fail_delete();
        let active_session = Mutex::new(Some(account.id.clone()));
        let error = logout_local_account_inner(&active_session, &logout_store)
            .expect_err("logout must report a keychain deletion failure");
        assert!(error.contains("Échec simulé de la suppression"));
        assert_eq!(
            active_session.lock().unwrap().as_deref(),
            Some(account.id.as_str())
        );
        assert_eq!(logout_store.secret(), Some(remembered_secret.clone()));

        let temporary_store =
            FakeRememberedCredentialsStore::with_secret(remembered_secret.clone());
        temporary_store.fail_delete();
        let temporary_session = Mutex::new(None);
        login_local_account_inner(
            directory.path(),
            &temporary_session,
            &temporary_store,
            "louis",
            password,
            false,
        )
        .expect_err("temporary login must not bypass a keychain deletion failure");
        assert!(temporary_session.lock().unwrap().is_none());
        assert_eq!(temporary_store.secret(), Some(remembered_secret.clone()));

        let registration_store = FakeRememberedCredentialsStore::with_secret(remembered_secret);
        registration_store.fail_delete();
        let registration_session = Mutex::new(None);
        register_local_account_inner(
            directory.path(),
            &registration_session,
            &registration_store,
            "Autre compte",
            "autre-compte",
            password,
        )
        .expect_err("registration must not bypass a keychain deletion failure");
        assert!(registration_session.lock().unwrap().is_none());
        assert_eq!(
            read_accounts_file(directory.path())
                .expect("read accounts after failed registration")
                .accounts
                .len(),
            1
        );
    }

    #[test]
    fn rejects_duplicate_normalized_usernames_without_overwriting_the_store() {
        let directory = TestDirectory::new("duplicate");
        register_account(
            directory.path(),
            "Louis",
            "Louis.Compte",
            "premier mot de passe",
        )
        .expect("register first account");
        let before = fs::read(directory.path().join(ACCOUNTS_FILE_NAME)).unwrap();
        let error = register_account(
            directory.path(),
            "Autre profil",
            "LOUIS.COMPTE",
            "second mot de passe",
        )
        .expect_err("duplicate username must fail");
        assert!(error.contains("existe déjà"));
        assert_eq!(
            fs::read(directory.path().join(ACCOUNTS_FILE_NAME)).unwrap(),
            before
        );
    }

    #[test]
    fn refuses_corrupt_or_unknown_account_data_instead_of_replacing_it() {
        let directory = TestDirectory::new("corrupt");
        let path = directory.path().join(ACCOUNTS_FILE_NAME);
        fs::write(
            &path,
            br#"{"schemaVersion":1,"accounts":[],"unexpected":true}"#,
        )
        .unwrap();
        let before = fs::read(&path).unwrap();
        assert!(read_accounts_file(directory.path()).is_err());
        assert!(register_account(
            directory.path(),
            "Louis",
            "louis",
            "mot de passe assez long"
        )
        .is_err());
        assert_eq!(fs::read(path).unwrap(), before);
    }

    #[test]
    fn refuses_tampered_argon2_parameters_before_password_verification() {
        let directory = TestDirectory::new("argon-parameters");
        let weak_params = Params::new(8, 1, 1, Some(32)).unwrap();
        let weak_argon2 = Argon2::new(Algorithm::Argon2id, Version::V0x13, weak_params);
        let salt = SaltString::encode_b64(b"0123456789abcdef").unwrap();
        let weak_hash = weak_argon2
            .hash_password(b"mot de passe assez long", &salt)
            .unwrap()
            .to_string();
        let accounts_file = LocalAccountsFile {
            schema_version: ACCOUNTS_SCHEMA_VERSION,
            accounts: vec![LocalAccountRecord {
                id: "a".repeat(32),
                display_name: "Louis".into(),
                username: "louis".into(),
                password_hash: weak_hash,
                created_at: Utc::now().to_rfc3339(),
            }],
        };
        let raw = serde_json::to_vec(&accounts_file).unwrap();
        fs::write(directory.path().join(ACCOUNTS_FILE_NAME), raw).unwrap();

        let error = read_accounts_file(directory.path())
            .err()
            .expect("weak Argon2 must fail");
        assert!(error.contains("paramètres Argon2id"));
    }

    #[cfg(unix)]
    #[test]
    fn refuses_symlinked_account_directories_and_files() {
        use std::os::unix::fs::symlink;

        let target = TestDirectory::new("symlink-target");
        let holder = TestDirectory::new("symlink-holder");
        let directory_link = holder.path().join("linked-app-data");
        symlink(target.path(), &directory_link).unwrap();
        assert!(
            register_account(&directory_link, "Louis", "louis", "mot de passe assez long").is_err()
        );

        let regular_directory = TestDirectory::new("symlink-file");
        let protected = regular_directory.path().join("outside.json");
        fs::write(&protected, b"protected").unwrap();
        symlink(
            &protected,
            regular_directory.path().join(ACCOUNTS_FILE_NAME),
        )
        .unwrap();
        assert!(read_accounts_file(regular_directory.path()).is_err());
        assert_eq!(fs::read(protected).unwrap(), b"protected");
    }
}
