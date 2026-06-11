# sys:textSelectTools

> **来源**：step JSON 示例 · **官方**：[textselecttools](https://getquicker.net/KC/Help/Doc/textselecttools)

**用途**：在文本编辑器中弹出文件/路径选择辅助工具。

## 示例

### 选择单个文件

```json
{
  "stepRunnerKey": "sys:textSelectTools",
  "inputParams": {
    "operation": "SelectSingleFile",
    "currValue.var": "当前文本"
  },
  "outputParams": {
    "isSuccess": "成功",
    "output": "结果"
  }
}
```

### 选择保存路径

```json
{
  "stepRunnerKey": "sys:textSelectTools",
  "inputParams": {
    "operation": "SelectSavePath",
    "currValue.var": "当前文本"
  },
  "outputParams": {
    "output": "路径"
  }
}
```

### 选择文件夹

```json
{
  "stepRunnerKey": "sys:textSelectTools",
  "inputParams": {
    "operation": "SelectSingleFolder",
    "currValue.var": "当前文本"
  },
  "outputParams": {
    "isSuccess": "成功",
    "output": "文件夹路径"
  }
}
```
