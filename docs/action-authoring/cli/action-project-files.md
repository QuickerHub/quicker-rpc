# 工作区项目（CLI）

**何时读**：用 **extract/apply** 或手改 `.quicker` 目录，而非内联 patch JSON。

## 目录

```text
.quicker/
  actions/{actionId}/     # 默认目录名 = 动作 GUID
    info.json             # proto ActionProjectInfo (see action_project.proto)
    data.json             # steps + variables（不含内联 subPrograms）
    files/                # inputParams.*.file、variables[].defaultValueFile 外置
    subprograms/{subId}/  # 动作内子程序（见 action-embedded-subprograms）
      info.json
      data.json
      files/
  subprograms/{name}/     # 全局公共子程序
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
qkrpc action extract --id <guid> [--dir .quicker/actions/<guid>] [--min-lines 4] --json
qkrpc action apply --id <guid> [--dir .quicker/actions/<guid>] [--expected-edit-version <N>] [--force] --json
qkrpc subprogram export --id <nameOrId> --dir .quicker/subprograms/my-sub --json
qkrpc subprogram import --dir .quicker/subprograms/my-sub --json
```

内联 patch JSON：**`patch-workflow`**。

## 相关

`action-embedded-subprograms` · `authoring-workflow` · `patch-workflow` · `overview`
