# sys:evalexpression

> **来源**：step JSON 示例 · **官方**：[expression](https://getquicker.net/KC/Help/Doc/expression)

**用途**：执行 `$=` 表达式并写入变量（优先于 assign/compute）。

## 示例

### 算术与比较

```json
{
  "stepRunnerKey": "sys:evalexpression",
  "inputParams": {
    "expression": "$={数量} * 1000"
  },
  "outputParams": {
    "output.var": "毫秒值",
    "isSuccess": "成功"
  }
}
```

### 赋值表达式

```json
{
  "stepRunnerKey": "sys:evalexpression",
  "inputParams": {
    "expression": "$={结果} = {列表}.Count"
  },
  "outputParams": {
    "isSuccess": "成功"
  }
}
```

### 外链表达式文件

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
