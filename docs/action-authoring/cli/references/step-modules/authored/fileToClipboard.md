# sys:fileToClipboard

> **分类**：剪贴板 · **来源**：仓库手写 · **官方**：[filetoclipboard](https://getquicker.net/KC/Help/Doc/filetoclipboard)

**用途**：将单个或多个文件路径放入剪贴板，供资源管理器等粘贴。

## 示例

### 复制单个文件到剪贴板

```json
{
  "stepRunnerKey": "sys:fileToClipboard",
  "inputParams": {
    "file.var": "文件路径"
  },
  "outputParams": {
    "isSuccess": "成功"
  }
}
```

### 复制多个文件

```json
{
  "stepRunnerKey": "sys:fileToClipboard",
  "inputParams": {
    "list.var": "文件列表"
  },
  "outputParams": {
    "isSuccess": "成功"
  }
}
```

### 剪切文件

```json
{
  "stepRunnerKey": "sys:fileToClipboard",
  "inputParams": {
    "file.var": "源文件",
    "useCut": true
  },
  "outputParams": {
    "isSuccess": "成功"
  }
}
```

## 陷阱

- `file` 与 `list` **二选一**；多文件用 `list.var` 绑定路径列表变量。
- `useCut: true` 为剪切模式（粘贴时移动）；路径须为本机存在的文件/文件夹。

## 相关

getClipboardFiles · writeClipboard · fileOperation · SelectFileInExplorer · step-runner-get
