# QuickerAgent 用户数据、插件与资源

> 状态：当前技术参考。产品入口和插件可用状态见 [EXT](product/README.md#p-ext)。

QuickerAgent 把安装文件、用户数据和 Agent 工作区分开，避免升级覆盖数据，也避免 Agent 普通文件工具误改插件资源。

## 目录边界

| 类型 | Windows 默认路径 | 内容 |
|---|---|---|
| 安装目录 | `%LOCALAPPDATA%/QuickerAgent/` | exe、Electron/Next 资源、随包只读资源 |
| 用户数据 | `%APPDATA%/QuickerAgent/` | `agent.db`、插件、缓存、模型、usage 等 |
| Agent 工作区 | `Documents/QuickerAgent/workspace/` | 用户项目和默认 cwd |
| 旧 WebView 数据 | `%LOCALAPPDATA%/ai.quicker.agent/` 等 | 只用于兼容扫描/迁移 |
| 安装临时目录 | `%TEMP%/quicker-voice-asr-<pid>/` | 下载和解压缓冲，完成后删除 |

路径事实源：`agent-gui/lib/quicker-agent-paths.ts` 和 `quicker-agent-persisted-data.ts`。不要在新模块中手写这些路径。

## 用户数据结构

```text
%APPDATA%/QuickerAgent/
  agent.db                 # SQLite：聊天 + app_kv
  plugins/
    voice-asr/
      manifest.json
      settings.json
      runtime/
      models/
  cache/
  llm-usage/
```

旧版本安装目录内的 `.local/`、`local/`、plugins/cache 等数据由 persisted-data migration 合并到用户数据目录；已有目标文件优先，迁移不得覆盖新数据。

## 插件状态

| pluginId | 状态 | 说明 |
|---|---|---|
| `voice-asr` | 可安装、可用 | 本地 runtime + SenseVoice 模型，音频和识别留在本机 |
| `clipboard-history` | 已禁用 | runtime 代码保留，但 `CLIPBOARD_HISTORY_ENABLED=false`，不展示为可用产品能力 |

产品 catalog 事实源为 `agent-gui/lib/plugin-catalog.ts`。只有 `availability === "available"` 的插件可以提供安装/设置动作。

## voice-asr

```text
plugins/voice-asr/
  manifest.json
  settings.json
  runtime/
    quicker-voice-runtime.exe
  models/sensevoice/
    model.int8.onnx
    tokens.txt
```

- Runtime 子项目：`voice-asr-runtime/`。
- Host 安装/启动：`agent-gui/lib/voice-input/`、`plugin-runtime/` 及 Electron bridge。
- 频道与模型指纹：`agent-gui` 随包资源和发布同步脚本。
- 协议：[voice-input-plugin.md](voice-input-plugin.md)。

安装或更新可以访问远程 channel、GitHub/对象存储和模型源；识别时只读本地 runtime 与模型。

## 数据库与配置

- 聊天历史和大部分服务端配置进入 `%APPDATA%/QuickerAgent/agent.db`。
- 结构化配置优先使用 `app_kv`；旧 JSON 文件只作为迁移来源。
- LLM secret 只能位于用户数据目录或数据库中的受控存储，不进入 Git、安装资源或日志。
- UI layout/local preference 可以继续使用 localStorage，但不能作为跨壳的业务事实源。

聊天数据库详见 [agent-gui-chat-storage.md](agent-gui-chat-storage.md)。

## 修改入口

| 想改 | 先看 |
|---|---|
| 路径 | `quicker-agent-paths.ts`、`quicker-agent-persisted-data.ts` 及测试 |
| plugin catalog | `plugin-catalog.ts`，同步产品功能目录 |
| 安装/升级 | `voice-input/`、Electron commands、channel 校验脚本 |
| 数据迁移 | persisted-data migration、legacy DB/localStorage migration |
| 打包资源 | `agent-gui/scripts/desktop-bundle-prepare.mjs` 与 bundle verify |

## 不变量

1. 用户数据不写入 NSIS 安装树。
2. 工作区不包含插件 runtime 或模型。
3. 迁移采用合并且不覆盖已存在目标。
4. disabled 插件不允许被 UI 或发布说明描述为可用。
5. 远程下载必须校验版本/指纹，临时目录用后清理。
6. 修改资源打包时单独核对 staged resources 与最终体积；不要用完整开发目录作为打包输入。
