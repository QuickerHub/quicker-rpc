# sys:numberprocess

> **来源**：step JSON 示例 · **官方**：[numberprocess](https://getquicker.net/KC/Help/Doc/numberprocess)

**用途**：数字格式化、取整与进制转换。

## 示例

### 保留两位小数

```json
{
  "stepRunnerKey": "sys:numberprocess",
  "inputParams": {
    "operation": "toString",
    "srcNumber.var": "金额",
    "decimalPlace": "2"
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
    "srcBase": "10"
  },
  "outputParams": {
    "isSuccess": "成功",
    "resultHex": "十六进制"
  }
}
```
