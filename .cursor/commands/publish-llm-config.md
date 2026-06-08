# 发布 publish config

Read **`.cursor/skills/quicker-agent-llm-apikey-config/SKILL.md`**（LLM API Key 配置统一说明）。

## 必做

```powershell
pwsh -NoProfile -File ./publish/Sync-LlmPublishConfig.ps1
```

勿动 `LLM_REMOTE_PUBLISH_CIPHER_PEPPER`；勿 `build.ps1 -t`；勿 commit 密钥文件。
