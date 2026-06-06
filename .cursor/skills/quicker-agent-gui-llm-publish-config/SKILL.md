---
name: quicker-agent-gui-llm-publish-config
description: >-
  After editing agent-gui/llm-publish.config.json, automatically sync the JSON
  to GitHub Actions secret BUNDLED_LLM_CONFIG for QuickerAgent release builds.
  Use when adding/changing bundled LLM endpoints, apiKey, baseURL, groups, or
  when the user mentions llm-publish config, publish LLM keys, or CI bundled keys.
disable-model-invocation: false
metadata:
  internal: true
---

# llm-publish.config.json → GitHub 发布环境

`agent-gui/llm-publish.config.json` 是 **QuickerAgent 安装包**内置 LLM endpoint 的来源（Tauri 发布时 XOR 混淆进 `llm-bundled-secrets.json`）。文件 **gitignore**，**勿 commit**。

GitHub Actions（`.github/workflows/release-cli.yml`）从仓库 Secret **`BUNDLED_LLM_CONFIG`** 读取同一份 JSON 单行字符串。改本地 publish config 后，**Agent 必须自动上传**，不要只改文件就结束。

## Agent 必做流程（改 publish config 之后）

1. 编辑 `agent-gui/llm-publish.config.json`（可复制 `llm-publish.config.example.json` 结构；`version: 2` + `groups` + `endpoints`）。
2. 每个 endpoint 至少含 `apiKey`；推荐同时写 `baseURL`（含 `/v1`）、`model`、`group`。
3. **在仓库根目录自动执行**（用户未明确说「不要上传」时）：

```powershell
pwsh -NoProfile -File ./publish/Sync-LlmPublishConfig.ps1
```

4. 脚本成功 → 汇报 endpoint 数量与 secret 名；**不要**跑 `build.ps1 -t`。
5. 若 dev 已在跑且需立刻验证新 endpoint：重启 `start-agent-gui.ps1` / `pnpm dev`（Next 进程会缓存 publish config）。

预览不上传：

```powershell
pwsh -NoProfile -File ./publish/Sync-LlmPublishConfig.ps1 -DryRun
```

## 与 dev config 的区别

| 文件 | 用途 | 上传 GitHub |
|------|------|-------------|
| `llm-publish.config.json` | 发布 / CI 内置 Key | **是** → `BUNDLED_LLM_CONFIG` |
| `llm-dev.config.json` | 仅本地 dev fallback | **否** |

`pnpm dev` 会合并 dev + publish（dev 优先）；Tauri 发布与 CI **只**用 publish + secret。

## 前置条件

- [GitHub CLI](https://cli.github.com/) 已安装且 `gh auth login`（需 repo secrets 写权限）
- 配置文件存在且 JSON 合法、至少一个带 `apiKey` 的 endpoint

## CI 如何使用

`release-cli.yml` 构建 QuickerAgent 时注入：

```yaml
BUNDLED_LLM_CONFIG: ${{ secrets.BUNDLED_LLM_CONFIG }}
```

`publish/Publish-QuickerAgent.ps1` → `embed-bundled-llm-secrets.mjs` 生成混淆密钥。未同步 secret 时，**下一次 Release 仍用旧 Key**。

## 禁止

- 将 `llm-publish.config.json` 提交进 Git
- 仅改 publish config 却跑 `build.ps1 -t`
- 把 API Key 写进 `llm-config.json` 或 `llm-config.example.json`
- 让用户手动去 GitHub 网页粘贴 secret（Agent 应直接跑 sync 脚本）

## 相关

- 示例：`agent-gui/llm-publish.config.example.json`
- 人类文档：`agent-gui/README.md`（「发布时注入 LLM Key」）
- 公开发布：`quicker-rpc-publish`（Release 前确认 secret 已是最新）
- 仅改 UI：`quicker-agent-gui-frontend`（`dev_frontend_check`，不跑 `-t`）
