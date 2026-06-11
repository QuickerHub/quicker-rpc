# sys:tableoperation

> **来源**：step JSON 示例 · **官方**：[tableoperation](https://getquicker.net/KC/Help/Doc/tableoperation)

**用途**：对表格变量增删改查或导入导出。

## 示例

### 查看表格信息

```json
{
  "stepRunnerKey": "sys:tableoperation",
  "inputParams": {
    "type": "info",
    "table.var": "数据表"
  },
  "outputParams": {
    "isSuccess": "成功",
    "rowCount": "行数",
    "columns": "列名"
  }
}
```

### 添加一行

```json
{
  "stepRunnerKey": "sys:tableoperation",
  "inputParams": {
    "type": "addRow",
    "table.var": "数据表",
    "rowData.var": "新行数据"
  },
  "outputParams": {
    "isSuccess": "成功",
    "affectedRowCount": "影响行数"
  }
}
```

### 按条件更新

```json
{
  "stepRunnerKey": "sys:tableoperation",
  "inputParams": {
    "type": "update",
    "table.var": "数据表",
    "filterExpression": "$={状态} == \"pending\"",
    "rowData.var": "更新数据"
  },
  "outputParams": {
    "affectedRowCount": "影响行数"
  }
}
```

### 交互式管理

```json
{
  "stepRunnerKey": "sys:tableoperation",
  "inputParams": {
    "type": "manage",
    "table.var": "数据表"
  },
  "outputParams": {
    "isConfirmed": "已确认",
    "selectedRows": "选中行"
  }
}
```
