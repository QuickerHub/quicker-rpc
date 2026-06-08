use serde::Serialize;

use crate::quicker_agent_paths::{self, TAURI_APP_IDENTIFIER};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WebviewProfilePathsDto {
    pub identifier: &'static str,
    pub user_data_root: String,
    pub default_profile_dir: String,
    pub local_storage_leveldb_dir: String,
    pub embedded_browser_profile_dir: String,
    pub chat_storage_key: &'static str,
    /// User data is under AppData, not the install folder.
    pub survives_install_update: bool,
}

#[tauri::command]
pub fn webview_profile_paths() -> WebviewProfilePathsDto {
    WebviewProfilePathsDto {
        identifier: TAURI_APP_IDENTIFIER,
        user_data_root: quicker_agent_paths::tauri_webview_user_data_root()
            .to_string_lossy()
            .into_owned(),
        default_profile_dir: quicker_agent_paths::tauri_webview_default_profile_dir()
            .to_string_lossy()
            .into_owned(),
        local_storage_leveldb_dir: quicker_agent_paths::tauri_webview_local_storage_leveldb_dir()
            .to_string_lossy()
            .into_owned(),
        embedded_browser_profile_dir: quicker_agent_paths::embedded_browser_profile_dir()
            .to_string_lossy()
            .into_owned(),
        chat_storage_key: "agent-gui-chats",
        survives_install_update: true,
    }
}
