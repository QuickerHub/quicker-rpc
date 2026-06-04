# {{#topic-title}}

规定 **P1–P7**（总览 **`overview`**）。{{#only-agent}}磁盘编辑细节见 **`workspace-editing`**。{{/only-agent}}{{#only-cli}}内联 patch 见 **`patch-workflow`**；磁盘见 **`action-project-files`**。{{/only-cli}}

## P0 前置

- Quicker 已运行且已加载 QuickerRpc 插件。
{{#only-agent}}- 侧边栏 **工作目录**（qkrpc + workspace 的 cwd）。
- 勿单独 ping；页头为 RPC 状态。{{/only-agent}}
{{#only-cli}}- 勿把 `ping` 当编辑第一步；{{@ help}}、{{@doc overview}}。{{/only-cli}}

## P1 定位

| 场景 | {{#ref table.invoke.header}} |
|------|------|
| 新建 | {{@ action.create}} → `actionId`、`editVersion`、**`workspaceProject`**（仅落盘 `info.json`） |
| 已有 | {{@ action.list}} / {{@ action.search query=名}} |

记下 **`actionId`**（GUID）。`<qka id="…">` 标签直接用该 id。`scope` 等见 list/search 工具说明。

{{#only-agent}}
**新建后勿再 `qkrpc_action_get`**：用 create 返回的 id/version，直接 **`workspace_action_*_data`** 写 `data.json`，再 **`qkrpc_action_patch`**。
{{/only-agent}}

## P2 读取与工作区

{{#only-agent}}
1. **已有动作**且程序体非空：`qkrpc_action_get` — 响应含步骤树摘要；**自动 extract** 到 `.quicker/actions/{actionId}/`（见 **`workspaceProject`**）
2. **空动作**（0 步 0 变量）：get **不**写入 `data.json`（`workspaceSyncSkipped`）；先在工作区写好内容或仅在 Quicker 内编辑后再 get
3. 本地项目列表：**`workspace_action_projects`**

`returnMode` 等见 **`qkrpc_action_get`** description；布局与工具表：**`workspace-editing`**。
{{/only-agent}}
{{#only-cli}}
```powershell
{{@ action.get.structure}}
{{@ action.get.full}}
{{@ action.get.metadata}}
```
`editVersion` → 下次 {{#ref edit-version.field}}。磁盘：**`action-project-files`**。
{{/only-cli}}

## P3 元数据（可选）

只改标题/说明/图标、不动程序体：

{{#only-cli}}```powershell
{{@ action.set-metadata}}
```{{/only-cli}}
{{#only-agent}}```text
{{@ action.set-metadata}}
```{{/only-agent}}

图标：`qkrpc_fa_search`；`fa:Light_Name` 或 `http(s)` URL（见 set-metadata 工具说明）。

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
- 有 **ControlField**：非空 search 的命中项**必定**带 `items[].controlField`（无控制项则省略）；get 传 **`controlField.value`**（{{#ref control-field.get}}）。未传 control 时，`controlField.selection[]` 每项含 **`visibleInputKeys`** / **`visibleOutputKeys`**（已解析 ValidFor/可见性，UI/Agent 勿再猜）。
- 语法：**`step-runner-search`**。

{{#only-cli}}
```powershell
{{@ step-runner.search}}
{{@ step-runner.get}}
```
{{/only-cli}}
{{#only-agent}}
```text
{{@ step-runner.search}}
{{@ step-runner.get}}
```
{{/only-agent}}

## P6 写入

{{#only-agent}}
按 **`workspace-editing`** 改 `data.json` / `files/`，再：

```text
{{@ action.patch}}
```

（仅 `{ id }`，无 patch 对象。）调公共子程序步骤：**`subprogram-workflow`**。

写入 `data.json` 的 `steps[]` 示例见 **`action-steps`**；变量声明见 **`action-variables`**。
{{/only-agent}}
{{#only-cli}}
```powershell
{{@ action.patch}}
```

顶层 `{ "steps": [...], "variables": [...] }`；省略 `op` 的单条 step 视为 **add**。整页 replace 见 **`patch-workflow`**。
{{/only-cli}}

## P7 保存后

{{#only-agent}}
以 **`qkrpc_action_patch`** / **`workspace_program_patch`** 响应的 **`editVersion`**，以及 **`workspace_action_edit_data` / `write_data`** 响应里的 **`projectSummary`** 为准；勿仅为核对再 get 或全量 **`workspace_action_read_data`**。改完 disk 后 **直接 patch**，勿先单独校验。

**回复用户（动作 create/patch 成功后）**：正文先写简短结论（改了什么、`editVersion`、下一步）；**所有** `<qka-link id="{actionId}" op="run|edit|float|workspace">` 放在消息**最末一行**（UI 在文末渲染横向按钮条）。勿在列表或段落中间插入 qka-link；勿重复贴动作表。示例见系统指令中的 qka-link 说明。
{{/only-agent}}
{{#only-cli}}
以 patch 响应的 **`editVersion`**、**`addedSteps`** 为准（增量 patch 时）；extract/apply 路径以 apply 响应为准。勿仅为核对再 get。
{{/only-cli}}

验证优先：

```text
edit_data / write_data 响应中的 projectSummary
  或 workspace_action_read_data({ id, mode: "summary" })   # 仅不保存时诊断
```

需要精确 JSON 片段时再 **`read_data` + `offset`/`limit`**（改前读取或定位锚点）。

## 相关

`overview`{{#only-agent}} · `workspace-editing` · `action-variables` · `action-steps`{{/only-agent}} · `implementation-fallback` · `expressions` · `subprogram-workflow` · `step-runner-search`
