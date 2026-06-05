# QuickerAgent 本地语音输入插件 — 功能设计与协议

> **状态**：设计定稿 v0.1（功能 + WebSocket 协议 v1）  
> **范围**：定义「做什么」与 Host ↔ Runtime 接口；Runtime 实现（fork CapsWriter / 自研）后续再做。

---

## 1. 目标与非目标

### 目标

| 目标 | 说明 |
|------|------|
| Composer 内语音输入 | 麦克风说话 → 识别文字写入当前 draft，用户编辑后再发送 |
| 完全本地 | 音频与识别在本机；识别过程零外网 |
| 可选安装 | 未安装时主程序正常；安装后才出现语音能力 |
| 可维护 | 插件独立版本、模型、更新；与 QuickerAgent 主版本解耦 |

### 非目标（v1）

- 全局热键听写（CapsLock 注入任意窗口）
- 语音唤醒 / 连续对话 / 语音控制 Agent（「发送」「停止」）
- TTS / 朗读回复
- 浏览器 `pnpm dev` 的完整安装流程（可降级为连接本机已运行服务）
- Quicker `sys:recordSound` 云识别链路

---

## 2. 用户场景

| 场景 | 行为 | 成功标准 |
|------|------|----------|
| 首次启用 | 设置 → 插件 → 安装「本地语音输入」 | 下载完成、服务就绪、Composer 麦克风可用 |
| 日常输入 | 按住麦克风 → 松手 → 文字进输入框 | 中文短句 1–3 秒内出字，可继续编辑 |
| 长段描述 | 连续说 30s+ | 分段识别、合并；不丢前半段 |
| 纠错再发 | 识别有误，改几个字后 Enter | 不自动发送 |
| Agent 忙碌 | 边等回复边语音排下一条 | 只改 draft，与排队发送不冲突 |
| 卸载 | 设置里卸载 | 停服务、删文件、麦克风消失 |
| 更新 | 提示 runtime/模型新版本 | 可选更新 |

---

## 3. 模块划分

```text
QuickerAgent 主程序
├── 插件 Host（Tauri）     安装 / 校验 / 启停 / 健康检查 / 更新
├── Composer 语音 UI       录音、状态、文本插入
├── 插件设置 UI            安装向导、模型、诊断
└── WebSocket 客户端       连 Runtime

语音输入插件（可选，按需下载）
├── manifest.json
├── ASR Runtime（exe）     WebSocket 服务
├── models/                模型文件
└── logs/                  可选日志
```

安装目录（与 `Documents/QuickerAgent` 一致）：

```text
Documents/QuickerAgent/plugins/voice-asr/
  manifest.json
  settings.json
  runtime/                 # start_server.exe + deps
  models/<modelId>/
  logs/
```

Host 与 Runtime 只约定 **manifest 字段 + WebSocket 协议 v1**，便于后续换自研引擎。

---

## 4. Composer 交互

### 4.1 入口

在 `composer-toolbar-actions`（发送按钮左侧）增加麦克风按钮：

```text
[ @动作 ] [ 工具 ] [ 模型 ] …     [ 🎤 ] [ 发送 ]
```

### 4.2 交互模式（v1：按住说话）

| 阶段 | UI | 行为 |
|------|-----|------|
| 空闲 | 灰色麦克风 | tooltip「按住说话」 |
| 按住 | 红色脉冲 +「正在听…」 | 采集麦克风，流式发 Runtime |
| 松手 | 「识别中…」 | 停止采集，等最终结果 |
| 完成 | 恢复空闲 | 文本 **追加** 到光标处 |
| 失败 | 短提示 3s | 不修改已有 draft |

v1.1 可选：单击切换录音 + 静音自动停止（`silentStopSeconds`）。

### 4.3 文本插入规则

- 光标处追加；有选区则替换选区
- **不自动发送**
- 与 `@动作` markup tag 共存（纯文本插入）
- 分支编辑、Agent busy + 排队：均只改 draft

### 4.4 流式 vs 一次性

| 模式 | v1 |
|------|-----|
| 一次性（松手后整句） | **默认** |
| 流式预览（说话中灰色预览，松手定稿） | 设置开关，高级 |

---

## 5. 设置页（App Settings → 插件）

### 未安装

```text
本地语音输入 — 完全离线的 Composer 语音转文字
[ 安装 ]   约需下载 300 MB（含模型）
```

### 已安装

- 状态：未启动 / 启动中 / 运行中 / 错误
- 操作：启动 / 停止 / 检查更新 / 卸载
- 模型档位、自动启动、语言、静音停止、流式预览
- 诊断：测试麦克风、打开日志目录

### 安装向导（三步）

1. **选模型档位**

   | 档位 | 体积 | 延迟 | 适用 |
   |------|------|------|------|
   | 轻量 | ~80 MB | 最快 | 短指令 |
   | 标准（默认） | ~250 MB | 中等 | 日常中文 |
   | 高精度 | ~500 MB+ | 较慢 | 长段、专业词 |

2. **下载与校验** — 进度、可取消、sha256
3. **首次启动** — 模型加载 10–30s 提示 →「去试试麦克风」

---

## 6. 状态机

### 插件级

```text
not_installed → downloading → installed → starting → running
                    ↓              ↓          ↓
                 failed         stopped    error
```

| 状态 | Composer 麦克风 |
|------|-----------------|
| `not_installed` | 灰显 +「去安装」 |
| `downloading` | 不可用 |
| `installed` / `stopped` | 灰显 +「请先启动服务」 |
| `starting` | 灰显 + spinner |
| `running` | **可用** |
| `error` | 灰显 + 原因 + 重试 |

### 单次识别

```text
idle → recording → transcribing → idle
```

- 单次录音上限默认 120s
- 识别超时默认 15s
- 识别中再按麦克风：v1 **忽略**（不打断）

### 退出 Agent

- 退出时 Host 停止 ASR Server（同 `qkrpc` 子进程）
- `autoStart=true` 时下次启动后台拉起，不阻塞 UI

---

## 7. 权限与隐私

| 项 | 设计 |
|----|------|
| 麦克风 | 首次按住时系统授权；拒绝后给系统设置链接 |
| 录音留存 | v1 **不持久化**；仅内存流式发送 |
| 日志 | 默认不写原始音频 |
| 网络 | 仅安装/更新需网；识别过程离线 |

---

## 8. 错误与降级

| 错误 | 恢复 |
|------|------|
| 未安装 | 跳转插件设置 |
| 服务未启动 | 一键启动 |
| 模型加载失败 | 重装模型 / 日志 |
| 端口占用 | 改端口（高级） |
| 麦克风不可用 | 系统设置指引 |
| 识别失败 | 重试 |
| 磁盘不足 | 安装前预检 |
| 浏览器 dev | 「完整安装仅桌面版」；开发者可连已有 `ws://127.0.0.1:6016` |

---

## 9. 配置

### manifest.json（随插件包）

```json
{
  "id": "voice-asr",
  "name": "本地语音输入",
  "pluginVersion": "1.0.0",
  "engine": "quicker-voice-runtime",
  "minHostVersion": "0.10.0",
  "protocolVersion": 1,
  "ws": { "host": "127.0.0.1", "port": 6016 },
  "runtime": {
    "exe": "runtime/start_server.exe",
    "cwd": ".",
    "healthPath": "/health"
  },
  "artifacts": []
}
```

### settings.json（用户）

| 键 | 默认 | 说明 |
|----|------|------|
| `autoStart` | `true` | 随 Agent 启动服务 |
| `modelId` | `standard` | 模型档位 |
| `language` | `zh-CN` | 识别语言 |
| `silentStopSeconds` | `0` | 0=仅 Push-to-talk 松手 |
| `streamingPreview` | `false` | 流式预览 |
| `maxRecordingSeconds` | `120` | 单次上限 |
| `wsPort` | `6016` | 高级 |

---

## 10. 更新策略

| 对象 | 策略 |
|------|------|
| `protocolVersion` | 向后兼容 |
| Runtime | 独立 `runtime-version.txt`，停服务后更新 |
| 模型 | 独立 artifact，换模型重新下载 |
| QuickerAgent | `minHostVersion` 不满足时提示升级 |

---

## 11. 验收标准

- [ ] 未安装：主程序无回归；设置页可完成安装
- [ ] 安装后：Push-to-talk 中文短句正确入 Composer
- [ ] 不自动发送；可 @动作、可排队
- [ ] 退出无残留 Server 进程
- [ ] 卸载释放磁盘
- [ ] 断网仍可识别（安装完成后）
- [ ] 麦克风拒绝、服务崩溃有明确文案

---

## 12. v1 已定决策

1. **Push-to-talk only**（单击 + 静音停止 → v1.1）
2. **未安装时麦克风灰显 + tooltip**（不隐藏）
3. **做最小「测试麦克风」**（录 3s → 显示识别结果）
4. **默认模型档位：标准**

---

## 13. 实施顺序

| 顺序 | 交付 |
|------|------|
| ① | 本文档 + 协议 v1（本节以下） |
| ② | Composer 麦克风 UI + mock 插入 |
| ③ | 连外部 Runtime 联调 |
| ④ | 插件 Host：安装 / 启停 / 状态 |
| ⑤ | 设置页 + 安装向导 |
| ⑥ | fork / 自研 Runtime |

---

# WebSocket 协议 v1

Host（QuickerAgent Composer 客户端）与 Runtime（ASR Server）之间的约定。

## 连接

| 项 | 值 |
|----|-----|
| URL | `ws://127.0.0.1:{port}`（默认 `6016`） |
| 子协议 | 建议 `quicker-voice-v1`（可选；无则靠 JSON `type` 区分） |
| 音频 | PCM **16-bit LE mono**，**16000 Hz**（与常见 ASR 一致） |

同一连接可串行多次识别会话；**一次只允许一个活跃 `session`**。

## HTTP 健康检查（可选，Host 启停用）

Runtime 应同时提供：

```http
GET http://127.0.0.1:{port}/health
```

响应 JSON：

```json
{
  "ok": true,
  "protocolVersion": 1,
  "runtimeVersion": "1.0.0",
  "modelId": "standard",
  "modelLoaded": true,
  "ready": true
}
```

- `modelLoaded=false` 或 `ready=false`：WS 可连但 `session.start` 应返回 `not_ready`
- Host 在 `starting` 状态轮询 `/health`，直到 `ready=true` 或超时

## 消息概览

| 方向 | 格式 | 用途 |
|------|------|------|
| Host → Runtime | JSON text | 控制：`ping`、`session.start`、`session.end`、`session.cancel` |
| Host → Runtime | Binary | 音频帧（仅在 `session.start` 之后、`session.end` 之前） |
| Runtime → Host | JSON text | 事件：`pong`、`session.started`、`partial`、`final`、`error`、`session.ended` |

**规则**

1. 控制消息一律 UTF-8 JSON，单行或紧凑 JSON 均可
2. Binary 帧 = 原始 PCM 块；**不含**自定义头（简化实现）
3. 每条 JSON 必含 `"type": string`
4. 可选 `"sessionId": string`（UUID）；Runtime 在 `session.started` 里回显

## Host → Runtime

### `ping`

```json
{ "type": "ping", "id": "optional-correlation-id" }
```

### `session.start`

开始一次识别。须在发 binary 之前发送。

```json
{
  "type": "session.start",
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "language": "zh-CN",
  "streaming": false,
  "sampleRate": 16000,
  "channels": 1,
  "encoding": "pcm_s16le"
}
```

| 字段 | 说明 |
|------|------|
| `streaming` | `true` 时 Runtime 可发 `partial` |
| `sampleRate` / `channels` / `encoding` | v1 固定如上；Runtime 不支持则 `error` |

### Binary 音频

`session.start` 之后连续发送 PCM 块；建议每块 20–100 ms（320–1600 samples @ 16kHz）。

### `session.end`

Host 松手或达到 `maxRecordingSeconds` 时发送；**之后不再发 binary**。

```json
{
  "type": "session.end",
  "sessionId": "550e8400-e29b-41d4-a716-446655440000"
}
```

Runtime 应在处理完成后发 `final`（及可选 `partial`）再发 `session.ended`。

### `session.cancel`

Host 用户取消或超时放弃：

```json
{
  "type": "session.cancel",
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "reason": "user_cancelled"
}
```

## Runtime → Host

### `pong`

```json
{ "type": "pong", "id": "optional-correlation-id", "protocolVersion": 1 }
```

### `session.started`

```json
{
  "type": "session.started",
  "sessionId": "550e8400-e29b-41d4-a716-446655440000"
}
```

### `partial`（仅 `streaming: true`）

```json
{
  "type": "partial",
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "text": "帮我在 quicker 里",
  "stable": false
}
```

Composer 以灰色预览展示；收到 `final` 后替换为定稿文本。

### `final`

```json
{
  "type": "final",
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "text": "帮我在 Quicker 里创建一个剪贴板动作",
  "confidence": 0.92
}
```

| 字段 | 说明 |
|------|------|
| `text` | 插入 Composer 的正文；Runtime 负责简体、基础标点 |
| `confidence` | 可选，0–1 |

空结果：`"text": ""`，Host 提示「未识别到内容」。

### `error`

```json
{
  "type": "error",
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "code": "not_ready",
  "message": "Model is still loading"
}
```

| code | 含义 |
|------|------|
| `not_ready` | 模型未加载完 |
| `busy` | 已有活跃 session |
| `invalid_session` | sessionId 不匹配 |
| `unsupported_format` | 音频参数不支持 |
| `recognition_failed` | 推理失败 |
| `internal` | 未分类错误 |

### `session.ended`

```json
{
  "type": "session.ended",
  "sessionId": "550e8400-e29b-41d4-a716-446655440000"
}
```

Host 收到后可开始下一次 `session.start`。

## 典型时序

### Push-to-talk（`streaming: false`）

```text
Host                          Runtime
  |---- session.start -------->|
  |<--- session.started --------|
  |==== binary PCM chunks =====>|
  |---- session.end ----------->|
  |<--- final ------------------|
  |<--- session.ended ----------|
```

### 流式预览（`streaming: true`）

```text
  |---- session.start (streaming:true) ->|
  |<--- session.started -----------------|
  |==== binary =========================>|
  |<--- partial (optional, repeated) ----|
  |---- session.end -------------------->|
  |<--- final ---------------------------|
  |<--- session.ended -------------------|
```

## Host 超时（建议）

| 阶段 | 默认超时 |
|------|----------|
| `session.start` → `session.started` | 2s |
| `session.end` → `final` | 15s |
| 模型 `ready`（/health） | 120s（首次加载） |

超时 Host 发 `session.cancel` 并展示「识别超时」。

## 与 CapsWriter 的关系

CapsWriter-Offline Server 使用自有 binary WebSocket 协议（默认端口 6016）。**QuickerAgent v1 协议 intentionally 简化**（JSON 控制 + 裸 PCM），便于 fork 时重写 Server 而不绑死 CapsWriter 消息格式。

联调阶段可：

1. 实现 **QuickerAgent Runtime** 直接支持本文协议；或
2. 临时 **adapter** 将本协议转 CapsWriter 协议（仅开发用，不进入产品 manifest）

产品路径以 **自研 / fork 轻量 Runtime 实现本文协议** 为准。

## 协议版本演进

- `protocolVersion: 1` — 本文
- 新增字段须向后兼容（未知字段忽略）
- 破坏性变更 → `protocolVersion: 2`，Host 与 Runtime 同时升级

---

## 参考

- Composer：`agent-gui/components/chat/Chat.tsx`、`ComposerMarkupField.tsx`
- 用户数据目录：`agent-gui/lib/default-working-directory.ts` → `Documents/QuickerAgent`
- Tauri 子进程模式：`agent-gui/src-tauri/src/lib.rs`（`BackendState`）
- CapsWriter 架构参考（非协议依赖）：WebSocket C/S、SenseVoice/Paraformer 模型
