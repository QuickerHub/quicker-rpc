# QuickerAgent Electron 打包方案设计

> 开发期双轨：`-Tauri` / `-Electron` 切换；正式发布仍走 Tauri，Electron 功能对齐达标后再切换。

## 目标

为 `agent-gui` 增加 Electron 桌面壳与 NSIS 打包管线，与现有 Tauri 共享 `resources/` 布局（Next standalone + Node + qkrpc + rg），并逐步用 Electron main/preload 实现与 Tauri 同名的桌面 IPC。

## 范围

| 阶段 | 内容 |
|------|------|
| P0（本期） | 共享 `desktop-bundle-prepare`、Electron 空壳启动生产 UI、`electron:prepare` / `electron:build` / `dev.ps1 -Electron` |
| P1 | `desktop-bridge` + lifecycle（`graceful_exit` 等） |
| P2–P5 | launcher、plugin、voice、clipboard IPC 对齐 |
| P6 | `WebContentsView` 内嵌浏览器 |
| P7 | `electron-updater` + 可选发布切换 |

## 架构

```
Next.js UI → desktop-bridge → Tauri invoke | Electron preload IPC
Electron main → backend-spawn (Node UI + qkrpc) → resources/
Tauri Rust   → 同上 resources 布局
```

共享打包：`scripts/desktop-bundle-prepare.mjs` 输出至 `src-tauri/resources/` 或 `electron/resources/`。

## 共存策略

- **开发**：`pwsh ./dev.ps1 -Electron` 与 `-Tauri` 互斥，均复用 `:3000` dev server
- **发布**：`Publish-QuickerAgent.ps1` 不变（Tauri）；`Publish-QuickerAgent-Electron.ps1` 仅预检/本地 artifact
- **Windows 安装路径（Electron 试验包）**：与 Tauri 对齐为 `%LOCALAPPDATA%\QuickerAgent\quicker-agent.exe`（`electron/build/installer.nsh` + `win.executableName`）；安装时结束旧进程并删除遗留 `QuickerAgent.exe`。用户数据目录 `%LOCALAPPDATA%\QuickerAgent`（plugins、local/）两壳共用，无需迁移。
- **切换条件**：P0–P6 验收通过 + `electron:verify-bundle` + 手动 smoke

## 目录

```
agent-gui/
  electron/
    main.mjs
    preload.mjs
    paths.mjs
    backend-spawn.mjs
    resources/          # staged, gitignored
  scripts/
    desktop-bundle-prepare.mjs
    electron-prepare.mjs
    electron-dev.mjs
    verify-desktop-bundle.mjs
  lib/
    desktop-shell.ts
    desktop-bridge.ts
```

## IPC 命令清单

与 `src-tauri/src/lib.rs` `generate_handler!` 一致（约 40+），分 P1–P7 移植；P0 仅保证窗口与 HTTP 后端可用。

## 验证

| 命令 | 用途 |
|------|------|
| `pnpm electron:verify-bundle` | staged resources 完整性 |
| `pnpm electron:build` | NSIS 安装包（非正式 publish） |
| `pwsh ./dev.ps1 -Electron` | 开发壳 + `:3000` |
| `pwsh ./publish/Publish-QuickerAgent-Electron.ps1` | 完整构建 + 输出 latest.yml 上传提示 |

## 实现状态（2026-06-11）

P0–P7 已完成：`electron/` 下 main、lifecycle、launcher、plugin-runtime、voice-plugin、clipboard-history、embedded-browser、updater；前端经 `lib/desktop-bridge.ts` 统一 IPC。

- **正式发布**：仍用 `Publish-QuickerAgent.ps1`（Tauri + `latest.json`）
- **Electron 试验发布**：`Publish-QuickerAgent-Electron.ps1` → `Upload-QuickerAgentElectronToBitiful.ps1`（或 `-UploadBitiful`）→ Bitiful `quicker-agent-electron/` + `latest.yml`
- **已知限制**：无系统托盘；剪贴板历史默认关闭；语音 IPC 默认 TCP/WebSocket（stdio bridge 已就绪）
