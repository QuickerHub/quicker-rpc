# sys:excelRange

> **来源**：step JSON 示例 · **官方**：[excelrange](https://getquicker.net/KC/Help/Doc/excelrange)

**用途**：Interop 读写 Excel 区域（须本机安装 Excel，且工作簿由 Quicker 打开）。

## 示例

### 写入区域

```json
{
  "stepRunnerKey": "sys:excelRange",
  "inputParams": {
    "range": "A1:C1",
    "operation": "SetValue",
    "value": "标题"
  },
  "outputParams": {
    "isSuccess": "成功"
  }
}
```

### 读取已用区域

```json
{
  "stepRunnerKey": "sys:excelRange",
  "inputParams": {
    "range": "used",
    "operation": "GetRangeInfo"
  },
  "outputParams": {
    "isSuccess": "成功",
    "value": "单元格值",
    "address": "地址"
  }
}
```

### 通过 Range 对象写入

```json
{
  "stepRunnerKey": "sys:excelRange",
  "inputParams": {
    "range.var": "目标区域",
    "operation": "SetFormula",
    "value": "=SUM(A1:A10)"
  },
  "outputParams": {
    "isSuccess": "成功"
  }
}
```
