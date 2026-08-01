# 本地开发入口

仓库根 `dev.ps1` 是 QuickerRpc 与 QuickerAgent 的唯一日常开发入口。

## 常用命令

```powershell
pwsh ./dev.ps1                 # qkrpc serve + Next.js @ :3000
pwsh ./dev.ps1 -Electron       # Electron 壳，复用健康的 :3000
pwsh ./dev.ps1 -Tauri          # legacy WebView2 壳
pwsh ./dev.ps1 -Services qkrpc # 只启动 qkrpc
pwsh ./dev.ps1 -Browser        # 就绪后打开浏览器
pwsh ./dev.ps1 -NoWatch        # 关闭 Plugin/CLI 自动热更新
pwsh ./dev.ps1 -Full           # 提前启动语音 runtime
```

## 运行关系

```text
dev.ps1
  +-- default -> scripts/dev-supervisor.mjs
  |     +-- qkrpc-service.mjs
  |     +-- agent-service.mjs
  |     +-- watch-hot-update.mjs
  |     `-- hot-update-build.mjs
  `-- -Electron/-Tauri -> scripts/dev-launcher.ps1
```

- supervisor 独占 `qkrpc serve`，前端通过 `AGENT_GUI_SKIP_QKRPC=1` 避免重复拉起。
- 默认监听 Plugin/CLI/publish 源码；变更后执行开发热更新并重启 serve，不重启 Next HMR。
- 状态写入 `.local/dev-supervisor.json`，不入库。
- Electron 是正式桌面壳；Tauri 仅保留兼容调试。
- 不要同时启动两个占用 `:3000` 的前端实例。

参数和行为变化时，以 `dev.ps1`、`scripts/dev-supervisor.mjs --help` 及其测试为准，
同步更新本文即可；不要另建启动性能或壳层实施文档。
