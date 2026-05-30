---
name: quicker-rpc-publish
description: >-
  Builds and publishes quicker-rpc: qkbuild plugin zip to Quicker dependency (quicker.rpc)
  and OSS, plus qkrpc CLI to publish/cli. Use when the user asks to publish, release, ship,
  build.ps1, qkbuild -p, upload QuickerHub package, refresh qkrpc.exe, or run
  publish/publish-rpc.ps1.
disable-model-invocation: false
---

# quicker-rpc 发布

## 仓库与产物

| 项目 | 值 |
|------|-----|
| 私有 Git | [QuickerHub/quicker-rpc](https://github.com/QuickerHub/quicker-rpc) |
| 版本 | `version.json` → `QuickerRpc`（四段，如 `0.2.0.0`） |
| qkbuild 配置 | `build.yaml`（`versionKey: QuickerRpc`） |
| Quicker 包名 | `quicker.rpc` |
| 子程序 | `QuickerRpc_Run` |
| 插件 zip | `QuickerRpc.Plugin/publish/QuickerRpc.{version}.zip` |
| 本地 CLI | `publish/cli/qkrpc.exe` |
| 本地插件 DLL | `publish/plugin/QuickerRpc.Plugin.{version}.dll` |

## 入口脚本

**完整流程（推荐）** — 仓库根目录：

```powershell
pwsh ./build.ps1 @args
```

`build.ps1` 顺序：

1. `qkbuild build -c build.yaml --project-path .\QuickerRpc.Plugin`（`@args` 原样透传）
2. `pwsh ./publish/publish-rpc.ps1`（`dotnet publish` CLI + 插件到 `publish/`，CLI 追加用户 PATH）

**仅 CLI + 本地插件目录**（不跑 qkbuild、不上传 Quicker）：

```powershell
pwsh -NoProfile -File ./publish/publish-rpc.ps1
```

## qkbuild 参数（透传给 `build.ps1` 第一步）

| 参数 | 含义 |
|------|------|
| （无） | Release 构建 + 打 zip，**不** bump 版本、**不**上传 |
| `-n` | 不改 `version.json` |
| `-p` | **发布**：小版本 bump + zip + OSS + Quicker 依赖页上传 + 更新子程序版本 |
| `-p -n` | 发布上传但 **不** bump `version.json` |
| `-b` | minor bump |
| `-m` | major bump |
| `-t` | 测试版构建（以本机 `qkbuild` 为准） |

`-p` 成功时通常会修改 `version.json`；Agent 应在构建后 **重新 Read** 该文件再汇报版本号。

## 前置条件

- 已安装 `qkbuild`（来自 `quicker_build_net` 的 `publish/build-tools`，或在 PATH）
- `qkbuild -p` 需要 build-tools `.env` 与浏览器自动化（Playwright profile）；上传失败时读终端日志
- 插件编译引用 `qkref.props`（默认 `C:\Program Files\Quicker`）；Debug 构建可 `-p:QuickerDllPath=...`

## 推荐 Agent 流程

1. `git status`：是否有未提交改动；`-p` 后是否需提交 `version.json`
2. 若用户未指定模式，用 **AskQuestion**（见 `.cursor/commands/publish.md`）
3. 在仓库根执行 `pwsh ./build.ps1 ...`，等待退出码 **0**
4. 读取 `version.json` 与 `publish/`、`QuickerRpc.Plugin/publish/` 产物路径
5. 若 `-p` 且 `version.json` 变更：建议 `git add version.json` + commit（规范：`<type>(quicker-rpc): bump version to X.Y.Z.Z`），用户要求时再 `git push`
6. 简要确认：Quicker 包版本、zip 路径、`qkrpc.exe` 路径；若 PATH 刚更新，提示新开终端

## Quicker 动作内加载（版本号用构建后四段前三段或 DLL 文件名）

```text
load {packagePath}/QuickerRpc.Plugin.{version}.dll
type QuickerRpc.Plugin.AssemblyLoader, QuickerRpc.Plugin.{version}
```

## 何时只跑局部发布

| 场景 | 命令 |
|------|------|
| 只改 CLI / Contracts 客户端 | `publish-rpc.ps1` |
| 只验证插件编译、不上传 | `build.ps1` 或 `build.ps1 -n` |
| 上传 Quicker 依赖 + 本地 CLI | `build.ps1 -p` |

## 禁止

- 在未获用户确认时用 `-p` 上传（会 bump 版本并改线上依赖）
- 将 `QuickerRpc.Plugin/publish/*.zip`、`publish/cli`、`publish/plugin` 提交进 Git（已在 `.gitignore`）
- 修改 `git config`

## 相关文件

- Cursor 命令：`.cursor/commands/publish.md`、 `publish-build.md`、 `publish-quicker.md`、 `publish-cli.md`
- 人类文档：`README.md`、`AGENTS.md`
