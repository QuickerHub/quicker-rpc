fn main() {
    let conf_path = std::path::Path::new("tauri.conf.json");
    if let Ok(raw) = std::fs::read_to_string(conf_path) {
        if let Some(version) = extract_json_string_field(&raw, "version") {
            println!("cargo:rustc-env=QUICKER_AGENT_VERSION={version}");
        }
    }
    tauri_build::build()
}

fn extract_json_string_field(raw: &str, field: &str) -> Option<String> {
    let needle = format!("\"{field}\"");
    let start = raw.find(&needle)? + needle.len();
    let rest = raw[start..].trim_start();
    if !rest.starts_with(':') {
        return None;
    }
    let rest = rest[1..].trim_start();
    if !rest.starts_with('"') {
        return None;
    }
    let rest = &rest[1..];
    let end = rest.find('"')?;
    Some(rest[..end].to_string())
}
