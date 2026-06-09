---
name: quicker-voice-runtime-publish
description: >-
  Publish quicker-voice-runtime (voice-asr-runtime): bump pyproject version, CI,
  Git tag vX.Y.Z → GitHub Release + optional Bitiful, then sync voice-plugin-channel.json
  in quicker-rpc monorepo. Model-only releases use tag model-sensevoice.
  Use when publishing voice runtime, voice-asr release, voice-plugin channel sync,
  or /publish-voice-runtime.
disable-model-invocation: false
metadata:
  internal: true
---

# quicker-voice-runtime 发布

> **独立于 quicker-rpc**：语音 Runtime 版本在 `voice-asr-runtime/pyproject.toml`，**不要**改根目录 `version.json`。QuickerAgent 通过内嵌 `voice-plugin-channel.json` 指向 GitHub/Bitiful 上的 zip。

## 改什么（发布清单）

| 何时 | 必须改 / 检查 | 路径 |
|------|----------------|------|
| **每次 runtime 发布** | 版本号递增 | `voice-asr-runtime/pyproject.toml` → `version` |
| **每次 runtime 发布** | 同步安装渠道（**两处都要一致**） | `agent-gui/src-tauri/resources/voice-plugin-channel.json` |
| | | `agent-gui/src-tauri/voice-plugin-metadata/voice-plugin-channel.json` |
| **模型文件变更** | 更新指纹 + 重新打 model tag | `agent-gui/src-tauri/resources/voice-sensevoice-model-identity.json` |
| | | `agent-gui/src-tauri/voice-plugin-metadata/voice-sensevoice-model-identity.json` |
| **CI / 镜像** | Release workflow（少见） | `voice-asr-runtime/.github/workflows/release.yml` |
| **Bitiful 密钥** | voice-asr-runtime 仓库 Secrets | `BITIFUL_ACCESS_KEY`, `BITIFUL_SECRET_KEY`, `BITIFUL_BUCKET_NAME` |

**不要改**：`version.json`（QuickerRpc）、`qkrpc` 插件版本、除非语音协议/安装逻辑本身变更则无需为纯 runtime 发布跑 `build.ps1 -t`。

**不要提交**：`voice-asr-runtime/publish/*.zip`、`voice-plugin-channel.generated.json`（gitignore）。

## 版本与仓库

| 项目 | 值 |
|------|-----|
| 源码（monorepo） | `voice-asr-runtime/` |
| 远端仓库 | [QuickerHub/voice-asr-runtime](https://github.com/QuickerHub/voice-asr-runtime) |
| Runtime tag | `v0.1.2`（与 `pyproject.toml` 一致，带 `v` 前缀） |
| Model tag | `model-sensevoice`（**固定**，无版本号；仅模型变更时 force-push） |
| Runtime zip | `voice-asr-runtime-<ver>-win-x64.zip` |
| Model zip | `voice-asr-model-sensevoice.zip` |

已安装用户：Tauri 从远程 gallery 拉取 channel（GitHub `latest` + Bitiful mirror），比对 `runtime-version.txt` 与 `runtimeVersion`，后台 staging 升级。**纯 runtime 发布无需 QuickerAgent 发版**；内嵌 fallback channel 仅离线兜底。

## Agent 流程（runtime `vX.Y.Z`）

1. **改代码**（如有）→ `voice-asr-runtime` 内跑测试：
   ```powershell
   cd voice-asr-runtime
   uv sync
   uv run pytest
   ```
2. **Bump 版本**：`pyproject.toml` `version` 必须 **大于** 上一 GitHub Release（通常 patch +1）。
3. **Commit** voice-asr-runtime 变更；若 monorepo 子目录需单独 push 到 `QuickerHub/voice-asr-runtime`，先同步远端再 tag。
4. **打 tag 触发 CI**（在 voice-asr-runtime 仓库）：
   ```powershell
   git tag v0.1.3
   git push origin v0.1.3
   ```
   Workflow：`.github/workflows/release.yml` → PyInstaller zip + `voice-plugin-channel.generated.json` → GitHub Release；有 Bitiful secret 则上传镜像 + `version.txt`。
5. **等待 CI 绿**：
   ```powershell
   gh run list --repo QuickerHub/voice-asr-runtime --workflow release.yml --limit 3
   gh run watch <run-id> --repo QuickerHub/voice-asr-runtime
   ```
   GitHub Release 成功但 job 黄/红：常见为 Bitiful 未配置（已改为 skip）；以 Release 资产为准。
6. **上传远程 channel mirror**（推荐，在 quicker-rpc 根目录）：
   ```powershell
   pwsh -NoProfile -File ./publish/Sync-VoicePluginChannel.ps1 -Version 0.1.3 -FromGitHubRelease -UploadRemote -SkipLocalSync
   ```
   GitHub Release 已附带 `voice-plugin-channel.generated.json` 时，已安装 QuickerAgent 会通过 `releases/latest` 自动发现新版本。
7. **（可选，低频）** 更新内嵌 offline fallback：
   ```powershell
   pwsh -NoProfile -File ./publish/Sync-VoicePluginChannel.ps1 -Version 0.1.3 -FromGitHubRelease
   ```
   仅当需要刷新 `voice-plugin-channel.json` 离线兜底时 commit monorepo；**不是每次 runtime 发布的必做项**。
8. **（可选）本地补传 runtime zip Bitiful**（CI 未配 secret 时）：
   ```powershell
   pwsh -NoProfile -File ./publish/Upload-VoiceAsrToBitiful.ps1 -Version 0.1.3
   ```
   凭证：`publish/.env`（见 `publish/.env.example`）。
9. **汇报**：GitHub Release URL、channel `runtimeVersion`、Bitiful channel mirror 是否已上传。

## Agent 流程（仅模型 `model-sensevoice`）

仅在 `models/sensevoice/` 或 ModelScope 源变更时：

1. 更新 **两处** `voice-sensevoice-model-identity.json`（大小 + SHA256）。
2. `uv run pytest`（含 `test_download_model.py` 等）。
3. 打 tag（可 force）：
   ```powershell
   git tag -f model-sensevoice
   git push origin model-sensevoice --force
   ```
4. CI 发布 `voice-asr-model-sensevoice.zip`；**重新同步 channel**（`modelZipSha256` 会变）：
   ```powershell
   pwsh -NoProfile -File ./publish/Sync-VoicePluginChannel.ps1 -Version <当前 runtime 版本> -FromGitHubRelease
   ```

## 本地一条龙（无 CI / 补发）

在 `voice-asr-runtime/`：

```powershell
pwsh ./publish/Publish-VoiceAsrRelease.ps1
# 已构建 zip：
pwsh ./publish/Publish-VoiceAsrRelease.ps1 -SkipBuild -UploadBitiful -UpdateChannelJson
# 含模型：
pwsh ./publish/Publish-VoiceAsrRelease.ps1 -SkipBuild -PublishModel -UploadBitiful -UpdateChannelJson
```

`-UpdateChannelJson` 调用 monorepo 的 `publish/Sync-VoicePluginChannel.ps1`（需 quicker-rpc 兄弟目录结构）。

## 脚本速查

| 命令 | 用途 |
|------|------|
| `publish/Sync-VoicePluginChannel.ps1 -Version X.Y.Z -FromGitHubRelease -UploadRemote -SkipLocalSync` | 上传 Bitiful channel mirror（**runtime 独立发布主路径**） |
| `publish/Sync-VoicePluginChannel.ps1 -Version X.Y.Z -FromGitHubRelease` | 从 Release 拉 manifest → 更新内嵌 offline fallback |
| `publish/Sync-VoicePluginChannel.ps1 -Version X.Y.Z` | 本地 zip 生成 manifest 并同步 fallback |
| `node agent-gui/scripts/test-plugin-channel-fetch.mjs` | 探测 bootstrap 配置的远程 channel URL |
| `voice-asr-runtime/publish/Publish-VoiceAsrRelease.ps1` | 本地构建 + `gh release` + 可选 Bitiful + channel |
| `publish/Upload-VoiceAsrToBitiful.ps1 -Version X.Y.Z` | 仅 Bitiful 镜像 |
| `voice-asr-runtime/scripts/build-win.ps1` | PyInstaller |
| `voice-asr-runtime/scripts/package-runtime.ps1 -Version X.Y.Z` | 打 runtime zip |

## 验证

```powershell
# Release 资产
gh release view v0.1.2 --repo QuickerHub/voice-asr-runtime --json assets

# channel 与 Release manifest 一致
gh release download v0.1.2 --repo QuickerHub/voice-asr-runtime --pattern voice-plugin-channel.generated.json -D $env:TEMP\vc --clobber
# 对比 agent-gui/src-tauri/resources/voice-plugin-channel.json

# 开发：设置里一键安装 / 检查 Documents/QuickerAgent/plugins/voice-asr/runtime/runtime-version.txt
```

## 禁止

- 每次 runtime 发布 **强制** commit monorepo `voice-plugin-channel.json`（已改为远程 gallery；fallback 仅低频）
- 只改 `resources/` 不改 `voice-plugin-metadata/`（`tauri-prepare.mjs` 打包用后者覆盖前者）
- 用 quicker-rpc `/publish` 或 `version.json` bump 代替 voice runtime 发布
- 模型变更却不更新 `voice-sensevoice-model-identity.json`
- 提交 `publish/*.zip` 或含密钥的 `.env`

## 相关

- Cursor 命令：`.cursor/commands/publish-voice-runtime.md`
- 协议与安装：`docs/voice-input-plugin.md`、`docs/agent-gui-plugin-storage.md` §4–7
- quicker-rpc 总发布（无关 voice 版本）：`.cursor/skills/quicker-rpc-publish/SKILL.md`
