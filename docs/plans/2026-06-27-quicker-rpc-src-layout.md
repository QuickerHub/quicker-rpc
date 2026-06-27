# QuickerRpc 产品目录整合 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 RPC 相关 C# 项目收拢为 **`QuickerRpc/` 自包含产品目录**：`src/` 放全部 csproj、`tests/` 放测试、**slnx / build.yaml / version.json / build.ps1** 等产品级文件一并迁入；monorepo 根仅保留跨产品编排（`dev.ps1`、`agent-gui/`、`publish/`、`Directory.Packages.props` 等）。

**Architecture:** 逻辑分层不变（Transport → Runtime → Host Ports → Plugin）。物理上 **`QuickerRpc/` = 产品边界**；`QuickerRpc/src/` = 源码；`QuickerRpc/lib/Quicker.ActionRuntime/` = Console 专用子模块。`RepoRoot`（MSBuild）锚定 **`QuickerRpc/version.json`**，不再用 monorepo 根的 version.json。

**Tech Stack:** MSBuild / slnx、`git mv`、qkbuild `build.yaml`、`build.ps1 -t`、xUnit/NUnit。

**前置：** Phase 0–3 已完成（Transport / Runtime / Plugin.V1 物理迁移）；Phase 4 P4.2 脚手架已存在。

**Spec:** [quicker-rpc-core-architecture.md](../design/quicker-rpc-core-architecture.md) · [2026-06-27-quicker-rpc-core.md](./2026-06-27-quicker-rpc-core.md)

---

## 1. 现状 vs 目标

### 1.1 现状（半迁移）

```text
tools/qkrpc/
  QuickerRpc.Contracts/              ← 根目录
  QuickerRpc.Host.Abstractions/      ← 根目录
  QuickerRpc.AgentModel/             ← 根目录
  QuickerRpc.Console/                ← 根目录
  QuickerRpc.Test/                   ← 根目录（活进程集成）
  QuickerRpc.Plugin.Test/            ← 根目录
  QuickerRpc.Console.Test/           ← 根目录
  QuickerRpc/                        ← 中间层目录（命名冗余）
    QuickerRpc.Transport/
    QuickerRpc.Runtime/
    QuickerRpc.Plugin.V1/
    QuickerRpc.Plugin.V2/
    README.md
  tests/
    QuickerRpc.Transport.Test/
    QuickerRpc.Runtime.Test/
  agent-gui/                         ← 明确不迁入 src
  Quicker.ActionRuntime/             ← 子模块，不迁入 src
```

**问题：**

| 问题 | 影响 |
|------|------|
| 根目录 7 个 `QuickerRpc.*` 与 `QuickerRpc/` 子树并存 | 新人/agent 无法一眼判断「权威路径」 |
| `QuickerRpc/QuickerRpc.Transport` 双前缀 | csproj `ProjectReference` 深度不一致（`../..` vs `..`） |
| 测试项目分散在根与 `tests/` | slnx / CI 过滤困难 |
| 架构 doc §3 仍描述「根目录并列」 | 与代码漂移 |

### 1.2 目标态（`QuickerRpc/` 自包含 + 内层 `src/`）

```text
tools/qkrpc/                              # monorepo 根
  QuickerRpc/                             # RPC 产品（打开此目录即完整 RPC 工作区）
    QuickerRpc.slnx                       # 产品 solution
    build.yaml                            # qkbuild 插件
    build.ps1                             # 热更新 / 发布（或 thin wrapper 调 monorepo 根）
    version.json                          # 插件版本；MSBuild RepoRoot 锚点
    Directory.Build.props                 # 产品 MSBuild（RepoRoot、ActionRuntime 路径）
    README.md
    src/
      QuickerRpc.Contracts/
      QuickerRpc.Host.Abstractions/
      QuickerRpc.AgentModel/
      QuickerRpc.Transport/
      QuickerRpc.Runtime/
      QuickerRpc.Plugin.V1/
      QuickerRpc.Plugin.V2/
      QuickerRpc.Console/
    lib/
      Quicker.ActionRuntime/              # git 子模块（仅 Console 编译引用）
    tests/
      QuickerRpc.Transport.Test/
      QuickerRpc.Runtime.Test/
      QuickerRpc.Plugin.Test/
      QuickerRpc.Console.Test/
      QuickerRpc.Test/                    # 活进程集成
  build.ps1                               # monorepo 编排：转发 QuickerRpc/build.ps1 + CLI zip
  dev.ps1                                 # QuickerAgent 开发入口
  Directory.Packages.props                # CPM（全 repo 共用，src 内 csproj 向上 Import）
  Directory.Build.props                   # 可选：仅 Import 给非 QuickerRpc 路径，或删除
  agent-gui/
  docs/                                   # 跨产品文档
  publish/                                # qkrpc.exe 安装包发布
  voice-asr-runtime/
```

**slnx 示例路径（相对 `QuickerRpc/`）：**

```xml
<Solution>
  <Project Path="src/QuickerRpc.Contracts/QuickerRpc.Contracts.csproj" />
  <Project Path="src/QuickerRpc.Plugin.V1/QuickerRpc.Plugin.V1.csproj" />
  <Project Path="tests/QuickerRpc.Test/QuickerRpc.Test.csproj" />
  <Project Path="lib/Quicker.ActionRuntime/Quicker.ActionRuntime.Core/..." />
</Solution>
```

### 1.3 明确边界

| 路径 | 归属 |
|------|------|
| `QuickerRpc/src/**` | 全部 RPC C# 源码 |
| `QuickerRpc/lib/Quicker.ActionRuntime` | 子模块；`.gitmodules` path 需更新 |
| `QuickerRpc/QuickerRpc.slnx`、`build.yaml`、`version.json` | 产品级；从 repo 根迁入 |
| `agent-gui/`、`voice-asr-runtime/` | monorepo 根，另一产品 |
| `publish/`、`docs/`（跨产品） | monorepo 根；`publish/publish-rpc.ps1` 改指向 `QuickerRpc/src/QuickerRpc.Console` |

---

## 2. 设计决策

### D1：`QuickerRpc/src/` + 产品级 slnx/build（**已选定**）

- **选定：** `QuickerRpc/src/QuickerRpc.*`；slnx、`build.yaml`、`version.json` 放在 **`QuickerRpc/`** 根
- **理由：**
  - 与 `agent-gui/` 平级的产品夹内，`src/` 区分源码 vs `tests/`、`lib/`、构建配置
  - IDE 打开 `QuickerRpc/QuickerRpc.slnx` 即可开发 RPC，不扫 agent-gui
  - 消除 repo 根 7 个 `QuickerRpc.*` 与 `QuickerRpc/QuickerRpc.*` 双前缀混乱
- **代价：** 路径多一级（`QuickerRpc/src/QuickerRpc.Console`）；可接受

### D2：`lib/` 放 vendored 子模块

- `Quicker.ActionRuntime` → `QuickerRpc/lib/Quicker.ActionRuntime/`（非 `src/`，因独立 git 仓库 + 非 QuickerRpc 命名空间）

### D3：`RepoRoot` 锚点迁到 `QuickerRpc/version.json`

- `QuickerRpc/Directory.Build.props`：

```xml
<RepoRoot>$([MSBuild]::GetDirectoryNameOfFileAbove($(MSBuildProjectDirectory), 'version.json'))</RepoRoot>
<QuickerActionRuntimeRootDefault>$(RepoRoot)lib\Quicker.ActionRuntime\</QuickerActionRuntimeRootDefault>
<Import Project="$(RepoRoot)..\..\build\Quicker.ActionRuntime.Root.props" />
<!-- 或复制 build/ 子集到 QuickerRpc/build/ -->
```

- monorepo 根 **`version.json` 删除或改为转发**；根 `build.ps1` 读 `QuickerRpc/version.json`

### D4：monorepo 根 `build.ps1` 变为 thin wrapper

```powershell
# tools/qkrpc/build.ps1（保留现有 CLI 行为）
& (Join-Path $PSScriptRoot 'QuickerRpc/build.ps1') @PSBoundParameters
# 仍在根 publish CLI（publish/ 留 monorepo 根）
```

### D5：`Directory.Packages.props` 留 monorepo 根

- CPM 全 repo 一份；`QuickerRpc/Directory.Build.props` 追加：

```xml
<Import Project="$(MSBuildThisFileDirectory)..\Directory.Packages.props" Condition="Exists(...)" />
```

### D6：测试在 `QuickerRpc/tests/`（非 repo 根 `tests/`）

- 与 `src/` 对称，均在产品目录内

### D7：`git mv` + 单 Phase 单 commit；对外 DLL/wire 不变

---

## 3. 依赖关系（迁入后不变）

```text
Clients (Console, agent-gui, MCP)
    → Transport → Contracts
    → Runtime → Contracts, Host.Abstractions, AgentModel
Plugin.V1/V2 → Transport, Runtime, Host.Abstractions, AgentModel, Contracts
Host.Abstractions → Contracts
Console → Transport, Contracts, AgentModel, ActionRuntime (外部)
```

迁入后 `ProjectReference` 统一为同级或 `./` 相对路径，例如：

```xml
<!-- src/QuickerRpc.Runtime/QuickerRpc.Runtime.csproj -->
<ProjectReference Include="..\QuickerRpc.Contracts\QuickerRpc.Contracts.csproj" />
<ProjectReference Include="..\QuickerRpc.Host.Abstractions\QuickerRpc.Host.Abstractions.csproj" />
<ProjectReference Include="..\QuickerRpc.AgentModel\QuickerRpc.AgentModel.csproj" />
```

---

## 4. 需更新的路径清单（机械搜索）

执行每 Phase 后 grep 验证零残留：

| 类别 | 典型路径 / 模式 |
|------|----------------|
| slnx | `QuickerRpc.slnx` 全部 `<Project Path=` |
| qkbuild | `build.yaml` `projectDir` |
| 热更新 | `build.ps1` `--project-path` |
| csproj | 所有 `ProjectReference Include` |
| 版本后缀 | `build/AssemblyVersionFileNameSuffix.props` 的 `Import` 相对路径（若 csproj 内 `$([MSBuild]::GetDirectoryNameOfFileAbove...)`) |
| 文档 | `AGENTS.md`、`QuickerRpc/README.md`、architecture §3 |
| Skills | `.cursor/skills/quicker-rpc-build-test`、`quicker-plugin-dev`（workspace） |
| CI | `.github/workflows/*.yml`（若有显式路径） |
| dev watch | `dev.ps1`、`package.json` scripts（若有 `--project`） |

---

## Phase 5 — 建立 `QuickerRpc/` 产品脚手架

### Task 5.0: 产品目录 + 迁入 slnx / build 配置

**Files:**
- Move: `QuickerRpc.slnx` → `QuickerRpc/QuickerRpc.slnx`
- Move: `build.yaml` → `QuickerRpc/build.yaml`
- Move: `version.json` → `QuickerRpc/version.json`
- Create: `QuickerRpc/Directory.Build.props`
- Create: `QuickerRpc/build.ps1`（从根 `build.ps1` 拆出 qkbuild + runaction 段）
- Modify: 根 `build.ps1` → thin wrapper

- [ ] **Step 1:** 创建 `QuickerRpc/src/`、`QuickerRpc/lib/`、`QuickerRpc/tests/`
- [ ] **Step 2:** 迁移 slnx / yaml / version.json；更新 slnx 内 `<Project Path=` 为 `src/...` 占位
- [ ] **Step 3:** `build.yaml`：`projectDir: ./src/QuickerRpc.Plugin.V1`
- [ ] **Step 4:** Commit：`refactor(layout): QuickerRpc product scaffold`

### Task 5.1: 迁入核心库 → `QuickerRpc/src/`

**Files:**
- Move: `QuickerRpc.Contracts/` → `QuickerRpc/src/QuickerRpc.Contracts/`
- Move: `QuickerRpc.Host.Abstractions/` → `QuickerRpc/src/QuickerRpc.Host.Abstractions/`
- Move: `QuickerRpc.AgentModel/` → `QuickerRpc/src/QuickerRpc.AgentModel/`

- [ ] **Step 1–5:** `git mv` + 修正 ProjectReference + slnx + `dotnet build QuickerRpc/QuickerRpc.slnx`

---

## Phase 6 — flatten 现有 `QuickerRpc/QuickerRpc.*` → `QuickerRpc/src/`

### Task 6.1: Transport / Runtime / Plugins

- Move: `QuickerRpc/QuickerRpc.Transport/` → `QuickerRpc/src/QuickerRpc.Transport/`（Runtime、Plugin.V1/V2 同理）
- [ ] 修正 csproj：`..\QuickerRpc.Contracts`（同级 src 下）
- [ ] `Import` AssemblyVersion：`$(MSBuildThisFileDirectory)..\..\build\` → 指向 monorepo `build/` 或 `QuickerRpc/build/`
- [ ] `pwsh ./build.ps1 -t`（根 wrapper → `QuickerRpc/build.ps1`）

---

## Phase 7 — Console + ActionRuntime 子模块

- Move: `QuickerRpc.Console/` → `QuickerRpc/src/QuickerRpc.Console/`
- Move submodule: `Quicker.ActionRuntime/` → `QuickerRpc/lib/Quicker.ActionRuntime/`（更新 `.gitmodules`）
- [ ] `QuickerActionRuntimeRootDefault` → `$(RepoRoot)lib\Quicker.ActionRuntime\`
- [ ] 更新 `publish/publish-rpc.ps1` Console 项目路径

---

## Phase 8 — 测试 → `QuickerRpc/tests/`

- Move 根目录 `QuickerRpc.*.Test/` + repo 根 `tests/QuickerRpc.*.Test/` → 统一 `QuickerRpc/tests/`
- [ ] csproj 引用 `..\..\src\QuickerRpc.*`

---

## Phase 9 — 文档与 agent 路由同步

### Task 9.1: 更新架构 spec 与 AGENTS

**Files:**
- Modify: `docs/design/quicker-rpc-core-architecture.md` §3 目录结构
- Modify: `AGENTS.md` Quick routing 表
- Modify: `docs/plans/2026-06-27-quicker-rpc-core.md` File map
- Modify: workspace `.cursor/skills/quicker-plugin-dev/` 路径示例

- [ ] **Step 1:** 替换所有 `QuickerRpc/QuickerRpc.` 与根目录 `QuickerRpc.Contracts` 文档引用
- [ ] **Step 2:** 在 `src/README.md` 添加「依赖分层图」（自 architecture doc 摘录）
- [ ] **Step 3:** Commit：`docs(qkrpc): align architecture docs with src/ layout`

---

## Phase 10 — Plugin.V1 内部模块整理（可选，layout 完成后）

> **与 src 迁移正交** — 可在 Phase 8 之后分批做；不改变对外 DLL 名。

### 10.1 目标结构

```text
src/QuickerRpc.Plugin.V1/
  Adapters/           # V1*Host + WpfQuickerRpcCallScheduler（已有）
  Composition/        # DI 扩展（从 Launcher.Host 拆出）
  Features/           # 原 Services/Headless*  rename，表「宿主能力实现」
  Reflection/         # Quicker.exe 探针（保留）
  Designer/           # UI 注入（从 UI/ 迁入，若尚未）
  Launcher.cs
  Launcher.Host.cs
```

### 10.2 任务摘要

| ID | 内容 | 验收 |
|----|------|------|
| P10.1 | `Services/Headless*` → `Features/Headless*`（namespace 可选保持） | Plugin.Test 绿 |
| P10.2 | `Rpc/` 仅保留 `PluginV1RpcHostBuilder`；删除已迁 Runtime 的 dead code | grep 无重复 QuickerRpcService |
| P10.3 | `Catalog/`、`Expression/`、`StepRunners/` 评估是否并入 `Features/` 或 `Adapters/` | 单目录职责清晰 |
| P10.4 | Costura 嵌入列表与 Fody 配置复核 | `-t` 热更新 |

---

## Phase 11 — V2 与主仓对接（延续 Phase 4）

| ID | 仓库 | 任务 | 依赖 |
|----|------|------|------|
| P4.1 | Quicker | `Quicker.Infrastructure.QuickerRpc.Host` | — |
| P4.1b | Quicker | StepRunner catalog → `IQuickerRpcStepRunnerHost` | P4.1 |
| P4.3 | qkrpc | `tests/QuickerRpc.Test` 增加 V2 mock host 场景 | Phase 8 |
| P4.4 | qkrpc | `build.yaml` 可选第二 artifact `Plugin.V2`（随 Quicker 发行） | P4.1 |

---

## 5. 验收标准（Phase 5–9 整体）

- [ ] repo 根**无** `QuickerRpc.*` csproj 目录、无 `QuickerRpc.slnx`
- [ ] `dotnet build QuickerRpc/QuickerRpc.slnx -c Release` 0 errors
- [ ] 根 `pwsh ./build.ps1 -t` 仍可用（wrapper）
- [ ] `QuickerRpc/version.json` 为 MSBuild RepoRoot 锚点
- [ ] `QuickerRpcPipeIntegrationTests` 8/8（或当前 baseline）
- [ ] `grep -r "QuickerRpc/QuickerRpc\." docs/` 无结果（旧双前缀）
- [ ] architecture doc §3 与 `src/README.md` 一致

---

## 6. 风险与缓解

| 风险 | 缓解 |
|------|------|
| 大量 csproj 路径手改遗漏 | Phase 末 `dotnet build slnx` + grep `ProjectReference.*\.\./\.\./QuickerRpc` |
| qkbuild projectDir 错误导致 `-t` 失败 | Task 6 显式改 yaml + build.ps1 并跑 `-t` |
| 父仓库 submodule 指针 + workspace skill 路径 | quicker-workspace 单独 commit bump；更新 `.cursor/skills/quicker-plugin-dev` |
| IDE 缓存旧路径 | 文档注：重开 solution / `dotnet restore` |

---

## 7. 建议执行顺序

```text
Phase 5 (core libs) → Phase 6 (flatten) → Phase 7 (CLI) → Phase 8 (tests) → Phase 9 (docs)
                                                              ↓
                                                    Phase 10 (Plugin.V1 内部，可选)
                                                              ↓
                                                    Phase 11 / P4.x (V2，依赖 Quicker 主仓)
```

**推荐方式：** Subagent-Driven — 每个 Task 独立 PR/commit，Task 6 完成后必须跑 `-t`。

---

## 8. Spec self-review

- [x] 与用户目标一致：`QuickerRpc/src/` + 产品级 slnx/build
- [x] ActionRuntime 在 `QuickerRpc/lib/`，非 monorepo 共享
- [x] 逻辑架构（Transport → Runtime → Host Ports）不变
- [x] 可分阶段交付，每阶段可 build
- [x] Phase 10 内部整理与路径迁移解耦

---

## 执行选项

Plan 已保存至 `tools/qkrpc/docs/plans/2026-06-27-quicker-rpc-src-layout.md`。

1. **Subagent-Driven（推荐）** — 从 Task 5.1 起逐 task 执行 + review  
2. **Inline Execution** — 本会话直接 `git mv` Phase 5  
3. **仅 Phase 5–6** — 先完成物理迁移，Phase 10 后续再做

请指定从哪一 Phase 开始实施。
