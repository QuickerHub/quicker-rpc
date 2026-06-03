---
name: quicker-rpc-publish
description: >-
  Full quicker-rpc release: GitHub Release CLI, build.ps1 -Publish -NoVersion Quicker plugin upload,
  qkrpc action update for shared action f5c76108-3ce9-433f-8cd0-8f0d9c562052.
  Use when the user asks to publish, release, ship, GitHub release, or /publish.
disable-model-invocation: false
metadata:
  internal: true
---

# quicker-rpc 公开发布

## 完整流程（Agent 顺序）

1. `git status`；必要时 bump `version.json` 并 commit
2. `git log` 自上一 tag → **撰写 changelog** → 写入 `publish/changelogs/vX.Y.Z.md` 并 **commit**
3. `pwsh ./publish/Publish-GitHubRelease.ps1` → **push tag**；`.github/workflows/release-cli.yml` 在 GitHub Actions 编译 qkrpc zip/setup **与 QuickerAgent Tauri 安装包**并发布 Release（可选 `-WaitForCi` 等待完成）
4. `pwsh ./build.ps1 -Publish -NoVersion` → Quicker 依赖 **quicker.rpc** 上传（版本与 `version.json` 一致，不再 bump）
5. `qkrpc action list --limit 1 --json` 确认插件在线（或已 `qkrpc serve` 且 `/health` 为 ok）
6. `qkrpc action update --id f5c76108-3ce9-433f-8cd0-8f0d9c562052 --changelog-file publish/changelogs/vX.Y.Z.md --json`
7. **QuickerAgent 动作页（getquicker）**：`page.html` 用占位符 `{{QUICKER_AGENT_SEMVER}}`（勿手写版本号）。**本地 Bitiful 上传后**执行：
   - 推荐：`pwsh ./publish/Publish-GitHubRelease.ps1 -WaitForCi`（CI 结束后**自动**本地上传 Bitiful → `Sync-QuickerAgentActionDoc.ps1 -Push`）
   - 或手动：`pwsh ./publish/Upload-QuickerAgentToBitiful.ps1 -Tag vX.Y.Z`，再 `Sync-QuickerAgentActionDoc.ps1 -Push`
   - 需在 **quicker-agent** 兄弟仓库（或 `QUICKER_AGENT_REPO`）；Bitiful 凭证见 `publish/.env.example`（复制为 `publish/.env`）
8. 汇报 Release URL、Quicker 包版本、action update / 动作页 sync 结果、用户安装命令

## 仓库与产物

| 项目 | 值 |
|------|-----|
| Git | [QuickerHub/quicker-rpc](https://github.com/QuickerHub/quicker-rpc) |
| 版本 | `version.json` → `QuickerRpc`（四段）；Release tag 前三段 `vX.Y.Z` |
| Changelog | `publish/changelogs/vX.Y.Z.md`（**必须 commit 后再打 tag**） |
| Quicker 包 | `quicker.rpc`（`build.ps1 -Publish -NoVersion`） |
| 分享动作 ID | `f5c76108-3ce9-433f-8cd0-8f0d9c562052` |
| CLI Release | `qkrpc-{semver}-win-x64-setup.exe`、`qkrpc-win-x64-setup.exe`（latest）、zip 便携包 |
| Agent Release | `quicker-agent-{semver}-x64-setup.exe`（GitHub Release + **本地** Bitiful）；Bitiful 另更新 `version.txt`，**勿**上传 `quicker-agent-win-x64-setup.exe` 固定别名 |
| QuickerAgent 动作页 | `aa5917ad-1256-4c73-7022-08debe3efcbe`；源文件 `quicker-agent/actions/.../page.html`（`{{QUICKER_AGENT_SEMVER}}` 由 `Sync-QuickerAgentActionDoc.ps1` 填充；手动 sync 默认 Bitiful `version.txt`，`-WaitForCi` 传 Release 版本） |

## 用户安装 CLI

下载 [qkrpc-win-x64-setup.exe](https://github.com/QuickerHub/quicker-rpc/releases/latest/download/qkrpc-win-x64-setup.exe) 并运行。**安装包由 GitHub Actions**（`release-cli.yml` + Inno Setup）编译；本地发布无需 Inno Setup。离线兜底：`Publish-GitHubRelease.ps1 -LocalBuild`（需本机 ISCC）。

## 脚本说明

| 命令 | 用途 |
|------|------|
| `publish/Publish-GitHubRelease.ps1` | 校验 changelog、**push tag**；CI 构建 zip/setup 并发布 Release |
| `publish/Publish-GitHubRelease.ps1 -WaitForCi` | 同上，并等待 `release-cli.yml` 完成；随后**本地上传 Bitiful** + sync QuickerAgent 动作页（`-SkipBitifulUpload` / `-SkipSyncQuickerAgentActionDoc` 可跳过） |
| `publish/Upload-QuickerAgentToBitiful.ps1 -Tag vX.Y.Z` | 从 GitHub Release 下载安装包并上传 Bitiful（国内网络，比 CI 海外直传快） |
| `publish/Sync-QuickerAgentActionDoc.ps1 -Push` | 将 Bitiful `version.txt`（或 `-Version` / `-WaitForCi` 传入的 Release 版本）写入 quicker-agent 构建产物并 `qkagent push` |
| `publish/Publish-GitHubRelease.ps1 -LocalBuild` | 本地构建 + `gh release`（需 Inno Setup，CI 不可用时） |
| `publish/Build-QkrpcSetup.ps1` | Inno Setup 编译（CI 与 `-LocalBuild` 共用） |
| `build.ps1 -Publish -NoVersion` | qkbuild 上传 Quicker 依赖，**不**改 `version.json`（自动 SkipCliPackaging） |
| `publish/publish-rpc.ps1` | 本地 CLI/插件构建（`-SkipSetup` 跳过安装包） |

`Publish-GitHubRelease.ps1` 参数：`-LocalBuild`、`-WaitForCi`、`-SkipBuild`（仅 `-LocalBuild`）、`-SkipTag`、`-DryRun`、`-Draft`、`-TagVersion`、`-Changelog`、`-ChangelogFile`、`-AllowEmptyChangelog`

## Changelog（Agent 撰写，Release / CI / action update 共用）

- 路径：`publish/changelogs/vX.Y.Z.md`（与 tag 同名）
- **commit 后再运行 Publish-GitHubRelease**（tag push 触发 CI，从 tag 指向的 commit 读此文件）
- 阅读 `git log vX.Y.Z..HEAD` 或近期 commit
- 用中文，按 **CLI / 安装 / 插件** 分组
- 首行写版本号（如 `v0.3.11`）
- 不要空 changelog；不要只写「发布」

## 前置条件

- .NET 10 SDK、`gh auth login`
- `qkbuild` 与 build-tools `.env`（`-p -n` 上传）
- Bitiful：`publish/.env`（见 `publish/.env.example`）或 `BITIFUL_*` 环境变量
- Quicker 运行中 + QuickerRpc 插件已 Register（`qkrpc action list --limit 1 --json` 成功即可）

## 禁止

- 将 `publish/cli`、`publish/plugin`、`publish/*.zip` 提交 Git
- 修改 `git config`
- 用 `-p`（无 `-n`）在 Release 后再 bump 版本
- 跳过 `action update` 或让用户提供 changelog 文本
- 未 commit changelog 就 push tag（CI 会用模板覆盖 Release 说明）

## 相关

- Cursor 命令：`.cursor/commands/publish.md`
- 日常改代码验证：`.cursor/skills/quicker-rpc-build-test/SKILL.md`
