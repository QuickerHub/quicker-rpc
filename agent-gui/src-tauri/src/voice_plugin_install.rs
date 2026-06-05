use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs::{self, File};
use std::io::{copy, Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{AppHandle, Emitter};

static VOICE_INSTALL_IN_FLIGHT: AtomicBool = AtomicBool::new(false);

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct VoicePluginChannel {
    #[serde(rename = "runtimeVersion")]
    runtime_version: String,
    runtime_zip_url: String,
    model_zip_url: String,
    runtime_zip_mirror_url: Option<String>,
    model_zip_mirror_url: Option<String>,
    runtime_zip_sha256: Option<String>,
    model_zip_sha256: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VoiceInstallProgressEvent {
    pub phase: String,
    pub percent: u8,
    pub message: String,
}

const MANIFEST_JSON: &str = include_str!("../resources/voice-plugin-manifest.json");
const DEFAULT_SETTINGS_JSON: &str =
    r#"{"autoStart":true,"modelId":"standard","language":"zh-CN","silentStopSeconds":0,"streamingPreview":false,"maxRecordingSeconds":120,"wsPort":6016}"#;

const MODEL_SUBDIR: &str = "sensevoice";

#[derive(Debug, Deserialize)]
struct ModelFileSpec {
    size: u64,
    sha256: String,
}

#[derive(Debug, Deserialize)]
struct SenseVoiceModelIdentity {
    id: String,
    #[serde(default, rename = "modelscopeResolveBase")]
    modelscope_resolve_base: Option<String>,
    files: std::collections::HashMap<String, ModelFileSpec>,
}

const DEFAULT_MODELSCOPE_RESOLVE_BASE: &str =
    "https://www.modelscope.cn/models/pengzhendong/sherpa-onnx-sense-voice-zh-en-ja-ko-yue/resolve/master";

fn load_sensevoice_identity() -> Result<SenseVoiceModelIdentity, String> {
    let raw = include_str!("../resources/voice-sensevoice-model-identity.json");
    serde_json::from_str(raw).map_err(|e| format!("voice sensevoice model identity invalid: {e}"))
}

fn modelscope_resolve_base(identity: &SenseVoiceModelIdentity) -> &str {
    identity
        .modelscope_resolve_base
        .as_deref()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or(DEFAULT_MODELSCOPE_RESOLVE_BASE)
}

use crate::quicker_agent_paths::voice_plugin_root;

fn repo_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../voice-asr-runtime")
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
    for entry in fs::read_dir(from).map_err(|e| format!("读取目录失败 {}: {e}", from.display()))? {
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
            return Err(format!(
                "模型 {name} 校验失败（非 {}）",
                identity.id
            ));
        }
    }
    Ok(())
}

fn model_dir_ready(dir: &Path) -> bool {
    verify_sensevoice_model_identity(dir).is_ok()
}

fn runtime_ready(root: &Path) -> bool {
    runtime_dir(root)
        .join("quicker-voice-runtime.exe")
        .is_file()
}

fn is_installed(root: &Path) -> bool {
    root.join("manifest.json").is_file() && runtime_ready(root) && model_dir_ready(&model_dir(root))
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
        return Err(format!(
            "{label}校验失败（sha256 不匹配）。请重试安装。"
        ));
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
    emit_progress(
        app,
        phase,
        percent_start,
        &format!("正在下载{label}…"),
    );

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

fn download_urls(
    mirror: Option<&str>,
    primary: &str,
) -> Vec<String> {
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
        match download_file(
            app,
            phase,
            label,
            url,
            dest,
            percent_start,
            percent_end,
        ) {
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

fn normalize_model_layout(dest: &Path) -> Result<(), String> {
    if model_dir_ready(dest) {
        return Ok(());
    }
    let nested = dest.join(MODEL_SUBDIR);
    if model_dir_ready(&nested) {
        for entry in fs::read_dir(&nested).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            let target = dest.join(entry.file_name());
            if target.exists() {
                if target.is_dir() {
                    remove_dir_all(&target)?;
                } else {
                    fs::remove_file(&target).map_err(|e| e.to_string())?;
                }
            }
            if entry.path().is_dir() {
                copy_dir_recursive(&entry.path(), &target)?;
            } else {
                fs::copy(&entry.path(), &target).map_err(|e| e.to_string())?;
            }
        }
        remove_dir_all(&nested)?;
    }
    if model_dir_ready(dest) {
        Ok(())
    } else {
        Err("模型文件不完整（缺少 tokens.txt 或 model.onnx）".into())
    }
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
    download_file_with_fallback(
        app,
        "runtime",
        "语音识别服务",
        &urls,
        &zip_path,
        10,
        45,
    )?;
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

fn install_model_from_modelscope(app: &AppHandle, root: &Path) -> Result<(), String> {
    let identity = load_sensevoice_identity()?;
    let dest = model_dir(root);
    remove_dir_all(&dest)?;
    fs::create_dir_all(&dest).map_err(|e| e.to_string())?;

    emit_progress(
        app,
        "model",
        50,
        &format!("正在从 ModelScope 下载识别模型（{}）…", identity.id),
    );

    let base = modelscope_resolve_base(&identity).trim_end_matches('/');
    let mut file_names: Vec<String> = identity.files.keys().cloned().collect();
    file_names.sort_by(|a, b| {
        identity.files[a].size.cmp(&identity.files[b].size)
    });

    let file_count = file_names.len().max(1) as u8;
    for (index, name) in file_names.iter().enumerate() {
        let spec = identity
            .files
            .get(name)
            .ok_or_else(|| format!("模型配置缺少 {name}"))?;
        let url = format!("{base}/{name}");
        let label = if name == "model.int8.onnx" {
            "识别模型 (ModelScope)"
        } else {
            "识别模型词表 (ModelScope)"
        };
        let span = 85_u8.saturating_sub(50);
        let start = 50 + (span * index as u8 / file_count);
        let end = 50 + (span * (index as u8 + 1) / file_count);
        download_file(
            app,
            "model",
            label,
            &url,
            &dest.join(name),
            start.max(50),
            end.max(start + 1).min(85),
        )?;
        let actual = sha256_hex_file(&dest.join(name))?;
        if !actual.eq_ignore_ascii_case(spec.sha256.trim()) {
            return Err(format!("ModelScope 下载的 {name} 校验失败"));
        }
    }

    verify_sensevoice_model_identity(&dest)?;
    Ok(())
}

fn install_model_from_zip_channel(
    app: &AppHandle,
    channel: &VoicePluginChannel,
    root: &Path,
    temp_dir: &Path,
) -> Result<(), String> {
    let zip_path = temp_dir.join("model.zip");
    let urls = download_urls(
        channel.model_zip_mirror_url.as_deref(),
        &channel.model_zip_url,
    );
    download_file_with_fallback(
        app,
        "model",
        "识别模型 (备用包)",
        &urls,
        &zip_path,
        50,
        85,
    )?;
    verify_sha256(
        &zip_path,
        channel.model_zip_sha256.as_deref(),
        "识别模型",
    )?;
    let dest = model_dir(root);
    extract_zip(app, &zip_path, &dest, "识别模型")?;
    normalize_model_layout(&dest)?;
    verify_sensevoice_model_identity(&dest)?;
    Ok(())
}

fn install_model_from_network(
    app: &AppHandle,
    channel: &VoicePluginChannel,
    root: &Path,
    temp_dir: &Path,
) -> Result<(), String> {
    match install_model_from_modelscope(app, root) {
        Ok(()) => return Ok(()),
        Err(modelscope_err) => {
            emit_progress(
                app,
                "model",
                50,
                "ModelScope 不可用，正在切换 Bitiful / GitHub 备用源…",
            );
            let _ = remove_dir_all(&model_dir(root));
            install_model_from_zip_channel(app, channel, root, temp_dir).map_err(|zip_err| {
                format!("ModelScope: {modelscope_err} | 备用包: {zip_err}")
            })
        }
    }
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
    let temp_dir = std::env::temp_dir().join(format!(
        "quicker-voice-asr-upgrade-{}",
        std::process::id()
    ));
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
        download_file_with_fallback(
            app,
            "runtime",
            "语音识别服务",
            &urls,
            &zip_path,
            10,
            85,
        )?;
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
        emit_progress(
            app,
            "ready",
            100,
            "语音服务更新已下载，退出后将自动安装",
        );
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
            } else if let Ok(path) = std::env::var("QUICKER_VOICE_MODEL_ZIP_PATH") {
                let zip = PathBuf::from(path);
                let dest = model_dir(&root);
                extract_zip(app, &zip, &dest, "识别模型")?;
                normalize_model_layout(&dest)?;
                verify_sensevoice_model_identity(&dest)?;
            } else {
                let channel = load_channel()?;
                install_model_from_network(app, &channel, &root, &temp_dir)?;
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
