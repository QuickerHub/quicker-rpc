#[cfg(windows)]
use windows_sys::Win32::Foundation::{CloseHandle, GetLastError, ERROR_ALREADY_EXISTS, HWND};
#[cfg(windows)]
use windows_sys::Win32::System::Threading::CreateMutexW;
#[cfg(windows)]
use windows_sys::Win32::UI::WindowsAndMessaging::{
    AllowSetForegroundWindow, EnumWindows, GetWindowTextW, IsIconic, IsWindowVisible,
    SetForegroundWindow, ShowWindow, ASFW_ANY, SW_RESTORE, SW_SHOW,
};

const MUTEX_NAME: &str = "Local\\QuickerAgent.SingleInstance\0";
const MAIN_WINDOW_TITLE: &str = "QuickerAgent";

/// Returns false when another live instance was activated (caller should exit quietly).
#[cfg(windows)]
pub fn ensure_single_instance_or_activate_existing() -> bool {
    let name: Vec<u16> = MUTEX_NAME.encode_utf16().collect();
    unsafe {
        let handle = CreateMutexW(std::ptr::null(), 1, name.as_ptr());
        if handle.is_null() {
            return true;
        }
        if GetLastError() == ERROR_ALREADY_EXISTS {
            CloseHandle(handle);
            if try_activate_existing_main_window() {
                eprintln!("QuickerAgent is already running; brought existing window to foreground.");
                return false;
            }
            eprintln!("QuickerAgent is already running; exiting duplicate instance.");
            return false;
        }
        true
    }
}

#[cfg(not(windows))]
pub fn ensure_single_instance_or_activate_existing() -> bool {
    true
}

#[cfg(windows)]
fn try_activate_existing_main_window() -> bool {
    unsafe extern "system" fn enum_proc(hwnd: HWND, lparam: isize) -> i32 {
        let state = &mut *(lparam as *mut EnumState);
        if hwnd.is_null() {
            return 1;
        }

        let mut buffer = [0u16; 512];
        let len = GetWindowTextW(hwnd, buffer.as_mut_ptr(), buffer.len() as i32);
        if len <= 0 {
            return 1;
        }

        let title = String::from_utf16_lossy(&buffer[..len as usize]);
        if title.trim().is_empty() {
            return 1;
        }

        let visible = IsWindowVisible(hwnd) != 0;
        if visible {
            state.any_visible = hwnd;
        }
        // Title match also accepts hidden windows: the main window may be
        // hidden to tray (close-to-tray) and must still be re-activatable.
        if title == state.target_title {
            state.titled_match = hwnd;
            if visible {
                return 0;
            }
        }
        1
    }

    struct EnumState {
        target_title: String,
        titled_match: HWND,
        any_visible: HWND,
    }

    let mut state = EnumState {
        target_title: MAIN_WINDOW_TITLE.to_string(),
        titled_match: std::ptr::null_mut(),
        any_visible: std::ptr::null_mut(),
    };

    unsafe {
        EnumWindows(
            Some(enum_proc),
            (&mut state as *mut EnumState) as isize,
        );
    }

    let hwnd = if !state.titled_match.is_null() {
        state.titled_match
    } else {
        state.any_visible
    };

    if hwnd.is_null() {
        return false;
    }

    unsafe {
        AllowSetForegroundWindow(ASFW_ANY);
        if IsWindowVisible(hwnd) == 0 {
            ShowWindow(hwnd, SW_SHOW);
        }
        if IsIconic(hwnd) != 0 {
            ShowWindow(hwnd, SW_RESTORE);
        }
        SetForegroundWindow(hwnd) != 0
    }
}
