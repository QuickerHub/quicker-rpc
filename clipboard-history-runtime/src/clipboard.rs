use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::Duration;

use anyhow::{Context, Result};
use arboard::{Clipboard, ImageData};
use nanoid::nanoid;
use rusqlite::{params, Connection};
use tracing::{debug, warn};

use crate::model::{ClipKind, ClipRecord};
use crate::store::{content_hash, ClipStore};

static SUPPRESS_CAPTURE: AtomicBool = AtomicBool::new(false);

const WATCH_INTERVAL_MS: u64 = 500;
const WATCH_BUSY_INTERVAL_MS: u64 = 1200;

pub fn with_suppressed_capture<F, T>(f: F) -> Result<T>
where
    F: FnOnce() -> Result<T>,
{
    SUPPRESS_CAPTURE.store(true, Ordering::SeqCst);
    let result = f();
    thread::sleep(Duration::from_millis(120));
    SUPPRESS_CAPTURE.store(false, Ordering::SeqCst);
    result
}

pub fn spawn_watcher(store: Arc<ClipStore>) {
    thread::spawn(move || {
        let mut last_signature = String::new();
        loop {
            if SUPPRESS_CAPTURE.load(Ordering::SeqCst) {
                thread::sleep(Duration::from_millis(200));
                continue;
            }
            let mut sleep_ms = WATCH_INTERVAL_MS;
            match read_clipboard_snapshot(&store) {
                Ok(Some(record)) => {
                    let signature = record.content_hash.clone();
                    if signature != last_signature {
                        last_signature = signature.clone();
                        match store.insert_record(record) {
                            Ok(created) => debug!(created, "clipboard captured"),
                            Err(err) => warn!(?err, "clipboard insert failed"),
                        }
                    }
                }
                Ok(None) => {}
                Err(err) => {
                    if is_clipboard_busy_error(&err) {
                        sleep_ms = WATCH_BUSY_INTERVAL_MS;
                    } else {
                        warn!(?err, "clipboard read failed");
                    }
                }
            }
            thread::sleep(Duration::from_millis(sleep_ms));
        }
    });
}

fn is_clipboard_busy_error(err: &anyhow::Error) -> bool {
    let msg = err.to_string().to_ascii_lowercase();
    msg.contains("clipboard")
        && (msg.contains("busy")
            || msg.contains("open")
            || msg.contains("access")
            || msg.contains("locked")
            || msg.contains("占用"))
}

enum ClipboardPayload {
    Files(Vec<String>),
    Image {
        width: usize,
        height: usize,
        bytes: Vec<u8>,
    },
    Html(String),
    Text(String),
}

fn read_clipboard_snapshot(store: &ClipStore) -> Result<Option<ClipRecord>> {
    let now = chrono::Utc::now().timestamp_millis();
    let source_process = active_process_name();

    let payload = {
        let mut clipboard = Clipboard::new().context("open system clipboard")?;

        let payload = if let Ok(files) = read_file_list_from_open_clipboard() {
            if !files.is_empty() {
                Some(ClipboardPayload::Files(files))
            } else {
                None
            }
        } else {
            None
        };

        let payload = if payload.is_some() {
            payload
        } else if let Ok(image) = clipboard.get_image() {
            Some(ClipboardPayload::Image {
                width: image.width,
                height: image.height,
                bytes: image.bytes.to_vec(),
            })
        } else if let Ok(text) = clipboard.get_text() {
            let trimmed = text.trim();
            if trimmed.is_empty() {
                None
            } else {
                Some(ClipboardPayload::Text(text))
            }
        } else {
            None
        };
        // `clipboard` dropped here — release OpenClipboard before any slow work.
        payload
    };

    let payload = if let Some(payload) = payload {
        Some(payload)
    } else if let Some(html) = read_html_from_clipboard() {
        Some(ClipboardPayload::Html(html))
    } else {
        None
    };

    let Some(payload) = payload else {
        return Ok(None);
    };

    let record = match payload {
        ClipboardPayload::Files(files) => {
            let preview = files
                .iter()
                .take(3)
                .cloned()
                .collect::<Vec<_>>()
                .join("\n");
            let title = Path::new(&files[0])
                .file_name()
                .and_then(|s| s.to_str())
                .unwrap_or("Files")
                .to_string();
            let hash = content_hash("files", &files.join("\0"));
            ClipRecord {
                id: nanoid!(10),
                kind: ClipKind::Files,
                title,
                preview: preview.clone(),
                content_text: Some(preview),
                content_path: None,
                file_paths: files,
                source_process,
                is_pinned: false,
                usage_count: 0,
                last_used_at: None,
                created_at: now,
                updated_at: now,
                content_hash: hash,
            }
        }
        ClipboardPayload::Image {
            width,
            height,
            bytes,
        } => {
            let image = ImageData {
                width,
                height,
                bytes: bytes.into(),
            };
            let hash = image_content_hash(&image);
            let path = save_image(store.data_dir(), &image)?;
            let size = std::fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
            ClipRecord {
                id: nanoid!(10),
                kind: ClipKind::Image,
                title: format!("Image {size} bytes"),
                preview: "[image]".to_string(),
                content_text: None,
                content_path: Some(path.to_string_lossy().to_string()),
                file_paths: Vec::new(),
                source_process,
                is_pinned: false,
                usage_count: 0,
                last_used_at: None,
                created_at: now,
                updated_at: now,
                content_hash: hash,
            }
        }
        ClipboardPayload::Html(html) => {
            let plain = strip_html_basic(&html);
            let preview = truncate_preview(&plain, 240);
            let title = truncate_preview(&plain, 48);
            let hash = content_hash("html", &html);
            ClipRecord {
                id: nanoid!(10),
                kind: ClipKind::Html,
                title,
                preview,
                content_text: Some(html),
                content_path: None,
                file_paths: Vec::new(),
                source_process,
                is_pinned: false,
                usage_count: 0,
                last_used_at: None,
                created_at: now,
                updated_at: now,
                content_hash: hash,
            }
        }
        ClipboardPayload::Text(text) => {
            let trimmed = text.trim();
            let preview = truncate_preview(trimmed, 240);
            let title = truncate_preview(trimmed, 48);
            let hash = content_hash("text", trimmed);
            ClipRecord {
                id: nanoid!(10),
                kind: ClipKind::Text,
                title,
                preview,
                content_text: Some(text),
                content_path: None,
                file_paths: Vec::new(),
                source_process,
                is_pinned: false,
                usage_count: 0,
                last_used_at: None,
                created_at: now,
                updated_at: now,
                content_hash: hash,
            }
        }
    };

    Ok(Some(record))
}

fn image_content_hash(image: &ImageData) -> String {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};

    let mut hasher = DefaultHasher::new();
    "image".hash(&mut hasher);
    image.width.hash(&mut hasher);
    image.height.hash(&mut hasher);
    image.bytes.len().hash(&mut hasher);
    for (index, byte) in image.bytes.iter().enumerate() {
        if index % 4096 == 0 {
            byte.hash(&mut hasher);
        }
    }
    format!("{:016x}", hasher.finish())
}

#[cfg(windows)]
fn read_file_list_from_open_clipboard() -> Result<Vec<String>> {
    use std::ffi::OsString;
    use std::os::windows::ffi::OsStringExt;
    use windows_sys::Win32::System::DataExchange::*;
    use windows_sys::Win32::UI::Shell::DragQueryFileW;

    const CF_HDROP: u32 = 15;
    unsafe {
        if IsClipboardFormatAvailable(CF_HDROP) == 0 {
            return Ok(Vec::new());
        }
        let drop = GetClipboardData(CF_HDROP);
        if drop.is_null() {
            return Ok(Vec::new());
        }
        let count = DragQueryFileW(drop, 0xFFFFFFFF, std::ptr::null_mut(), 0);
        let mut files = Vec::new();
        for idx in 0..count {
            let len = DragQueryFileW(drop, idx, std::ptr::null_mut(), 0);
            let mut buf = vec![0u16; len as usize + 1];
            DragQueryFileW(drop, idx, buf.as_mut_ptr(), len + 1);
            let os = OsString::from_wide(&buf[..len as usize]);
            files.push(os.to_string_lossy().to_string());
        }
        Ok(files)
    }
}

#[cfg(not(windows))]
fn read_file_list_from_open_clipboard() -> Result<Vec<String>> {
    Ok(Vec::new())
}

fn save_image(data_dir: &Path, image: &ImageData) -> Result<std::path::PathBuf> {
    let images = data_dir.join("images");
    std::fs::create_dir_all(&images)?;
    let path = images.join(format!("{}.png", nanoid!(12)));
    let rgba = image.bytes.to_vec();
    let file = std::fs::File::create(&path)?;
    let w = std::io::BufWriter::new(file);
    let mut encoder = png::Encoder::new(w, image.width as u32, image.height as u32);
    encoder.set_color(png::ColorType::Rgba);
    encoder.set_depth(png::BitDepth::Eight);
    let mut writer = encoder.write_header()?;
    writer.write_image_data(&rgba)?;
    Ok(path)
}

fn truncate_preview(text: &str, max_chars: usize) -> String {
    let chars: Vec<char> = text.chars().collect();
    if chars.len() <= max_chars {
        return text.to_string();
    }
    chars[..max_chars].iter().collect::<String>() + "…"
}

fn strip_html_basic(html: &str) -> String {
    let mut out = String::new();
    let mut in_tag = false;
    for ch in html.chars() {
        match ch {
            '<' => in_tag = true,
            '>' => in_tag = false,
            _ if !in_tag => out.push(ch),
            _ => {}
        }
    }
    out.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn image_path_for_id(store: &ClipStore, id: &str) -> Result<Option<String>> {
    let db = store.data_dir().join("clipboard.db");
    let conn = Connection::open(db)?;
    let mut stmt = conn.prepare("SELECT content_path FROM clip_items WHERE id = ?1")?;
    let mut rows = stmt.query(params![id])?;
    if let Some(row) = rows.next()? {
        return Ok(row.get(0)?);
    }
    Ok(None)
}

pub fn copy_item_to_clipboard(store: &ClipStore, id: &str) -> Result<()> {
    let detail = store
        .get_detail(id)?
        .ok_or_else(|| anyhow::anyhow!("clip item not found"))?;
    let kind = ClipKind::from_str(&detail.kind).unwrap_or(ClipKind::Text);
    with_suppressed_capture(|| {
        match kind {
            ClipKind::Files => {
                if !detail.file_paths.is_empty() {
                    copy_files_to_clipboard(&detail.file_paths)?;
                }
            }
            ClipKind::Image => {
                let path = image_path_for_id(store, id)?
                    .ok_or_else(|| anyhow::anyhow!("image path missing"))?;
                let bytes = std::fs::read(&path)?;
                let dyn_img = image::load_from_memory(&bytes)?;
                let rgba = dyn_img.to_rgba8();
                let (width, height) = rgba.dimensions();
                let mut clipboard = Clipboard::new().context("open clipboard for copy")?;
                clipboard.set_image(ImageData {
                    width: width as usize,
                    height: height as usize,
                    bytes: rgba.into_raw().into(),
                })?;
            }
            ClipKind::Html => {
                let html = detail.html_data.or(detail.body_text).unwrap_or_default();
                let mut clipboard = Clipboard::new().context("open clipboard for copy")?;
                clipboard.set_html(html, None)?;
            }
            ClipKind::Text => {
                let text = detail.body_text.unwrap_or_default();
                let mut clipboard = Clipboard::new().context("open clipboard for copy")?;
                clipboard.set_text(text)?;
            }
        }
        store.touch_usage(id)?;
        Ok(())
    })
}

#[cfg(windows)]
fn copy_files_to_clipboard(paths: &[String]) -> Result<()> {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Foundation::HANDLE;
    use windows_sys::Win32::System::DataExchange::*;
    use windows_sys::Win32::System::Memory::{GlobalAlloc, GlobalLock, GlobalUnlock, GMEM_MOVEABLE};

    let mut wide: Vec<u16> = Vec::new();
    for path in paths {
        wide.extend(OsStr::new(path).encode_wide());
        wide.push(0);
    }
    wide.push(0);
    const CF_HDROP: u32 = 15;
    let size = wide.len() * 2;
    unsafe {
        if OpenClipboard(0 as HANDLE) == 0 {
            anyhow::bail!("OpenClipboard failed");
        }
        EmptyClipboard();
        let mem = GlobalAlloc(GMEM_MOVEABLE, size);
        if mem.is_null() {
            CloseClipboard();
            anyhow::bail!("GlobalAlloc failed");
        }
        let lock = GlobalLock(mem) as *mut u16;
        if lock.is_null() {
            CloseClipboard();
            anyhow::bail!("GlobalLock failed");
        }
        std::ptr::copy_nonoverlapping(wide.as_ptr(), lock, wide.len());
        GlobalUnlock(mem);
        SetClipboardData(CF_HDROP, mem);
        CloseClipboard();
    }
    Ok(())
}

#[cfg(not(windows))]
fn copy_files_to_clipboard(paths: &[String]) -> Result<()> {
    let mut clipboard = Clipboard::new()?;
    clipboard.set_text(paths.join("\n"))?;
    Ok(())
}

fn read_html_from_clipboard() -> Option<String> {
    #[cfg(windows)]
    {
        use windows_sys::Win32::Foundation::HANDLE;
        use windows_sys::Win32::System::DataExchange::{
            CloseClipboard, GetClipboardData, IsClipboardFormatAvailable, OpenClipboard,
        };
        use windows_sys::Win32::System::Memory::{GlobalLock, GlobalUnlock};

        const CF_HTML: u32 = 49345;
        unsafe {
            if OpenClipboard(0 as HANDLE) == 0 {
                return None;
            }
            let result = (|| {
                if IsClipboardFormatAvailable(CF_HTML) == 0 {
                    return None;
                }
                let handle = GetClipboardData(CF_HTML);
                if handle.is_null() {
                    return None;
                }
                let ptr = GlobalLock(handle) as *const u8;
                if ptr.is_null() {
                    return None;
                }
                let mut len = 0usize;
                while *ptr.add(len) != 0 {
                    len += 1;
                    if len > 8 * 1024 * 1024 {
                        break;
                    }
                }
                let raw = std::slice::from_raw_parts(ptr, len);
                GlobalUnlock(handle);
                let text = String::from_utf8_lossy(raw).to_string();
                extract_cf_html_fragment(&text).or(Some(text))
            })();
            CloseClipboard();
            return result;
        }
    }
    #[cfg(not(windows))]
    {
        None
    }
}

fn extract_cf_html_fragment(raw: &str) -> Option<String> {
    let start = raw
        .to_ascii_lowercase()
        .find("startfragment:")
        .map(|idx| idx + "startfragment:".len())?;
    let end_marker = raw.to_ascii_lowercase().find("endfragment:")?;
    let end = raw[..end_marker]
        .rfind('\n')
        .or_else(|| raw[..end_marker].rfind('\r'))
        .unwrap_or(end_marker);
    let fragment = raw.get(start..end)?.trim();
    if fragment.is_empty() {
        None
    } else {
        Some(fragment.to_string())
    }
}

pub fn active_process_name() -> Option<String> {
    #[cfg(windows)]
    {
        use windows_sys::Win32::Foundation::CloseHandle;
        use windows_sys::Win32::System::Threading::{
            OpenProcess, QueryFullProcessImageNameW, PROCESS_QUERY_LIMITED_INFORMATION,
        };
        use windows_sys::Win32::UI::WindowsAndMessaging::GetForegroundWindow;

        unsafe {
            let hwnd = GetForegroundWindow();
            if hwnd.is_null() {
                return None;
            }
            let mut pid: u32 = 0;
            windows_sys::Win32::UI::WindowsAndMessaging::GetWindowThreadProcessId(
                hwnd,
                &mut pid as *mut u32,
            );
            if pid == 0 {
                return None;
            }
            let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
            if handle.is_null() {
                return None;
            }
            let mut buf = vec![0u16; 512];
            let mut size = buf.len() as u32;
            let ok = QueryFullProcessImageNameW(handle, 0, buf.as_mut_ptr(), &mut size);
            CloseHandle(handle);
            if ok == 0 {
                return None;
            }
            let path = String::from_utf16_lossy(&buf[..size as usize]);
            return path.rsplit(['\\', '/']).next().map(str::to_string);
        }
    }
    #[cfg(not(windows))]
    {
        None
    }
}
