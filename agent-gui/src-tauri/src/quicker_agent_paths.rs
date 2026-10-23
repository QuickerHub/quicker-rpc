use std::path::PathBuf;

/// Must match `identifier` in `tauri.conf.json`.
pub const TAURI_APP_IDENTIFIER: &str = "ai.quicker.agent";

/// NSIS install root (exe + resources). Not for user data.
pub fn quicker_agent_install_dir() -> PathBuf {
    #[cfg(windows)]
    {
        if let Ok(local) = std::env::var("LOCALAPPDATA") {
            return PathBuf::from(local).join("QuickerAgent");
        }
    }
    quicker_agent_app_data_dir()
}

/// App-managed user data root (including SQLite). Separate from install directory.
pub fn quicker_agent_app_data_dir() -> PathBuf {
    #[cfg(windows)]
    {
        if let Ok(roaming) = std::env::var("APPDATA") {
            return PathBuf::from(roaming).join("QuickerAgent");
        }
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

/// Persistent profile for the workspace embedded browser child webview.
pub fn embedded_browser_profile_dir() -> PathBuf {
    tauri_webview_user_data_root()
        .join(crate::embedded_browser::WORKSPACE_BROWSER_LABEL)
        .join(crate::embedded_browser::EMBEDDED_BROWSER_DATA_DIRECTORY)
}
