# sys:selectFile

> **来源**：step JSON 示例 · **官方**：[selectfile](https://getquicker.net/KC/Help/Doc/selectfile)

**用途**：通过对话框选择要打开或保存的文件路径。

## 示例

### 打开单个文件

```json
{
  "stepRunnerKey": "sys:selectFile",
  "inputParams": {
    "type": "openFile",
    "filter": "文本文件(*.txt)|*.txt|所有文件|*.*",
    "initDir.var": "初始目录",
    "title": "请选择文件"
  },
  "outputParams": {
    "isSuccess": "成功",
    "path": "路径"
  }
}
```

### 打开多个文件

```json
{
  "stepRunnerKey": "sys:selectFile",
  "inputParams": {
    "type": "openMultiFile",
    "filter": "图片文件|*.jpg;*.png;*.bmp|所有文件|*.*",
    "topMost": "1"
  },
  "outputParams": {
    "isSuccess": "成功",
    "pathList": "路径列表"
  }
}
```

### 保存文件

```json
{
  "stepRunnerKey": "sys:selectFile",
  "inputParams": {
    "type": "saveFile",
    "filter": "JSON 文件|*.json|所有文件|*.*",
    "defaultExt": ".json",
    "initFileName.var": "默认文件名",
    "title": "另存为"
  },
  "outputParams": {
    "isSuccess": "成功",
    "path": "路径"
  }
}
```
