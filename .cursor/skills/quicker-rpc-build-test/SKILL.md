---
name: quicker-rpc-build-test
description: >-
  After quicker-rpc source changes, runs pwsh ./build.ps1 -t (patch test build:
  plugin zip to Quicker test package, OSS upload, qkrpc CLI publish). Use when
  implementing or fixing Plugin, Console, Contracts, build scripts, or RPC/CLI
  features; when the user asks to build, test build, build -t, or reload the plugin
  after code edits.
disable-model-invocation: false
---

# quicker-rpc 改代码后测试构建

## 何时执行

完成 **会改变插件或 CLI 行为** 的代码修改后，**默认自动**在仓库根目录执行：

```powershell
pwsh -NoProfile -File ./build.ps1 -t
```

`block_until_ms` ≥ **90000**（`-t` 已跳过 CLI zip / setup.exe / `publish/plugin`，通常 30–50s；含 Inno 的完整打包仍用 `publish-rpc.ps1` 无 `-SkipPackaging`）。

## 何时跳过

- 用户明确说不要 build / 只讨论 / 只改文档
- 仅修改 `README.md`、`AGENTS.md`、`.cursor/**` 且未动 C#/构建配置
- 用户只要 `dotnet build` 本地编译验证（未要求部署到 Quicker 测试包）

## 触发 build 的路径（任一）

- `QuickerRpc.Plugin/**`
- `QuickerRpc.Console/**`
- `QuickerRpc.Contracts/**`
- `build.ps1`、`build.yaml`、`publish/publish-rpc.ps1`
- `Directory.*.props`、`version.json`（若与构建相关）

## 构建成功后

1. **Read** `version.json` → 汇报 `QuickerRpc` 版本（如 `0.3.8.0`）
2. 汇报产物：
   - 测试包：`C:\Users\{user}\Documents\Quicker\_packages\quicker.rpc\{前三段版本}`
   - CLI：`%LOCALAPPDATA%\Programs\qkrpc\qkrpc.exe`
   - 插件 DLL：`publish/plugin/QuickerRpc.Plugin.*.dll`
3. `build.ps1` 成功结束时会自动 `Start-Process quicker:runaction:{PluginRunActionId}` 加载/重载插件（与 `QuickerRpcBootstrap` 一致）；若 RPC 仍报方法不存在，确认 Quicker 已启动且动作执行成功
4. 可选冒烟：`qkrpc ping --json`

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

## 禁止

- 用 GitHub Release 流程代替 `-t` 做日常改代码验证
- 将 `publish/cli`、`publish/plugin`、`QuickerRpc.Plugin/publish/*.zip` 提交 Git
- 修改 `git config`

## 相关

- 公开发布：`.cursor/skills/quicker-rpc-publish/SKILL.md`
- 反射 / 查 Quicker 源码：`.cursor/skills/quicker-exe-type-probing/SKILL.md`
- 入口：`build.ps1` → qkbuild + `publish/publish-rpc.ps1`（`-t` 时 `publish-rpc.ps1 -SkipPackaging`）
- 需要本地 zip/setup 时：`pwsh ./publish/publish-rpc.ps1` 或 `build.ps1 -SkipCliPackaging:$false -t`
