# sys:readFile

> **分类**：文件与目录 · **来源**：仓库手写 · **官方**：[readfile](https://getquicker.net/KC/Help/Doc/readfile)

**用途**：读取本地文本或图片文件到变量。

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

## 陷阱

- `type: text` 输出 `txt` + 可选 `encoding`（`auto` 自动检测）；`type: image` 输出 `image` 变量，无 encoding。
- 大文件/流式处理考虑 `fileOperation` 或脚本；写入用 `WriteTextFile`/`WriteImageFile`。

## 相关

WriteTextFile · checkPathExists · readQrCode · basic-ocr · step-runner-get
