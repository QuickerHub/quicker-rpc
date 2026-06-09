use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager,
};

const TRAY_ID: &str = "quicker-agent-tray";
const MENU_SHOW: &str = "tray-show";
const MENU_LAUNCHER: &str = "tray-launcher";
const MENU_QUIT: &str = "tray-quit";

const MAIN_WINDOW_LABEL: &str = "main";
const LEGACY_AGENT_WINDOW_LABEL: &str = "agent";

pub fn init(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    if app.tray_by_id(TRAY_ID).is_some() {
        return Ok(());
    }

    let show = MenuItem::with_id(app, MENU_SHOW, "显示主窗口", true, None::<&str>)?;
    let launcher = MenuItem::with_id(app, MENU_LAUNCHER, "显示启动器", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, MENU_QUIT, "退出", true, None::<&str>)?;

    let menu = Menu::with_items(app, &[&show, &launcher, &quit])?;

    let icon = app
        .default_window_icon()
        .ok_or("missing default window icon for tray")?
        .clone();

    let _tray = TrayIconBuilder::with_id(TRAY_ID)
        .icon(icon)
        .tooltip("QuickerAgent")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            MENU_SHOW => show_primary_window(app),
            MENU_LAUNCHER => {
                if let Err(err) = crate::launcher::launcher_show(app.clone(), None) {
                    eprintln!("[tray] launcher_show failed: {err}");
                }
            }
            MENU_QUIT => {
                if let Some(win) = primary_window(app) {
                    let _ = win.emit("app-request-exit", ());
                } else {
                    crate::spawn_shutdown_and_exit(app.clone());
                }
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                if primary_window_is_visible(app) {
                    let _ = focus_primary_window(app);
                } else {
                    show_primary_window(app);
                }
            }
        })
        .build(app)?;

    Ok(())
}

fn primary_window(app: &AppHandle) -> Option<tauri::WebviewWindow> {
    app.get_webview_window(MAIN_WINDOW_LABEL)
        .or_else(|| app.get_webview_window(LEGACY_AGENT_WINDOW_LABEL))
}

fn primary_window_is_visible(app: &AppHandle) -> bool {
    primary_window(app)
        .and_then(|win| win.is_visible().ok())
        .unwrap_or(false)
}

pub fn show_primary_window(app: &AppHandle) {
    if let Some(win) = primary_window(app) {
        let _ = win.show();
        let _ = win.unminimize();
        let _ = win.set_focus();
    }
}

pub fn hide_primary_window(app: &AppHandle) {
    if let Some(win) = primary_window(app) {
        let _ = win.hide();
    }
}

fn focus_primary_window(app: &AppHandle) -> Result<(), tauri::Error> {
    if let Some(win) = primary_window(app) {
        win.set_focus()?;
    }
    Ok(())
}
