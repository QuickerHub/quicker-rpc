---
name: quicker-qkbuild-version-publish
description: >-
  Mandatory qkbuild publish versioning for Quicker packages (quicker.rpc, cea.quicker-expression-enhanced,
  cea.quicker-assembly-loader): official getquicker upload MUST bump the third semver field (X.Y.Z.R → X.Y.(Z+1).0).
  Never ship subprogram launch_code or new plugin public APIs on revision-only -t/-Test builds alone.
  version.json QuickerRpc must only increase (never decrease); enforced by publish scripts.
  Use when publishing QuickerRpc, QExpr/QEE, QAsmReg, QuickerRpc_Run, or any qkbuild --publish to getquicker.
disable-model-invocation: false
metadata:
  internal: true
---

# qkbuild 包发布 — 版本号必守

Quicker 依赖包使用 **四段版本** `X.Y.Z.R`（`version.json`）。**getquicker 正式包**与 **子程序 `version` 变量**必须对齐；否则 QExpr / `依赖下载_混合模式` 会拉到旧 DLL，出现「找不到类型/成员」等运行时错误。

## 单调递增（永不允许减小）

`version.json` → `QuickerRpc`（以及 qkbuild `--version`）**只能变大，不能变小**。

| 操作 | 允许 |
|------|------|
| `0.12.2.2` → `0.12.3.0`（第三段 +1） | ✅ 正式发布 |
| `0.12.3.0` → `0.12.3.1`（`-t` revision +1） | ✅ 仅本地热更新 |
| `0.12.3.0` → `0.12.3.0`（`-Publish -NoVersion` 重传） | ✅ 同版本重传 |
| `0.12.3.0` → `0.12.2.0` 或任意回退 | ❌ **禁止** |

**Baseline**（脚本自动取 max）：git tags `v*.*.*`、`HEAD` / `origin/main` 上的 `version.json`。

校验：`Assert-QuickerRpcVersionMonotonic`（`publish/qkrpc-publish-lib.ps1`），在 `Publish-GitHubRelease.ps1` 与 `build.ps1 -Publish` 调用。

## 黄金规则（Agent 必守）

| 场景 | 命令 | 版本变化 | getquicker |
|------|------|----------|------------|
| **正式发布** | `build.ps1 -Publish` 或 `qkbuild build … --publish -y --version X.Y.Z.0` | **第三段 Z +1**，**第四段 R→0** | ✅ 上传 OSS + 更新子程序 `version` |
| **本地热更新** | `build.ps1 -t` / `-Test` | **仅第四段 R +1** | ⚠️ 仅本机 `_packages` 可靠；**不能**当作对外发布 |

**禁止**：只跑 `-t` / `-Test`（revision +1）后，就更新 `QuickerRpc_Run` / QExpr 的 `launch_code`、分享动作、或宣称「已发布可用」。

## 为何必须第三段 +1

1. **依赖下载**按 `version` 变量拉包；getquicker 上正式目录按 **前三段** `X.Y.Z/` 组织；revision-only 包其他用户/新环境往往只有上一正式第三段（如 `0.12.2.0`），没有 `0.12.2.1`。
2. **子程序 `launch_code` 若调用新 API**（如曾加的 `Launcher.StartFromQuickerInParam`），旧第三段 DLL 无该方法 → QExpr 报 `No applicable member … StartFromQuickerInParam`。
3. **`-t` 可上传 OSS revision zip**，但分享动作 / 其他机器 / 清缓存后仍可能解析到旧第三段 DLL。

**结论**：凡改动 **插件/QEE/QAL 对外行为** 且 **子程序或动作会依赖新 DLL**，必须 **第三段正式发布** 后再 `action update` / 通知用户。

## 各仓库发布命令

### QuickerRpc（quicker-rpc）

```powershell
# 正式（第三段 +1，revision→0）
cd d:\source\repos\quicker\quicker-rpc
qkbuild build -c build.yaml --project-path QuickerRpc.Plugin --publish -y --version 0.12.3.0
# 或 build.ps1 -Publish（交互确认版本）

# 仅本地验证 — 不能替代上式
pwsh -NoProfile -File ./build.ps1 -t
```

GitHub Release 全流程见 `quicker-rpc-publish` skill；阶段三 `build.ps1 -Publish -NoVersion` 在 tag 已 bump 后使用。

### QEE → QExpr（wpf-demos/quicker-expression-enhanced）

```powershell
cd d:\source\repos\quicker\wpf-demos\quicker-expression-enhanced
pwsh ./build.ps1 -Publish          # 第三段 +1；自动更新 QExpr version 变量
# 禁止：-Test / revision-only 当作 getquicker 发布
```

### QAL → QAsmReg（quicker_build_net/quicker-assembly-loader）

```powershell
cd d:\source\repos\quicker\quicker_build_net\quicker-assembly-loader
pwsh ./build.ps1 -Publish -y --version X.Y.Z.0
```

## 子程序 / launch_code 联动

| 改了什么 | 必须先 |
|----------|--------|
| `Launcher` 新 public API + `QuickerRpc_Run.launch_code` 调用 | QuickerRpc **第三段 `-Publish`** |
| QEE 注册/load 行为 + QExpr 步骤 | QEE **第三段 `-Publish`** |
| 仅插件内部实现、launch_code 仍为 `Launcher.Start(_context)` 等旧 API | 可 `-t` 本地验，对外仍建议下一第三段发布 |

`launch_code` **优先** `Launcher.Start(_context)`；`StartFromQuickerInParam` 等仅在新第三段已发布后使用，或插件内通过 `ActionExecuteContextProbe` 读 `quicker_in_param` 变量。

## Agent 检查清单（发布前）

0. 新版本 **>** max(已有 tag, 已提交 `version.json`)？（**绝不能更小**）
1. `version.json` 第三段是否已 +1、第四段是否为 `0`？（新公开发布时）
2. 是否用了 `-Publish` / `--publish -y --version X.Y.Z.0`（**不是** `-t` / `-Test`）？
3. `qkrpc subprogram get --id QuickerRpc_Run`（及 QExpr）的 `version` 是否与刚发布一致？
4. 本机 `_packages/{package}/{X.Y.Z}/` 下 DLL 四段版本与 `version` 一致？
5. 若更新了分享动作：changelog + `qkrpc action update` 在 **插件第三段发布之后**。

## 禁止

- **减小或回退 `version.json` / `--version`**（只能单调递增）
- 用 `-t` / `-Test` 代替 `-Publish` 对外交付
- 用 `-Publish -NoVersion` 在**未**先 bump 第三段时「偷偷发 revision」
- 子程序 `version` 指向 revision-only（如 `0.12.2.1`）而 getquicker 正式包仍停在 `0.12.2.0`
- `launch_code` 引用尚未进入**最新第三段** DLL 的 API

## 相关

- `quicker-rpc-publish` — GitHub Release + `build.ps1 -Publish -NoVersion` + action update
- `quicker-rpc-build-test` — 日常 `-t` 热更新（非正式发布）
- `qkbuild-qexpr` — QExpr / QEE 维护
