# {{#topic-title}}

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

{{#only-cli}}
```powershell
{{@ subprogram.create}}
{{@ subprogram.get}}
{{@ subprogram.patch}}
```
程序体也可用 extract/apply 或 **`patch-workflow`** **`--patch-file`**。
{{/only-cli}}
{{#only-agent}}
| 步骤 | 工具 |
|------|------|
| 搜索 / 读元数据 | **`qkrpc_subprogram_query`** · **`qkrpc_subprogram get`**（非空时 sync 到 `.quicker/subprograms/`） |
| 新建 | **`qkrpc_subprogram_manage create`** → 返回 `subProgramId` / `callIdentifier` / `editVersion` + 空 `data.json` |
| 改 `data.json` / `files/` | **`workspace_program({ action: "read_data"\|"edit_data"\|"write_data", target: "global_subprogram", id })`** |
| 写回 Quicker | **`workspace_program({ action: "patch", target: "global_subprogram", id })`** |
| 仅改变量默认值 | **`qkrpc_subprogram edit_var`**（如 qkbuild 更新 `version`） |

**勿**用 **`qkrpc_subprogram patch --patch-file`** 或内联 `{ "op": "update" }` JSON — 直接编辑磁盘 **`data.json`**（见 **`workspace-editing`**）。

维护共享基础设施子程序（如 **`依赖下载_混合模式`**、`QuickerRpc_Run`）时：先 **`get`** 同步，再 **`edit_data`** 改步骤表达式，最后 **`patch`**。
{{/only-agent}}

## B. 在动作里调用公共子程序

```text
subprogram search/get → callIdentifier
  → step-runner get(sys:subprogram)
  → workspace_program edit_data 写入 data.json 步骤
  → workspace_program patch
```

{{#ref subprogram.call.chain}}

**`callIdentifier`** 必须从 search/get 读取；未知标识会报错。

## 相关

`authoring-workflow` · `workspace-editing` · `overview`
