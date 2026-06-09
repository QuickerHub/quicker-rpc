pub fn host_version() -> &'static str {
    option_env!("QUICKER_AGENT_VERSION").unwrap_or("0.0.0")
}
