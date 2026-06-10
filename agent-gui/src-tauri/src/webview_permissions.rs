//! Auto-grant WebView microphone permission for QuickerAgent localhost UI.

use tauri::WebviewWindow;

/// Suppress WebView2 microphone prompts for QuickerAgent UI windows (Windows only).
pub fn enable_auto_microphone_permission(window: &WebviewWindow) {
    #[cfg(windows)]
    {
        if let Err(err) = install_microphone_auto_allow_windows(window) {
            eprintln!("[webview-permissions] microphone auto-allow failed: {err}");
        }
    }
}

#[cfg(windows)]
fn install_microphone_auto_allow_windows(window: &WebviewWindow) -> Result<(), String> {
    use std::sync::{Arc, Mutex};

    use webview2_com::Microsoft::Web::WebView2::Win32::*;
    use webview2_com::PermissionRequestedEventHandler;

    let result = Arc::new(Mutex::new(None::<Result<(), String>>));
    let capture = Arc::clone(&result);

    window
        .with_webview(move |platform| {
            let outcome = (|| -> Result<(), String> {
                let controller = platform.controller();
                let core = unsafe { controller.CoreWebView2() }
                    .map_err(|e| format!("CoreWebView2: {e}"))?;

                pregrant_localhost_microphone_profile(&core)?;

                let mut token = 0i64;
                unsafe {
                    core.add_PermissionRequested(
                        &PermissionRequestedEventHandler::create(Box::new(|_, args| {
                            let Some(args) = args else {
                                return Ok(());
                            };
                            let mut kind = COREWEBVIEW2_PERMISSION_KIND::default();
                            if args.PermissionKind(&mut kind).is_err() {
                                return Ok(());
                            }
                            if kind == COREWEBVIEW2_PERMISSION_KIND_MICROPHONE {
                                let _ = args.SetState(COREWEBVIEW2_PERMISSION_STATE_ALLOW);
                            }
                            Ok(())
                        })),
                        &mut token,
                    )
                    .map_err(|e| format!("add_PermissionRequested: {e}"))?;
                }
                Ok(())
            })();
            *capture.lock().expect("webview permissions mutex") = Some(outcome);
        })
        .map_err(|e| format!("with_webview: {e}"))?;

    let installed = result
        .lock()
        .expect("webview permissions mutex")
        .take()
        .unwrap_or_else(|| Err("with_webview returned empty".into()))?;
    Ok(installed)
}

#[cfg(windows)]
fn pregrant_localhost_microphone_profile(
    core: &webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2,
) -> Result<(), String> {
    use webview2_com::Microsoft::Web::WebView2::Win32::*;
    use webview2_com::SetPermissionStateCompletedHandler;
    use windows::core::{w, Interface};

    let core13: ICoreWebView2_13 = core.cast().map_err(|e| format!("ICoreWebView2_13: {e}"))?;
    let profile: ICoreWebView2Profile4 = unsafe { core13.Profile() }
        .map_err(|e| format!("Profile: {e}"))?
        .cast()
        .map_err(|e| format!("ICoreWebView2Profile4: {e}"))?;

    for origin in [w!("http://127.0.0.1"), w!("http://localhost")] {
        unsafe {
            profile
                .SetPermissionState(
                    COREWEBVIEW2_PERMISSION_KIND_MICROPHONE,
                    origin,
                    COREWEBVIEW2_PERMISSION_STATE_ALLOW,
                    &SetPermissionStateCompletedHandler::create(Box::new(|hr| {
                        if hr.is_err() {
                            eprintln!("[webview-permissions] SetPermissionState failed: {hr:?}");
                        }
                        Ok(())
                    })),
                )
                .map_err(|e| format!("SetPermissionState: {e}"))?;
        }
    }

    Ok(())
}
