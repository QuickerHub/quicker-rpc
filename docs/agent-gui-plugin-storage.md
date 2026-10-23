# QuickerAgent 用户数据与安装资源

> 当前技术参考。产品能力见 [产品功能地图](product/README.md)。

QuickerAgent 把安装文件、用户数据和 Agent 工作区分开，避免升级覆盖数据，也避免 Agent 普通文件工具误改安装资源。

## 目录边界

| 类型 | Windows 默认路径 | 内容 |
|---|---|---|
| 安装目录 | `%LOCALAPPDATA%/QuickerAgent/` | exe、Electron/Next 资源、随包只读资源 |
| 用户数据 | `%APPDATA%/QuickerAgent/` | `agent.db`、缓存、模型配置、usage 等 |
| Agent 工作区 | `Documents/QuickerAgent/workspace/` | 用户项目和默认 cwd |
| 旧 WebView 数据 | `%LOCALAPPDATA%/ai.quicker.agent/` 等 | 只用于兼容扫描/迁移 |

路径事实源：`agent-gui/lib/quicker-agent-paths.ts` 和 `quicker-agent-persisted-data.ts`。不要在新模块中手写这些路径。

## 用户数据与配置

- 聊天历史和大部分服务端配置进入 `%APPDATA%/QuickerAgent/agent.db`。
- 结构化配置优先使用 `app_kv`；旧 JSON 文件只作为迁移来源。
- LLM secret 只能位于用户数据目录或数据库中的受控存储，不进入 Git、安装资源或日志。
- UI layout/local preference 可以继续使用 localStorage，但不能作为跨壳的业务事实源。
- 旧版本安装目录内的 `.local/`、`local/` 等数据按既有迁移流程合并到用户数据目录；已有目标文件优先，迁移不得覆盖新数据。

语音输入、语音聊天与剪贴板历史及其插件安装、模型下载、运行时管理已移除。已有用户目录中的历史文件不会因移除功能而自动删除。

聊天数据库详见 [agent-gui-chat-storage.md](agent-gui-chat-storage.md)。

## 随包资源

Electron 和 legacy Tauri 共用 `agent-gui/scripts/desktop-bundle-prepare.mjs`，暂存 Next standalone、portable Node、qkrpc、ripgrep 及现有浏览器/终端资源。`verify-desktop-bundle.mjs` 校验必要文件和 SQLite ABI；不再暂存语音或剪贴板插件 metadata、registry 或模型。

## 修改入口

| 想改 | 先看 |
|---|---|
| 路径 | `quicker-agent-paths.ts`、`quicker-agent-persisted-data.ts` 及测试 |
| 数据迁移 | persisted-data migration、legacy DB/localStorage migration |
| 打包资源 | `agent-gui/scripts/desktop-bundle-prepare.mjs` 与 bundle verify |

## 不变量

1. 用户数据不写入 NSIS 安装树。
2. 工作区不包含安装资源。
3. 迁移采用合并且不覆盖已存在目标。
4. 修改资源打包时单独核对 staged resources 与最终体积；不要用完整开发目录作为打包源。
