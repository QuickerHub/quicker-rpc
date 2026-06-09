# QuickerAgent 插件与依赖资源存储

本文档说明 **QuickerAgent（agent-gui）可选插件**及其**依赖资源**在本机上的落盘位置、安装包内嵌配置，以及首次下载时的远程来源。**远程 URL 仅用于安装/更新；日常使用读本地磁盘。**

**Agent 默认工作区与插件目录已分离**：工作区在 `Documents/QuickerAgent/workspace`；插件在 `%LOCALAPPDATA%/QuickerAgent/plugins/…`，避免 Agent 工具误读写插件文件。

实现索引：

| 模块 | 路径 |
|------|------|
| 路径常量（TS） | `agent-gui/lib/quicker-agent-paths.ts` |
| 默认工作区 | `agent-gui/lib/default-working-directory.ts` |
| 路径解析（Rust） | `agent-gui/src-tauri/src/quicker_agent_paths.rs` |
| 语音插件安装 | `agent-gui/src-tauri/src/voice_plugin_install.rs` |
| 语音插件运行 | `agent-gui/src-tauri/src/voice_plugin.rs` |
| 语音插件设计 | [`docs/voice-input-plugin.md`](voice-input-plugin.md) |
| 剪贴板插件设计 | [`docs/clipboard-history-plugin.md`](clipboard-history-plugin.md) |
| Runtime 子项目 | [`voice-asr-runtime/`](../voice-asr-runtime/)、[`clipboard-history-runtime/`](../clipboard-history-runtime/) |

---

## 1. 两类本机目录（总览）

| 类型 | 典型路径 | 谁写入 | 用途 |
|------|----------|--------|------|
| **Agent 工作区** | `Documents/QuickerAgent/workspace/` | 用户 / Agent 工具 | 侧栏留空时的默认 cwd；项目文件、动作编辑工作区 |
| **应用数据（插件等）** | `%LOCALAPPDATA%/QuickerAgent/` | 一键安装 / App | 插件 runtime、模型、manifest；**不在**默认工作区内 |
| **安装包内嵌资源** | Tauri `$RESOURCE/resources/` | 构建 | 下载频道 URL、模型指纹（只读） |
| **安装临时目录** | `%TEMP%/quicker-voice-asr-<pid>/` | 安装过程 | 下载 zip 缓冲；结束即删 |
| **远程下载源** | GitHub / Bitiful / ModelScope | — | 仅安装/更新时拉取 |

---

## 2. Agent 默认工作区

Tauri **发布版**，侧栏工作目录留空时：

```text
Windows:  Documents/QuickerAgent/workspace/
          （Documents 解析见 quicker-agent-paths.ts，OneDrive 文档目录优先）

Linux/macOS:  ~/Documents/QuickerAgent/workspace/
```

环境变量 `AGENT_GUI_DEFAULT_CWD` 可覆盖整个默认工作区路径。

**开发模式**（monorepo 内 `pnpm dev`）：默认工作区为 **quicker-rpc 仓库根**，不使用上述 Documents 路径。

---

## 3. 应用数据目录（插件）

托管型资源（大体积 runtime、ONNX 模型）放在 **Local App Data**，与 Documents 工作区隔离：

```text
Windows:     %LOCALAPPDATA%/QuickerAgent/
macOS:       ~/Library/Application Support/QuickerAgent/
Linux:       $XDG_DATA_HOME/QuickerAgent/  或  ~/.local/share/QuickerAgent/
```

### 3.1 插件目录约定

```text
<app-data>/QuickerAgent/
  cache/                  # 远程 plugin gallery 缓存（TTL 默认 6h）
    voice-asr-channel.json
    plugin-registry.json  # Phase 1
  plugins/
    <plugin-id>/          # 例如 voice-asr
      manifest.json
      settings.json
      runtime/
      models/
```

远程 channel/registry 由 Tauri `plugin_runtime` 在启动时拉取；内嵌 `plugin-registry-bootstrap.json` 仅提供 URL 与离线 fallback。Registry 条目可声明 `activationEvents`（如 `onStartup:channelRefresh`、`onStartup:runtime`、`onDemand:voice-input`）控制启动与按需激活。见 [`docs/superpowers/specs/2026-06-09-plugin-runtime-gallery-design.md`](superpowers/specs/2026-06-09-plugin-runtime-gallery-design.md)。

### 3.2 旧版路径（兼容）

v0.8.x 及更早一键安装曾写入：

```text
Documents/QuickerAgent/plugins/voice-asr/
```

若该处已有 `manifest.json`，Runtime 仍从此目录加载；**新安装**写入 `%LOCALAPPDATA%/QuickerAgent/plugins/voice-asr/`。无需用户手动迁移。

---

## 4. `voice-asr` 插件

### 4.1 本机安装目录（持久化）

**新安装（推荐）**：

```text
%LOCALAPPDATA%/QuickerAgent/plugins/voice-asr/
  manifest.json
  settings.json
  runtime/
    quicker-voice-runtime.exe
    _internal/
  models/
    sensevoice/
      model.int8.onnx
      tokens.txt
```

### 4.2 锁定的模型身份（校验用）

| 文件 | 大小（字节） | SHA256 |
|------|-------------|--------|
| `model.int8.onnx` | 239 233 841 | `c71f0ce00bec95b07744e116345e33d8cbbe08cef896382cf907bf4b51a2cd51` |
| `tokens.txt` | 315 894 | `f449eb28dc567533d7fa59be34e2abca8784f771850c78a47fb731a31429a1dc` |

模型 ID：`sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17`

源文件：`agent-gui/src-tauri/resources/voice-sensevoice-model-identity.json`

### 4.3 首次安装：远程来源 → 本地路径

**模型**：ModelScope 逐文件 → 失败则 Bitiful / GitHub zip  
**Runtime**：Bitiful 镜像 → GitHub Release  

频道配置（运行时拉取，内嵌仅离线 fallback）：`plugin-registry-bootstrap.json` → 远程 `voice-plugin-channel.generated.json` / Bitiful `voice-plugin-channel.json`；legacy 内嵌 `voice-plugin-channel.json`

### 4.4 安装过程临时文件

```text
%TEMP%/quicker-voice-asr-<pid>/
```

### 4.5 开发环境回退

| 用途 | 路径 |
|------|------|
| Python Runtime | `voice-asr-runtime/` |
| 已构建 exe | `voice-asr-runtime/dist/quicker-voice-runtime/` |
| 本地模型 | `voice-asr-runtime/models/sensevoice/` |

---

## 5. 安装包内嵌资源（Tauri，只读）

| 文件 | 作用 |
|------|------|
| `voice-plugin-manifest.json` | 安装后复制为插件 `manifest.json` |
| `voice-plugin-channel.json` | Runtime / 备用模型 zip URL 与 SHA256 |
| `voice-sensevoice-model-identity.json` | ModelScope 地址与模型指纹 |

QuickerAgent 主程序运行时：`$RESOURCE/resources/app/`（Next）、`node/`、`qkrpc/`。

---

## 6. 设置与服务器持久化数据（非插件）

用户可写的服务器配置（设置 → 模型 API Key、自定义 Profile、Token 用量、启动器预设等）落在 **应用数据目录**，**不在**安装目录内，NSIS 就地更新不会删除：

```text
Windows:     %LOCALAPPDATA%/QuickerAgent/local/
  llm-secrets.json
  llm-endpoint-pref.json
  llm-usage/
  device-fingerprint.json
  launcher-resolve-presets.json
  launcher-command-cache.json
```

首次启动新版本时会从旧路径 **自动迁移**（若存在）：

- 开发：`agent-gui/.local/`
- 旧发布版：`{安装目录}/resources/app/.local/`

`agent-gui/.local/frontend-*.json` 等 **仅开发诊断** 文件仍留在仓库/安装目录，不参与迁移。

WebView UI 偏好与对话（`localStorage`）仍在 `%LOCALAPPDATA%/ai.quicker.agent/`（见 [agent-gui-chat-storage.md](agent-gui-chat-storage.md)）。

---

## 7. 维护者

1. 发布 runtime → 同步 `voice-plugin-channel.json`（`publish/Sync-VoicePluginChannel.ps1`）
2. 模型变更时更新 `voice-sensevoice-model-identity.json` 指纹

---

## 8. 远程 URL 速查

| 资源 | 主源 | 备用 |
|------|------|------|
| Runtime zip | Bitiful | GitHub `voice-asr-runtime` |
| 模型文件 | ModelScope | Bitiful / GitHub zip |

识别过程仅读取本地插件目录，无需外网。
