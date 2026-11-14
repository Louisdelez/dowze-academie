use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{AppHandle, LogicalSize, Manager, State, Webview};
use super::{require_main_caller, CommandResult};

#[derive(Default)]
pub struct StartupWindow { ready: AtomicBool }

#[tauri::command]
pub fn startup_workspace_ready(caller: Webview, app: AppHandle, state: State<'_, StartupWindow>) -> CommandResult<()> {
    require_main_caller(&caller)?;
    if state.ready.load(Ordering::Acquire) { return Ok(()); }
    let window = app.get_webview_window("main").ok_or("Fenêtre principale indisponible.")?;
    window.set_decorations(true).map_err(|e| e.to_string())?;
    window.set_resizable(true).map_err(|e| e.to_string())?;
    // The main window already opens at its configured size. Authentication must
    // not undo a resize, maximize, or move performed while the splash is shown.
    window.set_min_size(Some(LogicalSize::new(900.0, 600.0))).map_err(|e| e.to_string())?;
    state.ready.store(true, Ordering::Release);
    Ok(())
}
