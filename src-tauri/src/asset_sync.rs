//! Bounded transfer of application-owned files. No caller-supplied filesystem paths.
use super::conversation_archive::{self, ConversationScope};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{fs, path::Path, sync::Arc};
use tauri::{Manager, State, Webview};

const MAX_BYTES: usize = 64 * 1024 * 1024;
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn pdf_scope_cannot_cross_annual_workspace() {
        let account = "12345678-1234-4234-8234-123456789abc";
        let pdf = Asset::Pdf {
            record: "year-a--exam-1".into(),
            variant: "blank".into(),
        };
        assert!(scope(&pdf, account, "year-a").is_ok());
        assert!(scope(&pdf, account, "year-b").is_err());
        assert!(scope(&pdf, account, "ingenierie-energie-annee-1").is_err());
        let legacy = Asset::Pdf {
            record: "exam-1".into(),
            variant: "blank".into(),
        };
        assert!(scope(&legacy, account, "ingenierie-energie-annee-1").is_ok());
    }
}
struct TemporaryPdf(std::path::PathBuf);
impl Drop for TemporaryPdf {
    fn drop(&mut self) {
        let _ = fs::remove_file(&self.0);
    }
}
#[derive(Clone, Deserialize, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase", deny_unknown_fields)]
pub(crate) enum Asset {
    Archive { scope: ConversationScope },
    Pdf { record: String, variant: String },
}
fn variant(value: &str) -> Result<super::AssessmentPdfVariant, String> {
    match value {
        "blank" => Ok(super::AssessmentPdfVariant::Blank),
        "completed" => Ok(super::AssessmentPdfVariant::Completed),
        _ => Err("Variante PDF invalide.".into()),
    }
}
fn scope(asset: &Asset, account: &str, formation: &str) -> Result<(), String> {
    super::local_auth::validate_account_id(account)?;
    super::validate_assessment_record_id(formation)?;
    if let Asset::Archive { scope } = asset {
        if scope.account_id != account || scope.formation_id != formation {
            return Err("Archive hors du compte ou de l'année.".into());
        }
    }
    if let Asset::Pdf { record, .. } = asset {
        super::validate_assessment_record_id(record)?;
        let valid = if formation == "ingenierie-energie-annee-1" {
            !record.contains("--")
        } else {
            record
                .strip_prefix(&format!("{formation}--"))
                .is_some_and(|id| !id.is_empty())
        };
        if !valid {
            return Err("PDF hors de l'année demandée.".into());
        }
    }
    Ok(())
}
fn bytes(root: &Path, account: &str, asset: &Asset) -> Result<Vec<u8>, String> {
    let bytes = match asset {
        Asset::Archive { scope } => conversation_archive::sync_archive_bytes(root, scope)?,
        Asset::Pdf {
            record,
            variant: value,
        } => {
            let path = super::managed_assessment_pdf_path(root, account, record, variant(value)?)?;
            let (mut file, _) = super::open_valid_pdf(&path)?;
            let mut bytes = Vec::new();
            use std::io::Read;
            (&mut file)
                .take(MAX_BYTES as u64 + 1)
                .read_to_end(&mut bytes)
                .map_err(|_| "Lecture PDF interrompue.")?;
            bytes
        }
    };
    if bytes.len() > MAX_BYTES {
        return Err("Fichier trop volumineux.".into());
    }
    Ok(bytes)
}
fn exists(root: &Path, account: &str, asset: &Asset) -> Result<bool, String> {
    match asset {
        Asset::Archive { scope } => conversation_archive::sync_archive_exists(root, scope),
        Asset::Pdf {
            record,
            variant: value,
        } => {
            super::validate_assessment_record_id(record)?;
            let Some(root) = super::existing_assessment_documents_root(root)? else {
                return Ok(false);
            };
            let Some(directory) =
                super::resolve_profile_assessment_record_directory(&root, account, record)?
            else {
                return Ok(false);
            };
            match fs::symlink_metadata(directory.join(variant(value)?.file_name())) {
                Ok(meta) if meta.file_type().is_file() && !meta.file_type().is_symlink() => {
                    Ok(true)
                }
                Ok(_) => Err("Le PDF n'est pas un fichier régulier.".into()),
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(false),
                Err(_) => Err("Le PDF ne peut pas être vérifié.".into()),
            }
        }
    }
}

#[tauri::command]
pub(crate) async fn native_asset_read(
    caller: Webview,
    auth: State<'_, super::local_auth::LocalAuthState>,
    account_id: String,
    formation_id: String,
    asset: Asset,
) -> Result<Value, String> {
    super::require_main_caller(&caller)?;
    auth.require_active_account(&account_id)?;
    scope(&asset, &account_id, &formation_id)?;
    let root = super::assessment_app_data_dir(&caller)?;
    let active = auth.active_account_handle();
    let result = tauri::async_runtime::spawn_blocking(move || {
        let guard = active.lock().map_err(|_| "Session indisponible.")?;
        if guard.as_deref() != Some(account_id.as_str()) { return Err("Session modifiée.".into()); }
        if !exists(&root,&account_id,&asset)? {return Ok(Value::Null);}
        let data = bytes(&root, &account_id, &asset)?;
        Ok(json!({"size": data.len(), "sha256": format!("{:x}", Sha256::digest(&data)), "dataBase64": BASE64.encode(data)}))
    }).await.map_err(|_| "Lecture interrompue.")?;
    result
}

#[tauri::command]
pub(crate) fn native_archive_list(
    caller: Webview,
    auth: State<'_, super::local_auth::LocalAuthState>,
    account_id: String,
    formation_id: String,
) -> Result<Vec<ConversationScope>, String> {
    super::require_main_caller(&caller)?;
    auth.require_active_account(&account_id)?;
    super::validate_assessment_record_id(&formation_id)?;
    conversation_archive::sync_archive_scopes(
        &super::assessment_app_data_dir(&caller)?,
        &account_id,
        &formation_id,
    )
}

#[tauri::command]
#[allow(clippy::too_many_arguments)] // Named IPC fields are the native import contract.
pub(crate) async fn native_asset_import(
    caller: Webview,
    auth: State<'_, super::local_auth::LocalAuthState>,
    documents: State<'_, super::AssessmentDocumentsState>,
    account_id: String,
    formation_id: String,
    asset: Asset,
    data_base64: String,
    sha256: String,
) -> Result<(), String> {
    super::require_main_caller(&caller)?;
    auth.require_active_account(&account_id)?;
    scope(&asset, &account_id, &formation_id)?;
    if data_base64.len() > MAX_BYTES.div_ceil(3) * 4 {
        return Err("Fichier trop volumineux.".into());
    }
    let root = super::assessment_app_data_dir(&caller)?;
    let lock = Arc::clone(&documents.operation_lock);
    let active = auth.active_account_handle();
    let app = caller.app_handle().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let guard = active.lock().map_err(|_| "Session indisponible.")?;
        if guard.as_deref() != Some(account_id.as_str()) { return Err("Session modifiée.".into()); }
        let data = BASE64.decode(data_base64).map_err(|_| "Encodage invalide.")?;
        if data.len() > MAX_BYTES || format!("{:x}", Sha256::digest(&data)) != sha256 { return Err("Empreinte du fichier invalide.".into()); }
        match asset {
            Asset::Archive { scope } => {
                conversation_archive::sync_import_archive(&root, &scope, &data)?;
                let archive: conversation_archive::ConversationArchive = serde_json::from_slice(&conversation_archive::sync_archive_bytes(&root,&scope)?).map_err(|_| "Archive restaurée illisible.")?;
                for messages in archive.messages.chunks(100) {
                }
                Ok(())
            },
            Asset::Pdf { record, variant: value } => {
                let _guard = lock.lock().map_err(|_| "Stockage PDF indisponible.")?;
                let variant = variant(&value)?;
                // Existing different PDFs are preserved; the caller must retain both versions.
                if let Ok(existing) = bytes(&root, &account_id, &Asset::Pdf { record: record.clone(), variant: value.clone() }) {
                    if existing == data { return Ok(()); }
                    return Err("Un autre PDF existe déjà. Les deux versions sont conservées ; aucune substitution automatique.".into());
                }
                let path = std::env::temp_dir().join(format!("dowze-sync-{:032x}.pdf", rand::random::<u128>()));
                let mut options = fs::OpenOptions::new(); options.write(true).create_new(true);
                #[cfg(unix)] { use std::os::unix::fs::OpenOptionsExt; options.mode(0o600); }
                let mut file = options.open(&path).map_err(|_| "Fichier temporaire indisponible.")?;
                let temp = TemporaryPdf(path);
                { use std::io::Write; file.write_all(&data).map_err(|_| "Écriture PDF impossible.")?; file.sync_all().map_err(|_| "Écriture PDF non confirmée.")?; }
                drop(file);
                let (blank, completed) = match variant { super::AssessmentPdfVariant::Blank => (Some(temp.0.as_path()), None), super::AssessmentPdfVariant::Completed => (None, Some(temp.0.as_path())) };
                super::import_assessment_pdf_batch(&root, &account_id, &record, blank, completed, None).map(|_| ())
            }
        }
    }).await.map_err(|_| "Import interrompu.")?
}

#[tauri::command]
pub(crate) fn native_asset_delete(
    caller: Webview,
    auth: State<'_, super::local_auth::LocalAuthState>,
    documents: State<'_, super::AssessmentDocumentsState>,
    account_id: String,
    formation_id: String,
    asset: Asset,
    sha256: String,
) -> Result<(), String> {
    super::require_main_caller(&caller)?;
    auth.require_active_account(&account_id)?;
    scope(&asset, &account_id, &formation_id)?;
    let active = auth.active_account_handle();
    let guard = active.lock().map_err(|_| "Session indisponible.")?;
    if guard.as_deref() != Some(account_id.as_str()) {
        return Err("Session modifiée.".into());
    }
    let _lock = documents
        .operation_lock
        .lock()
        .map_err(|_| "Documents indisponibles.")?;
    let root = super::assessment_app_data_dir(&caller)?;
    let existing = bytes(&root, &account_id, &asset)?;
    if format!("{:x}", Sha256::digest(&existing)) != sha256 {
        return Err("Le fichier a changé ; suppression suspendue.".into());
    }
    match asset {
        Asset::Archive { scope } => {
            conversation_archive::sync_delete_archive(&root, &scope, &sha256)
        }
        Asset::Pdf {
            record,
            variant: value,
        } => fs::remove_file(super::managed_assessment_pdf_path(
            &root,
            &account_id,
            &record,
            variant(&value)?,
        )?)
        .map_err(|_| "Suppression PDF impossible.".into()),
    }
}
