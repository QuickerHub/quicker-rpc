use super::registry;

pub const EVENT_STARTUP_CHANNEL_REFRESH: &str = "onStartup:channelRefresh";
pub const EVENT_STARTUP_RUNTIME: &str = "onStartup:runtime";
/// Legacy alias — treated like `onStartup:runtime`.
pub const EVENT_STARTUP: &str = "onStartup";
pub const EVENT_ON_DEMAND_VOICE_INPUT: &str = "onDemand:voice-input";

pub fn events_for(plugin_id: &str) -> Vec<String> {
    if let Ok(registry) = registry::resolve_registry(false) {
        if let Some(entry) = registry.plugins.get(plugin_id) {
            if !entry.activation_events.is_empty() {
                return entry.activation_events.clone();
            }
        }
    }
    if let Ok(entry) = registry::resolve_plugin_channel_entry(plugin_id) {
        if !entry.activation_events.is_empty() {
            return entry.activation_events;
        }
    }
    default_events_for(plugin_id)
}

fn default_events_for(plugin_id: &str) -> Vec<String> {
    match plugin_id {
        "voice-asr" => vec![
            EVENT_STARTUP_CHANNEL_REFRESH.into(),
            EVENT_STARTUP_RUNTIME.into(),
        ],
        "clipboard-history" => vec![EVENT_STARTUP_CHANNEL_REFRESH.into()],
        _ => Vec::new(),
    }
}

pub fn should_refresh_channel_on_startup(events: &[String]) -> bool {
    events.iter().any(|event| {
        event == EVENT_STARTUP_CHANNEL_REFRESH
            || event == EVENT_STARTUP
            || event == EVENT_STARTUP_RUNTIME
    })
}

pub fn should_run_startup_runtime(events: &[String]) -> bool {
    events.iter().any(|event| event == EVENT_STARTUP || event == EVENT_STARTUP_RUNTIME)
}

pub fn supports_on_demand(events: &[String], demand_event: &str) -> bool {
    events.iter().any(|event| event == demand_event)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn voice_default_events_include_startup_runtime() {
        let events = default_events_for("voice-asr");
        assert!(should_run_startup_runtime(&events));
        assert!(should_refresh_channel_on_startup(&events));
    }
}
