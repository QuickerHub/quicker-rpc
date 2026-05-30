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

`block_until_ms` ≥ **120000**（构建 + OSS 上传约 20–30s）。

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
   - CLI：`publish/cli/qkrpc.exe`
   - 插件 DLL：`publish/plugin/QuickerRpc.Plugin.*.dll`
3. 若改了 **RPC 接口或插件逻辑**：提醒在 Quicker 中加载新版本插件（子程序 `QuickerRpc_Run` 通常会被 `-t` 自动 bump；若 RPC 仍报方法不存在，需重新 Register / 重启 Quicker）
4. 可选冒烟：`publish/cli/qkrpc.exe ping --json`

## 构建失败

1. 读终端完整错误（编译 / qkbuild / dotnet publish）
2. 修复后 **再次** `build.ps1 -t`，直到退出码 **0**
3. 不要提交 `version.json` bump（除非用户要求 commit）

## 与 `quicker-rpc-publish` 的区别

| | `build -t`（本 skill） | `build -p`（publish skill） |
|--|------------------------|-----------------------------|
| 用途 | 改代码后本地/测试包验证 | 正式发布上传 |
| 版本 | patch bump + 测试目录 | 生产 OSS + Quicker 依赖 |
| 确认 | 改代码后 **自动** | 需用户确认后再 `-p` |

## 禁止

- 用 `-p` 代替 `-t` 做日常改代码验证（会走正式发布流程）
- 将 `publish/cli`、`publish/plugin`、`QuickerRpc.Plugin/publish/*.zip` 提交 Git
- 修改 `git config`

## 相关

- 发布详情：`.cursor/skills/quicker-rpc-publish/SKILL.md`
- 入口：`build.ps1` → qkbuild + `publish/publish-rpc.ps1`
