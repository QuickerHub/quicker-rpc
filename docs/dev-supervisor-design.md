# Dev 启动器（dev.ps1）



> 仓库根目录**唯一**日常开发入口：`qkrpc serve` + `agent-gui` + 自动热更新。  

> 与产品侧 [agent-gui-launcher.md](./agent-gui-launcher.md)（Alt+Space 快速输入）无关。



## 入口



```powershell

pwsh ./dev.ps1

```



| 参数 | 说明 |

|------|------|

| （默认） | `qkrpc` + `agent` @ :3000，自动监听源码变更并热更 |

| `-Tauri` | 桌面 WebView2 壳（复用已健康的 :3000 前端） |

| `-Browser` | 启动后打开浏览器 |

| `-Services qkrpc` | 仅 qkrpc serve |

| `-NoWatch` | 关闭文件监听（不自动热更） |

| `-Full` | agent 启动时 eager-start voice runtime |

| `-SkipKill` | 不清理已有 :3000 dev |

| `-NoReuse` | `-Tauri` 时强制新 webpack 前端 |



## 行为



1. **前台日志**：子进程 stdout/stderr 带 `[HH:mm:ss][qkrpc|agent|build|watch]` 前缀。

2. **qkrpc**：由 supervisor 独占；agent 设 `AGENT_GUI_SKIP_QKRPC=1`。

3. **热更新**（默认**开启**自动监听）：

   - 监听 `QuickerRpc.*`、`Quicker.ActionRuntime`、`publish` 源码脚本等 → debounce 2s → `Invoke-DevHotUpdate.ps1` → 重启 serve。

   - `publish/` 下的构建产物（`cli/qkrpc.exe`、`plugin/*.dll` 等）**不**触发重建，避免循环。

   - **不重启** agent-gui（Next HMR 保持）。

4. **首次无 runtime**：自动跑一次热更 build 再启 serve。

5. **状态**：`.local/dev-supervisor.json`（gitignore）。



## 场景



| 场景 | 用法 |

|------|------|

| 全栈日常开发 | `pwsh ./dev.ps1` |

| 桌面壳调试 | 先 `dev.ps1`，再 `dev.ps1 -Tauri` |

| 仅改 UI（qkrpc 已在跑） | `dev.ps1 -Services agent` 或保持默认 |

| Cursor Agent 改 Plugin | 保存后自动热更，或手动 `build.ps1 -t` |

| CI / 发布 | `build.ps1`、发布脚本（不变） |



## 架构



```text

dev.ps1

  ├─ (default) scripts/dev-supervisor.mjs

  │     ├── qkrpc-service.mjs

  │     ├── agent-service.mjs → start.mjs --dev

  │     ├── watch-hot-update.mjs

  │     └── hot-update-build.mjs → Invoke-DevHotUpdate.ps1

  └─ (-Tauri) scripts/dev-launcher.ps1 → pnpm tauri:dev

```

