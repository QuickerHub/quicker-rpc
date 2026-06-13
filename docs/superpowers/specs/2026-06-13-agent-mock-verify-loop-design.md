# Agent 闭环 Mock 验证 — 设计规格

> **Status:** draft · **Date:** 2026-06-13  
> **动机：** SDK L2 batch 显示「patch 成功 ≠ 可运行」；交互步骤（form/file/窗口）无法在 headless trace 下闭环。ActionRuntime 已有 deterministic mock，但未接到 qkrpc Agent 路径。

---

## 1. 目标

| 目标 | 说明 |
|------|------|
| **闭环** | Agent：`patch` → **mock run** → 结构化反馈 → 修正 → 再 run，无需人工点 UI |
| **可判定 F 轴** | benchmark / SDK runner 用 **断言** 替代「trace 目测」 |
| **真实反馈** | Agent 看到的不仅是 `ok: false`，还有 **逐步 I/O、变量快照、mock 账本** |
| **双引擎一致** | 同一套 mock profile 尽量同时服务 ActionRuntime standalone 与（可选）Plugin trace 回退 |

**Non-goals**

- 不替代 Quicker 真机 UI 调试（`--debug` 保留）
- 不 mock 100% 步骤（首版覆盖 L2 主干 + benchmark 清单）
- 不要求 mock 与真实 Windows 行为 bitwise 一致（**确定性 + 可断言** 即可）

---

## 2. 现状：三条执行路径

```text
                    ┌─────────────────────────────────────┐
                    │  Agent (SDK / MCP / QuickerAgent)   │
                    └─────────────────┬───────────────────┘
                                      │
          ┌───────────────────────────┼───────────────────────────┐
          ▼                           ▼                           ▼
   action run --trace          action.runtime.run            action run (live)
   (Plugin XActionRunner)      (--standalone)                 (无 trace)
          │                           │
   真实剪贴板/HTTP/窗口          NoopHostServices
   QuickerRpcActionTraceEvent   outputVars + logs（无逐步 trace）
          │                           │
          │                     ActionRuntime.Tests 内有
          │                     DeterministicTestScope +
          │                     EquivalenceMockConfigurator
          │                     （仅 dotnet test，未暴露 CLI）
          ▼
   F 轴：5/7 L2 可 trace；form/file 不可 headless
```

| 路径 | 入口 | Mock | Agent 友好反馈 |
|------|------|------|----------------|
| Plugin trace | `qkrpc action run --id … --trace` | ❌ 全真实 IO | ✅ `events[]` 逐步 |
| Runtime standalone | `qkrpc action run --standalone --id …` | ❌（默认 noop host） | ⚠️ `outputVars` + `logs`，无 step 级 |
| Runtime tests | `DeterministicTestScope` | ✅ 按 stepKey 配置 | ❌ 无 qkrpc/MCP |

**已有可复用资产**

- `Quicker.ActionRuntime`：`Deterministic*Operations`、`RecordingHostServices`、`EquivalenceMockConfigurator`
- `docs/.../execution-equivalence-testing.md`：mock 层表
- B01 retro：`useActionParam` + `--param` 无头验证选区/输入
- `QuickerRpcActionTraceEvent`：Plugin trace 的稳定 schema（`kind`, `paramKey`, `paramValue`, `varName`…）

---

## 3. 目标架构

```text
  patch (workspace_program)
       │
       ▼
  action validate / runtime-check     ← 结构 + 支持步骤集
       │
       ▼
  action run --mock --profile <id>    ← 新：统一 mock 入口
       │
       ├─► ActionRuntime + MockProfileApplier
       │         └─► DeterministicTestScope (RuntimeServices.Push)
       │
       └─► 输出 MockRunReport（对齐 trace + 断言块）
       │
       ▼
  rubric assert (本地/SDK)            ← F 轴自动分
       │
       ├─ pass → retro / 下一任务
       └─ fail → Agent 读 report.fixHints → 再 patch
```

**路由原则**

| 场景 | 推荐模式 |
|------|----------|
| Agent benchmark / CI | **`mock`**（默认） |
| 开发者在 Quicker 里点运行 | `live` |
| 深度排查逐步语义 | `trace`（Plugin，真实 IO） |
| 无 Quicker、纯 JSON 程序 | `standalone` + `mock` |

Plugin trace **不优先加 mock**（Windows 耦合重）；mock 跑在 **ActionRuntime** 上，从 Quicker 拉 `action get full` 编译为 `ActionExecutionPackage`（已有 `ActionRuntimeQuickerLoader`）。

---

## 4. Mock Profile 模型

### 4.1 文件位置

```text
agent-gui/benchmarks/mock-profiles/
  _schema.json
  clip-lines-expr.json
  multi-var-assign.json
  http-json-origin.json
  …
```

与 `authoring-tasks.json` 通过 **`mockProfile`** 字段关联（默认同 task id）。

### 4.2 Profile JSON（草案）

```json
{
  "id": "clip-lines-expr",
  "version": 1,
  "inputParam": null,
  "initialVars": {},
  "mocks": {
    "clipboard": {
      "unicodeText": "b\na\n\na\nc\n"
    },
    "http": {
      "https://httpbin.org/get": {
        "statusCode": 200,
        "content": "{\"origin\":\"203.0.113.1\",\"url\":\"https://httpbin.org/get\"}"
      }
    },
    "time": { "fixedUtc": "2026-06-13T06:00:00Z" },
    "explorerPath": { "lastPath": "D:/source/repos/quicker/quicker-rpc" },
    "host": {
      "messageBox": "Yes",
      "userInput": "typed-answer",
      "form": {
        "title": "示例任务",
        "tags": "工作,紧急",
        "priority": "高",
        "note": "明天前完成"
      }
    },
    "files": {
      "D:/mock/report.pdf": { "contentBase64": "…" }
    },
    "window": {
      "foregroundTitle": "Visual Studio Code",
      "handle": 12345
    }
  },
  "assertions": {
    "success": true,
    "outputVars": {
      "c": "3"
    },
    "clipboardText": "a\nb\nc",
    "eventsContain": [
      { "kind": "output", "stepRunnerKey": "sys:writeClipboard", "varName": "clipOk" }
    ],
    "eventsNotContain": [
      { "kind": "error" }
    ]
  }
}
```

### 4.3 与 `EquivalenceMockConfigurator` 的关系

| 层 | 职责 |
|----|------|
| `EquivalenceMockConfigurator` | 按 **stepKey** 的通用默认值（测试 harness） |
| **MockProfile** | 按 **benchmark 任务** 的场景数据 + **断言** |
| **Applier** | profile 覆盖 builder → `DeterministicTestScope.Create` → `ActionRuntimeExecutor.Execute` |

扩展 `DeterministicTestScope.Builder` 公开字段（clipboard/http/form/window）供 Applier 写入，避免 duplicate mock 逻辑。

---

## 5. qkrpc API 设计

### 5.1 CLI

```powershell
# 推荐：Quicker 已开 + 插件，从 catalog 拉 program 后 mock 执行
qkrpc action run --id <guid> --mock --mock-profile clip-lines-expr --json

# 显式 profile 文件
qkrpc action run --id <guid> --mock --mock-profile-file ./mock.json --json

# 与 B01 相同：模拟动作参数 / 选区
qkrpc action run --id <guid> --mock --mock-profile selection-pipeline --param "hello world" --json

# standalone + mock（无 Quicker 时，dir / xaction）
qkrpc action run --standalone --dir .quicker/actions/<id> --mock --mock-profile … --json
```

**冲突规则：** `--mock` 与 `--debug` 互斥；`--mock` 与 `--trace` 互斥（mock 自带 synthetic trace）。

### 5.2 serve / MCP

| op | 说明 |
|----|------|
| `action.run` | 增 `mock: bool`, `mockProfile`, `mockProfileFile`, `assert: bool` |
| `action.runtime.run` | 同上（standalone 路径） |
| `action.mock.profiles.list` | 列出内置 profile id |
| `action.mock.profiles.get` | 返回 profile + 文档（Agent 可读） |

MCP 工具（第三方便 Agent）：

```text
qkrpc_action_run(
  id, param?,
  mode: "mock" | "trace" | "live",   // default mock for benchmark
  mockProfile?,
  assert?: boolean                   // 服务端跑 rubric，返回 pass/fail
)
```

### 5.3 响应：`MockRunReport`

与 `QuickerRpcActionTraceRunResult` **字段兼容**，附加 mock 专用块：

```json
{
  "ok": true,
  "action": "mock-run",
  "mode": "mock",
  "mockProfile": "clip-lines-expr",
  "actionId": "…",
  "durationMs": 42,
  "outputVars": { "beforeCount": 4, "afterCount": 3 },
  "errorMessage": null,
  "stopFlag": "None",
  "events": [ /* QuickerRpcActionTraceEvent 同形 */ ],
  "mockLedger": {
    "clipboard": { "reads": 1, "writes": ["a\nb\nc"], "finalUnicodeText": "a\nb\nc" },
    "http": [{ "url": "https://httpbin.org/get", "statusCode": 200 }],
    "host": { "notifications": ["剪贴板已整理：4 行 → 3 行"], "formsSubmitted": 1 },
    "files": [{ "path": "…/.local/report_20260613.pdf", "operation": "copyTo" }]
  },
  "assertions": {
    "ran": true,
    "passed": true,
    "failures": []
  }
}
```

**Agent 可读 `fixHints`（断言失败时）**

```json
"fixHints": [
  {
    "code": "OUTPUT_VAR_MISMATCH",
    "message": "expected outputVars.c=3, got 0",
    "hint": "evalexpression: number vars use Convert.ToDouble(1) for literals",
    "docRef": "quicker-authoring-evalexpression-multi-var"
  }
]
```

---

## 6. Synthetic Trace（mock 内生成）

ActionRuntime 执行 today 只产 `logs[]`。需在 **mock 模式** 打开 step 级记录：

| 实现选项 | 优劣 |
|----------|------|
| A. Runtime 内 `IMockTraceSink` 逐步回调 | ✅ 与 standalone 一致；需 ActionRuntime 小改 |
| B. 仅从 `logs` 正则解析 | ❌ 脆弱 |
| C. 跑完用 outputVars 拼假 trace | ❌ Agent 看不到中间步 |

**推荐 A：** 在 `IRuntimeContext` / module 执行前后写 `MockTraceEvent`，字段映射到 `QuickerRpcActionTraceEvent`（`input`/`output`/`step_begin`/`step_end`）。

Plugin trace 仍保留为 **golden 对照**（可选 `mock trace vs plugin trace diff` 开发工具，非 Agent 默认）。

---

## 7. Agent 闭环流程

### 7.1 SDK benchmark runner（`scripts/sdk`）

```text
for task in tasks:
  run = agent.send(wrapBenchmarkPrompt(task))
  actionId = extractFromResult(run)
  report = qkrpc action run --mock --mock-profile {task.id} --assert --json
  payload = { task, run, report, assertionsPassed: report.assertions.passed }
  if !report.assertions.passed && retries < 2:
    agent.send(formatFixPrompt(report.fixHints))
```

### 7.2 QuickerAgent chat

在 `action_debug` / run 工具增加 **`mode: mock`**；benchmark 会话默认 mock，用户手动「真机运行」切 `trace`。

### 7.3 与 retro / learned-skills 联动

断言失败 → 自动写 `docs/authoring-references/benchmarks/retro/` 条目 → 更新 `learned-skills/registry.json`（已有 Phase 3 流程）。

---

## 8. L2 任务 mock 要点（首版 profile）

| task id | mock 重点 | 断言 |
|---------|-----------|------|
| `clip-lines-expr` | clipboard 多行含空行重复 | 写回 clipboard 行数减少；notify 含行数 |
| `multi-var-assign` | 无外部 IO | `outputVars.c == 3` 或 showText 事件 paramValue |
| `http-json-origin` | http bin stub | showText `203.0.113.1` |
| `window-vscode-branch` | foregroundTitle 含/不含 VS Code 两 profile | 分支步执行记录 |
| `form-to-clipboard` | host.form 字段 | clipboard 含 Markdown 任务清单 |
| `file-copy-timestamp` | files seed + explorerPath | mockLedger.files 有 copyTo |
| `read-structure-first` | 只读结构任务 | mock 可选跳过 |

---

## 9. 分阶段落地

### P0 — 最小闭环（1–2 天）

- [x] `MockProfile` JSON schema + 3 个 profile（multi-var, http-json, clip-lines）
- [x] `ActionRuntimeExecutor` mock 路径：`RuntimeServices.Push(Deterministic…)` via `Quicker.ActionRuntime.Mocking`
- [x] CLI：`qkrpc action run --id … --mock --mock-profile … --json`
- [x] 返回 `outputVars` + 基础 `assertions.passed` + `mockLedger` + `fixHints`
- [x] SDK：`run-benchmark-task.ts` 可选 `--verify-mock`

### P1 — Agent 级反馈（3–5 天）

- [x] Synthetic trace → `events[]`（step_begin/step_end + error）
- [x] `mockLedger`（clipboard/http/host/files）
- [x] `fixHints` + `--assert`
- [x] MCP `qkrpc_action_run(mode=mock)` + `qkrpc_action_mock_profiles`
- [x] serve `action.mock.profiles.list` + `action.run` mock 路由
- [x] 7 个 L2 profile（含 form / file-copy）；read-structure-first 仍可选跳过

### P2 — 产品与文档

- [x] `/tool-test` mock 面板（复用 `invokeActionRuntime`）
- [x] `docs/agent-authoring-benchmark.md` F 轴改为 mock assert
- [x] 可选：Plugin trace vs mock diff 开发者命令（`qkrpc action mock-trace-diff`）

---

## 10. 开放问题

1. **ActionRuntime 支持度：** mock 前仍要 `runtime-check`；不支持步骤是 **fail fast** 还是 **fallback plugin trace**？  
   → 建议：benchmark **fail fast** + 报告 `unsupportedStepKeys`。

2. **子程序 / files/ 外链：** mock 是否加载 `.quicker/files/`？  
   → P0 只 mock 主程序；P1 支持 `files` seed。

3. **profile 维护：** 与 `authoring-tasks.json` 单源还是嵌 `verify.mock`？  
   → 建议 tasks 内 `"mockProfile": "clip-lines-expr"` 指向同 id 文件。

4. **number 变量陷阱：** 断言失败时 `fixHints` 链到已有 draft skill（SDK L2 已验证）。

---

## 11. 相关文档

- [execution-equivalence-testing.md](../../../Quicker.ActionRuntime/docs/execution-equivalence-testing.md)
- [2026-06-13-sdk-l2-batch.md](../../authoring-references/benchmarks/retro/2026-06-13-sdk-l2-batch.md)
- [agent-authoring-benchmark.md](../../agent-authoring-benchmark.md)
- [2026-06-13-quicker-action-authoring-learning.md](../plans/2026-06-13-quicker-action-authoring-learning.md)
