use std::sync::{Arc, Mutex};

use serde::Serialize;
use tauri::{AppHandle, Manager};

use crate::quicker_agent_paths;

/// Must match `WORKSPACE_BROWSER_WEBVIEW_LABEL` in agent-gui frontend.
pub const WORKSPACE_BROWSER_LABEL: &str = "workspace-browser";

/// Relative `dataDirectory` passed when creating the child webview (Tauri 2.9+).
pub const EMBEDDED_BROWSER_DATA_DIRECTORY: &str = "profile";

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EmbeddedBrowserNavigationState {
    pub url: String,
    pub title: String,
    pub can_go_back: bool,
    pub can_go_forward: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EmbeddedBrowserProfileDto {
    pub label: &'static str,
    pub data_directory_relative: &'static str,
    pub profile_dir: String,
    pub survives_install_update: bool,
}

fn workspace_browser(app: &AppHandle) -> Result<tauri::Webview, String> {
    app.get_webview(WORKSPACE_BROWSER_LABEL)
        .ok_or_else(|| "embedded browser webview is not mounted".to_string())
}

#[cfg(windows)]
fn read_history(webview: &tauri::Webview) -> Result<(bool, bool), String> {
    let result = Arc::new(Mutex::new(None::<Result<(bool, bool), String>>));
    let capture = Arc::clone(&result);

    webview
        .with_webview(move |platform| {
            let outcome = (|| -> Result<(bool, bool), String> {
                use windows::core::BOOL;

                let controller = platform.controller();
                let core = unsafe { controller.CoreWebView2() }
                    .map_err(|e| format!("CoreWebView2: {e}"))?;
                let mut back = BOOL::from(false);
                let mut forward = BOOL::from(false);
                unsafe {
                    core.CanGoBack(&mut back)
                        .map_err(|e| format!("CanGoBack: {e}"))?;
                    core.CanGoForward(&mut forward)
                        .map_err(|e| format!("CanGoForward: {e}"))?;
                }
                Ok((back.as_bool(), forward.as_bool()))
            })();
            *capture.lock().expect("history mutex") = Some(outcome);
        })
        .map_err(|e| e.to_string())?;

    let history = result
        .lock()
        .expect("history mutex")
        .take()
        .unwrap_or(Err("history state missing".into()))?;
    Ok(history)
}

#[cfg(windows)]
fn read_document_title(webview: &tauri::Webview) -> Result<String, String> {
    let result = Arc::new(Mutex::new(None::<Result<String, String>>));
    let capture = Arc::clone(&result);

    webview
        .with_webview(move |platform| {
            let outcome = (|| -> Result<String, String> {
                use windows::core::PWSTR;

                let controller = platform.controller();
                let core = unsafe { controller.CoreWebView2() }
                    .map_err(|e| format!("CoreWebView2: {e}"))?;
                let mut title = PWSTR::null();
                unsafe {
                    core.DocumentTitle(&mut title)
                        .map_err(|e| format!("DocumentTitle: {e}"))?;
                }
                if title.is_null() {
                    return Ok(String::new());
                }
                unsafe {
                    title
                        .to_string()
                        .map_err(|e| format!("DocumentTitle utf16: {e}"))
                }
            })();
            *capture.lock().expect("title mutex") = Some(outcome);
        })
        .map_err(|e| e.to_string())?;

    let title = result
        .lock()
        .expect("title mutex")
        .take()
        .unwrap_or(Err("title state missing".into()))?;
    Ok(title)
}

#[cfg(not(windows))]
fn read_history(webview: &tauri::Webview) -> Result<(bool, bool), String> {
    let script = r#"(function(){try{return JSON.stringify({back:window.history.length>1,forward:false});}catch(e){return JSON.stringify({back:false,forward:false});}})()"#;
    let parsed = eval_json(webview, script)?;
    Ok((
        parsed.get("back").and_then(|v| v.as_bool()).unwrap_or(false),
        parsed
            .get("forward")
            .and_then(|v| v.as_bool())
            .unwrap_or(false),
    ))
}

#[cfg(not(windows))]
fn read_document_title(webview: &tauri::Webview) -> Result<String, String> {
    let script = r#"(function(){try{return document.title||"";}catch(e){return "";}})()"#;
    let parsed = eval_json(webview, script)?;
    Ok(parsed.as_str().unwrap_or("").to_string())
}

#[cfg(not(windows))]
fn eval_json(webview: &tauri::Webview, script: &str) -> Result<serde_json::Value, String> {
    use std::sync::mpsc;
    use std::time::Duration;

    let (tx, rx) = mpsc::sync_channel(1);
    webview
        .eval_with_callback(script, move |value| {
            let _ = tx.send(value);
        })
        .map_err(|e| e.to_string())?;

    let raw = rx
        .recv_timeout(Duration::from_secs(2))
        .map_err(|_| "embedded browser eval timeout".to_string())?;
    serde_json::from_str(&raw).map_err(|e| format!("invalid eval json: {e}"))
}

fn read_navigation_state(webview: &tauri::Webview) -> Result<EmbeddedBrowserNavigationState, String> {
    let url = webview
        .url()
        .map(|value| value.to_string())
        .unwrap_or_default();
    let (can_go_back, can_go_forward) = read_history(webview).unwrap_or((false, false));
    let title = read_document_title(webview).unwrap_or_default();
    Ok(EmbeddedBrowserNavigationState {
        url,
        title,
        can_go_back,
        can_go_forward,
    })
}

#[tauri::command]
pub fn embedded_browser_navigation_state(
    app: AppHandle,
) -> Result<EmbeddedBrowserNavigationState, String> {
    read_navigation_state(&workspace_browser(&app)?)
}

#[tauri::command]
pub fn embedded_browser_navigate(app: AppHandle, url: String) -> Result<(), String> {
    let trimmed = url.trim();
    if trimmed.is_empty() {
        return Err("url is required".into());
    }
    let parsed = url::Url::parse(trimmed).map_err(|e| format!("invalid url: {e}"))?;
    workspace_browser(&app)?
        .navigate(parsed)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn embedded_browser_reload(app: AppHandle) -> Result<(), String> {
    workspace_browser(&app)?
        .reload()
        .map_err(|e| e.to_string())
}

#[cfg(windows)]
fn go_history(webview: &tauri::Webview, back: bool) -> Result<(), String> {
    let result = Arc::new(Mutex::new(None::<Result<(), String>>));
    let capture = Arc::clone(&result);

    webview
        .with_webview(move |platform| {
            let outcome = (|| -> Result<(), String> {
                let controller = platform.controller();
                let core = unsafe { controller.CoreWebView2() }
                    .map_err(|e| format!("CoreWebView2: {e}"))?;
                unsafe {
                    if back {
                        core.GoBack().map_err(|e| format!("GoBack: {e}"))?;
                    } else {
                        core.GoForward()
                            .map_err(|e| format!("GoForward: {e}"))?;
                    }
                }
                Ok(())
            })();
            *capture.lock().expect("go history mutex") = Some(outcome);
        })
        .map_err(|e| e.to_string())?;

    result
        .lock()
        .expect("go history mutex")
        .take()
        .unwrap_or(Err("go history state missing".into()))?;
    Ok(())
}

#[tauri::command]
pub fn embedded_browser_go_back(app: AppHandle) -> Result<(), String> {
    let webview = workspace_browser(&app)?;
    #[cfg(windows)]
    return go_history(&webview, true);
    #[cfg(not(windows))]
    webview
        .eval("history.back()")
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn embedded_browser_go_forward(app: AppHandle) -> Result<(), String> {
    let webview = workspace_browser(&app)?;
    #[cfg(windows)]
    return go_history(&webview, false);
    #[cfg(not(windows))]
    webview
        .eval("history.forward()")
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn embedded_browser_open_devtools(app: AppHandle) -> Result<(), String> {
    workspace_browser(&app)?.open_devtools();
    Ok(())
}

#[tauri::command]
pub fn embedded_browser_toggle_devtools(app: AppHandle) -> Result<bool, String> {
    let webview = workspace_browser(&app)?;
    if webview.is_devtools_open() {
        webview.close_devtools();
    } else {
        webview.open_devtools();
    }
    Ok(webview.is_devtools_open())
}

/// Close orphan workspace-browser child webview (survives main webview reload).
pub(crate) fn close_workspace_browser<R: tauri::Runtime>(app: &AppHandle<R>) -> bool {
    match app.get_webview(WORKSPACE_BROWSER_LABEL) {
        Some(webview) => webview.close().is_ok(),
        None => false,
    }
}

/// Close orphan workspace-browser child webview from Rust (survives main webview reload).
#[tauri::command]
pub fn embedded_browser_force_close(app: AppHandle) -> Result<bool, String> {
    Ok(close_workspace_browser(&app))
}

#[tauri::command]
pub fn embedded_browser_profile_info() -> EmbeddedBrowserProfileDto {
    EmbeddedBrowserProfileDto {
        label: WORKSPACE_BROWSER_LABEL,
        data_directory_relative: EMBEDDED_BROWSER_DATA_DIRECTORY,
        profile_dir: quicker_agent_paths::embedded_browser_profile_dir()
            .to_string_lossy()
            .into_owned(),
        survives_install_update: true,
    }
}
