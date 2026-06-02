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
| `download/` | 跳转到 latest 安装包的 HTML 重定向 |
| `site.json` | 构建时写入的版本元数据 |

## 部署

### GitHub Pages（推荐）

1. 仓库 **Settings → Pages → Build and deployment → Source** 选 **GitHub Actions**。
2. push 到 `main` 且改动 `quicker-agent-web/` 或 `version.json` 时，[`.github/workflows/quicker-agent-web.yml`](../.github/workflows/quicker-agent-web.yml) 会自动构建并发布。
3. 新 Release 发布时也会触发部署，使页面上展示的 tag 与 GitHub latest 对齐。

### Vercel（可选）

将 **Root Directory** 设为 `quicker-agent-web`，使用仓库内 [`vercel.json`](vercel.json)（含 `/download` 302）。

## 下载 URL

- QuickerAgent（Bitiful latest 别名）：`https://s3.bitiful.net/quicker-pkgs/quicker-rpc/quicker-agent/quicker-agent-win-x64-setup.exe`
- QuickerAgent（版本归档示例）：`https://s3.bitiful.net/quicker-pkgs/quicker-rpc/quicker-agent/quicker-agent-0.8.5-x64-setup.exe`
- qkrpc CLI（GitHub latest）：`https://github.com/QuickerHub/quicker-rpc/releases/latest/download/qkrpc-win-x64-setup.exe`

`release-cli.yml` 在上传版本名安装包后，会同步覆盖上传 `quicker-agent-win-x64-setup.exe` 作为 latest 别名，因此下载页无需每版改链接。
