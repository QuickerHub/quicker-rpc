# sys:evalexpression

> **来源**：step JSON 示例 · **官方**：[expression](https://getquicker.net/KC/Help/Doc/expression)

**用途**：执行 C# 表达式/多行脚本；用 `{变量名}=值` 写回动作变量（**单步可写多个变量**）；优先于 assign/compute。`expression` 为 SkipEval 字段，直接写 C#，勿加 `$=` 前缀。

## 示例

### 算术与比较（结果映射到 output）

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

### 单变量赋值（`{var}=`）

```json
{
  "stepRunnerKey": "sys:evalexpression",
  "inputParams": {
    "expression": "{结果} = {列表}.Count"
  },
  "outputParams": {
    "isSuccess": "成功"
  }
}
```

### 多变量赋值（同一步）

用分号或换行分隔多条 `{变量}=表达式`；无需 `output` 映射也会写回变量。

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

### LINQ 计算后写回多个变量

中间结果用 `var` 局部变量；需要持久化的用 `{变量名}=`。

```json
{
  "stepRunnerKey": "sys:evalexpression",
  "inputParams": {
    "expression": "var items = {列表}.Where(x => !String.IsNullOrWhiteSpace(x)).Select(x => x.Trim()).ToList();\n{数量} = items.Count;\n{结果} = String.Join(\",\", items)"
  },
  "outputParams": {
    "isSuccess": "成功"
  }
}
```

### 外链表达式文件

长表达式放 `files/*.expr`；文件内同样支持多行与 `{var}=` 多变量赋值。

```json
{
  "stepRunnerKey": "sys:evalexpression",
  "inputParams": {
    "expression.file": "files/compute.expr"
  },
  "outputParams": {
    "isSuccess": "成功"
  }
}
```
