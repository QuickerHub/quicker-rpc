# sys:excelObjects

> **来源**：step JSON 示例 · **官方**：[excelobjects](https://getquicker.net/KC/Help/Doc/excelobjects)

**用途**：Interop 打开/创建/切换 Excel 工作簿与工作表对象（供 `excelRange` 链式使用）。

## 示例

### 打开工作簿

```json
{
  "stepRunnerKey": "sys:excelObjects",
  "inputParams": {
    "operation": "OpenFile",
    "path.var": "文件路径"
  },
  "outputParams": {
    "isSuccess": "成功",
    "activeWorkbook": "工作簿",
    "activeSheet": "工作表"
  }
}
```

### 创建工作簿

```json
{
  "stepRunnerKey": "sys:excelObjects",
  "inputParams": {
    "operation": "CreateWorkbook",
    "params": "Visible=true"
  },
  "outputParams": {
    "isSuccess": "成功",
    "activeWorkbook": "工作簿",
    "worksheetNames": "表名列表"
  }
}
```

### 获取当前 Excel 应用信息

```json
{
  "stepRunnerKey": "sys:excelObjects",
  "inputParams": {
    "operation": "ApplicationInfo"
  },
  "outputParams": {
    "isSuccess": "成功",
    "workbookPath": "路径",
    "activeSheet": "活动表"
  }
}
```
