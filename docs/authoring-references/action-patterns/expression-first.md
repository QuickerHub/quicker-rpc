# 表达式优先于模块

> **场景**：单行 LINQ/字符串处理可替代多步模块链 · **难度**：S · **exemplar**：`__pattern_learning__expr_lines` trace ✅

## 何时用

去重、排序、拼接、简单 JSON 解析、多变量赋值等逻辑，**优先单步 `sys:evalexpression`**，避免 `stringProcess` + `assign` + 多步串联。与 **clipboard-pipeline** / **file-batch** 的区别：本模式强调「能表达式就不拆模块」；与 **quicker-eval-expression** skill 的关系：skill 管语法，本 pattern 管架构取舍。

## 步骤骨架

1. **准备输入变量** — 动作参数 / 上游模块输出 / `defaultValue`
2. **单步 evalexpression** — `var` 处理中间量；仅把下游要读的写入 `{out}` / `{result}` 等动作变量
3. **消费结果** — `showText` / `writeClipboard` / 下游模块 `*.var`

## 变量约定

| 角色 | 建议 key | 类型 | 说明 |
|------|----------|------|------|
| 原始文本 | `text` / `input` | Text | 上游输入，动作变量 |
| 处理结果 | `result` / `output` | Text | **唯一**需要跨步持久化的输出 |
| 步骤成功 | `ok` | Boolean | 可选 |
| 解析/循环中间量 | — | — | **`var` 临时变量**，不要新增动作变量 |

## 示例（trace ✅）

无头：脏行文本 `line2\nline1\nline2\nline3\n` → 单行 evalexpression 去空行、Trim、Distinct、OrderBy → `showText` 显示 `line1\nline2\nline3`。

Patch：`.local/patch-expression-first.json`

### 最小 patch

```json
{
  "stepRunnerKey": "sys:evalexpression",
  "inputParams": {
    "expression": "{result} = string.Join(\"\\n\", ({text} ?? \"\").Split(new[] {'\\n','\\r'}, StringSplitOptions.RemoveEmptyEntries).Select(s => s.Trim()).Where(s => s.Length > 0).Distinct().OrderBy(s => s));"
  },
  "outputParams": { "isSuccess": "ok" }
}
```

## 陷阱

- evalexpression 内用 **`{var}`** 读写变量；**不是** `$=` 前缀（`simpleIf` 的 `condition` 才用 `$=`）。
- 多变量 `{a}=…; {b}=…` 仅当 **a、b 都被后续步骤读取**；单步内 scratch 用 `var`（见 quicker-eval-expression）。
- **不要**为 CSV 解析、循环计数等过程量批量定义动作变量。
- `number` 字面量参与运算时用 `Convert.ToDouble(n)`（SDK L2 复盘）。
- 复杂 UI、文件 IO、HTTP 仍用专用模块；表达式替代的是**纯数据变换**。

## 相关

evalexpression · quicker-eval-expression · clipboard-pipeline · stringProcess · assign
