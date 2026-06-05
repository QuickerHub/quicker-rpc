# {{#topic-title}}

**何时读**：动作含 **动作内子程序**（非全局 `.quicker/subprograms/`），需弄清磁盘目录与根 `data.json` 如何对应 Quicker 内的 `subPrograms[]`。

## 与全局子程序的区别

| | 动作内子程序 | 全局子程序 |
|---|---|---|
| 归属 | 单个动作的 `subPrograms[]`（运行时） | Quicker 库全局子程序 |
| 工作区路径 | `actions/{actionId}/subprograms/{subId}/` | `.quicker/subprograms/{name}/` |
| 步骤调用 | `sys:subprogram`，参数为子程序 **名称** / `%%` / `@@` 等 | `callIdentifier`（见 subprogram-workflow） |

## 磁盘布局

```text
.quicker/actions/{actionId}/
  info.json
  data.json                 # steps + variables；不含内联 subPrograms 数组
  files/
  subprograms/
    {subProgramId}/         # 目录名 = 子程序 id（GUID）；无 id 时可用规范化 name
      info.json             # ActionEmbeddedSubProgramInfo
      data.json             # 本子程序的 steps + variables
      files/
      subprograms/          # 嵌套子程序（结构递归相同）
```

## 根 `data.json` 与子目录

- 根 **`data.json` 不写** `subPrograms` 内联数组；每个子程序体在 **`subprograms/{subId}/data.json`**（及该目录下的 `files/`）。
- 写入 Quicker 时，宿主从 `subprograms/` 递归读取并组装为内存中的 `subPrograms[]`，与根 `steps` / `variables` 一并保存。
- 子程序内 `files/` 与动作根 `files/` 规则相同：`inputParams` 为 `value` / `varKey` / `file` **三选一**，禁止 `..`。

逻辑路径（相对工作区根，便于定位）：

```text
actions/{actionId}/subprograms/{subProgramId}/data.json
actions/{actionId}/subprograms/{subProgramId}/files/main.cs
```

## `subprograms/{subId}/info.json`

可编辑子程序体：

```json
{
  "id": "a1b2c3d4-....",
  "name": "MySub",
  "description": "",
  "icon": "fa:Light_Code"
}
```

仅元数据、无 `data.json` 的引用型：

- **全局链接**：`name` 为 `%%{globalSubProgramId}` 等形式
- **共享模板**：`templateId` / `sharedId` / `name` 以 `@@` 开头

## 相关

`action-project-files` · `subprogram-workflow` · `action-steps` · `overview`
