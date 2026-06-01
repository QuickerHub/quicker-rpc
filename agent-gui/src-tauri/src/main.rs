// Prevents additional console window on Windows in release, see https://github.com/tauri-apps/tauri/issues/6656
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    quicker_agent_lib::run()
}
