# 工作区项目布局

**何时读**：需要 **`.quicker/actions/{actionId}/`** 目录布局，或在 `data.json` / `files/` 里写 **`{ "file": "…" }`** 外置引用时。步骤与变量字段见 **`action-steps`**、**`action-variables`**。

## 目录布局

```text
.quicker/
  actions/{actionId}/     # 目录名通常为动作 GUID
    info.json             # 动作元数据（标题、图标等）
    data.json             # steps + variables（动作内子程序见 action-embedded-subprograms）
    files/                # inputParams.*.file、variables[].defaultValue.file 等外置正文
    subprograms/{subId}/  # 动作内子程序（各自 info.json、data.json、files/）
      info.json
      data.json
      files/
  subprograms/{name}/     # 全局公共子程序（另一棵树，见 subprogram-workflow）
```

## `file` 外置引用

`data.json` 中下列位置可用 **`{ "file": "<相对路径>" }`**（保存进 Quicker 前由宿主解析为内联 `value` 字符串）：

| 位置 | 示例 |
|------|------|
| `inputParams.*` | `"script": { "file": "files/main.cs" }` |
| `variables[].defaultValue` | `"defaultValue": { "file": "files/urls-default1.txt" }` |

规则：

- **`inputParams.*`**：`value` / `varKey` / `file` **三选一**（见 **`action-steps`**）。
- **`variables[].defaultValue`**：内联字符串与 `{ "file": "…" }` **二选一**（见 **`action-variables`**）。
- 路径相对**当前**动作或子程序项目根，`/` 分隔，禁止 `..`。
- 正文存放在对应 `files/` 下的文件中。

长文本（脚本、`expression`、多行默认值等）宜外置，扩展名约定见 **`action-steps`**（如 `*.eval.cs` 与 `sys:evalexpression`）。**`sys:form` 的 `formDef`** 默认 **`{ "file": "files/*.form.json" }`**（`qkrpc.form.v1`），见 **`form-spec`**。

## 相关

`action-variables` · `action-steps` · `action-embedded-subprograms` · `overview`
