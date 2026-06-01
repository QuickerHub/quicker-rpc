---
name: quicker-rpc-publish
description: >-
  Full quicker-rpc release: GitHub Release CLI, build.ps1 -p -n Quicker plugin upload,
  qkrpc action update for shared action f5c76108-3ce9-433f-8cd0-8f0d9c562052.
  Use when the user asks to publish, release, ship, GitHub release, or /publish.
disable-model-invocation: false
---

# quicker-rpc 公开发布

## 完整流程（Agent 顺序）

1. `git status`；必要时 bump `version.json` 并 commit
2. `git log` 自上一 tag → **撰写 changelog** → 写入 `publish/changelogs/vX.Y.Z.md` 并 **commit**
3. `pwsh ./publish/Publish-GitHubRelease.ps1` → GitHub Release（自动读 changelog；push tag 后 CI 也用同一文件）
4. `pwsh ./build.ps1 -p -n` → Quicker 依赖 **quicker.rpc** 上传（版本与 `version.json` 一致，不再 bump）
5. `qkrpc ping --json` 确认插件在线
6. `qkrpc action update --id f5c76108-3ce9-433f-8cd0-8f0d9c562052 --changelog-file publish/changelogs/vX.Y.Z.md --json`
7. 汇报 Release URL、Quicker 包版本、action update 结果、用户安装命令

## 仓库与产物

| 项目 | 值 |
|------|-----|
| Git | [QuickerHub/quicker-rpc](https://github.com/QuickerHub/quicker-rpc) |
| 版本 | `version.json` → `QuickerRpc`（四段）；Release tag 前三段 `vX.Y.Z` |
| Changelog | `publish/changelogs/vX.Y.Z.md`（**必须 commit 后再打 tag**） |
| Quicker 包 | `quicker.rpc`（`build.ps1 -p -n`） |
| 分享动作 ID | `f5c76108-3ce9-433f-8cd0-8f0d9c562052` |
| CLI Release | `publish/qkrpc-{semver}-win-x64.zip`、`install.ps1`、`qkrpc-win-x64.zip` |

## 用户安装 CLI

```powershell
$p="$env:TEMP\qkrpc-install.ps1"; iwr https://github.com/QuickerHub/quicker-rpc/releases/latest/download/install.ps1 -OutFile $p -UseBasicParsing; & $p
```

## 脚本说明

| 命令 | 用途 |
|------|------|
| `publish/Publish-GitHubRelease.ps1` | CLI zip + tag + gh release |
| `build.ps1 -p -n` | qkbuild 上传 Quicker 依赖，**不**改 `version.json` |
| `publish/publish-rpc.ps1` | 仅本地 CLI/插件构建（一般由上面脚本间接调用） |

`Publish-GitHubRelease.ps1` 参数：`-SkipBuild`、`-SkipTag`、`-DryRun`、`-Draft`、`-TagVersion`、`-Changelog`、`-ChangelogFile`、`-AllowEmptyChangelog`

## Changelog（Agent 撰写，Release / CI / action update 共用）

- 路径：`publish/changelogs/vX.Y.Z.md`（与 tag 同名）
- **commit 后再运行 Publish-GitHubRelease**（tag push 触发 CI，从 tag 指向的 commit 读此文件）
- 阅读 `git log vX.Y.Z..HEAD` 或近期 commit
- 用中文，按 **CLI / 安装 / 插件** 分组
- 首行写版本号（如 `v0.3.11`）
- 不要空 changelog；不要只写「发布」

## 前置条件

- .NET 8 SDK、`gh auth login`
- `qkbuild` 与 build-tools `.env`（`-p -n` 上传）
- Quicker 运行中 + QuickerRpc 插件已 Register（`qkrpc ping --json`）

## 禁止

- 将 `publish/cli`、`publish/plugin`、`publish/*.zip` 提交 Git
- 修改 `git config`
- 用 `-p`（无 `-n`）在 Release 后再 bump 版本
- 跳过 `action update` 或让用户提供 changelog 文本
- 未 commit changelog 就 push tag（CI 会用模板覆盖 Release 说明）

## 相关

- Cursor 命令：`.cursor/commands/publish.md`
- 日常改代码验证：`.cursor/skills/quicker-rpc-build-test/SKILL.md`
