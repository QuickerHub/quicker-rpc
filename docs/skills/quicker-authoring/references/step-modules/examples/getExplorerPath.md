# sys:getExplorerPath

> **来源**：step JSON 示例 · **官方**：[getexplorerpath](https://getquicker.net/KC/Help/Doc/getexplorerpath)

**用途**：获取或设置资源管理器当前路径。

## 示例

### 获取当前路径

```json
{
  "stepRunnerKey": "sys:getExplorerPath",
  "inputParams": {
    "operation": "getPath"
  },
  "outputParams": {
    "isSuccess": "成功",
    "output": "当前路径",
    "allPathList": "全部窗口路径"
  }
}
```

### 设置资源管理器路径

```json
{
  "stepRunnerKey": "sys:getExplorerPath",
  "inputParams": {
    "operation": "setPath",
    "path.var": "目标目录"
  },
  "outputParams": {
    "isSuccess": "成功"
  }
}
```
