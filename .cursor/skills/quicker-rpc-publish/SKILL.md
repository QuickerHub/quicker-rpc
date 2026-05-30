---
name: quicker-rpc-publish
description: >-
  Publish qkrpc CLI to GitHub Releases (zip + tag + gh release). User install via install.ps1.
  Use when the user asks to publish, release, ship, GitHub release, or Publish-GitHubRelease.ps1.
disable-model-invocation: false
---

# quicker-rpc 公开发布（GitHub Release）

## 仓库与产物

| 项目 | 值 |
|------|-----|
| Git | [QuickerHub/quicker-rpc](https://github.com/QuickerHub/quicker-rpc) |
| 版本 | `version.json` → `QuickerRpc`（四段）；Release tag 为前三段 `vX.Y.Z` |
| CLI zip | `publish/qkrpc-{semver}-win-x64.zip` |
| 本机 CLI | `%LOCALAPPDATA%\Programs\qkrpc\qkrpc.exe`（`publish-rpc.ps1` 默认安装；Release 构建用 `-SkipInstall`） |
| CI | `.github/workflows/release-cli.yml`（push `v*.*.*` tag 时自动构建上传） |

## 用户安装

Release 发布后：

```powershell
irm https://raw.githubusercontent.com/QuickerHub/quicker-rpc/main/publish/install.ps1 | iex
```

## 发布入口

**推荐（本机）** — 仓库根目录：

```powershell
pwsh -NoProfile -File ./publish/Publish-GitHubRelease.ps1
```

顺序：`publish-rpc.ps1 -SkipInstall` → zip → `git tag vX.Y.Z` → push tag → `gh release create` + 上传 zip。

**备选（CI）** — 推送 tag 触发 workflow：

```powershell
git tag vX.Y.Z
git push origin refs/tags/vX.Y.Z
```

## 脚本参数

| 参数 | 含义 |
|------|------|
| `-SkipBuild` | 跳过 `publish-rpc.ps1`，仅打 tag / 上传已有 zip |
| `-SkipTag` | 不创建 tag（远程 tag 已存在时，仅 upload） |
| `-DryRun` | 预览，不执行 |
| `-Draft` | 草稿 Release |
| `-TagVersion` | 指定 tag 版本（默认 `version.json` 前三段） |

## 前置条件

- 已安装 [.NET 8 SDK](https://dotnet.microsoft.com/download)
- 本机发布需 [GitHub CLI](https://cli.github.com/)：`gh auth login`
- `version.json` 中版本与待发 Release 一致；改动应先 commit

## 推荐 Agent 流程

1. `git status`：未提交改动则提醒先 commit
2. **Read** `version.json` 记录 `QuickerRpc`
3. 执行 `Publish-GitHubRelease.ps1`，等待退出码 **0**
4. 汇报：tag、Release URL、zip 文件名、用户 `irm | iex` 安装命令
5. 用户要求时再 `git push origin main`（若仅 tag 已 push 则 main 可能无需 push）

## 局部脚本（Agent 一般不需要单独调用）

| 脚本 | 用途 |
|------|------|
| `publish/publish-rpc.ps1` | 构建 CLI + 插件到 `publish/`，打 zip；默认安装到 `%LOCALAPPDATA%\Programs\qkrpc` |
| `publish/install.ps1` | 用户从 Release 下载安装 |
| `publish/qkrpc-publish-lib.ps1` | 共享安装 / PATH 逻辑 |

## 禁止

- 将 `publish/cli`、`publish/plugin`、`publish/*.zip` 提交 Git
- 修改 `git config`
- 覆盖已存在的 Release / tag 而不告知用户

## 相关

- Cursor 命令：`.cursor/commands/publish.md`
- 改代码后本地验证：`.cursor/skills/quicker-rpc-build-test/SKILL.md`
- 人类文档：`README.md`、`AGENTS.md`
