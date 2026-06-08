use std::fs;
use std::path::{Path, PathBuf};

use serde::Serialize;
use tauri::{AppHandle, Manager};

use crate::quicker_agent_paths::{quicker_agent_app_data_dir, tauri_webview_local_storage_leveldb_dir};

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LegacyChatScanHit {
    pub source: String,
    pub storage_key: String,
    pub json: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LegacyChatScanResult {
    pub hits: Vec<LegacyChatScanHit>,
    pub scanned_roots: Vec<String>,
}

const CHAT_MARKERS: &[&str] = &[
    "agent-gui-chats-backup-thread-",
    "agent-gui-chats-thread-",
    "agent-gui-chats-backup",
    "agent-gui-chats",
    "agent-gui-workspaces",
];

fn marker_byte_variants(marker: &str) -> Vec<Vec<u8>> {
    let mut out = vec![marker.as_bytes().to_vec()];
    let mut utf16 = Vec::with_capacity(marker.len() * 2);
    for ch in marker.encode_utf16() {
        utf16.extend_from_slice(&ch.to_le_bytes());
    }
    out.push(utf16);
    out
}

fn utf16_json_root_prefix(version: u8) -> Vec<u8> {
    format!("{{\"version\":{version}")
        .encode_utf16()
        .flat_map(|unit| unit.to_le_bytes())
        .collect()
}

fn find_json_start_after_offset(bytes: &[u8], offset: usize) -> Option<usize> {
    let search_end = bytes.len().min(offset.saturating_add(512));

    for version in [1_u8, 2, 3] {
        let prefix = utf16_json_root_prefix(version);
        if prefix.len() <= search_end.saturating_sub(offset) {
            for i in offset..=search_end.saturating_sub(prefix.len()) {
                if &bytes[i..i + prefix.len()] == prefix.as_slice() {
                    return Some(i);
                }
            }
        }
    }

    for utf8_prefix in [b"{\"version\":1", b"{\"version\":2", b"{\"version\":3"] {
        for i in offset..search_end.saturating_sub(utf8_prefix.len()) {
            if &bytes[i..i + utf8_prefix.len()] == utf8_prefix.as_slice() {
                return Some(i);
            }
        }
    }

    for i in offset..search_end.saturating_sub(1) {
        if bytes.get(i) == Some(&b'{') && bytes.get(i + 1) == Some(&0) {
            return Some(i);
        }
    }

    None
}

fn is_parseable_json_object(json: &str) -> bool {
    serde_json::from_str::<serde_json::Value>(json).is_ok()
}

fn extract_json_utf8_from_offset(bytes: &[u8], start: usize) -> Option<String> {
    let slice = &bytes[start..];
    let mut depth = 0i32;
    let mut in_string = false;
    let mut escape = false;

    for (idx, &b) in slice.iter().enumerate() {
        if in_string {
            if escape {
                escape = false;
                continue;
            }
            if b == b'\\' {
                escape = true;
                continue;
            }
            if b == b'"' {
                in_string = false;
            }
            continue;
        }

        match b {
            b'"' => in_string = true,
            b'{' => depth += 1,
            b'}' => {
                depth -= 1;
                if depth == 0 {
                    return String::from_utf8(slice[..=idx].to_vec()).ok();
                }
            }
            _ => {}
        }
    }

    None
}

fn extract_json_utf16_le_from_offset(bytes: &[u8], start: usize) -> Option<String> {
    if bytes.get(start) != Some(&b'{') || bytes.get(start + 1) != Some(&0) {
        return None;
    }

    let mut best: Option<String> = None;
    let mut best_len = 0usize;
    let mut end = start + 2;
    while end + 1 < bytes.len() {
        if bytes[end] == b'}' && bytes.get(end + 1) == Some(&0) {
            let len = end + 2 - start;
            if len > best_len {
                let utf16_bytes = &bytes[start..end + 2];
                let mut units = Vec::with_capacity(utf16_bytes.len() / 2);
                let mut unit_offset = 0usize;
                while unit_offset + 1 < utf16_bytes.len() {
                    units.push(u16::from_le_bytes([
                        utf16_bytes[unit_offset],
                        utf16_bytes[unit_offset + 1],
                    ]));
                    unit_offset += 2;
                }
                if let Ok(candidate) = String::from_utf16(&units) {
                    if serde_json::from_str::<serde_json::Value>(&candidate).is_ok() {
                        best = Some(candidate);
                        best_len = len;
                    }
                }
            }
        }
        end += 2;
    }

    best
}

fn extract_json_payload_from_offset(bytes: &[u8], offset: usize) -> Option<String> {
    let start = find_json_start_after_offset(bytes, offset)?;
    if bytes.get(start + 1) == Some(&0) {
        return extract_json_utf16_le_from_offset(bytes, start);
    }
    extract_json_utf8_from_offset(bytes, start)
}

fn extract_json_objects_after_marker(content: &[u8], marker: &str) -> Vec<String> {
    let mut found = Vec::new();
    let mut seen = std::collections::HashSet::new();

    for marker_bytes in marker_byte_variants(marker) {
        if marker_bytes.is_empty() || content.len() < marker_bytes.len() {
            continue;
        }
        let mut offset = 0usize;
        while offset + marker_bytes.len() <= content.len() {
            if &content[offset..offset + marker_bytes.len()] == marker_bytes.as_slice() {
                if let Some(json) =
                    extract_json_payload_from_offset(content, offset + marker_bytes.len())
                {
                    if is_parseable_json_object(&json) && seen.insert(json.clone()) {
                        found.push(json);
                    }
                }
                offset += 1;
            } else {
                offset += 1;
            }
        }
    }

    found
}

fn push_unique_leveldb_dir(
    dirs: &mut Vec<(String, PathBuf)>,
    label: impl Into<String>,
    path: PathBuf,
) {
    if !path.is_dir() {
        return;
    }
    if dirs.iter().any(|(_, existing)| existing == &path) {
        return;
    }
    dirs.push((label.into(), path));
}

fn collect_legacy_leveldb_directories(app: &AppHandle) -> Vec<(String, PathBuf)> {
    let mut dirs = Vec::new();

    push_unique_leveldb_dir(
        &mut dirs,
        "当前 WebView profile",
        tauri_webview_local_storage_leveldb_dir(),
    );

    let app_data_webview = quicker_agent_app_data_dir()
        .join("EBWebView")
        .join("Default")
        .join("Local Storage")
        .join("leveldb");
    push_unique_leveldb_dir(&mut dirs, "QuickerAgent 应用数据", app_data_webview);

    #[cfg(windows)]
    {
        if let Ok(local) = std::env::var("LOCALAPPDATA") {
            let root = PathBuf::from(&local);
            if let Ok(entries) = fs::read_dir(&root) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if !path.is_dir() {
                        continue;
                    }
                    let name = entry.file_name().to_string_lossy().to_string();
                    let lower = name.to_lowercase();
                    if !lower.contains("quicker") && !lower.contains("agent") {
                        continue;
                    }
                    let leveldb = path
                        .join("EBWebView")
                        .join("Default")
                        .join("Local Storage")
                        .join("leveldb");
                    push_unique_leveldb_dir(
                        &mut dirs,
                        format!("%LOCALAPPDATA%\\{name}"),
                        leveldb,
                    );
                }
            }
        }
    }

    if let Ok(exe) = app.path().executable_dir() {
        let legacy = exe
            .join(".WebView2")
            .join("Default")
            .join("Local Storage")
            .join("leveldb");
        push_unique_leveldb_dir(&mut dirs, "安装目录 .WebView2", legacy);
    }

    dirs
}

fn scan_leveldb_directory(label: &str, leveldb_dir: &Path) -> Vec<LegacyChatScanHit> {
    let mut hits = Vec::new();
    let mut seen_json = std::collections::HashSet::new();
    let entries = match fs::read_dir(leveldb_dir) {
        Ok(entries) => entries,
        Err(_) => return hits,
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let name = entry.file_name().to_string_lossy().to_string();
        if !name.ends_with(".ldb") && !name.ends_with(".log") {
            continue;
        }
        let meta = match fs::metadata(&path) {
            Ok(meta) => meta,
            Err(_) => continue,
        };
        if meta.len() < 32 {
            continue;
        }

        let content = match fs::read(&path) {
            Ok(content) => content,
            Err(_) => continue,
        };

        for marker in CHAT_MARKERS {
            for json in extract_json_objects_after_marker(&content, marker) {
                if !seen_json.insert(json.clone()) {
                    continue;
                }
                hits.push(LegacyChatScanHit {
                    source: format!("{label} · {name}"),
                    storage_key: marker.to_string(),
                    json,
                });
            }
        }
    }

    hits
}

fn scan_legacy_chat_leveldb_stores(app: &AppHandle) -> LegacyChatScanResult {
    let dirs = collect_legacy_leveldb_directories(app);
    let scanned_roots = dirs
        .iter()
        .map(|(_, path)| path.to_string_lossy().into_owned())
        .collect::<Vec<_>>();

    let mut hits = Vec::new();
    let mut seen_json = std::collections::HashSet::new();

    for (label, path) in dirs {
        for hit in scan_leveldb_directory(&label, &path) {
            if seen_json.insert(hit.json.clone()) {
                hits.push(hit);
            }
        }
    }

    LegacyChatScanResult {
        hits,
        scanned_roots,
    }
}

#[tauri::command]
pub fn legacy_chat_store_scan(app: AppHandle) -> Result<LegacyChatScanResult, String> {
    Ok(scan_legacy_chat_leveldb_stores(&app))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_utf8_json_after_marker() {
        let blob = b"prefix agent-gui-chats\x00{\"version\":2,\"threads\":[]}";
        let jsons = extract_json_objects_after_marker(blob, "agent-gui-chats");
        assert_eq!(jsons.len(), 1);
        assert!(jsons[0].contains("\"version\":2"));
    }

    #[test]
    fn extracts_utf16_json_after_marker() {
        let payload = "{\"version\":2,\"threads\":[{\"id\":\"a\",\"messages\":[{\"role\":\"user\",\"content\":\"hi\"}]}]}";
        let marker_utf16: Vec<u8> = "agent-gui-chats"
            .encode_utf16()
            .flat_map(|u| u.to_le_bytes())
            .collect();
        let payload_utf16: Vec<u8> = payload
            .encode_utf16()
            .flat_map(|u| u.to_le_bytes())
            .collect();
        let mut blob = b"prefix ".to_vec();
        blob.extend_from_slice(&marker_utf16);
        blob.extend_from_slice(&[0, 0]);
        blob.extend_from_slice(&payload_utf16);
        let jsons = extract_json_objects_after_marker(&blob, "agent-gui-chats");
        assert_eq!(jsons.len(), 1);
        assert!(jsons[0].contains("\"version\":2"));
    }
}
