use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager, State};

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
    #[cfg(windows)]
    job: Mutex<Option<crate::win_job::KillOnCloseJob>>,
}

impl VoicePluginState {
    pub fn new() -> Self {
        Self {
            child: Mutex::new(None),
            #[cfg(windows)]
            job: Mutex::new(crate::win_job::KillOnCloseJob::new().ok()),
        }
    }

    fn track_child(&self, child: Child) -> Child {
        #[cfg(windows)]
        if let Ok(job_guard) = self.job.lock() {
            if let Some(job) = job_guard.as_ref() {
                if let Err(err) = job.assign_child(&child) {
                    eprintln!("[voice-plugin] child job assign failed: {err}");
                }
            }
        }
        child
    }

    fn owned_child_running(&self) -> bool {
        self.child
            .lock()
            .ok()
            .and_then(|mut guard| guard.as_mut().map(|child| child_still_running(child)))
            .unwrap_or(false)
    }

    pub fn shutdown(&self) {
        if let Ok(mut guard) = self.child.lock() {
            if let Some(mut child) = guard.take() {
                crate::kill_child_tree(&mut child);
            }
        }
    }
}

const DEFAULT_RUNTIME_EXE: &str = "runtime/quicker-voice-runtime.exe";
const DEFAULT_VOICE_WS_HOST: &str = "127.0.0.1";
const DEFAULT_VOICE_WS_PORT: u16 = 6016;
const VOICE_RUNTIME_READY_WAIT_MS: u64 = 45_000;

use crate::quicker_agent_paths::voice_plugin_root;
use crate::voice_plugin_install::VoiceInstallProgressEvent;

fn emit_voice_install_progress(app: &AppHandle, phase: &str, percent: u8, message: &str) {
    let _ = app.emit(
        "voice-plugin-install-progress",
        VoiceInstallProgressEvent {
            phase: phase.into(),
            percent,
            message: message.into(),
        },
    );
}

/// Stop voice runtime, swap staged files into live runtime/, then optionally restart.
fn try_apply_staged_runtime_upgrade(app: &AppHandle, restart_if_was_active: bool) {
    let root = voice_plugin_root();
    if !crate::voice_plugin_install::has_staged_runtime_update(&root) {
        return;
    }

    emit_voice_install_progress(app, "apply", 96, "正在应用语音服务更新…");

    let port = voice_ws_port();
    let state = app.state::<VoicePluginState>();
    let inner = state.inner();
    inner.shutdown();
    if voice_runtime_ready(port) {
        reclaim_voice_port(port);
    }
    thread::sleep(Duration::from_millis(450));

    match crate::voice_plugin_install::apply_pending_runtime_upgrade() {
        Ok(()) => {
            emit_voice_install_progress(app, "done", 100, "语音服务已更新");
            if restart_if_was_active {
                let _ = start_runtime_inner(inner);
            }
        }
        Err(err) => {
            eprintln!("[voice-plugin] apply staged runtime upgrade failed: {err}");
            emit_voice_install_progress(
                app,
                "error",
                0,
                "语音服务更新暂未应用，将在下次启动时重试",
            );
            if restart_if_was_active {
                let _ = start_runtime_inner(inner);
            }
        }
    }
}

fn voice_runtime_was_active(state: &VoicePluginState) -> bool {
    let port = voice_ws_port();
    state.owned_child_running() || voice_runtime_ready(port)
}

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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VoicePluginSettingsDto {
    pub auto_start: bool,
    pub model_id: String,
    pub gpu_acceleration: bool,
    pub language: String,
    pub silent_stop_seconds: u32,
    pub streaming_preview: bool,
    pub max_recording_seconds: u32,
    pub ws_port: u16,
}

const DEFAULT_VOICE_SETTINGS_JSON: &str = r#"{"autoStart":true,"modelId":"standard","gpuAcceleration":false,"language":"zh-CN","silentStopSeconds":0,"streamingPreview":false,"maxRecordingSeconds":120,"wsPort":6016}"#;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VoiceRuntimeHealthDto {
    pub ok: bool,
    pub protocol_version: u32,
    pub runtime_version: Option<String>,
    pub model_id: Option<String>,
    pub model_loaded: bool,
    pub ready: bool,
    pub execution_provider: Option<String>,
}

fn fetch_voice_runtime_health(port: u16) -> VoiceRuntimeHealthDto {
    let url = voice_health_url(port);
    let Ok(client) = reqwest::blocking::Client::builder()
        .connect_timeout(Duration::from_secs(1))
        .timeout(Duration::from_secs(3))
        .build()
    else {
        return empty_voice_runtime_health();
    };
    let Ok(resp) = client.get(&url).send() else {
        return empty_voice_runtime_health();
    };
    if !resp.status().is_success() {
        return empty_voice_runtime_health();
    }
    let Ok(body) = resp.json::<serde_json::Value>() else {
        return empty_voice_runtime_health();
    };
    VoiceRuntimeHealthDto {
        ok: body.get("ok").and_then(|v| v.as_bool()) == Some(true),
        protocol_version: body
            .get("protocolVersion")
            .and_then(|v| v.as_u64())
            .unwrap_or(1) as u32,
        runtime_version: body
            .get("runtimeVersion")
            .and_then(|v| v.as_str())
            .map(str::to_string),
        model_id: body
            .get("modelId")
            .and_then(|v| v.as_str())
            .map(str::to_string),
        model_loaded: body.get("modelLoaded").and_then(|v| v.as_bool()) == Some(true),
        ready: body.get("ready").and_then(|v| v.as_bool()) == Some(true),
        execution_provider: body
            .get("executionProvider")
            .and_then(|v| v.as_str())
            .map(str::to_string),
    }
}

fn empty_voice_runtime_health() -> VoiceRuntimeHealthDto {
    VoiceRuntimeHealthDto {
        ok: false,
        protocol_version: 1,
        runtime_version: None,
        model_id: None,
        model_loaded: false,
        ready: false,
        execution_provider: None,
    }
}

fn voice_runtime_model_ready(health: &VoiceRuntimeHealthDto) -> bool {
    if !health.ok || !health.ready || !health.model_loaded {
        return false;
    }
    match health.model_id.as_deref() {
        Some(id) if !id.eq_ignore_ascii_case("stub") && !id.trim().is_empty() => true,
        _ => false,
    }
}

fn voice_runtime_ready(port: u16) -> bool {
    voice_runtime_model_ready(&fetch_voice_runtime_health(port))
}

#[tauri::command]
pub fn voice_runtime_health() -> VoiceRuntimeHealthDto {
    fetch_voice_runtime_health(voice_ws_port())
}

fn voice_settings_path() -> PathBuf {
    voice_plugin_root().join("settings.json")
}

fn default_voice_settings() -> VoicePluginSettingsDto {
    serde_json::from_str(DEFAULT_VOICE_SETTINGS_JSON)
        .unwrap_or(VoicePluginSettingsDto {
            auto_start: true,
            model_id: "standard".into(),
            gpu_acceleration: false,
            language: "zh-CN".into(),
            silent_stop_seconds: 0,
            streaming_preview: false,
            max_recording_seconds: 120,
            ws_port: DEFAULT_VOICE_WS_PORT,
        })
}

pub fn read_voice_settings() -> VoicePluginSettingsDto {
    let path = voice_settings_path();
    if !path.is_file() {
        return default_voice_settings();
    }
    let Ok(raw) = std::fs::read_to_string(&path) else {
        return default_voice_settings();
    };
    let Ok(mut value) = serde_json::from_str::<serde_json::Value>(&raw) else {
        return default_voice_settings();
    };
    if value.get("gpuAcceleration").is_none() {
        value["gpuAcceleration"] = serde_json::Value::Bool(false);
    }
    serde_json::from_value(value).unwrap_or_else(|_| default_voice_settings())
}

fn write_voice_settings_file(settings: &VoicePluginSettingsDto) -> Result<(), String> {
    let path = voice_settings_path();
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("无法创建语音设置目录：{e}"))?;
    }
    let raw = serde_json::to_string_pretty(settings)
        .map_err(|e| format!("序列化语音设置失败：{e}"))?;
    std::fs::write(&path, format!("{raw}\n"))
        .map_err(|e| format!("写入语音设置失败：{e}"))
}

fn model_subdir_for_id(model_id: &str) -> &'static str {
    match model_id.trim().to_ascii_lowercase().as_str() {
        "lightweight" | "paraformer" | "paraformer-zh" => "paraformer-zh",
        _ => "sensevoice",
    }
}

fn model_type_for_id(model_id: &str) -> &'static str {
    match model_id.trim().to_ascii_lowercase().as_str() {
        "lightweight" | "paraformer" | "paraformer-zh" => "paraformer",
        _ => "sensevoice",
    }
}

fn paraformer_ready_at_dir(dir: &Path) -> bool {
    let onnx = if dir.join("model.int8.onnx").is_file() {
        dir.join("model.int8.onnx")
    } else if dir.join("model.onnx").is_file() {
        dir.join("model.onnx")
    } else {
        return false;
    };
    dir.join("tokens.txt").is_file()
        && dir.join("tokens.txt").metadata().map(|m| m.len() >= 64).unwrap_or(false)
        && onnx
            .metadata()
            .map(|meta| meta.len() >= 20 * 1024 * 1024)
            .unwrap_or(false)
}

fn model_ready_at_dir(dir: &Path) -> bool {
    let name = dir
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("");
    if name == "paraformer-zh" {
        return paraformer_ready_at_dir(dir);
    }
    crate::voice_plugin_install::is_sensevoice_model_ready(dir)
}

fn resolve_voice_model_dir(root: &Path) -> Option<PathBuf> {
    let settings = read_voice_settings();
    let preferred = root
        .join("models")
        .join(model_subdir_for_id(&settings.model_id));
    if model_ready_at_dir(&preferred) {
        return Some(preferred);
    }
    let sensevoice = root.join("models").join("sensevoice");
    if model_ready_at_dir(&sensevoice) {
        return Some(sensevoice);
    }
    let paraformer = root.join("models").join("paraformer-zh");
    if model_ready_at_dir(&paraformer) {
        return Some(paraformer);
    }
    None
}

fn resolve_voice_execution_provider(gpu_acceleration: bool) -> &'static str {
    if !gpu_acceleration {
        return "cpu";
    }
    #[cfg(windows)]
    {
        "directml"
    }
    #[cfg(target_os = "macos")]
    {
        "coreml"
    }
    #[cfg(all(not(windows), not(target_os = "macos")))]
    {
        "cuda"
    }
}

fn apply_voice_runtime_env(cmd: &mut Command, root: &Path) {
    let settings = read_voice_settings();
    if let Some(model_dir) = resolve_voice_model_dir(root) {
        cmd.env("QUICKER_VOICE_MODEL_DIR", &model_dir);
        cmd.env(
            "QUICKER_VOICE_MODEL_TYPE",
            model_type_for_id(&settings.model_id),
        );
        cmd.env("QUICKER_VOICE_AUTO_DOWNLOAD_MODEL", "0");
    }
    cmd.env(
        "QUICKER_VOICE_PROVIDER",
        resolve_voice_execution_provider(settings.gpu_acceleration),
    );
    cmd.env("QUICKER_VOICE_NUM_THREADS", "4");
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
    let child = state.track_child(child);
    if let Ok(mut guard) = state.child.lock() {
        *guard = Some(child);
    }
}

/// Stop any process listening on the voice port (orphans from prior sessions).
fn reclaim_voice_port(port: u16) {
    kill_listener_on_port(port);
}

fn spawn_installed_runtime_ws(root: &Path, exe_rel: &str, port: u16) -> Result<Child, String> {
    let exe = root.join(exe_rel);
    if !exe.is_file() {
        return Err(format!("Runtime 不存在：{}", exe.display()));
    }

    let mut cmd = Command::new(&exe);
    cmd.args(["--host", DEFAULT_VOICE_WS_HOST, "--port", &port.to_string()])
        .current_dir(root);
    apply_voice_runtime_env(&mut cmd, root);
    cmd.env("QUICKER_VOICE_HOST", DEFAULT_VOICE_WS_HOST);
    cmd.env("QUICKER_VOICE_PORT", port.to_string());
    configure_hidden_child(&mut cmd);
    cmd.spawn().map_err(|e| format!("启动 Runtime 失败：{e}"))
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
    apply_voice_runtime_env(&mut uv_cmd, dev_dir);
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
        apply_voice_runtime_env(&mut py_cmd, dev_dir);
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
    resolve_voice_model_dir(root).is_some()
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
            message: Some("开发模式：仓库 voice-asr-runtime 可用，可启动 Runtime（需 uv）".into()),
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
            "未安装。点击下方「安装」，将自动下载并配置语音服务与识别模型（约 240 MB，仅需一次）。"
                .into()
        }),
    }
}

pub fn build_voice_plugin_status(state: &VoicePluginState) -> VoicePluginStatusDto {
    build_status(state)
}

/// Install / update / start voice runtime when activation event fires (e.g. first mic use).
pub fn activate_voice_on_demand(
    app: &AppHandle,
    state: &VoicePluginState,
) -> Result<(), String> {
    let _ = crate::voice_plugin_install::refresh_voice_channel_cache()?;
    let root = voice_plugin_root();
    if !crate::voice_plugin_install::is_voice_asr_installed(&root) {
        crate::voice_plugin_install::run_voice_plugin_install(app)?;
    }
    if crate::voice_plugin_install::needs_runtime_update(&root) {
        crate::voice_plugin_install::stage_runtime_upgrade(app)?;
    }
    let was_active = voice_runtime_was_active(state);
    try_apply_staged_runtime_upgrade(app, was_active);
    let _ = start_runtime_inner(state);
    Ok(())
}

/// Download staged runtime update and apply when newer channel version is available.
pub fn apply_voice_runtime_update(
    app: &AppHandle,
    state: &VoicePluginState,
) -> Result<(), String> {
    let _ = crate::voice_plugin_install::refresh_voice_channel_cache()?;
    let root = voice_plugin_root();
    if !crate::voice_plugin_install::is_voice_asr_installed(&root) {
        return Err("语音插件尚未安装".into());
    }

    if crate::voice_plugin_install::needs_runtime_update(&root) {
        crate::voice_plugin_install::stage_runtime_upgrade(app)?;
    }

    if crate::voice_plugin_install::has_staged_runtime_update(&root) {
        let was_active = voice_runtime_was_active(state);
        try_apply_staged_runtime_upgrade(app, was_active);
    }

    Ok(())
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

    if let Some(dto) = ws_status_from_child(state, fully_installed, plugin_dir.clone(), port) {
        if dto.running || dto.status == "starting" {
            return dto;
        }
    }

    if state.owned_child_running() {
        return build_status(state);
    }

    if fully_installed && !model_ready_at(&root) {
        return VoicePluginStatusDto {
            status: "error".into(),
            installed: true,
            running: false,
            ws_port: 0,
            plugin_dir,
            message: Some(
                "语音模型文件不完整或已损坏，请在设置中重新下载模型。".into(),
            ),
        };
    }

    reclaim_voice_port(port);

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
    let state = app.state::<VoicePluginState>();
    let inner = state.inner();
    reconcile_child(inner);

    let port = voice_ws_port();
    if inner.owned_child_running() {
        return;
    }

    let status = build_status(inner);
    if status.running || status.status == "starting" {
        return;
    }
    if status.status == "not_installed" || status.status == "downloading" {
        return;
    }

    // Reclaim orphaned voice-asr on the port and spawn an owned child.
    if voice_runtime_ready(port) {
        reclaim_voice_port(port);
    }

    let _ = start_runtime_inner(inner);
}

fn run_background_voice_tasks(app: &AppHandle) {
    let events = crate::plugin_runtime::activation::events_for("voice-asr");
    if crate::plugin_runtime::activation::should_refresh_channel_on_startup(&events) {
        let _ = crate::voice_plugin_install::refresh_voice_channel_cache();
    }

    if cfg!(debug_assertions) {
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
        if crate::plugin_runtime::activation::should_run_startup_runtime(&events)
            || read_voice_auto_start()
        {
            ensure_voice_runtime(app);
        }
        return;
    }

    if !crate::plugin_runtime::activation::should_run_startup_runtime(&events)
        && !read_voice_auto_start()
    {
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

    let state = app.state::<VoicePluginState>();
    let was_active = voice_runtime_was_active(state.inner());

    if crate::voice_plugin_install::needs_runtime_update(&root) {
        if let Err(err) = crate::voice_plugin_install::stage_runtime_upgrade(app) {
            eprintln!("[voice-plugin] runtime upgrade staging failed: {err}");
        }
    }

    try_apply_staged_runtime_upgrade(app, was_active);

    if !was_active {
        ensure_voice_runtime(app);
    }
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
pub fn voice_plugin_read_settings() -> VoicePluginSettingsDto {
    read_voice_settings()
}

#[tauri::command]
pub fn voice_plugin_write_settings(
    app: AppHandle,
    state: State<'_, VoicePluginState>,
    settings: VoicePluginSettingsDto,
) -> Result<VoicePluginSettingsDto, String> {
    write_voice_settings_file(&settings)?;
    let was_running = build_status(state.inner()).running;
    if was_running {
        state.inner().shutdown();
        reclaim_voice_port(voice_ws_port());
        let _ = start_runtime_inner(state.inner());
    }
    let _ = app;
    Ok(settings)
}

#[tauri::command]
pub fn voice_plugin_redownload_model(
    app: AppHandle,
    model_id: Option<String>,
    force: Option<bool>,
) -> Result<(), String> {
    let id = model_id.unwrap_or_else(|| "standard".into());
    crate::voice_plugin_install::redownload_voice_model(&app, &id, force.unwrap_or(true))
}

#[tauri::command]
pub fn voice_plugin_model_install_state() -> crate::voice_plugin_install::VoiceModelInstallStateDto {
    crate::voice_plugin_install::voice_model_install_state(&voice_plugin_root())
}

#[tauri::command]
pub fn voice_plugin_stop_runtime(state: State<'_, VoicePluginState>) -> VoicePluginStatusDto {
    state.inner().shutdown();
    reclaim_voice_port(voice_ws_port());
    let mut dto = build_status(&state);
    if dto.status == "running" || dto.status == "starting" {
        dto.status = "stopped".into();
        dto.running = false;
        dto.message = Some("已停止语音 Runtime".into());
    }
    dto
}
