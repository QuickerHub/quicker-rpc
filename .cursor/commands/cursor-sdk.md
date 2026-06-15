# Cursor SDK — quicker-rpc 脚本化 Agent

在仓库根目录用 `@cursor/sdk` 跑 **authoring benchmark**（L3 刻意练习）。计费与 IDE 同一套餐（Dashboard 里标 **SDK** 分项）。

> 动作级学习（pattern / 动作库 / skill）用 **`/learn-authoring`**；命令选型见 **`/cursor-cli`**（索引页）。

## 一次性配置

1. **API Key**：[Cursor Dashboard → API Keys](https://cursor.com/settings)

```powershell
$env:CURSOR_API_KEY = "key_..."
# 或持久化到 scripts/sdk/.env（gitignore）
```

2. **qkrpc + Quicker 插件**（benchmark 必开）

```powershell
qkrpc wait --json
qkrpc agent setup --upgrade
```

3. **安装 SDK 依赖**

```powershell
pwsh -NoProfile -File ./scripts/Invoke-CursorSdk.ps1 -Script install
```

## 常用命令

| 场景 | 命令 |
|------|------|
| 冒烟（仅读仓库） | `pwsh ./scripts/Invoke-CursorSdk.ps1 -Minimal` |
| 冒烟 + qkrpc MCP | `pwsh ./scripts/Invoke-CursorSdk.ps1 -WithQkrpc` |
| 单条 benchmark | `pwsh ./scripts/Invoke-CursorSdk.ps1 -Script benchmark -TaskId discover-step-expr` |
| L2 写动作 | `pwsh ./scripts/Invoke-CursorSdk.ps1 -Script benchmark -TaskId clip-lines-expr` |
| L2 + mock F 轴 | `pwsh ./scripts/Invoke-CursorSdk.ps1 -Script benchmark -TaskId multi-var-assign -VerifyMock` |
| L2 主干批量 | `pwsh ./scripts/Invoke-CursorSdk.ps1 -Script benchmark-batch -Preset l2-core -Limit 3` |
| JSON 结果 | 加 `-Json`；落盘 `.local/cursor-sdk/<task>-<ts>.json` |
| 类型检查 | `pwsh ./scripts/Invoke-CursorSdk.ps1 -Script check` |

npm（已 dot-source env）：

```powershell
. ./scripts/cursor-agent-env.ps1
cd scripts/sdk
npm run benchmark -- clip-lines-expr --verify-mock --json
npm run benchmark:batch -- --preset l2-core --limit 1
```

## Mock 闭环（F 轴）

```powershell
qkrpc action run --id <guid> --mock --mock-profile multi-var-assign --assert --json
npm run benchmark -- multi-var-assign --verify-mock --json
```

MCP：`qkrpc_action_run(id, mode="mock", mockProfile="…", assert=true)`。

Profile：`agent-gui/benchmarks/mock-profiles/`。规格：`docs/superpowers/specs/2026-06-13-agent-mock-verify-loop-design.md`。

固定模型：`$env:CURSOR_SDK_MODEL = "composer-2.5"`（默认可 `auto`）。

## Headless 注意

- qkrpc MCP 在 `config.ts` inline；`autoReview: false`（否则 headless 无法批 MCP）。
- 默认不加载 `settingSources`；benchmark 规则见 `benchmark-prompt.ts`。
- IDE 同款 rules/skills：`$env:CURSOR_SDK_SETTING_SOURCES = "project,user"`

## 目录

| 路径 | 作用 |
|------|------|
| `scripts/sdk/src/config.ts` | repo 根、qkrpc 路径、MCP |
| `scripts/sdk/src/run-benchmark-task.ts` | 单任务 |
| `scripts/sdk/src/run-benchmark-batch.ts` | 批量 |
| `scripts/Invoke-CursorSdk.ps1` | 包装脚本 |

## 相关

- [Cursor TypeScript SDK](https://cursor.com/docs/sdk/typescript)
- [cursor-cli.md](./cursor-cli.md) — 命令索引
- [learn-authoring.md](./learn-authoring.md) — 动作级学习
- [agent-authoring-benchmark.md](../../docs/agent-authoring-benchmark.md)
- [agent-gui-eval.md](../../docs/agent-gui-eval.md) — 产品 `/api/chat` 路径评测（Runner B）
