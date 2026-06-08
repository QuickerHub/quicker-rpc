# quicker-voice-runtime 发布

在 **quicker-rpc 仓库根目录**（或 `voice-asr-runtime/` 打 tag）执行。先 **Read** skill：`.cursor/skills/quicker-voice-runtime-publish/SKILL.md`。

## 必改文件（runtime 发布）

1. `voice-asr-runtime/pyproject.toml` — `version` 递增
2. Git tag `vX.Y.Z` → push 到 [QuickerHub/voice-asr-runtime](https://github.com/QuickerHub/voice-asr-runtime)
3. CI 完成后同步 **两处** channel（内容必须一致）：
   - `agent-gui/src-tauri/resources/voice-plugin-channel.json`
   - `agent-gui/src-tauri/voice-plugin-metadata/voice-plugin-channel.json`

```powershell
pwsh -NoProfile -File ./publish/Sync-VoicePluginChannel.ps1 -Version X.Y.Z -FromGitHubRelease
```

## 模型单独发布（仅模型变更时）

1. 更新两处 `voice-sensevoice-model-identity.json`
2. `git tag -f model-sensevoice && git push origin model-sensevoice --force`
3. 重新 `-FromGitHubRelease` 同步 channel（`modelZipSha256` 会变）

## 注意

- **不要**改根目录 `version.json`；voice runtime 版本与 QuickerRpc 无关
- Bitiful 未配置时 CI 仍应产出 GitHub Release；可本地 `publish/Upload-VoiceAsrToBitiful.ps1` 补传
- 详细步骤、禁止项、验证命令见 skill
