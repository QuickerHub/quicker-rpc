# 本地语音输入协议

> 本地 ASR 输入已实现并可选安装；`/voice-chat` 仍是实验入口。产品状态见 [EXT](product/README.md#p-ext)。

## 用户流程

Composer 按住麦克风后，Host 启动/连接本地 runtime，发送 16 kHz mono PCM；松开后把最终识别文本写入 draft，由用户确认发送。音频和识别留在本机。

## Runtime

- 子项目：`voice-asr-runtime/`。
- HTTP health：`http://127.0.0.1:6016/health`。
- WebSocket：`ws://127.0.0.1:6016`。
- subprotocol：`quicker-voice-v1`。
- 客户端：`agent-gui/lib/voice-input/voice-input-ws-client.ts`。
- 服务端路由：`voice-asr-runtime/src/quicker_voice_runtime/router.py`。

端口可由配置覆盖；代码中的 `voice-input-config` 是客户端事实源。

## 会话协议

```text
Host -> session.start { sessionId, language, streaming, sampleRate:16000,
                        channels:1, encoding:"pcm_s16le" }
Runtime -> session.started
Host -> binary PCM chunks
Runtime -> partial { text }             # streaming=true 时可选
Host -> session.end
Runtime -> final { text, confidence? }
Runtime -> session.ended
```

取消使用 `session.cancel { sessionId, reason }`。错误使用 `error { sessionId?, code?, message }`。消息必须匹配当前 `sessionId`，客户端忽略其它会话消息。

当前客户端约束：session started 等待 2 秒，final 等待 15 秒；超时或 AbortSignal 触发 cancel 和连接清理。

## 状态与降级

- 未安装：引导到语音设置安装。
- 已安装未启动：首次使用按需启动。
- runtime/model 不可用：显示可恢复错误，不提交空文本。
- 用户取消、窗口关闭或应用退出：停止采集、发送 cancel、关闭 WebSocket。
- mock 只用于开发测试，不能作为发布成功依据。

## 数据与更新

runtime、模型、manifest 和设置位于 `%APPDATA%/QuickerAgent/plugins/voice-asr/`。安装和更新必须校验 channel/资源指纹；协议兼容时 runtime 可以独立升级。

## 验证

```powershell
cd agent-gui
pnpm test:voice-input

cd ../voice-asr-runtime
uv run pytest tests/test_websocket_session.py
```

精确 JSON 行为以客户端、runtime router 和测试为准，本文不复制完整实现 schema。
