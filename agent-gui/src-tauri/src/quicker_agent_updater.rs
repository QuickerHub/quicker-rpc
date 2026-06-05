use serde::{Deserialize, Serialize};
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{AppHandle, Emitter};

use crate::quicker_agent_paths::quicker_agent_app_data_dir;

const VERSION_TXT_URL: &str =
    "https://s3.bitiful.net/quicker-pkgs/quicker-rpc/quicker-agent/version.txt";
const DOWNLOAD_PREFIX: &str =
    "https://s3.bitiful.net/quicker-pkgs/quicker-rpc/quicker-agent";

static DOWNLOAD_IN_FLIGHT: AtomicBool = AtomicBool::new(false);

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QuickerAgentUpdateStatusDto {
    pub phase: String,
    pub installed_version: String,
    pub remote_version: Option<String>,
    pub download_url: Option<String>,
    pub download_percent: u8,
    pub message: Option<String>,
    pub pending_apply_on_exit: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct QuickerAgentUpdateProgressEvent {
    phase: String,
    percent: u8,
    message: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PendingUpdateManifest {
    remote_version: String,
    setup_path: String,
    download_url: String,
}

fn updates_dir() -> PathBuf {
    quicker_agent_app_data_dir().join("updates")
}

fn pending_manifest_path() -> PathBuf {
    updates_dir().join("pending.json")
}

fn skipped_version_path() -> PathBuf {
    updates_dir().join("skipped-version.txt")
}

fn installed_version(app: &AppHandle) -> String {
    app.package_info().version.to_string()
}

fn parse_semver(value: &str) -> Option<(u32, u32, u32)> {
    let trimmed = value.trim().trim_start_matches(['v', 'V']);
    let mut parts = trimmed.split('.');
    let major = parts.next()?.parse().ok()?;
    let minor = parts.next()?.parse().ok()?;
    let patch = parts.next()?.parse().ok()?;
    if parts.next().is_some() {
        return None;
    }
    Some((major, minor, patch))
}

fn compare_semver(left: &str, right: &str) -> i32 {
    match (parse_semver(left), parse_semver(right)) {
        (Some(a), Some(b)) => {
            for i in 0..3 {
                let av = [a.0, a.1, a.2][i];
                let bv = [b.0, b.1, b.2][i];
                if av != bv {
                    return av as i32 - bv as i32;
                }
            }
            0
        }
        (Some(_), None) => 1,
        (None, Some(_)) => -1,
        (None, None) => 0,
    }
}

fn build_download_url(remote_version: &str) -> String {
    format!(
        "{DOWNLOAD_PREFIX}/quicker-agent-{}-x64-setup.exe",
        remote_version.trim()
    )
}

fn setup_file_name(remote_version: &str) -> String {
    format!("quicker-agent-{}-x64-setup.exe", remote_version.trim())
}

fn emit_progress(app: &AppHandle, phase: &str, percent: u8, message: &str) {
    let _ = app.emit(
        "quicker-agent-update-progress",
        QuickerAgentUpdateProgressEvent {
            phase: phase.into(),
            percent,
            message: message.into(),
        },
    );
}

fn emit_status(app: &AppHandle, dto: &QuickerAgentUpdateStatusDto) {
    let _ = app.emit("quicker-agent-update-status", dto.clone());
}

fn read_skipped_version() -> Option<String> {
    let raw = fs::read_to_string(skipped_version_path()).ok()?;
    let trimmed = raw.trim();
    if trimmed.is_empty() || parse_semver(trimmed).is_none() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

fn write_skipped_version(version: &str) -> Result<(), String> {
    fs::create_dir_all(updates_dir()).map_err(|e| e.to_string())?;
    fs::write(skipped_version_path(), version.trim()).map_err(|e| e.to_string())
}

fn read_pending_manifest() -> Option<PendingUpdateManifest> {
    let raw = fs::read_to_string(pending_manifest_path()).ok()?;
    serde_json::from_str(&raw).ok()
}

fn write_pending_manifest(manifest: &PendingUpdateManifest) -> Result<(), String> {
    fs::create_dir_all(updates_dir()).map_err(|e| e.to_string())?;
    let json = serde_json::to_string_pretty(manifest).map_err(|e| e.to_string())?;
    fs::write(pending_manifest_path(), json).map_err(|e| e.to_string())
}

fn clear_pending_manifest() {
    let _ = fs::remove_file(pending_manifest_path());
}

fn fetch_remote_version() -> Result<String, String> {
    let response = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())?
        .get(VERSION_TXT_URL)
        .header("Accept", "text/plain")
        .send()
        .map_err(|e| format!("读取 version.txt 失败: {e}"))?;

    if !response.status().is_success() {
        return Err(format!("version.txt HTTP {}", response.status()));
    }

    let text = response.text().map_err(|e| e.to_string())?;
    let trimmed = text.trim();
    if parse_semver(trimmed).is_none() {
        return Err("version.txt 内容无效".into());
    }
    Ok(trimmed.to_string())
}

fn download_setup(
    app: &AppHandle,
    url: &str,
    dest: &Path,
    percent_start: u8,
    percent_end: u8,
) -> Result<(), String> {
    emit_progress(app, "downloading", percent_start, "正在下载 QuickerAgent 更新…");

    let response = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(900))
        .build()
        .map_err(|e| e.to_string())?
        .get(url)
        .send()
        .map_err(|e| format!("下载更新失败: {e}"))?;

    if !response.status().is_success() {
        return Err(format!("下载更新失败 (HTTP {}): {url}", response.status()));
    }

    let total = response.content_length().unwrap_or(0);
    let span = (percent_end - percent_start) as u64;
    let mut reader = response;
    let mut file = File::create(dest).map_err(|e| format!("无法写入更新包: {e}"))?;
    let mut buffer = [0u8; 64 * 1024];
    let mut downloaded: u64 = 0;

    loop {
        let n = reader.read(&mut buffer).map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        file.write_all(&buffer[..n]).map_err(|e| e.to_string())?;
        downloaded += n as u64;
        if total > 0 {
            let pct = percent_start as u64 + (downloaded * span / total);
            emit_progress(
                app,
                "downloading",
                pct.min(percent_end as u64) as u8,
                &format!(
                    "正在下载 QuickerAgent 更新… {} / {} MB",
                    downloaded / (1024 * 1024),
                    total / (1024 * 1024)
                ),
            );
        }
    }

    Ok(())
}

pub fn build_status(app: &AppHandle) -> QuickerAgentUpdateStatusDto {
    let installed = installed_version(app);
    if let Some(pending) = read_pending_manifest() {
        let setup = PathBuf::from(&pending.setup_path);
        if setup.is_file() && setup.metadata().map(|m| m.len()).unwrap_or(0) > 0 {
            return QuickerAgentUpdateStatusDto {
                phase: "ready".into(),
                installed_version: installed,
                remote_version: Some(pending.remote_version),
                download_url: Some(pending.download_url),
                download_percent: 100,
                message: Some("更新已就绪，退出后将自动安装".into()),
                pending_apply_on_exit: true,
            };
        }
        clear_pending_manifest();
    }

    QuickerAgentUpdateStatusDto {
        phase: "idle".into(),
        installed_version: installed,
        remote_version: None,
        download_url: None,
        download_percent: 0,
        message: None,
        pending_apply_on_exit: false,
    }
}

fn run_background_update(app: &AppHandle) {
    if cfg!(debug_assertions) {
        return;
    }
    if DOWNLOAD_IN_FLIGHT
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return;
    }

    let result = (|| -> Result<(), String> {
        emit_progress(app, "checking", 0, "正在检查 QuickerAgent 更新…");
        let installed = installed_version(app);
        let remote = fetch_remote_version()?;
        if compare_semver(&remote, &installed) <= 0 {
            emit_status(app, &build_status(app));
            return Ok(());
        }

        if read_skipped_version().as_deref() == Some(remote.as_str()) {
            emit_status(app, &build_status(app));
            return Ok(());
        }

        if let Some(pending) = read_pending_manifest() {
            if pending.remote_version == remote {
                let setup = PathBuf::from(&pending.setup_path);
                if setup.is_file() {
                    emit_status(
                        app,
                        &QuickerAgentUpdateStatusDto {
                            phase: "ready".into(),
                            installed_version: installed.clone(),
                            remote_version: Some(remote.clone()),
                            download_url: Some(pending.download_url),
                            download_percent: 100,
                            message: Some("更新已就绪，退出后将自动安装".into()),
                            pending_apply_on_exit: true,
                        },
                    );
                    return Ok(());
                }
            }
            clear_pending_manifest();
        }

        let download_url = build_download_url(&remote);
        fs::create_dir_all(updates_dir()).map_err(|e| e.to_string())?;
        let setup_path = updates_dir().join(setup_file_name(&remote));
        if setup_path.is_file() {
            let _ = fs::remove_file(&setup_path);
        }

        download_setup(app, &download_url, &setup_path, 5, 95)?;

        if !setup_path.is_file() {
            return Err("更新包下载未完成".into());
        }

        write_pending_manifest(&PendingUpdateManifest {
            remote_version: remote.clone(),
            setup_path: setup_path.to_string_lossy().into_owned(),
            download_url: download_url.clone(),
        })?;

        emit_progress(app, "ready", 100, "更新已下载，退出后将自动安装");
        emit_status(
            app,
            &QuickerAgentUpdateStatusDto {
                phase: "ready".into(),
                installed_version: installed,
                remote_version: Some(remote),
                download_url: Some(download_url),
                download_percent: 100,
                message: Some("更新已就绪，退出后将自动安装".into()),
                pending_apply_on_exit: true,
            },
        );
        Ok(())
    })();

    if let Err(err) = result {
        emit_status(
            app,
            &QuickerAgentUpdateStatusDto {
                phase: "error".into(),
                installed_version: installed_version(app),
                remote_version: None,
                download_url: None,
                download_percent: 0,
                message: Some(err),
                pending_apply_on_exit: false,
            },
        );
    }

    DOWNLOAD_IN_FLIGHT.store(false, Ordering::SeqCst);
}

pub fn spawn_background_update_check(app: AppHandle) {
    if cfg!(debug_assertions) {
        return;
    }
    std::thread::spawn(move || run_background_update(&app));
}

pub fn apply_pending_on_exit() {
    if cfg!(debug_assertions) {
        return;
    }
    let Some(manifest) = read_pending_manifest() else {
        return;
    };
    let setup = PathBuf::from(&manifest.setup_path);
    if !setup.is_file() {
        clear_pending_manifest();
        return;
    }

    #[cfg(windows)]
    {
        let _ = Command::new(&setup)
            .args(["/S", "/R"])
            .spawn();
    }
    #[cfg(not(windows))]
    {
        let _ = Command::new(&setup).spawn();
    }
}

#[tauri::command]
pub fn quicker_agent_update_status(app: AppHandle) -> QuickerAgentUpdateStatusDto {
    build_status(&app)
}

#[tauri::command]
pub fn quicker_agent_update_skip_version(app: AppHandle, version: String) -> QuickerAgentUpdateStatusDto {
    if parse_semver(&version).is_some() {
        let _ = write_skipped_version(&version);
        clear_pending_manifest();
    }
    build_status(&app)
}

#[tauri::command]
pub fn quicker_agent_update_apply_and_exit(app: AppHandle) -> Result<(), String> {
    if cfg!(debug_assertions) {
        return Err("开发模式不支持自动安装".into());
    }
    let manifest = read_pending_manifest().ok_or_else(|| "没有待安装的更新".to_string())?;
    let setup = PathBuf::from(&manifest.setup_path);
    if !setup.is_file() {
        clear_pending_manifest();
        return Err("更新包不存在，请重新启动应用以下载".into());
    }

    #[cfg(windows)]
    {
        Command::new(&setup)
            .args(["/S", "/R"])
            .spawn()
            .map_err(|e| format!("无法启动安装程序: {e}"))?;
    }
    #[cfg(not(windows))]
    {
        Command::new(&setup)
            .spawn()
            .map_err(|e| format!("无法启动安装程序: {e}"))?;
    }

    app.exit(0);
    Ok(())
}
