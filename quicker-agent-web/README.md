# QuickerAgent 下载页

单页静态站点：展示版本、前置条件，并提供 **Bitiful OSS** 下载链接（发布时由 GitHub Actions 自动上传）。

## 本地构建与预览

```powershell
# 仓库根目录
node quicker-agent-web/scripts/build.mjs
npx --yes serve quicker-agent-web/dist -l 3456
```

构建会读取根目录 [`version.json`](../version.json)，并尝试用 GitHub API 获取最新 Release tag（`GITHUB_TOKEN` 在 CI 中自动提供）。

产物在 `quicker-agent-web/dist/`：

| 路径 | 说明 |
|------|------|
| `index.html` | 落地页 |
| `download/` | 跳转到当前构建版本安装包的 HTML 重定向 |
| `site.json` | 构建时写入的版本元数据 |

## 部署（Vercel）

有两种方式：

1. 在 Vercel 控制台绑定仓库，Root Directory 设为 `quicker-agent-web`；
2. 或 push 到 `main` 且改动 `quicker-agent-web/` 或 `version.json` 时，由 [`.github/workflows/quicker-agent-web-vercel.yml`](../.github/workflows/quicker-agent-web-vercel.yml) 自动发布。

自动发布需要在 GitHub 仓库 Secrets 配置：

- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`

## 下载 URL

- QuickerAgent（Bitiful，先读 version.txt）：`https://s3.bitiful.net/quicker-pkgs/quicker-rpc/quicker-agent/version.txt` → `quicker-agent-<版本>-x64-setup.exe`
- QuickerAgent（版本归档示例）：`https://s3.bitiful.net/quicker-pkgs/quicker-rpc/quicker-agent/quicker-agent-0.8.5-x64-setup.exe`
- qkrpc CLI（GitHub latest）：`https://github.com/QuickerHub/quicker-rpc/releases/latest/download/qkrpc-win-x64-setup.exe`

`release-cli.yml` 默认**不在 CI 上传 Bitiful**（海外 runner 直传国内 OSS 慢）。维护者用 `publish/Upload-QuickerAgentToBitiful.ps1` 本地上传；`-WaitForCi` 会自动调用。需恢复 CI 上传时在仓库 Variables 设 `BITIFUL_UPLOAD_IN_CI=true`。
