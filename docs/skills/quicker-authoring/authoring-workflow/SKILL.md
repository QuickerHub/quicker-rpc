---
name: authoring-workflow
description: "Quicker 动作编辑 P1–P7 逐步流程（定位、读取、patch 保存）。Use when creating actions, patching steps, or before the first action edit in a session."
allowed-tools: qkrpc_action_create qkrpc_action_list qkrpc_action_search qkrpc_action_get qkrpc_action_patch qkrpc_step_runner_get
metadata:
  phase: "P1-P7"
---

# 写动作流程（Agent 必读）
规定 **P1–P7 编辑链路**（总览见 **`overview`**）。工具说明见系统提示与 **`docs_index`**。
## P0 前置
- Quicker 已运行且已加载 QuickerRpc 插件。

- **勿**单独调用 ping；页头绿点表示 RPC 状态；qkrpc 类工具失败时检查 Quicker + 插件或 `qkrpc serve`。
- 需要总览时再 `docs_get`（`topic: "overview"`）；UI 会渲染正文，回复中只写摘要。

## P1 定位动作
| 场景 | 工具 |
|------|------|
| 新建 | `qkrpc_action_create({ title: "动作名", icon?: "fa:Light_*" })` → `actionId`、`editVersion` |
| 已有 | `qkrpc_action_list({ query: "名", scope?: "agent" })` 或 `qkrpc_action_search({ query: "名", scope?: "agent" })` |
`scope`（list/search）：`global`/`common`/`default`/`chrome`/`taskbar`/`desktop`/`agent`/`qkrpc`、动作页 id 或名称。记下 **`actionId`**（GUID）。
## P2 读取

```text
qkrpc_action_get({ id: "<guid>", returnMode: "structure" })   # 步骤树、stepId
qkrpc_action_get({ id: "<guid>", returnMode: "full" })        # 非默认 inputParams
qkrpc_action_get({ id: "<guid>", returnMode: "metadata" })     # 标题/icon/概要
```

**`editVersion`** → 下次 `expectedEditVersion`。冲突：重读或 `force`。字段说明：**`xaction-json`**。
## P3 元数据（可选）
改标题/说明/图标、不动程序体：

```text
qkrpc_action_set_metadata({ id: "<guid>", icon: "fa:Light_<Name>", expectedEditVersion: <N> })
```

或与 P6 同 patch 写顶层 `icon`（值见 **`action-icons`**）。
## P4 实现选型

需要细节时再 `docs_get`（`topic: "implementation-fallback"`）。

计算/比较/赋值 → **`expressions`** 或 `sys:evalexpression`；UI/IO → P5 专用模块；无模块 → **`sys:csscript`**（C#），勿默认长 PowerShell（**`implementation-fallback`**）。
## P5 步骤 schema（每个新建/改参步骤）
```text
step-modules（速查）→ 无则 step-runner search（一次 OR|通配）→ step-runner get（必须）
```

```text
docs_get({ topic: "step-modules" })   # 速查表；按需
qkrpc_step_runner_search({ query: "剪贴板|clipboard|sys:*clip*" })
qkrpc_step_runner_get({ key: "sys:MsgBox" })
qkrpc_step_runner_get({ key: "sys:windowOperations", controlField: "move_ex" })
```

`schema.Inputs[].Key` = **`inputParams` 键名**（以 step-runner get 为准）。有 **`ControlField`** 的步骤：search 可能返回 `controlFieldValue`；get 须传 **`controlField`**，否则 `Inputs` 含全部模式参数易写错键。搜索语法：**`step-runner-search`**。
## P6 写入

```text
qkrpc_action_patch({ id: "<guid>", patch: { ... }, expectedEditVersion: <N> })
```

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

