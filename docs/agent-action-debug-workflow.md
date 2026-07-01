# Agent：动作运行失败排错流程

Quicker 表达式 / 子程序 / DLL 报错时，Agent **优先用 qkrpc trace**，再读 `failureLocation` 定位 `data.json`；trace 不够时看返回的 **`stackTrace` / `logExcerpt`**，或手动查 `quicker.log`。

## 流程概览

```text
1. qkrpc_health → 失败则 qkrpc_wait
2. qkrpc_action_debug（MCP）或 qkrpc action run --trace --wait --json（CLI）
3. ok=false → 读 JSON：
     failureLocation.dataJsonPointer  → 改哪一步 / 哪个 inputParams
     errorMessage                     → 用户可见摘要
     stackTrace                       → 异常堆栈（trace 内捕获时）
     logExcerpt                       → 自动从 quicker.log 摘取的同动作 ERROR/WARN 块
     events[kind=error|warning]       → 逐步 trace
4. 仍缺细节 → 读完整日志：
     %LocalAppData%\Quicker\logs\quicker.log
     搜 [action:{标题}] 或 id={guid}
5. 改 .quicker/ → workspace_program patch → 再 debug 验证
```

## 命令对照

| 场景 | MCP | CLI |
|------|-----|-----|
| **排错（推荐）** | `qkrpc_action_debug` `id=<guid\|名称>` | `qkrpc action run --id <id> --trace --json` |
| 仅等结果、不要步骤 | `qkrpc_action_run` `wait=true` | `qkrpc action run --id <id> --wait --json` |
| Quicker 步骤调试 UI | — | `qkrpc action run --id <id> --debug --wait`（**不要**与 `--trace` 同用） |

**Agent 规则：** 需要步骤输出时用 **`qkrpc_action_debug`**（= `--trace`），不要用普通 `run`。

## trace JSON 字段（失败时）

| 字段 | 用途 |
|------|------|
| `failureLocation.stepPath` | 步骤索引路径（如 `1`、`0/if/0`），对应 patch `stepPath` |
| `failureLocation.dataJsonPointer` | 如 `steps[1].inputParams.code` → 直接打开 `data.json` 字段 |
| `failureLocation.stepRunnerKey` | 定位 step-runner schema |
| `failureLocation.message` | 该步错误摘要 |
| `failureLocation.stackTrace` | 该步 error 事件的堆栈 |
| `stackTrace` | 顶层堆栈（未处理异常或 failureLocation 汇总） |
| `logExcerpt` | **自动**从 `quicker.log` 尾部匹配 `[action:标题]` 的 WARN/ERROR + 后续 stack 行 |
| `events[]` | 逐步 `step_begin` / `input` / `error`；`kind=error` 可含 `stackTrace` |

## quicker.log 何时还需要

| trace 已有 | 仍查 log 的情况 |
|------------|-----------------|
| `errorMessage` 只有「解析表达式出错」 | `ExpressionRunner` 完整堆栈常在 log 的 ERROR 行（`logExcerpt` 应已附带） |
| 无 `stackTrace` / 空 `logExcerpt` | 动作标题与 log 中 `[action:…]` 不一致；或 log 被轮转/路径非默认 |
| 插件/DLL 内部 log4net | 部分组件只写 log、不写 trace event |

默认 log 路径：`%LocalAppData%\Quicker\logs\quicker.log`

PowerShell 快速查看（动作标题「图标」）：

```powershell
Select-String -Path "$env:LOCALAPPDATA\Quicker\logs\quicker.log" -Pattern '\[action:图标\]' | Select-Object -Last 5
Get-Content "$env:LOCALAPPDATA\Quicker\logs\quicker.log" -Tail 80
```

## 典型表达式错误链（示例）

日志形态：

```text
[action:图标] WARN ... 动作(图标)运行失败：运行子程序(IconPicker)失败。运行子程序(QExpr)失败。解析表达式出错。
内部错误：处理程序类型不匹配。
[1] ERROR QuickerExpressionEnhanced.ExpressionRunner - Failed to execute expression. Code: Runner.ShowMainWindow(_context);
System.ArgumentException: 处理程序类型不匹配。
   在 IconPicker.Injection...
```

Agent 解读：

1. **失败步**：trace `failureLocation` → 多为 QExpr / 子程序步的 `code` 或 `registration`
2. **根因**：`stackTrace` 或 `logExcerpt` 里最内层 `at` 行（DLL 方法）
3. **修复**：改对应 package 源码 → `build.ps1 -Test` → 再 `qkrpc_action_debug`

## 与 patch 工作流衔接

```text
debug 失败
  → failureLocation.dataJsonPointer = steps[1].inputParams.code
  → qkrpc_action_get / 读 .quicker/actions/{id}/data.json
  → qkrpc_step_runner_get（该 stepRunnerKey）
  → 改 code / inputParams
  → workspace_program patch
  → qkrpc_action_debug 复验
```

## 实现说明（维护者）

- Trace 实现：`QuickerRpc.Plugin.V1/Services/XActionTraceRunService.cs` + `TerminalActionLogger`
- 失败定位：`ActionTraceLocationResolver` → `failureLocation`
- log 摘录：`QuickerRpc.Diagnostics.QuickerLogTailReader`（trace 失败时 CLI/serve 自动调用）
- MCP `qkrpc_action_debug` → serve `trace=true` → 同上 JSON

人类 CLI 说明：[docs/cli-commands.md](cli-commands.md) · 总路由：[docs/qkrpc-agent-usage.md](../../../docs/qkrpc-agent-usage.md)
