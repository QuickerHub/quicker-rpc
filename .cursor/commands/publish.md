# quicker-rpc 公开发布（GitHub Release + Quicker 动作）

在 **quicker-rpc 仓库根目录** 执行。先 **Read** skill：`.cursor/skills/quicker-rpc-publish/SKILL.md`。

## 阶段一：前置

1. `git status`、当前分支；工作区应已提交（Release 会打 tag 到 `HEAD`）。
2. **Read** `version.json` → 记录 `QuickerRpc` 四段版本；tag 取前三段（如 `0.3.11.0` → `v0.3.11`）。
3. 若 tag 已存在或需新版本，先改 `version.json` 并 commit，再发布。
4. 浏览 `git log`（自上一 tag 或近几次 commit），**撰写 changelog** 写入 `publish/changelogs/vX.Y.Z.md` 并 **commit**（CI 从 tag 指向的 commit 读取此文件）。

**Changelog 建议结构**：

```text
v0.3.11

CLI
- ...

安装
- ...

插件 / Quicker
- ...
```

## 阶段二：GitHub Release（tag → CI 构建 zip + setup.exe）

```powershell
pwsh -NoProfile -File ./publish/Publish-GitHubRelease.ps1
# 或等待 CI 完成：
pwsh -NoProfile -File ./publish/Publish-GitHubRelease.ps1 -WaitForCi
```

脚本校验 `publish/changelogs/vX.Y.Z.md` 并 **push tag**；`.github/workflows/release-cli.yml` 在 Windows runner 上 `dotnet publish`、打 zip、用 Inno Setup 编译 `setup.exe` 并上传 Release 资产。

`block_until_ms` ≥ **300000**（若使用 `-WaitForCi`，含 choco 装 Inno + 编译）。

| 参数 | 用途 |
|------|------|
| `-WaitForCi` | push tag 后 `gh run watch` 直到 workflow 成功 |
| `-LocalBuild` | 本地构建并 `gh release upload`（需 Inno Setup；CI 不可用时） |
| `-ChangelogFile` | 覆盖默认 `publish/changelogs/vX.Y.Z.md` |
| `-AllowEmptyChangelog` | 跳过 changelog 校验（不推荐） |
| `-SkipBuild` | 仅 `-LocalBuild`：已有 zip/setup 时跳过构建 |
| `-DryRun` | 预览 tag / 命令 |
| `-Draft` | 草稿 Release（仅 `-LocalBuild`） |

## 阶段三：Quicker 依赖上传（插件）

**在 GitHub Release 成功后**，按 **当前 `version.json` 版本**（不再 bump）上传 Quicker 包：

```powershell
pwsh ./build.ps1 -QkbuildArgs '-p','-n'
```

`block_until_ms` ≥ **120000**（qkbuild 上传 quicker.rpc + 本地 CLI 安装）。

## 阶段四：更新 Quicker 分享动作

与 GitHub Release **同一 changelog 文件**：

```powershell
qkrpc action update --id f5c76108-3ce9-433f-8cd0-8f0d9c562052 --changelog-file publish/changelogs/vX.Y.Z.md --json
```

前置：Quicker 已运行且 QuickerRpc 插件已加载（`qkrpc action list --limit 1 --json` 成功即可）。

## 阶段五：发布后汇报

1. Release URL、tag、`qkrpc-win-x64-setup.exe` / zip 资产。
2. Quicker 依赖版本（`version.json` 四段 → quicker.rpc 前三段目录）。
3. `qkrpc action update` 结果（JSON 中 `ok` / `message`）。
4. 用户安装命令：

https://github.com/QuickerHub/quicker-rpc/releases/latest/download/qkrpc-win-x64-setup.exe

## 禁止

- 将 `publish/cli`、`publish/plugin`、`publish/*.zip` 提交 Git
- 修改 `git config`
- 未经用户确认 force push tag / 删除已有 Release
- 未 commit `publish/changelogs/vX.Y.Z.md` 就 push tag（CI 会覆盖 Release 说明）
