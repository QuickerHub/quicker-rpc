# {{#ref authoring.title}}
规定 **P1–P7 编辑链路**（总览见 **`overview`**）。{{#ref help.detail}}。
## P0 前置
- Quicker 已运行且已加载 QuickerRpc 插件。
{{#only-cli}}- **勿**把 `qkrpc ping` 当作编辑链路第一步；{{#ref connectivity.p0}}。
- 命令表：{{@ help}}；总览：{{@doc overview}}。
{{/only-cli}}
{{#only-agent}}- **勿**单独调用 ping；{{#ref connectivity.p0}}。
- 需要总览时再 `docs_get`（`topic: "overview"`）；UI 会渲染正文，回复中只写摘要。
{{/only-agent}}
## P1 定位动作
| 场景 | {{#ref table.invoke.header}} |
|------|------|
| 新建 | `{{@ action.create}}` → `actionId`、`editVersion` |
| 已有 | `{{@ action.list}}` 或 `{{@ action.search query=名}}` |
`scope`（list/search）：`global`/`common`/`default`/`chrome`/`taskbar`/`desktop`/`agent`/`qkrpc`、动作页 id 或名称。记下 **`actionId`**（GUID）。
## P2 读取
{{#only-cli}}
```powershell
{{@ action.get.structure}}   # 步骤树、stepId
{{@ action.get.full}}        # 非默认 inputParams
{{@ action.get.metadata}}     # 标题/icon/概要
```
{{/only-cli}}
{{#only-agent}}
```text
{{@ action.get.structure}}   # 步骤树、stepId
{{@ action.get.full}}        # 非默认 inputParams
{{@ action.get.metadata}}     # 标题/icon/概要
```
{{/only-agent}}
**`editVersion`** → {{#ref edit-version.next}}。冲突：重读或 `force`。字段说明：**`xaction-json`**。
## P3 元数据（可选）
改标题/说明/图标、不动程序体：
{{#only-cli}}
```powershell
{{@ action.set-metadata}}
```
{{/only-cli}}
{{#only-agent}}
```text
{{@ action.set-metadata}}
```
{{/only-agent}}
或与 P6 同 patch 写顶层 `icon`（值见 **`action-icons`**）。
## P4 实现选型
{{#only-cli}}
```powershell
{{@doc implementation-fallback}}
```
{{/only-cli}}
{{#only-agent}}
需要细节时再 `docs_get`（`topic: "implementation-fallback"`）。
{{/only-agent}}
计算/比较/赋值 → **`expressions`** 或 `sys:evalexpression`；UI/IO → P5 专用模块；无模块 → **`sys:csscript`**（C#），勿默认长 PowerShell（**`implementation-fallback`**）。
## P5 步骤 schema（每个新建/改参步骤）
```text
step-modules（速查）→ 无则 step-runner search（一次 OR|通配）→ step-runner get（必须）
```
{{#only-cli}}
```powershell
{{@doc step-modules}}
{{@ step-runner.search}}
{{@ step-runner.get}}
{{@ step-runner.get.control}}
```
{{/only-cli}}
{{#only-agent}}
```text
docs_get({ topic: "step-modules" })   # 速查表；按需
{{@ step-runner.search}}
{{@ step-runner.get}}
{{@ step-runner.get.control}}
```
{{/only-agent}}
`schema.Inputs[].Key` = **`inputParams` 键名**（以 step-runner get 为准）。有 **`ControlField`** 的步骤：search 可能返回 `controlFieldValue`；get 须传 {{#ref control-field.get}}，否则 `Inputs` 含全部模式参数易写错键。搜索语法：**`step-runner-search`**。
## P6 写入
{{#only-cli}}
```powershell
{{@ action.patch}}
```
{{/only-cli}}
{{#only-agent}}
```text
{{@ action.patch}}
```
{{/only-agent}}
顶层：`{ "steps": [...], "variables": [...] }`；可含 `title`/`description`/`icon`。`steps[]` 省略 `op` 即 **add**（单条追加）；`update`/`remove`/`move` 须写 `op`。整页写入（等同 `action replace`）须 `"replace": true` 且同时提供 `steps` 与 `variables`。完整语法、示例：**`patch-workflow`**。变量类型：**`variables`**。
首步示例（可省略 `op` 与 `index`/`after`/`before`，默认追加到末尾）：
```json
{ "steps": [{
  "stepRunnerKey": "sys:MsgBox",
  "inputParams": { "message": { "value": "hello" } }
}]}
```
调公共子程序：**`subprogram-workflow`**（`callIdentifier` → `sys:subprogram`）。
## P7 保存后
patch 成功 → 用响应 **`editVersion`**、**`addedSteps`**（新 `stepId`）、**`updatedSteps`**。版本冲突 → P2 重读 `editVersion` 后重试。参数/图标等问题见 **`errorMessage`**。
## 相关主题
`overview` · `patch-workflow` · `xaction-json` · `action-icons` · `step-modules` · `step-runner-search` · `implementation-fallback` · `expressions` · `variables` · `subprogram-workflow` · `cli-setup`
