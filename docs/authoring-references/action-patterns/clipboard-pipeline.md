# 剪贴板读写流水线

> **场景**：以剪贴板为输入/输出通道 · **难度**：S · **exemplar**：[公网IP](99363ea4-da49-4667-95d6-08d66293b929)（库，`library search` → `shared get`）

## 何时用

任务的数据源或落点是系统剪贴板：读取 → 变换 → 写回，或从 HTTP/表达式生成结果后写入剪贴板。与 **selection-pipeline** 的区别：不依赖当前窗口选区；与 **expression-first** 的区别：本模式显式使用 `getClipboardText` / `writeClipboard` 模块链。

## 步骤骨架

1. **读取** — `sys:getClipboardText`（`format: UnicodeText`；慢应用可加大 `waitMs`）
2. **变换** — `sys:stringProcess` / `sys:regexExtract` / `sys:evalexpression` / `sys:http` + 提取（按任务）
3. **写回** — `sys:writeClipboard`（`type: text` + `text.var` 或 `type: auto` + `input.var`）
4. **反馈**（可选）— `sys:notify` / `sys:showText`

## 变量约定

| 角色 | 建议 key | 类型 |
|------|----------|------|
| 剪贴板原文 | `text` / `clipText` | Text |
| 变换结果 | `result` / `text`（覆写） | Text |
| 成功标记 | `clipOk` | Boolean |

## 示例动作

- 库 exemplar `99363ea4-…`：`http` → `regexExtract` → `writeClipboard`（`input.var` ← `ip`）→ `notify`
- 学习验证 `__pattern_learning__clipboard_upper`：`writeClipboard` → `getClipboardText` → `stringProcess toUpper` → `writeClipboard` → `showText`（trace 输出 `HELLO CLIPBOARD`）

### 最小 patch

```json
{
  "replace": true,
  "variables": [
    { "key": "text", "defaultValue": "hello clipboard" },
    { "key": "result", "defaultValue": "" },
    { "key": "clipOk", "varType": "boolean", "defaultValue": "false" }
  ],
  "steps": [
    {
      "stepRunnerKey": "sys:writeClipboard",
      "inputParams": { "type": "text", "text.var": "text" },
      "outputParams": { "isSuccess": "clipOk" }
    },
    {
      "stepRunnerKey": "sys:getClipboardText",
      "inputParams": { "format": "UnicodeText", "waitMs": "0" },
      "outputParams": { "isSuccess": "clipOk", "output": "text" }
    },
    {
      "stepRunnerKey": "sys:stringProcess",
      "inputParams": { "method": "toUpper", "data.var": "text" },
      "outputParams": { "output": "result", "isSuccess": "clipOk" }
    },
    {
      "stepRunnerKey": "sys:writeClipboard",
      "inputParams": { "type": "text", "text.var": "result" },
      "outputParams": { "isSuccess": "clipOk" }
    }
  ]
}
```

## 陷阱

- `writeClipboard`：`type: auto` 用 `input` 键；`type: text` 用 `text` 键（见 `step-runner get` controlField）。
- 会**覆盖**用户剪贴板；需保留时先备份 `getClipboardText` 再在末尾恢复。
- 大型剪贴板管理动作（如 `9ec53d43-…`）多为子程序 + csscript，不宜作入门 exemplar；优先选 ≤5 步的库动作。
- 与选区流水线混用时：`sendKeys ^c` 与 `getClipboardText` 之间加 `delay` 或 `waitMs`。

## 相关

- `selection-pipeline` — 选区优先
- `expression-first` — 单行 LINQ/表达式可替代多步剪贴板处理
- skill draft：`quicker-authoring-clipboard-pipeline`
