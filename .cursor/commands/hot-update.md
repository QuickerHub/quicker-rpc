# quicker-rpc 热更新（qkrpc + 插件）

在 **quicker-rpc 仓库根目录** 执行。先 **Read** skill：`.cursor/skills/quicker-rpc-build-test/SKILL.md`（「热更新」一节）。

## 何时执行

改动了以下路径且需要本机立刻生效时（**默认应执行本命令**，勿只改源码不构建）：

- `QuickerRpc.Plugin/**`
- `QuickerRpc.Console/**`、`QuickerRpc.Contracts/**`
- `QuickerRpc.AgentModel/**`（CLI/插件均可能依赖）
- `docs/action-authoring-src/**`（嵌入 CLI/agent 文档时）
- `build.ps1`、`build.yaml`、`publish/publish-rpc.ps1`

**不必**执行：仅 `agent-gui/**`（Next HMR；用 `dev_frontend_check`）。

## 前置

1. **Quicker 已启动**（插件重载依赖 `quicker:runaction:…?plugin`）。
2. **agent-gui / `start-agent-gui.ps1` 可保持运行**，不必关前端。
3. 在仓库根目录执行（`working_directory` = quicker-rpc 根）。

## 执行

```powershell
pwsh -NoProfile -File ./build.ps1 -t
```

`block_until_ms` ≥ **90000**（通常 30–50s；失败则读完整终端输出后修复再跑，直到退出码 **0**）。

脚本会依次：

1. **Stop** 占用中的 `qkrpc serve`（含 `agent-gui/.runtime/qkrpc`）
2. qkbuild **测试包** + OSS + Quicker **重载插件 DLL**
3. **dotnet publish** CLI → `publish/cli` → 安装到 `%LOCALAPPDATA%\Programs\qkrpc`
4. **Start** `qkrpc serve` → `http://127.0.0.1:9477`

## 验证

```powershell
Invoke-RestMethod http://127.0.0.1:9477/health
# 或
qkrpc action list --limit 1 --json
```

期望：`ok: true` / `exit code 0`。agent-gui 侧栏约 **15 秒内**自动刷新 RPC 状态；也可点「重新检测」或工具测试页「刷新 RPC」。

## 可选参数

| 参数 | 用途 |
|------|------|
| `-SkipQkrpcServe` | 仅换插件/包，**不**停/启 serve（用户明确要求时） |
| `-SkipCliPackaging:$false` | 需要本地 zip/setup 时（少见；见 skill） |

## 完成后汇报

1. 退出码、耗时要点（插件版本来自 `version.json` / 构建日志）。
2. `GET /health` 或 `qkrpc action list` 结果摘要。
3. 若 RPC 仍报方法不存在：确认 Quicker 中插件重载动作是否成功。

## 禁止

- 将 `publish/cli`、`publish/plugin`、`QuickerRpc.Plugin/publish/*.zip` 提交 Git
- 修改 `git config`
- 把本命令当成 **公开发布**（用 `/publish` + `quicker-rpc-publish` skill）
- 仅改 `agent-gui/**` 仍跑 `build.ps1 -t`（浪费时间）
