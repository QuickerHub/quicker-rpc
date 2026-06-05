use serde::{Deserialize, Serialize};
use std::io::{Read, Write};
use std::net::TcpStream;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{AppHandle, State};

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
    ws: Option<VoiceManifestWs>,
    runtime: Option<VoiceManifestRuntime>,
}

#[derive(Debug, Deserialize)]
struct VoiceManifestWs {
    host: Option<String>,
    port: Option<u16>,
}

#[derive(Debug, Deserialize)]
struct VoiceManifestRuntime {
    exe: Option<String>,
}

#[derive(Debug, Deserialize)]
struct VoiceHealthResponse {
    ok: bool,
    ready: Option<bool>,
    #[serde(rename = "modelLoaded")]
    model_loaded: Option<bool>,
}

pub struct VoicePluginState {
    child: Mutex<Option<Child>>,
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

const DEFAULT_WS_HOST: &str = "127.0.0.1";
const DEFAULT_WS_PORT: u16 = 6016;
const DEFAULT_RUNTIME_EXE: &str = "runtime/quicker-voice-runtime.exe";
const HEALTH_WAIT_MS: u64 = 45_000;

fn voice_plugin_root() -> PathBuf {
    if let Ok(profile) = std::env::var("USERPROFILE") {
        return PathBuf::from(profile)
            .join("Documents")
            .join("QuickerAgent")
            .join("plugins")
            .join("voice-asr");
    }
    PathBuf::from("Documents/QuickerAgent/plugins/voice-asr")
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

fn ws_endpoint(manifest: Option<&VoiceManifest>) -> (String, u16) {
    if let Some(ws) = manifest.and_then(|m| m.ws.as_ref()) {
        let host = ws.host.clone().unwrap_or_else(|| DEFAULT_WS_HOST.to_string());
        let port = ws.port.unwrap_or(DEFAULT_WS_PORT);
        return (host, port);
    }
    (DEFAULT_WS_HOST.to_string(), DEFAULT_WS_PORT)
}

fn runtime_exe_relative(manifest: Option<&VoiceManifest>) -> String {
    manifest
        .and_then(|m| m.runtime.as_ref())
        .and_then(|r| r.exe.clone())
        .unwrap_or_else(|| DEFAULT_RUNTIME_EXE.to_string())
}

fn configure_hidden_child(cmd: &mut Command) {
    cmd.stdout(Stdio::null()).stderr(Stdio::null());
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);
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

fn fetch_voice_health(host: &str, port: u16) -> Option<VoiceHealthResponse> {
    let mut stream = TcpStream::connect((host, port)).ok()?;
    let _ = stream.set_read_timeout(Some(Duration::from_secs(2)));
    let _ = stream.set_write_timeout(Some(Duration::from_secs(2)));
    let request = format!(
        "GET /health HTTP/1.1\r\nHost: {host}\r\nConnection: close\r\nAccept: application/json\r\n\r\n"
    );
    stream.write_all(request.as_bytes()).ok()?;
    let mut buf = vec![0u8; 4096];
    let n = stream.read(&mut buf).ok()?;
    let text = String::from_utf8_lossy(&buf[..n]);
    let body = text.split("\r\n\r\n").nth(1)?;
    serde_json::from_str(body.trim()).ok()
}

fn wait_voice_ready(host: &str, port: u16, max_ms: u64) -> Result<VoiceHealthResponse, String> {
    let deadline = Instant::now() + Duration::from_millis(max_ms);
    while Instant::now() < deadline {
        if let Some(health) = fetch_voice_health(host, port) {
            if health.ok {
                return Ok(health);
            }
        }
        std::thread::sleep(Duration::from_millis(300));
    }
    Err(format!(
        "timeout waiting for http://{host}:{port}/health"
    ))
}

fn first_model_dir(root: &Path) -> Option<PathBuf> {
    let models = root.join("models");
    if !models.is_dir() {
        return None;
    }
    let mut dirs: Vec<PathBuf> = std::fs::read_dir(&models)
        .ok()?
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .filter(|p| p.is_dir())
        .collect();
    dirs.sort();
    dirs.into_iter().next()
}

fn spawn_installed_runtime(
    root: &Path,
    exe_rel: &str,
    host: &str,
    port: u16,
) -> Result<Child, String> {
    let exe = root.join(exe_rel);
    if !exe.is_file() {
        return Err(format!("Runtime 不存在：{}", exe.display()));
    }

    let mut cmd = Command::new(&exe);
    cmd.args(["--host", host, "--port", &port.to_string()])
        .current_dir(root);
    if let Some(model_dir) = first_model_dir(root) {
        cmd.env("QUICKER_VOICE_MODEL_DIR", &model_dir);
        cmd.env("QUICKER_VOICE_AUTO_DOWNLOAD_MODEL", "0");
    }
    configure_hidden_child(&mut cmd);
    cmd.spawn()
        .map_err(|e| format!("启动 Runtime 失败：{e}"))
}

fn spawn_dev_runtime(dev_dir: &Path, host: &str, port: u16) -> Result<Child, String> {
    let dir = dev_dir.to_string_lossy();
    let mut uv_cmd = Command::new("uv");
    uv_cmd
        .args([
            "run",
            "--directory",
            dir.as_ref(),
            "quicker-voice-runtime",
            "--host",
            host,
            "--port",
            &port.to_string(),
        ])
        .current_dir(dev_dir);
    configure_hidden_child(&mut uv_cmd);
    if let Ok(child) = uv_cmd.spawn() {
        return Ok(child);
    }

    Err(
        "开发 Runtime 启动失败：请安装 uv 并在仓库 voice-asr-runtime 目录执行 uv sync"
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

fn model_ready_at(root: &Path) -> bool {
    let dir = root.join("models").join("sensevoice");
    dir.join("tokens.txt").is_file()
        && (dir.join("model.int8.onnx").is_file() || dir.join("model.onnx").is_file())
}

fn build_status(state: &VoicePluginState) -> VoicePluginStatusDto {
    reconcile_child(state);

    let root = voice_plugin_root();
    let manifest_path = root.join("manifest.json");
    let manifest = read_manifest(&root);
    let (host, port) = ws_endpoint(manifest.as_ref());
    let exe_rel = runtime_exe_relative(manifest.as_ref());
    let runtime_exe = root.join(&exe_rel);
    let installed_manifest = manifest_path.is_file();
    let installed_exe = runtime_exe.is_file();
    let installed_model = model_ready_at(&root);
    let dev_dir = dev_runtime_dir();
    let installed =
        (installed_manifest && installed_exe && installed_model) || dev_dir.is_some();

    if let Some(health) = fetch_voice_health(&host, port) {
        if health.ok {
            let ready = health.ready.unwrap_or(false);
            return VoicePluginStatusDto {
                status: if ready {
                    "running".into()
                } else {
                    "starting".into()
                },
                installed,
                running: ready,
                ws_port: port,
                plugin_dir: if installed_manifest {
                    Some(root.to_string_lossy().into_owned())
                } else {
                    dev_dir.as_ref().map(|p| p.to_string_lossy().into_owned())
                },
                message: if ready {
                    None
                } else if health.model_loaded.unwrap_or(false) {
                    Some("模型已加载，服务初始化中…".into())
                } else {
                    Some("Runtime 已响应，等待就绪…".into())
                },
            };
        }
    }

    let child_running = state
        .child
        .lock()
        .ok()
        .and_then(|g| g.as_ref().map(|c| c.id()))
        .is_some();
    if child_running {
        return VoicePluginStatusDto {
            status: "starting".into(),
            installed,
            running: false,
            ws_port: port,
            plugin_dir: if installed_manifest {
                Some(root.to_string_lossy().into_owned())
            } else {
                dev_dir.as_ref().map(|p| p.to_string_lossy().into_owned())
            },
            message: Some("Runtime 启动中…".into()),
        };
    }

    if installed_manifest && installed_exe && !installed_model {
        return VoicePluginStatusDto {
            status: "not_installed".into(),
            installed: false,
            running: false,
            ws_port: port,
            plugin_dir: Some(root.to_string_lossy().into_owned()),
            message: Some("识别模型未安装，请点击「一键安装」继续".into()),
        };
    }

    if installed_manifest && installed_exe {
        return VoicePluginStatusDto {
            status: "installed".into(),
            installed: true,
            running: false,
            ws_port: port,
            plugin_dir: Some(root.to_string_lossy().into_owned()),
            message: Some("已安装，点击「启动 Runtime」或设置页启动".into()),
        };
    }

    if let Some(dev) = dev_dir {
        return VoicePluginStatusDto {
            status: "installed".into(),
            installed: true,
            running: false,
            ws_port: port,
            plugin_dir: Some(dev.to_string_lossy().into_owned()),
            message: Some(
                "开发模式：仓库 voice-asr-runtime 可用，可启动 Runtime（需 uv）".into(),
            ),
        };
    }

    VoicePluginStatusDto {
        status: "not_installed".into(),
        installed: false,
        running: false,
        ws_port: port,
        plugin_dir: None,
        message: Some(
            "未安装。点击下方「安装」，将自动下载并配置语音服务与识别模型（约 240 MB，仅需一次）。".into(),
        ),
    }
}

#[tauri::command]
pub fn voice_plugin_status(state: State<'_, VoicePluginState>) -> VoicePluginStatusDto {
    build_status(&state)
}

#[tauri::command]
pub fn voice_plugin_start_runtime(state: State<'_, VoicePluginState>) -> VoicePluginStatusDto {
    reconcile_child(&state);

    let root = voice_plugin_root();
    let manifest = read_manifest(&root);
    let (host, port) = ws_endpoint(manifest.as_ref());

    if let Some(health) = fetch_voice_health(&host, port) {
        if health.ok && health.ready.unwrap_or(false) {
            return build_status(&state);
        }
    }

    if state
        .child
        .lock()
        .ok()
        .and_then(|g| g.as_ref().map(|c| c.id()))
        .is_some()
    {
        return build_status(&state);
    }

    let spawn_result = if root.join("manifest.json").is_file() {
        let exe_rel = runtime_exe_relative(manifest.as_ref());
        spawn_installed_runtime(&root, &exe_rel, &host, port)
    } else if let Some(dev_dir) = dev_runtime_dir() {
        spawn_dev_runtime(&dev_dir, &host, port)
    } else {
        Err("请先安装语音插件，或在开发环境保留 voice-asr-runtime 目录".into())
    };

    match spawn_result {
        Ok(child) => {
            if let Ok(mut guard) = state.child.lock() {
                *guard = Some(child);
            }
            match wait_voice_ready(&host, port, HEALTH_WAIT_MS) {
                Ok(health) => {
                    let ready = health.ready.unwrap_or(false);
                    let mut dto = build_status(&state);
                    dto.status = if ready {
                        "running".into()
                    } else {
                        "starting".into()
                    };
                    dto.running = ready;
                    dto.message = if ready {
                        None
                    } else {
                        Some("Runtime 已启动，模型加载中…".into())
                    };
                    dto
                }
                Err(err) => {
                    let mut dto = build_status(&state);
                    dto.status = "error".into();
                    dto.message = Some(err);
                    dto
                }
            }
        }
        Err(err) => VoicePluginStatusDto {
            status: "error".into(),
            installed: build_status(&state).installed,
            running: false,
            ws_port: port,
            plugin_dir: build_status(&state).plugin_dir,
            message: Some(err),
        },
    }
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
    voice_plugin_start_runtime(state)
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
