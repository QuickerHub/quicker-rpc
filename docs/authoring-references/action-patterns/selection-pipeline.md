# 选中文本 → 处理 → 写回

> **场景**：前台选区自动化 · **难度**：S · **exemplar**：[选中文本翻译](bfa00a8f-e8e2-4c0a-97c5-08dac9653534)（库，`library search`）· 本地 [复制选中文本并翻译](0e85836c-1bad-4209-9970-4d87d3f569df)

## 何时用

用户已在目标窗口选中一段文本，需要读取 → 变换（大小写、翻译、格式化等）→ 写回同一焦点或弹窗展示。与 **clipboard-pipeline** 的区别：本模式以「选区」为输入源；剪贴板流水线不依赖当前选区状态。

## 步骤骨架

1. **读取选区** — `sys:getSelectedText`（首选）或 `sys:sendKeys` `^c` + `sys:getClipboardText`（兼容慢速/特殊应用）
2. **变换** — `sys:stringProcess` / `sys:translation` / `sys:evalexpression`（P4：简单变换优先表达式）
3. **写回** — `sys:outputText`（`paste` 长文本、`input` 短文本/特殊键）或 `sys:MsgBox` 仅展示

## 变量约定

| 角色 | 建议 key | 类型 |
|------|----------|------|
| 原始选区 | `text` / `selectedText` | Text |
| 变换结果 | `text`（覆写）/ `result` | Text |
| 成功标记 | `gotText` / `copyOk` | Boolean |

## 示例动作

- 库 exemplar `bfa00a8f-…`（`shared get`）：`getSelectedText` → `translation` → `writeClipboard`（比本地 exemplar 更贴近「选区→处理→输出」）
- 本地 exemplar `0e85836c-…`：`sendKeys ^c` → `getClipboardText` → `translation` → `MsgBox`（兼容写法）
- 学习验证 `__pattern_learning__selection_upper`：`getSelectedText`（`useActionParam`）→ `stringProcess toUpper` → `outputText paste`

### 最小 patch（参数驱动，便于 trace 无 UI）

```json
{
  "replace": true,
  "variables": [
    { "key": "text", "defaultValue": "" },
    { "key": "gotText", "varType": "boolean", "defaultValue": "false" }
  ],
  "steps": [
    {
      "stepRunnerKey": "sys:getSelectedText",
      "inputParams": { "trim": true, "useActionParam": true },
      "outputParams": { "isSuccess": "gotText", "output": "text" }
    },
    {
      "stepRunnerKey": "sys:stringProcess",
      "inputParams": { "method": "toUpper", "data.var": "text" },
      "outputParams": { "output": "text", "isSuccess": "gotText" }
    },
    {
      "stepRunnerKey": "sys:outputText",
      "inputParams": { "content.var": "text", "method": "paste" },
      "outputParams": { "isSuccess": "gotText" }
    }
  ]
}
```

## 陷阱

- `getSelectedText` 默认污染剪贴板；需保留剪贴板时用 `tryNoClipboard` 或先备份 `getClipboardText`。
- `outputText` 默认 `paste` 会再次写剪贴板；Excel 单元格编辑态可能需先 `Esc`。
- 慢速应用（PDF）增大 `getSelectedText.waitMs`；失败见 KC [cannot_get_selected_text](https://getquicker.net/kc/help/doc/cannot_get_selected_text)。
- 无头 benchmark：设 `useActionParam: true`，用 `action run --param "…"` 代替真实选区。

## 相关

getSelectedText · outputText · stringProcess · getClipboardText · expressions · clipboard-pipeline
