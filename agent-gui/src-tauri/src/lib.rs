use std::io::{Read, Write};
use std::net::TcpListener;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::{Duration, Instant};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

use tauri::{
    AppHandle, Manager, RunEvent, TitleBarStyle, WebviewUrl, WebviewWindow, WebviewWindowBuilder,
};

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

struct BackendState {
    qkrpc: Mutex<Option<Child>>,
    node: Mutex<Option<Child>>,
}

impl BackendState {
    fn new() -> Self {
        Self {
            qkrpc: Mutex::new(None),
            node: Mutex::new(None),
        }
    }

    fn shutdown(&self) {
        if let Ok(mut guard) = self.qkrpc.lock() {
            if let Some(mut child) = guard.take() {
                let _ = child.kill();
            }
        }
        if let Ok(mut guard) = self.node.lock() {
            if let Some(mut child) = guard.take() {
                let _ = child.kill();
            }
        }
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

fn wait_http_ok(host: &str, port: u16, path: &str, max_ms: u64) -> Result<(), String> {
    let deadline = Instant::now() + Duration::from_millis(max_ms);
    let request = format!(
        "GET {path} HTTP/1.1\r\nHost: {host}\r\nConnection: close\r\n\r\n"
    );

    while Instant::now() < deadline {
        if let Ok(mut stream) = std::net::TcpStream::connect((host, port)) {
            let _ = stream.set_read_timeout(Some(Duration::from_secs(2)));
            let _ = stream.set_write_timeout(Some(Duration::from_secs(2)));
            if stream.write_all(request.as_bytes()).is_ok() {
                let mut buf = vec![0u8; 2048];
                if let Ok(n) = stream.read(&mut buf) {
                    let text = String::from_utf8_lossy(&buf[..n]);
                    if text.contains("200") && text.contains("\"ok\":true") {
                        return Ok(());
                    }
                    if text.contains("200") && path != "/health" {
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
    cmd.args(["serve", "--host", host, "--port", &port.to_string()])
        .current_dir(qkrpc_dir);
    configure_hidden_child(&mut cmd);
    cmd.spawn().map_err(|e| format!("spawn qkrpc: {e}"))
}

fn spawn_node_server(app_dir: &Path, node_exe: &Path, host: &str, port: u16) -> Result<Child, String> {
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

    configure_hidden_child(&mut cmd);
    cmd.spawn().map_err(|e| format!("spawn node server: {e}"))
}

/// Extends web content into the title bar: frameless on Windows/Linux, overlay on macOS.
fn apply_titlebar_chrome(builder: WebviewWindowBuilder<'_, tauri::Wry, AppHandle>) -> WebviewWindowBuilder<'_, tauri::Wry, AppHandle> {
    #[cfg(target_os = "macos")]
    {
        builder
            .decorations(true)
            .title_bar_style(TitleBarStyle::Overlay)
            .hidden_title(true)
    }
    #[cfg(not(target_os = "macos"))]
    {
        builder.decorations(false).shadow(true)
    }
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

fn start_production_backends(app: &AppHandle, state: &BackendState) -> Result<String, String> {
    let host = "127.0.0.1";
    let resource = resource_root(app)?;
    let runtime = app_runtime_dir(&resource);
    let node_exe = resource.join("node").join(if cfg!(windows) {
        "node.exe"
    } else {
        "node"
    });

    if !node_exe.is_file() {
        return Err(format!("bundled node not found: {}", node_exe.display()));
    }
    if !runtime.join("server.js").is_file() {
        return Err(format!(
            "app runtime missing server.js under {}",
            runtime.display()
        ));
    }

    let qkrpc_port = find_port(host, 9477)?;
    let ui_port = find_port(host, 3000)?;

    let qkrpc_url = format!("http://{host}:{qkrpc_port}");
    std::env::set_var("QKRPC_HTTP_URL", &qkrpc_url);
    std::env::set_var("QKRPC_TRANSPORT", "http");
    let qkrpc_dir = resource.join("qkrpc");
    let qkrpc_child = spawn_qkrpc(&qkrpc_dir, host, qkrpc_port)?;
    wait_http_ok(host, qkrpc_port, "/health", 45_000)?;

    let node_child = spawn_node_server(&runtime, &node_exe, host, ui_port)?;
    wait_http_ok(host, ui_port, "/", 60_000)?;

    *state.qkrpc.lock().map_err(|e| e.to_string())? = Some(qkrpc_child);
    *state.node.lock().map_err(|e| e.to_string())? = Some(node_child);

    Ok(format!("http://{host}:{ui_port}"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(BackendState::new())
        .setup(|app| {
            #[cfg(debug_assertions)]
            {
                // `tauri dev` uses devUrl + start.mjs from beforeDevCommand.
                if let Some(win) = app.get_webview_window("main") {
                    apply_titlebar_chrome_existing(&win);
                    let _ = win.center();
                    let _ = win.show();
                }
                return Ok(());
            }

            let handle = app.handle().clone();
            let state = app.state::<BackendState>();
            let url = start_production_backends(&handle, state.inner())?;
            let external: url::Url = url.parse().expect("valid UI url");

            if let Some(placeholder) = app.get_webview_window("main") {
                let _ = placeholder.close();
            }

            apply_titlebar_chrome(
                WebviewWindowBuilder::new(&handle, "agent", WebviewUrl::External(external))
                    .title("QuickerAgent")
                    .inner_size(1280.0, 800.0)
                    .center()
                    .resizable(true)
                    .visible(true),
            )
            .build()?;
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            if matches!(event, RunEvent::Exit) {
                app.state::<BackendState>().shutdown();
            }
        });
}
