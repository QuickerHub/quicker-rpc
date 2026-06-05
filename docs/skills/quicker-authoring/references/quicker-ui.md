# 打开 Quicker 界面

当用户说“打开动作回收站 / 常规设置 / 搜索窗口 / 设置页面”时，优先打开对应 Quicker UI；修改偏好时用 settings 搜索/读写。

**Agent 专用工具**（经 `qkrpc serve`，不依赖 shell 里的 `qkrpc` 命令）：

| 用途 | 工具 |
|------|------|
| 列出可打开页面 | `qkrpc_settings_pages()` |
| 打开 UI | `qkrpc_settings_open({ page: "recycle-bin" })` 等 |
| 搜索设置项 | `qkrpc_settings_search({ query: "圆圈" })` |
| 读/写设置 | `qkrpc_settings_get` / `qkrpc_settings_set` |

## 先列出可打开的页面

`qkrpc_settings_pages()`

输出里每个条目都可能包含：

- `target`: 可用于打开的 target（包含内置别名与 `SettingPageId`）
- `pageId`: 若是设置页，表示 Quicker 的 `SettingPageId`（如 `ActionRecycleBinSettingPage`）
- `aliases`: 常用别名（包含中文）

## 打开动作回收站（设置页）

动作回收站属于 **设置页**，不是动作列表的 `scope`。因此 **不要** 用 `qkrpc action list --scope recycle` 或 `qkrpc_action_list({ scope: "recycle" })` 之类去找回收站内容。

```text
qkrpc_settings_open({ page: "recycle-bin" })
qkrpc_settings_open({ page: "动作回收站" })
qkrpc_settings_open({ page: "ActionRecycleBinSettingPage" })
```

## 打开常规/基本选项（设置页）

```text
qkrpc_settings_open({ page: "AppSettings" })
qkrpc_settings_open({ page: "general" })
qkrpc_settings_open({ page: "常规设置" })
```

## 打开搜索窗口（不是设置页）

`qkrpc_settings_open({ page: "search" })`

## 打开进程场景设置（Exe Settings）

需要额外传 `exe`（通常是 `_global` 或某个 exeFile）。

`qkrpc_settings_open({ page: "exe-settings", exe: "_global" })`
