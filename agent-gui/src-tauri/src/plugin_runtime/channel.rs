use std::path::PathBuf;

use super::bootstrap;
use super::cache;
use super::compat;
use super::http;
use super::registry;
use super::types::VoicePluginChannel;
use crate::quicker_agent_paths::plugin_cache_dir;

const EMBEDDED_VOICE_CHANNEL: &str = include_str!("../../resources/voice-plugin-channel.json");
const VOICE_CACHE_FILE: &str = "voice-asr-channel.json";
const VOICE_PLUGIN_ID: &str = "voice-asr";

pub fn parse_voice_channel_json(raw: &str) -> Result<VoicePluginChannel, String> {
    serde_json::from_str(raw).map_err(|e| format!("voice channel JSON invalid: {e}"))
}

fn try_remote_channel(
    client: &reqwest::blocking::Client,
    primary: &str,
    mirror: Option<&str>,
) -> Option<VoicePluginChannel> {
    let raw = http::try_fetch_text(client, primary, mirror)?;
    parse_voice_channel_json(&raw).ok()
}

pub fn resolve_voice_channel(force_refresh: bool) -> Result<VoicePluginChannel, String> {
    let bootstrap = bootstrap::load_bootstrap()?;
    let ttl = bootstrap.cache_ttl_hours.max(1);
    let cache_path: PathBuf = plugin_cache_dir().join(VOICE_CACHE_FILE);

    if !force_refresh {
        if let Some(cached) = cache::read_cached_json::<VoicePluginChannel>(&cache_path) {
            return Ok(cached);
        }
    }

    let entry = registry::resolve_plugin_channel_entry(VOICE_PLUGIN_ID)?;
    if let Some(min_host) = entry.min_host_version.as_deref() {
        if !compat::host_satisfies_min_version(min_host) {
            return Err(format!(
                "QuickerAgent {} is below required {} for {VOICE_PLUGIN_ID}",
                crate::plugin_runtime::host_version::host_version(),
                min_host
            ));
        }
    }

    let client = http::build_http_client()?;
    if let Some(ch) = try_remote_channel(
        &client,
        &entry.channel_url,
        entry.channel_mirror_url.as_deref(),
    ) {
        let _ = cache::write_cached_json(&cache_path, &ch, ttl);
        return Ok(ch);
    }

    if let Some(stale) = cache::read_stale_cached_json::<VoicePluginChannel>(&cache_path) {
        return Ok(stale);
    }

    parse_voice_channel_json(EMBEDDED_VOICE_CHANNEL)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn embedded_voice_channel_fallback_parses() {
        let ch = parse_voice_channel_json(include_str!(
            "../../resources/voice-plugin-channel.json"
        ))
        .expect("embedded channel must parse");
        assert!(!ch.runtime_version.is_empty());
    }

    #[test]
    fn bootstrap_voice_entry_exists() {
        let entry = crate::plugin_runtime::bootstrap::voice_channel_entry()
            .expect("voice-asr entry");
        assert!(entry.channel_url.contains("voice-asr-runtime"));
    }
}
