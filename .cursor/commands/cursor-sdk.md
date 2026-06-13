# Cursor SDK — quicker-rpc 脚本化 Agent



在仓库根目录用 `@cursor/sdk` 跑 benchmark、learning loop 等 headless 任务。计费与 IDE 同一套餐（Dashboard 里标 **SDK** 分项）。



## 一次性配置



1. **API Key**（与 IDE 同账号）：[Cursor Dashboard → API Keys](https://cursor.com/settings)



```powershell

$env:CURSOR_API_KEY = "key_..."

# 或持久化到 scripts/sdk/.env（gitignore）

```



2. **qkrpc + Quicker 插件**（benchmark / `--with-qkrpc` 时必开）



```powershell

qkrpc ping --json

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

| L2 单条（写动作） | `pwsh ./scripts/Invoke-CursorSdk.ps1 -Script benchmark -TaskId clip-lines-expr` |

| L2 + mock F 轴验证 | `pwsh ./scripts/Invoke-CursorSdk.ps1 -Script benchmark -TaskId multi-var-assign -VerifyMock` |

| L2 主干批量 | `pwsh ./scripts/Invoke-CursorSdk.ps1 -Script benchmark-batch -Preset l2-core -Limit 3` |

| JSON 结果 | 加 `-Json`；落盘 `.local/cursor-sdk/<task>-<ts>.json` |

| 类型检查 | `pwsh ./scripts/Invoke-CursorSdk.ps1 -Script check` |



直接 npm（已 dot-source env）：



```powershell

. ./scripts/cursor-agent-env.ps1

cd scripts/sdk

npm run hello -- --minimal

npm run benchmark -- discover-step-expr

npm run benchmark:batch -- --preset l2-core --limit 1

npm run benchmark:batch -- clip-lines-expr multi-var-assign

```



## Mock 闭环（F 轴）



Agent patch 后可用 ActionRuntime deterministic mock 自动断言（无需真实剪贴板/HTTP）：



```powershell
# CLI（需 Quicker + 插件，从 action id 拉 program）
qkrpc action run --id <guid> --mock --mock-profile multi-var-assign --assert --json
qkrpc action mock-profiles list --json

# SDK benchmark 跑完后自动 mock 验证
npm run benchmark -- multi-var-assign --verify-mock --json
```



MCP：`qkrpc_action_run(id, mode="mock", mockProfile="multi-var-assign", assert=true)`；profile 列表 `qkrpc_action_mock_profiles`。



Profile 定义：`agent-gui/benchmarks/mock-profiles/`。规格见 `docs/superpowers/specs/2026-06-13-agent-mock-verify-loop-design.md`。



默认 **`auto`**（与 IDE Auto 相同，由 Cursor 选模型）。固定模型用于可复现 benchmark：



```powershell

$env:CURSOR_SDK_MODEL = "composer-2.5"

```



## MCP 与 headless



- **qkrpc MCP** 在 `config.ts` 里 inline 配置；`autoReview: false`，否则 headless 无法批准 MCP 调用。

- 默认 **不** 加载 `settingSources`（全量 skills 易 ERROR）；benchmark 规则见 `benchmark-prompt.ts`。

- 需要 IDE 同款 rules/skills：`$env:CURSOR_SDK_SETTING_SOURCES = "project,user"`



## 目录



| 路径 | 作用 |

|------|------|

| `scripts/sdk/src/config.ts` | repo 根、qkrpc 路径、MCP、auto 模型 |

| `scripts/sdk/src/run-benchmark-task.ts` | 单任务 |

| `scripts/sdk/src/run-benchmark-batch.ts` | 批量（`--preset l2-core` / `--tier`） |

| `scripts/Invoke-CursorSdk.ps1` | 包装：env + npm install |



## 相关



- [Cursor TypeScript SDK](https://cursor.com/docs/sdk/typescript)

- `.cursor/commands/cursor-cli.md` — `agent` CLI

- `docs/agent-authoring-benchmark.md` — 任务与评分

- `docs/authoring-references/benchmarks/retro/2026-06-13-sdk-l2-batch.md` — SDK L2 首轮复盘

- `docs/superpowers/plans/2026-06-13-quicker-action-authoring-learning.md` — L2/L3 学习总计划


