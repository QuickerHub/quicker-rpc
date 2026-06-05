use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, Ordering};
use std::thread;
use std::time::{Duration, Instant};

use tauri::{AppHandle, Emitter, Manager, Size, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

pub const LAUNCHER_LABEL: &str = "launcher";
pub const LAUNCHER_HIDDEN_EVENT: &str = "launcher:hidden";
pub const LAUNCHER_SHOWN_EVENT: &str = "launcher:shown";

const LAUNCHER_WIDTH: f64 = 680.0;
const LAUNCHER_HEIGHT: f64 = 520.0;
const LAUNCHER_BLUR_HIDE_DELAY: Duration = Duration::from_millis(120);
const LAUNCHER_BLUR_SUPPRESS_AFTER_SHOW: Duration = Duration::from_millis(450);

static LAUNCHER_WINDOW_HANDLERS_REGISTERED: AtomicBool = AtomicBool::new(false);
static LAUNCHER_SUPPRESS_BLUR_UNTIL: Mutex<Option<Instant>> = Mutex::new(None);

pub struct UiBaseUrl(pub Mutex<String>);

fn launcher_fixed_logical_size() -> tauri::LogicalSize<f64> {
    tauri::LogicalSize {
        width: LAUNCHER_WIDTH,
        height: LAUNCHER_HEIGHT,
    }
}

fn launcher_fixed_size() -> Size {
    Size::Logical(launcher_fixed_logical_size())
}

fn launcher_url(base: &str) -> Result<WebviewUrl, String> {
    let trimmed = base.trim_end_matches('/');
    format!("{trimmed}/launcher")
        .parse()
        .map(WebviewUrl::External)
        .map_err(|err| format!("invalid launcher url: {err}"))
}

fn launcher_size(_expanded: bool) -> (f64, f64) {
    (LAUNCHER_WIDTH, LAUNCHER_HEIGHT)
}

fn apply_launcher_size(window: &WebviewWindow, expanded: bool) {
    let (width, height) = launcher_size(expanded);
    let old_outer = window.outer_size().ok();
    let old_pos = window.outer_position().ok();

    let _ = window.set_size(tauri::Size::Logical(tauri::LogicalSize { width, height }));

    // Keep the bottom edge fixed so the composer stays in place while growing upward.
    if let (Some(old_outer), Some(old_pos)) = (old_outer, old_pos) {
        if let Ok(new_outer) = window.outer_size() {
            let dy = new_outer.height as i32 - old_outer.height as i32;
            if dy != 0 {
                let _ = window.set_position(tauri::Position::Physical(tauri::PhysicalPosition {
                    x: old_pos.x,
                    y: old_pos.y - dy,
                }));
                return;
            }
        }
    }

    let _ = window.center();
}

fn apply_launcher_chrome(window: &WebviewWindow) {
    let _ = window.set_decorations(false);
    let _ = window.set_shadow(false);
    let _ = window.set_always_on_top(true);
    let _ = window.set_maximizable(false);
    let _ = window.set_resizable(false);

    let fixed = launcher_fixed_size();
    let _ = window.set_min_size(Some(fixed));
    let _ = window.set_max_size(Some(fixed));

    if window.is_maximized().unwrap_or(false) {
        let _ = window.unmaximize();
    }

    #[cfg(windows)]
    disable_launcher_dwm_snap(window);
}

#[cfg(windows)]
fn disable_launcher_dwm_snap(window: &WebviewWindow) {
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        GetWindowLongPtrW, SetWindowLongPtrW, SetWindowPos, GWL_STYLE, SWP_FRAMECHANGED,
        SWP_NOMOVE, SWP_NOSIZE, SWP_NOZORDER, WS_MAXIMIZEBOX, WS_THICKFRAME,
    };

    let Ok(hwnd) = window.hwnd() else {
        return;
    };
    let raw = hwnd.0;

    unsafe {
        let style = GetWindowLongPtrW(raw, GWL_STYLE) as u32;
        let style = style & !WS_MAXIMIZEBOX & !WS_THICKFRAME;
        SetWindowLongPtrW(raw, GWL_STYLE, style as _);
        SetWindowPos(
            raw,
            std::ptr::null_mut(),
            0,
            0,
            0,
            0,
            SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_FRAMECHANGED,
        );
    }
}

fn register_launcher_window_handlers(window: &WebviewWindow) {
    if LAUNCHER_WINDOW_HANDLERS_REGISTERED.swap(true, Ordering::SeqCst) {
        return;
    }

    let guard_window = window.clone();
    window.on_window_event(move |event| {
        match event {
            tauri::WindowEvent::Resized(_) => {
                if guard_window.is_maximized().unwrap_or(false) {
                    let _ = guard_window.unmaximize();
                    apply_launcher_size(&guard_window, false);
                }
            }
            tauri::WindowEvent::Focused(true) => {
                suppress_launcher_blur_hide_for(LAUNCHER_BLUR_SUPPRESS_AFTER_SHOW);
                let _ = guard_window.emit(LAUNCHER_SHOWN_EVENT, ());
            }
            tauri::WindowEvent::Focused(false) => {
                schedule_launcher_hide_on_blur(&guard_window);
            }
            _ => {}
        }
    });
}

fn suppress_launcher_blur_hide_for(duration: Duration) {
    if let Ok(mut guard) = LAUNCHER_SUPPRESS_BLUR_UNTIL.lock() {
        *guard = Some(Instant::now() + duration);
    }
}

fn blur_hide_is_suppressed() -> bool {
    LAUNCHER_SUPPRESS_BLUR_UNTIL
        .lock()
        .ok()
        .and_then(|guard| *guard)
        .is_some_and(|until| Instant::now() < until)
}

fn schedule_launcher_hide_on_blur(window: &WebviewWindow) {
    let window = window.clone();
    thread::spawn(move || {
        thread::sleep(LAUNCHER_BLUR_HIDE_DELAY);
        if blur_hide_is_suppressed() {
            return;
        }
        if window.is_focused().unwrap_or(true) {
            return;
        }
        if !window.is_visible().unwrap_or(false) {
            return;
        }
        hide_launcher_window(&window);
    });
}

fn hide_launcher_window(window: &WebviewWindow) {
    if let Ok(mut guard) = LAUNCHER_SUPPRESS_BLUR_UNTIL.lock() {
        *guard = None;
    }
    let _ = window.hide();
    let _ = window.emit(LAUNCHER_HIDDEN_EVENT, ());
}

fn show_launcher_window(window: &WebviewWindow) {
    suppress_launcher_blur_hide_for(LAUNCHER_BLUR_SUPPRESS_AFTER_SHOW);
    let _ = window.show();
    let _ = window.set_focus();
}

fn resolve_launcher_webview_url(app: &AppHandle) -> Result<WebviewUrl, String> {
    let base = app
        .try_state::<UiBaseUrl>()
        .ok_or_else(|| "UI base URL is not configured".to_string())?;
    let base_url = base.0.lock().map_err(|_| "UI base URL lock poisoned".to_string())?;
    launcher_url(&base_url)
}

fn build_launcher_window(app: &AppHandle, expanded: bool) -> Result<WebviewWindow, String> {
    let url = resolve_launcher_webview_url(app)?;
    let (width, height) = launcher_size(expanded);

    let window = WebviewWindowBuilder::new(app, LAUNCHER_LABEL, url)
        .title("QuickerAgent 快速输入")
        .inner_size(width, height)
        .center()
        .resizable(false)
        .maximizable(false)
        .visible(true)
        .decorations(false)
        .shadow(false)
        .transparent(true)
        .always_on_top(true)
        .build()
        .map_err(|err| err.to_string())?;

    apply_launcher_chrome(&window);
    register_launcher_window_handlers(&window);

    Ok(window)
}

fn ensure_launcher_window(app: &AppHandle, expanded: bool) -> Result<WebviewWindow, String> {
    if let Some(window) = app.get_webview_window(LAUNCHER_LABEL) {
        apply_launcher_chrome(&window);
        apply_launcher_size(&window, expanded);
        show_launcher_window(&window);
        return Ok(window);
    }

    build_launcher_window(app, expanded)
}

/// Dev: window from tauri.conf uses devUrl + /launcher. Prod: close placeholder, create External URL later.
pub fn prepare_configured_launcher_window(app: &AppHandle, visible: bool) {
    let Some(window) = app.get_webview_window(LAUNCHER_LABEL) else {
        return;
    };

    apply_launcher_chrome(&window);
    apply_launcher_size(&window, false);
    register_launcher_window_handlers(&window);

    if visible {
        show_launcher_window(&window);
    } else {
        let _ = window.hide();
    }
}

pub fn close_configured_launcher_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(LAUNCHER_LABEL) {
        let _ = window.close();
        LAUNCHER_WINDOW_HANDLERS_REGISTERED.store(false, Ordering::SeqCst);
    }
}

#[tauri::command]
pub fn launcher_show(app: AppHandle, expanded: Option<bool>) -> Result<(), String> {
    ensure_launcher_window(&app, expanded.unwrap_or(false))?;
    Ok(())
}

#[tauri::command]
pub fn launcher_hide(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(LAUNCHER_LABEL) {
        hide_launcher_window(&window);
    }
    Ok(())
}

#[tauri::command]
pub fn launcher_toggle(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(LAUNCHER_LABEL) {
        if window.is_visible().unwrap_or(false) {
            hide_launcher_window(&window);
            return Ok(());
        }
    }
    ensure_launcher_window(&app, false)?;
    Ok(())
}

#[tauri::command]
pub fn launcher_expand(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(LAUNCHER_LABEL) {
        apply_launcher_size(&window, true);
        show_launcher_window(&window);
        return Ok(());
    }
    ensure_launcher_window(&app, true)?;
    Ok(())
}

pub fn default_dev_ui_base_url() -> String {
    let host = std::env::var("HOSTNAME")
        .ok()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| "127.0.0.1".to_string());
    let port = std::env::var("AGENT_GUI_PORT")
        .ok()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| "3000".to_string());
    format!("http://{host}:{port}")
}
