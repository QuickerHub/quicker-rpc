use std::path::{Path, PathBuf};

const VOICE_ASR_PLUGIN_ID: &str = "voice-asr";
const CLIPBOARD_HISTORY_PLUGIN_ID: &str = "clipboard-history";

/// Must match `identifier` in `tauri.conf.json`.
pub const TAURI_APP_IDENTIFIER: &str = "ai.quicker.agent";

/// App-managed data root (plugins). Not the agent working directory.
pub fn quicker_agent_app_data_dir() -> PathBuf {
    #[cfg(windows)]
    {
        if let Ok(local) = std::env::var("LOCALAPPDATA") {
            return PathBuf::from(local).join("QuickerAgent");
        }
    }
    #[cfg(target_os = "macos")]
    {
        if let Ok(home) = std::env::var("HOME") {
            return PathBuf::from(home).join("Library/Application Support/QuickerAgent");
        }
    }
    #[cfg(not(any(windows, target_os = "macos")))]
    {
        if let Ok(xdg) = std::env::var("XDG_DATA_HOME") {
            return PathBuf::from(xdg).join("QuickerAgent");
        }
        if let Ok(home) = std::env::var("HOME") {
            return PathBuf::from(home).join(".local/share/QuickerAgent");
        }
    }
    PathBuf::from("QuickerAgent")
}

/// WebView2 / WKWebView user-data root (localStorage, IndexedDB). Not the install directory.
pub fn tauri_webview_user_data_root() -> PathBuf {
    #[cfg(windows)]
    {
        if let Ok(local) = std::env::var("LOCALAPPDATA") {
            return PathBuf::from(local).join(TAURI_APP_IDENTIFIER);
        }
    }
    #[cfg(target_os = "macos")]
    {
        if let Ok(home) = std::env::var("HOME") {
            return PathBuf::from(home)
                .join("Library/WebKit")
                .join(TAURI_APP_IDENTIFIER);
        }
    }
    #[cfg(not(any(windows, target_os = "macos")))]
    {
        if let Ok(xdg) = std::env::var("XDG_CONFIG_HOME") {
            return PathBuf::from(xdg).join(TAURI_APP_IDENTIFIER);
        }
        if let Ok(home) = std::env::var("HOME") {
            return PathBuf::from(home)
                .join(".config")
                .join(TAURI_APP_IDENTIFIER);
        }
    }
    PathBuf::from(TAURI_APP_IDENTIFIER)
}

/// Chromium profile directory inside WebView2 user data (Windows).
pub fn tauri_webview_default_profile_dir() -> PathBuf {
    tauri_webview_user_data_root()
        .join("EBWebView")
        .join("Default")
}

/// LevelDB directory backing `window.localStorage` (Windows WebView2).
pub fn tauri_webview_local_storage_leveldb_dir() -> PathBuf {
    tauri_webview_default_profile_dir()
        .join("Local Storage")
        .join("leveldb")
}

fn user_documents_dir() -> PathBuf {
    if let Ok(profile) = std::env::var("USERPROFILE") {
        let docs = PathBuf::from(&profile).join("Documents");
        if docs.is_dir() {
            return docs;
        }
    }
    if let Ok(one_drive) = std::env::var("OneDrive") {
        let docs = PathBuf::from(one_drive).join("Documents");
        if docs.is_dir() {
            return docs;
        }
    }
    if let Ok(home) = std::env::var("HOME") {
        return PathBuf::from(home).join("Documents");
    }
    PathBuf::from("Documents")
}

/// Pre-split install location (Documents/QuickerAgent/plugins/voice-asr).
fn legacy_voice_plugin_root() -> PathBuf {
    user_documents_dir()
        .join("QuickerAgent")
        .join("plugins")
        .join(VOICE_ASR_PLUGIN_ID)
}

fn primary_voice_plugin_root() -> PathBuf {
    quicker_agent_app_data_dir()
        .join("plugins")
        .join(VOICE_ASR_PLUGIN_ID)
}

fn plugin_installed_at(root: &Path) -> bool {
    root.join("manifest.json").is_file()
}

fn voice_asr_layout_ready(root: &Path) -> bool {
    root.join("manifest.json").is_file()
        && root.join("runtime/quicker-voice-runtime.exe").is_file()
        && root.join("models/sensevoice/tokens.txt").is_file()
        && (root.join("models/sensevoice/model.int8.onnx").is_file()
            || root.join("models/sensevoice/model.onnx").is_file())
}

/// clipboard-history plugin directory (app data).
pub fn clipboard_history_plugin_root() -> PathBuf {
    quicker_agent_app_data_dir()
        .join("plugins")
        .join(CLIPBOARD_HISTORY_PLUGIN_ID)
}

/// Resolve voice-asr plugin directory; prefer a fully installed tree over manifest-only stubs.
pub fn voice_plugin_root() -> PathBuf {
    let primary = primary_voice_plugin_root();
    let legacy = legacy_voice_plugin_root();
    if voice_asr_layout_ready(&primary) {
        return primary;
    }
    if voice_asr_layout_ready(&legacy) {
        return legacy;
    }
    if plugin_installed_at(&primary) {
        return primary;
    }
    if plugin_installed_at(&legacy) {
        return legacy;
    }
    primary
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn voice_plugin_root_prefers_primary_when_both_exist() {
        let primary = primary_voice_plugin_root();
        let legacy = legacy_voice_plugin_root();
        assert_ne!(primary, legacy);
    }
}
