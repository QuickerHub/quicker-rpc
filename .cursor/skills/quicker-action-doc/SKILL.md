---
name: quicker-action-doc
description: >-
  Edits getquicker.net shared-action intro HTML via the quicker-agent repo (page.html,
  qkagent push). Use when the user asks to update 动作说明, 动作页说明, Sharedaction intro,
  or getquicker action description (e.g. QuickerAgent aa5917ad-…).
disable-model-invocation: false
---

# 修改动作页说明

getquicker 分享动作的**网页简介**不在本仓库维护，而在兄弟仓库 **quicker-agent**（`qkagent` + `actions/<sharedId>/page.html`）。

## 立即执行

1. 切换到 **quicker-agent** 仓库根（常见路径：`D:\source\repos\quicker\quicker-agent` 或 `../quicker-agent`）。
2. **完整工作流**（编辑、构建、push、HTML 约定、文案原则）按该仓库 Skill 执行：

   `../quicker-agent/.cursor/skills/action-doc-workflow/SKILL.md`（与 quicker-rpc 同级的兄弟仓库）

3. 若用户只给链接未给 GUID，从 `Sharedaction?code=` 解析 sharedId。

## 与本仓库相关的动作

| 动作 | sharedId | 说明源文件 |
|------|----------|------------|
| QuickerAgent（插件入口） | `aa5917ad-1256-4c73-7022-08debe3efcbe` | `quicker-agent/actions/aa5917ad-…/page.html` |

插件 RPC、CLI、agent-gui 代码在 **quicker-rpc**；**动作页 HTML** 在 **quicker-agent**。勿用 `qkrpc action patch` 改简介。

## 最短命令（在 quicker-agent 根目录）

```powershell
# 编辑 actions/<sharedId>/page.html 后：
qkagent push --code <sharedId> --json
```

前置：`.env` 作者账号、`qkagent.exe` 可用。详见 quicker-agent 的 `action-doc-workflow` Skill。

**Bitiful 下载链接**：`page.html` 用 `{{QUICKER_AGENT_SEMVER}}` 占位符，**勿手写版本号**。发布时由 quicker-rpc 的 `publish/Sync-QuickerAgentActionDoc.ps1`（或 `Publish-GitHubRelease.ps1 -WaitForCi`）替换并 `qkagent push`；未设环境变量时 `action_doc_builder` 会回退读取 Bitiful `version.txt`。勿用 Bitiful 的 `quicker-agent-win-x64-setup.exe` 固定别名。
