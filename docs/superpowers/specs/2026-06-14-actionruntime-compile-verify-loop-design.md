# ActionRuntime 编译验证 Agent Loop — 设计规格

> **Status:** draft · **Date:** 2026-06-14  
> **动机：** 大规模验证「Quicker 动作 → ActionRuntime 编译 → mock 断言执行」；支持 Agent 一边跑一边改编译器/运行时；用文件系统管理用例队列与通过标记，可断点续跑。  
> **前置：** [2026-06-13-agent-mock-verify-loop-design.md](./2026-06-13-agent-mock-verify-loop-design.md)（单动作 mock 闭环已落地 P0–P2）

---

## 1. 目标与非目标

| 目标 | 说明 |
|------|------|
| **规模化** | 从本机 Quicker 批量拉组合动作，逐个 `runtime-check` + 可选 `mock --assert` |
| **可续跑** | 用例目录 + 状态文件；`mock_pass` / `compile_ok` 的用例下次 loop 跳过 |
| **Agent 自治** | 编译失败 → Agent 改 `Quicker.ActionRuntime` / qkrpc → 热更新 → 重跑当前用例 |
| **可观测** | 每例落盘 `last-report.json`；全局 `manifest.json` 汇总进度 |
| **分阶段源** | P0 本机组合动作；P1 getquicker 动作库只读快照 |

**Non-goals（首版不做）**

- 不替代 Plugin `trace` 真机验证（mock 确定性断言即可）
- 不要求每个拉取动作都有 mock profile（无 profile 时只跑 compile 阶段）
- 不自动 patch 用户 Quicker 动作（只读拉取 + 本地快照）
- 不做并行多 Agent（单队列串行，避免同时改编译器）

---

## 2. 与现有资产的关系

```text
已有                          本 loop 复用 / 扩展
────────────────────────────────────────────────────────────
qkrpc action runtime-check    ← 每例 Phase A：编译 + 支持度
qkrpc action run --mock       ← 每例 Phase B：mock 断言（有 profile 时）
CompileVerifySyncSamples      ← pull 逻辑参考（sample-sources.json）
compiler-verify/manifest.json ← 内置 demo 样本（Tier P2）
scripts/sdk/benchmark-mock-*  ← mock 调用模式
agent-gui/benchmarks/mock-*   ← profile 格式与断言 schema
```

| 场景 | 入口 |
|------|------|
| 单条调试 | `qkrpc action runtime-check --id … --json` |
| mock 断言 | `qkrpc action run --id … --mock --mock-profile … --assert --json` |
| 批量编排 | **`compile-verify-loop`** 脚本族（本节定义） |
| Agent 修编译器 | `pwsh ./build.ps1 -t`（改 Plugin/CLI 时）或只编 ActionRuntime |

---

## 3. 目录与文件模型

建议根目录（可配置 `COMPILE_VERIFY_LOOP_ROOT`，默认仓库内）：

```text
.local/compile-verify-loop/          # gitignore；或 Quicker.ActionRuntime/cases/queue/
  manifest.json                      # 全局队列、批次、统计
  batches/
    local-composite/                 # 一个「拉取批次」
      sources.json                   # qkrpc 拉取规则（见 §5）
      pulled.json                    # 上次 pull 的 actionId 列表 + 元数据
  cases/
    <case-id>/                       # 一目录一例；case-id 稳定可复现
      case.json                      # 元数据 + 状态机（§4）
      program.json                   # runtime-check 的 compiledProgramJson 快照
      mock-profile.json              # 可选；无则跳过 Phase B
      last-compile.json              # 最近一次 runtime-check 完整响应
      last-mock.json                 # 最近一次 mock run 完整响应
```

### 3.1 `case.json`（核心）

```json
{
  "id": "clipboard-dedupe",
  "version": 1,
  "source": {
    "kind": "quicker-local",
    "actionId": "5d3da582-7dac-4a21-96ac-384323bc2a60",
    "title": "剪贴板去重",
    "editMs": 1718280000000,
    "profileName": "通用",
    "batch": "local-composite"
  },
  "status": "mock_pass",
  "phases": {
    "compile": { "ok": true, "at": "2026-06-14T08:00:00Z", "fullySupported": true },
    "mock": { "ok": true, "at": "2026-06-14T08:00:05Z", "profileId": "clip-lines-expr" }
  },
  "skipUntilEditMs": 1718280000000,
  "tags": ["clipboard", "expr"],
  "notes": ""
}
```

- **`skipUntilEditMs`**：与 `source.editMs` 一致时表示「已通过且源未改」→ `next` 跳过。  
  若用户后来在 Quicker 里编辑动作，`editMs` 变大 → pull/sync 将状态重置为 `pending`。

### 3.2 `manifest.json`（队列视图）

```json
{
  "version": 1,
  "root": ".local/compile-verify-loop",
  "stats": {
    "total": 120,
    "pending": 45,
    "compile_fail": 12,
    "mock_pass": 50,
    "blocked": 8,
    "skipped": 5
  },
  "batches": ["local-composite"],
  "lastRunAt": "2026-06-14T09:00:00Z"
}
```

由脚本 `status` / `next` 维护，不手改。

### 3.3 `mock-profile.json`

与 `agent-gui/benchmarks/mock-profiles/*.json` **同 schema**（`id`, `mocks`, `assertions`）。  
拉取阶段通常**没有** profile → `status` 最高到 `compile_ok`。  
后续可：人工编写、从 benchmark 复制、或 Agent 根据 `structure` 生成草案。

---

## 4. 状态机

```text
                    pull / sync (editMs 变了则回 pending)
                              │
                              ▼
                         ┌─────────┐
                         │ pending │
                         └────┬────┘
                              │ runtime-check
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
        compile_fail    compile_ok        blocked
        (可重试)      (无 mock profile)  (unsupportedSteps
              │               │           且短期不修)
              │               │ mock --assert
              │       ┌───────┴───────┐
              │       ▼               ▼
              │   mock_fail       mock_pass ──► 下次 loop 跳过
              │       │
              └───────┴──► Agent 修代码后 reset → pending（仅当前 case）
```

| status | 含义 | next 行为 |
|--------|------|-----------|
| `pending` | 未跑或源已更新 | 跑 Phase A（+ B 若有 profile） |
| `compile_fail` | 编译/打包失败 | 默认重试；Agent 修编译器后 `retry` |
| `compile_ok` | 编译通过，无 mock 或 mock 未跑 | 有 profile 则跑 B；否则跳过 B |
| `mock_fail` | 断言失败 | Agent 读 `fixHints`；修后重跑 |
| `mock_pass` | 断言通过 | **跳过**（除非 `editMs` 变化） |
| `blocked` | 含不支持步骤且策略为 fail-fast | 跳过直至 runtime 版本 bump |
| `skipped` | 人工标记 | 永久跳过 |

---

## 5. 拉取与筛选（本机组合动作）

### 5.1 `batches/<name>/sources.json`

```json
{
  "kind": "quicker-local",
  "list": {
    "limit": 200,
    "scope": null,
    "query": {
      "filter": { "source": "local" },
      "sort": { "by": "lastEdit", "desc": true },
      "fields": ["actionId", "title", "source", "templateId", "lastEditTimeUtc"]
    }
  },
  "postFilter": {
    "minStepCount": 1,
    "excludeUsesOnlyWrappers": true,
    "excludeEmptyTitle": true,
    "excludeExeFiles": ["_recyclebin"]
  },
  "caseIdTemplate": "{slug(title)}-{actionIdPrefix}"
}
```

### 5.2 为何 list 不够、要 postFilter

`qkrpc action list` 的 `ActionSearchScriptRow` **尚无** `stepCount` 字段；`--fields title` 在部分动作标题含特殊字符时可能产出 **不可解析 JSON**（P0 已改为 list 仅投影 `actionId` 等安全字段）。

**P0 实现：** pull 对每条候选直接 `runtime-check`，用 `totalStepCount` / `actionTitle` 做 postFilter（`minStepCount`），避免 `action get metadata` 解析失败。

可选后续：

| 规则 | 实现 |
|------|------|
| 组合动作 | `runtime-check.totalStepCount >= minStepCount` |
| 非专用包装 | P1：`structure` 检查是否仅 `sys:subprogram` |

已有参考实现：`CompileVerifySyncSamplesCommand`（`action list` + `runtime-check` 写 `program.json`）。

### 5.3 pull 流程

```text
sources.json
    → qkrpc action list (JSON query)
    → 对每条 action get structure (postFilter)
    → 对每条 runtime-check --json
    → 写入 cases/<id>/program.json + case.json (status=pending|compile_fail|compile_ok)
    → 更新 pulled.json + manifest stats
```

`--dry-run` 只列将导入的 action，不写目录。

---

## 6. 单例运行流水线

### Phase A — 编译检查

```powershell
qkrpc action runtime-check --id <actionId> --json
# 或离线：qkrpc action runtime-check --package-file cases/<id>/program.json --json
```

写入 `last-compile.json`。成功则：

- `hasUnsupportedSteps` → `blocked`（或 `compile_ok` + 记 warning，可配置）
- 全支持 → `compile_ok`，保存 `compiledProgramJson` → `program.json`

### Phase B — Mock 断言（可选）

```powershell
qkrpc action run --id <actionId> --mock --mock-profile-file cases/<id>/mock-profile.json --assert --json
# 或 --dir 若用 workspace 快照
```

写入 `last-mock.json`。`assertions.passed` → `mock_pass`。

### Phase C — Agent 修复环（编译/mock 失败时）

```text
1. loop 将当前 case 标为 compile_fail / mock_fail，写出 fixHints / unsupportedSteps
2. Agent 读 cases/<id>/last-*.json + Quicker.ActionRuntime 源码
3. Agent 改编译器/模块/mock → build.ps1 -t 或 dotnet build ActionRuntime
4. loop retry --case <id>（不 advance 队列）
5. 成功 → mock_pass；失败且达 maxRetries → 留 fail 状态，next 下一例
```

**关键约束：** 一次 loop 会话只 **pin 一个 failing case**，修完再跑下一例，避免多失败交叉。

---

## 7. Agent Loop 控制面

### 7.1 脚本族（`scripts/compile-verify-loop/`）

| 脚本 | 职责 |
|------|------|
| `Pull-Cases.ps1` | 读 `batches/*/sources.json`，拉取并建 `cases/` |
| `Repair-Cases.ps1` | slug 目录迁移为 `actionId`，修复损坏 `case.json` |
| `Sync-CaseEdit.ps1` | 对比 Quicker `editVersion`，过期则 `pending` |
| `Link-MockProfiles.ps1` | 按 `mock-action-profiles.json` 复制 benchmark mock |
| `Get-NextCase.ps1` | 返回下一个 `pending`/`compile_fail`/`mock_fail`（跳过 `mock_pass`） |
| `Invoke-Case.ps1` | 跑 Phase A+B，更新 `case.json` + `last-*.json` |
| `Set-CaseStatus.ps1` | 人工 `skipped` / `blocked` / 强制 `pending` |
| `Get-LoopStatus.ps1` | 打印 manifest 统计 + 失败 Top N |
| `Analyze-CompileOkPatterns.ps1` | 汇总 `compile_ok` 的 `supportedStepKeys` 模式（mock 缺口） |
| `Analyze-BlockedPatterns.ps1` | 汇总 `blocked` 的 `unsupportedStepKeys`（编译器缺口） |
| `Summarize-ByKind.ps1` | 按 `source.kind` × `status` 汇总队列 |
| `Start-AgentLoop.ps1` | 编排：`next` → `invoke` → 失败则输出 Agent prompt 文件 → 等待重试 |

环境变量：

- `COMPILE_VERIFY_LOOP_ROOT` — 队列根目录  
- `QKRPC_EXE` — 优先 `publish/cli/qkrpc.exe`（与 mock batch 一致）  
- `LOOP_MAX_RETRIES` — 单例最大重试（默认 3）

### 7.2 Agent 可读 prompt 片段（`cases/<id>/agent-prompt.md`，失败时生成）

```markdown
## Compile-verify case: clipboard-dedupe

- actionId: …
- status: compile_fail → 请修 ActionRuntime 编译器后 `retry`
- unsupportedSteps: sys:foo, sys:bar
- last error: …

### 建议
1. 读 `cases/clipboard-dedupe/last-compile.json`
2. 改 `Quicker.ActionRuntime/...` 对应模块
3. `pwsh ./build.ps1 -t` 或 ActionRuntime 测试
4. `pwsh ./scripts/compile-verify-loop/Invoke-Case.ps1 -CaseId clipboard-dedupe`
```

QuickerAgent / Cursor Agent 通过读该文件 + MCP `qkrpc_*` 进入修复环。

### 7.3 与 SDK benchmark 的区别

| 维度 | SDK `benchmark-run` | compile-verify loop |
|------|---------------------|---------------------|
| 目的 | 评 Agent **写动作** 能力 | 评 **Runtime 编译/执行** 覆盖面 |
| 输入 | `userPrompt` 自然语言 | 已有 Quicker 动作快照 |
| 通过 | mock assert + 六轴 rubric | `runtime-check` + 可选 mock |
| 状态 | 单次 run json | 持久 `case.json` 队列 |

二者可共用 mock profile 文件，但队列独立。

---

## 8. 阶段路线图

### P0 — 队列 + 编译（1–2 天）

- [x] 目录 schema + `manifest.json` / `case.json` 约定
- [x] `Pull-Cases.ps1`（local + runtime-check postFilter）
- [x] `Get-NextCase` / `Invoke-Case`（Phase A compile）
- [x] `Get-LoopStatus` / `Set-CaseStatus`
- [x] `scripts/compile-verify-loop/README.md`

### P1 — Mock + Agent 环（2–3 天）

- [x] `Invoke-Case` Phase B（`-Mock` + `mock-profile.json`）
- [x] 失败写 `agent-prompt.md`
- [x] `Start-AgentLoop.ps1`（半自动：失败暂停）
- [x] 与 `Run-MockL2Batch.ps1` 共用 qkrpc 路径解析（`Resolve-CompileVerifyQkrpcExe`）
- [x] `Analyze-CompileOkPatterns.ps1`（mock 覆盖缺口分析）

### P2 — 动作库源（后续）

- [x] `sources.json` `kind: getquicker-library`：`action library search` → `shared get` → `shared-program.json`
- [x] 只读快照到 `cases/<sharedActionId>/`（**不 patch 库动作**）
- [x] `source.kind: getquicker-library` 标记；`Invoke-Case` 用 `--xaction-file` 离线 compile/mock

### P3 — 增量与 CI

- [ ] `Sync-CaseEdit` 定时 / pre-commit
- [ ] CI job：固定 `compiler-verify/manifest.json` + N 条 pulled cases Tier P2
- [ ] 可选：`action list` 扩展 `stepCount` 字段减少 structure 往返

---

## 9. 开放问题

1. **无 mock profile 的 compile_ok 算不算「通过」？**  
   → 建议：compile loop **算通过**（`compile_ok` 跳过 Phase B）；mock 是加分项。配置项 `requireMock: true` 可收紧。

2. **blocked 是否自动重试？**  
   → 建议：`manifest.runtimeVersion` bump 后批量 `blocked` → `pending`。

3. **case 根放哪？**  
   → 默认 `.local/`（用户队列）；内置回归继续用 `Quicker.ActionRuntime/samples/compiler-verify/`。

4. **组合动作定义：** 是否排除「单步 evalexpression」？  
   → `minStepCount` 可配；首批 `>= 2` 更接近「组合」语义。

---

## 10. 相关文档

- [2026-06-13-agent-mock-verify-loop-design.md](./2026-06-13-agent-mock-verify-loop-design.md)
- [execution-equivalence-testing.md](../../../Quicker.ActionRuntime/docs/execution-equivalence-testing.md)
- [cli-commands.md](../../cli-commands.md) — `action list` filter、`runtime-check`、`--mock`
- `CompileVerifySyncSamplesCommand.cs` — 现有 pull 参考实现
