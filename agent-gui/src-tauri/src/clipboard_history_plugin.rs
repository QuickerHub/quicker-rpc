use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager, State};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

use crate::quicker_agent_paths::clipboard_history_plugin_root;

/// Temporarily disabled — set to `true` when clipboard-history is ready to ship again.
pub const CLIPBOARD_HISTORY_ENABLED: bool = false;

const DISABLED_MESSAGE: &str = "剪贴板历史功能已暂时关闭，不影响系统剪贴板正常使用。";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClipboardHistoryPluginStatusDto {
    pub status: String,
    pub installed: bool,
    pub running: bool,
    pub http_port: u16,
    pub plugin_dir: Option<String>,
    pub message: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ClipboardManifest {
    runtime: Option<ClipboardManifestRuntime>,
}

#[derive(Debug, Deserialize)]
struct ClipboardManifestRuntime {
    exe: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClipboardPluginSettingsDto {
    #[serde(default)]
    pub auto_start: bool,
}

impl Default for ClipboardPluginSettingsDto {
    fn default() -> Self {
        Self { auto_start: false }
    }
}

fn clipboard_settings_path() -> PathBuf {
    clipboard_history_plugin_root().join("settings.json")
}

pub fn read_clipboard_auto_start() -> bool {
    if !CLIPBOARD_HISTORY_ENABLED {
        return false;
    }
    if std::env::var("AGENT_GUI_CLIPBOARD_RUNTIME")
        .ok()
        .is_some_and(|value| value == "1")
    {
        return true;
    }
    read_clipboard_settings().auto_start
}

pub fn read_clipboard_settings() -> ClipboardPluginSettingsDto {
    let path = clipboard_settings_path();
    if !path.is_file() {
        return ClipboardPluginSettingsDto::default();
    }
    let Ok(raw) = std::fs::read_to_string(&path) else {
        return ClipboardPluginSettingsDto::default();
    };
    serde_json::from_str(&raw).unwrap_or_default()
}

fn write_clipboard_settings(settings: &ClipboardPluginSettingsDto) -> Result<(), String> {
    let root = clipboard_history_plugin_root();
    std::fs::create_dir_all(&root).map_err(|e| format!("创建剪贴板插件目录失败：{e}"))?;
    let raw = serde_json::to_string_pretty(settings)
        .map_err(|e| format!("序列化剪贴板设置失败：{e}"))?;
    std::fs::write(clipboard_settings_path(), raw)
        .map_err(|e| format!("写入剪贴板设置失败：{e}"))
}

pub struct ClipboardHistoryPluginState {
    pub(crate) child: Mutex<Option<Child>>,
}

impl ClipboardHistoryPluginState {
    pub fn new() -> Self {
        Self {
            child: Mutex::new(None),
        }
    }

    pub fn shutdown(&self) {
        if let Ok(mut guard) = self.child.lock() {
            if let Some(mut child) = guard.take() {
                crate::kill_child_tree(&mut child);
            }
        }
    }
}

const DEFAULT_RUNTIME_EXE: &str = "runtime/quicker-clipboard-history.exe";
const DEFAULT_HTTP_HOST: &str = "127.0.0.1";
const DEFAULT_HTTP_PORT: u16 = 6020;
const RUNTIME_READY_WAIT_MS: u64 = 20_000;

fn dev_runtime_dir() -> Option<PathBuf> {
    let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../clipboard-history-runtime");
    if dir.join("Cargo.toml").is_file() {
        return dir.canonicalize().ok();
    }
    None
}

fn dev_runtime_exe() -> Option<PathBuf> {
    let dir = dev_runtime_dir()?;
    #[cfg(windows)]
    let exe = dir.join("target/debug/quicker-clipboard-history.exe");
    #[cfg(not(windows))]
    let exe = dir.join("target/debug/quicker-clipboard-history");
    if exe.is_file() {
        Some(exe)
    } else {
        None
    }
}

fn read_manifest(root: &Path) -> Option<ClipboardManifest> {
    let raw = std::fs::read_to_string(root.join("manifest.json")).ok()?;
    serde_json::from_str(&raw).ok()
}

fn runtime_exe_relative(manifest: Option<&ClipboardManifest>) -> String {
    manifest
        .and_then(|m| m.runtime.as_ref())
        .and_then(|r| r.exe.clone())
        .unwrap_or_else(|| DEFAULT_RUNTIME_EXE.to_string())
}

fn child_still_running(child: &mut Child) -> bool {
    match child.try_wait() {
        Ok(None) => true,
        Ok(Some(_)) => false,
        Err(_) => false,
    }
}

fn configure_hidden_child(cmd: &mut Command) {
    cmd.stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);
}

pub fn clipboard_http_port() -> u16 {
    std::env::var("QUICKER_CLIPBOARD_PORT")
        .ok()
        .or_else(|| std::env::var("AGENT_GUI_CLIPBOARD_PORT").ok())
        .and_then(|raw| raw.trim().parse::<u16>().ok())
        .filter(|port| *port > 0)
        .unwrap_or(DEFAULT_HTTP_PORT)
}

fn health_url(port: u16) -> String {
    format!("http://{DEFAULT_HTTP_HOST}:{port}/health")
}

fn fetch_runtime_health(port: u16) -> bool {
    let url = health_url(port);
    let Ok(client) = reqwest::blocking::Client::builder()
        .connect_timeout(Duration::from_secs(1))
        .timeout(Duration::from_secs(2))
        .build()
    else {
        return false;
    };
    let Ok(resp) = client.get(&url).send() else {
        return false;
    };
    if !resp.status().is_success() {
        return false;
    }
    let Ok(body) = resp.json::<serde_json::Value>() else {
        return false;
    };
    body.get("ok").and_then(|v| v.as_bool()) == Some(true)
        && body.get("ready").and_then(|v| v.as_bool()) == Some(true)
}

fn is_installed(root: &Path) -> bool {
    root.join("manifest.json").is_file()
        && root.join(DEFAULT_RUNTIME_EXE).is_file()
}

fn data_dir_for_root(root: &Path) -> PathBuf {
    root.join("data")
}

#[cfg(windows)]
fn kill_listener_on_port(port: u16) {
    let script = format!(
        "Get-NetTCPConnection -LocalPort {port} -State Listen -ErrorAction SilentlyContinue | ForEach-Object {{ Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }}"
    );
    let _ = Command::new("powershell")
        .args(["-NoProfile", "-Command", &script])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .creation_flags(CREATE_NO_WINDOW)
        .status();
    thread::sleep(Duration::from_millis(300));
}

#[cfg(not(windows))]
fn kill_listener_on_port(_port: u16) {}

#[cfg(windows)]
fn kill_clipboard_runtime_processes() {
    let _ = Command::new("taskkill")
        .args(["/F", "/IM", "quicker-clipboard-history.exe"])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .creation_flags(CREATE_NO_WINDOW)
        .status();
}

#[cfg(not(windows))]
fn kill_clipboard_runtime_processes() {}

pub fn shutdown_clipboard_history(state: &ClipboardHistoryPluginState) {
    state.shutdown();
    kill_listener_on_port(clipboard_http_port());
    kill_clipboard_runtime_processes();
}

pub fn ensure_clipboard_history_disabled(app: &AppHandle) {
    if CLIPBOARD_HISTORY_ENABLED {
        return;
    }
    let state = app.state::<ClipboardHistoryPluginState>();
    shutdown_clipboard_history(state.inner());
}

fn wait_runtime_ready(port: u16, max_ms: u64) -> Result<(), String> {
    let deadline = Instant::now() + Duration::from_millis(max_ms);
    while Instant::now() < deadline {
        if fetch_runtime_health(port) {
            return Ok(());
        }
        thread::sleep(Duration::from_millis(250));
    }
    Err(format!(
        "剪贴板 Runtime 未就绪（{DEFAULT_HTTP_HOST}:{port}/health）"
    ))
}

fn store_child(state: &ClipboardHistoryPluginState, child: Child) {
    if let Ok(mut guard) = state.child.lock() {
        *guard = Some(child);
    }
}

fn spawn_installed_runtime(root: &Path, exe_rel: &str, port: u16) -> Result<Child, String> {
    let exe = root.join(exe_rel);
    if !exe.is_file() {
        return Err(format!("Runtime 不存在：{}", exe.display()));
    }
    let data_dir = data_dir_for_root(root);
    let _ = std::fs::create_dir_all(&data_dir);
    let mut cmd = Command::new(&exe);
    cmd.args(["--host", DEFAULT_HTTP_HOST, "--port", &port.to_string(), "--data-dir"])
        .arg(&data_dir)
        .current_dir(root)
        .env("QUICKER_CLIPBOARD_DATA_DIR", &data_dir)
        .env("QUICKER_CLIPBOARD_PORT", port.to_string());
    configure_hidden_child(&mut cmd);
    cmd.spawn().map_err(|e| format!("启动剪贴板 Runtime 失败：{e}"))
}

fn spawn_dev_runtime(dev_dir: &Path, port: u16) -> Result<Child, String> {
    let data_dir = clipboard_history_plugin_root().join("data");
    let _ = std::fs::create_dir_all(&data_dir);

    if let Some(exe) = dev_runtime_exe() {
        let mut cmd = Command::new(&exe);
        cmd.args([
            "--host",
            DEFAULT_HTTP_HOST,
            "--port",
            &port.to_string(),
            "--data-dir",
        ])
        .arg(&data_dir)
        .current_dir(dev_dir)
        .env("QUICKER_CLIPBOARD_DATA_DIR", &data_dir)
        .env("QUICKER_CLIPBOARD_PORT", port.to_string());
        configure_hidden_child(&mut cmd);
        return cmd
            .spawn()
            .map_err(|e| format!("启动开发剪贴板 Runtime 失败：{e}"));
    }

    let mut cmd = Command::new("cargo");
    cmd.args([
        "run",
        "--quiet",
        "--",
        "--host",
        DEFAULT_HTTP_HOST,
        "--port",
        &port.to_string(),
        "--data-dir",
    ])
    .arg(&data_dir)
    .current_dir(dev_dir)
    .env("QUICKER_CLIPBOARD_DATA_DIR", &data_dir)
    .env("QUICKER_CLIPBOARD_PORT", port.to_string());
    configure_hidden_child(&mut cmd);
    cmd.spawn()
        .map_err(|e| format!("cargo run 剪贴板 Runtime 失败：{e}"))
}

fn reconcile_child(state: &ClipboardHistoryPluginState) {
    if let Ok(mut guard) = state.child.lock() {
        if let Some(child) = guard.as_mut() {
            if !child_still_running(child) {
                guard.take();
            }
        }
    }
}

fn build_status(state: &ClipboardHistoryPluginState) -> ClipboardHistoryPluginStatusDto {
    if !CLIPBOARD_HISTORY_ENABLED {
        return ClipboardHistoryPluginStatusDto {
            status: "disabled".into(),
            installed: false,
            running: false,
            http_port: 0,
            plugin_dir: None,
            message: Some(DISABLED_MESSAGE.into()),
        };
    }

    reconcile_child(state);
    let root = clipboard_history_plugin_root();
    let installed = is_installed(&root);
    let dev_dir = dev_runtime_dir();
    let plugin_dir = if installed {
        Some(root.to_string_lossy().into_owned())
    } else if let Some(dev) = dev_dir.as_ref() {
        Some(dev.to_string_lossy().into_owned())
    } else {
        None
    };
    let port = clipboard_http_port();

    let child_running = state
        .child
        .lock()
        .ok()
        .and_then(|g| g.as_ref().map(|c| c.id()))
        .is_some();

    if fetch_runtime_health(port) {
        return ClipboardHistoryPluginStatusDto {
            status: "running".into(),
            installed: installed || dev_dir.is_some(),
            running: true,
            http_port: port,
            plugin_dir,
            message: None,
        };
    }

    if child_running {
        return ClipboardHistoryPluginStatusDto {
            status: "starting".into(),
            installed: installed || dev_dir.is_some(),
            running: false,
            http_port: port,
            plugin_dir,
            message: Some("剪贴板 Runtime 启动中…".into()),
        };
    }

    if installed || dev_dir.is_some() {
        let message = if read_clipboard_auto_start() {
            "已就绪，启动中或等待手动启动…".into()
        } else {
            "默认关闭。可在设置中手动启动，或开启「随应用自动启动」。".into()
        };
        return ClipboardHistoryPluginStatusDto {
            status: "installed".into(),
            installed: true,
            running: false,
            http_port: 0,
            plugin_dir,
            message: Some(message),
        };
    }

    ClipboardHistoryPluginStatusDto {
        status: "not_installed".into(),
        installed: false,
        running: false,
        http_port: 0,
        plugin_dir,
        message: Some("剪贴板插件未安装。开发模式请设置 AGENT_GUI_CLIPBOARD_RUNTIME=1 或构建 runtime。".into()),
    }
}

pub fn ensure_clipboard_runtime(state: &ClipboardHistoryPluginState) -> Result<ClipboardHistoryPluginStatusDto, String> {
    if !CLIPBOARD_HISTORY_ENABLED {
        shutdown_clipboard_history(state);
        return Err(DISABLED_MESSAGE.into());
    }

    reconcile_child(state);
    let port = clipboard_http_port();
    if fetch_runtime_health(port) {
        return Ok(build_status(state));
    }

    if state
        .child
        .lock()
        .ok()
        .and_then(|g| g.as_ref().map(|c| c.id()))
        .is_some()
    {
        wait_runtime_ready(port, RUNTIME_READY_WAIT_MS)?;
        return Ok(build_status(state));
    }

    kill_listener_on_port(port);
    let root = clipboard_history_plugin_root();
    let child = if is_installed(&root) {
        let manifest = read_manifest(&root);
        let exe_rel = runtime_exe_relative(manifest.as_ref());
        spawn_installed_runtime(&root, &exe_rel, port)?
    } else if let Some(dev_dir) = dev_runtime_dir() {
        spawn_dev_runtime(&dev_dir, port)?
    } else {
        return Err("剪贴板 Runtime 不可用：请构建 clipboard-history-runtime 或安装插件。".into());
    };
    store_child(state, child);
    wait_runtime_ready(port, RUNTIME_READY_WAIT_MS)?;
    Ok(build_status(state))
}

#[tauri::command]
pub fn clipboard_history_plugin_status(
    state: State<'_, ClipboardHistoryPluginState>,
) -> ClipboardHistoryPluginStatusDto {
    build_status(&state)
}

#[tauri::command]
pub fn clipboard_history_runtime_health() -> serde_json::Value {
    let port = clipboard_http_port();
    let ok = fetch_runtime_health(port);
    serde_json::json!({
        "ok": ok,
        "ready": ok,
        "protocolVersion": 1,
        "httpPort": port,
    })
}

#[tauri::command]
pub fn clipboard_history_plugin_start_runtime(
    state: State<'_, ClipboardHistoryPluginState>,
) -> Result<ClipboardHistoryPluginStatusDto, String> {
    ensure_clipboard_runtime(&state)
}

#[tauri::command]
pub fn clipboard_history_plugin_stop_runtime(
    state: State<'_, ClipboardHistoryPluginState>,
) -> ClipboardHistoryPluginStatusDto {
    shutdown_clipboard_history(state.inner());
    build_status(&state)
}

fn ensure_clipboard_runtime_if_auto_start(app: &AppHandle) {
    if !read_clipboard_auto_start() {
        return;
    }
    let state = app.state::<ClipboardHistoryPluginState>();
    if let Err(err) = ensure_clipboard_runtime(state.inner()) {
        eprintln!("[clipboard-history] auto start failed: {err}");
    }
}

pub fn spawn_clipboard_runtime_background(app: AppHandle) {
    if !CLIPBOARD_HISTORY_ENABLED {
        ensure_clipboard_history_disabled(&app);
        return;
    }

    std::thread::spawn(move || {
        ensure_clipboard_runtime_if_auto_start(&app);
    });
}

#[tauri::command]
pub fn clipboard_history_plugin_read_settings() -> ClipboardPluginSettingsDto {
    read_clipboard_settings()
}

#[tauri::command]
pub fn clipboard_history_plugin_write_settings(
    settings: ClipboardPluginSettingsDto,
) -> Result<ClipboardPluginSettingsDto, String> {
    write_clipboard_settings(&settings)?;
    Ok(settings)
}
