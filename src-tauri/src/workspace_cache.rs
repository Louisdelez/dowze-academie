use std::sync::{atomic::{AtomicU64, Ordering}, mpsc, Mutex};
use std::time::Duration;
use tauri::{Emitter, Manager, State, Webview};
use super::{CommandResult, require_main_caller};

#[derive(Default)]
pub struct WorkspaceCacheState {
    sequence: AtomicU64,
    pending: Mutex<Option<(u64, mpsc::SyncSender<CommandResult<()>>)>>,
}

pub fn flush_before_exit(app: &tauri::AppHandle) -> CommandResult<()> {
    let state = app.state::<WorkspaceCacheState>();
    let id = state.sequence.fetch_add(1, Ordering::SeqCst) + 1;
    let (sender, receiver) = mpsc::sync_channel(1);
    *state.pending.lock().map_err(|_| "Cache occupé.")? = Some((id, sender));
    app.emit("workspace-flush-request", id).map_err(|_| "Enregistrement local indisponible.")?;
    let result = receiver.recv_timeout(Duration::from_secs(15))
        .map_err(|_| "La fermeture attend l’enregistrement du cache. Réessayez.")?;
    if result.is_err() { let _ = app.emit("workspace-close-cancelled", ()); }
    result
}

#[tauri::command]
pub fn workspace_cache_flushed(caller: Webview, state: State<'_, WorkspaceCacheState>, request_id: u64, success: bool) -> CommandResult<()> {
    require_main_caller(&caller)?;
    let mut pending = state.pending.lock().map_err(|_| "Cache occupé.")?;
    if pending.as_ref().map(|(id, _)| *id) != Some(request_id) { return Err("Accusé de fermeture obsolète.".into()); }
    if let Some((_, sender)) = pending.take() {
        sender.send(if success { Ok(()) } else { Err("Le cache n’a pas été enregistré : fermeture annulée.".into()) })
            .map_err(|_| "Fermeture déjà annulée.".to_string())?;
    }
    Ok(())
}
