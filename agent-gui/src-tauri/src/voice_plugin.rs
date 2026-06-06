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

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VoicePluginStatusDto {
    pub status: String,
    pub installed: bool,
    pub running: bool,
    pub ws_port: u16,
    pub plugin_dir: Option<String>,
    pub message: Option<String>,
}

#[derive(Debug, Deserialize)]
struct VoiceManifest {
    runtime: Option<VoiceManifestRuntime>,
}

#[derive(Debug, Deserialize)]
struct VoiceManifestRuntime {
    exe: Option<String>,
}

pub struct VoicePluginState {
    pub(crate) child: Mutex<Option<Child>>,
}

impl VoicePluginState {
    pub fn new() -> Self {
        Self {
            child: Mutex::new(None),
        }
    }

    pub fn shutdown(&self) {
        if let Ok(mut guard) = self.child.lock() {
            if let Some(mut child) = guard.take() {
                kill_child_tree(&mut child);
            }
        }
    }
}

const DEFAULT_RUNTIME_EXE: &str = "runtime/quicker-voice-runtime.exe";
const DEFAULT_VOICE_WS_HOST: &str = "127.0.0.1";
const DEFAULT_VOICE_WS_PORT: u16 = 6016;
const VOICE_RUNTIME_READY_WAIT_MS: u64 = 45_000;

use crate::quicker_agent_paths::voice_plugin_root;

fn dev_runtime_dir() -> Option<PathBuf> {
    let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../voice-asr-runtime");
    if dir.join("pyproject.toml").is_file() {
        return dir.canonicalize().ok();
    }
    None
}

fn read_manifest(root: &Path) -> Option<VoiceManifest> {
    let raw = std::fs::read_to_string(root.join("manifest.json")).ok()?;
    serde_json::from_str(&raw).ok()
}

fn runtime_exe_relative(manifest: Option<&VoiceManifest>) -> String {
    manifest
        .and_then(|m| m.runtime.as_ref())
        .and_then(|r| r.exe.clone())
        .unwrap_or_else(|| DEFAULT_RUNTIME_EXE.to_string())
}

fn kill_child_tree(child: &mut Child) {
    #[cfg(windows)]
    {
        let pid = child.id();
        let _ = Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .creation_flags(CREATE_NO_WINDOW)
            .status();
    }
    #[cfg(not(windows))]
    {
        let _ = child.kill();
    }
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

fn voice_ws_port() -> u16 {
    std::env::var("QUICKER_VOICE_PORT")
        .ok()
        .or_else(|| std::env::var("AGENT_GUI_VOICE_PORT").ok())
        .and_then(|raw| raw.trim().parse::<u16>().ok())
        .filter(|port| *port > 0)
        .unwrap_or(DEFAULT_VOICE_WS_PORT)
}

fn voice_health_url(port: u16) -> String {
    format!("http://{DEFAULT_VOICE_WS_HOST}:{port}/health")
}

fn voice_runtime_ready(port: u16) -> bool {
    let url = voice_health_url(port);
    let Ok(client) = reqwest::blocking::Client::builder()
        .connect_timeout(Duration::from_secs(1))
        .timeout(Duration::from_secs(3))
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
    if body.get("ok").and_then(|v| v.as_bool()) != Some(true) {
        return false;
    }
    if body.get("ready").and_then(|v| v.as_bool()) != Some(true) {
        return false;
    }
    if body.get("modelLoaded").and_then(|v| v.as_bool()) != Some(true) {
        return false;
    }
    match body.get("modelId").and_then(|v| v.as_str()) {
        Some(id) if !id.eq_ignore_ascii_case("stub") && !id.trim().is_empty() => true,
        _ => false,
    }
}

fn resolve_voice_model_dir(root: &Path) -> Option<PathBuf> {
    let sensevoice = root.join("models").join("sensevoice");
    if model_ready_at(root) {
        Some(sensevoice)
    } else {
        None
    }
}

fn wait_voice_runtime_ready(port: u16, max_ms: u64) -> Result<(), String> {
    let deadline = Instant::now() + Duration::from_millis(max_ms);
    while Instant::now() < deadline {
        if voice_runtime_ready(port) {
            return Ok(());
        }
        thread::sleep(Duration::from_millis(300));
    }
    Err(format!(
        "语音 Runtime 已启动但识别模型未加载（{DEFAULT_VOICE_WS_HOST}:{port}/health）。请在设置中重新安装语音组件。"
    ))
}

fn read_voice_auto_start() -> bool {
    let path = voice_plugin_root().join("settings.json");
    if !path.is_file() {
        return dev_runtime_dir().is_some();
    }
    let Ok(raw) = std::fs::read_to_string(&path) else {
        return true;
    };
    let Ok(value) = serde_json::from_str::<serde_json::Value>(&raw) else {
        return true;
    };
    value
        .get("autoStart")
        .and_then(|v| v.as_bool())
        .unwrap_or(true)
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
    thread::sleep(Duration::from_millis(400));
}

#[cfg(not(windows))]
fn kill_listener_on_port(_port: u16) {}

fn running_status_dto(
    fully_installed: bool,
    plugin_dir: Option<String>,
    port: u16,
) -> VoicePluginStatusDto {
    VoicePluginStatusDto {
        status: if fully_installed {
            "running".into()
        } else {
            "starting".into()
        },
        installed: fully_installed,
        running: fully_installed,
        ws_port: port,
        plugin_dir,
        message: None,
    }
}

fn store_runtime_child(state: &VoicePluginState, child: Child) {
    if let Ok(mut guard) = state.child.lock() {
        *guard = Some(child);
    }
}

fn spawn_installed_runtime_ws(root: &Path, exe_rel: &str, port: u16) -> Result<Child, String> {
    let exe = root.join(exe_rel);
    if !exe.is_file() {
        return Err(format!("Runtime 不存在：{}", exe.display()));
    }

    let mut cmd = Command::new(&exe);
    cmd.args([
        "--host",
        DEFAULT_VOICE_WS_HOST,
        "--port",
        &port.to_string(),
    ])
    .current_dir(root);
    if let Some(model_dir) = resolve_voice_model_dir(root) {
        cmd.env("QUICKER_VOICE_MODEL_DIR", &model_dir);
        cmd.env("QUICKER_VOICE_MODEL_TYPE", "sensevoice");
        cmd.env("QUICKER_VOICE_AUTO_DOWNLOAD_MODEL", "0");
    }
    cmd.env("QUICKER_VOICE_HOST", DEFAULT_VOICE_WS_HOST);
    cmd.env("QUICKER_VOICE_PORT", port.to_string());
    configure_hidden_child(&mut cmd);
    cmd.spawn()
        .map_err(|e| format!("启动 Runtime 失败：{e}"))
}

fn spawn_dev_runtime_ws(dev_dir: &Path, port: u16) -> Result<Child, String> {
    let host_port_args = [
        "--host".to_string(),
        DEFAULT_VOICE_WS_HOST.to_string(),
        "--port".to_string(),
        port.to_string(),
    ];
    let dir = dev_dir.to_string_lossy();

    let mut uv_cmd = Command::new("uv");
    uv_cmd
        .args([
            "run",
            "--directory",
            dir.as_ref(),
            "quicker-voice-runtime",
            "--host",
            DEFAULT_VOICE_WS_HOST,
            "--port",
            &port.to_string(),
        ])
        .current_dir(dev_dir)
        .env("QUICKER_VOICE_HOST", DEFAULT_VOICE_WS_HOST)
        .env("QUICKER_VOICE_PORT", port.to_string());
    configure_hidden_child(&mut uv_cmd);
    if let Ok(child) = uv_cmd.spawn() {
        return Ok(child);
    }

    #[cfg(windows)]
    let venv_python = dev_dir.join(".venv").join("Scripts").join("python.exe");
    #[cfg(not(windows))]
    let venv_python = dev_dir.join(".venv").join("bin").join("python");

    if venv_python.is_file() {
        let mut py_cmd = Command::new(&venv_python);
        py_cmd
            .arg("-m")
            .arg("quicker_voice_runtime")
            .args(&host_port_args)
            .current_dir(dev_dir)
            .env("QUICKER_VOICE_HOST", DEFAULT_VOICE_WS_HOST)
            .env("QUICKER_VOICE_PORT", port.to_string());
        configure_hidden_child(&mut py_cmd);
        if let Ok(child) = py_cmd.spawn() {
            return Ok(child);
        }
    }

    Err(
        "开发 Runtime 启动失败：请安装 uv 并在 voice-asr-runtime 执行 uv sync，或确认 .venv 可用"
            .into(),
    )
}

fn reconcile_child(state: &VoicePluginState) {
    if let Ok(mut guard) = state.child.lock() {
        if let Some(child) = guard.as_mut() {
            if !child_still_running(child) {
                guard.take();
            }
        }
    }
}

fn ws_status_from_child(
    state: &VoicePluginState,
    fully_installed: bool,
    plugin_dir: Option<String>,
    port: u16,
) -> Option<VoicePluginStatusDto> {
    let child_running = state
        .child
        .lock()
        .ok()
        .and_then(|g| g.as_ref().map(|c| c.id()))
        .is_some();
    if !child_running {
        return None;
    }
    if voice_runtime_ready(port) {
        return Some(running_status_dto(fully_installed, plugin_dir, port));
    }
    Some(VoicePluginStatusDto {
        status: "starting".into(),
        installed: fully_installed,
        running: false,
        ws_port: port,
        plugin_dir,
        message: Some("Runtime 启动中…".into()),
    })
}

fn model_ready_at(root: &Path) -> bool {
    let dir = root.join("models").join("sensevoice");
    dir.join("tokens.txt").is_file()
        && (dir.join("model.int8.onnx").is_file() || dir.join("model.onnx").is_file())
}

fn build_status(state: &VoicePluginState) -> VoicePluginStatusDto {
    reconcile_child(state);

    if crate::voice_plugin_install::voice_install_in_progress() {
        return VoicePluginStatusDto {
            status: "downloading".into(),
            installed: false,
            running: false,
            ws_port: 0,
            plugin_dir: Some(voice_plugin_root().to_string_lossy().into_owned()),
            message: Some("正在下载并安装语音插件…".into()),
        };
    }

    let root = voice_plugin_root();
    let fully_installed = crate::voice_plugin_install::is_voice_asr_installed(&root);
    let dev_dir = dev_runtime_dir();
    let plugin_dir = if fully_installed {
        Some(root.to_string_lossy().into_owned())
    } else if let Some(dev) = dev_dir.as_ref() {
        Some(dev.to_string_lossy().into_owned())
    } else if root.join("manifest.json").is_file() {
        Some(root.to_string_lossy().into_owned())
    } else {
        None
    };

    let port = voice_ws_port();
    if fully_installed && voice_runtime_ready(port) {
        return running_status_dto(true, plugin_dir.clone(), port);
    }

    if let Some(dto) = ws_status_from_child(state, fully_installed, plugin_dir.clone(), port) {
        return dto;
    }

    if fully_installed {
        return VoicePluginStatusDto {
            status: "installed".into(),
            installed: true,
            running: false,
            ws_port: 0,
            plugin_dir,
            message: Some("已安装，点击「启动 Runtime」或设置页启动".into()),
        };
    }

    if let Some(dev) = dev_dir {
        return VoicePluginStatusDto {
            status: "installed".into(),
            installed: true,
            running: false,
            ws_port: 0,
            plugin_dir: Some(dev.to_string_lossy().into_owned()),
            message: Some(
                "开发模式：仓库 voice-asr-runtime 可用，可启动 Runtime（需 uv）".into(),
            ),
        };
    }

    let has_partial = root.join("manifest.json").is_file()
        || root.join("runtime/quicker-voice-runtime.exe").is_file()
        || model_ready_at(&root);

    VoicePluginStatusDto {
        status: "not_installed".into(),
        installed: false,
        running: false,
        ws_port: 0,
        plugin_dir,
        message: Some(if has_partial {
            "语音组件未完整安装，请点击「安装」继续。".into()
        } else {
            "未安装。点击下方「安装」，将自动下载并配置语音服务与识别模型（约 240 MB，仅需一次）。".into()
        }),
    }
}

#[tauri::command]
pub fn voice_plugin_status(state: State<'_, VoicePluginState>) -> VoicePluginStatusDto {
    build_status(&state)
}

fn start_runtime_inner(state: &VoicePluginState) -> VoicePluginStatusDto {
    reconcile_child(state);

    let root = voice_plugin_root();
    let manifest = read_manifest(&root);
    let plugin_dir = if root.join("manifest.json").is_file() {
        Some(root.to_string_lossy().into_owned())
    } else {
        dev_runtime_dir()
            .as_ref()
            .map(|p| p.to_string_lossy().into_owned())
    };

    let port = voice_ws_port();
    let fully_installed = crate::voice_plugin_install::is_voice_asr_installed(&root);
    if fully_installed && voice_runtime_ready(port) {
        return running_status_dto(true, plugin_dir.clone(), port);
    }

    if let Some(dto) = ws_status_from_child(
        state,
        fully_installed,
        plugin_dir.clone(),
        port,
    ) {
        if dto.running {
            return dto;
        }
    }

    if state
        .child
        .lock()
        .ok()
        .and_then(|g| g.as_ref().map(|c| c.id()))
        .is_some()
    {
        return build_status(state);
    }

    kill_listener_on_port(port);

    let spawn_result = if fully_installed {
        let exe_rel = runtime_exe_relative(manifest.as_ref());
        spawn_installed_runtime_ws(&root, &exe_rel, port)
    } else if let Some(dev_dir) = dev_runtime_dir() {
        spawn_dev_runtime_ws(&dev_dir, port)
    } else {
        Err("请先安装语音插件，或在开发环境保留 voice-asr-runtime 目录".into())
    };

    match spawn_result {
        Ok(child) => {
            store_runtime_child(state, child);
            match wait_voice_runtime_ready(port, VOICE_RUNTIME_READY_WAIT_MS) {
                Ok(()) => running_status_dto(
                    crate::voice_plugin_install::is_voice_asr_installed(&root),
                    plugin_dir,
                    port,
                ),
                Err(err) => {
                    let mut dto = build_status(state);
                    if dto.status == "starting" {
                        dto.message = Some(err);
                    } else {
                        dto.status = "error".into();
                        dto.message = Some(err);
                    }
                    dto.ws_port = port;
                    dto
                }
            }
        }
        Err(err) => VoicePluginStatusDto {
            status: "error".into(),
            installed: build_status(state).installed,
            running: false,
            ws_port: port,
            plugin_dir: build_status(state).plugin_dir,
            message: Some(err),
        },
    }
}

/// Start voice runtime when settings allow and /health is not ready yet.
pub fn ensure_voice_runtime(app: &AppHandle) {
    if !read_voice_auto_start() {
        return;
    }
    let port = voice_ws_port();
    if voice_runtime_ready(port) {
        return;
    }
    let state = app.state::<VoicePluginState>();
    let status = build_status(state.inner());
    if status.running {
        return;
    }
    if status.status == "not_installed" || status.status == "downloading" {
        return;
    }
    let _ = start_runtime_inner(state.inner());
}

fn run_background_voice_tasks(app: &AppHandle) {
    if cfg!(debug_assertions) {
        ensure_voice_runtime(app);
        return;
    }

    let root = voice_plugin_root();
    let installed = crate::voice_plugin_install::is_voice_asr_installed(&root);

    if !installed {
        if let Err(err) = crate::voice_plugin_install::run_voice_plugin_install(app) {
            eprintln!("[voice-plugin] background install failed: {err}");
            return;
        }
        let state = app.state::<VoicePluginState>();
        let _ = start_runtime_inner(state.inner());
        return;
    }

    if crate::voice_plugin_install::needs_runtime_update(&root) {
        if let Err(err) = crate::voice_plugin_install::stage_runtime_upgrade(app) {
            eprintln!("[voice-plugin] runtime upgrade staging failed: {err}");
        }
    }

    ensure_voice_runtime(app);
}

pub fn spawn_voice_runtime_background(app: AppHandle) {
    std::thread::spawn(move || {
        run_background_voice_tasks(&app);
    });
}

#[tauri::command]
pub fn voice_plugin_start_runtime(
    _app: AppHandle,
    state: State<'_, VoicePluginState>,
) -> VoicePluginStatusDto {
    start_runtime_inner(state.inner())
}

#[tauri::command]
pub fn voice_plugin_install(
    app: AppHandle,
    state: State<'_, VoicePluginState>,
) -> VoicePluginStatusDto {
    if let Err(err) = crate::voice_plugin_install::run_voice_plugin_install(&app) {
        let mut dto = build_status(&state);
        dto.status = "error".into();
        dto.message = Some(err);
        return dto;
    }
    voice_plugin_start_runtime(app, state)
}

#[tauri::command]
pub fn voice_plugin_stop_runtime(state: State<'_, VoicePluginState>) -> VoicePluginStatusDto {
    state.shutdown();
    let mut dto = build_status(&state);
    if dto.status == "running" || dto.status == "starting" {
        dto.status = "stopped".into();
        dto.running = false;
        dto.message = Some("已停止 Host 托管的 Runtime 进程".into());
    }
    dto
}
