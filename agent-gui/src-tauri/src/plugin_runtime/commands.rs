use tauri::{AppHandle, State};

use crate::clipboard_history_plugin::{self, ClipboardHistoryPluginState, CLIPBOARD_HISTORY_ENABLED};
use crate::quicker_agent_paths::voice_plugin_root;
use crate::voice_plugin::{self, VoicePluginState};
use crate::voice_plugin_install;

use super::activation::{self, EVENT_ON_DEMAND_VOICE_INPUT};
use super::channel;
use super::compat;
use super::registry;
use super::types::PluginStatusDto;

fn voice_display_name() -> String {
    registry::resolve_registry(false)
        .ok()
        .and_then(|r| r.plugins.get("voice-asr").cloned())
        .and_then(|e| e.display_name)
        .unwrap_or_else(|| "本地语音输入".into())
}

fn clipboard_display_name() -> String {
    registry::resolve_registry(false)
        .ok()
        .and_then(|r| r.plugins.get("clipboard-history").cloned())
        .and_then(|e| e.display_name)
        .unwrap_or_else(|| "剪贴板历史".into())
}

fn build_voice_plugin_status(
    state: &VoicePluginState,
    force_refresh_channel: bool,
) -> Result<PluginStatusDto, String> {
    let root = voice_plugin_root();
    let installed = voice_plugin_install::is_voice_asr_installed(&root);
    let installed_version = voice_plugin_install::read_installed_runtime_version(&root);

    let channel = if force_refresh_channel {
        voice_plugin_install::refresh_voice_channel_cache()
    } else {
        channel::resolve_voice_channel(false)
    };
    let latest_version = channel
        .ok()
        .map(|ch| ch.runtime_version.trim().to_string())
        .filter(|v| !v.is_empty());

    let entry = registry::resolve_plugin_channel_entry("voice-asr").ok();
    let host_compatible = entry
        .as_ref()
        .and_then(|e| e.min_host_version.as_deref())
        .map(compat::host_satisfies_min_version)
        .unwrap_or(true);

    let update_available =
        installed && host_compatible && voice_plugin_install::needs_runtime_update(&root);

    let host_status = voice_plugin::build_voice_plugin_status(state);
    let running = host_status.running;

    let message = if !host_compatible {
        Some(format!(
            "请升级 QuickerAgent（当前 {}）以安装最新语音 Runtime",
            crate::plugin_runtime::host_version::host_version()
        ))
    } else if update_available {
        Some(format!(
            "有可用更新：{} → {}",
            installed_version.as_deref().unwrap_or("未知"),
            latest_version.as_deref().unwrap_or("未知")
        ))
    } else {
        host_status.message
    };

    Ok(PluginStatusDto {
        plugin_id: "voice-asr".into(),
        display_name: voice_display_name(),
        installed,
        running,
        installed_version,
        latest_version,
        update_available,
        host_compatible,
        message,
    })
}

fn build_clipboard_plugin_status(
    state: &ClipboardHistoryPluginState,
) -> Result<PluginStatusDto, String> {
    if !CLIPBOARD_HISTORY_ENABLED {
        return Ok(PluginStatusDto {
            plugin_id: "clipboard-history".into(),
            display_name: clipboard_display_name(),
            installed: false,
            running: false,
            installed_version: None,
            latest_version: None,
            update_available: false,
            host_compatible: true,
            message: Some(clipboard_history_plugin::DISABLED_MESSAGE.to_string()),
        });
    }

    let host_status = clipboard_history_plugin::build_clipboard_plugin_status(state);
    Ok(PluginStatusDto {
        plugin_id: "clipboard-history".into(),
        display_name: clipboard_display_name(),
        installed: host_status.installed,
        running: host_status.running,
        installed_version: None,
        latest_version: None,
        update_available: false,
        host_compatible: true,
        message: host_status.message,
    })
}

fn build_plugin_status(
    plugin_id: &str,
    voice_state: &VoicePluginState,
    clipboard_state: &ClipboardHistoryPluginState,
    force_refresh_channel: bool,
) -> Result<PluginStatusDto, String> {
    match plugin_id {
        "voice-asr" => build_voice_plugin_status(voice_state, force_refresh_channel),
        "clipboard-history" => build_clipboard_plugin_status(clipboard_state),
        _ => Err(format!("unknown plugin id: {plugin_id}")),
    }
}

#[tauri::command]
pub fn plugin_registry_refresh() -> Result<(), String> {
    let _ = registry::resolve_registry(true)?;
    let _ = channel::resolve_voice_channel(true)?;
    Ok(())
}

#[tauri::command]
pub fn plugin_list(
    voice_state: State<'_, VoicePluginState>,
    clipboard_state: State<'_, ClipboardHistoryPluginState>,
) -> Result<Vec<PluginStatusDto>, String> {
    let mut items = Vec::new();
    for plugin_id in registry::list_known_plugin_ids() {
        if plugin_id == "clipboard-history" && !CLIPBOARD_HISTORY_ENABLED {
            continue;
        }
        items.push(build_plugin_status(
            &plugin_id,
            voice_state.inner(),
            clipboard_state.inner(),
            false,
        )?);
    }
    Ok(items)
}

#[tauri::command]
pub fn plugin_status(
    plugin_id: String,
    voice_state: State<'_, VoicePluginState>,
    clipboard_state: State<'_, ClipboardHistoryPluginState>,
) -> Result<PluginStatusDto, String> {
    build_plugin_status(
        &plugin_id,
        voice_state.inner(),
        clipboard_state.inner(),
        false,
    )
}

#[tauri::command]
pub fn plugin_update(
    app: AppHandle,
    plugin_id: String,
    voice_state: State<'_, VoicePluginState>,
    clipboard_state: State<'_, ClipboardHistoryPluginState>,
) -> Result<PluginStatusDto, String> {
    match plugin_id.as_str() {
        "voice-asr" => {
            voice_plugin::apply_voice_runtime_update(&app, voice_state.inner())?;
            build_voice_plugin_status(voice_state.inner(), false)
        }
        "clipboard-history" => Err("clipboard-history runtime updates are not available yet".into()),
        _ => {
            let _ = clipboard_state;
            Err(format!("unknown plugin id: {plugin_id}"))
        }
    }
}

#[tauri::command]
pub fn plugin_activate(
    app: AppHandle,
    plugin_id: String,
    event: String,
    voice_state: State<'_, VoicePluginState>,
) -> Result<(), String> {
    let events = activation::events_for(&plugin_id);
    if !activation::supports_on_demand(&events, &event) {
        return Err(format!("plugin {plugin_id} does not support activation event {event}"));
    }

    match (plugin_id.as_str(), event.as_str()) {
        ("voice-asr", EVENT_ON_DEMAND_VOICE_INPUT) => {
            voice_plugin::activate_voice_on_demand(&app, voice_state.inner())
        }
        _ => Err(format!("unsupported activation: {plugin_id} / {event}")),
    }
}
