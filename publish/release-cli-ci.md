# Release qkrpc CLI — GitHub Actions 说明

Workflow：`.github/workflows/release-cli.yml`（tag `vX.Y.Z` push 或 **手动 `workflow_dispatch`**）。

## Job 结构

```text
metadata
  ├─ build-cli                 qkrpc zip + Inno setup（~2 min）
  └─ build-agent               Next + electron-builder NSIS（~5–8 min）
        ↓
     release                    上传 GitHub Release（+ 可选 Bitiful）
```

`build-agent` 使用 `Publish-QuickerAgent.ps1 -SkipQkrpcBuild` 一次性编译并打 Electron NSIS 包。

构建前会跑 **preflight-release-gate**（含 `verify-nsis-installer-assets.mjs`），在几秒内拦截 NSIS 资源路径错误。

## 私有 submodule（Quicker.ActionRuntime）

`build-cli` 与 `build-agent` 均需 checkout 私有仓库 `QuickerOrg/Quicker.ActionRuntime`（submodule）。`build-agent` 在 `electron-prepare` 阶段会本地执行 `publish-rpc.ps1` 生成 `publish/cli`。

1. 在 GitHub 创建 **只读 PAT**（推荐 fine-grained：`QuickerOrg/Quicker.ActionRuntime` → Contents read）。
2. 写入 `publish/.env` → `ACTIONRUNTIME_SUBMODULE_PAT=...`，或本地：
   ```powershell
   pwsh -NoProfile -File ./publish/Sync-ActionRuntimeSubmodulePat.ps1 -FromGhAuth
   ```
   （`-FromGhAuth` 使用当前 `gh auth token`，需对该私有库有 read 权限。）
3. 脚本会设置仓库 Secret **`ACTIONRUNTIME_SUBMODULE_PAT`**；`release-cli.yml` 的 `build-cli` 与 `build-agent` checkout 使用该 secret。

无需公开镜像或混淆；Release 产物为编译后的 `qkrpc`，与 Git 仓库可见性无关。`Quicker.ActionRuntime.Host` 等 Demo/Host 项目 **不参与** qkrpc 编译。

## workflow_dispatch 是什么

在 GitHub **Actions → Release qkrpc CLI → Run workflow** 手动触发，可填参数，**不必**为了重跑 CI 再 commit 或打新 tag。

| 参数 | 说明 |
|------|------|
| `tag` | 已有版本，如 `v0.12.10` |
| `pipeline` | `full`（默认）/ `release-only` |
| `artifact_run_id` | 上一次成功 run 的 ID（`release-only` 必填） |

Run ID 在 URL 里：`https://github.com/QuickerHub/quicker-rpc/actions/runs/27182749051` → `27182749051`。

## 单独重跑某一阶段

GitHub **不能**只重跑某一个 step，只能按 **job / pipeline** 重试。

| 你改了什么 | 做法 | 大约耗时 |
|-----------|------|----------|
| NSIS、`installer-hooks.nsh`、Rust、Next、业务逻辑 | `full` 或 `-ForceRetag` 全量重编 | ~10 min |
| Release 上传、changelog 展示（产物已在 artifact 里） | `release-only` + `artifact_run_id` | ~1 min |

### release-only 典型流程

安装包已在 artifact 里、仅 GitHub Release 上传失败时：

1. 找到产出 `cli-artifacts` + `agent-artifacts` 的那次 run ID。
2. Actions → Run workflow：
   - `tag` = `v0.12.10`
   - `pipeline` = `release-only`
   - `artifact_run_id` = 上述 run ID

### 失败 job 重跑

某 job 因 flaky（如 Rust cache restore）失败、**代码未改**时，可在 Actions 页对该 run 点 **Re-run failed jobs**，无需新 tag。

### CLI 示例（下载 artifact 本地排查）

```powershell
gh run download <run-id> --repo QuickerHub/quicker-rpc -n agent-artifacts -D .\tmp\agent
gh run download <run-id> --repo QuickerHub/quicker-rpc -n cli-artifacts -D .\tmp\cli
```

## 本地预检（打 tag 前）

```powershell
# <10s：launcher 契约 + NSIS 资源路径
pwsh -NoProfile -File ./publish/Preflight-QuickerAgentFast.ps1

# ~3–8 min：+ next build + tauri-prepare + staged verify（不编 Rust/NSIS）
pwsh -NoProfile -File ./publish/Preflight-QuickerAgentBuild.ps1
```

## 相关脚本参数

`Publish-QuickerAgent.ps1`：

| 参数 | 用途 |
|------|------|
| `-PreflightOnly` | 全量 Tauri build 预检（阻塞） |
| `-SkipQkrpcBuild` | CI / 本地发布：跳过 CLI 重编 |
| `-CompileOnly` / `-BundleOnly` | 历史拆分 CI 遗留；当前 workflow **不使用** |

## Artifact 保留

`agent-artifacts`、`cli-artifacts` 保留 **7 天**；超期后 `release-only` 需重新 `full` 编译。

## 相关

- 发布总流程：`.cursor/skills/quicker-rpc-publish/SKILL.md`
- Cursor 命令：`.cursor/commands/publish.md`
