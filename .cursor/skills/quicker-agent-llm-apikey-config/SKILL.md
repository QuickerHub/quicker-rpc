---
name: quicker-agent-llm-apikey-config
description: >-
  QuickerAgent LLM API Key 配置：llm-publish.config 发布（GitHub + Bitiful OSS）、
  llm-dev.config 本地调试、llm-config.json 用户默认、pepper 一次性初始化。
  Use when user says 发布 publish config、publish config、同步/上传 publish config、
  llm-publish config、publish LLM keys、LLM apikey 配置、或改 llm-*-config.json。
disable-model-invocation: false
metadata:
  internal: true
---

# QuickerAgent LLM API Key 配置

## 配置文件一览（勿 commit 含 Key 的文件）

| 文件 | 用途 | Agent 动作 |
|------|------|------------|
| `llm-publish.config.json` | 发布内置 endpoint；CI + OSS | **发布** → `Sync-LlmPublishConfig.ps1` |
| `llm-dev.config.json` | 仅 `pnpm dev` 合并调试（dev 优先） | 只改文件；**不**上传 |
| `llm-config.json` | 默认 provider 模板（通常无明文 Key） | 只改文件；**不**上传 |
| `publish/.env` | Bitiful + `LLM_REMOTE_PUBLISH_CIPHER_PEPPER` | 一次性；pepper **勿轮换** |
| 设置页 / `llm-secrets.json` | 用户自备 Key | UI 行为；非本 skill |

示例：`llm-publish.config.example.json`、`llm-dev.config.example.json`

---

## 用户说「发布 publish config」— 仅此一条命令

```powershell
pwsh -NoProfile -File ./publish/Sync-LlmPublishConfig.ps1
```

| 会更新 | 不会动 |
|--------|--------|
| GitHub `BUNDLED_LLM_CONFIG`（endpoint 内容） | `LLM_REMOTE_PUBLISH_CIPHER_PEPPER`（**永久固定**） |
| Bitiful 加密 OSS `{ version:1, enc }` | secret 名称、加密算法 |

预览：`-DryRun`；仅 GitHub：`-SkipBitiful`

**Agent 必做**：确认 JSON 合法 → 执行脚本 → 汇报 endpoint 数与上传结果。  
**禁止**：`build.ps1 -t`；常规发布跑 `Sync-LlmRemoteCipherPepper.ps1`；commit 密钥文件。

---

## GitHub secrets

| Secret | 何时写 | 日常发布 |
|--------|--------|----------|
| `BUNDLED_LLM_CONFIG` | 每次 `Sync-LlmPublishConfig.ps1` | 更新 |
| `LLM_REMOTE_PUBLISH_CIPHER_PEPPER` | 一次性 `Sync-LlmRemoteCipherPepper.ps1` | **勿动** |
| `BITIFUL_*` | `publish/.env`；CI 可选 | 勿改 |

pepper 在 `publish/.env` 与 GitHub **`publish` 环境**须一致，**跨版本通用**。

### 一次性初始化（新机器）

```powershell
# publish/.env ← publish/.env.example
pwsh -NoProfile -File ./publish/Sync-LlmRemoteCipherPepper.ps1   # 已存在则自动跳过
pwsh -NoProfile -File ./publish/Sync-LlmPublishConfig.ps1
```

`Sync-LlmRemoteCipherPepper.ps1` 仅 `-Force` 可覆盖（破坏旧版 OSS 解密）。

---

## 数据流

```
llm-publish.config.json
  ├─► BUNDLED_LLM_CONFIG → CI 安装包内置 Key
  └─► Bitiful enc（pepper 固定）→ 已安装 Agent 运行时拉取
```

正式 **QuickerAgent 安装包** Release：`quicker-rpc-publish` / `/publish`（Release 前确认 `BUNDLED_LLM_CONFIG` 已同步）。

---

## 故障排查

| 现象 | 处理 |
|------|------|
| OSS 缺 pepper | 补 `publish/.env`；仅首次 `Sync-LlmRemoteCipherPepper.ps1` |
| 解密失败 | 对齐 `.env` 与 GitHub pepper，重跑 `Sync-LlmPublishConfig.ps1` |
| dev 不见新 endpoint | 重启 dev；或改的是 publish 则需发布 OSS |

---

## 禁止

- commit `llm-publish.config.json`、`llm-dev.config.json`、`publish/.env`
- 常规发布改 pepper 或跑 pepper 同步
- 让用户手贴 GitHub secret

## 相关

- 命令：`/publish-llm-config`
- 脚本：`publish/Sync-LlmPublishConfig.ps1`、`Sync-LlmRemoteCipherPepper.ps1`
- 人类：`agent-gui/README.md`
