use super::types::{PluginChannelEntry, PluginRegistryBootstrap};

const BOOTSTRAP_JSON: &str = include_str!("../../resources/plugin-registry-bootstrap.json");

pub fn load_bootstrap() -> Result<PluginRegistryBootstrap, String> {
    serde_json::from_str(BOOTSTRAP_JSON)
        .map_err(|e| format!("plugin-registry-bootstrap.json invalid: {e}"))
}

pub fn voice_channel_entry() -> Result<PluginChannelEntry, String> {
    load_bootstrap()?
        .offline_fallback_registry
        .plugins
        .get("voice-asr")
        .cloned()
        .ok_or_else(|| "bootstrap missing voice-asr channel entry".into())
}
