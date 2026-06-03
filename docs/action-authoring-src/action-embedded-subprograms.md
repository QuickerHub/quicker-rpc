# 动作内子程序（工作区外置）

**何时读**：动作含 **内部子程序**（非全局 `.quicker/subprograms/`），需 extract/apply 或 agent-gui 按子程序路径编辑。

## 与全局子程序的区别

| | 动作内子程序 | 全局子程序 |
|---|---|---|
| 归属 | 单个 XAction 的 `subPrograms[]` | Quicker 库 `GlobalSubPrograms` |
| 工作区路径 | `action/{actionId}/subprograms/{subId}` | `.quicker/subprograms/{name}` |
| 调用 | 步骤 `sys:subprogram` 引用 **名称** / `%%` / `@@` | `callIdentifier` + `subprogram get` |
| CLI | 随 `action extract` / `action apply` | `subprogram export` / `import` |

## 磁盘布局

```text
.quicker/actions/{actionId}/
  info.json
  data.json                 # steps + variables（不含内联 subPrograms）
  files/                    # 主程序外置
  subprograms/
    {subProgramId}/         # 目录名 = 子程序 id（GUID）；无 id 时用 sanitize(name)
      info.json             # ActionEmbeddedSubProgramInfo
      data.json             # steps + variables（内部子程序）
      files/                # 子程序级外置（路径相对本子程序目录）
      subprograms/          # 嵌套子程序（递归同结构）
```

## 逻辑路径（agent-gui / 工具）

```text
action/{actionId}/subprograms/{subProgramId}/data.json
action/{actionId}/subprograms/{subProgramId}/files/main.cs
```

解析规则：

1. 前缀 `action/` 映射到 `.quicker/actions/`（可省略 `.quicker/actions`，直接传 GUID 项目相对路径亦可）。
2. `{subProgramId}` 对应 `subprograms/{subProgramId}/` 目录。
3. 子程序内 `files/` 与动作根 `files/` 规则相同：`file` 与 `value` 互斥，禁止 `..`。

## info.json（子程序）

内部子程序（可编辑 body）：

```json
{
  "id": "a1b2c3d4-....",
  "name": "MySub",
  "description": "",
  "icon": "fa:Light_Code"
}
```

引用型（无 `data.json`，仅元数据）：

- **全局链接**：`name` 为 `%%{globalSubProgramId}` 或 info 中保留原始字段
- **共享模板**：`templateId` / `sharedId` / `name` 以 `@@` 开头

## 导入 / 导出流程

### extract / export

1. RPC `action get (full)` 读取 body（含 `subPrograms`）。
2. 主程序 `steps`/`variables` → 现有 `XActionFileRefExporter` → 根 `data.json`。
3. 每个 `subPrograms[]` 项 → `ActionEmbeddedSubProgramExporter` 写入 `subprograms/{id}/`（递归嵌套；`files/` 外置）。
4. 根 `data.json` **不含** 内联 `subPrograms`（apply 时从磁盘组装）。

### apply / import

1. 读根 `data.json` → `XActionFileRefCompiler` 解析 `files/`。
2. `ActionEmbeddedSubProgramCompiler` 扫描 `subprograms/`，递归编译嵌套，合并为 `subPrograms` 数组。
3. RPC `ApplyXActionToAction` 写入 Quicker（`subPrograms` 与 `steps`/`variables` 一并保存）。

### validate

`action validate` 在 compile 干跑后报告 `subProgramCount` 与各子程序 `fileRefs`。

## 相关

`action-project-files` · `authoring-workflow` · `subprogram-workflow`（全局子程序）
