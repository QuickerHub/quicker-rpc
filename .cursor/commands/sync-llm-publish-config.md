# 同步 llm-publish.config → GitHub Secret

在 **quicker-rpc 仓库根目录** 执行。先 **Read** skill：`.cursor/skills/quicker-agent-gui-llm-publish-config/SKILL.md`。

改完 `agent-gui/llm-publish.config.json` 后：

```powershell
pwsh -NoProfile -File ./publish/Sync-LlmPublishConfig.ps1
```

预览：

```powershell
pwsh -NoProfile -File ./publish/Sync-LlmPublishConfig.ps1 -DryRun
```

目标 Secret：`BUNDLED_LLM_CONFIG`（供 `release-cli.yml` QuickerAgent 构建使用）。**勿 commit** publish config 文件。
