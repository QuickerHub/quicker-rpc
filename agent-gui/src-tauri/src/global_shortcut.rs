use std::sync::Mutex;
use std::time::Duration;

use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

pub const DEFAULT_LAUNCHER_SHORTCUT: &str = "Alt+Space";
const LAUNCHER_VOICE_TOGGLE_EVENT: &str = "global:voice-toggle";

pub struct LauncherShortcutState {
    shortcut: Mutex<String>,
    auto_voice: Mutex<bool>,
}

impl LauncherShortcutState {
    pub fn new() -> Self {
        Self {
            shortcut: Mutex::new(DEFAULT_LAUNCHER_SHORTCUT.to_string()),
            auto_voice: Mutex::new(false),
        }
    }
}

fn handle_launcher_shortcut_press(app: &AppHandle) {
    if let Err(err) = crate::launcher::launcher_show(app.clone(), None) {
        eprintln!("[launcher-shortcut] launcher_show failed: {err}");
        return;
    }

    let auto_voice = app
        .try_state::<LauncherShortcutState>()
        .and_then(|state| state.auto_voice.lock().ok().map(|v| *v))
        .unwrap_or(false);

    if !auto_voice {
        return;
    }

    let app_for_thread = app.clone();
    let app_for_emit = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(80));
        let _ = app_for_thread.run_on_main_thread(move || {
            if let Some(window) = app_for_emit.get_webview_window(crate::launcher::LAUNCHER_LABEL) {
                let _ = window.emit(LAUNCHER_VOICE_TOGGLE_EVENT, ());
            }
        });
    });
}

pub fn init(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    app.manage(LauncherShortcutState::new());

    let plugin = tauri_plugin_global_shortcut::Builder::new()
        .with_handler(|app, _shortcut, event| {
            if event.state != ShortcutState::Pressed {
                return;
            }
            handle_launcher_shortcut_press(app);
        })
        .with_shortcut(DEFAULT_LAUNCHER_SHORTCUT)?
        .build();

    app.plugin(plugin)?;
    Ok(())
}

#[tauri::command]
pub fn launcher_sync_global_shortcut(
    app: AppHandle,
    shortcut: String,
    auto_voice: Option<bool>,
) -> Result<(), String> {
    let trimmed = shortcut.trim().to_string();
    if trimmed.is_empty() {
        return Err("shortcut cannot be empty".into());
    }

    trimmed
        .parse::<Shortcut>()
        .map_err(|e| format!("invalid shortcut: {e}"))?;

    let state = app.state::<LauncherShortcutState>();

    if let Some(enabled) = auto_voice {
        *state
            .auto_voice
            .lock()
            .map_err(|_| "auto_voice lock poisoned".to_string())? = enabled;
    }

    let old_shortcut = {
        let current = state
            .shortcut
            .lock()
            .map_err(|_| "shortcut lock poisoned".to_string())?;
        current.clone()
    };

    if old_shortcut == trimmed {
        return Ok(());
    }

    {
        let mut current = state
            .shortcut
            .lock()
            .map_err(|_| "shortcut lock poisoned".to_string())?;
        *current = trimmed.clone();
    }

    let gs = app.global_shortcut();
    if gs.is_registered(old_shortcut.as_str()) {
        gs.unregister(old_shortcut.as_str())
            .map_err(|e| format!("unregister failed: {e}"))?;
    }
    if !gs.is_registered(trimmed.as_str()) {
        gs.register(trimmed.as_str())
            .map_err(|e| format!("register failed: {e}"))?;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tauri_plugin_global_shortcut::Shortcut;

    #[test]
    fn default_shortcut_parses_as_tauri_shortcut() {
        DEFAULT_LAUNCHER_SHORTCUT
            .parse::<Shortcut>()
            .expect("default launcher shortcut must parse");
    }

    #[test]
    fn common_launcher_shortcuts_parse() {
        for shortcut in [
            "Alt+Space",
            "CommandOrControl+Shift+Space",
            "Alt+Shift+F",
            "CommandOrControl+F12",
        ] {
            shortcut
                .parse::<Shortcut>()
                .unwrap_or_else(|err| panic!("{shortcut} must parse: {err}"));
        }
    }

}
