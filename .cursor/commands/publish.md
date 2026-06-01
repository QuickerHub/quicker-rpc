# quicker-rpc 公开发布（GitHub Release + Quicker 动作）

在 **quicker-rpc 仓库根目录** 执行。先 **Read** skill：`.cursor/skills/quicker-rpc-publish/SKILL.md`。

## 阶段一：前置

1. `git status`、当前分支；工作区应已提交（Release 会打 tag 到 `HEAD`）。
2. **Read** `version.json` → 记录 `QuickerRpc` 四段版本；tag 取前三段（如 `0.3.11.0` → `v0.3.11`）。
3. 若 tag 已存在或需新版本，先改 `version.json` 并 commit，再发布。
4. 浏览 `git log`（自上一 tag 或近几次 commit），**撰写 changelog** 并写入临时文件（阶段二、四共用）。

**Changelog 建议结构**（Agent 按实际 commit 填写）：

```text
v0.3.11

CLI
- ...

安装
- ...

插件 / Quicker
- ...
```

```powershell
$changelogPath = Join-Path $env:TEMP 'qkrpc-release-changelog.txt'
# Agent 将 changelog 写入 $changelogPath
```

## 阶段二：GitHub Release（CLI + 说明）

```powershell
pwsh -NoProfile -File ./publish/Publish-GitHubRelease.ps1 -ChangelogFile $env:TEMP\qkrpc-release-changelog.txt
```

`block_until_ms` ≥ **120000**（dotnet publish + gh upload）。

脚本会：`publish-rpc.ps1 -SkipInstall` → 打 zip → 创建并推送 tag → `gh release create` 上传资产（含 `install.ps1`、`qkrpc-win-x64.zip`），Release 正文 = changelog + 安装说明。

| 参数 | 用途 |
|------|------|
| `-ChangelogFile` | 与 action update 共用的 changelog 文件（推荐） |
| `-Changelog` | 内联 changelog 文本 |
| `-SkipBuild` | 已有 zip 时跳过构建 |
| `-DryRun` | 预览 tag / gh 命令 |
| `-Draft` | 草稿 Release |

## 阶段三：Quicker 依赖上传（插件）

**在 GitHub Release 成功后**，按 **当前 `version.json` 版本**（不再 bump）上传 Quicker 包：

```powershell
pwsh ./build.ps1 -p -n
```

`block_until_ms` ≥ **120000**（qkbuild 上传 quicker.rpc + 本地 CLI 安装）。

`-p -n`：发布到 Quicker 依赖/OSS，**不**修改 `version.json`（版本已在阶段一确定）。

## 阶段四：更新 Quicker 分享动作

Agent **必须**使用与 GitHub Release **相同**的 changelog 文件：

| 项 | 值 |
|----|-----|
| 动作 ID | `f5c76108-3ce9-433f-8cd0-8f0d9c562052` |
| 命令 | `qkrpc action update --id ... --changelog-file $env:TEMP\qkrpc-release-changelog.txt --json` |

前置：Quicker 已运行且 QuickerRpc 插件已加载（`qkrpc ping --json` 成功）。

## 阶段五：发布后汇报

1. Release URL、tag、zip / `install.ps1` 资产。
2. Quicker 依赖版本（`version.json` 四段 → quicker.rpc 前三段目录）。
3. `qkrpc action update` 结果（JSON 中 `ok` / `message`）。
4. 用户安装命令：

```powershell
$p="$env:TEMP\qkrpc-install.ps1"; iwr https://github.com/QuickerHub/quicker-rpc/releases/latest/download/install.ps1 -OutFile $p -UseBasicParsing; & $p
```

## 禁止

- 将 `publish/cli`、`publish/plugin`、`publish/*.zip` 提交 Git
- 修改 `git config`
- 未经用户确认 force push tag / 删除已有 Release
- 跳过 Agent 撰写 changelog 直接 `action update` 或 `Publish-GitHubRelease`
