# 命令索引 — Agent 自动化与动作学习

> 在 Cursor 聊天输入斜杠命令（如 `/learn-authoring`）。本页是**选型地图**，不是 `agent` CLI 手册。

## 我想做什么 → 用哪个命令

| 目标 | 命令 | 说明 |
|------|------|------|
| **开始 / 续跑动作编写学习** | **`/learn-authoring`** | IDE 内：读进度 → 动作库解构 / pattern / skill 晋升 → mock 验证 |
| L3 benchmark（写动作 + mock） | **`/cursor-sdk`** | Headless：`@cursor/sdk` + qkrpc MCP，`‑VerifyMock` 自动 F 轴 |
| L1 单模块维护（143/143 已完成） | **`/learn-modules`** | 新 step-runner 或 schema 变更时补 `authored/` |
| qkrpc MCP / skills 安装 | **`/agent-setup`** | `qkrpc agent setup --upgrade` |
| 改 Plugin/CLI 后热更新 | **`/hot-update`** | `build.ps1 -t` |
| agent-gui 前端检查 | **`/frontend-check`** | `dev_frontend_check` |
| 正式发布 | **`/publish`** | getquicker + GitHub Release |

**默认路径**：人在 IDE 里学动作 → **`/learn-authoring`**；要无人值守批量 benchmark → **`/cursor-sdk`**。

---

## 学习体系速查

```text
/learn-authoring   L2 pattern + 动作库 + skill 晋升（IDE，可读可写）
/learn-modules     L1 单模块 schema（维护态）
/cursor-sdk        L3 authoring-tasks 实写 + mock assert（headless）
```

进度文件：

- 动作级：`docs/authoring-references/action-patterns/.learning-progress.json`
- 模块级：`docs/authoring-references/step-modules/.learning-progress.json`

计划：`docs/superpowers/plans/2026-06-13-quicker-action-authoring-learning.md`

---

## Headless 选型（仅脚本 / CI）

| 场景 | 用 | 不用 |
|------|-----|------|
| 批量 benchmark、定时 loop | `/cursor-sdk` → `Invoke-CursorSdk.ps1` | 裸 `agent` 拼参数 |
| 通用仓库 coding、自定义 prompt | `Invoke-CursorAgent.ps1` | 重复手写 `agent --resume` |
| IDE 内学动作、改文档 | `/learn-authoring` | headless（缺交互、难审 retro） |

```powershell
# SDK benchmark + mock（推荐 headless 入口）
pwsh -NoProfile -File ./scripts/Invoke-CursorSdk.ps1 -Script benchmark -TaskId clip-lines-expr -VerifyMock -Json

# 通用 agent 包装（会话复用 .cursor/agent-cli/last-chat-id.txt）
pwsh -NoProfile -File ./scripts/Invoke-CursorAgent.ps1 -Prompt "分析 action-patterns 进度" -Force
```

持续 loop（先手动跑一轮对应斜杠命令，再 arm）：

```powershell
pwsh scripts/run-action-learning-loop.ps1    # 动作级
pwsh scripts/run-learning-loop.ps1           # 模块级
```

---

## 前置（学习 / benchmark 共用）

1. Quicker 已运行且 QuickerRpc 插件已加载
2. `qkrpc_health` 或 `qkrpc wait`（勿 shell 连环 ping）
3. Headless 另需 `CURSOR_API_KEY` 或 `agent login`（见下节）

---

## agent CLI 速查（仅 headless 需要时）

安装：Cursor 命令面板 → Install `cursor` command → `agent --version`

```powershell
. ./scripts/cursor-agent-env.ps1
Test-CursorAgentAuth          # 未登录 → agent login 或 $env:CURSOR_API_KEY
```

| 场景 | 命令 |
|------|------|
| 交互 REPL | `agent` |
| 非交互单轮 | `agent -p --force --workspace . "任务"` |
| 续聊 | `agent --resume <chatId> -p --force "继续"` |

Headless 常用：`-p`、`--force`、`--approve-mcps`、`--output-format json`。当前版本无 `--trust`，用 `--force`。

| 现象 | 处理 |
|------|------|
| `Not logged in` | `agent login` 或 `CURSOR_API_KEY` |
| `agent ls` Ink 报错 | 在真实 TTY 运行 |
| 长时间无输出 | 登录 + `-Force` + 检查网络 |

外部文档：[CLI 用法](https://cursor.com/docs/cli/using) · [参数](https://cursor.com/docs/cli/reference/parameters)

---

## 相关文档

- [agent-authoring-benchmark.md](../../docs/agent-authoring-benchmark.md) — 任务与评分
- [PIPELINE.md](../../docs/authoring/PIPELINE.md) — 文档单源管线
- [cursor-sdk.md](./cursor-sdk.md) — SDK 细节
