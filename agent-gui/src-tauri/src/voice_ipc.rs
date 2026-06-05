use serde::Serialize;
use std::collections::HashMap;
use std::io::{Read, Write};
use std::process::{ChildStdin, ChildStdout};
use std::sync::{Arc, Condvar, Mutex};
use std::thread;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, State};

use crate::voice_plugin::VoicePluginState;

const FRAME_JSON: u8 = 0;
const FRAME_PCM: u8 = 1;
const READY_WAIT_MS: u64 = 45_000;
const SESSION_WAIT_MS: u64 = 15_000;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VoiceIpcFinalDto {
    pub text: String,
    pub confidence: Option<f32>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct VoiceIpcPartialEvent {
    session_id: String,
    text: String,
}

#[derive(Debug, Clone)]
struct RuntimeReadyInfo {
    ready: bool,
    model_loaded: bool,
}

struct SessionWaiters {
    started: Option<std::sync::mpsc::Sender<Result<(), String>>>,
    final_result: Option<std::sync::mpsc::Sender<Result<VoiceIpcFinalDto, String>>>,
}

pub struct VoiceStdioBridge {
    writer: Mutex<ChildStdin>,
    sessions: Mutex<HashMap<String, SessionWaiters>>,
    ready: Mutex<Option<RuntimeReadyInfo>>,
    ready_cv: Condvar,
    app: AppHandle,
}

impl VoiceStdioBridge {
    pub fn attach(
        app: AppHandle,
        stdin: ChildStdin,
        stdout: ChildStdout,
    ) -> Arc<Self> {
        let bridge = Arc::new(Self {
            writer: Mutex::new(stdin),
            sessions: Mutex::new(HashMap::new()),
            ready: Mutex::new(None),
            ready_cv: Condvar::new(),
            app,
        });

        let reader_bridge = Arc::clone(&bridge);
        thread::spawn(move || reader_bridge.reader_loop(stdout));

        bridge
    }

    pub fn wait_ready(self: &Arc<Self>, max_ms: u64) -> Result<(), String> {
        let info = self.wait_ready_info(max_ms)?;
        if info.ready {
            Ok(())
        } else if info.model_loaded {
            Err("模型已加载，服务初始化中…".into())
        } else {
            Err("Runtime 已响应，等待就绪…".into())
        }
    }

    fn wait_ready_info(self: &Arc<Self>, max_ms: u64) -> Result<RuntimeReadyInfo, String> {
        let deadline = Instant::now() + Duration::from_millis(max_ms);
        let mut guard = self.ready.lock().map_err(|e| e.to_string())?;
        while guard.is_none() {
            let remaining = deadline.saturating_duration_since(Instant::now());
            if remaining.is_zero() {
                return Err("timeout waiting for voice runtime.ready on stdio".into());
            }
            let (new_guard, timeout) = self
                .ready_cv
                .wait_timeout(guard, remaining)
                .map_err(|e| e.to_string())?;
            guard = new_guard;
            if timeout.timed_out() && guard.is_none() {
                return Err("timeout waiting for voice runtime.ready on stdio".into());
            }
        }
        guard
            .clone()
            .ok_or_else(|| "voice runtime closed before ready".into())
    }

    pub fn is_ready(&self) -> bool {
        self.ready
            .lock()
            .ok()
            .and_then(|g| g.clone())
            .map(|info| info.ready)
            .unwrap_or(false)
    }

    pub fn model_loaded(&self) -> bool {
        self.ready
            .lock()
            .ok()
            .and_then(|g| g.clone())
            .map(|info| info.model_loaded)
            .unwrap_or(false)
    }

    pub fn session_start(
        self: &Arc<Self>,
        session_id: &str,
        language: &str,
        streaming: bool,
    ) -> Result<(), String> {
        let (tx, rx) = std::sync::mpsc::channel();
        {
            let mut sessions = self.sessions.lock().map_err(|e| e.to_string())?;
            sessions.insert(
                session_id.to_string(),
                SessionWaiters {
                    started: Some(tx),
                    final_result: None,
                },
            );
        }

        self.write_json(&serde_json::json!({
            "type": "session.start",
            "sessionId": session_id,
            "language": language,
            "streaming": streaming,
            "sampleRate": 16_000,
            "channels": 1,
            "encoding": "pcm_s16le",
        }))?;

        match rx.recv_timeout(Duration::from_millis(SESSION_WAIT_MS)) {
            Ok(Ok(())) => Ok(()),
            Ok(Err(err)) => Err(err),
            Err(_) => Err("语音服务 session.start 超时".into()),
        }
    }

    pub fn session_send_audio(self: &Arc<Self>, pcm: &[u8]) -> Result<(), String> {
        if pcm.is_empty() {
            return Ok(());
        }
        self.write_pcm(pcm)
    }

    pub fn session_end(self: &Arc<Self>, session_id: &str) -> Result<VoiceIpcFinalDto, String> {
        let (tx, rx) = std::sync::mpsc::channel();
        {
            let mut sessions = self.sessions.lock().map_err(|e| e.to_string())?;
            let entry = sessions
                .entry(session_id.to_string())
                .or_insert(SessionWaiters {
                    started: None,
                    final_result: None,
                });
            entry.final_result = Some(tx);
        }

        self.write_json(&serde_json::json!({
            "type": "session.end",
            "sessionId": session_id,
        }))?;

        match rx.recv_timeout(Duration::from_millis(SESSION_WAIT_MS)) {
            Ok(Ok(result)) => Ok(result),
            Ok(Err(err)) => Err(err),
            Err(_) => Err("语音识别超时".into()),
        }
    }

    pub fn session_cancel(self: &Arc<Self>, session_id: &str) -> Result<(), String> {
        let _ = self.write_json(&serde_json::json!({
            "type": "session.cancel",
            "sessionId": session_id,
            "reason": "user_cancelled",
        }));
        self.sessions
            .lock()
            .map_err(|e| e.to_string())?
            .remove(session_id);
        Ok(())
    }

    fn write_json(&self, value: &serde_json::Value) -> Result<(), String> {
        let payload = value.to_string().into_bytes();
        self.write_frame(FRAME_JSON, &payload)
    }

    fn write_pcm(&self, pcm: &[u8]) -> Result<(), String> {
        self.write_frame(FRAME_PCM, pcm)
    }

    fn write_frame(&self, kind: u8, payload: &[u8]) -> Result<(), String> {
        let len = u32::try_from(payload.len()).map_err(|_| "voice frame too large".to_string())?;
        let mut header = [0u8; 5];
        header[0] = kind;
        header[1..5].copy_from_slice(&len.to_be_bytes());
        let mut writer = self.writer.lock().map_err(|e| e.to_string())?;
        writer
            .write_all(&header)
            .and_then(|_| writer.write_all(payload))
            .and_then(|_| writer.flush())
            .map_err(|e| format!("voice runtime stdin write failed: {e}"))
    }

    fn reader_loop(self: Arc<Self>, mut stdout: ChildStdout) {
        loop {
            let mut header = [0u8; 5];
            if read_exact(&mut stdout, &mut header).is_err() {
                break;
            }
            let kind = header[0];
            let length = u32::from_be_bytes([header[1], header[2], header[3], header[4]]) as usize;
            let mut payload = vec![0u8; length];
            if read_exact(&mut stdout, &mut payload).is_err() {
                break;
            }

            if kind != FRAME_JSON {
                continue;
            }

            let Ok(value) = serde_json::from_slice::<serde_json::Value>(&payload) else {
                continue;
            };
            self.dispatch_inbound(&value);
        }

        if let Ok(mut guard) = self.ready.lock() {
            *guard = None;
        }
        self.ready_cv.notify_all();
    }

    fn dispatch_inbound(self: &Arc<Self>, value: &serde_json::Value) {
        let msg_type = value.get("type").and_then(|v| v.as_str()).unwrap_or("");
        match msg_type {
            "runtime.ready" => {
                let info = RuntimeReadyInfo {
                    ready: value.get("ready").and_then(|v| v.as_bool()).unwrap_or(false),
                    model_loaded: value
                        .get("modelLoaded")
                        .and_then(|v| v.as_bool())
                        .unwrap_or(false),
                };
                if let Ok(mut guard) = self.ready.lock() {
                    *guard = Some(info);
                }
                self.ready_cv.notify_all();
            }
            "session.started" => {
                let Some(session_id) = value.get("sessionId").and_then(|v| v.as_str()) else {
                    return;
                };
                let tx = self
                    .sessions
                    .lock()
                    .ok()
                    .and_then(|mut sessions| sessions.get_mut(session_id).and_then(|w| w.started.take()));
                if let Some(tx) = tx {
                    let _ = tx.send(Ok(()));
                }
            }
            "partial" => {
                let Some(session_id) = value.get("sessionId").and_then(|v| v.as_str()) else {
                    return;
                };
                let Some(text) = value.get("text").and_then(|v| v.as_str()) else {
                    return;
                };
                let _ = self.app.emit(
                    "voice-ipc-partial",
                    VoiceIpcPartialEvent {
                        session_id: session_id.to_string(),
                        text: text.to_string(),
                    },
                );
            }
            "final" => {
                let Some(session_id) = value.get("sessionId").and_then(|v| v.as_str()) else {
                    return;
                };
                let text = value
                    .get("text")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                let confidence = value.get("confidence").and_then(|v| v.as_f64()).map(|v| v as f32);
                let tx = self.sessions.lock().ok().and_then(|mut sessions| {
                    sessions
                        .get_mut(session_id)
                        .and_then(|w| w.final_result.take())
                });
                if let Some(tx) = tx {
                    let _ = tx.send(Ok(VoiceIpcFinalDto { text, confidence }));
                }
            }
            "error" => {
                let session_id = value
                    .get("sessionId")
                    .and_then(|v| v.as_str())
                    .map(str::to_string);
                let message = value
                    .get("message")
                    .and_then(|v| v.as_str())
                    .or_else(|| value.get("code").and_then(|v| v.as_str()))
                    .unwrap_or("voice runtime error")
                    .to_string();
                if let Some(session_id) = session_id.as_deref() {
                    let (started_tx, final_tx) = self.sessions.lock().ok().and_then(|mut sessions| {
                        sessions.remove(session_id).map(|waiters| (waiters.started, waiters.final_result))
                    }).unwrap_or((None, None));
                    if let Some(tx) = started_tx {
                        let _ = tx.send(Err(message.clone()));
                    }
                    if let Some(tx) = final_tx {
                        let _ = tx.send(Err(message));
                    }
                }
            }
            "session.ended" => {
                if let Some(session_id) = value.get("sessionId").and_then(|v| v.as_str()) {
                    let _ = self.sessions.lock().map(|mut sessions| sessions.remove(session_id));
                }
            }
            _ => {}
        }
    }
}

fn read_exact(reader: &mut impl Read, buf: &mut [u8]) -> Result<(), String> {
    let mut offset = 0;
    while offset < buf.len() {
        let n = reader
            .read(&mut buf[offset..])
            .map_err(|e| format!("voice runtime stdout read failed: {e}"))?;
        if n == 0 {
            return Err("voice runtime stdout closed".into());
        }
        offset += n;
    }
    Ok(())
}

fn bridge_from_state(state: &VoicePluginState) -> Result<Arc<VoiceStdioBridge>, String> {
    state
        .bridge
        .lock()
        .map_err(|e| e.to_string())?
        .clone()
        .ok_or_else(|| "语音 Runtime 未启动".into())
}

#[tauri::command]
pub fn voice_ipc_session_start(
    state: State<'_, VoicePluginState>,
    session_id: String,
    language: Option<String>,
    streaming: Option<bool>,
) -> Result<(), String> {
    let bridge = bridge_from_state(&state)?;
    bridge.session_start(
        &session_id,
        language.as_deref().unwrap_or("zh-CN"),
        streaming.unwrap_or(false),
    )
}

#[tauri::command]
pub fn voice_ipc_session_send_audio(
    state: State<'_, VoicePluginState>,
    session_id: String,
    pcm: Vec<u8>,
) -> Result<(), String> {
    let _ = session_id;
    let bridge = bridge_from_state(&state)?;
    bridge.session_send_audio(&pcm)
}

#[tauri::command]
pub fn voice_ipc_session_end(
    state: State<'_, VoicePluginState>,
    session_id: String,
) -> Result<VoiceIpcFinalDto, String> {
    let bridge = bridge_from_state(&state)?;
    bridge.session_end(&session_id)
}

#[tauri::command]
pub fn voice_ipc_session_cancel(
    state: State<'_, VoicePluginState>,
    session_id: String,
) -> Result<(), String> {
    let bridge = bridge_from_state(&state)?;
    bridge.session_cancel(&session_id)
}

pub fn wait_stdio_bridge_ready(bridge: &Arc<VoiceStdioBridge>, max_ms: u64) -> Result<(), String> {
    bridge.wait_ready(max_ms)
}

pub const STDIO_READY_WAIT_MS: u64 = READY_WAIT_MS;
