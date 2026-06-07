# quicker-rpc 公开发布（GitHub Release + Quicker 动作）

在 **quicker-rpc 仓库根目录** 执行。先 **Read** skill：`.cursor/skills/quicker-rpc-publish/SKILL.md` 与 `.cursor/skills/quicker-qkbuild-version-publish/SKILL.md`（**第三段 +1、版本只增不减**）。

## 版本号（必守）

- `version.json` → `QuickerRpc` **只能向前递增，禁止减小或回退**（含 `--version` 显式指定）。
- **新一次公开发布**：在已有 tag / 已发布版本之上 **严格更大**（通常 **第三段 +1、第四段 → 0**）。
- **同版本重传**（仅阶段三）：`build.ps1 -Publish -NoVersion` 允许与 baseline **相等**；仍 **禁止更小**。
- 脚本会校验：`Publish-GitHubRelease.ps1`、`build.ps1 -Publish`（见 `publish/qkrpc-publish-lib.ps1` → `Assert-QuickerRpcVersionMonotonic`）。

## 阶段一：前置

1. `git status`、当前分支；工作区应已提交（Release 会打 tag 到 `HEAD`）。
2. **Read** `version.json` → 记录 `QuickerRpc` 四段版本；tag 取前三段（如 `0.3.11.0` → `v0.3.11`）。
3. 对照 **最新 git tag** 与 **origin/main 上 `version.json`**：新版本必须 **大于** 历史最大值；再 **第三段 +1、第四段 → 0** bump 并 commit（**禁止**仅 revision +1 就当正式包发布；**禁止**把版本改小）。见 `quicker-qkbuild-version-publish`。
4. 浏览 `git log`（自上一 tag 或近几次 commit），**撰写 changelog** 写入 `publish/changelogs/vX.Y.Z.md` 并 **commit**（CI 从 tag 指向的 commit 读取此文件）。
5. （可选）单独阻塞预检：`pwsh -NoProfile -File ./publish/Test-QuickerAgentReleaseBuild.ps1`（`block_until_ms` ≥ **600000**）。默认不必先跑——发布脚本会与 CI **并行**启动预检。

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

## 阶段二：GitHub Release（并行预检 + tag → CI）

```powershell
pwsh -NoProfile -File ./publish/Publish-GitHubRelease.ps1 -WaitForCi
# 修复后重发：
pwsh -NoProfile -File ./publish/Publish-GitHubRelease.ps1 -WaitForCi -ForceRetag
```

默认：**后台**本地 Tauri 预检 + **立即**校验 changelog 并 **push tag**（与 CI 并行）。优先看 `%TEMP%\qkrpc-preflight-vX.Y.Z.log` 修错；CI 红字常与本地相同，可边修边忽略。旧顺序（先本地通过再打 tag）：`-PreflightBeforeTag`。

`block_until_ms` ≥ **600000`（`-WaitForCi` 含本地 Tauri + CI Inno + 编译）。

| 参数 | 用途 |
|------|------|
| `-WaitForCi` | push tag 后 `gh run watch` 直到 workflow 成功 |
| `-LocalBuild` | 本地构建并 `gh release upload`（需 Inno Setup；CI 不可用时） |
| `-ChangelogFile` | 覆盖默认 `publish/changelogs/vX.Y.Z.md` |
| `-AllowEmptyChangelog` | 跳过 changelog 校验（不推荐） |
| `-SkipPreflight` | 不启动本地 Tauri 预检 |
| `-PreflightBeforeTag` | 先阻塞本地 Tauri，通过后再 push tag |
| `-WaitForPreflight` | 脚本结束前等待并汇报本地预检结果 |
| `-ForceRetag` | 将已有 tag 移到当前 HEAD 并 `push -f` |
| `-SkipBuild` | 仅 `-LocalBuild`：已有 zip/setup 时跳过构建 |
| `-DryRun` | 预览 tag / 命令 |
| `-Draft` | 草稿 Release（仅 `-LocalBuild`） |

## 阶段三：Quicker 依赖上传（插件）

**在 GitHub Release 成功后**，按 **当前 `version.json` 版本**（不再 bump）上传 Quicker 包：

```powershell
pwsh ./build.ps1 -Publish -NoVersion
```

（等价于 qkbuild `--publish --no-version`；勿用裸 `-p -n`，PowerShell 会与通用参数冲突。）

`block_until_ms` ≥ **120000**（qkbuild 上传 quicker.rpc + 本地 CLI 安装）。

## 阶段四：更新 Quicker 分享动作

与 GitHub Release **同一 changelog 文件**：

```powershell
qkrpc action update --id f5c76108-3ce9-433f-8cd0-8f0d9c562052 --changelog-file publish/changelogs/vX.Y.Z.md --json
```

前置：Quicker 已运行且 QuickerRpc 插件已加载（`qkrpc action list --limit 1 --json` 成功即可）。

## 阶段五：QuickerAgent → Bitiful + 动作页

CI **默认不再**从海外 runner 上传 Bitiful（慢）。`-WaitForCi` 会在 CI 完成后**本机**上传（需 `publish/.env` 或 `BITIFUL_*` 环境变量）。

```powershell
# 推荐：阶段二 -WaitForCi 已包含本地上传 + 动作页 sync
# 或手动：
pwsh -NoProfile -File ./publish/Upload-QuickerAgentToBitiful.ps1 -Tag vX.Y.Z
pwsh -NoProfile -File ./publish/Sync-QuickerAgentActionDoc.ps1 -Push
```

`page.html` 使用占位符 `{{QUICKER_AGENT_SEMVER}}`，由 `Sync-QuickerAgentActionDoc.ps1` 替换（默认 Bitiful `version.txt`；`-WaitForCi` 内传 `-Version` 与 Release 一致）。**Bitiful 上传完成后**再 sync 动作页。

| 参数 | 用途 |
|------|------|
| `-WaitForCi` 内 | 自动 `Upload-QuickerAgentToBitiful` → `Sync-QuickerAgentActionDoc -Push` |
| `-SkipBitifulUpload` | 跳过本地上传 |
| `-SkipSyncQuickerAgentActionDoc` | 跳过动作页 push |

凭证：复制 `publish/.env.example` → `publish/.env`。若需在 CI 恢复海外上传，在 GitHub 仓库 Variables 设 `BITIFUL_UPLOAD_IN_CI=true`。

## 阶段六：发布后汇报

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
- 不看 `%TEMP%\qkrpc-preflight-*.log` 就反复打 tag（应先本地修好再 `-ForceRetag`）
- **仅用 `build.ps1 -t`（revision）代替第三段 `-Publish -NoVersion`** 或跳过第三段 bump（会导致子程序/QExpr 拉到旧 DLL）
- **减小或回退 `version.json` 的 `QuickerRpc`**（只能单调递增；脚本会拒绝）
- 在未 bump 的情况下对 **已存在 tag 的同版本** 打新 Release（除非 `-ForceRetag` 且用户确认）
