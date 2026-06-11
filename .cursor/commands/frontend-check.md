# agent-gui 前端检查（dev_frontend_check）

在 **agent-gui UI 改动后**执行。先 **Read** skill：`.cursor/skills/quicker-agent-gui-frontend/SKILL.md`。

## 何时执行

- 改了 `agent-gui/components/**`、`app/**`、`lib/**`（页面逻辑）、`app/globals.css`、`electron/**`（影响 UI 时）
- 准备声称「前端已修好 / 完成」之前
- **不必**跑根目录 `build.ps1 -t`（仅 UI 时）

## 前置

1. `pwsh ./dev.ps1` 或 `pwsh ./dev.ps1 -Electron` 在跑（`http://127.0.0.1:3000`）。
2. 等待上次保存触发的 Next 编译完成（约 3–8 秒）。

## 执行（Agent 自跑，勿让用户代劳）

**首选** QuickerAgent / MCP 工具：

```text
dev_frontend_check({ paths: ["/", "/tool-test"] })
```

无 MCP 时用 Shell：

```powershell
Invoke-RestMethod "http://127.0.0.1:3000/api/dev/frontend-check?paths=/,/tool-test"
```

改过 `/tool-test` 或 Electron 标题栏时务必带上 `/tool-test`。

## 循环直到通过

1. `ok: false` → 读返回的 `issues[]` 与 `agent-gui/.local/frontend-build-error.json`、`frontend-client-errors.json`
2. 修源码 → 等待重编译 → 再跑
3. `ok: true` 后：

```powershell
Invoke-RestMethod "http://127.0.0.1:3000/api/dev/frontend-check?clearCaptured=true"
```

或 `dev_frontend_check({ clearCaptured: true })`

## 完成后汇报

- `ok`、探测 URL、`issues` 数量（应为 0）
- 若曾修复：简述根因（一行）

## 禁止

- 未检查就声称前端无错
- 仅改 `agent-gui/**` 却跑 `build.ps1 -t`
- 把 `agent-gui/.local/*.json` 提交 Git
