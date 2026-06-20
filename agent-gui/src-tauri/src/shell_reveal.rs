use std::path::{Component, Path, PathBuf};

use serde::Serialize;

use crate::quicker_agent_paths::quicker_agent_app_data_dir;

const CHAT_EXPORTS_SUBDIR: &str = "exports";

#[derive(Serialize)]
pub struct RevealPathResult {
    pub ok: bool,
    pub path: String,
    pub via: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

fn reveal_scope_root(scope: &str) -> Result<PathBuf, String> {
    match scope {
        "chat-exports" => Ok(quicker_agent_app_data_dir().join(CHAT_EXPORTS_SUBDIR)),
        _ => Err("Invalid reveal scope".into()),
    }
}

fn resolve_path_within_scope(scope: &str, file_path: &str) -> Result<PathBuf, String> {
    let root = reveal_scope_root(scope)?.canonicalize().map_err(|e| e.to_string())?;
    let candidate = PathBuf::from(file_path.trim());
    let resolved = if candidate.is_absolute() {
        candidate
    } else {
        root.join(candidate)
    };
    let resolved = resolved
        .canonicalize()
        .map_err(|_| "Path does not exist".to_string())?;

    let mut rel = PathBuf::new();
    for component in resolved.strip_prefix(&root).map_err(|_| "Path is outside the allowed directory")? {
        match component {
            Component::ParentDir => {
                return Err("Path is outside the allowed directory".into());
            }
            Component::CurDir => {}
            other => rel.push(other.as_os_str()),
        }
    }
    let _ = rel;
    Ok(resolved)
}

fn reveal_in_file_manager(resolved: &Path) -> Result<(), String> {
    if !resolved.exists() {
        return Err("Path does not exist".into());
    }

    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(format!("/select,{}", resolved.display()))
            .spawn()
            .map_err(|e| e.to_string())?;
        return Ok(());
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .args(["-R", &resolved.to_string_lossy()])
            .spawn()
            .map_err(|e| e.to_string())?;
        return Ok(());
    }

    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        let parent = resolved
            .parent()
            .ok_or_else(|| "Path has no parent directory".to_string())?;
        std::process::Command::new("xdg-open")
            .arg(parent)
            .spawn()
            .map_err(|e| e.to_string())?;
        Ok(())
    }
}

#[tauri::command]
pub fn reveal_path_in_file_manager(scope: String, path: String) -> Result<RevealPathResult, String> {
    let resolved = resolve_path_within_scope(&scope, &path)?;
    reveal_in_file_manager(&resolved)?;
    Ok(RevealPathResult {
        ok: true,
        path: resolved.to_string_lossy().into_owned(),
        via: "tauri",
        error: None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reveal_scope_root_chat_exports() {
        let root = reveal_scope_root("chat-exports").expect("scope");
        assert!(root.ends_with(CHAT_EXPORTS_SUBDIR));
    }
}
