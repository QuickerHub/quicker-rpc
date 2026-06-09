# sys:readFile

> **来源**：step JSON 示例 · **官方**：[readfile](https://getquicker.net/KC/Help/Doc/readfile)

**用途**：读取文本或图片文件到变量。

## 示例

### 读取文本文件

```json
{
  "stepRunnerKey": "sys:readFile",
  "inputParams": {
    "path.var": "文件路径",
    "type": "text",
    "encoding": "utf-8"
  },
  "outputParams": {
    "isSuccess": "成功",
    "txt": "内容"
  }
}
```

### 读取图片文件

```json
{
  "stepRunnerKey": "sys:readFile",
  "inputParams": {
    "path.var": "图片路径",
    "type": "image"
  },
  "outputParams": {
    "isSuccess": "成功",
    "image": "图片"
  }
}
```
