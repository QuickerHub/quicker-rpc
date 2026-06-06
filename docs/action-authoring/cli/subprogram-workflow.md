# 子程序

**何时读**：管理公共子程序，或在动作里 **调用** 公共子程序。工具参数见 `qkrpc_subprogram_*`、`qkrpc_step_runner_get`（`sys:subprogram`）。

## 两种概念

| | 公共子程序 | 动作内子程序 |
|--|------------|----------------|
| 存储 | Quicker 全局库 | 父动作 `SubPrograms[]` |
| 磁盘 | `.quicker/subprograms/{idOrName}/` | `.quicker/actions/{actionId}/subprograms/{subProgramId}/` |
| 调用标识 | `sys:subprogram` + `callIdentifier` 通常 `%%{guid}` | 本动作内定义（非 `%%{guid}`） |

## A. 管理公共子程序

```text
subprogram search/get → workspace_program 改 data.json → workspace_program patch
```

```powershell
qkrpc subprogram create --name "名" [--icon fa:Light_*] --json
qkrpc subprogram get --id <id|name> --return-mode full --json
qkrpc subprogram patch --id <id> --patch-file patch.json --expected-edit-version <N> --json
```
程序体也可用 extract/apply 或 **`patch-workflow`** **`--patch-file`**。

## B. 在动作里调用公共子程序

```text
subprogram search/get → callIdentifier
  → step-runner get(sys:subprogram)
  → workspace_program edit_data 写入 data.json 步骤
  → workspace_program patch
```

→ `step-runner get --key sys:subprogram`
→ `action patch` 添加步骤，`inputParams.subProgram.value = callIdentifier`

**`callIdentifier`** 必须从 search/get 读取；未知标识会报错。

## 相关

`authoring-workflow` · `workspace-editing` · `overview`
