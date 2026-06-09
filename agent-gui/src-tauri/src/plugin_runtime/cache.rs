use std::fs;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

use super::types::CachedJsonEnvelope;

pub fn read_cached_json<T: serde::de::DeserializeOwned>(path: &Path) -> Option<T> {
    let raw = fs::read_to_string(path).ok()?;
    let envelope: CachedJsonEnvelope<T> = serde_json::from_str(&raw).ok()?;
    let now_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .ok()?
        .as_millis() as u64;
    let ttl_ms = envelope.ttl_hours.saturating_mul(3_600_000);
    if now_ms.saturating_sub(envelope.fetched_at_ms) > ttl_ms {
        return None;
    }
    Some(envelope.payload)
}

pub fn read_stale_cached_json<T: serde::de::DeserializeOwned>(path: &Path) -> Option<T> {
    let raw = fs::read_to_string(path).ok()?;
    let envelope: CachedJsonEnvelope<T> = serde_json::from_str(&raw).ok()?;
    Some(envelope.payload)
}

pub fn write_cached_json<T: serde::Serialize>(
    path: &Path,
    payload: &T,
    ttl_hours: u64,
) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let fetched_at_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_millis() as u64;
    let envelope = CachedJsonEnvelope {
        fetched_at_ms,
        ttl_hours,
        payload,
    };
    let raw = serde_json::to_string_pretty(&envelope).map_err(|e| e.to_string())?;
    fs::write(path, raw).map_err(|e| e.to_string())
}
