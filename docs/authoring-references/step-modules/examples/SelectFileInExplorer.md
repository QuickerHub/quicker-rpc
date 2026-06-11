# sys:SelectFileInExplorer

> **来源**：step JSON 示例 · **官方**：[selectfileinexplorer](https://getquicker.net/KC/Help/Doc/selectfileinexplorer)

**用途**：在资源管理器中打开目录并选中指定文件或文件夹。

## 示例

### 选中文件

```json
{
  "stepRunnerKey": "sys:SelectFileInExplorer",
  "inputParams": {
    "path.var": "文件路径"
  },
  "outputParams": {
    "isSuccess": "成功"
  }
}
```

### 选中固定路径

```json
{
  "stepRunnerKey": "sys:SelectFileInExplorer",
  "inputParams": {
    "path": "C:\\Users\\Public\\Documents\\readme.txt"
  },
  "outputParams": {
    "isSuccess": "成功"
  }
}
```
