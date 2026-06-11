# sys:excelreadwrite

> **来源**：step JSON 示例 · **官方**：[excelreadwrite](https://getquicker.net/KC/Help/Doc/excelreadwrite)

**用途**：NPOI 打开/创建/读写 Excel（无需安装 Excel，工作簿对象在步间传递）。

## 示例

### 打开工作簿

```json
{
  "stepRunnerKey": "sys:excelreadwrite",
  "inputParams": {
    "operation": "load",
    "filePath.var": "文件路径"
  },
  "outputParams": {
    "isSuccess": "成功",
    "workbook": "工作簿",
    "worksheetNameList": "表名列表"
  }
}
```

### 写入单元格

```json
{
  "stepRunnerKey": "sys:excelreadwrite",
  "inputParams": {
    "operation": "setCell",
    "worksheet.var": "工作表",
    "cellAddress": "B2",
    "cellValue": "完成"
  },
  "outputParams": {
    "isSuccess": "成功"
  }
}
```

### 保存工作簿

```json
{
  "stepRunnerKey": "sys:excelreadwrite",
  "inputParams": {
    "operation": "save",
    "workbook.var": "工作簿",
    "filePath.var": "输出路径"
  },
  "outputParams": {
    "isSuccess": "成功"
  }
}
```
