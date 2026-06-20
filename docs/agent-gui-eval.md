# agent-gui 真实 Agent 能力评测（Runner B）

通过 **生产 `/api/chat` 路径** 跑 benchmark，覆盖 agent-gui 完整栈（`buildSystemInstructions`、`pickChatTools`、slash 展开、context compression 等）。与 **`scripts/sdk`（Cursor SDK + qkrpc MCP）** 形成双 Runner 对照。

## 前置条件

1. **agent-gui dev server**（默认 `http://127.0.0.1:3000`）

```powershell
cd agent-gui
pnpm dev
```

2. **qkrpc serve + Quicker 插件**

```powershell
qkrpc wait --json
```

3. **LLM 已配置**（与 `/tool-test` 相同；可用 `pnpm probe:llm-configs`）

若 live eval 报 `error: Gone` 或 `status=error` 且无 tool calls，通常是当前默认模型 endpoint 返回 **HTTP 410**（模型下线或路由失效）。处理：

```powershell
cd agent-gui
pnpm probe:llm-configs -- --method chat
pnpm agent-eval -- discover-step-expr --json   # 或设置 AGENT_EVAL_LLM_SELECTION
```

可选环境变量：

| 变量 | 说明 |
|------|------|
| `AGENT_GUI_EVAL_BASE_URL` | 覆盖 base URL（含端口） |
| `AGENT_GUI_PORT` | 默认 `3000` |
| `AGENT_EVAL_LLM_SELECTION` | 模型选择 raw 字符串 |
| `QKRPC_WORKSPACE_ROOT` | benchmark 工作区根目录 |

## 命令

| 场景 | 命令 |
|------|------|
| 冒烟（只读 L0） | `pwsh ./scripts/Invoke-AgentGuiEval.ps1 -Preset smoke` |
| **QuickerBench IO 核心** | `pwsh ./scripts/Invoke-AgentGuiEval.ps1 -Script batch -Preset quickerbench-core -VerifyMock` |
| Launcher 栈 | `pwsh ./scripts/Invoke-AgentGuiEval.ps1 -Script batch -Preset gui-launcher` |
| GUI 冒烟 | `pwsh ./scripts/Invoke-AgentGuiEval.ps1 -Script batch -Preset gui-smoke` |
| agent-defs（slash / 子代理） | `pwsh ./scripts/Invoke-AgentGuiEval.ps1 -Script batch -Preset gui-agent-defs` |
| Nightly 编排 | `pwsh ./scripts/Invoke-AgentEvalNightly.ps1 -Preset gui-smoke` |
| 单条任务 | `pwsh ./scripts/Invoke-AgentGuiEval.ps1 -TaskId discover-step-expr` |
| L2 + mock F 轴 | `pwsh ./scripts/Invoke-AgentGuiEval.ps1 -TaskId multi-var-assign -VerifyMock` |
| LLM Judge | `pwsh ./scripts/Invoke-AgentGuiEval.ps1 -TaskId discover-step-expr -Judge` |
| 批量 | `pwsh ./scripts/Invoke-AgentGuiEval.ps1 -Script batch -Preset l2-core -Limit 1` |
| 确定性单测 | `pwsh ./scripts/Invoke-AgentGuiEval.ps1 -Script test` |
| **UI 路径（Playwright）** | `pwsh ./scripts/Invoke-AgentGuiEval.ps1 -Script ui -TaskId discover-step-expr` |
| SDK vs GUI 对照 | 先跑两边 batch，再 `pwsh ./scripts/Invoke-AgentGuiEval.ps1 -Script compare -Preset l2-core` |

npm（在 `agent-gui/` 目录）：

```powershell
pnpm agent-eval -- discover-step-expr --json
pnpm agent-eval:batch -- --preset smoke
pnpm agent-eval:compare -- --preset l2-core --limit 3
pnpm agent-eval:nightly -- --preset gui-agent-defs
pnpm agent-eval:ui -- discover-step-expr --json
pnpm agent-eval:ui -- launcher-open-hotkeys --headed
```

## 报告

落盘：`.local/agent-eval/<task-id>-<timestamp>.json`

统一 schema：`lib/agent-eval/types.ts`（`AgentEvalReport`）

断言栈：

1. **Run 状态** — stream 完成且有 assistant 消息
2. **Trace rubric（E 轴）** — `lib/agent-eval/trace-rubric.ts` 确定性检查
3. **Mock F 轴** — `--verify-mock` 时调用 `qkrpc action run --mock --assert`
4. **LLM Judge（可选）** — `--judge` 时调用 `scripts/sdk` Cursor SDK 评委（需 `CURSOR_API_KEY`）

### Launcher 场景 rubric（`expect.launcher`）

与 [agent-gui-launcher.md](./agent-gui-launcher.md) 三条快路径对齐，**不断言必须调用 `launcher_resolve`**：

| intent | 通过条件 | 允许路径 |
|--------|----------|----------|
| `open-settings` | `quicker_settings` `action=open` 且 page/preset 匹配 | cache direct / resolve direct / LLM |
| `open-search` | `quicker_settings` 打开搜索（`intent=open-search` 或 `page=search`） | 同上 |
| `run-action` | 出现 `launcher_resolve` / `qkrpc_action_query` / `qkrpc_action_run` / `ask_question` 之一 | 模糊意图允许 LLM 规划 |

通用 `mustCallAny` 用于 workspace 等场景（`Grep` 或 `Read` 任一即可）。实现：`lib/agent-eval/launcher-expect.ts`。

## 与 Cursor SDK 的关系

| Runner | 路径 | 测什么 |
|--------|------|--------|
| A `scripts/sdk` | Cursor SDK + inline qkrpc MCP | headless 编写能力基线 |
| B `agent-gui-eval` | HTTP → `/api/chat` | 产品 Agent 栈（API） |
| C `agent-gui-ui` | Playwright → `/tool-test` | 产品 Agent 栈 + useChat UI |

Runner C 通过 `/tool-test?tab=…&cwd=…` 驱动真实页面（`data-testid` 选择器），拦截 `/api/chat` SSE 解析 trace，报告 `runner: "agent-gui-ui"`。需 `pnpm browser:install`（Edge channel）。

任务源：

- `agent-gui/benchmarks/authoring-tasks.json` — 编写 benchmark（preset `smoke` / `l2-core`）
- `agent-gui/benchmarks/agent-gui-scenarios.json` — Launcher / workspace / agent-stack（preset `gui-smoke` / `gui-launcher` / `gui-all` / `gui-agent-defs`）
- `agent-gui/benchmarks/fixtures/eval-workspace/` — agent-defs 场景隔离工作区（`.quicker/commands`、`agents`）

`gui-agent-defs` 场景通过 `fixture: "eval-workspace"` 将 `cwd` 指向 fixture，避免污染真实 Quicker 工作区。

详见 [agent-authoring-benchmark.md](./agent-authoring-benchmark.md)。

## 代码布局

| 路径 | 作用 |
|------|------|
| `agent-gui/lib/agent-eval/` | 报告 schema、trace 解析、rubric、chat client |
| `agent-gui/scripts/run-agent-eval.ts` | 单任务 CLI |
| `agent-gui/scripts/run-agent-eval-batch.ts` | 批量 CLI |
| `agent-gui/scripts/compare-agent-eval-runners.ts` | SDK/GUI parity |
| `agent-gui/scripts/run-agent-eval-nightly.ts` | 健康检查 + 批量 preset |
| `agent-gui/scripts/run-agent-eval-ui.ts` | Playwright `/tool-test` CLI |
| `scripts/Invoke-AgentEvalNightly.ps1` | Nightly PowerShell 包装 |
| `scripts/sdk/src/judge-eval-report.ts` | Cursor SDK LLM 评委（`npm run judge`） |
| `scripts/Invoke-AgentGuiEval.ps1` | PowerShell 包装 |

CI：PR 触发 `.github/workflows/agent-eval-unit.yml`（确定性单测，无 LLM）。手动 nightly：`.github/workflows/agent-eval-nightly.yml`（默认 `--skip-live` 仅校验 catalog；配置 `AGENT_GUI_EVAL_BASE_URL` secret 后可跑 live）。
