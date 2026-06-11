# sys:compute

> **来源**：step JSON 示例 · **官方**：[compute](https://getquicker.net/KC/Help/Doc/compute)

**用途**：计算表达式（新逻辑优先 `sys:evalexpression`）。

## 示例

### 简单算术

```json
{
  "stepRunnerKey": "sys:compute",
  "inputParams": {
    "expression": "3*5+20"
  },
  "outputParams": {
    "isSuccess": "成功",
    "output": "结果"
  }
}
```

### 插值与比较

```json
{
  "stepRunnerKey": "sys:compute",
  "inputParams": {
    "expression": "$$ {数量} > 5 and {数量} < 100"
  },
  "outputParams": {
    "isSuccess": "成功",
    "output": "是否满足"
  }
}
```

### 增强模式（Math）

```json
{
  "stepRunnerKey": "sys:compute",
  "inputParams": {
    "expression": "Math.Min({A}, {B}) + Math.Sqrt(16)",
    "evalVar": true
  },
  "outputParams": {
    "isSuccess": "成功",
    "output": "结果"
  }
}
```
