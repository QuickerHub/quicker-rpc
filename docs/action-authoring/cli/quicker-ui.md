# 打开 Quicker 界面

当用户说“打开动作回收站 / 常规设置 / 搜索窗口 / 设置页面”时，优先打开对应 Quicker UI；修改偏好时用 settings 搜索/读写。

## 先列出可打开的页面

```powershell
qkrpc settings pages --json
```

输出里每个条目都可能包含：

- `target`: 可用于打开的 target（包含内置别名与 `SettingPageId`）
- `pageId`: 若是设置页，表示 Quicker 的 `SettingPageId`（如 `ActionRecycleBinSettingPage`）
- `aliases`: 常用别名（包含中文）

## 打开动作回收站（设置页）

动作回收站属于 **设置页**，不是动作列表的 `scope`。因此 **不要** 用 `qkrpc action list --scope recycle` 或 `qkrpc_action_list({ scope: "recycle" })` 之类去找回收站内容。

```powershell
qkrpc settings open --page recycle-bin --json
# 或（等价）
qkrpc settings open --page 动作回收站 --json
qkrpc settings open --page ActionRecycleBinSettingPage --json
```

## 打开常规/基本选项（设置页）

```powershell
qkrpc settings open --page AppSettings --json
# 或（等价）
qkrpc settings open --page general --json
qkrpc settings open --page 常规设置 --json
```

## 打开搜索窗口（不是设置页）

```powershell
qkrpc settings open --page search --json
```

## 打开进程场景设置（Exe Settings）

需要额外传 `exe`（通常是 `_global` 或某个 exeFile）。

```powershell
qkrpc settings open --page exe-settings --exe _global --json
```
