use std::path::PathBuf;

use super::bootstrap;
use super::cache;
use super::http;
use super::types::{PluginChannelEntry, PluginRegistry, PluginRegistryEntry};
use crate::quicker_agent_paths::plugin_cache_dir;

const REGISTRY_CACHE_FILE: &str = "plugin-registry.json";

fn registry_from_bootstrap_fallback() -> Result<PluginRegistry, String> {
    let bootstrap = bootstrap::load_bootstrap()?;
    let plugins = bootstrap
        .offline_fallback_registry
        .plugins
        .into_iter()
        .map(|(id, entry)| {
            (
                id,
                PluginRegistryEntry {
                    display_name: None,
                    channel_url: entry.channel_url,
                    channel_mirror_url: entry.channel_mirror_url,
                    min_host_version: entry.min_host_version,
                    enabled: Some(true),
                    activation_events: entry.activation_events,
                },
            )
        })
        .collect();
    Ok(PluginRegistry {
        schema_version: bootstrap.schema_version,
        updated_at: None,
        plugins,
    })
}

pub fn resolve_registry(force_refresh: bool) -> Result<PluginRegistry, String> {
    let bootstrap = bootstrap::load_bootstrap()?;
    let ttl = bootstrap.cache_ttl_hours.max(1);
    let cache_path: PathBuf = plugin_cache_dir().join(REGISTRY_CACHE_FILE);

    if !force_refresh {
        if let Some(cached) = cache::read_cached_json::<PluginRegistry>(&cache_path) {
            return Ok(cached);
        }
    }

    let client = http::build_http_client()?;
    if let Some(raw) = http::try_fetch_text(
        &client,
        &bootstrap.registry_url,
        bootstrap.registry_mirror_url.as_deref(),
    ) {
        let registry: PluginRegistry =
            serde_json::from_str(&raw).map_err(|e| format!("plugin registry JSON invalid: {e}"))?;
        let _ = cache::write_cached_json(&cache_path, &registry, ttl);
        return Ok(registry);
    }

    if let Some(stale) = cache::read_stale_cached_json::<PluginRegistry>(&cache_path) {
        return Ok(stale);
    }

    registry_from_bootstrap_fallback()
}

pub fn resolve_plugin_channel_entry(plugin_id: &str) -> Result<PluginChannelEntry, String> {
    if let Ok(registry) = resolve_registry(false) {
        if let Some(entry) = registry.plugins.get(plugin_id) {
            if entry.enabled.unwrap_or(true) {
                return Ok(PluginChannelEntry {
                    channel_url: entry.channel_url.clone(),
                    channel_mirror_url: entry.channel_mirror_url.clone(),
                    min_host_version: entry.min_host_version.clone(),
                    activation_events: entry.activation_events.clone(),
                });
            }
        }
    }
    if plugin_id == "voice-asr" {
        return bootstrap::voice_channel_entry();
    }
    Err(format!("unknown plugin id: {plugin_id}"))
}

pub fn list_known_plugin_ids() -> Vec<String> {
    if let Ok(registry) = resolve_registry(false) {
        let mut ids: Vec<String> = registry
            .plugins
            .iter()
            .filter(|(_, entry)| entry.enabled.unwrap_or(true))
            .map(|(id, _)| id.clone())
            .collect();
        if !ids.is_empty() {
            ids.sort();
            return ids;
        }
    }
    vec!["voice-asr".into()]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bootstrap_fallback_registry_parses() {
        let registry = registry_from_bootstrap_fallback().expect("fallback registry");
        assert!(registry.plugins.contains_key("voice-asr"));
    }
}
