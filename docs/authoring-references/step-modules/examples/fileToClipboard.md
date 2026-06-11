# sys:fileToClipboard

> **来源**：step JSON 示例 · **官方**：[filetoclipboard](https://getquicker.net/KC/Help/Doc/filetoclipboard)

**用途**：将文件路径放入剪贴板，便于在其他软件中粘贴。

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
    "useCut": "1"
  },
  "outputParams": {
    "isSuccess": "成功"
  }
}
```
