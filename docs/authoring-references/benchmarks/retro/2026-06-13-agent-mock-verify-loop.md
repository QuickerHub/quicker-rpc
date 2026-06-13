# Agent mock 验证闭环 — 2026-06-13

> 规格：[`docs/superpowers/specs/2026-06-13-agent-mock-verify-loop-design.md`](../../../superpowers/specs/2026-06-13-agent-mock-verify-loop-design.md)  
> 关联 retro：[`2026-06-13-sdk-l2-batch.md`](2026-06-13-sdk-l2-batch.md)

## 汇总

| 阶段 | 状态 | 交付 |
|------|------|------|
| P0 | ✅ | mock profile + CLI `action run --mock --assert` |
| P1 | ✅ | synthetic trace、`fixHints`、MCP/serve、7× L2 profile |
| P2 | ✅ | `/tool-test` mock 面板、benchmark F 轴文档、`mock-trace-diff` |

## L2 mock assert（本机 retro 动作 id）

| profile | 动作 id | assert |
|---------|---------|--------|
| clip-lines-expr | `65a3b800-f5be-4a2b-ac03-5c9a27f4e71d` | ✅ |
| multi-var-assign | `b63593ce-d494-40f9-a87e-18011c443d28` | ✅ |
| http-json-origin | `3a59e44b-01f2-4ae1-b50a-97a6b147212f` | ✅ |
| window-vscode-branch | `f3b993a2-594b-4109-b714-25e1470a72a9` | ✅ |
| form-to-clipboard | `9441be78-167e-4434-a46b-5a87f23b2a35` | ✅ |
| file-copy-timestamp | `3dacfbea-37f9-4777-bcdf-e9a816a9238d` | ✅ |

**批量实跑**（2026-06-13，`publish/cli/qkrpc.exe` **0.14.4.63**，Quicker 插件在线）：**6/6** `action run --mock --assert --json` 全部 `assertions.passed: true`。

复现：

```powershell
pwsh -NoProfile -File ./scripts/Run-MockL2Batch.ps1
# 或 uv run python .local/mock-batch-run.py
```

`read-structure-first` 无 mock profile，仍用手动 / trace 评 F 轴。

## 运行时修复（ActionRuntime）

| 问题 | 修复 |
|------|------|
| `int.Parse({var})` + 字符串变量 | `CoerceExpressionVariable` 保持 string，不对字面量预转 int |
| fixture `outputParams.result` | 改为 `output`（与 `sys:evalexpression` schema 一致） |
| mock 剪贴板 output 键 | `DeterministicClipboardOperations` 返回 `output` |
| 列表/stringProcess/compare 等 | 见 P1 对话 patch 列表 |

## 开发者命令

```powershell
# F 轴断言
qkrpc action run --id <guid> --mock --mock-profile clip-lines-expr --assert --json

# mock vs plugin step spine
qkrpc action mock-trace-diff --id <guid> --mock-profile clip-lines-expr --json

# UI
# /tool-test → ActionRuntime → Benchmark Mock 断言
```

## SDK

```powershell
pwsh ./scripts/Invoke-CursorSdk.ps1 -Script benchmark -TaskId multi-var-assign -VerifyMock
```

## 构建注意

- 完整 `build.ps1 -t` 可能因 `prompt-tier0.src.md` 过长触发 `GenerateActionAuthoringDocs` 失败
- 开发：`dotnet build/publish -p:GenerateActionAuthoringDocs=false` 或 `publish/publish-rpc.ps1 -SkipPackaging`
- **mock profiles** 随 CLI 发布到 `publish/cli/benchmarks/mock-profiles/`（`MockProfileLoader` 优先读 bundled 目录；开发仓仍可读 `agent-gui/benchmarks/mock-profiles` 或 `QKRPC_WORKSPACE_ROOT`）
- **用户目录 CLI / Cursor MCP**：`%LOCALAPPDATA%\Programs\qkrpc` 可能被 MCP 锁住无法覆盖；SDK 与 `Run-MockL2Batch.ps1` 优先用 `publish/cli/qkrpc.exe`。更新用户安装前请 **Reload Window** 停 MCP，再 `publish/publish-rpc.ps1 -SkipPackaging`（勿 `-SkipInstall`）
