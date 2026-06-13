---
name: quicker-rpc-build-test
description: >-
  After quicker-rpc source changes, run pwsh ./build.ps1 -t (hot-reload plugin +
  qkrpc CLI/serve) without restarting agent-gui. Use when editing Plugin, Console,
  Contracts, AgentModel, build scripts, or RPC/CLI; when the user asks to build,
  test build, build -t, hot update, /hot-update, reload plugin, or restart qkrpc serve.
  For official getquicker release use quicker-rpc-publish + quicker-qkbuild-version-publish (third field +1).
disable-model-invocation: false
metadata:
  internal: true
---

# quicker-rpc 改代码后测试构建

> **`-t` 不是正式发布**：只 revision +1。对外交付或改 `QuickerRpc_Run` / QExpr `launch_code` 依赖新 DLL 时，必须 **第三段 `-Publish`**。见 `.cursor/skills/quicker-qkbuild-version-publish/SKILL.md`。

## 热更新（agent-gui 可保持运行）

改 **qkrpc（CLI/serve）** 或 **QuickerRpc 插件** 后，必须在仓库根目录执行热更新构建；**不要**只改源码就假定 agent-gui / 已打开的 `qkrpc serve` 会自动吃到新逻辑。

```powershell
# 另开终端；不必关闭 dev.ps1
pwsh -NoProfile -File ./build.ps1 -t
```

| 改了什么 | 热更新做什么 | agent-gui |
|----------|----------------|-------------|
| `QuickerRpc.Plugin/**` | `-t` → 测试包 + 更新 `QuickerRpc_Run` version → **1s 后** `quicker:runaction` **重载 DLL** | 保持打开；RPC 经 serve 重连管道 |
| `QuickerRpc.Console/**`、`QuickerRpc.Contracts/**`（影响 RPC/CLI） | `-t` → 发布 `publish/cli` + **停旧 serve → 启新 serve**（默认 `9477`） | 保持打开；必要时 UI **重新检测** |
| `QuickerRpc.AgentModel/**` | 同上（CLI 与插件均可能依赖） | 同上 |
| 仅 `agent-gui/**` | **无需** `build.ps1 -t`；Next **HMR** + **`dev_frontend_check` 直到 ok** | 见 `.cursor/skills/quicker-agent-gui-frontend/SKILL.md` |
| `docs/action-authoring-src/**` | 需要 `-t` 或对应生成步骤，嵌入 CLI/agent 文档 | 视是否改到 UI |

要点：

1. **不必重启 agent-gui**：`start.mjs` 通过 `http://127.0.0.1:9477` 调 serve；`build.ps1 -t` 会替换二进制并重启 serve，端口不变。
2. **serve 副本**：开发时 serve 常跑在 `agent-gui/.runtime/qkrpc`，避免锁住 `publish/cli`；`-t` 仍会先 **Stop-QkrpcServe** 再启动 `publish/cli` 下的新进程。
3. **仅插件行为、且已在 Quicker 手动 reload DLL**：已运行的 serve 可在下次请求时 **重连管道**（`QkrpcRpcSessionPool.InvalidateAsync`）；仍建议改 Plugin 后跑 **`-t`**，避免版本/方法不一致。
4. **跳过 serve 重启**（仅当用户明确要求）：`pwsh ./build.ps1 -t -SkipQkrpcServe` — 只换插件/包，**不**换正在跑的 `qkrpc.exe`。
5. **验证**：`GET http://127.0.0.1:9477/health` 或 `qkrpc action list --limit 1 --json`；agent-gui 侧栏 **重新检测** Quicker RPC。

前置：Quicker 已启动；`-t` 失败或 RPC 报方法不存在时，确认构建日志在 qkbuild **更新 version 变量后**出现 `Started: quicker:runaction:…?plugin`（脚本会 **等待 1s** 再触发）。未重载时 Plugin 改动不会生效。

## 何时执行

完成 **会改变插件或 CLI 行为** 的代码修改后，**默认自动**在仓库根目录执行：

```powershell
pwsh -NoProfile -File ./build.ps1 -t
```

`block_until_ms` ≥ **90000**（`-t` 已跳过 CLI zip / setup.exe / `publish/plugin`，通常 30–50s；含 Inno 的完整打包仍用 `publish-rpc.ps1` 无 `-SkipPackaging`）。

## 何时跳过

- 用户明确说不要 build / 只讨论 / 只改文档
- 仅修改 `README.md`、`AGENTS.md`、`.cursor/**` 且未动 C#/构建配置/ **`docs/action-authoring-src`**
- 用户只要 `dotnet build` 本地编译验证（未要求部署到 Quicker 测试包）

## 触发 build 的路径（任一）

- `QuickerRpc.Plugin/**`
- `QuickerRpc.AgentModel/**`
- `QuickerRpc.Console/**`
- `QuickerRpc.Contracts/**`
- `docs/action-authoring-src/**`
- `build.ps1`、`build.yaml`、`publish/publish-rpc.ps1`
- `Directory.*.props`、`version.json`（若与构建相关）

## 构建成功后

1. **Read** `version.json` → 汇报 `QuickerRpc` 版本（如 `0.3.8.0`）
2. 汇报产物：
   - 测试包：`C:\Users\{user}\Documents\Quicker\_packages\quicker.rpc\{前三段版本}`
   - CLI：`%LOCALAPPDATA%\Programs\qkrpc\qkrpc.exe`
   - 插件 DLL：`publish/plugin/QuickerRpc.Plugin.*.dll`
3. `build.ps1` 在 **qkbuild 成功且更新 version 变量后** 等待 **1s**，再 `Start-Process quicker:runaction:{PluginRunActionId}` 加载/重载插件；若 CLI publish 失败但 qkbuild 已成功，重载动作仍应已执行。RPC 仍报方法不存在 → 确认 Quicker 已启动且上述 URI 已触发
4. 默认会先 **停止** 占用中的 `qkrpc serve`，构建完成后从 `publish/cli` **重启** `qkrpc serve`（`http://127.0.0.1:9477/health`）；跳过：`build.ps1 -t -SkipQkrpcServe`
5. 可选冒烟：`qkrpc guide get --topic overview --json` 或 `qkrpc action list --limit 1 --json`

## 构建失败

1. 读终端完整错误（编译 / qkbuild / dotnet publish）
2. 修复后 **再次** `build.ps1 -t`，直到退出码 **0**
3. 不要提交 `version.json` bump（除非用户要求 commit）

## 与公开发布的区别

| | `build -t`（本 skill） | GitHub Release（publish skill） |
|--|------------------------|----------------------------------|
| 用途 | 改代码后本地/测试包验证 | 对外发布 `qkrpc` CLI |
| 命令 | `build.ps1 -t` | `publish/Publish-GitHubRelease.ps1` |
| 产物 | Quicker 测试包 + 本机 CLI | GitHub Release `setup.exe` + zip |
| `-t` 跳过 | CLI zip、Inno `setup.exe`、`publish/plugin` 二次 publish（插件已由 qkbuild 写入测试包） | — |

**测试包版本**：`build.ps1 -t` 只递增 `version.json` **第四段**（revision），DLL 为 `QuickerRpc.Plugin.0.x.x.r.dll`，目录仍为 `_packages/quicker.rpc/0.x.x/`。**发布时必须第三段 +1、R→0**（`quicker-qkbuild-version-publish`）；勿在仅 `-t` 后更新子程序 `launch_code` 调用新 API。

### 何时必须第三段正式发布（不能只做 `-t`）

- 新增/变更 `Launcher` 等 **对外 public API**，且 `QuickerRpc_Run` 或其它子程序会调用
- 准备 `qkrpc action update` / 分享动作 / 告知用户「已发布可用」
- QEE/QAL 行为变更且 QExpr 依赖新 DLL

本地 `-t` 验完后：按 `quicker-rpc-publish` 或 `qkbuild … --publish -y --version X.Y.(Z+1).0` 发第三段包。

## 禁止

- 用 GitHub Release 流程代替 `-t` 做日常改代码验证
- **用 `-t` 代替第三段 `-Publish` 对外发布**（见 `quicker-qkbuild-version-publish`）
- 将 `publish/cli`、`publish/plugin`、`QuickerRpc.Plugin/publish/*.zip` 提交 Git
- 修改 `git config`

## Agent 改完代码后的必做项

1. 若 diff 触及 **Plugin / Console / Contracts / AgentModel**（见上文「触发 build 的路径」）→ **执行** `build.ps1 -t`（热更新），再跑相关 `dotnet test` / `qkrpc` 冒烟。
2. 若用户正在用 **agent-gui** 验证 → 提醒无需关前端；构建完成后可点 **重新检测**。
3. **不要**在未 `-t` 的情况下声称「已修复 RPC/CLI」，除非用户明确只做静态分析或仅改 agent-gui。

## 相关

- **版本号（第三段 +1 必守）**：`.cursor/skills/quicker-qkbuild-version-publish/SKILL.md`
- agent-gui 前端报错捕获与修复：`.cursor/skills/quicker-agent-gui-frontend/SKILL.md`
- 公开发布：`.cursor/skills/quicker-rpc-publish/SKILL.md`
- 反射 / 查 Quicker 源码：`.cursor/skills/quicker-exe-type-probing/SKILL.md`
- 入口：`build.ps1` → qkbuild + `publish/publish-rpc.ps1`（`-t` 时 `publish-rpc.ps1 -SkipPackaging`）
- 需要本地 zip/setup 时：`pwsh ./publish/publish-rpc.ps1` 或 `build.ps1 -SkipCliPackaging:$false -t`
- Cursor 命令：`.cursor/commands/hot-update.md`（`/hot-update`）
