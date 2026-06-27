# QuickerAgent 下载页

单页静态站点：展示版本、前置条件，并提供 **Bitiful OSS** 下载链接（发布时由 GitHub Actions 自动上传）。

## 本地构建与预览

```powershell
# 仓库根目录
node quicker-agent-web/scripts/build.mjs
npx --yes serve quicker-agent-web/dist -l 3456
```

构建会读取 [`QuickerRpc/version.json`](../QuickerRpc/version.json)，并尝试用 GitHub API 获取最新 Release tag（`GITHUB_TOKEN` 在 CI 中自动提供）。

产物在 `quicker-agent-web/dist/`：

| 路径 | 说明 |
|------|------|
| `index.html` | 落地页 |
| `download/` | 跳转到当前构建版本安装包的 HTML 重定向 |
| `site.json` | 构建时写入的版本元数据 |

## 部署（EdgeOne Pages · 国内腾讯云）

目标生产域名：`https://alinko.top`（需在控制台绑定；绑定前可用预设域名预览）

- 项目名：`quickeragent`
- 项目 ID：`makers-ftqqzd9mnyhm`
- 预设域名：`https://quickeragent-hsozo4t4.edgeone.cool`
- 控制台：[域名管理](https://console.cloud.tencent.com/edgeone/pages/project/makers-ftqqzd9mnyhm/domain)
- 账号：**国内腾讯云**（`Ldy` / `100013841579`）— 绑定自定义域名需完成实名认证；海外版 `edgeone.ai` 账号无法完成国内实名

本地一键构建并部署：

```powershell
pwsh ./quicker-agent-web/scripts/deploy-edgeone.ps1
```

或手动分步：

```powershell
node quicker-agent-web/scripts/build.mjs
cd quicker-agent-web
edgeone login --site china   # 首次，使用国内腾讯云账号
edgeone pages deploy dist -n quickeragent -a overseas
```

部署脚本默认 `-a overseas`（全球可用区不含中国大陆）：自定义域名**无需 ICP 备案**；若需大陆加速或 `-a global`，域名须已备案。

`.edgeone/project.json` 会记录 `ProjectId`，后续在同一目录重复 `edgeone pages deploy dist` 即可更新。

### 绑定 `alinko.top`

EdgeOne 暂不支持 CLI 添加自定义域名，需在**国内**控制台操作：

1. 登录 [国内腾讯云 EdgeOne 控制台](https://console.cloud.tencent.com/edgeone/pages)（账号 `Ldy`）
2. 打开项目 `quickeragent` → **域名管理** → **添加自定义域名**
3. 输入 `alinko.top`，按提示完成归属验证（实名认证）
4. 在域名 DNS 处将 CNAME 改为控制台给出的新值（当前仍为旧个人主页：`4bd1d895.alinko.top.dnsoe3.com`，需替换）
   - 域名 DNS 在**阿里云**（NS：`dns19.hichina.com` / `dns20.hichina.com`）→ [阿里云域名解析](https://dc.console.aliyun.com/#/domain/list)
5. 绑定与改 DNS 后验证：`pwsh ./quicker-agent-web/scripts/check-alinko-domain.ps1`

## 部署（Vercel，可选）

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
