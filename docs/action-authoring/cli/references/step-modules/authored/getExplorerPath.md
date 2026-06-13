# sys:getExplorerPath

> **分类**：文件与目录 · **来源**：仓库手写 · **官方**：[getexplorerpath](https://getquicker.net/KC/Help/Doc/getexplorerpath)

**用途**：读取或设置 Windows 资源管理器当前文件夹路径。

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

## 陷阱

- `getPath` 无 `path` 输入；多窗口时 `allPathList` 为全部打开路径，`lastPath` 为最近访问窗口路径。
- `setPath` 需前台有资源管理器窗口；选中文件用 `SelectFileInExplorer`，选中项列表用 `getSelectedFiles`。

## 相关

getSelectedFiles · SelectFileInExplorer · getFolderPath · fileOperation · step-runner-get
