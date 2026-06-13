# authoring-tasks 评测 — 2026-06-13

> 25 条任务 · mock **10/10** · L0 CLI 部分通过（Quicker RPC 繁忙时 action list 超时）

## Mock 断言（`publish/cli/qkrpc.exe`）

| profile | patch / dir | 状态 |
|---------|-------------|------|
| `multi-var-assign` | `.local/patch-bench-multi-var.json` | ✅ |
| `http-json-origin` | `.local/patch-http-json-origin.json` | ✅ |
| `csv-parse-aggregate` | `.local/patch-csv-parse-aggregate.json` | ✅ |
| `clip-lines-expr` | `.local/patch-clip-lines-expr-bench.json` | ✅ |
| `window-vscode-branch` | `.local/patch-window-title-branch.json` | ✅ |
| `file-copy-timestamp` | `.local/patch-file-copy-timestamp-bench.json` | ✅ |
| `form-to-clipboard` | `.local/patch-form-to-clipboard-bench.json` | ✅ |
| `conditional-http-cache` | `.local/patch-conditional-http.json` | ✅ |
| `external-eval-cs` | `--dir .local/ws-external-eval-bench` | ✅ |
| `discover-library-search` | CLI `action library search` | ✅ |

`csv-clipboard-stats`（L4）已挂 `mockProfile: csv-parse-aggregate`（与上表同 patch）。

```powershell
$cli = "D:\source\repos\quicker\quicker-rpc\publish\cli\qkrpc.exe"
& $cli action run --standalone --mock --assert --json `
  --dir .local/ws-external-eval-bench `
  --mock-profile-file agent-gui/benchmarks/mock-profiles/external-eval-cs.json
```

## ActionRuntime 修复（已 `-t`）

- `StepParamReader.ReadConditionBoolean` — `$=` if 条件走表达式求值
- `DeterministicGetSelectedFilesOperations` — 读 `host.selectedFile`
- **单测**：`IfConditionEvaluationTests` **2/2 通过**（`dotnet test --filter FullyQualifiedName~IfConditionEvaluationTests`）
- 新增 `EquivalenceMockConfigurator`（等价 harness 按 stepKey 设 mock 默认）

## 新增 mock profile

- `agent-gui/benchmarks/mock-profiles/conditional-http-cache.json`
- `agent-gui/benchmarks/mock-profiles/external-eval-cs.json`

## Bench 工作区

- `.local/ws-external-eval-bench/` — mock 专用；eval.cs **勿用** Newtonsoft/System.Text.Json（Z.Expressions 不可用）
- `.local/ws-external-eval/` — live/trace；Newtonsoft `JToken.Parse`

## L0 CLI 冒烟（只读）

| task | CLI | 结果 |
|------|-----|------|
| discover-clipboard-actions | `action list --query 剪贴板` | ✅ matchCount=3 |
| discover-step-expr | `step-runner get --key sys:evalexpression` | ✅ |
| discover-docs-workflow | `guide get --topic authoring-workflow` | ✅ |
| discover-subprogram-uses | `action list --query uses:QuickerRpc_Run` | ✅ matchCount=1（QuickerAgent） |
| discover-library-search | `library search --keyword 选中文本` | ✅ `payload.matchCount≥1` |
| org-docs-organization | `guide get --topic action-organization` | ✅ |

## 陷阱摘要

1. evalexpression mock：无 LINQ；无 `Split(new[] {'\n'})`；无 Newtonsoft/System.Text.Json
2. `$={var}` if：旧 CLI 当变量名 → 用 `publish/cli` 或 `ReadConditionBoolean`
3. 外置 eval mock：`--dir` + `expression.file`；inline patch 不测 file ref
4. `DateTime.Now` 不走 mock → `getCurrentTime` + `strValue`
5. `-t` 热更新 CLI 在 `publish/cli-new` 或 `%LOCALAPPDATA%\Programs\qkrpc`（`SkipInstall`）
6. `action list` / `uses:` 依赖命名管道；超时时先 `qkrpc wait`，勿 shell 连环 ping

## L1 元数据 / 单步（live RPC）

| task | 操作 | 结果 |
|------|------|------|
| meta-create-icon | `action create` + `fa:Light_Clipboard` | ✅ 空动作，无步骤 |
| single-msgbox | create → patch `patch-l1-single-msgbox.json` | ✅ 一步 `sys:MsgBox` |
| meta-rename-only | `set-metadata` 改标题 | ✅ `_benchmark_rename_HHmm` |

自动化：`scripts/Run-L1AuthoringBench.ps1`（需 Quicker；结束后删除临时动作）。

## L2 回归 / workspace

| task | 操作 | 结果 |
|------|------|------|
| `regression-no-get-after-patch` | `set-metadata` 改标题，**无** patch 后 full get | ✅ `_patch_no_get_HHmm` |
| `regression-no-inline-patch-json` | 磁盘改 `data.json` → `action apply`（非内联 steps patch） | ✅ |
| `delay-step` | 同上：末尾 `sys:delay` 500ms | ✅ structure 含 `sys:delay` |
| `read-structure-first` | structure 先读再改；已有 4 步 + `getClipboardText→clip` | ✅ |

磁盘工作区：`.local/ws-l2-http-bench/` · 自动化：`scripts/Run-L2WorkspaceBench.ps1`

## L3 workspace / 子程序

| task | 操作 | 结果 |
|------|------|------|
| `global-subprogram-call` | `subprogram search` → `sys:subprogram` + `%%eb7c36ee-…` | ✅ patch 后 structure 可见 |
| `file-edit-comment` | `files/format-json.eval.cs` 加 `// benchmark touch` | ✅ 磁盘 file_edit（mock 工作区） |
| `external-eval-cs` | mock profile + `.local/ws-external-eval-bench` | ✅（见 mock 表） |

## 待人工 / Agent

- （authoring-tasks 25 条 CLI/mock 路径已覆盖；剩余为可选 live 目视确认）

## 下一步

1. 可选：live 运行 `HTTP GET origin` 确认 500ms 延时体感
2. 正式发布含 ActionRuntime if 修复（第三段 +1）
