use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginRegistryBootstrap {
    pub schema_version: u32,
    pub registry_url: String,
    pub registry_mirror_url: Option<String>,
    pub cache_ttl_hours: u64,
    pub offline_fallback_registry: OfflineFallbackRegistry,
}

#[derive(Debug, Clone, Deserialize)]
pub struct OfflineFallbackRegistry {
    pub plugins: HashMap<String, PluginChannelEntry>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginChannelEntry {
    pub channel_url: String,
    pub channel_mirror_url: Option<String>,
    pub min_host_version: Option<String>,
    #[serde(default)]
    pub activation_events: Vec<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginRegistry {
    pub schema_version: u32,
    pub updated_at: Option<String>,
    pub plugins: HashMap<String, PluginRegistryEntry>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginRegistryEntry {
    pub display_name: Option<String>,
    pub channel_url: String,
    pub channel_mirror_url: Option<String>,
    pub min_host_version: Option<String>,
    pub enabled: Option<bool>,
    #[serde(default)]
    pub activation_events: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginStatusDto {
    pub plugin_id: String,
    pub display_name: String,
    pub installed: bool,
    pub running: bool,
    pub installed_version: Option<String>,
    pub latest_version: Option<String>,
    pub update_available: bool,
    pub host_compatible: bool,
    pub message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CachedJsonEnvelope<T> {
    pub fetched_at_ms: u64,
    pub ttl_hours: u64,
    pub payload: T,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VoicePluginChannel {
    #[serde(rename = "runtimeVersion")]
    pub runtime_version: String,
    pub runtime_zip_url: String,
    #[serde(rename = "modelZipUrl")]
    pub model_zip_url: String,
    pub runtime_zip_mirror_url: Option<String>,
    #[serde(rename = "modelZipMirrorUrl")]
    pub model_zip_mirror_url: Option<String>,
    pub runtime_zip_sha256: Option<String>,
    #[serde(rename = "modelZipSha256")]
    pub model_zip_sha256: Option<String>,
}
