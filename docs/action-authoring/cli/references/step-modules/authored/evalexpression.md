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

- 本步 `expression` 为 SkipEval：**不要** `$=` 前缀；普通步骤参数写表达式才用 `$=` / `$$`（详见 `expressions` topic）。
- `{var}=expr` 写回变量时可不映射 `output`；长表达式用 `expression.file` 外链 `.eval.cs` / `.expr`。
- `onUiThread: true` 谨慎使用，可能造成死锁；复杂逻辑兜底见 `implementation-fallback` → `csscript`。

## 相关

expressions · assign · csscript · step-runner-get
