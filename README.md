# quicker-rpc

> 仓库：[QuickerHub/quicker-rpc](https://github.com/QuickerHub/quicker-rpc)

本 monorepo 包含三件紧密相关的东西：

| 组件 | 面向谁 | 一句话 |
|------|--------|--------|
| **[QuickerAgent](docs/quicker-agent.md)** | Quicker 终端用户 | 桌面 AI 副驾：找 / 跑 / 改 / 发动作，全局快捷键秒开 |
| **QuickerRpc 插件** | 同上（随动作安装） | 在 Quicker 进程内托管 RPC 服务 |
| **`qkrpc` CLI** | 开发者、脚本、第三方 Agent | 命令行 + MCP + HTTP，无头读写 Quicker 动作 |

底层统一：**命名管道 + StreamJsonRpc**，CLI 作客户端连插件内的 `IQuickerRpcService`。

**完整文档索引** → [docs/README.md](docs/README.md) · **产品能力与规划** → [docs/product/README.md](docs/product/README.md)

---

## 选你的入口

| 我想… | 怎么做 |
|-------|--------|
| 用 AI 管理 Quicker 动作 | 安装 [QuickerAgent](https://github.com/QuickerHub/quicker-rpc/releases/latest/download/quicker-agent-win-x64-setup.exe)，见 [docs/quicker-agent.md](docs/quicker-agent.md) |
| 在 Cursor / Claude / VS Code 里写动作 | 安装 `qkrpc` 后 `qkrpc agent setup`，或 [Cursor 插件从仓库安装](cursor-plugin/quicker-rpc/README.md)，见 [docs/agent-mcp-integration.md](docs/agent-mcp-integration.md) |
| 写脚本或 CI 调 Quicker | 安装 `qkrpc`，用 `--json` 子命令或 `qkrpc serve` HTTP |
| 改本仓库代码 | 下文 §开发；Coding Agent 读 [AGENTS.md](AGENTS.md) |

---

## QuickerAgent

专为 [Quicker](https://getquicker.net/) 打造的 AI 助手：内置动作编辑器与步骤知识库，描述用途即可搜索执行，复杂编排进主窗口，轻量操作走可配置的全局启动器（默认 **Ctrl+Shift+Space**）。

- **下载**：[quicker-agent-win-x64-setup.exe](https://github.com/QuickerHub/quicker-rpc/releases/latest/download/quicker-agent-win-x64-setup.exe)（落地页源码：[quicker-agent-web/](quicker-agent-web/)）
- **前置**：本机 Quicker + [QuickerAgent 插件动作](https://getquicker.net/Sharedaction?code=aa5917ad-1256-4c73-7022-08debe3efcbe)
- **产品介绍**：[docs/quicker-agent.md](docs/quicker-agent.md)
- **本地开发**：[agent-gui/README.md](agent-gui/README.md)（`pwsh ./dev.ps1`）

第三方 Agent（Cursor 等）若只需无头读写动作、不需 QuickerAgent UI，用下文 **`qkrpc` + MCP** 即可。

---

## `qkrpc` CLI 与插件

### 安装 CLI

从 [GitHub Releases](https://github.com/QuickerHub/quicker-rpc/releases/latest) 下载 **`qkrpc-win-x64-setup.exe`**，或便携包 **`qkrpc-win-x64.zip`**。

- **系统要求**：Windows 10 1607（10.0.14393）Enterprise/LTSC 或 Windows Server 2016 及以上（与 [.NET 10 支持的操作系统](https://learn.microsoft.com/dotnet/core/install/windows#supported-versions) 一致）
- 安装目录：`%LOCALAPPDATA%\Programs\qkrpc`
- 安装后**新开终端**；工作区 `.vscode/settings.json` 可为集成终端追加 PATH
- 卸载：Windows「设置 → 应用」或安装目录 `unins000.exe`

```powershell
# 可选：静默安装
Invoke-WebRequest -Uri 'https://github.com/QuickerHub/quicker-rpc/releases/latest/download/qkrpc-win-x64-setup.exe' -OutFile "$env:TEMP\qkrpc-setup.exe" -UseBasicParsing
Start-Process -FilePath "$env:TEMP\qkrpc-setup.exe" -ArgumentList '/VERYSILENT' -Wait
```

### 加载 Quicker 插件

将 `publish/plugin` 下 DLL 放到动作的 `{packagePath}`，在 Quicker 子程序注册区：

```text
load {packagePath}/QuickerRpc.Plugin.{version}.dll
type QuickerRpc.Plugin.Launcher, QuickerRpc.Plugin.{version}
```

子程序 **QuickerRpc_Run** 标准入口：`Launcher.Start(_context)`。它从实际动作 context 解析参数；只有调用方确有已定义的字符串变量时，才将该变量显式传给 `Launcher.StartFromQuickerInParam`。`quicker_in_param` 不会自动成为 C# 标识符。

| 条件 | 行为 |
|------|------|
| 外部触发（`ActionTrigger.Extern`） | 仅启动 RPC；弹插件版本提示 |
| 自动运行（`ActionTrigger.AutoRun`） | 仅启动 RPC（静默） |
| Quicker 内点击 / `agent` / 无参 | 启动 RPC 并打开 QuickerAgent |
| `quicker_in_param=agent-kill` | 仅退出 QuickerAgent |
| `quicker:runaction:…?plugin` | 仅 RPC |

### 验证

Quicker 已运行且插件已加载：

```powershell
qkrpc help --json
# 可选：qkrpc serve → GET http://127.0.0.1:9477/health
```

CLI 退出码 `0` 成功、`1` 失败；脚本与 Agent 推荐始终加 `--json`。

### 第三方 Agent 一键接入

```powershell
qkrpc agent setup              # 默认 Cursor 用户级 MCP + skills
qkrpc agent setup --upgrade    # CLI 升级后刷新 skills/rules
qkrpc agent setup --all        # 多宿主 MCP
qkrpc agent setup --project    # 额外写入项目配置（团队 opt-in）
```

说明：[docs/agent-mcp-integration.md](docs/agent-mcp-integration.md) · Skills：[docs/agent-skill-distribution.md](docs/agent-skill-distribution.md)

---

## 常用命令

完整表：[docs/cli-commands.md](docs/cli-commands.md) · 机器可读：`qkrpc help --json`

```powershell
# 现有 V1 动作：YAML 源编辑；V2 使用 Quicker 原生 MCP
qkrpc guide get --topic program-source --json

# 搜索 → 打开到空目录 → 编辑 YAML/files → 离线预检 → 保存
qkrpc action list --query "keyword" --json
qkrpc action open --id <guid> --dir .tmp/quicker/edit-action --json
qkrpc action save --dir .tmp/quicker/edit-action --dry-run --json
qkrpc action save --dir .tmp/quicker/edit-action --json

# 创建 / 旧 JSON 接口（保留兼容）
qkrpc action get --id <guid> --return-mode full --json
qkrpc action create --title "My Action" --json
qkrpc action patch --id <guid> --patch-file patch.json --expected-edit-version <N> --json

# 步骤模块、图标、子程序（写步骤前必查 schema）
qkrpc step-runner search --query "clipboard|text" --json
qkrpc step-runner get --key <stepRunnerKey> --json
qkrpc fa search --query "address book" --json
qkrpc subprogram search --query "keyword" --json

# 运行、设计器、发布共享动作
qkrpc action run --id <idOrName> --wait --json
qkrpc action update --id <sharedActionGuid> --changelog "说明" --json
```

`open` 导出 `program.source.yaml`、`files/` 与工具管理的身份/原生基线文件；
只编辑 YAML 和资源。`save` 写回原动作并校验版本与 Designer 状态，不公开发布。
独立 MCP 对应 `qkrpc_action_open` / `qkrpc_action_save`；本轮覆盖现有 V1 动作程序体，
元数据、新建和全局子程序仍走原入口。旧 JSON 可用 `--patch-file -` / `--xaction-file -` 从 stdin 传入。

---

## 架构

```text
QuickerAgent / 脚本 / MCP Agent
        |
        v
   qkrpc.exe (CLI client)  --named pipe-->  QuickerRpc.Plugin (RPC server)
                                                    |
                                                    v
                                          Quicker UI thread / services
```

- 管道名：`QuickerRpc_Server_QRPC2026`（`QuickerRpcPipeNames.ServerPipe`）
- Quicker 内部对象访问由插件切回 UI 线程执行
- QuickerAgent 默认走 `qkrpc serve`（`9477`）；MCP 走 `qkrpc mcp` stdio

---

## 仓库结构

| 路径 | 说明 |
|------|------|
| `QuickerRpc.Contracts` | RPC 合约、管道名、客户端 |
| `QuickerRpc.Plugin` | Quicker 插件与 RPC 服务端（net472） |
| `QuickerRpc.Console` | `qkrpc.exe`（net10.0） |
| `QuickerRpc.AgentModel` | XAction 压缩 / patch、StepRunner、内置指南 |
| `QuickerRpc.Test` / `QuickerRpc.Plugin.Test` | 活进程集成测试 / 离线反射测试 |
| `agent-gui/` | QuickerAgent（静态 React + 独立 Node service + Electron；Next 用于开发 HMR 与显式 legacy） |
| `quicker-agent-web/` | 下载落地页（[alinko.top](https://alinko.top) / EdgeOne Pages） |
| `docs/` | 人类文档与 Skill 源码 |
| `publish/` | 构建脚本、changelog、发布资产 |

---

## 开发

需要 [.NET 10 SDK](https://dotnet.microsoft.com/download)（`global.json`）。Plugin 目标 **net472**（与 Quicker.exe 一致）。

```powershell
dotnet build QuickerRpc.slnx

# 编译 CLI、重载 Quicker 插件、启动 qkrpc serve
pwsh ./build.ps1 -t
```

自定义 Quicker 路径：

```powershell
dotnet build QuickerRpc.Plugin -p:QuickerDllPath="D:\path\to\Quicker\bin\x64\Debug\net472"
```

**QuickerAgent 前端**（Node 20+、pnpm）：`pwsh ./dev.ps1` — 见 [agent-gui/README.md](agent-gui/README.md)、[docs/dev-supervisor-design.md](docs/dev-supervisor-design.md)。改 UI 时不要跑 `build.ps1 -t`（HMR 即可）。

**QuickerAgent 生产入口**：在 `agent-gui/` 执行 `pnpm build`、`pnpm start`，默认使用静态 React 与独立 Node；`pnpm electron:prepare` 也构建并暂存同一运行目录。Next 生产兼容需显式使用 `build:legacy-next` / `electron:prepare:legacy-next` / `start:legacy-next`，命令与资源边界见 [静态运行目录](docs/engineering/static-agent-runtime.md)。

**测试**（需 Quicker + 已加载插件）：

```powershell
dotnet test QuickerRpc.Test -c Release
dotnet test QuickerRpc.Test --filter FullyQualifiedName~QuickerRpcPipeIntegrationTests
```

Coding Agent 约定：[AGENTS.md](AGENTS.md)（根目录）；`agent-gui/` 另有 [agent-gui/AGENTS.md](agent-gui/AGENTS.md)。

---

## 发布

维护者：更新 `version.json`、撰写 `publish/changelogs/vX.Y.Z.md` 后：

```powershell
pwsh ./publish/Publish-GitHubRelease.ps1
```

或推送 `v*` tag，由 `.github/workflows/release-cli.yml` 构建 GitHub Release。

| 产物 | 路径 |
|------|------|
| qkrpc 安装包 | `publish/qkrpc-{version}-win-x64-setup.exe` |
| QuickerAgent 安装包 | `quicker-agent-{version}-x64-setup.exe` |
| 本机 CLI | `%LOCALAPPDATA%\Programs\qkrpc\qkrpc.exe` |
| 插件 DLL | `publish/plugin/QuickerRpc.Plugin.*.dll` |

getquicker 正式包须递增 `version.json` **第三段**（见 `.cursor/skills/quicker-qkbuild-version-publish/`）。

---

## 延伸阅读

- [docs/README.md](docs/README.md) — 文档总索引
- [docs/product/README.md](docs/product/README.md) — 当前能力、状态与规划缺口
- [docs/agents/README.md](docs/agents/README.md) — Coding Agent 任务路由
- [docs/quicker-agent.md](docs/quicker-agent.md) — QuickerAgent 产品说明
- [docs/agent-mcp-integration.md](docs/agent-mcp-integration.md) — MCP 与第三方 Agent
- [docs/cli-commands.md](docs/cli-commands.md) — CLI 命令表
- [docs/quicker-action-data-storage.md](docs/quicker-action-data-storage.md) — 动作数据存储
- [GitHub Releases](https://github.com/QuickerHub/quicker-rpc/releases)
