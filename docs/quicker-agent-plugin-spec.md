# QuickerAgent Plugin 规范

> **状态**：v0.1（2026-06）  
> **范围**：QuickerAgent 可选 **sidecar 插件**（独立 runtime 子进程 + Host 生命周期管理）。  
> **非本规范**：`QuickerRpc.Plugin`（Quicker 桥接 DLL）、`ActionRuntime.Modules.*`（编译期 Pack）、`qkrpc mcp`（外部 Agent 接入）。

---

## 1. 概念

| 术语 | 说明 |
|------|------|
| **Host** | QuickerAgent 桌面壳（Tauri / Electron），负责安装、启停、健康检查、UI 入口 |
| **Plugin** | 可选能力包：独立版本、独立发布、按需安装 |
| **Runtime** | 插件子进程（exe），通过约定 transport 与 Host 通信 |
| **Registry** | 远程插件目录（轻量 JSON 索引） |
| **Channel** | 单插件分发清单（zip URL、SHA256、版本） |
| **Manifest** | 安装后落盘于 `%LOCALAPPDATA%/QuickerAgent/plugins/<id>/manifest.json` |

已落地插件：

| pluginId | 说明 | 设计文档 |
|----------|------|----------|
| `voice-asr` | 本地语音输入（WebSocket :6016） | [voice-input-plugin.md](voice-input-plugin.md) |
| `clipboard-history` | 剪贴板历史（HTTP :6020，暂未开放） | [clipboard-history-plugin.md](clipboard-history-plugin.md) |

存储路径见 [agent-gui-plugin-storage.md](agent-gui-plugin-storage.md)。远程画廊设计见 [superpowers/specs/2026-06-09-plugin-runtime-gallery-design.md](superpowers/specs/2026-06-09-plugin-runtime-gallery-design.md)。

---

## 2. 目录结构

```text
%LOCALAPPDATA%/QuickerAgent/
  cache/
    plugin-registry.json      # Registry 缓存（TTL 默认 6h）
    voice-asr-channel.json    # per-plugin channel 缓存
  plugins/
    <plugin-id>/
      manifest.json           # 本地契约（安装时写入）
      settings.json           # 用户配置（可选）
      runtime/                # 子进程二进制
      models/                 # 可选资源（如 voice 模型）
      data/                   # 可选持久化（如 clipboard SQLite）
```

---

## 3. 三层契约

### 3.1 Registry（远程目录）

Host 启动时拉取；内嵌 `plugin-registry-bootstrap.json` 仅含 URL 与离线 fallback。

```json
{
  "schemaVersion": 1,
  "updatedAt": "2026-06-11T00:00:00Z",
  "plugins": {
    "voice-asr": {
      "displayName": "本地语音输入",
      "channelUrl": "https://github.com/QuickerHub/voice-asr-runtime/releases/latest/download/voice-plugin-channel.generated.json",
      "channelMirrorUrl": "https://s3.bitiful.net/quicker-pkgs/quicker-rpc/voice-asr/voice-plugin-channel.json",
      "minHostVersion": "0.10.0",
      "enabled": true,
      "activationEvents": ["onStartup:channelRefresh", "onStartup:runtime", "onDemand:voice-input"]
    }
  }
}
```

| 字段 | 必填 | 说明 |
|------|------|------|
| `displayName` | 否 | 设置页展示名 |
| `channelUrl` | 是 | 该插件 channel JSON 主 URL |
| `channelMirrorUrl` | 否 | 镜像（国内 Bitiful 等） |
| `minHostVersion` | 否 | Host 版本下限（SemVer 比较） |
| `enabled` | 否 | `false` 时不列入可安装列表（默认可展示为「暂未开放」） |
| `activationEvents` | 否 | 启动策略，见 §5 |

### 3.2 Channel（远程分发）

由各 runtime 仓库 Release 产出；Host 用于下载与更新检查。

```json
{
  "schemaVersion": 1,
  "pluginId": "voice-asr",
  "runtimeVersion": "0.1.4",
  "runtimeZipUrl": "https://github.com/.../voice-asr-runtime-0.1.4-win-x64.zip",
  "runtimeZipMirrorUrl": "https://s3.bitiful.net/...",
  "runtimeZipSha256": "...",
  "modelZipUrl": "...",
  "modelZipSha256": "...",
  "publishedAt": "2026-06-11T12:00:00Z"
}
```

Channel 只管**分发与版本**；运行时行为由本地 `manifest.json` 描述。

### 3.3 Manifest（本地）

安装完成后写入插件根目录。

```json
{
  "id": "voice-asr",
  "name": "本地语音输入",
  "pluginVersion": "1.0.0",
  "engine": "quicker-voice-runtime",
  "minHostVersion": "0.10.0",
  "protocolVersion": 1,
  "transport": {
    "type": "websocket",
    "host": "127.0.0.1",
    "port": 6016
  },
  "runtime": {
    "exe": "runtime/quicker-voice-runtime.exe",
    "cwd": ".",
    "healthPath": "/health"
  },
  "capabilities": ["voice-input"]
}
```

| 字段 | 说明 |
|------|------|
| `protocolVersion` | Host ↔ Runtime 协议版本；破坏性变更时递增 |
| `transport.type` | `websocket` \| `http`（未来可扩展 `stdio`） |
| `runtime.exe` | 相对插件根目录 |
| `runtime.healthPath` | HTTP GET 健康检查路径 |
| `capabilities` | Host UI 能力标记（如 `voice-input`、`clipboard-history`） |

Transport 与业务协议由各插件设计文档定义（如 voice 的 WebSocket v1）。

---

## 4. Host API（Tauri / Electron）

统一命令面（`plugin_runtime` 模块）：

| 命令 | 参数 | 说明 |
|------|------|------|
| `plugin_registry_refresh` | — | 强制刷新远程 registry + channel 缓存 |
| `plugin_list` | — | 所有已知插件状态列表 |
| `plugin_status` | `pluginId` | 单插件状态 |
| `plugin_install` | `pluginId` | 安装（未实现通用命令前由插件专用路径处理） |
| `plugin_update` | `pluginId` | 拉取并 stage runtime 更新 |
| `plugin_start` / `plugin_stop` | `pluginId` | 启停子进程 |
| `plugin_activate` | `pluginId`, `event` | 按需激活（如 `onDemand:voice-input`） |
| `plugin_read_settings` / `plugin_write_settings` | `pluginId`, `settings` | 用户配置（按插件实现） |

事件：`plugin-install-progress`（含 `pluginId`、`percent`、`message`）。

`PluginStatusDto` 字段：

```typescript
{
  pluginId: string;
  displayName: string;
  installed: boolean;
  running: boolean;
  installedVersion: string | null;
  latestVersion: string | null;
  updateAvailable: boolean;
  hostCompatible: boolean;
  message: string | null;
}
```

---

## 5. 激活策略（activationEvents）

| 事件 | 含义 |
|------|------|
| `onStartup:channelRefresh` | 应用启动时后台刷新 channel |
| `onStartup:runtime` | 已安装且 `autoStart` 时启动子进程 |
| `onDemand:voice-input` | Composer 点麦克风时按需启动 |

未列出的插件可仅 `onStartup:runtime` 或完全按需。

---

## 6. 兼容性

Host 在安装/更新/启动前检查：

1. `hostVersion` ≥ registry `minHostVersion`
2. 本地 `manifest.protocolVersion` ≤ Host 支持的 `maxProtocolVersion`（按 pluginId）
3. 下载物 SHA256 与 channel 一致

不满足 (1)(2) 时 UI 提示升级 QuickerAgent；不满足 (3) 时拒绝安装。

---

## 7. 发布流程

### 7.1 Runtime 独立发版（voice-asr 样板）

```text
1. bump runtime 版本 → Git tag
2. CI：产出 zip + channel.generated.json → GitHub Release
3. （可选）上传 Bitiful + 更新 registry 指针
4. 结束 — 无需 QuickerAgent 主程序发版
```

详见 skill `quicker-voice-runtime-publish`。

### 7.2 Host 必须发版时

- 新增 `transport.type`
- `protocolVersion` 破坏性变更
- 通用 Host API 变更

---

## 8. UI 约定

| 页面 | 职责 |
|------|------|
| **设置 → 插件** | 插件目录：安装 / 更新 / 启停 / 跳转功能设置 |
| **设置 → 语音**（等功能页） | 已安装插件的运行时配置（模型、端口等） |
| **Composer 等入口** | 未安装时灰显 + 引导至「插件」页 |

前端静态目录：`agent-gui/lib/plugin-catalog.ts`（描述、体积提示、关联设置 Tab）。

---

## 9. 新插件接入清单

1. 新建 runtime 仓库（或 monorepo 子目录），Release 产出 zip + `channel.json`
2. 编写插件设计文档（ transport + 业务协议 + `settings.json` schema）
3. 在 `plugin-catalog.ts` 与 registry 增加 `pluginId` 条目
4. Host：`plugin_runtime` 增加 status/build 适配（直至完全通用化）
5. 设置页：功能配置 Tab（可选）
6. **无需**改 QuickerAgent 发版即可推送 runtime 更新（协议兼容时）

---

## 10. 相关文件

| 路径 | 说明 |
|------|------|
| `agent-gui/src-tauri/src/plugin_runtime/` | Host 通用模块 |
| `agent-gui/src-tauri/resources/plugin-registry-bootstrap.json` | 内嵌 bootstrap |
| `agent-gui/lib/plugin-catalog.ts` | UI 静态目录 |
| `agent-gui/lib/plugin-runtime-client.ts` | 前端 invoke 封装 |
| `agent-gui/components/chat/PluginsSettingsSection.tsx` | 插件设置 UI |
