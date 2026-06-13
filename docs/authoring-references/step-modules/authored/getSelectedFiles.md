# sys:getSelectedFiles

> **分类**：系统与窗口 · **来源**：仓库手写 · **官方**：[getselectedfiles](https://getquicker.net/KC/Help/Doc/getselectedfiles)

**用途**：获取或设置资源管理器/桌面当前选中的文件/文件夹路径。

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

## 陷阱

- `getSelection` 失败时会模拟 Ctrl+C 读剪贴板，`waitMs` 控制等待超时；`sortType` 仅对多文件列表生效。
- `setSelection` 的 `pathList` 每行一条规则：完整路径、文件名、`regex:…`、`pinyin:…`；可选 `winHandle` 指定资源管理器窗口。
- 打开文件夹并高亮单个文件用 `SelectFileInExplorer`；本模块 `setSelection` 仅选中当前窗口内已有项。

## 相关

SelectFileInExplorer · getExplorerPath · fileToClipboard · getClipboardFiles · step-runner-get
