# 工作区项目（CLI）

{{#only-cli}}
**何时读**：用 **extract/apply** 或手改 `.quicker` 目录，而非内联 patch JSON。

## 目录

```text
.quicker/
  actions/{actionId}/     # 默认目录名 = 动作 GUID
    info.json             # proto ActionProjectInfo (see action_project.proto)
    data.json             # steps + variables
    files/                # inputParams.*.file、variables[].defaultValueFile 外置
  subprograms/{name}/
```

## file 外置

`data.json` 中（import/apply 前解析为 `value`）：

```json
"script": { "file": "files/main.cs" }
```

`file` 与 `value` / `varKey` 互斥。路径相对项目目录，`/` 分隔，禁止 `..`。

变量长默认值：

```json
{ "key": "urls", "type": 0, "defaultValueFile": "files/urls-default1.txt" }
```

`defaultValueFile` 与内联 `defaultValue` 互斥；`apply` 前解析为 `defaultValue` 字符串。

## 命令

```powershell
{{@ action.extract}}
{{@ action.apply}}
{{@ subprogram.export}}
{{@ subprogram.import}}
```

内联 patch JSON：**`patch-workflow`**。

## 相关

`authoring-workflow` · `patch-workflow` · `overview`
{{/only-cli}}
