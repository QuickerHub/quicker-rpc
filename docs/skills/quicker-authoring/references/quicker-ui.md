# 打开 Quicker 界面

Quicker 设置分两类操作：

1. **Headless 读写**（改偏好、开关选项）— `settings search/get/set/apply`，**不打开** Quicker 设置窗口。
2. **打开 UI**（回收站、常规设置页、搜索框）— `settings open/pages`，仅当用户要看界面时用。

## Headless 修改设置（推荐）

流程：**search → get（可选）→ set 或 apply**。全程无需 UI。

### Key 格式

| scope | 格式 | 示例 |
|-------|------|------|
| `userSettings` | `userSettings:<Property>` | `userSettings:EnableCircleMenu` |
| `userPreference` | `userPreference:<Property>` | `userPreference:SettingsHotKeyGroupBy` |
| `globalSettings` | `globalSettings:<dictKey>` | 字符串键值字典 |
| `exeSettings` | `exeSettings:<exe>:<Property>` | `exeSettings:_global:ReturnToFirstPage` |

`search` 返回的 `items[].key` 可直接用于 get/set。`writable: false` 的项不要 set。

### 值类型

| type | 写入示例 |
|------|----------|
| Boolean | `true` / `false` / `1` / `0` |
| Int / Long / Float / Double | 数字字符串，如 `30` |
| Enum | 枚举名，如 `Left` |
| String | 任意文本 |

### 搜索设置项

`quicker_settings({ action: "search", query: "圆圈", limit: 5 })`

### 读取当前值

`quicker_settings({ action: "get", key: "userSettings:EnableCircleMenu" })`

### 修改单项（headless）

```text
quicker_settings({ action: "set", key: "userSettings:EnableCircleMenu", value: "true" })
quicker_settings({ action: "set", key: "userSettings:IsAutoMinimize", value: "false" })
```

### 批量修改（一键多项）

```text
quicker_settings({
  action: "apply",
  patch: {
    "userSettings:EnableCircleMenu": "false",
    "userSettings:IsAutoMinimize": "true"
  }
})
// 或 changes: [{ key: "...", value: "..." }, ...]
```

部分失败时 `apply` 仍返回每项 `results[]`；已成功的项已持久化。

---

## 打开 Quicker UI（非 headless）

仅当用户明确要看界面时使用 `open` / `pages`。

| 用途 | 工具 |
|------|------|
| 列出可打开页面 | `quicker_settings({ action: "pages" })` |
| 打开 UI | `quicker_settings({ action: "open", page: "recycle-bin" })` 等 |

### 先列出可打开的页面

`quicker_settings({ action: "pages" })`

### 打开动作回收站（设置页）

动作回收站属于 **设置页**，不是动作列表的 `scope`。因此 **不要** 用 `qkrpc action list --scope recycle` 或 `qkrpc_action({ action: "list", scope: "recycle" })` 之类去找回收站内容。

`quicker_settings({ action: "open", page: "recycle-bin" })`

### 打开常规/基本选项（设置页）

`quicker_settings({ action: "open", page: "AppSettings" })`

### 打开搜索窗口（不是设置页）

`quicker_settings({ action: "open", page: "search" })`

### 打开进程场景设置（Exe Settings）

需要额外传 `exe`（通常是 `_global` 或某个 exeFile）。

`quicker_settings({ action: "open", page: "exe-settings", exe: "_global" })`
