# QuickerAgent 插件 Runtime 画廊设计

> 状态：已确认（2026-06-09，用户「继续」）  
> 日期：2026-06-09  
> 决策：**方案 A（远程 Plugin Gallery + 通用 Plugin Host）**；Registry 采用 **去中心化 channel + 轻量索引**（各 runtime 仓库自发布 channel，registry 只存 URL 指针）

---

## 1. 背景与问题

### 1.1 目标（来自产品文档，尚未在实现中兑现）

[`docs/voice-input-plugin.md`](../../voice-input-plugin.md) 已定义：

- 插件独立版本、模型、更新
- 与 QuickerAgent 主版本解耦
- Host 与 Runtime 只约定 manifest + 协议

### 1.2 现状：runtime 更新仍绑定主程序发版

`voice_plugin_install.rs` 通过 `include_str!("../resources/voice-plugin-channel.json")` 在 **编译期** 固定目标 `runtimeVersion`。已安装用户虽可在后台 staging 升级，但「可升级到的版本」只有在新版 QuickerAgent 发布后才变。

当前 voice runtime 发布流程：

```text
voice-asr-runtime tag → CI 出 zip + channel.json
  → Sync-VoicePluginChannel.ps1 写入 monorepo 两处内嵌文件
  → commit quicker-rpc → 重新发布 QuickerAgent NSIS
```

这与 VS Code 扩展模式相反。VS Code 主程序内嵌的是 **Marketplace 端点**，扩展包与版本信息由远程画廊提供，扩展可独立更新。

### 1.3 次要问题（本设计一并解决，P1 落地）

| 问题 | 说明 |
|------|------|
| 生命周期代码重复 | `voice_plugin.rs` ≈ `clipboard_history_plugin.rs`；dev `voice-runtime-lifecycle.mjs` ≈ `qkrpc-serve-lifecycle.mjs` |
| Dev/Prod 双轨 | dev 由 `start.mjs` 管 voice/qkrpc；prod 由 Tauri Rust 管 |
| 新插件成本高 | 每插件需新增 State、invoke 命令、安装逻辑 |

---

## 2. 设计原则（对照 VS Code）

| VS Code 概念 | QuickerAgent 对应 | 原则 |
|--------------|-------------------|------|
| Workbench | Tauri + Next.js | UI 与插件生命周期分离 |
| Extension Gallery | Plugin Registry（远程 JSON） | 主程序只嵌 **registry URL**，不嵌具体版本 |
| Extension package | `%LOCALAPPDATA%/QuickerAgent/plugins/<id>/` | 已存在，保持 |
| Extension Host | `PluginRuntimeHost`（Rust 通用模块） | 安装/升级/启停/健康检查统一实现 |
| `engines.vscode` | manifest `minHostVersion` + `protocolVersion` | Host 启动前校验，不兼容则拒绝并提示升级主程序 |

**主程序何时必须发版：**

- 新增 transport 类型（如 stdio LSP 式 sidecar）
- `protocolVersion` 破坏性变更
- 通用 Host API 面变更（新 capability flag）

**主程序不必发版：**

- runtime bugfix / 性能 / 模型更新
- 插件 `pluginVersion` 递增且协议兼容
- channel 中 zip URL / SHA256 变更

---

## 3. 架构总览

```text
┌─────────────────────────────────────────────────────────────────┐
│ QuickerAgent Workbench (Tauri + Next.js)                         │
│  • UI：设置 → 插件、Composer 语音、Launcher …                     │
│  • 内嵌：plugin-registry-bootstrap.json（仅 URL + TTL + fallback）│
└────────────────────────────┬────────────────────────────────────┘
                             │ Tauri commands: plugin_*
┌────────────────────────────▼────────────────────────────────────┐
│ PluginRuntimeHost (Rust, 通用)                                   │
│  fetch_registry → fetch_channel → compat check → install/stage   │
│  → spawn child → health poll → stop                              │
└────────────────────────────┬────────────────────────────────────┘
                             │
         ┌───────────────────┼───────────────────┐
         ▼                   ▼                   ▼
  voice-asr runtime   clipboard-history    (future plugins)
  ws://127.0.0.1:6016  http://127.0.0.1:6020
```

```text
远程（独立发布，不进 monorepo 发版链路）
├── registry.json              ← 轻量索引（Bitiful 主 + GitHub 备）
└── 各插件 channel.json        ← 由各 runtime 仓库 Release 自带
    voice-asr-runtime/releases/.../voice-plugin-channel.generated.json
```

---

## 4. 远程契约

### 4.1 Bootstrap（编译进 QuickerAgent，极小）

路径：`agent-gui/src-tauri/resources/plugin-registry-bootstrap.json`

```json
{
  "schemaVersion": 1,
  "registryUrl": "https://s3.bitiful.net/quicker-pkgs/quicker-agent/plugins/registry.json",
  "registryMirrorUrl": "https://github.com/QuickerHub/quicker-agent-plugins/releases/latest/download/registry.json",
  "cacheTtlHours": 6,
  "offlineFallbackRegistry": {
    "plugins": {
      "voice-asr": {
        "channelUrl": "https://github.com/QuickerHub/voice-asr-runtime/releases/download/v0.1.3/voice-plugin-channel.generated.json",
        "channelMirrorUrl": "https://s3.bitiful.net/quicker-pkgs/quicker-rpc/voice-asr/voice-plugin-channel.json",
        "minHostVersion": "0.10.0"
      }
    }
  }
}
```

说明：

- `offlineFallbackRegistry` 随 QuickerAgent 发版偶尔更新（半年级或重大安全修复），**不是**每次 runtime 发布都改。
- 在线时以远程 registry 为准；离线或拉取失败时用 fallback。

### 4.2 Plugin Registry（远程，可独立更新）

托管：**Bitiful `quicker-pkgs/quicker-agent/plugins/registry.json` 为主**；**`QuickerHub/quicker-agent-plugins` 仓库 Release 为备**（小文件，易自动化）。

```json
{
  "schemaVersion": 1,
  "updatedAt": "2026-06-09T12:00:00Z",
  "plugins": {
    "voice-asr": {
      "displayName": "本地语音输入",
      "channelUrl": "https://github.com/QuickerHub/voice-asr-runtime/releases/latest/download/voice-plugin-channel.generated.json",
      "channelMirrorUrl": "https://s3.bitiful.net/quicker-pkgs/quicker-rpc/voice-asr/channel.json",
      "minHostVersion": "0.10.0",
      "enabled": true
    },
    "clipboard-history": {
      "displayName": "剪贴板历史",
      "channelUrl": "https://github.com/QuickerHub/clipboard-history-runtime/releases/latest/download/channel.json",
      "channelMirrorUrl": null,
      "minHostVersion": "0.11.0",
      "enabled": false
    }
  }
}
```

**去中心化要点**：`channelUrl` 指向 **各 runtime 仓库** 的 Release 资产（`latest` 或固定 tag），不由 monorepo 拷贝。voice-asr-runtime CI 已生成 `voice-plugin-channel.generated.json`，直接复用。

Registry 更新可由 voice runtime 发布 workflow 末尾 bot 步骤追加（仅改 `voice-asr` 条目），或维护者手动改 registry 单文件——**均不触发 QuickerAgent 发版**。

### 4.3 Plugin Channel（每插件，已有 voice 形态）

保持现有 `voice-plugin-channel.json` 字段，增加可选元数据：

```json
{
  "schemaVersion": 1,
  "pluginId": "voice-asr",
  "runtimeVersion": "0.1.4",
  "runtimeZipUrl": "https://github.com/.../voice-asr-runtime-0.1.4-win-x64.zip",
  "runtimeZipMirrorUrl": "https://s3.bitiful.net/...",
  "runtimeZipSha256": "...",
  "modelZipUrl": "...",
  "modelZipMirrorUrl": "...",
  "modelZipSha256": "...",
  "publishedAt": "2026-06-09T12:00:00Z"
}
```

安装目录内 `manifest.json`（本地）继续描述引擎、端口、health 路径；channel 只负责 **分发与版本**。

### 4.4 兼容性校验

Host 启动插件前：

1. `hostVersion`（QuickerAgent 版本）≥ registry `minHostVersion`
2. 本地 `manifest.protocolVersion` ≤ Host 支持的 `maxProtocolVersion`（按 pluginId 注册表）
3. SHA256 校验下载物

不满足 (1)(2) 时 UI 提示「请升级 QuickerAgent」；不满足 (3) 时拒绝安装并记录日志。

---

## 5. PluginRuntimeHost（Rust 通用模块）

### 5.1 模块边界

新目录：`agent-gui/src-tauri/src/plugin_runtime/`

| 文件 | 职责 |
|------|------|
| `registry.rs` | 拉取/缓存 registry（TTL、`%LOCALAPPDATA%/QuickerAgent/cache/plugin-registry.json`） |
| `channel.rs` | 拉取/缓存 per-plugin channel |
| `install.rs` | 下载 zip、校验 SHA256、stage、apply（从 `voice_plugin_install.rs` 抽取） |
| `lifecycle.rs` | spawn、reconcile child、health、stop、port reclaim |
| `compat.rs` | minHostVersion / protocolVersion |
| `types.rs` | 共享 DTO |

`voice_plugin.rs` / `clipboard_history_plugin.rs` 逐步变为 **薄适配层**（调用 `plugin_runtime::`），最终删除重复逻辑。

### 5.2 统一 Tauri 命令面

替代 per-plugin 命令膨胀：

| 命令 | 说明 |
|------|------|
| `plugin_registry_refresh` | 强制刷新远程 registry |
| `plugin_list` | 已安装 + 可更新状态 |
| `plugin_status` | `{ pluginId }` |
| `plugin_install` | `{ pluginId }` |
| `plugin_update` | `{ pluginId }` 或 `all` |
| `plugin_start` / `plugin_stop` | `{ pluginId }` |
| `plugin_read_settings` / `plugin_write_settings` | `{ pluginId, settings }` |

事件：`plugin-install-progress`（通用，`pluginId` 字段区分）。

现有 `voice_plugin_*` 命令 **保留一个版本周期** 为 deprecated 别名，避免打断前端。

### 5.3 缓存与网络策略

- Registry / channel 缓存目录：`%LOCALAPPDATA%/QuickerAgent/cache/`
- 默认 TTL：6h；启动时若缓存过期则后台 refresh（不阻塞 UI）
- 顺序：primary URL → mirror URL → bootstrap offlineFallback
- 下载 zip：mirror 优先（国内 Bitiful），与现 voice 安装一致

---

## 6. 发布流程变更

### 6.1 voice-asr-runtime 独立发布（目标态）

```text
1. bump pyproject.toml → tag vX.Y.Z
2. CI：zip + voice-plugin-channel.generated.json → GitHub Release
3. CI（可选）：上传 Bitiful + 更新 channel.json 指针
4. CI（可选）：PR 到 quicker-agent-plugins 更新 registry.json 的 channelMirrorUrl
5. 结束（无需 quicker-rpc commit / QuickerAgent 发版）
```

### 6.2 废弃 / 降级 monorepo 步骤

| 现状 | 目标 |
|------|------|
| `Sync-VoicePluginChannel.ps1` 写入两处内嵌 channel | 仅更新 **bootstrap fallback**（低频）；或脚本改为上传远程 channel/registry |
| `quicker-voice-runtime-publish` skill 第 7 步 commit monorepo | 改为「更新远程 registry / 验证 latest URL」 |
| `include_str!(voice-plugin-channel.json)` | 改为运行时 `fetch_channel` + fallback |

### 6.3 新插件接入清单

1. runtime 仓库：Release 产出 zip + `channel.json`
2. `quicker-agent-plugins`：registry 增加条目
3. 插件目录模板：`manifest.json` + `settings.schema.json`（可选）
4. **无需**改 QuickerAgent `lib.rs` invoke 列表（若 transport 为已有 ws/http process）

---

## 7. Dev 模式对齐（P1）

`start.mjs` 与 Tauri 共用契约：

- 读取同一 bootstrap / cache 路径逻辑（TS 薄层 `lib/plugin-runtime/`）
- dev 下 voice 仍可用 `uv run`（`manifest.dev.runtimeCommand` 可选字段），但 **更新检查** 走同一 channel URL
- `AGENT_GUI_SKIP_*` 环境变量保留

不要求 dev 与 prod 同一二进制，要求 **同一更新语义**。

---

## 8. 分阶段实施

### Phase 0（1 周，立刻解除耦合）

- [ ] `fetch_channel` 替代 `include_str!`（voice 仅此一项）
- [ ] 缓存 + fallback 至现有内嵌 channel
- [ ] 发布 skill 改为「runtime 发布不 commit monorepo channel」
- [ ] 验证：仅发 voice runtime，已装 QuickerAgent 能自动拉到新版

### Phase 1（2 周，通用 Host 基础）

- [ ] `plugin_runtime/` 模块 + `plugin_list` / `plugin_status` / `plugin_update`
- [ ] 远程 `registry.json` 仓库 + Bitiful 同步脚本
- [ ] voice 迁入通用 Host；删除重复 staging 逻辑
- [ ] 设置页「检查插件更新」

### Phase 2（后续）

- [ ] clipboard-history 迁入；`activationEvents` lazy start
- [ ] dev `start.mjs` 共用 TS 层
- [ ] 废弃 `voice_plugin_*` 别名

**明确不做（本设计）**

- 独立 `quicker-plugin-host.exe` 进程（方案 B）
- 应用内插件市场搜索/评分
- 非 Windows 插件二进制分发

---

## 9. 测试与验收

| 场景 | 验收标准 |
|------|----------|
| 在线升级 | 远程 channel `runtimeVersion` 高于本地 → 后台 stage → 重启后生效 |
| 离线启动 | 无网时用 cache；无 cache 用 bootstrap fallback |
| 不兼容协议 | 新 runtime `protocolVersion` 高于 Host 支持 → 明确错误，不崩溃 |
| 旧 Host | 未升级 QuickerAgent 的用户仍可跑已装 runtime；仅无法拉新 channel 时停滞在旧版 |
| 发布解耦 | voice runtime tag 后 **零** quicker-rpc commit，用户 6h 内收到更新 |

---

## 10. 风险与缓解

| 风险 | 缓解 |
|------|------|
| 远程 registry 被篡改 | HTTPS + SHA256；可选 registry 签名（P2） |
| GitHub 国内慢 | Bitiful mirror；channel 双 URL |
| 旧客户端永不上线 | fallback 随主程序偶尔更新；设置页手动「检查更新」 |
| 迁移期双 API | deprecated 别名保留一版 |

---

## 11. 相关文件（实施时）

| 路径 | 变更 |
|------|------|
| `agent-gui/src-tauri/src/voice_plugin_install.rs` | `load_channel` → 远程 fetch |
| `agent-gui/src-tauri/src/plugin_runtime/*` | 新增 |
| `agent-gui/src-tauri/resources/plugin-registry-bootstrap.json` | 新增 |
| `publish/Sync-VoicePluginChannel.ps1` | 重定位为上传远程 / 更新 fallback |
| `.cursor/skills/quicker-voice-runtime-publish/SKILL.md` | 去掉 monorepo commit 步骤 |
| `docs/agent-gui-plugin-storage.md` | 补充 registry/cache 路径 |

---

## 12. 决策记录

| 选项 | 结论 | 理由 |
|------|------|------|
| A vs B vs C | **A** | 解决独立更新 + 可扩展；B 过重，C 不够 |
| Registry 托管 | **去中心化 channel（B）+ Bitiful 索引（轻量 A）** | 各 runtime 仓库已产 channel；registry 保持极小、易自动化 |
| Phase 0 优先 | **是** | 用户痛点是发版耦合，先改 fetch 即可见效 |

---

## 13. 实现计划

见 [`docs/superpowers/plans/2026-06-09-plugin-runtime-gallery.md`](../plans/2026-06-09-plugin-runtime-gallery.md)。
