# QuickerAgent 剪贴板历史插件

> **状态：已暂时废弃（2026-06）**  
> `CLIPBOARD_HISTORY_ENABLED = false`（`agent-gui/lib/clipboard-history/clipboard-history-config.ts` 与 `clipboard_history_plugin.rs`）。  
> 应用启动时会停止 `quicker-clipboard-history` 子进程，避免占用系统剪贴板。后续再启用时改回 `true` 并重启应用。

参考 [CeaQuickerTools](https://github.com/) 的 ClipHost 能力，在 QuickerAgent 内提供**系统剪贴板历史**（独立子进程 + Web UI）。

## 架构

```text
QuickerAgent (Tauri)
  └── clipboard-history-runtime (子进程)
        ├── Windows 剪贴板轮询采集
        ├── SQLite 持久化 (%LOCALAPPDATA%/QuickerAgent/plugins/clipboard-history/data)
        └── HTTP API :6020 + SSE clipChanged
```

前端：

- 完整面板：`/clipboard`
- 设置：应用设置 → **剪贴板** 标签

## 数据模型（简化版）

| 字段 | 说明 |
|------|------|
| `id` | nanoid |
| `kind` | `text` / `html` / `image` / `files` |
| `title` / `preview` | 列表展示 |
| `content_text` / `content_path` / `file_paths` | 详情与复制 |
| `source_process` | 采集时前台进程名 |
| `is_pinned` / `usage_count` | 置顶与使用统计 |
| `content_hash` | 去重 |

## HTTP API（`clipboard-history-runtime`）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/health` | 健康检查 |
| POST | `/api/clipboard/items/search` | 搜索/分页 |
| GET | `/api/clipboard/items/{id}` | 列表项 |
| GET | `/api/clipboard/items/{id}/detail` | 详情 |
| POST | `/api/clipboard/items/{id}/copy` | 写回系统剪贴板 |
| PATCH | `/api/clipboard/items/{id}` | 置顶/改标题 |
| DELETE | `/api/clipboard/items/{id}` | 删除 |
| DELETE | `/api/clipboard/items?keepPinned=true` | 清空 |
| GET | `/api/clipboard/items/{id}/image` | 图片流 |
| GET | `/api/clipboard/source-processes` | 来源进程列表 |
| GET | `/api/clipboard/events` | SSE 变更通知 |

## 开发

```powershell
# 1. 构建 runtime
cd clipboard-history-runtime
cargo build

# 2. 单独启动（浏览器 dev 无 Tauri 时）
node agent-gui/scripts/clipboard-history-dev-server.mjs

# 3. Tauri dev 自动启动（推荐）
$env:AGENT_GUI_CLIPBOARD_RUNTIME = "1"
pnpm tauri dev
```

环境变量：

- `QUICKER_CLIPBOARD_PORT` / `AGENT_GUI_CLIPBOARD_PORT` — HTTP 端口（默认 `6020`）
- `AGENT_GUI_CLIPBOARD_RUNTIME=1` — 开发时随应用自动启动 runtime（生产默认关闭，可在设置中开启「随应用自动启动」）

## 与 CeaQuickerTools 的差异

- **单进程 runtime**（无 Quicker 插件 verb 转发）
- **SQLite + 简化 DTO**（无 DynamicData/FreeSql/收藏夹全量）
- **粘贴**：当前为「复制到剪贴板」；模拟 Ctrl+V 与窗口管理可后续在 Tauri 层扩展
- **全局热键 / Win+V**：未实现（可参考 ClipHost 二期）

## 关键文件

| 模块 | 路径 |
|------|------|
| Runtime | `clipboard-history-runtime/` |
| Tauri Host | `agent-gui/src-tauri/src/clipboard_history_plugin.rs` |
| 前端客户端 | `agent-gui/lib/clipboard-history/` |
| UI | `agent-gui/components/clipboard/`, `agent-gui/app/clipboard/` |
