use tauri::AppHandle;

pub fn init(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    // Launcher shortcut is registered from the main webview via @tauri-apps/plugin-global-shortcut.
    app.plugin(tauri_plugin_global_shortcut::Builder::new().build())?;
    Ok(())
}
