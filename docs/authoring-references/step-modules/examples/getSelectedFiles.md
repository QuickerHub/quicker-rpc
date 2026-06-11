# sys:getSelectedFiles

> **来源**：step JSON 示例 · **官方**：[getselectedfiles](https://getquicker.net/KC/Help/Doc/getselectedfiles)

**用途**：获取或设置资源管理器/桌面当前选中的文件路径。

## 示例

### 获取选中文件

```json
{
  "stepRunnerKey": "sys:getSelectedFiles",
  "inputParams": {
    "operation": "getSelection"
  },
  "outputParams": {
    "isSuccess": "成功",
    "files": "路径列表",
    "firstFile": "首个路径",
    "fileCount": "数量"
  }
}
```

### 设置资源管理器选中项

```json
{
  "stepRunnerKey": "sys:getSelectedFiles",
  "inputParams": {
    "operation": "setSelection",
    "pathList.var": "待选文件"
  },
  "outputParams": {
    "isSuccess": "成功"
  }
}
```
