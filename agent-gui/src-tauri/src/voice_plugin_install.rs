use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs::{self, File};
use std::io::{copy, BufRead, BufReader, Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{AppHandle, Emitter};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

static VOICE_INSTALL_IN_FLIGHT: AtomicBool = AtomicBool::new(false);

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct VoicePluginChannel {
    #[serde(rename = "runtimeVersion")]
    runtime_version: String,
    runtime_zip_url: String,
    #[serde(rename = "modelZipUrl")]
    _model_zip_url: String,
    runtime_zip_mirror_url: Option<String>,
    #[serde(rename = "modelZipMirrorUrl")]
    _model_zip_mirror_url: Option<String>,
    runtime_zip_sha256: Option<String>,
    #[serde(rename = "modelZipSha256")]
    _model_zip_sha256: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VoiceInstallProgressEvent {
    pub phase: String,
    pub percent: u8,
    pub message: String,
}

const MANIFEST_JSON: &str = include_str!("../resources/voice-plugin-manifest.json");
const DEFAULT_SETTINGS_JSON: &str = r#"{"autoStart":true,"modelId":"standard","gpuAcceleration":false,"language":"zh-CN","silentStopSeconds":0,"streamingPreview":false,"maxRecordingSeconds":120,"wsPort":6016}"#;

const MODEL_SUBDIR: &str = "sensevoice";
const PARAFORMER_SUBDIR: &str = "paraformer-zh";
const PROGRESS_MARKER: &str = "QUICKER_VOICE_PROGRESS";
const PARAFORMER_MIN_ONNX_BYTES: u64 = 20 * 1024 * 1024;
const PARAFORMER_MIN_TOKENS_BYTES: u64 = 64;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VoiceModelInstallStateDto {
    pub standard: bool,
    pub lightweight: bool,
    pub standard_partial: bool,
    pub lightweight_partial: bool,
}

#[derive(Debug, Deserialize)]
struct ModelFileSpec {
    size: u64,
    sha256: String,
}

#[derive(Debug, Deserialize)]
struct SenseVoiceModelIdentity {
    id: String,
    #[serde(default, rename = "modelscopeResolveBase")]
    _modelscope_resolve_base: Option<String>,
    files: std::collections::HashMap<String, ModelFileSpec>,
}

fn load_sensevoice_identity() -> Result<SenseVoiceModelIdentity, String> {
    let raw = include_str!("../resources/voice-sensevoice-model-identity.json");
    serde_json::from_str(raw).map_err(|e| format!("voice sensevoice model identity invalid: {e}"))
}

use crate::quicker_agent_paths::voice_plugin_root;

fn repo_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../voice-asr-runtime")
}

fn packaged_runtime_dist() -> Option<PathBuf> {
    let dir = repo_root().join("dist/quicker-voice-runtime");
    if dir.join("quicker-voice-runtime.exe").is_file() {
        return dir.canonicalize().ok();
    }
    None
}

fn packaged_model_dir() -> Option<PathBuf> {
    let dir = repo_root().join("models").join(MODEL_SUBDIR);
    if model_dir_ready(&dir) {
        return dir.canonicalize().ok();
    }
    None
}

fn load_channel() -> Result<VoicePluginChannel, String> {
    let raw = include_str!("../resources/voice-plugin-channel.json");
    serde_json::from_str(raw).map_err(|e| format!("voice plugin channel config invalid: {e}"))
}

pub fn channel_runtime_version() -> Result<String, String> {
    Ok(load_channel()?.runtime_version.trim().to_string())
}

fn runtime_version_path(root: &Path) -> PathBuf {
    root.join("runtime-version.txt")
}

pub fn read_installed_runtime_version(root: &Path) -> Option<String> {
    let raw = fs::read_to_string(runtime_version_path(root)).ok()?;
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

fn write_runtime_version(root: &Path, version: &str) -> Result<(), String> {
    fs::write(runtime_version_path(root), format!("{}\n", version.trim()))
        .map_err(|e| e.to_string())
}

fn staging_root(root: &Path) -> PathBuf {
    root.join(".staging")
}

fn staging_runtime_dir(root: &Path) -> PathBuf {
    staging_root(root).join("runtime")
}

fn staging_pending_path(root: &Path) -> PathBuf {
    staging_root(root).join("pending-runtime.json")
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PendingRuntimeStaging {
    runtime_version: String,
}

pub fn voice_install_in_progress() -> bool {
    VOICE_INSTALL_IN_FLIGHT.load(Ordering::SeqCst)
}

pub fn needs_runtime_update(root: &Path) -> bool {
    if !is_installed(root) {
        return false;
    }
    let Ok(channel_version) = channel_runtime_version() else {
        return false;
    };
    match read_installed_runtime_version(root) {
        Some(installed) => installed != channel_version,
        None => {
            // Legacy installs: backfill version marker without re-downloading.
            let _ = write_runtime_version(root, &channel_version);
            false
        }
    }
}

pub fn has_staged_runtime_update(root: &Path) -> bool {
    staging_runtime_dir(root)
        .join("quicker-voice-runtime.exe")
        .is_file()
}

fn emit_progress(app: &AppHandle, phase: &str, percent: u8, message: &str) {
    let _ = app.emit(
        "voice-plugin-install-progress",
        VoiceInstallProgressEvent {
            phase: phase.into(),
            percent,
            message: message.into(),
        },
    );
}

fn remove_dir_all(path: &Path) -> Result<(), String> {
    if !path.exists() {
        return Ok(());
    }
    fs::remove_dir_all(path).map_err(|e| format!("无法清理 {}: {e}", path.display()))
}

fn copy_dir_recursive(from: &Path, to: &Path) -> Result<(), String> {
    fs::create_dir_all(to).map_err(|e| format!("创建目录失败 {}: {e}", to.display()))?;
    for entry in fs::read_dir(from).map_err(|e| format!("读取目录失败 {}: {e}", from.display()))?
    {
        let entry = entry.map_err(|e| e.to_string())?;
        let src = entry.path();
        let dst = to.join(entry.file_name());
        if src.is_dir() {
            copy_dir_recursive(&src, &dst)?;
        } else {
            if let Some(parent) = dst.parent() {
                fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            fs::copy(&src, &dst).map_err(|e| format!("复制 {} 失败: {e}", src.display()))?;
        }
    }
    Ok(())
}

fn runtime_dir(root: &Path) -> PathBuf {
    root.join("runtime")
}

fn model_dir(root: &Path) -> PathBuf {
    root.join("models").join(MODEL_SUBDIR)
}

fn verify_sensevoice_model_identity(dir: &Path) -> Result<(), String> {
    let identity = load_sensevoice_identity()?;

    for (name, spec) in &identity.files {
        let path = dir.join(name);
        if !path.is_file() {
            return Err(format!("模型文件缺失 {name}（期望 {}）", identity.id));
        }
        let meta = fs::metadata(&path).map_err(|e| format!("无法读取 {}: {e}", path.display()))?;
        if meta.len() != spec.size {
            return Err(format!(
                "模型 {name} 大小不匹配（期望 {} 字节，实际 {}）",
                spec.size,
                meta.len()
            ));
        }
        let actual = sha256_hex_file(&path)?;
        if !actual.eq_ignore_ascii_case(spec.sha256.trim()) {
            return Err(format!("模型 {name} 校验失败（非 {}）", identity.id));
        }
    }
    Ok(())
}

pub fn is_sensevoice_model_ready(dir: &Path) -> bool {
    verify_sensevoice_model_identity(dir).is_ok()
}

fn model_dir_ready(dir: &Path) -> bool {
    is_sensevoice_model_ready(dir)
}

fn runtime_ready(root: &Path) -> bool {
    runtime_dir(root)
        .join("quicker-voice-runtime.exe")
        .is_file()
}

fn is_installed(root: &Path) -> bool {
    root.join("manifest.json").is_file() && runtime_ready(root) && model_dir_ready(&model_dir(root))
}

/// Strict install check shared by host status and background tasks.
pub fn is_voice_asr_installed(root: &Path) -> bool {
    is_installed(root)
}

fn write_plugin_metadata(root: &Path) -> Result<(), String> {
    fs::create_dir_all(root).map_err(|e| e.to_string())?;
    fs::write(root.join("manifest.json"), MANIFEST_JSON).map_err(|e| e.to_string())?;
    let settings_path = root.join("settings.json");
    if !settings_path.is_file() {
        fs::write(settings_path, DEFAULT_SETTINGS_JSON).map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn sha256_hex_file(path: &Path) -> Result<String, String> {
    let mut file = File::open(path).map_err(|e| format!("无法读取 {}: {e}", path.display()))?;
    let mut hasher = Sha256::new();
    let mut buffer = [0u8; 64 * 1024];
    loop {
        let n = file.read(&mut buffer).map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        hasher.update(&buffer[..n]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}

fn verify_sha256(path: &Path, expected: Option<&str>, label: &str) -> Result<(), String> {
    let Some(expected) = expected.map(str::trim).filter(|value| !value.is_empty()) else {
        return Ok(());
    };
    let actual = sha256_hex_file(path)?;
    if !actual.eq_ignore_ascii_case(expected) {
        return Err(format!("{label}校验失败（sha256 不匹配）。请重试安装。"));
    }
    Ok(())
}

fn download_file(
    app: &AppHandle,
    phase: &str,
    label: &str,
    url: &str,
    dest: &Path,
    percent_start: u8,
    percent_end: u8,
) -> Result<(), String> {
    emit_progress(app, phase, percent_start, &format!("正在下载{label}…"));

    let response = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(900))
        .build()
        .map_err(|e| e.to_string())?
        .get(url)
        .send()
        .map_err(|e| format!("下载{label}失败: {e}"))?;

    if !response.status().is_success() {
        return Err(format!(
            "下载{label}失败 (HTTP {}): {url}",
            response.status()
        ));
    }

    let total = response.content_length().unwrap_or(0);
    let span = (percent_end - percent_start) as u64;
    let mut reader = response;
    let mut file = File::create(dest).map_err(|e| format!("无法写入临时文件: {e}"))?;
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
                phase,
                pct.min(percent_end as u64) as u8,
                &format!(
                    "正在下载{label}… {} / {} MB",
                    downloaded / (1024 * 1024),
                    total / (1024 * 1024)
                ),
            );
        }
    }

    Ok(())
}

fn download_urls(mirror: Option<&str>, primary: &str) -> Vec<String> {
    let mut urls = Vec::new();
    if let Some(url) = mirror.map(str::trim).filter(|s| !s.is_empty()) {
        urls.push(url.to_string());
    }
    urls.push(primary.trim().to_string());
    urls
}

fn download_file_with_fallback(
    app: &AppHandle,
    phase: &str,
    label: &str,
    urls: &[String],
    dest: &Path,
    percent_start: u8,
    percent_end: u8,
) -> Result<(), String> {
    if urls.is_empty() {
        return Err(format!("缺少{label}下载地址"));
    }

    let mut errors = Vec::new();
    for (index, url) in urls.iter().enumerate() {
        if index > 0 {
            emit_progress(
                app,
                phase,
                percent_start,
                &format!("国内源不可用，正在切换备用下载{label}…"),
            );
        }
        match download_file(app, phase, label, url, dest, percent_start, percent_end) {
            Ok(()) => return Ok(()),
            Err(err) => errors.push(format!("{url}: {err}")),
        }
        let _ = fs::remove_file(dest);
    }

    Err(format!("下载{label}失败: {}", errors.join(" | ")))
}

fn extract_zip(app: &AppHandle, zip_path: &Path, dest: &Path, label: &str) -> Result<(), String> {
    emit_progress(app, "extract", 0, &format!("正在解压{label}…"));
    remove_dir_all(dest)?;
    fs::create_dir_all(dest).map_err(|e| e.to_string())?;

    let file = File::open(zip_path).map_err(|e| e.to_string())?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| format!("无效的 zip: {e}"))?;

    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).map_err(|e| e.to_string())?;
        let Some(relative) = entry.enclosed_name() else {
            continue;
        };
        let out_path = dest.join(relative);
        if entry.is_dir() {
            fs::create_dir_all(&out_path).map_err(|e| e.to_string())?;
            continue;
        }
        if let Some(parent) = out_path.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let mut out_file = File::create(&out_path).map_err(|e| e.to_string())?;
        copy(&mut entry, &mut out_file).map_err(|e| e.to_string())?;
    }

    Ok(())
}

fn paraformer_model_dir(root: &Path) -> PathBuf {
    root.join("models").join(PARAFORMER_SUBDIR)
}

fn paraformer_model_ready(dir: &Path) -> bool {
    let tokens = dir.join("tokens.txt");
    let onnx = if dir.join("model.int8.onnx").is_file() {
        dir.join("model.int8.onnx")
    } else if dir.join("model.onnx").is_file() {
        dir.join("model.onnx")
    } else {
        return false;
    };
    fs::metadata(&tokens)
        .map(|meta| meta.len() >= PARAFORMER_MIN_TOKENS_BYTES)
        .unwrap_or(false)
        && fs::metadata(&onnx)
            .map(|meta| meta.len() >= PARAFORMER_MIN_ONNX_BYTES)
            .unwrap_or(false)
}

fn standard_model_ready(root: &Path) -> bool {
    model_dir_ready(&model_dir(root))
}

fn lightweight_model_ready(root: &Path) -> bool {
    paraformer_model_ready(&paraformer_model_dir(root))
}

fn dir_has_partial_entries(dir: &Path, ready: bool) -> bool {
    if ready || !dir.is_dir() {
        return false;
    }
    let Ok(entries) = fs::read_dir(dir) else {
        return false;
    };
    entries.filter_map(Result::ok).any(|entry| {
        let name = entry.file_name();
        let name = name.to_string_lossy();
        !name.is_empty() && name != ".gitkeep" && name != "README.md"
    })
}

pub fn voice_model_install_state(root: &Path) -> VoiceModelInstallStateDto {
    let standard = standard_model_ready(root);
    let lightweight = lightweight_model_ready(root);
    VoiceModelInstallStateDto {
        standard,
        lightweight,
        standard_partial: dir_has_partial_entries(&model_dir(root), standard),
        lightweight_partial: dir_has_partial_entries(&paraformer_model_dir(root), lightweight),
    }
}

fn preset_from_model_id(model_id: &str) -> &'static str {
    match model_id.trim().to_ascii_lowercase().as_str() {
        "lightweight" | "paraformer" | "paraformer-zh" => "paraformer",
        _ => "sensevoice",
    }
}

fn parse_download_progress_line(line: &str) -> Option<(u8, String)> {
    let trimmed = line.trim();
    let rest = trimmed.strip_prefix(&format!("{PROGRESS_MARKER}\t"))?;
    let mut parts = rest.splitn(2, '\t');
    let pct_str = parts.next()?;
    let message = parts.next()?.trim();
    if message.is_empty() {
        return None;
    }
    let pct = pct_str.parse::<u16>().ok()?;
    Some((pct.min(100) as u8, message.to_string()))
}

fn runtime_exe_for_download(plugin_root: &Path) -> Option<PathBuf> {
    let installed = runtime_dir(plugin_root).join("quicker-voice-runtime.exe");
    if installed.is_file() {
        return Some(installed);
    }
    packaged_runtime_dist()
        .map(|dir| dir.join("quicker-voice-runtime.exe"))
        .filter(|path| path.is_file())
}

fn run_download_command_with_progress(app: &AppHandle, mut cmd: Command) -> Result<(), String> {
    cmd.stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("启动模型下载失败: {e}"))?;

    let stderr_handle = child.stderr.take();
    if let Some(stdout) = child.stdout.take() {
        let reader = BufReader::new(stdout);
        for line in reader.lines() {
            let line = line.map_err(|e| e.to_string())?;
            if let Some((percent, message)) = parse_download_progress_line(&line) {
                emit_progress(app, "download", percent, &message);
            }
        }
    }

    let status = child
        .wait()
        .map_err(|e| format!("模型下载进程异常: {e}"))?;

    if status.success() {
        return Ok(());
    }

    let stderr = if let Some(mut stderr_pipe) = stderr_handle {
        let mut buf = String::new();
        let _ = stderr_pipe.read_to_string(&mut buf);
        buf
    } else {
        String::new()
    };
    let stderr = stderr.as_str();
    let tail: String = stderr
        .lines()
        .rev()
        .take(3)
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .collect::<Vec<_>>()
        .join(" ");
    Err(if tail.trim().is_empty() {
        format!("模型下载失败（退出码 {:?}）", status.code())
    } else {
        tail.trim().to_string()
    })
}

fn run_uv_download_model(
    app: &AppHandle,
    plugin_root: &Path,
    preset: &str,
    force: bool,
) -> Result<(), String> {
    let repo = repo_root();
    if !repo.join("pyproject.toml").is_file() {
        return Err("未找到 voice-asr-runtime 开发目录".into());
    }
    let plugin_str = plugin_root
        .to_str()
        .ok_or_else(|| "插件路径无效".to_string())?;
    let repo_str = repo
        .to_str()
        .ok_or_else(|| "开发目录路径无效".to_string())?;

    let mut cmd = Command::new("uv");
    cmd.args([
        "run",
        "--directory",
        repo_str,
        "download-asr-model",
        "--preset",
        preset,
        "--root",
        plugin_str,
    ]);
    if force {
        cmd.arg("--force");
    }
    cmd.env("QUICKER_VOICE_PLUGIN_ROOT", plugin_root);
    cmd.env("PYTHONUTF8", "1");
    cmd.env("PYTHONIOENCODING", "utf-8");
    run_download_command_with_progress(app, cmd)
}

fn run_packaged_download_model(
    app: &AppHandle,
    plugin_root: &Path,
    preset: &str,
    force: bool,
) -> Result<(), String> {
    let exe = runtime_exe_for_download(plugin_root).ok_or_else(|| {
        "语音识别服务未安装，请先安装 Runtime".to_string()
    })?;
    let plugin_str = plugin_root
        .to_str()
        .ok_or_else(|| "插件路径无效".to_string())?;

    let mut cmd = Command::new(&exe);
    cmd.args([
        "download-model",
        "--preset",
        preset,
        "--root",
        plugin_str,
    ]);
    if force {
        cmd.arg("--force");
    }
    let work_dir = exe
        .parent()
        .map(Path::to_path_buf)
        .unwrap_or_else(|| runtime_dir(plugin_root));
    cmd.current_dir(&work_dir);
    cmd.env("QUICKER_VOICE_PLUGIN_ROOT", plugin_root);
    cmd.env("PYTHONUTF8", "1");
    cmd.env("PYTHONIOENCODING", "utf-8");
    run_download_command_with_progress(app, cmd)
}

pub fn download_asr_model(
    app: &AppHandle,
    plugin_root: &Path,
    preset: &str,
    force: bool,
) -> Result<(), String> {
    emit_progress(
        app,
        "prepare",
        0,
        if force {
            "准备重新下载模型…"
        } else {
            "准备下载模型…"
        },
    );

    if runtime_exe_for_download(plugin_root).is_some() {
        run_packaged_download_model(app, plugin_root, preset, force)?;
    } else if cfg!(debug_assertions) {
        run_uv_download_model(app, plugin_root, preset, force)?;
    } else {
        return Err("语音识别服务未安装，请先安装 Runtime".into());
    }

    let ready = if preset == "paraformer" {
        lightweight_model_ready(plugin_root)
    } else {
        standard_model_ready(plugin_root)
    };
    if !ready {
        return Err("模型下载结束但校验未通过，请重试".into());
    }

    emit_progress(app, "done", 100, "模型下载完成");
    Ok(())
}

pub fn download_asr_model_by_id(
    app: &AppHandle,
    model_id: &str,
    force: bool,
) -> Result<(), String> {
    let root = voice_plugin_root();
    download_asr_model(app, &root, preset_from_model_id(model_id), force)
}

fn install_runtime_from_local(app: &AppHandle, src: &Path, root: &Path) -> Result<(), String> {
    emit_progress(app, "runtime", 15, "正在复制语音识别服务…");
    let dest = runtime_dir(root);
    remove_dir_all(&dest)?;
    copy_dir_recursive(src, &dest)?;
    if !runtime_ready(root) {
        return Err("本地 Runtime 复制后缺少 quicker-voice-runtime.exe".into());
    }
    Ok(())
}

fn install_model_from_local(app: &AppHandle, src: &Path, root: &Path) -> Result<(), String> {
    emit_progress(app, "model", 60, "正在复制识别模型…");
    let dest = model_dir(root);
    remove_dir_all(&dest)?;
    copy_dir_recursive(src, &dest)?;
    if !model_dir_ready(&dest) {
        return Err("本地模型复制后文件不完整".into());
    }
    Ok(())
}

fn install_runtime_from_url(
    app: &AppHandle,
    channel: &VoicePluginChannel,
    root: &Path,
    temp_dir: &Path,
) -> Result<(), String> {
    let zip_path = temp_dir.join("runtime.zip");
    let urls = download_urls(
        channel.runtime_zip_mirror_url.as_deref(),
        &channel.runtime_zip_url,
    );
    download_file_with_fallback(app, "runtime", "语音识别服务", &urls, &zip_path, 10, 45)?;
    verify_sha256(
        &zip_path,
        channel.runtime_zip_sha256.as_deref(),
        "语音识别服务",
    )?;
    extract_zip(app, &zip_path, &runtime_dir(root), "语音识别服务")?;
    if !runtime_ready(root) {
        return Err("Runtime 解压后缺少 quicker-voice-runtime.exe".into());
    }
    Ok(())
}

pub fn stage_runtime_upgrade(app: &AppHandle) -> Result<(), String> {
    let root = voice_plugin_root();
    if !is_installed(&root) || !needs_runtime_update(&root) {
        return Ok(());
    }
    if has_staged_runtime_update(&root) {
        return Ok(());
    }

    let channel = load_channel()?;
    let temp_dir =
        std::env::temp_dir().join(format!("quicker-voice-asr-upgrade-{}", std::process::id()));
    fs::create_dir_all(&temp_dir).map_err(|e| e.to_string())?;

    let staging = staging_runtime_dir(&root);
    remove_dir_all(&staging)?;

    let result = (|| {
        emit_progress(app, "prepare", 5, "准备更新语音识别服务…");
        let zip_path = temp_dir.join("runtime.zip");
        let urls = download_urls(
            channel.runtime_zip_mirror_url.as_deref(),
            &channel.runtime_zip_url,
        );
        download_file_with_fallback(app, "runtime", "语音识别服务", &urls, &zip_path, 10, 85)?;
        verify_sha256(
            &zip_path,
            channel.runtime_zip_sha256.as_deref(),
            "语音识别服务",
        )?;
        extract_zip(app, &zip_path, &staging, "语音识别服务")?;
        if !staging.join("quicker-voice-runtime.exe").is_file() {
            return Err("Runtime 更新包无效".into());
        }
        fs::create_dir_all(staging_root(&root)).map_err(|e| e.to_string())?;
        let pending = PendingRuntimeStaging {
            runtime_version: channel.runtime_version.clone(),
        };
        let json = serde_json::to_string_pretty(&pending).map_err(|e| e.to_string())?;
        fs::write(staging_pending_path(&root), json).map_err(|e| e.to_string())?;
        emit_progress(app, "ready", 95, "语音服务更新已下载，正在应用…");
        Ok(())
    })();

    let _ = fs::remove_dir_all(&temp_dir);
    result
}

pub fn apply_pending_runtime_upgrade() -> Result<(), String> {
    let root = voice_plugin_root();
    if !has_staged_runtime_update(&root) {
        return Ok(());
    }

    let pending_raw = fs::read_to_string(staging_pending_path(&root)).ok();
    let pending: Option<PendingRuntimeStaging> = pending_raw
        .as_deref()
        .and_then(|raw| serde_json::from_str(raw).ok());
    let staging = staging_runtime_dir(&root);
    let live = runtime_dir(&root);

    remove_dir_all(&live)?;
    copy_dir_recursive(&staging, &live)?;
    if let Some(pending) = pending {
        write_runtime_version(&root, &pending.runtime_version)?;
    } else if let Ok(version) = channel_runtime_version() {
        write_runtime_version(&root, &version)?;
    }

    remove_dir_all(&staging_root(&root))?;
    Ok(())
}

pub fn run_voice_plugin_install(app: &AppHandle) -> Result<PathBuf, String> {
    if VOICE_INSTALL_IN_FLIGHT
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return Err("语音插件正在安装中，请稍候".into());
    }

    let result = run_voice_plugin_install_inner(app);
    VOICE_INSTALL_IN_FLIGHT.store(false, Ordering::SeqCst);
    result
}

fn run_voice_plugin_install_inner(app: &AppHandle) -> Result<PathBuf, String> {
    let root = voice_plugin_root();
    if is_installed(&root) {
        return Ok(root);
    }

    emit_progress(app, "prepare", 5, "准备安装…");
    fs::create_dir_all(&root).map_err(|e| e.to_string())?;

    let temp_dir = std::env::temp_dir().join(format!("quicker-voice-asr-{}", std::process::id()));
    fs::create_dir_all(&temp_dir).map_err(|e| e.to_string())?;

    let need_runtime = !runtime_ready(&root);
    let need_model = !model_dir_ready(&model_dir(&root));

    let result: Result<(), String> = (|| {
        if need_runtime {
            let local_runtime = packaged_runtime_dist();
            if let Some(src) = local_runtime {
                install_runtime_from_local(app, &src, &root)?;
            } else if let Ok(path) = std::env::var("QUICKER_VOICE_RUNTIME_ZIP_PATH") {
                let zip = PathBuf::from(path);
                extract_zip(app, &zip, &runtime_dir(&root), "语音识别服务")?;
                if !runtime_ready(&root) {
                    return Err("Runtime zip 无效".into());
                }
            } else {
                let channel = load_channel()?;
                install_runtime_from_url(app, &channel, &root, &temp_dir)?;
            }
        }

        if need_model {
            let local_model = packaged_model_dir();
            if let Some(src) = local_model {
                install_model_from_local(app, &src, &root)?;
            } else {
                download_asr_model(app, &root, "sensevoice", false)?;
            }
        }

        emit_progress(app, "manifest", 92, "写入配置…");
        write_plugin_metadata(&root)?;

        if !is_installed(&root) {
            return Err("安装未完成，请重试".into());
        }

        if let Ok(version) = channel_runtime_version() {
            write_runtime_version(&root, &version)?;
        }

        emit_progress(app, "done", 100, "安装完成，正在启动…");
        Ok(())
    })();

    let _ = fs::remove_dir_all(&temp_dir);
    result?;
    Ok(root)
}

/// Re-download a voice ASR model via quicker-voice-runtime download-model.
pub fn redownload_voice_model(app: &AppHandle, model_id: &str, force: bool) -> Result<(), String> {
    download_asr_model_by_id(app, model_id, force)
}
