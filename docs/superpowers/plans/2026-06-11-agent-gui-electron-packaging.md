# QuickerAgent Electron 打包 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Electron desktop shell + NSIS packaging sharing Tauri `resources/` layout; dev via `dev.ps1 -Electron`; migrate IPC in P1–P7.

**Architecture:** `desktop-bundle-prepare.mjs` stages Next/qkrpc/Node; Electron `main.mjs` spawns backends in production; `desktop-bridge.ts` unifies IPC over time.

**Tech Stack:** Electron 33, electron-builder 25, Next.js standalone, existing qkrpc CLI.

**Spec:** `docs/superpowers/specs/2026-06-11-agent-gui-electron-packaging-design.md`

**Status (2026-06-11):** P0–P7 实现完成。正式发布仍走 Tauri；Electron 为并行试验通道。

---

### Task 1: P0 — Shared bundle + Electron skeleton ✅

**Files:**
- Create: `agent-gui/scripts/desktop-bundle-prepare.mjs`, `verify-desktop-bundle.mjs`, `electron-prepare.mjs`, `electron-dev.mjs`
- Create: `agent-gui/electron/{main,preload,paths,backend-spawn}.mjs`
- Create: `agent-gui/lib/{desktop-shell,desktop-bridge}.ts`
- Modify: `tauri-prepare.mjs`, `verify-tauri-bundle.mjs`, `package.json`, `dev.ps1`, `scripts/dev-launcher.ps1`

- [x] Extract shared prepare + verify
- [x] Electron main/preload + production backend spawn
- [x] `dev.ps1 -Electron`, publish script stub, docs

### Task 2: P1 — Lifecycle + desktop-bridge migration ✅

- [x] Route `QuickerAgentExitHandler` through `invokeDesktop('graceful_exit')`
- [x] Implement `prepare_for_update_install` in Electron `lifecycle.mjs`
- [x] Window controls: `DesktopWindowControls` + `isDesktopShell()` in `ChatTitlebar`

### Task 3: P2 — Launcher + global shortcut ✅

- [x] Port `launcher.rs` commands to `electron/commands/launcher.mjs`
- [x] `globalShortcut` for `launcher_sync_global_shortcut`
- [x] Frontend: `launcher-window*`, `sync-launcher-global-shortcut`, `listenDesktop` events

### Task 4: P3 — plugin_runtime ✅

- [x] `electron/plugin-runtime/*` registry/channel/status
- [x] `plugin_*` IPC + `plugin-runtime-client.ts` → `invokeDesktop`
- [x] `plugin_activate` starts voice runtime when installed

### Task 5: P4 — voice_plugin + voice_ipc ✅

- [x] `voice_plugin_*` / `voice_ipc_*` / `voice_runtime_health`
- [x] `electron/voice-plugin/{install,runtime,stdio-bridge,status,settings}.mjs`
- [x] Frontend: `voice-input-*` → `invokeDesktop` / `listenDesktop`

### Task 6: P5 — clipboard_history ✅

- [x] `clipboard_history_*`（`CLIPBOARD_HISTORY_ENABLED = false`，与 Rust 一致）
- [x] `electron/clipboard-history/*`

### Task 7: P6 — WebContentsView embedded browser ✅

- [x] `embedded_browser_*` + mount/bounds IPC
- [x] `webview_profile_paths`、`legacy_chat_store_scan`
- [x] `use-embedded-webview.ts` Electron 分支

### Task 8: P7 — electron-updater + publish ✅

- [x] `electron-updater` + `updater_*` IPC
- [x] `quicker-agent-official-updater.ts` 双轨（Tauri / Electron）
- [x] `Publish-QuickerAgent-Electron.ps1`（输出 setup.exe + latest.yml 上传说明）
- [x] `build.files` → `electron/**/*.mjs`

---

## 验证清单

| 步骤 | 命令 |
|------|------|
| 开发双轨 | 终端 1：`pwsh ./dev.ps1`；终端 2：`pwsh ./dev.ps1 -Electron` |
| 前端检查 | 改 UI 后 `dev_frontend_check`（见 agent-gui/AGENTS.md） |
| Electron 语法 | `cd agent-gui && pnpm electron:check`（43 个 main 进程模块，无需 build） |
| 打包预检 | `cd agent-gui && pnpm build && pnpm electron:verify-bundle` |
| NSIS 安装包 | `pwsh ./publish/Publish-QuickerAgent-Electron.ps1` |
| 产物 smoke | `pnpm test:electron-smoke`（verify）；`-Action launch` 需 `win-unpacked` |
| 更新源 | `pwsh ./publish/Upload-QuickerAgentElectronToBitiful.ps1` 或 `-UploadBitiful` |

**本地验证（2026-06-11）：** `QuickerAgent-Electron-0.13.3-setup.exe`（~256 MB）+ `latest.yml` 已产出。修复项：`tsconfig` 排除 `src-tauri/**`；`Publish-QuickerAgent-Electron.ps1` 隔离 `USERPROFILE`；`win.signAndEditExecutable: false`（无开发者模式时避免 winCodeSign 符号链接失败）。

### 手动 smoke 清单（安装后 / 发布前）

| # | 项 | 预期 |
|---|-----|------|
| 1 | `pnpm test:electron-smoke` | verify 通过 |
| 2 | `-Action launch` | win-unpacked 冷启动 ≤120s，`/` 或 `/api/ping` 在 :3000–:3020 可达 |
| 3 | NSIS 安装 + 首次启动 | 主窗口无「启动失败」对话框 |
| 4 | 聊天页 | 可发消息；qkrpc 连上时工具调用可用 |
| 5 | Launcher | 全局快捷键唤起（若已配置） |
| 6 | 退出 | 关窗触发 `app-request-exit`；无残留 `node.exe`/`qkrpc.exe`（任务管理器） |
| 7 | 更新检测 | 设置页可见版本；试验通道 `latest.yml` 可拉取（需 Bitiful 已上传） |
| 8 | 内嵌浏览器 | 打开网页步骤可挂载 WebContentsView（P6） |

自动化仅覆盖 1–2；3–8 需本机人工或后续 E2E。

## 后续（非阻塞）

- [ ] `win-unpacked` 冷启动自动化 smoke（`-Action launch`）— 当前本机 win-unpacked 窗口标题 `Error` 且无 :3000–:3020 监听，需交互排查 `bootProduction`（日志 `%TEMP%\\quicker-agent-electron-boot.log` 或 `%LOCALAPPDATA%\\QuickerAgent\\electron-boot.log`）；`verify` 已通过
- [x] Bitiful 试验通道上传脚本 + CI 可选 gate（`BITIFUL_ELECTRON_UPLOAD_IN_CI`）
- [ ] `voice_ipc` stdio 模式与 WebSocket 转写路径统一（可选）
- [ ] `plugin_update` 完整 staged runtime 下载（voice-asr）
- [x] CI workflow：`.github/workflows/release-agent-electron.yml`（tag / workflow_dispatch；artifact 上传，不阻塞 Tauri 正式 release）
