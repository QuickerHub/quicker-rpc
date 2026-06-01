# qkrpc 写动作流程（Agent 必读）
规定 **P1–P7 编辑链路**（总览见 **`overview`**）。命令细节：`qkrpc help --json`。
## P0 前置
```powershell
qkrpc ping --json
```
Quicker 已运行且已加载 QuickerRpc 插件。
## P1 定位动作
| 场景 | 命令 |
|------|------|
| 新建 | `qkrpc action create --title "动作名" [--icon fa:Light_*] --json` → `actionId`、`editVersion` |
| 已有 | `qkrpc action list --query "名" [--scope agent\|chrome\|global\|…] --json` 或 `action search` |
`--scope`：`global`/`common`/`default`/`chrome`/`taskbar`/`desktop`/`agent`/`qkrpc`、动作页 id 或名称。记下 **`actionId`**（GUID）。
## P2 读取
```powershell
qkrpc action get --id <guid> --return-mode structure --json   # 步骤树、stepId
qkrpc action get --id <guid> --return-mode full --json        # 非默认 inputParams
qkrpc action get --id <guid> --return-mode metadata --json  # 标题/icon/概要
```
**`editVersion`** → 下次 `--expected-edit-version`。冲突：重读或 `--force`。字段说明：**`xaction-json`**。
## P3 元数据（可选）
改标题/说明/图标、不动程序体：
```powershell
qkrpc action set-metadata --id <guid> --icon fa:Light_<Name> --expected-edit-version <N> --json
```
或与 P6 同 patch 写顶层 `icon`（值见 **`action-icons`**）。
## P4 实现选型
```powershell
qkrpc guide get --topic implementation-fallback --json
```
计算/比较/赋值 → **`expressions`** 或 `sys:evalexpression`；UI/IO → P5 专用模块；无模块 → **`sys:csscript`**（C#），勿默认长 PowerShell（**`implementation-fallback`**）。
## P5 步骤 schema（每个新建/改参步骤）
```text
step-modules（速查）→ 无则 step-runner search（一次 OR|通配）→ step-runner get（必须）
```
```powershell
qkrpc guide get --topic step-modules --json
qkrpc step-runner search --query "剪贴板|clipboard|sys:*clip*" --json
qkrpc step-runner get --key sys:MsgBox --json
qkrpc step-runner get --key sys:windowOperations --control-field move_ex --json
```
`schema.Inputs[].Key` = **`inputParams` 键名**（以 `step-runner get` 为准）。有 **`ControlField`** 的步骤：search 可能返回 `controlFieldValue`；get 须传 **`--control-field`**，否则 `Inputs` 含全部模式参数易写错键。搜索语法：**`step-runner-search`**。
## P6 写入
```powershell
qkrpc action patch --id <guid> --patch-file patch.json --expected-edit-version <N> --json
```
顶层：`{ "steps": [...], "variables": [...] }`；可含 `title`/`description`/`icon`。op：`add`/`update`/`remove`/`move`；`inputParams` 只写要改的键；**控制字段**即使等于 Default 也保留。完整语法、默认值省略、示例：**`patch-workflow`**。变量类型：**`variables`**。
首步示例：
```json
{ "steps": [{ "op": "add", "index": 0, "step": {
  "stepRunnerKey": "sys:MsgBox",
  "inputParams": { "message": { "value": "hello" } }
}}]}
```
调公共子程序：**`subprogram-workflow`**（`callIdentifier` → `sys:subprogram`）。
## P7 保存后
patch 成功 → 用响应 **`editVersion`**、**`addedSteps`**（新 `stepId`）、**`updatedSteps`**。版本冲突 → P2 重读 `editVersion` 后重试。参数/图标等问题见命令 **`errorMessage`**。
## 相关主题
`overview` · `patch-workflow` · `xaction-json` · `action-icons` · `step-modules` · `step-runner-search` · `implementation-fallback` · `expressions` · `variables` · `subprogram-workflow` · `cli-setup`
