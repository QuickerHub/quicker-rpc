# 外置表达式文件

> **场景**：长 C# 逻辑放到 `files/*.eval.cs`，步骤引用 `expression.file` · **难度**：M · **exemplar**：`__pattern_learning__external_eval` trace ✅

## 何时用

`sys:evalexpression` 表达式超过约 4 行、含 try/catch 或多语句块时，外置到 **`files/*.eval.cs`**（benchmark `external-eval-cs`）。与 **expression-first** 的区别：本模式强调 **磁盘文件 + apply**；与 **workspace-editing** 的关系：Agent 改 `data.json` + `files/` 后 `action apply`。

## 步骤骨架

1. **剪贴板/输入** — `writeClipboard`（trace 种子）→ `getClipboardText` → `clipText`
2. **外置表达式** — `evalexpression` `expression.file: files/<name>.eval.cs`
3. **分支** — `sys:if` on `ok` → `writeClipboard` 成功结果 / `showText` 错误

## 变量约定

| 角色 | 建议 key | 类型 |
|------|----------|------|
| 输入文本 | `clipText` | Text |
| 格式化结果 | `result` | Text |
| 业务成功 | `ok` | Boolean |
| 错误说明 | `message` | Text |
| 剪贴板步 | `clipOk` | Boolean |

## 工作流（磁盘）

```text
action extract --id <guid> --dir .local/ws-*
  → 写 files/format-json.eval.cs
  → data.json 步骤 inputParams.expression.file
  → action apply --dir ...
```

Patch 仅写 `expression.file` 路径；**文件体**经 extract/apply 或 workspace_program `file_write` 落盘。

## 示例（trace ✅）

JSON `{"name":"demo","n":1}` → 缩进格式化 → 写回剪贴板。

- Workspace：`.local/ws-external-eval/`
- eval 源：`.local/format-json.eval.cs`
- Patch：`.local/patch-external-eval-cs.json`

### 最小 wire

```json
{
  "stepRunnerKey": "sys:evalexpression",
  "inputParams": {
    "expression.file": "files/format-json.eval.cs"
  }
}
```

### eval.cs 片段

```csharp
try {
    var raw = {clipText} ?? "";
    var token = Newtonsoft.Json.Linq.JToken.Parse(raw);
    {result} = token.ToString(Newtonsoft.Json.Formatting.Indented);
    {ok} = true;
} catch (System.Exception ex) {
    {ok} = false;
    {message} = "JSON invalid: " + ex.Message;
}
```

## 陷阱

- wire 键 **`expression.file`**（非 `code.file` 除非 legacy）；`fileExt` 为 `.eval.cs`。正文语法 → **expressions** topic（SkipEval，无 `$=`）。
- **勿** `outputParams.isSuccess` 映射到业务 `ok`；业务 `ok` 仅在 eval.cs 内 `{ok}=`。
- extract 拉取后若内联 `{}`，需改回 `expression.file` 再 apply。
- trace 前用 `writeClipboard` 写入样本 JSON，避免剪贴板污染。
- **ActionRuntime mock**：eval.cs 内 **Newtonsoft / System.Text.Json** 在 Z.Expressions 不可用；mock bench 用 `.local/ws-external-eval-bench/` 简化 formatter；live/trace 仍用 `.local/ws-external-eval/` + Newtonsoft。

## 相关

expression-first · workspace-editing · action-project-files · skill：`quicker-authoring-external-eval-cs`
