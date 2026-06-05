# 写动作流程

规定 **P1–P7**（总览 **`overview`**）。内联 patch 见 **`patch-workflow`**；磁盘见 **`action-project-files`**。

## P0 前置

- Quicker 已运行且已加载 QuickerRpc 插件。

- 勿把 `ping` 当编辑第一步；qkrpc help --json、qkrpc guide get --topic overview --json。

## P1 定位

| 场景 | 命令 |
|------|------|
| 新建 | qkrpc action create --title "动作名" [--icon fa:Light_*] --json → `actionId`、`editVersion`、**`workspaceProject`**（仅落盘 `info.json`） |
| 已有 | qkrpc action list --query "名" [--scope agent] --json / qkrpc action search --query "名" [--scope agent] --json |

记下 **`actionId`**（GUID）。`<qka id="…">` 标签直接用该 id。`scope` 等见 list/search 工具说明。

## P2 读取与工作区

```powershell
qkrpc action get --id <guid> --return-mode structure --json
qkrpc action get --id <guid> --return-mode full --json
qkrpc action get --id <guid> --return-mode metadata --json
```
`editVersion` → 下次 `--expected-edit-version`。磁盘：**`action-project-files`**。

## P3 元数据（可选）

只改标题/说明/图标（及扩展字段如右键菜单）、不动程序体：

```powershell
qkrpc action set-metadata --id <guid> --icon fa:Light_<Name> --expected-edit-version <N> --json
```

图标：`qkrpc_fa_search`；`fa:Light_Name` 或 `http(s)` URL（见 set-metadata 工具说明）。

**右键菜单**：`ContextMenuData` 为 CommonOperationItem 多行文本；选中项数据 → `{quicker_in_param}`。语法见 **`common-operation-item`**。

## P4 实现选型

读 **`expressions`** 与 **`implementation-fallback`**。要点：

1. **数据逻辑默认表达式**：Split/LINQ/JSON/多变量赋值 → **`$=` 或 `sys:evalexpression`**（勿先写 `sys:csscript` 整段 `Exec`）。
2. **UI/IO** → P5 专用模块（剪贴板、HTTP、文件等）。
3. **表达式仍不够** → **`sys:csscript`**；极短系统命令 → `sys:runScript`。

## P5 步骤 schema（每个新/改步骤）

```text
step-runner search（一次 OR|通配）→ step-runner get（必须；见 step-runner-get）
```

- 步骤 JSON 形状（`inputParams` / `outputParams` / `ifSteps`）：**`action-steps`**。
- **长 `inputParams.value`**（超过 4 行脚本/字符串）：先 **`files/`** + `"file": "files/…"`，勿整段写入 `data.json`（**`workspace-editing`**）。
- 有 **ControlField**：非空 search 的命中项**必定**带 `items[].controlField`（无控制项则省略）；get 传 **`controlField.value`**（**`--control-field <value>`**）。未传 control 时，`controlField.selection[]` 每项含 **`visibleInputKeys`** / **`visibleOutputKeys`**（已解析 ValidFor/可见性，UI/Agent 勿再猜）。
- 语法：**`step-runner-search`**。

```powershell
qkrpc step-runner search --query "剪贴板|clipboard|sys:*clip*" --json
qkrpc step-runner get --key sys:MsgBox --json
```

## P6 写入

```powershell
qkrpc action patch --id <guid> --patch-file patch.json --expected-edit-version <N> --json
```

顶层 `{ "steps": [...], "variables": [...] }`；省略 `op` 的单条 step 视为 **add**。整页 replace 见 **`patch-workflow`**。

## P7 保存后

以 patch 响应的 **`editVersion`**、**`addedSteps`** 为准（增量 patch 时）；extract/apply 路径以 apply 响应为准。勿仅为核对再 get。

验证优先：

```text
edit_data / write_data 响应中的 projectSummary
  或 workspace_action_read_data({ id, mode: "summary" })   # 仅不保存时诊断
```

需要精确 JSON 片段时再 **`read_data` + `offset`/`limit`**（改前读取或定位锚点）。

## 相关

`overview` · `implementation-fallback` · `expressions` · `subprogram-workflow` · `step-runner-search`
