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

mod clipboard_history_plugin;
mod embedded_browser;
mod global_shortcut;
mod launcher;
mod legacy_chat_restore;
mod plugin_runtime;
mod quicker_agent_paths;
mod single_instance;
mod tray;
mod voice_plugin;
mod voice_plugin_install;
mod webview_permissions;
mod webview_profile;
pub(crate) mod win_job;

static STARTUP_CANCELLED: AtomicBool = AtomicBool::new(false);
static PRODUCTION_UI_READY: AtomicBool = AtomicBool::new(false);
static EXIT_IN_PROGRESS: AtomicBool = AtomicBool::new(false);

pub(crate) const APP_REQUEST_EXIT_EVENT: &str = "app-request-exit";
const SHUTDOWN_FORCE_EXIT_AFTER: Duration = Duration::from_secs(3);
const SHUTDOWN_KILL_TIMEOUT: Duration = Duration::from_millis(600);
const SHUTDOWN_BACKEND_DELAY: Duration = Duration::from_millis(350);
const QKRPC_SERVE_WATCHDOG_INTERVAL: Duration = Duration::from_millis(2_500);
const QKRPC_SERVE_RESPAWN_COOLDOWN: Duration = Duration::from_secs(8);

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// Kill a child process tree with a bounded wait so shutdown cannot hang forever.
pub(crate) fn kill_child_tree(child: &mut Child) {
    #[cfg(windows)]
    {
        let pid = child.id();
        match Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .creation_flags(CREATE_NO_WINDOW)
            .spawn()
        {
            Ok(mut kill_proc) => {
                let deadline = Instant::now() + SHUTDOWN_KILL_TIMEOUT;
                while Instant::now() < deadline {
                    match kill_proc.try_wait() {
                        Ok(Some(_)) => return,
                        Ok(None) => std::thread::sleep(Duration::from_millis(50)),
                        Err(_) => break,
                    }
                }
                let _ = kill_proc.kill();
            }
            Err(_) => {
                let _ = child.kill();
            }
        }
        return;
    }
    #[cfg(not(windows))]
    {
        let _ = child.kill();
        let deadline = Instant::now() + SHUTDOWN_KILL_TIMEOUT;
        while Instant::now() < deadline {
            if child.try_wait().ok().flatten().is_some() {
                break;
            }
            std::thread::sleep(Duration::from_millis(50));
        }
    }
}

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

    fn shutdown(&self) {
        if let Ok(mut guard) = self.qkrpc.lock() {
            if let Some(mut child) = guard.take() {
                kill_child_tree(&mut child);
            }
        }
        if let Ok(mut guard) = self.node.lock() {
            if let Some(mut child) = guard.take() {
                kill_child_tree(&mut child);
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

/// Installed QuickerAgent prefers 3000 so chat localStorage origin matches pre-0.12.7 builds.
const UI_PORT_PREFERRED: u16 = 3000;

fn resolve_ui_port(host: &str) -> Result<u16, String> {
    if TcpListener::bind((host, UI_PORT_PREFERRED)).is_ok() {
        return Ok(UI_PORT_PREFERRED);
    }
    eprintln!(
        "[startup] port {UI_PORT_PREFERRED} busy; using next free port — chat auto-restore may merge LevelDB from other origins"
    );
    find_port(host, UI_PORT_PREFERRED.saturating_add(1))
}

/// Reuse an existing qkrpc serve when /health already responds on the default port.
fn resolve_qkrpc_port(host: &str) -> Result<(u16, bool), String> {
    const DEFAULT_PORT: u16 = 9477;
    // Short probe only — do not block UI boot when serve is absent.
    if wait_qkrpc_serve_listening(host, DEFAULT_PORT, 350).is_ok() {
        return Ok((DEFAULT_PORT, false));
    }
    if TcpListener::bind((host, DEFAULT_PORT)).is_ok() {
        return Ok((DEFAULT_PORT, true));
    }
    let port = find_port(host, DEFAULT_PORT.saturating_add(1))?;
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
    let started = Instant::now();
    let deadline = started + Duration::from_millis(max_ms);
    let request = format!("GET {path} HTTP/1.1\r\nHost: {host}\r\nConnection: close\r\n\r\n");

    while Instant::now() < deadline {
        if let Ok(mut stream) = std::net::TcpStream::connect((host, port)) {
            let _ = stream.set_read_timeout(Some(Duration::from_millis(800)));
            let _ = stream.set_write_timeout(Some(Duration::from_millis(800)));
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
        let sleep_ms = if started.elapsed() < Duration::from_secs(3) {
            80
        } else {
            200
        };
        std::thread::sleep(Duration::from_millis(sleep_ms));
    }
    Err(format!("timeout waiting for http://{host}:{port}{path}"))
}

fn bundled_node_exe(resource: &Path) -> PathBuf {
    resource.join("node").join(if cfg!(windows) {
        "node.exe"
    } else {
        "bin/node"
    })
}

fn is_complete_resource_root(resource: &Path) -> bool {
    resource.join("app").join("server.js").is_file()
        && bundled_node_exe(resource).is_file()
}

fn resource_root(app: &AppHandle) -> Result<PathBuf, String> {
    let base = app.path().resource_dir().map_err(|e| e.to_string())?;
    let nested = base.join("resources");
    for candidate in [&base, &nested] {
        if is_complete_resource_root(candidate) {
            return Ok(candidate.to_path_buf());
        }
    }
    Err(format!(
        "runtime bundle incomplete (need app/server.js and bundled node under {} or {})",
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

fn try_spawn_and_track_qkrpc(
    app: &AppHandle,
    qkrpc_dir: &Path,
    host: &str,
    port: u16,
    wait_ms: u64,
) -> Result<(), String> {
    if !bundled_qkrpc_healthy(qkrpc_dir) {
        return Err(format!(
            "bundled qkrpc corrupt (missing Kestrel): {}",
            qkrpc_dir.display()
        ));
    }

    let child = spawn_qkrpc(qkrpc_dir, host, port)?;
    wait_qkrpc_serve_listening(host, port, wait_ms)?;
    let state = app.state::<BackendState>();
    let tracked = state.track_child(child)?;
    if let Ok(mut guard) = state.qkrpc.lock() {
        *guard = Some(tracked);
    }
    Ok(())
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
    let ui_port = resolve_ui_port(&host)?;

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
        let script =
            format!("var m=document.querySelector('.startup-message');if(m)m.textContent={json};");
        let _ = win.eval(&script);
    }
}

fn run_qkrpc_serve_watchdog(app: AppHandle, config: ProductionRuntimeConfig) {
    std::thread::spawn(move || {
        let host = config.host.clone();
        let qkrpc_dir = config.qkrpc_dir.clone();
        let port = config.qkrpc_port;
        let mut last_respawn_attempt = Instant::now() - QKRPC_SERVE_RESPAWN_COOLDOWN;

        loop {
            std::thread::sleep(QKRPC_SERVE_WATCHDOG_INTERVAL);
            if STARTUP_CANCELLED.load(Ordering::SeqCst) {
                return;
            }

            if wait_qkrpc_serve_listening(&host, port, 800).is_ok() {
                continue;
            }

            let state = app.state::<BackendState>();
            let child_running = {
                let mut guard = match state.qkrpc.lock() {
                    Ok(guard) => guard,
                    Err(_) => continue,
                };
                match guard.as_mut() {
                    Some(child) => match child.try_wait() {
                        Ok(Some(_)) => {
                            guard.take();
                            false
                        }
                        Ok(None) => true,
                        Err(_) => {
                            guard.take();
                            false
                        }
                    },
                    None => false,
                }
            };

            if child_running {
                continue;
            }

            let since_last = Instant::now().duration_since(last_respawn_attempt);
            if since_last < QKRPC_SERVE_RESPAWN_COOLDOWN {
                continue;
            }
            last_respawn_attempt = Instant::now();

            eprintln!(
                "[qkrpc] serve not listening on http://{host}:{port}; restarting bundled serve"
            );
            match try_spawn_and_track_qkrpc(&app, &qkrpc_dir, &host, port, 20_000) {
                Ok(()) => eprintln!("[qkrpc] serve recovered on http://{host}:{port}"),
                Err(err) => eprintln!("[qkrpc] serve restart failed: {err}"),
            }
        }
    });
}

fn spawn_qkrpc_background(app: AppHandle, config: ProductionRuntimeConfig) {
    run_qkrpc_serve_watchdog(app.clone(), config.clone());

    if !config.should_spawn_qkrpc {
        return;
    }

    std::thread::spawn(move || {
        emit_startup_status(&app, "正在启动 qkrpc 服务…");

        if STARTUP_CANCELLED.load(Ordering::SeqCst) {
            return;
        }

        let host = config.host.clone();
        let qkrpc_dir = config.qkrpc_dir.clone();
        let port = config.qkrpc_port;
        if let Err(err) = try_spawn_and_track_qkrpc(&app, &qkrpc_dir, &host, port, 45_000) {
            eprintln!("[qkrpc] background start failed: {err}");
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
                kill_child_tree(&mut child);
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
                voice_plugin::spawn_voice_runtime_background(app.clone());
                clipboard_history_plugin::spawn_clipboard_runtime_background(app.clone());
            }
            Err(err) => {
                let app_for_dialog = app.clone();
                let detail = err.clone();
                let _ =
                    app.run_on_main_thread(move || show_startup_error(&app_for_dialog, &detail));
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

        // Mark UI ready before navigate so a transient CloseRequested during the
        // placeholder→http transition does not run the startup shutdown path.
        PRODUCTION_UI_READY.store(true, Ordering::SeqCst);

        if let Err(err) = win.navigate(external) {
            PRODUCTION_UI_READY.store(false, Ordering::SeqCst);
            show_startup_error(&app_for_ui, &format!("failed to load UI: {err}"));
            app_for_ui.exit(1);
            return;
        }

        // UI server is up — pre-create the hidden launcher window so the
        // global shortcut can summon it instantly.
        launcher::prewarm_launcher_window_background(app_for_ui.clone());
    }) {
        eprintln!("open production UI callback failed: {err}");
    }
}

fn spawn_pending_voice_runtime_upgrade_background() {
    std::thread::spawn(|| {
        if let Err(err) = voice_plugin_install::apply_pending_runtime_upgrade() {
            eprintln!("[voice-plugin] apply pending runtime upgrade failed: {err}");
        }
    });
}

fn spawn_production_startup(app: AppHandle) {
    std::thread::spawn(move || {
        emit_startup_status(&app, "正在初始化…");

        let config = match prepare_production_runtime(&app) {
            Ok(config) => config,
            Err(err) => {
                let app_for_dialog = app.clone();
                let detail = err.clone();
                let _ =
                    app.run_on_main_thread(move || show_startup_error(&app_for_dialog, &detail));
                return;
            }
        };

        if STARTUP_CANCELLED.load(Ordering::SeqCst) {
            return;
        }

        spawn_pending_voice_runtime_upgrade_background();
        spawn_qkrpc_background(app.clone(), config.clone());
        spawn_node_background(app, config);
    });
}

/// Tray + global shortcut after first paint — keeps setup() from blocking the splash.
fn spawn_desktop_chrome_deferred(app: AppHandle) {
    #[cfg(desktop)]
    std::thread::spawn(move || {
        let app_for_main = app.clone();
        if let Err(err) = app.run_on_main_thread(move || {
            if let Err(err) = global_shortcut::init(&app_for_main) {
                eprintln!("[global-shortcut] init failed: {err}");
            }
            if let Err(err) = tray::init(&app_for_main) {
                eprintln!("[tray] init failed: {err}");
            }
        }) {
            eprintln!("[desktop-chrome] deferred init failed: {err}");
        }
    });
}

fn prepare_ui_for_exit<R: tauri::Runtime>(app: &AppHandle<R>) {
    let _ = embedded_browser::close_workspace_browser(app);
    if let Some(win) = app.get_webview_window(launcher::LAUNCHER_LABEL) {
        let _ = win.close();
    }
}

fn run_app_shutdown<R: tauri::Runtime>(app: &AppHandle<R>) {
    STARTUP_CANCELLED.store(true, Ordering::SeqCst);
    prepare_ui_for_exit(app);
    app.state::<BackendState>().inner().shutdown();
    app.state::<voice_plugin::VoicePluginState>()
        .inner()
        .shutdown();
    clipboard_history_plugin::shutdown_clipboard_history_fast(
        app.state::<clipboard_history_plugin::ClipboardHistoryPluginState>()
            .inner(),
    );
}

fn request_app_exit<R: tauri::Runtime>(app: &AppHandle<R>) {
    prepare_ui_for_exit(app);
    let app_for_exit = app.clone();
    if let Err(err) = app.run_on_main_thread(move || {
        app_for_exit.exit(0);
    }) {
        eprintln!("[shutdown] run_on_main_thread failed: {err}");
        let _ = app.exit(0);
    }
}

fn schedule_force_exit_watchdog<R: tauri::Runtime>(app: AppHandle<R>) {
    std::thread::spawn(move || {
        std::thread::sleep(SHUTDOWN_FORCE_EXIT_AFTER);
        eprintln!(
            "[shutdown] timed out after {}s; forcing exit",
            SHUTDOWN_FORCE_EXIT_AFTER.as_secs()
        );
        run_app_shutdown(&app);
        let _ = app.exit(0);
        std::thread::sleep(Duration::from_millis(200));
        std::process::exit(0);
    });
}

pub(crate) fn spawn_shutdown_and_exit<R: tauri::Runtime>(app: AppHandle<R>) {
    if EXIT_IN_PROGRESS.swap(true, Ordering::SeqCst) {
        run_app_shutdown(&app);
        request_app_exit(&app);
        std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(250));
            std::process::exit(0);
        });
        return;
    }

    STARTUP_CANCELLED.store(true, Ordering::SeqCst);
    schedule_force_exit_watchdog(app.clone());

    let app_for_backend = app.clone();
    std::thread::spawn(move || {
        // Let the exit overlay paint, then end the shell before stopping bundled services.
        std::thread::sleep(Duration::from_millis(60));
        request_app_exit(&app);
        std::thread::sleep(SHUTDOWN_BACKEND_DELAY);
        run_app_shutdown(&app_for_backend);
    });
}

#[tauri::command]
fn graceful_exit(app: AppHandle) {
    spawn_shutdown_and_exit(app);
}

/// Stop bundled qkrpc/node (and plugin runtimes) without exiting — call before NSIS update install.
#[tauri::command]
fn prepare_for_update_install(app: AppHandle) {
    run_app_shutdown(&app);
}

fn handle_main_window_close_requested(app: &AppHandle, api: &tauri::CloseRequestApi) {
    api.prevent_close();

    // Close-to-tray: once the UI is usable, closing the main window only hides it.
    // The app keeps running in the tray; real exit goes through the tray quit item.
    if cfg!(debug_assertions) || PRODUCTION_UI_READY.load(Ordering::SeqCst) {
        tray::hide_primary_window(app);
        return;
    }

    // Closing during the startup splash aborts the launch entirely.
    STARTUP_CANCELLED.store(true, Ordering::SeqCst);
    spawn_shutdown_and_exit(app.clone());
}

fn register_main_window_handlers(window: &WebviewWindow, app: &AppHandle) {
    let app_handle = app.clone();
    window.on_window_event(move |event| {
        if let tauri::WindowEvent::CloseRequested { api, .. } = event {
            handle_main_window_close_requested(&app_handle, api);
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
    if !single_instance::ensure_single_instance_or_activate_existing() {
        return;
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            graceful_exit,
            prepare_for_update_install,
            launcher::launcher_show,
            launcher::launcher_hide,
            launcher::launcher_toggle,
            launcher::launcher_expand,
            global_shortcut::launcher_sync_global_shortcut,
            plugin_runtime::commands::plugin_registry_refresh,
            plugin_runtime::commands::plugin_list,
            plugin_runtime::commands::plugin_status,
            plugin_runtime::commands::plugin_update,
            plugin_runtime::commands::plugin_activate,
            voice_plugin::voice_plugin_status,
            voice_plugin::voice_runtime_health,
            voice_plugin::voice_plugin_install,
            voice_plugin::voice_plugin_start_runtime,
            voice_plugin::voice_plugin_stop_runtime,
            voice_plugin::voice_plugin_redownload_model,
            voice_plugin::voice_plugin_model_install_state,
            voice_plugin::voice_plugin_read_settings,
            voice_plugin::voice_plugin_write_settings,
            clipboard_history_plugin::clipboard_history_plugin_status,
            clipboard_history_plugin::clipboard_history_runtime_health,
            clipboard_history_plugin::clipboard_history_plugin_start_runtime,
            clipboard_history_plugin::clipboard_history_plugin_stop_runtime,
            clipboard_history_plugin::clipboard_history_plugin_read_settings,
            clipboard_history_plugin::clipboard_history_plugin_write_settings,
            webview_profile::webview_profile_paths,
            embedded_browser::embedded_browser_navigation_state,
            embedded_browser::embedded_browser_navigate,
            embedded_browser::embedded_browser_reload,
            embedded_browser::embedded_browser_go_back,
            embedded_browser::embedded_browser_go_forward,
            embedded_browser::embedded_browser_open_devtools,
            embedded_browser::embedded_browser_toggle_devtools,
            embedded_browser::embedded_browser_profile_info,
            embedded_browser::embedded_browser_force_close,
            legacy_chat_restore::legacy_chat_store_scan,
        ])
        .manage(BackendState::new())
        .manage(voice_plugin::VoicePluginState::new())
        .manage(clipboard_history_plugin::ClipboardHistoryPluginState::new())
        .setup(|app| {
            if let Some(win) = app.get_webview_window("main") {
                apply_titlebar_chrome_existing(&win);
                register_main_window_handlers(&win, app.handle());
                webview_permissions::enable_auto_microphone_permission(&win);
                let _ = win.center();
                let _ = win.show();
            }

            spawn_desktop_chrome_deferred(app.handle().clone());

            if cfg!(debug_assertions) {
                app.manage(launcher::UiBaseUrl(Mutex::new(
                    launcher::default_dev_ui_base_url(),
                )));
                // Dev: skip background plugin work and launcher prewarm — webpack is already heavy.
                #[cfg(not(debug_assertions))]
                {
                    launcher::prewarm_launcher_window_background(app.handle().clone());
                    voice_plugin::spawn_voice_runtime_background(app.handle().clone());
                    clipboard_history_plugin::spawn_clipboard_runtime_background(
                        app.handle().clone(),
                    );
                }
                Ok(())
            } else {
                spawn_production_startup(app.handle().clone());
                Ok(())
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            if matches!(event, RunEvent::Exit) {
                run_app_shutdown(app);
            }
        });
}
