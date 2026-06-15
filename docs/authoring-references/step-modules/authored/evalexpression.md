# sys:evalexpression

> **分类**：计算与数据结构 · **来源**：仓库手写 · **官方**：[expression](https://getquicker.net/KC/Help/Doc/expression)

**用途**：执行 C# 表达式/脚本；`{var}=值` 单步多变量赋值；优先于 assign/compute。

## 示例

见本文件下方 JSON 示例（算术、多变量 `{var}=`、LINQ、`expression.file`）。

### 算术（SkipEval 不加 `$=`）

```json
{
  "stepRunnerKey": "sys:evalexpression",
  "inputParams": {
    "expression": "{数量} * 1000"
  },
  "outputParams": {
    "output": "毫秒值",
    "isSuccess": "成功"
  }
}
```

### 多变量赋值

```json
{
  "stepRunnerKey": "sys:evalexpression",
  "inputParams": {
    "expression": "{和} = {num1} + {num2};\n{积} = {num1} * {num2}"
  },
  "outputParams": {
    "isSuccess": "成功"
  }
}
```

## 陷阱

- SkipEval：`expression` / `files/*.eval.cs` 为纯 C#，无 `$=` — **`$=`/`$$` 规则见 expressions topic**（wire 前缀在 JSON 字符串首字符，不是 C# 语法）。
- **单步内中间量用 `var` 临时变量**；仅当后续步骤要读时才 `{变量}=` 写回动作变量。避免为解析/循环过程大量新增 `variables[]` 条目。
- `{var}=expr` 写回变量时可不映射 `output`；长表达式用 `expression.file` 外链 `.eval.cs` / `.expr`。
- `onUiThread: true` 谨慎使用，可能造成死锁；复杂逻辑兜底见 `implementation-fallback` → `csscript`。

### 临时变量 vs 动作变量

```text
// 不推荐：hasAmount / amountSum 仅在本步使用，却定义为动作变量
{hasAmount} = false;
{amountSum} = 0.0;

// 推荐：中间量用 var；只把下游要读的写入动作变量
var hasAmount = false;
var amountSum = 0.0;
// …
{resultText} = resultText
```

## 相关

expressions · assign · csscript · step-runner-get
