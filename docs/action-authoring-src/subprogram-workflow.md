# 子程序

**何时读**：管理公共子程序，或在动作里 **调用** 公共子程序。工具参数见 `qkrpc_subprogram_*`、`qkrpc_step_runner_get`（`sys:subprogram`）。

## 两种概念

| | 公共子程序 | 动作内子程序 |
|--|------------|----------------|
| 存储 | Quicker 全局库 | 父动作 `SubPrograms[]` |
| 磁盘（规划） | `.quicker/subprograms/{name}/` | `.quicker/actions/{actionId}/subprograms/` |
| 调用标识 | `sys:subprogram` + `callIdentifier` 通常 `%%{guid}` | 本动作内定义（非 `%%{guid}`） |

## A. 管理公共子程序

```text
subprogram search/get → [CLI: create/patch] → 磁盘 .quicker/subprograms/
```

{{#only-cli}}
```powershell
{{@ subprogram.create}}
{{@ subprogram.get}}
{{@ subprogram.patch}}
```
patch 形状：**`patch-workflow`**。
{{/only-cli}}
{{#only-agent}}
读取：`qkrpc_subprogram_get`。创建/改体：终端 `qkrpc subprogram`（UI 未全覆盖时）。
{{/only-agent}}

## B. 在动作里调用公共子程序

```text
subprogram search/get → callIdentifier
  → step-runner get(sys:subprogram)
  → 写入 data.json 步骤（inputParams.subProgram 等，键名以 get 为准）
  → 保存
```

{{#ref subprogram.call.chain}}

{{#only-agent}}
保存：**`qkrpc_action_patch({ id })`**（先 **`workspace_action_*_data`** 改步骤，见 **`workspace-editing`**）。
{{/only-agent}}
{{#only-cli}}
保存：`action patch`（**`patch-workflow`**）。
{{/only-cli}}

**`callIdentifier`** 必须从 search/get 读取；未知标识会报错。

## 相关

`authoring-workflow` · `workspace-editing` · `overview`
