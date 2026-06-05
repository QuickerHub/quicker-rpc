use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_global_shortcut::ShortcutState;

pub const GLOBAL_VOICE_TOGGLE_EVENT: &str = "global:voice-toggle";

const VOICE_TOGGLE_SHORTCUT: &str = "CommandOrControl+Shift+V";

pub fn init(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let handle = app.clone();

    app.plugin(
        tauri_plugin_global_shortcut::Builder::new()
            .with_shortcuts([VOICE_TOGGLE_SHORTCUT])?
            .with_handler(move |_app, _shortcut, event| {
                if event.state != ShortcutState::Pressed {
                    return;
                }
                if let Err(err) = dispatch_voice_toggle(&handle) {
                    eprintln!("[global-shortcut] {err}");
                }
            })
            .build(),
    )?;

    Ok(())
}

fn dispatch_voice_toggle(app: &AppHandle) -> Result<(), String> {
    if let Some(main) = resolve_main_window(app) {
        if main.is_focused().unwrap_or(false) {
            main.emit(GLOBAL_VOICE_TOGGLE_EVENT, ())
                .map_err(|err| err.to_string())?;
            return Ok(());
        }
    }

    crate::launcher::launcher_show(app.clone(), None)?;
    let launcher = app
        .get_webview_window(crate::launcher::LAUNCHER_LABEL)
        .ok_or_else(|| "launcher window not found".to_string())?;
    launcher
        .emit(GLOBAL_VOICE_TOGGLE_EVENT, ())
        .map_err(|err| err.to_string())?;
    Ok(())
}

fn resolve_main_window(app: &AppHandle) -> Option<tauri::WebviewWindow> {
    app.get_webview_window("agent")
        .or_else(|| app.get_webview_window("main"))
}
