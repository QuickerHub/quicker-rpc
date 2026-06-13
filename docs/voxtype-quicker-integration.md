# VoxType × Quicker 集成

> VoxType 是独立桌面听写客户端；Quicker 通过 **本地 HTTP API** 控制录音，通过 **VoxType.Plugin** 封装调用与安装包下载。

## 为什么用 HTTP，不用命名管道

| 维度 | HTTP `127.0.0.1:6020` | 命名管道（类似 qkrpc） |
|------|-------------------------|-------------------------|
| VoxType 形态 | 独立 Tauri 进程，自带托盘/热键/悬浮窗 | 需把服务嵌进 Quicker 进程或另起 pipe host |
| 现状 | **已实现**：`/health`、`/dictate/*`、`/status` | 需新协议、Rust 侧 pipe server、版本对齐 |
| Quicker 插件 | `HttpClient` 即可，与 qkrpc 插件模式一致 | 需 StreamJsonRpc 或自研帧协议 |
| 生命周期 | 插件 `EnsureRunning` 拉起 `VoxType.exe` | Quicker 退出时要约定谁保活 |
| 适用场景 | 命令式：开始/结束/切换/查状态 | 高频双向 RPC、大量结构化 API |

**结论**：VoxType 与 qkrpc 不同——不是「Quicker 内嵌 RPC 服务」，而是 **独立听写客户端 + 轻量控制面**。沿用已有 **HTTP** 成本最低；若以后要极低延迟批量调用，可在 HTTP 之上再加 pipe，但不作为 v1 前提。

qkrpc 用管道是因为 CLI/MCP/agent-gui 需要 **长连接、双向、大量 RPC**；VoxType 只需 **几条 POST/GET**，HTTP 足够。

---

## 组件分工

```text
Quicker 动作 / 面板按钮
    → VoxType.Plugin.dll（plugin/，net472）
        → HTTP 127.0.0.1:6020
            → VoxType.exe（Tauri，app/）
                → WebSocket 6016 → voxtype-runtime（ASR）
```

| 步骤 | 谁做 | 说明 |
|------|------|------|
| 下载 **插件 DLL** | Quicker `sys:dependencycheck` 或动作包 `{packagePath}` | 与 QuickerRpc.Plugin 相同打包方式 |
| 下载 **VoxType 安装包** | `Launcher.DownloadInstaller()` 或 `?download` | 落到 `Downloads/`，**用户手动运行 NSIS** |
| 安装 **VoxType 客户端** | 用户 | `%LOCALAPPDATA%\VoxType\VoxType.exe` |
| 日常听写 | 热键 F9 或 Quicker 调 API | 松手后自动输入焦点窗口 |

---

## 已创建的 Quicker 资源（本机 qkrpc）

| 资源 | ID / callIdentifier |
|------|---------------------|
| 公共子程序 **VoxType_Run** | `66690bf9-9ae5-496c-b472-bf4cc78ecb07` → `%%66690bf9-9ae5-496c-b472-bf4cc78ecb07` |
| 动作 **VoxType 语音输入** | `c1c5a328-b827-42eb-9a7d-9f43593e22fa` |

磁盘模板（可重新 apply）：

- `scripts/voxtype-quicker/voxtype-run-subprogram.patch.json`
- `scripts/voxtype-quicker/voxtype-voice-action.patch.json`
- `scripts/setup-voxtype-quicker-action.ps1`

### VoxType_Run 流程

1. **本地扫描** `_packages/voxtype.plugin/*/VoxType.Plugin*.dll`（开发回退）
2. 若无本地 DLL → **依赖下载_混合模式_v2**（包名 `voxtype.plugin`，zip `VoxType.Plugin`）
3. **QExpr** 注册 `load {dll_path}` + `type VoxType.Plugin.Launcher, {dll_path}`
4. 执行 `Launcher.StartFromQuickerInParam({command}, _context)`

子程序输入 **`command`**：`start` | `stop` | `toggle` | `ensure` | `status` | `download`

### 动作「VoxType 语音输入」

1. 解析 `quicker_in_param`（或变量 `command`，默认 `toggle`）
2. 调用 **VoxType_Run**
3. `download` 成功后 **自动启动安装包**（插件 `Process.Start` + 动作 `sys:run` 双保险）
4. **未安装客户端**时，点动作（`toggle`/`start`/`stop`）会自动改为 `download` 并打开安装程序

```powershell
qkrpc action run --id c1c5a328-b827-42eb-9a7d-9f43593e22fa --param toggle --wait
qkrpc action run --id c1c5a328-b827-42eb-9a7d-9f43593e22fa --param download --wait
# URI: quicker:runaction:c1c5a328-b827-42eb-9a7d-9f43593e22fa?start
```

开发环境 seed 本地插件 DLL：

```powershell
pwsh ./scripts/setup-voxtype-quicker-action.ps1 -SeedLocalPlugin
```

---

## HTTP API（VoxType 客户端）

基址：`http://127.0.0.1:6020`（端口见 `%LOCALAPPDATA%\VoxType\settings.json` 的 `apiPort`）

| 方法 | 路径 | 作用 |
|------|------|------|
| GET | `/health` | `{ "ok": true, "service": "voxtype" }` |
| GET | `/status` | 运行时/听写阶段/模型等 |
| POST | `/dictate/start` | 开始录音（不自动停） |
| POST | `/dictate/stop` | 结束并输入；响应 `{ "ok": true, "text": "…" }` |
| POST | `/dictate/toggle` |  idle↔recording 切换 |

实现：`voxtype/app/src-tauri/src/http_api.rs`

---

## 插件入口（`quicker_in_param`）

与 QuickerRpc 相同，子程序注册：

```text
load {packagePath}/VoxType.Plugin.{version}.dll
type VoxType.Plugin.Launcher, VoxType.Plugin
```

### 调用方式

| `quicker_in_param` | 行为 |
|--------------------|------|
| （空） / `toggle` | 切换听写 |
| `start` / `dictate-start` | 仅开始录音 |
| `stop` / `dictate-stop` | 结束并输入；写变量 **`voxtype_text`** |
| `ensure` / `launch` | 仅确保 VoxType.exe 已启动 |
| `status` | GET `/status` → 变量 **`voxtype_status`**（JSON 字符串） |
| `download` / `install` | 下载 NSIS → 变量 **`voxtype_installer_path`** |

URI 示例：

```text
quicker:runaction:{动作ID}?start
quicker:runaction:{动作ID}?stop
quicker:runaction:{动作ID}?download
```

C# 模块：

```csharp
VoxType.Plugin.Launcher.Start(context);
VoxType.Plugin.Launcher.StartFromQuickerInParam("start", context);
VoxType.Plugin.Launcher.StartDictation(context);  // 按住
VoxType.Plugin.Launcher.StopDictation(context);   // 松开
VoxType.Plugin.Launcher.DownloadInstaller(context);
```

失败时写入 **`voxtype_error`**。

---

## 推荐 Quicker 动作流程

### 首次使用（安装向导）

1. **检查客户端**：若未安装 → `DownloadInstaller` → 提示用户运行 `voxtype_installer_path`
2. **用户手动安装** NSIS（需 UAC）
3. **首次打开 VoxType**：设置里下载 ASR 模型（体积大，不随插件下发）
4. 绑定面板按钮：`Start()` 或按住/松开两个子程序

### 按住说话（与 F9 一致）

- 按键按下：`StartDictation()` → `POST /dictate/start`
- 按键松开：`StopDictation()` → `POST /dictate/stop`（含 300ms 尾音缓冲）

### 一键切换

- 单击：`Start()` → `POST /dictate/toggle`

---

## 与 QuickerAgent 语音插件的关系

| | QuickerAgent `voice-asr` | VoxType |
|--|--------------------------|---------|
| 场景 | Composer 内麦克风 | **全局听写进焦点窗口** |
| 协议 | WebSocket 601x（voice v1） | 客户端 HTTP 6020 + 内部 WS 6016 |
| 安装 | agent-gui 一键装 runtime+模型 | NSIS 装客户端；模型在 VoxType 设置页 |

两者可并存：Agent 写 Composer，VoxType 写任意窗口。

---

## 仓库与发布

| 仓库 | 路径 |
|------|------|
| [voxtype](https://github.com/ceastld/voxtype) | `plugin/`、`app/`、`runtime/` |
| quicker-rpc | 本文档；可选同步 `publish/voxtype-plugin-channel.json` |

插件频道 JSON：`voxtype/plugin/voxtype-plugin-channel.json`（安装包 URL + sha256）。

构建插件：

```powershell
cd voxtype/plugin
dotnet build -c Release
# 输出 bin/Release/net472/VoxType.Plugin.dll + voxtype-plugin-channel.json
```

---

## 环境变量（可选）

| 变量 | 含义 |
|------|------|
| `VOXTYPE_CLIENT_EXE` | 覆盖 VoxType.exe 路径 |
| `VOXTYPE_API_PORT` | 覆盖 HTTP 端口（默认 6020） |

---

## 后续可选增强

- [ ] HTTP `POST /dictate/stop?type=false` — 只返回文本不模拟键盘（供 Quicker 变量链路）
- [ ] 安装完成后 Quicker 动作写注册表/快捷方式
- [ ] 与 qkrpc 共享「插件频道」发布脚本（Bitiful 镜像）
- [ ] 仅在确有性能瓶颈时再评估 localhost pipe
