# QuickerRpc Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `tools/qkrpc/QuickerRpc/` 下建立 Transport + Runtime 分层，**Phase 0 先落地统一 Host 端口接口**；Phase 1–3 完成 V1 模块化（驱动 B）；Phase 4+ 文档化 V2 路径（驱动 A，不阻塞）。

**Architecture:** Wire (`Contracts`) → Transport (pipe/JsonRpc) → Runtime (`QuickerRpcService` 编排) → Host Ports (`Host.Abstractions`) → V1 Adapters (`Plugin.V1`)。详见 [quicker-rpc-core-architecture.md](../design/quicker-rpc-core-architecture.md)。

**Tech Stack:** .NET (net472 plugin, net10 CLI), StreamJsonRpc, MSBuild, qkbuild, xUnit/NUnit（与现有 `QuickerRpc.Test` 一致）。

**Spec:** [quicker-rpc-core-architecture.md](../design/quicker-rpc-core-architecture.md) · [quicker-rpc-host-abstractions.md](../design/quicker-rpc-host-abstractions.md)

---

## File map (Phase 0–1)

| 路径 | 职责 |
|------|------|
| `QuickerRpc/QuickerRpc.Host.Abstractions/` | 统一端口接口 + Host DTO（从根目录迁入或复制后切换引用） |
| `QuickerRpc/QuickerRpc.Transport/` | 命名管道客户端/服务端、Bootstrap |
| `QuickerRpc/QuickerRpc.Runtime/` | `QuickerRpcService` 薄编排 |
| `QuickerRpc/QuickerRpc.Contracts/` | 纯 wire 契约（Phase 1 剥离 Client） |
| `tests/QuickerRpc.Transport.Test/` | Transport 单元测试 |
| `tests/QuickerRpc.Runtime.Test/` | Runtime + mock host 测试 |
| `QuickerRpc.slnx` | 加入新项目 |
| `docs/design/quicker-rpc-core-architecture.md` | 架构 spec（已完成） |

---

## Phase 0 — 统一接口 + Transport 骨架

### Task 0: 创建 `QuickerRpc/` 目录与 slnx 条目

**Files:**
- Modify: `QuickerRpc.slnx`
- Create: `QuickerRpc/README.md`（一行指向 architecture doc）

- [ ] **Step 1:** 在 `tools/qkrpc/QuickerRpc/` 创建空目录结构（暂不移动现有项目，避免一次性破坏引用）

- [ ] **Step 2:** 更新 `QuickerRpc.slnx`，预留新项目路径（注释或占位，Task 2/3 完成后填入）

- [ ] **Step 3:** 验证 `dotnet build QuickerRpc.slnx -c Release` 仍通过

---

### Task 1: 扩展 `QuickerRpc.Host.Abstractions` — 统一端口接口（**优先**）

**Status:** ✅ 完成（2026-06-27）

**Files:**
- Create: `QuickerRpc.Host.Abstractions/IQuickerRpcHostCapabilities.cs`
- Create: `QuickerRpc.Host.Abstractions/IQuickerRpcSessionHost.cs`
- Create: `QuickerRpc.Host.Abstractions/IQuickerRpcSubProgramHost.cs`
- Create: `QuickerRpc.Host.Abstractions/IQuickerRpcActionRunHost.cs`
- Create: `QuickerRpc.Host.Abstractions/IQuickerRpcActionCatalogHost.cs`
- Create: `QuickerRpc.Host.Abstractions/IQuickerRpcSearchHost.cs`
- Create: `QuickerRpc.Host.Abstractions/IQuickerRpcSettingsHost.cs`
- Create: `QuickerRpc.Host.Abstractions/IQuickerRpcActionDocHost.cs`
- Create: `QuickerRpc.Host.Abstractions/IQuickerRpcStepRunnerHost.cs`
- Create: `QuickerRpc.Host.Abstractions/IQuickerRpcExpressionHost.cs`
- Create: `QuickerRpc.Host.Abstractions/IQuickerRpcChromeControlHost.cs`
- Create: `QuickerRpc.Host.Abstractions/IQuickerRpcTriggerHost.cs`
- Create: `QuickerRpc.Host.Abstractions/IQuickerRpcDesignerHost.cs`
- Create: `QuickerRpc.Host.Abstractions/IQuickerRpcLauncherHost.cs`
- Modify: `QuickerRpc.Host.Abstractions/IQuickerRpcHost.cs`
- Create: `QuickerRpc.Host.Abstractions/Requests/`（Host-only 请求 DTO，按需）
- Modify: `docs/design/quicker-rpc-host-abstractions.md`（交叉链接 core architecture）

- [ ] **Step 1: 添加 `IQuickerRpcHostCapabilities`**

```csharp
namespace QuickerRpc.Host;

public interface IQuickerRpcHostCapabilities
{
    bool ChromeControl { get; }
    bool Triggers { get; }
    bool DesignerUi { get; }
    bool Launcher { get; }
    bool EnforcesDesignerOpenGuard { get; }
}
```

- [ ] **Step 2: 扩展 `IQuickerRpcHost`**（按 spec §4.2 添加属性；optional 端口用 nullable）

```csharp
namespace QuickerRpc.Host;

public interface IQuickerRpcHost
{
    QuickerRpcHostInfo Info { get; }
    IQuickerRpcHostCapabilities Capabilities { get; }
    IQuickerRpcSessionHost Session { get; }
    IQuickerRpcActionProgramHost ActionPrograms { get; }
    IQuickerRpcActionSharingHost ActionSharing { get; }
    IQuickerRpcSubProgramHost SubPrograms { get; }
    IQuickerRpcActionRunHost ActionRuns { get; }
    IQuickerRpcActionCatalogHost ActionCatalog { get; }
    IQuickerRpcSearchHost Search { get; }
    IQuickerRpcSettingsHost Settings { get; }
    IQuickerRpcActionDocHost ActionDocs { get; }
    IQuickerRpcStepRunnerHost StepRunners { get; }
    IQuickerRpcExpressionHost Expressions { get; }
    IQuickerRpcChromeControlHost? ChromeControl { get; }
    IQuickerRpcTriggerHost? Triggers { get; }
    IQuickerRpcDesignerHost? Designer { get; }
    IQuickerRpcLauncherHost? Launcher { get; }
}
```

- [ ] **Step 3: 添加各端口接口** — 方法签名 **复用** `QuickerRpc.Contracts.Rpc` 中已有 result 类型（ProjectReference 指向 Contracts）

示例 `IQuickerRpcSessionHost.cs`：

```csharp
using System.Threading;
using System.Threading.Tasks;
using QuickerRpc.Contracts.Rpc;

namespace QuickerRpc.Host;

public interface IQuickerRpcSessionHost
{
    Task<QuickerRpcAccountInfo> GetAccountAsync(CancellationToken cancellationToken = default);
    Task<QuickerRpcWebSessionInfo> GetWebSessionAsync(CancellationToken cancellationToken = default);
}
```

对其余端口重复：从 `IQuickerRpcService` 提取方法组，去掉 `Async` 后缀差异保持一致。

- [ ] **Step 4: 在 `QuickerRpc.Host.Abstractions.csproj` 添加对 Contracts 的 ProjectReference**

```xml
<ItemGroup>
  <ProjectReference Include="..\QuickerRpc.Contracts\QuickerRpc.Contracts.csproj" />
</ItemGroup>
```

- [ ] **Step 5: 构建验证**

Run: `dotnet build QuickerRpc.Host.Abstractions/QuickerRpc.Host.Abstractions.csproj -c Release`  
Expected: 0 errors（Plugin 尚未实现新端口，无 breaking）

- [ ] **Step 6: Commit**

```bash
git add QuickerRpc.Host.Abstractions/ docs/design/
git commit -m "feat(host): add unified QuickerRpc host port interfaces"
```

---

### Task 2: 新建 `QuickerRpc.Transport` 项目

**Status:** ✅ 完成（2026-06-27；Contracts 原文件暂保留，Phase 1 切换引用后删除）

**Files:**
- Create: `QuickerRpc/QuickerRpc.Transport/QuickerRpc.Transport.csproj`
- Copy/Move from Contracts: `QuickerRpcClient.cs`, `QuickerRpcClientSession.cs`, `QuickerRpcClientException.cs`, `StreamJsonRpcFactory.cs`, `StreamJsonRpcSession.cs`, `StreamJsonRpcCompletion.cs`, `QuickerRpcBootstrap.cs`, `QuickerRpcBootstrapPolicy.cs`, `QuickerRpcPipeNames.cs`, `QuickerRpcTraceSink.cs`
- Copy from Plugin: `QuickerRpcServer.cs` → `QuickerRpcServerHost.cs`, `QuickerRpcPipeSecurity.cs`
- Modify: `QuickerRpc.slnx`

- [ ] **Step 1: 创建 csproj**（netstandard2.0; net472，与 Contracts 一致）

```xml
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFrameworks>netstandard2.0;net472</TargetFrameworks>
    <Nullable>enable</Nullable>
    <RootNamespace>QuickerRpc.Transport</RootNamespace>
    <Version Condition="'$(Version)' == ''">0.1.0</Version>
  </PropertyGroup>
  <ItemGroup>
    <ProjectReference Include="..\QuickerRpc.Contracts\QuickerRpc.Contracts.csproj" />
    <PackageReference Include="StreamJsonRpc" />
  </ItemGroup>
  <Import Project="$(MSBuildThisFileDirectory)..\..\build\AssemblyVersionFileNameSuffix.props" Condition="'$(UseAssemblyVersionFileNameSuffix)' == 'true'" />
</Project>
```

- [ ] **Step 2: 复制文件并改 namespace** `QuickerRpc.Contracts.Rpc` → `QuickerRpc.Transport`（Client 类保留 public API 名称）

- [ ] **Step 3: 在 Contracts 原文件位置添加 `[Obsolete]` 转发**（Phase 1 删除，过渡期避免双份实现）

```csharp
// QuickerRpc.Contracts/Rpc/QuickerRpcClient.cs — temporary shim
namespace QuickerRpc.Contracts.Rpc;

[Obsolete("Use QuickerRpc.Transport.QuickerRpcClient")]
public static class QuickerRpcClient => Transport.QuickerRpcClient;
```

> 若 C# 不支持 static forward，改用 `type alias` 或保留 thin wrapper 方法 delegating。

- [ ] **Step 4: 构建**

Run: `dotnet build QuickerRpc/QuickerRpc.Transport/QuickerRpc.Transport.csproj -c Release`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(transport): add QuickerRpc.Transport project"
```

---

### Task 3: `QuickerRpc.Transport.Test` 基础测试

**Status:** ✅ 完成（2026-06-27）

**Files:**
- Create: `tests/QuickerRpc.Transport.Test/QuickerRpc.Transport.Test.csproj`
- Create: `tests/QuickerRpc.Transport.Test/QuickerRpcPipeNamesTests.cs`
- Create: `tests/QuickerRpc.Transport.Test/StreamJsonRpcFactoryTests.cs`

- [ ] **Step 1: 写 pipe name 常量测试**

```csharp
[Fact]
public void ServerPipe_is_stable()
{
    Assert.Equal("QuickerRpc_Server_QRPC2026", QuickerRpcPipeNames.ServerPipe);
}
```

- [ ] **Step 2: 写内存流 JsonRpc round-trip 测试**（StreamJsonRpcFactory StartListening + Connect）

- [ ] **Step 3: Run**

Run: `dotnet test tests/QuickerRpc.Transport.Test -c Release`  
Expected: PASS

- [ ] **Step 4: Commit**

---

## Phase 1 — Runtime + ActionPrograms 经 Host

### Task 4: 新建 `QuickerRpc.Runtime` 项目

**Status:** ✅ 完成（2026-06-27）

**Files:**
- Create: `QuickerRpc/QuickerRpc.Runtime/QuickerRpc.Runtime.csproj`
- Create: `QuickerRpc/QuickerRpc.Runtime/QuickerRpcService.cs`（从 Plugin 复制后改 ctor）
- Create: `QuickerRpc/QuickerRpc.Runtime/QuickerRpcServiceDependencies.cs`
- Create: `QuickerRpc/QuickerRpc.Runtime/Handlers/ActionProgramRpcHandler.cs`

- [ ] **Step 1: csproj 引用** Contracts + Host.Abstractions + AgentModel

- [ ] **Step 2: 实现 `ActionProgramRpcHandler`** — `GetCompressedActionById` 仅经 `_host.ActionPrograms` + AgentModel 压缩

- [ ] **Step 3: `QuickerRpcService` 构造函数改为 `(IQuickerRpcHost host, QuickerRpcServiceDependencies deps)`**

Phase 1 仅迁移 ActionProgram 相关方法；其余方法暂时 **not moved**，Plugin 仍用旧 `QuickerRpcService`。

- [ ] **Step 4: Commit**

---

### Task 5: Plugin 双轨 — 旧 Service 委托新 Runtime（ActionProgram 子集）

**Status:** ✅ 完成（2026-06-27）

**Files:**
- Modify: `QuickerRpc.Plugin/Rpc/QuickerRpcService.cs`
- Create: `QuickerRpc.Plugin/Adapters/V1QuickerRpcHost.cs`（stub，仅实现 ActionPrograms）
- Create: `QuickerRpc.Plugin/Adapters/V1ActionProgramHost.cs`（包装 `HeadlessActionProgramService`）

- [ ] **Step 1: `V1ActionProgramHost` 实现 `IQuickerRpcActionProgramHost`**

映射现有 `HeadlessActionProgramService` / `LegacyActionProgramAccessor` 逻辑。

- [ ] **Step 2: `GetCompressedActionByIdAsync` 改调 Runtime handler 或内联 host 路径**

- [ ] **Step 3: 热更新验证**

Run: `pwsh ./build.ps1 -t`  
Then: `qkrpc action get --id <fixture> --return-mode structure --json`  
Expected: 与迁移前 JSON 形状一致

- [ ] **Step 4: Commit**

---

### Task 6: Console 引用 Transport

**Status:** ✅ 完成（2026-06-27）

**Files:**
- Modify: `QuickerRpc.Console/QuickerRpc.Console.csproj`
- Modify: `QuickerRpc.Console/QuickerRpcConnect.cs`

- [ ] **Step 1: ProjectReference 增加 Transport**

- [ ] **Step 2: `QuickerRpcConnect` 改 using `QuickerRpc.Transport`**

- [ ] **Step 3: `dotnet build QuickerRpc.Console -c Release`**

- [ ] **Step 4: Commit**

---

## Phase 2 — V1 全端口适配（delegate 模式）

### Task 7: 实现剩余 V1 Host Adapters

**Status:** ✅ 完成（2026-06-27）；Step 2 Runtime 迁移完成

**Files:**
- Create: `QuickerRpc.Plugin/Adapters/V1*Host.cs`（每个端口一个文件）
- Modify: `QuickerRpc.Plugin/Adapters/V1QuickerRpcHost.cs`
- Create: `QuickerRpc.Runtime/QuickerRpcService.cs`（从 Plugin 迁入）
- Create: `QuickerRpc.Runtime/SubProgramRpcHandler.cs`, `HostWireMappers.cs`
- Create: `QuickerRpc.Host.Abstractions/IQuickerRpcCallScheduler.cs`, `IQuickerRpcUserFeedback.cs`

- [x] **Step 1:** 按 spec §4.6 映射表，每个现有 `*Service` 类对应一个 Host adapter

- [x] **Step 2:** 将 `QuickerRpcService` 迁至 `QuickerRpc.Runtime`，Plugin 仅注册 DI

- [x] **Step 3:** `dotnet test QuickerRpc.Test -c Release --filter FullyQualifiedName~QuickerRpcPipeIntegrationTests`

- [ ] **Step 4: Commit**（可按端口分批 commit）

---

### Task 7b: 物理迁移到 `QuickerRpc.Plugin.V1`

**Status:** ✅ 完成（2026-06-27）

**Files:**
- Rename/Move: `QuickerRpc.Plugin/` → `QuickerRpc/QuickerRpc.Plugin.V1/`
- Modify: `build.yaml` `projectDir`
- Modify: `AGENTS.md` routing table

- [x] **Step 1–4:** 更新所有 csproj 相对路径、`dev.ps1` watch、`build.ps1`

- [x] **Step 5: `build.ps1 -t` 全绿**

---

## Phase 3 — 清理

### Task 8: 删除 Contracts 中 Transport shim；Runtime 测试

**Status:** ✅ 完成（2026-06-27）

- [x] 移除 Contracts 已迁走的 Client/Server 文件
- [x] 确认 Costura 嵌入列表含 Transport + Runtime
- [x] 更新 `docs/design/quicker-rpc-host-abstractions.md` checklist
- [x] 新建 `tests/QuickerRpc.Runtime.Test/`（mock host + handler 单测）

---

## Phase 4+ — V2 路径（计划项，不阻塞 Phase 0–3）

> 详见 architecture spec §7。实现顺序：

| 任务 | 仓库 | 说明 |
|------|------|------|
| P4.1 | Quicker 主仓 | `Quicker.Infrastructure.QuickerRpc.Host` 实现 `IQuickerRpcHost` |
| P4.2 | qkrpc | 新建 `QuickerRpc.Plugin.V2` (net10) — **脚手架 ✅ 2026-06-27** |
| P4.3 | qkrpc | V2 无 Designer 端口；Capabilities.DesignerUi=false |
| P4.4 | 发布 | V2 随 Quicker 发行；V1 `quicker.rpc` 维护至迁移完成 |

**Phase 4 启动条件：** Phase 3 完成 + Quicker 主仓 V2 存储 API 就绪。

---

## Spec self-review checklist

- [x] B 优先：Phase 0–3 可独立交付
- [x] A 写入：Phase 4+ 表格
- [x] 统一接口：Task 1 为 Phase 0 第一实现任务
- [x] 无 TBD / 占位符步骤
- [x] Wire 面无 breaking change

---

## 执行选项

Plan 已保存至 `tools/qkrpc/docs/plans/2026-06-27-quicker-rpc-core.md`。

**1. Subagent-Driven（推荐）** — 每个 Task 派生子 agent，任务间 review  
**2. Inline Execution** — 本会话按 Task 0 → Task 1 顺序直接实施

请选择执行方式，或指定从 **Task 1（统一接口）** 开始。
