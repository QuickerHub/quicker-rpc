# compile-verify-loop

大规模 ActionRuntime **编译 + mock** 验证队列。设计规格：

[`docs/superpowers/specs/2026-06-14-actionruntime-compile-verify-loop-design.md`](../../docs/superpowers/specs/2026-06-14-actionruntime-compile-verify-loop-design.md)

## 命令

```powershell
# 0. 修复旧 slug 目录 → actionId 目录
pwsh -NoProfile -File ./scripts/compile-verify-loop/Repair-Cases.ps1

# 1. 从本机 Quicker 拉组合动作（宿主专用步骤可自动 skipped）
pwsh -NoProfile -File ./scripts/compile-verify-loop/Pull-Cases.ps1 -Batch local-composite -Limit 50

# 1a. 从 getquicker 动作库拉只读快照（shared get + xaction runtime-check）
pwsh -NoProfile -File ./scripts/compile-verify-loop/Pull-Cases.ps1 -Batch getquicker-library -Limit 10
pwsh -NoProfile -File ./scripts/compile-verify-loop/Pull-Cases.ps1 -Batch getquicker-library -DryRun -Limit 3

# 1b. 将已有 blocked 中的宿主专用步骤标为 skipped
pwsh -NoProfile -File ./scripts/compile-verify-loop/Skip-HostOnlyCases.ps1

# 1c. 将 subprogram 包装动作标为 skipped
pwsh -NoProfile -File ./scripts/compile-verify-loop/Prune-SubprogramOnlyCases.ps1

# 1d. 导入 mock-action-profiles.json 中的 benchmark 动作
pwsh -NoProfile -File ./scripts/compile-verify-loop/Sync-BenchmarkCases.ps1

# 2. 同步 Quicker 编辑时间（变更 → pending）
pwsh -NoProfile -File ./scripts/compile-verify-loop/Sync-CaseEdit.ps1

# 3. 关联 benchmark mock profile（按 actionId；或启发式建议）
pwsh -NoProfile -File ./scripts/compile-verify-loop/Suggest-MockProfiles.ps1 -Apply
pwsh -NoProfile -File ./scripts/compile-verify-loop/Link-MockProfiles.ps1

# 3b. 批量 mock（有 mock-profile.json 的 compile_ok 用例）
pwsh -NoProfile -File ./scripts/compile-verify-loop/Invoke-MockPending.ps1

# 4. 队列统计
pwsh -NoProfile -File ./scripts/compile-verify-loop/Get-LoopStatus.ps1 -ShowFailures

# 4b. compile_ok 步骤模式（找 mock 覆盖缺口）
pwsh -NoProfile -File ./scripts/compile-verify-loop/Analyze-CompileOkPatterns.ps1 -NoMockOnly -Top 20

# 4c. blocked 不支持步骤统计（编译器缺口）
pwsh -NoProfile -File ./scripts/compile-verify-loop/Analyze-BlockedPatterns.ps1 -Kind getquicker-library -Top 15

# 4d. 按 source.kind 汇总状态
pwsh -NoProfile -File ./scripts/compile-verify-loop/Summarize-ByKind.ps1

# 5. 下一个待跑用例
pwsh -NoProfile -File ./scripts/compile-verify-loop/Get-NextCase.ps1 -IncludeBlocked -Json

# 6. 单例
pwsh -NoProfile -File ./scripts/compile-verify-loop/Invoke-Case.ps1 -CaseId <actionId> -Force
pwsh -NoProfile -File ./scripts/compile-verify-loop/Invoke-Case.ps1 -CaseId <actionId> -MockOnly -Force

# 7. 半自动 Agent loop（blocked 需 -IncludeBlocked；mock 待跑需 -IncludeMockPending）
pwsh -NoProfile -File ./scripts/compile-verify-loop/Start-AgentLoop.ps1 -IncludeBlocked -MaxCases 10
pwsh -NoProfile -File ./scripts/compile-verify-loop/Start-AgentLoop.ps1 -MockOnly -IncludeMockPending -MaxCases 5
```

## 配置

| 变量 | 默认 |
|------|------|
| `COMPILE_VERIFY_LOOP_ROOT` | `<repo>/.local/compile-verify-loop` |
| `QKRPC_EXE` | `publish/cli-dev/qkrpc.exe` → `publish/cli/qkrpc.exe` → `qkrpc` |

**Mock 阶段（Phase B）** 需要 dev 构建（`EnableActionRuntimeMock=true`）。`publish/cli` 生产包会返回 `MOCK_NOT_AVAILABLE`。

```powershell
dotnet restore QuickerRpc.Console --framework net10.0-windows10.0.19041.0
dotnet publish QuickerRpc.Console -c Release --framework net10.0-windows10.0.19041.0 -o publish/cli-dev
$env:QKRPC_EXE = "$PWD/publish/cli-dev/qkrpc.exe"
```

| 文件 | 用途 |
|------|------|
| `templates/sources.local-composite.json` | 本机拉取规则 |
| `templates/sources.getquicker-library.json` | getquicker 动作库拉取规则 |
| `templates/mock-action-profiles.json` | actionId → mock profile id |

## Mock 覆盖 triage

```powershell
# compile_ok 步骤模式统计（找 mock 缺口）
pwsh -NoProfile -File ./scripts/compile-verify-loop/Analyze-CompileOkPatterns.ps1 -NoMockOnly -Top 20

# 按规则建议 profile（-Apply 写入 mock-profile.json + 更新 templates）
pwsh -NoProfile -File ./scripts/compile-verify-loop/Suggest-MockProfiles.ps1 -Apply

# manifest → case 目录同步 mock-profile.json（可按 profile 过滤）
pwsh -NoProfile -File ./scripts/compile-verify-loop/Sync-MockProfileFiles.ps1 -Apply -ProfileId runtime-success

# 批量跑已有 mock-profile 的用例（建议 -ProfileId 分批，避免混跑）
pwsh -NoProfile -File ./scripts/compile-verify-loop/Run-SuggestMockBatch.ps1 -ProfileId runtime-success -Rounds 3

# manifest 缺口 / 模式用例清单
pwsh -NoProfile -File ./scripts/compile-verify-loop/List-ManifestGaps.ps1 -ProfileId runtime-success
pwsh -NoProfile -File ./scripts/compile-verify-loop/List-SimpleManifestGaps.ps1 -ProfileId subprogram-external-stub -MaxSteps 4
pwsh -NoProfile -File ./scripts/compile-verify-loop/List-PatternCases.ps1 -Pattern "sys:notify+sys:subprogram"
pwsh -NoProfile -File ./scripts/compile-verify-loop/List-ShortUnmappedPatterns.ps1 -MaxSteps 3
pwsh -NoProfile -File ./scripts/compile-verify-loop/List-EmbeddedStubCandidates.ps1 -MaxSteps 5
pwsh -NoProfile -File ./scripts/compile-verify-loop/List-SimpleEmbeddedCandidates.ps1 -MaxSteps 6
pwsh -NoProfile -File ./scripts/compile-verify-loop/Probe-MockCases.ps1 -CaseId <guid> -RegisterManifest
pwsh -NoProfile -File ./scripts/compile-verify-loop/Remove-ManifestCase.ps1 -CaseId <actionId> -Apply
pwsh -NoProfile -File ./scripts/compile-verify-loop/Add-ManifestCase.ps1 -CaseId <actionId> -ProfileId subprogram-external-stub -Apply
pwsh -NoProfile -File ./scripts/compile-verify-loop/Remove-ManifestProfileForPattern.ps1 -Pattern "sys:assign+sys:csscript+sys:stop" -Apply

# 探索：仅 Full-tier 步骤的 compile_ok（多数含 subprogram 会 mock 失败）
pwsh -NoProfile -File ./scripts/compile-verify-loop/Scan-FullTierMockable.ps1
pwsh -NoProfile -File ./scripts/compile-verify-loop/Invoke-FullTierMockBatch.ps1 -DryRun
```

已验证可泛用 `runtime-success`：单步 `openurl`/`delay`/`comment`、`chromecontrol`、`adobesoftscontrol`、`keyinput`、`runscript`；两步 `keyinput+outputtext`、`getselectedtext+outputtext`（mock `GetSelectedText`；输出键 `output` 亦会映射）亦可。外部子程序 `@@…`/`%%…` 及 `guid@rev@title`（含无 `@@` 前缀的共享子程序引用）用 `subprogram-external-stub`（含 `notify+subprogram`、`showtext/outputtext+subprogram` 两步，以及 `jsscript/getselectedtext/run+outputtext+subprogram` 三步外部引用）；需正则匹配子程序输出时用 `subprogram-external-html-regex-stub`（`mocks.subPrograms.stubResultText`）。**不可**泛用：`assign+csscript+stop`、`imecontrol+keyinput`、`download+getfolderpath+run`、含 `SplitToList`/`JoinToString` 等 Quicker 扩展表达式的 `outputText`、复杂 `runtime-success` 多步组合、`getselectedfiles+writeclipboard`。损坏的 `program.json` 可先 `Invoke-Case -Force` 重编译再 Suggest。

```powershell
pwsh -NoProfile -File ./scripts/compile-verify-loop/Analyze-SubprogramRefs.ps1
```

## getquicker-library 注意

- 模板 `templates/sources.getquicker-library.json`：`keywords` × `maxPages` × `limit` 控制搜索广度（当前 14 词 × 5 页 × 15 条）
- 拉取走 `action library search` → `shared get` → 落盘 `shared-compressed.json` → `runtime-check --compressed-file`
- `Invoke-CompileVerifyQkrpcJson` 用 `Start-Process` 重定向捕获 **UTF-8 原始字节**（勿用管道 `Out-File`，否则会损坏中文键名）
- 仅当 `--compressed-file` **包构建/JSON 解析失败** 时回退本机 `localActionId`（`source.compileVia=local-install`）；不支持步骤（如 `sys:csscript`）仍保留库快照
- 库批次默认 `excludeUsesOnlyWrappers: false`（许多库动作为子程序包装）
- `Sync-CaseEdit` 跳过 `kind=getquicker-library`（无本机 editVersion）
- 多数库 `blocked` 仅含 `StepMigrationCatalog.DeliberatelyExcluded` 步骤（csscript/customwindow/everythingsearch 等）；用 `Analyze-BlockedPatterns.ps1` 看 `deliberateOnly` vs `hasFixable`；Agent 优先修 fixable：`Get-NextCase.ps1 -IncludeBlocked -ExcludeDeliberateBlocked`（当前库批次 fixable=0 时无 blocked 待修）

## Agent 修复环

失败时读 `cases/<actionId>/agent-prompt.md` + `last-compile.json`，改 ActionRuntime 后：

```powershell
pwsh -NoProfile -File ./scripts/compile-verify-loop/Invoke-Case.ps1 -CaseId <actionId> -Force
```
