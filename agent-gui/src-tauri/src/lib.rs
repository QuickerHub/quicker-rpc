use std::io::{Read, Write};
use std::net::TcpListener;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(target_os = "macos")]
use tauri::TitleBarStyle;
use tauri::{AppHandle, Manager, RunEvent, WebviewWindow};
use tauri_plugin_dialog::{DialogExt, MessageDialogKind};

mod global_shortcut;
mod launcher;
mod quicker_agent_paths;
mod tray;
mod voice_plugin;
mod voice_plugin_install;
mod win_job;

static STARTUP_CANCELLED: AtomicBool = AtomicBool::new(false);

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

struct BackendState {
    qkrpc: Mutex<Option<Child>>,
    node: Mutex<Option<Child>>,
    #[cfg(windows)]
    job: Mutex<Option<win_job::KillOnCloseJob>>,
}

impl BackendState {
    fn new() -> Self {
        Self {
            qkrpc: Mutex::new(None),
            node: Mutex::new(None),
            #[cfg(windows)]
            job: Mutex::new(win_job::KillOnCloseJob::new().ok()),
        }
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

    fn shutdown(&self) {
        if let Ok(mut guard) = self.qkrpc.lock() {
            if let Some(mut child) = guard.take() {
                Self::kill_child_tree(&mut child);
            }
        }
        if let Ok(mut guard) = self.node.lock() {
            if let Some(mut child) = guard.take() {
                Self::kill_child_tree(&mut child);
            }
        }
    }

    fn track_child(&self, child: Child) -> Result<Child, String> {
        #[cfg(windows)]
        if let Ok(job_guard) = self.job.lock() {
            if let Some(job) = job_guard.as_ref() {
                if let Err(err) = job.assign_child(&child) {
                    eprintln!("child job assign failed: {err}");
                }
            }
        }
        Ok(child)
    }
}

fn find_port(host: &str, start: u16) -> Result<u16, String> {
    for port in start..start.saturating_add(200) {
        if TcpListener::bind((host, port)).is_ok() {
            return Ok(port);
        }
    }
    Err(format!("no free port from {start} on {host}"))
}

/// Reuse an existing qkrpc serve when /health already responds on the default port.
fn resolve_qkrpc_port(host: &str) -> Result<(u16, bool), String> {
    const DEFAULT_PORT: u16 = 9477;
    if wait_qkrpc_serve_listening(host, DEFAULT_PORT, 2_000).is_ok() {
        return Ok((DEFAULT_PORT, false));
    }
    let port = find_port(host, DEFAULT_PORT)?;
    Ok((port, true))
}

/// UI server: any HTTP 200 on `/`.
fn wait_http_200(host: &str, port: u16, path: &str, max_ms: u64) -> Result<(), String> {
    wait_http_response(host, port, path, max_ms, HttpReadyMode::Status200)
}

/// qkrpc serve: process is up when `/health` returns JSON with `"ok":` (true or false).
/// Do not require Quicker/plugin — otherwise the app never opens on a fresh machine.
fn wait_qkrpc_serve_listening(host: &str, port: u16, max_ms: u64) -> Result<(), String> {
    wait_http_response(
        host,
        port,
        "/health",
        max_ms,
        HttpReadyMode::QkrpcHealthJson,
    )
}

#[derive(Clone, Copy)]
enum HttpReadyMode {
    Status200,
    QkrpcHealthJson,
}

fn http_response_matches(mode: HttpReadyMode, response: &str) -> bool {
    match mode {
        HttpReadyMode::Status200 => {
            response.contains("HTTP/1.1 200") || response.contains("HTTP/1.0 200")
        }
        HttpReadyMode::QkrpcHealthJson => {
            let has_json_ok = response.contains("\"ok\":true") || response.contains("\"ok\":false");
            if !has_json_ok {
                return false;
            }
            response.contains("HTTP/1.1 200")
                || response.contains("HTTP/1.0 200")
                || response.contains("HTTP/1.1 503")
                || response.contains("HTTP/1.0 503")
        }
    }
}

fn wait_http_response(
    host: &str,
    port: u16,
    path: &str,
    max_ms: u64,
    mode: HttpReadyMode,
) -> Result<(), String> {
    let deadline = Instant::now() + Duration::from_millis(max_ms);
    let request = format!("GET {path} HTTP/1.1\r\nHost: {host}\r\nConnection: close\r\n\r\n");

    while Instant::now() < deadline {
        if let Ok(mut stream) = std::net::TcpStream::connect((host, port)) {
            let _ = stream.set_read_timeout(Some(Duration::from_secs(2)));
            let _ = stream.set_write_timeout(Some(Duration::from_secs(2)));
            if stream.write_all(request.as_bytes()).is_ok() {
                let mut buf = vec![0u8; 2048];
                if let Ok(n) = stream.read(&mut buf) {
                    let text = String::from_utf8_lossy(&buf[..n]);
                    if http_response_matches(mode, &text) {
                        return Ok(());
                    }
                }
            }
        }
        std::thread::sleep(Duration::from_millis(300));
    }
    Err(format!("timeout waiting for http://{host}:{port}{path}"))
}

fn resource_root(app: &AppHandle) -> Result<PathBuf, String> {
    let base = app.path().resource_dir().map_err(|e| e.to_string())?;
    let nested = base.join("resources");
    if nested.join("app").join("server.js").is_file() {
        return Ok(nested);
    }
    if base.join("app").join("server.js").is_file() {
        return Ok(base);
    }
    Err(format!(
        "runtime bundle not found (expected app/server.js under {} or {})",
        nested.display(),
        base.display()
    ))
}

fn app_runtime_dir(resource: &Path) -> PathBuf {
    resource.join("app")
}

fn bundled_qkrpc_healthy(dir: &Path) -> bool {
    let kestrel = dir.join("Microsoft.AspNetCore.Server.Kestrel.Core.dll");
    kestrel.is_file()
        && std::fs::metadata(&kestrel)
            .map(|m| m.len() > 100_000)
            .unwrap_or(false)
}

fn resolve_qkrpc_dir(resource: &Path) -> PathBuf {
    let bundled = resource.join("qkrpc");
    if bundled_qkrpc_healthy(&bundled) {
        return bundled;
    }

    #[cfg(windows)]
    if let Ok(local) = std::env::var("LOCALAPPDATA") {
        let fallback = PathBuf::from(local).join("Programs").join("qkrpc");
        if bundled_qkrpc_healthy(&fallback) {
            eprintln!(
                "bundled qkrpc corrupt; using fallback {}",
                fallback.display()
            );
            return fallback;
        }
    }

    bundled
}

fn configure_hidden_child(cmd: &mut Command) {
    cmd.stdout(Stdio::null()).stderr(Stdio::null());
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);
}

fn spawn_qkrpc(qkrpc_dir: &Path, host: &str, port: u16) -> Result<Child, String> {
    let exe = qkrpc_dir.join(if cfg!(windows) { "qkrpc.exe" } else { "qkrpc" });
    if !exe.is_file() {
        return Err(format!("qkrpc.exe not found: {}", exe.display()));
    }

    let mut cmd = Command::new(&exe);
    cmd.args([
        "serve",
        "--host",
        host,
        "--port",
        &port.to_string(),
        "--no-bootstrap",
    ])
    .current_dir(qkrpc_dir);
    configure_hidden_child(&mut cmd);
    cmd.spawn().map_err(|e| format!("spawn qkrpc: {e}"))
}

fn spawn_node_server(
    app_dir: &Path,
    node_exe: &Path,
    host: &str,
    port: u16,
) -> Result<Child, String> {
    let server_js = app_dir.join("server.js");
    if !server_js.is_file() {
        return Err(format!("server.js not found: {}", server_js.display()));
    }

    let mut cmd = Command::new(node_exe);
    cmd.arg(&server_js)
        .current_dir(app_dir)
        .env("HOSTNAME", host)
        .env("PORT", port.to_string())
        .env("AGENT_GUI_BUNDLED", "1");

    if let Ok(url) = std::env::var("QKRPC_HTTP_URL") {
        cmd.env("QKRPC_HTTP_URL", url);
    }
    if let Ok(mode) = std::env::var("QKRPC_TRANSPORT") {
        cmd.env("QKRPC_TRANSPORT", mode);
    }
    if let Ok(bin) = std::env::var("QKRPC_BIN") {
        cmd.env("QKRPC_BIN", bin);
    }

    configure_hidden_child(&mut cmd);
    cmd.spawn().map_err(|e| format!("spawn node server: {e}"))
}

fn apply_titlebar_chrome_existing(window: &WebviewWindow) {
    #[cfg(target_os = "macos")]
    {
        let _ = window.set_decorations(true);
        let _ = window.set_title_bar_style(TitleBarStyle::Overlay);
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = window.set_decorations(false);
    }
}

#[derive(Clone)]
struct ProductionRuntimeConfig {
    host: String,
    runtime: PathBuf,
    node_exe: PathBuf,
    qkrpc_dir: PathBuf,
    qkrpc_port: u16,
    should_spawn_qkrpc: bool,
    ui_port: u16,
    ui_url: String,
}

fn prepare_production_runtime(app: &AppHandle) -> Result<ProductionRuntimeConfig, String> {
    let host = "127.0.0.1".to_string();
    let resource = resource_root(app)?;
    let runtime = app_runtime_dir(&resource);
    let node_exe = resource
        .join("node")
        .join(if cfg!(windows) { "node.exe" } else { "node" });

    if !node_exe.is_file() {
        return Err(format!("bundled node not found: {}", node_exe.display()));
    }
    if !runtime.join("server.js").is_file() {
        return Err(format!(
            "app runtime missing server.js under {}",
            runtime.display()
        ));
    }

    let (qkrpc_port, should_spawn_qkrpc) = resolve_qkrpc_port(&host)?;
    let ui_port = find_port(&host, 3000)?;

    let qkrpc_url = format!("http://{host}:{qkrpc_port}");
    std::env::set_var("QKRPC_HTTP_URL", &qkrpc_url);
    std::env::set_var("QKRPC_TRANSPORT", "http");
    let qkrpc_dir = resolve_qkrpc_dir(&resource);
    let qkrpc_exe = qkrpc_dir.join(if cfg!(windows) { "qkrpc.exe" } else { "qkrpc" });
    std::env::set_var("QKRPC_BIN", &qkrpc_exe);

    Ok(ProductionRuntimeConfig {
        host,
        runtime,
        node_exe,
        qkrpc_dir,
        qkrpc_port,
        should_spawn_qkrpc,
        ui_port,
        ui_url: format!("http://127.0.0.1:{ui_port}"),
    })
}

fn emit_startup_status(app: &AppHandle, message: &str) {
    if STARTUP_CANCELLED.load(Ordering::SeqCst) {
        return;
    }
    let Some(win) = app.get_webview_window("main") else {
        return;
    };
    if let Ok(json) = serde_json::to_string(message) {
        let script = format!(
            "var m=document.querySelector('.startup-message');if(m)m.textContent={json};"
        );
        let _ = win.eval(&script);
    }
}

fn spawn_qkrpc_background(app: AppHandle, config: ProductionRuntimeConfig) {
    if !config.should_spawn_qkrpc {
        return;
    }

    std::thread::spawn(move || {
        emit_startup_status(&app, "正在启动 qkrpc 服务…");

        if !bundled_qkrpc_healthy(&config.qkrpc_dir) {
            eprintln!(
                "[qkrpc] bundled runtime corrupt (missing Kestrel). \
                 Run: pwsh agent-gui/scripts/Repair-QuickerAgentResources.ps1\npath: {}",
                config.qkrpc_dir.display()
            );
            return;
        }

        let host = config.host.clone();
        let qkrpc_dir = config.qkrpc_dir.clone();
        let port = config.qkrpc_port;
        let result = (|| -> Result<Child, String> {
            let child = spawn_qkrpc(&qkrpc_dir, &host, port)?;
            wait_qkrpc_serve_listening(&host, port, 45_000)?;
            Ok(child)
        })();

        if STARTUP_CANCELLED.load(Ordering::SeqCst) {
            if let Ok(mut child) = result {
                BackendState::kill_child_tree(&mut child);
            }
            return;
        }

        match result {
            Ok(child) => {
                let state = app.state::<BackendState>();
                match state.track_child(child) {
                    Ok(tracked) => {
                        if let Ok(mut guard) = state.qkrpc.lock() {
                            *guard = Some(tracked);
                        }
                    }
                    Err(err) => eprintln!("[qkrpc] track child failed: {err}"),
                }
            }
            Err(err) => eprintln!("[qkrpc] background start failed: {err}"),
        }
    });
}

fn spawn_node_background(app: AppHandle, config: ProductionRuntimeConfig) {
    let ui_url = config.ui_url.clone();
    std::thread::spawn(move || {
        emit_startup_status(&app, "正在启动界面服务…");

        let host = config.host.clone();
        let runtime = config.runtime.clone();
        let node_exe = config.node_exe.clone();
        let ui_port = config.ui_port;

        let result = (|| -> Result<Child, String> {
            let child = spawn_node_server(&runtime, &node_exe, &host, ui_port)?;
            wait_http_200(&host, ui_port, "/", 60_000)?;
            Ok(child)
        })();

        if STARTUP_CANCELLED.load(Ordering::SeqCst) {
            if let Ok(mut child) = result {
                BackendState::kill_child_tree(&mut child);
            }
            return;
        }

        match result {
            Ok(child) => {
                let state = app.state::<BackendState>();
                match state.track_child(child) {
                    Ok(tracked) => {
                        if let Ok(mut guard) = state.node.lock() {
                            *guard = Some(tracked);
                        }
                    }
                    Err(err) => {
                        let app_for_dialog = app.clone();
                        let detail = format!("node server: {err}");
                        let _ = app.run_on_main_thread(move || {
                            show_startup_error(&app_for_dialog, &detail);
                        });
                        return;
                    }
                }
                open_production_ui(&app, &ui_url);
            }
            Err(err) => {
                let app_for_dialog = app.clone();
                let detail = err.clone();
                let _ = app.run_on_main_thread(move || show_startup_error(&app_for_dialog, &detail));
            }
        }
    });
}

fn open_production_ui(app: &AppHandle, ui_url: &str) {
    if STARTUP_CANCELLED.load(Ordering::SeqCst) {
        return;
    }

    app.manage(launcher::UiBaseUrl(Mutex::new(ui_url.to_string())));

    let app_for_ui = app.clone();
    let ui_url = ui_url.to_string();
    if let Err(err) = app.run_on_main_thread(move || {
        if STARTUP_CANCELLED.load(Ordering::SeqCst) {
            return;
        }

        let Some(win) = app_for_ui.get_webview_window("main") else {
            show_startup_error(&app_for_ui, "main window missing");
            app_for_ui.exit(1);
            return;
        };

        let external: url::Url = match ui_url.parse() {
            Ok(parsed) => parsed,
            Err(err) => {
                show_startup_error(&app_for_ui, &format!("invalid UI url: {err}"));
                app_for_ui.exit(1);
                return;
            }
        };

        if let Err(err) = win.navigate(external) {
            show_startup_error(&app_for_ui, &format!("failed to load UI: {err}"));
            app_for_ui.exit(1);
        }
    }) {
        eprintln!("open production UI callback failed: {err}");
    }
}

fn spawn_production_startup(app: AppHandle) {
    std::thread::spawn(move || {
        emit_startup_status(&app, "正在初始化…");

        let config = match prepare_production_runtime(&app) {
            Ok(config) => config,
            Err(err) => {
                let app_for_dialog = app.clone();
                let detail = err.clone();
                let _ = app.run_on_main_thread(move || show_startup_error(&app_for_dialog, &detail));
                return;
            }
        };

        if STARTUP_CANCELLED.load(Ordering::SeqCst) {
            return;
        }

        emit_startup_status(&app, "正在启动语音服务…");
        voice_plugin::spawn_voice_runtime_background(app.clone());

        spawn_qkrpc_background(app.clone(), config.clone());
        spawn_node_background(app, config);
    });
}

fn register_startup_window_handlers(window: &WebviewWindow, app: &AppHandle) {
    let app_handle = app.clone();
    window.on_window_event(move |event| {
        if matches!(event, tauri::WindowEvent::CloseRequested { .. }) {
            STARTUP_CANCELLED.store(true, Ordering::SeqCst);
            app_handle.exit(0);
        }
    });
}

fn show_startup_error(app: &AppHandle, detail: &str) {
    let message = format!(
        "QuickerAgent 无法完成启动。\r\n\r\n{detail}\r\n\r\n\
         请确认已安装本程序自带运行时；若未运行 Quicker，可先启动 Quicker 并加载 QuickerRpc 插件后再试。"
    );
    app.dialog()
        .message(message)
        .title("QuickerAgent 启动失败")
        .kind(MessageDialogKind::Error)
        .blocking_show();
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            launcher::launcher_show,
            launcher::launcher_hide,
            launcher::launcher_toggle,
            launcher::launcher_expand,
            voice_plugin::voice_plugin_status,
            voice_plugin::voice_runtime_health,
            voice_plugin::voice_plugin_install,
            voice_plugin::voice_plugin_start_runtime,
            voice_plugin::voice_plugin_stop_runtime,
        ])
        .manage(BackendState::new())
        .manage(voice_plugin::VoicePluginState::new())
        .setup(|app| {
            #[cfg(desktop)]
            if let Err(err) = global_shortcut::init(app.handle()) {
                eprintln!("[global-shortcut] init failed: {err}");
            }

            if cfg!(debug_assertions) {
                app.manage(launcher::UiBaseUrl(Mutex::new(
                    launcher::default_dev_ui_base_url(),
                )));
                // `tauri dev` uses devUrl + start.mjs from beforeDevCommand.
                if let Some(win) = app.get_webview_window("main") {
                    apply_titlebar_chrome_existing(&win);
                    let _ = win.center();
                    let _ = win.show();
                }
                launcher::prepare_configured_launcher_window(app.handle(), false);
                voice_plugin::spawn_voice_runtime_background(app.handle().clone());
                Ok(())
            } else {
                launcher::close_configured_launcher_window(app.handle());

                if let Some(win) = app.get_webview_window("main") {
                    apply_titlebar_chrome_existing(&win);
                    register_startup_window_handlers(&win, app.handle());
                    let _ = win.center();
                    let _ = win.show();
                }

                #[cfg(desktop)]
                if let Err(err) = tray::init(app.handle()) {
                    eprintln!("[tray] init failed: {err}");
                }

                spawn_production_startup(app.handle().clone());
                Ok(())
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            if matches!(event, RunEvent::Exit) {
                app.state::<BackendState>().inner().shutdown();
                app.state::<voice_plugin::VoicePluginState>()
                    .inner()
                    .shutdown();
                if let Err(err) = voice_plugin_install::apply_pending_runtime_upgrade() {
                    eprintln!("[voice-plugin] apply runtime upgrade failed: {err}");
                }
            }
        });
}
