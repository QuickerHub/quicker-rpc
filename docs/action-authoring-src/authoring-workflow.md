# {{#ref authoring.title}}

规定 **P1–P7**（总览 **`overview`**）。{{#only-agent}}磁盘编辑细节见 **`workspace-editing`**。{{/only-agent}}{{#only-cli}}内联 patch 见 **`patch-workflow`**；磁盘见 **`action-project-files`**。{{/only-cli}}

## P0 前置

- Quicker 已运行且已加载 QuickerRpc 插件。
{{#only-agent}}- 侧边栏 **工作目录**（qkrpc + workspace 的 cwd）。
- 勿单独 ping；页头为 RPC 状态。{{/only-agent}}
{{#only-cli}}- 勿把 `ping` 当编辑第一步；{{@ help}}、{{@doc overview}}。{{/only-cli}}

## P1 定位

| 场景 | {{#ref table.invoke.header}} |
|------|------|
| 新建 | {{@ action.create}} → `actionId`、`editVersion` |
| 已有 | {{@ action.list}} / {{@ action.search query=名}} |

记下 **`actionId`**（GUID）。`<qka id="…">` 标签直接用该 id。`scope` 等见 list/search 工具说明。

## P2 读取与工作区

{{#only-agent}}
1. {{@ action.get.structure}} — 步骤树摘要（`stepId` 仅压缩视图临时 id；改步骤直接编辑 `data.json` 的 `steps[]`）
2. 要改盘：{{@ action.get.full}} 或默认 get 会 **同步** `.quicker/actions/{actionId}/`，看响应 **`workspaceProject`**
3. 本地项目列表：**`workspace_action_projects`**

字段说明（`returnMode`、`compressed`）：**`qkrpc_action_get`** description。布局与工具表：**`workspace-editing`**。
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
step-modules（可选）→ step-runner search（一次 OR|通配）→ step-runner get（必须）
```

- `schema.Inputs[].Key` = **`inputParams` 键名**（以 get 为准）。
- 有 **ControlField**：search 可能带 `controlFieldValue`；get 须传 {{#ref control-field.get}}。
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

首步示例（写入 `data.json` 的 `steps[]`）：

```json
{
  "stepRunnerKey": "sys:MsgBox",
  "inputParams": { "message": { "value": "hello" } }
}
```

变量定义在 `variables[]`，见 **`variables`**。
{{/only-agent}}
{{#only-cli}}
```powershell
{{@ action.patch}}
```

顶层 `{ "steps": [...], "variables": [...] }`；省略 `op` 的单条 step 视为 **add**。整页 replace 见 **`patch-workflow`**。
{{/only-cli}}

## P7 保存后

{{#only-agent}}
以 **`qkrpc_action_patch`** 响应的 **`editVersion`**，以及 **`workspace_action_edit_data` / `write_data`** 响应里的 **`projectSummary`** 为准；勿仅为核对再 get 或全量 **`workspace_action_read_data`**。改完 disk 后 **直接 patch**，勿先单独校验。
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

`overview`{{#only-agent}} · `workspace-editing` · `variables`{{/only-agent}} · `implementation-fallback` · `expressions` · `subprogram-workflow` · `step-runner-search` · `step-modules`
