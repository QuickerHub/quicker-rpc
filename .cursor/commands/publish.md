# quicker-rpc 公开发布（GitHub Release）

在 **quicker-rpc 仓库根目录** 执行。先 **Read** skill：`.cursor/skills/quicker-rpc-publish/SKILL.md`。

## 阶段一：前置

1. `git status`、当前分支；工作区应已提交（Release 会打 tag 到 `HEAD`）。
2. **Read** `version.json` → 记录 `QuickerRpc` 四段版本；tag 取前三段（如 `0.3.9.0` → `v0.3.9`）。
3. 若需新版本，先改 `version.json` 并 commit，再发布。

## 阶段二：发布

```powershell
pwsh -NoProfile -File ./publish/Publish-GitHubRelease.ps1
```

`block_until_ms` ≥ **120000**（dotnet publish + gh upload）。

脚本会：`publish-rpc.ps1 -SkipInstall` → 打 zip → 创建并推送 tag → `gh release create` 上传资产。

| 参数 | 用途 |
|------|------|
| `-SkipBuild` | 已有 `publish/qkrpc-*-win-x64.zip` 时跳过构建 |
| `-DryRun` | 预览 tag / gh 命令 |
| `-Draft` | 草稿 Release |
| `-TagVersion 0.3.10` | 覆盖 tag（默认来自 `version.json` 前三段） |

**备选**：推送 `v*` tag 后由 `.github/workflows/release-cli.yml` 在 CI 构建并上传（无需本机 `gh`）。

## 阶段三：发布后

1. 汇报 Release URL（`gh release view vX.Y.Z --json url`）。
2. 确认资产：`qkrpc-X.Y.Z-win-x64.zip`。
3. 给用户安装命令：

```powershell
irm https://raw.githubusercontent.com/QuickerHub/quicker-rpc/main/publish/install.ps1 | iex
```

4. 若 `version.json` 有未推送 commit，用户要求时再 `git push origin main`。

## 禁止

- 将 `publish/cli`、`publish/plugin`、`publish/*.zip` 提交 Git
- 修改 `git config`
- 未经用户确认 force push tag / 删除已有 Release
