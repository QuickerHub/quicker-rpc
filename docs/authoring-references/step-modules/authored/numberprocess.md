# sys:numberprocess

> **分类**：计算与数据结构 · **来源**：仓库手写 · **官方**：[numberprocess](https://getquicker.net/KC/Help/Doc/numberprocess)

**用途**：数字格式化文本、取整与进制转换（简单运算可用 `evalexpression`）。

## 示例

### 保留两位小数

```json
{
  "stepRunnerKey": "sys:numberprocess",
  "inputParams": {
    "operation": "toString",
    "srcNumber.var": "金额",
    "decimalPlace": 2
  },
  "outputParams": {
    "isSuccess": "成功",
    "rtnF": "文本"
  }
}
```

### 向下取整

```json
{
  "stepRunnerKey": "sys:numberprocess",
  "inputParams": {
    "operation": "toInteger",
    "srcNumber.var": "数值",
    "toIntegerMethod": "Floor"
  },
  "outputParams": {
    "isSuccess": "成功",
    "rtnInteger": "整数"
  }
}
```

### 十进制转十六进制

```json
{
  "stepRunnerKey": "sys:numberprocess",
  "inputParams": {
    "operation": "baseConversion",
    "srcNumberStr.var": "十进制文本",
    "srcBase": 10
  },
  "outputParams": {
    "isSuccess": "成功",
    "resultHex": "十六进制"
  }
}
```

## 陷阱

- `toString` 输出 `rtnF`（无千分位）/ `rtnN`（含逗号）/ `rtnPercent`；`roundingMethod` 控制四舍五入 vs 截断。
- `baseConversion` 用 `srcNumberStr` + `srcBase`（0=自动识别 2/8/10/16）；同时可绑定 `resultOctal`/`resultBin`。
- 比较两数优先 `if` + `$=` 或 `numCompare`（已废弃倾向）→ 直接用表达式。

## 相关

evalexpression · compute · numCompare · formatString · step-runner-get
