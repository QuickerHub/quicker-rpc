# 正则提取流水线

> **场景**：从文本/HTTP 响应中提取字段 → 下游写剪贴板或展示 · **难度**：S · **exemplar**：`__pattern_learning__regex_module` trace ✅

## 何时用

日志、网页片段、剪贴板文本中按正则取 id、IP、标签等。与 **expression-first** 的区别：本模式显式 `sys:regexExtract` 模块链；与 **http-json-api** 的区别：源数据是**非 JSON 文本**或混合文本。

## 步骤骨架

1. **准备输入** — `text` / `http` 响应变量 / `getClipboardText`
2. **regexExtract** — `getGroup: 0`（各匹配项的值）或 `1`（首匹配捕获组）
3. **消费** — 直接 `match1 ` 输出 / `matches` 列表 + 下游 / `evalexpression` 二次处理
4. **输出** — `writeClipboard` / `showText` / 条件分支

## 变量约定

| 角色 | 建议 key | 类型 |
|------|----------|------|
| 源文本 | `text` / `html` | Text |
| 单值提取 | `id` / `result` | Text |
| 多匹配列表 | `matches` | List |
| 成功 | `ok` | Boolean |

## 示例（trace ✅）

- `__pattern_learning__regex_module`（`f9b39e0b-…`）：`regexExtract` → `showText` `ABC123`
- 表达式兜底 `__pattern_learning__regex_expr`：`Regex.Match(...).Value` 同等结果

Patch：`.local/patch-regex-extract.json`、`.local/patch-regex-extract-expr.json`

### 最小 patch（模块路径）

```json
{
  "stepRunnerKey": "sys:regexExtract",
  "inputParams": {
    "getGroup": "0",
    "data.var": "text",
    "pattern": "(?<=id=)\\w+"
  },
  "outputParams": {
    "match1 ": "id",
    "isSuccess": "ok"
  }
}
```

> **wire 陷阱**：`outputParams` 键名必须是 **`match1 `**（尾随空格），与 `step-runner get` schema 一致；写 `match1` 无尾随空格则变量不落盘。

### 表达式兜底（单捕获）

```json
{
  "stepRunnerKey": "sys:evalexpression",
  "inputParams": {
    "expression": "{id} = System.Text.RegularExpressions.Regex.Match({text} ?? \"\", @\"(?<=id=)\\w+\").Value;"
  }
}
```

## 陷阱

- **`match1`–`match5` wire 键带尾随空格**（`match1 `）；Agent 必须从 `step-runner get` 复制，勿猜。
- `matches` 在 trace 中可能显示为字符串；多值场景用 `listOperations` 或 expression-first。
- `getGroup: 1` 取捕获组时 pattern 需含 `(...)`；`matchObj` 勿在 evalexpression 直接 `.Groups`。
- 复杂解析（多组、条件）优先 **expression-first** `Regex.Match` / `Matches`。
- 与 **clipboard-pipeline** / **http-json-api** 串联时：`regexExtract` 插在变换步。

## 相关

regexExtract · expression-first · clipboard-pipeline · http-json-api · skill：`quicker-authoring-regex-extract-pipeline`
